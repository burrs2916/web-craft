//! Directory-listing and date parsing for the SFTP service.
//!
//! Pure functions: they turn raw `ls -lan` / `pwd` output and progress lines
//! into typed values. Kept free of IO so they stay unit-testable.

use std::collections::HashSet;

use super::SftpEntry;

/// 把 ls 权限串（10 位，可带 ACL `+` / SELinux `.` 后缀）转八进制 mode。
pub(crate) fn perm_str_to_octal(perms: &str) -> Option<u32> {
    let chars: Vec<char> = perms.chars().collect();
    if chars.len() < 10 {
        return None;
    }
    let mut mode = 0u32;
    let groups: [(char, char, char, u32); 3] = [
        (chars[1], chars[2], chars[3], 0o400), // owner
        (chars[4], chars[5], chars[6], 0o040), // group
        (chars[7], chars[8], chars[9], 0o004), // other
    ];
    for (r, w, x, base) in groups {
        if r == 'r' {
            mode |= base;
        }
        if w == 'w' {
            mode |= base >> 1;
        }
        if matches!(x, 'x' | 's' | 'S' | 't' | 'T') {
            mode |= base >> 2;
        }
    }
    if matches!(chars[3], 's' | 'S') {
        mode |= 0o4000; // setuid
    }
    if matches!(chars[6], 's' | 'S') {
        mode |= 0o2000; // setgid
    }
    if matches!(chars[9], 't' | 'T') {
        mode |= 0o1000; // sticky
    }
    Some(mode)
}

/// 从 `ls -lan <dir>` 输出里找 `.`（当前目录）行并返回其八进制 mode。
/// sftp 的 `ls -la` 会列出 `.`/`..`，`.` 的权限就是目录自身的权限。
pub(crate) fn parse_dir_mode_from_ls(output: &str) -> Option<u32> {
    for raw in output.lines() {
        let line = raw.trim();
        let mut toks = line.split_whitespace();
        let first = match toks.next() {
            Some(f) => f,
            None => continue,
        };
        if !is_perm_token(first) {
            continue;
        }
        let name = match toks.last() {
            Some(n) => n,
            None => continue,
        };
        if name == "." {
            return perm_str_to_octal(first);
        }
    }
    None
}

pub(crate) fn mentions_bad_ls_flag(msg: &str) -> bool {
    let low = msg.to_lowercase();
    low.contains("invalid flag") || low.contains("usage: ls")
}

// ---- listing parser ----

pub(crate) fn parse_pwd(output: &str) -> Option<String> {
    for line in output.lines() {
        let l = line.trim();
        if let Some(rest) = l.strip_prefix("Remote working directory:") {
            let p = rest.trim();
            if !p.is_empty() {
                return Some(p.to_string());
            }
        }
    }
    None
}

pub(crate) fn is_perm_token(tok: &str) -> bool {
    let bytes: Vec<char> = tok.chars().collect();
    if bytes.len() < 10 {
        return false;
    }
    if !matches!(bytes[0], 'd' | 'l' | '-' | 'b' | 'c' | 'p' | 's' | 'D') {
        return false;
    }
    for c in bytes.iter().take(10).skip(1) {
        if !matches!(
            c,
            'r' | 'w' | 'x' | 's' | 'S' | 't' | 'T' | 'l' | 'L' | '-'
        ) {
            return false;
        }
    }
    // ACL / SELinux markers are allowed as an 11th character.
    if bytes.len() > 11 {
        return false;
    }
    if bytes.len() == 11 && !matches!(bytes[10], '+' | '.' | '@' | '*') {
        return false;
    }
    true
}

pub(crate) fn month_num(tok: &str) -> Option<u32> {
    let t = tok.trim_matches(|c: char| c == '.' || c == ',');
    let lower = t.to_lowercase();
    const NAMES: [&str; 12] = [
        "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
    ];
    if lower.len() >= 3 {
        let head: String = lower.chars().take(3).collect();
        if let Some(i) = NAMES.iter().position(|m| *m == head) {
            return Some(i as u32 + 1);
        }
    }
    // CJK locales render "%b" as e.g. "1月" / "12月".
    if let Some(num) = t.strip_suffix('月') {
        if let Ok(n) = num.trim().parse::<u32>() {
            if (1..=12).contains(&n) {
                return Some(n);
            }
        }
    }
    None
}

