/**
 * 文件上传字段（form-file）口径文件——发布端与编辑区**共用同一批函数对象**。
 *
 * 为什么收口：form-file 的「drop 过滤 + 回填 + 大小格式化 + 拒绝提示」逻辑原来只在
 * codegen 脚本里手写一份、编辑区 React 里另写一份，正是「两端必漂移」的高危模式；
 * 且旧 drop 用 `i.files = e.dataTransfer.files` 直接赋值，在 WKWebView/Safari（预览
 * 窗口引擎）上并不可靠，失败还被 `catch(err){}` 静默吞掉。此文件统一为：
 *
 * 1. 四个**自包含**纯函数（不得引用本模块其它导出或任何模块作用域标识符，否则构建
 *    器重命名后 toString() 内联进产物即成未定义引用）——codegen 用 `toString()` 内联，
 *    编辑区直接 import。
 * 2. `ffSetInputFiles` 用 `new DataTransfer()` 重建 FileList（Safari 14.1+/全现代引擎
 *    可用），失败降级直赋——拖拽回填在预览窗口不再静默失效。
 * 3. drop / 原生选择两条路径都过 `ffPickFiles`：accept 类型、multiple、数量上限、
 *    单个大小上限（原生弹窗只认 accept，大小/数量必须自己做）。
 * 4. `fileFieldScript` 是发布端唯一脚本来源：DOM 回显/删除/拖拽绑定 + 上述函数内联。
 */

/**
 * 按口径过滤一批文件，返回 { kept, rejected }（自包含；accept 匹配逻辑**内联在本函数体内**，
 * 勿拆成模块级助手——否则构建器重命名后 toString() 内联即成未定义引用）。
 * 顺序：类型 → 大小 → 数量；rejected.reason ∈ "type" | "size" | "count"。
 *
 * @param list FileList 或 File[]（鸭子类型：length + 下标）
 * @param accept 原生 accept 语法串（空串不限）：".pdf" 后缀 / "image/*" 通配 MIME / "text/plain" 精确 MIME
 * @param multiple 是否允许多选（false 时只保留第一个，其余记 "count"）
 * @param maxCount 数量上限（<=0 不限；仅 multiple 时有意义）
 * @param maxFileSizeMB 单个大小上限 MB（<=0 不限）
 */
export function ffPickFiles(
  list: { length: number } & Record<number, File> | null,
  accept: string,
  multiple: boolean,
  maxCount: number,
  maxFileSizeMB: number,
): { kept: File[]; rejected: { name: string; reason: string }[] } {
  var spec = String(accept || "").trim();
  var kept: File[] = [];
  var rejected: { name: string; reason: string }[] = [];
  if (!list) return { kept: kept, rejected: rejected };
  var cnt = maxCount > 0 ? Math.floor(maxCount) : 0;
  var lim = maxFileSizeMB > 0 ? maxFileSizeMB * 1024 * 1024 : 0;
  var n = list.length ? list.length : 0;
  for (var k = 0; k < n; k++) {
    var f = list[k];
    if (!f) continue;
    if (spec) {
      var nm = String(f.name || "").toLowerCase();
      var tp = String(f.type || "").toLowerCase();
      var parts = spec.split(",");
      var ok = false;
      for (var p = 0; p < parts.length; p++) {
        var it = parts[p].trim().toLowerCase();
        if (!it) continue;
        if (it.charAt(0) === ".") { if (nm.length >= it.length && nm.slice(-it.length) === it) { ok = true; break; } }
        else if (it.charAt(it.length - 1) === "*") { var pre = it.slice(0, -1); if (tp && tp.indexOf(pre) === 0) { ok = true; break; } }
        else if (tp && tp === it) { ok = true; break; }
      }
      if (!ok) { rejected.push({ name: f.name, reason: "type" }); continue; }
    }
    if (lim && f.size > lim) { rejected.push({ name: f.name, reason: "size" }); continue; }
    if (!multiple) {
      if (kept.length === 0) kept.push(f); else rejected.push({ name: f.name, reason: "count" });
      continue;
    }
    if (cnt && kept.length >= cnt) { rejected.push({ name: f.name, reason: "count" }); continue; }
    kept.push(f);
  }
  return { kept: kept, rejected: rejected };
}

