use super::*;

#[test]
fn parses_gnu_style_listing() {
    let out = "sftp> ls -lan\n\
drwxr-xr-x    5 1000     1000         4096 Jan 15 10:30 documents\n\
-rw-r--r--    1 1000     1000      1048576 Feb  2 09:05 backup.tar.gz\n\
lrwxrwxrwx    1 0        0              11 Mar  3 08:00 link -> /etc/hosts\n";
    let e = parse_ls(out);
    assert_eq!(e.len(), 3);
    assert!(e[0].is_dir);
    assert_eq!(e[0].name, "documents");
    assert_eq!(e[1].size, 1_048_576);
    assert!(e[2].is_symlink);
    assert_eq!(e[2].link_target.as_deref(), Some("/etc/hosts"));
    assert_eq!(e[2].name, "link");
}

#[test]
fn parses_names_with_spaces_and_dots() {
    let out = "-rw-r--r--    1 0        0          120 Apr 10  2023 my   report v2.txt\n\
drwx------    2 0        0         4096 Apr 10 12:00 .ssh\n";
    let e = parse_ls(out);
    assert_eq!(e.len(), 2);
    assert_eq!(e[0].name, "my   report v2.txt");
    assert_eq!(e[1].name, ".ssh");
    assert!(e[1].is_dir);
}

/// Dropbear 系 sftp-server 的 longname 里 nlink 用 `?` 占位，必须正常解析。
#[test]
fn parses_dropbear_question_mark_nlink_listing() {
    let out = "sftp> ls -la\n\
drwx------ ? ubuntu ubuntu 4096 Aug  5 10:35 .ssh\n\
drwxr-xr-x ? ubuntu ubuntu 4096 Aug  5 09:00 .config\n\
-rw-r--r-- ? ubuntu ubuntu   120 Aug  5 10:00 notes.txt\n";
    let e = parse_ls(out);
    assert_eq!(e.len(), 3);
    assert_eq!(e[0].name, ".ssh");
    assert!(e[0].is_dir);
    assert_eq!(e[0].size, 4096);
    assert_eq!(e[0].owner, "ubuntu");
    assert_eq!(e[1].name, ".config");
    assert_eq!(e[2].name, "notes.txt");
    assert!(!e[2].is_dir);
}

#[test]
fn parses_iso_and_acl_marked_rows() {
    let out = "-rw-r--r--+   1 root root      2048 2024-05-06 07:08 acl-file.log\n\
drwxr-xr-x.   2 root root      4096 2024-05-06 report\n";
    let e = parse_ls(out);
    assert_eq!(e.len(), 2);
    assert_eq!(e[0].name, "acl-file.log");
    assert_eq!(e[0].size, 2048);
    assert!(e[0].mtime.starts_with("2024-05-06"));
    assert_eq!(e[1].name, "report");
    assert!(e[1].is_dir);
}

#[test]
fn skips_noise_lines() {
    let out = "sftp> cd /var/log\nsftp> pwd\nRemote working directory: /var/log\ntotal 48\n\
-rw-r--r--    1 0 0    10 Jun  1 00:00 syslog\n";
    let e = parse_ls(out);
    assert_eq!(e.len(), 1);
    assert_eq!(e[0].name, "syslog");
    assert_eq!(parse_pwd(out).as_deref(), Some("/var/log"));
}

/// 模拟 Dropbear 系 sftp-server 在 READDIR 时把同一批目录项原样重复吐一次：
/// `ls -lan` 的输出整段出现两次。按 name 去重后每个文件只应保留一份。
#[test]
fn deduplicates_readdir_duplicates_from_server() {
    let one = "\
drwxr-xr-x ? ubuntu ubuntu 4096 Aug  5 09:00 .config\n\
drwx------ ? ubuntu ubuntu 4096 Aug  5 10:35 .ssh\n\
-rw-r--r-- ? ubuntu ubuntu  120 Aug  5 10:00 notes.txt\n";
    let doubled = format!("{}\n{}\n", one, one);
    let e = parse_ls(&doubled);
    // 服务器吐了两遍，去重必须压回一份。
    assert_eq!(e.len(), 3, "server double-emitted the listing; must dedupe by name");
    let names: Vec<&str> = e.iter().map(|x| x.name.as_str()).collect();
    assert!(names.contains(&".config"));
    assert!(names.contains(&".ssh"));
    assert!(names.contains(&"notes.txt"));
}

