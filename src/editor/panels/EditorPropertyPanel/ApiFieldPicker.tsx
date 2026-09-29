import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';

import { fieldSx, floatedLabelProps } from '../property/sharedStyles';

// ─── API 字段识别面板（type: "api-field-picker"） ───
// 读取 config 中 API 配置 → 获取返回数据 → 递归枚举字段 →
// 自动识别疑似图片/名称字段（URL/扩展名/字段名提示）→ 勾选写入 avatarField/nameField
interface ApiFieldEntry {
  path: string;
  type: string;
  sample: string;
}

const APFP_IMAGE_URL_RE = /^(https?:)?\/\/|^data:image\//i;
const APFP_IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|avif|bmp)(\?|#|$)/i;
const APFP_IMAGE_NAME_RE = /(avatar|photo|picture|headimg|head|img|icon|image|face|portrait|thumb|logo)/i;
const APFP_NAME_RE = /(^|\.)(name|nickname|nick|username|user_name|displayname|display_name|fullname|full_name|realname|real_name|login|account)(\.|$)/i;

function flattenApiFields(obj: unknown, prefix: string, out: ApiFieldEntry[], depth: number): void {
  if (obj === null || typeof obj !== "object" || depth > 4) return;
  if (Array.isArray(obj)) {
    if (obj.length > 0) flattenApiFields(obj[0], prefix ? `${prefix}[0]` : "[0]", out, depth + 1);
    return;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object") {
      flattenApiFields(v, path, out, depth + 1);
    } else {
      out.push({ path, type: typeof v, sample: v === null || v === undefined ? "" : String(v).slice(0, 80) });
    }
  }
}