pub(crate) fn is_day_token(tok: &str) -> bool {
    tok.parse::<u32>().map(|d| d >= 1 && d <= 31).unwrap_or(false)
}

pub(crate) fn is_time_token(tok: &str) -> bool {
    let parts: Vec<&str> = tok.split(':').collect();
    if parts.len() < 2 || parts.len() > 3 {
        return false;
    }
    parts
        .iter()
        .all(|p| !p.is_empty() && p.len() <= 2 && p.chars().all(|c| c.is_ascii_digit()))
}

pub(crate) fn is_year_token(tok: &str) -> bool {
    tok.len() == 4 && tok.chars().all(|c| c.is_ascii_digit())
}

pub(crate) fn is_iso_date_token(tok: &str) -> bool {
    let parts: Vec<&str> = tok.split('-').collect();
    parts.len() == 3
        && parts[0].len() == 4
        && parts.iter().all(|p| p.chars().all(|c| c.is_ascii_digit()))
}

/// Tokenize while remembering byte offsets, so a file name containing runs of
/// spaces can be recovered verbatim from the original line.
pub(crate) fn tokenize(line: &str) -> Vec<(usize, &str)> {
    let mut out = Vec::new();
    let mut start: Option<usize> = None;
    for (i, c) in line.char_indices() {
        if c.is_whitespace() {
            if let Some(s) = start.take() {
                out.push((s, &line[s..i]));
            }
        } else if start.is_none() {
            start = Some(i);
        }
    }
    if let Some(s) = start {
        out.push((s, &line[s..]));
    }
    out
}

/// Parse `ls -l` style output produced by the sftp client (or, on very old
/// clients, by the server). Handles GNU/BSD/Solaris/Windows layouts, ISO
/// timestamps, missing group columns, ACL markers and names with spaces.
pub(crate) fn parse_ls(output: &str) -> Vec<SftpEntry> {
    let mut entries = Vec::new();
    for raw in output.lines() {
        let line = raw.trim_end_matches(['\r', '\n']);
        let trimmed = line.trim_start();
        if trimmed.is_empty()
            || trimmed.starts_with("sftp>")
            || trimmed.starts_with("Remote working directory:")
            || trimmed.starts_with("Connected to")
            || trimmed.starts_with("Changing")
            || trimmed.starts_with("Fetching")
            || trimmed.starts_with("Uploading")
            || trimmed.starts_with("total ")
        {
            continue;
        }
        if let Some(entry) = parse_ls_line(line) {
            entries.push(entry);
        }
    }
    // 去重收口在唯一的数据入口，而不是散在各个调用点：新增列表路径
    // 不会因为忘了调用而复发重复。
    dedup_entries(entries)
}

/// 同一个远程目录下不可能存在同名条目（POSIX 文件系统根本不允许）。
///
/// 但部分 sftp-server 实现（Dropbear 及其 busybox 变体尤为典型）在
/// READDIR 时会把同一批目录项**原样重复吐一次**，或者把 symlink 探测
/// 命令（`-ls -1 {,.}*/`）的 brace 回显也当成文件行解析出来，导致前端
/// 每个文件出现两份。按 name 去重即可消除这种重复，且不会误删任何真实
/// 文件——同名冲突在文件系统层面本就不成立。
pub(crate) fn dedup_entries(entries: Vec<SftpEntry>) -> Vec<SftpEntry> {
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::with_capacity(entries.len());
    for e in entries {
        if seen.insert(e.name.clone()) {
            out.push(e);
        }
    }
    out
}

