import { useState, useEffect, useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { LoginFormConfigValues } from "./config";

/**
 * 登录表单的全部本地状态（含 setter），供渲染器主体与各分区组件共享。
 */
export interface LoginFormState {
  // v5 多租户 / 验证码 / 短信
  tenant: string;
  setTenant: Dispatch<SetStateAction<string>>;
  captchaValue: string;
  setCaptchaValue: Dispatch<SetStateAction<string>>;
  smsPhone: string;
  setSmsPhone: Dispatch<SetStateAction<string>>;
  smsCode: string;
  setSmsCode: Dispatch<SetStateAction<string>>;
  smsCountdown: number;
  setSmsCountdown: Dispatch<SetStateAction<number>>;
  smsSending: boolean;
  setSmsSending: Dispatch<SetStateAction<boolean>>;
  activeTab: "password" | "sms";
  setActiveTab: Dispatch<SetStateAction<"password" | "sms">>;
  showPasswordMode: boolean;
  showSmsMode: boolean;

  // 表单状态
  username: string;
  setUsername: Dispatch<SetStateAction<string>>;
  password: string;
  setPassword: Dispatch<SetStateAction<string>>;
  showPassword: boolean;
  setShowPassword: Dispatch<SetStateAction<boolean>>;
  remember: boolean;
  setRemember: Dispatch<SetStateAction<boolean>>;
  loading: boolean;
  setLoading: Dispatch<SetStateAction<boolean>>;
  error: string | null;
  setError: Dispatch<SetStateAction<string | null>>;

  // v5 动态参数表单值和密码可见性
  dynamicValues: Record<string, string>;
  setDynamicValues: Dispatch<SetStateAction<Record<string, string>>>;
  showPasswordMap: Record<string, boolean>;
  setShowPasswordMap: Dispatch<SetStateAction<Record<string, boolean>>>;

  // v3 门禁联动：初始隐藏时由 auth-guard 唤起
  visible: boolean;

  // v5 验证码图片
  captchaImgSrc: string;
  refreshCaptcha: () => void;
}

/**
 * 管理登录表单的本地状态与门禁/验证码联动副作用。
 */
export function useLoginFormState(cfg: LoginFormConfigValues): LoginFormState {
  const [tenant, setTenant] = useState("");
  const [captchaValue, setCaptchaValue] = useState("");
  const [smsPhone, setSmsPhone] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [smsCountdown, setSmsCountdown] = useState(0);
  const [smsSending, setSmsSending] = useState(false);
  const [activeTab, setActiveTab] = useState<"password" | "sms">("password");
  const showPasswordMode = cfg.loginType === "password" || (cfg.loginType === "both" && activeTab === "password");
  const showSmsMode = cfg.loginType === "sms" || (cfg.loginType === "both" && activeTab === "sms");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dynamicValues, setDynamicValues] = useState<Record<string, string>>({});
  const [showPasswordMap, setShowPasswordMap] = useState<Record<string, boolean>>({});
  const [visible, setVisible] = useState(!cfg.initiallyHidden);

  const [captchaImgSrc, setCaptchaImgSrc] = useState("");
  const refreshCaptcha = useCallback(() => {
    if (!cfg.captchaEndpoint) return;
    const sep = cfg.captchaEndpoint.includes("?") ? "&" : "?";
    setCaptchaImgSrc(`${cfg.captchaEndpoint}${sep}_t=${Date.now()}`);
  }, [cfg.captchaEndpoint]);

  useEffect(() => {
    if (cfg.showCaptcha && cfg.captchaType === "image" && cfg.captchaEndpoint) {
      refreshCaptcha();
    }
  }, [cfg.showCaptcha, cfg.captchaType, cfg.captchaEndpoint, refreshCaptcha]);

  // ─── v3 门禁联动：监听 auth-guard 唤起事件 ───
  useEffect(() => {
    if (!cfg.initiallyHidden) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { loginFormId?: string } | undefined;
      // 如果指定了 loginFormId 但不是自己，则忽略（目前 renderer 拿不到自己的 id，所以接受所有）
      void detail;
      setVisible(true);
    };
    window.addEventListener("webcraft-show-login", handler);
    return () => window.removeEventListener("webcraft-show-login", handler);
  }, [cfg.initiallyHidden]);

  // ─── v5 联动闭环：登录成功后自动隐藏（initiallyHidden 模式） ───
  useEffect(() => {
    if (!cfg.initiallyHidden) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { isAuthenticated?: boolean } | undefined;
      if (detail?.isAuthenticated) {
        setVisible(false);
      }
    };
    window.addEventListener("auth-state-change", handler);
    return () => window.removeEventListener("auth-state-change", handler);
  }, [cfg.initiallyHidden]);

  return {
    tenant, setTenant,
    captchaValue, setCaptchaValue,
    smsPhone, setSmsPhone,
    smsCode, setSmsCode,
    smsCountdown, setSmsCountdown,
    smsSending, setSmsSending,
    activeTab, setActiveTab,
    showPasswordMode, showSmsMode,
    username, setUsername,
    password, setPassword,
    showPassword, setShowPassword,
    remember, setRemember,
    loading, setLoading,
    error, setError,
    dynamicValues, setDynamicValues,
    showPasswordMap, setShowPasswordMap,
    visible,
    captchaImgSrc, refreshCaptcha,
  };
}