function isApiImageCandidate(f: ApiFieldEntry): boolean {
  if (f.type !== "string") return false;
  if (/^data:image\//i.test(f.sample)) return true;
  if (APFP_IMAGE_URL_RE.test(f.sample) && APFP_IMAGE_EXT_RE.test(f.sample.split(/[?#]/)[0])) return true;
  return APFP_IMAGE_NAME_RE.test(f.path);
}
function isApiNameCandidate(f: ApiFieldEntry): boolean {
  return f.type === "string" && APFP_NAME_RE.test(f.path);
}

function apiGetNested(obj: unknown, path: string): unknown {
  if (!obj || !path) return obj;
  const keys = path.replace(/\[(\d+)\]/g, ".$1").split(".");
  let cur: unknown = obj;
  for (const k of keys) {
    if (cur === null || cur === undefined) return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

export function ApiFieldPickerField({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  const apiUrl = String(config.apiUrl ?? "");
  const apiMethod = String(config.apiMethod ?? "GET") || "GET";
  const apiDataPath = String(config.apiDataPath ?? "");
  const authEnabled = config.authEnabled === true;
  // 组件自带的 Token 配置（defaultConfig 提供），无外部依赖（无侵入式）
  const tokenKey = String(config.tokenKey ?? "auth_token");
  const tokenStorage = String(config.tokenStorage ?? "localStorage");

  const avatarSel = String(config.avatarField ?? "");
  const nameSel = String(config.nameField ?? "");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<ApiFieldEntry[]>([]);

  const handleFetch = async () => {
    setError("");
    setLoading(true);
    try {
      // 完整地址直连 / 相对路径拼全局 baseUrl（与 __wc_buildUrl 同规则）
      let fullUrl = apiUrl;
      if (fullUrl && !/^https?:\/\//i.test(fullUrl)) {
        const win = window as unknown as Record<string, unknown>;
        const base = String(win.__WC_API_BASE ?? "");
        fullUrl = base ? base.replace(/\/+$/, "") + (fullUrl.startsWith("/") ? fullUrl : "/" + fullUrl) : fullUrl;
      }
      if (!fullUrl) {
        setError("请先填写 API 地址");
        return;
      }
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authEnabled) {
        // 与发布端 avatar.ts 同规则：窗口级全局 token 配置优先，否则用组件自带配置
        const win = window as unknown as Record<string, unknown>;
        const storage = String(win.__WC_TOKEN_STORAGE ?? tokenStorage);
        const key = String(win.__WC_TOKEN_KEY ?? tokenKey);
        const hname = String(win.__WC_TOKEN_HEADER ?? "Authorization");
        const prefix = win.__WC_TOKEN_PREFIX !== undefined ? String(win.__WC_TOKEN_PREFIX) : "Bearer ";
        let token: string | null = null;
        try {
          if (storage === "localStorage") token = localStorage.getItem(key);
          else if (storage === "sessionStorage") token = sessionStorage.getItem(key);
          else if (storage === "memory") token = String((win.__webcraft_memory_cache as Record<string, unknown> | undefined)?.[key] ?? "") || null;
        } catch {
          token = null;
        }
        if (token) headers[hname] = prefix + token;
      }
      const res = await fetch(fullUrl, { method: apiMethod, headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const target = apiDataPath ? apiGetNested(data, apiDataPath) : data;
      const out: ApiFieldEntry[] = [];
      flattenApiFields(target, "", out, 0);
      setFields(out);
      // 自动识别并勾选：识别出候选且对应字段尚未设置时，自动写入 avatarField/nameField
      const imgCand = out.find(isApiImageCandidate);
      const nameCand = out.find(isApiNameCandidate);
      if (!String(config.avatarField ?? "") && imgCand) onChange("avatarField", imgCand.path);
      if (!String(config.nameField ?? "") && nameCand) onChange("nameField", nameCand.path);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const imgCandCount = fields.filter(isApiImageCandidate).length;
  const nameCandCount = fields.filter(isApiNameCandidate).length;

  return (
    <Box>
      <Typography sx={{ fontSize: 10, color: 'text.secondary', mb: 0.25, fontWeight: 500 }}>API 字段识别</Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
        <Button size="small" variant="outlined" onClick={handleFetch} disabled={loading || !apiUrl} sx={{ fontSize: 10, minWidth: 0, px: 1 }}>
          {loading ? <CircularProgress size={10} sx={{ mr: 0.5 }} /> : null}
          {loading ? '获取中…' : '获取字段'}
        </Button>
        {!apiUrl && (
          <Typography sx={{ fontSize: 9, color: 'text.disabled' }}>请先填写上方 API 地址</Typography>
        )}
      </Box>

      {error && (
        <Typography sx={{ fontSize: 9.5, color: 'error.main', mb: 0.5, wordBreak: 'break-all' }}>
          获取失败：{error}（可改用下方手动填写字段路径）
        </Typography>
      )}

      {fields.length > 0 && (
        <Box sx={{ mb: 0.5 }}>
          <Typography sx={{ fontSize: 9, color: 'text.disabled', mb: 0.25 }}>
            共 {fields.length} 个字段 · 识别出 {imgCandCount} 个图片候选、{nameCandCount} 个名称候选（已自动勾选，点按钮可调整）
          </Typography>
          <Box sx={{ maxHeight: 180, overflowY: 'auto', border: 1, borderColor: 'divider', borderRadius: 0.75 }}>
            {fields.slice(0, 80).map((f) => {
              const isImg = isApiImageCandidate(f);
              const isName = isApiNameCandidate(f);
              const imgActive = avatarSel === f.path;
              const nameActive = nameSel === f.path;
              return (
                <Box key={f.path} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 0.5, py: 0.25, '&:hover': { bgcolor: 'action.hover' } }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 10, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.sample}>
                      {isImg && <Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'info.main', display: 'inline-block', mr: 0.5 }} />}
                      {isName && <Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'success.main', display: 'inline-block', mr: 0.5 }} />}
                      {f.path}
                    </Typography>
                    <Typography sx={{ fontSize: 8.5, color: 'text.disabled', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.sample || f.type}</Typography>
                  </Box>
                  <Button
                    size="small"
                    variant={imgActive ? 'contained' : 'outlined'}
                    color={imgActive ? 'primary' : 'inherit'}
                    onClick={() => onChange('avatarField', f.path)}
                    sx={{ fontSize: 9, minWidth: 42, px: 0.5 }}
                  >
                    图片
                  </Button>
                  <Button
                    size="small"
                    variant={nameActive ? 'contained' : 'outlined'}
                    color={nameActive ? 'secondary' : 'inherit'}
                    onClick={() => onChange('nameField', f.path)}
                    sx={{ fontSize: 9, minWidth: 42, px: 0.5 }}
                  >
                    名称
                  </Button>
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      {/* 手填兜底 */}
      <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
        <TextField size="small" label="图片字段" placeholder="如 avatar" value={avatarSel} onChange={(e) => onChange('avatarField', e.target.value)} sx={{ flex: 1, ...fieldSx }} slotProps={{ ...floatedLabelProps }} />
        <TextField size="small" label="名称字段" placeholder="如 name" value={nameSel} onChange={(e) => onChange('nameField', e.target.value)} sx={{ flex: 1, ...fieldSx }} slotProps={{ ...floatedLabelProps }} />
      </Box>
    </Box>
  );
}