/// Pull the `name/` rows out of an `ls -1 {,.}*/` probe.
///
/// Only "one bare name per line, trailing slash" rows are accepted. That is
/// what the short view emits, and the strictness is what makes the probe safe:
/// if a client ever answers with something else (a contents listing, a usage
/// banner, the unmatched pattern echoed back by `GLOB_NOCHECK`) none of it
/// looks like a marker, so the result degrades to "no symlinks resolved"
/// instead of inventing directories that are not there.
pub(crate) fn parse_dir_markers(output: &str) -> HashSet<String> {
    let mut out = HashSet::new();
    for raw in output.lines() {
        // Only the line ending is stripped: a directory named "data " keeps
        // its trailing space, and the slash still terminates the row.
        let line = raw.trim_end_matches(['\r', '\n']);
        if !line.ends_with('/') || line.trim_start().starts_with("sftp>") {
            continue;
        }
        // `ls -lan` rows never end in a slash, but stay explicit about it.
        if line
            .split_whitespace()
            .next()
            .map(is_perm_token)
            .unwrap_or(false)
        {
            continue;
        }
        let name = line.trim_end_matches('/');
        // `.`/`..` are always matched by the `.` half of the brace, and a name
        // can never contain a slash — anything that does is a path echoed back
        // by a client that did not honour the short view.
        if name.is_empty() || name == "." || name == ".." || name.contains('/') {
            continue;
        }
        // `GLOB_NOCHECK` hands the pattern itself back when nothing matched.
        if name.contains('*') || name.contains('{') {
            continue;
        }
        out.insert(name.to_string());
    }
    out
}

/**
 * Mark symlinked entries whose target is a directory so they navigate like
 * folders. `dir_targets` is the set produced by [`parse_dir_markers`] for the
 * same listing. Called from both the single and batched listers so the two
 * code paths stay behaviour-identical.
 */
pub(crate) fn apply_dir_markers(entries: &mut [SftpEntry], dir_targets: &HashSet<String>) {
    if dir_targets.is_empty() {
        return;
    }
    for e in entries.iter_mut() {
        if e.is_symlink && !e.target_is_dir && dir_targets.contains(&e.name) {
            e.target_is_dir = true;
        }
    }
}

/**
 * Split a multi-directory `sftp -b` transcript into one string per requested
 * directory. The sftp client prints `Remote working directory: <path>` before
 * each `ls`, which is the only reliable per-section boundary — `ls` output has
 * no such marker and file names can contain almost anything except a leading
 * perm token.
 */
pub(crate) fn split_listing_sections(output: &str) -> Vec<String> {
    let mut sections: Vec<String> = vec![String::new()];
    for line in output.lines() {
        if line.trim().starts_with("Remote working directory:") {
            sections.push(String::new());
        } else {
            let s = sections.last_mut().unwrap();
            s.push_str(line);
            s.push('\n');
        }
    }
    sections
}

pub(crate) fn parse_ls_line(line: &str) -> Option<SftpEntry> {
    let toks = tokenize(line);
    if toks.len() < 4 {
        return None;
    }
    let perms = toks[0].1.to_string();
    if !is_perm_token(&perms) {
        return None;
    }

    // Locate the timestamp block; everything right of it is the name and the
    // token just left of it is the size.
    let mut date_at: Option<(usize, usize)> = None; // (index, token count)
    for j in 1..toks.len() {
        let t = toks[j].1;
        if month_num(t).is_some()
            && j + 2 < toks.len()
            && is_day_token(toks[j + 1].1)
            && (is_time_token(toks[j + 2].1) || is_year_token(toks[j + 2].1))
        {
            date_at = Some((j, 3));
            break;
        }
        if is_iso_date_token(t) {
            let count = if j + 1 < toks.len() && is_time_token(toks[j + 1].1) {
                2
            } else {
                1
            };
            date_at = Some((j, count));
            break;
        }
    }

    let (size, owner, group, name_start_idx, mtime_raw, mtime_ts) = match date_at {
        Some((d, count)) => {
            if d == 0 || d + count >= toks.len() {
                return None;
            }
            let size = toks[d - 1].1.parse::<u64>().unwrap_or(0);
            let owner = if d >= 3 { toks[d - 3].1.to_string() } else { String::new() };
            let group = if d >= 2 { toks[d - 2].1.to_string() } else { String::new() };
            let date_tokens: Vec<&str> = (d..d + count).map(|i| toks[i].1).collect();
            let raw = date_tokens.join(" ");
            let ts = date_tokens_to_epoch(&date_tokens);
            (size, owner, group, d + count, raw, ts)
        }
        None => {
            // Classic fixed layout fallback: perms links owner group size d m y name
            if toks.len() < 9 {
                return None;
            }
            let size = toks[4].1.parse::<u64>().unwrap_or(0);
            let date_tokens: Vec<&str> = (5..8).map(|i| toks[i].1).collect();
            let raw = date_tokens.join(" ");
            let ts = date_tokens_to_epoch(&date_tokens);
            (size, toks[2].1.to_string(), toks[3].1.to_string(), 8, raw, ts)
        }
    };

    let mut name = line[toks[name_start_idx].0..].trim_end().to_string();
    if name.is_empty() || name == "." || name == ".." {
        return None;
    }

    let is_symlink = perms.starts_with('l');
    let mut link_target = None;
    if let Some(idx) = name.find(" -> ") {
        if is_symlink {
            link_target = Some(name[idx + 4..].to_string());
            name = name[..idx].to_string();
        }
    }
    if name == "." || name == ".." || name.is_empty() {
        return None;
    }

    let is_dir = perms.starts_with('d')
        || (is_symlink
            && link_target
                .as_deref()
                .map(|t| t.ends_with('/'))
                .unwrap_or(false));

    Some(SftpEntry {
        name,
        is_dir,
        is_symlink,
        // A real directory is always enterable. Symlinks start out `false` and
        // are upgraded by `probe_dir_targets` once their target is known, so an
        // unavailable probe degrades to "treat it as a file" rather than to a
        // wrong guess.
        target_is_dir: is_dir,
        size,
        mtime: if mtime_ts > 0 {
            format_epoch(mtime_ts)
        } else {
            mtime_raw
        },
        mtime_ts,
        perms,
        owner,
        group,
        link_target,
    })
}

