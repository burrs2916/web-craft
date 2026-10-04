import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Collapse from "@mui/material/Collapse";
import LinkIcon from "@mui/icons-material/Link";
import { useState } from "react";
import { SectionHeader, RULE_HINTS } from "../apiPanelShared";

/** URL 拼接规则说明（纯静态文案） */
export function UrlRulesSection() {
  const [expanded, setExpanded] = useState(false);

  return (
    <Box>
      <SectionHeader title="URL 拼接规则" icon={<LinkIcon sx={{ fontSize: 16 }} />} expanded={expanded} onToggle={() => setExpanded(!expanded)} />
      <Collapse in={expanded} unmountOnExit>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75, pl: 0.5, pt: 0.5 }}>
          {RULE_HINTS.map((r) => (
            <Box key={r.title} sx={{ display: "flex", alignItems: "flex-start", gap: 0.75 }}>
              <Typography variant="caption" sx={{ fontSize: 11, fontWeight: 700, color: "text.primary", flexShrink: 0, width: 88 }}>
                {r.title}
              </Typography>
              <Typography variant="caption" sx={{ fontSize: 11, color: "text.secondary", lineHeight: 1.6 }}>
                {r.desc}
              </Typography>
            </Box>
          ))}
          <Typography variant="caption" sx={{ fontSize: 10.5, color: "text.disabled", lineHeight: 1.6, pt: 0.5 }}>
            编辑态与发布产物严格遵循同一套规则。
          </Typography>
        </Box>
      </Collapse>
    </Box>
  );
}