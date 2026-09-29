import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import InputAdornment from "@mui/material/InputAdornment";
import IconButton from "@mui/material/IconButton";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import type { LoginFormConfigValues } from "./config";
import type { LoginFormState } from "./useLoginFormState";
import type { LoginFormActions } from "./useLoginActions";
import { inputSx } from "./shared";

interface CredentialSectionProps {
  cfg: LoginFormConfigValues;
  st: LoginFormState;
  actions: LoginFormActions;
  isEdit: boolean;
}

/**
 * 凭证输入区：多租户 / 动态参数 / 账号密码（含图形验证码） / 短信验证码。
 */
export function CredentialSection({ cfg, st, actions, isEdit }: CredentialSectionProps) {
  const handleKeyDown = actions.handleKeyDown;

  return (
    <>
      {/* ─── v5 多租户输入框 ─── */}
      {cfg.showTenantField && !cfg.useDynamicParams && (
        <TextField
          label={cfg.tenantLabel + (cfg.tenantRequired ? " *" : "")}
          placeholder={cfg.tenantPlaceholder}
          value={st.tenant || cfg.tenantDefaultValue}
          onChange={(e) => st.setTenant(e.target.value)}
          disabled={!isEdit && st.loading}
          fullWidth
          variant="outlined"
          sx={inputSx({
            bgColor: cfg.tenantBgColor,
            textColor: cfg.tenantTextColor,
            borderColor: cfg.tenantBorderColor,
            focusColor: cfg.tenantFocusColor,
            radius: cfg.tenantBorderRadius,
            height: cfg.tenantHeight,
            fontSize: cfg.tenantFontSize,
            labelColor: cfg.tenantLabelColor,
          })}
        />
      )}

      {/* ═══ v5 动态参数模式：从 authParams 渲染输入框 ═══ */}
      {cfg.useDynamicParams && cfg.authParams.length > 0 && (
        <>
          {cfg.authParams.map((param) => {
            const val = st.dynamicValues[param.id] ?? param.value ?? "";
            const showPw = st.showPasswordMap[param.id] ?? false;
            return (
              <TextField
                key={param.id}
                label={param.label + (param.required ? " *" : "")}
                placeholder={param.description || `请输入${param.label}`}
                type={param.isSecret ? (showPw ? "text" : "password") : "text"}
                value={val}
                onChange={(e) => st.setDynamicValues((prev) => ({ ...prev, [param.id]: e.target.value }))}
                onKeyDown={handleKeyDown}
                disabled={!isEdit && st.loading}
                fullWidth
                variant="outlined"
                sx={inputSx({
                  bgColor: cfg.usernameBgColor,
                  textColor: cfg.usernameTextColor,
                  borderColor: cfg.usernameBorderColor,
                  focusColor: cfg.usernameFocusColor,
                  radius: cfg.usernameBorderRadius,
                  height: cfg.usernameHeight,
                  fontSize: cfg.usernameFontSize,
                  labelColor: cfg.usernameLabelColor,
                })}
                slotProps={param.isSecret ? {
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            st.setShowPasswordMap((prev) => ({ ...prev, [param.id]: !(prev[param.id] ?? false) }));
                          }}
                          edge="end"
                          tabIndex={-1}
                          sx={{ color: cfg.usernameBorderColor }}
                        >
                          {showPw
                            ? <VisibilityOffIcon fontSize="small" />
                            : <VisibilityIcon fontSize="small" />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                } : undefined}
              />
            );
          })}
        </>
      )}

      {/* ═══ 密码模式字段（硬编码模式，useDynamicParams=false 时显示） ═══ */}
      {st.showPasswordMode && !cfg.useDynamicParams && (
        <>
          {/* ─── 用户名输入框 ─── */}
          <TextField
            label={cfg.usernameLabel}
            placeholder={cfg.usernamePlaceholder}
            value={st.username}
            onChange={(e) => st.setUsername(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!isEdit && st.loading}
            fullWidth
            variant="outlined"
            sx={inputSx({
              bgColor: cfg.usernameBgColor,
              textColor: cfg.usernameTextColor,
              borderColor: cfg.usernameBorderColor,
              focusColor: cfg.usernameFocusColor,
              radius: cfg.usernameBorderRadius,
              height: cfg.usernameHeight,
              fontSize: cfg.usernameFontSize,
              labelColor: cfg.usernameLabelColor,
            })}
          />

          {/* ─── 密码输入框 ─── */}
          <TextField
            label={cfg.passwordLabel}
            placeholder={cfg.passwordPlaceholder}
            type={st.showPassword ? "text" : "password"}
            value={st.password}
            onChange={(e) => st.setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!isEdit && st.loading}
            fullWidth
            variant="outlined"
            sx={inputSx({
              bgColor: cfg.passwordBgColor,
              textColor: cfg.passwordTextColor,
              borderColor: cfg.passwordBorderColor,
              focusColor: cfg.passwordFocusColor,
              radius: cfg.passwordBorderRadius,
              height: cfg.passwordHeight,
              fontSize: cfg.passwordFontSize,
              labelColor: cfg.passwordLabelColor,
            })}
            slotProps={{
              input: cfg.passwordShowToggle ? {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={() => st.setShowPassword(!st.showPassword)}
                      edge="end"
                      tabIndex={-1}
                      sx={{ color: cfg.passwordBorderColor }}
                    >
                      {st.showPassword
                        ? <VisibilityOffIcon fontSize="small" />
                        : <VisibilityIcon fontSize="small" />}
                    </IconButton>
                  </InputAdornment>
                ),
              } : undefined,
            }}
          />

          {/* ─── v5 验证码（图形） ─── */}
          {cfg.showCaptcha && cfg.captchaType === "image" && (
            <Box sx={{ display: "flex", gap: "8px", alignItems: "flex-end", flexShrink: 0 }}>
              <TextField
                label={cfg.captchaLabel}
                placeholder={cfg.captchaPlaceholder}
                value={st.captchaValue}
                onChange={(e) => st.setCaptchaValue(e.target.value)}
                disabled={!isEdit && st.loading}
                variant="outlined"
                sx={inputSx({
                  bgColor: cfg.captchaBgColor,
                  textColor: cfg.captchaTextColor,
                  borderColor: cfg.captchaBorderColor,
                  focusColor: cfg.usernameFocusColor,
                  radius: cfg.captchaBorderRadius,
                  height: cfg.captchaHeight,
                  fontSize: cfg.captchaFontSize,
                  labelColor: cfg.usernameLabelColor,
                })}
              />
              <Box
                onClick={() => !isEdit && st.refreshCaptcha()}
                sx={{
                  width: `${cfg.captchaWidth}px`,
                  height: `${cfg.captchaHeight}px`,
                  flexShrink: 0,
                  cursor: isEdit ? "default" : "pointer",
                  background: cfg.captchaEndpoint ? `url(${st.captchaImgSrc || ""}) center/cover` : "#e0e0e0",
                  border: `1px solid ${cfg.captchaBorderColor}`,
                  borderRadius: `${cfg.captchaBorderRadius}px`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: cfg.captchaRefreshColor,
                  fontSize: `${cfg.captchaFontSize - 2}px`,
                }}
              >
                {!cfg.captchaEndpoint && "验证码"}
              </Box>
            </Box>
          )}

          {/* ─── v5 验证码（滑块/点选，编辑态占位） ─── */}
          {cfg.showCaptcha && cfg.captchaType !== "image" && (
            <Box
              sx={{
                height: `${cfg.captchaHeight}px`,
                background: "#f0f0f0",
                border: `1px dashed ${cfg.captchaBorderColor}`,
                borderRadius: `${cfg.captchaBorderRadius}px`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#999",
                fontSize: `${cfg.captchaFontSize}px`,
                flexShrink: 0,
              }}
            >
              {cfg.captchaType === "slider" ? "滑块验证码（发布环境显示）" : "点选验证码（发布环境显示）"}
            </Box>
          )}
        </>
      )}

      {/* ═══ 短信模式字段 ═══ */}
      {st.showSmsMode && !cfg.useDynamicParams && (
        <>
          {/* ─── 手机号输入框 ─── */}
          <TextField
            label={cfg.smsLabel}
            placeholder={cfg.smsPlaceholder}
            value={st.smsPhone}
            onChange={(e) => st.setSmsPhone(e.target.value)}
            disabled={!isEdit && st.loading}
            fullWidth
            variant="outlined"
            sx={inputSx({
              bgColor: cfg.smsBgColor,
              textColor: cfg.smsTextColor,
              borderColor: cfg.smsBorderColor,
              focusColor: cfg.usernameFocusColor,
              radius: cfg.smsBorderRadius,
              height: cfg.smsHeight,
              fontSize: cfg.smsFontSize,
              labelColor: cfg.smsLabelColor,
            })}
          />

          {/* ─── 短信验证码 + 发送按钮 ─── */}
          <Box sx={{ display: "flex", gap: "8px", alignItems: "flex-end", flexShrink: 0 }}>
            <TextField
              label={cfg.smsCodeLabel}
              placeholder={cfg.smsCodePlaceholder}
              value={st.smsCode}
              onChange={(e) => st.setSmsCode(e.target.value)}
              disabled={!isEdit && st.loading}
              variant="outlined"
              sx={inputSx({
                bgColor: cfg.smsCodeBgColor,
                textColor: cfg.smsCodeTextColor,
                borderColor: cfg.smsCodeBorderColor,
                focusColor: cfg.usernameFocusColor,
                radius: cfg.smsCodeBorderRadius,
                height: cfg.smsCodeHeight,
                fontSize: cfg.smsCodeFontSize,
                labelColor: cfg.smsCodeLabelColor,
              })}
              style={{ flex: 1 }}
              slotProps={{ htmlInput: { maxLength: cfg.smsCodeLength } }}
            />
            <Button
              variant="contained"
              disabled={!isEdit && (st.loading || st.smsSending || st.smsCountdown > 0)}
              onClick={actions.handleSendSms}
              disableElevation
              sx={{
                textTransform: "none",
                fontSize: `${cfg.smsButtonFontSize}px`,
                fontWeight: 600,
                borderRadius: `${cfg.smsButtonBorderRadius}px`,
                height: `${cfg.smsCodeHeight}px`,
                minWidth: "100px",
                backgroundColor: cfg.smsButtonBgColor,
                color: cfg.smsButtonTextColor,
                "&:hover": { backgroundColor: cfg.smsButtonHoverColor },
                "&.Mui-disabled": { backgroundColor: cfg.smsButtonBgColor, color: cfg.smsButtonTextColor, opacity: 0.5 },
                flexShrink: 0,
              }}
            >
              {st.smsCountdown > 0 ? `${st.smsCountdown}s` : cfg.smsButtonText}
            </Button>
          </Box>
        </>
      )}
    </>
  );
}