/// 「每个文件显示两份」的结构性根因回归测试。
///
/// 列表 batch 末尾的 symlink 探测 `-ls -1 {,.}*/` 里，`.*/` 会展开出
/// `./` —— 等于让服务器把当前目录**再列一遍**。OpenSSH 用短格式（裸名）
/// 所以无害，但非标准实现可能回长格式，那段就会被 `parse_ls` 解析成第二
/// 份完整列表。修复是用第二个 `pwd` 把两段输出物理隔开：列表只解析
/// sections[1]，探测只喂给 sections[2]。
#[test]
fn probe_section_never_leaks_into_listing() {
    let transcript = "\
Connected to example.com.\n\
Remote working directory: /home/ubuntu\n\
drwxr-xr-x ? ubuntu ubuntu 4096 Aug  5 09:00 .\n\
drwxr-xr-x ? root   root   4096 Aug  5 08:00 ..\n\
-rw-r--r-- ? ubuntu ubuntu  120 Aug  5 10:00 notes.txt\n\
drwx------ ? ubuntu ubuntu 4096 Aug  5 10:35 .ssh\n\
Remote working directory: /home/ubuntu\n\
.ssh/\n\
-rw-r--r-- ? ubuntu ubuntu  120 Aug  5 10:00 notes.txt\n\
drwx------ ? ubuntu ubuntu 4096 Aug  5 10:35 .ssh\n";

    let sections = split_listing_sections(transcript);
    assert_eq!(sections.len(), 3, "listing and probe must land in separate sections");

    let mut entries = parse_ls(&sections[1]);
    assert_eq!(
        entries.len(),
        2,
        "probe echo leaked into the listing: {:?}",
        entries.iter().map(|e| &e.name).collect::<Vec<_>>()
    );

    // 探测段只用来标记「可进入」，不产生条目。
    let markers = parse_dir_markers(&sections[2]);
    apply_dir_markers(&mut entries, &markers);
    assert_eq!(entries.len(), 2, "markers must never add entries");
    let ssh_entry = entries.iter().find(|e| e.name == ".ssh").expect(".ssh missing");
    assert!(ssh_entry.is_dir);
}

#[test]
fn parses_windows_openssh_rows() {
    // Windows OpenSSH server reports the same numeric layout via the client.
    let out = "drwxrwxrwx    1 0        0                0 Jul 21 14:02 Program Files\n\
-rw-rw-rw-    1 0        0             4096 Jul 21 14:02 pagefile.sys\n";
    let e = parse_ls(out);
    assert_eq!(e.len(), 2);
    assert_eq!(e[0].name, "Program Files");
    assert!(e[0].is_dir);
    assert_eq!(e[1].name, "pagefile.sys");
}

#[test]
fn parses_progress_meter() {
    let p = parse_progress_line("archive.tar.gz            43%   12MB   1.2MB/s   00:20 ETA")
        .expect("should parse");
    assert_eq!(p.0, "archive.tar.gz");
    assert_eq!(p.1, 43);
    assert_eq!(p.3, "1.2MB/s");
    assert!(parse_ls("archive.tar.gz  43% 12MB 1.2MB/s 00:20 ETA").is_empty());
}

#[test]
fn quotes_paths_safely() {
    assert_eq!(sftp_quote("/tmp/a b"), "\"/tmp/a b\"");
    assert_eq!(sftp_quote("/tmp/say\"hi\""), "\"/tmp/say\\\"hi\\\"\"");
    assert_eq!(sftp_quote("/tmp/back\\slash"), "\"/tmp/back\\\\slash\"");
}

#[test]
fn strips_ansi_across_chunk_boundaries() {
    let mut f = AnsiFilter::default();
    let mut out = String::new();
    // A CSI sequence split over two reads must not leak into the text.
    f.push("abc\u{1b}[1", &mut out);
    f.push("2;3mdef\u{1b}[0m", &mut out);
    assert_eq!(out, "abcdef");

    let mut f2 = AnsiFilter::default();
    let mut out2 = String::new();
    f2.push("\u{1b}]0;title\u{7}sftp> ", &mut out2);
    assert_eq!(out2, "sftp> ");
    assert!(is_sftp_prompt(&out2));
}

