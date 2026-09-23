import { describe, test, expect } from "vitest";
import { generateHTML } from "../engine";
import { initBuiltinCodegens } from "../components";
import type { SceneDSL } from "../../types/scene";
import { DEFAULT_CANVAS_CONFIG } from "../../store/editorStore";
import { createDefaultTransform } from "../../types/editor";

describe("auth codegen universalization", () => {
  test("content-type config, oauth/sso response fields, and emitted JS parses", () => {
    initBuiltinCodegens();

    const mkComp = (type: string, config: Record<string, unknown>, id: string) => ({
      id,
      type,
      name: type,
      transform: createDefaultTransform({ x: 10, y: 10, width: 360, height: 120 }),
      layerId: "l1",
      zIndex: 0,
      locked: false,
      visible: true,
      config,
    });

    const scene: SceneDSL = {
      id: "t",
      name: "t",
      status: "draft",
      tags: [],
      metadata: {},
      createdAt: 0,
      updatedAt: 0,
      canvasConfig: { ...DEFAULT_CANVAS_CONFIG, width: 800, height: 600 },
      views: [
        {
          id: "v1",
          name: "Home",
          layers: [],
          components: [
            mkComp("auth-login-form", {
              authMode: "jwt",
              apiUrl: "/api/login",
              showAdvanced: true,
              endpoints: [
                { id: "ep_login", name: "login", endpointType: "login", path: "/api/login", method: "POST", contentType: "form" },
              ],
              authParams: [
                { id: "p1", key: "username", label: "用户名", value: "admin", location: "body", required: true },
                { id: "p2", key: "password", label: "密码", value: "x", location: "body", required: true, isSecret: true },
              ],
              tokenField: "token",
              tokenKey: "auth_token",
            }, "login1"),
            mkComp("auth-oauth-button", {
              tokenEndpoint: "https://example.com/token?client=web",
              redirectUri: "https://example.com/callback",
              tokenField: "data.access_token",
              refreshTokenField: "data.refresh_token",
              expiresInField: "data.expires_in",
              tokenKey: "auth_token",
              tokenStorage: "localStorage",
            }, "oauth1"),
            mkComp("auth-sso-button", {
              tokenEndpoint: "https://sso.example.com/token",
              redirectUri: "https://example.com/cb",
              tokenField: "credential",
              refreshTokenField: "data.refresh",
              expiresInField: "data.exp",
              protocol: "oidc",
              tokenKey: "auth_token",
              tokenStorage: "localStorage",
            }, "sso1"),
          ],
        },
      ],
    };

    const pages = generateHTML(scene, { framework: "static-html", preview: true });
    const html = (Array.isArray(pages) ? pages.map((f) => f.html ?? "").join("\n") : String(pages)) as string;

    // v7 请求内容类型
    expect(html).toContain("encodeAuthBody");
    expect(html).toContain("application/x-www-form-urlencoded");
    // v7 OAuth 回调字段（配置驱动，内联 JS 用真实引号而非 &quot;）
    expect(html).toContain("oauthResolveToken");
    expect(html).toContain('var TOKEN_FIELD = "data.access_token"');
    expect(html).not.toContain("&quot;");
    // v7 SSO 回调字段
    expect(html).toContain("ssoResolveToken");
    expect(html).toContain('var REFRESH_FIELD = "data.refresh"');

    // 关键：生成的每个内联 <script> 都必须能通过 JS 语法解析
    // （回归：getNested 函数头丢失、toJsString 错误使用 escapeHTML 都会在此失败）
    const scriptRe = /<script[^>]*>([\s\S]*?)<\/script>/g;
    let parsed = 0;
    let m: RegExpExecArray | null;
    while ((m = scriptRe.exec(html)) !== null) {
      const body = m[1];
      if (body.trim()) {
        new Function(body);
        parsed += 1;
      }
    }
    expect(parsed).toBeGreaterThan(0);
  });
});