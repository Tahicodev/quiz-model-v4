var QuizConsole=(()=>{var de="quizSession",$a="quizAuthToken",je="",He=null,ka=null;function it(e){ka=e}function on(){try{let e=sessionStorage.getItem(de)||localStorage.getItem(de),a=e?JSON.parse(e):null;if(a?.token)return a.token}catch{}return localStorage.getItem($a)||""}function Sa(){return je||(je=on(),je)}function cn(e){if(e){je=e;try{let a=sessionStorage.getItem(de)||localStorage.getItem(de),t=a?JSON.parse(a):null;if(t){t.token=e,sessionStorage.setItem(de,JSON.stringify(t));let n=localStorage.getItem(de),s=n?JSON.parse(n):null;s&&String(s.userId||"")===String(t.userId||"")&&String(s.role||"").toLowerCase()===String(t.role||"").toLowerCase()&&localStorage.setItem(de,JSON.stringify(t))}localStorage.setItem($a,e)}catch{}}}function ln(){je="";try{localStorage.removeItem(de),localStorage.removeItem($a),sessionStorage.removeItem(de)}catch{}}function ot(){return window.APP_CONFIG&&window.APP_CONFIG.apiUrl||"/api/v1"}async function dn(){return He||(He=fetch(`${ot()}/auth/refresh`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({portal:"admin"})}).then(async e=>{if(!e.ok)throw new Error(`Refresh failed (${e.status})`);let a=await e.json();if(!a?.accessToken)throw new Error("Refresh returned no token");return cn(a.accessToken),a.accessToken}).finally(()=>{He=null}),He)}var Xe=class extends Error{constructor(a,t,n,s){super(a),this.name="ApiError",this.status=t,this.code=n,this.fields=s||null}};async function pn(e){let a=null;try{a=await e.json()}catch{}let t=a?.error||{};return new Xe(t.message||a?.message||`Request failed (${e.status})`,e.status,t.code||a?.code||null,t.fields||null)}async function Ee(e,a={}){let{method:t="GET",body:n=null,query:s=null,retry:r=!0}=a,p=`${ot()}/${String(e).replace(/^\//,"")}`;if(s&&typeof s=="object"){let u=new URLSearchParams;for(let[m,g]of Object.entries(s))g==null||g===""||u.set(m,String(g));let d=u.toString();d&&(p+=`?${d}`)}let i={Accept:"application/json"},l=Sa();l&&(i.Authorization=`Bearer ${l}`),n!=null&&(i["Content-Type"]="application/json");let c=await fetch(p,{method:t,headers:i,credentials:"include",body:n==null?void 0:JSON.stringify(n)});if(c.status===401&&r){try{await dn()}catch{throw ln(),ka&&ka(),new Xe("Your session has ended. Please sign in again.",401,"UNAUTHORIZED")}return Ee(e,{...a,retry:!1})}if(!c.ok)throw await pn(c);return c.status===204?null:c.json()}var w={get:(e,a)=>Ee(e,{method:"GET",query:a}),post:(e,a)=>Ee(e,{method:"POST",body:a}),patch:(e,a)=>Ee(e,{method:"PATCH",body:a}),put:(e,a)=>Ee(e,{method:"PUT",body:a}),del:(e,a)=>Ee(e,{method:"DELETE",body:a})};var Y={session:null,permissions:new Set,deployment:{mode:"saas",isOffline:!1,isSaaS:!0,label:"Multi-tenant platform",description:"",dbProvider:"sqlite"},targetSchoolId:null,period:"30d",customRange:null},un=new Set;function ea(){for(let e of un)try{e(Y)}catch(a){console.error("[console] store listener failed",a)}}function ct(){return Y}function mn(e){return e?Y.permissions.has(e):!0}function Ta(e=[]){let a=Array.isArray(e)?e:[e];return a.length===0?!0:a.some(t=>mn(t))}function Aa(e){Y.targetSchoolId=e||null,ea()}function lt(e,a=null){Y.period=e,Y.customRange=a,ea()}async function dt(){let e=await w.get("console/session");return Y.session=e,Y.permissions=new Set(Array.isArray(e.permissions)?e.permissions:[]),e.deployment&&(Y.deployment={...Y.deployment,...e.deployment}),ea(),e}function pt(){Y.session=null,Y.permissions=new Set,Y.targetSchoolId=null,ea()}var ta=[],mt=null,ze=null,Be=null,qa=null;function ht(e,a={}){ta.length=0;for(let t of e)ta.push(t);mt=a.notFound||null}function ft(e){Be=e}function gt(e){qa=e}function aa(e){return e&&String(e).split("?")[0].replace(/^#/,"").replace(/\/+$/,"")||"/"}function hn(e){let a=aa(e);for(let t of ta)if(aa(t.path)===a)return t;for(let t of ta){if(!t.path.includes(":"))continue;let n=aa(t.path).split("/"),s=a.split("/");if(n.length!==s.length)continue;let r={},p=!0;for(let i=0;i<n.length;i+=1){let l=n[i];if(l.startsWith(":"))r[l.slice(1)]=decodeURIComponent(s[i]);else if(l!==s[i]){p=!1;break}}if(p)return{...t,params:r}}return null}function bt(){let a=(window.location.hash||"#/").slice(1)||"/",[t,n]=a.split("?"),s={};if(n)for(let[r,p]of new URLSearchParams(n))s[r]=p;return{path:aa(t),query:s}}function se(e,{replace:a=!1}={}){let t=e.startsWith("#")?e:`#${e}`;if(a)window.history.replaceState(null,"",t);else if(window.location.hash!==t){window.location.hash=t;return}La()}var Q=[];function ut(e){return String(e||"#/").replace(/^#/,"").split("?")[0]||"/"}function fn(e){let a=e||"#/",t=Q[Q.length-1];if(t&&ut(t)===ut(a)){Q[Q.length-1]=a;return}if(t===a)return;let n=Q.indexOf(a);if(n!==-1){Q.length=n+1;return}Q.push(a)}function gn(e){let a=String(e||"/").split("/").filter(Boolean);return a.length<2?null:a[0]==="users"?"/users":a[0]==="organizations"?"/organizations":null}function Ca(){if(Q.length>1)return Q[Q.length-2];let e=gn(bt().path);return e?`#${e}`:null}function vt(){let e=Ca();if(!e)return!1;if(Q.length>1){let a=Q.lastIndexOf(e);a!==-1&&(Q.length=a+1)}return se(e),!0}function La(){let{path:e,query:a}=bt(),t=hn(e)||mt;if(!t)return null;fn(window.location.hash);let n=t.permission?Array.isArray(t.permission)?t.permission:[t.permission]:[];return n.length&&qa&&!qa.canAny(n)?(ze={...t,id:t.id||"forbidden",title:"Access restricted",description:"Your role does not include this section.",forbidden:!0},Be&&Be(ze,{path:e,query:a}),ze):(ze={...t,path:e,query:a,params:t.params||{}},Be&&Be(ze,{path:e,query:a}),ze)}function yt(){return window.addEventListener("hashchange",()=>La()),La()}var _t={primary:"var(--ac-tone-1)",success:"var(--ac-tone-2)",warning:"var(--ac-tone-3)",danger:"var(--ac-tone-4)",info:"var(--ac-tone-5)",violet:"var(--ac-tone-6)",muted:"var(--ac-tone-7)"};function o(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;")}function wt(e){let a=Number(e);return Number.isFinite(a)?a:null}function xt(e,a=1){let t=wt(e);if(t==null)return null;let n=10**a;return Math.round((t+Number.EPSILON)*n)/n}function bn(e){let a=xt(e,1);return a==null?"\u2014":String(a)}function kt(e,a,t){return Math.min(t,Math.max(a,e))}function $t(e,a=28){let t=String(e??"");return t.length>a?`${t.slice(0,a-1)}\u2026`:t}function Ue(e){return _t[e]||_t.primary}function ne(e){return`<div class="ac-legend">${e.map(a=>`<span class="ac-legend__item"><i class="ac-legend__key" style="background:${Ue(a.tone)}"></i>${o(a.label)}</span>`).join("")}</div>`}function re({title:e,subtitle:a,body:t,action:n="",className:s=""}){return`<section class="ac-panel ${s}">
		<div class="ac-panel__header">
			<div class="ac-panel__titles">
				<h3 class="ac-panel__title">${o(e)}</h3>
				${a?`<p class="ac-panel__subtitle">${o(a)}</p>`:""}
			</div>
			${n?`<div class="ac-panel__actions">${n}</div>`:""}
		</div>
		<div class="ac-panel__body">${t}</div>
	</section>`}function S({label:e,value:a,note:t,tone:n="",trend:s="",tooltip:r="",href:p=""}){let i=p?"a":"div",l=p?` href="${o(p)}"`:"",c=["ac-kpi",n?`ac-kpi--${n}`:"",p?"ac-kpi--link":""].filter(Boolean).join(" ");return`<${i} class="${c}"${l}${r?` title="${o(r)}"`:""}>
		<p class="ac-kpi__label">${o(e)}</p>
		<p class="ac-kpi__value">${o(a)}</p>
		${t||s?`<p class="ac-kpi__meta">${s||""}${t?`<span>${o(t)}</span>`:""}</p>`:""}
	</${i}>`}function X({rows:e=[],value:a,max:t=null,label:n=l=>l.label,display:s=l=>bn(l),tone:r="primary",threshold:p=null,ariaLabel:i="Comparison"}){let l=(Array.isArray(e)?e:[]).filter(Boolean);if(!l.length)return"";let c=680,u=38,d=150,m=64,g=10,f=8,x=l.length*u+g+f,h=l.map(L=>Number(typeof a=="function"?a(L):L[a])||0),b=Math.max(t||0,...h,1),k=c-d-m,T=L=>d+kt(L,0,b)/b*k,q=p==null?"":`<line x1="${T(p)}" y1="${g-4}" x2="${T(p)}" y2="${x-f+2}" class="ac-chart__threshold"/>`,z=l.map((L,I)=>{let W=typeof a=="function"?a(L):L[a],be=wt(W),ve=g+I*u+14,ye=12,Le=be==null?0:Math.max(be>0?2:0,T(be)-d),xa=typeof r=="function"?r(L):r,De=s(W,L);return`<g>
				<title>${o(n(L))}: ${o(De)}</title>
				<text x="${d-10}" y="${ve+10}" text-anchor="end" class="ac-chart__label">${o($t(n(L),24))}</text>
				<rect x="${d}" y="${ve}" width="${k}" height="${ye}" rx="3" class="ac-chart__track"/>
				<rect x="${d}" y="${ve}" width="${Le}" height="${ye}" rx="3" fill="${Ue(xa)}" opacity="0.9"/>
				<text x="${c-m+8}" y="${ve+10}" class="ac-chart__value">${o(De)}</text>
			</g>`}).join("");return`<svg viewBox="0 0 ${c} ${x}" class="ac-chart ac-chart--bars" role="img" aria-label="${o(i)}">
		${q}${z}
	</svg>`}function St({rows:e=[],series:a=[],label:t=s=>s.label,ariaLabel:n="Comparison by group"}){let s=(Array.isArray(e)?e:[]).filter(Boolean);if(!s.length||!a.length)return"";let r=680,p=150,i=24,l=8,c=9,u=3,d=a.length*(c+u)+22,m=s.length*d+l+6,g=Math.max(1,...s.flatMap(h=>a.map(b=>Number(h[b.key])||0))),f=r-p-i,x=s.map((h,b)=>{let k=l+b*d,T=a.map((q,z)=>{let L=Number(h[q.key])||0,I=k+18+z*(c+u),W=L>0?Math.max(2,L/g*f):0;return`<g>
						<title>${o(t(h))} \xB7 ${o(q.label)}: ${L}</title>
						<rect x="${p}" y="${I}" width="${f}" height="${c}" rx="2" class="ac-chart__track"/>
						<rect x="${p}" y="${I}" width="${W}" height="${c}" rx="2" fill="${Ue(q.tone)}" opacity="0.9"/>
						<text x="${p+W+6}" y="${I+c-1}" class="ac-chart__value ac-chart__value--inline">${L}</text>
					</g>`}).join("");return`<g>
				<text x="${p-10}" y="${k+26}" text-anchor="end" class="ac-chart__label">${o($t(t(h),24))}</text>
				${T}
			</g>`}).join("");return`<svg viewBox="0 0 ${r} ${m}" class="ac-chart ac-chart--grouped" role="img" aria-label="${o(n)}">
		${x}
	</svg>`}function pe({points:e=[],series:a=[],labelKey:t="label",ariaLabel:n="Activity over time",height:s=220}){let r=Array.isArray(e)?e:[];if(!r.length||!a.length)return"";let p=680,i=38,l=14,c=16,u=34,d=Math.max(1,...r.flatMap(b=>a.map(k=>Number(b[k.key])||0))),m=(p-i-l)/r.length,g=Math.min(26,Math.max(5,m*.7/a.length)),f=b=>c+(1-kt(b,0,d)/d)*(s-c-u),x=Math.max(1,Math.ceil(r.length/7)),h=r.map((b,k)=>{let T=i+k*m+m/2,q=a.length*(g+2),z=T-q/2,L=a.map((W,be)=>{let Ie=Number(b[W.key])||0,ve=s-u-f(Ie);return`<rect x="${z+be*(g+2)}" y="${f(Ie)}" width="${g}" height="${Math.max(0,ve)}" rx="2" fill="${Ue(W.tone)}" opacity="0.9"><title>${o(b[t])} \xB7 ${o(W.label)}: ${Ie}</title></rect>`}).join(""),I=k%x===0?`<text x="${T}" y="${s-10}" text-anchor="middle" class="ac-chart__axis">${o(b[t])}</text>`:"";return`${L}${I}`}).join("");return`<svg viewBox="0 0 ${p} ${s}" class="ac-chart ac-chart--columns" role="img" aria-label="${o(n)}">
		<line x1="${i}" y1="${s-u}" x2="${p-l}" y2="${s-u}" class="ac-chart__grid"/>
		${h}
	</svg>`}function Tt({buckets:e=[],ariaLabel:a="Distribution"}){return pe({points:e,series:[{key:"count",label:"Count",tone:"primary"}],labelKey:"label",ariaLabel:a,height:200})}function At({segments:e=[],centerValue:a="",centerLabel:t="",ariaLabel:n="Composition",size:s=190}){let r=(Array.isArray(e)?e:[]).filter(m=>(Number(m.value)||0)>0);if(!r.length)return"";let p=r.reduce((m,g)=>m+(Number(g.value)||0),0),i=62,l=s/2,c=2*Math.PI*i,u=0,d=r.map(m=>{let g=Number(m.value)||0,f=g/p*c,x=`<circle cx="${l}" cy="${l}" r="${i}" fill="none" stroke="${Ue(m.tone)}" stroke-width="22"
				stroke-dasharray="${f} ${c-f}" stroke-dashoffset="${-u}"
				transform="rotate(-90 ${l} ${l})" opacity="0.92"><title>${o(m.label)}: ${g} (${xt(g/p*100,1)}%)</title></circle>`;return u+=f,x}).join("");return`<svg viewBox="0 0 ${s} ${s}" class="ac-chart ac-chart--donut" role="img" aria-label="${o(n)}">
		<circle cx="${l}" cy="${l}" r="${i}" fill="none" class="ac-chart__donut-track" stroke-width="22"/>
		${d}
		<text x="${l}" y="${l-4}" text-anchor="middle" class="ac-chart__center">${o(a)}</text>
		<text x="${l}" y="${l+15}" text-anchor="middle" class="ac-chart__center-label">${o(t)}</text>
	</svg>`}var ue={overview:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',organizations:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6"/><path d="M9 11h.01M15 11h.01"/></svg>',users:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',analytics:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></svg>',audit:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h4"/></svg>',learning:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',health:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',settings:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',search:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',menu:'<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',sun:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',moon:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',external:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',logo:'<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5-10-5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>'};var qt="quizConsoleTheme";function vn(e){let t=String(e||"?").trim().split(/\s+/).filter(Boolean);return t.length?t.length===1?t[0].slice(0,2).toUpperCase():`${t[0][0]}${t[t.length-1][0]}`.toUpperCase():"?"}function Ea(e){let a=document.documentElement,t=e||localStorage.getItem(qt)||(window.matchMedia?.("(prefers-color-scheme: dark)").matches?"dark":"light");return a.setAttribute("data-console-theme",t),localStorage.setItem(qt,t),t}function yn(){let e=document.documentElement.getAttribute("data-console-theme")==="dark"?"light":"dark";return Ea(e),e}function Lt(e,{session:a,navItems:t,canAny:n,onNavigate:s}){let r=a.user,p=!!a.scope?.isPlatform,i=a.scope?.organization,c=!!(a.deployment||{}).isOffline,u=c?"Local installation":p?"Platform scope":i?.name?i.name:"Organization scope",d=t.filter(g=>{if(!g.permission)return!0;let f=Array.isArray(g.permission)?g.permission:[g.permission];return n(f)});e.innerHTML=`
		<aside class="ac-sidebar" id="ac-sidebar">
			<div class="ac-sidebar__brand">
				<div class="ac-sidebar__logo" aria-hidden="true">${ue.logo}</div>
				<div class="ac-sidebar__titles">
					<p class="ac-sidebar__title">Control Center</p>
					<p class="ac-sidebar__subtitle">${o(c?"This installation":p?"All organizations":i?.name||"Organization")}</p>
				</div>
			</div>
			<nav class="ac-nav" aria-label="Console sections">
				${(()=>{let g=null;return d.map(f=>{let x=f.group||null,h=x&&x!==g?`<p class="ac-nav__group-label">${o(x)}</p>`:"";return g=x,`${h}
					<button type="button" class="ac-nav__item" data-ac-nav="${o(f.id)}" data-ac-path="${o(f.path)}">
						${ue[f.icon]||ue.overview}
						<span class="ac-nav__label">${o(f.title)}</span>
					</button>`}).join("")})()}
			</nav>
			<div class="ac-sidebar__footer">
				<div class="ac-user">
					<div class="ac-user__avatar" aria-hidden="true">${o(vn(r.name))}</div>
					<div class="ac-user__meta">
						<p class="ac-user__name">${o(r.name||r.username)}</p>
						<p class="ac-user__role">${o(r.roleLabel||r.role)}</p>
					</div>
				</div>
			</div>
		</aside>

		<div class="ac-main">
			<header class="ac-header">
				<button type="button" class="ac-btn ac-btn--ghost ac-btn--icon ac-header__toggle" data-ac-menu aria-label="Toggle navigation">
					${ue.menu}
				</button>
				<div class="ac-header__titles">
					<h1 class="ac-header__title" id="ac-page-title">Overview</h1>
					<p class="ac-header__description" id="ac-page-description"></p>
				</div>
				<div class="ac-header__actions">
					<span class="ac-scope${p&&!c?" ac-scope--platform":""}" title="The slice of the platform this session can reach">
						<span class="ac-scope__dot"></span>${o(u)}
					</span>
					<div class="ac-search">
						${ue.search}
						<input type="search" id="ac-global-search" placeholder="Search\u2026" aria-label="Search the console" autocomplete="off" />
						<button type="button" class="ac-search__clear" id="ac-search-clear" aria-label="Clear the search" title="Clear" hidden>
							<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
						</button>
						<div class="ac-search__panel" id="ac-search-panel" hidden></div>
					</div>
					<button type="button" class="ac-btn ac-btn--ghost ac-btn--icon" data-ac-theme aria-label="Toggle colour theme">
						${ue.sun}
					</button>
					<a class="ac-btn ac-btn--ghost" href="/admin.html" title="Open the classroom administration surface">
						${ue.external}<span>Classroom</span>
					</a>
				</div>
			</header>
			<main class="ac-content" id="ac-content" tabindex="-1"></main>
		</div>`,e.hidden=!1;let m=e.querySelector("#ac-sidebar");return e.querySelector("[data-ac-menu]")?.addEventListener("click",()=>{m.classList.toggle("is-open")}),e.querySelector("[data-ac-theme]")?.addEventListener("click",g=>{let f=yn();g.currentTarget.innerHTML=f==="dark"?ue.moon:ue.sun}),e.querySelectorAll("[data-ac-nav]").forEach(g=>{g.addEventListener("click",()=>{m.classList.remove("is-open"),s(g.dataset.acPath)})}),{content:e.querySelector("#ac-content"),title:e.querySelector("#ac-page-title"),description:e.querySelector("#ac-page-description"),setActive(g){let f=Array.from(e.querySelectorAll("[data-ac-nav]")),x=!1;f.forEach(h=>{let b=h.dataset.acPath,k=b===g||b!=="/"&&g.startsWith(b);k&&(x=!0),h.classList.toggle("is-active",k)}),x||f.forEach(h=>{h.dataset.acPath==="/"&&h.classList.add("is-active")})}}}function Ct(e,a=[]){let t=[];for(let n of e)n.id==="not-found"||n.id==="forbidden"||t.push({kind:"page",title:n.title,sub:n.description||"",path:n.path==="/"?"/":n.path,keywords:`${n.title} ${n.description||""}`.toLowerCase()});for(let n of a)t.push({kind:"settings",title:n.label,sub:"Settings",path:`/settings?section=${encodeURIComponent(n.id)}`,keywords:`settings ${n.label}`.toLowerCase()});return t}function _n(e,a){let t=a.keywords,n=a.title.toLowerCase();if(!e)return 0;if(n.startsWith(e))return 100-n.length*.01;let s=n.indexOf(e);if(s!==-1)return 60-s;if(t.includes(e))return 30;let r=e.split(/\s+/).filter(Boolean);return r.length>1&&r.every(p=>t.includes(p))?20:0}async function Et(e,{places:a,canUsers:t=!1,canOrganizations:n=!1}={}){let s=String(e||"").trim().toLowerCase();if(!s)return[];let r=a.map(u=>({place:u,value:_n(s,u)})).filter(u=>u.value>0).sort((u,d)=>d.value-u.value).slice(0,6).map(({place:u})=>({...u,badge:"Page"})),[p,i]=await Promise.all([t?w.get(`console/users?search=${encodeURIComponent(e.trim())}&limit=4`).catch(()=>null):Promise.resolve(null),n?w.get(`console/organizations?search=${encodeURIComponent(e.trim())}&limit=4`).catch(()=>null):Promise.resolve(null)]),l=(p?.data||[]).slice(0,4).map(u=>({kind:"user",title:u.name||u.username,sub:u.username&&u.name?u.username:u.roleLabel||"",path:`/users/${u.id}`,badge:u.roleLabel||"Account"})),c=(i?.data||[]).slice(0,4).map(u=>({kind:"organization",title:u.name,sub:u.status==="suspended"?"suspended":"",path:`/organizations/${u.id}`,badge:"Organization"}));return[...r,...l,...c]}function C({columns:e,rows:a,empty:t="Nothing to show for the current filters.",sort:n=null,onSort:s=null,rowHref:r=null,rowClass:p=null}){if(!a||a.length===0)return`<div class="ac-empty">
			<div class="ac-empty__icon" aria-hidden="true">
				<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
			</div>
			<p class="ac-empty__title">No data</p>
			<p class="ac-empty__message">${o(t)}</p>
		</div>`;let i=e.map(c=>{let u=c.align==="right"?" is-numeric":"",d=c.sortable&&s?" is-sortable":"",m=n&&n.key===c.key,g=m?n.direction==="asc"?"\u25B2":"\u25BC":"";return`<th class="${u}${d}"${d?` data-ac-sort="${o(c.key)}"`:""}${m?` aria-sort="${n.direction==="asc"?"ascending":"descending"}"`:""}>
				${o(c.label)}${g?`<span class="ac-sort">${g}</span>`:""}
			</th>`}).join(""),l=a.map((c,u)=>{let d=r?r(c):null,m=p?p(c):"",g=e.map(f=>{let x=f.align==="right"?" is-numeric":"",h=f.render?f.render(c):o(c[f.key]??"\u2014");return`<td class="${x}${f.className?` ${f.className}`:""}" data-label="${o(f.label)}">${h}</td>`}).join("");return`<tr${d?` data-ac-href="${o(d)}"`:""} class="${o(m)}" data-ac-row="${u}">${g}</tr>`}).join("");return`<div class="ac-table-wrap"><table class="ac-table">
		<thead><tr>${i}</tr></thead>
		<tbody>${l}</tbody>
	</table></div>`}function ie({total:e,limit:a,offset:t,onPage:n}){let s=Math.max(1,Number(a)||50),r=Math.max(0,Number(t)||0),p=Math.floor(r/s)+1,i=Math.max(1,Math.ceil((Number(e)||0)/s)),l=e===0?0:r+1,c=Math.min(r+s,Number(e)||0),u=(d,m,g,f="")=>`<button type="button" class="ac-btn ac-btn--sm" data-ac-page="${m}"${g?" disabled":""}${f}>${d}</button>`;return`<div class="ac-pagination">
		<span>Showing ${l}\u2013${c} of ${(Number(e)||0).toLocaleString()}</span>
		<div class="ac-pagination__pages">
			${u("\xAB",0,r===0)}
			${u("\u2039",Math.max(0,r-s),r===0)}
			<span style="padding:0 6px">Page ${p} of ${i}</span>
			${u("\u203A",r+s,r+s>=(Number(e)||0))}
			${u("\xBB",Math.max(0,(i-1)*s),r+s>=(Number(e)||0))}
		</div>
	</div>`}function jt(e,{onSort:a=null,onPage:t=null}={}){a&&e.querySelectorAll("[data-ac-sort]").forEach(n=>{n.addEventListener("click",()=>a(n.dataset.acSort))}),t&&e.querySelectorAll("[data-ac-page]").forEach(n=>{n.addEventListener("click",()=>t(Number(n.dataset.acPage)))}),e.querySelectorAll("[data-ac-href]").forEach(n=>{n.style.cursor="pointer",n.addEventListener("click",s=>{s.target.closest("a, button, input, select")||(window.location.hash=n.dataset.acHref)})})}function H(e=3){return`<div class="ac-skeleton-stack" aria-busy="true">
		${Array.from({length:e}).map((a,t)=>`<div class="ac-skeleton" style="width:${100-t*12}%"></div>`).join("")}
	</div>`}function R({title:e="No data",message:a="There is nothing to report for the current filters and period.",action:t=""}={}){return`<div class="ac-empty">
		<div class="ac-empty__icon" aria-hidden="true">
			<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h18M3 12h18M3 17h10"/></svg>
		</div>
		<p class="ac-empty__title">${o(e)}</p>
		<p class="ac-empty__message">${o(a)}</p>
		${t}
	</div>`}function D({title:e="This section could not be loaded",message:a="An unexpected error occurred. The rest of the console is unaffected.",retry:t=!0}={}){return`<div class="ac-error" role="alert">
		<div>
			<p class="ac-error__title">${o(e)}</p>
			<p class="ac-error__message">${o(a)}</p>
		</div>
		${t?'<button type="button" class="ac-btn ac-btn--sm" data-ac-retry>Retry</button>':""}
	</div>`}var ja=Object.freeze([{key:"7d",label:"7 days"},{key:"30d",label:"30 days"},{key:"90d",label:"90 days"},{key:"year",label:"Academic year"},{key:"custom",label:"Custom"}]);function za({options:e,value:a,name:t,onSelect:n=null}){return`<div class="ac-chip-group" role="group" aria-label="Period">${e.map(s=>`<button type="button" class="ac-chip${s.key===a?" is-active":""}" data-ac-chip="${t}" data-ac-value="${o(s.key)}" aria-pressed="${s.key===a}">${o(s.label)}</button>`).join("")}</div>`}function Pe(e,a,t){e.querySelectorAll(`[data-ac-chip="${a}"]`).forEach(n=>{n.addEventListener("click",()=>t(n.dataset.acValue))})}function _e({id:e="ac-search",placeholder:a="Search\u2026",value:t=""}){return`<div class="ac-field">
		<label class="ac-field__label" for="${o(e)}">Search</label>
		<input class="ac-input" id="${o(e)}" type="search" placeholder="${o(a)}" value="${o(t)}" autocomplete="off" />
	</div>`}function ee({id:e,label:a,options:t=[],value:n="",allLabel:s=null,includeAll:r=!1}){return`<div class="ac-field">
		<label class="ac-field__label" for="${o(e)}">${o(a)}</label>
		<select class="ac-select" id="${o(e)}" data-ac-select="${o(e)}">
			${r?`<option value=""${n?"":" selected"}>${o(s||"All")}</option>`:""}
			${t.map(p=>`<option value="${o(p.value)}"${String(p.value)===String(n)?" selected":""}>${o(p.label)}</option>`).join("")}
		</select>
	</div>`}function F({chips:e="",fields:a="",filters:t="",actions:n=""}={}){let s=a||t;return e?`<div class="ac-toolbar">
		<div class="ac-toolbar__row">
			${e}
			${n?`<div class="ac-toolbar__push">${n}</div>`:""}
		</div>
		${s?`<div class="ac-toolbar__row ac-toolbar__row--fields">${a}${t}</div>`:""}
	</div>`:s?`<div class="ac-toolbar">
			<div class="ac-toolbar__row ac-toolbar__row--fields">
				${a}${t}
				${n?`<div class="ac-toolbar__push">${n}</div>`:""}
			</div>
		</div>`:`<div class="ac-toolbar"><div class="ac-toolbar__row">
				<div class="ac-toolbar__push">${n}</div>
			</div></div>`}function sa({value:e,customFrom:a="",customTo:t=""}){let n=e==="custom"?`<div class="ac-field">
					<label class="ac-field__label" for="ac-period-from">From</label>
					<input class="ac-input" id="ac-period-from" type="date" value="${o(a)}" />
				</div>
				<div class="ac-field">
					<label class="ac-field__label" for="ac-period-to">To</label>
					<input class="ac-input" id="ac-period-to" type="date" value="${o(t)}" />
				</div>`:"";return F({chips:za({options:ja,value:e,name:"period"}),fields:n})}var Se=null;function wn(){return Se||(Se=document.createElement("div"),Se.className="ac-toasts",Se.setAttribute("role","status"),Se.setAttribute("aria-live","polite"),document.body.appendChild(Se)),Se}function v(e,a="info",t=4200){let n=wn(),s=document.createElement("div");return s.className=`ac-toast ac-toast--${a}`,s.innerHTML=`<span class="ac-toast__text">${o(e)}</span>`,n.appendChild(s),window.setTimeout(()=>{s.style.opacity="0",s.style.transition="opacity .18s ease",window.setTimeout(()=>s.remove(),200)},t),s}var na=0;function B({title:e,subtitle:a="",body:t,footer:n="",wide:s=!1,onMount:r=null}){let p=document.createElement("div");p.className="ac-modal-backdrop",p.setAttribute("role","dialog"),p.setAttribute("aria-modal","true"),p.setAttribute("aria-label",e),p.innerHTML=`
		<div class="ac-modal${s?" ac-modal--wide":""}">
			<div class="ac-modal__header">
				<div>
					<h2 class="ac-modal__title">${o(e)}</h2>
					${a?`<p class="ac-modal__subtitle">${o(a)}</p>`:""}
				</div>
				<button type="button" class="ac-close" data-ac-close aria-label="Close">&times;</button>
			</div>
			<div class="ac-modal__body" data-ac-modal-body></div>
			${n?'<div class="ac-modal__footer" data-ac-modal-footer></div>':""}
		</div>`;let i=p.querySelector("[data-ac-modal-body]");typeof t=="string"?i.innerHTML=t:t&&i.appendChild(t);let l=p.querySelector("[data-ac-modal-footer]");l&&(typeof n=="string"?l.innerHTML=n:n&&l.appendChild(n));function c(){p.remove(),na=Math.max(0,na-1),na===0&&document.body.style.removeProperty("overflow"),document.removeEventListener("keydown",u)}function u(m){m.key==="Escape"&&c()}p.addEventListener("click",m=>{m.target===p&&c()}),p.querySelectorAll("[data-ac-close]").forEach(m=>m.addEventListener("click",c)),document.addEventListener("keydown",u),document.body.appendChild(p),na+=1,document.body.style.overflow="hidden";let d=p.querySelector("input, select, textarea, button:not([data-ac-close])");return d&&d.focus(),r&&r(p),{close:c,root:p}}function M({title:e,message:a,detail:t="",confirmLabel:n="Confirm",danger:s=!1}){return new Promise(r=>{let p=B({title:e,body:`
				<p style="margin:0 0 10px;font-size:13.5px;line-height:1.55">${o(a)}</p>
				${t?`<div class="ac-alert ac-alert--${s?"danger":"info"}"><div class="ac-alert__body"><p class="ac-alert__text">${o(t)}</p></div></div>`:""}
			`,footer:`
				<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
				<button type="button" class="ac-btn ${s?"ac-btn--danger":"ac-btn--primary"}" data-ac-confirm>${o(n)}</button>
			`});p.root.querySelector("[data-ac-cancel]").addEventListener("click",()=>{p.close(),r(!1)}),p.root.querySelector("[data-ac-confirm]").addEventListener("click",()=>{p.close(),r(!0)}),p.root.addEventListener("click",i=>{i.target===p.root&&r(!1)})})}function _(e,a="\u2014"){if(e==null||e==="")return a;let t=Number(e);return Number.isFinite(t)?t.toLocaleString():a}function N(e,{withTime:a=!0}={}){if(!e)return"\u2014";let t=e instanceof Date?e:new Date(e);return Number.isNaN(t.getTime())?"\u2014":t.toLocaleString(void 0,{year:"numeric",month:"short",day:"2-digit",...a?{hour:"2-digit",minute:"2-digit"}:{}})}function U(e){if(!e)return"never";let a=e instanceof Date?e:new Date(e);if(Number.isNaN(a.getTime()))return"never";let t=Math.round((Date.now()-a.getTime())/1e3),n=[["year",31536e3],["month",2592e3],["day",86400],["hour",3600],["minute",60]];for(let[s,r]of n)if(Math.abs(t)>=r){let p=Math.round(t/r);return`${p} ${s}${p===1?"":"s"} ago`}return"just now"}var me={control:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',access:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>',credentials:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',maintenance:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9l-3.7 3.8z"/></svg>',activity:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',analytics:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></svg>',documents:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',notes:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',planning:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>'},Pa={id:"overview",path:"/",title:"Overview",description:"Control, access, activity, documents and planning \u2014 the administrator's working view.",permission:["platform.console","school.console"],async render(e,a){let t=a.getState();e.innerHTML=`<div class="ac-stack" data-ac-overview>
			${sa({value:t.period})}
			<div data-ac-kpis class="ac-grid ac-grid--kpi">${H(1)}</div>
			<div data-ac-alerts class="ac-stack"></div>
			<div class="ac-workbench" data-ac-workbench></div>
			<div data-ac-trends class="ac-grid ac-grid--2"></div>
			<div data-ac-detail class="ac-grid ac-grid--3" style="margin-top:16px"></div>
		</div>`;let n={period:t.period==="year"?"year":t.period};t.period==="custom"&&t.customRange&&(n.from=t.customRange.from,n.to=t.customRange.to);let s,r,p;try{[s,r,p]=await Promise.all([w.get("console/overview",n),w.get("console/trends",n),w.get("console/workbench")])}catch(h){e.innerHTML=D({title:"The overview could not be loaded",message:h.message});return}let i=s.data,l=i.sections.glance,c=i.sections.activity,u=i.sections.operations,d=i.sections.content,m=i.meta.definitions,g=p.data.sections;e.querySelector("[data-ac-kpis]").innerHTML=[S({label:a.isPlatform?a.isOffline?"Organizations here":"Organizations":"Organization",value:a.isPlatform?_(l.organizations.total):a.organization?.name||"\u2014",note:a.isPlatform?`${l.organizations.active} active \xB7 ${l.organizations.pending} pending`:`Plan ${a.organization?.plan||"\u2014"}`,tone:"primary",tooltip:"The tenants of this installation.",href:a.isPlatform?"#/organizations":null}),S({label:"Accounts",value:_(l.users.teachers+l.users.students+l.users.administrators),note:`${_(l.users.teachers)} teachers \xB7 ${_(l.users.students)} students`,tooltip:"Every account in the current scope.",href:"#/users"}),S({label:"Live sessions",value:_(g.maintenance.liveSessions),note:"refresh tokens still valid",tooltip:"Accounts with a refresh token that has not expired or been revoked. An administrator can revoke them from the account page."}),S({label:"Availability",value:u.availabilityPercent==null?"\u2014":`${u.availabilityPercent.toFixed(1)}%`,note:"last 60 minutes",tone:u.availabilityPercent==null?"":u.availabilityPercent>=99?"success":"warning",tooltip:u.note,href:"#/health"}),S({label:"Failed sign-ins",value:_(u.failedAuthentications),note:i.meta.scope.periodLabel,tone:u.failedAuthentications>0?"warning":"",tooltip:"Failed authentication attempts recorded in the durable security trail.",href:"#/audit?stream=security"}),S({label:"Waiting for access",value:_(g.access.pendingAccountRequests+g.access.pendingProfileRequests),note:`${_(g.access.pendingAccountRequests)} requests \xB7 ${_(g.access.pendingProfileRequests)} profile changes`,tone:g.access.pendingAccountRequests+g.access.pendingProfileRequests>0?"warning":"",tooltip:"Account requests and profile change requests that are waiting for a decision."})].join(""),e.querySelector("[data-ac-alerts]").innerHTML=xn({glance:l,operations:u,activity:c,access:g.access,maintenance:g.maintenance}),e.querySelector("[data-ac-workbench]").innerHTML=[he({icon:me.access,title:"Access to grant",subtitle:"What is waiting for an administrator.",body:`
					<div class="ac-workbench__list">
						${Fe({title:"Account requests",sub:"New students waiting to be created",value:g.access.pendingAccountRequests,href:"#/users/students?status=pending"})}
						${Fe({title:"Profile change requests",sub:"Students asking for a correction",value:g.access.pendingProfileRequests,href:"#/audit"})}
						${Fe({title:"Suspended accounts",sub:"No access until restored",value:g.access.suspendedAccounts,href:"#/users?status=suspended"})}
						${Fe({title:"Permission overrides",sub:"Individual grants and denies",value:g.access.permissionOverrides,href:"#/settings?section=roles"})}
						${Fe({title:"Teachers without a class",sub:"They can author, but reach nobody",value:g.access.teachersWithoutClasses.length,href:"#/users/teachers"})}
					</div>`}),he({icon:me.credentials,title:"Credentials to check",subtitle:"Accounts that were provisioned but never used.",body:g.access.unusedCredentials.length?`<div class="ac-workbench__list">${g.access.unusedCredentials.map(h=>`
						<a class="ac-workbench__row" href="#/users/${h.id}" style="text-decoration:none;color:inherit">
							<div class="ac-workbench__row-main">
								<p class="ac-workbench__row-title">${o(h.name||h.username)}</p>
								<p class="ac-workbench__row-sub">${o(h.role)} \xB7 ${h.last_login?`last seen ${o(U(h.last_login))}`:"never signed in"}</p>
							</div>
							<span class="ac-workbench__row-value">${o(h.status)}</span>
						</a>`).join("")}</div>`:R({title:"Every account has been used",message:"No account in scope is waiting for its first sign-in."})}),he({icon:me.maintenance,title:"Maintenance & recent actions",subtitle:"The last administrative operations.",body:g.maintenance.recentAudit.length?`<div class="ac-workbench__list">${g.maintenance.recentAudit.map(h=>`
						<div class="ac-workbench__row">
							<div class="ac-workbench__row-main">
								<p class="ac-workbench__row-title">${o(h.action)}</p>
								<p class="ac-workbench__row-sub">${o(h.actorName||"system")} \xB7 ${o(h.entityType)} \xB7 ${o(U(h.occurredAt))}</p>
							</div>
							<span class="ac-badge ac-badge--${h.severity==="critical"?"danger":h.severity==="warning"?"warning":"success"}">${o(h.severity)}</span>
						</div>`).join("")}</div>`:R({title:"No administrative action recorded yet",message:"Actions appear here as soon as an administrator changes something."})}),he({icon:me.activity,title:"Teacher activity",subtitle:"Are the teachers working?",body:`<p class="ac-empty__message" style="margin:0 0 12px;font-size:12px">${o(m.activeTeacher)}</p>
				<div class="ac-defs">
					<div class="ac-defs__item">
						<p class="ac-defs__term">Active</p>
						<p class="ac-defs__desc">${_(l.users.activeTeachers)} of ${_(l.users.teachers)}</p>
					</div>
					<div class="ac-defs__term" style="margin-top:10px"><p class="ac-defs__term">Exams authored</p></div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">&nbsp;</p>
						<p class="ac-defs__desc">${_(d.exams)}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Questions</p>
						<p class="ac-defs__desc">${_(d.questions)}</p>
					</div>
				</div>`}),he({icon:me.activity,title:"Student participation",subtitle:"Are the students taking part?",body:`<p class="ac-empty__message" style="margin:0 0 12px;font-size:12px">${o(m.activeStudent)}</p>
				<div class="ac-defs">
					<div class="ac-defs__item">
						<p class="ac-defs__term">Active</p>
						<p class="ac-defs__desc">${_(l.users.activeStudents)} of ${_(l.users.students)}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Attempts</p>
						<p class="ac-defs__desc">${_(c.attempts)}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Participating</p>
						<p class="ac-defs__desc">${_(c.participatingStudents)}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Average score</p>
						<p class="ac-defs__desc">${c.averageScore20==null?"\u2014":`${c.averageScore20.toFixed(2)} /20`}</p>
					</div>
				</div>`}),he({icon:me.analytics,title:"Assessment activity",subtitle:"What the platform is being used for.",body:`<div class="ac-defs">
					<div class="ac-defs__item">
						<p class="ac-defs__term">Exams conducted</p>
						<p class="ac-defs__desc">${_(c.examsConducted)}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Formal attempts</p>
						<p class="ac-defs__desc">${_(c.formalAttempts)}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Courses</p>
						<p class="ac-defs__desc">${_(d.courses)}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Game sessions</p>
						<p class="ac-defs__desc">${_(c.gameSessions+c.kidsGameSessions)}</p>
					</div>
				</div>`})].join("");let f=e.querySelector("[data-ac-trends]");if(r){let h=r.data.series,b=h.labels.map((q,z)=>({label:q,formalAttempts:h.formalAttempts[z]||0,trainingAttempts:h.trainingAttempts[z]||0,gameAttempts:h.gameAttempts[z]||0,newTeachers:h.newTeachers[z]||0,newStudents:h.newStudents[z]||0})),k=[{key:"formalAttempts",label:"Formal exams",tone:"primary"},{key:"trainingAttempts",label:"Training",tone:"info"},{key:"gameAttempts",label:"Games",tone:"violet"}],T=[{key:"newTeachers",label:"Teachers",tone:"success"},{key:"newStudents",label:"Students",tone:"warning"}];f.innerHTML=`
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles">
							<h3 class="ac-panel__title">Educational activity</h3>
							<p class="ac-panel__subtitle">Completed attempts by mode. ${r.data.meta.granularity==="week"?"Weekly":"Daily"} buckets over ${o(r.data.meta.periodLabel)}.</p>
						</div>
					</div>
					<div class="ac-panel__body">
						${ne(k)}
						${pe({points:b,series:k,labelKey:"label",ariaLabel:"Completed attempts over time by mode"})}
					</div>
				</section>
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles">
							<h3 class="ac-panel__title">Account growth</h3>
							<p class="ac-panel__subtitle">New teacher and student accounts created inside the period.</p>
						</div>
					</div>
					<div class="ac-panel__body">
						${ne(T)}
						${pe({points:b,series:T,labelKey:"label",ariaLabel:"New accounts over time"})}
					</div>
				</section>`}e.querySelector("[data-ac-detail]").innerHTML=[he({icon:me.documents,title:"Documents",subtitle:"What has been produced.",flush:!0,body:g.documents.recent.length?`<div class="ac-workbench__list">${g.documents.recent.map(h=>`
					<div class="ac-workbench__row">
						<div class="ac-workbench__row-main">
							<p class="ac-workbench__row-title">${o(h.title||h.fileName)}</p>
							<p class="ac-workbench__row-sub">${o(h.kind)} \xB7 ${o(h.format||"").toUpperCase()} \xB7 ${o(U(h.createdAt))}</p>
						</div>
						<span class="ac-workbench__row-value">${zt(h.sizeBytes)}</span>
					</div>`).join("")}</div>`:R({title:"No documents yet",message:"Course booklets, preparation sheets and exam papers appear here."})}),he({icon:me.notes,title:"Notes to teachers",subtitle:"What has been said, and a way to say more.",actions:'<button type="button" class="ac-btn ac-btn--sm" data-ac-compose-note>Write a note</button>',flush:!0,body:g.notes.recent.length?`<div class="ac-workbench__list">${g.notes.recent.map(h=>`
					<div class="ac-workbench__row">
						<div class="ac-workbench__row-main">
							<p class="ac-workbench__row-title">${o(h.title)}</p>
							<p class="ac-workbench__row-sub">${o(h.teacherName||"An administrator")}${h.className?` \xB7 ${o(h.className)}`:""} \xB7 ${o(U(h.date))}</p>
						</div>
					</div>`).join("")}</div>`:R({title:"No note sent yet",message:"A note reaches a teacher and their class."})}),he({icon:me.planning,title:"Planning",subtitle:"What is coming up.",flush:!0,body:`
					<div class="ac-workbench__list">
						${g.planning.upcomingAssignments.length?g.planning.upcomingAssignments.map(h=>`
							<div class="ac-workbench__row">
								<div class="ac-workbench__row-main">
									<p class="ac-workbench__row-title">${o(h.title)}</p>
									<p class="ac-workbench__row-sub">Due ${o(N(h.dueDate,{withTime:!1}))}</p>
								</div>
								<span class="ac-workbench__row-value">${h.dueDate&&new Date(h.dueDate)<new Date?'<span class="ac-badge ac-badge--danger">overdue</span>':'<span class="ac-badge">scheduled</span>'}</span>
							</div>`).join(""):""}
						${g.planning.recentExams.length?g.planning.recentExams.map(h=>`
							<div class="ac-workbench__row">
								<div class="ac-workbench__row-main">
									<p class="ac-workbench__row-title">${o(h.name)}</p>
									<p class="ac-workbench__row-sub">${h.isTraining?"Training":"Formal exam"} \xB7 created ${o(U(h.createdAt))}</p>
								</div>
								<span class="ac-badge ac-badge--${h.status==="active"?"success":""}">${o(h.status)}</span>
							</div>`).join(""):""}
						${g.planning.archives.length?g.planning.archives.map(h=>`
							<div class="ac-workbench__row">
								<div class="ac-workbench__row-main">
									<p class="ac-workbench__row-title">${o(h.label||`Archive ${h.year}`)}</p>
									<p class="ac-workbench__row-sub">School year ${o(h.year)}</p>
								</div>
								<span class="ac-workbench__row-value">${zt(h.sizeBytes)}</span>
							</div>`).join(""):""}
					</div>
					${!g.planning.upcomingAssignments.length&&!g.planning.recentExams.length&&!g.planning.archives.length?R({title:"Nothing planned yet",message:"Exams, assignments and year archives appear here."}):""}`})].join("");let x=e.querySelector("[data-ac-compose-note]");x&&x.addEventListener("click",async()=>{let h=[];try{h=(await w.get("console/users?role=teacher&limit=200"))?.data||[]}catch{h=[]}if(!h.length){v("No teacher account is available to write to.","error");return}let b=B({title:"Write a note to a teacher",subtitle:"The note reaches the teacher and, when a class is chosen, that class.",body:`<div class="ac-field">
							<label class="ac-field__label" for="ac-note-teacher">Teacher</label>
							<select class="ac-select ac-input--full" id="ac-note-teacher">
								${h.map(k=>`<option value="${o(k.id)}">${o(k.name||k.username)}</option>`).join("")}
							</select>
						</div>
						<div class="ac-field" style="margin-top:12px">
							<label class="ac-field__label" for="ac-note-title">Title</label>
							<input class="ac-input ac-input--full" id="ac-note-title" type="text" placeholder="What is this about?" />
						</div>
						<div class="ac-field" style="margin-top:12px">
							<label class="ac-field__label" for="ac-note-body">Message</label>
							<textarea class="ac-input ac-input--full" id="ac-note-body" rows="4" placeholder="Write the note"></textarea>
						</div>`,footer:`
						<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
						<button type="button" class="ac-btn ac-btn--primary" data-ac-confirm>Send note</button>
					`});b.root.querySelector("[data-ac-cancel]").addEventListener("click",b.close),b.root.querySelector("[data-ac-confirm]").addEventListener("click",async()=>{let k=b.root.querySelector("#ac-note-teacher").value,T=b.root.querySelector("#ac-note-title").value.trim(),q=b.root.querySelector("#ac-note-body").value.trim();if(!T||!q){v("A title and a message are required.","error");return}try{await w.post("console/notes",{teacherId:k,title:T,body:q}),b.close(),v("Note sent.","success"),a.rerender()}catch(z){v(z.message,"error")}})}),Pe(e,"period",h=>{if(h==="custom"){let b=prompt("From (YYYY-MM-DD)",new Date(Date.now()-2592e6).toISOString().slice(0,10));if(!b)return;let k=prompt("To (YYYY-MM-DD)",new Date().toISOString().slice(0,10));if(!k)return;a.setPeriod("custom",{from:b,to:k});return}a.setPeriod(h)})}};function he({icon:e,title:a,subtitle:t,body:n,actions:s="",flush:r=!1}){return`<section class="ac-workbench__panel">
		<div class="ac-workbench__head">
			<div>
				<h3 class="ac-workbench__title">${e||""}${o(a)}</h3>
				${t?`<p class="ac-workbench__subtitle">${o(t)}</p>`:""}
			</div>
			${s?`<div class="ac-panel__actions">${s}</div>`:""}
		</div>
		<div class="ac-workbench__body${r?" ac-workbench__body--flush":""}">${n}</div>
	</section>`}function Fe({title:e,sub:a,value:t,href:n}){let s=n?"a":"div",r=n?` href="${o(n)}" style="text-decoration:none;color:inherit"`:"";return`<${s} class="ac-workbench__row"${r}>
		<div class="ac-workbench__row-main">
			<p class="ac-workbench__row-title">${o(e)}</p>
			<p class="ac-workbench__row-sub">${o(a)}</p>
		</div>
		<span class="ac-workbench__row-value">${_(t)}</span>
	</${s}>`}function zt(e){let a=Number(e);return!Number.isFinite(a)||a<=0?"\u2014":a<1024?`${a} B`:a<1024*1024?`${Math.round(a/1024)} KB`:`${Math.round(a/1024/1024*10)/10} MB`}function xn({glance:e,operations:a,activity:t,access:n,maintenance:s}){let r=[];if(n.pendingAccountRequests>0&&r.push({kind:"warning",title:`${n.pendingAccountRequests} account request(s) waiting for a decision`,text:"A student or a teacher cannot sign in until an administrator approves the request.",action:{label:"Review accounts",href:"#/users/students"}}),n.pendingProfileRequests>0&&r.push({kind:"info",title:`${n.pendingProfileRequests} profile change request(s) waiting`,text:"A student is asking for a correction to their record.",action:{label:"Review the trail",href:"#/audit"}}),n.teachersWithoutClasses.length>0&&r.push({kind:"warning",title:`${n.teachersWithoutClasses.length} teacher(s) manage no class`,text:"They can author content but reach no student. Assign them a class, or deactivate the account.",action:{label:"Open teachers",href:"#/users/teachers"}}),a.failedAuthentications>0&&r.push({kind:"warning",title:`${a.failedAuthentications} failed sign-in attempt(s) in this period`,text:"Grouped by source address and attempted username on the Audit page \u2014 a concentration may indicate credential stuffing.",action:{label:"Inspect security events",href:"#/audit?stream=security"}}),a.serverErrorRatePercent!=null&&a.serverErrorRatePercent>=1&&r.push({kind:"danger",title:`Server error rate at ${a.serverErrorRatePercent}%`,text:"More than one request in a hundred failed with a server error in the last hour.",action:{label:"Open system health",href:"#/health"}}),t.attemptsPrevious!=null&&t.attempts>0&&t.attemptsPrevious>0){let p=Math.round((t.attempts-t.attemptsPrevious)/t.attemptsPrevious*1e3)/10;p<=-30&&r.push({kind:"warning",title:`Attempts fell ${Math.abs(p)}% versus the previous period`,text:"A sharp drop usually means an organization stopped using the platform, or a term boundary was crossed.",action:{label:"Compare organizations",href:"#/analytics"}})}return r.length?`<div class="ac-alert-list">${r.map(p=>`
		<div class="ac-alert-item">
			<div class="ac-alert-item__body">
				<p class="ac-alert-item__title">${o(p.title)}</p>
				<p class="ac-alert-item__text">${o(p.text)}</p>
			</div>
			<div class="ac-alert-item__action">
				<a class="ac-btn ac-btn--sm" href="${o(p.action.href)}">${o(p.action.label)}</a>
			</div>
		</div>`).join("")}</div>`:`<div class="ac-alert ac-alert--info">
			<div class="ac-alert__body">
				<p class="ac-alert__title">Nothing needs your attention</p>
				<p class="ac-alert__text">Every monitored threshold is inside its normal range.</p>
			</div>
		</div>`}function oe(e=[]){return`<div class="ac-row-actions">${e.filter(t=>!t.hidden).map(t=>`<button type="button" class="ac-btn ac-btn--sm${t.tone?` ac-btn--${t.tone}`:""}" data-ac-action="${ra(t.id)}" data-ac-action-value="${ra(t.value??"")}" title="${ra(t.title||t.label)}">${ra(t.label)}</button>`).join("")}</div>`}function Te(e,a={}){e.addEventListener("click",t=>{let n=t.target.closest("[data-ac-action]");if(!n||!e.contains(n))return;t.preventDefault(),t.stopPropagation();let s=a[n.dataset.acAction];s&&s(n.dataset.acActionValue,n)})}function Pt(e,{canManage:a=!0,canDelete:t=!0}={}){let n=[{id:"open",label:"Open",value:e.id,title:"Open the account"}];return a&&n.push({id:"toggle-status",label:e.status==="active"?"Suspend":"Reactivate",value:e.id,title:e.status==="active"?"End this account's access and keep its record":"Restore this account's access"}),t&&n.push({id:"delete",label:"Delete",value:e.id,tone:"danger",title:"Remove this account permanently"}),n}function Mt(e,{canManage:a=!0}={}){let t=[{id:"open",label:"Open",value:e.id}];return a&&(t.push({id:"toggle-status",label:e.status==="suspended"?"Reactivate":"Suspend",value:e.id,title:e.status==="suspended"?"Restore this organization's access":"Revoke this organization's access"}),t.push({id:"edit",label:"Edit",value:e.id,title:"Edit the organization profile"}),t.push({id:"delete",label:"Delete",value:e.id,tone:"danger",title:"Remove the organization and everything in it"})),t}function ra(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function E({title:e,subtitle:a="",body:t,actions:n="",flush:s=!1,id:r=""}={}){return`<section class="ac-section-panel"${r?` id="${o(r)}"`:""}>
		<div class="ac-section-panel__head">
			<div>
				<h3 class="ac-section-panel__title">${o(e)}</h3>
				${a?`<p class="ac-section-panel__subtitle">${o(a)}</p>`:""}
			</div>
			${n?`<div class="ac-panel__actions">${n}</div>`:""}
		</div>
		<div class="ac-section-panel__body${s?" ac-section-panel__body--flush":""}">${t}</div>
	</section>`}function A({id:e,label:a,value:t="",type:n="text",hint:s="",full:r=!1,placeholder:p="",disabled:i=!1,required:l=!1}={}){return`<div class="ac-field${r?" ac-field--full":""}" data-ac-field>
		<label class="ac-field__label" for="${o(e)}">${o(a)}${l?' <span class="ac-required" aria-hidden="true" title="Required">*</span>':""}</label>
		<input class="ac-input ac-input--full" id="${o(e)}" type="${o(n)}" value="${o(t??"")}" placeholder="${o(p)}" autocomplete="off" ${l?'aria-required="true"':""} ${i?"disabled":""} />
		${s?`<p class="ac-field__hint">${o(s)}</p>`:""}
	</div>`}function Ae({id:e,label:a,value:t="",hint:n="",rows:s=4,placeholder:r=""}={}){return`<div class="ac-field ac-field--full">
		<label class="ac-field__label" for="${o(e)}">${o(a)}</label>
		<textarea class="ac-input ac-input--full" id="${o(e)}" rows="${s}" placeholder="${o(r)}">${o(t)}</textarea>
		${n?`<p class="ac-field__hint">${o(n)}</p>`:""}
	</div>`}function O({id:e,label:a,options:t=[],value:n="",hint:s="",allLabel:r=null,required:p=!1}={}){let i=r?`<option value=""${n?"":" selected"}>${o(r)}</option>`:"";return`<div class="ac-field" data-ac-field>
		<label class="ac-field__label" for="${o(e)}">${o(a)}${p?' <span class="ac-required" aria-hidden="true" title="Required">*</span>':""}</label>
		<select class="ac-select" id="${o(e)}" ${p?'aria-required="true"':""}>
			${i}
			${t.map(l=>`<option value="${o(l.value)}"${String(l.value)===String(n)?" selected":""}>${o(l.label)}</option>`).join("")}
		</select>
		${s?`<p class="ac-field__hint">${o(s)}</p>`:""}
	</div>`}function ce({id:e,label:a,hint:t="",checked:n=!1,disabled:s=!1}={}){return`<div class="ac-switch-row">
		<div class="ac-switch-row__text">
			<p class="ac-switch-row__label">${o(a)}</p>
			${t?`<p class="ac-switch-row__hint">${o(t)}</p>`:""}
		</div>
		<button
			type="button"
			class="ac-switch"
			id="${o(e)}"
			role="switch"
			aria-checked="${n?"true":"false"}"
			${s?"disabled":""}
		></button>
	</div>`}function Ge({id:e,label:a,hint:t="",checked:n=!1}={}){return`<label class="ac-check">
		<input type="checkbox" id="${o(e)}" ${n?"checked":""} />
		<span>
			<span class="ac-check__label">${o(a)}</span>
			${t?`<span class="ac-check__hint">${o(t)}</span>`:""}
		</span>
	</label>`}function y(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}var Nt=[{value:"primaire",label:"Primaire (Primary)"},{value:"college",label:"Coll\xE8ge (Middle School)"},{value:"lycee",label:"Lyc\xE9e (High School)"},{value:"autre",label:"Autre (Other)"}],Rt=[{value:"free",label:"Free"},{value:"pro",label:"Pro"},{value:"enterprise",label:"Enterprise"}];function Ot({onCreated:e=null}={}){let a=B({title:"Add an organization",subtitle:'The organization is created as "pending": it is provisioned, but it cannot sign in until you activate it.',body:`<div class="ac-field-grid">
				${A({id:"ac-org-new-name",label:"Name",placeholder:"Lyc\xE9e Al Khawarizmi",full:!0})}
				${A({id:"ac-org-new-slug",label:"Slug",placeholder:"derived from the name",hint:"A unique identifier. Leave it blank to derive it from the name.",full:!0})}
				${O({id:"ac-org-new-type",label:"Type",options:Nt,value:"primaire"})}
				${O({id:"ac-org-new-plan",label:"Plan",options:Rt,value:"free"})}
				${A({id:"ac-org-new-year",label:"Academic year",placeholder:"2025-2026"})}
				${A({id:"ac-org-new-capacity",label:"Student capacity",type:"number",value:"100",hint:"Recorded for information; no entitlement is derived from it yet."})}
				${A({id:"ac-org-new-city",label:"City"})}
				${A({id:"ac-org-new-email",label:"Email",type:"email"})}
			</div>`,footer:`
			<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
			<button type="button" class="ac-btn ac-btn--primary" data-ac-confirm>Create the organization</button>
		`}),t=a.root;return t.querySelector("[data-ac-cancel]").addEventListener("click",a.close),t.querySelector("[data-ac-confirm]").addEventListener("click",async()=>{let n=r=>t.querySelector(`#${r}`)?.value?.trim()??"",s=n("ac-org-new-name");if(!s){v("The organization needs a name.","error");return}try{let r=await w.post("console/organizations",{name:s,slug:n("ac-org-new-slug")||void 0,school_type:n("ac-org-new-type"),plan:n("ac-org-new-plan"),school_year:n("ac-org-new-year")||void 0,max_students:Number(n("ac-org-new-capacity"))||100,city:n("ac-org-new-city")||void 0,email:n("ac-org-new-email")||void 0});a.close(),v("The organization was created. It is pending until you activate it.","success"),typeof e=="function"&&e(r?.data)}catch(r){v(r.message,"error")}}),a}function It(e,{onSaved:a=null}={}){let t=B({title:`Edit "${e.name}"`,subtitle:"The profile of the organization. The slug is its unique identifier and is not changed here.",wide:!0,body:`<div class="ac-field-grid">
				${A({id:"ac-org-edit-name",label:"Name",value:e.name,full:!0})}
				${O({id:"ac-org-edit-type",label:"Type",options:Nt,value:e.schoolType||e.school_type||"primaire"})}
				${O({id:"ac-org-edit-plan",label:"Plan",options:Rt,value:e.plan||"free"})}
				${A({id:"ac-org-edit-year",label:"Academic year",value:e.schoolYear||e.school_year||""})}
				${A({id:"ac-org-edit-capacity",label:"Student capacity",type:"number",value:String(e.maxStudents??e.max_students??100)})}
				${A({id:"ac-org-edit-city",label:"City",value:e.city||""})}
				${A({id:"ac-org-edit-phone",label:"Phone",value:e.phone||""})}
				${A({id:"ac-org-edit-email",label:"Email",value:e.email||""})}
				${A({id:"ac-org-edit-address",label:"Address",value:e.address||"",full:!0})}
			</div>`,footer:`
			<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
			<button type="button" class="ac-btn ac-btn--primary" data-ac-confirm>Save the profile</button>
		`}),n=t.root;return n.querySelector("[data-ac-cancel]").addEventListener("click",t.close),n.querySelector("[data-ac-confirm]").addEventListener("click",async()=>{let s=r=>n.querySelector(`#${r}`)?.value?.trim()??"";try{await w.patch(`console/organizations/${encodeURIComponent(e.id)}`,{profile:{name:s("ac-org-edit-name"),school_type:s("ac-org-edit-type"),plan:s("ac-org-edit-plan"),school_year:s("ac-org-edit-year")||null,max_students:Number(s("ac-org-edit-capacity"))||100,city:s("ac-org-edit-city")||null,phone:s("ac-org-edit-phone")||null,email:s("ac-org-edit-email")||null,address:s("ac-org-edit-address")||null}}),t.close(),v("The organization profile was saved.","success"),typeof a=="function"&&a()}catch(r){v(r.message,"error")}}),t}async function Dt(e,{onDeleted:a=null}={}){if(!await M({title:`Delete "${e.name}"?`,message:"The organization is removed together with every account, class, question, exam, result and generated document it owns. This cannot be undone. Suspending the organization instead keeps everything and ends the access.",detail:"Type DELETE on the confirmation to go ahead.",confirmLabel:"Delete the organization",danger:!0}))return!1;try{return await w.del(`console/organizations/${encodeURIComponent(e.id)}`,{confirm:"DELETE"}),v("The organization was deleted.","success"),typeof a=="function"&&a(),!0}catch(n){return v(n.message,"error"),!1}}async function Ht(e,{onChanged:a=null}={}){let t=e.status!=="suspended";if(!await M({title:t?`Suspend "${e.name}"?`:`Reactivate "${e.name}"?`,message:t?"Nobody in the organization can sign in until it is restored. Nothing is deleted, and the administrator of the organization can still reach the console to reactivate it.":"The organization can sign in again immediately.",confirmLabel:t?"Suspend the organization":"Reactivate the organization",danger:t}))return!1;try{return await w.patch(`console/organizations/${encodeURIComponent(e.id)}`,{status:t?"suspended":"active",reason:t?"Suspended from the console":"Reactivated from the console"}),v(t?"The organization was suspended.":"The organization was reactivated.","success"),typeof a=="function"&&a(),!0}catch(s){return v(s.message,"error"),!1}}var kn=25,G={search:"",status:"",offset:0,sort:{key:"name",direction:"asc"}},Bt={id:"organizations",path:"/organizations",title:"Organizations",description:"Every organization on the platform, its accounts, its usage and the conditions that need attention.",permission:["platform.organizations.read","school.profile.read"],async render(e,a){e.innerHTML=`
			${F({fields:`${_e({id:"ac-org-search",placeholder:"Search organizations\u2026",value:G.search})}
					${ee({id:"ac-org-status",label:"Status",value:G.status,includeAll:!0,allLabel:"All statuses",options:[{value:"active",label:"Active"},{value:"pending",label:"Pending"},{value:"suspended",label:"Suspended"}]})}`,actions:`${a.isPlatform?'<button type="button" class="ac-btn ac-btn--primary" data-ac-org-new>Add an organization</button>':""}<button type="button" class="ac-btn" data-ac-refresh>Refresh</button>`})}
			<div class="ac-grid ac-grid--kpi" data-ac-org-kpis></div>
			<section class="ac-panel" style="margin-top:16px">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title">Organizations</h3>
						<p class="ac-panel__subtitle">${a.isOffline?"Every organization hosted on this installation. Active users are measured over the last 30 days from real sign-ins, attempts and content creation.":"Every organization on the platform. Active users are measured over the last 30 days from real sign-ins, attempts and content creation."}</p>
					</div>
				</div>
				<div class="ac-panel__body ac-panel__body--flush" data-ac-org-body>
					${H(4)}
				</div>
			</section>
			<div class="ac-grid ac-grid--2" style="margin-top:16px" data-ac-org-charts></div>`;let t=e.querySelector("[data-ac-org-body]"),n=e.querySelector("[data-ac-org-kpis]"),s=e.querySelector("[data-ac-org-charts]"),r;try{r=await w.get("console/organizations",{search:G.search||void 0,status:G.status||void 0,limit:kn,offset:G.offset})}catch(h){t.innerHTML=D({message:h.message});return}let p=r.data,i=p.length,l=p.filter(h=>h.status==="active").length,c=p.filter(h=>h.status==="pending").length,u=p.filter(h=>h.status==="suspended").length,d=p.reduce((h,b)=>h+(b.teachers||0),0),m=p.reduce((h,b)=>h+(b.students||0),0),g=p.filter(h=>h.alerts.some(b=>b.code==="inactive"||b.code==="no_activity")).length;if(n.innerHTML=[S({label:"Organizations shown",value:_(i),note:r.total>p.length?`of ${_(r.total)} matching`:"matching the filter",tooltip:"The number of organizations matching the current search and status filter."}),S({label:"Active",value:_(l),tone:"success",tooltip:'Organizations whose lifecycle status is "active".'}),S({label:"Pending / suspended",value:`${_(c)} / ${_(u)}`,tone:c+u>0?"warning":"",tooltip:"Organizations awaiting activation, and organizations whose access has been revoked."}),S({label:"Accounts",value:_(d+m),note:`${_(d)} teachers \xB7 ${_(m)} students`,tooltip:"Teacher and student accounts across the organizations shown."}),S({label:"Needing attention",value:_(g),tone:g>0?"warning":"",tooltip:"Organizations with no activity in the last 30 days, or with no recorded activity at all."})].join(""),t.innerHTML=C({columns:[{key:"name",label:"Organization",sortable:!0,render:h=>`<a href="#/organizations/${h.id}" class="ac-table__primary">${o(h.name)}</a><br><span class="ac-table__muted">${o(h.slug)}</span>`},{key:"status",label:"Status",sortable:!0,render:h=>`<span class="ac-badge ${h.status==="active"?"ac-badge--success":h.status==="pending"?"ac-badge--warning":"ac-badge--danger"}">${o(h.status)}</span>`},{key:"plan",label:"Plan",render:h=>o(h.plan||"\u2014")},{key:"teachers",label:"Teachers",align:"right",sortable:!0},{key:"students",label:"Students",align:"right",sortable:!0},{key:"activeTeachers",label:"Active teachers",align:"right",sortable:!0,render:h=>`${_(h.activeTeachers)} / ${_(h.teachers)}`},{key:"activeStudents",label:"Active students",align:"right",sortable:!0,render:h=>`${_(h.activeStudents)} / ${_(h.students)}`},{key:"attempts30d",label:"Attempts (30d)",align:"right",sortable:!0},{key:"lastActivity",label:"Last activity",sortable:!0,render:h=>h.lastActivity?`<span title="${o(N(h.lastActivity))}">${o(U(h.lastActivity))}</span>`:'<span class="ac-badge ac-badge--danger">none</span>'},{key:"alerts",label:"Alerts",render:h=>h.alerts.length?h.alerts.map(b=>`<span class="ac-badge ac-badge--${b.kind==="danger"?"danger":b.kind==="warning"?"warning":"info"}" title="${o(b.message)}">${o(b.code)}</span>`).join(" "):'<span class="ac-table__muted">\u2014</span>'},{key:"actions",label:"Actions",align:"right",render:h=>oe(Mt(h,{canManage:a.isPlatform}))}],rows:p,sort:G.sort,onSort:h=>{G.sort={key:h,direction:G.sort.key===h&&G.sort.direction==="asc"?"desc":"asc"},a.rerender()},empty:a.isPlatform?"No organization matches the current search and status filter.":"This session is scoped to a single organization.",rowHref:h=>`#/organizations/${h.id}`}),t.insertAdjacentHTML("beforeend",ie({total:r.total,limit:r.limit,offset:r.offset,onPage:h=>{G.offset=h,a.rerender()}})),a.isPlatform&&p.length){let h=[...p].sort((b,k)=>(k.activeStudents||0)-(b.activeStudents||0)).slice(0,8);s.innerHTML=`
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles">
							<h3 class="ac-panel__title">Usage by organization</h3>
							<p class="ac-panel__subtitle">Active students over the last 30 days, highest first.</p>
						</div>
					</div>
					<div class="ac-panel__body">
						${X({rows:h.map(b=>({label:b.name,value:b.activeStudents||0})),value:"value",label:b=>b.label,display:b=>_(b),tone:"primary",ariaLabel:"Active students by organization"})}
					</div>
				</section>
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles">
							<h3 class="ac-panel__title">Account distribution</h3>
							<p class="ac-panel__subtitle">Teachers and students per organization in the current filter.</p>
						</div>
					</div>
					<div class="ac-panel__body">
						${X({rows:h.map(b=>({label:b.name,teachers:b.teachers||0,students:b.students||0})),value:"students",label:b=>b.label,display:b=>_(b),tone:"primary",ariaLabel:"Students by organization"})}
					</div>
				</section>`}else s.innerHTML="";let f=e.querySelector("#ac-org-search"),x=null;f.addEventListener("input",()=>{window.clearTimeout(x),x=window.setTimeout(()=>{G.search=f.value.trim(),G.offset=0,a.rerender()},320)}),e.querySelector("#ac-org-status").addEventListener("change",h=>{G.status=h.target.value,G.offset=0,a.rerender()}),e.querySelector("[data-ac-refresh]").addEventListener("click",()=>a.rerender()),Te(t,{open:h=>{window.location.hash=`#/organizations/${h}`},"toggle-status":async h=>{let b=p.find(k=>k.id===h);b&&await Ht(b,{onChanged:()=>a.rerender()})},edit:h=>{let b=p.find(k=>k.id===h);b&&It(b,{onSaved:()=>a.rerender()})},delete:async h=>{let b=p.find(k=>k.id===h);b&&await Dt(b,{onDeleted:()=>a.rerender()})}}),e.querySelector("[data-ac-org-new]")?.addEventListener("click",()=>{Ot({onCreated:()=>a.rerender()})})}};var $n=[{value:"student",label:"Student"},{value:"teacher",label:"Teacher"},{value:"admin",label:"Administrator"},{value:"super_admin",label:"Platform administrator"}];function ia({ctx:e,role:a="student",onCreated:t=null}){let n=!!e?.isPlatform,s=String(a||"student").split(",")[0].trim()||"student",r=B({title:"Add an account",subtitle:"The account is created in your organization. The password is stored hashed and is never shown again.",body:`<div class="ac-field-grid">
				<label class="ac-field">
					<span class="ac-field__label">Full name</span>
					<input class="ac-input ac-input--full" id="ac-new-name" type="text" placeholder="e.g. Amina Berrada" autocomplete="off" />
				</label>
				<label class="ac-field">
					<span class="ac-field__label">Username</span>
					<input class="ac-input ac-input--full" id="ac-new-username" type="text" placeholder="e.g. amina" autocomplete="off" />
				</label>
				<label class="ac-field">
					<span class="ac-field__label">Role</span>
					<select class="ac-select ac-input--full" id="ac-new-role">
						${$n.map(i=>`<option value="${o(i.value)}"${i.value===s?" selected":""}>${o(i.label)}</option>`).join("")}
					</select>
				</label>
				<label class="ac-field">
					<span class="ac-field__label">Student number <small>(students)</small></span>
					<input class="ac-input ac-input--full" id="ac-new-numero" type="text" placeholder="optional" autocomplete="off" />
				</label>
				<label class="ac-field">
					<span class="ac-field__label">Email</span>
					<input class="ac-input ac-input--full" id="ac-new-email" type="email" placeholder="optional" autocomplete="off" />
				</label>
				<label class="ac-field">
					<span class="ac-field__label">Phone</span>
					<input class="ac-input ac-input--full" id="ac-new-phone" type="tel" placeholder="optional" autocomplete="off" />
				</label>
				<label class="ac-field ac-field--full">
					<span class="ac-field__label">Password</span>
					<input class="ac-input ac-input--full" id="ac-new-password" type="text" autocomplete="off" placeholder="At least 8 characters" />
					<span class="ac-field__hint">Share it with the account holder through a channel you trust. It is shown here once and is never stored in clear text.</span>
				</label>
				${n?`<label class="ac-field ac-field--full">
					<span class="ac-field__label">Organization id</span>
					<input class="ac-input ac-input--full" id="ac-new-school" type="text" placeholder="Leave blank for your own organization" autocomplete="off" />
					<span class="ac-field__hint">A platform administrator can create an account in another organization by naming its id here.</span>
				</label>`:""}
			</div>`,footer:`
			<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
			<button type="button" class="ac-btn ac-btn--primary" data-ac-confirm>Create the account</button>
		`}),p=r.root;return p.querySelector("[data-ac-cancel]").addEventListener("click",r.close),p.querySelector("[data-ac-confirm]").addEventListener("click",async()=>{let i=h=>p.querySelector(`#${h}`)?.value?.trim()??"",l=i("ac-new-name"),c=i("ac-new-username"),u=i("ac-new-password");if(!l||!c){v("A name and a username are required.","error");return}if(u.length<8){v("The password must be at least 8 characters.","error");return}let d={name:l,username:c,password:u,role:i("ac-new-role")||"student"},m=i("ac-new-numero"),g=i("ac-new-email"),f=i("ac-new-phone");m&&(d.numero=m),g&&(d.email=g),f&&(d.phone=f);let x=i("ac-new-school");x&&(d.school_id=x);try{let h=await w.post("console/users",d);r.close(),v(`The account "${c}" was created.`,"success"),typeof t=="function"?t(h?.data):e?.rerender&&e.rerender()}catch(h){v(h.message,"error")}}),r}var Ut={id:"users",path:"/users",title:"Users & Access",description:"Accounts, roles and access \u2014 separated by the population each list serves.",permission:["platform.users.read","school.users.read"],async render(e,a){e.innerHTML=`<div class="ac-stack" data-ac-users-hub>${H(3)}</div>`;let t;try{t=await w.get("console/users?limit=200")}catch(u){e.querySelector("[data-ac-users-hub]").innerHTML=D({title:"The accounts could not be loaded",message:u.message});return}let n=Array.isArray(t?.data)?t.data:[],s=u=>n.filter(d=>d.role===u).length,r=u=>n.filter(d=>d.role===u&&d.status==="active").length,p=n.filter(u=>!u.lastLogin).length,i=n.filter(u=>u.status==="suspended").length,l=a.isPlatform,c=({href:u,icon:d,title:m,desc:g,count:f,activeCount:x})=>`
			<a class="ac-role-card" href="${o(u)}">
				<span class="ac-role-card__icon">${d}</span>
				<p class="ac-role-card__title">${o(m)}</p>
				<p class="ac-role-card__desc">${o(g)}</p>
				<p class="ac-role-card__count">${Me(f)} <small>${x!=null?`\xB7 ${Me(x)} active`:"account"}</small></p>
			</a>`;e.querySelector("[data-ac-users-hub]").innerHTML=`
			<div class="ac-grid ac-grid--kpi">
				${S({label:"Accounts in scope",value:Me(n.length),note:"matching the current scope"})}
				${S({label:"Never signed in",value:Me(p),note:"provisioned, unused",tone:p>0?"warning":"",tooltip:"Accounts with no recorded sign-in. They may be waiting for the person to use them."})}
				${S({label:"Suspended",value:Me(i),note:"no access",tone:i>0?"warning":""})}
			</div>

			<div class="ac-section">
				<h2 class="ac-section__title">Manage accounts</h2>
				<p class="ac-section__hint">Each population has its own page, its own filters and its own actions.</p>
			</div>

			<div class="ac-quick-actions" style="margin-bottom:16px">
				<button type="button" class="ac-quick-action" data-ac-add-account>Add an account</button>
			</div>

			<div class="ac-role-cards">
				${c({href:"#/users/teachers",icon:'<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/></svg>',title:"Teachers",desc:"The teaching staff. Their classes, subjects and content.",count:s("teacher"),activeCount:r("teacher")})}
				${c({href:"#/users/students",icon:'<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>',title:"Students",desc:"The enrolled pupils, their class and their activity.",count:s("student"),activeCount:r("student")})}
				${c({href:"#/users/administrators",icon:'<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',title:l?"Directors & platform administrators":"Directors",desc:l?"The school directors, and the platform administrators who reach every organization.":"The people who administer this school.",count:s("admin")+s("super_admin"),activeCount:r("admin")+r("super_admin")})}
			</div>

			${p>0?`<div class="ac-alert ac-alert--warning" style="margin-top:16px">
						<div class="ac-alert__body">
							<p class="ac-alert__title">${Me(p)} account(s) have never signed in</p>
							<p class="ac-alert__text">They may be waiting to be used, or they may have been provisioned in error. Open the relevant page to review them.</p>
						</div>
					</div>`:""}`,e.querySelector("[data-ac-add-account]")?.addEventListener("click",()=>{ia({ctx:a})})}};function Me(e){let a=Number(e);return Number.isFinite(a)?a.toLocaleString():"0"}var Ft=25;async function Ne({host:e,ctx:a,role:t,title:n,subtitle:s,columns:r,emptyMessage:p,state:i,extraFilters:l=[]}){e.innerHTML=`
		${F({fields:`<div class="ac-field">
				<label class="ac-field__label" for="ac-user-search">Search</label>
				<input class="ac-input" id="ac-user-search" type="search" placeholder="Name, username, email\u2026" value="${o(i.search||"")}" autocomplete="off" />
			</div>
			<div class="ac-field">
				<label class="ac-field__label" for="ac-user-status">Status</label>
				<select class="ac-select" id="ac-user-status">
					<option value="">All statuses</option>
					<option value="active"${i.status==="active"?" selected":""}>Active</option>
					<option value="inactive"${i.status==="inactive"?" selected":""}>Inactive</option>
					<option value="suspended"${i.status==="suspended"?" selected":""}>Suspended</option>
				</select>
			</div>
			${l.map(g=>`<div class="ac-field">
					<label class="ac-field__label" for="${o(g.id)}">${o(g.label)}</label>
					<select class="ac-select" id="${o(g.id)}">
						${g.options.map(f=>`<option value="${o(f.value)}"${String(i[g.key]??"")===String(f.value)?" selected":""}>${o(f.label)}</option>`).join("")}
					</select>
				</div>`).join("")}`,actions:'<button type="button" class="ac-btn" data-ac-user-refresh>Refresh</button>'})}
		<section class="ac-panel">
			<div class="ac-panel__header">
				<div class="ac-panel__titles">
					<h3 class="ac-panel__title">${o(n)}</h3>
					<p class="ac-panel__subtitle">${o(s)}</p>
				</div>
				<div class="ac-panel__actions">
					<button type="button" class="ac-btn ac-btn--sm ac-btn--primary" data-ac-user-add>
						Add an account
					</button>
				</div>
			</div>
			<div class="ac-panel__body ac-panel__body--flush" data-ac-user-table>
				${H(5)}
			</div>
		</section>`;let c=e.querySelector("[data-ac-user-table]"),u=async()=>{c.innerHTML=H(5);let g;try{g=await w.get("console/users",{role:t,search:i.search||void 0,status:i.status||void 0,...i.schoolId?{school_id:i.schoolId}:{},limit:Ft,offset:i.offset||0})}catch(h){c.innerHTML=D({title:"The accounts could not be loaded",message:h.message});return}let f=g?.data||[],x=a.canAny(["platform.users.manage","school.users.manage"]);c.innerHTML=f.length===0?R({title:"No accounts",message:p}):C({columns:[...r,{key:"actions",label:"Actions",align:"right",render:h=>oe(Pt(h,{canManage:x}))}],rows:f,rowHref:h=>`#/users/${h.id}`}),Te(c,{open:h=>{window.location.hash=`#/users/${h}`},"toggle-status":async h=>{let b=f.find(q=>q.id===h);if(!b)return;let k=b.status==="active";if(await M({title:k?`Suspend "${b.username}"?`:`Reactivate "${b.username}"?`,message:k?"The account keeps everything it owns, but it can no longer sign in. The action is recorded in the audit trail.":"The account can sign in again immediately. The action is recorded in the audit trail.",confirmLabel:k?"Suspend the account":"Reactivate the account",danger:k}))try{await w.patch(`console/users/${encodeURIComponent(h)}`,{status:k?"suspended":"active",reason:k?"Suspended from the account roster":"Reactivated from the account roster"}),v(k?"The account was suspended.":"The account was reactivated.","success"),u()}catch(q){v(q.message,"error")}},delete:async h=>{let b=f.find(T=>T.id===h);if(!(!b||!await M({title:`Delete "${b.username}"?`,message:"The account is removed, together with its sessions and its results. This cannot be undone \u2014 suspending the account keeps the record if you only need to end the access.",confirmLabel:"Delete the account",danger:!0})))try{await w.del(`console/users/${encodeURIComponent(h)}`),v("The account was deleted.","success"),u()}catch(T){v(T.message,"error")}}}),c.insertAdjacentHTML("beforeend",ie({total:g?.total||0,limit:g?.limit||Ft,offset:g?.offset||0,onPage:h=>{i.offset=h,u()}}))},d=e.querySelector("#ac-user-search"),m=null;d.addEventListener("input",()=>{window.clearTimeout(m),m=window.setTimeout(()=>{i.search=d.value.trim(),i.offset=0,u()},320)}),e.querySelector("#ac-user-status").addEventListener("change",g=>{i.status=g.target.value,i.offset=0,u()});for(let g of l)e.querySelector(`#${g.id}`).addEventListener("change",f=>{i[g.key]=f.target.value,i.offset=0,u()});e.querySelector("[data-ac-user-refresh]").addEventListener("click",u),e.querySelector("[data-ac-user-add]")?.addEventListener("click",()=>{ia({ctx:a,role:t,onCreated:()=>{i.offset=0,u()}})}),await u()}var Ma=e=>`<span class="ac-badge ac-badge--${e.status==="active"?"success":e.status==="suspended"?"danger":"warning"}">${o(e.status)}</span>`,Na=e=>e.lastLogin?`<span title="${o(N(e.lastLogin))}">${o(U(e.lastLogin))}</span>`:'<span class="ac-badge ac-badge--warning">never</span>',Gt=[{key:"name",label:"Teacher",render:e=>`<span class="ac-table__primary">${o(e.name||e.username)}</span><br><span class="ac-table__muted">${o(e.username)}${e.email?` \xB7 ${o(e.email)}`:""}</span>`},{key:"status",label:"Status",render:Ma},{key:"schoolName",label:"Organization",render:e=>o(e.schoolName||"\u2014")},{key:"lastLogin",label:"Last sign-in",render:Na},{key:"createdAt",label:"Created",render:e=>o(N(e.createdAt,{withTime:!1}))}],Wt=[{key:"name",label:"Student",render:e=>`<span class="ac-table__primary">${o(e.name||e.username)}</span><br><span class="ac-table__muted">${o(e.username)}${e.numero?` \xB7 #${o(e.numero)}`:""}</span>`},{key:"status",label:"Status",render:Ma},{key:"className",label:"Class",render:e=>o(e.className||"\u2014")},{key:"schoolName",label:"Organization",render:e=>o(e.schoolName||"\u2014")},{key:"lastLogin",label:"Last sign-in",render:Na}],Yt=[{key:"name",label:"Administrator",render:e=>`<span class="ac-table__primary">${o(e.name||e.username)}</span><br><span class="ac-table__muted">${o(e.username)}</span>`},{key:"role",label:"Level",render:e=>`<span class="ac-badge ${e.role==="super_admin"?"ac-badge--violet":"ac-badge--brand"}">${o(e.role==="super_admin"?"Platform":"Organization")}</span>`},{key:"status",label:"Status",render:Ma},{key:"schoolName",label:"Organization",render:e=>o(e.schoolName||"\u2014")},{key:"lastLogin",label:"Last sign-in",render:Na}];var Sn={search:"",status:"",offset:0},Qt={id:"users-teachers",path:"/users/teachers",title:"Teachers",description:"The teaching staff, their activity and their access.",permission:["platform.users.read","school.users.read"],async render(e,a){await Ne({host:e,ctx:a,role:"teacher",title:"Teachers",subtitle:"Every teacher account in scope. Open an account to change its status, role or permissions.",columns:Gt,emptyMessage:"No teacher account matches the current filters.",state:Sn})}};var Tn={search:"",status:"",offset:0},Vt={id:"users-students",path:"/users/students",title:"Students",description:"The enrolled pupils, their class and their activity.",permission:["platform.users.read","school.users.read"],async render(e,a){await Ne({host:e,ctx:a,role:"student",title:"Students",subtitle:"Every student account in scope. Open an account to change its status, role or permissions.",columns:Wt,emptyMessage:"No student account matches the current filters.",state:Tn})}};var An={search:"",status:"",offset:0},Kt={id:"users-administrators",path:"/users/administrators",title:"Directors & administrators",description:"The accounts that can administer \u2014 the school director, and on a SaaS deployment the platform administrators.",permission:["platform.users.read","school.users.read"],async render(e,a){await Ne({host:e,ctx:a,role:"admin,super_admin",title:a.isPlatform?"Directors & platform administrators":"Directors",subtitle:a.isPlatform?"A platform administrator reaches every organization; an organization administrator reaches only their own.":"The accounts that administer this school.",columns:Yt,emptyMessage:"No administrator account matches the current filters.",state:An})}};var Jt={id:"analytics",path:"/analytics",title:"Platform Analytics",description:"Adoption, engagement and usage of the platform \u2014 aggregated across organizations, never per class.",permission:["platform.analytics.read","school.analytics.read"],async render(e,a){let t=a.getState();e.innerHTML=`<div class="ac-stack" data-ac-analytics>
			${sa({value:t.period})}
			<div data-ac-kpis class="ac-grid ac-grid--kpi">${H(1)}</div>
			<div data-ac-sections class="ac-stack"></div>
		</div>`;let n={period:t.period==="year"?"year":t.period};t.period==="custom"&&t.customRange&&(n.from=t.customRange.from,n.to=t.customRange.to);let s,r,p;try{[s,r,p]=await Promise.all([w.get("console/overview",n),w.get("console/trends",n),w.get("console/organizations",{limit:100,offset:0})])}catch(x){e.querySelector("[data-ac-sections]").innerHTML=D({message:x.message});return}let i=s.data,l=i.sections.glance,c=i.sections.activity,u=i.sections.content,d=i.meta.definitions;e.querySelector("[data-ac-kpis]").innerHTML=[S({label:"Organizations",value:_(l.organizations.total),note:`${l.organizations.active} active`,tooltip:"Organizations in the current scope."}),S({label:"Teacher adoption",value:l.users.teachers>0?`${Math.round(l.users.activeTeachers/l.users.teachers*100)}%`:"\u2014",note:`${_(l.users.activeTeachers)} of ${_(l.users.teachers)} teachers active`,tone:"success",tooltip:d.activeTeacher}),S({label:"Student participation",value:l.users.students>0?`${Math.round(c.participatingStudents/l.users.students*100)}%`:"\u2014",note:`${_(c.participatingStudents)} of ${_(l.users.students)} students took part`,tone:"primary",tooltip:"Students with at least one completed attempt in the period, over the number of enrolled students. Attempts and unique students are reported separately and never conflated."}),S({label:"Attempts per student",value:c.participatingStudents>0?(c.attempts/c.participatingStudents).toFixed(1):"\u2014",note:`${_(c.attempts)} attempts`,tooltip:"Total completed attempts divided by the number of unique students who made at least one. A value above 1 means students attempted more than once on average."}),S({label:"Average score",value:c.averageScore20==null?"\u2014":c.averageScore20.toFixed(2),note:`/20 per formal attempt \xB7 ${_(c.averageScoreSample)} attempts`,tone:"primary",tooltip:d.averageScore}),S({label:"Content authored",value:_(u.questions+u.exams+u.courses),note:`${_(u.questions)} questions \xB7 ${_(u.exams)} exams \xB7 ${_(u.courses)} courses`,tooltip:"Content created in the selected period. The question and course totals are all-time row counts; the exam and course counts respect the period."})].join("");let m=r?.data?.series,g=m?m.labels.map((x,h)=>({label:x,formalAttempts:m.formalAttempts[h]||0,trainingAttempts:m.trainingAttempts[h]||0,gameAttempts:m.gameAttempts[h]||0,newTeachers:m.newTeachers[h]||0,newStudents:m.newStudents[h]||0})):[],f=(p?.data||[]).slice(0,10);e.querySelector("[data-ac-sections]").innerHTML=`
			<div class="ac-section">
				<h2 class="ac-section__title">Educational activity</h2>
				<p class="ac-section__hint">Completed attempts by mode, over ${o(r?.data?.meta?.periodLabel||"the selected period")}.</p>
			</div>
			<div class="ac-grid ac-grid--2">
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles">
							<h3 class="ac-panel__title">Attempts by mode</h3>
							<p class="ac-panel__subtitle">Training and game attempts are kept separate from formal exams.</p>
						</div>
					</div>
					<div class="ac-panel__body">
						${g.length?`${ne([{label:"Formal exams",tone:"primary"},{label:"Training",tone:"info"},{label:"Games",tone:"violet"}])}${pe({points:g,series:[{key:"formalAttempts",label:"Formal exams",tone:"primary"},{key:"trainingAttempts",label:"Training",tone:"info"},{key:"gameAttempts",label:"Games",tone:"violet"}],labelKey:"label",ariaLabel:"Attempts by mode over time"})}`:R({title:"No attempts recorded",message:"No completed attempts fall inside the selected period."})}
					</div>
				</section>
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles">
							<h3 class="ac-panel__title">Account growth</h3>
							<p class="ac-panel__subtitle">New accounts, so the reader can separate growth from activity.</p>
						</div>
					</div>
					<div class="ac-panel__body">
						${g.length?`${ne([{label:"Teachers",tone:"success"},{label:"Students",tone:"warning"}])}${pe({points:g,series:[{key:"newTeachers",label:"Teachers",tone:"success"},{key:"newStudents",label:"Students",tone:"warning"}],labelKey:"label",ariaLabel:"New accounts over time"})}`:R({title:"No accounts created",message:"No accounts were created inside the selected period."})}
					</div>
				</section>
			</div>

			<div class="ac-section">
				<h2 class="ac-section__title">Organizational comparison</h2>
				<p class="ac-section__hint">Which organizations are using the platform, and how much.</p>
			</div>
			<div class="ac-grid ac-grid--2">
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles">
							<h3 class="ac-panel__title">Active students by organization</h3>
							<p class="ac-panel__subtitle">Last 30 days. Highest first.</p>
						</div>
					</div>
					<div class="ac-panel__body">
						${f.length?X({rows:f.map(x=>({label:x.name,value:x.activeStudents||0})),value:"value",label:x=>x.label,display:x=>_(x),ariaLabel:"Active students by organization"}):R({title:"No organizations to compare",message:"The current scope contains no organization with recorded usage."})}
					</div>
				</section>
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles">
							<h3 class="ac-panel__title">Adoption by organization</h3>
							<p class="ac-panel__subtitle">Teachers and students per organization.</p>
						</div>
					</div>
					<div class="ac-panel__body">
						${f.length?St({rows:f.map(x=>({label:x.name,teachers:x.teachers||0,students:x.students||0})),series:[{key:"teachers",label:"Teachers",tone:"success"},{key:"students",label:"Students",tone:"primary"}],label:x=>x.label,ariaLabel:"Teachers and students by organization"}):R({title:"No organizations to compare",message:"The current scope contains no organization with recorded accounts."})}
					</div>
				</section>
			</div>

			<div class="ac-section">
				<h2 class="ac-section__title">Content & adoption</h2>
				<p class="ac-section__hint">What the platform is being used to create and to play.</p>
			</div>
			<div class="ac-grid ac-grid--3">
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles"><h3 class="ac-panel__title">Question bank</h3></div>
					</div>
					<div class="ac-panel__body">
						<div class="ac-defs">
							<div class="ac-defs__item">
								<p class="ac-defs__term">Questions</p>
								<p class="ac-defs__desc">${_(u.questions)}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Classes</p>
								<p class="ac-defs__desc">${_(u.classes)}</p>
							</div>
						</div>
						<p class="ac-empty__message" style="margin:12px 0 0;font-size:12px">${o(u.note)}</p>
					</div>
				</section>
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles"><h3 class="ac-panel__title">Assessments</h3></div>
					</div>
					<div class="ac-panel__body">
						<div class="ac-defs">
							<div class="ac-defs__item">
								<p class="ac-defs__term">Exams created</p>
								<p class="ac-defs__desc">${_(u.exams)}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Published exams</p>
								<p class="ac-defs__desc">${_(u.activeExams)}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Conducted in period</p>
								<p class="ac-defs__desc">${_(c.examsConducted)}</p>
							</div>
						</div>
					</div>
				</section>
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles"><h3 class="ac-panel__title">Games & courses</h3></div>
					</div>
					<div class="ac-panel__body">
						<div class="ac-defs">
							<div class="ac-defs__item">
								<p class="ac-defs__term">Courses created</p>
								<p class="ac-defs__desc">${_(u.courses)}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Games created</p>
								<p class="ac-defs__desc">${_(u.games)}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Kids games created</p>
								<p class="ac-defs__desc">${_(u.kidsGames)}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Game sessions played</p>
								<p class="ac-defs__desc">${_(c.gameSessions+c.kidsGameSessions)}</p>
							</div>
						</div>
					</div>
				</section>
			</div>`,Pe(e,"period",x=>{if(x==="custom"){let h=prompt("From (YYYY-MM-DD)",new Date(Date.now()-2592e6).toISOString().slice(0,10));if(!h)return;let b=prompt("To (YYYY-MM-DD)",new Date().toISOString().slice(0,10));if(!b)return;a.setPeriod("custom",{from:h,to:b});return}a.setPeriod(x)})}};var Zt={id:"teaching",path:"/teaching",title:"Teaching & Learning",description:"Teacher activity, class performance and student outcomes across every organization in scope.",permission:["platform.analytics.read","school.analytics.read"],async render(e,a){let t=a.getState(),n=t.targetSchoolId||"";e.innerHTML=`<div class="ac-stack">${H(4)}</div>`;let s={period:t.period};t.period==="custom"&&t.customRange&&(s.from=t.customRange.from,s.to=t.customRange.to),n&&(s.school_id=n);let r;try{r=(await w.get("console/teaching",s)).data}catch($){if(($.status===403||$.status===404)&&n){Aa(null),a.rerender();return}e.innerHTML=D({message:$.message}),e.querySelector("[data-ac-retry]")?.addEventListener("click",()=>a.rerender());return}let p=r.sections,i=r.meta,l=Array.isArray(i.scope.organizations)?i.scope.organizations:[],c=new Map(l.map($=>[$.id,$.name])),u=l.length>1,d=l.length>1?ee({id:"ac-teaching-org",label:"Organization",options:l.map($=>({value:$.id,label:$.name})),value:n,includeAll:!0,allLabel:"All organizations"}):"";e.innerHTML=`<div class="ac-stack">
			${F({chips:za({options:ja,value:t.period,name:"period"}),fields:d,actions:'<button type="button" class="ac-btn" data-ac-refresh>Refresh</button>'})}
			<div data-ac-kpis class="ac-grid ac-grid--kpi"></div>
			<div data-ac-sections class="ac-stack"></div>
		</div>`,e.querySelector("#ac-teaching-org")?.addEventListener("change",$=>{Aa($.target.value||null),a.rerender()}),e.querySelector("[data-ac-refresh]")?.addEventListener("click",()=>a.rerender());let m=p.glance,g=p.achievement,f=p.content,x=m.participationRate,h=g.avgExamScore,b=g.passRate;e.querySelector("[data-ac-kpis]").innerHTML=[S({label:"Students",value:_(m.totalStudents.value),note:"enrolled now",tooltip:"Student accounts in the current scope. A current-state total: it is not narrowed by the reporting period."}),S({label:"Teachers",value:_(m.totalTeachers.value),note:"accounts in scope",tooltip:"Teacher accounts in the current scope (current-state)."}),S({label:"Classes",value:_(m.totalClasses.value),note:"classes in scope",tooltip:"Classes in the current scope (current-state)."}),S({label:"Participation",value:x.value==null?"\u2014":`${x.value}%`,note:`${_(x.numerator)} of ${_(x.denominator)} students active`,tone:x.value==null?"":"primary",tooltip:"Unique students with at least one completed attempt (exam, training, game or tournament) in the period, over the enrolled population."}),S({label:"Active students",value:_(m.activeStudents.value),note:"took part in the period",tooltip:"Distinct students with at least one qualifying attempt in the reporting window."}),S({label:"Average score",value:h.value==null?"\u2014":h.value.toFixed(2),note:h.sample>0?`/20 over ${_(h.sample)} attempts`:"no formal attempts",tone:h.value==null?"":"primary",tooltip:"Mean final score of formal exam attempts in the period, rescaled from the stored 0\u2013100 to the familiar /20. Training, games and tournaments are excluded."}),S({label:"Pass rate",value:b.value==null?"\u2014":`${b.value}%`,note:`${_(b.passed)} of ${_(b.total)} attempts passed`,tone:b.value==null?"":b.value>=50?"success":"warning",tooltip:"Formal exam attempts that passed over all formal attempts. Passing uses the exam-configured threshold (default 10/20)."}),S({label:"Assessments conducted",value:_(g.examsConducted.value),note:"distinct exams sat",tooltip:"Distinct formal exams with at least one finalized result in the period."})].join("");let k=[...p.teacherInsights.teacherActivity||[]].sort(($,Ce)=>Ce.assessmentActivity-$.assessmentActivity||Ce.questionsCreated-$.questionsCreated||$.name.localeCompare(Ce.name)),T=[{key:"name",label:"Teacher",render:$=>`<span class="ac-table__primary">${o($.name)}</span>${$.status&&$.status!=="active"?` <span class="ac-table__muted">(${o($.status)})</span>`:""}`},...u?[{key:"schoolName",label:"Organization",render:$=>`<span class="ac-table__muted">${o($.schoolName||c.get($.schoolId)||"\u2014")}</span>`}]:[],{key:"questionsCreated",label:"Questions",align:"right",render:$=>_($.questionsCreated)},{key:"examsCreated",label:"Exams",align:"right",render:$=>_($.examsCreated)},{key:"classesManaged",label:"Classes",align:"right",render:$=>$.classesManaged?`<span title="${o($.classNames.join(", "))}">${_($.classesManaged)}</span>`:"0"},{key:"assessmentActivity",label:"Assessments",align:"right",render:$=>_($.assessmentActivity)},{key:"avgScore20",label:"Avg /20",align:"right",render:$=>$.avgScore20==null?"\u2014":$.avgScore20.toFixed(2)},{key:"passRate",label:"Pass rate",align:"right",render:$=>$.passRate==null?"\u2014":`${$.passRate}%`}],q=(g.classComparison||[]).filter($=>$.avgScore20!=null),z=$=>u?`${$.className} \xB7 ${c.get($.schoolId)||"Organization"}`:$.className,L=q.length?`${ne([{label:"Class mean /20",tone:"primary"}])}${X({rows:q.map($=>({...$,chartLabel:z($)})),value:"avgScore20",max:20,threshold:10,label:$=>`${$.chartLabel} (n=${$.sample})`,display:$=>`${Number($).toFixed(1)}/20`,ariaLabel:"Average formal exam score by class"})}`:R({title:"No formal results yet",message:"No class has a finalized formal exam result in the selected period."}),I=p.teacherInsights.classesNeedingAttention||[],W=I.length?`<div class="ac-defs">${I.map($=>`<div class="ac-defs__item">
							<p class="ac-defs__term">${o($.className)}${u?` <span class="ac-table__muted">\xB7 ${o($.schoolName||c.get($.schoolId)||"")}</span>`:""}</p>
							<p class="ac-defs__desc">${o($.reasons.join(" \xB7 "))} \xB7 mean ${$.avgScore20==null?"\u2014":$.avgScore20}/20 over ${_($.sample)} attempts</p>
						</div>`).join("")}</div>`:R({title:"No class is below the attention thresholds",message:"Attention is raised when a class has enough results to trust and either a mean below 8/20 or a pass rate below 40%."}),be=g.scoreDistribution||[],ve=h.sample>0?`${Tt({buckets:be.map($=>({label:$.label,count:$.count})),ariaLabel:"Formal exam score distribution"})}
					<div class="ac-defs" style="margin-top:10px">${be.map($=>`<div class="ac-defs__item">
								<p class="ac-defs__term">${o($.label)}</p>
								<p class="ac-defs__desc">${_($.count)} attempts${$.pct==null?"":` \xB7 ${$.pct}%`}</p>
							</div>`).join("")}</div>`:R({title:"No formal attempts to distribute",message:"Score bands need at least one finalized formal exam attempt in the period."}),ye=g.certifiedStudents.value||0,Le=g.pendingSuccess.value||0,xa=ye+Le>0?`${At({segments:[{label:"Passed at least one exam",value:ye,tone:"success"},{label:"Still pending success",value:Le,tone:"warning"}],centerValue:String(ye+Le),centerLabel:"students assessed",ariaLabel:"Certified and pending students"})}
					${ne([{label:`Certified (${ye})`,tone:"success"},{label:`Pending (${Le})`,tone:"warning"}])}`:R({title:"No student sat a formal exam",message:"Certification compares students who passed an exam with those who sat one but did not."}),De=p.engagement.activityTrend||{points:[]},tt=(De.points||[]).map($=>({label:$.period,exam:$.exam||0,training:$.training||0,game:$.game||0,tournament:$.tournament||0})),nn=tt.length?`${ne([{label:"Formal exams",tone:"primary"},{label:"Training",tone:"info"},{label:"Games",tone:"violet"},{label:"Tournaments",tone:"warning"}])}${pe({points:tt,series:[{key:"exam",label:"Formal exams",tone:"primary"},{key:"training",label:"Training",tone:"info"},{key:"game",label:"Games",tone:"violet"},{key:"tournament",label:"Tournaments",tone:"warning"}],labelKey:"label",ariaLabel:"Learning activity by mode over time"})}`:R({title:"No activity in the period",message:"No completed attempt falls inside the selected reporting window."}),Ze=p.engagement,st=f.contentCoverage||{},nt=Object.values(i.unavailable||{}),rn=`<div class="ac-defs">
			<div class="ac-defs__item">
				<p class="ac-defs__term">Average score</p>
				<p class="ac-defs__desc">Formal exam attempts only, stored 0\u2013100 rescaled to /20. Training, games and tournaments are separate.</p>
			</div>
			<div class="ac-defs__item">
				<p class="ac-defs__term">Pass rate</p>
				<p class="ac-defs__desc">Formal attempts marked passed over all formal attempts in the period. Threshold is the exam's own pass mark (default 10/20).</p>
			</div>
			<div class="ac-defs__item">
				<p class="ac-defs__term">Teacher activity</p>
				<p class="ac-defs__desc">Questions and exams the teacher authored (all time), the classes assigned to them, and the formal results of exams they created inside the period.</p>
			</div>
			<div class="ac-defs__item">
				<p class="ac-defs__term">Class attribution</p>
				<p class="ac-defs__desc">Results carry no class column, so a result belongs to the class of the student account that sat it. Students without a class are grouped as \u201CUnassigned\u201D.</p>
			</div>
			<div class="ac-defs__item">
				<p class="ac-defs__term">Reliable ranking</p>
				<p class="ac-defs__desc">A class needs at least ${_(g.minSampleForRank)} finalized attempts before it is ranked or flagged; smaller samples are still shown, never ranked confidently.</p>
			</div>
			${nt.length?`<div class="ac-defs__item">
							<p class="ac-defs__term">Not measurable</p>
							<p class="ac-defs__desc">${nt.map($=>o($)).join(" ")}</p>
						</div>`:""}
		</div>`;e.querySelector("[data-ac-sections]").innerHTML=`
			<div class="ac-section">
				<h2 class="ac-section__title">Teachers & classrooms</h2>
				<p class="ac-section__hint">Who teaches, what they author, and how their classes perform in ${o(i.scope.periodLabel||"the selected period")}${u?` \xB7 ${o(n?c.get(n)||"the selected organization":"all organizations")}`:""}.</p>
			</div>
			<section class="ac-panel">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title">Teacher activity</h3>
						<p class="ac-panel__subtitle">Active teachers first. \u201CAssessments\u201D counts formal results for exams the teacher created.</p>
					</div>
				</div>
				<div class="ac-panel__body ac-panel__body--flush">
					${C({columns:T,rows:k,empty:"No teacher account exists in the current scope."})}
				</div>
			</section>

			${re({title:"Class performance",subtitle:"Mean formal score per class. The dashed line is the 10/20 pass mark; n is the number of attempts.",body:L})}

			<div class="ac-grid ac-grid--2">
				${re({title:"Classes needing attention",subtitle:`Classes with at least ${_(g.minSampleForRank)} attempts and a low mean or low pass rate.`,body:W})}
				${re({title:"Score distribution",subtitle:"Formal exam attempts per score band, /20.",body:ve})}
			</div>

			<div class="ac-grid ac-grid--2">
				${re({title:"Certification",subtitle:"Students who passed at least one formal exam vs. those who sat one and have not.",body:xa})}
				${re({title:"Learning activity",subtitle:`Completed attempts by mode, ${De.granularity==="week"?"weekly":"daily"} over the period.`,body:nn})}
			</div>

			<div class="ac-section">
				<h2 class="ac-section__title">Content & participation</h2>
				<p class="ac-section__hint">The material behind the activity, and the live game surface.</p>
			</div>
			<div class="ac-grid ac-grid--3">
				${re({title:"Question bank",subtitle:"Authored content in the current scope.",body:`<div class="ac-defs">
						<div class="ac-defs__item">
							<p class="ac-defs__term">Questions</p>
							<p class="ac-defs__desc">${_(f.totalQuestions.value)}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Active exams</p>
							<p class="ac-defs__desc">${_(f.activeExams.value)}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Categories used</p>
							<p class="ac-defs__desc">${_(st.categoriesWithQuestions)} of ${_(st.totalCategories)}</p>
						</div>
					</div>`})}
				${re({title:"Participation",subtitle:"Students, not attempt counts.",body:`<div class="ac-defs">
						<div class="ac-defs__item">
							<p class="ac-defs__term">Active students</p>
							<p class="ac-defs__desc">${_(m.activeStudents.value)}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Participation rate</p>
							<p class="ac-defs__desc">${x.value==null?"\u2014":`${x.value}%`}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Needing attention</p>
							<p class="ac-defs__desc">${_(m.studentsNeedingAttention.value)}</p>
						</div>
						<p class="ac-empty__message" style="margin:8px 0 0;font-size:12px">${o(m.studentsNeedingAttention.rule)}</p>
					</div>`})}
				${re({title:"Games & tournaments",subtitle:"Live snapshots \u2014 never date-filtered.",body:`<div class="ac-defs">
						<div class="ac-defs__item">
							<p class="ac-defs__term">Game lobbies waiting</p>
							<p class="ac-defs__desc">${_(Ze.gameLobbies.value)}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Live games</p>
							<p class="ac-defs__desc">${_(Ze.liveGames.value)}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Tournaments</p>
							<p class="ac-defs__desc">${_(Ze.activeTournaments.value)} active of ${_(Ze.totalTournaments.value)}</p>
						</div>
					</div>`})}
			</div>

			${re({title:"How these numbers are computed",subtitle:"The console never guesses. Every metric names its population and its window.",body:rn})}`,Pe(e,"period",$=>{if($==="custom"){let Ce=prompt("From (YYYY-MM-DD)",new Date(Date.now()-2592e6).toISOString().slice(0,10));if(!Ce)return;let rt=prompt("To (YYYY-MM-DD)",new Date().toISOString().slice(0,10));if(!rt)return;a.setPeriod("custom",{from:Ce,to:rt});return}a.setPeriod($)})}};var qn=25,P={stream:"actions",search:"",action:"",entityType:"",eventType:"",outcome:"",severity:"",offset:0},Xt={id:"audit",path:"/audit",title:"Activity & Audit",description:"Every administrative action and every authentication event, searchable and traceable.",permission:["platform.audit.read","school.audit.read"],async render(e,a){e.innerHTML=`
			${F({chips:`<div class="ac-chip-group" role="group" aria-label="Trail">
					<button type="button" class="ac-chip is-active" data-ac-stream="actions">Administrative actions</button>
					<button type="button" class="ac-chip" data-ac-stream="security">Security events</button>
				</div>`,fields:_e({id:"ac-audit-search",placeholder:"Search the trail\u2026",value:P.search}),filters:"<span data-ac-audit-filters></span>",actions:'<button type="button" class="ac-btn" data-ac-refresh>Refresh</button>'})}
			<div class="ac-grid ac-grid--kpi" data-ac-audit-kpis></div>
			<section class="ac-panel" style="margin-top:16px">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title" data-ac-audit-title>Administrative actions</h3>
						<p class="ac-panel__subtitle" data-ac-audit-subtitle></p>
					</div>
				</div>
				<div class="ac-panel__body ac-panel__body--flush" data-ac-audit-body>
					${H(5)}
				</div>
			</section>
			<div class="ac-grid ac-grid--2" style="margin-top:16px" data-ac-audit-charts></div>`;let t=e.querySelector("[data-ac-audit-body]"),n=e.querySelector("[data-ac-audit-kpis]"),s=e.querySelector("[data-ac-audit-charts]"),r=e.querySelector("[data-ac-audit-filters]"),p;try{p=await w.get("console/audit/summary")}catch{p={summary:{},facets:{}}}let i=p.facets||{},l=p.summary||{};r.innerHTML=P.stream==="actions"?`${ee({id:"ac-audit-action",label:"Action",value:P.action,includeAll:!0,allLabel:"All actions",options:(i.actions||[]).map(f=>({value:f.value,label:`${f.label} (${f.count})`}))})}
					${ee({id:"ac-audit-entity",label:"Entity",value:P.entityType,includeAll:!0,allLabel:"All entities",options:(i.entityTypes||[]).map(f=>({value:f.value,label:`${f.label} (${f.count})`}))})}`:`${ee({id:"ac-audit-event",label:"Event",value:P.eventType,includeAll:!0,allLabel:"All events",options:(i.securityEventTypes||[]).map(f=>({value:f.value,label:f.label}))})}`,Ln(e,a);let c=l.security||{};n.innerHTML=[S({label:"Failed sign-ins",value:_(c.login_failure||0),tone:(c.login_failure||0)>0?"warning":"",tooltip:"Recorded failed authentication attempts. A concentration on one address or one username is the signal to investigate."}),S({label:"Successful sign-ins",value:_(c.login_success||0),tooltip:"Recorded successful authentication events."}),S({label:"Sessions revoked",value:_(c.session_revoked||0),tone:(c.session_revoked||0)>0?"warning":"",tooltip:"Sessions an administrator forcibly ended."}),S({label:"Denied actions",value:_(l.deniedActions||0),tone:(l.deniedActions||0)>0?"danger":"",tooltip:"Administrative actions that were refused. The refusal is itself recorded."}),S({label:"Password changes",value:_((c.password_change||0)+(c.password_reset||0)),tooltip:"Password changes and recovery-code resets recorded in the security trail."})].join("");let u;try{u=await w.get("console/audit",{stream:P.stream,search:P.search||void 0,action:P.stream==="actions"&&P.action||void 0,entityType:P.stream==="actions"&&P.entityType||void 0,eventType:P.stream==="security"&&P.eventType||void 0,limit:qn,offset:P.offset})}catch(f){t.innerHTML=D({message:f.message});return}e.querySelector("[data-ac-audit-title]").textContent=P.stream==="actions"?"Administrative actions":"Security events",e.querySelector("[data-ac-audit-subtitle]").textContent=P.stream==="actions"?"Every administrative change, with the outcome it produced.":"Every authentication and access-control event, with the source address.",t.innerHTML=P.stream==="actions"?C({columns:[{key:"occurredAt",label:"When",render:f=>`<span title="${o(N(f.occurredAt))}">${o(N(f.occurredAt))}</span>`},{key:"actorName",label:"Actor",render:f=>f.actorName?`<span class="ac-table__primary">${o(f.actorName)}</span><br><span class="ac-table__muted">${o(f.actorRole||"")}</span>`:'<span class="ac-table__muted">system</span>'},{key:"action",label:"Action",render:f=>`<span class="ac-badge">${o(f.actionLabel)}</span>`},{key:"entityType",label:"Entity",render:f=>`${o(f.entityTypeLabel)}<br><span class="ac-table__muted">${o(f.entityId)}</span>`},{key:"outcome",label:"Outcome",render:f=>`<span class="ac-badge ac-badge--${f.outcome==="success"?"success":f.outcome==="denied"?"danger":"warning"}">${o(f.outcome)}</span>`},{key:"severity",label:"Severity",render:f=>`<span class="ac-badge ac-badge--${f.severity==="critical"?"danger":f.severity==="warning"?"warning":""}">${o(f.severity)}</span>`},{key:"schoolName",label:"Organization",render:f=>o(f.schoolName||"\u2014")}],rows:u.data,empty:"No administrative action matches the current filters.",rowClass:f=>f.outcome==="denied"?"ac-row--denied":""}):C({columns:[{key:"occurredAt",label:"When",render:f=>`<span title="${o(N(f.occurredAt))}">${o(N(f.occurredAt))}</span>`},{key:"typeLabel",label:"Event",render:f=>`<span class="ac-badge">${o(f.typeLabel)}</span>`},{key:"username",label:"Account",render:f=>f.userName?`<span class="ac-table__primary">${o(f.userName)}</span><br><span class="ac-table__muted">${o(f.username||"")}</span>`:o(f.username||"\u2014")},{key:"reason",label:"Reason",render:f=>o(f.reason||"\u2014")},{key:"outcome",label:"Outcome",render:f=>`<span class="ac-badge ac-badge--${f.outcome==="success"?"success":f.outcome==="denied"?"danger":"warning"}">${o(f.outcome)}</span>`},{key:"severity",label:"Severity",render:f=>`<span class="ac-badge ac-badge--${f.severity==="critical"?"danger":f.severity==="warning"?"warning":""}">${o(f.severity)}</span>`},{key:"ip",label:"Source",render:f=>o(f.ip||"\u2014")}],rows:u.data,empty:"No security event matches the current filters."}),t.insertAdjacentHTML("beforeend",ie({total:u.total,limit:u.limit,offset:u.offset,onPage:f=>{P.offset=f,a.rerender()}}));let d=l.topFailureSources||{};d.byIp?.length||d.byUsername?.length?s.innerHTML=`
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles">
							<h3 class="ac-panel__title">Failed sign-in sources</h3>
							<p class="ac-panel__subtitle">Top source addresses by attempt count. A concentration may indicate credential stuffing.</p>
						</div>
					</div>
					<div class="ac-panel__body">
						${X({rows:(d.byIp||[]).map(f=>({label:f.ip,value:f.count})),value:"value",label:f=>f.label,display:f=>_(f),tone:"danger",ariaLabel:"Failed sign-ins by source address"})}
					</div>
				</section>
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles">
							<h3 class="ac-panel__title">Targeted usernames</h3>
							<p class="ac-panel__subtitle">Attempted usernames by failure count.</p>
						</div>
					</div>
					<div class="ac-panel__body">
						${X({rows:(d.byUsername||[]).map(f=>({label:f.username,value:f.count})),value:"value",label:f=>f.label,display:f=>_(f),tone:"warning",ariaLabel:"Failed sign-ins by attempted username"})}
					</div>
				</section>`:s.innerHTML="",e.querySelectorAll("[data-ac-stream]").forEach(f=>{f.addEventListener("click",()=>{P.stream=f.dataset.acStream,P.offset=0,a.rerender()})});let m=e.querySelector("#ac-audit-search"),g=null;m.addEventListener("input",()=>{window.clearTimeout(g),g=window.setTimeout(()=>{P.search=m.value.trim(),P.offset=0,a.rerender()},320)}),e.querySelector("[data-ac-refresh]").addEventListener("click",()=>a.rerender())}};function Ln(e,a){let t=e.querySelector("#ac-audit-action");t&&t.addEventListener("change",r=>{P.action=r.target.value,P.offset=0,a.rerender()});let n=e.querySelector("#ac-audit-entity");n&&n.addEventListener("change",r=>{P.entityType=r.target.value,P.offset=0,a.rerender()});let s=e.querySelector("#ac-audit-event");s&&s.addEventListener("change",r=>{P.eventType=r.target.value,P.offset=0,a.rerender()})}var Cn=[{key:"15",label:"15 min"},{key:"60",label:"1 hour"},{key:"360",label:"6 hours"},{key:"1440",label:"24 hours"}],Ra={minutes:"60"},es={id:"health",path:"/health",title:"System Health & Operations",description:"Service availability, error trends, latency, database and storage \u2014 measured, not asserted.",permission:["platform.health.read","school.health.read"],async render(e,a){e.innerHTML=`
			${F({chips:`<div class="ac-chip-group" role="group" aria-label="Window">
					${Cn.map(d=>`<button type="button" class="ac-chip${Ra.minutes===d.key?" is-active":""}" data-ac-window="${d.key}">${o(d.label)}</button>`).join("")}
				</div>`,actions:'<button type="button" class="ac-btn" data-ac-refresh>Refresh</button>'})}
			<div data-ac-health><div class="ac-skeleton-stack" aria-busy="true">
				<div class="ac-skeleton" style="width:45%"></div>
				<div class="ac-skeleton" style="width:100%"></div>
			</div></div>`;let t;try{t=await w.get("console/health",{minutes:Ra.minutes})}catch(d){e.querySelector("[data-ac-health]").innerHTML=D({message:d.message});return}let n=t.data,s=n.sections.api,r=n.sections.latency,p=n.sections.database,i=n.sections.realtime,l=n.sections.storage,c=n.sections.scheduled,u=s.availabilityPercent==null?"":s.availabilityPercent>=99?"success":s.availabilityPercent>=95?"warning":"danger";e.querySelector("[data-ac-health]").innerHTML=`
			<div class="ac-grid ac-grid--kpi">
				${S({label:"API availability",value:s.availabilityPercent==null?"\u2014":`${s.availabilityPercent.toFixed(1)}%`,note:`${_(s.totalCalls)} requests in the window`,tone:u,tooltip:n.meta.notes.availability})}
				${S({label:"Server error rate",value:s.serverErrorRatePercent==null?"\u2014":`${s.serverErrorRatePercent.toFixed(1)}%`,note:`${_(s.serverErrors??0)} server errors`,tone:s.serverErrorRatePercent==null?"":s.serverErrorRatePercent>=1?"danger":s.serverErrorRatePercent>0?"warning":"success",tooltip:"Share of API requests in the window that failed with a 5xx status. This is the measure of service health: a 4xx is a client mistake, not an outage."})}
				${S({label:"Error rate (all)",value:s.errorRatePercent==null?"\u2014":`${s.errorRatePercent.toFixed(1)}%`,note:`${_(s.errors)} failed requests`,tone:s.errorRatePercent==null?"":s.errorRatePercent>=20?"warning":"",tooltip:"Share of API requests in the window that returned a 4xx or 5xx status. A high value here with a low server error rate usually means rejected or expired requests, not an outage."})}
				${S({label:"p95 latency",value:r.available&&r.p95!=null?`${r.p95} ms`:"\u2014",note:r.available&&r.p50!=null?`p50 ${r.p50} ms \xB7 p99 ${r.p99} ms`:"no requests in the window",tone:r.available&&r.p95!=null&&r.p95>1e3?"warning":"",tooltip:n.meta.notes.latency})}
				${S({label:"Database",value:p.available?"Reachable":"Unreachable",note:p.available?`${p.roundTripMs} ms round trip`:p.error||"",tone:p.available?"success":"danger",tooltip:"A live COUNT query against the configured database, plus the row counts of the principal tables."})}
				${S({label:"Uptime",value:U(new Date(n.meta.process.startedAt)),note:`process started ${N(n.meta.process.startedAt)}`,tooltip:"Process uptime. The request log resets with the process, so availability cannot be measured across a restart."})}
				${S({label:"Storage used",value:l.available?`${l.megabytes} MB`:"\u2014",note:l.available?`${_(l.files)} files in uploads`:l.error||"",tooltip:n.meta.notes.storage})}
			</div>

			<div class="ac-section">
				<h2 class="ac-section__title">Request profile</h2>
				<p class="ac-section__hint">Status-code distribution and the endpoints responsible for the failures.</p>
			</div>
			<div class="ac-grid ac-grid--2">
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles">
							<h3 class="ac-panel__title">Status codes</h3>
							<p class="ac-panel__subtitle">Every API response recorded in the window.</p>
						</div>
					</div>
					<div class="ac-panel__body">
						${r.available&&r.statuses?.length?X({rows:r.statuses.map(d=>({label:d.bucket,value:d.count})),value:"value",label:d=>d.label,display:d=>_(d),tone:d=>d.label==="5xx"?"danger":d.label==="4xx"?"warning":"success",ariaLabel:"Response status distribution"}):R({title:"No requests recorded",message:"The request log is empty for this window. It is process-local and starts empty after a restart."})}
					</div>
				</section>
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles">
							<h3 class="ac-panel__title">Storage & realtime</h3>
							<p class="ac-panel__subtitle">On-disk footprint and live connection tracking.</p>
						</div>
					</div>
					<div class="ac-panel__body">
						<div class="ac-defs">
							<div class="ac-defs__item">
								<p class="ac-defs__term">Uploads</p>
								<p class="ac-defs__desc">${l.available?`${l.megabytes} MB`:"\u2014"}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Files</p>
								<p class="ac-defs__desc">${l.available?_(l.files):"\u2014"}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Realtime status</p>
								<p class="ac-defs__desc">${o(i.status||"unknown")}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Tracked connections</p>
								<p class="ac-defs__desc">${_(i.trackedConnections??0)}</p>
							</div>
						</div>
						<p class="ac-empty__message" style="margin:14px 0 0;font-size:12px">${o(l.available?l.directory:l.error||"")}</p>
					</div>
				</section>
			</div>

			<div class="ac-section">
				<h2 class="ac-section__title">Endpoints</h2>
				<p class="ac-section__hint">The twenty busiest endpoints in the window, with their own error rate.</p>
			</div>
			<section class="ac-panel">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title">API traffic</h3>
						<p class="ac-panel__subtitle">Sorted by call volume. Error rate is computed per endpoint.</p>
					</div>
				</div>
				<div class="ac-panel__body ac-panel__body--flush">
					${C({columns:[{key:"method",label:"Method"},{key:"path",label:"Path",render:d=>`<code>${o(d.path)}</code>`},{key:"calls",label:"Calls",align:"right"},{key:"errors",label:"Errors",align:"right"},{key:"errorRatePercent",label:"Error rate",align:"right",render:d=>`<span class="ac-badge ${d.errorRatePercent>=5?"ac-badge--danger":d.errorRatePercent>0?"ac-badge--warning":"ac-badge--success"}">${d.errorRatePercent.toFixed(1)}%</span>`},{key:"averageMs",label:"Avg (ms)",align:"right"}],rows:s.endpoints||[],empty:"No API traffic was recorded in this window."})}
				</div>
			</section>

			<div class="ac-section">
				<h2 class="ac-section__title">Scheduled work</h2>
				<p class="ac-section__hint">${o(c.note||"")}</p>
			</div>
			<section class="ac-panel">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title">Background tasks</h3>
						<p class="ac-panel__subtitle">Each task runs on a fixed interval inside the server process.</p>
					</div>
				</div>
				<div class="ac-panel__body ac-panel__body--flush">
					${C({columns:[{key:"name",label:"Task",render:d=>`<span class="ac-table__primary">${o(d.name)}</span>`},{key:"intervalMinutes",label:"Interval",align:"right",render:d=>`${d.intervalMinutes} min`},{key:"description",label:"Purpose"}],rows:c.tasks||[],empty:"No scheduled task is registered."})}
				</div>
			</section>

			${(s.repeatedLogs||[]).length?`<div class="ac-section">
						<h2 class="ac-section__title">Repeated log entries</h2>
						<p class="ac-section__hint">The same message appearing again and again is usually the real defect.</p>
					</div>
					<section class="ac-panel">
						<div class="ac-panel__header">
							<div class="ac-panel__titles">
								<h3 class="ac-panel__title">Log clusters</h3>
								<p class="ac-panel__subtitle">Grouped by level, message and source. Process-local.</p>
							</div>
						</div>
						<div class="ac-panel__body ac-panel__body--flush">
							${C({columns:[{key:"level",label:"Level",render:d=>`<span class="ac-badge ac-badge--${d.level==="error"||d.level==="fatal"?"danger":d.level==="warn"?"warning":"info"}">${o(d.level)}</span>`},{key:"message",label:"Message"},{key:"source",label:"Source",render:d=>`<code>${o(d.source)}</code>`},{key:"count",label:"Count",align:"right"},{key:"lastAt",label:"Last seen",render:d=>o(N(d.lastAt))}],rows:s.repeatedLogs,empty:"No repeated log entries in this window."})}
						</div>
					</section>`:""}`,e.querySelectorAll("[data-ac-window]").forEach(d=>{d.addEventListener("click",()=>{Ra.minutes=d.dataset.acWindow,a.rerender()})}),e.querySelector("[data-ac-refresh]").addEventListener("click",()=>a.rerender())}};var as={general:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',organization:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6"/></svg>',profile:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',realtime:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14"/></svg>',presets:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 6.2L21 10l-5.4 4 1.6 6.6L12 17l-5.2 3.6L8.4 14 3 10l6.6-1.8z"/></svg>',access:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>',teaching:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/></svg>',data:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.7-4 3-9 3s-9-1.3-9-3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/></svg>',setup:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',ai:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l1.9 5.1L19 9l-5.1 1.9L12 16l-1.9-5.1L5 9l5.1-1.9L12 2z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z"/></svg>',roles:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',deployment:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z"/></svg>'};function ts({sections:e,active:a,collapsed:t=!1}){let n=e.map(s=>{let r=as[s.icon]||as.general,p=s.badge==null?"":`<span class="ac-section-menu__badge">${o(String(s.badge))}</span>`;return`<button type="button" class="ac-section-menu__item${s.id===a?" is-active":""}" data-ac-section="${o(s.id)}" title="${o(s.label)}" aria-current="${s.id===a?"true":"false"}">
				<span class="ac-section-menu__icon">${r}</span>
				<span class="ac-section-menu__label">${o(s.label)}</span>
				${p}
			</button>`}).join("");return`<nav class="ac-section-menu${t?" ac-section-menu--collapsed":""}" aria-label="Settings sections">
		<div class="ac-section-menu__head">
			<span>Sections</span>
			<button type="button" class="ac-section-menu__toggle" data-ac-menu-toggle aria-label="${t?"Expand the section menu":"Collapse the section menu"}" title="${t?"Expand":"Collapse"}">${t?"\xBB":"\xAB"}</button>
		</div>
		<div class="ac-section-menu__list">${n}</div>
	</nav>`}function ss(e,{onSelect:a}){e.querySelectorAll("[data-ac-section]").forEach(n=>{n.addEventListener("click",()=>a(n.dataset.acSection))});let t=e.querySelector("[data-ac-menu-toggle]");t&&t.addEventListener("click",()=>{let n=e.querySelector(".ac-section-menu"),s=e.querySelector(".ac-split");if(!n||!s)return;let r=!n.classList.contains("ac-section-menu--collapsed");n.classList.toggle("ac-section-menu--collapsed",r),s.classList.toggle("ac-split--collapsed",r),t.textContent=r?"\xBB":"\xAB",t.setAttribute("aria-label",r?"Expand the section menu":"Collapse the section menu");try{localStorage.setItem("quizConsoleSettingsMenuCollapsed",r?"1":"0")}catch{}})}function ns(){try{return localStorage.getItem("quizConsoleSettingsMenuCollapsed")==="1"}catch{return!1}}var En=[{value:"primaire",label:"Primaire (Primary)"},{value:"college",label:"Coll\xE8ge (Middle School)"},{value:"lycee",label:"Lyc\xE9e (High School)"},{value:"autre",label:"Autre (Other)"}],rs=[{key:"primaryColor",label:"Primary colour",type:"color",hint:"Buttons, links and highlights across the classroom surface."},{key:"secondaryColor",label:"Secondary colour",type:"color",hint:"The darker companion of the primary colour."},{key:"backgroundColor",label:"Background colour",type:"color",hint:"The page background of the classroom surface."},{key:"textColor",label:"Text colour",type:"color",hint:"The default body text colour."},{key:"inputFocusColor",label:"Input focus colour",type:"color",hint:"The ring shown around a focused input."}],is=[{key:"totalQuestions",label:"Questions per quiz",type:"number",hint:"The default length offered when a teacher creates a quiz."},{key:"timeLimit",label:"Time limit (seconds)",type:"number",hint:"The default countdown of a quiz."},{key:"penalty",label:"Penalty per wrong answer",type:"number",hint:"Points deducted for a wrong answer."}],os=[{key:"welcomeTitle",label:"Welcome title",hint:"Shown above the quiz on the student workspace."},{key:"welcomeMessage",label:"Welcome message",hint:"The line under the welcome title."}];async function cs(e){let[a,t]=await Promise.all([w.get("school/profile/full"),we()]),n=a||{},s=i=>t.get(i)?.value??"",r=[E({title:"Organization information",subtitle:"How this organization appears on the sign-in page, in the classroom header and on the generated documents.",body:`<div class="ac-field-grid">
					${A({id:"set-school-name",label:"Name",value:n.name??"",full:!0,hint:"Shown on the sign-in page and on every generated document."})}
					${O({id:"set-school-type",label:"Type",options:En,value:n.school_type??""})}
					${A({id:"set-school-year",label:"Academic year",value:n.school_year??"",placeholder:"2025-2026",hint:"Also names the year archive."})}
					${A({id:"set-school-city",label:"City",value:n.city??""})}
					${A({id:"set-school-phone",label:"Phone",value:n.phone??""})}
					${A({id:"set-school-email",label:"Email",value:n.email??""})}
					${A({id:"set-school-address",label:"Address",value:n.address??"",full:!0})}
					${A({id:"set-school-logo",label:"Logo URL",value:n.logo_url??"",full:!0,hint:"An absolute URL or a /uploads/\u2026 path."})}
				</div>
				<div class="ac-toolbar" style="margin-bottom:0">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-save-org>Save organization</button>
						<span class="ac-table__muted" data-ac-org-status></span>
					</div>
				</div>`}),E({title:"Quiz defaults",subtitle:"The starting values a teacher gets when creating a quiz.",body:`<div class="ac-field-grid">
					${is.map(i=>A({id:`set-${i.key}`,label:i.label,value:s(i.key),type:i.type,hint:i.hint})).join("")}
				</div>
				<div class="ac-toolbar" style="margin-bottom:0">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-save-quiz>Save quiz defaults</button>
						<span class="ac-table__muted" data-ac-quiz-status></span>
					</div>
				</div>`}),E({title:"Appearance",subtitle:"The colours the classroom surface paints itself with.",body:`<div class="ac-field-grid">
					${rs.map(i=>A({id:`set-${i.key}`,label:i.label,value:s(i.key)||"#2563eb",type:"color",hint:i.hint})).join("")}
				</div>
				<div class="ac-field-grid">
					${os.map(i=>A({id:`set-${i.key}`,label:i.label,value:s(i.key),hint:i.hint})).join("")}
				</div>
				<div class="ac-toolbar" style="margin-bottom:0">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-save-appearance>Save appearance</button>
						<span class="ac-table__muted" data-ac-appearance-status></span>
					</div>
				</div>`})].join("");function p(i){let l=u=>i.querySelector(u);i.querySelector("[data-ac-save-org]")?.addEventListener("click",async()=>{let u=l("[data-ac-org-status]"),d=m=>i.querySelector(`#${m}`)?.value??"";try{await w.put("school/profile",{name:d("set-school-name"),school_type:d("set-school-type"),school_year:d("set-school-year"),city:d("set-school-city"),phone:d("set-school-phone"),email:d("set-school-email"),address:d("set-school-address"),logo_url:d("set-school-logo")}),u&&(u.textContent="Saved."),v("Organization information saved.","success")}catch(m){u&&(u.textContent=m.message),v(m.message,"error")}});let c=async(u,d,m,g)=>{i.querySelector(u)?.addEventListener("click",async()=>{let f=l(d);try{for(let x of m){let h=i.querySelector(`#set-${x}`);if(!h)continue;let b=h.value,k=Number(b);await V(x,h.type==="number"&&b!==""?k:b)}f&&(f.textContent="Saved."),v(g,"success")}catch(x){f&&(f.textContent=x.message),v(x.message,"error")}})};c("[data-ac-save-quiz]","[data-ac-quiz-status]",is.map(u=>u.key),"Quiz defaults saved."),c("[data-ac-save-appearance]","[data-ac-appearance-status]",[...rs,...os].map(u=>u.key),"Appearance saved.")}return{markup:r,bind:p}}var jn=[{value:"",label:"\u2014"},{value:"Mr",label:"Mr"},{value:"Mme",label:"Mme"},{value:"Mlle",label:"Mlle"},{value:"Dr",label:"Dr"}];async function ls(e){let t=(e.session||{}).user||{},n=[E({title:"My profile",subtitle:"Your own account information. The role, the status and the class assignments are managed by an administrator.",body:`<div class="ac-field-grid">
					${O({id:"set-profile-title",label:"Title",options:jn,value:t.title??""})}
					${A({id:"set-profile-name",label:"Full name",value:t.name??""})}
					${A({id:"set-profile-email",label:"Email",value:t.email??"",type:"email"})}
					${A({id:"set-profile-phone",label:"Phone",value:t.phone??"",type:"tel"})}
				</div>
				<div class="ac-defs" style="margin-bottom:14px">
					<div class="ac-defs__item">
						<p class="ac-defs__term">Username</p>
						<p class="ac-defs__desc">${y(t.username||"\u2014")}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Role</p>
						<p class="ac-defs__desc">${y(t.roleLabel||t.role||"\u2014")}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Organization</p>
						<p class="ac-defs__desc">${y(e.organization?.name||t.schoolName||"\u2014")}</p>
					</div>
				</div>
				<div class="ac-toolbar" style="margin-bottom:0">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-save-profile>Save profile</button>
						<span class="ac-table__muted" data-ac-profile-status></span>
					</div>
				</div>`}),E({title:"Change my password",subtitle:"The current password is required. Every other session of this account ends when the password changes.",body:`<div class="ac-field-grid">
					${A({id:"set-profile-current",label:"Current password",type:"password",full:!0})}
					${A({id:"set-profile-new",label:"New password",type:"password",hint:"At least 8 characters."})}
					${A({id:"set-profile-confirm",label:"Confirm new password",type:"password"})}
				</div>
				<div class="ac-toolbar" style="margin-bottom:0">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-change-password>Update password</button>
						<span class="ac-table__muted" data-ac-password-status></span>
					</div>
				</div>`})].join("");function s(r){r.querySelector("[data-ac-save-profile]")?.addEventListener("click",async()=>{let p=r.querySelector("[data-ac-profile-status]"),i=l=>r.querySelector(`#${l}`)?.value??"";try{await w.patch("users/me",{title:i("set-profile-title"),name:i("set-profile-name"),email:i("set-profile-email"),phone:i("set-profile-phone")}),p&&(p.textContent="Saved."),v("Profile saved.","success")}catch(l){p&&(p.textContent=l.message),v(l.message,"error")}}),r.querySelector("[data-ac-change-password]")?.addEventListener("click",async()=>{let p=r.querySelector("[data-ac-password-status]"),i=r.querySelector("#set-profile-current")?.value??"",l=r.querySelector("#set-profile-new")?.value??"",c=r.querySelector("#set-profile-confirm")?.value??"";if(!i||!l){v("The current and the new password are both required.","error");return}if(l!==c){v("The two new passwords do not match.","error");return}if(l.length<8){v("The new password must be at least 8 characters.","error");return}try{await w.post("auth/change-password",{oldPassword:i,newPassword:l}),r.querySelector("#set-profile-current").value="",r.querySelector("#set-profile-new").value="",r.querySelector("#set-profile-confirm").value="",p&&(p.textContent="The password was changed."),v("Password changed. Your other sessions were signed out.","success")}catch(u){p&&(p.textContent=u.message),v(u.message,"error")}})}return{markup:n,bind:s}}async function ds(e){let[a,t,n]=await Promise.all([w.get("console/users?limit=500"),w.get("profile-requests?status=pending").catch(()=>[]),w.get("account-requests?status=pending").catch(()=>[])]),s=Array.isArray(a?.data)?a.data:[],r=Array.isArray(t)?t:[],p=Array.isArray(n)?n:[],i=m=>s.filter(g=>g.role===m).length,l=s.filter(m=>!m.lastLogin).length,c=s.filter(m=>m.status==="suspended").length,u=[E({title:"Users & access",subtitle:"Who can reach this platform, and what they may do.",body:`<div class="ac-grid ac-grid--kpi" style="margin-bottom:16px">
					${S({label:"Teachers",value:String(i("teacher")),note:"accounts"})}
					${S({label:"Students",value:String(i("student")),note:"accounts"})}
					${S({label:"Administrators",value:String(i("admin")+i("super_admin")),note:"accounts"})}
					${S({label:"Never signed in",value:String(l),note:"provisioned, unused",tone:l>0?"warning":""})}
					${S({label:"Suspended",value:String(c),note:"no access",tone:c>0?"warning":""})}
				</div>
				<div class="ac-quick-actions">
					<a class="ac-quick-action" href="#/users/teachers">Manage teachers</a>
					<a class="ac-quick-action" href="#/users/students">Manage students</a>
					<a class="ac-quick-action" href="#/users/administrators">Manage administrators</a>
					<a class="ac-quick-action" href="#/audit?stream=security">Review access events</a>
				</div>`}),E({title:"Account requests",subtitle:"New accounts registered from a browser. They cannot sign in until a request is approved.",body:p.length?C({columns:[{key:"full_name",label:"Requested account",render:m=>`<span class="ac-table__primary">${y(m.full_name||"")}</span><br><span class="ac-table__muted">${y(m.username||"")}${m.student_number?` \xB7 #${y(m.student_number)}`:""}</span>`},{key:"class_name",label:"Class",render:m=>y(m.class_name||"\u2014")},{key:"note",label:"Note",render:m=>y(m.note||"\u2014")},{key:"actions",label:"",align:"right",render:m=>`<button type="button" class="ac-btn ac-btn--sm" data-ac-approve-account="${y(m.id)}">Approve</button> <button type="button" class="ac-btn ac-btn--sm" data-ac-reject-account="${y(m.id)}">Reject</button>`}],rows:p}):'<p class="ac-empty__message">No account request is waiting.</p>'}),E({title:"Profile change requests",subtitle:"A student asking for a correction to their record.",body:r.length?C({columns:[{key:"user_id",label:"Account",render:m=>`<a href="#/users/${y(m.user_id)}" class="ac-table__primary">${y(m.user_id)}</a>`},{key:"changes",label:"Requested change",render:m=>y(zn(m.changes_json))},{key:"note",label:"Note",render:m=>y(m.note||"\u2014")},{key:"actions",label:"",align:"right",render:m=>`<button type="button" class="ac-btn ac-btn--sm" data-ac-approve-profile="${y(m.id)}">Approve</button> <button type="button" class="ac-btn ac-btn--sm" data-ac-reject-profile="${y(m.id)}">Reject</button>`}],rows:r}):'<p class="ac-empty__message">No profile change request is waiting.</p>'})].join("");function d(m){let g=async(f,x,h,b)=>{try{await w.post(`${f}/${encodeURIComponent(x)}/${h?"approve":"reject"}`,{note:null}),v(`${b} ${h?"approved":"rejected"}.`,"success"),e.rerender()}catch(k){v(k.message,"error")}};m.querySelectorAll("[data-ac-approve-account]").forEach(f=>{f.addEventListener("click",()=>g("account-requests",f.dataset.acApproveAccount,!0,"The request was"))}),m.querySelectorAll("[data-ac-reject-account]").forEach(f=>{f.addEventListener("click",()=>g("account-requests",f.dataset.acRejectAccount,!1,"The request was"))}),m.querySelectorAll("[data-ac-approve-profile]").forEach(f=>{f.addEventListener("click",()=>g("profile-requests",f.dataset.acApproveProfile,!0,"The request was"))}),m.querySelectorAll("[data-ac-reject-profile]").forEach(f=>{f.addEventListener("click",()=>g("profile-requests",f.dataset.acRejectProfile,!1,"The request was"))})}return{markup:u,bind:d}}function zn(e){if(!e)return"\u2014";try{let a=typeof e=="string"?JSON.parse(e):e,t=Object.entries(a||{});return t.length?t.map(([n,s])=>`${n}: ${s}`).join(" \xB7 "):"\u2014"}catch{return String(e)}}var ps="teacherAccess",Da=4,Oa=[{key:"overview",label:"Overview",hint:"The teacher dashboard."},{key:"questions",label:"Questions",hint:"The question bank."},{key:"subjects",label:"Subjects",hint:"The subject and category tree."},{key:"exams",label:"Exams",hint:"Creating and running exams."},{key:"classes",label:"Classes",hint:"The classes and their students."},{key:"games",label:"Games",hint:"The game arena."},{key:"kidsGames",label:"Kids Games",hint:"The Kids arena."},{key:"results",label:"Results",hint:"The results of the attempts."}],Ia=[{key:"general",label:"General"},{key:"profile",label:"My profile"},{key:"presets",label:"Presets"},{key:"data",label:"Data"},{key:"realtime",label:"Realtime"},{key:"ai-generation",label:"AI generation"},{key:"users",label:"Users"},{key:"games",label:"Game presets"}];function oa(){return{rev:Da,tabs:{overview:!0,questions:!0,subjects:!0,exams:!0,classes:!0,games:!0,kidsGames:!0,results:!0,notifications:!0,activity:!1},settings:!0,settingsTabs:{general:!0,profile:!0,presets:!0,data:!0,realtime:!0,"ai-generation":!0,users:!0,games:!0}}}function Pn(e){let a=oa();if(!e)return a;let t=e;if(typeof e=="string")try{t=JSON.parse(e)}catch{return a}return!t||typeof t!="object"?a:{rev:Da,tabs:{...a.tabs,...t.tabs||{}},settings:t.settings===void 0?a.settings:!!t.settings,settingsTabs:{...a.settingsTabs,...t.settingsTabs||{}}}}async function us(){let e=await we(),a=Pn(e.get(ps)?.value),t=[E({title:"Teacher access control",subtitle:"Choose which dashboard tabs and settings tabs a teacher may reach in the classroom surface.",body:`<h4 class="ac-section-panel__title" style="margin:0 0 8px">Dashboard tabs</h4>
				${Oa.map(s=>ce({id:`set-teacher-tab-${s.key}`,label:s.label,hint:s.hint,checked:a.tabs[s.key]!==!1})).join("")}
				${ce({id:"set-teacher-settings",label:"The settings modal",hint:"Whether a teacher may open the settings dialog at all.",checked:a.settings!==!1})}
				<h4 class="ac-section-panel__title" style="margin:20px 0 8px">Settings tabs</h4>
				${Ia.map(s=>ce({id:`set-teacher-settings-${s.key}`,label:s.label,checked:a.settingsTabs[s.key]!==!1})).join("")}
				<div class="ac-alert ac-alert--info" style="margin-top:16px">
					<div class="ac-alert__body">
						<p class="ac-alert__title">Two tabs are not offered</p>
						<p class="ac-alert__text">The activity log is an administrator-only view and the notifications feed is scoped to the signed-in teacher on the server. Neither can be revoked from here, so neither is shown as a switch.</p>
					</div>
				</div>
				<div class="ac-toolbar" style="margin:16px 0 0">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-save-teacher-access>Save teacher access</button>
						<button type="button" class="ac-btn" data-ac-reset-teacher-access>Restore the defaults</button>
						<span class="ac-table__muted" data-ac-teacher-access-status></span>
					</div>
				</div>`})].join("");function n(s){let r=s.querySelector("[data-ac-teacher-access-status]"),p=()=>{let l={rev:Da,tabs:{...oa().tabs},settings:s.querySelector("#set-teacher-settings")?.getAttribute("aria-checked")==="true",settingsTabs:{...oa().settingsTabs}};for(let c of Oa){let u=s.querySelector(`#set-teacher-tab-${c.key}`);u&&(l.tabs[c.key]=u.getAttribute("aria-checked")==="true")}for(let c of Ia){let u=s.querySelector(`#set-teacher-settings-${c.key}`);u&&(l.settingsTabs[c.key]=u.getAttribute("aria-checked")==="true")}return l};s.querySelectorAll(".ac-switch").forEach(l=>{l.addEventListener("click",()=>{let c=l.getAttribute("aria-checked")==="true"?"false":"true";l.setAttribute("aria-checked",c)})});let i=async l=>{try{await V(ps,JSON.stringify(l)),r&&(r.textContent="Saved."),v("Teacher access saved.","success")}catch(c){r&&(r.textContent=c.message),v(c.message,"error")}};s.querySelector("[data-ac-save-teacher-access]")?.addEventListener("click",()=>{i(p())}),s.querySelector("[data-ac-reset-teacher-access]")?.addEventListener("click",async()=>{let l=oa();for(let u of Oa){let d=s.querySelector(`#set-teacher-tab-${u.key}`);d&&d.setAttribute("aria-checked",l.tabs[u.key]?"true":"false")}let c=s.querySelector("#set-teacher-settings");c&&c.setAttribute("aria-checked",l.settings?"true":"false");for(let u of Ia){let d=s.querySelector(`#set-teacher-settings-${u.key}`);d&&d.setAttribute("aria-checked",l.settingsTabs[u.key]?"true":"false")}await i(l)})}return{markup:t,bind:n}}var We=null,fe=null;function Mn(){return window.io?Promise.resolve(window.io):new Promise((e,a)=>{let t=document.createElement("script");t.src="/vendor/socket.io.min.js",t.async=!0,t.onload=()=>{window.io?e(window.io):a(new Error("The realtime client could not be loaded."))},t.onerror=()=>a(new Error("The realtime client could not be loaded.")),document.head.appendChild(t)})}async function ms({force:e=!1}={}){return fe&&fe.connected&&!e?fe:(We&&!e||(We=(async()=>{try{let a=await Mn();return fe&&(fe.disconnect(),fe=null),fe=a({auth:{token:Sa()},transports:["websocket","polling"],reconnectionAttempts:5,timeout:8e3}),fe}catch{return fe=null,null}finally{We=null}})()),We)}function hs(e,a=8e3){return e?e.connected?Promise.resolve(!0):new Promise(t=>{let n=setTimeout(()=>{e.off("connect",s),t(!1)},a),s=()=>{clearTimeout(n),t(!0)};e.on("connect",s)}):Promise.resolve(!1)}async function gs(e){let[a,t]=await Promise.all([we(),w.get("devices").catch(()=>[])]),n=i=>{let l=a.get(i)?.value??"";return l==="false"?!1:l==="true"?!0:l},s=Array.isArray(t)?t:[],r=[E({title:"How the realtime channel works here",subtitle:"There is no second server to run.",body:`<div class="ac-alert ac-alert--info">
					<div class="ac-alert__body">
						<p class="ac-alert__title">One server, three jobs</p>
						<p class="ac-alert__text">The pages, the API and the realtime channel are all served by the same process. On a LAN installation the one server you already run IS the realtime server \u2014 there is nothing extra to install, start or configure, and no separate port to open. The channel authenticates with your signed-in session, exactly like the API.</p>
					</div>
				</div>
				<div class="ac-alert ac-alert--info" style="margin-top:12px">
					<div class="ac-alert__body">
						<p class="ac-alert__title">What the switch really controls</p>
						<p class="ac-alert__text">The legacy "LAN Realtime Server" switch never started a server. It decided whether this administration session USES the shared socket \u2014 whether it broadcasts updates and lists the connected devices. Turning it off stops the broadcasting; it does not disconnect the socket the rest of the application is using.</p>
					</div>
				</div>`}),E({title:"Realtime behaviour",subtitle:"How much this installation pushes to the connected devices.",body:`${ce({id:"set-realtime-enabled",label:"Use this session for realtime broadcasts",hint:"Whether this administration session broadcasts and lists the connected devices.",checked:n("realtimeEnabled")!==!1})}
				${ce({id:"set-realtime-autosync",label:"Auto-sync results",hint:"Automatically push the quiz results to the connected devices.",checked:n("autoSync")!==!1})}
				${ce({id:"set-realtime-broadcast",label:"Broadcast updates",hint:"Push question and exam updates to the connected devices.",checked:n("broadcastUpdates")!==!1})}
				${ce({id:"set-realtime-autosync-questions",label:"Auto-sync questions (training categories)",hint:"Periodically push the questions of the training-enabled categories to the connected devices.",checked:n("autoSyncQuestions")!==!1})}
				<div class="ac-field-grid" style="margin-top:14px">
					${A({id:"set-realtime-interval",label:"Sync interval (seconds)",type:"number",value:n("realtimeSyncInterval")||5,hint:"How often the data is synchronised between the devices."})}
					${A({id:"set-realtime-host",label:"Server host (fallback for the classroom panel)",value:n("serverHost")||"",placeholder:"http://192.168.1.5:3000",hint:"The realtime channel itself always connects to the address this page was served from. This value is only the fallback the classroom panel reads."})}
				</div>
				<div class="ac-toolbar" style="margin-bottom:0">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-save-realtime>Save realtime settings</button>
						<span class="ac-table__muted" data-ac-realtime-status></span>
					</div>
				</div>`}),E({title:"Recovery code",subtitle:'The code the "forgot password" panel on the sign-in page accepts. It is stored as a server-side hash.',body:`<div class="ac-field-grid">
					${A({id:"set-recovery-code",label:"New recovery code",type:"password",full:!0,hint:"Leave it blank to keep the existing code. The code itself is never sent back to a browser."})}
				</div>
				<div class="ac-toolbar" style="margin-bottom:0">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-save-recovery>Save recovery code</button>
						<span class="ac-table__muted" data-ac-recovery-status></span>
					</div>
				</div>`}),E({title:"Connected devices",subtitle:"The machines currently connected to this installation.",actions:'<button type="button" class="ac-btn ac-btn--sm" data-ac-realtime-refresh>Refresh</button>',body:`<div class="ac-toolbar" style="margin-bottom:12px">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn" data-ac-realtime-test>Test connection</button>
						<button type="button" class="ac-btn" data-ac-realtime-sync-all>Sync all data</button>
						<button type="button" class="ac-btn" data-ac-realtime-sync-users>Sync user accounts</button>
						<button type="button" class="ac-btn" data-ac-realtime-sync-classroom>Sync classroom data</button>
						<button type="button" class="ac-btn" data-ac-realtime-sync-games>Sync regular + Kids games</button>
						<div class="ac-toolbar__push">
							<button type="button" class="ac-btn ac-btn--sm" data-ac-realtime-online-only>Show online only</button>
						</div>
					</div>
					<span class="ac-table__muted" data-ac-realtime-connection>Not connected.</span>
				</div>
				<div data-ac-realtime-devices>
					${s.length?fs(s):'<p class="ac-empty__message">No device has registered with this installation yet.</p>'}
				</div>`})].join("");function p(i){let l=i.querySelector("[data-ac-realtime-status]"),c=i.querySelector("[data-ac-realtime-connection]"),u=i.querySelector("[data-ac-realtime-devices]");i.querySelectorAll(".ac-switch").forEach(h=>{h.addEventListener("click",()=>{let b=h.getAttribute("aria-checked")==="true"?"false":"true";h.setAttribute("aria-checked",b)})});let d=h=>i.querySelector(`#${h}`)?.getAttribute("aria-checked")==="true";i.querySelector("[data-ac-save-realtime]")?.addEventListener("click",async()=>{try{await V("realtimeEnabled",String(d("set-realtime-enabled"))),await V("autoSync",String(d("set-realtime-autosync"))),await V("broadcastUpdates",String(d("set-realtime-broadcast"))),await V("autoSyncQuestions",String(d("set-realtime-autosync-questions")));let h=i.querySelector("#set-realtime-interval")?.value??"5";await V("realtimeSyncInterval",String(Math.max(1,Number(h)||5))),await V("serverHost",i.querySelector("#set-realtime-host")?.value??""),l&&(l.textContent="Saved."),v("Realtime settings saved.","success")}catch(h){l&&(l.textContent=h.message),v(h.message,"error")}}),i.querySelector("[data-ac-save-recovery]")?.addEventListener("click",async()=>{let h=i.querySelector("[data-ac-recovery-status]"),b=i.querySelector("#set-recovery-code")?.value?.trim()??"";if(!b){v("Type a new recovery code, or leave the field alone to keep the current one.","error");return}try{await w.post("auth/recover/set",{code:b}),i.querySelector("#set-recovery-code").value="",h&&(h.textContent="Saved."),v("Recovery code saved.","success")}catch(k){h&&(h.textContent=k.message),v(k.message,"error")}});let m=!1,g=async({force:h=!1}={})=>{c&&(c.textContent="Connecting\u2026");let b=await ms({force:h});return b?await hs(b)?(b.emit("identify",{role:"admin"}),c&&(c.textContent="Connected."),b):(c&&(c.textContent="Could not connect to the realtime channel."),null):(c&&(c.textContent="The realtime client could not be loaded."),null)},f=async()=>{try{let h=await w.get("devices"),b=Array.isArray(h)?h:[],k=m?b.filter(T=>T.status==="active"||T.online):b;u&&(u.innerHTML=k.length?fs(k):'<p class="ac-empty__message">No device matches the current filter.</p>')}catch(h){u&&(u.innerHTML=`<p class="ac-empty__message">${y(h.message)}</p>`)}};i.querySelector("[data-ac-realtime-refresh]")?.addEventListener("click",f),i.querySelector("[data-ac-realtime-online-only]")?.addEventListener("click",async()=>{m=!m;let h=i.querySelector("[data-ac-realtime-online-only]");h&&(h.textContent=m?"Show all devices":"Show online only"),await f()}),i.querySelector("[data-ac-realtime-test]")?.addEventListener("click",async()=>{await g({force:!0})&&(v("The realtime channel answered.","success"),await f())});let x=async(h,b,k)=>{let T=await g();if(!T){v("The realtime channel is not connected.","error");return}try{T.emit(h,b||{}),v(`${k} was sent to the connected devices.`,"success")}catch(q){v(q.message,"error")}};i.querySelector("[data-ac-realtime-sync-all]")?.addEventListener("click",async()=>{await x("admin:refreshStudentBootstrap",{},"The full synchronisation"),await x("admin:syncUsers",{quizUsers:[]},"The user accounts"),await x("admin:syncGamification",{},"The gamification")}),i.querySelector("[data-ac-realtime-sync-users]")?.addEventListener("click",()=>x("admin:syncUsers",{quizUsers:[]},"The user accounts")),i.querySelector("[data-ac-realtime-sync-classroom]")?.addEventListener("click",()=>x("admin:refreshStudentBootstrap",{},"The classroom data")),i.querySelector("[data-ac-realtime-sync-games]")?.addEventListener("click",async()=>{await x("admin:syncGames",{},"The regular games"),await x("admin:syncKidsGames",{},"The Kids games")}),n("realtimeEnabled")!==!1&&g().then(async h=>{h&&h.on("clients:update",()=>{f()})}).catch(()=>{})}return{markup:r,bind:p}}function fs(e){return C({columns:[{key:"hostname",label:"Device",render:a=>`<span class="ac-table__primary">${y(a.hostname||a.name||"\u2014")}</span>`},{key:"device_type",label:"Type",render:a=>y(a.device_type||a.platform||"\u2014")},{key:"assignedUser",label:"Assigned to",render:a=>y(a.assignedUser?.name||a.assignedUser?.username||"unassigned")},{key:"ip_address",label:"Address",render:a=>`<code>${y(a.ip_address||a.ip||"\u2014")}</code>`},{key:"status",label:"Status",render:a=>`<span class="ac-badge ac-badge--${a.status==="blocked"?"danger":""}">${y(a.status||"\u2014")}</span>`}],rows:e,empty:"No device matches the current filter."})}var _s="quizPresets",bs=[{value:"quiz",label:"Quiz"},{value:"battle",label:"Battle"},{value:"tournament",label:"Tournament"},{value:"kids",label:"Kids game"}],vs=[{value:"individual",label:"Individual"},{value:"team",label:"Team"},{value:"tournament",label:"Tournament"}];function ca(){try{let e=localStorage.getItem(_s),a=e?JSON.parse(e):[];return Array.isArray(a)?a:[]}catch{return[]}}function Ha(e){try{return localStorage.setItem(_s,JSON.stringify(e)),!0}catch{return!1}}var ys=[{key:"name",label:"Name",type:"text",width:"full"},{key:"totalQuestions",label:"Questions",type:"number"},{key:"timerMode",label:"Timer mode",type:"select",options:[{value:"fixed",label:"One limit for the whole quiz"},{value:"per-question",label:"A limit per question"},{value:"none",label:"No limit"}]},{key:"perQuestionTime",label:"Seconds per question",type:"number"},{key:"timeLimit",label:"Total time (seconds)",type:"number"},{key:"penalty",label:"Penalty per wrong answer",type:"number"},{key:"passingScore",label:"Passing score (%)",type:"number"},{key:"shuffleQuestions",label:"Shuffle the questions",type:"checkbox"},{key:"showExplanations",label:"Show the explanations",type:"checkbox"},{key:"primaryColor",label:"Primary colour",type:"color"},{key:"secondaryColor",label:"Secondary colour",type:"color"},{key:"backgroundColor",label:"Background colour",type:"color"},{key:"textColor",label:"Text colour",type:"color"},{key:"inputFocusColor",label:"Input focus colour",type:"color"},{key:"fontFamily",label:"Typeface",type:"text",width:"full"},{key:"welcomeTitle",label:"Welcome title",type:"text",width:"full"},{key:"welcomeMessage",label:"Welcome message",type:"text",width:"full"}],ws={name:"",totalQuestions:5,timerMode:"fixed",perQuestionTime:60,timeLimit:300,penalty:0,passingScore:50,shuffleQuestions:!0,showExplanations:!1,primaryColor:"#2563eb",secondaryColor:"#1e40af",backgroundColor:"#f8fafc",textColor:"#1e293b",inputFocusColor:"#3b82f6",fontFamily:"'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",welcomeTitle:"",welcomeMessage:""};function Nn(e,a){let t=`preset-${a.key}`,n=e?.[a.key]??ws[a.key];return a.type==="checkbox"?`<label class="ac-check">
			<input type="checkbox" id="${y(t)}" ${n?"checked":""} />
			<span><span class="ac-check__label">${y(a.label)}</span></span>
		</label>`:a.type==="select"?`<div class="ac-field">
			<label class="ac-field__label" for="${y(t)}">${y(a.label)}</label>
			<select class="ac-select" id="${y(t)}">
				${a.options.map(s=>`<option value="${y(s.value)}"${String(s.value)===String(n)?" selected":""}>${y(s.label)}</option>`).join("")}
			</select>
		</div>`:`<div class="ac-field${a.width==="full"?" ac-field--full":""}">
		<label class="ac-field__label" for="${y(t)}">${y(a.label)}</label>
		<input class="ac-input ac-input--full" id="${y(t)}" type="${y(a.type)}" value="${y(n??"")}" autocomplete="off" />
	</div>`}async function xs(e){let[a,t]=await Promise.all([w.get("game-presets").catch(()=>[]),we()]),n=Array.isArray(a)?a:[],s=ca(),r=t.get("trainingPresetId")?.value??"",p=[E({title:"Quiz presets",subtitle:"The ready-made quick-quiz configurations. They are stored in this browser and are shared with the classroom panel.",actions:'<button type="button" class="ac-btn ac-btn--sm ac-btn--primary" data-ac-preset-new>New quiz preset</button>',body:`${s.length?C({columns:[{key:"name",label:"Preset",render:l=>`<span class="ac-table__primary">${y(l.name||"")}</span><br><span class="ac-table__muted">${y(l.id||"")}</span>`},{key:"totalQuestions",label:"Questions",align:"right",render:l=>String(l.totalQuestions??"\u2014")},{key:"timeLimit",label:"Time limit (s)",align:"right",render:l=>String(l.timeLimit??"\u2014")},{key:"passingScore",label:"Passing score",align:"right",render:l=>String(l.passingScore??"\u2014")},{key:"actions",label:"",align:"right",render:l=>`<button type="button" class="ac-btn ac-btn--sm" data-ac-preset-edit="${y(l.id)}">Edit</button> <button type="button" class="ac-btn ac-btn--sm" data-ac-preset-rename="${y(l.id)}">Rename</button> <button type="button" class="ac-btn ac-btn--sm" data-ac-preset-delete="${y(l.id)}">Delete</button>`}],rows:s}):'<p class="ac-empty__message">No quiz preset is stored in this browser yet. Create one here, or in the classroom panel.</p>'}
			<div class="ac-field-grid" style="margin-top:16px">
				${A({id:"set-training-preset",label:"The preset used for training mode",value:r,hint:"The id of the quiz preset a training session starts from. Leave it blank for the default."})}
			</div>
			<div class="ac-toolbar" style="margin-bottom:0">
				<div class="ac-toolbar__row">
					<button type="button" class="ac-btn ac-btn--primary" data-ac-save-training-preset>Save training preset</button>
					<span class="ac-table__muted" data-ac-training-preset-status></span>
				</div>
			</div>`}),E({title:"Game presets",subtitle:"The arena configurations this organization shares.",actions:'<button type="button" class="ac-btn ac-btn--sm ac-btn--primary" data-ac-game-preset-new>New game preset</button>',body:n.length?C({columns:[{key:"name",label:"Preset",render:l=>`<span class="ac-table__primary">${y(l.name||"")}</span><br><span class="ac-table__muted">${y(l.game_type||"")} \xB7 ${y(l.game_mode||"")}</span>`},{key:"is_default",label:"Default",render:l=>l.is_default?'<span class="ac-badge ac-badge--success">yes</span>':'<span class="ac-badge">no</span>'},{key:"actions",label:"",align:"right",render:l=>`<button type="button" class="ac-btn ac-btn--sm" data-ac-game-preset-edit="${y(l.id)}">Edit</button> <button type="button" class="ac-btn ac-btn--sm" data-ac-game-preset-delete="${y(l.id)}">Delete</button>`}],rows:n}):'<p class="ac-empty__message">No game preset yet.</p>'})].join("");function i(l){let c=d=>{let m=!d,g={...ws,...d||{}},f=B({title:m?"Create a quiz preset":"Edit the quiz preset",subtitle:"A preset is stored in this browser and is shared with the classroom panel, so it is offered there too.",wide:!0,body:`<div class="ac-field-grid">
						${ys.map(h=>Nn(g,h)).join("")}
					</div>`,footer:`
					<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
					<button type="button" class="ac-btn ac-btn--primary" data-ac-confirm>${m?"Create the preset":"Save the preset"}</button>
				`}),x=f.root;x.querySelector("[data-ac-cancel]").addEventListener("click",f.close),x.querySelector("[data-ac-confirm]").addEventListener("click",()=>{let h={...g};for(let k of ys){let T=x.querySelector(`#preset-${k.key}`);T&&(k.type==="checkbox"?h[k.key]=T.checked:k.type==="number"?h[k.key]=T.value===""?0:Number(T.value):h[k.key]=T.value)}if(!String(h.name||"").trim()){v("A preset needs a name.","error");return}let b=ca();if(m)h.id=`preset-${Date.now()}`,h.createdAt=new Date().toISOString(),b.push(h);else{let k=b.findIndex(T=>T.id===d.id);k!==-1&&(b[k]={...b[k],...h})}if(!Ha(b)){v("The browser refused to save the preset.","error");return}f.close(),v(m?"The preset was created.":"The preset was saved.","success"),e.rerender()})};l.querySelector("[data-ac-preset-new]")?.addEventListener("click",()=>c(null)),l.querySelectorAll("[data-ac-preset-edit]").forEach(d=>{d.addEventListener("click",()=>{let m=s.find(g=>g.id===d.dataset.acPresetEdit);m&&c(m)})}),l.querySelectorAll("[data-ac-preset-rename]").forEach(d=>{d.addEventListener("click",()=>{let m=d.dataset.acPresetRename,g=ca(),f=g.find(h=>h.id===m);if(!f)return;let x=B({title:"Rename this preset",body:`<div class="ac-field">
							<label class="ac-field__label" for="ac-preset-name">Name</label>
							<input class="ac-input ac-input--full" id="ac-preset-name" type="text" value="${y(f.name||"")}" />
						</div>`,footer:`
						<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
						<button type="button" class="ac-btn ac-btn--primary" data-ac-confirm>Rename</button>
					`});x.root.querySelector("[data-ac-cancel]").addEventListener("click",x.close),x.root.querySelector("[data-ac-confirm]").addEventListener("click",()=>{let h=x.root.querySelector("#ac-preset-name").value.trim();if(!h){v("A preset needs a name.","error");return}f.name=h,Ha(g)?(x.close(),v("Preset renamed.","success"),e.rerender()):v("The browser refused to save the preset.","error")})})}),l.querySelectorAll("[data-ac-preset-delete]").forEach(d=>{d.addEventListener("click",async()=>{let m=d.dataset.acPresetDelete;if(!await M({title:"Delete this preset?",message:"It is removed from this browser. The classroom panel will not offer it any more.",confirmLabel:"Delete preset",danger:!0}))return;let f=ca().filter(x=>x.id!==m);Ha(f)?(v("Preset deleted.","success"),e.rerender()):v("The browser refused to save the preset.","error")})}),l.querySelector("[data-ac-save-training-preset]")?.addEventListener("click",async()=>{let d=l.querySelector("[data-ac-training-preset-status]");try{await V("trainingPresetId",l.querySelector("#set-training-preset")?.value??""),d&&(d.textContent="Saved."),v("The training preset was saved.","success")}catch(m){d&&(d.textContent=m.message),v(m.message,"error")}});let u=d=>{let m=B({title:d?"Edit the game preset":"New game preset",body:`<div class="ac-field-grid">
						${A({id:"set-game-name",label:"Name",value:d?.name??"",full:!0})}
						${O({id:"set-game-type",label:"Game type",options:bs,value:d?.game_type??bs[0]?.value??""})}
						${O({id:"set-game-mode",label:"Game mode",options:vs,value:d?.game_mode??vs[0]?.value??""})}
						${A({id:"set-game-rules",label:"Rules (JSON)",value:Rn(d?.rules_json),full:!0,hint:"The rule set of the arena. It is stored as JSON."})}
					</div>
					${Ge({id:"set-game-default",label:"The default preset",hint:"Used when a game starts without an explicit preset.",checked:!!d?.is_default})}`,footer:`
					<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
					<button type="button" class="ac-btn ac-btn--primary" data-ac-confirm>${d?"Save the preset":"Create the preset"}</button>
				`});m.root.querySelector("[data-ac-cancel]").addEventListener("click",m.close),m.root.querySelector("[data-ac-confirm]").addEventListener("click",async()=>{let g=m.root.querySelector("#set-game-name").value.trim();if(!g){v("A preset needs a name.","error");return}let f={name:g,game_type:m.root.querySelector("#set-game-type").value,game_mode:m.root.querySelector("#set-game-mode").value,rules:m.root.querySelector("#set-game-rules").value,is_default:m.root.querySelector("#set-game-default").checked};try{d?await w.patch(`game-presets/${encodeURIComponent(d.id)}`,f):await w.post("game-presets",f),m.close(),v("The game preset was saved.","success"),e.rerender()}catch(x){v(x.message,"error")}})};l.querySelector("[data-ac-game-preset-new]")?.addEventListener("click",()=>u(null)),l.querySelectorAll("[data-ac-game-preset-edit]").forEach(d=>{d.addEventListener("click",()=>{let m=n.find(g=>g.id===d.dataset.acGamePresetEdit);m&&u(m)})}),l.querySelectorAll("[data-ac-game-preset-delete]").forEach(d=>{d.addEventListener("click",async()=>{if(await M({title:"Delete this game preset?",message:"It is removed for the whole organization.",confirmLabel:"Delete preset",danger:!0}))try{await w.del(`game-presets/${encodeURIComponent(d.dataset.acGamePresetDelete)}`),v("The game preset was deleted.","success"),e.rerender()}catch(g){v(g.message,"error")}})})}return{markup:p,bind:i}}function Rn(e){if(!e)return"";if(typeof e=="object")return JSON.stringify(e,null,2);try{return JSON.stringify(JSON.parse(e),null,2)}catch{return String(e)}}async function Ss(e){let[a,t]=await Promise.all([w.get("generated-documents?limit=200").catch(()=>null),w.get("archives").catch(()=>null)]),n=Array.isArray(a?.data)?a.data:Array.isArray(a)?a:[],s=Array.isArray(t?.items)?t.items:[],r=[E({title:"Recent documents",subtitle:"Every booklet, preparation sheet and exam paper the platform has generated. The title opens the file; the folder shows where it lives.",body:n.length?C({columns:[{key:"title",label:"Document",render:i=>{let l=i.url||"",c=y(i.title||i.file_name||"Document");return l?`<a class="ac-table__primary" href="${y(l)}" target="_blank" rel="noopener">${c}</a>`:`<span class="ac-table__primary">${c}</span>`}},{key:"kind",label:"Kind",render:i=>y(i.kind||"\u2014")},{key:"rel_path",label:"Folder",render:i=>`<code class="ac-table__muted" title="${y(i.rel_path||"")}">${y(Hn(i.rel_path))}</code>`},{key:"size_bytes",label:"Size",align:"right",render:i=>ks(i.size_bytes)},{key:"created_at",label:"Created",render:i=>y($s(i.created_at))},{key:"actions",label:"",align:"right",render:i=>`<a class="ac-btn ac-btn--sm" href="${y(`/api/v1/generated-documents/${encodeURIComponent(i.id)}/download`)}">Download</a>`}],rows:n}):'<p class="ac-empty__message">No document has been generated yet. The course booklets, the preparation sheets and the exam papers appear here once they are produced.</p>'}),E({title:"Export",subtitle:"A snapshot of this organization, taken from the database.",body:`<div class="ac-alert ac-alert--info">
					<div class="ac-alert__body">
						<p class="ac-alert__title">What the export contains \u2014 and what it does not</p>
						<p class="ac-alert__text">The accounts, the classes, the categories, the questions, the exams, the results, the games, the tournaments, the notifications and the settings of this organization. The passwords are <strong>not</strong> included: a backup file is not a credential store, and a restored account keeps the password it already has.</p>
					</div>
				</div>
				<div class="ac-toolbar" style="margin:14px 0 0">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-export-json>Export as JSON</button>
						<button type="button" class="ac-btn" data-ac-export-zip>Export as ZIP (with the media)</button>
						<span class="ac-table__muted" data-ac-export-status></span>
					</div>
				</div>`}),E({title:"Import",subtitle:"Restore a backup exported from this application.",body:`<div class="ac-field-grid">
					${Dn("ac-import-file","Backup file",'A .zip produced by "Export as ZIP", or a .json produced by "Export as JSON".')}
				</div>
				<div class="ac-toolbar" style="margin-bottom:0">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-import-run>Import the backup</button>
						<span class="ac-table__muted" data-ac-import-status></span>
					</div>
				</div>`}),E({title:"School-year archives",subtitle:"A frozen snapshot of a school year, kept per year.",actions:'<button type="button" class="ac-btn ac-btn--sm ac-btn--primary" data-ac-archive-new>Create an archive</button>',body:s.length?C({columns:[{key:"label",label:"Archive",render:i=>`<span class="ac-table__primary">${y(i.label||`Archive ${i.year}`)}</span><br><span class="ac-table__muted">${y(i.year)}</span>`},{key:"size_bytes",label:"Size",align:"right",render:i=>ks(i.size_bytes)},{key:"created_at",label:"Created",render:i=>y($s(i.created_at))},{key:"actions",label:"",align:"right",render:i=>`<button type="button" class="ac-btn ac-btn--sm" data-ac-archive-view="${y(i.year)}">Open</button> <button type="button" class="ac-btn ac-btn--sm" data-ac-archive-delete="${y(i.year)}">Delete</button>`}],rows:s}):'<p class="ac-empty__message">No archive yet.</p>'}),E({title:"Factory reset",subtitle:"Erase this organization's content and keep only its administrators.",body:`<div class="ac-alert ac-alert--danger">
					<div class="ac-alert__body">
						<p class="ac-alert__title">This cannot be undone</p>
						<p class="ac-alert__text">The reset erases the questions, the exams, the classes, the results, the games, the generated documents and the archives of this organization. The administrator accounts are kept. Nothing outside this organization is touched.</p>
					</div>
				</div>
				<div class="ac-toolbar" style="margin:14px 0 0">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--danger" data-ac-reset-data>Reset the data</button>
						<span class="ac-table__muted" data-ac-reset-status></span>
					</div>
				</div>`})].join("");function p(i){let l=i.querySelector("[data-ac-export-status]"),c=i.querySelector("[data-ac-import-status]"),u=async()=>{let d=await w.get("console/export");if(!d?.data)throw new Error("The export was empty.");return d.data};i.querySelector("[data-ac-export-json]")?.addEventListener("click",async()=>{l&&(l.textContent="Collecting\u2026");try{let d=await u();Ba(new Blob([JSON.stringify(d,null,2)],{type:"application/json"}),`quiz-app-backup-${d.timestamp.slice(0,10)}.json`),l&&(l.textContent="The backup was downloaded."),v("Backup created.","success")}catch(d){l&&(l.textContent=d.message),v(d.message,"error")}}),i.querySelector("[data-ac-export-zip]")?.addEventListener("click",async()=>{l&&(l.textContent="Packaging\u2026");try{let d=await u(),m=await fetch("/api/v1/exports/bundle",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json",Authorization:`Bearer ${window.APP_CONFIG?.token||Ua()}`},body:JSON.stringify({data:d.data})});if(!m.ok)throw new Error(`The server refused the export (${m.status}).`);let g=await m.blob();Ba(g,`quiz-app-backup-${d.timestamp.slice(0,10)}.zip`),l&&(l.textContent="The backup was downloaded."),v("Backup created.","success")}catch(d){l&&(l.textContent=d.message),v(d.message,"error")}}),i.querySelectorAll("[data-ac-file-input]").forEach(d=>{d.addEventListener("change",()=>{let m=i.querySelector(`[data-ac-file-name="${d.dataset.acFileInput}"]`);if(!m)return;let g=d.files?.[0];m.textContent=g?g.name:"No file chosen yet",m.classList.toggle("is-set",!!g)})}),i.querySelector("[data-ac-import-run]")?.addEventListener("click",async()=>{let m=i.querySelector("#ac-import-file")?.files?.[0];if(!m){v("Choose a backup file first.","error");return}if(await M({title:"Import this backup?",message:"The records of the backup are written over the records of this organization. The accounts that already exist keep their password.",confirmLabel:"Import the backup",danger:!0})){c&&(c.textContent="Importing\u2026");try{let f=null,x=null;if(m.name.toLowerCase().endsWith(".zip")){let k=await fetch("/api/v1/imports/bundle",{method:"POST",credentials:"include",headers:{"Content-Type":"application/zip",Authorization:`Bearer ${Ua()}`},body:m});if(!k.ok)throw new Error(`The server refused the backup (${k.status}).`);let T=await k.json();f=T.data,x=T.uploadToken}else{let k=JSON.parse(await m.text());f=k?.data?k.data:k}if(!f||typeof f!="object")throw new Error("The backup held no data.");let h=await In(f);x&&await fetch(`/api/v1/imports/bundle/${encodeURIComponent(x)}/commit`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json",Authorization:`Bearer ${Ua()}`},body:JSON.stringify({uploadToken:x})});let b=Object.entries(h).filter(([,k])=>k>0).map(([k,T])=>`${T} ${k}`).join(", ");c&&(c.textContent=b?`Imported: ${b}.`:"Nothing to import."),v("The backup was imported.","success"),e.rerender()}catch(f){c&&(c.textContent=f.message),v(f.message,"error")}}}),i.querySelector("[data-ac-archive-new]")?.addEventListener("click",async()=>{let d=prompt("Which school year? (YYYY-YYYY)",Bn());if(d)try{await w.post("archives",{year:d,label:`Archive ${d}`,data:{}}),v("The archive was created.","success"),e.rerender()}catch(m){v(m.message,"error")}}),i.querySelectorAll("[data-ac-archive-view]").forEach(d=>{d.addEventListener("click",async()=>{try{let m=await w.get(`archives/${encodeURIComponent(d.dataset.acArchiveView)}`),g=new Blob([JSON.stringify(m.data??{},null,2)],{type:"application/json"});Ba(g,`archive-${d.dataset.acArchiveView}.json`),v("The archive was downloaded.","success")}catch(m){v(m.message,"error")}})}),i.querySelectorAll("[data-ac-archive-delete]").forEach(d=>{d.addEventListener("click",async()=>{if(await M({title:"Delete this archive?",message:"The frozen snapshot of that year is removed. It cannot be recovered.",confirmLabel:"Delete the archive",danger:!0}))try{await w.del(`archives/${encodeURIComponent(d.dataset.acArchiveDelete)}`),v("The archive was deleted.","success"),e.rerender()}catch(g){v(g.message,"error")}})}),i.querySelector("[data-ac-reset-data]")?.addEventListener("click",async()=>{let d=i.querySelector("[data-ac-reset-status]");if(await M({title:"Reset every record of this organization?",message:"The questions, the exams, the classes, the results, the games, the documents and the archives are erased. The administrator accounts are kept. This cannot be undone.",detail:"Take a backup first if there is anything here you want to keep.",confirmLabel:"Reset the data",danger:!0})){d&&(d.textContent="Resetting\u2026");try{let g=await w.post("admin/reset-data",{confirm:"RESET"});return d&&(d.textContent="The organization was reset."),v("The organization was reset.","success"),e.rerender(),g}catch(g){d&&(d.textContent=g.message),v(g.message,"error")}}})}return{markup:r,bind:p}}var On=["categories","classes","users","questions","exams","results","games","tournaments","notifications","gamification","settings","learning_objectives","competencies","learning_objective_competencies","learning_prerequisites","question_assessment_criteria"];async function In(e){let a={};for(let t of On){let n=Array.isArray(e[t])?e[t]:[];if(!n.length){a[t]=0;continue}try{await w.post(`bulk/${t}`,{items:n}),a[t]=n.length}catch{a[t]=0}}return a}function Dn(e,a,t){return`<div class="ac-field ac-field--full">
		<label class="ac-field__label" for="${y(e)}">${y(a)}</label>
		<label class="ac-file" for="${y(e)}">
			<input id="${y(e)}" type="file" accept=".json,.zip" data-ac-file-input="${y(e)}" />
			<span class="ac-btn ac-file__btn" aria-hidden="true">Choose a file</span>
			<span class="ac-file__name" data-ac-file-name="${y(e)}">No file chosen yet</span>
		</label>
		<p class="ac-field__hint">${y(t)}</p>
	</div>`}function Ba(e,a){let t=URL.createObjectURL(e),n=document.createElement("a");n.href=t,n.download=a,document.body.appendChild(n),n.click(),n.remove(),setTimeout(()=>URL.revokeObjectURL(t),2e3)}function Ua(){try{let e=sessionStorage.getItem("quizSession")||localStorage.getItem("quizSession"),a=e?JSON.parse(e):null;if(a?.token)return a.token}catch{}return localStorage.getItem("quizAuthToken")||""}function Hn(e){let a=String(e||""),t=a.lastIndexOf("/");return t===-1?"(root)":a.slice(0,t)}function ks(e){let a=Number(e);return!Number.isFinite(a)||a<=0?"\u2014":a<1024?`${a} B`:a<1024*1024?`${Math.round(a/1024)} KB`:`${Math.round(a/1024/1024*10)/10} MB`}function $s(e){if(!e)return"\u2014";let a=new Date(e);return Number.isNaN(a.getTime())?"\u2014":a.toLocaleDateString()}function Bn(){let e=new Date,a=e.getMonth()>=8?e.getFullYear():e.getFullYear()-1;return`${a}-${a+1}`}var Re=e=>`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${e}</svg>`,ge=[{id:"server",label:"Server & network",icon:Re('<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><path d="M6 6h.01M6 18h.01"/>')},{id:"access",label:"Student access",icon:Re('<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>')},{id:"firewall",label:"Windows firewall",icon:Re('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>')},{id:"database",label:"Database safety",icon:Re('<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>')},{id:"offline",label:"Offline & CDNs",icon:Re('<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>')},{id:"summary",label:"Summary",icon:Re('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>')}];async function As(e,a){let t=await w.get("admin/setup/diagnostics"),n=t?.data||t||{},s=ge.some(i=>i.id===a?.query?.step)?a.query.step:ge[0].id,r=[Un(s),`<div data-ac-setup-step>${Fn(s,n,e)}</div>`].join("");function p(i){i.querySelectorAll("[data-ac-setup-goto]").forEach(u=>{u.addEventListener("click",()=>{se(`/settings?section=setup&step=${encodeURIComponent(u.dataset.acSetupGoto)}`,{replace:!0})})});let l=i.querySelector("[data-ac-setup-next]");l&&l.addEventListener("click",()=>{let u=ge.findIndex(m=>m.id===s),d=ge[Math.min(ge.length-1,u+1)];se(`/settings?section=setup&step=${encodeURIComponent(d.id)}`,{replace:!0})});let c=i.querySelector("[data-ac-setup-back]");c&&c.addEventListener("click",()=>{let u=ge.findIndex(m=>m.id===s),d=ge[Math.max(0,u-1)];se(`/settings?section=setup&step=${encodeURIComponent(d.id)}`,{replace:!0})}),i.querySelector("[data-ac-copy-lan]")?.addEventListener("click",async()=>{await Ts(i.querySelector("#set-lan-address")?.value??""),v("The address was copied.","success")}),i.querySelector("[data-ac-copy-firewall]")?.addEventListener("click",async()=>{await Ts(i.querySelector("#set-firewall-command")?.value??""),v("The command was copied.","success")}),i.querySelector("[data-ac-show-qr]")?.addEventListener("click",async()=>{let u=i.querySelector("[data-ac-qr]");if(!u)return;let d=i.querySelector("#set-lan-address")?.value??"";u.hidden=!1,u.innerHTML='<p class="ac-field__hint">Generating the QR code\u2026</p>';try{await ar();let m=window.qrcode(0,"M");m.addData(d),m.make(),u.innerHTML=m.createSvgTag(4,8)}catch(m){u.innerHTML=`<pre class="ac-pre">${y(d)}</pre><p class="ac-field__hint">${y(m.message)} \u2014 use the address above.</p>`}}),i.querySelectorAll("[data-ac-network-profile]").forEach(u=>{u.addEventListener("click",async()=>{try{await w.post("admin/setup/network-profile",{interfaceAlias:u.dataset.acNetworkProfile,category:u.dataset.acNetworkCategory||"Private"}),v("The network profile was changed.","success"),e.rerender()}catch(d){v(d.message,"error")}})}),i.querySelector("[data-ac-setup-backup]")?.addEventListener("click",async()=>{let u=i.querySelector("[data-ac-setup-backup-status]");u&&(u.textContent="Collecting\u2026");try{let d=(await w.get("console/export"))?.data;if(!d)throw new Error("The export was empty.");tr(new Blob([JSON.stringify(d,null,2)],{type:"application/json"}),`quiz-app-backup-${d.timestamp.slice(0,10)}.json`),u&&(u.textContent="The backup was downloaded."),v("Backup created.","success")}catch(d){u&&(u.textContent=d.message),v(d.message,"error")}}),i.querySelectorAll("[data-ac-firewall-check]").forEach(u=>{u.addEventListener("change",()=>{try{let g=localStorage.getItem(la)||"[]",f=JSON.parse(g),x=u.dataset.acFirewallCheck,h=f.indexOf(x);u.checked&&h===-1&&f.push(x),!u.checked&&h!==-1&&f.splice(h,1),localStorage.setItem(la,JSON.stringify(f))}catch{}let d=Fa(),m=i.querySelector("[data-ac-firewall-status]");m&&(m.textContent=d?"All the manual checks are completed.":"Complete the checklist on the Firewall step.")})})}return{markup:r,bind:p}}function Un(e){let a=ge.findIndex(t=>t.id===e);return`<nav class="ac-stepper" aria-label="Setup steps">
		${ge.map((t,n)=>`<button type="button" class="ac-stepper__step${t.id===e?" is-active":""}${n<a?" is-done":""}" data-ac-setup-goto="${y(t.id)}">
			<span class="ac-stepper__icon" aria-hidden="true">${t.icon}</span>
			<span class="ac-stepper__label">${y(t.label)}</span>
		</button>`).join("")}
	</nav>`}function Fn(e,a,t){let n=a.port||3e3,s=Array.isArray(a.lan)?a.lan:[],r=s.find(i=>i.recommended)||s[0]||null,p=r?`http://${r.address}:${n}`:`http://localhost:${n}`;switch(e){case"server":return Gn(a);case"access":return Wn(a,s,r,p,n);case"firewall":return Yn(a,n);case"database":return Qn(a);case"offline":return Vn(a);case"summary":return Kn(a,s);default:return E({title:"Unknown step",body:"<p>That step does not exist.</p>"})}}function Gn(e){let a=e.process||{},t=e.hostBinding==="0.0.0.0",n=e.nodeEnv!=="production";return E({title:"Server & network",subtitle:"This server must listen on every network interface so the students can reach it over Wi-Fi.",body:`<div class="ac-defs">
				${le("Bind address",e.hostBinding||"0.0.0.0",t?"ok":"warn")}
				${le("Port",String(Xn(e)),"ok")}
				${le("NODE_ENV",e.nodeEnv||"development",n?"ok":"warn")}
				${le("Cookies",e.cookieSecure?"Secure (HTTPS only)":"Not secure (HTTP works)",e.cookieSecure?"warn":"ok")}
				${le("Platform",a.platform||"\u2014")}
				${le("Hostname",a.hostname||"\u2014")}
			</div>
			${e.cookieSecure?'<div class="ac-alert ac-alert--warning" style="margin-top:14px"><div class="ac-alert__body"><p class="ac-alert__title">Production mode detected</p><p class="ac-alert__text">The refresh cookie is marked <code>Secure</code>, so a browser will not send it over plain HTTP. For a classroom installation use <code>NODE_ENV=development</code>; for production, use HTTPS or a reverse proxy.</p></div></div>':""}`})}function Wn(e,a,t,n,s){return a.length?E({title:"Student access",subtitle:"The students must use the server's LAN address, not localhost. Share this URL, or let them scan the QR code.",body:`<div class="ac-primary-url">
				<p class="ac-primary-url__label">Students should open</p>
				<p class="ac-primary-url__value">${y(n)}</p>
				${t?`<p class="ac-primary-url__note">Recommended \u2014 the ${y(t.interface)} interface (a physical adapter).</p>`:""}
				<div class="ac-quick-actions" style="margin-top:12px">
					<button type="button" class="ac-btn" data-ac-copy-lan>Copy the address</button>
					<button type="button" class="ac-btn" data-ac-show-qr>Show the QR code</button>
				</div>
			</div>
			<div data-ac-qr hidden style="margin-top:16px"></div>
			${a.length>1?`<h4 class="ac-section-panel__title" style="margin:20px 0 8px">Every available address</h4>
					${C({columns:[{key:"interface",label:"Interface"},{key:"address",label:"URL",render:r=>`<code>http://${y(r.address)}:${y(String(s))}</code>`},{key:"type",label:"Type"},{key:"recommended",label:"Recommended",render:r=>r.recommended?'<span class="ac-badge ac-badge--success">yes</span>':r.type==="virtual"?'<span class="ac-badge ac-badge--warning">virtual</span>':'<span class="ac-badge">no</span>'}],rows:a})}`:""}
			<div class="ac-alert ac-alert--info" style="margin-top:16px"><div class="ac-alert__body"><p class="ac-alert__title">The students must not use <code>localhost</code></p><p class="ac-alert__text">On their own device <code>localhost</code> means the device itself. They must use the server's Wi-Fi address above. Virtual adapters (Hyper-V, WSL, Docker) are not reachable from another device.</p></div></div>`}):E({title:"Student access",subtitle:"The address the students use.",body:'<div class="ac-alert ac-alert--warning"><div class="ac-alert__body"><p class="ac-alert__title">No LAN address detected</p><p class="ac-alert__text">The server is not connected to Wi-Fi or Ethernet, so no other device can reach it.</p></div></div>'})}var qs=[{id:"rule",label:"The inbound rule for the port exists",hint:"Run the PowerShell command above once, as an administrator."},{id:"private",label:"The network profile is Private",hint:"The server can set this for you with the button in the table above."},{id:"router",label:"The router allows the classroom Wi-Fi to reach the server",hint:"Some school routers block device-to-device traffic. Only the operator can see the router."},{id:"tested",label:"A student device opened the address above successfully",hint:"The real proof: open the student URL on a phone or a tablet on the classroom Wi-Fi."}],la="quizConsoleFirewallChecks";function Fa(){try{let e=localStorage.getItem(la)||"[]",a=JSON.parse(e);return Array.isArray(a)&&a.length===qs.length}catch{return!1}}function Yn(e,a){let t=Array.isArray(e.networkProfile)?e.networkProfile:[],n=Fa();return E({title:"Windows firewall & network profile",subtitle:"Two things must be configured: the Windows network profile must be Private, and a firewall rule must allow inbound TCP on the port.",body:`<h4 class="ac-section-panel__title" style="margin:0 0 8px">Network profile</h4>
			${t.length?C({columns:[{key:"interface",label:"Interface"},{key:"name",label:"Connection"},{key:"category",label:"Category",render:s=>s.category==="Private"?'<span class="ac-badge ac-badge--success">Private</span>':s.category==="DomainAuthenticated"?'<span class="ac-badge">Domain</span>':'<span class="ac-badge ac-badge--warning">Public</span>'},{key:"actions",label:"",align:"right",render:s=>s.category==="Private"||s.category==="DomainAuthenticated"?'<span class="ac-table__muted">\u2014</span>':`<button type="button" class="ac-btn ac-btn--sm" data-ac-network-profile="${y(s.interface)}" data-ac-network-category="Private">Switch to Private</button>`}],rows:t}):`<p class="ac-field__hint">The network profile is only reported on Windows. Check it manually:</p>
					<pre class="ac-pre">Get-NetConnectionProfile | Select-Object Name, InterfaceAlias, NetworkCategory</pre>`}
			<h4 class="ac-section-panel__title" style="margin:20px 0 8px">The inbound rule</h4>
			<p class="ac-field__hint" style="margin-bottom:8px">Run this once in an administrator PowerShell on the machine that serves the app.</p>
			<textarea class="ac-input ac-input--full" id="set-firewall-command" rows="4" readonly>${y(er(a))}</textarea>
			<div class="ac-quick-actions" style="margin-top:12px">
				<button type="button" class="ac-btn" data-ac-copy-firewall>Copy the command</button>
			</div>
			<h4 class="ac-section-panel__title" style="margin:20px 0 8px">The manual checklist</h4>
			<div class="ac-alert ac-alert--info" style="margin-bottom:12px">
				<div class="ac-alert__body">
					<p class="ac-alert__title">What this checklist is \u2014 and what it is NOT</p>
					<p class="ac-alert__text">These four things are the only parts of a classroom deployment the server <strong>cannot verify by itself</strong>: whether the Windows firewall rule was really applied, whether the network profile really is Private, whether the school router allows device-to-device traffic, and whether a phone can really open the page. Only you can confirm them, from the machine and from a student device.</p>
					<p class="ac-alert__text"><strong>Nothing here changes the behaviour of the application.</strong> The ticks are a private note to yourself, kept in this browser. They do not enable a feature, they do not grant an access right, and the application works exactly the same whether they are ticked or not. Their only effect is that the Summary step can tell you the setup was confirmed rather than merely reported.</p>
				</div>
			</div>
			<div class="ac-checklist">
				${qs.map(s=>{let r=!1;try{let p=localStorage.getItem(la)||"[]";r=JSON.parse(p).includes(s.id)}catch{r=!1}return`<label class="ac-check">
						<input type="checkbox" data-ac-firewall-check="${y(s.id)}" ${r?"checked":""} />
						<span>
							<span class="ac-check__label">${y(s.label)}</span>
							<span class="ac-check__hint">${y(s.hint)}</span>
						</span>
					</label>`}).join("")}
			</div>
			<p class="ac-field__hint" data-ac-firewall-status style="margin-top:8px">${n?"All four checks are confirmed. The Summary step now shows the setup as verified.":"None of this changes the application \u2014 it is a note to yourself. Tick what you have actually confirmed."}</p>`})}function Qn(e){let a=e.database||{},t=a.inferredInfo||{};return E({title:"Database safety",subtitle:"The database is a single SQLite file. Back it up before you change anything \u2014 the backup button is at the bottom of this step.",body:`<div class="ac-defs">
				${le("Configured URL",a.url||"\u2014")}
				${a.inferred?le("Prisma uses",a.inferred,t.exists?"ok":"fail"):""}
				${a.expected?le("prisma/dev.db",a.expected.exists?`${a.expected.size||0} bytes`:"not found",a.expected.exists?"ok":"warn"):""}
				${a.rootDevDb&&a.rootDevDb.exists?le("Root ./dev.db","found \u2014 may indicate a URL mismatch","warn"):""}
			</div>
			${a.rootDevDb&&a.rootDevDb.exists&&(!a.inferred||!t.exists)?'<div class="ac-alert ac-alert--warning" style="margin-top:14px"><div class="ac-alert__body"><p class="ac-alert__title">Database path inconsistency</p><p class="ac-alert__text">The <code>.env</code> file points at a different path than expected. The data may be in <code>./dev.db</code> instead of <code>prisma/dev.db</code> \u2014 back up both before reinstalling.</p></div></div>':""}
			<div class="ac-quick-actions" style="margin-top:16px">
				<button type="button" class="ac-btn ac-btn--primary" data-ac-setup-backup>Download a backup</button>
				<span class="ac-table__muted" data-ac-setup-backup-status></span>
			</div>`})}function Vn(e){let a=Array.isArray(e.cdn)?e.cdn:[],t=a.filter(r=>r.vendored).length,n=a.length-t,s=a.filter(r=>!r.vendored&&r.ok).length;return E({title:"Offline & CDN dependencies",subtitle:"The frontend libraries are served locally. The only external dependency is the web font, and it is optional.",body:`${t>0?`<div class="ac-alert ac-alert--success" style="margin-bottom:14px"><div class="ac-alert__body"><p class="ac-alert__title">${t} libraries are vendored locally</p><p class="ac-alert__text">No internet access is required for any core feature.</p></div></div>`:""}
		${C({columns:[{key:"host",label:"Host",render:r=>`<code>${y(r.host||r.id||"")}</code>`},{key:"vendored",label:"Source",render:r=>r.vendored?'<span class="ac-badge ac-badge--success">vendored locally</span>':'<span class="ac-badge ac-badge--warning">remote</span>'},{key:"ok",label:"Reachable",render:r=>r.vendored?'<span class="ac-table__muted">not needed</span>':`<span class="ac-badge ac-badge--${r.ok?"success":"danger"}">${r.ok?"yes":"no"}</span>`},{key:"ms",label:"Time",align:"right",render:r=>r.vendored?"\u2014":r.ms!=null?`${r.ms} ms`:"\u2014"}],rows:a,empty:"No probe was run."})}
		${n>0&&s<n?'<div class="ac-alert ac-alert--warning" style="margin-top:14px"><div class="ac-alert__body"><p class="ac-alert__title">Some remote resources are unreachable</p><p class="ac-alert__text">Only the web font is affected \u2014 the application works with the system font stack.</p></div></div>':'<div class="ac-alert ac-alert--info" style="margin-top:14px"><div class="ac-alert__body"><p class="ac-alert__title">All the core dependencies are vendored</p><p class="ac-alert__text">The application works fully offline. The web font is the only optional external dependency.</p></div></div>'}`})}function Kn(e,a){let t=Zn(e,a),n=Fa();return E({title:"Summary",subtitle:"Every classroom deployment check, and every part of the platform you can manage from here.",body:`<h4 class="ac-section-panel__title" style="margin:0 0 10px">The deployment checks</h4>
			<div class="ac-summary">
				${t.map(s=>`<div class="ac-summary__item">
							<span class="ac-badge ac-badge--${s.status==="ok"?"success":s.status==="warn"?"warning":"danger"}">${s.status==="ok"?"\u2713":s.status==="warn"?"\u26A0":"\u2717"}</span>
							<div>
								<p class="ac-summary__label">${y(s.label)}</p>
								<p class="ac-summary__detail">${y(s.detail)}</p>
								${s.action?`<button type="button" class="ac-btn ac-btn--sm" data-ac-setup-goto="${y(s.action.step)}">${y(s.action.label)}</button>`:""}
							</div>
						</div>`).join("")}
				<div class="ac-summary__item">
					<span class="ac-badge ac-badge--${n?"success":"warning"}">${n?"\u2713":"\u26A0"}</span>
					<div>
						<p class="ac-summary__label">Firewall and router configured</p>
						<p class="ac-summary__detail">${n?"You confirmed all four checks yourself.":"Not confirmed yet \u2014 and it does not have to be: the application works either way."}</p>
						<button type="button" class="ac-btn ac-btn--sm" data-ac-setup-goto="firewall">Open the checklist</button>
					</div>
				</div>
			</div>
			${e.capacity?`<div class="ac-alert ac-alert--info" style="margin-top:14px"><div class="ac-alert__body"><p class="ac-alert__title">Configured capacity</p><p class="ac-alert__text">${y(String(e.capacity.maxUsers||100))} users and ${y(String(e.capacity.maxGamePlayers||30))} players per game. These are recorded values, not enforced limits.</p></div></div>`:""}
			<h4 class="ac-section-panel__title" style="margin:24px 0 6px">Manage the platform from here</h4>
			<p class="ac-field__hint" style="margin-bottom:12px">Every part of the control center, and what each one is for.</p>
			<div class="ac-manage-grid">
				${Jn.map(s=>`<a class="ac-manage-card" href="${y(s.href)}">
						<span class="ac-manage-card__title">${y(s.title)}</span>
						<span class="ac-manage-card__desc">${y(s.desc)}</span>
					</a>`).join("")}
			</div>`})}var Jn=[{href:"#/overview",title:"Overview",desc:"The workbench: control, access, credentials, maintenance, activity, analytics, documents, notes and planning."},{href:"#/organizations",title:"Organizations",desc:"Every tenant: create one, edit its profile, suspend it, reactivate it, remove it."},{href:"#/users",title:"Users & access",desc:"The hub: the account counts, the requests waiting for a decision, and the three rosters."},{href:"#/users/teachers",title:"Teachers",desc:"Add a teacher, change their role, suspend them, reset their password, remove them."},{href:"#/users/students",title:"Students",desc:"Add a student, move them to a class, suspend them, reset their password, remove them."},{href:"#/users/administrators",title:"Directors & administrators",desc:"The people who can administer: the school directors and the platform administrators."},{href:"#/analytics",title:"Platform analytics",desc:"Adoption, activity and engagement, per organization and per class."},{href:"#/audit",title:"Activity & audit",desc:"Every administrative action and every authentication event, searchable."},{href:"#/health",title:"System health",desc:"Availability, error rate, latency, the database, the storage and the scheduled work."},{href:"#/settings?section=general",title:"General settings",desc:"The organization identity, the quiz defaults and the appearance."},{href:"#/settings?section=profile",title:"My profile",desc:"Your own account, and your own password."},{href:"#/settings?section=access",title:"Users & access settings",desc:"The pending account requests and the pending profile changes."},{href:"#/settings?section=teaching",title:"Teacher access",desc:"The seventeen switches that decide what a teacher may reach in the classroom."},{href:"#/settings?section=realtime",title:"Realtime",desc:"The broadcast switches, the recovery code, the connected devices and the sync actions."},{href:"#/settings?section=presets",title:"Presets",desc:"The quiz presets and the game presets."},{href:"#/settings?section=documents",title:"Documents & data",desc:"The generated documents, the export, the import, the archives and the factory reset."},{href:"#/settings?section=ai",title:"Artificial intelligence",desc:"The providers, the keys, the models, the shared catalogue and your own model."},{href:"#/settings?section=roles",title:"Roles & permissions",desc:"What each role may do, and the full permission catalogue."},{href:"#/settings?section=deployment",title:"Deployment & session",desc:"Where this installation runs, and what this session can reach."}];function Zn(e,a){let t=[],n=e.hostBinding==="0.0.0.0";t.push({id:"binding",label:`Server listening on ${e.hostBinding||"0.0.0.0"}:${e.port||3e3}`,status:n?"ok":"warn",detail:n?"Every network interface \u2014 the students can reach this server.":"The server is not bound to every interface.",action:n?null:{step:"server",label:"Look at the server step"}});let s=e.nodeEnv!=="production";t.push({id:"env",label:`NODE_ENV = ${e.nodeEnv||"development"}`,status:s?"ok":"warn",detail:s?"HTTP works for the login and refresh cookies.":"Production mode sets Secure cookies \u2014 HTTP sign-in will fail. Use HTTPS or NODE_ENV=development.",action:s?null:{step:"server",label:"Look at the server step"}}),t.push({id:"lan",label:a&&a.length?`${a.length} LAN address(es) found`:"No LAN address found",status:a&&a.length?"ok":"fail",detail:a&&a.length?a.map(i=>i.address).join(", "):"No IPv4 LAN interface was detected.",action:a&&a.length?{step:"access",label:"Show the address"}:null});let r=e.database||{},p=r.inferredInfo&&r.inferredInfo.exists;if(t.push({id:"database",label:"Database file exists",status:p?"ok":"warn",detail:r.inferred?`Prisma uses: ${r.inferred}`:"The database path could not be resolved.",action:{step:"database",label:"Open the database step"}}),Array.isArray(e.cdn)&&e.cdn.length){let i=e.cdn.filter(l=>l.ok).length;t.push({id:"cdn",label:`Resource reachability: ${i}/${e.cdn.length}`,status:i===e.cdn.length?"ok":i>0?"warn":"fail",detail:i===e.cdn.length?"Every probed resource answered.":"Some resources are unreachable \u2014 an offline or restricted network.",action:{step:"offline",label:"Open the offline step"}})}return t.push({id:"realtime",label:"The realtime channel",status:"ok",detail:"There is no separate realtime server: the pages, the API and the realtime channel are served by this one process, on this one port.",action:{step:"access",label:"Show the student address"}}),t.push({id:"fonts",label:"The web font is served locally",status:"ok",detail:"The interface fonts are vendored under public/fonts/, so the application renders with no internet access.",action:{step:"offline",label:"Open the offline step"}}),t}function le(e,a,t=""){let n=t==="ok"?'<span class="ac-badge ac-badge--success">\u2713</span>':t==="warn"?'<span class="ac-badge ac-badge--warning">\u26A0</span>':t==="fail"?'<span class="ac-badge ac-badge--danger">\u2717</span>':"";return`<div class="ac-defs__item">
		<p class="ac-defs__term">${y(e)}</p>
		<p class="ac-defs__desc">${y(a)} ${n}</p>
	</div>`}function Xn(e){return e.port||3e3}function er(e){return`New-NetFirewallRule -DisplayName "Quiz Portal ${e}" -Direction Inbound -Action Allow -Protocol TCP -LocalPort ${e}`}async function Ts(e){try{await navigator.clipboard.writeText(e)}catch{let a=document.createElement("textarea");a.value=e,document.body.appendChild(a),a.select(),document.execCommand("copy"),a.remove()}}function ar(){return typeof window.qrcode=="function"?Promise.resolve():new Promise((e,a)=>{let t=document.createElement("script");t.src="/qrcode-generator.js",t.onload=()=>{typeof window.qrcode=="function"?e():a(new Error("The QR generator could not be loaded."))},t.onerror=()=>a(new Error("The QR generator could not be loaded.")),document.head.appendChild(t)})}function tr(e,a){let t=URL.createObjectURL(e),n=document.createElement("a");n.href=t,n.download=a,document.body.appendChild(n),n.click(),n.remove(),setTimeout(()=>URL.revokeObjectURL(t),2e3)}var sr=[{value:"openrouter",label:"OpenRouter \u2014 all providers, free tier"},{value:"openai",label:"OpenAI (GPT family)"},{value:"anthropic",label:"Anthropic (Claude)"},{value:"google",label:"Google AI (Gemini)"},{value:"deepseek",label:"DeepSeek"},{value:"custom",label:"Custom / Local (Ollama, LM Studio\u2026)"}],nr={openrouter:"https://openrouter.ai/keys",openai:"https://platform.openai.com/api-keys",anthropic:"https://console.anthropic.com/settings/keys",google:"https://aistudio.google.com/app/apikey",deepseek:"https://platform.deepseek.com/api_keys"};async function Ls(e){let a=await w.get("ai/configs"),t=Array.isArray(a?.data)?a.data:[],n=t.filter(i=>i.is_shared),s=t.filter(i=>!i.is_shared),r=[E({title:"Nothing here is required",subtitle:"The platform works fully without an AI provider.",body:`<div class="ac-alert ac-alert--info">
					<div class="ac-alert__body">
						<p class="ac-alert__title">Optional by design</p>
						<p class="ac-alert__text">Without a configured model, question generation returns a generated set rather than an error, and image generation falls back to text options. A LAN installation can point a custom provider at a model server on the local network \u2014 no internet access is required for that either.</p>
					</div>
				</div>`}),E({title:"Load models from a provider",subtitle:"Enter the provider key once, fetch the live model list, then publish the models the teachers should see.",body:`<div class="ac-field-grid">
					${O({id:"set-ai-provider",label:"Provider",options:sr,value:"openrouter"})}
					${A({id:"set-ai-key",label:"API key",type:"password",hint:"Stored encrypted on the server. It is never sent back to a browser."})}
				</div>
				<div class="ac-field ac-field--full" data-ac-ai-base hidden>
					${A({id:"set-ai-base-url",label:"Base URL",value:"",placeholder:"http://localhost:11434/v1",hint:"The chat-completions endpoint of any OpenAI-compatible server (Ollama, LM Studio, vLLM, Groq, an enterprise gateway\u2026)."})}
				</div>
				<div class="ac-toolbar" style="margin-bottom:12px">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-ai-load>Load models (live)</button>
						<button type="button" class="ac-btn" data-ac-ai-test-key>Test connection</button>
						<span class="ac-table__muted" data-ac-ai-status></span>
					</div>
				</div>
				<div data-ac-ai-catalog hidden>
					<div class="ac-field-grid">
						${A({id:"set-ai-model-filter",label:"Filter the list",value:"",placeholder:"Type to filter\u2026"})}
					</div>
					<div data-ac-ai-models></div>
					<div class="ac-toolbar" style="margin:12px 0 0">
						<div class="ac-toolbar__row">
							<button type="button" class="ac-btn ac-btn--primary" data-ac-ai-publish>Publish the selected models</button>
						</div>
					</div>
				</div>`}),E({title:"Shared models",subtitle:"The models every teacher in this organization may use.",body:n.length?C({columns:[{key:"name",label:"Name",render:i=>`<span class="ac-table__primary">${y(i.name)}</span><br><span class="ac-table__muted">${y(i.provider)} \xB7 ${y(i.model_id)}</span>`},{key:"key_hint",label:"Key",render:i=>i.has_key?`<code>${y(i.key_hint||"\u2022\u2022\u2022\u2022")}</code>`:'<span class="ac-badge">none (local server)</span>'},{key:"is_default",label:"Default",render:i=>i.is_default?'<span class="ac-badge ac-badge--success">yes</span>':'<span class="ac-badge">no</span>'},{key:"actions",label:"",align:"right",render:i=>`<button type="button" class="ac-btn ac-btn--sm" data-ac-ai-test="${y(i.id)}">Test</button> <button type="button" class="ac-btn ac-btn--sm" data-ac-ai-delete="${y(i.id)}">Delete</button>`}],rows:n}):'<p class="ac-empty__message">No shared model yet. Load a provider list above and publish the models the teachers should use.</p>'}),E({title:"My own model",subtitle:"Private to you. A local server needs no key at all.",body:`<div class="ac-field-grid">
					${A({id:"set-ai-personal-name",label:"Display name",placeholder:"My Ollama"})}
					${A({id:"set-ai-personal-model",label:"Model id",placeholder:"llama3.1:8b, gpt-5-mini"})}
					${A({id:"set-ai-personal-base",label:"Base URL",placeholder:"http://localhost:11434/v1"})}
					${A({id:"set-ai-personal-key",label:"API key",type:"password",hint:"Optional for a local server."})}
				</div>
				<div class="ac-toolbar" style="margin-bottom:12px">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-ai-save-personal>Save my model</button>
						<span class="ac-table__muted" data-ac-ai-personal-status></span>
					</div>
				</div>
				${s.length?C({columns:[{key:"name",label:"Model",render:i=>`<span class="ac-table__primary">${y(i.name)}</span><br><span class="ac-table__muted">${y(i.provider)} \xB7 ${y(i.model_id)}</span>`},{key:"actions",label:"",align:"right",render:i=>`<button type="button" class="ac-btn ac-btn--sm" data-ac-ai-test="${y(i.id)}">Test</button> <button type="button" class="ac-btn ac-btn--sm" data-ac-ai-delete="${y(i.id)}">Delete</button>`}],rows:s}):'<p class="ac-empty__message">You have no personal model yet.</p>'}`})].join("");function p(i){let l=i.querySelector("[data-ac-ai-status]"),c=b=>{l&&(l.textContent=b)},u=i.querySelector("#set-ai-provider"),d=i.querySelector("[data-ac-ai-base]"),m=i.querySelector("#set-ai-key"),g=()=>{let b=u?.value||"";if(d&&(d.hidden=b!=="custom"),m){let k=nr[b];m.placeholder=b==="custom"?"Not needed for a local server":"sk-\u2026"}};u?.addEventListener("change",g),g();let f=[],x=()=>{let b=i.querySelector("[data-ac-ai-models]");if(b){if(!f.length){b.innerHTML='<p class="ac-empty__message">The provider returned no model.</p>';return}b.innerHTML=`<div class="ac-model-catalog">
				${f.map(k=>`<label class="ac-model-catalog__item">
					<input type="checkbox" value="${y(k.id)}" data-ac-ai-model />
					<span class="ac-model-catalog__name">${y(k.label||k.id)}</span>
					<code class="ac-model-catalog__id">${y(k.id)}</code>
				</label>`).join("")}
			</div>`}},h=i.querySelector("#set-ai-model-filter");h?.addEventListener("input",()=>{let b=h.value.trim().toLowerCase();i.querySelectorAll(".ac-model-catalog__item").forEach(T=>{let q=T.textContent.toLowerCase();T.hidden=b!==""&&!q.includes(b)})}),i.querySelector("[data-ac-ai-load]")?.addEventListener("click",async()=>{c("Loading\u2026");try{let b=i.querySelector("#set-ai-provider")?.value,k=i.querySelector("#set-ai-key")?.value||void 0,T=i.querySelector("#set-ai-base-url")?.value||void 0,q=await w.post("ai/models/refresh",{provider:b,api_key:k||void 0,base_url:T||void 0});f=Array.isArray(q?.data)?q.data:[];let z=i.querySelector("[data-ac-ai-catalog]");z&&(z.hidden=!1),x(),c(`${f.length} model(s) returned.`)}catch(b){c(b.message),v(b.message,"error")}}),i.querySelector("[data-ac-ai-test-key]")?.addEventListener("click",async()=>{c("Testing\u2026");try{let b=i.querySelector("#set-ai-provider")?.value,k=i.querySelector("#set-ai-key")?.value||void 0,T=i.querySelector("#set-ai-base-url")?.value||void 0,q=await w.post("ai/models/refresh",{provider:b,api_key:k||void 0,base_url:T||void 0}),z=Array.isArray(q?.data)?q.data.length:0;c(z?`The provider answered: ${z} model(s).`:"The provider answered but returned no model.")}catch(b){c(b.message)}}),i.querySelector("[data-ac-ai-publish]")?.addEventListener("click",async()=>{let b=Array.from(i.querySelectorAll("[data-ac-ai-model]:checked")).map(z=>z.value);if(!b.length){v("Select at least one model to publish.","error");return}let k=i.querySelector("#set-ai-provider")?.value,T=i.querySelector("#set-ai-key")?.value||void 0,q=i.querySelector("#set-ai-base-url")?.value||void 0;try{for(let z of b)await w.post("ai/configs",{provider:k,name:z,model_id:z,base_url:k==="custom"?q:void 0,api_key:T||void 0,shared:!0});v(`${b.length} model(s) published.`,"success"),e.rerender()}catch(z){v(z.message,"error")}}),i.querySelector("[data-ac-ai-save-personal]")?.addEventListener("click",async()=>{let b=i.querySelector("[data-ac-ai-personal-status]"),k=I=>i.querySelector(`#${I}`)?.value?.trim()??"",T=k("set-ai-personal-name"),q=k("set-ai-personal-model"),z=k("set-ai-personal-base"),L=k("set-ai-personal-key");if(!T||!q){v("A display name and a model id are required.","error");return}try{await w.post("ai/configs",{provider:z?"custom":"openrouter",name:T,model_id:q,base_url:z||void 0,api_key:L||void 0,shared:!1}),b&&(b.textContent="Saved."),v("Your model was saved.","success"),e.rerender()}catch(I){b&&(b.textContent=I.message),v(I.message,"error")}}),i.querySelectorAll("[data-ac-ai-test]").forEach(b=>{b.addEventListener("click",async()=>{try{let k=await w.post(`ai/configs/${encodeURIComponent(b.dataset.acAiTest)}/test`);v(k?.message||(k?.ok?"The model is reachable.":"The model did not answer."),k?.ok?"success":"error")}catch(k){v(k.message,"error")}})}),i.querySelectorAll("[data-ac-ai-delete]").forEach(b=>{b.addEventListener("click",async()=>{if(await M({title:"Delete this model?",message:"The model is removed from the server. Anyone using it will have to pick another one.",confirmLabel:"Delete model",danger:!0}))try{await w.del(`ai/configs/${encodeURIComponent(b.dataset.acAiDelete)}`),v("The model was deleted.","success"),e.rerender()}catch(T){v(T.message,"error")}})})}return{markup:r,bind:p}}async function Cs(){let e=await w.get("console/roles"),a=e.roles||[],t=e.catalog||[];return{markup:[E({title:"Roles",subtitle:"The roles the platform knows, and what each one may do.",body:C({columns:[{key:"label",label:"Role",render:s=>`<span class="ac-table__primary">${y(s.label)}</span><br><span class="ac-table__muted">${y(s.description||"")}</span>`},{key:"key",label:"Key",render:s=>`<code>${y(s.key)}</code>`},{key:"scopeLabel",label:"Scope",render:s=>`<span class="ac-badge">${y(s.scopeLabel)}</span>`},{key:"permissions",label:"Permissions",align:"right",render:s=>String(s.permissions.length)},{key:"isAssignable",label:"Assignable",render:s=>`<span class="ac-badge ac-badge--${s.isAssignable?"success":""}">${s.isAssignable?"yes":"no"}</span>`}],rows:a})}),E({title:"Permission catalog",subtitle:"Every capability, grouped by the scope it applies in.",body:t.map(s=>`<h4 class="ac-section-panel__title" style="margin:14px 0 6px">${y(s.group)}</h4>${C({columns:[{key:"label",label:"Permission",render:r=>`<span class="ac-table__primary">${y(r.label)}</span><br><span class="ac-table__muted">${y(r.description||"")}</span>`},{key:"id",label:"Identifier",render:r=>`<code>${y(r.id)}</code>`}],rows:s.permissions})}`).join("")})].join(""),bind:null}}async function Es(e){let a=e.session||{},t=a.deployment||{},n=e.organization||{};return{markup:[E({title:"Deployment & session",subtitle:"Where this installation runs, and what this session can reach.",body:`<div class="ac-defs">
					<div class="ac-defs__item">
						<p class="ac-defs__term">Deployment mode</p>
						<p class="ac-defs__desc">${y(t.mode||"\u2014")}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Database provider</p>
						<p class="ac-defs__desc">${y(t.dbProvider||"\u2014")}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Signed in as</p>
						<p class="ac-defs__desc">${y(a.user?.name||"")}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Role</p>
						<p class="ac-defs__desc">${y(a.user?.roleLabel||a.user?.role||"")}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Your scope</p>
						<p class="ac-defs__desc">${e.isPlatform?t.isOffline?"Every organization on this installation":"Every organization on the platform":n?.name||"Your organization"}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Effective permissions</p>
						<p class="ac-defs__desc">${(a.permissions||[]).length}</p>
					</div>
				</div>
				<div class="ac-alert ac-alert--info" style="margin-top:16px">
					<div class="ac-alert__body">
						<p class="ac-alert__title">Deployment mode and role are separate</p>
						<p class="ac-alert__text">${t.isOffline?"On an offline installation this server is the whole platform, so administration covers the organizations hosted here and no feature requires internet access. An organization administrator still sees only their own organization, and a super administrator administers this installation.":"On a multi-tenant platform a super administrator reaches every organization while an organization administrator reaches only their own. Switching deployment mode never changes what a given role may reach."}</p>
					</div>
				</div>
				<div class="ac-alert ac-alert--info" style="margin-top:12px">
					<div class="ac-alert__body">
						<p class="ac-alert__title">The mode is set by the environment</p>
						<p class="ac-alert__text">It is read from <code>DEPLOYMENT_MODE</code>, then <code>APP_MODE</code>, then <code>DB_PROVIDER</code>, and it is decided when the server starts. There is deliberately no switch here: a runtime toggle would leave the server running in the old mode while the screen claimed otherwise.</p>
					</div>
				</div>`}),E({title:"Plan and capacity",subtitle:"Observed configuration \u2014 nothing is enforced from it.",body:`<div class="ac-alert ac-alert--info">
					<div class="ac-alert__body">
						<p class="ac-alert__title">Plan and capacity are observed, not enforced</p>
						<p class="ac-alert__text">The business model does not support subscriptions or quotas yet. The plan and the student capacity recorded on the organization are displayed for information only \u2014 no entitlement is derived from them.</p>
					</div>
				</div>
				<div class="ac-defs">
					<div class="ac-defs__item">
						<p class="ac-defs__term">Plan</p>
						<p class="ac-defs__desc">${y(n?.plan||"\u2014")}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Student capacity</p>
						<p class="ac-defs__desc">${y(String(n?.maxStudents??"\u2014"))}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Academic year</p>
						<p class="ac-defs__desc">${y(n?.schoolYear||"not set")}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Organization status</p>
						<p class="ac-defs__desc">${y(n?.status||"\u2014")}</p>
					</div>
				</div>`})].join(""),bind:null}}var Ye=[{id:"general",label:"General",icon:"general"},{id:"profile",label:"My profile",icon:"profile"},{id:"access",label:"Users & access",icon:"access"},{id:"teaching",label:"Teacher access",icon:"teaching"},{id:"realtime",label:"Realtime",icon:"realtime"},{id:"presets",label:"Presets",icon:"presets"},{id:"documents",label:"Documents & data",icon:"data"},{id:"setup",label:"Setup & diagnostics",icon:"setup"},{id:"ai",label:"Artificial intelligence",icon:"ai"},{id:"roles",label:"Roles & permissions",icon:"roles"},{id:"deployment",label:"Deployment & session",icon:"deployment"}],rr={general:cs,profile:ls,access:ds,teaching:us,realtime:gs,presets:xs,documents:Ss,setup:As,ai:Ls,roles:Cs,deployment:Es},js={id:"settings",path:"/settings",title:"Application Settings",description:"General configuration, the organization profile, access, data and the deployment \u2014 as a page, not a dialog.",permission:["platform.settings.manage","school.settings.manage"],async render(e,a,t){let n=Ye.some(u=>u.id===t.query?.section)?t.query.section:Ye[0].id;e.innerHTML=`<div class="ac-split" data-ac-settings>
			<div class="ac-split__main" data-ac-settings-main>${H(5)}</div>
			<div data-ac-settings-menu></div>
		</div>`;let s=e.querySelector(".ac-split"),r=e.querySelector("[data-ac-settings-menu]"),p=e.querySelector("[data-ac-settings-main]"),i=0,l=ns();s.classList.toggle("ac-split--collapsed",l),r.innerHTML=ts({sections:Ye,active:n,collapsed:l}),ss(e,{onSelect:u=>{se(`/settings?section=${encodeURIComponent(u)}`,{replace:!0})}}),await(async u=>{let d=++i;p.innerHTML=H(4);let m=rr[u];if(!m){p.innerHTML=D({title:"Unknown section",message:`There is no settings section called "${u}".`});return}try{let{markup:g,bind:f}=await m(a,t);if(d!==i)return;p.innerHTML=g,typeof f=="function"&&f(p,a)}catch(g){if(d!==i)return;p.innerHTML=D({title:"This section could not be loaded",message:g.message})}})(n)}};async function we(){let e=await w.get("settings/admin"),a=new Map;for(let t of Array.isArray(e)?e:[])a.set(t.key,t);return a}async function V(e,a){let t=typeof a=="string"?a:JSON.stringify(a);await w.patch(`settings/${encodeURIComponent(e)}`,{key:e,value:t})}var zs={id:"organization-detail",path:"/organizations/:id",title:"Organization",description:"Profile, accounts, usage, activity and administrative history.",permission:["platform.organizations.read","school.profile.read"],async render(e,a,t){let n=t.params?.id;e.innerHTML=`<div class="ac-stack" data-ac-org-detail>${H(4)}</div>`;let s;try{s=(await w.get(`console/organizations/${encodeURIComponent(n)}`)).data}catch(c){e.innerHTML=D({title:"This organization could not be loaded",message:c.message});return}let r=s.organization,p=s.usage,i=a.isPlatform||(a.session.permissions||[]).includes("school.profile.manage");a.setTitle(r.name,`${r.slug} \xB7 ${r.schoolType||"organization"}${r.schoolYear?` \xB7 academic year ${r.schoolYear}`:""}`),e.innerHTML=`
			${F({chips:'<a class="ac-btn" href="#/organizations">\u2190 All organizations</a>',actions:i?`<button type="button" class="ac-btn" data-ac-toggle-status>${r.status==="suspended"?"Reactivate organization":"Suspend organization"}</button>`:""})}

			<div class="ac-panel">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title">${o(r.name)}</h3>
						<p class="ac-panel__subtitle">${o(r.slug)} \xB7 ${o(r.schoolType||"\u2014")}${r.schoolYear?` \xB7 academic year ${o(r.schoolYear)}`:""}</p>
					</div>
					<div class="ac-panel__actions">
						<span class="ac-badge ${r.status==="active"?"ac-badge--success":r.status==="pending"?"ac-badge--warning":"ac-badge--danger"}">${o(r.status)}</span>
					</div>
				</div>
				<div class="ac-panel__body">
					<div class="ac-defs">
						<div class="ac-defs__item">
							<p class="ac-defs__term">Plan</p>
							<p class="ac-defs__desc">${o(r.plan||"\u2014")}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">City</p>
							<p class="ac-defs__desc">${o(r.city||"\u2014")}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Contact</p>
							<p class="ac-defs__desc">${o(r.email||r.phone||"\u2014")}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Created</p>
							<p class="ac-defs__desc">${o(N(r.createdAt,{withTime:!1}))}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Last activity</p>
							<p class="ac-defs__desc">${p.lastActivity?o(U(p.lastActivity)):"never"}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Student capacity</p>
							<p class="ac-defs__desc">${o(String(r.maxStudents??"\u2014"))}</p>
						</div>
					</div>
					${r.status==="suspended"?`<div class="ac-alert ac-alert--danger" style="margin-top:16px">
								<div class="ac-alert__body">
									<p class="ac-alert__title">Access is suspended</p>
									<p class="ac-alert__text">${r.suspendedReason?o(r.suspendedReason):"No reason was recorded."} \xB7 suspended ${o(N(r.suspendedAt))}</p>
								</div>
							</div>`:""}
				</div>
			</div>

			<div class="ac-grid ac-grid--kpi" style="margin-top:16px">
				${S({label:"Teachers",value:_(p.teachers),note:`${_(p.activeTeachers)} active in 30 days`,tone:"primary",tooltip:"Teacher accounts, and how many produced a recorded event in the last 30 days."})}
				${S({label:"Students",value:_(p.students),note:`${_(p.activeStudents)} active in 30 days`,tone:"primary",tooltip:"Student accounts, and how many produced a recorded event in the last 30 days."})}
				${S({label:"Attempts (30d)",value:_(p.attempts30d),note:`${_(p.formalAttempts30d)} formal`,tooltip:"Completed attempts of any mode inside the last 30 days."})}
				${S({label:"Content",value:_(p.questions+p.exams),note:`${_(p.questions)} questions \xB7 ${_(p.exams)} exams`,tooltip:"Rows that exist in this organization. These are totals, not period counts."})}
				${S({label:"Needs attention",value:_(p.suspendedAccounts+p.pendingRequests),note:`${_(p.suspendedAccounts)} suspended \xB7 ${_(p.pendingRequests)} pending`,tone:p.suspendedAccounts+p.pendingRequests>0?"warning":"",tooltip:"Suspended accounts and account requests awaiting a decision."})}
			</div>

			<div class="ac-grid ac-grid--2" style="margin-top:16px">
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles">
							<h3 class="ac-panel__title">Administrators</h3>
							<p class="ac-panel__subtitle">The accounts that can administer this organization.</p>
						</div>
					</div>
					<div class="ac-panel__body ac-panel__body--flush">
						${C({columns:[{key:"name",label:"Account",render:c=>`<a href="#/users/${c.id}" class="ac-table__primary">${o(c.name)}</a><br><span class="ac-table__muted">${o(c.username)}</span>`},{key:"status",label:"Status",render:c=>`<span class="ac-badge ac-badge--${c.status==="active"?"success":"warning"}">${o(c.status)}</span>`},{key:"lastLogin",label:"Last sign-in",render:c=>c.lastLogin?o(U(c.lastLogin)):"never"}],rows:s.administrators,empty:"This organization has no administrator account."})}
					</div>
				</section>
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles">
							<h3 class="ac-panel__title">Classes</h3>
							<p class="ac-panel__subtitle">The organizational structure of this organization.</p>
						</div>
					</div>
					<div class="ac-panel__body ac-panel__body--flush">
						${C({columns:[{key:"name",label:"Class",render:c=>`<span class="ac-table__primary">${o(c.name)}</span>`},{key:"studentCount",label:"Students",align:"right"},{key:"createdAt",label:"Created",render:c=>o(N(c.createdAt,{withTime:!1}))}],rows:s.classes,empty:"No class has been created in this organization."})}
					</div>
				</section>
			</div>

			<div class="ac-section">
				<h2 class="ac-section__title">Accounts</h2>
				<p class="ac-section__hint">Teachers and students of this organization, with their recent activity.</p>
			</div>
			<div class="ac-grid ac-grid--2">
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles"><h3 class="ac-panel__title">Teachers</h3></div>
					</div>
					<div class="ac-panel__body ac-panel__body--flush">
						${C({columns:[{key:"name",label:"Teacher",render:c=>`<a href="#/users/${c.id}" class="ac-table__primary">${o(c.name)}</a>`},{key:"active",label:"Active (30d)",render:c=>c.active?'<span class="ac-badge ac-badge--success">yes</span>':'<span class="ac-badge ac-badge--warning">no</span>'},{key:"lastLogin",label:"Last sign-in",render:c=>c.lastLogin?o(U(c.lastLogin)):"never"}],rows:s.teachers,empty:"No teacher account in this organization."})}
					</div>
				</section>
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles"><h3 class="ac-panel__title">Students</h3></div>
					</div>
					<div class="ac-panel__body ac-panel__body--flush">
						${C({columns:[{key:"name",label:"Student",render:c=>`<a href="#/users/${c.id}" class="ac-table__primary">${o(c.name)}</a>`},{key:"active",label:"Active (30d)",render:c=>c.active?'<span class="ac-badge ac-badge--success">yes</span>':'<span class="ac-badge ac-badge--warning">no</span>'},{key:"lastLogin",label:"Last sign-in",render:c=>c.lastLogin?o(U(c.lastLogin)):"never"}],rows:s.students,empty:"No student account in this organization."})}
					</div>
				</section>
			</div>

			<div class="ac-section">
				<h2 class="ac-section__title">Administrative history</h2>
				<p class="ac-section__hint">The fifteen most recent recorded actions inside this organization.</p>
			</div>
			<section class="ac-panel">
				<div class="ac-panel__body ac-panel__body--flush">
					${C({columns:[{key:"occurredAt",label:"When",render:c=>o(N(c.occurredAt))},{key:"actorName",label:"Actor",render:c=>o(c.actorName||"system")},{key:"action",label:"Action"},{key:"entityType",label:"Entity"},{key:"outcome",label:"Outcome",render:c=>`<span class="ac-badge ac-badge--${c.outcome==="success"?"success":"warning"}">${o(c.outcome)}</span>`}],rows:s.recentActivity,empty:"No administrative action has been recorded for this organization."})}
				</div>
			</section>`;let l=e.querySelector("[data-ac-toggle-status]");l&&l.addEventListener("click",async()=>{let c=r.status!=="suspended";if(!await M({title:c?"Suspend this organization?":"Reactivate this organization?",message:c?"Suspending revokes access for every account in this organization. Their data is retained.":"Reactivating restores access for the accounts that were suspended with the organization.",detail:c?"The action is recorded in the audit trail with the reason you give.":"",confirmLabel:c?"Suspend":"Reactivate",danger:c}))return;let d=null;if(!(c&&(d=window.prompt("Reason for suspending (recorded in the audit trail):",""),d===null)))try{await w.patch(`console/organizations/${encodeURIComponent(n)}`,{status:c?"suspended":"active",reason:d||null}),v(c?"Organization suspended.":"Organization reactivated.","success"),a.rerender()}catch(m){v(m.message,"error")}})}};var Ps={super_admin:"Platform administrator",admin:"Organization administrator",teacher:"Teacher",student:"Student"},Ms={id:"user-detail",path:"/users/:id",title:"Account",description:"Profile, access, recent activity and the administrative actions available.",permission:["platform.users.read","school.users.read"],async render(e,a,t){let n=t.params?.id;e.innerHTML=`<div class="ac-stack" data-ac-user-detail>${H(4)}</div>`;let s;try{s=(await w.get(`console/users/${encodeURIComponent(n)}`)).data}catch(l){e.innerHTML=D({title:"This account could not be loaded",message:l.message});return}let r=s.account,p=a.isPlatform||(a.session.permissions||[]).includes("school.users.manage"),i=a.isPlatform||(a.session.permissions||[]).includes("school.roles.manage");a.setTitle(r.name||r.username,`${Ps[r.role]||r.role} \xB7 ${s.organization?.name||"organization"} \xB7 ${r.status}`),e.innerHTML=`
			${F({chips:'<a class="ac-btn" href="#/users">\u2190 All accounts</a>',actions:`${p?`<button type="button" class="ac-btn" data-ac-toggle-status>${r.status==="active"?"Suspend account":"Reactivate account"}</button>`:""}
				${i?'<button type="button" class="ac-btn" data-ac-change-role>Change role</button>':""}
				${i?'<button type="button" class="ac-btn" data-ac-grant>Grant permission</button>':""}
				<button type="button" class="ac-btn" data-ac-revoke-sessions>Revoke sessions</button>
				${p&&String(r.id)!==String(a.session.user?.id)?'<button type="button" class="ac-btn" data-ac-reset-credential>Reset credential</button>':""}
				${p&&String(r.id)!==String(a.session.user?.id)?'<button type="button" class="ac-btn ac-btn--danger" data-ac-delete-account>Delete account</button>':""}`})}

			<div class="ac-panel">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title">${o(r.name||r.username)}</h3>
						<p class="ac-panel__subtitle">${o(r.username)}${r.email?` \xB7 ${o(r.email)}`:""}</p>
					</div>
					<div class="ac-panel__actions">
						<span class="ac-badge ac-badge--brand">${o(Ps[r.role]||r.role)}</span>
						<span class="ac-badge ac-badge--${r.status==="active"?"success":r.status==="suspended"?"danger":"warning"}">${o(r.status)}</span>
					</div>
				</div>
				<div class="ac-panel__body">
					<div class="ac-defs">
						<div class="ac-defs__item">
							<p class="ac-defs__term">Organization</p>
							<p class="ac-defs__desc">${o(s.organization?.name||"\u2014")}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Class</p>
							<p class="ac-defs__desc">${o(s.class?.name||"\u2014")}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Student number</p>
							<p class="ac-defs__desc">${o(r.numero||"\u2014")}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Last sign-in</p>
							<p class="ac-defs__desc">${r.lastLogin?o(U(r.lastLogin)):"never"}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Account created</p>
							<p class="ac-defs__desc">${o(N(r.createdAt,{withTime:!1}))}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Attempts (30d)</p>
							<p class="ac-defs__desc">${_(s.activity.attempts30d)}</p>
						</div>
					</div>
				</div>
			</div>

			<div class="ac-grid ac-grid--kpi" style="margin-top:16px">
				${S({label:"Attempts (30d)",value:_(s.activity.attempts30d),note:`${_(s.activity.formalAttempts30d)} formal`,tooltip:"Completed attempts of any mode inside the last 30 days."})}
				${S({label:"Last sign-in",value:r.lastLogin?o(U(r.lastLogin)):"never",tone:r.lastLogin?"primary":"warning",tooltip:"From the recorded authentication trail."})}
				${S({label:"Permission overrides",value:_(s.permissionOverrides.length),note:s.permissionOverrides.length?"grants or denies on top of the role":"role baseline only",tone:s.permissionOverrides.length?"warning":"",tooltip:"Individual permissions granted to, or denied from, this account on top of what its role carries."})}
			</div>

			<div class="ac-section">
				<h2 class="ac-section__title">Access</h2>
				<p class="ac-section__hint">The effective access of this account.</p>
			</div>
			<section class="ac-panel">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title">Permission overrides</h3>
						<p class="ac-panel__subtitle">Removing an override restores the role's baseline.</p>
					</div>
				</div>
				<div class="ac-panel__body ac-panel__body--flush">
					${s.permissionOverrides.length?C({columns:[{key:"permission",label:"Permission",render:l=>`<code>${o(l.permission)}</code>`},{key:"effect",label:"Effect",render:l=>`<span class="ac-badge ac-badge--${l.effect==="grant"?"success":"danger"}">${o(l.effect)}</span>`},{key:"scopeKey",label:"Applies to",render:l=>o(l.scopeKey==="*"?"every scope":l.scopeKey)},{key:"reason",label:"Reason",render:l=>o(l.reason||"\u2014")},{key:"createdAt",label:"Recorded",render:l=>o(N(l.createdAt))},{key:"actions",label:"",className:"ac-table__actions",render:l=>i?`<button type="button" class="ac-btn ac-btn--sm" data-ac-remove-override="${o(l.permission)}">Remove</button>`:""}],rows:s.permissionOverrides}):R({title:"No overrides",message:"This account holds exactly the permissions its role carries. Nothing has been granted or denied on top."})}
				</div>
			</section>

			<div class="ac-section">
				<h2 class="ac-section__title">Recent activity</h2>
				<p class="ac-section__hint">The ten most recent recorded attempts, and the fifteen most recent actions.</p>
			</div>
			<div class="ac-grid ac-grid--2">
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles"><h3 class="ac-panel__title">Recent attempts</h3></div>
					</div>
					<div class="ac-panel__body ac-panel__body--flush">
						${C({columns:[{key:"dateTaken",label:"When",render:l=>o(N(l.dateTaken))},{key:"mode",label:"Mode"},{key:"score20",label:"Score",align:"right",render:l=>l.mode==="exam"?`${l.score20.toFixed(2)} /20`:`${Math.round(l.score)}%`}],rows:s.recentResults,empty:"This account has no recorded attempt."})}
					</div>
				</section>
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles"><h3 class="ac-panel__title">Administrative actions</h3></div>
					</div>
					<div class="ac-panel__body ac-panel__body--flush">
						${C({columns:[{key:"occurredAt",label:"When",render:l=>o(N(l.occurredAt))},{key:"action",label:"Action"},{key:"entityType",label:"Entity"},{key:"outcome",label:"Outcome",render:l=>`<span class="ac-badge ac-badge--${l.outcome==="success"?"success":"warning"}">${o(l.outcome)}</span>`}],rows:s.recentActivity,empty:"This account has performed no recorded administrative action."})}
					</div>
				</section>
			</div>`,ir(e,a,n,r,s)}};function ir(e,a,t,n,s){let r=e.querySelector("[data-ac-toggle-status]");r&&r.addEventListener("click",async()=>{let d=n.status==="active";if(!await M({title:d?"Suspend this account?":"Reactivate this account?",message:d?"The account will not be able to sign in. Its data is retained.":"The account will be able to sign in again.",detail:"The action is recorded in the audit trail and in the security event trail.",confirmLabel:d?"Suspend":"Reactivate",danger:d}))return;let g=null;if(!(d&&(g=window.prompt("Reason for suspending (recorded in the audit trail):",""),g===null)))try{await w.patch(`console/users/${encodeURIComponent(t)}`,{status:d?"suspended":"active",reason:g||null}),v(d?"Account suspended.":"Account reactivated.","success"),a.rerender()}catch(f){v(f.message,"error")}});let p=e.querySelector("[data-ac-change-role]");p&&p.addEventListener("click",async()=>{let m=B({title:"Change the role of this account",subtitle:"The change is recorded in the audit trail with the previous role.",body:`<div class="ac-field">
					<label class="ac-field__label" for="ac-new-role">New role</label>
					<select class="ac-select" id="ac-new-role">
						${[{value:"admin",label:"Organization administrator"},{value:"teacher",label:"Teacher"},{value:"student",label:"Student"}].map(g=>`<option value="${g.value}"${g.value===n.role?" selected":""}>${g.label}</option>`).join("")}
					</select>
				</div>`,footer:`
					<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
					<button type="button" class="ac-btn ac-btn--primary" data-ac-confirm>Change role</button>
				`});m.root.querySelector("[data-ac-cancel]").addEventListener("click",m.close),m.root.querySelector("[data-ac-confirm]").addEventListener("click",async()=>{let g=m.root.querySelector("#ac-new-role").value;m.close();try{await w.patch(`console/users/${encodeURIComponent(t)}`,{role:g}),v("Role updated.","success"),a.rerender()}catch(f){v(f.message,"error")}})});let i=e.querySelector("[data-ac-grant]");i&&i.addEventListener("click",async()=>{let d=[];try{d=((await w.get("console/roles")).catalog||[]).flatMap(x=>x.permissions)}catch{v("The permission catalog could not be loaded.","error");return}let m=new Set(s.permissionOverrides.map(f=>f.permission)),g=B({title:"Grant or deny a permission",subtitle:"Grants and denies sit on top of the role. A deny removes a permission the role carries.",body:`<div class="ac-field">
						<label class="ac-field__label" for="ac-permission">Permission</label>
						<select class="ac-select" id="ac-permission">
							${d.map(f=>`<option value="${f.id}"${m.has(f.id)?" disabled":""}>${f.label} \u2014 ${f.id}</option>`).join("")}
						</select>
					</div>
					<div class="ac-field" style="margin-top:12px">
						<label class="ac-field__label" for="ac-effect">Effect</label>
						<select class="ac-select" id="ac-effect">
							<option value="grant">Grant</option>
							<option value="deny">Deny</option>
						</select>
					</div>
					<div class="ac-field" style="margin-top:12px">
						<label class="ac-field__label" for="ac-override-reason">Reason</label>
						<input class="ac-input" id="ac-override-reason" type="text" placeholder="Why is this override needed?" />
					</div>`,footer:`
					<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
					<button type="button" class="ac-btn ac-btn--primary" data-ac-confirm>Apply</button>
				`});g.root.querySelector("[data-ac-cancel]").addEventListener("click",g.close),g.root.querySelector("[data-ac-confirm]").addEventListener("click",async()=>{let f=g.root.querySelector("#ac-permission").value,x=g.root.querySelector("#ac-effect").value,h=g.root.querySelector("#ac-override-reason").value||null;g.close();try{await w.post(`console/users/${encodeURIComponent(t)}/permissions`,{permission:f,effect:x,reason:h}),v("Permission override applied.","success"),a.rerender()}catch(b){v(b.message,"error")}})}),e.querySelectorAll("[data-ac-remove-override]").forEach(d=>{d.addEventListener("click",async()=>{let m=d.dataset.acRemoveOverride;if(await M({title:"Remove this override?",message:`The account returns to the permissions its role carries. "${m}" is no longer individually granted or denied.`,confirmLabel:"Remove override"}))try{await w.del(`console/users/${encodeURIComponent(t)}/permissions/${encodeURIComponent(m)}`),v("Override removed.","success"),a.rerender()}catch(f){v(f.message,"error")}})});let l=e.querySelector("[data-ac-revoke-sessions]");l&&l.addEventListener("click",async()=>{if(await M({title:"Revoke every session of this account?",message:"All sign-ins of this account end immediately. The next sign-in starts a new session.",detail:"The revocation is recorded in the security event trail.",confirmLabel:"Revoke sessions",danger:!0}))try{await w.del(`console/users/${encodeURIComponent(t)}/sessions`),v("Sessions revoked.","success")}catch(m){v(m.message,"error")}});let c=e.querySelector("[data-ac-reset-credential]");c&&c.addEventListener("click",()=>{let d=B({title:"Reset this credential",subtitle:"The account keeps everything except its password. Every live session of the account is revoked and the change is recorded in the audit trail.",body:`<div class="ac-field">
						<label class="ac-field__label" for="ac-new-password">New password</label>
						<div class="ac-field-row">
							<input class="ac-input" id="ac-new-password" type="text" autocomplete="off" spellcheck="false" placeholder="At least 8 characters" />
							<button type="button" class="ac-btn" id="ac-generate-password" title="Generate a strong password">Generate</button>
						</div>
					</div>
					<p class="ac-empty__message" style="margin:12px 0 0;font-size:12px">
						Generate a strong password, or type your own. Share it with the account holder
						through a channel you trust. It is shown here once and is never stored in clear text.
					</p>`,footer:`
					<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
					<button type="button" class="ac-btn ac-btn--primary" data-ac-confirm>Reset credential</button>
				`}),m=d.root.querySelector("#ac-new-password"),g=d.root.querySelector("#ac-generate-password"),f="",x=h=>{g.dataset.mode=h,g.textContent=h==="copy"?"Copy":"Generate",g.title=h==="copy"?"Copy the generated password":"Generate a strong password"};x("generate"),g.addEventListener("click",async()=>{if(g.dataset.mode==="copy"){try{await navigator.clipboard.writeText(m.value),v("Password copied to the clipboard.","success")}catch{m.focus(),m.select();try{document.execCommand("copy"),v("Password copied to the clipboard.","success")}catch{v("The password is selected \u2014 press Ctrl+C to copy it.","error")}}return}f=or(14),m.value=f,m.focus(),m.select(),x("copy")}),m.addEventListener("input",()=>{g.dataset.mode==="copy"&&m.value!==f&&x("generate")}),d.root.querySelector("[data-ac-cancel]").addEventListener("click",d.close),d.root.querySelector("[data-ac-confirm]").addEventListener("click",async()=>{let h=d.root.querySelector("#ac-new-password").value.trim();if(h.length<8){v("The password must be at least 8 characters.","error");return}try{let b=await w.post(`console/users/${encodeURIComponent(t)}/credential`,{newPassword:h});d.close(),v(`Credential reset. ${b?.data?.revokedSessions||0} session(s) revoked.`,"success")}catch(b){v(b.message,"error")}})});let u=e.querySelector("[data-ac-delete-account]");u&&u.addEventListener("click",async()=>{if(await M({title:`Delete "${n.username}"?`,message:"The account is removed, together with its sessions and its results. This cannot be undone \u2014 suspending the account keeps the record if you only need to end the access.",confirmLabel:"Delete the account",danger:!0}))try{await w.del(`console/users/${encodeURIComponent(t)}`),v("The account was deleted.","success"),window.location.hash="#/users"}catch(m){v(m.message,"error")}})}function or(e=14){let a="ABCDEFGHJKMNPQRSTUVWXYZ",t="abcdefghijkmnpqrstuvwxyz",n="23456789",s="!@#$%&*+-",r=a+t+n+s,p=l=>{let c=new Uint32Array(1);return crypto.getRandomValues(c),l[c[0]%l.length]},i=[p(a),p(t),p(n),p(s)];for(;i.length<e;)i.push(p(r));for(let l=i.length-1;l>0;l-=1){let c=new Uint32Array(1);crypto.getRandomValues(c);let u=c[0]%(l+1);[i[l],i[u]]=[i[u],i[l]]}return i.join("")}var da=Object.freeze([{key:"en",label:"English",dir:"ltr"},{key:"fr",label:"Fran\xE7ais",dir:"ltr"},{key:"ar",label:"\u0627\u0644\u0639\u0631\u0628\u064A\u0629",dir:"rtl"}]),Ns="quizLearningLang",Qe="en";function Wa(e){return da.some(a=>a.key===e)}function Rs(e){return da.find(a=>a.key===e)?.dir||"ltr"}function K(){try{let e=localStorage.getItem(Ns);return Wa(e)?e:Qe}catch{return Qe}}function Os(e){if(Wa(e))try{localStorage.setItem(Ns,e)}catch{}}var Ga={en:{"lang.label":"Language","learning.title":"Learning","learning.description":"The learning taxonomy governance of this organization. Teachers classify questions in the application's Questions tab.","nav.hub":"Learning","nav.questions":"Question pedagogy","nav.taxonomy":"Taxonomy","card.questions.desc":"Review the bank, see what each question assesses, and classify it.","card.questions.moved":"Question classification lives in the application's Questions tab since the WP5 refactor \u2014 teachers classify where they already work.","card.taxonomy.desc":"The objectives and competencies the classification is built on.","card.classify.title":"Question classification","card.classify.desc":"Classify questions where you already work \u2014 in the application's Questions tab.","card.classify.badge":"In the application","card.open":"Open","hub.eyebrow":"Learning governance","hub.status.enabled":"Enabled","hub.attention.title":"{count} objective(s) awaiting approval","hub.attention.body":"Review teacher proposals so their questions can be classified against them.","hub.attention.cta":"Review proposals","hub.cards.title":"Where to go next","hub.disable.confirm":"Turn learning off for this organization? Teachers will no longer see the learning surfaces. Nothing is deleted.","flag.disabled.title":"Learning is not enabled","flag.disabled.body":"The learning taxonomy and question classification are off for this organization. Turning it on shows them to teachers; nothing is deleted when it is off.","flag.enabled.title":"Learning is enabled","flag.enabled.body":"Teachers may classify the questions they authored and propose learning objectives.","flag.toggle.on":"Turn learning on","flag.toggle.off":"Turn learning off","flag.teacherCreation.on":"Teachers create objectives directly","flag.teacherCreation.off":"Teacher objectives need approval","flag.adminOnly":"Only an administrator can change this.","action.refresh":"Refresh","action.search":"Search","action.add":"Add","action.save":"Save","action.cancel":"Cancel","action.close":"Close","action.edit":"Edit","action.open":"Open","action.archive":"Archive","action.approve":"Approve","action.reject":"Reject","action.classify":"Classify","action.classifySelected":"Classify selected","action.clearClassification":"Clear classification","action.addCriterion":"Add criterion","action.removeCriterion":"Remove","action.markReviewed":"Reviewed by me","action.newObjective":"New objective","action.proposeObjective":"Propose objective","action.newCompetency":"New competency","action.linkCompetency":"Link competency","action.addPrerequisite":"Add prerequisite","action.unlink":"Unlink","action.remove":"Remove","action.selectAll":"Select all","action.clearSelection":"Clear selection","action.clearFilters":"Clear filters","field.statement":"Statement","field.description":"Description","field.code":"Code","field.name":"Name","field.subject":"Subject","field.category":"Category","field.parent":"Parent objective","field.status":"Status","field.kind":"Kind","field.orderIndex":"Order","field.note":"Note","field.weight":"Weight","field.criterionKey":"Criterion key","field.rubric":"Rubric (optional)","field.maxScore":"Max score","field.competency":"Competency","field.objective":"Objective","field.bloom":"Bloom dimension","field.pedagogyStatus":"Classification","field.primaryCompetency":"Primary competency","field.strength":"Strength","field.rationale":"Rationale","field.minMastery":"Minimum mastery","field.reviewNote":"Review note","hint.weightSum":"Weights must add up to 1.00","hint.criteriaRequired":"At least one criterion is required to save.","hint.saveQuestionFirst":"This question must be saved before it can be classified.","hint.noCriteria":"No criteria yet \u2014 this question is unclassified.","hint.teacherProposal":"A proposed objective becomes available to teachers once an administrator approves it.","hint.readOnlyTeacher":"Only administrators manage competencies and prerequisites.","hint.rubricJson":"A JSON object or free text, shown to graders.","hint.language":"Labels only \u2014 it does not change the school language.","hint.form.name":"The competency as teachers will recognise it.","hint.form.description":"Optional context for teachers \u2014 what this competency covers.","hint.form.weight":"How strongly this competency counts toward the objective.","hint.form.primary":"Mark the single competency that best represents the objective.","hint.form.strength":"Required prerequisites block progression; recommended ones do not.","hint.form.minMastery":"The mastery state a learner needs before starting this objective.","hint.form.rationale":"Why this objective depends on the prerequisite.","table.question":"Question","table.type":"Type","table.bloom":"Bloom","table.status":"Classification","table.criteria":"Criteria","table.objective":"Objective","table.competency":"Competency","table.kind":"Kind","table.subject":"Subject","table.code":"Code","table.statement":"Statement","table.weight":"Weight","table.proposedBy":"Proposed by","table.created":"Created","status.unclassified":"Unclassified","status.partial":"Partly classified","status.classified":"Classified","status.needs_review":"Needs review","objective.proposed":"Proposed","objective.active":"Active","objective.rejected":"Rejected","objective.archived":"Archived","kind.competency":"Competency","kind.skill":"Skill","kind.domain":"Domain","strength.required":"Required","strength.recommended":"Recommended","summary.classified":"Classified questions","summary.unclassified":"Unclassified","summary.needsReview":"Needs review","summary.objectives":"Objectives","summary.proposed":"Awaiting approval","summary.competencies":"Competencies","summary.prerequisites":"Prerequisites","tax.desc.objectives":"The outcomes the school teaches and the questions are classified against.","tax.desc.competencies":"The skills and domains an objective builds, grouped for reuse.","tax.desc.proposals":"Teacher proposals waiting for an administrator decision.","results.count":"{count} result(s)","empty.questions.title":"No questions match the current filters","empty.questions.message":"Adjust the search, the classification or the Bloom filter.","empty.objectives.title":"No objectives yet","empty.objectives.message":"Create the first objective, then classify the questions that assess it.","empty.competencies.title":"No competencies yet","empty.competencies.message":"Competencies group the skills an objective builds.","empty.proposals.title":"Nothing awaiting approval","empty.proposals.message":"Teacher proposals appear here for review.","empty.prerequisites.title":"No prerequisites","empty.prerequisites.message":"A prerequisite states what must be learned first.","bulk.title":"Classify {count} question(s)","bulk.confirm":"This replaces the classification of the selected questions with one criterion of weight 1.00.","bulk.done":"{count} question(s) classified.","bulk.partial":"{done} classified, {failed} failed.","toast.classified":"The classification was saved.","toast.cleared":"The classification was cleared.","toast.objectiveSaved":"The objective was saved.","toast.competencySaved":"The competency was saved.","toast.approved":"The objective was approved.","toast.rejected":"The objective was rejected.","toast.archived":"The objective was archived.","toast.linked":"The competency was linked.","toast.unlinked":"The link was removed.","toast.prerequisiteAdded":"The prerequisite was added.","toast.prerequisiteRemoved":"The prerequisite was removed.","toast.flagOn":"Learning is now enabled for this organization.","toast.flagOff":"Learning is now disabled for this organization.","error.load":"This section could not be loaded","error.save":"The change could not be saved","form.requiredMark":"Required","form.requiredMissing":"Please fill in the highlighted required fields before saving.","form.hint.code":"Short unique identifier, e.g. MATH-6.NS1.","form.hint.order":"Display position among the subject objectives (lower numbers come first).","form.hint.statement":"One sentence describing what the learner should be able to do.","option.none":"None","objSection.context":"Curriculum context","objSection.outcome":"Learning outcome","objSection.organization":"Organization","form.note.official":"Official objective \u2014 part of the curriculum catalog; proposed_by is empty for objectives created by the school administration."},fr:{"lang.label":"Langue","learning.title":"Apprentissage","learning.description":"La gouvernance de la taxonomie d'apprentissage de cet \xE9tablissement. Les enseignants classent les questions dans l'onglet Questions de l'application.","nav.hub":"Apprentissage","nav.questions":"P\xE9dagogie des questions","nav.taxonomy":"Taxonomie","card.questions.desc":"Parcourez la banque, voyez ce que chaque question \xE9value et classez-la.","card.questions.moved":"Depuis la refonte WP5, la classification des questions vit dans l\u2019onglet Questions de l\u2019application \u2014 les enseignants classent l\xE0 o\xF9 ils travaillent d\xE9j\xE0.","card.taxonomy.desc":"Les objectifs et comp\xE9tences sur lesquels repose la classification.","card.classify.title":"Classification des questions","card.classify.desc":"Classez les questions l\xE0 o\xF9 vous travaillez d\xE9j\xE0 \u2014 dans l'onglet Questions de l'application.","card.classify.badge":"Dans l'application","card.open":"Ouvrir","hub.eyebrow":"Gouvernance de l'apprentissage","hub.status.enabled":"Activ\xE9","hub.attention.title":"{count} objectif(s) en attente d'approbation","hub.attention.body":"Examinez les propositions des enseignants pour que leurs questions puissent \xEAtre class\xE9es.","hub.attention.cta":"Examiner les propositions","hub.cards.title":"O\xF9 aller ensuite","hub.disable.confirm":"D\xE9sactiver l'apprentissage pour cet \xE9tablissement ? Les enseignants ne verront plus les surfaces d'apprentissage. Rien n'est supprim\xE9.","flag.disabled.title":"L'apprentissage n'est pas activ\xE9","flag.disabled.body":"La taxonomie d'apprentissage et la classification des questions sont d\xE9sactiv\xE9es pour cet \xE9tablissement. Les activer les rend visibles aux enseignants ; rien n'est supprim\xE9 lorsqu'elles sont d\xE9sactiv\xE9es.","flag.enabled.title":"L'apprentissage est activ\xE9","flag.enabled.body":"Les enseignants peuvent classer les questions qu'ils ont cr\xE9\xE9es et proposer des objectifs d'apprentissage.","flag.toggle.on":"Activer l'apprentissage","flag.toggle.off":"D\xE9sactiver l'apprentissage","flag.teacherCreation.on":"Les enseignants cr\xE9ent les objectifs directement","flag.teacherCreation.off":"Les objectifs des enseignants doivent \xEAtre approuv\xE9s","flag.adminOnly":"Seul un administrateur peut modifier ceci.","action.refresh":"Actualiser","action.search":"Rechercher","action.add":"Ajouter","action.save":"Enregistrer","action.cancel":"Annuler","action.close":"Fermer","action.edit":"Modifier","action.open":"Ouvrir","action.archive":"Archiver","action.approve":"Approuver","action.reject":"Rejeter","action.classify":"Classer","action.classifySelected":"Classer la s\xE9lection","action.clearClassification":"Effacer la classification","action.addCriterion":"Ajouter un crit\xE8re","action.removeCriterion":"Retirer","action.markReviewed":"V\xE9rifi\xE9 par moi","action.newObjective":"Nouvel objectif","action.proposeObjective":"Proposer un objectif","action.newCompetency":"Nouvelle comp\xE9tence","action.linkCompetency":"Lier une comp\xE9tence","action.addPrerequisite":"Ajouter un pr\xE9requis","action.unlink":"D\xE9lier","action.remove":"Retirer","action.selectAll":"Tout s\xE9lectionner","action.clearSelection":"Effacer la s\xE9lection","action.clearFilters":"Effacer les filtres","field.statement":"\xC9nonc\xE9","field.description":"Description","field.code":"Code","field.name":"Nom","field.subject":"Mati\xE8re","field.category":"Cat\xE9gorie","field.parent":"Objectif parent","field.status":"Statut","field.kind":"Type","field.orderIndex":"Ordre","field.note":"Note","field.weight":"Poids","field.criterionKey":"Cl\xE9 du crit\xE8re","field.rubric":"Grille (facultatif)","field.maxScore":"Note maximale","field.competency":"Comp\xE9tence","field.objective":"Objectif","field.bloom":"Dimension de Bloom","field.pedagogyStatus":"Classification","field.primaryCompetency":"Comp\xE9tence principale","field.strength":"Force","field.rationale":"Justification","field.minMastery":"Ma\xEEtrise minimale","field.reviewNote":"Note de r\xE9vision","hint.weightSum":"La somme des poids doit \xEAtre de 1,00","hint.criteriaRequired":"Au moins un crit\xE8re est requis pour enregistrer.","hint.saveQuestionFirst":"Cette question doit \xEAtre enregistr\xE9e avant de pouvoir \xEAtre class\xE9e.","hint.noCriteria":"Aucun crit\xE8re \u2014 cette question n'est pas class\xE9e.","hint.teacherProposal":"Un objectif propos\xE9 devient disponible pour les enseignants apr\xE8s approbation par un administrateur.","hint.readOnlyTeacher":"Seuls les administrateurs g\xE8rent les comp\xE9tences et les pr\xE9requis.","hint.rubricJson":"Un objet JSON ou du texte libre, montr\xE9 aux correcteurs.","hint.language":"Libell\xE9s uniquement \u2014 ne change pas la langue de l'\xE9tablissement.","hint.form.name":"La comp\xE9tence telle que les enseignants la reconna\xEEtront.","hint.form.description":"Contexte facultatif pour les enseignants \u2014 ce que couvre cette comp\xE9tence.","hint.form.weight":"Dans quelle mesure cette comp\xE9tence compte pour l'objectif.","hint.form.primary":"Marquez la comp\xE9tence unique qui repr\xE9sente le mieux l'objectif.","hint.form.strength":"Les pr\xE9requis requis bloquent la progression ; les recommand\xE9s non.","hint.form.minMastery":"L'\xE9tat de ma\xEEtrise n\xE9cessaire avant de commencer cet objectif.","hint.form.rationale":"Pourquoi cet objectif d\xE9pend du pr\xE9requis.","table.question":"Question","table.type":"Type","table.bloom":"Bloom","table.status":"Classification","table.criteria":"Crit\xE8res","table.objective":"Objectif","table.competency":"Comp\xE9tence","table.kind":"Type","table.subject":"Mati\xE8re","table.code":"Code","table.statement":"\xC9nonc\xE9","table.weight":"Poids","table.proposedBy":"Propos\xE9 par","table.created":"Cr\xE9\xE9","status.unclassified":"Non class\xE9e","status.partial":"Partiellement class\xE9e","status.classified":"Class\xE9e","status.needs_review":"\xC0 v\xE9rifier","objective.proposed":"Propos\xE9","objective.active":"Actif","objective.rejected":"Rejet\xE9","objective.archived":"Archiv\xE9","kind.competency":"Comp\xE9tence","kind.skill":"Habilet\xE9","kind.domain":"Domaine","strength.required":"Requis","strength.recommended":"Recommand\xE9","summary.classified":"Questions class\xE9es","summary.unclassified":"Non class\xE9es","summary.needsReview":"\xC0 v\xE9rifier","summary.objectives":"Objectifs","summary.proposed":"En attente d'approbation","summary.competencies":"Comp\xE9tences","summary.prerequisites":"Pr\xE9requis","tax.desc.objectives":"Les r\xE9sultats enseign\xE9s par l'\xE9tablissement, sur lesquels les questions sont class\xE9es.","tax.desc.competencies":"Les habilet\xE9s et domaines qu'un objectif d\xE9veloppe, regroup\xE9s pour \xEAtre r\xE9utilis\xE9s.","tax.desc.proposals":"Les propositions des enseignants en attente de d\xE9cision d'un administrateur.","results.count":"{count} r\xE9sultat(s)","empty.questions.title":"Aucune question ne correspond aux filtres","empty.questions.message":"Ajustez la recherche, la classification ou le filtre Bloom.","empty.objectives.title":"Aucun objectif","empty.objectives.message":"Cr\xE9ez le premier objectif, puis classez les questions qui l'\xE9valuent.","empty.competencies.title":"Aucune comp\xE9tence","empty.competencies.message":"Les comp\xE9tences regroupent les habilet\xE9s qu'un objectif d\xE9veloppe.","empty.proposals.title":"Rien en attente d'approbation","empty.proposals.message":"Les propositions des enseignants apparaissent ici pour r\xE9vision.","empty.prerequisites.title":"Aucun pr\xE9requis","empty.prerequisites.message":"Un pr\xE9requis indique ce qui doit \xEAtre appris avant.","bulk.title":"Classer {count} question(s)","bulk.confirm":"Ceci remplace la classification des questions s\xE9lectionn\xE9es par un seul crit\xE8re de poids 1,00.","bulk.done":"{count} question(s) class\xE9e(s).","bulk.partial":"{done} class\xE9e(s), {failed} en \xE9chec.","toast.classified":"La classification a \xE9t\xE9 enregistr\xE9e.","toast.cleared":"La classification a \xE9t\xE9 effac\xE9e.","toast.objectiveSaved":"L'objectif a \xE9t\xE9 enregistr\xE9.","toast.competencySaved":"La comp\xE9tence a \xE9t\xE9 enregistr\xE9e.","toast.approved":"L'objectif a \xE9t\xE9 approuv\xE9.","toast.rejected":"L'objectif a \xE9t\xE9 rejet\xE9.","toast.archived":"L'objectif a \xE9t\xE9 archiv\xE9.","toast.linked":"La comp\xE9tence a \xE9t\xE9 li\xE9e.","toast.unlinked":"Le lien a \xE9t\xE9 supprim\xE9.","toast.prerequisiteAdded":"Le pr\xE9requis a \xE9t\xE9 ajout\xE9.","toast.prerequisiteRemoved":"Le pr\xE9requis a \xE9t\xE9 retir\xE9.","toast.flagOn":"L'apprentissage est maintenant activ\xE9 pour cet \xE9tablissement.","toast.flagOff":"L'apprentissage est maintenant d\xE9sactiv\xE9 pour cet \xE9tablissement.","error.load":"Cette section n'a pas pu \xEAtre charg\xE9e","error.save":"La modification n'a pas pu \xEAtre enregistr\xE9e","form.requiredMark":"Obligatoire","form.requiredMissing":"Veuillez remplir les champs obligatoires surlign\xE9s avant d'enregistrer.","form.hint.code":"Identifiant court unique, ex. MATH-6.NS1.","form.hint.order":"Position d'affichage parmi les objectifs de la mati\xE8re (les nombres bas d'abord).","form.hint.statement":"Une phrase d\xE9crivant ce que l'apprenant doit \xEAtre capable de faire.","option.none":"Aucun","objSection.context":"Contexte du programme","objSection.outcome":"R\xE9sultat d\u2019apprentissage","objSection.organization":"Organisation","form.note.official":"Objectif officiel \u2014 fait partie du catalogue du programme ; proposed_by est vide pour les objectifs cr\xE9\xE9s par l'administration."},ar:{"lang.label":"\u0627\u0644\u0644\u063A\u0629","learning.title":"\u0627\u0644\u062A\u0639\u0644\u0651\u0645","learning.description":"\u0625\u062F\u0627\u0631\u0629 \u062A\u0635\u0646\u064A\u0641 \u0627\u0644\u062A\u0639\u0644\u0651\u0645 \u0644\u0647\u0630\u0647 \u0627\u0644\u0645\u0624\u0633\u0633\u0629. \u064A\u0635\u0646\u0651\u0641 \u0627\u0644\u0645\u0639\u0644\u0645\u0648\u0646 \u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u0641\u064A \u062A\u0628\u0648\u064A\u0628 \u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u062F\u0627\u062E\u0644 \u0627\u0644\u062A\u0637\u0628\u064A\u0642.","nav.hub":"\u0627\u0644\u062A\u0639\u0644\u0651\u0645","nav.questions":"\u0628\u064A\u062F\u0627\u063A\u0648\u062C\u064A\u0627 \u0627\u0644\u0623\u0633\u0626\u0644\u0629","nav.taxonomy":"\u0627\u0644\u062A\u0635\u0646\u064A\u0641","card.questions.desc":"\u0631\u0627\u062C\u0639 \u0628\u0646\u0643 \u0627\u0644\u0623\u0633\u0626\u0644\u0629\u060C \u0648\u0627\u0637\u0651\u0644\u0639 \u0639\u0644\u0649 \u0645\u0627 \u064A\u0642\u064A\u0633\u0647 \u0643\u0644 \u0633\u0624\u0627\u0644\u060C \u062B\u0645 \u0635\u0646\u0651\u0641\u0647.","card.questions.moved":"\u0645\u0646\u0630 \u0625\u0639\u0627\u062F\u0629 \u0647\u064A\u0643\u0644\u0629 WP5\u060C \u064A\u0639\u064A\u0634 \u062A\u0635\u0646\u064A\u0641 \u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u0641\u064A \u062A\u0628\u0648\u064A\u0628 \u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u062F\u0627\u062E\u0644 \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u2014 \u064A\u0635\u0646\u0651\u0641 \u0627\u0644\u0645\u0639\u0644\u0645\u0648\u0646 \u062D\u064A\u062B \u064A\u0639\u0645\u0644\u0648\u0646 \u0623\u0635\u0644\u064B\u0627.","card.taxonomy.desc":"\u0627\u0644\u0623\u0647\u062F\u0627\u0641 \u0648\u0627\u0644\u0643\u0641\u0627\u0621\u0627\u062A \u0627\u0644\u062A\u064A \u064A\u0642\u0648\u0645 \u0639\u0644\u064A\u0647\u0627 \u0627\u0644\u062A\u0635\u0646\u064A\u0641.","card.classify.title":"\u062A\u0635\u0646\u064A\u0641 \u0627\u0644\u0623\u0633\u0626\u0644\u0629","card.classify.desc":"\u0635\u0646\u0651\u0641 \u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u062D\u064A\u062B \u062A\u0639\u0645\u0644 \u0623\u0635\u0644\u064B\u0627 \u2014 \u0641\u064A \u062A\u0628\u0648\u064A\u0628 \u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u062F\u0627\u062E\u0644 \u0627\u0644\u062A\u0637\u0628\u064A\u0642.","card.classify.badge":"\u062F\u0627\u062E\u0644 \u0627\u0644\u062A\u0637\u0628\u064A\u0642","card.open":"\u0641\u062A\u062D","hub.eyebrow":"\u062D\u0648\u0643\u0645\u0629 \u0627\u0644\u062A\u0639\u0644\u0651\u0645","hub.status.enabled":"\u0645\u064F\u0641\u0639\u0651\u0644","hub.attention.title":"{count} \u0647\u062F\u0641/\u0623\u0647\u062F\u0627\u0641 \u0628\u0627\u0646\u062A\u0638\u0627\u0631 \u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629","hub.attention.body":"\u0631\u0627\u062C\u0639 \u0627\u0642\u062A\u0631\u0627\u062D\u0627\u062A \u0627\u0644\u0645\u0639\u0644\u0651\u0645\u064A\u0646 \u0643\u064A \u064A\u0645\u0643\u0646 \u062A\u0635\u0646\u064A\u0641 \u0623\u0633\u0626\u0644\u062A\u0647\u0645 \u0648\u0641\u0642\u0647\u0627.","hub.attention.cta":"\u0645\u0631\u0627\u062C\u0639\u0629 \u0627\u0644\u0627\u0642\u062A\u0631\u0627\u062D\u0627\u062A","hub.cards.title":"\u0625\u0644\u0649 \u0623\u064A\u0646 \u062A\u0630\u0647\u0628 \u0628\u0639\u062F \u0630\u0644\u0643","hub.disable.confirm":"\u062A\u0639\u0637\u064A\u0644 \u0627\u0644\u062A\u0639\u0644\u0651\u0645 \u0644\u0647\u0630\u0647 \u0627\u0644\u0645\u0624\u0633\u0633\u0629\u061F \u0644\u0646 \u064A\u0631\u0649 \u0627\u0644\u0645\u0639\u0644\u0651\u0645\u0648\u0646 \u0648\u0627\u062C\u0647\u0627\u062A \u0627\u0644\u062A\u0639\u0644\u0651\u0645 \u0628\u0639\u062F \u0630\u0644\u0643. \u0644\u0627 \u064A\u064F\u062D\u0630\u0641 \u0623\u064A \u0634\u064A\u0621.","flag.disabled.title":"\u0627\u0644\u062A\u0639\u0644\u0651\u0645 \u063A\u064A\u0631 \u0645\u064F\u0641\u0639\u0651\u0644","flag.disabled.body":"\u062A\u0635\u0646\u064A\u0641 \u0627\u0644\u062A\u0639\u0644\u0651\u0645 \u0648\u062A\u0635\u0646\u064A\u0641 \u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u0645\u0639\u0637\u0651\u0644\u0627\u0646 \u0644\u0647\u0630\u0647 \u0627\u0644\u0645\u0624\u0633\u0633\u0629. \u0639\u0646\u062F \u062A\u0641\u0639\u064A\u0644\u0647\u0645\u0627 \u064A\u0638\u0647\u0631\u0627\u0646 \u0644\u0644\u0645\u0639\u0644\u0651\u0645\u064A\u0646\u061B \u0648\u0644\u0627 \u064A\u064F\u062D\u0630\u0641 \u0623\u064A \u0634\u064A\u0621 \u0639\u0646\u062F \u0627\u0644\u062A\u0639\u0637\u064A\u0644.","flag.enabled.title":"\u0627\u0644\u062A\u0639\u0644\u0651\u0645 \u0645\u064F\u0641\u0639\u0651\u0644","flag.enabled.body":"\u064A\u0645\u0643\u0646 \u0644\u0644\u0645\u0639\u0644\u0651\u0645\u064A\u0646 \u062A\u0635\u0646\u064A\u0641 \u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u062A\u064A \u0623\u0646\u0634\u0623\u0648\u0647\u0627 \u0648\u0627\u0642\u062A\u0631\u0627\u062D \u0623\u0647\u062F\u0627\u0641 \u062A\u0639\u0644\u0651\u0645.","flag.toggle.on":"\u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u062A\u0639\u0644\u0651\u0645","flag.toggle.off":"\u062A\u0639\u0637\u064A\u0644 \u0627\u0644\u062A\u0639\u0644\u0651\u0645","flag.teacherCreation.on":"\u064A\u0646\u0634\u0626 \u0627\u0644\u0645\u0639\u0644\u0651\u0645\u0648\u0646 \u0627\u0644\u0623\u0647\u062F\u0627\u0641 \u0645\u0628\u0627\u0634\u0631\u0629","flag.teacherCreation.off":"\u0623\u0647\u062F\u0627\u0641 \u0627\u0644\u0645\u0639\u0644\u0651\u0645\u064A\u0646 \u062A\u062D\u062A\u0627\u062C \u0625\u0644\u0649 \u0645\u0648\u0627\u0641\u0642\u0629","flag.adminOnly":"\u064A\u0645\u0643\u0646 \u0644\u0644\u0645\u0634\u0631\u0641 \u0641\u0642\u0637 \u062A\u063A\u064A\u064A\u0631 \u0647\u0630\u0627.","action.refresh":"\u062A\u062D\u062F\u064A\u062B","action.search":"\u0628\u062D\u062B","action.add":"\u0625\u0636\u0627\u0641\u0629","action.save":"\u062D\u0641\u0638","action.cancel":"\u0625\u0644\u063A\u0627\u0621","action.close":"\u0625\u063A\u0644\u0627\u0642","action.edit":"\u062A\u062D\u0631\u064A\u0631","action.open":"\u0641\u062A\u062D","action.archive":"\u0623\u0631\u0634\u0641\u0629","action.approve":"\u0645\u0648\u0627\u0641\u0642\u0629","action.reject":"\u0631\u0641\u0636","action.classify":"\u062A\u0635\u0646\u064A\u0641","action.classifySelected":"\u062A\u0635\u0646\u064A\u0641 \u0627\u0644\u0645\u062D\u062F\u064E\u0651\u062F","action.clearClassification":"\u0645\u0633\u062D \u0627\u0644\u062A\u0635\u0646\u064A\u0641","action.addCriterion":"\u0625\u0636\u0627\u0641\u0629 \u0645\u0639\u064A\u0627\u0631","action.removeCriterion":"\u0625\u0632\u0627\u0644\u0629","action.markReviewed":"\u0631\u0627\u062C\u0639\u062A\u0647\u0627 \u0628\u0646\u0641\u0633\u064A","action.newObjective":"\u0647\u062F\u0641 \u062C\u062F\u064A\u062F","action.proposeObjective":"\u0627\u0642\u062A\u0631\u0627\u062D \u0647\u062F\u0641","action.newCompetency":"\u0643\u0641\u0627\u0621\u0629 \u062C\u062F\u064A\u062F\u0629","action.linkCompetency":"\u0631\u0628\u0637 \u0643\u0641\u0627\u0621\u0629","action.addPrerequisite":"\u0625\u0636\u0627\u0641\u0629 \u0645\u062A\u0637\u0644\u0628 \u0633\u0627\u0628\u0642","action.unlink":"\u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u0631\u0628\u0637","action.remove":"\u0625\u0632\u0627\u0644\u0629","action.selectAll":"\u062A\u062D\u062F\u064A\u062F \u0627\u0644\u0643\u0644","action.clearSelection":"\u0645\u0633\u062D \u0627\u0644\u062A\u062D\u062F\u064A\u062F","action.clearFilters":"\u0645\u0633\u062D \u0627\u0644\u0645\u0631\u0634\u0651\u062D\u0627\u062A","field.statement":"\u0627\u0644\u0646\u0635","field.description":"\u0627\u0644\u0648\u0635\u0641","field.code":"\u0627\u0644\u0631\u0645\u0632","field.name":"\u0627\u0644\u0627\u0633\u0645","field.subject":"\u0627\u0644\u0645\u0627\u062F\u0629","field.category":"\u0627\u0644\u0641\u0626\u0629","field.parent":"\u0627\u0644\u0647\u062F\u0641 \u0627\u0644\u0623\u0628","field.status":"\u0627\u0644\u062D\u0627\u0644\u0629","field.kind":"\u0627\u0644\u0646\u0648\u0639","field.orderIndex":"\u0627\u0644\u062A\u0631\u062A\u064A\u0628","field.note":"\u0645\u0644\u0627\u062D\u0638\u0629","field.weight":"\u0627\u0644\u0648\u0632\u0646","field.criterionKey":"\u0645\u0641\u062A\u0627\u062D \u0627\u0644\u0645\u0639\u064A\u0627\u0631","field.rubric":"\u0645\u0639\u064A\u0627\u0631 \u0627\u0644\u062A\u0642\u064A\u064A\u0645 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)","field.maxScore":"\u0627\u0644\u062F\u0631\u062C\u0629 \u0627\u0644\u0642\u0635\u0648\u0649","field.competency":"\u0627\u0644\u0643\u0641\u0627\u0621\u0629","field.objective":"\u0627\u0644\u0647\u062F\u0641","field.bloom":"\u0628\u064F\u0639\u062F \u0628\u0644\u0648\u0645","field.pedagogyStatus":"\u0627\u0644\u062A\u0635\u0646\u064A\u0641","field.primaryCompetency":"\u0627\u0644\u0643\u0641\u0627\u0621\u0629 \u0627\u0644\u0623\u0633\u0627\u0633\u064A\u0629","field.strength":"\u0627\u0644\u0642\u0648\u0629","field.rationale":"\u0627\u0644\u0645\u0628\u0631\u0631","field.minMastery":"\u0627\u0644\u062D\u062F \u0627\u0644\u0623\u062F\u0646\u0649 \u0644\u0644\u0625\u062A\u0642\u0627\u0646","field.reviewNote":"\u0645\u0644\u0627\u062D\u0638\u0629 \u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629","hint.weightSum":"\u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0645\u062C\u0645\u0648\u0639 \u0627\u0644\u0623\u0648\u0632\u0627\u0646 1.00","hint.criteriaRequired":"\u0645\u0639\u064A\u0627\u0631 \u0648\u0627\u062D\u062F \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644 \u0645\u0637\u0644\u0648\u0628 \u0644\u0644\u062D\u0641\u0638.","hint.saveQuestionFirst":"\u064A\u062C\u0628 \u062D\u0641\u0638 \u0627\u0644\u0633\u0624\u0627\u0644 \u0642\u0628\u0644 \u062A\u0635\u0646\u064A\u0641\u0647.","hint.noCriteria":"\u0644\u0627 \u062A\u0648\u062C\u062F \u0645\u0639\u0627\u064A\u064A\u0631 \u2014 \u0647\u0630\u0627 \u0627\u0644\u0633\u0624\u0627\u0644 \u063A\u064A\u0631 \u0645\u0635\u0646\u064E\u0651\u0641.","hint.teacherProposal":"\u064A\u0635\u0628\u062D \u0627\u0644\u0647\u062F\u0641 \u0627\u0644\u0645\u0642\u062A\u0631\u062D \u0645\u062A\u0627\u062D\u064B\u0627 \u0644\u0644\u0645\u0639\u0644\u0651\u0645\u064A\u0646 \u0628\u0639\u062F \u0645\u0648\u0627\u0641\u0642\u0629 \u0627\u0644\u0645\u0634\u0631\u0641.","hint.readOnlyTeacher":"\u0627\u0644\u0645\u0634\u0631\u0641\u0648\u0646 \u0641\u0642\u0637 \u064A\u062F\u064A\u0631\u0648\u0646 \u0627\u0644\u0643\u0641\u0627\u0621\u0627\u062A \u0648\u0627\u0644\u0645\u062A\u0637\u0644\u0628\u0627\u062A.","hint.rubricJson":"\u0643\u0627\u0626\u0646 JSON \u0623\u0648 \u0646\u0635 \u062D\u0631 \u064A\u064F\u0639\u0631\u0636 \u0639\u0644\u0649 \u0627\u0644\u0645\u0635\u062D\u0651\u062D\u064A\u0646.","hint.language":"\u0627\u0644\u062A\u0633\u0645\u064A\u0627\u062A \u0641\u0642\u0637 \u2014 \u0644\u0627 \u062A\u063A\u064A\u0651\u0631 \u0644\u063A\u0629 \u0627\u0644\u0645\u0624\u0633\u0633\u0629.","hint.form.name":"\u0627\u0644\u0643\u0641\u0627\u0621\u0629 \u0643\u0645\u0627 \u0633\u064A\u062A\u0639\u0631\u0651\u0641 \u0639\u0644\u064A\u0647\u0627 \u0627\u0644\u0645\u0639\u0644\u0651\u0645\u0648\u0646.","hint.form.description":"\u0633\u064A\u0627\u0642 \u0627\u062E\u062A\u064A\u0627\u0631\u064A \u0644\u0644\u0645\u0639\u0644\u0651\u0645\u064A\u0646 \u2014 \u0645\u0627 \u062A\u063A\u0637\u0651\u064A\u0647 \u0647\u0630\u0647 \u0627\u0644\u0643\u0641\u0627\u0621\u0629.","hint.form.weight":"\u0645\u062F\u0649 \u0648\u0632\u0646 \u0647\u0630\u0647 \u0627\u0644\u0643\u0641\u0627\u0621\u0629 \u0641\u064A \u0627\u0644\u0647\u062F\u0641.","hint.form.primary":"\u062D\u062F\u0651\u062F \u0627\u0644\u0643\u0641\u0627\u0621\u0629 \u0627\u0644\u0648\u0627\u062D\u062F\u0629 \u0627\u0644\u062A\u064A \u062A\u0645\u062B\u0651\u0644 \u0627\u0644\u0647\u062F\u0641 \u0623\u0641\u0636\u0644 \u062A\u0645\u062B\u064A\u0644.","hint.form.strength":"\u0627\u0644\u0645\u062A\u0637\u0644\u0628\u0627\u062A \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629 \u062A\u0645\u0646\u0639 \u0627\u0644\u062A\u0642\u062F\u0651\u0645\u061B \u0627\u0644\u0645\u064F\u0633\u062A\u062D\u0633\u0646\u0629 \u0644\u0627 \u062A\u0645\u0646\u0639\u0647.","hint.form.minMastery":"\u062D\u0627\u0644\u0629 \u0627\u0644\u0625\u062A\u0642\u0627\u0646 \u0627\u0644\u062A\u064A \u064A\u062D\u062A\u0627\u062C\u0647\u0627 \u0627\u0644\u0645\u062A\u0639\u0644\u0651\u0645 \u0642\u0628\u0644 \u0628\u062F\u0621 \u0647\u0630\u0627 \u0627\u0644\u0647\u062F\u0641.","hint.form.rationale":"\u0644\u0645\u0627\u0630\u0627 \u064A\u0639\u062A\u0645\u062F \u0647\u0630\u0627 \u0627\u0644\u0647\u062F\u0641 \u0639\u0644\u0649 \u0627\u0644\u0645\u062A\u0637\u0644\u0628 \u0627\u0644\u0633\u0627\u0628\u0642.","table.question":"\u0627\u0644\u0633\u0624\u0627\u0644","table.type":"\u0627\u0644\u0646\u0648\u0639","table.bloom":"\u0628\u0644\u0648\u0645","table.status":"\u0627\u0644\u062A\u0635\u0646\u064A\u0641","table.criteria":"\u0627\u0644\u0645\u0639\u0627\u064A\u064A\u0631","table.objective":"\u0627\u0644\u0647\u062F\u0641","table.competency":"\u0627\u0644\u0643\u0641\u0627\u0621\u0629","table.kind":"\u0627\u0644\u0646\u0648\u0639","table.subject":"\u0627\u0644\u0645\u0627\u062F\u0629","table.code":"\u0627\u0644\u0631\u0645\u0632","table.statement":"\u0627\u0644\u0646\u0635","table.weight":"\u0627\u0644\u0648\u0632\u0646","table.proposedBy":"\u0627\u0642\u062A\u0631\u062D\u0647","table.created":"\u0623\u064F\u0646\u0634\u0626","status.unclassified":"\u063A\u064A\u0631 \u0645\u0635\u0646\u064E\u0651\u0641","status.partial":"\u0645\u0635\u0646\u064E\u0651\u0641 \u062C\u0632\u0626\u064A\u064B\u0627","status.classified":"\u0645\u0635\u0646\u064E\u0651\u0641","status.needs_review":"\u064A\u062D\u062A\u0627\u062C \u0645\u0631\u0627\u062C\u0639\u0629","objective.proposed":"\u0645\u0642\u062A\u0631\u062D","objective.active":"\u0646\u0634\u0637","objective.rejected":"\u0645\u0631\u0641\u0648\u0636","objective.archived":"\u0645\u0624\u0631\u0634\u0641","kind.competency":"\u0643\u0641\u0627\u0621\u0629","kind.skill":"\u0645\u0647\u0627\u0631\u0629","kind.domain":"\u0645\u062C\u0627\u0644","strength.required":"\u0645\u0637\u0644\u0648\u0628","strength.recommended":"\u0645\u064F\u0633\u062A\u062D\u0633\u0646","summary.classified":"\u0623\u0633\u0626\u0644\u0629 \u0645\u0635\u0646\u064E\u0651\u0641\u0629","summary.unclassified":"\u063A\u064A\u0631 \u0645\u0635\u0646\u064E\u0651\u0641\u0629","summary.needsReview":"\u062A\u062D\u062A\u0627\u062C \u0645\u0631\u0627\u062C\u0639\u0629","summary.objectives":"\u0627\u0644\u0623\u0647\u062F\u0627\u0641","summary.proposed":"\u0628\u0627\u0646\u062A\u0638\u0627\u0631 \u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629","summary.competencies":"\u0627\u0644\u0643\u0641\u0627\u0621\u0627\u062A","summary.prerequisites":"\u0627\u0644\u0645\u062A\u0637\u0644\u0628\u0627\u062A \u0627\u0644\u0633\u0627\u0628\u0642\u0629","tax.desc.objectives":"\u0627\u0644\u0646\u0648\u0627\u062A\u062C \u0627\u0644\u062A\u064A \u062A\u062F\u0631\u0651\u0633\u0647\u0627 \u0627\u0644\u0645\u0624\u0633\u0633\u0629 \u0648\u062A\u064F\u0635\u0646\u0651\u0641 \u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u0648\u0641\u0642\u0647\u0627.","tax.desc.competencies":"\u0627\u0644\u0645\u0647\u0627\u0631\u0627\u062A \u0648\u0627\u0644\u0645\u062C\u0627\u0644\u0627\u062A \u0627\u0644\u062A\u064A \u064A\u0628\u0646\u064A\u0647\u0627 \u0627\u0644\u0647\u062F\u0641\u060C \u0645\u062C\u0645\u0651\u0639\u0629 \u0644\u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645.","tax.desc.proposals":"\u0627\u0642\u062A\u0631\u0627\u062D\u0627\u062A \u0627\u0644\u0645\u0639\u0644\u0651\u0645\u064A\u0646 \u0628\u0627\u0646\u062A\u0638\u0627\u0631 \u0642\u0631\u0627\u0631 \u0627\u0644\u0645\u0634\u0631\u0641.","results.count":"{count} \u0646\u062A\u064A\u062C\u0629/\u0646\u062A\u0627\u0626\u062C","empty.questions.title":"\u0644\u0627 \u062A\u0648\u062C\u062F \u0623\u0633\u0626\u0644\u0629 \u0645\u0637\u0627\u0628\u0642\u0629 \u0644\u0644\u0645\u0639\u0627\u064A\u064A\u0631 \u0627\u0644\u062D\u0627\u0644\u064A\u0629","empty.questions.message":"\u0639\u062F\u0651\u0644 \u0627\u0644\u0628\u062D\u062B \u0623\u0648 \u0627\u0644\u062A\u0635\u0646\u064A\u0641 \u0623\u0648 \u0645\u0631\u0634\u0651\u062D \u0628\u0644\u0648\u0645.","empty.objectives.title":"\u0644\u0627 \u062A\u0648\u062C\u062F \u0623\u0647\u062F\u0627\u0641 \u0628\u0639\u062F","empty.objectives.message":"\u0623\u0646\u0634\u0626 \u0627\u0644\u0647\u062F\u0641 \u0627\u0644\u0623\u0648\u0644 \u062B\u0645 \u0635\u0646\u0651\u0641 \u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u062A\u064A \u062A\u0642\u064A\u0633\u0647.","empty.competencies.title":"\u0644\u0627 \u062A\u0648\u062C\u062F \u0643\u0641\u0627\u0621\u0627\u062A \u0628\u0639\u062F","empty.competencies.message":"\u062A\u062C\u0645\u0639 \u0627\u0644\u0643\u0641\u0627\u0621\u0627\u062A \u0627\u0644\u0645\u0647\u0627\u0631\u0627\u062A \u0627\u0644\u062A\u064A \u064A\u0628\u0646\u064A\u0647\u0627 \u0627\u0644\u0647\u062F\u0641.","empty.proposals.title":"\u0644\u0627 \u0634\u064A\u0621 \u0628\u0627\u0646\u062A\u0638\u0627\u0631 \u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629","empty.proposals.message":"\u062A\u0638\u0647\u0631 \u0627\u0642\u062A\u0631\u0627\u062D\u0627\u062A \u0627\u0644\u0645\u0639\u0644\u0651\u0645\u064A\u0646 \u0647\u0646\u0627 \u0644\u0644\u0645\u0631\u0627\u062C\u0639\u0629.","empty.prerequisites.title":"\u0644\u0627 \u062A\u0648\u062C\u062F \u0645\u062A\u0637\u0644\u0628\u0627\u062A \u0633\u0627\u0628\u0642\u0629","empty.prerequisites.message":"\u064A\u062D\u062F\u0651\u062F \u0627\u0644\u0645\u062A\u0637\u0644\u0628 \u0627\u0644\u0633\u0627\u0628\u0642 \u0645\u0627 \u064A\u062C\u0628 \u062A\u0639\u0644\u0651\u0645\u0647 \u0623\u0648\u0644\u064B\u0627.","bulk.title":"\u062A\u0635\u0646\u064A\u0641 {count} \u0633\u0624\u0627\u0644/\u0623\u0633\u0626\u0644\u0629","bulk.confirm":"\u0633\u064A\u0633\u062A\u0628\u062F\u0644 \u0647\u0630\u0627 \u062A\u0635\u0646\u064A\u0641 \u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u0645\u062D\u062F\u064E\u0651\u062F\u0629 \u0628\u0645\u0639\u064A\u0627\u0631 \u0648\u0627\u062D\u062F \u0628\u0648\u0632\u0646 1.00.","bulk.done":"\u062A\u0645 \u062A\u0635\u0646\u064A\u0641 {count} \u0633\u0624\u0627\u0644/\u0623\u0633\u0626\u0644\u0629.","bulk.partial":"\u0646\u062C\u062D {done}\u060C \u0641\u0634\u0644 {failed}.","toast.classified":"\u062A\u0645 \u062D\u0641\u0638 \u0627\u0644\u062A\u0635\u0646\u064A\u0641.","toast.cleared":"\u062A\u0645 \u0645\u0633\u062D \u0627\u0644\u062A\u0635\u0646\u064A\u0641.","toast.objectiveSaved":"\u062A\u0645 \u062D\u0641\u0638 \u0627\u0644\u0647\u062F\u0641.","toast.competencySaved":"\u062A\u0645 \u062D\u0641\u0638 \u0627\u0644\u0643\u0641\u0627\u0621\u0629.","toast.approved":"\u062A\u0645\u062A \u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629 \u0639\u0644\u0649 \u0627\u0644\u0647\u062F\u0641.","toast.rejected":"\u062A\u0645 \u0631\u0641\u0636 \u0627\u0644\u0647\u062F\u0641.","toast.archived":"\u062A\u0645\u062A \u0623\u0631\u0634\u0641\u0629 \u0627\u0644\u0647\u062F\u0641.","toast.linked":"\u062A\u0645 \u0631\u0628\u0637 \u0627\u0644\u0643\u0641\u0627\u0621\u0629.","toast.unlinked":"\u062A\u0645 \u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u0631\u0628\u0637.","toast.prerequisiteAdded":"\u062A\u0645\u062A \u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0645\u062A\u0637\u0644\u0628 \u0627\u0644\u0633\u0627\u0628\u0642.","toast.prerequisiteRemoved":"\u062A\u0645\u062A \u0625\u0632\u0627\u0644\u0629 \u0627\u0644\u0645\u062A\u0637\u0644\u0628 \u0627\u0644\u0633\u0627\u0628\u0642.","toast.flagOn":"\u062A\u0645 \u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u062A\u0639\u0644\u0651\u0645 \u0644\u0647\u0630\u0647 \u0627\u0644\u0645\u0624\u0633\u0633\u0629.","toast.flagOff":"\u062A\u0645 \u062A\u0639\u0637\u064A\u0644 \u0627\u0644\u062A\u0639\u0644\u0651\u0645 \u0644\u0647\u0630\u0647 \u0627\u0644\u0645\u0624\u0633\u0633\u0629.","error.load":"\u062A\u0639\u0630\u0651\u0631 \u062A\u062D\u0645\u064A\u0644 \u0647\u0630\u0627 \u0627\u0644\u0642\u0633\u0645","error.save":"\u062A\u0639\u0630\u0651\u0631 \u062D\u0641\u0638 \u0627\u0644\u062A\u063A\u064A\u064A\u0631","form.requiredMark":"\u0645\u0637\u0644\u0648\u0628","form.requiredMissing":"\u064A\u0631\u062C\u0649 \u0625\u0643\u0645\u0627\u0644 \u0627\u0644\u062D\u0642\u0648\u0644 \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629 \u0627\u0644\u0645\u062D\u062F\u062F\u0629 \u0642\u0628\u0644 \u0627\u0644\u062D\u0641\u0638.","form.hint.code":"\u0645\u0639\u0631\u0651\u0641 \u0642\u0635\u064A\u0631 \u0641\u0631\u064A\u062F\u060C \u0645\u062B\u0627\u0644: MATH-6.NS1.","form.hint.order":"\u062A\u0631\u062A\u064A\u0628 \u0627\u0644\u0639\u0631\u0636 \u0628\u064A\u0646 \u0623\u0647\u062F\u0627\u0641 \u0627\u0644\u0645\u0627\u062F\u0629 (\u0627\u0644\u0623\u0631\u0642\u0627\u0645 \u0627\u0644\u0623\u0635\u063A\u0631 \u0623\u0648\u0644\u0627\u064B).","form.hint.statement":"\u062C\u0645\u0644\u0629 \u0648\u0627\u062D\u062F\u0629 \u062A\u0635\u0641 \u0645\u0627 \u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0627\u0644\u0645\u062A\u0639\u0644\u0651\u0645 \u0642\u0627\u062F\u0631\u0627\u064B \u0639\u0644\u064A\u0647.","option.none":"\u0628\u0644\u0627","objSection.context":"\u0633\u064A\u0627\u0642 \u0627\u0644\u0645\u0646\u0647\u062C","objSection.outcome":"\u0646\u0627\u062A\u062C \u0627\u0644\u062A\u0639\u0644\u0651\u0645","objSection.organization":"\u0627\u0644\u062A\u0646\u0638\u064A\u0645","form.note.official":"\u0647\u062F\u0641 \u0631\u0633\u0645\u064A \u2014 \u062C\u0632\u0621 \u0645\u0646 \u0643\u062A\u0627\u0644\u0648\u063A \u0627\u0644\u0645\u0646\u0647\u062C\u061B proposed_by \u0641\u0627\u0631\u063A \u0644\u0644\u0623\u0647\u062F\u0627\u0641 \u0627\u0644\u062A\u064A \u0623\u0646\u0634\u0623\u062A\u0647\u0627 \u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u062F\u0631\u0633\u0629."}};function cr(e,a,t=null){let s=(Ga[e]||Ga[Qe])[a]??Ga[Qe][a]??a;if(t)for(let[r,p]of Object.entries(t))s=s.replaceAll(`{${r}}`,String(p));return s}function ae(e){let a=Wa(e)?e:Qe;return(t,n)=>cr(a,t,n)}var Is="learning.adaptive.enabled",Ds=["school.learning.read","class.learning.read","school.learning.manage","class.learning.classify"];var J={loaded:!1,adaptive_enabled:!1,teacher_objective_creation:!1};async function Hs({force:e=!1}={}){if(J.loaded&&!e)return{...J};try{let a=await w.get("learning/flags");J.adaptive_enabled=a?.adaptive_enabled===!0,J.teacher_objective_creation=a?.teacher_objective_creation===!0,J.loaded=!0}catch{J.adaptive_enabled=!1,J.teacher_objective_creation=!1,J.loaded=!0}return{...J}}function Bs(){return J.adaptive_enabled===!0}function Us(){return J.teacher_objective_creation===!0}async function pa(e){let a=e?"true":"false";return await w.patch(`settings/${encodeURIComponent(Is)}`,{key:Is,value:a}),J.loaded=!0,J.adaptive_enabled=e===!0,e===!0}function Ve(){return ae(K())}function xe({body:e,actions:a=""}){let t=K(),n=ae(t);return`<div class="learning-panel ac-stack" dir="${Rs(t)}" data-ac-learning-panel>
		<div class="learning-panel__head">
			<div class="ac-field learning-panel__lang">
				<label class="ac-field__label" for="ac-learning-lang">${o(n("lang.label"))}</label>
				<select class="ac-select" id="ac-learning-lang" data-ac-learning-lang>
					${da.map(s=>`<option value="${o(s.key)}"${s.key===t?" selected":""}>${o(s.label)}</option>`).join("")}
				</select>
				<p class="ac-field__hint">${o(n("hint.language"))}</p>
			</div>
			${a?`<div class="learning-panel__actions">${a}</div>`:""}
		</div>
		<div class="learning-panel__body">${e}</div>
	</div>`}function ke(e,a){let t=e.querySelector("[data-ac-learning-lang]");t&&t.addEventListener("change",()=>{Os(t.value),a.rerender()})}async function ua(e,a){return await Hs({force:!0}),Bs()?!0:(e.innerHTML=xe({body:lr(a)}),ke(e,a),dr(e,a),!1)}function lr(e){let a=Ve(),t=e.canAny(["school.learning.manage"]);return`<div class="ac-section-panel">
		<div class="ac-section-panel__body">
			<div class="ac-alert ac-alert--info">
				<div class="ac-alert__body">
					<p class="ac-alert__title">${o(a("flag.disabled.title"))}</p>
					<p class="ac-alert__text">${o(a("flag.disabled.body"))}</p>
				</div>
			</div>
			${t?`<div class="learning-panel__toggle"><button type="button" class="ac-btn ac-btn--primary" data-ac-learning-enable>${o(a("flag.toggle.on"))}</button></div>`:`<p class="ac-field__hint">${o(a("flag.adminOnly"))}</p>`}
		</div>
	</div>`}function dr(e,a){let t=e.querySelector("[data-ac-learning-enable]");if(!t)return;let n=Ve();t.addEventListener("click",async()=>{t.disabled=!0;try{await pa(!0),v(n("toast.flagOn"),"success"),a.rerender()}catch(s){t.disabled=!1,v(s.message,"error")}})}async function Fs(){let e=await w.get("learning/bloom");return Array.isArray(e?.data)?e.data:[]}function ma(e,a=K()){if(!e)return null;let n=e.labels||e.labels_json||null;if(typeof n=="string")try{n=JSON.parse(n)}catch{n=null}return n?.[a]||n?.en||e.name||e.key||null}function Gs(e,{includeAll:a=!1,allLabel:t=null,lang:n=K()}={}){let s=(e||[]).map(r=>({value:r.id,label:ma(r,n)}));return a?[{value:"",label:t||"All"},...s]:s}function Ya(e,a){return a&&(e||[]).find(t=>t.id===a)||null}function Ke(e,a){let t=a||"proposed",n=ae(e);return`<span class="learning-chip learning-chip--obj-${o(t)}">${o(n(`objective.${t}`))}</span>`}function Oe(e,a,t){e.innerHTML=xe({body:D({title:Ve()("error.load"),message:t?.message||""})}),ke(e,a);let n=e.querySelector("[data-ac-retry]");return n&&n.addEventListener("click",()=>a.rerender()),!0}function Ws(e,a,t=4){e.innerHTML=xe({body:H(t)}),ke(e,a)}var ha={learning:'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/></svg>',bell:'<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',taxonomy:'<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h18M3 12h18M3 17h10"/></svg>',classify:'<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>'},Ys={id:"learning",path:"/learning",title:"Learning",description:"The learning taxonomy governance of this organization (teachers classify questions in the application's Questions tab).",permission:["school.learning.read","class.learning.read"],async render(e,a){if(!await ua(e,a))return;let t=Ve(),n=a.canAny(["school.learning.manage"]),s,r,p;try{[s,r,p]=await Promise.all([w.get("learning/objectives",{limit:1}),w.get("learning/objectives",{status:"proposed",limit:1}),w.get("learning/competencies",{limit:1})])}catch(h){Oe(e,a,h);return}let i=h=>Number(h?.total??0),l=i(r),c=Us(),u=`<section class="learning-hero">
			<div class="learning-hero__main">
				<span class="learning-hero__icon" aria-hidden="true">${ha.learning}</span>
				<div class="learning-hero__text">
					<p class="learning-hero__eyebrow">${o(t("hub.eyebrow"))}</p>
					<h2 class="learning-hero__title">${o(t("flag.enabled.title"))}</h2>
					<p class="learning-hero__body">${o(t("flag.enabled.body"))}</p>
					<div class="learning-hero__chips">
						<span class="learning-chip learning-chip--obj-active">${o(t("hub.status.enabled"))}</span>
						<span class="learning-chip learning-chip--obj-proposed">${o(t(c?"flag.teacherCreation.on":"flag.teacherCreation.off"))}</span>
					</div>
				</div>
			</div>
			${n?`<div class="learning-hero__actions"><button type="button" class="ac-btn ac-btn--danger" data-ac-learning-disable>${o(t("flag.toggle.off"))}</button></div>`:`<p class="ac-field__hint">${o(t("flag.adminOnly"))}</p>`}
		</section>`,d=n&&l>0?`<a class="learning-attention" href="#/learning/taxonomy?tab=proposals">
						<span class="learning-attention__icon" aria-hidden="true">${ha.bell}</span>
						<span class="learning-attention__text">
							<strong>${o(t("hub.attention.title",{count:l.toLocaleString()}))}</strong>
							<span>${o(t("hub.attention.body"))}</span>
						</span>
						<span class="learning-attention__cta">${o(t("hub.attention.cta"))} <span aria-hidden="true">\u2192</span></span>
					</a>`:"",m=`<div class="ac-grid ac-grid--kpi">
				${S({label:t("summary.objectives"),value:i(s).toLocaleString(),note:t("nav.taxonomy"),href:"#/learning/taxonomy"})}
				${S({label:t("summary.proposed"),value:l.toLocaleString(),note:t("table.proposedBy"),tone:l>0?"warning":"",href:n?"#/learning/taxonomy?tab=proposals":""})}
				${S({label:t("summary.competencies"),value:i(p).toLocaleString(),note:t("nav.taxonomy"),href:"#/learning/taxonomy?tab=competencies"})}
			</div>`,g=`<div class="ac-role-cards learning-cards">
				<a class="ac-role-card learning-card" href="#/learning/taxonomy">
					<span class="ac-role-card__icon">${ha.taxonomy}</span>
					<p class="ac-role-card__title">${o(t("nav.taxonomy"))}</p>
					<p class="ac-role-card__desc">${o(t("card.taxonomy.desc"))}</p>
					<p class="ac-role-card__count">${i(s).toLocaleString()} <small>${o(t("summary.objectives"))}</small></p>
					<span class="learning-card__foot">${o(t("card.open"))} <span aria-hidden="true">\u2192</span></span>
				</a>
				<div class="ac-role-card learning-card learning-card--static">
					<span class="ac-role-card__icon">${ha.classify}</span>
					<span class="learning-card__badge">${o(t("card.classify.badge"))}</span>
					<p class="ac-role-card__title">${o(t("card.classify.title"))}</p>
					<p class="ac-role-card__desc">${o(t("card.classify.desc"))}</p>
					<span class="learning-card__foot learning-card__foot--muted">${o(t("card.questions.moved"))}</span>
				</div>
			</div>`,f=`${u}
			${d}
			${m}

			<div class="ac-section learning-section-head">
				<h2 class="ac-section__title">${o(t("hub.cards.title"))}</h2>
				<p class="ac-section__hint">${o(t("learning.description"))}</p>
			</div>

			${g}`;e.innerHTML=xe({body:f}),ke(e,a);let x=e.querySelector("[data-ac-learning-disable]");x&&x.addEventListener("click",async()=>{if(await M({title:t("flag.toggle.off"),message:t("hub.disable.confirm"),confirmLabel:t("flag.toggle.off"),danger:!0})){x.disabled=!0;try{await pa(!1),v(t("toast.flagOff"),"success"),a.rerender()}catch(b){x.disabled=!1,v(b.message,"error")}}})}};function ga({objective:e=null,subjects:a,objectives:t,categories:n,bloom:s,onSaved:r}){let p=K(),i=ae(p),l=!!e,c=e?.id||null,u=(t||[]).filter(b=>b.id!==c),d=B({title:i(l?"action.edit":"action.newObjective"),subtitle:l?e.code:i("hint.teacherProposal"),body:`
			<div class="ac-form ac-form--objective" data-ac-form>
				<div data-ac-form-error hidden></div>
				${l&&!e.proposed_by?`<p class="ac-field__hint ac-provenance-note">${o(i("form.note.official"))}</p>`:""}

				<section class="ac-form__section">
					<h3 class="ac-form__section-title">${o(i("objSection.context"))}</h3>
					<div class="ac-form__row">
						${O({id:"ac-obj-subject",label:i("field.subject"),value:e?.subject_id||"",options:a.map(b=>({value:b.id,label:b.name})),allLabel:null,required:!0})}
						<div data-ac-obj-parent-slot class="ac-field" data-ac-field></div>
					</div>
				</section>

				<section class="ac-form__section">
					<h3 class="ac-form__section-title">${o(i("objSection.outcome"))}</h3>
					<div class="ac-field ac-field--full" data-ac-field>
						<label class="ac-field__label ac-field__label--primary" for="ac-obj-statement">${o(i("field.statement"))}<span class="ac-required" aria-hidden="true" title="${o(i("form.requiredMark"))}">*</span></label>
						<textarea class="ac-input ac-input--full ac-input--statement" id="ac-obj-statement" rows="3" aria-required="true" autocomplete="off" placeholder="${o(i("form.hint.statement"))}">${o(e?.statement||"")}</textarea>
					</div>
					${Ae({id:"ac-obj-description",label:i("field.description"),value:e?.description||"",rows:2})}
				</section>

				<section class="ac-form__section">
					<h3 class="ac-form__section-title">${o(i("objSection.organization"))}</h3>
					<div class="ac-form__row">
						${A({id:"ac-obj-code",label:i("field.code"),value:e?.code||"",hint:i("form.hint.code"),required:!0})}
						<div data-ac-obj-category-slot class="ac-field" data-ac-field></div>
					</div>
					<div class="ac-form__row">
						${O({id:"ac-obj-bloom",label:i("field.bloom"),value:e?.primary_bloom_dimension_id||"",options:Gs(s,{lang:p}),allLabel:i("option.none")})}
						${A({id:"ac-obj-order",label:i("field.orderIndex"),type:"number",value:e?.order_index??0,hint:i("form.hint.order")})}
					</div>
				</section>
			</div>`,footer:`
			<button type="button" class="ac-btn" data-ac-form-cancel>${o(i("action.cancel"))}</button>
			<button type="button" class="ac-btn ac-btn--primary" data-ac-form-save>${o(i("action.save"))}</button>`}),m=d.root,g=m.querySelector("#ac-obj-subject"),f=m.querySelector("[data-ac-obj-parent-slot]"),x=m.querySelector("[data-ac-obj-category-slot]");function h(){let b=g.value||e?.subject_id||"",k=(n||[]).filter(q=>!b||!q.subject_id||q.subject_id===b),T=u.filter(q=>!b||q.subject_id===b);f.innerHTML=O({id:"ac-obj-parent",label:i("field.parent"),value:e?.parent_id||"",options:T.map(q=>({value:q.id,label:`${q.code} \u2014 ${fa(q.statement)}`})),allLabel:i("option.none")}),x.innerHTML=O({id:"ac-obj-category",label:i("field.category"),value:e?.category_id||"",options:k.map(q=>({value:q.id,label:q.name})),allLabel:i("option.none")})}h(),g.addEventListener("change",h),m.querySelector("[data-ac-form-cancel]").addEventListener("click",()=>d.close()),_a(m),m.querySelector("[data-ac-form-save]").addEventListener("click",async b=>{let k=b.currentTarget;if(va(m,["#ac-obj-subject","#ac-obj-code","#ac-obj-statement"]).length){ya(m,i);return}let T={subject_id:te(m,"#ac-obj-subject"),code:te(m,"#ac-obj-code"),statement:te(m,"#ac-obj-statement"),description:$e(m.querySelector("#ac-obj-description")),category_id:$e(m.querySelector("#ac-obj-category")),parent_id:$e(m.querySelector("#ac-obj-parent")),primary_bloom_dimension_id:$e(m.querySelector("#ac-obj-bloom"))},q=te(m,"#ac-obj-order");q!==""&&(T.order_index=q),await ba({root:m,button:k,url:l?`learning/objectives/${encodeURIComponent(c)}`:"learning/objectives",method:l?"patch":"post",body:T,toastMessage:i("toast.objectiveSaved"),onSaved:z=>{d.close(),r?.(z)}})})}function Qa({competency:e=null,subjects:a,competencies:t,onSaved:n}){let s=K(),r=ae(s),p=!!e,i=e?.id||null,l=B({title:r(p?"action.edit":"action.newCompetency"),subtitle:p?e.code:"",wide:!0,body:`
			<div class="ac-form" data-ac-form>
				<div data-ac-form-error hidden></div>
				<div class="ac-form__grid">
					${A({id:"ac-comp-code",label:r("field.code"),value:e?.code||"",hint:r("form.hint.code"),required:!0})}
					${A({id:"ac-comp-name",label:r("field.name"),value:e?.name||"",hint:r("hint.form.name"),required:!0})}
					${O({id:"ac-comp-kind",label:r("field.kind"),value:e?.kind||"competency",options:["competency","skill","domain"].map(u=>({value:u,label:r(`kind.${u}`)}))})}
					${O({id:"ac-comp-subject",label:r("field.subject"),value:e?.subject_id||"",options:a.map(u=>({value:u.id,label:u.name})),allLabel:"\u2014"})}
					${O({id:"ac-comp-parent",label:r("field.parent"),value:e?.parent_id||"",options:(t||[]).filter(u=>u.id!==i).map(u=>({value:u.id,label:`${u.code} \u2014 ${u.name}`})),allLabel:"\u2014"})}
					${Ae({id:"ac-comp-description",label:r("field.description"),value:e?.description||"",rows:3,hint:r("hint.form.description")})}
				</div>
			</div>`,footer:`
			<button type="button" class="ac-btn" data-ac-form-cancel>${o(r("action.cancel"))}</button>
			<button type="button" class="ac-btn ac-btn--primary" data-ac-form-save>${o(r("action.save"))}</button>`}),c=l.root;c.querySelector("[data-ac-form-cancel]").addEventListener("click",()=>l.close()),_a(c),c.querySelector("[data-ac-form-save]").addEventListener("click",async u=>{if(va(c,["#ac-comp-code","#ac-comp-name"]).length){ya(c,r);return}await ba({root:c,button:u.currentTarget,url:p?`learning/competencies/${encodeURIComponent(i)}`:"learning/competencies",method:p?"patch":"post",body:{code:te(c,"#ac-comp-code"),name:te(c,"#ac-comp-name"),description:$e(c.querySelector("#ac-comp-description")),kind:te(c,"#ac-comp-kind"),subject_id:$e(c.querySelector("#ac-comp-subject")),parent_id:$e(c.querySelector("#ac-comp-parent"))},toastMessage:r("toast.competencySaved"),onSaved:d=>{l.close(),n?.(d)}})})}function Qs({objective:e,competencies:a,onSaved:t}){let n=K(),s=ae(n),r=B({title:s("action.linkCompetency"),subtitle:`${e.code} \u2014 ${fa(e.statement)}`,body:`
			<div class="ac-form" data-ac-form>
				<div data-ac-form-error hidden></div>
				<div class="ac-form__grid">
					${O({id:"ac-link-competency",label:s("field.competency"),value:"",options:(a||[]).map(i=>({value:i.id,label:`${i.code} \u2014 ${i.name}`})),allLabel:"\u2014",required:!0})}
					${A({id:"ac-link-weight",label:s("field.weight"),type:"number",value:1,hint:s("hint.form.weight")})}
				</div>
				${Ge({id:"ac-link-primary",label:s("field.primaryCompetency"),hint:s("hint.form.primary")})}
			</div>`,footer:`
			<button type="button" class="ac-btn" data-ac-form-cancel>${o(s("action.cancel"))}</button>
			<button type="button" class="ac-btn ac-btn--primary" data-ac-form-save>${o(s("action.linkCompetency"))}</button>`}),p=r.root;p.querySelector("[data-ac-form-cancel]").addEventListener("click",()=>r.close()),_a(p),p.querySelector("[data-ac-form-save]").addEventListener("click",async i=>{if(va(p,["#ac-link-competency"]).length){ya(p,s);return}await ba({root:p,button:i.currentTarget,url:`learning/objectives/${encodeURIComponent(e.id)}/competencies`,method:"post",body:{competency_id:te(p,"#ac-link-competency"),weight:Number(te(p,"#ac-link-weight"))||1,is_primary:p.querySelector("#ac-link-primary").checked},toastMessage:s("toast.linked"),onSaved:()=>{r.close(),t?.()}})})}function Vs({objective:e,objectives:a,onSaved:t}){let n=K(),s=ae(n),r=(a||[]).filter(l=>l.id!==e?.id),p=B({title:s("action.addPrerequisite"),subtitle:`${e.code} \u2014 ${fa(e.statement)}`,body:`
			<div class="ac-form" data-ac-form>
				<div data-ac-form-error hidden></div>
				<div class="ac-form__grid">
					${O({id:"ac-prereq-objective",label:s("field.objective"),value:"",options:r.map(l=>({value:l.id,label:`${l.code} \u2014 ${fa(l.statement)}`})),allLabel:"\u2014",required:!0})}
					${O({id:"ac-prereq-strength",label:s("field.strength"),value:"required",hint:s("hint.form.strength"),options:["required","recommended"].map(l=>({value:l,label:s(`strength.${l}`)}))})}
					${A({id:"ac-prereq-mastery",label:s("field.minMastery"),value:"developing",hint:s("hint.form.minMastery")})}
					${Ae({id:"ac-prereq-rationale",label:s("field.rationale"),value:"",rows:2,hint:s("hint.form.rationale")})}
				</div>
			</div>`,footer:`
			<button type="button" class="ac-btn" data-ac-form-cancel>${o(s("action.cancel"))}</button>
			<button type="button" class="ac-btn ac-btn--primary" data-ac-form-save>${o(s("action.addPrerequisite"))}</button>`}),i=p.root;i.querySelector("[data-ac-form-cancel]").addEventListener("click",()=>p.close()),_a(i),i.querySelector("[data-ac-form-save]").addEventListener("click",async l=>{if(va(i,["#ac-prereq-objective"]).length){ya(i,s);return}await ba({root:i,button:l.currentTarget,url:`learning/objectives/${encodeURIComponent(e.id)}/prerequisites`,method:"post",body:{prerequisite_objective_id:candidate,strength:te(i,"#ac-prereq-strength"),min_mastery_state:te(i,"#ac-prereq-mastery")||"developing",rationale:$e(i.querySelector("#ac-prereq-rationale"))},toastMessage:s("toast.prerequisiteAdded"),onSaved:()=>{p.close(),t?.()}})})}async function ba({root:e,button:a,url:t,method:n,body:s,toastMessage:r,onSaved:p}){a.disabled=!0,ur(e);try{let i=await(n==="patch"?w.patch(t,s):w.post(t,s));v(r,"success"),p?.(i)}catch(i){a.disabled=!1,pr(e,i)}}function va(e,a){let t=[];return a.forEach(n=>{let s=e.querySelector(n),r=s?s.closest("[data-ac-field]"):null;s&&!String(s.value||"").trim()?(t.push(s),r&&r.classList.add("ac-field--invalid")):r&&r.classList.remove("ac-field--invalid")}),t}function ya(e,a){let t=e.querySelector("[data-ac-form-error]");t&&(t.hidden=!1,t.innerHTML=`<div class="ac-alert ac-alert--danger"><div class="ac-alert__body"><p class="ac-alert__text">${o(a("form.requiredMissing"))}</p></div></div>`),e.querySelector(".ac-field--invalid .ac-input, .ac-field--invalid .ac-select")?.focus()}function _a(e){let a=t=>{let n=t.target?.closest?.("[data-ac-field]");n&&n.classList.remove("ac-field--invalid")};e.addEventListener("input",a),e.addEventListener("change",a)}function pr(e,a){let t=e.querySelector("[data-ac-form-error]");if(!t)return;let n=mr(a);t.hidden=!1,t.innerHTML=`<div class="ac-alert ac-alert--danger"><div class="ac-alert__body">${n.map(s=>`<p class="ac-alert__text">${o(s)}</p>`).join("")}</div></div>`}function ur(e){let a=e.querySelector("[data-ac-form-error]");a&&(a.hidden=!0,a.innerHTML="")}function mr(e){let a=e?.fields&&typeof e.fields=="object"?e.fields:null;if(!a)return[e?.message||"The change could not be saved"];let t=[];for(let[n,s]of Object.entries(a)){let r=Array.isArray(s)?s:[s];for(let p of r)t.push(`${n}: ${typeof p=="string"?p:JSON.stringify(p)}`)}return t.length?t:[e?.message||"The change could not be saved"]}function te(e,a){return String(e.querySelector(a)?.value??"").trim()}function $e(e){let a=String(e?.value??"").trim();return a===""?null:a}function fa(e,a=56){let t=String(e??"");return t.length>a?`${t.slice(0,a-1)}\u2026`:t}var hr=["proposed","active","rejected","archived"],fr=["competency","skill","domain"],gr=["active","archived"],wa=200,br={objectives:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/></svg>',competencies:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>',proposals:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>'},vr={objectives:"tax.desc.objectives",competencies:"tax.desc.competencies",proposals:"tax.desc.proposals"},j={tab:"objectives",detailId:null,search:"",status:"",kind:"",limit:25,offset:0},Zs={id:"learning-taxonomy",path:"/learning/taxonomy",title:"Taxonomy",description:"The learning objectives and competencies of this organization.",permission:["school.learning.read","class.learning.read"],async render(e,a,t){if(!await ua(e,a))return;Ws(e,a,5);let n=a.canAny(["school.learning.manage"]),s=t?.query?.tab;["objectives","competencies","proposals"].includes(s)&&(j.tab=s,j.detailId=null,j.offset=0),!n&&j.tab!=="objectives"&&(j.tab="objectives");let r;try{r=await yr()}catch(m){Oe(e,a,m);return}if(j.detailId){await Ar(e,a,{canManage:n,lookups:r});return}let p;try{p=await _r()}catch(m){Oe(e,a,m);return}let i=K(),l=ae(i),c=Array.isArray(p?.data)?p.data:[],u=Number(p?.total??c.length),d=`
			${wr({state:j,t:l,canManage:n,total:u})}
			${kr({state:j,rows:c,total:u,lang:i,t:l,canManage:n,lookups:r})}`;e.innerHTML=xe({body:d}),ke(e,a),Cr(e,a,{rows:c,t:l,canManage:n,lookups:r})}};async function yr(){let[e,a,t,n]=await Promise.all([w.get("subjects",{limit:wa}).then(s=>s?.data||[]),w.get("categories",{limit:wa}).then(s=>s?.data||[]),Fs(),w.get("learning/objectives",{limit:wa}).then(s=>s?.data||[])]);return{subjects:e,categories:a,bloom:t,objectives:n}}function _r(){if(j.tab==="competencies"){let a={limit:j.limit,offset:j.offset};return j.search&&(a.search=j.search),j.kind&&(a.kind=j.kind),j.status&&(a.status=j.status),w.get("learning/competencies",a)}let e={limit:j.limit,offset:j.offset};return j.search&&(e.search=j.search),j.tab==="proposals"?e.status="proposed":j.status&&(e.status=j.status),w.get("learning/objectives",e)}function wr({state:e,t:a,canManage:t,total:n}){let s=[{key:"objectives",label:a("summary.objectives")}];t&&(s.push({key:"competencies",label:a("summary.competencies")}),s.push({key:"proposals",label:a("summary.proposed")}));let r=Number(n??0).toLocaleString();return`<div class="learning-tabs-block">
		<div class="learning-tabs" role="tablist" aria-label="${o(a("learning.title"))}">${s.map(p=>{let i=p.key===e.tab;return`<button type="button" class="learning-tab${i?" is-active":""}" role="tab" aria-selected="${i}" tabindex="${i?"0":"-1"}" data-ac-learning-tab="${o(p.key)}">
					<span class="learning-tab__icon" aria-hidden="true">${br[p.key]||""}</span>
					<span class="learning-tab__label">${o(p.label)}</span>
					${i?`<span class="learning-tab__count">${r}</span>`:""}
				</button>`}).join("")}</div>
		<p class="learning-tabs__desc">${o(a(vr[e.tab]||"learning.description"))}</p>
	</div>`}function xr({view:e,total:a,t}){let n=!!(e.search||e.kind||e.tab!=="proposals"&&e.status);return`<div class="learning-results">
		<span class="learning-results__count">${o(t("results.count",{count:Number(a??0).toLocaleString()}))}</span>
		${n?`<button type="button" class="ac-btn ac-btn--sm learning-results__clear" data-ac-tax-clear>${o(t("action.clearFilters"))}</button>`:""}
	</div>`}function kr({state:e,rows:a,total:t,lang:n,t:s,canManage:r,lookups:p}){let i=xr({view:e,total:t,t:s});return e.tab==="competencies"?`
			${F({fields:_e({id:"ac-tax-search",placeholder:s("action.search"),value:e.search})+ee({id:"ac-tax-kind",label:s("field.kind"),value:e.kind,includeAll:!0,allLabel:s("field.kind"),options:fr.map(l=>({value:l,label:s(`kind.${l}`)}))})+ee({id:"ac-tax-status",label:s("field.status"),value:e.status,includeAll:!0,allLabel:s("field.status"),options:gr.map(l=>({value:l,label:s(`objective.${l}`)}))}),actions:`<button type="button" class="ac-btn ac-btn--sm" data-ac-tax-refresh>${o(s("action.refresh"))}</button><button type="button" class="ac-btn ac-btn--sm ac-btn--primary" data-ac-tax-new-competency>${o(s("action.newCompetency"))}</button>`})}
			${i}
			${C({columns:Sr({lang:n,t:s,lookups:p}),rows:a,empty:s("empty.competencies.message")})}
			${ie({total:t,limit:e.limit,offset:e.offset})}`:e.tab==="proposals"?`
			${F({fields:_e({id:"ac-tax-search",placeholder:s("action.search"),value:e.search}),actions:`<button type="button" class="ac-btn ac-btn--sm" data-ac-tax-refresh>${o(s("action.refresh"))}</button>`})}
			${i}
			${C({columns:Tr({lang:n,t:s}),rows:a,empty:s("empty.proposals.message")})}
			${ie({total:t,limit:e.limit,offset:e.offset})}`:`
		${F({fields:_e({id:"ac-tax-search",placeholder:s("action.search"),value:e.search})+ee({id:"ac-tax-status",label:s("field.status"),value:e.status,includeAll:!0,allLabel:s("field.status"),options:hr.map(l=>({value:l,label:s(`objective.${l}`)}))}),actions:`<button type="button" class="ac-btn ac-btn--sm" data-ac-tax-refresh>${o(s("action.refresh"))}</button><button type="button" class="ac-btn ac-btn--sm ac-btn--primary" data-ac-tax-new-objective>${o(s(r?"action.newObjective":"action.proposeObjective"))}</button>`})}
		${i}
		${C({columns:$r({lang:n,t:s,canManage:r,lookups:p}),rows:a,empty:s("empty.objectives.message")})}
		${ie({total:t,limit:e.limit,offset:e.offset})}`}function $r({lang:e,t:a,canManage:t,lookups:n}){return[{key:"code",label:a("table.code"),render:s=>o(s.code)},{key:"statement",label:a("table.statement"),render:s=>o(qe(s.statement,90))},{key:"subject",label:a("table.subject"),render:s=>o(Va(n.subjects,s.subject_id))},{key:"bloom",label:a("table.bloom"),render:s=>{let r=Ya(n.bloom,s.primary_bloom_dimension_id);return r?o(ma(r,e)):"\u2014"}},{key:"status",label:a("field.status"),render:s=>Ke(e,s.status)},{key:"actions",label:"",className:"learning-col-actions",render:s=>oe([{id:"open",label:a("action.open"),value:s.id},{id:"edit",label:a("action.edit"),value:s.id},{id:"archive",label:a("action.archive"),value:s.id,tone:"danger",hidden:!t||s.status==="archived"}])}]}function Sr({lang:e,t:a,lookups:t}){return[{key:"code",label:a("table.code"),render:n=>o(n.code)},{key:"name",label:a("table.competency"),render:n=>o(qe(n.name,80))},{key:"kind",label:a("table.kind"),render:n=>o(a(`kind.${n.kind||"competency"}`))},{key:"subject",label:a("table.subject"),render:n=>o(Va(t.subjects,n.subject_id))},{key:"status",label:a("field.status"),render:n=>Ke(e,n.status)},{key:"actions",label:"",className:"learning-col-actions",render:n=>oe([{id:"edit-competency",label:a("action.edit"),value:n.id},{id:"archive-competency",label:a("action.archive"),value:n.id,tone:"danger",hidden:n.status==="archived"}])}]}function Tr({lang:e,t:a}){return[{key:"code",label:a("table.code"),render:t=>o(t.code)},{key:"statement",label:a("table.statement"),render:t=>o(qe(t.statement,110))},{key:"created",label:a("table.created"),render:t=>o(N(t.created_at,{withTime:!1}))},{key:"status",label:a("field.status"),render:t=>Ke(e,t.status)},{key:"actions",label:"",className:"learning-col-actions",render:t=>oe([{id:"approve",label:a("action.approve"),value:t.id,tone:"primary"},{id:"reject",label:a("action.reject"),value:t.id,tone:"danger"}])}]}async function Ar(e,a,{canManage:t,lookups:n}){let s=K(),r=ae(s),p;try{p=await w.get(`learning/objectives/${encodeURIComponent(j.detailId)}`)}catch(g){j.detailId=null,Oe(e,a,g);return}let i=Array.isArray(p.competencies)?p.competencies:[],l=Array.isArray(p.prerequisites)?p.prerequisites:[],c=Ya(n.bloom,p.primary_bloom_dimension_id),u=t?`<button type="button" class="ac-btn ac-btn--sm ac-btn--primary" data-ac-tax-link>${o(r("action.linkCompetency"))}</button>`:"",d=t?`<button type="button" class="ac-btn ac-btn--sm ac-btn--primary" data-ac-tax-prereq>${o(r("action.addPrerequisite"))}</button>`:"",m=`
		<div class="learning-detail">
			<div class="learning-detail__bar">
				<button type="button" class="ac-btn ac-btn--sm" data-ac-tax-back><span aria-hidden="true">\u2190</span> ${o(r("summary.objectives"))}</button>
				${t?`<button type="button" class="ac-btn ac-btn--sm" data-ac-tax-edit="${o(p.id)}">${o(r("action.edit"))}</button>`:""}
			</div>
			<div class="learning-detail__head">
				<span class="learning-detail__code">${o(p.code)}</span>
				${Ke(s,p.status)}
			</div>
			<p class="learning-detail__statement">${o(p.statement)}</p>
			${p.description?`<p class="learning-detail__description">${o(p.description)}</p>`:""}
			<dl class="learning-facts">
				<div class="learning-fact">
					<dt>${o(r("field.subject"))}</dt>
					<dd>${o(Va(n.subjects,p.subject_id))}</dd>
				</div>
				${c?`<div class="learning-fact">
								<dt>${o(r("field.bloom"))}</dt>
								<dd>${o(ma(c,s))}</dd>
							</div>`:""}
				<div class="learning-fact">
					<dt>${o(r("summary.competencies"))}</dt>
					<dd>${i.length.toLocaleString()}</dd>
				</div>
				<div class="learning-fact">
					<dt>${o(r("summary.prerequisites"))}</dt>
					<dd>${l.length.toLocaleString()}</dd>
				</div>
			</dl>
		</div>

		<section class="ac-section-panel">
			<div class="ac-section-panel__head">
				<h3 class="ac-section-panel__title">${o(r("summary.competencies"))} <span class="learning-section-count">${i.length.toLocaleString()}</span></h3>
				${t?`<div class="ac-panel__actions">${u}</div>`:""}
			</div>
			<div class="ac-section-panel__body">
				${i.length?qr(i,{t:r,canManage:t}):R({title:r("empty.competencies.title"),message:r("empty.competencies.message"),action:u})}
			</div>
		</section>

		<section class="ac-section-panel">
			<div class="ac-section-panel__head">
				<h3 class="ac-section-panel__title">${o(r("summary.prerequisites"))} <span class="learning-section-count">${l.length.toLocaleString()}</span></h3>
				${t?`<div class="ac-panel__actions">${d}</div>`:""}
			</div>
			<div class="ac-section-panel__body">
				${l.length?Lr(l,{t:r,canManage:t,lookups:n}):R({title:r("empty.prerequisites.title"),message:r("empty.prerequisites.message"),action:d})}
			</div>
		</section>`;e.innerHTML=xe({body:m}),ke(e,a),e.querySelector("[data-ac-tax-back]")?.addEventListener("click",()=>{j.detailId=null,a.rerender()}),e.querySelector("[data-ac-tax-edit]")?.addEventListener("click",()=>{ga({objective:p,subjects:n.subjects,objectives:n.objectives,categories:n.categories,bloom:n.bloom,onSaved:()=>a.rerender()})}),e.querySelectorAll("[data-ac-tax-link]").forEach(g=>{g.addEventListener("click",async()=>{Qs({objective:p,competencies:await Er(),onSaved:()=>a.rerender()})})}),e.querySelectorAll("[data-ac-tax-prereq]").forEach(g=>{g.addEventListener("click",()=>{Vs({objective:p,objectives:n.objectives,onSaved:()=>a.rerender()})})}),Te(e,{unlink:async g=>{try{await w.del(`learning/objectives/${encodeURIComponent(p.id)}/competencies/${encodeURIComponent(g)}`),v(r("toast.unlinked"),"success"),a.rerender()}catch(f){v(f.message,"error")}},"unlink-prerequisite":async g=>{try{await w.del(`learning/objectives/${encodeURIComponent(p.id)}/prerequisites/${encodeURIComponent(g)}`),v(r("toast.prerequisiteRemoved"),"success"),a.rerender()}catch(f){v(f.message,"error")}}})}function qr(e,{t:a,canManage:t}){return C({columns:[{key:"code",label:a("table.code"),render:n=>o(n.code||"\u2014")},{key:"name",label:a("table.competency"),render:n=>o(n.name||"\u2014")},{key:"weight",label:a("table.weight"),render:n=>o(String(n.weight??"\u2014"))},{key:"actions",label:"",className:"learning-col-actions",render:n=>t?oe([{id:"unlink",label:a("action.unlink"),value:n.competency_id,tone:"danger"}]):""}],rows:e,empty:a("empty.competencies.message")})}function Lr(e,{t:a,canManage:t,lookups:n}){return C({columns:[{key:"objective",label:a("table.objective"),render:s=>o(jr(n.objectives,s.prerequisite_objective_id))},{key:"strength",label:a("field.strength"),render:s=>o(a(`strength.${s.strength}`))},{key:"min_mastery_state",label:a("field.minMastery"),render:s=>o(s.min_mastery_state||"\u2014")},{key:"rationale",label:a("field.rationale"),render:s=>o(qe(s.rationale||"\u2014",60))},{key:"actions",label:"",className:"learning-col-actions",render:s=>t?oe([{id:"unlink-prerequisite",label:a("action.remove"),value:s.prerequisite_objective_id,tone:"danger"}]):""}],rows:e,empty:a("empty.prerequisites.message")})}function Cr(e,a,{rows:t,t:n,canManage:s,lookups:r}){let p=Array.from(e.querySelectorAll("[data-ac-learning-tab]"));p.forEach((c,u)=>{c.addEventListener("click",()=>{j.tab=c.dataset.acLearningTab,j.detailId=null,j.offset=0,j.search="",j.status="",j.kind="",a.rerender()}),c.addEventListener("keydown",d=>{let m=(e.querySelector("[data-ac-learning-panel]")?.getAttribute("dir")||"ltr")==="rtl",g=d.key==="ArrowRight"?!m:d.key==="ArrowLeft"?m:null;if(g===null&&d.key!=="Home"&&d.key!=="End")return;d.preventDefault();let f=u;d.key==="Home"?f=0:d.key==="End"?f=p.length-1:f=(u+(g?1:-1)+p.length)%p.length,p[f].focus(),p[f].click()})});let i=e.querySelector("#ac-tax-search"),l=null;i?.addEventListener("input",()=>{clearTimeout(l),l=setTimeout(()=>{j.search=i.value.trim(),j.offset=0,a.rerender()},220)});for(let[c,u]of[["ac-tax-status","status"],["ac-tax-kind","kind"]]){let d=e.querySelector(`#${c}`);d?.addEventListener("change",()=>{j[u]=d.value,j.offset=0,a.rerender()})}e.querySelector("[data-ac-tax-refresh]")?.addEventListener("click",()=>a.rerender()),e.querySelector("[data-ac-tax-clear]")?.addEventListener("click",()=>{j.search="",j.status="",j.kind="",j.offset=0,a.rerender()}),jt(e,{onPage:c=>{j.offset=c,a.rerender()}}),e.querySelector("[data-ac-tax-new-objective]")?.addEventListener("click",()=>{ga({subjects:r.subjects,objectives:r.objectives,categories:r.categories,bloom:r.bloom,onSaved:()=>a.rerender()})}),e.querySelector("[data-ac-tax-new-competency]")?.addEventListener("click",()=>{Qa({subjects:r.subjects,competencies:t,onSaved:()=>a.rerender()})}),Te(e,{open:c=>{j.detailId=c,a.rerender()},edit:c=>{let u=t.find(d=>d.id===c);u&&ga({objective:u,subjects:r.subjects,objectives:r.objectives,categories:r.categories,bloom:r.bloom,onSaved:()=>a.rerender()})},archive:async c=>{let u=t.find(m=>m.id===c);if(await M({title:n("action.archive"),message:n("action.archive"),detail:u?`${u.code} \u2014 ${qe(u.statement,80)}`:"",confirmLabel:n("action.archive"),danger:!0}))try{await w.patch(`learning/objectives/${encodeURIComponent(c)}`,{status:"archived"}),v(n("toast.archived"),"success"),a.rerender()}catch(m){v(m.message,"error")}},"edit-competency":c=>{let u=t.find(d=>d.id===c);u&&Qa({competency:u,subjects:r.subjects,competencies:t,onSaved:()=>a.rerender()})},"archive-competency":async c=>{let u=t.find(m=>m.id===c);if(await M({title:n("action.archive"),message:n("action.archive"),detail:u?`${u.code} \u2014 ${u.name}`:"",confirmLabel:n("action.archive"),danger:!0}))try{await w.post(`learning/competencies/${encodeURIComponent(c)}/archive`,{}),v(n("toast.competencySaved"),"success"),a.rerender()}catch(m){v(m.message,"error")}},approve:c=>{let u=t.find(d=>d.id===c);u&&Ks({objective:u,mode:"approve",t:n,onDone:()=>a.rerender()})},reject:c=>{let u=t.find(d=>d.id===c);u&&Ks({objective:u,mode:"reject",t:n,onDone:()=>a.rerender()})}})}async function Er(){try{return(await w.get("learning/competencies",{limit:wa,status:"active"}))?.data||[]}catch{return[]}}function Ks({objective:e,mode:a,t,onDone:n}){let s=a==="approve",r=B({title:t(s?"action.approve":"action.reject"),subtitle:`${e.code} \u2014 ${qe(e.statement,70)}`,body:`
			<div class="ac-form" data-ac-form>
				<div data-ac-form-error hidden></div>
				${Ae({id:"ac-review-note",label:t("field.reviewNote"),value:"",rows:3,hint:s?"":t("hint.teacherProposal")})}
			</div>`,footer:`
			<button type="button" class="ac-btn" data-ac-review-cancel>${o(t("action.cancel"))}</button>
			<button type="button" class="ac-btn ${s?"ac-btn--primary":"ac-btn--danger"}" data-ac-review-save>${o(t(s?"action.approve":"action.reject"))}</button>`}),p=r.root;p.querySelector("[data-ac-review-cancel]").addEventListener("click",()=>r.close()),p.querySelector("[data-ac-review-save]").addEventListener("click",async i=>{let l=p.querySelector("#ac-review-note").value.trim();if(!s&&!l){Js(p,t("field.reviewNote"));return}let c=i.currentTarget;c.disabled=!0;try{await w.post(`learning/objectives/${encodeURIComponent(e.id)}/${s?"approve":"reject"}`,{note:l||null}),v(t(s?"toast.approved":"toast.rejected"),"success"),r.close(),n?.()}catch(u){c.disabled=!1,Js(p,u.message)}})}function Js(e,a){let t=e.querySelector("[data-ac-form-error]");t&&(t.hidden=!1,t.innerHTML=`<div class="ac-alert ac-alert--danger"><div class="ac-alert__body"><p class="ac-alert__text">${o(a)}</p></div></div>`)}function Va(e,a){return a&&(e||[]).find(t=>t.id===a)?.name||"\u2014"}function jr(e,a){let t=(e||[]).find(n=>n.id===a);return t?`${t.code} \u2014 ${qe(t.statement,50)}`:"\u2014"}function qe(e,a=60){let t=String(e??"");return t.length>a?`${t.slice(0,a-1)}\u2026`:t}var zr=[{id:"overview",path:"/",title:"Overview",icon:"overview",permission:["platform.console","school.console"]},{id:"teaching",path:"/teaching",title:"Teaching & Learning",icon:"analytics",group:"Analytics",permission:["platform.analytics.read","school.analytics.read"]},{id:"analytics",path:"/analytics",title:"Platform Analytics",icon:"analytics",group:"Analytics",permission:["platform.analytics.read","school.analytics.read"]},{id:"learning",path:"/learning",title:"Learning",icon:"learning",group:"Teaching",permission:Ds},{id:"organizations",path:"/organizations",title:"Organizations",icon:"organizations",group:"Manage",permission:["platform.organizations.read","school.profile.read"]},{id:"users",path:"/users",title:"Users & Access",icon:"users",group:"Manage",permission:["platform.users.read","school.users.read"]},{id:"audit",path:"/audit",title:"Activity & Audit",icon:"audit",group:"Manage",permission:["platform.audit.read","school.audit.read"]},{id:"health",path:"/health",title:"System Health",icon:"health",group:"Manage",permission:["platform.health.read","school.health.read"]},{id:"settings",path:"/settings",title:"Settings",icon:"settings",group:"Manage",permission:["platform.settings.manage","school.settings.manage"]}],Ka=[Pa,{...Pa,id:"overview-alias",path:"/overview"},Bt,zs,Ut,Qt,Vt,Kt,Ms,Jt,Zt,Xt,es,js,Ys,Zs],Je=document.getElementById("ac-boot"),Pr=document.getElementById("ac-root"),an="/admin.html",Ja={cap:["M22 10v6M2 10l10-5 10 5-10 5-10-5z","M6 12v5c3 3 9 3 12 0v-5"],lock:["M7 10V7a5 5 0 0 1 10 0v3","M5 10h14v11H5z","M12 15v2"],warning:["M10.3 3.9 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z","M12 9v4","M12 17h.01"]};function Z(e,a,t){let n=document.createElement(e);return a&&(n.className=a),t!=null&&(n.textContent=t),n}function Xs(e,a=22){let t="http://www.w3.org/2000/svg",n=document.createElementNS(t,"svg");n.setAttribute("viewBox","0 0 24 24"),n.setAttribute("width",String(a)),n.setAttribute("height",String(a)),n.setAttribute("fill","none"),n.setAttribute("stroke","currentColor"),n.setAttribute("stroke-width","1.8"),n.setAttribute("stroke-linecap","round"),n.setAttribute("stroke-linejoin","round"),n.setAttribute("aria-hidden","true"),n.setAttribute("focusable","false");for(let s of e){let r=document.createElementNS(t,"path");r.setAttribute("d",s),n.appendChild(r)}return n}function tn({message:e,hint:a="",code:t="",meta:n="",tone:s="danger",actions:r=[]}){if(!Je)return;document.title="Could not open \xB7 Control Center",Je.classList.add("ac-boot--error"),Je.replaceChildren();let p=Z("div","ac-boot__card");p.setAttribute("role","alert");let i=Z("div","ac-boot__brand"),l=Z("span","ac-boot__brand-mark");l.appendChild(Xs(Ja.cap,13)),i.append(l,Z("span","ac-boot__brand-text","Platform Control Center"));let c=Z("div",`ac-boot__icon ac-boot__icon--${s}`);c.setAttribute("aria-hidden","true"),c.appendChild(Xs(s==="warning"?Ja.warning:Ja.lock));let u=Z("h1","ac-boot__title","Could not open the control center"),d=Z("p","ac-boot__message",e);if(p.append(i,c,u,d),a&&p.appendChild(Z("p","ac-boot__hint",a)),r.length){let m=Z("div","ac-boot__actions");for(let g of r)if(g.href){let f=Z("a",`ac-btn ${g.variant||""}`.trim(),g.label);f.href=g.href,m.appendChild(f)}else{let f=Z("button",`ac-btn ${g.variant||""}`.trim(),g.label);f.type="button",f.addEventListener("click",g.onClick),m.appendChild(f)}p.appendChild(m)}if(t||n){let m=Z("p","ac-boot__meta");t&&m.appendChild(Z("span","ac-boot__code",t)),n&&m.appendChild(document.createTextNode(n)),p.appendChild(m)}Je.appendChild(p)}var sn=()=>window.location.reload();function en(){tn({message:"Your session has ended. Please sign in again.",meta:"Signing in again reopens this console.",actions:[{label:"Go to the sign-in page",href:an,variant:"ac-btn--primary"},{label:"Try again",onClick:sn,variant:"ac-btn--ghost"}]})}var Za=null,at=null;async function Mr(){Ea(),it(()=>{pt()});let e;try{e=await dt()}catch(c){c?.status===401||c?.code==="UNAUTHORIZED"?en():tn({message:c?.message||"The console could not reach the server.",hint:"Check that the server is running, then try again.",code:c?.code||"",tone:"warning",actions:[{label:"Try again",onClick:sn,variant:"ac-btn--primary"},{label:"Go to the sign-in page",href:an}]});return}if(!e?.user){en();return}let a=Lt(Pr,{session:e,navItems:zr,canAny:Ta,onNavigate:c=>se(c)}),t={canAny:Ta,session:e,organization:e.scope?.organization||null,isPlatform:!!e.scope?.isPlatform,deployment:e.deployment||{},isOffline:!!e.deployment?.isOffline,getState:ct,setPeriod:(c,u)=>{lt(c,u),et(a,t,Za)},rerender:()=>et(a,t,Za),setTitle:(c,u)=>{c&&(a.title.textContent=c),u!==void 0&&(a.description.textContent=u),document.title=`${c||a.title.textContent} \xB7 Control Center`}};gt(t),ht(Ka,{notFound:{id:"not-found",path:"/not-found",title:"Page not found",description:"That section does not exist in the control center.",render(c){c.innerHTML=`<div class="ac-empty">
					<p class="ac-empty__title">Page not found</p>
					<p class="ac-empty__message">The address you opened does not match a section of the control center.</p>
					<a class="ac-btn ac-btn--primary" href="#/">Back to the overview</a>
				</div>`}}}),ft(c=>{Za=c,a.title.textContent=c.title,a.description.textContent=c.description||"",a.setActive(c.path),document.title=`${c.title} \xB7 Control Center`,et(a,t,c)});let n='<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"></path><polyline points="12 19 5 12 12 5"></polyline></svg>';function s(c){let u=Ca();if(!u||Array.from(c.querySelectorAll("a, button")).find(x=>/^←\s/.test(x.textContent.trim())))return;let m=c.querySelector(".ac-toolbar__push");if(!m||m.querySelector(".ac-back-btn"))return;let g=document.createElement("button");g.type="button",g.className="ac-btn ac-back-btn",g.innerHTML=`${n}<span class="ac-back-btn__label">Back</span>`;let f=r(u);f&&(g.title=`Back to ${f}`),g.setAttribute("aria-label",f?`Back to ${f}`:"Back to the previous page"),g.addEventListener("click",()=>vt()),m.prepend(g)}function r(c){let u=String(c||"").replace(/^#/,"").split("?")[0],d=Ka.find(m=>m.path===u);return d?d.title:u.startsWith("/users/")?"Users & Access":u.startsWith("/organizations/")?"Organizations":null}at=s;function p(){let c=document.getElementById("ac-global-search"),u=document.getElementById("ac-search-panel"),d=document.getElementById("ac-search-clear");if(!c||!u)return;let m=Ct(Ka,Ye),g=[],f=-1,x=null,h=()=>{d&&(d.hidden=c.value.length===0)},b=()=>{u.hidden=!0,u.innerHTML="",g=[],f=-1,h()},k=L=>{b(),c.value="",c.blur(),h(),se(L)},T=L=>{g=L,u.innerHTML=L.length?i(L):`<p class="ac-search__empty">Nothing matches \u201C${l(c.value.trim())}\u201D.</p>`,u.hidden=!1,f=-1},q=async()=>{let L=c.value.trim();if(L.length<2){b();return}let I=await Et(L,{places:m,canUsers:t.canAny(["platform.users.read","school.users.read"]),canOrganizations:t.canAny(["platform.organizations.read","school.profile.read"])});c.value.trim()===L&&T(I)};c.addEventListener("input",()=>{h(),clearTimeout(x),x=setTimeout(q,180)}),d?.addEventListener("click",()=>{c.value="",h(),b(),c.focus()}),c.addEventListener("focus",()=>{h(),c.value.trim().length>=2&&q()}),c.addEventListener("keydown",L=>{if(u.hidden){L.key==="Enter"&&c.value.trim().length>=2&&q();return}if(L.key==="ArrowDown")L.preventDefault(),z(1);else if(L.key==="ArrowUp")L.preventDefault(),z(-1);else if(L.key==="Enter"){L.preventDefault();let I=g[f]||g[0];I&&k(I.path)}else L.key==="Escape"&&(L.preventDefault(),b(),c.blur())}),u.addEventListener("mousedown",L=>{let I=L.target.closest("[data-ac-search-path]");I?(L.preventDefault(),k(I.dataset.acSearchPath)):L.preventDefault()}),document.addEventListener("mousedown",L=>{!u.hidden&&!L.target.closest(".ac-search")&&b()});function z(L){g.length&&(f=(f+L+g.length)%g.length,u.querySelectorAll(".ac-search__item").forEach((I,W)=>{I.classList.toggle("is-active",W===f)}))}}function i(c){let u=[];for(let d of c){let m=d.kind==="settings"?"Settings":d.kind==="user"?"Accounts":d.kind==="organization"?"Organizations":"Go to",g=u.find(f=>f.label===m);g||(g={label:m,items:[]},u.push(g)),g.items.push(d)}return u.map(d=>`<p class="ac-search__group">${d.label}</p>${d.items.map(m=>`<button type="button" class="ac-search__item" data-ac-search-path="${l(m.path)}">
									<span class="ac-search__item-title">${l(m.title)}</span>
									${m.sub?`<span class="ac-search__item-sub">${l(m.sub)}</span>`:""}
									<span class="ac-search__badge${m.kind==="user"?" ac-search__badge--user":""}">${l(m.badge||"")}</span>
								</button>`).join("")}`).join("")}function l(c){return String(c??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}p(),yt(),Je.remove()}var Xa=0;async function et(e,a,t){let n=++Xa,s=document.createElement("div");s.className="ac-page",e.content.replaceChildren(s),s.innerHTML=`<div class="ac-skeleton-stack" aria-busy="true">
		<div class="ac-skeleton" style="width:40%"></div>
		<div class="ac-skeleton" style="width:100%"></div>
		<div class="ac-skeleton" style="width:80%"></div>
	</div>`;try{if(await t.render(s,a,t),n!==Xa)return;at&&at(s)}catch(r){if(n!==Xa)return;console.error("[console] page render failed",r),s.innerHTML=`<div class="ac-error" role="alert">
			<div>
				<p class="ac-error__title">This section could not be rendered</p>
				<p class="ac-error__message">${r.message}</p>
			</div>
		</div>`}}Mr();})();