#[test]
fn detects_interactive_prompts() {
    assert!(is_sftp_prompt("sftp> "));
    assert!(!is_sftp_prompt("sftp> ls -lan"));
    assert!(matches!(
        classify_pending_prompt("root@10.0.0.1's password: "),
        Some(PendingPrompt::Password)
    ));
    // 中文 locale 下 OpenSSH 的密码提示（全角冒号结尾）
    assert!(matches!(
        classify_pending_prompt("root@10.0.0.1 的密码："),
        Some(PendingPrompt::Password)
    ));
    // 普通输出不得误判为密码提示
    assert!(classify_pending_prompt("密码政策已更新，请定期更换").is_none());
    assert!(matches!(
        classify_pending_prompt("Enter passphrase for key '/home/u/.ssh/id_rsa': "),
        Some(PendingPrompt::Passphrase)
    ));
    assert!(matches!(
        classify_pending_prompt("Verification code: "),
        Some(PendingPrompt::Verification)
    ));
    assert!(matches!(
        classify_pending_prompt("Are you sure you want to continue connecting (yes/no/[fingerprint])?"),
        Some(PendingPrompt::HostKey)
    ));
    assert!(classify_pending_prompt("Connected to host.").is_none());
}

#[test]
fn interactive_errors_ignore_listing_rows() {
    let listing = "ls -lan\n\
-rw-r--r--    1 0 0    10 Jun  1 00:00 Permission denied\n\
drwxr-xr-x    2 0 0  4096 Jun  1 00:00 no such file or directory\n";
    assert!(interactive_error(listing, "ls -lan").is_none());

    let failed = "cd /root\nCouldn't canonicalize: Permission denied\n";
    let msg = interactive_error(failed, "cd /root").expect("should flag the failure");
    assert!(msg.contains("权限不足"));

    // The bad-flag path must stay recognisable so `ls -lan` can fall back.
    let bad_flag = "ls -lan\nInvalid flag -n\nusage: ls [-1Safhlnrt] [path]\n";
    let msg = interactive_error(bad_flag, "ls -lan").expect("should flag the failure");
    assert!(mentions_bad_ls_flag(&msg));
}

#[test]
fn relative_paths_get_a_cwd_reset() {
    assert!(reset_cwd_prefix(&["/srv/a", "/srv/b"]).is_empty());
    assert_eq!(reset_cwd_prefix(&["notes.txt"]), vec!["cd".to_string()]);
    // Windows OpenSSH servers report absolute paths as `/C:/...` and, on a
    // few builds, as a bare `C:/...` — neither may trigger a cwd reset.
    assert!(reset_cwd_prefix(&["/C:/Users/foo", "C:/Users/bar"]).is_empty());
    assert!(is_absolute_remote("D:\\data"));
    assert!(!is_absolute_remote("data"));
    assert!(!is_absolute_remote("c:file"));
}

#[test]
fn ipv6_targets_are_bracketed() {
    // `sftp user@2001:db8::1` would be parsed as host `2001` + remote path,
    // so bare IPv6 literals must be wrapped.
    assert_eq!(bracket_host("2001:db8::1"), "[2001:db8::1]");
    assert_eq!(bracket_host("[fe80::1]"), "[fe80::1]");
    assert_eq!(bracket_host("192.168.1.10"), "192.168.1.10");
    assert_eq!(bracket_host("example.com"), "example.com");
}

#[test]
fn transfer_args_carry_keepalive() {
    let mut args: Vec<String> = Vec::new();
    keepalive_args(&mut args);
    assert!(args.windows(2).any(|w| w[0] == "-o" && w[1] == "ServerAliveInterval=20"));
    assert!(args.windows(2).any(|w| w[0] == "-o" && w[1] == "ServerAliveCountMax=6"));
}

#[test]
fn friendly_errors_cover_transfer_failures() {
    assert!(friendly_sftp_error("Couldn't write: No space left on device", "")
        .contains("空间不足"));
    assert!(friendly_sftp_error("Connection closed", "").contains("连接已断开"));
    assert!(friendly_sftp_error("remote open: Read-only file system", "")
        .contains("只读"));
    // 上传到无写权限目录（如 `/` 根目录）时要明确指出目标路径
    let perm = friendly_sftp_error("dest open \"/README.md\": Permission denied", "");
    assert!(perm.contains("远端目录无写权限"), "{}", perm);
    assert!(perm.contains("/README.md"), "{}", perm);
}

/// stderr 为空、stdout 只有 `ls` 列表行（含 Dropbear 的 `?` nlink）时，
/// 绝不能把 listing 行当成错误文案返回。
#[test]
fn friendly_error_never_reports_listing_rows() {
    let listing = "Remote working directory: /home/ubuntu\n\
drwx------ ? ubuntu ubuntu 4096 Aug  5 10:35 .ssh\n\
drwxr-xr-x ? ubuntu ubuntu 4096 Aug  5 09:00 .config\n";
    let msg = friendly_sftp_error("", listing);
    assert!(!msg.contains("drwx"), "listing row leaked into error: {}", msg);
    assert!(!msg.contains(".ssh"), "listing row leaked into error: {}", msg);
    assert!(msg.contains("SFTP 操作失败"));
}

