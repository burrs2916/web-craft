import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import type { LoginFormConfigValues } from "./config";
import type { LoginFormState } from "./useLoginFormState";

interface HeaderSectionProps {
  cfg: LoginFormConfigValues;
  st: LoginFormState;
  isEdit: boolean;
}

/**
 * 表单头部：标题 / 副标题 / 错误提示 / 登录方式 Tab 切换。
 */
export function HeaderSection({ cfg, st, isEdit }: HeaderSectionProps) {
  return (
    <>
      {/* ─── 标题 ─── */}
      {cfg.showTitle && (
        <Typography
          sx={{
            fontSize: `${cfg.titleFontSize}px`,
            fontWeight: cfg.titleFontWeight,
            color: cfg.titleColor,
            textAlign: cfg.titleAlign as "left" | "center" | "right",
            margin: 0,
            marginBottom: `${cfg.titleMarginBottom}px`,
            lineHeight: 1.3,
          }}
        >
          {cfg.titleText}
        </Typography>
      )}

      {/* ─── 副标题 ─── */}
      {cfg.showSubtitle && (
        <Typography
          sx={{
            fontSize: `${cfg.subtitleFontSize}px`,
            color: cfg.subtitleColor,
            textAlign: cfg.subtitleAlign as "left" | "center" | "right",
            margin: 0,
            lineHeight: 1.4,
          }}
        >
          {cfg.subtitleText}
        </Typography>
      )}

      {/* ─── 错误提示 ─── */}
      {st.error && (
        <Alert
          severity="error"
          icon={false}
          sx={{
            backgroundColor: cfg.errorBgColor,
            color: cfg.errorTextColor,
            borderRadius: `${cfg.errorBorderRadius}px`,
            fontSize: `${Math.max(cfg.usernameFontSize - 1, 11)}px`,
            margin: 0,
          }}
        >
          {st.error}
        </Alert>
      )}

      {/* ─── v5 Tab 切换（loginType=both 时显示） ─── */}
      {cfg.loginType === "both" && (
        <Box sx={{ display: "flex", gap: "4px", borderBottom: `1px solid ${cfg.usernameBorderColor}`, flexShrink: 0 }}>
          {(["password", "sms"] as const).map((tab) => (
            <Box
              key={tab}
              onClick={() => !isEdit && st.setActiveTab(tab)}
              sx={{
                padding: "6px 16px",
                cursor: isEdit ? "default" : "pointer",
                fontSize: `${cfg.usernameFontSize}px`,
                fontWeight: st.activeTab === tab ? 600 : 400,
                color: st.activeTab === tab ? cfg.usernameFocusColor : cfg.usernameLabelColor,
                borderBottom: st.activeTab === tab ? `2px solid ${cfg.usernameFocusColor}` : "2px solid transparent",
                marginBottom: "-1px",
              }}
            >
              {tab === "password" ? "账号密码" : "手机验证码"}
            </Box>
          ))}
        </Box>
      )}
    </>
  );
}