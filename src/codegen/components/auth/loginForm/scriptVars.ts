/**
 * auth-login-form 发布端脚本（页面 JS）构建入参。
 *
 * 登录表单的脚本模板约 950 行，按职责拆到 scriptSetup / scriptAuth / scriptFlow
 * 三个构建函数，共享本契约；字段与 loginFormCodegen 中同名局部变量一一对应。
 */
export interface LoginFormScriptVars {
  c: Record<string, unknown>;
  cid: string;
  authMode: string;
  apiUrl: string;
  method: string;
  userField: string;
  tokenStorage: string;
  tokenKey: string;
  tokenHeader: string;
  tokenPrefix: string;
  refreshEnabled: boolean;
  refreshThreshold: number;
  refreshEndpointPath: string;
  refreshEndpointMethod: string;
  validationCodePath: string;
  validationMsgPath: string;
  validationSuccessCodes: number[];
  validationMsgFallback: string;
  headerConfigsJson: string;
  endpointsJson: string;
  initiallyHidden: boolean;
  usernameLabelColor: string;
  usernameFocusColor: string;
  usernameFontSize: number;
  passwordFontSize: number;
  showTenantField: boolean;
  tenantRequired: boolean;
  tenantHeaderName: string;
  tenantDefaultValue: string;
  showCaptcha: boolean;
  captchaEndpoint: string;
  loginType: string;
  smsCodeLength: number;
  smsButtonText: string;
  smsEndpoint: string;
  smsCooldown: number;
  useDynamicParams: boolean;
  authParams: Array<{ id: string; key: string; label: string; value: string; location: string; required: boolean; isSecret?: boolean; description?: string }>;
  authParamsJson: string;
  escapeHTML: (str: string) => string;
}