#[test]
fn perm_tokens_parse_to_octal() {
    assert_eq!(perm_str_to_octal("-rwxr-xr-x"), Some(0o755));
    assert_eq!(perm_str_to_octal("drwx------"), Some(0o700));
    assert_eq!(perm_str_to_octal("-rw-r--r--"), Some(0o644));
    // ACL / SELinux 后缀不影响前 10 位
    assert_eq!(perm_str_to_octal("-rwxr-xr-x+"), Some(0o755));
    assert_eq!(perm_str_to_octal("-rwxr-xr-x."), Some(0o755));
    // setuid / setgid / sticky
    assert_eq!(perm_str_to_octal("-rwsr-xr-x"), Some(0o4755));
    assert_eq!(perm_str_to_octal("-rwxr-sr-x"), Some(0o2755));
    assert_eq!(perm_str_to_octal("-rwxr-xr-t"), Some(0o1755));
    // 非权限串
    assert_eq!(perm_str_to_octal("README.md"), None);
}

#[test]
fn dir_mode_from_ls_uses_dot_row() {
    let out = "Remote working directory: /home/ubuntu\n\
drwxr-xr-x    3 1000 1000 4096 Aug  5 09:00 .\n\
drwxr-xr-x    4 1000 1000 4096 Aug  5 08:00 ..\n\
-rw-r--r--    1 1000 1000   10 Aug  5 09:01 file.txt\n";
    assert_eq!(parse_dir_mode_from_ls(out), Some(0o755));
    let readonly = "dr-x------    3 1000 1000 4096 Aug  5 09:00 .\n";
    assert_eq!(parse_dir_mode_from_ls(readonly), Some(0o500));
    assert_eq!(parse_dir_mode_from_ls("no perm rows here\n"), None);
}

#[test]
fn permission_errors_are_recognised() {
    assert!(is_permission_error("dest open \"/README.md\": Permission denied"));
    assert!(is_permission_error("远端目录无写权限：/README.md（请切换…）"));
    assert!(is_permission_error("权限不足：dest open …"));
    assert!(!is_permission_error("Couldn't write: No space left on device"));
    assert!(!is_permission_error("Connection closed"));
}

#[test]
fn remote_path_helpers() {
    assert_eq!(join_remote(".", "a"), "a");
    assert_eq!(join_remote("/srv", "a"), "/srv/a");
    assert_eq!(join_remote("/srv/", "a"), "/srv/a");
    assert_eq!(remote_basename("/srv/data/file.txt"), "file.txt");
    assert_eq!(normalize_remote_dir("/srv/data/"), "/srv/data");
    assert_eq!(normalize_remote_dir(""), ".");
    assert_eq!(normalize_remote_dir("/"), "/");
}

#[test]
fn windows_drive_roots_keep_their_slash() {
    // `cd "/C:"` means "current directory of drive C" on Win32-OpenSSH,
    // which is not the root — the trailing slash has to survive.
    assert!(is_drive_root("/C:/"));
    assert!(is_drive_root("d:/"));
    assert!(!is_drive_root("/C:/Users"));
    assert!(!is_drive_root("/srv/"));
    assert_eq!(normalize_remote_dir("/C:/"), "/C:/");
    assert_eq!(normalize_remote_dir("C:/"), "C:/");
    assert_eq!(normalize_remote_dir("/C:/Users/"), "/C:/Users");
}

#[test]
fn drive_letter_paths_are_absolute() {
    // A bare `C:/Users` must not trigger the `cd` reset that relative
    // paths need, otherwise the command would target the wrong place.
    assert!(is_absolute_remote("C:/Users"));
    assert!(is_absolute_remote("/C:/Users"));
    assert!(is_absolute_remote("/srv"));
    assert!(!is_absolute_remote("data/logs"));
    assert!(reset_cwd_prefix(&["C:/Users/a"]).is_empty());
    assert_eq!(reset_cwd_prefix(&["logs/a"]), vec!["cd".to_string()]);
}

#[test]
fn octal_modes_are_validated() {
    assert_eq!(normalize_octal_mode("755").unwrap(), "755");
    assert_eq!(normalize_octal_mode(" 644 ").unwrap(), "644");
    assert_eq!(normalize_octal_mode("0644").unwrap(), "0644");
    assert_eq!(normalize_octal_mode("7").unwrap(), "007");
    assert_eq!(normalize_octal_mode("0o750").unwrap(), "750");
    // Anything that is not octal would be pasted into a live shell-ish
    // command stream, so it must be rejected before it gets there.
    assert!(normalize_octal_mode("").is_err());
    assert!(normalize_octal_mode("799").is_err());
    assert!(normalize_octal_mode("75a").is_err());
    assert!(normalize_octal_mode("755; rm -rf /").is_err());
    assert!(normalize_octal_mode("07555").is_err());
}

