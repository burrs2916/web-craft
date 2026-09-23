/**
 * 发布页面"宽度铺满适配视口 + 消横向滚动"脚本生成器。
 *
 * 所有发布产物（static-html / vue / react / angular 脚手架，以及 engine 直出 HTML）
 * 的页面都由固定像素画布（design-width × design-height）承载绝对定位组件，
 * 无法用 flex 流式重排。该脚本在浏览器端把页面容器按
 *
 *   scale = 视口宽 / 设计宽
 *
 * 等比缩放并居中，宽度始终铺满浏览器视口：窄屏缩小铺满、宽屏放大铺满。
 * 这样在宽屏显示器上打开时，画布（含背景）占满浏览器宽度，不再 1920 居中留边。
 *
 * 关键点：
 *  - `transform: scale()` 只改变视觉尺寸，不改元素排版宽度，因此文档可能出现
 *    横向/纵向滚动。这里显式把 html 横向溢出隐藏（内容宽度已铺满，无需左右滑动），
 *    高度按内容×scale 撑高，超出视口的部分正常纵向滚动。
 *  - 高度补偿取 scrollHeight × scale，使内容高度超出画布时也正常显示、不裁剪。
 *  - 触发时机：DOMContentLoaded / 立即 / resize；对 SPA（vue/react/angular 路由懒挂载）
 *    另用 MutationObserver 观察 body 子树，路由切换后自动重新适配。
 *
 * 约定：每个页面容器元素 .page 需带 `data-design-width` 与 `data-design-height`。
 */
export function buildViewportFitScript(): string {
  return [
    `(function(){`,
    `  var html=document.documentElement;`,
    `  function fit(){`,
    `    if(html){ html.style.overflowX='hidden'; }`,
    `    var pages=document.querySelectorAll('.page');`,
    `    for(var i=0;i<pages.length;i++){`,
    `      var p=pages[i];`,
    `      var dw=parseInt(p.getAttribute('data-design-width')||'1920',10)||1920;`,
    `      var vw=window.innerWidth||Math.max(html?html.clientWidth:1,1);`,
    `      // 宽度铺满：宽屏放大、窄屏缩小，画布始终铺满浏览器宽度`,
    `      var s=vw/dw;`,
    `      p.style.margin='0 auto';`,
    `      // 缩放机制 = zoom（参与布局）。此前用 transform:scale：它只影响绘制，原生弹层`,
    `      // （<input type=date|time> 的拾取器等）仍按**未缩放的布局坐标**锚定，字段越靠下错位越大`,
    `      // （偏移 = 位置×(s−1)，<select> 因此早已改自绘弹层）。zoom 与浏览器缩放同一机制，`,
    `      // 弹层坐标跟着缩放走，从机制上消灭此类错位。已实测两者可视几何逐像素一致，且`,
    `      // offsetWidth/scrollHeight 仍为设计坐标（select 自绘弹层的 scaleOf()=rect/offsetWidth 不受影响）。`,
    `      // 不支持 zoom 的老浏览器回退 transform（旧行为）。`,
    `      if (p.style && typeof p.style.zoom !== 'undefined') {`,
    `        p.style.zoom=String(s);`,
    `      } else {`,
    `        p.style.transformOrigin='top center';`,
    `        p.style.transform='scale('+s+')';`,
    `      }`,
    `      var w=p.parentElement;`,
    `      if(w&&s>0){`,
    `        var h=Math.ceil((p.scrollHeight||0)*s);`,
    `        w.style.height=Math.max(h,1)+'px';`,
    `        w.style.overflowX='hidden';`,
    `      }`,
    `    }`,
    `  }`,
    `  var rafId=0;`,
    `  function schedule(){ if(rafId)return; rafId=requestAnimationFrame(function(){ rafId=0; fit(); }); }`,
    `  var tries=0;`,
    `  function boot(){`,
    `    fit();`,
    `    if(!document.querySelector('.page')&&tries<60){ tries++; setTimeout(boot,120); return; }`,
    `    tries=0;`,
    `  }`,
    `  window.addEventListener('resize',schedule);`,
    `  if(typeof MutationObserver==='function'&&document.body){`,
    `    new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});`,
    `  }`,
    `  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded',boot); } else { boot(); }`,
    `})();`,
  ].join("\n");
}