/** 文件大小格式化（自包含）：B / KB / MB / GB / TB，>=100 取整否则 1 位小数。 */
export function ffFormatSize(bytes: number): string {
  var n = Number(bytes);
  if (!(n >= 0)) n = 0;
  if (n < 1024) return Math.round(n) + " B";
  var u = ["KB", "MB", "GB", "TB"];
  var v = n;
  var i = -1;
  do { v = v / 1024; i++; } while (v >= 1024 && i < u.length - 1);
  return (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10) + " " + u[i];
}

/** 拒绝清单 → 用户提示文案（自包含）；空清单返回空串。 */
export function ffRejectText(items: { name: string; reason: string }[] | null): string {
  if (!items || !items.length) return "";
  var labels: Record<string, string> = { type: "类型不符", size: "超过大小限制", count: "超出数量限制" };
  var byReason: Record<string, number> = {};
  for (var j = 0; j < items.length; j++) {
    var r = items[j].reason;
    byReason[r] = (byReason[r] || 0) + 1;
  }
  var parts: string[] = [];
  for (var key in byReason) parts.push((labels[key] || key) + " " + byReason[key] + " 个");
  var names: string[] = [];
  var show = items.slice(0, 3);
  for (var k = 0; k < show.length; k++) names.push(show[k].name);
  return "已忽略 " + items.length + " 个文件（" + parts.join("、") + "）：" + names.join("、") + (items.length > 3 ? " 等" : "");
}

/** 用 DataTransfer 把 files 写回 input.files（自包含）；Safari/WKWebView 可靠回填的唯一写法。 */
export function ffSetInputFiles(input: HTMLInputElement, files: File[]): void {
  try {
    var dt = new DataTransfer();
    for (var k = 0; k < files.length; k++) dt.items.add(files[k]);
    input.files = dt.files;
    return;
  } catch (_e) { /* 降级直赋 */ }
  try { (input as unknown as { files: FileList }).files = files as unknown as FileList; } catch (_e2) { /* 放弃 */ }
}

/** 发布端运行时脚本配置（进 <script> 的 JSON，只含过滤口径，不含样式）。 */
export interface FileFieldCfg {
  accept: string;
  multiple: boolean;
  maxCount: number;
  maxFileSizeMB: number;
}

/**
 * 拖放区圆角（面板值按**像素**生效，封顶 24）。
 *
 * 为什么不吃表单族的 `×10` 口径：该口径是为细长输入条设计的（面板 8 → 输入条 80px 圆角），
 * form-file 的拖放区是一大块面，默认 96px 高吃 80px 圆角就成了胶囊——用户实测反馈
 * "看起来像按钮"。大块面区域按像素语义最直观，封顶避免再次出现胶囊形。
 */
export function ffZoneRadius(borderRadius: unknown): number {
  const n = Number(borderRadius);
  if (!(n >= 0)) return 8;
  return Math.min(n, 24);
}

/** 拖放区中央上传图标（cloud-upload，MUI CloudUpload 同款路径）。 */
export const FF_ZONE_ICON_PATH =
  "M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z";

/** 生成拖放区图标 SVG 字符串（发布端 innerHTML / 编辑区 dangerouslySetInnerHTML 共用同一函数）。 */
export function ffZoneIconSvg(size: number, color: string): string {
  const s = Math.max(12, Math.round(size));
  return (
    `<svg class="ff-zone-icon" viewBox="0 0 24 24" width="${s}" height="${s}" fill="${color}" ` +
    `aria-hidden="true" focusable="false" style="display:block"><path d="${FF_ZONE_ICON_PATH}"/></svg>`
  );
}