#[test]
fn utf8_locales_are_recognised() {
    assert!(is_utf8_locale("en_US.UTF-8"));
    assert!(is_utf8_locale("C.utf8"));
    assert!(is_utf8_locale("zh_CN.UTF-8"));
    assert!(!is_utf8_locale("C"));
    assert!(!is_utf8_locale("POSIX"));
    assert!(!is_utf8_locale("en_US.ISO8859-1"));
    assert!(!is_utf8_locale(""));
}

#[cfg(not(target_os = "windows"))]
#[test]
fn children_always_get_a_utf8_ctype() {
    // Without this the sftp client escapes every non-ASCII byte into
    // `\NNN`, and the escaped name is then used to build the get/rm/rename
    // path — pointing the operation at a file that does not exist.
    let env = locale_env();
    let get = |k: &str| {
        env.iter()
            .find(|(name, _)| name == k)
            .map(|(_, v)| v.clone())
    };
    assert!(
        is_utf8_locale(&get("LC_CTYPE").expect("LC_CTYPE must be set")),
        "LC_CTYPE must resolve to a UTF-8 locale"
    );
    // Empty is POSIX for "ignore me": a parent that exported LC_ALL would
    // otherwise override both categories we just set.
    assert_eq!(get("LC_ALL").as_deref(), Some(""));
    assert_eq!(get("LC_TIME").as_deref(), Some("C"));
}

#[cfg(target_os = "windows")]
#[test]
fn windows_children_get_no_locale_overlay() {
    assert!(locale_env().is_empty());
}

#[test]
fn backslashes_in_names_are_left_alone() {
    // OpenSSH escapes undecodable bytes as `\NNN` but leaves a *literal*
    // backslash untouched, so the two are indistinguishable in the output.
    // Decoding here would silently rename this real file to "bäslash.txt";
    // the escaping is prevented by `locale_env` instead.
    let out = "-rw-r--r--    1 1000 1000  0 Aug  5 03:54 back\\344slash.txt\n";
    let e = parse_ls(out);
    assert_eq!(e.len(), 1);
    assert_eq!(e[0].name, "back\\344slash.txt");
}

#[test]
fn utf8_names_survive_the_parser() {
    let out = "\
-rw-r--r--    ? liwenchao wheel      0 Aug  5 03:53 中文文件名.txt\n\
-rw-r--r--    ? liwenchao wheel      0 Aug  5 03:53 café-résumé.log\n\
drwxr-xr-x    ? liwenchao wheel    160 Aug  5 03:53 日志 备份\n";
    let e = parse_ls(out);
    assert_eq!(e.len(), 3);
    assert_eq!(e[0].name, "中文文件名.txt");
    assert_eq!(e[1].name, "café-résumé.log");
    // A space inside a name must survive too, directory flag included.
    assert_eq!(e[2].name, "日志 备份");
    assert!(e[2].is_dir);
}

#[test]
fn symlinks_are_not_directories_until_probed() {
    // Neither view exposes the target, so the listing alone can only say
    // "this is a link". Guessing otherwise would make a recursive delete
    // walk through the link and wipe the target's contents.
    let out = "\
lrwxr-xr-x    ? liwenchao wheel      7 Aug  5 07:31 linkdir\n\
lrwxr-xr-x    ? liwenchao wheel      9 Aug  5 07:31 linkfile\n\
drwxr-xr-x    ? liwenchao wheel     64 Aug  5 07:31 realdir\n";
    let e = parse_ls(out);
    assert_eq!(e.len(), 3);
    assert!(e[0].is_symlink && !e[0].is_dir && !e[0].target_is_dir);
    assert!(e[1].is_symlink && !e[1].is_dir && !e[1].target_is_dir);
    // A plain directory is enterable without any probe.
    assert!(e[2].is_dir && e[2].target_is_dir && !e[2].is_symlink);
}

