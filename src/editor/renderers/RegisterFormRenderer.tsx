import { useState, useMemo, useEffect } from "react";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import type { ComponentRendererProps } from "../../types/editor";
import { useWebsiteAuthStore } from "../../store/websiteAuthStore";

/**
 * 注册表单渲染器 v3 — 非侵入式动态字段
 *
 * v3 改造核心：
 * - 字段列表完全由 config.fields 驱动，不再硬编码 username/password/confirmPassword/email
 * - 网站搭建者在属性面板中自由增删字段、配置名称/标签/类型/必填/占位提示/最小长度/密码可见切换
 * - 支持字段类型：text / password / email / number
 * - 验证逻辑完全从 fields 配置动态生成
 *
 * 布局修复（与 LoginFormRenderer 一致）：
 * - 移除 justifyContent: center，避免内容超出容器时顶部被裁切
 * - 编辑模式 overflow: visible（画布外框 hidden 不会裁切编辑态）
 * - 预览模式 overflow: auto（内容溢出时可滚动）
 */

interface RegisterField {
  name: string;
  label: string;
  type: "text" | "password" | "email" | "number";
  required: boolean;
  placeholder: string;
  minLength: string;
  showToggle: boolean;
}

const DEFAULT_FIELDS: RegisterField[] = [
  { name: "username", label: "用户名", type: "text", required: true, placeholder: "请输入用户名", minLength: "3", showToggle: false },
  { name: "password", label: "密码", type: "password", required: true, placeholder: "请输入密码", minLength: "6", showToggle: true },
  { name: "confirmPassword", label: "确认密码", type: "password", required: true, placeholder: "请再次输入密码", minLength: "0", showToggle: true },
  { name: "email", label: "邮箱", type: "email", required: false, placeholder: "请输入邮箱", minLength: "0", showToggle: false },
];