pub(crate) fn date_tokens_to_epoch(tokens: &[&str]) -> i64 {
    use chrono::{Datelike, Local, NaiveDate, TimeZone};

    let build = |y: i32, m: u32, d: u32, hh: u32, mm: u32| -> i64 {
        NaiveDate::from_ymd_opt(y, m, d)
            .and_then(|dt| dt.and_hms_opt(hh, mm, 0))
            .map(|dt| {
                Local
                    .from_local_datetime(&dt)
                    .single()
                    .map(|x| x.timestamp())
                    .unwrap_or(0)
            })
            .unwrap_or(0)
    };

    // "Mon DD HH:MM" / "Mon DD YYYY"
    if tokens.len() == 3 {
        if let (Some(m), Ok(d)) = (month_num(tokens[0]), tokens[1].parse::<u32>()) {
            if is_year_token(tokens[2]) {
                let y: i32 = tokens[2].parse().unwrap_or(0);
                return build(y, m, d, 0, 0);
            }
            if is_time_token(tokens[2]) {
                let hm: Vec<&str> = tokens[2].split(':').collect();
                let hh: u32 = hm[0].parse().unwrap_or(0);
                let mm: u32 = hm.get(1).and_then(|x| x.parse().ok()).unwrap_or(0);
                let now = Local::now();
                let mut ts = build(now.year(), m, d, hh, mm);
                // `ls` omits the year for recent files; a date in the future
                // therefore belongs to the previous year.
                if ts > now.timestamp() + 86_400 {
                    ts = build(now.year() - 1, m, d, hh, mm);
                }
                return ts;
            }
        }
        return 0;
    }

    // "YYYY-MM-DD [HH:MM[:SS]]"
    if !tokens.is_empty() && is_iso_date_token(tokens[0]) {
        let parts: Vec<&str> = tokens[0].split('-').collect();
        let y: i32 = parts[0].parse().unwrap_or(0);
        let m: u32 = parts[1].parse().unwrap_or(1);
        let d: u32 = parts[2].parse().unwrap_or(1);
        let (hh, mm) = if tokens.len() > 1 && is_time_token(tokens[1]) {
            let hm: Vec<&str> = tokens[1].split(':').collect();
            (
                hm[0].parse().unwrap_or(0),
                hm.get(1).and_then(|x| x.parse().ok()).unwrap_or(0),
            )
        } else {
            (0, 0)
        };
        return build(y, m, d, hh, mm);
    }
    0
}

pub(crate) fn format_epoch(ts: i64) -> String {
    use chrono::{Local, TimeZone};
    match Local.timestamp_opt(ts, 0).single() {
        Some(dt) => dt.format("%Y-%m-%d %H:%M").to_string(),
        None => String::new(),
    }
}