#[test]
fn dir_markers_name_every_enterable_child() {
    // Verbatim `ls -1 {,.}*/` output captured from a real sftp-server:
    // the symlinked folder is in, the symlinked *file* and the dangling
    // link are not.
    let out = "\
sftp> cd /tmp/sftptest\n\
sftp> -ls -1 {,.}*/\n\
../\n\
./\n\
.hiddendir/\n\
linkdir/\n\
realdir/\n";
    let m = parse_dir_markers(out);
    assert_eq!(m.len(), 3);
    assert!(m.contains(".hiddendir"));
    assert!(m.contains("linkdir"));
    assert!(m.contains("realdir"));
    // The echoed command also ends in a slash and must never be mistaken
    // for a directory called "sftp> -ls -1 {,.}*".
    assert!(!m.iter().any(|n| n.contains("sftp>")));
}

#[test]
fn dir_markers_reject_anything_that_is_not_a_marker() {
    // If a client ignores `-1` and lists a single match's *contents*, or
    // answers with a usage banner, none of it carries a trailing slash —
    // the probe has to come back empty rather than invent entries.
    let contents = "sftp> -ls -1 {,.}*/\ninside1  inside2\nnot-a-dir\n";
    assert!(parse_dir_markers(contents).is_empty());

    let banner = "ls: Invalid flag -1\nusage: ls [-1459afhlnrSt] [path]\n";
    assert!(parse_dir_markers(banner).is_empty());

    // `ls -lan` rows must not leak in even if a name ends with a slash-ish
    // shape, and unmatched globs echoed by GLOB_NOCHECK are dropped.
    let mixed = "drwxr-xr-x  ? u g 64 Aug  5 07:31 realdir\n{,.}*/\n";
    assert!(parse_dir_markers(mixed).is_empty());
}

#[test]
fn apply_dir_markers_resolves_symlink_folders_only() {
    let mut entries = vec![
        SftpEntry {
            name: "linkdir".into(),
            is_dir: false,
            is_symlink: true,
            target_is_dir: false,
            size: 7,
            mtime: String::new(),
            mtime_ts: 0,
            perms: "lrwxr-xr-x".into(),
            owner: String::new(),
            group: String::new(),
            link_target: Some("realdir".into()),
        },
        SftpEntry {
            name: "linkfile".into(),
            is_dir: false,
            is_symlink: true,
            target_is_dir: false,
            size: 9,
            mtime: String::new(),
            mtime_ts: 0,
            perms: "lrwxr-xr-x".into(),
            owner: String::new(),
            group: String::new(),
            link_target: Some("notes.txt".into()),
        },
    ];
    let markers: HashSet<String> = ["linkdir".to_string(), "realdir".to_string()].into_iter().collect();
    apply_dir_markers(&mut entries, &markers);
    // The folder symlink is resolvable; the file symlink is left alone.
    assert!(entries[0].target_is_dir);
    assert!(!entries[1].target_is_dir);
}

#[test]
fn split_listing_sections_carves_one_per_directory() {
    // Two `cd` sections, each preceded by the `pwd` echo. The leading junk
    // (before the first section) is discarded.
    let out = "\
some banner noise
Remote working directory: /a
drwxr-xr-x    ? u wheel   64 Aug  5 00:00 .
drwxr-xr-x    ? u wheel   64 Aug  5 00:00 ..
-rw-r--r--    ? u wheel  100 Aug  5 00:00 one.txt
Remote working directory: /a/b
drwxr-xr-x    ? u wheel   64 Aug  5 00:00 .
drwxr-xr-x    ? u wheel   64 Aug  5 00:00 ..
";
    let sections = split_listing_sections(out);
    // +1 because every directory is preceded by a `pwd` echo, and the
    // banner noise before the first one lands in sections[0].
    assert_eq!(sections.len(), 3);
    // The leading junk is parked in sections[0]; `list_dirs` only reads
    // sections[1..] (mapped to the requested paths), so it is harmless.
    assert!(sections[0].contains("some banner noise"));
    assert!(sections[1].contains("one.txt"));
    // Boundary lines are delimiters only — never stored in a section, so a
    // directory's own `Remote working directory:` cannot leak into its or a
    // sibling's content (which would poison parse_ls / parse_dir_markers).
    assert!(!sections[1].contains("Remote working directory: /a"));
    assert!(!sections[1].contains("Remote working directory: /a/b"));
    assert!(!sections[2].contains("one.txt"));
}

#[test]
fn dir_markers_keep_exotic_names_intact() {
    // Spaces (leading, inner and trailing), CRLF from a Windows pty and
    // non-ASCII all have to survive, because the name is matched against
    // the listing verbatim.
    let out = "my dir/\r\n中文目录/\na[1]b/\ndata /\n";
    let m = parse_dir_markers(out);
    assert_eq!(m.len(), 4);
    assert!(m.contains("my dir"));
    assert!(m.contains("中文目录"));
    assert!(m.contains("a[1]b"));
    assert!(m.contains("data "));
}