export function RegisterFormRenderer({ config, mode }: ComponentRendererProps) {
  const isEdit = mode === "edit";
  const setLogin = useWebsiteAuthStore((s) => s.setLogin);
  const setCachedValue = useWebsiteAuthStore((s) => s.setCachedValue);
  const setAuthConfig = useWebsiteAuthStore((s) => s.setConfig);

  const apiUrl = (config.apiUrl as string) ?? "";
  const method = (config.method as string) ?? "POST";
  const title = (config.title as string) ?? "注册";
  const buttonText = (config.buttonText as string) ?? "注册";
  const bgColor = (config.bgColor as string) ?? "#ffffff";
  const textColor = (config.textColor as string) ?? "#333333";
  const borderColor = (config.borderColor as string) ?? "#e0e0e0";
  const borderRadius = (config.borderRadius as number) ?? 8;
  const fontSize = (config.fontSize as number) ?? 14;
  const successText = (config.successText as string) ?? "注册成功";
  const redirectUrl = (config.redirectUrl as string) ?? "/login";
  const buttonBgColor = (config.buttonBgColor as string) ?? "#1976d2";
  const buttonTextColor = (config.buttonTextColor as string) ?? "#ffffff";
  const tokenField = (config.tokenField as string) ?? "token";
  const refreshTokenField = (config.refreshTokenField as string) ?? "refreshToken";
  const expiresInField = (config.expiresInField as string) ?? "expiresIn";
  const userField = (config.userField as string) ?? "user";
  const autoLoginAfterRegister = (config.autoLoginAfterRegister as boolean) ?? false;
  const tokenKey = (config.tokenKey as string) ?? "auth_token";
  const tokenStorage = (config.tokenStorage as string) ?? "localStorage";
  const redirectDelay = (config.redirectDelay as number) ?? 1500;

  // 从 config 读取动态字段列表；缺失或空时回退到默认字段（与 LoginFormRenderer 一致的 || 模式）
  const fields = useMemo<RegisterField[]>(() => {
    const raw = config.fields as unknown;
    if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_FIELDS;
    return raw.map((f, i) => ({
      name: String(f?.name || `field_${i}`),
      label: String(f?.label || f?.name || `字段${i + 1}`),
      type: (["text", "password", "email", "number"].includes(String(f?.type)) ? String(f?.type) : "text") as RegisterField["type"],
      required: Boolean(f?.required ?? false),
      placeholder: String(f?.placeholder || ""),
      minLength: String(f?.minLength || "0"),
      showToggle: Boolean(f?.showToggle ?? false),
    }));
  }, [config.fields]);

  // 动态 state：每个字段一个 value + 每个密码字段一个 showToggle 状态
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  // P0: 同步 token 配置到 store（单一配置源）
  useEffect(() => {
    setAuthConfig({ token: { key: tokenKey, storage: tokenStorage as "localStorage" | "sessionStorage" | "memory" } });
  }, [tokenKey, tokenStorage, setAuthConfig]);

  const [passwordToggles, setPasswordToggles] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleChange = (name: string, value: string) => {
    setFieldValues((prev) => ({ ...prev, [name]: value }));
  };

  const togglePassword = (name: string) => {
    setPasswordToggles((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const handleRegister = async () => {
    setError(null);

    // 动态验证：遍历 fields 配置
    for (const field of fields) {
      const val = fieldValues[field.name] ?? "";
      if (field.required && !val) {
        setError(`请填写${field.label}`);
        return;
      }
      const minLen = parseInt(field.minLength, 10);
      if (minLen > 0 && val && val.length < minLen) {
        setError(`${field.label}至少 ${minLen} 个字符`);
        return;
      }
      if (field.type === "email" && val) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(val)) {
          setError(`${field.label}格式不正确`);
          return;
        }
      }
    }

    // 特殊验证：确认密码（如果存在两个 password 类型字段且第二个 name 包含 confirm）
    const passwordFields = fields.filter((f) => f.type === "password");
    if (passwordFields.length >= 2) {
      const first = passwordFields[0];
      const second = passwordFields[1];
      const v1 = fieldValues[first.name] ?? "";
      const v2 = fieldValues[second.name] ?? "";
      if (v1 && v2 && v1 !== v2) {
        setError(`${first.label}与${second.label}不一致`);
        return;
      }
    }

    if (!apiUrl) {
      setError("未配置注册 API 地址");
      return;
    }

    setLoading(true);

    try {
      // 动态构建请求体：所有字段值都放入
      const body: Record<string, string> = {};
      for (const field of fields) {
        const val = fieldValues[field.name] ?? "";
        if (val) body[field.name] = val;
      }

      const response = await fetch(apiUrl, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        setError(`注册失败 (${response.status}): ${errText}`);
        setLoading(false);
        return;
      }

      if (autoLoginAfterRegister) {
        try {
          const data = await response.json();
          const token = data[tokenField] || "";
          const refreshToken = data[refreshTokenField] || "";
          const expiresInNum = data[expiresInField] ? Number(data[expiresInField]) : 0;
          const expiresAt = expiresInNum > 0 ? Date.now() + expiresInNum * 1000 : undefined;
          const user = data[userField] || undefined;

          if (token) {
            setLogin(
              {
                token,
                refreshToken: refreshToken || undefined,
                expiresAt,
                user: user as Record<string, unknown> | undefined,
              },
              ((config.autoLoginMode as string) || (tokenStorage === "memory" ? "session" : "jwt")) as "jwt" | "session" | "basic" | "oauth2" | "sso" | "api-key",
            );

            setCachedValue(tokenKey, token);
            if (refreshToken) setCachedValue("refreshToken", refreshToken);
            if (expiresAt) {
              setCachedValue("__webcraft_auth_expires_at", String(expiresAt));
              setCachedValue("__webcraft_auth_mode", "jwt");
            }
            setCachedValue("__webcraft_auth_authenticated", "true");
            if (user) setCachedValue("__webcraft_auth_user", JSON.stringify(user));
          }
        } catch {
          // 响应不是 JSON 或无法解析——不阻断成功流程
        }
      }

      setSuccess(true);
      setLoading(false);

      if (redirectUrl && redirectUrl !== "none" && redirectDelay > 0) {
        setTimeout(() => { window.location.href = redirectUrl; }, redirectDelay);
      } else if (redirectUrl && redirectUrl !== "none" && redirectDelay === 0) {
        window.location.href = redirectUrl;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "注册请求异常");
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-start",
        background: bgColor,
        color: textColor,
        border: `1px solid ${borderColor}`,
        borderRadius: `${borderRadius}px`,
        padding: "24px",
        boxSizing: "border-box",
        overflow: isEdit ? "visible" : "auto",
        position: "relative",
      }}
    >

      {title && (
        <Typography
          sx={{ fontSize: fontSize + 6, fontWeight: 600, mb: 2, textAlign: "center", color: textColor }}
        >
          {title}
        </Typography>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2, fontSize: fontSize - 1 }} icon={false}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2, fontSize: fontSize - 1 }} icon={false}>
          {successText}
        </Alert>
      )}

      {/* 动态字段渲染 */}
      {fields.map((field) => {
        const inputType = field.type === "password"
          ? (field.showToggle && passwordToggles[field.name] ? "text" : "password")
          : field.type;
        const showPwdToggle = field.type === "password" && field.showToggle;

        return (
          <TextField
            key={field.name}
            label={field.label}
            type={inputType}
            value={fieldValues[field.name] ?? ""}
            onChange={(e) => handleChange(field.name, e.target.value)}
            disabled={!isEdit && loading}
            size="small"
            fullWidth
            placeholder={field.placeholder || undefined}
            sx={{
              mb: 2,
              "& .MuiOutlinedInput-root": {
                fontSize,
                borderRadius,
                backgroundColor: bgColor,
                color: textColor,
                "& fieldset": { borderColor },
                "&.Mui-focused fieldset": { borderColor: buttonBgColor, borderWidth: 2 },
                "&.Mui-disabled fieldset": { borderColor },
                "&.Mui-disabled": { opacity: 1, WebkitTextFillColor: textColor, backgroundColor: bgColor },
              },
              "& .MuiInputLabel-root": {
                fontSize,
                color: textColor,
                "&.Mui-disabled": { color: textColor, opacity: 0.6 },
              },
            }}
            slotProps={
              showPwdToggle
                ? {
                    input: {
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            onClick={() => togglePassword(field.name)}
                            edge="end"
                            size="small"
                            disabled={!isEdit && loading}
                            tabIndex={-1}
                            sx={{ color: borderColor }}
                          >
                            {passwordToggles[field.name] ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    },
                  }
                : undefined
            }
          />
        );
      })}

      {fields.length === 0 && (
        <Box sx={{ color: "text.disabled", fontStyle: "italic", fontSize: 13, textAlign: "center", py: 2 }}>
          {isEdit ? "请在属性面板中添加表单字段" : ""}
        </Box>
      )}

      <Button
        variant="contained"
        disabled={!isEdit && loading}
        onClick={handleRegister}
        sx={{
          textTransform: "none",
          fontSize,
          borderRadius,
          py: 1,
          backgroundColor: buttonBgColor,
          color: buttonTextColor,
          "&:hover": { backgroundColor: buttonBgColor, opacity: 0.9 },
          "&:disabled": { backgroundColor: buttonBgColor, color: buttonTextColor, opacity: 0.5 },
        }}
      >
        {loading ? <CircularProgress size={fontSize + 4} color="inherit" /> : buttonText}
      </Button>
    </Box>
  );
}
