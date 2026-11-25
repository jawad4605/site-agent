// Guarantees the site's menu stays reachable: if the generated header scrolls away,
// this tiny script pins it to the top and makes menu links land below it.
// It's added to every page (preview, live link, GitHub/Vercel export) and does nothing
// when the header is already sticky or fixed.
export const NAV_GUARD = String.raw`<script data-siteagent="nav-guard">(function(){
var h,fixedDone=false;
function solidBg(){
  var bg=getComputedStyle(h).backgroundColor;
  if(!bg||bg==='transparent'||/rgba\(.*,\s*0\)$/.test(bg)){
    var b=getComputedStyle(document.body).backgroundColor;
    h.style.backgroundColor=(b&&b!=='rgba(0, 0, 0, 0)'&&b!=='transparent')?b:'#ffffff';
  }
}
function pad(){var hh=Math.round(h.getBoundingClientRect().height)+12;var s=document.getElementById('sa-nav-pad')||document.createElement('style');s.id='sa-nav-pad';s.textContent='html{scroll-behavior:smooth}[id]{scroll-margin-top:'+hh+'px}';document.head.appendChild(s);}
// Last resort that always works: pin with position:fixed and keep its space with a placeholder.
function makeFixed(){
  if(fixedDone)return;fixedDone=true;
  var r=h.getBoundingClientRect();
  var ph=document.createElement('div');ph.style.height=h.offsetHeight+'px';ph.setAttribute('aria-hidden','true');
  h.parentNode.insertBefore(ph,h);
  h.style.position='fixed';h.style.top='0';h.style.left=Math.max(0,r.left+window.scrollX)+'px';h.style.width=r.width+'px';
  h.style.zIndex='1000';h.style.margin='0';
  solidBg();pad();
}
function check(){
  // after scrolling past it, is the menu still on screen? if not, pin it.
  if(fixedDone||!h)return;
  if(window.scrollY>h.offsetHeight+40&&h.getBoundingClientRect().bottom<=4)makeFixed();
}
function run(){
  h=document.querySelector('body > header, header, body > nav, nav, [class*="navbar"], [class*="nav-bar"]');
  if(!h)return;
  if(h.getBoundingClientRect().top+window.scrollY>160)return; // the menu isn't at the top of the page
  var pos=getComputedStyle(h).position;
  if(pos!=='fixed'&&pos!=='sticky'){
    // sticky breaks inside overflow:hidden parents or short wrappers; check() falls back to fixed
    h.style.position='sticky';h.style.top='0';h.style.zIndex='1000';solidBg();
  }
  pad();
  window.addEventListener('scroll',check,{passive:true});
  window.addEventListener('resize',function(){if(fixedDone){h.style.width='';var r=h.parentNode.getBoundingClientRect();h.style.width=r.width+'px';}});
  check();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
})();</script>`;

export function ensureNavGuard(html: string): string {
  if (html.includes('data-siteagent="nav-guard"')) return html;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${NAV_GUARD}</body>`) : html + NAV_GUARD;
}