#[test]
fn merged_listing_output_splits_cleanly() {
    // The combined `ls -lan` + `-ls -1 {,.}*/` batch returns both in one
    // buffer. Each parser must ignore the other's lines so a single round
    // trip can replace the old two-trip listing without leaking data.
    let out = "\
sftp> cd /some/dir\n\
sftp> ls -lan\n\
total 12\n\
drwxr-xr-x  ? u g  160 Aug  5 07:31 .\n\
drwxr-xr-x  ? u g  160 Aug  5 07:31 ..\n\
lrwxr-xr-x  ? u g    7 Aug  5 07:31 linkdir -> realdir\n\
lrwxr-xr-x  ? u g    9 Aug  5 07:31 linkfile -> file\n\
-rw-r--r--  ? u g    0 Aug  5 07:31 notes.txt\n\
drwxr-xr-x  ? u g   64 Aug  5 07:31 realdir\n\
sftp> -ls -1 {,.}*/\n\
../\n\
./\n\
linkdir/\n\
realdir/\n";
    let entries = parse_ls(out);
    // No trailing-slash probe row may leak in as a file entry.
    assert!(entries.iter().all(|e| !e.name.ends_with('/')));
    assert!(entries.iter().any(|e| e.name == "notes.txt"));
    let real = entries.iter().find(|e| e.name == "realdir").unwrap();
    assert!(real.is_dir);
    let link = entries.iter().find(|e| e.name == "linkdir").unwrap();
    assert!(link.is_symlink && !link.is_dir);
    // The probe alone tells us the link resolves to a directory.
    let markers = parse_dir_markers(out);
    assert!(markers.contains("linkdir"));
    assert!(markers.contains("realdir"));
    assert!(!markers.contains("linkfile"));
    assert!(!markers.contains("notes.txt"));
}

#[test]
fn recursive_sources_address_the_dot_component() {
    // The regression this guards: `put -r /a/data data` nests into
    // `data/data` when the destination already exists. Naming `.` keeps
    // the transfer merging into the destination itself.
    assert_eq!(merge_source("/a/data"), "/a/data/.");
    // A trailing slash must not produce a doubled separator.
    assert_eq!(merge_source("/a/data/"), "/a/data/.");
    assert_eq!(merge_source("relative/dir"), "relative/dir/.");
}

#[test]
fn merge_source_keeps_roots_addressable() {
    // "/" must stay the root rather than collapse to a bare ".".
    assert_eq!(merge_source("/"), "/.");
    assert_eq!(merge_source("///"), "/.");
    // A Win32 drive root keeps its load-bearing slash: "/C:" alone means
    // "the working directory of drive C", which is a different place.
    assert_eq!(merge_source("/C:/"), "/C:/.");
    assert_eq!(merge_source("C:/"), "C:/.");
}

#[test]
fn merge_source_preserves_unicode_and_spaces() {
    // The result is quoted later, so the raw name must pass through
    // untouched — including the backslash case `parse_ls` refuses to decode.
    assert_eq!(merge_source("/srv/日志 备份"), "/srv/日志 备份/.");
    assert_eq!(merge_source("/srv/back\\344slash"), "/srv/back\\344slash/.");
}

/// A progress context whose sink throws the ticks away — enough to exercise
/// the cancellation bookkeeping without a remote host.
fn ctx(id: &str) -> ProgressCtx {
    ProgressCtx {
        transfer_id: id.to_string(),
        sink: Arc::new(|_| {}),
        state: Mutex::new(ProgressState::default()),
    }
}

#[test]
fn queued_transfers_are_cancellable_before_they_start() {
    let svc = SftpService::new();
    let c = ctx("t1");

    // Nothing claimed yet: a stale cancel must be refused outright rather
    // than parked in the verdict set where nobody will ever read it.
    assert!(!svc.cancel("t1"));
    assert!(!svc.cancel_requested(Some(&c)));

    let slot = svc.claim_transfer(Some(&c));
    // Claimed but not spawned — exactly the state of a transfer waiting on
    // its lane or on the SSH handshake. This used to answer `false` and
    // strand the user with a row they could not stop.
    assert!(svc.cancel("t1"));
    assert!(svc.cancel_requested(Some(&c)));

    drop(slot);
    // The operation is over: no verdict may outlive it.
    assert!(!svc.cancel_requested(Some(&c)));
    assert!(!svc.cancel("t1"));
}

