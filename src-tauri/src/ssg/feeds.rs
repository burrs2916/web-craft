//! sitemap.xml / robots.txt 生成（docs/ssg-engine-design.md §6 FR-B5）

/// 生成 sitemap.xml。site_url 需以 http(s):// 开头且无尾斜杠。
pub fn sitemap(site_url: &str, paths: &[String]) -> String {
    let mut out = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
         <urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n",
    );
    for p in paths {
        let url = format!("{}{}", site_url, p);
        out.push_str(&format!("  <url><loc>{}</loc></url>\n", escape_xml(&url)));
    }
    out.push_str("</urlset>\n");
    out
}

/// 生成 robots.txt：允许全站抓取，指向 sitemap。
pub fn robots(site_url: &str) -> String {
    format!(
        "User-agent: *\nAllow: /\n\nSitemap: {}/sitemap.xml\n",
        site_url.trim_end_matches('/')
    )
}

fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sitemap_lists_paths() {
        let xml = sitemap("https://example.com", &["/".into(), "/posts/hello/index.html".into()]);
        assert!(xml.contains("<loc>https://example.com/</loc>"));
        assert!(xml.contains("<loc>https://example.com/posts/hello/index.html</loc>"));
    }

    #[test]
    fn robots_points_to_sitemap() {
        let txt = robots("https://example.com");
        assert!(txt.contains("Sitemap: https://example.com/sitemap.xml"));
    }
}
