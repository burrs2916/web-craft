//! UTF-8 locale discovery and environment pairs.

use std::process::Command;
use std::sync::OnceLock;

/// Environment overlay that keeps non-ASCII file names intact.
///
/// OpenSSH prints its listing through `mprintf`, which escapes every byte it
/// cannot decode under the current `LC_CTYPE` into `\NNN` octal. A desktop app
/// is precisely the process that trips this: macOS launches app bundles from
/// Finder without `LANG` at all, so `中文.txt` arrives as
/// `\344\270\255\346\226\207.txt`. That is not merely ugly — every follow-up
/// get/rm/rename/chmod is addressed by the name we read back, so the escaped
/// form silently points at a path that does not exist.
///
/// It cannot be repaired in the parser either: a *literal* backslash is left
/// alone by OpenSSH, which makes a real `back\344slash.txt` indistinguishable
/// from an escaped name. Decoding would corrupt the legitimate file. Handing
/// the child a UTF-8 `LC_CTYPE` is the only correct place to fix it.
///
/// `LC_TIME=C` pins English month names for the rare server that formats the
/// listing itself, and an empty `LC_ALL` is the POSIX way to say "ignore me",
/// which lets those two categories through even when the parent exported it.
pub(crate) fn locale_env() -> Vec<(String, String)> {
    // Win32-OpenSSH never consults POSIX locale variables — the MSVC runtime
    // resolves the code page from the OS — so setting them would be noise.
    if cfg!(target_os = "windows") {
        return Vec::new();
    }
    vec![
        ("LC_ALL".to_string(), String::new()),
        ("LC_CTYPE".to_string(), utf8_locale()),
        ("LC_TIME".to_string(), "C".to_string()),
        // 密码提示本地化：OpenSSH 在中文 locale 下显示 "user@host 的密码："，
        // 会让只匹配英文 "password:" 的自动喂密码逻辑漏检。LC_MESSAGES=C
        // 强制英文提示，与 pty::build_ssh_command 保持一致。
        ("LC_MESSAGES".to_string(), "C".to_string()),
    ]
}

/// Pick a UTF-8 locale that actually exists here, resolved once per process.
///
/// Naming an absent locale is worse than naming none: `setlocale` fails, the
/// child falls back to `C`, and the names are escaped again. So an inherited
/// value wins whenever it is already UTF-8, and every other candidate is
/// checked against `locale -a` before we commit to it.
pub(crate) fn utf8_locale() -> String {
    static CACHE: OnceLock<String> = OnceLock::new();
    CACHE
        .get_or_init(|| {
            for key in ["LC_ALL", "LC_CTYPE", "LANG"] {
                if let Ok(v) = std::env::var(key) {
                    if is_utf8_locale(&v) {
                        return v;
                    }
                }
            }
            let installed = installed_locales();
            for want in ["C.UTF-8", "C.utf8", "en_US.UTF-8", "en_US.utf8"] {
                if installed.iter().any(|l| l == want) {
                    return want.to_string();
                }
            }
            if let Some(any) = installed.iter().find(|l| is_utf8_locale(l)) {
                return any.clone();
            }
            // Nothing to verify against: musl images ship no `locale` binary
            // and treat every locale as UTF-8, so this is the right guess.
            "C.UTF-8".to_string()
        })
        .clone()
}

pub(crate) fn is_utf8_locale(v: &str) -> bool {
    let l = v.to_ascii_lowercase();
    l.ends_with("utf-8") || l.ends_with("utf8")
}

pub(crate) fn installed_locales() -> Vec<String> {
    match Command::new("locale").arg("-a").output() {
        Ok(out) if out.status.success() => String::from_utf8_lossy(&out.stdout)
            .lines()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty())
            .collect(),
        _ => Vec::new(),
    }
}
