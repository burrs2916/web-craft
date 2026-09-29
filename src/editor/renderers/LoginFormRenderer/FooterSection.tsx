import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Link from "@mui/material/Link";
import CircularProgress from "@mui/material/CircularProgress";
import type { LoginFormConfigValues } from "./config";
import type { LoginFormState } from "./useLoginFormState";
import type { LoginFormActions } from "./useLoginActions";
import { getSocialIcon } from "./shared";

interface FooterSectionProps {
  cfg: LoginFormConfigValues;
  st: LoginFormState;
  actions: LoginFormActions;
  isEdit: boolean;
}

/**
 * 表单底部：记住我 / 忘记密码 / 登录按钮 / 社交登录按钮区。
 */
export function FooterSection({ cfg, st, actions, isEdit }: FooterSectionProps) {
  return (
    <>
      {/* ─── 记住我 + 忘记密码 ─── */}
      {(cfg.showRemember || cfg.showForgot) && (
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          {cfg.showRemember ? (
            <FormControlLabel
              control={
                <Checkbox
                  checked={st.remember}
                  onChange={(e) => st.setRemember(e.target.checked)}
                  size="small"
                  sx={{
                    color: cfg.rememberAccentColor,
                    "&.Mui-checked": { color: cfg.rememberAccentColor },
                  }}
                />
              }
              label={cfg.rememberLabel}
              sx={{
                margin: 0,
                "& .MuiFormControlLabel-label": {
                  fontSize: `${cfg.rememberFontSize}px`,
                  color: cfg.rememberColor,
                },
              }}
            />
          ) : (
            <span />
          )}
          {cfg.showForgot && (
            <Link
              href={cfg.forgotUrl || "#"}
              underline="none"
              sx={{
                color: cfg.forgotLinkColor,
                fontSize: `${cfg.forgotFontSize}px`,
                "&:hover": { textDecoration: "underline" },
              }}
            >
              {cfg.forgotText}
            </Link>
          )}
        </Box>
      )}

      {/* ─── 登录按钮 ─── */}
      <Button
        variant="contained"
        fullWidth={cfg.buttonFullWidth}
        disabled={!isEdit && st.loading}
        onClick={() => {
          if (cfg.useDynamicParams && cfg.authParams.length > 0) actions.handleDynamicLogin();
          else actions.handleLogin();
        }}
        disableElevation
        sx={{
          textTransform: "none",
          fontSize: `${cfg.buttonFontSize}px`,
          fontWeight: 600,
          borderRadius: `${cfg.buttonBorderRadius}px`,
          height: `${cfg.buttonHeight}px`,
          width: cfg.buttonFullWidth ? "100%" : "auto",
          backgroundColor: cfg.buttonBgColor,
          color: cfg.buttonTextColor,
          "&:hover": {
            backgroundColor: cfg.buttonHoverColor,
          },
          "&.Mui-disabled": {
            backgroundColor: cfg.buttonBgColor,
            color: cfg.buttonTextColor,
            opacity: 0.6,
          },
          flexShrink: 0,
        }}
      >
        {st.loading ? (
          <CircularProgress size={cfg.buttonFontSize + 4} color="inherit" />
        ) : (
          cfg.buttonText
        )}
      </Button>

      {/* ─── v5 社交登录按钮区 ─── */}
      {cfg.showSocialLogin && cfg.socialButtons.length > 0 && (
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", flexShrink: 0, marginTop: "4px" }}>
          <Typography sx={{ fontSize: `${cfg.socialLoginTitleFontSize}px`, color: cfg.socialLoginTitleColor, textAlign: "center" }}>
            {cfg.socialLoginTitle}
          </Typography>
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: `${cfg.socialLoginGap}px`,
              flexDirection: cfg.socialLoginLayout === "row" ? "row" : "row",
            }}
          >
            {cfg.socialButtons.map((btn) => (
              <Box
                key={btn.id}
                onClick={() => {
                  if (!isEdit && btn.authUrl) {
                    window.open(btn.authUrl, "_blank");
                  }
                }}
                sx={{
                  width: `${cfg.socialLoginSize}px`,
                  height: `${cfg.socialLoginSize}px`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: `${cfg.socialLoginBorderRadius}px`,
                  background: btn.bgColor || cfg.socialLoginBgColor,
                  color: btn.textColor || "#333",
                  cursor: isEdit ? "default" : (btn.authUrl ? "pointer" : "default"),
                  border: `1px solid ${cfg.captchaBorderColor}`,
                  transition: "opacity 0.2s",
                  "&:hover": { opacity: 0.85 },
                }}
                title={btn.label}
              >
                {getSocialIcon(btn.icon, cfg.socialLoginSize)}
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </>
  );
}