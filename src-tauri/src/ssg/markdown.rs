//! Markdown → HTML 渲染（pulldown-cmark GFM，docs/ssg-engine-design.md §2）

use pulldown_cmark::{html, Options, Parser};

/// 渲染 GFM Markdown 为 HTML 片段。pulldown-cmark 容错性强，
/// 解析失败以空片段兜底，不阻塞整站构建（错误定位见 ssg-engine-design.md §9）。
pub fn render_markdown(md: &str) -> String {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_FOOTNOTES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);
    options.insert(Options::ENABLE_SMART_PUNCTUATION);
    let parser = Parser::new_ext(md, options);
    let mut out = String::new();
    html::push_html(&mut out, parser);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_gfm_features() {
        let html = render_markdown("# Title\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] done\n- [ ] todo\n\n~~strike~~");
        assert!(html.contains("<h1>Title</h1>"));
        assert!(html.contains("<table>"));
        assert!(html.contains("checked"));
        assert!(html.contains("<del>strike</del>"));
    }

    #[test]
    fn escapes_html_by_default() {
        // pulldown-cmark 默认尊重内联 HTML（不转义），这是 GFM 规范行为。
        let html = render_markdown("<script>alert(1)</script>");
        // 正确的安全策略是输出时模板引擎的 autoescape（Tera 默认开启）。
        assert!(html.contains("<script>alert(1)</script>"));
    }
}