#[test]
fn starting_a_transfer_does_not_erase_a_pending_cancel() {
    let svc = SftpService::new();
    let c = ctx("t2");
    let _slot = svc.claim_transfer(Some(&c));
    assert!(svc.cancel("t2"));

    // Regression guard: `register_running` used to clear the verdict, so a
    // cancel issued while the connection was still being built was thrown
    // away and the file transferred anyway.
    lock(&svc.inflight).insert("t2".to_string());
    assert!(svc.cancel_requested(Some(&c)));

    // Reading the verdict must not consume it either: `exec` can loop once
    // more after a dropped connection, and that retry would otherwise
    // resurrect an aborted transfer.
    assert!(svc.cancel_requested(Some(&c)));
}

#[test]
fn retrying_reuses_the_id_with_a_clean_slate() {
    let svc = SftpService::new();
    let c = ctx("t3");
    {
        let _slot = svc.claim_transfer(Some(&c));
        assert!(svc.cancel("t3"));
        assert!(svc.cancel_requested(Some(&c)));
    }
    // The retry button replays under the same id; it must not inherit the
    // previous run's verdict and abort on arrival.
    let _slot = svc.claim_transfer(Some(&c));
    assert!(!svc.cancel_requested(Some(&c)));
}

#[test]
fn metadata_operations_are_never_treated_as_cancelled() {
    let svc = SftpService::new();
    // Listings and mkdir carry no progress context; the cancel gates must
    // stay inert for them instead of short-circuiting a browse.
    assert!(!svc.cancel_requested(None));
    assert!(svc.claim_transfer(None).is_none());
}

// ---- resume planning ----

#[test]
fn resume_picks_the_right_verb_per_file() {
    let mut plan = UploadPlan::default();
    // Nothing on the far side: `put -a` would abort with "stat remote: No
    // such file or directory" and upload nothing at all.
    plan.push_file("/l/new.bin", "new.bin", 1000, None);
    // Half way there: the one case `-a` was made for.
    plan.push_file("/l/part.bin", "part.bin", 1000, Some(400));
    // Already complete: `put -a` fails the whole command here, so it must
    // not be emitted.
    plan.push_file("/l/done.bin", "done.bin", 1000, Some(1000));
    // Longer than the source: leftovers from something else, overwrite.
    plan.push_file("/l/stale.bin", "stale.bin", 1000, Some(9000));

    assert_eq!(plan.skipped, 1);
    assert_eq!(
        plan.puts,
        vec![
            "put \"/l/new.bin\" \"new.bin\"".to_string(),
            "put -a \"/l/part.bin\" \"part.bin\"".to_string(),
            "put \"/l/stale.bin\" \"stale.bin\"".to_string(),
        ]
    );
}

#[test]
fn a_fully_transferred_item_plans_nothing() {
    let mut plan = UploadPlan::default();
    plan.push_file("/l/a", "a", 10, Some(10));
    assert!(plan.is_noop());
    assert_eq!(plan.len(), 0);
}

#[test]
fn local_walk_lists_parents_before_children_and_skips_links() {
    let root = std::env::temp_dir().join(format!("bsp-walk-{}", unique_temp_path("t")));
    let sub = root.join("sub").join("deep");
    std::fs::create_dir_all(&sub).unwrap();
    std::fs::write(root.join("a.bin"), b"1234").unwrap();
    std::fs::write(sub.join("b.bin"), b"12").unwrap();
    // Dotfiles ride along: `put -r` sends them, so the plan must too.
    std::fs::write(root.join(".hidden"), b"x").unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(root.join("a.bin"), root.join("link.bin")).unwrap();

    let tree = walk_local_tree(&root).expect("walk");
    // "sub" must come before "sub/deep" or the `-mkdir` lines are useless.
    assert_eq!(tree.dirs, vec!["sub".to_string(), "sub/deep".to_string()]);
    let mut files: Vec<(String, u64)> = tree.files.clone();
    files.sort();
    assert_eq!(
        files,
        vec![
            (".hidden".to_string(), 1),
            ("a.bin".to_string(), 4),
            ("sub/deep/b.bin".to_string(), 2),
        ]
    );
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn resume_flag_only_touches_the_get_verb() {
    // Guard the command shape: `-a` sits after `-r`, and the merge source
    // (`<dir>/.`) that stops a re-download nesting must survive it.
    assert_eq!(merge_source("/srv/data"), "/srv/data/.");
    assert_eq!(cd_command("."), "cd");
    assert_eq!(cd_command("/srv/data"), "cd \"/srv/data\"");
}
