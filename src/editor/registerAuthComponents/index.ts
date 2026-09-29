/**
 * 注册认证组件（网站编辑器）
 *
 * 覆盖 7 种主流认证方式：
 * - Session-Cookie / JWT / Basic Auth  → auth-login-form
 * - OAuth 2.0 (Auth Code / PKCE)       → auth-oauth-button
 * - SSO (CAS / SAML / OIDC)            → auth-sso-button
 * - API Key                            → auth-api-key-config
 * - 注册                               → auth-register-form
 * - 路由守卫                           → auth-guard
 * - 用户信息                           → auth-user-profile
 * - 退出登录                           → auth-logout-button
 *
 * 三层架构：renderer（src/editor/renderers/）+ codegen（src/codegen/components/auth/）
 *           + configSchema（本文件）
 * 三层字段名和默认值保持一致。
 */

import { registerLoginForm } from "./loginForm";
import { registerAuthGuard } from "./guard";
import { registerAuthUserProfile } from "./userProfile";
import { registerAuthLogoutButton } from "./logoutButton";
import { registerAuthOauthButton } from "./oauthButton";
import { registerAuthRegisterForm } from "./registerForm";
import { registerAuthSsoButton } from "./ssoButton";
import { registerAuthApiKeyConfig } from "./apiKeyConfig";

export {
  AUTH_PRESETS,
  loadCustomAuthPresets,
  saveCustomAuthPreset,
  deleteCustomAuthPreset,
  getAllAuthPresets,
} from "./presets";

/**
 * 注册认证组件（网站编辑器）
 * - 登录表单、路由守卫、用户信息、退出登录、OAuth、注册、SSO、API Key
 */
export function registerAuthComponents(): void {
  registerLoginForm();
  registerAuthGuard();
  registerAuthUserProfile();
  registerAuthLogoutButton();
  registerAuthOauthButton();
  registerAuthRegisterForm();
  registerAuthSsoButton();
  registerAuthApiKeyConfig();
}