/**
 * 发布端唯一脚本来源：change 重过滤、drop 过滤回填、文件列表渲染与单个删除、
 * 拒绝提示、has-val 切换。四个纯函数以 `toString()` 内联（两端同源）。
 *
 * 依赖的 DOM 结构（formFileCodegen 保证）：
 * - `#${uid}`      隐藏 file input（视觉隐藏、可聚焦）
 * - `#${uid}l`     文件列表容器 `.ff-list`
 * - `#${uid}e`     拒绝提示元素 `.ff-err`
 * - `.fzone`       拖放区 label（input 最近祖先）
 */
export function fileFieldScript(uid: string, cfg: FileFieldCfg): string {
  const cfgJson = JSON.stringify({
    a: String(cfg.accept ?? ""),
    m: cfg.multiple === true,
    c: Math.max(0, Math.floor(Number(cfg.maxCount) || 0)),
    s: Math.max(0, Number(cfg.maxFileSizeMB) || 0),
  }).replace(/</g, "\\u003c");
  return `<script>;(function(){
var i=document.getElementById('${uid}');if(!i)return;
var doc=i.ownerDocument||document;
var z=i.closest?i.closest('.fzone'):null;
var L=document.getElementById('${uid}l');
var E=document.getElementById('${uid}e');
var w=i.parentElement?i.parentElement.parentElement:null;
var pick=(${ffPickFiles.toString()});
var fmt=(${ffFormatSize.toString()});
var rtext=(${ffRejectText.toString()});
var setf=(${ffSetInputFiles.toString()});
var CFG=${cfgJson};
function syncErr(items){if(!E)return;var t=rtext(items);if(t){E.textContent=t;E.style.display='block';}else{E.textContent='';E.style.display='none';}}
function render(fs){fs=fs||[];if(w)w.classList.toggle('has-val',fs.length>0);if(!L)return;while(L.firstChild)L.removeChild(L.firstChild);for(var k=0;k<fs.length;k++){(function(f,idx){var row=doc.createElement('div');row.className='ff-item';var nm=doc.createElement('span');nm.className='ff-file';nm.textContent=f.name;var sz=doc.createElement('span');sz.className='ff-size';sz.textContent=fmt(f.size);var b=doc.createElement('button');b.type='button';b.className='ff-del';b.setAttribute('aria-label','移除 '+f.name);b.textContent='×';b.addEventListener('click',function(ev){ev.preventDefault();ev.stopPropagation();if(i.disabled)return;var cur=[];var cfs=i.files||[];for(var q=0;q<cfs.length;q++)cur.push(cfs[q]);cur.splice(idx,1);commit(cur,[]);});row.appendChild(nm);row.appendChild(sz);row.appendChild(b);L.appendChild(row);})(fs[k],k);}}
function commit(kept,rejected){setf(i,kept);render(kept);syncErr(rejected);selfChange=true;i.dispatchEvent(new Event('change',{bubbles:true}));selfChange=false;}
var selfChange=false;
i.addEventListener('change',function(){if(selfChange)return;var fs=i.files||[];var res=pick(fs,CFG.a,CFG.m,CFG.c,CFG.s);if(res.rejected.length){commit(res.kept,res.rejected);}else{syncErr([]);render(fs);}});
if(z&&!i.disabled){['dragenter','dragover'].forEach(function(ev){z.addEventListener(ev,function(e){e.preventDefault();z.classList.add('fdrag');});});['dragleave','dragend'].forEach(function(ev){z.addEventListener(ev,function(){z.classList.remove('fdrag');});});z.addEventListener('drop',function(e){e.preventDefault();z.classList.remove('fdrag');var dt=e.dataTransfer;var fs=dt&&dt.files?dt.files:null;if(!fs||!fs.length)return;var res=pick(fs,CFG.a,CFG.m,CFG.c,CFG.s);if(res.kept.length){commit(res.kept,res.rejected);}else{syncErr(res.rejected);}});}
render(i.files||[]);syncErr([]);
})();</script>`;
}
