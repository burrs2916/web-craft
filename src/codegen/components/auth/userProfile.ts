import type { ComponentCodegenFn } from "../../types";
import { escapeHTML } from "../../layout";

/**
 * auth-user-profile 组件 → HTML
 *
 * 配置：showAvatar, showName, showRole, showEmail, avatarSize, fontSize,
 *        nameField, avatarField, roleField, emailField, bgColor, textColor,
 *        avatarBgColor, layout(horizontal/vertical), placeholderName, placeholderText
 *
 * 发布产物中：从 localStorage 读取 user 信息，监听 auth-state-change 更新
 */
export const userProfileCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;
  const showAvatar = Boolean(c.showAvatar ?? true);
  const showName = Boolean(c.showName ?? true);
  const showRole = Boolean(c.showRole ?? false);
  const showEmail = Boolean(c.showEmail ?? false);
  const avatarSize = Number(c.avatarSize ?? 40);
  const fontSize = Number(c.fontSize ?? 14);
  const nameField = String(c.nameField ?? "name");
  const avatarField = String(c.avatarField ?? "avatar");
  const roleField = String(c.roleField ?? "role");
  const emailField = String(c.emailField ?? "email");
  const bgColor = String(c.bgColor ?? "transparent");
  const textColor = String(c.textColor ?? "#333333");
  const avatarBgColor = String(c.avatarBgColor ?? "#1976d2");
  const layout = String(c.layout ?? "horizontal");
  const placeholderName = String(c.placeholderName ?? "未登录");

  // v5 动态用户信息展示配置
  const userDisplayConfigRaw = c.userDisplayConfig as Array<{
    cacheKey: string; objectPath?: string; displayType: string; customLabel?: string;
  }> | undefined;
  const userDisplayConfig = userDisplayConfigRaw ?? [];
  const useDynamicProfile = userDisplayConfig.length > 0;
  const userDisplayConfigJson = JSON.stringify(userDisplayConfig);

  const wrapperId = `user-profile-${component.id}`;

  const layoutStyle = layout === "vertical"
    ? "flex-direction:column;align-items:center;text-align:center"
    : "flex-direction:row;align-items:center";

  let html = `<div id="${wrapperId}" style="width:100%;height:100%;display:flex;${layoutStyle};background:${bgColor};color:${textColor};padding:8px;box-sizing:border-box">`;

  // v5: 动态模式下也显示 avatar
  if (useDynamicProfile || showAvatar) {
    html += `<div id="${wrapperId}-avatar" style="width:${avatarSize}px;height:${avatarSize}px;border-radius:50%;background:${avatarBgColor};display:flex;align-items:center;justify-content:center;color:#fff;font-size:${avatarSize * 0.4}px;font-weight:bold;flex-shrink:0;margin-right:${layout === "horizontal" ? "12px" : "0"};margin-bottom:${layout === "vertical" ? "8px" : "0"};overflow:hidden"><svg width="${avatarSize * 0.5}" height="${avatarSize * 0.5}" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></div>`;
  }

  const infoStyle = layout === "vertical" ? "text-align:center" : "flex:1;min-width:0";
  html += `<div id="${wrapperId}-info" style="${infoStyle}">`;

  if (useDynamicProfile) {
    // v5: 动态生成展示元素
    html += `<div id="${wrapperId}-name" style="font-size:${fontSize}px;font-weight:600;color:${textColor};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHTML(placeholderName)}</div>`;
    html += `<div id="${wrapperId}-extra" style="display:flex;flex-direction:column;gap:2px"></div>`;
  } else {
    // v1: 硬编码模式
    if (showName) {
      html += `<div id="${wrapperId}-name" style="font-size:${fontSize}px;font-weight:600;color:${textColor};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHTML(placeholderName)}</div>`;
    }
    if (showRole) {
      html += `<div id="${wrapperId}-role" style="font-size:${fontSize - 2}px;color:#999;margin-top:2px"></div>`;
    }
    if (showEmail) {
      html += `<div id="${wrapperId}-email" style="font-size:${fontSize - 2}px;color:#999;margin-top:2px"></div>`;
    }
  }
  html += `</div>`;

  html += `</div>`;

  // ─── 注入用户信息更新逻辑 ───
  const profileScript = `
(function() {
  var wrapper = document.getElementById("${wrapperId}");
  var avatarEl = document.getElementById("${wrapperId}-avatar");
  var nameEl = document.getElementById("${wrapperId}-name");
  var extraEl = document.getElementById("${wrapperId}-extra");
  var roleEl = document.getElementById("${wrapperId}-role");
  var emailEl = document.getElementById("${wrapperId}-email");

  var USE_DYNAMIC = ${useDynamicProfile};
  var DISPLAY_CONFIG = ${userDisplayConfigJson};
  var TOKEN_KEY = window.__WC_TOKEN_KEY || "${String(c.tokenKey ?? "auth_token")}";
  var TOKEN_STORAGE = window.__WC_TOKEN_STORAGE || "${String(c.tokenStorage ?? "localStorage")}";

  function getStorage() {
    if (typeof window === "undefined") return null;
    if (TOKEN_STORAGE === "localStorage") return window.localStorage;
    if (TOKEN_STORAGE === "sessionStorage") return window.sessionStorage;
    return null;
  }

  function getNested(obj, path) {
    if (!obj || !path) return undefined;
    var keys = path.split(".");
    var cur = obj;
    for (var i = 0; i < keys.length; i++) {
      if (cur === null || cur === undefined) return undefined;
      cur = cur[keys[i]];
    }
    return cur;
  }

  var memoryCache = window.__webcraft_memory_cache = window.__webcraft_memory_cache || {};
  function getCachedValue(key) {
    if (memoryCache[key] !== undefined) return memoryCache[key];
    var storage = getStorage();
    if (!storage) return null;
    var val = storage.getItem(key);
    if (val !== null) memoryCache[key] = val;
    return val;
  }

  function showGuestAvatar() {
    if (!avatarEl) return;
    avatarEl.innerHTML = '<svg width="' + (${avatarSize} * 0.5) + '" height="' + (${avatarSize} * 0.5) + '" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';
  }

  function updateProfile(user) {
    if (!user) {
      if (nameEl) nameEl.textContent = ${JSON.stringify(placeholderName)};
      showGuestAvatar();
      if (extraEl) extraEl.innerHTML = "";
      return;
    }

    if (USE_DYNAMIC) {
      // v5: 从缓存读取用户信息
      var displayName = ${JSON.stringify(placeholderName)};
      var avatarUrl = null;
      var avatarFound = false; // P2-2: 只取第一条 avatar
      var extraHtml = "";

      DISPLAY_CONFIG.forEach(function(cfg) {
        // P0-2: cacheKey 作为 storage key 读取缓存值
        var val = getCachedValue(cfg.cacheKey);
        // P0-2: objectPath 作为对象嵌套路径（留空回退到 cacheKey）
        if (!val) {
          var path = cfg.objectPath || cfg.cacheKey;
          var nested = getNested(user, path);
          if (nested !== undefined && nested !== null) val = String(nested);
        }
        if (!val) return;

        if (cfg.displayType === "avatar") {
          // P2-2: 只取第一条 avatar
          if (!avatarFound) {
            avatarUrl = val;
            avatarFound = true;
          }
        } else if (cfg.displayType === "name") {
          displayName = val;
        } else if (cfg.displayType !== "none") {
          var label = cfg.customLabel ? (cfg.customLabel + ": ") : "";
          extraHtml += '<div style="font-size:' + (${fontSize} - 2) + 'px;color:#999;margin-top:2px">' + label + escapeHtml(val) + '</div>';
        }
      });

      if (nameEl) nameEl.textContent = displayName;
      if (extraEl) extraEl.innerHTML = extraHtml;
      if (avatarEl) {
        if (avatarUrl) {
          avatarEl.innerHTML = '<img src="' + avatarUrl + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%" />';
        } else {
          var initials = String(displayName).charAt(0).toUpperCase();
          if (initials) {
            avatarEl.textContent = initials;
          } else {
            showGuestAvatar();
          }
        }
      }
    } else {
      // v1: 硬编码模式
      var name = getNested(user, "${nameField}") || getNested(user, "username") || ${JSON.stringify(placeholderName)};
      var avatar = getNested(user, "${avatarField}");
      var role = getNested(user, "${roleField}");
      var email = getNested(user, "${emailField}");

      if (nameEl) nameEl.textContent = String(name);
      if (avatarEl) {
        if (avatar) {
          avatarEl.innerHTML = '<img src="' + avatar + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%" />';
        } else {
          var initials = String(name).charAt(0).toUpperCase();
          if (initials) {
            avatarEl.textContent = initials;
          } else {
            showGuestAvatar();
          }
        }
      }
      if (roleEl) roleEl.textContent = role ? String(role) : "";
      if (emailEl) emailEl.textContent = email ? String(email) : "";
    }
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

  // 初始加载：从可配置 storage 读取，并检查 authenticated 标志
  try {
    var storage = getStorage();
    if (storage) {
      var isAuth = storage.getItem("__webcraft_auth_authenticated") === "true";
      if (isAuth) {
        var userStr = storage.getItem("__webcraft_auth_user");
        if (userStr) {
          updateProfile(JSON.parse(userStr));
        }
      }
    }
  } catch(e) {}

  // 监听认证状态变化
  window.addEventListener("auth-state-change", function(e) {
    var detail = e.detail || {};
    if (detail.user) {
      updateProfile(detail.user);
    } else if (detail.isAuthenticated === false) {
      // 登出：重置为未登录态
      if (nameEl) nameEl.textContent = ${JSON.stringify(placeholderName)};
      showGuestAvatar();
      if (extraEl) extraEl.innerHTML = "";
    } else if (detail.isAuthenticated === true) {
      // 登录成功但 detail 中无 user 对象（如 refresh），从 storage 读取
      try {
        var storage = getStorage();
        if (storage) {
          var userStr = storage.getItem("__webcraft_auth_user");
          if (userStr) updateProfile(JSON.parse(userStr));
        }
      } catch(e) {}
    }
  });
})();
`;

  ctx.pageScripts.push(profileScript);

  return html;
};
