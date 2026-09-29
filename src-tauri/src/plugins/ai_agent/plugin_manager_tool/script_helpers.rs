//! 脚本修复辅助：错误分类与按错误内容自动打补丁（补依赖安装 / 文件校验 / shell→python 转换）。

pub(crate) fn classify_error(error: &str) -> String {
    let lower = error.to_lowercase();
    if lower.contains("modulenotfounderror") || lower.contains("importerror") || lower.contains("no module named") {
        return "Missing Dependency".to_string();
    }
    if lower.contains("syntaxerror") || lower.contains("syntax error") || lower.contains("indentationerror") {
        return "Syntax Error".to_string();
    }
    if lower.contains("no such file") || lower.contains("filenotfounderror") || (lower.contains("not found") && !lower.contains("command not found")) {
        return "File Not Found".to_string();
    }
    if lower.contains("timeout") || lower.contains("timed out") {
        return "Timeout".to_string();
    }
    if lower.contains("permission denied") || lower.contains("access denied") {
        return "Permission Error".to_string();
    }
    if lower.contains("connection") || lower.contains("network") || lower.contains("dns") || lower.contains("refused") {
        return "Network Error".to_string();
    }
    if lower.contains("typeerror") || lower.contains("valueerror") || lower.contains("keyerror") {
        return "Runtime Error".to_string();
    }
    "Unknown Error".to_string()
}

pub(crate) fn add_dependency_install(script: &str, instances: &[(String, String, String, Option<String>)]) -> String {
    let mut packages: Vec<String> = Vec::new();
    for (_, _, err, _) in instances {
        if let Some(pkg) = extract_missing_package(err) {
            if !packages.contains(&pkg) {
                packages.push(pkg);
            }
        }
    }

    if packages.is_empty() {
        return script.to_string();
    }

    let install_line = format!("import subprocess; subprocess.check_call(['pip3', 'install', {}])\n",
        packages.iter().map(|p| format!("'{}'", p)).collect::<Vec<_>>().join(", "));

    if script.starts_with("script:python3\n") || script.starts_with("script:python\n") {
        let parts: Vec<&str> = script.splitn(2, '\n').collect();
        if parts.len() == 2 {
            return format!("{}\n{}\n{}", parts[0], install_line, parts[1]);
        }
    }

    if script.starts_with("shell:") {
        let cmd = script.trim_start_matches("shell:").trim();
        return format!("script:python3\n{}\nimport subprocess\nsubprocess.run(['python3', '-c', r#\"{}\"#], check=True)", install_line, cmd);
    }

    script.to_string()
}

pub(crate) fn extract_missing_package(error: &str) -> Option<String> {
    let patterns = [
        ("No module named '", "'"),
        ("No module named \"", "\""),
        ("cannot import name '", "'"),
    ];
    for (start, end) in &patterns {
        if let Some(idx) = error.find(start) {
            let after = &error[idx + start.len()..];
            if let Some(end_idx) = after.find(end) {
                let pkg = &after[..end_idx];
                let pkg_name = pkg.split('.').next().unwrap_or(pkg);
                return Some(pkg_name.to_string());
            }
        }
    }
    None
}

pub(crate) fn add_file_validation(script: &str) -> String {
    if script.starts_with("script:python3\n") || script.starts_with("script:python\n") {
        let parts: Vec<&str> = script.splitn(2, '\n').collect();
        if parts.len() == 2 {
            let body = &parts[1];

            let mut file_params: Vec<String> = Vec::new();
            for word in body.split(|c: char| !c.is_alphanumeric() && c != '_') {
                let lower = word.to_lowercase();
                if (lower.contains("path") || lower.contains("file") || lower.contains("input"))
                    && body.contains(&format!("{{{{{}}}}}", word))
                    && !file_params.contains(&word.to_string())
                {
                    file_params.push(word.to_string());
                }
            }

            if file_params.is_empty() {
                return script.to_string();
            }

            let mut checks = String::from("import os\nimport sys\n");
            for param in &file_params {
                checks.push_str(&format!(
                    "if not os.path.exists({}):\n    print(f'Error: File not found: {{{}}}', file=sys.stderr)\n    sys.exit(1)\n",
                    param, param
                ));
            }

            return format!("{}\n{}{}\n{}", parts[0], checks, "", body);
        }
    }
    script.to_string()
}

pub(crate) fn convert_shell_python_to_script(script: &str) -> String {
    let cmd = script.trim_start_matches("shell:").trim();

    if let Some(idx) = cmd.find("python3 -c \"") {
        let after = &cmd[idx + 13..];
        if let Some(end_idx) = after.rfind("\"") {
            let code = &after[..end_idx];
            return format!("script:python3\n{}", code.replace("\\n", "\n"));
        }
    }

    if let Some(idx) = cmd.find("python -c \"") {
        let after = &cmd[idx + 11..];
        if let Some(end_idx) = after.rfind("\"") {
            let code = &after[..end_idx];
            return format!("script:python3\n{}", code.replace("\\n", "\n"));
        }
    }

    if let Some(idx) = cmd.find("python3 -c '") {
        let after = &cmd[idx + 13..];
        if let Some(end_idx) = after.rfind("'") {
            let code = &after[..end_idx];
            return format!("script:python3\n{}", code.replace("\\n", "\n"));
        }
    }

    script.to_string()
}
