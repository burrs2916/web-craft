use super::*;

impl DeployService {
    /// 解析站点本地 dist/ 目录路径。
    /// 优先使用 deploy_config_json 中的 dist_dir 覆盖；否则取 local_workdir/dist。
    /// local_workdir 为空时返回错误（需先绑定网站）。
    /// 路径不存在则返回错误。
    pub fn resolve_static_dist(data_dir: &Path, site: &Site) -> Result<PathBuf> {
        let deploy_config: serde_json::Value =
            serde_json::from_str(&site.deploy_config_json).unwrap_or(serde_json::json!({}));

        let dist_dir = if let Some(override_dir) = deploy_config.get("dist_dir").and_then(|v| v.as_str()) {
            // 绝对路径直接用，相对路径基于 data_dir
            let p = PathBuf::from(override_dir);
            if p.is_absolute() {
                p
            } else {
                data_dir.join(p)
            }
        } else if site.local_workdir.trim().is_empty() {
            // local_workdir 未设置：站点尚未绑定网站
            return Err(Error::Cms(
                "站点尚未绑定网站，本地工作目录为空（请先在站点详情页绑定已发布网站）".into(),
            ));
        } else {
            // 构建端产物按模板隔离为 {workdir}/{framework}/dist，
            // 这里按同样规则解析，确保部署读出的是构建真正生成的目录（不混用其它模板产物）。
            let workdir = site.local_workdir.trim();
            let build_cfg: serde_json::Value =
                serde_json::from_str(&site.build_config_json).unwrap_or(serde_json::json!({}));
            // 1) 站点显式声明的模板 → 锁定该模板的 dist
            if let Some(fw) = deploy_config
                .get("framework")
                .and_then(|v| v.as_str())
                .or_else(|| build_cfg.get("framework").and_then(|v| v.as_str()))
                .filter(|s| !s.is_empty())
            {
                PathBuf::from(workdir).join(fw).join("dist")
            } else {
                // 2) 无显式模板：探测已构建的模板子目录（取首个含 index.html 的）
                let mut found: Option<PathBuf> = None;
                for name in ["static-html", "vue", "react", "angular"] {
                    let p = PathBuf::from(workdir).join(name);
                    if p.join("dist").join("index.html").is_file() {
                        found = Some(p.join("dist"));
                        break;
                    }
                }
                // 3) 回退：兼容置于 {workdir}/dist 的旧布局
                found.unwrap_or_else(|| PathBuf::from(workdir).join("dist"))
            }
        };

        if !dist_dir.is_dir() {
            return Err(Error::Cms(format!(
                "本地构建产物不存在: {}（先完成站点构建再部署）",
                dist_dir.display()
            )));
        }
        Ok(dist_dir)
    }
}
