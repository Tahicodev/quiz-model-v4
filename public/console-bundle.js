var QuizConsole=(()=>{var Z="quizSession",Be="quizAuthToken",ce="",ve=null,He=null;function ua(e){He=e}function Bt(){try{let e=sessionStorage.getItem(Z)||localStorage.getItem(Z),a=e?JSON.parse(e):null;if(a?.token)return a.token}catch{}return localStorage.getItem(Be)||""}function Ue(){return ce||(ce=Bt(),ce)}function Ut(e){if(e){ce=e;try{let a=sessionStorage.getItem(Z)||localStorage.getItem(Z),t=a?JSON.parse(a):null;if(t){t.token=e,sessionStorage.setItem(Z,JSON.stringify(t));let n=localStorage.getItem(Z),s=n?JSON.parse(n):null;s&&String(s.userId||"")===String(t.userId||"")&&String(s.role||"").toLowerCase()===String(t.role||"").toLowerCase()&&localStorage.setItem(Z,JSON.stringify(t))}localStorage.setItem(Be,e)}catch{}}}function Ft(){ce="";try{localStorage.removeItem(Z),localStorage.removeItem(Be),sessionStorage.removeItem(Z)}catch{}}function ha(){return window.APP_CONFIG&&window.APP_CONFIG.apiUrl||"/api/v1"}async function Wt(){return ve||(ve=fetch(`${ha()}/auth/refresh`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({portal:"admin"})}).then(async e=>{if(!e.ok)throw new Error(`Refresh failed (${e.status})`);let a=await e.json();if(!a?.accessToken)throw new Error("Refresh returned no token");return Ut(a.accessToken),a.accessToken}).finally(()=>{ve=null}),ve)}var $e=class extends Error{constructor(a,t,n,s){super(a),this.name="ApiError",this.status=t,this.code=n,this.fields=s||null}};async function Gt(e){let a=null;try{a=await e.json()}catch{}let t=a?.error||{};return new $e(t.message||a?.message||`Request failed (${e.status})`,e.status,t.code||a?.code||null,t.fields||null)}async function ie(e,a={}){let{method:t="GET",body:n=null,query:s=null,retry:o=!0}=a,f=`${ha()}/${String(e).replace(/^\//,"")}`;if(s&&typeof s=="object"){let u=new URLSearchParams;for(let[h,g]of Object.entries(s))g==null||g===""||u.set(h,String(g));let i=u.toString();i&&(f+=`?${i}`)}let r={Accept:"application/json"},d=Ue();d&&(r.Authorization=`Bearer ${d}`),n!=null&&(r["Content-Type"]="application/json");let l=await fetch(f,{method:t,headers:r,credentials:"include",body:n==null?void 0:JSON.stringify(n)});if(l.status===401&&o){try{await Wt()}catch{throw Ft(),He&&He(),new $e("Your session has ended. Please sign in again.",401,"UNAUTHORIZED")}return ie(e,{...a,retry:!1})}if(!l.ok)throw await Gt(l);return l.status===204?null:l.json()}var k={get:(e,a)=>ie(e,{method:"GET",query:a}),post:(e,a)=>ie(e,{method:"POST",body:a}),patch:(e,a)=>ie(e,{method:"PATCH",body:a}),put:(e,a)=>ie(e,{method:"PUT",body:a}),del:(e,a)=>ie(e,{method:"DELETE",body:a})};var G={session:null,permissions:new Set,deployment:{mode:"saas",isOffline:!1,isSaaS:!0,label:"Multi-tenant platform",description:"",dbProvider:"sqlite"},targetSchoolId:null,period:"30d",customRange:null},Yt=new Set;function Fe(){for(let e of Yt)try{e(G)}catch(a){console.error("[console] store listener failed",a)}}function ma(){return G}function Vt(e){return e?G.permissions.has(e):!0}function We(e=[]){let a=Array.isArray(e)?e:[e];return a.length===0?!0:a.some(t=>Vt(t))}function fa(e,a=null){G.period=e,G.customRange=a,Fe()}async function ga(){let e=await k.get("console/session");return G.session=e,G.permissions=new Set(Array.isArray(e.permissions)?e.permissions:[]),e.deployment&&(G.deployment={...G.deployment,...e.deployment}),Fe(),e}function ba(){G.session=null,G.permissions=new Set,G.targetSchoolId=null,Fe()}var Te=[],ya=null,le=null,ye=null,Ge=null;function _a(e,a={}){Te.length=0;for(let t of e)Te.push(t);ya=a.notFound||null}function wa(e){ye=e}function xa(e){Ge=e}function Se(e){return e&&String(e).split("?")[0].replace(/^#/,"").replace(/\/+$/,"")||"/"}function Kt(e){let a=Se(e);for(let t of Te)if(Se(t.path)===a)return t;for(let t of Te){if(!t.path.includes(":"))continue;let n=Se(t.path).split("/"),s=a.split("/");if(n.length!==s.length)continue;let o={},f=!0;for(let r=0;r<n.length;r+=1){let d=n[r];if(d.startsWith(":"))o[d.slice(1)]=decodeURIComponent(s[r]);else if(d!==s[r]){f=!1;break}}if(f)return{...t,params:o}}return null}function ka(){let a=(window.location.hash||"#/").slice(1)||"/",[t,n]=a.split("?"),s={};if(n)for(let[o,f]of new URLSearchParams(n))s[o]=f;return{path:Se(t),query:s}}function Y(e,{replace:a=!1}={}){let t=e.startsWith("#")?e:`#${e}`;if(a)window.history.replaceState(null,"",t);else if(window.location.hash!==t){window.location.hash=t;return}Ye()}var B=[];function va(e){return String(e||"#/").replace(/^#/,"").split("?")[0]||"/"}function Qt(e){let a=e||"#/",t=B[B.length-1];if(t&&va(t)===va(a)){B[B.length-1]=a;return}if(t===a)return;let n=B.indexOf(a);if(n!==-1){B.length=n+1;return}B.push(a)}function Jt(e){let a=String(e||"/").split("/").filter(Boolean);return a.length<2?null:a[0]==="users"?"/users":a[0]==="organizations"?"/organizations":null}function Ve(){if(B.length>1)return B[B.length-2];let e=Jt(ka().path);return e?`#${e}`:null}function $a(){let e=Ve();if(!e)return!1;if(B.length>1){let a=B.lastIndexOf(e);a!==-1&&(B.length=a+1)}return Y(e),!0}function Ye(){let{path:e,query:a}=ka(),t=Kt(e)||ya;if(!t)return null;Qt(window.location.hash);let n=t.permission?Array.isArray(t.permission)?t.permission:[t.permission]:[];return n.length&&Ge&&!Ge.canAny(n)?(le={...t,id:t.id||"forbidden",title:"Access restricted",description:"Your role does not include this section.",forbidden:!0},ye&&ye(le,{path:e,query:a}),le):(le={...t,path:e,query:a,params:t.params||{}},ye&&ye(le,{path:e,query:a}),le)}function Sa(){return window.addEventListener("hashchange",()=>Ye()),Ye()}var Ta={primary:"var(--ac-tone-1)",success:"var(--ac-tone-2)",warning:"var(--ac-tone-3)",danger:"var(--ac-tone-4)",info:"var(--ac-tone-5)",violet:"var(--ac-tone-6)",muted:"var(--ac-tone-7)"};function c(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;")}function Aa(e){let a=Number(e);return Number.isFinite(a)?a:null}function Zt(e,a=1){let t=Aa(e);if(t==null)return null;let n=10**a;return Math.round((t+Number.EPSILON)*n)/n}function Xt(e){let a=Zt(e,1);return a==null?"\u2014":String(a)}function qa(e,a,t){return Math.min(t,Math.max(a,e))}function Ea(e,a=28){let t=String(e??"");return t.length>a?`${t.slice(0,a-1)}\u2026`:t}function Ae(e){return Ta[e]||Ta.primary}function de(e){return`<div class="ac-legend">${e.map(a=>`<span class="ac-legend__item"><i class="ac-legend__key" style="background:${Ae(a.tone)}"></i>${c(a.label)}</span>`).join("")}</div>`}function T({label:e,value:a,note:t,tone:n="",trend:s="",tooltip:o="",href:f=""}){let r=f?"a":"div",d=f?` href="${c(f)}"`:"",l=["ac-kpi",n?`ac-kpi--${n}`:"",f?"ac-kpi--link":""].filter(Boolean).join(" ");return`<${r} class="${l}"${d}${o?` title="${c(o)}"`:""}>
		<p class="ac-kpi__label">${c(e)}</p>
		<p class="ac-kpi__value">${c(a)}</p>
		${t||s?`<p class="ac-kpi__meta">${s||""}${t?`<span>${c(t)}</span>`:""}</p>`:""}
	</${r}>`}function V({rows:e=[],value:a,max:t=null,label:n=d=>d.label,display:s=d=>Xt(d),tone:o="primary",threshold:f=null,ariaLabel:r="Comparison"}){let d=(Array.isArray(e)?e:[]).filter(Boolean);if(!d.length)return"";let l=680,u=38,i=150,h=64,g=10,m=8,x=d.length*u+g+m,p=d.map(P=>Number(typeof a=="function"?a(P):P[a])||0),b=Math.max(t||0,...p,1),_=l-i-h,S=P=>i+qa(P,0,b)/b*_,$=f==null?"":`<line x1="${S(f)}" y1="${g-4}" x2="${S(f)}" y2="${x-m+2}" class="ac-chart__threshold"/>`,L=d.map((P,W)=>{let J=typeof a=="function"?a(P):P[a],be=Aa(J),oe=g+W*u+14,De=12,Dt=be==null?0:Math.max(be>0?2:0,S(be)-i),Ht=typeof o=="function"?o(P):o,pa=s(J,P);return`<g>
				<title>${c(n(P))}: ${c(pa)}</title>
				<text x="${i-10}" y="${oe+10}" text-anchor="end" class="ac-chart__label">${c(Ea(n(P),24))}</text>
				<rect x="${i}" y="${oe}" width="${_}" height="${De}" rx="3" class="ac-chart__track"/>
				<rect x="${i}" y="${oe}" width="${Dt}" height="${De}" rx="3" fill="${Ae(Ht)}" opacity="0.9"/>
				<text x="${l-h+8}" y="${oe+10}" class="ac-chart__value">${c(pa)}</text>
			</g>`}).join("");return`<svg viewBox="0 0 ${l} ${x}" class="ac-chart ac-chart--bars" role="img" aria-label="${c(r)}">
		${$}${L}
	</svg>`}function La({rows:e=[],series:a=[],label:t=s=>s.label,ariaLabel:n="Comparison by group"}){let s=(Array.isArray(e)?e:[]).filter(Boolean);if(!s.length||!a.length)return"";let o=680,f=150,r=24,d=8,l=9,u=3,i=a.length*(l+u)+22,h=s.length*i+d+6,g=Math.max(1,...s.flatMap(p=>a.map(b=>Number(p[b.key])||0))),m=o-f-r,x=s.map((p,b)=>{let _=d+b*i,S=a.map(($,L)=>{let P=Number(p[$.key])||0,W=_+18+L*(l+u),J=P>0?Math.max(2,P/g*m):0;return`<g>
						<title>${c(t(p))} \xB7 ${c($.label)}: ${P}</title>
						<rect x="${f}" y="${W}" width="${m}" height="${l}" rx="2" class="ac-chart__track"/>
						<rect x="${f}" y="${W}" width="${J}" height="${l}" rx="2" fill="${Ae($.tone)}" opacity="0.9"/>
						<text x="${f+J+6}" y="${W+l-1}" class="ac-chart__value ac-chart__value--inline">${P}</text>
					</g>`}).join("");return`<g>
				<text x="${f-10}" y="${_+26}" text-anchor="end" class="ac-chart__label">${c(Ea(t(p),24))}</text>
				${S}
			</g>`}).join("");return`<svg viewBox="0 0 ${o} ${h}" class="ac-chart ac-chart--grouped" role="img" aria-label="${c(n)}">
		${x}
	</svg>`}function pe({points:e=[],series:a=[],labelKey:t="label",ariaLabel:n="Activity over time",height:s=220}){let o=Array.isArray(e)?e:[];if(!o.length||!a.length)return"";let f=680,r=38,d=14,l=16,u=34,i=Math.max(1,...o.flatMap(b=>a.map(_=>Number(b[_.key])||0))),h=(f-r-d)/o.length,g=Math.min(26,Math.max(5,h*.7/a.length)),m=b=>l+(1-qa(b,0,i)/i)*(s-l-u),x=Math.max(1,Math.ceil(o.length/7)),p=o.map((b,_)=>{let S=r+_*h+h/2,$=a.length*(g+2),L=S-$/2,P=a.map((J,be)=>{let ke=Number(b[J.key])||0,oe=s-u-m(ke);return`<rect x="${L+be*(g+2)}" y="${m(ke)}" width="${g}" height="${Math.max(0,oe)}" rx="2" fill="${Ae(J.tone)}" opacity="0.9"><title>${c(b[t])} \xB7 ${c(J.label)}: ${ke}</title></rect>`}).join(""),W=_%x===0?`<text x="${S}" y="${s-10}" text-anchor="middle" class="ac-chart__axis">${c(b[t])}</text>`:"";return`${P}${W}`}).join("");return`<svg viewBox="0 0 ${f} ${s}" class="ac-chart ac-chart--columns" role="img" aria-label="${c(n)}">
		<line x1="${r}" y1="${s-u}" x2="${f-d}" y2="${s-u}" class="ac-chart__grid"/>
		${p}
	</svg>`}var X={overview:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',organizations:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6"/><path d="M9 11h.01M15 11h.01"/></svg>',users:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',analytics:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></svg>',audit:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h4"/></svg>',health:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',settings:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',search:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',menu:'<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',sun:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',moon:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',external:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',logo:'<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5-10-5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>'};var za="quizConsoleTheme";function es(e){let t=String(e||"?").trim().split(/\s+/).filter(Boolean);return t.length?t.length===1?t[0].slice(0,2).toUpperCase():`${t[0][0]}${t[t.length-1][0]}`.toUpperCase():"?"}function Ke(e){let a=document.documentElement,t=e||localStorage.getItem(za)||(window.matchMedia?.("(prefers-color-scheme: dark)").matches?"dark":"light");return a.setAttribute("data-console-theme",t),localStorage.setItem(za,t),t}function as(){let e=document.documentElement.getAttribute("data-console-theme")==="dark"?"light":"dark";return Ke(e),e}function Ca(e,{session:a,navItems:t,canAny:n,onNavigate:s}){let o=a.user,f=!!a.scope?.isPlatform,r=a.scope?.organization,l=!!(a.deployment||{}).isOffline,u=l?"Local installation":f?"Platform scope":r?.name?r.name:"Organization scope",i=t.filter(g=>{if(!g.permission)return!0;let m=Array.isArray(g.permission)?g.permission:[g.permission];return n(m)});e.innerHTML=`
		<aside class="ac-sidebar" id="ac-sidebar">
			<div class="ac-sidebar__brand">
				<div class="ac-sidebar__logo" aria-hidden="true">${X.logo}</div>
				<div class="ac-sidebar__titles">
					<p class="ac-sidebar__title">Control Center</p>
					<p class="ac-sidebar__subtitle">${c(l?"This installation":f?"All organizations":r?.name||"Organization")}</p>
				</div>
			</div>
			<nav class="ac-nav" aria-label="Console sections">
				${i.map(g=>`
					<button type="button" class="ac-nav__item" data-ac-nav="${c(g.id)}" data-ac-path="${c(g.path)}">
						${X[g.icon]||X.overview}
						<span class="ac-nav__label">${c(g.title)}</span>
					</button>`).join("")}
			</nav>
			<div class="ac-sidebar__footer">
				<div class="ac-user">
					<div class="ac-user__avatar" aria-hidden="true">${c(es(o.name))}</div>
					<div class="ac-user__meta">
						<p class="ac-user__name">${c(o.name||o.username)}</p>
						<p class="ac-user__role">${c(o.roleLabel||o.role)}</p>
					</div>
				</div>
			</div>
		</aside>

		<div class="ac-main">
			<header class="ac-header">
				<button type="button" class="ac-btn ac-btn--ghost ac-btn--icon ac-header__toggle" data-ac-menu aria-label="Toggle navigation">
					${X.menu}
				</button>
				<div class="ac-header__titles">
					<h1 class="ac-header__title" id="ac-page-title">Overview</h1>
					<p class="ac-header__description" id="ac-page-description"></p>
				</div>
				<div class="ac-header__actions">
					<span class="ac-scope${f&&!l?" ac-scope--platform":""}" title="The slice of the platform this session can reach">
						<span class="ac-scope__dot"></span>${c(u)}
					</span>
					<div class="ac-search">
						${X.search}
						<input type="search" id="ac-global-search" placeholder="Search\u2026" aria-label="Search the console" autocomplete="off" />
						<div class="ac-search__panel" id="ac-search-panel" hidden></div>
					</div>
					<button type="button" class="ac-btn ac-btn--ghost ac-btn--icon" data-ac-theme aria-label="Toggle colour theme">
						${X.sun}
					</button>
					<a class="ac-btn ac-btn--ghost" href="/admin.html" title="Open the classroom administration surface">
						${X.external}<span>Classroom</span>
					</a>
				</div>
			</header>
			<main class="ac-content" id="ac-content" tabindex="-1"></main>
		</div>`,e.hidden=!1;let h=e.querySelector("#ac-sidebar");return e.querySelector("[data-ac-menu]")?.addEventListener("click",()=>{h.classList.toggle("is-open")}),e.querySelector("[data-ac-theme]")?.addEventListener("click",g=>{let m=as();g.currentTarget.innerHTML=m==="dark"?X.moon:X.sun}),e.querySelectorAll("[data-ac-nav]").forEach(g=>{g.addEventListener("click",()=>{h.classList.remove("is-open"),s(g.dataset.acPath)})}),{content:e.querySelector("#ac-content"),title:e.querySelector("#ac-page-title"),description:e.querySelector("#ac-page-description"),setActive(g){let m=Array.from(e.querySelectorAll("[data-ac-nav]")),x=!1;m.forEach(p=>{let b=p.dataset.acPath,_=b===g||b!=="/"&&g.startsWith(b);_&&(x=!0),p.classList.toggle("is-active",_)}),x||m.forEach(p=>{p.dataset.acPath==="/"&&p.classList.add("is-active")})}}}function Pa(e,a=[]){let t=[];for(let n of e)n.id==="not-found"||n.id==="forbidden"||t.push({kind:"page",title:n.title,sub:n.description||"",path:n.path==="/"?"/":n.path,keywords:`${n.title} ${n.description||""}`.toLowerCase()});for(let n of a)t.push({kind:"settings",title:n.label,sub:"Settings",path:`/settings?section=${encodeURIComponent(n.id)}`,keywords:`settings ${n.label}`.toLowerCase()});return t}function ts(e,a){let t=a.keywords,n=a.title.toLowerCase();if(!e)return 0;if(n.startsWith(e))return 100-n.length*.01;let s=n.indexOf(e);if(s!==-1)return 60-s;if(t.includes(e))return 30;let o=e.split(/\s+/).filter(Boolean);return o.length>1&&o.every(f=>t.includes(f))?20:0}async function Ma(e,{places:a,canUsers:t=!1,canOrganizations:n=!1}={}){let s=String(e||"").trim().toLowerCase();if(!s)return[];let o=a.map(u=>({place:u,value:ts(s,u)})).filter(u=>u.value>0).sort((u,i)=>i.value-u.value).slice(0,6).map(({place:u})=>({...u,badge:"Page"})),[f,r]=await Promise.all([t?k.get(`console/users?search=${encodeURIComponent(e.trim())}&limit=4`).catch(()=>null):Promise.resolve(null),n?k.get(`console/organizations?search=${encodeURIComponent(e.trim())}&limit=4`).catch(()=>null):Promise.resolve(null)]),d=(f?.data||[]).slice(0,4).map(u=>({kind:"user",title:u.name||u.username,sub:u.username&&u.name?u.username:u.roleLabel||"",path:`/users/${u.id}`,badge:u.roleLabel||"Account"})),l=(r?.data||[]).slice(0,4).map(u=>({kind:"organization",title:u.name,sub:u.status==="suspended"?"suspended":"",path:`/organizations/${u.id}`,badge:"Organization"}));return[...o,...d,...l]}function E({columns:e,rows:a,empty:t="Nothing to show for the current filters.",sort:n=null,onSort:s=null,rowHref:o=null,rowClass:f=null}){if(!a||a.length===0)return`<div class="ac-empty">
			<div class="ac-empty__icon" aria-hidden="true">
				<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
			</div>
			<p class="ac-empty__title">No data</p>
			<p class="ac-empty__message">${c(t)}</p>
		</div>`;let r=e.map(l=>{let u=l.align==="right"?" is-numeric":"",i=l.sortable&&s?" is-sortable":"",h=n&&n.key===l.key,g=h?n.direction==="asc"?"\u25B2":"\u25BC":"";return`<th class="${u}${i}"${i?` data-ac-sort="${c(l.key)}"`:""}${h?` aria-sort="${n.direction==="asc"?"ascending":"descending"}"`:""}>
				${c(l.label)}${g?`<span class="ac-sort">${g}</span>`:""}
			</th>`}).join(""),d=a.map((l,u)=>{let i=o?o(l):null,h=f?f(l):"",g=e.map(m=>{let x=m.align==="right"?" is-numeric":"",p=m.render?m.render(l):c(l[m.key]??"\u2014");return`<td class="${x}${m.className?` ${m.className}`:""}" data-label="${c(m.label)}">${p}</td>`}).join("");return`<tr${i?` data-ac-href="${c(i)}"`:""} class="${c(h)}" data-ac-row="${u}">${g}</tr>`}).join("");return`<div class="ac-table-wrap"><table class="ac-table">
		<thead><tr>${r}</tr></thead>
		<tbody>${d}</tbody>
	</table></div>`}function ue({total:e,limit:a,offset:t,onPage:n}){let s=Math.max(1,Number(a)||50),o=Math.max(0,Number(t)||0),f=Math.floor(o/s)+1,r=Math.max(1,Math.ceil((Number(e)||0)/s)),d=e===0?0:o+1,l=Math.min(o+s,Number(e)||0),u=(i,h,g,m="")=>`<button type="button" class="ac-btn ac-btn--sm" data-ac-page="${h}"${g?" disabled":""}${m}>${i}</button>`;return`<div class="ac-pagination">
		<span>Showing ${d}\u2013${l} of ${(Number(e)||0).toLocaleString()}</span>
		<div class="ac-pagination__pages">
			${u("\xAB",0,o===0)}
			${u("\u2039",Math.max(0,o-s),o===0)}
			<span style="padding:0 6px">Page ${f} of ${r}</span>
			${u("\u203A",o+s,o+s>=(Number(e)||0))}
			${u("\xBB",Math.max(0,(r-1)*s),o+s>=(Number(e)||0))}
		</div>
	</div>`}function R(e=3){return`<div class="ac-skeleton-stack" aria-busy="true">
		${Array.from({length:e}).map((a,t)=>`<div class="ac-skeleton" style="width:${100-t*12}%"></div>`).join("")}
	</div>`}function I({title:e="No data",message:a="There is nothing to report for the current filters and period.",action:t=""}={}){return`<div class="ac-empty">
		<div class="ac-empty__icon" aria-hidden="true">
			<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h18M3 12h18M3 17h10"/></svg>
		</div>
		<p class="ac-empty__title">${c(e)}</p>
		<p class="ac-empty__message">${c(a)}</p>
		${t}
	</div>`}function N({title:e="This section could not be loaded",message:a="An unexpected error occurred. The rest of the console is unaffected.",retry:t=!0}={}){return`<div class="ac-error" role="alert">
		<div>
			<p class="ac-error__title">${c(e)}</p>
			<p class="ac-error__message">${c(a)}</p>
		</div>
		${t?'<button type="button" class="ac-btn ac-btn--sm" data-ac-retry>Retry</button>':""}
	</div>`}var ss=Object.freeze([{key:"7d",label:"7 days"},{key:"30d",label:"30 days"},{key:"90d",label:"90 days"},{key:"year",label:"Academic year"},{key:"custom",label:"Custom"}]);function ns({options:e,value:a,name:t,onSelect:n=null}){return`<div class="ac-chip-group" role="group" aria-label="Period">${e.map(s=>`<button type="button" class="ac-chip${s.key===a?" is-active":""}" data-ac-chip="${t}" data-ac-value="${c(s.key)}" aria-pressed="${s.key===a}">${c(s.label)}</button>`).join("")}</div>`}function qe(e,a,t){e.querySelectorAll(`[data-ac-chip="${a}"]`).forEach(n=>{n.addEventListener("click",()=>t(n.dataset.acValue))})}function Ee({id:e="ac-search",placeholder:a="Search\u2026",value:t=""}){return`<div class="ac-field">
		<label class="ac-field__label" for="${c(e)}">Search</label>
		<input class="ac-input" id="${c(e)}" type="search" placeholder="${c(a)}" value="${c(t)}" autocomplete="off" />
	</div>`}function he({id:e,label:a,options:t=[],value:n="",allLabel:s=null,includeAll:o=!1}){return`<div class="ac-field">
		<label class="ac-field__label" for="${c(e)}">${c(a)}</label>
		<select class="ac-select" id="${c(e)}" data-ac-select="${c(e)}">
			${o?`<option value=""${n?"":" selected"}>${c(s||"All")}</option>`:""}
			${t.map(f=>`<option value="${c(f.value)}"${String(f.value)===String(n)?" selected":""}>${c(f.label)}</option>`).join("")}
		</select>
	</div>`}function U({chips:e="",fields:a="",filters:t="",actions:n=""}={}){let s=a||t;return e?`<div class="ac-toolbar">
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
			</div></div>`}function Le({value:e,customFrom:a="",customTo:t=""}){let n=e==="custom"?`<div class="ac-field">
					<label class="ac-field__label" for="ac-period-from">From</label>
					<input class="ac-input" id="ac-period-from" type="date" value="${c(a)}" />
				</div>
				<div class="ac-field">
					<label class="ac-field__label" for="ac-period-to">To</label>
					<input class="ac-input" id="ac-period-to" type="date" value="${c(t)}" />
				</div>`:"";return U({chips:ns({options:ss,value:e,name:"period"}),fields:n})}var re=null;function rs(){return re||(re=document.createElement("div"),re.className="ac-toasts",re.setAttribute("role","status"),re.setAttribute("aria-live","polite"),document.body.appendChild(re)),re}function y(e,a="info",t=4200){let n=rs(),s=document.createElement("div");return s.className=`ac-toast ac-toast--${a}`,s.innerHTML=`<span class="ac-toast__text">${c(e)}</span>`,n.appendChild(s),window.setTimeout(()=>{s.style.opacity="0",s.style.transition="opacity .18s ease",window.setTimeout(()=>s.remove(),200)},t),s}var ze=0;function j({title:e,subtitle:a="",body:t,footer:n="",wide:s=!1,onMount:o=null}){let f=document.createElement("div");f.className="ac-modal-backdrop",f.setAttribute("role","dialog"),f.setAttribute("aria-modal","true"),f.setAttribute("aria-label",e),f.innerHTML=`
		<div class="ac-modal${s?" ac-modal--wide":""}">
			<div class="ac-modal__header">
				<div>
					<h2 class="ac-modal__title">${c(e)}</h2>
					${a?`<p class="ac-modal__subtitle">${c(a)}</p>`:""}
				</div>
				<button type="button" class="ac-close" data-ac-close aria-label="Close">&times;</button>
			</div>
			<div class="ac-modal__body" data-ac-modal-body></div>
			${n?'<div class="ac-modal__footer" data-ac-modal-footer></div>':""}
		</div>`;let r=f.querySelector("[data-ac-modal-body]");typeof t=="string"?r.innerHTML=t:t&&r.appendChild(t);let d=f.querySelector("[data-ac-modal-footer]");d&&(typeof n=="string"?d.innerHTML=n:n&&d.appendChild(n));function l(){f.remove(),ze=Math.max(0,ze-1),ze===0&&document.body.style.removeProperty("overflow"),document.removeEventListener("keydown",u)}function u(h){h.key==="Escape"&&l()}f.addEventListener("click",h=>{h.target===f&&l()}),f.querySelectorAll("[data-ac-close]").forEach(h=>h.addEventListener("click",l)),document.addEventListener("keydown",u),document.body.appendChild(f),ze+=1,document.body.style.overflow="hidden";let i=f.querySelector("input, select, textarea, button:not([data-ac-close])");return i&&i.focus(),o&&o(f),{close:l,root:f}}function M({title:e,message:a,detail:t="",confirmLabel:n="Confirm",danger:s=!1}){return new Promise(o=>{let f=j({title:e,body:`
				<p style="margin:0 0 10px;font-size:13.5px;line-height:1.55">${c(a)}</p>
				${t?`<div class="ac-alert ac-alert--${s?"danger":"info"}"><div class="ac-alert__body"><p class="ac-alert__text">${c(t)}</p></div></div>`:""}
			`,footer:`
				<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
				<button type="button" class="ac-btn ${s?"ac-btn--danger":"ac-btn--primary"}" data-ac-confirm>${c(n)}</button>
			`});f.root.querySelector("[data-ac-cancel]").addEventListener("click",()=>{f.close(),o(!1)}),f.root.querySelector("[data-ac-confirm]").addEventListener("click",()=>{f.close(),o(!0)}),f.root.addEventListener("click",r=>{r.target===f.root&&o(!1)})})}function w(e,a="\u2014"){if(e==null||e==="")return a;let t=Number(e);return Number.isFinite(t)?t.toLocaleString():a}function C(e,{withTime:a=!0}={}){if(!e)return"\u2014";let t=e instanceof Date?e:new Date(e);return Number.isNaN(t.getTime())?"\u2014":t.toLocaleString(void 0,{year:"numeric",month:"short",day:"2-digit",...a?{hour:"2-digit",minute:"2-digit"}:{}})}function O(e){if(!e)return"never";let a=e instanceof Date?e:new Date(e);if(Number.isNaN(a.getTime()))return"never";let t=Math.round((Date.now()-a.getTime())/1e3),n=[["year",31536e3],["month",2592e3],["day",86400],["hour",3600],["minute",60]];for(let[s,o]of n)if(Math.abs(t)>=o){let f=Math.round(t/o);return`${f} ${s}${f===1?"":"s"} ago`}return"just now"}var ee={control:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',access:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>',credentials:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',maintenance:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9l-3.7 3.8z"/></svg>',activity:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',analytics:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></svg>',documents:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',notes:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',planning:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>'},Qe={id:"overview",path:"/",title:"Overview",description:"Control, access, activity, documents and planning \u2014 the administrator's working view.",permission:["platform.console","school.console"],async render(e,a){let t=a.getState();e.innerHTML=`<div class="ac-stack" data-ac-overview>
			${Le({value:t.period})}
			<div data-ac-kpis class="ac-grid ac-grid--kpi">${R(1)}</div>
			<div data-ac-alerts class="ac-stack"></div>
			<div class="ac-workbench" data-ac-workbench></div>
			<div data-ac-trends class="ac-grid ac-grid--2"></div>
			<div data-ac-detail class="ac-grid ac-grid--3" style="margin-top:16px"></div>
		</div>`;let n={period:t.period==="year"?"year":t.period};t.period==="custom"&&t.customRange&&(n.from=t.customRange.from,n.to=t.customRange.to);let s,o,f;try{[s,o,f]=await Promise.all([k.get("console/overview",n),k.get("console/trends",n),k.get("console/workbench")])}catch(p){e.innerHTML=N({title:"The overview could not be loaded",message:p.message});return}let r=s.data,d=r.sections.glance,l=r.sections.activity,u=r.sections.operations,i=r.sections.content,h=r.meta.definitions,g=f.data.sections;e.querySelector("[data-ac-kpis]").innerHTML=[T({label:a.isPlatform?a.isOffline?"Organizations here":"Organizations":"Organization",value:a.isPlatform?w(d.organizations.total):a.organization?.name||"\u2014",note:a.isPlatform?`${d.organizations.active} active \xB7 ${d.organizations.pending} pending`:`Plan ${a.organization?.plan||"\u2014"}`,tone:"primary",tooltip:"The tenants of this installation.",href:a.isPlatform?"#/organizations":null}),T({label:"Accounts",value:w(d.users.teachers+d.users.students+d.users.administrators),note:`${w(d.users.teachers)} teachers \xB7 ${w(d.users.students)} students`,tooltip:"Every account in the current scope.",href:"#/users"}),T({label:"Live sessions",value:w(g.maintenance.liveSessions),note:"refresh tokens still valid",tooltip:"Accounts with a refresh token that has not expired or been revoked. An administrator can revoke them from the account page."}),T({label:"Availability",value:u.availabilityPercent==null?"\u2014":`${u.availabilityPercent.toFixed(1)}%`,note:"last 60 minutes",tone:u.availabilityPercent==null?"":u.availabilityPercent>=99?"success":"warning",tooltip:u.note,href:"#/health"}),T({label:"Failed sign-ins",value:w(u.failedAuthentications),note:r.meta.scope.periodLabel,tone:u.failedAuthentications>0?"warning":"",tooltip:"Failed authentication attempts recorded in the durable security trail.",href:"#/audit?stream=security"}),T({label:"Waiting for access",value:w(g.access.pendingAccountRequests+g.access.pendingProfileRequests),note:`${w(g.access.pendingAccountRequests)} requests \xB7 ${w(g.access.pendingProfileRequests)} profile changes`,tone:g.access.pendingAccountRequests+g.access.pendingProfileRequests>0?"warning":"",tooltip:"Account requests and profile change requests that are waiting for a decision."})].join(""),e.querySelector("[data-ac-alerts]").innerHTML=os({glance:d,operations:u,activity:l,access:g.access,maintenance:g.maintenance}),e.querySelector("[data-ac-workbench]").innerHTML=[ae({icon:ee.access,title:"Access to grant",subtitle:"What is waiting for an administrator.",body:`
					<div class="ac-workbench__list">
						${_e({title:"Account requests",sub:"New students waiting to be created",value:g.access.pendingAccountRequests,href:"#/users/students?status=pending"})}
						${_e({title:"Profile change requests",sub:"Students asking for a correction",value:g.access.pendingProfileRequests,href:"#/audit"})}
						${_e({title:"Suspended accounts",sub:"No access until restored",value:g.access.suspendedAccounts,href:"#/users?status=suspended"})}
						${_e({title:"Permission overrides",sub:"Individual grants and denies",value:g.access.permissionOverrides,href:"#/settings?section=roles"})}
						${_e({title:"Teachers without a class",sub:"They can author, but reach nobody",value:g.access.teachersWithoutClasses.length,href:"#/users/teachers"})}
					</div>`}),ae({icon:ee.credentials,title:"Credentials to check",subtitle:"Accounts that were provisioned but never used.",body:g.access.unusedCredentials.length?`<div class="ac-workbench__list">${g.access.unusedCredentials.map(p=>`
						<a class="ac-workbench__row" href="#/users/${p.id}" style="text-decoration:none;color:inherit">
							<div class="ac-workbench__row-main">
								<p class="ac-workbench__row-title">${c(p.name||p.username)}</p>
								<p class="ac-workbench__row-sub">${c(p.role)} \xB7 ${p.last_login?`last seen ${c(O(p.last_login))}`:"never signed in"}</p>
							</div>
							<span class="ac-workbench__row-value">${c(p.status)}</span>
						</a>`).join("")}</div>`:I({title:"Every account has been used",message:"No account in scope is waiting for its first sign-in."})}),ae({icon:ee.maintenance,title:"Maintenance & recent actions",subtitle:"The last administrative operations.",body:g.maintenance.recentAudit.length?`<div class="ac-workbench__list">${g.maintenance.recentAudit.map(p=>`
						<div class="ac-workbench__row">
							<div class="ac-workbench__row-main">
								<p class="ac-workbench__row-title">${c(p.action)}</p>
								<p class="ac-workbench__row-sub">${c(p.actorName||"system")} \xB7 ${c(p.entityType)} \xB7 ${c(O(p.occurredAt))}</p>
							</div>
							<span class="ac-badge ac-badge--${p.severity==="critical"?"danger":p.severity==="warning"?"warning":"success"}">${c(p.severity)}</span>
						</div>`).join("")}</div>`:I({title:"No administrative action recorded yet",message:"Actions appear here as soon as an administrator changes something."})}),ae({icon:ee.activity,title:"Teacher activity",subtitle:"Are the teachers working?",body:`<p class="ac-empty__message" style="margin:0 0 12px;font-size:12px">${c(h.activeTeacher)}</p>
				<div class="ac-defs">
					<div class="ac-defs__item">
						<p class="ac-defs__term">Active</p>
						<p class="ac-defs__desc">${w(d.users.activeTeachers)} of ${w(d.users.teachers)}</p>
					</div>
					<div class="ac-defs__term" style="margin-top:10px"><p class="ac-defs__term">Exams authored</p></div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">&nbsp;</p>
						<p class="ac-defs__desc">${w(i.exams)}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Questions</p>
						<p class="ac-defs__desc">${w(i.questions)}</p>
					</div>
				</div>`}),ae({icon:ee.activity,title:"Student participation",subtitle:"Are the students taking part?",body:`<p class="ac-empty__message" style="margin:0 0 12px;font-size:12px">${c(h.activeStudent)}</p>
				<div class="ac-defs">
					<div class="ac-defs__item">
						<p class="ac-defs__term">Active</p>
						<p class="ac-defs__desc">${w(d.users.activeStudents)} of ${w(d.users.students)}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Attempts</p>
						<p class="ac-defs__desc">${w(l.attempts)}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Participating</p>
						<p class="ac-defs__desc">${w(l.participatingStudents)}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Average score</p>
						<p class="ac-defs__desc">${l.averageScore20==null?"\u2014":`${l.averageScore20.toFixed(2)} /20`}</p>
					</div>
				</div>`}),ae({icon:ee.analytics,title:"Assessment activity",subtitle:"What the platform is being used for.",body:`<div class="ac-defs">
					<div class="ac-defs__item">
						<p class="ac-defs__term">Exams conducted</p>
						<p class="ac-defs__desc">${w(l.examsConducted)}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Formal attempts</p>
						<p class="ac-defs__desc">${w(l.formalAttempts)}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Courses</p>
						<p class="ac-defs__desc">${w(i.courses)}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Game sessions</p>
						<p class="ac-defs__desc">${w(l.gameSessions+l.kidsGameSessions)}</p>
					</div>
				</div>`})].join("");let m=e.querySelector("[data-ac-trends]");if(o){let p=o.data.series,b=p.labels.map(($,L)=>({label:$,formalAttempts:p.formalAttempts[L]||0,trainingAttempts:p.trainingAttempts[L]||0,gameAttempts:p.gameAttempts[L]||0,newTeachers:p.newTeachers[L]||0,newStudents:p.newStudents[L]||0})),_=[{key:"formalAttempts",label:"Formal exams",tone:"primary"},{key:"trainingAttempts",label:"Training",tone:"info"},{key:"gameAttempts",label:"Games",tone:"violet"}],S=[{key:"newTeachers",label:"Teachers",tone:"success"},{key:"newStudents",label:"Students",tone:"warning"}];m.innerHTML=`
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles">
							<h3 class="ac-panel__title">Educational activity</h3>
							<p class="ac-panel__subtitle">Completed attempts by mode. ${o.data.meta.granularity==="week"?"Weekly":"Daily"} buckets over ${c(o.data.meta.periodLabel)}.</p>
						</div>
					</div>
					<div class="ac-panel__body">
						${de(_)}
						${pe({points:b,series:_,labelKey:"label",ariaLabel:"Completed attempts over time by mode"})}
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
						${de(S)}
						${pe({points:b,series:S,labelKey:"label",ariaLabel:"New accounts over time"})}
					</div>
				</section>`}e.querySelector("[data-ac-detail]").innerHTML=[ae({icon:ee.documents,title:"Documents",subtitle:"What has been produced.",flush:!0,body:g.documents.recent.length?`<div class="ac-workbench__list">${g.documents.recent.map(p=>`
					<div class="ac-workbench__row">
						<div class="ac-workbench__row-main">
							<p class="ac-workbench__row-title">${c(p.title||p.fileName)}</p>
							<p class="ac-workbench__row-sub">${c(p.kind)} \xB7 ${c(p.format||"").toUpperCase()} \xB7 ${c(O(p.createdAt))}</p>
						</div>
						<span class="ac-workbench__row-value">${Na(p.sizeBytes)}</span>
					</div>`).join("")}</div>`:I({title:"No documents yet",message:"Course booklets, preparation sheets and exam papers appear here."})}),ae({icon:ee.notes,title:"Notes to teachers",subtitle:"What has been said, and a way to say more.",actions:'<button type="button" class="ac-btn ac-btn--sm" data-ac-compose-note>Write a note</button>',flush:!0,body:g.notes.recent.length?`<div class="ac-workbench__list">${g.notes.recent.map(p=>`
					<div class="ac-workbench__row">
						<div class="ac-workbench__row-main">
							<p class="ac-workbench__row-title">${c(p.title)}</p>
							<p class="ac-workbench__row-sub">${c(p.teacherName||"An administrator")}${p.className?` \xB7 ${c(p.className)}`:""} \xB7 ${c(O(p.date))}</p>
						</div>
					</div>`).join("")}</div>`:I({title:"No note sent yet",message:"A note reaches a teacher and their class."})}),ae({icon:ee.planning,title:"Planning",subtitle:"What is coming up.",flush:!0,body:`
					<div class="ac-workbench__list">
						${g.planning.upcomingAssignments.length?g.planning.upcomingAssignments.map(p=>`
							<div class="ac-workbench__row">
								<div class="ac-workbench__row-main">
									<p class="ac-workbench__row-title">${c(p.title)}</p>
									<p class="ac-workbench__row-sub">Due ${c(C(p.dueDate,{withTime:!1}))}</p>
								</div>
								<span class="ac-workbench__row-value">${p.dueDate&&new Date(p.dueDate)<new Date?'<span class="ac-badge ac-badge--danger">overdue</span>':'<span class="ac-badge">scheduled</span>'}</span>
							</div>`).join(""):""}
						${g.planning.recentExams.length?g.planning.recentExams.map(p=>`
							<div class="ac-workbench__row">
								<div class="ac-workbench__row-main">
									<p class="ac-workbench__row-title">${c(p.name)}</p>
									<p class="ac-workbench__row-sub">${p.isTraining?"Training":"Formal exam"} \xB7 created ${c(O(p.createdAt))}</p>
								</div>
								<span class="ac-badge ac-badge--${p.status==="active"?"success":""}">${c(p.status)}</span>
							</div>`).join(""):""}
						${g.planning.archives.length?g.planning.archives.map(p=>`
							<div class="ac-workbench__row">
								<div class="ac-workbench__row-main">
									<p class="ac-workbench__row-title">${c(p.label||`Archive ${p.year}`)}</p>
									<p class="ac-workbench__row-sub">School year ${c(p.year)}</p>
								</div>
								<span class="ac-workbench__row-value">${Na(p.sizeBytes)}</span>
							</div>`).join(""):""}
					</div>
					${!g.planning.upcomingAssignments.length&&!g.planning.recentExams.length&&!g.planning.archives.length?I({title:"Nothing planned yet",message:"Exams, assignments and year archives appear here."}):""}`})].join("");let x=e.querySelector("[data-ac-compose-note]");x&&x.addEventListener("click",async()=>{let p=[];try{p=(await k.get("console/users?role=teacher&limit=200"))?.data||[]}catch{p=[]}if(!p.length){y("No teacher account is available to write to.","error");return}let b=j({title:"Write a note to a teacher",subtitle:"The note reaches the teacher and, when a class is chosen, that class.",body:`<div class="ac-field">
							<label class="ac-field__label" for="ac-note-teacher">Teacher</label>
							<select class="ac-select ac-input--full" id="ac-note-teacher">
								${p.map(_=>`<option value="${c(_.id)}">${c(_.name||_.username)}</option>`).join("")}
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
					`});b.root.querySelector("[data-ac-cancel]").addEventListener("click",b.close),b.root.querySelector("[data-ac-confirm]").addEventListener("click",async()=>{let _=b.root.querySelector("#ac-note-teacher").value,S=b.root.querySelector("#ac-note-title").value.trim(),$=b.root.querySelector("#ac-note-body").value.trim();if(!S||!$){y("A title and a message are required.","error");return}try{await k.post("console/notes",{teacherId:_,title:S,body:$}),b.close(),y("Note sent.","success"),a.rerender()}catch(L){y(L.message,"error")}})}),qe(e,"period",p=>{if(p==="custom"){let b=prompt("From (YYYY-MM-DD)",new Date(Date.now()-2592e6).toISOString().slice(0,10));if(!b)return;let _=prompt("To (YYYY-MM-DD)",new Date().toISOString().slice(0,10));if(!_)return;a.setPeriod("custom",{from:b,to:_});return}a.setPeriod(p)})}};function ae({icon:e,title:a,subtitle:t,body:n,actions:s="",flush:o=!1}){return`<section class="ac-workbench__panel">
		<div class="ac-workbench__head">
			<div>
				<h3 class="ac-workbench__title">${e||""}${c(a)}</h3>
				${t?`<p class="ac-workbench__subtitle">${c(t)}</p>`:""}
			</div>
			${s?`<div class="ac-panel__actions">${s}</div>`:""}
		</div>
		<div class="ac-workbench__body${o?" ac-workbench__body--flush":""}">${n}</div>
	</section>`}function _e({title:e,sub:a,value:t,href:n}){let s=n?"a":"div",o=n?` href="${c(n)}" style="text-decoration:none;color:inherit"`:"";return`<${s} class="ac-workbench__row"${o}>
		<div class="ac-workbench__row-main">
			<p class="ac-workbench__row-title">${c(e)}</p>
			<p class="ac-workbench__row-sub">${c(a)}</p>
		</div>
		<span class="ac-workbench__row-value">${w(t)}</span>
	</${s}>`}function Na(e){let a=Number(e);return!Number.isFinite(a)||a<=0?"\u2014":a<1024?`${a} B`:a<1024*1024?`${Math.round(a/1024)} KB`:`${Math.round(a/1024/1024*10)/10} MB`}function os({glance:e,operations:a,activity:t,access:n,maintenance:s}){let o=[];if(n.pendingAccountRequests>0&&o.push({kind:"warning",title:`${n.pendingAccountRequests} account request(s) waiting for a decision`,text:"A student or a teacher cannot sign in until an administrator approves the request.",action:{label:"Review accounts",href:"#/users/students"}}),n.pendingProfileRequests>0&&o.push({kind:"info",title:`${n.pendingProfileRequests} profile change request(s) waiting`,text:"A student is asking for a correction to their record.",action:{label:"Review the trail",href:"#/audit"}}),n.teachersWithoutClasses.length>0&&o.push({kind:"warning",title:`${n.teachersWithoutClasses.length} teacher(s) manage no class`,text:"They can author content but reach no student. Assign them a class, or deactivate the account.",action:{label:"Open teachers",href:"#/users/teachers"}}),a.failedAuthentications>0&&o.push({kind:"warning",title:`${a.failedAuthentications} failed sign-in attempt(s) in this period`,text:"Grouped by source address and attempted username on the Audit page \u2014 a concentration may indicate credential stuffing.",action:{label:"Inspect security events",href:"#/audit?stream=security"}}),a.serverErrorRatePercent!=null&&a.serverErrorRatePercent>=1&&o.push({kind:"danger",title:`Server error rate at ${a.serverErrorRatePercent}%`,text:"More than one request in a hundred failed with a server error in the last hour.",action:{label:"Open system health",href:"#/health"}}),t.attemptsPrevious!=null&&t.attempts>0&&t.attemptsPrevious>0){let f=Math.round((t.attempts-t.attemptsPrevious)/t.attemptsPrevious*1e3)/10;f<=-30&&o.push({kind:"warning",title:`Attempts fell ${Math.abs(f)}% versus the previous period`,text:"A sharp drop usually means an organization stopped using the platform, or a term boundary was crossed.",action:{label:"Compare organizations",href:"#/analytics"}})}return o.length?`<div class="ac-alert-list">${o.map(f=>`
		<div class="ac-alert-item">
			<div class="ac-alert-item__body">
				<p class="ac-alert-item__title">${c(f.title)}</p>
				<p class="ac-alert-item__text">${c(f.text)}</p>
			</div>
			<div class="ac-alert-item__action">
				<a class="ac-btn ac-btn--sm" href="${c(f.action.href)}">${c(f.action.label)}</a>
			</div>
		</div>`).join("")}</div>`:`<div class="ac-alert ac-alert--info">
			<div class="ac-alert__body">
				<p class="ac-alert__title">Nothing needs your attention</p>
				<p class="ac-alert__text">Every monitored threshold is inside its normal range.</p>
			</div>
		</div>`}function Pe(e=[]){return`<div class="ac-row-actions">${e.filter(t=>!t.hidden).map(t=>`<button type="button" class="ac-btn ac-btn--sm${t.tone?` ac-btn--${t.tone}`:""}" data-ac-action="${Ce(t.id)}" data-ac-action-value="${Ce(t.value??"")}" title="${Ce(t.title||t.label)}">${Ce(t.label)}</button>`).join("")}</div>`}function Me(e,a={}){e.addEventListener("click",t=>{let n=t.target.closest("[data-ac-action]");if(!n||!e.contains(n))return;t.preventDefault(),t.stopPropagation();let s=a[n.dataset.acAction];s&&s(n.dataset.acActionValue,n)})}function Ra(e,{canManage:a=!0,canDelete:t=!0}={}){let n=[{id:"open",label:"Open",value:e.id,title:"Open the account"}];return a&&n.push({id:"toggle-status",label:e.status==="active"?"Suspend":"Reactivate",value:e.id,title:e.status==="active"?"End this account's access and keep its record":"Restore this account's access"}),t&&n.push({id:"delete",label:"Delete",value:e.id,tone:"danger",title:"Remove this account permanently"}),n}function Oa(e,{canManage:a=!0}={}){let t=[{id:"open",label:"Open",value:e.id}];return a&&(t.push({id:"toggle-status",label:e.status==="suspended"?"Reactivate":"Suspend",value:e.id,title:e.status==="suspended"?"Restore this organization's access":"Revoke this organization's access"}),t.push({id:"edit",label:"Edit",value:e.id,title:"Edit the organization profile"}),t.push({id:"delete",label:"Delete",value:e.id,tone:"danger",title:"Remove the organization and everything in it"})),t}function Ce(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function q({title:e,subtitle:a="",body:t,actions:n="",flush:s=!1,id:o=""}={}){return`<section class="ac-section-panel"${o?` id="${c(o)}"`:""}>
		<div class="ac-section-panel__head">
			<div>
				<h3 class="ac-section-panel__title">${c(e)}</h3>
				${a?`<p class="ac-section-panel__subtitle">${c(a)}</p>`:""}
			</div>
			${n?`<div class="ac-panel__actions">${n}</div>`:""}
		</div>
		<div class="ac-section-panel__body${s?" ac-section-panel__body--flush":""}">${t}</div>
	</section>`}function A({id:e,label:a,value:t="",type:n="text",hint:s="",full:o=!1,placeholder:f="",disabled:r=!1}={}){return`<div class="ac-field${o?" ac-field--full":""}">
		<label class="ac-field__label" for="${c(e)}">${c(a)}</label>
		<input class="ac-input ac-input--full" id="${c(e)}" type="${c(n)}" value="${c(t??"")}" placeholder="${c(f)}" autocomplete="off" ${r?"disabled":""} />
		${s?`<p class="ac-field__hint">${c(s)}</p>`:""}
	</div>`}function D({id:e,label:a,options:t=[],value:n="",hint:s="",allLabel:o=null}={}){let f=o?`<option value=""${n?"":" selected"}>${c(o)}</option>`:"";return`<div class="ac-field">
		<label class="ac-field__label" for="${c(e)}">${c(a)}</label>
		<select class="ac-select" id="${c(e)}">
			${f}
			${t.map(r=>`<option value="${c(r.value)}"${String(r.value)===String(n)?" selected":""}>${c(r.label)}</option>`).join("")}
		</select>
		${s?`<p class="ac-field__hint">${c(s)}</p>`:""}
	</div>`}function K({id:e,label:a,hint:t="",checked:n=!1,disabled:s=!1}={}){return`<div class="ac-switch-row">
		<div class="ac-switch-row__text">
			<p class="ac-switch-row__label">${c(a)}</p>
			${t?`<p class="ac-switch-row__hint">${c(t)}</p>`:""}
		</div>
		<button
			type="button"
			class="ac-switch"
			id="${c(e)}"
			role="switch"
			aria-checked="${n?"true":"false"}"
			${s?"disabled":""}
		></button>
	</div>`}function Je({id:e,label:a,hint:t="",checked:n=!1}={}){return`<label class="ac-check">
		<input type="checkbox" id="${c(e)}" ${n?"checked":""} />
		<span>
			<span class="ac-check__label">${c(a)}</span>
			${t?`<span class="ac-check__hint">${c(t)}</span>`:""}
		</span>
	</label>`}function v(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}var Ia=[{value:"primaire",label:"Primaire (Primary)"},{value:"college",label:"Coll\xE8ge (Middle School)"},{value:"lycee",label:"Lyc\xE9e (High School)"},{value:"autre",label:"Autre (Other)"}],ja=[{value:"free",label:"Free"},{value:"pro",label:"Pro"},{value:"enterprise",label:"Enterprise"}];function Da({onCreated:e=null}={}){let a=j({title:"Add an organization",subtitle:'The organization is created as "pending": it is provisioned, but it cannot sign in until you activate it.',body:`<div class="ac-field-grid">
				${A({id:"ac-org-new-name",label:"Name",placeholder:"Lyc\xE9e Al Khawarizmi",full:!0})}
				${A({id:"ac-org-new-slug",label:"Slug",placeholder:"derived from the name",hint:"A unique identifier. Leave it blank to derive it from the name.",full:!0})}
				${D({id:"ac-org-new-type",label:"Type",options:Ia,value:"primaire"})}
				${D({id:"ac-org-new-plan",label:"Plan",options:ja,value:"free"})}
				${A({id:"ac-org-new-year",label:"Academic year",placeholder:"2025-2026"})}
				${A({id:"ac-org-new-capacity",label:"Student capacity",type:"number",value:"100",hint:"Recorded for information; no entitlement is derived from it yet."})}
				${A({id:"ac-org-new-city",label:"City"})}
				${A({id:"ac-org-new-email",label:"Email",type:"email"})}
			</div>`,footer:`
			<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
			<button type="button" class="ac-btn ac-btn--primary" data-ac-confirm>Create the organization</button>
		`}),t=a.root;return t.querySelector("[data-ac-cancel]").addEventListener("click",a.close),t.querySelector("[data-ac-confirm]").addEventListener("click",async()=>{let n=o=>t.querySelector(`#${o}`)?.value?.trim()??"",s=n("ac-org-new-name");if(!s){y("The organization needs a name.","error");return}try{let o=await k.post("console/organizations",{name:s,slug:n("ac-org-new-slug")||void 0,school_type:n("ac-org-new-type"),plan:n("ac-org-new-plan"),school_year:n("ac-org-new-year")||void 0,max_students:Number(n("ac-org-new-capacity"))||100,city:n("ac-org-new-city")||void 0,email:n("ac-org-new-email")||void 0});a.close(),y("The organization was created. It is pending until you activate it.","success"),typeof e=="function"&&e(o?.data)}catch(o){y(o.message,"error")}}),a}function Ha(e,{onSaved:a=null}={}){let t=j({title:`Edit "${e.name}"`,subtitle:"The profile of the organization. The slug is its unique identifier and is not changed here.",wide:!0,body:`<div class="ac-field-grid">
				${A({id:"ac-org-edit-name",label:"Name",value:e.name,full:!0})}
				${D({id:"ac-org-edit-type",label:"Type",options:Ia,value:e.schoolType||e.school_type||"primaire"})}
				${D({id:"ac-org-edit-plan",label:"Plan",options:ja,value:e.plan||"free"})}
				${A({id:"ac-org-edit-year",label:"Academic year",value:e.schoolYear||e.school_year||""})}
				${A({id:"ac-org-edit-capacity",label:"Student capacity",type:"number",value:String(e.maxStudents??e.max_students??100)})}
				${A({id:"ac-org-edit-city",label:"City",value:e.city||""})}
				${A({id:"ac-org-edit-phone",label:"Phone",value:e.phone||""})}
				${A({id:"ac-org-edit-email",label:"Email",value:e.email||""})}
				${A({id:"ac-org-edit-address",label:"Address",value:e.address||"",full:!0})}
			</div>`,footer:`
			<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
			<button type="button" class="ac-btn ac-btn--primary" data-ac-confirm>Save the profile</button>
		`}),n=t.root;return n.querySelector("[data-ac-cancel]").addEventListener("click",t.close),n.querySelector("[data-ac-confirm]").addEventListener("click",async()=>{let s=o=>n.querySelector(`#${o}`)?.value?.trim()??"";try{await k.patch(`console/organizations/${encodeURIComponent(e.id)}`,{profile:{name:s("ac-org-edit-name"),school_type:s("ac-org-edit-type"),plan:s("ac-org-edit-plan"),school_year:s("ac-org-edit-year")||null,max_students:Number(s("ac-org-edit-capacity"))||100,city:s("ac-org-edit-city")||null,phone:s("ac-org-edit-phone")||null,email:s("ac-org-edit-email")||null,address:s("ac-org-edit-address")||null}}),t.close(),y("The organization profile was saved.","success"),typeof a=="function"&&a()}catch(o){y(o.message,"error")}}),t}async function Ba(e,{onDeleted:a=null}={}){if(!await M({title:`Delete "${e.name}"?`,message:"The organization is removed together with every account, class, question, exam, result and generated document it owns. This cannot be undone. Suspending the organization instead keeps everything and ends the access.",detail:"Type DELETE on the confirmation to go ahead.",confirmLabel:"Delete the organization",danger:!0}))return!1;try{return await k.del(`console/organizations/${encodeURIComponent(e.id)}`,{confirm:"DELETE"}),y("The organization was deleted.","success"),typeof a=="function"&&a(),!0}catch(n){return y(n.message,"error"),!1}}async function Ua(e,{onChanged:a=null}={}){let t=e.status!=="suspended";if(!await M({title:t?`Suspend "${e.name}"?`:`Reactivate "${e.name}"?`,message:t?"Nobody in the organization can sign in until it is restored. Nothing is deleted, and the administrator of the organization can still reach the console to reactivate it.":"The organization can sign in again immediately.",confirmLabel:t?"Suspend the organization":"Reactivate the organization",danger:t}))return!1;try{return await k.patch(`console/organizations/${encodeURIComponent(e.id)}`,{status:t?"suspended":"active",reason:t?"Suspended from the console":"Reactivated from the console"}),y(t?"The organization was suspended.":"The organization was reactivated.","success"),typeof a=="function"&&a(),!0}catch(s){return y(s.message,"error"),!1}}var is=25,H={search:"",status:"",offset:0,sort:{key:"name",direction:"asc"}},Fa={id:"organizations",path:"/organizations",title:"Organizations",description:"Every organization on the platform, its accounts, its usage and the conditions that need attention.",permission:["platform.organizations.read","school.profile.read"],async render(e,a){e.innerHTML=`
			${U({fields:`${Ee({id:"ac-org-search",placeholder:"Search organizations\u2026",value:H.search})}
					${he({id:"ac-org-status",label:"Status",value:H.status,includeAll:!0,allLabel:"All statuses",options:[{value:"active",label:"Active"},{value:"pending",label:"Pending"},{value:"suspended",label:"Suspended"}]})}`,actions:`${a.isPlatform?'<button type="button" class="ac-btn ac-btn--primary" data-ac-org-new>Add an organization</button>':""}<button type="button" class="ac-btn" data-ac-refresh>Refresh</button>`})}
			<div class="ac-grid ac-grid--kpi" data-ac-org-kpis></div>
			<section class="ac-panel" style="margin-top:16px">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title">Organizations</h3>
						<p class="ac-panel__subtitle">${a.isOffline?"Every organization hosted on this installation. Active users are measured over the last 30 days from real sign-ins, attempts and content creation.":"Every organization on the platform. Active users are measured over the last 30 days from real sign-ins, attempts and content creation."}</p>
					</div>
				</div>
				<div class="ac-panel__body ac-panel__body--flush" data-ac-org-body>
					${R(4)}
				</div>
			</section>
			<div class="ac-grid ac-grid--2" style="margin-top:16px" data-ac-org-charts></div>`;let t=e.querySelector("[data-ac-org-body]"),n=e.querySelector("[data-ac-org-kpis]"),s=e.querySelector("[data-ac-org-charts]"),o;try{o=await k.get("console/organizations",{search:H.search||void 0,status:H.status||void 0,limit:is,offset:H.offset})}catch(p){t.innerHTML=N({message:p.message});return}let f=o.data,r=f.length,d=f.filter(p=>p.status==="active").length,l=f.filter(p=>p.status==="pending").length,u=f.filter(p=>p.status==="suspended").length,i=f.reduce((p,b)=>p+(b.teachers||0),0),h=f.reduce((p,b)=>p+(b.students||0),0),g=f.filter(p=>p.alerts.some(b=>b.code==="inactive"||b.code==="no_activity")).length;if(n.innerHTML=[T({label:"Organizations shown",value:w(r),note:o.total>f.length?`of ${w(o.total)} matching`:"matching the filter",tooltip:"The number of organizations matching the current search and status filter."}),T({label:"Active",value:w(d),tone:"success",tooltip:'Organizations whose lifecycle status is "active".'}),T({label:"Pending / suspended",value:`${w(l)} / ${w(u)}`,tone:l+u>0?"warning":"",tooltip:"Organizations awaiting activation, and organizations whose access has been revoked."}),T({label:"Accounts",value:w(i+h),note:`${w(i)} teachers \xB7 ${w(h)} students`,tooltip:"Teacher and student accounts across the organizations shown."}),T({label:"Needing attention",value:w(g),tone:g>0?"warning":"",tooltip:"Organizations with no activity in the last 30 days, or with no recorded activity at all."})].join(""),t.innerHTML=E({columns:[{key:"name",label:"Organization",sortable:!0,render:p=>`<a href="#/organizations/${p.id}" class="ac-table__primary">${c(p.name)}</a><br><span class="ac-table__muted">${c(p.slug)}</span>`},{key:"status",label:"Status",sortable:!0,render:p=>`<span class="ac-badge ${p.status==="active"?"ac-badge--success":p.status==="pending"?"ac-badge--warning":"ac-badge--danger"}">${c(p.status)}</span>`},{key:"plan",label:"Plan",render:p=>c(p.plan||"\u2014")},{key:"teachers",label:"Teachers",align:"right",sortable:!0},{key:"students",label:"Students",align:"right",sortable:!0},{key:"activeTeachers",label:"Active teachers",align:"right",sortable:!0,render:p=>`${w(p.activeTeachers)} / ${w(p.teachers)}`},{key:"activeStudents",label:"Active students",align:"right",sortable:!0,render:p=>`${w(p.activeStudents)} / ${w(p.students)}`},{key:"attempts30d",label:"Attempts (30d)",align:"right",sortable:!0},{key:"lastActivity",label:"Last activity",sortable:!0,render:p=>p.lastActivity?`<span title="${c(C(p.lastActivity))}">${c(O(p.lastActivity))}</span>`:'<span class="ac-badge ac-badge--danger">none</span>'},{key:"alerts",label:"Alerts",render:p=>p.alerts.length?p.alerts.map(b=>`<span class="ac-badge ac-badge--${b.kind==="danger"?"danger":b.kind==="warning"?"warning":"info"}" title="${c(b.message)}">${c(b.code)}</span>`).join(" "):'<span class="ac-table__muted">\u2014</span>'},{key:"actions",label:"Actions",align:"right",render:p=>Pe(Oa(p,{canManage:a.isPlatform}))}],rows:f,sort:H.sort,onSort:p=>{H.sort={key:p,direction:H.sort.key===p&&H.sort.direction==="asc"?"desc":"asc"},a.rerender()},empty:a.isPlatform?"No organization matches the current search and status filter.":"This session is scoped to a single organization.",rowHref:p=>`#/organizations/${p.id}`}),t.insertAdjacentHTML("beforeend",ue({total:o.total,limit:o.limit,offset:o.offset,onPage:p=>{H.offset=p,a.rerender()}})),a.isPlatform&&f.length){let p=[...f].sort((b,_)=>(_.activeStudents||0)-(b.activeStudents||0)).slice(0,8);s.innerHTML=`
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles">
							<h3 class="ac-panel__title">Usage by organization</h3>
							<p class="ac-panel__subtitle">Active students over the last 30 days, highest first.</p>
						</div>
					</div>
					<div class="ac-panel__body">
						${V({rows:p.map(b=>({label:b.name,value:b.activeStudents||0})),value:"value",label:b=>b.label,display:b=>w(b),tone:"primary",ariaLabel:"Active students by organization"})}
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
						${V({rows:p.map(b=>({label:b.name,teachers:b.teachers||0,students:b.students||0})),value:"students",label:b=>b.label,display:b=>w(b),tone:"primary",ariaLabel:"Students by organization"})}
					</div>
				</section>`}else s.innerHTML="";let m=e.querySelector("#ac-org-search"),x=null;m.addEventListener("input",()=>{window.clearTimeout(x),x=window.setTimeout(()=>{H.search=m.value.trim(),H.offset=0,a.rerender()},320)}),e.querySelector("#ac-org-status").addEventListener("change",p=>{H.status=p.target.value,H.offset=0,a.rerender()}),e.querySelector("[data-ac-refresh]").addEventListener("click",()=>a.rerender()),Me(t,{open:p=>{window.location.hash=`#/organizations/${p}`},"toggle-status":async p=>{let b=f.find(_=>_.id===p);b&&await Ua(b,{onChanged:()=>a.rerender()})},edit:p=>{let b=f.find(_=>_.id===p);b&&Ha(b,{onSaved:()=>a.rerender()})},delete:async p=>{let b=f.find(_=>_.id===p);b&&await Ba(b,{onDeleted:()=>a.rerender()})}}),e.querySelector("[data-ac-org-new]")?.addEventListener("click",()=>{Da({onCreated:()=>a.rerender()})})}};var cs=[{value:"student",label:"Student"},{value:"teacher",label:"Teacher"},{value:"admin",label:"Administrator"},{value:"super_admin",label:"Platform administrator"}];function Ne({ctx:e,role:a="student",onCreated:t=null}){let n=!!e?.isPlatform,s=String(a||"student").split(",")[0].trim()||"student",o=j({title:"Add an account",subtitle:"The account is created in your organization. The password is stored hashed and is never shown again.",body:`<div class="ac-field-grid">
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
						${cs.map(r=>`<option value="${c(r.value)}"${r.value===s?" selected":""}>${c(r.label)}</option>`).join("")}
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
		`}),f=o.root;return f.querySelector("[data-ac-cancel]").addEventListener("click",o.close),f.querySelector("[data-ac-confirm]").addEventListener("click",async()=>{let r=p=>f.querySelector(`#${p}`)?.value?.trim()??"",d=r("ac-new-name"),l=r("ac-new-username"),u=r("ac-new-password");if(!d||!l){y("A name and a username are required.","error");return}if(u.length<8){y("The password must be at least 8 characters.","error");return}let i={name:d,username:l,password:u,role:r("ac-new-role")||"student"},h=r("ac-new-numero"),g=r("ac-new-email"),m=r("ac-new-phone");h&&(i.numero=h),g&&(i.email=g),m&&(i.phone=m);let x=r("ac-new-school");x&&(i.school_id=x);try{let p=await k.post("console/users",i);o.close(),y(`The account "${l}" was created.`,"success"),typeof t=="function"?t(p?.data):e?.rerender&&e.rerender()}catch(p){y(p.message,"error")}}),o}var Wa={id:"users",path:"/users",title:"Users & Access",description:"Accounts, roles and access \u2014 separated by the population each list serves.",permission:["platform.users.read","school.users.read"],async render(e,a){e.innerHTML=`<div class="ac-stack" data-ac-users-hub>${R(3)}</div>`;let t;try{t=await k.get("console/users?limit=200")}catch(u){e.querySelector("[data-ac-users-hub]").innerHTML=N({title:"The accounts could not be loaded",message:u.message});return}let n=Array.isArray(t?.data)?t.data:[],s=u=>n.filter(i=>i.role===u).length,o=u=>n.filter(i=>i.role===u&&i.status==="active").length,f=n.filter(u=>!u.lastLogin).length,r=n.filter(u=>u.status==="suspended").length,d=a.isPlatform,l=({href:u,icon:i,title:h,desc:g,count:m,activeCount:x})=>`
			<a class="ac-role-card" href="${c(u)}">
				<span class="ac-role-card__icon">${i}</span>
				<p class="ac-role-card__title">${c(h)}</p>
				<p class="ac-role-card__desc">${c(g)}</p>
				<p class="ac-role-card__count">${me(m)} <small>${x!=null?`\xB7 ${me(x)} active`:"account"}</small></p>
			</a>`;e.querySelector("[data-ac-users-hub]").innerHTML=`
			<div class="ac-grid ac-grid--kpi">
				${T({label:"Accounts in scope",value:me(n.length),note:"matching the current scope"})}
				${T({label:"Never signed in",value:me(f),note:"provisioned, unused",tone:f>0?"warning":"",tooltip:"Accounts with no recorded sign-in. They may be waiting for the person to use them."})}
				${T({label:"Suspended",value:me(r),note:"no access",tone:r>0?"warning":""})}
			</div>

			<div class="ac-section">
				<h2 class="ac-section__title">Manage accounts</h2>
				<p class="ac-section__hint">Each population has its own page, its own filters and its own actions.</p>
			</div>

			<div class="ac-quick-actions" style="margin-bottom:16px">
				<button type="button" class="ac-quick-action" data-ac-add-account>Add an account</button>
			</div>

			<div class="ac-role-cards">
				${l({href:"#/users/teachers",icon:'<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/></svg>',title:"Teachers",desc:"The teaching staff. Their classes, subjects and content.",count:s("teacher"),activeCount:o("teacher")})}
				${l({href:"#/users/students",icon:'<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>',title:"Students",desc:"The enrolled pupils, their class and their activity.",count:s("student"),activeCount:o("student")})}
				${l({href:"#/users/administrators",icon:'<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',title:d?"Directors & platform administrators":"Directors",desc:d?"The school directors, and the platform administrators who reach every organization.":"The people who administer this school.",count:s("admin")+s("super_admin"),activeCount:o("admin")+o("super_admin")})}
			</div>

			${f>0?`<div class="ac-alert ac-alert--warning" style="margin-top:16px">
						<div class="ac-alert__body">
							<p class="ac-alert__title">${me(f)} account(s) have never signed in</p>
							<p class="ac-alert__text">They may be waiting to be used, or they may have been provisioned in error. Open the relevant page to review them.</p>
						</div>
					</div>`:""}`,e.querySelector("[data-ac-add-account]")?.addEventListener("click",()=>{Ne({ctx:a})})}};function me(e){let a=Number(e);return Number.isFinite(a)?a.toLocaleString():"0"}var Ga=25;async function fe({host:e,ctx:a,role:t,title:n,subtitle:s,columns:o,emptyMessage:f,state:r,extraFilters:d=[]}){e.innerHTML=`
		${U({fields:`<div class="ac-field">
				<label class="ac-field__label" for="ac-user-search">Search</label>
				<input class="ac-input" id="ac-user-search" type="search" placeholder="Name, username, email\u2026" value="${c(r.search||"")}" autocomplete="off" />
			</div>
			<div class="ac-field">
				<label class="ac-field__label" for="ac-user-status">Status</label>
				<select class="ac-select" id="ac-user-status">
					<option value="">All statuses</option>
					<option value="active"${r.status==="active"?" selected":""}>Active</option>
					<option value="inactive"${r.status==="inactive"?" selected":""}>Inactive</option>
					<option value="suspended"${r.status==="suspended"?" selected":""}>Suspended</option>
				</select>
			</div>
			${d.map(g=>`<div class="ac-field">
					<label class="ac-field__label" for="${c(g.id)}">${c(g.label)}</label>
					<select class="ac-select" id="${c(g.id)}">
						${g.options.map(m=>`<option value="${c(m.value)}"${String(r[g.key]??"")===String(m.value)?" selected":""}>${c(m.label)}</option>`).join("")}
					</select>
				</div>`).join("")}`,actions:'<button type="button" class="ac-btn" data-ac-user-refresh>Refresh</button>'})}
		<section class="ac-panel">
			<div class="ac-panel__header">
				<div class="ac-panel__titles">
					<h3 class="ac-panel__title">${c(n)}</h3>
					<p class="ac-panel__subtitle">${c(s)}</p>
				</div>
				<div class="ac-panel__actions">
					<button type="button" class="ac-btn ac-btn--sm ac-btn--primary" data-ac-user-add>
						Add an account
					</button>
				</div>
			</div>
			<div class="ac-panel__body ac-panel__body--flush" data-ac-user-table>
				${R(5)}
			</div>
		</section>`;let l=e.querySelector("[data-ac-user-table]"),u=async()=>{l.innerHTML=R(5);let g;try{g=await k.get("console/users",{role:t,search:r.search||void 0,status:r.status||void 0,...r.schoolId?{school_id:r.schoolId}:{},limit:Ga,offset:r.offset||0})}catch(p){l.innerHTML=N({title:"The accounts could not be loaded",message:p.message});return}let m=g?.data||[],x=a.canAny(["platform.users.manage","school.users.manage"]);l.innerHTML=m.length===0?I({title:"No accounts",message:f}):E({columns:[...o,{key:"actions",label:"Actions",align:"right",render:p=>Pe(Ra(p,{canManage:x}))}],rows:m,rowHref:p=>`#/users/${p.id}`}),Me(l,{open:p=>{window.location.hash=`#/users/${p}`},"toggle-status":async p=>{let b=m.find($=>$.id===p);if(!b)return;let _=b.status==="active";if(await M({title:_?`Suspend "${b.username}"?`:`Reactivate "${b.username}"?`,message:_?"The account keeps everything it owns, but it can no longer sign in. The action is recorded in the audit trail.":"The account can sign in again immediately. The action is recorded in the audit trail.",confirmLabel:_?"Suspend the account":"Reactivate the account",danger:_}))try{await k.patch(`console/users/${encodeURIComponent(p)}`,{status:_?"suspended":"active",reason:_?"Suspended from the account roster":"Reactivated from the account roster"}),y(_?"The account was suspended.":"The account was reactivated.","success"),u()}catch($){y($.message,"error")}},delete:async p=>{let b=m.find(S=>S.id===p);if(!(!b||!await M({title:`Delete "${b.username}"?`,message:"The account is removed, together with its sessions and its results. This cannot be undone \u2014 suspending the account keeps the record if you only need to end the access.",confirmLabel:"Delete the account",danger:!0})))try{await k.del(`console/users/${encodeURIComponent(p)}`),y("The account was deleted.","success"),u()}catch(S){y(S.message,"error")}}}),l.insertAdjacentHTML("beforeend",ue({total:g?.total||0,limit:g?.limit||Ga,offset:g?.offset||0,onPage:p=>{r.offset=p,u()}}))},i=e.querySelector("#ac-user-search"),h=null;i.addEventListener("input",()=>{window.clearTimeout(h),h=window.setTimeout(()=>{r.search=i.value.trim(),r.offset=0,u()},320)}),e.querySelector("#ac-user-status").addEventListener("change",g=>{r.status=g.target.value,r.offset=0,u()});for(let g of d)e.querySelector(`#${g.id}`).addEventListener("change",m=>{r[g.key]=m.target.value,r.offset=0,u()});e.querySelector("[data-ac-user-refresh]").addEventListener("click",u),e.querySelector("[data-ac-user-add]")?.addEventListener("click",()=>{Ne({ctx:a,role:t,onCreated:()=>{r.offset=0,u()}})}),await u()}var Ze=e=>`<span class="ac-badge ac-badge--${e.status==="active"?"success":e.status==="suspended"?"danger":"warning"}">${c(e.status)}</span>`,Xe=e=>e.lastLogin?`<span title="${c(C(e.lastLogin))}">${c(O(e.lastLogin))}</span>`:'<span class="ac-badge ac-badge--warning">never</span>',Ya=[{key:"name",label:"Teacher",render:e=>`<span class="ac-table__primary">${c(e.name||e.username)}</span><br><span class="ac-table__muted">${c(e.username)}${e.email?` \xB7 ${c(e.email)}`:""}</span>`},{key:"status",label:"Status",render:Ze},{key:"schoolName",label:"Organization",render:e=>c(e.schoolName||"\u2014")},{key:"lastLogin",label:"Last sign-in",render:Xe},{key:"createdAt",label:"Created",render:e=>c(C(e.createdAt,{withTime:!1}))}],Va=[{key:"name",label:"Student",render:e=>`<span class="ac-table__primary">${c(e.name||e.username)}</span><br><span class="ac-table__muted">${c(e.username)}${e.numero?` \xB7 #${c(e.numero)}`:""}</span>`},{key:"status",label:"Status",render:Ze},{key:"className",label:"Class",render:e=>c(e.className||"\u2014")},{key:"schoolName",label:"Organization",render:e=>c(e.schoolName||"\u2014")},{key:"lastLogin",label:"Last sign-in",render:Xe}],Ka=[{key:"name",label:"Administrator",render:e=>`<span class="ac-table__primary">${c(e.name||e.username)}</span><br><span class="ac-table__muted">${c(e.username)}</span>`},{key:"role",label:"Level",render:e=>`<span class="ac-badge ${e.role==="super_admin"?"ac-badge--violet":"ac-badge--brand"}">${c(e.role==="super_admin"?"Platform":"Organization")}</span>`},{key:"status",label:"Status",render:Ze},{key:"schoolName",label:"Organization",render:e=>c(e.schoolName||"\u2014")},{key:"lastLogin",label:"Last sign-in",render:Xe}];var ls={search:"",status:"",offset:0},Qa={id:"users-teachers",path:"/users/teachers",title:"Teachers",description:"The teaching staff, their activity and their access.",permission:["platform.users.read","school.users.read"],async render(e,a){await fe({host:e,ctx:a,role:"teacher",title:"Teachers",subtitle:"Every teacher account in scope. Open an account to change its status, role or permissions.",columns:Ya,emptyMessage:"No teacher account matches the current filters.",state:ls})}};var ds={search:"",status:"",offset:0},Ja={id:"users-students",path:"/users/students",title:"Students",description:"The enrolled pupils, their class and their activity.",permission:["platform.users.read","school.users.read"],async render(e,a){await fe({host:e,ctx:a,role:"student",title:"Students",subtitle:"Every student account in scope. Open an account to change its status, role or permissions.",columns:Va,emptyMessage:"No student account matches the current filters.",state:ds})}};var ps={search:"",status:"",offset:0},Za={id:"users-administrators",path:"/users/administrators",title:"Directors & administrators",description:"The accounts that can administer \u2014 the school director, and on a SaaS deployment the platform administrators.",permission:["platform.users.read","school.users.read"],async render(e,a){await fe({host:e,ctx:a,role:"admin,super_admin",title:a.isPlatform?"Directors & platform administrators":"Directors",subtitle:a.isPlatform?"A platform administrator reaches every organization; an organization administrator reaches only their own.":"The accounts that administer this school.",columns:Ka,emptyMessage:"No administrator account matches the current filters.",state:ps})}};var Xa={id:"analytics",path:"/analytics",title:"Platform Analytics",description:"Adoption, engagement and usage of the platform \u2014 aggregated across organizations, never per class.",permission:["platform.analytics.read","school.analytics.read"],async render(e,a){let t=a.getState();e.innerHTML=`<div class="ac-stack" data-ac-analytics>
			${Le({value:t.period})}
			<div data-ac-kpis class="ac-grid ac-grid--kpi">${R(1)}</div>
			<div data-ac-sections class="ac-stack"></div>
		</div>`;let n={period:t.period==="year"?"year":t.period};t.period==="custom"&&t.customRange&&(n.from=t.customRange.from,n.to=t.customRange.to);let s,o,f;try{[s,o,f]=await Promise.all([k.get("console/overview",n),k.get("console/trends",n),k.get("console/organizations",{limit:100,offset:0})])}catch(x){e.querySelector("[data-ac-sections]").innerHTML=N({message:x.message});return}let r=s.data,d=r.sections.glance,l=r.sections.activity,u=r.sections.content,i=r.meta.definitions;e.querySelector("[data-ac-kpis]").innerHTML=[T({label:"Organizations",value:w(d.organizations.total),note:`${d.organizations.active} active`,tooltip:"Organizations in the current scope."}),T({label:"Teacher adoption",value:d.users.teachers>0?`${Math.round(d.users.activeTeachers/d.users.teachers*100)}%`:"\u2014",note:`${w(d.users.activeTeachers)} of ${w(d.users.teachers)} teachers active`,tone:"success",tooltip:i.activeTeacher}),T({label:"Student participation",value:d.users.students>0?`${Math.round(l.participatingStudents/d.users.students*100)}%`:"\u2014",note:`${w(l.participatingStudents)} of ${w(d.users.students)} students took part`,tone:"primary",tooltip:"Students with at least one completed attempt in the period, over the number of enrolled students. Attempts and unique students are reported separately and never conflated."}),T({label:"Attempts per student",value:l.participatingStudents>0?(l.attempts/l.participatingStudents).toFixed(1):"\u2014",note:`${w(l.attempts)} attempts`,tooltip:"Total completed attempts divided by the number of unique students who made at least one. A value above 1 means students attempted more than once on average."}),T({label:"Average score",value:l.averageScore20==null?"\u2014":l.averageScore20.toFixed(2),note:`/20 per formal attempt \xB7 ${w(l.averageScoreSample)} attempts`,tone:"primary",tooltip:i.averageScore}),T({label:"Content authored",value:w(u.questions+u.exams+u.courses),note:`${w(u.questions)} questions \xB7 ${w(u.exams)} exams \xB7 ${w(u.courses)} courses`,tooltip:"Content created in the selected period. The question and course totals are all-time row counts; the exam and course counts respect the period."})].join("");let h=o?.data?.series,g=h?h.labels.map((x,p)=>({label:x,formalAttempts:h.formalAttempts[p]||0,trainingAttempts:h.trainingAttempts[p]||0,gameAttempts:h.gameAttempts[p]||0,newTeachers:h.newTeachers[p]||0,newStudents:h.newStudents[p]||0})):[],m=(f?.data||[]).slice(0,10);e.querySelector("[data-ac-sections]").innerHTML=`
			<div class="ac-section">
				<h2 class="ac-section__title">Educational activity</h2>
				<p class="ac-section__hint">Completed attempts by mode, over ${c(o?.data?.meta?.periodLabel||"the selected period")}.</p>
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
						${g.length?`${de([{label:"Formal exams",tone:"primary"},{label:"Training",tone:"info"},{label:"Games",tone:"violet"}])}${pe({points:g,series:[{key:"formalAttempts",label:"Formal exams",tone:"primary"},{key:"trainingAttempts",label:"Training",tone:"info"},{key:"gameAttempts",label:"Games",tone:"violet"}],labelKey:"label",ariaLabel:"Attempts by mode over time"})}`:I({title:"No attempts recorded",message:"No completed attempts fall inside the selected period."})}
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
						${g.length?`${de([{label:"Teachers",tone:"success"},{label:"Students",tone:"warning"}])}${pe({points:g,series:[{key:"newTeachers",label:"Teachers",tone:"success"},{key:"newStudents",label:"Students",tone:"warning"}],labelKey:"label",ariaLabel:"New accounts over time"})}`:I({title:"No accounts created",message:"No accounts were created inside the selected period."})}
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
						${m.length?V({rows:m.map(x=>({label:x.name,value:x.activeStudents||0})),value:"value",label:x=>x.label,display:x=>w(x),ariaLabel:"Active students by organization"}):I({title:"No organizations to compare",message:"The current scope contains no organization with recorded usage."})}
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
						${m.length?La({rows:m.map(x=>({label:x.name,teachers:x.teachers||0,students:x.students||0})),series:[{key:"teachers",label:"Teachers",tone:"success"},{key:"students",label:"Students",tone:"primary"}],label:x=>x.label,ariaLabel:"Teachers and students by organization"}):I({title:"No organizations to compare",message:"The current scope contains no organization with recorded accounts."})}
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
								<p class="ac-defs__desc">${w(u.questions)}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Classes</p>
								<p class="ac-defs__desc">${w(u.classes)}</p>
							</div>
						</div>
						<p class="ac-empty__message" style="margin:12px 0 0;font-size:12px">${c(u.note)}</p>
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
								<p class="ac-defs__desc">${w(u.exams)}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Published exams</p>
								<p class="ac-defs__desc">${w(u.activeExams)}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Conducted in period</p>
								<p class="ac-defs__desc">${w(l.examsConducted)}</p>
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
								<p class="ac-defs__desc">${w(u.courses)}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Games created</p>
								<p class="ac-defs__desc">${w(u.games)}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Kids games created</p>
								<p class="ac-defs__desc">${w(u.kidsGames)}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Game sessions played</p>
								<p class="ac-defs__desc">${w(l.gameSessions+l.kidsGameSessions)}</p>
							</div>
						</div>
					</div>
				</section>
			</div>`,qe(e,"period",x=>{if(x==="custom"){let p=prompt("From (YYYY-MM-DD)",new Date(Date.now()-2592e6).toISOString().slice(0,10));if(!p)return;let b=prompt("To (YYYY-MM-DD)",new Date().toISOString().slice(0,10));if(!b)return;a.setPeriod("custom",{from:p,to:b});return}a.setPeriod(x)})}};var us=25,z={stream:"actions",search:"",action:"",entityType:"",eventType:"",outcome:"",severity:"",offset:0},et={id:"audit",path:"/audit",title:"Activity & Audit",description:"Every administrative action and every authentication event, searchable and traceable.",permission:["platform.audit.read","school.audit.read"],async render(e,a){e.innerHTML=`
			${U({chips:`<div class="ac-chip-group" role="group" aria-label="Trail">
					<button type="button" class="ac-chip is-active" data-ac-stream="actions">Administrative actions</button>
					<button type="button" class="ac-chip" data-ac-stream="security">Security events</button>
				</div>`,fields:Ee({id:"ac-audit-search",placeholder:"Search the trail\u2026",value:z.search}),filters:"<span data-ac-audit-filters></span>",actions:'<button type="button" class="ac-btn" data-ac-refresh>Refresh</button>'})}
			<div class="ac-grid ac-grid--kpi" data-ac-audit-kpis></div>
			<section class="ac-panel" style="margin-top:16px">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title" data-ac-audit-title>Administrative actions</h3>
						<p class="ac-panel__subtitle" data-ac-audit-subtitle></p>
					</div>
				</div>
				<div class="ac-panel__body ac-panel__body--flush" data-ac-audit-body>
					${R(5)}
				</div>
			</section>
			<div class="ac-grid ac-grid--2" style="margin-top:16px" data-ac-audit-charts></div>`;let t=e.querySelector("[data-ac-audit-body]"),n=e.querySelector("[data-ac-audit-kpis]"),s=e.querySelector("[data-ac-audit-charts]"),o=e.querySelector("[data-ac-audit-filters]"),f;try{f=await k.get("console/audit/summary")}catch{f={summary:{},facets:{}}}let r=f.facets||{},d=f.summary||{};o.innerHTML=z.stream==="actions"?`${he({id:"ac-audit-action",label:"Action",value:z.action,includeAll:!0,allLabel:"All actions",options:(r.actions||[]).map(m=>({value:m.value,label:`${m.label} (${m.count})`}))})}
					${he({id:"ac-audit-entity",label:"Entity",value:z.entityType,includeAll:!0,allLabel:"All entities",options:(r.entityTypes||[]).map(m=>({value:m.value,label:`${m.label} (${m.count})`}))})}`:`${he({id:"ac-audit-event",label:"Event",value:z.eventType,includeAll:!0,allLabel:"All events",options:(r.securityEventTypes||[]).map(m=>({value:m.value,label:m.label}))})}`,hs(e,a);let l=d.security||{};n.innerHTML=[T({label:"Failed sign-ins",value:w(l.login_failure||0),tone:(l.login_failure||0)>0?"warning":"",tooltip:"Recorded failed authentication attempts. A concentration on one address or one username is the signal to investigate."}),T({label:"Successful sign-ins",value:w(l.login_success||0),tooltip:"Recorded successful authentication events."}),T({label:"Sessions revoked",value:w(l.session_revoked||0),tone:(l.session_revoked||0)>0?"warning":"",tooltip:"Sessions an administrator forcibly ended."}),T({label:"Denied actions",value:w(d.deniedActions||0),tone:(d.deniedActions||0)>0?"danger":"",tooltip:"Administrative actions that were refused. The refusal is itself recorded."}),T({label:"Password changes",value:w((l.password_change||0)+(l.password_reset||0)),tooltip:"Password changes and recovery-code resets recorded in the security trail."})].join("");let u;try{u=await k.get("console/audit",{stream:z.stream,search:z.search||void 0,action:z.stream==="actions"&&z.action||void 0,entityType:z.stream==="actions"&&z.entityType||void 0,eventType:z.stream==="security"&&z.eventType||void 0,limit:us,offset:z.offset})}catch(m){t.innerHTML=N({message:m.message});return}e.querySelector("[data-ac-audit-title]").textContent=z.stream==="actions"?"Administrative actions":"Security events",e.querySelector("[data-ac-audit-subtitle]").textContent=z.stream==="actions"?"Every administrative change, with the outcome it produced.":"Every authentication and access-control event, with the source address.",t.innerHTML=z.stream==="actions"?E({columns:[{key:"occurredAt",label:"When",render:m=>`<span title="${c(C(m.occurredAt))}">${c(C(m.occurredAt))}</span>`},{key:"actorName",label:"Actor",render:m=>m.actorName?`<span class="ac-table__primary">${c(m.actorName)}</span><br><span class="ac-table__muted">${c(m.actorRole||"")}</span>`:'<span class="ac-table__muted">system</span>'},{key:"action",label:"Action",render:m=>`<span class="ac-badge">${c(m.actionLabel)}</span>`},{key:"entityType",label:"Entity",render:m=>`${c(m.entityTypeLabel)}<br><span class="ac-table__muted">${c(m.entityId)}</span>`},{key:"outcome",label:"Outcome",render:m=>`<span class="ac-badge ac-badge--${m.outcome==="success"?"success":m.outcome==="denied"?"danger":"warning"}">${c(m.outcome)}</span>`},{key:"severity",label:"Severity",render:m=>`<span class="ac-badge ac-badge--${m.severity==="critical"?"danger":m.severity==="warning"?"warning":""}">${c(m.severity)}</span>`},{key:"schoolName",label:"Organization",render:m=>c(m.schoolName||"\u2014")}],rows:u.data,empty:"No administrative action matches the current filters.",rowClass:m=>m.outcome==="denied"?"ac-row--denied":""}):E({columns:[{key:"occurredAt",label:"When",render:m=>`<span title="${c(C(m.occurredAt))}">${c(C(m.occurredAt))}</span>`},{key:"typeLabel",label:"Event",render:m=>`<span class="ac-badge">${c(m.typeLabel)}</span>`},{key:"username",label:"Account",render:m=>m.userName?`<span class="ac-table__primary">${c(m.userName)}</span><br><span class="ac-table__muted">${c(m.username||"")}</span>`:c(m.username||"\u2014")},{key:"reason",label:"Reason",render:m=>c(m.reason||"\u2014")},{key:"outcome",label:"Outcome",render:m=>`<span class="ac-badge ac-badge--${m.outcome==="success"?"success":m.outcome==="denied"?"danger":"warning"}">${c(m.outcome)}</span>`},{key:"severity",label:"Severity",render:m=>`<span class="ac-badge ac-badge--${m.severity==="critical"?"danger":m.severity==="warning"?"warning":""}">${c(m.severity)}</span>`},{key:"ip",label:"Source",render:m=>c(m.ip||"\u2014")}],rows:u.data,empty:"No security event matches the current filters."}),t.insertAdjacentHTML("beforeend",ue({total:u.total,limit:u.limit,offset:u.offset,onPage:m=>{z.offset=m,a.rerender()}}));let i=d.topFailureSources||{};i.byIp?.length||i.byUsername?.length?s.innerHTML=`
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles">
							<h3 class="ac-panel__title">Failed sign-in sources</h3>
							<p class="ac-panel__subtitle">Top source addresses by attempt count. A concentration may indicate credential stuffing.</p>
						</div>
					</div>
					<div class="ac-panel__body">
						${V({rows:(i.byIp||[]).map(m=>({label:m.ip,value:m.count})),value:"value",label:m=>m.label,display:m=>w(m),tone:"danger",ariaLabel:"Failed sign-ins by source address"})}
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
						${V({rows:(i.byUsername||[]).map(m=>({label:m.username,value:m.count})),value:"value",label:m=>m.label,display:m=>w(m),tone:"warning",ariaLabel:"Failed sign-ins by attempted username"})}
					</div>
				</section>`:s.innerHTML="",e.querySelectorAll("[data-ac-stream]").forEach(m=>{m.addEventListener("click",()=>{z.stream=m.dataset.acStream,z.offset=0,a.rerender()})});let h=e.querySelector("#ac-audit-search"),g=null;h.addEventListener("input",()=>{window.clearTimeout(g),g=window.setTimeout(()=>{z.search=h.value.trim(),z.offset=0,a.rerender()},320)}),e.querySelector("[data-ac-refresh]").addEventListener("click",()=>a.rerender())}};function hs(e,a){let t=e.querySelector("#ac-audit-action");t&&t.addEventListener("change",o=>{z.action=o.target.value,z.offset=0,a.rerender()});let n=e.querySelector("#ac-audit-entity");n&&n.addEventListener("change",o=>{z.entityType=o.target.value,z.offset=0,a.rerender()});let s=e.querySelector("#ac-audit-event");s&&s.addEventListener("change",o=>{z.eventType=o.target.value,z.offset=0,a.rerender()})}var ms=[{key:"15",label:"15 min"},{key:"60",label:"1 hour"},{key:"360",label:"6 hours"},{key:"1440",label:"24 hours"}],ea={minutes:"60"},at={id:"health",path:"/health",title:"System Health & Operations",description:"Service availability, error trends, latency, database and storage \u2014 measured, not asserted.",permission:["platform.health.read","school.health.read"],async render(e,a){e.innerHTML=`
			${U({chips:`<div class="ac-chip-group" role="group" aria-label="Window">
					${ms.map(i=>`<button type="button" class="ac-chip${ea.minutes===i.key?" is-active":""}" data-ac-window="${i.key}">${c(i.label)}</button>`).join("")}
				</div>`,actions:'<button type="button" class="ac-btn" data-ac-refresh>Refresh</button>'})}
			<div data-ac-health><div class="ac-skeleton-stack" aria-busy="true">
				<div class="ac-skeleton" style="width:45%"></div>
				<div class="ac-skeleton" style="width:100%"></div>
			</div></div>`;let t;try{t=await k.get("console/health",{minutes:ea.minutes})}catch(i){e.querySelector("[data-ac-health]").innerHTML=N({message:i.message});return}let n=t.data,s=n.sections.api,o=n.sections.latency,f=n.sections.database,r=n.sections.realtime,d=n.sections.storage,l=n.sections.scheduled,u=s.availabilityPercent==null?"":s.availabilityPercent>=99?"success":s.availabilityPercent>=95?"warning":"danger";e.querySelector("[data-ac-health]").innerHTML=`
			<div class="ac-grid ac-grid--kpi">
				${T({label:"API availability",value:s.availabilityPercent==null?"\u2014":`${s.availabilityPercent.toFixed(1)}%`,note:`${w(s.totalCalls)} requests in the window`,tone:u,tooltip:n.meta.notes.availability})}
				${T({label:"Server error rate",value:s.serverErrorRatePercent==null?"\u2014":`${s.serverErrorRatePercent.toFixed(1)}%`,note:`${w(s.serverErrors??0)} server errors`,tone:s.serverErrorRatePercent==null?"":s.serverErrorRatePercent>=1?"danger":s.serverErrorRatePercent>0?"warning":"success",tooltip:"Share of API requests in the window that failed with a 5xx status. This is the measure of service health: a 4xx is a client mistake, not an outage."})}
				${T({label:"Error rate (all)",value:s.errorRatePercent==null?"\u2014":`${s.errorRatePercent.toFixed(1)}%`,note:`${w(s.errors)} failed requests`,tone:s.errorRatePercent==null?"":s.errorRatePercent>=20?"warning":"",tooltip:"Share of API requests in the window that returned a 4xx or 5xx status. A high value here with a low server error rate usually means rejected or expired requests, not an outage."})}
				${T({label:"p95 latency",value:o.available&&o.p95!=null?`${o.p95} ms`:"\u2014",note:o.available&&o.p50!=null?`p50 ${o.p50} ms \xB7 p99 ${o.p99} ms`:"no requests in the window",tone:o.available&&o.p95!=null&&o.p95>1e3?"warning":"",tooltip:n.meta.notes.latency})}
				${T({label:"Database",value:f.available?"Reachable":"Unreachable",note:f.available?`${f.roundTripMs} ms round trip`:f.error||"",tone:f.available?"success":"danger",tooltip:"A live COUNT query against the configured database, plus the row counts of the principal tables."})}
				${T({label:"Uptime",value:O(new Date(n.meta.process.startedAt)),note:`process started ${C(n.meta.process.startedAt)}`,tooltip:"Process uptime. The request log resets with the process, so availability cannot be measured across a restart."})}
				${T({label:"Storage used",value:d.available?`${d.megabytes} MB`:"\u2014",note:d.available?`${w(d.files)} files in uploads`:d.error||"",tooltip:n.meta.notes.storage})}
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
						${o.available&&o.statuses?.length?V({rows:o.statuses.map(i=>({label:i.bucket,value:i.count})),value:"value",label:i=>i.label,display:i=>w(i),tone:i=>i.label==="5xx"?"danger":i.label==="4xx"?"warning":"success",ariaLabel:"Response status distribution"}):I({title:"No requests recorded",message:"The request log is empty for this window. It is process-local and starts empty after a restart."})}
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
								<p class="ac-defs__desc">${d.available?`${d.megabytes} MB`:"\u2014"}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Files</p>
								<p class="ac-defs__desc">${d.available?w(d.files):"\u2014"}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Realtime status</p>
								<p class="ac-defs__desc">${c(r.status||"unknown")}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Tracked connections</p>
								<p class="ac-defs__desc">${w(r.trackedConnections??0)}</p>
							</div>
						</div>
						<p class="ac-empty__message" style="margin:14px 0 0;font-size:12px">${c(d.available?d.directory:d.error||"")}</p>
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
					${E({columns:[{key:"method",label:"Method"},{key:"path",label:"Path",render:i=>`<code>${c(i.path)}</code>`},{key:"calls",label:"Calls",align:"right"},{key:"errors",label:"Errors",align:"right"},{key:"errorRatePercent",label:"Error rate",align:"right",render:i=>`<span class="ac-badge ${i.errorRatePercent>=5?"ac-badge--danger":i.errorRatePercent>0?"ac-badge--warning":"ac-badge--success"}">${i.errorRatePercent.toFixed(1)}%</span>`},{key:"averageMs",label:"Avg (ms)",align:"right"}],rows:s.endpoints||[],empty:"No API traffic was recorded in this window."})}
				</div>
			</section>

			<div class="ac-section">
				<h2 class="ac-section__title">Scheduled work</h2>
				<p class="ac-section__hint">${c(l.note||"")}</p>
			</div>
			<section class="ac-panel">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title">Background tasks</h3>
						<p class="ac-panel__subtitle">Each task runs on a fixed interval inside the server process.</p>
					</div>
				</div>
				<div class="ac-panel__body ac-panel__body--flush">
					${E({columns:[{key:"name",label:"Task",render:i=>`<span class="ac-table__primary">${c(i.name)}</span>`},{key:"intervalMinutes",label:"Interval",align:"right",render:i=>`${i.intervalMinutes} min`},{key:"description",label:"Purpose"}],rows:l.tasks||[],empty:"No scheduled task is registered."})}
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
							${E({columns:[{key:"level",label:"Level",render:i=>`<span class="ac-badge ac-badge--${i.level==="error"||i.level==="fatal"?"danger":i.level==="warn"?"warning":"info"}">${c(i.level)}</span>`},{key:"message",label:"Message"},{key:"source",label:"Source",render:i=>`<code>${c(i.source)}</code>`},{key:"count",label:"Count",align:"right"},{key:"lastAt",label:"Last seen",render:i=>c(C(i.lastAt))}],rows:s.repeatedLogs,empty:"No repeated log entries in this window."})}
						</div>
					</section>`:""}`,e.querySelectorAll("[data-ac-window]").forEach(i=>{i.addEventListener("click",()=>{ea.minutes=i.dataset.acWindow,a.rerender()})}),e.querySelector("[data-ac-refresh]").addEventListener("click",()=>a.rerender())}};var tt={general:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',organization:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6"/></svg>',profile:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',realtime:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14"/></svg>',presets:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 6.2L21 10l-5.4 4 1.6 6.6L12 17l-5.2 3.6L8.4 14 3 10l6.6-1.8z"/></svg>',access:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>',teaching:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/></svg>',data:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.7-4 3-9 3s-9-1.3-9-3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/></svg>',setup:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',ai:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l1.9 5.1L19 9l-5.1 1.9L12 16l-1.9-5.1L5 9l5.1-1.9L12 2z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z"/></svg>',roles:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',deployment:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z"/></svg>'};function st({sections:e,active:a,collapsed:t=!1}){let n=e.map(s=>{let o=tt[s.icon]||tt.general,f=s.badge==null?"":`<span class="ac-section-menu__badge">${c(String(s.badge))}</span>`;return`<button type="button" class="ac-section-menu__item${s.id===a?" is-active":""}" data-ac-section="${c(s.id)}" title="${c(s.label)}" aria-current="${s.id===a?"true":"false"}">
				<span class="ac-section-menu__icon">${o}</span>
				<span class="ac-section-menu__label">${c(s.label)}</span>
				${f}
			</button>`}).join("");return`<nav class="ac-section-menu${t?" ac-section-menu--collapsed":""}" aria-label="Settings sections">
		<div class="ac-section-menu__head">
			<span>Sections</span>
			<button type="button" class="ac-section-menu__toggle" data-ac-menu-toggle aria-label="${t?"Expand the section menu":"Collapse the section menu"}" title="${t?"Expand":"Collapse"}">${t?"\xBB":"\xAB"}</button>
		</div>
		<div class="ac-section-menu__list">${n}</div>
	</nav>`}function nt(e,{onSelect:a}){e.querySelectorAll("[data-ac-section]").forEach(n=>{n.addEventListener("click",()=>a(n.dataset.acSection))});let t=e.querySelector("[data-ac-menu-toggle]");t&&t.addEventListener("click",()=>{let n=e.querySelector(".ac-section-menu"),s=e.querySelector(".ac-split");if(!n||!s)return;let o=!n.classList.contains("ac-section-menu--collapsed");n.classList.toggle("ac-section-menu--collapsed",o),s.classList.toggle("ac-split--collapsed",o),t.textContent=o?"\xBB":"\xAB",t.setAttribute("aria-label",o?"Expand the section menu":"Collapse the section menu");try{localStorage.setItem("quizConsoleSettingsMenuCollapsed",o?"1":"0")}catch{}})}function rt(){try{return localStorage.getItem("quizConsoleSettingsMenuCollapsed")==="1"}catch{return!1}}var fs=[{value:"primaire",label:"Primaire (Primary)"},{value:"college",label:"Coll\xE8ge (Middle School)"},{value:"lycee",label:"Lyc\xE9e (High School)"},{value:"autre",label:"Autre (Other)"}],ot=[{key:"primaryColor",label:"Primary colour",type:"color",hint:"Buttons, links and highlights across the classroom surface."},{key:"secondaryColor",label:"Secondary colour",type:"color",hint:"The darker companion of the primary colour."},{key:"backgroundColor",label:"Background colour",type:"color",hint:"The page background of the classroom surface."},{key:"textColor",label:"Text colour",type:"color",hint:"The default body text colour."},{key:"inputFocusColor",label:"Input focus colour",type:"color",hint:"The ring shown around a focused input."}],it=[{key:"totalQuestions",label:"Questions per quiz",type:"number",hint:"The default length offered when a teacher creates a quiz."},{key:"timeLimit",label:"Time limit (seconds)",type:"number",hint:"The default countdown of a quiz."},{key:"penalty",label:"Penalty per wrong answer",type:"number",hint:"Points deducted for a wrong answer."}],ct=[{key:"welcomeTitle",label:"Welcome title",hint:"Shown above the quiz on the student workspace."},{key:"welcomeMessage",label:"Welcome message",hint:"The line under the welcome title."}];async function lt(e){let[a,t]=await Promise.all([k.get("school/profile/full"),ne()]),n=a||{},s=r=>t.get(r)?.value??"",o=[q({title:"Organization information",subtitle:"How this organization appears on the sign-in page, in the classroom header and on the generated documents.",body:`<div class="ac-field-grid">
					${A({id:"set-school-name",label:"Name",value:n.name??"",full:!0,hint:"Shown on the sign-in page and on every generated document."})}
					${D({id:"set-school-type",label:"Type",options:fs,value:n.school_type??""})}
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
				</div>`}),q({title:"Quiz defaults",subtitle:"The starting values a teacher gets when creating a quiz.",body:`<div class="ac-field-grid">
					${it.map(r=>A({id:`set-${r.key}`,label:r.label,value:s(r.key),type:r.type,hint:r.hint})).join("")}
				</div>
				<div class="ac-toolbar" style="margin-bottom:0">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-save-quiz>Save quiz defaults</button>
						<span class="ac-table__muted" data-ac-quiz-status></span>
					</div>
				</div>`}),q({title:"Appearance",subtitle:"The colours the classroom surface paints itself with.",body:`<div class="ac-field-grid">
					${ot.map(r=>A({id:`set-${r.key}`,label:r.label,value:s(r.key)||"#2563eb",type:"color",hint:r.hint})).join("")}
				</div>
				<div class="ac-field-grid">
					${ct.map(r=>A({id:`set-${r.key}`,label:r.label,value:s(r.key),hint:r.hint})).join("")}
				</div>
				<div class="ac-toolbar" style="margin-bottom:0">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-save-appearance>Save appearance</button>
						<span class="ac-table__muted" data-ac-appearance-status></span>
					</div>
				</div>`})].join("");function f(r){let d=u=>r.querySelector(u);r.querySelector("[data-ac-save-org]")?.addEventListener("click",async()=>{let u=d("[data-ac-org-status]"),i=h=>r.querySelector(`#${h}`)?.value??"";try{await k.put("school/profile",{name:i("set-school-name"),school_type:i("set-school-type"),school_year:i("set-school-year"),city:i("set-school-city"),phone:i("set-school-phone"),email:i("set-school-email"),address:i("set-school-address"),logo_url:i("set-school-logo")}),u&&(u.textContent="Saved."),y("Organization information saved.","success")}catch(h){u&&(u.textContent=h.message),y(h.message,"error")}});let l=async(u,i,h,g)=>{r.querySelector(u)?.addEventListener("click",async()=>{let m=d(i);try{for(let x of h){let p=r.querySelector(`#set-${x}`);if(!p)continue;let b=p.value,_=Number(b);await F(x,p.type==="number"&&b!==""?_:b)}m&&(m.textContent="Saved."),y(g,"success")}catch(x){m&&(m.textContent=x.message),y(x.message,"error")}})};l("[data-ac-save-quiz]","[data-ac-quiz-status]",it.map(u=>u.key),"Quiz defaults saved."),l("[data-ac-save-appearance]","[data-ac-appearance-status]",[...ot,...ct].map(u=>u.key),"Appearance saved.")}return{markup:o,bind:f}}var gs=[{value:"",label:"\u2014"},{value:"Mr",label:"Mr"},{value:"Mme",label:"Mme"},{value:"Mlle",label:"Mlle"},{value:"Dr",label:"Dr"}];async function dt(e){let t=(e.session||{}).user||{},n=[q({title:"My profile",subtitle:"Your own account information. The role, the status and the class assignments are managed by an administrator.",body:`<div class="ac-field-grid">
					${D({id:"set-profile-title",label:"Title",options:gs,value:t.title??""})}
					${A({id:"set-profile-name",label:"Full name",value:t.name??""})}
					${A({id:"set-profile-email",label:"Email",value:t.email??"",type:"email"})}
					${A({id:"set-profile-phone",label:"Phone",value:t.phone??"",type:"tel"})}
				</div>
				<div class="ac-defs" style="margin-bottom:14px">
					<div class="ac-defs__item">
						<p class="ac-defs__term">Username</p>
						<p class="ac-defs__desc">${v(t.username||"\u2014")}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Role</p>
						<p class="ac-defs__desc">${v(t.roleLabel||t.role||"\u2014")}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Organization</p>
						<p class="ac-defs__desc">${v(e.organization?.name||t.schoolName||"\u2014")}</p>
					</div>
				</div>
				<div class="ac-toolbar" style="margin-bottom:0">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-save-profile>Save profile</button>
						<span class="ac-table__muted" data-ac-profile-status></span>
					</div>
				</div>`}),q({title:"Change my password",subtitle:"The current password is required. Every other session of this account ends when the password changes.",body:`<div class="ac-field-grid">
					${A({id:"set-profile-current",label:"Current password",type:"password",full:!0})}
					${A({id:"set-profile-new",label:"New password",type:"password",hint:"At least 8 characters."})}
					${A({id:"set-profile-confirm",label:"Confirm new password",type:"password"})}
				</div>
				<div class="ac-toolbar" style="margin-bottom:0">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-change-password>Update password</button>
						<span class="ac-table__muted" data-ac-password-status></span>
					</div>
				</div>`})].join("");function s(o){o.querySelector("[data-ac-save-profile]")?.addEventListener("click",async()=>{let f=o.querySelector("[data-ac-profile-status]"),r=d=>o.querySelector(`#${d}`)?.value??"";try{await k.patch("users/me",{title:r("set-profile-title"),name:r("set-profile-name"),email:r("set-profile-email"),phone:r("set-profile-phone")}),f&&(f.textContent="Saved."),y("Profile saved.","success")}catch(d){f&&(f.textContent=d.message),y(d.message,"error")}}),o.querySelector("[data-ac-change-password]")?.addEventListener("click",async()=>{let f=o.querySelector("[data-ac-password-status]"),r=o.querySelector("#set-profile-current")?.value??"",d=o.querySelector("#set-profile-new")?.value??"",l=o.querySelector("#set-profile-confirm")?.value??"";if(!r||!d){y("The current and the new password are both required.","error");return}if(d!==l){y("The two new passwords do not match.","error");return}if(d.length<8){y("The new password must be at least 8 characters.","error");return}try{await k.post("auth/change-password",{oldPassword:r,newPassword:d}),o.querySelector("#set-profile-current").value="",o.querySelector("#set-profile-new").value="",o.querySelector("#set-profile-confirm").value="",f&&(f.textContent="The password was changed."),y("Password changed. Your other sessions were signed out.","success")}catch(u){f&&(f.textContent=u.message),y(u.message,"error")}})}return{markup:n,bind:s}}async function pt(e){let[a,t,n]=await Promise.all([k.get("console/users?limit=500"),k.get("profile-requests?status=pending").catch(()=>[]),k.get("account-requests?status=pending").catch(()=>[])]),s=Array.isArray(a?.data)?a.data:[],o=Array.isArray(t)?t:[],f=Array.isArray(n)?n:[],r=h=>s.filter(g=>g.role===h).length,d=s.filter(h=>!h.lastLogin).length,l=s.filter(h=>h.status==="suspended").length,u=[q({title:"Users & access",subtitle:"Who can reach this platform, and what they may do.",body:`<div class="ac-grid ac-grid--kpi" style="margin-bottom:16px">
					${T({label:"Teachers",value:String(r("teacher")),note:"accounts"})}
					${T({label:"Students",value:String(r("student")),note:"accounts"})}
					${T({label:"Administrators",value:String(r("admin")+r("super_admin")),note:"accounts"})}
					${T({label:"Never signed in",value:String(d),note:"provisioned, unused",tone:d>0?"warning":""})}
					${T({label:"Suspended",value:String(l),note:"no access",tone:l>0?"warning":""})}
				</div>
				<div class="ac-quick-actions">
					<a class="ac-quick-action" href="#/users/teachers">Manage teachers</a>
					<a class="ac-quick-action" href="#/users/students">Manage students</a>
					<a class="ac-quick-action" href="#/users/administrators">Manage administrators</a>
					<a class="ac-quick-action" href="#/audit?stream=security">Review access events</a>
				</div>`}),q({title:"Account requests",subtitle:"New accounts registered from a browser. They cannot sign in until a request is approved.",body:f.length?E({columns:[{key:"full_name",label:"Requested account",render:h=>`<span class="ac-table__primary">${v(h.full_name||"")}</span><br><span class="ac-table__muted">${v(h.username||"")}${h.student_number?` \xB7 #${v(h.student_number)}`:""}</span>`},{key:"class_name",label:"Class",render:h=>v(h.class_name||"\u2014")},{key:"note",label:"Note",render:h=>v(h.note||"\u2014")},{key:"actions",label:"",align:"right",render:h=>`<button type="button" class="ac-btn ac-btn--sm" data-ac-approve-account="${v(h.id)}">Approve</button> <button type="button" class="ac-btn ac-btn--sm" data-ac-reject-account="${v(h.id)}">Reject</button>`}],rows:f}):'<p class="ac-empty__message">No account request is waiting.</p>'}),q({title:"Profile change requests",subtitle:"A student asking for a correction to their record.",body:o.length?E({columns:[{key:"user_id",label:"Account",render:h=>`<a href="#/users/${v(h.user_id)}" class="ac-table__primary">${v(h.user_id)}</a>`},{key:"changes",label:"Requested change",render:h=>v(bs(h.changes_json))},{key:"note",label:"Note",render:h=>v(h.note||"\u2014")},{key:"actions",label:"",align:"right",render:h=>`<button type="button" class="ac-btn ac-btn--sm" data-ac-approve-profile="${v(h.id)}">Approve</button> <button type="button" class="ac-btn ac-btn--sm" data-ac-reject-profile="${v(h.id)}">Reject</button>`}],rows:o}):'<p class="ac-empty__message">No profile change request is waiting.</p>'})].join("");function i(h){let g=async(m,x,p,b)=>{try{await k.post(`${m}/${encodeURIComponent(x)}/${p?"approve":"reject"}`,{note:null}),y(`${b} ${p?"approved":"rejected"}.`,"success"),e.rerender()}catch(_){y(_.message,"error")}};h.querySelectorAll("[data-ac-approve-account]").forEach(m=>{m.addEventListener("click",()=>g("account-requests",m.dataset.acApproveAccount,!0,"The request was"))}),h.querySelectorAll("[data-ac-reject-account]").forEach(m=>{m.addEventListener("click",()=>g("account-requests",m.dataset.acRejectAccount,!1,"The request was"))}),h.querySelectorAll("[data-ac-approve-profile]").forEach(m=>{m.addEventListener("click",()=>g("profile-requests",m.dataset.acApproveProfile,!0,"The request was"))}),h.querySelectorAll("[data-ac-reject-profile]").forEach(m=>{m.addEventListener("click",()=>g("profile-requests",m.dataset.acRejectProfile,!1,"The request was"))})}return{markup:u,bind:i}}function bs(e){if(!e)return"\u2014";try{let a=typeof e=="string"?JSON.parse(e):e,t=Object.entries(a||{});return t.length?t.map(([n,s])=>`${n}: ${s}`).join(" \xB7 "):"\u2014"}catch{return String(e)}}var ut="teacherAccess",sa=4,aa=[{key:"overview",label:"Overview",hint:"The teacher dashboard."},{key:"questions",label:"Questions",hint:"The question bank."},{key:"subjects",label:"Subjects",hint:"The subject and category tree."},{key:"exams",label:"Exams",hint:"Creating and running exams."},{key:"classes",label:"Classes",hint:"The classes and their students."},{key:"games",label:"Games",hint:"The game arena."},{key:"kidsGames",label:"Kids Games",hint:"The Kids arena."},{key:"results",label:"Results",hint:"The results of the attempts."}],ta=[{key:"general",label:"General"},{key:"profile",label:"My profile"},{key:"presets",label:"Presets"},{key:"data",label:"Data"},{key:"realtime",label:"Realtime"},{key:"ai-generation",label:"AI generation"},{key:"users",label:"Users"},{key:"games",label:"Game presets"}];function Re(){return{rev:sa,tabs:{overview:!0,questions:!0,subjects:!0,exams:!0,classes:!0,games:!0,kidsGames:!0,results:!0,notifications:!0,activity:!1},settings:!0,settingsTabs:{general:!0,profile:!0,presets:!0,data:!0,realtime:!0,"ai-generation":!0,users:!0,games:!0}}}function vs(e){let a=Re();if(!e)return a;let t=e;if(typeof e=="string")try{t=JSON.parse(e)}catch{return a}return!t||typeof t!="object"?a:{rev:sa,tabs:{...a.tabs,...t.tabs||{}},settings:t.settings===void 0?a.settings:!!t.settings,settingsTabs:{...a.settingsTabs,...t.settingsTabs||{}}}}async function ht(){let e=await ne(),a=vs(e.get(ut)?.value),t=[q({title:"Teacher access control",subtitle:"Choose which dashboard tabs and settings tabs a teacher may reach in the classroom surface.",body:`<h4 class="ac-section-panel__title" style="margin:0 0 8px">Dashboard tabs</h4>
				${aa.map(s=>K({id:`set-teacher-tab-${s.key}`,label:s.label,hint:s.hint,checked:a.tabs[s.key]!==!1})).join("")}
				${K({id:"set-teacher-settings",label:"The settings modal",hint:"Whether a teacher may open the settings dialog at all.",checked:a.settings!==!1})}
				<h4 class="ac-section-panel__title" style="margin:20px 0 8px">Settings tabs</h4>
				${ta.map(s=>K({id:`set-teacher-settings-${s.key}`,label:s.label,checked:a.settingsTabs[s.key]!==!1})).join("")}
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
				</div>`})].join("");function n(s){let o=s.querySelector("[data-ac-teacher-access-status]"),f=()=>{let d={rev:sa,tabs:{...Re().tabs},settings:s.querySelector("#set-teacher-settings")?.getAttribute("aria-checked")==="true",settingsTabs:{...Re().settingsTabs}};for(let l of aa){let u=s.querySelector(`#set-teacher-tab-${l.key}`);u&&(d.tabs[l.key]=u.getAttribute("aria-checked")==="true")}for(let l of ta){let u=s.querySelector(`#set-teacher-settings-${l.key}`);u&&(d.settingsTabs[l.key]=u.getAttribute("aria-checked")==="true")}return d};s.querySelectorAll(".ac-switch").forEach(d=>{d.addEventListener("click",()=>{let l=d.getAttribute("aria-checked")==="true"?"false":"true";d.setAttribute("aria-checked",l)})});let r=async d=>{try{await F(ut,JSON.stringify(d)),o&&(o.textContent="Saved."),y("Teacher access saved.","success")}catch(l){o&&(o.textContent=l.message),y(l.message,"error")}};s.querySelector("[data-ac-save-teacher-access]")?.addEventListener("click",()=>{r(f())}),s.querySelector("[data-ac-reset-teacher-access]")?.addEventListener("click",async()=>{let d=Re();for(let u of aa){let i=s.querySelector(`#set-teacher-tab-${u.key}`);i&&i.setAttribute("aria-checked",d.tabs[u.key]?"true":"false")}let l=s.querySelector("#set-teacher-settings");l&&l.setAttribute("aria-checked",d.settings?"true":"false");for(let u of ta){let i=s.querySelector(`#set-teacher-settings-${u.key}`);i&&i.setAttribute("aria-checked",d.settingsTabs[u.key]?"true":"false")}await r(d)})}return{markup:t,bind:n}}var we=null,te=null;function ys(){return window.io?Promise.resolve(window.io):new Promise((e,a)=>{let t=document.createElement("script");t.src="/vendor/socket.io.min.js",t.async=!0,t.onload=()=>{window.io?e(window.io):a(new Error("The realtime client could not be loaded."))},t.onerror=()=>a(new Error("The realtime client could not be loaded.")),document.head.appendChild(t)})}async function mt({force:e=!1}={}){return te&&te.connected&&!e?te:(we&&!e||(we=(async()=>{try{let a=await ys();return te&&(te.disconnect(),te=null),te=a({auth:{token:Ue()},transports:["websocket","polling"],reconnectionAttempts:5,timeout:8e3}),te}catch{return te=null,null}finally{we=null}})()),we)}function ft(e,a=8e3){return e?e.connected?Promise.resolve(!0):new Promise(t=>{let n=setTimeout(()=>{e.off("connect",s),t(!1)},a),s=()=>{clearTimeout(n),t(!0)};e.on("connect",s)}):Promise.resolve(!1)}async function bt(e){let[a,t]=await Promise.all([ne(),k.get("devices").catch(()=>[])]),n=r=>{let d=a.get(r)?.value??"";return d==="false"?!1:d==="true"?!0:d},s=Array.isArray(t)?t:[],o=[q({title:"How the realtime channel works here",subtitle:"There is no second server to run.",body:`<div class="ac-alert ac-alert--info">
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
				</div>`}),q({title:"Realtime behaviour",subtitle:"How much this installation pushes to the connected devices.",body:`${K({id:"set-realtime-enabled",label:"Use this session for realtime broadcasts",hint:"Whether this administration session broadcasts and lists the connected devices.",checked:n("realtimeEnabled")!==!1})}
				${K({id:"set-realtime-autosync",label:"Auto-sync results",hint:"Automatically push the quiz results to the connected devices.",checked:n("autoSync")!==!1})}
				${K({id:"set-realtime-broadcast",label:"Broadcast updates",hint:"Push question and exam updates to the connected devices.",checked:n("broadcastUpdates")!==!1})}
				${K({id:"set-realtime-autosync-questions",label:"Auto-sync questions (training categories)",hint:"Periodically push the questions of the training-enabled categories to the connected devices.",checked:n("autoSyncQuestions")!==!1})}
				<div class="ac-field-grid" style="margin-top:14px">
					${A({id:"set-realtime-interval",label:"Sync interval (seconds)",type:"number",value:n("realtimeSyncInterval")||5,hint:"How often the data is synchronised between the devices."})}
					${A({id:"set-realtime-host",label:"Server host (fallback for the classroom panel)",value:n("serverHost")||"",placeholder:"http://192.168.1.5:3000",hint:"The realtime channel itself always connects to the address this page was served from. This value is only the fallback the classroom panel reads."})}
				</div>
				<div class="ac-toolbar" style="margin-bottom:0">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-save-realtime>Save realtime settings</button>
						<span class="ac-table__muted" data-ac-realtime-status></span>
					</div>
				</div>`}),q({title:"Recovery code",subtitle:'The code the "forgot password" panel on the sign-in page accepts. It is stored as a server-side hash.',body:`<div class="ac-field-grid">
					${A({id:"set-recovery-code",label:"New recovery code",type:"password",full:!0,hint:"Leave it blank to keep the existing code. The code itself is never sent back to a browser."})}
				</div>
				<div class="ac-toolbar" style="margin-bottom:0">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-save-recovery>Save recovery code</button>
						<span class="ac-table__muted" data-ac-recovery-status></span>
					</div>
				</div>`}),q({title:"Connected devices",subtitle:"The machines currently connected to this installation.",actions:'<button type="button" class="ac-btn ac-btn--sm" data-ac-realtime-refresh>Refresh</button>',body:`<div class="ac-toolbar" style="margin-bottom:12px">
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
					${s.length?gt(s):'<p class="ac-empty__message">No device has registered with this installation yet.</p>'}
				</div>`})].join("");function f(r){let d=r.querySelector("[data-ac-realtime-status]"),l=r.querySelector("[data-ac-realtime-connection]"),u=r.querySelector("[data-ac-realtime-devices]");r.querySelectorAll(".ac-switch").forEach(p=>{p.addEventListener("click",()=>{let b=p.getAttribute("aria-checked")==="true"?"false":"true";p.setAttribute("aria-checked",b)})});let i=p=>r.querySelector(`#${p}`)?.getAttribute("aria-checked")==="true";r.querySelector("[data-ac-save-realtime]")?.addEventListener("click",async()=>{try{await F("realtimeEnabled",String(i("set-realtime-enabled"))),await F("autoSync",String(i("set-realtime-autosync"))),await F("broadcastUpdates",String(i("set-realtime-broadcast"))),await F("autoSyncQuestions",String(i("set-realtime-autosync-questions")));let p=r.querySelector("#set-realtime-interval")?.value??"5";await F("realtimeSyncInterval",String(Math.max(1,Number(p)||5))),await F("serverHost",r.querySelector("#set-realtime-host")?.value??""),d&&(d.textContent="Saved."),y("Realtime settings saved.","success")}catch(p){d&&(d.textContent=p.message),y(p.message,"error")}}),r.querySelector("[data-ac-save-recovery]")?.addEventListener("click",async()=>{let p=r.querySelector("[data-ac-recovery-status]"),b=r.querySelector("#set-recovery-code")?.value?.trim()??"";if(!b){y("Type a new recovery code, or leave the field alone to keep the current one.","error");return}try{await k.post("auth/recover/set",{code:b}),r.querySelector("#set-recovery-code").value="",p&&(p.textContent="Saved."),y("Recovery code saved.","success")}catch(_){p&&(p.textContent=_.message),y(_.message,"error")}});let h=!1,g=async({force:p=!1}={})=>{l&&(l.textContent="Connecting\u2026");let b=await mt({force:p});return b?await ft(b)?(b.emit("identify",{role:"admin"}),l&&(l.textContent="Connected."),b):(l&&(l.textContent="Could not connect to the realtime channel."),null):(l&&(l.textContent="The realtime client could not be loaded."),null)},m=async()=>{try{let p=await k.get("devices"),b=Array.isArray(p)?p:[],_=h?b.filter(S=>S.status==="active"||S.online):b;u&&(u.innerHTML=_.length?gt(_):'<p class="ac-empty__message">No device matches the current filter.</p>')}catch(p){u&&(u.innerHTML=`<p class="ac-empty__message">${v(p.message)}</p>`)}};r.querySelector("[data-ac-realtime-refresh]")?.addEventListener("click",m),r.querySelector("[data-ac-realtime-online-only]")?.addEventListener("click",async()=>{h=!h;let p=r.querySelector("[data-ac-realtime-online-only]");p&&(p.textContent=h?"Show all devices":"Show online only"),await m()}),r.querySelector("[data-ac-realtime-test]")?.addEventListener("click",async()=>{await g({force:!0})&&(y("The realtime channel answered.","success"),await m())});let x=async(p,b,_)=>{let S=await g();if(!S){y("The realtime channel is not connected.","error");return}try{S.emit(p,b||{}),y(`${_} was sent to the connected devices.`,"success")}catch($){y($.message,"error")}};r.querySelector("[data-ac-realtime-sync-all]")?.addEventListener("click",async()=>{await x("admin:refreshStudentBootstrap",{},"The full synchronisation"),await x("admin:syncUsers",{quizUsers:[]},"The user accounts"),await x("admin:syncGamification",{},"The gamification")}),r.querySelector("[data-ac-realtime-sync-users]")?.addEventListener("click",()=>x("admin:syncUsers",{quizUsers:[]},"The user accounts")),r.querySelector("[data-ac-realtime-sync-classroom]")?.addEventListener("click",()=>x("admin:refreshStudentBootstrap",{},"The classroom data")),r.querySelector("[data-ac-realtime-sync-games]")?.addEventListener("click",async()=>{await x("admin:syncGames",{},"The regular games"),await x("admin:syncKidsGames",{},"The Kids games")}),n("realtimeEnabled")!==!1&&g().then(async p=>{p&&p.on("clients:update",()=>{m()})}).catch(()=>{})}return{markup:o,bind:f}}function gt(e){return E({columns:[{key:"hostname",label:"Device",render:a=>`<span class="ac-table__primary">${v(a.hostname||a.name||"\u2014")}</span>`},{key:"device_type",label:"Type",render:a=>v(a.device_type||a.platform||"\u2014")},{key:"assignedUser",label:"Assigned to",render:a=>v(a.assignedUser?.name||a.assignedUser?.username||"unassigned")},{key:"ip_address",label:"Address",render:a=>`<code>${v(a.ip_address||a.ip||"\u2014")}</code>`},{key:"status",label:"Status",render:a=>`<span class="ac-badge ac-badge--${a.status==="blocked"?"danger":""}">${v(a.status||"\u2014")}</span>`}],rows:e,empty:"No device matches the current filter."})}var wt="quizPresets",vt=[{value:"quiz",label:"Quiz"},{value:"battle",label:"Battle"},{value:"tournament",label:"Tournament"},{value:"kids",label:"Kids game"}],yt=[{value:"individual",label:"Individual"},{value:"team",label:"Team"},{value:"tournament",label:"Tournament"}];function Oe(){try{let e=localStorage.getItem(wt),a=e?JSON.parse(e):[];return Array.isArray(a)?a:[]}catch{return[]}}function na(e){try{return localStorage.setItem(wt,JSON.stringify(e)),!0}catch{return!1}}var _t=[{key:"name",label:"Name",type:"text",width:"full"},{key:"totalQuestions",label:"Questions",type:"number"},{key:"timerMode",label:"Timer mode",type:"select",options:[{value:"fixed",label:"One limit for the whole quiz"},{value:"per-question",label:"A limit per question"},{value:"none",label:"No limit"}]},{key:"perQuestionTime",label:"Seconds per question",type:"number"},{key:"timeLimit",label:"Total time (seconds)",type:"number"},{key:"penalty",label:"Penalty per wrong answer",type:"number"},{key:"passingScore",label:"Passing score (%)",type:"number"},{key:"shuffleQuestions",label:"Shuffle the questions",type:"checkbox"},{key:"showExplanations",label:"Show the explanations",type:"checkbox"},{key:"primaryColor",label:"Primary colour",type:"color"},{key:"secondaryColor",label:"Secondary colour",type:"color"},{key:"backgroundColor",label:"Background colour",type:"color"},{key:"textColor",label:"Text colour",type:"color"},{key:"inputFocusColor",label:"Input focus colour",type:"color"},{key:"fontFamily",label:"Typeface",type:"text",width:"full"},{key:"welcomeTitle",label:"Welcome title",type:"text",width:"full"},{key:"welcomeMessage",label:"Welcome message",type:"text",width:"full"}],xt={name:"",totalQuestions:5,timerMode:"fixed",perQuestionTime:60,timeLimit:300,penalty:0,passingScore:50,shuffleQuestions:!0,showExplanations:!1,primaryColor:"#2563eb",secondaryColor:"#1e40af",backgroundColor:"#f8fafc",textColor:"#1e293b",inputFocusColor:"#3b82f6",fontFamily:"'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",welcomeTitle:"",welcomeMessage:""};function _s(e,a){let t=`preset-${a.key}`,n=e?.[a.key]??xt[a.key];return a.type==="checkbox"?`<label class="ac-check">
			<input type="checkbox" id="${v(t)}" ${n?"checked":""} />
			<span><span class="ac-check__label">${v(a.label)}</span></span>
		</label>`:a.type==="select"?`<div class="ac-field">
			<label class="ac-field__label" for="${v(t)}">${v(a.label)}</label>
			<select class="ac-select" id="${v(t)}">
				${a.options.map(s=>`<option value="${v(s.value)}"${String(s.value)===String(n)?" selected":""}>${v(s.label)}</option>`).join("")}
			</select>
		</div>`:`<div class="ac-field${a.width==="full"?" ac-field--full":""}">
		<label class="ac-field__label" for="${v(t)}">${v(a.label)}</label>
		<input class="ac-input ac-input--full" id="${v(t)}" type="${v(a.type)}" value="${v(n??"")}" autocomplete="off" />
	</div>`}async function kt(e){let[a,t]=await Promise.all([k.get("game-presets").catch(()=>[]),ne()]),n=Array.isArray(a)?a:[],s=Oe(),o=t.get("trainingPresetId")?.value??"",f=[q({title:"Quiz presets",subtitle:"The ready-made quick-quiz configurations. They are stored in this browser and are shared with the classroom panel.",actions:'<button type="button" class="ac-btn ac-btn--sm ac-btn--primary" data-ac-preset-new>New quiz preset</button>',body:`${s.length?E({columns:[{key:"name",label:"Preset",render:d=>`<span class="ac-table__primary">${v(d.name||"")}</span><br><span class="ac-table__muted">${v(d.id||"")}</span>`},{key:"totalQuestions",label:"Questions",align:"right",render:d=>String(d.totalQuestions??"\u2014")},{key:"timeLimit",label:"Time limit (s)",align:"right",render:d=>String(d.timeLimit??"\u2014")},{key:"passingScore",label:"Passing score",align:"right",render:d=>String(d.passingScore??"\u2014")},{key:"actions",label:"",align:"right",render:d=>`<button type="button" class="ac-btn ac-btn--sm" data-ac-preset-edit="${v(d.id)}">Edit</button> <button type="button" class="ac-btn ac-btn--sm" data-ac-preset-rename="${v(d.id)}">Rename</button> <button type="button" class="ac-btn ac-btn--sm" data-ac-preset-delete="${v(d.id)}">Delete</button>`}],rows:s}):'<p class="ac-empty__message">No quiz preset is stored in this browser yet. Create one here, or in the classroom panel.</p>'}
			<div class="ac-field-grid" style="margin-top:16px">
				${A({id:"set-training-preset",label:"The preset used for training mode",value:o,hint:"The id of the quiz preset a training session starts from. Leave it blank for the default."})}
			</div>
			<div class="ac-toolbar" style="margin-bottom:0">
				<div class="ac-toolbar__row">
					<button type="button" class="ac-btn ac-btn--primary" data-ac-save-training-preset>Save training preset</button>
					<span class="ac-table__muted" data-ac-training-preset-status></span>
				</div>
			</div>`}),q({title:"Game presets",subtitle:"The arena configurations this organization shares.",actions:'<button type="button" class="ac-btn ac-btn--sm ac-btn--primary" data-ac-game-preset-new>New game preset</button>',body:n.length?E({columns:[{key:"name",label:"Preset",render:d=>`<span class="ac-table__primary">${v(d.name||"")}</span><br><span class="ac-table__muted">${v(d.game_type||"")} \xB7 ${v(d.game_mode||"")}</span>`},{key:"is_default",label:"Default",render:d=>d.is_default?'<span class="ac-badge ac-badge--success">yes</span>':'<span class="ac-badge">no</span>'},{key:"actions",label:"",align:"right",render:d=>`<button type="button" class="ac-btn ac-btn--sm" data-ac-game-preset-edit="${v(d.id)}">Edit</button> <button type="button" class="ac-btn ac-btn--sm" data-ac-game-preset-delete="${v(d.id)}">Delete</button>`}],rows:n}):'<p class="ac-empty__message">No game preset yet.</p>'})].join("");function r(d){let l=i=>{let h=!i,g={...xt,...i||{}},m=j({title:h?"Create a quiz preset":"Edit the quiz preset",subtitle:"A preset is stored in this browser and is shared with the classroom panel, so it is offered there too.",wide:!0,body:`<div class="ac-field-grid">
						${_t.map(p=>_s(g,p)).join("")}
					</div>`,footer:`
					<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
					<button type="button" class="ac-btn ac-btn--primary" data-ac-confirm>${h?"Create the preset":"Save the preset"}</button>
				`}),x=m.root;x.querySelector("[data-ac-cancel]").addEventListener("click",m.close),x.querySelector("[data-ac-confirm]").addEventListener("click",()=>{let p={...g};for(let _ of _t){let S=x.querySelector(`#preset-${_.key}`);S&&(_.type==="checkbox"?p[_.key]=S.checked:_.type==="number"?p[_.key]=S.value===""?0:Number(S.value):p[_.key]=S.value)}if(!String(p.name||"").trim()){y("A preset needs a name.","error");return}let b=Oe();if(h)p.id=`preset-${Date.now()}`,p.createdAt=new Date().toISOString(),b.push(p);else{let _=b.findIndex(S=>S.id===i.id);_!==-1&&(b[_]={...b[_],...p})}if(!na(b)){y("The browser refused to save the preset.","error");return}m.close(),y(h?"The preset was created.":"The preset was saved.","success"),e.rerender()})};d.querySelector("[data-ac-preset-new]")?.addEventListener("click",()=>l(null)),d.querySelectorAll("[data-ac-preset-edit]").forEach(i=>{i.addEventListener("click",()=>{let h=s.find(g=>g.id===i.dataset.acPresetEdit);h&&l(h)})}),d.querySelectorAll("[data-ac-preset-rename]").forEach(i=>{i.addEventListener("click",()=>{let h=i.dataset.acPresetRename,g=Oe(),m=g.find(p=>p.id===h);if(!m)return;let x=j({title:"Rename this preset",body:`<div class="ac-field">
							<label class="ac-field__label" for="ac-preset-name">Name</label>
							<input class="ac-input ac-input--full" id="ac-preset-name" type="text" value="${v(m.name||"")}" />
						</div>`,footer:`
						<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
						<button type="button" class="ac-btn ac-btn--primary" data-ac-confirm>Rename</button>
					`});x.root.querySelector("[data-ac-cancel]").addEventListener("click",x.close),x.root.querySelector("[data-ac-confirm]").addEventListener("click",()=>{let p=x.root.querySelector("#ac-preset-name").value.trim();if(!p){y("A preset needs a name.","error");return}m.name=p,na(g)?(x.close(),y("Preset renamed.","success"),e.rerender()):y("The browser refused to save the preset.","error")})})}),d.querySelectorAll("[data-ac-preset-delete]").forEach(i=>{i.addEventListener("click",async()=>{let h=i.dataset.acPresetDelete;if(!await M({title:"Delete this preset?",message:"It is removed from this browser. The classroom panel will not offer it any more.",confirmLabel:"Delete preset",danger:!0}))return;let m=Oe().filter(x=>x.id!==h);na(m)?(y("Preset deleted.","success"),e.rerender()):y("The browser refused to save the preset.","error")})}),d.querySelector("[data-ac-save-training-preset]")?.addEventListener("click",async()=>{let i=d.querySelector("[data-ac-training-preset-status]");try{await F("trainingPresetId",d.querySelector("#set-training-preset")?.value??""),i&&(i.textContent="Saved."),y("The training preset was saved.","success")}catch(h){i&&(i.textContent=h.message),y(h.message,"error")}});let u=i=>{let h=j({title:i?"Edit the game preset":"New game preset",body:`<div class="ac-field-grid">
						${A({id:"set-game-name",label:"Name",value:i?.name??"",full:!0})}
						${D({id:"set-game-type",label:"Game type",options:vt,value:i?.game_type??vt[0]?.value??""})}
						${D({id:"set-game-mode",label:"Game mode",options:yt,value:i?.game_mode??yt[0]?.value??""})}
						${A({id:"set-game-rules",label:"Rules (JSON)",value:ws(i?.rules_json),full:!0,hint:"The rule set of the arena. It is stored as JSON."})}
					</div>
					${Je({id:"set-game-default",label:"The default preset",hint:"Used when a game starts without an explicit preset.",checked:!!i?.is_default})}`,footer:`
					<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
					<button type="button" class="ac-btn ac-btn--primary" data-ac-confirm>${i?"Save the preset":"Create the preset"}</button>
				`});h.root.querySelector("[data-ac-cancel]").addEventListener("click",h.close),h.root.querySelector("[data-ac-confirm]").addEventListener("click",async()=>{let g=h.root.querySelector("#set-game-name").value.trim();if(!g){y("A preset needs a name.","error");return}let m={name:g,game_type:h.root.querySelector("#set-game-type").value,game_mode:h.root.querySelector("#set-game-mode").value,rules:h.root.querySelector("#set-game-rules").value,is_default:h.root.querySelector("#set-game-default").checked};try{i?await k.patch(`game-presets/${encodeURIComponent(i.id)}`,m):await k.post("game-presets",m),h.close(),y("The game preset was saved.","success"),e.rerender()}catch(x){y(x.message,"error")}})};d.querySelector("[data-ac-game-preset-new]")?.addEventListener("click",()=>u(null)),d.querySelectorAll("[data-ac-game-preset-edit]").forEach(i=>{i.addEventListener("click",()=>{let h=n.find(g=>g.id===i.dataset.acGamePresetEdit);h&&u(h)})}),d.querySelectorAll("[data-ac-game-preset-delete]").forEach(i=>{i.addEventListener("click",async()=>{if(await M({title:"Delete this game preset?",message:"It is removed for the whole organization.",confirmLabel:"Delete preset",danger:!0}))try{await k.del(`game-presets/${encodeURIComponent(i.dataset.acGamePresetDelete)}`),y("The game preset was deleted.","success"),e.rerender()}catch(g){y(g.message,"error")}})})}return{markup:f,bind:r}}function ws(e){if(!e)return"";if(typeof e=="object")return JSON.stringify(e,null,2);try{return JSON.stringify(JSON.parse(e),null,2)}catch{return String(e)}}async function Tt(e){let[a,t]=await Promise.all([k.get("generated-documents?limit=200").catch(()=>null),k.get("archives").catch(()=>null)]),n=Array.isArray(a?.data)?a.data:Array.isArray(a)?a:[],s=Array.isArray(t?.items)?t.items:[],o=[q({title:"Recent documents",subtitle:"Every booklet, preparation sheet and exam paper the platform has generated. The title opens the file; the folder shows where it lives.",body:n.length?E({columns:[{key:"title",label:"Document",render:r=>{let d=r.url||"",l=v(r.title||r.file_name||"Document");return d?`<a class="ac-table__primary" href="${v(d)}" target="_blank" rel="noopener">${l}</a>`:`<span class="ac-table__primary">${l}</span>`}},{key:"kind",label:"Kind",render:r=>v(r.kind||"\u2014")},{key:"rel_path",label:"Folder",render:r=>`<code class="ac-table__muted" title="${v(r.rel_path||"")}">${v(Ss(r.rel_path))}</code>`},{key:"size_bytes",label:"Size",align:"right",render:r=>$t(r.size_bytes)},{key:"created_at",label:"Created",render:r=>v(St(r.created_at))},{key:"actions",label:"",align:"right",render:r=>`<a class="ac-btn ac-btn--sm" href="${v(`/api/v1/generated-documents/${encodeURIComponent(r.id)}/download`)}">Download</a>`}],rows:n}):'<p class="ac-empty__message">No document has been generated yet. The course booklets, the preparation sheets and the exam papers appear here once they are produced.</p>'}),q({title:"Export",subtitle:"A snapshot of this organization, taken from the database.",body:`<div class="ac-alert ac-alert--info">
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
				</div>`}),q({title:"Import",subtitle:"Restore a backup exported from this application.",body:`<div class="ac-field-grid">
					${$s("ac-import-file","Backup file",'A .zip produced by "Export as ZIP", or a .json produced by "Export as JSON".')}
				</div>
				<div class="ac-toolbar" style="margin-bottom:0">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-import-run>Import the backup</button>
						<span class="ac-table__muted" data-ac-import-status></span>
					</div>
				</div>`}),q({title:"School-year archives",subtitle:"A frozen snapshot of a school year, kept per year.",actions:'<button type="button" class="ac-btn ac-btn--sm ac-btn--primary" data-ac-archive-new>Create an archive</button>',body:s.length?E({columns:[{key:"label",label:"Archive",render:r=>`<span class="ac-table__primary">${v(r.label||`Archive ${r.year}`)}</span><br><span class="ac-table__muted">${v(r.year)}</span>`},{key:"size_bytes",label:"Size",align:"right",render:r=>$t(r.size_bytes)},{key:"created_at",label:"Created",render:r=>v(St(r.created_at))},{key:"actions",label:"",align:"right",render:r=>`<button type="button" class="ac-btn ac-btn--sm" data-ac-archive-view="${v(r.year)}">Open</button> <button type="button" class="ac-btn ac-btn--sm" data-ac-archive-delete="${v(r.year)}">Delete</button>`}],rows:s}):'<p class="ac-empty__message">No archive yet.</p>'}),q({title:"Factory reset",subtitle:"Erase this organization's content and keep only its administrators.",body:`<div class="ac-alert ac-alert--danger">
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
				</div>`})].join("");function f(r){let d=r.querySelector("[data-ac-export-status]"),l=r.querySelector("[data-ac-import-status]"),u=async()=>{let i=await k.get("console/export");if(!i?.data)throw new Error("The export was empty.");return i.data};r.querySelector("[data-ac-export-json]")?.addEventListener("click",async()=>{d&&(d.textContent="Collecting\u2026");try{let i=await u();ra(new Blob([JSON.stringify(i,null,2)],{type:"application/json"}),`quiz-app-backup-${i.timestamp.slice(0,10)}.json`),d&&(d.textContent="The backup was downloaded."),y("Backup created.","success")}catch(i){d&&(d.textContent=i.message),y(i.message,"error")}}),r.querySelector("[data-ac-export-zip]")?.addEventListener("click",async()=>{d&&(d.textContent="Packaging\u2026");try{let i=await u(),h=await fetch("/api/v1/exports/bundle",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json",Authorization:`Bearer ${window.APP_CONFIG?.token||oa()}`},body:JSON.stringify({data:i.data})});if(!h.ok)throw new Error(`The server refused the export (${h.status}).`);let g=await h.blob();ra(g,`quiz-app-backup-${i.timestamp.slice(0,10)}.zip`),d&&(d.textContent="The backup was downloaded."),y("Backup created.","success")}catch(i){d&&(d.textContent=i.message),y(i.message,"error")}}),r.querySelectorAll("[data-ac-file-input]").forEach(i=>{i.addEventListener("change",()=>{let h=r.querySelector(`[data-ac-file-name="${i.dataset.acFileInput}"]`);if(!h)return;let g=i.files?.[0];h.textContent=g?g.name:"No file chosen yet",h.classList.toggle("is-set",!!g)})}),r.querySelector("[data-ac-import-run]")?.addEventListener("click",async()=>{let h=r.querySelector("#ac-import-file")?.files?.[0];if(!h){y("Choose a backup file first.","error");return}if(await M({title:"Import this backup?",message:"The records of the backup are written over the records of this organization. The accounts that already exist keep their password.",confirmLabel:"Import the backup",danger:!0})){l&&(l.textContent="Importing\u2026");try{let m=null,x=null;if(h.name.toLowerCase().endsWith(".zip")){let _=await fetch("/api/v1/imports/bundle",{method:"POST",credentials:"include",headers:{"Content-Type":"application/zip",Authorization:`Bearer ${oa()}`},body:h});if(!_.ok)throw new Error(`The server refused the backup (${_.status}).`);let S=await _.json();m=S.data,x=S.uploadToken}else{let _=JSON.parse(await h.text());m=_?.data?_.data:_}if(!m||typeof m!="object")throw new Error("The backup held no data.");let p=await ks(m);x&&await fetch(`/api/v1/imports/bundle/${encodeURIComponent(x)}/commit`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json",Authorization:`Bearer ${oa()}`},body:JSON.stringify({uploadToken:x})});let b=Object.entries(p).filter(([,_])=>_>0).map(([_,S])=>`${S} ${_}`).join(", ");l&&(l.textContent=b?`Imported: ${b}.`:"Nothing to import."),y("The backup was imported.","success"),e.rerender()}catch(m){l&&(l.textContent=m.message),y(m.message,"error")}}}),r.querySelector("[data-ac-archive-new]")?.addEventListener("click",async()=>{let i=prompt("Which school year? (YYYY-YYYY)",Ts());if(i)try{await k.post("archives",{year:i,label:`Archive ${i}`,data:{}}),y("The archive was created.","success"),e.rerender()}catch(h){y(h.message,"error")}}),r.querySelectorAll("[data-ac-archive-view]").forEach(i=>{i.addEventListener("click",async()=>{try{let h=await k.get(`archives/${encodeURIComponent(i.dataset.acArchiveView)}`),g=new Blob([JSON.stringify(h.data??{},null,2)],{type:"application/json"});ra(g,`archive-${i.dataset.acArchiveView}.json`),y("The archive was downloaded.","success")}catch(h){y(h.message,"error")}})}),r.querySelectorAll("[data-ac-archive-delete]").forEach(i=>{i.addEventListener("click",async()=>{if(await M({title:"Delete this archive?",message:"The frozen snapshot of that year is removed. It cannot be recovered.",confirmLabel:"Delete the archive",danger:!0}))try{await k.del(`archives/${encodeURIComponent(i.dataset.acArchiveDelete)}`),y("The archive was deleted.","success"),e.rerender()}catch(g){y(g.message,"error")}})}),r.querySelector("[data-ac-reset-data]")?.addEventListener("click",async()=>{let i=r.querySelector("[data-ac-reset-status]");if(await M({title:"Reset every record of this organization?",message:"The questions, the exams, the classes, the results, the games, the documents and the archives are erased. The administrator accounts are kept. This cannot be undone.",detail:"Take a backup first if there is anything here you want to keep.",confirmLabel:"Reset the data",danger:!0})){i&&(i.textContent="Resetting\u2026");try{let g=await k.post("admin/reset-data",{confirm:"RESET"});return i&&(i.textContent="The organization was reset."),y("The organization was reset.","success"),e.rerender(),g}catch(g){i&&(i.textContent=g.message),y(g.message,"error")}}})}return{markup:o,bind:f}}var xs=["categories","classes","users","questions","exams","results","games","tournaments","notifications","gamification","settings"];async function ks(e){let a={};for(let t of xs){let n=Array.isArray(e[t])?e[t]:[];if(!n.length){a[t]=0;continue}try{await k.post(`bulk/${t}`,{items:n}),a[t]=n.length}catch{a[t]=0}}return a}function $s(e,a,t){return`<div class="ac-field ac-field--full">
		<label class="ac-field__label" for="${v(e)}">${v(a)}</label>
		<label class="ac-file" for="${v(e)}">
			<input id="${v(e)}" type="file" accept=".json,.zip" data-ac-file-input="${v(e)}" />
			<span class="ac-btn ac-file__btn" aria-hidden="true">Choose a file</span>
			<span class="ac-file__name" data-ac-file-name="${v(e)}">No file chosen yet</span>
		</label>
		<p class="ac-field__hint">${v(t)}</p>
	</div>`}function ra(e,a){let t=URL.createObjectURL(e),n=document.createElement("a");n.href=t,n.download=a,document.body.appendChild(n),n.click(),n.remove(),setTimeout(()=>URL.revokeObjectURL(t),2e3)}function oa(){try{let e=sessionStorage.getItem("quizSession")||localStorage.getItem("quizSession"),a=e?JSON.parse(e):null;if(a?.token)return a.token}catch{}return localStorage.getItem("quizAuthToken")||""}function Ss(e){let a=String(e||""),t=a.lastIndexOf("/");return t===-1?"(root)":a.slice(0,t)}function $t(e){let a=Number(e);return!Number.isFinite(a)||a<=0?"\u2014":a<1024?`${a} B`:a<1024*1024?`${Math.round(a/1024)} KB`:`${Math.round(a/1024/1024*10)/10} MB`}function St(e){if(!e)return"\u2014";let a=new Date(e);return Number.isNaN(a.getTime())?"\u2014":a.toLocaleDateString()}function Ts(){let e=new Date,a=e.getMonth()>=8?e.getFullYear():e.getFullYear()-1;return`${a}-${a+1}`}var ge=e=>`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${e}</svg>`,se=[{id:"server",label:"Server & network",icon:ge('<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><path d="M6 6h.01M6 18h.01"/>')},{id:"access",label:"Student access",icon:ge('<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>')},{id:"firewall",label:"Windows firewall",icon:ge('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>')},{id:"database",label:"Database safety",icon:ge('<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>')},{id:"offline",label:"Offline & CDNs",icon:ge('<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>')},{id:"summary",label:"Summary",icon:ge('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>')}];async function qt(e,a){let t=await k.get("admin/setup/diagnostics"),n=t?.data||t||{},s=se.some(r=>r.id===a?.query?.step)?a.query.step:se[0].id,o=[As(s),`<div data-ac-setup-step>${qs(s,n,e)}</div>`].join("");function f(r){r.querySelectorAll("[data-ac-setup-goto]").forEach(u=>{u.addEventListener("click",()=>{Y(`/settings?section=setup&step=${encodeURIComponent(u.dataset.acSetupGoto)}`,{replace:!0})})});let d=r.querySelector("[data-ac-setup-next]");d&&d.addEventListener("click",()=>{let u=se.findIndex(h=>h.id===s),i=se[Math.min(se.length-1,u+1)];Y(`/settings?section=setup&step=${encodeURIComponent(i.id)}`,{replace:!0})});let l=r.querySelector("[data-ac-setup-back]");l&&l.addEventListener("click",()=>{let u=se.findIndex(h=>h.id===s),i=se[Math.max(0,u-1)];Y(`/settings?section=setup&step=${encodeURIComponent(i.id)}`,{replace:!0})}),r.querySelector("[data-ac-copy-lan]")?.addEventListener("click",async()=>{await At(r.querySelector("#set-lan-address")?.value??""),y("The address was copied.","success")}),r.querySelector("[data-ac-copy-firewall]")?.addEventListener("click",async()=>{await At(r.querySelector("#set-firewall-command")?.value??""),y("The command was copied.","success")}),r.querySelector("[data-ac-show-qr]")?.addEventListener("click",async()=>{let u=r.querySelector("[data-ac-qr]");if(!u)return;let i=r.querySelector("#set-lan-address")?.value??"";u.hidden=!1,u.innerHTML='<p class="ac-field__hint">Generating the QR code\u2026</p>';try{await js();let h=window.qrcode(0,"M");h.addData(i),h.make(),u.innerHTML=h.createSvgTag(4,8)}catch(h){u.innerHTML=`<pre class="ac-pre">${v(i)}</pre><p class="ac-field__hint">${v(h.message)} \u2014 use the address above.</p>`}}),r.querySelectorAll("[data-ac-network-profile]").forEach(u=>{u.addEventListener("click",async()=>{try{await k.post("admin/setup/network-profile",{interfaceAlias:u.dataset.acNetworkProfile,category:u.dataset.acNetworkCategory||"Private"}),y("The network profile was changed.","success"),e.rerender()}catch(i){y(i.message,"error")}})}),r.querySelector("[data-ac-setup-backup]")?.addEventListener("click",async()=>{let u=r.querySelector("[data-ac-setup-backup-status]");u&&(u.textContent="Collecting\u2026");try{let i=(await k.get("console/export"))?.data;if(!i)throw new Error("The export was empty.");Ds(new Blob([JSON.stringify(i,null,2)],{type:"application/json"}),`quiz-app-backup-${i.timestamp.slice(0,10)}.json`),u&&(u.textContent="The backup was downloaded."),y("Backup created.","success")}catch(i){u&&(u.textContent=i.message),y(i.message,"error")}}),r.querySelectorAll("[data-ac-firewall-check]").forEach(u=>{u.addEventListener("change",()=>{try{let g=localStorage.getItem(Ie)||"[]",m=JSON.parse(g),x=u.dataset.acFirewallCheck,p=m.indexOf(x);u.checked&&p===-1&&m.push(x),!u.checked&&p!==-1&&m.splice(p,1),localStorage.setItem(Ie,JSON.stringify(m))}catch{}let i=ia(),h=r.querySelector("[data-ac-firewall-status]");h&&(h.textContent=i?"All the manual checks are completed.":"Complete the checklist on the Firewall step.")})})}return{markup:o,bind:f}}function As(e){let a=se.findIndex(t=>t.id===e);return`<nav class="ac-stepper" aria-label="Setup steps">
		${se.map((t,n)=>`<button type="button" class="ac-stepper__step${t.id===e?" is-active":""}${n<a?" is-done":""}" data-ac-setup-goto="${v(t.id)}">
			<span class="ac-stepper__icon" aria-hidden="true">${t.icon}</span>
			<span class="ac-stepper__label">${v(t.label)}</span>
		</button>`).join("")}
	</nav>`}function qs(e,a,t){let n=a.port||3e3,s=Array.isArray(a.lan)?a.lan:[],o=s.find(r=>r.recommended)||s[0]||null,f=o?`http://${o.address}:${n}`:`http://localhost:${n}`;switch(e){case"server":return Es(a);case"access":return Ls(a,s,o,f,n);case"firewall":return zs(a,n);case"database":return Cs(a);case"offline":return Ps(a);case"summary":return Ms(a,s);default:return q({title:"Unknown step",body:"<p>That step does not exist.</p>"})}}function Es(e){let a=e.process||{},t=e.hostBinding==="0.0.0.0",n=e.nodeEnv!=="production";return q({title:"Server & network",subtitle:"This server must listen on every network interface so the students can reach it over Wi-Fi.",body:`<div class="ac-defs">
				${Q("Bind address",e.hostBinding||"0.0.0.0",t?"ok":"warn")}
				${Q("Port",String(Os(e)),"ok")}
				${Q("NODE_ENV",e.nodeEnv||"development",n?"ok":"warn")}
				${Q("Cookies",e.cookieSecure?"Secure (HTTPS only)":"Not secure (HTTP works)",e.cookieSecure?"warn":"ok")}
				${Q("Platform",a.platform||"\u2014")}
				${Q("Hostname",a.hostname||"\u2014")}
			</div>
			${e.cookieSecure?'<div class="ac-alert ac-alert--warning" style="margin-top:14px"><div class="ac-alert__body"><p class="ac-alert__title">Production mode detected</p><p class="ac-alert__text">The refresh cookie is marked <code>Secure</code>, so a browser will not send it over plain HTTP. For a classroom installation use <code>NODE_ENV=development</code>; for production, use HTTPS or a reverse proxy.</p></div></div>':""}`})}function Ls(e,a,t,n,s){return a.length?q({title:"Student access",subtitle:"The students must use the server's LAN address, not localhost. Share this URL, or let them scan the QR code.",body:`<div class="ac-primary-url">
				<p class="ac-primary-url__label">Students should open</p>
				<p class="ac-primary-url__value">${v(n)}</p>
				${t?`<p class="ac-primary-url__note">Recommended \u2014 the ${v(t.interface)} interface (a physical adapter).</p>`:""}
				<div class="ac-quick-actions" style="margin-top:12px">
					<button type="button" class="ac-btn" data-ac-copy-lan>Copy the address</button>
					<button type="button" class="ac-btn" data-ac-show-qr>Show the QR code</button>
				</div>
			</div>
			<div data-ac-qr hidden style="margin-top:16px"></div>
			${a.length>1?`<h4 class="ac-section-panel__title" style="margin:20px 0 8px">Every available address</h4>
					${E({columns:[{key:"interface",label:"Interface"},{key:"address",label:"URL",render:o=>`<code>http://${v(o.address)}:${v(String(s))}</code>`},{key:"type",label:"Type"},{key:"recommended",label:"Recommended",render:o=>o.recommended?'<span class="ac-badge ac-badge--success">yes</span>':o.type==="virtual"?'<span class="ac-badge ac-badge--warning">virtual</span>':'<span class="ac-badge">no</span>'}],rows:a})}`:""}
			<div class="ac-alert ac-alert--info" style="margin-top:16px"><div class="ac-alert__body"><p class="ac-alert__title">The students must not use <code>localhost</code></p><p class="ac-alert__text">On their own device <code>localhost</code> means the device itself. They must use the server's Wi-Fi address above. Virtual adapters (Hyper-V, WSL, Docker) are not reachable from another device.</p></div></div>`}):q({title:"Student access",subtitle:"The address the students use.",body:'<div class="ac-alert ac-alert--warning"><div class="ac-alert__body"><p class="ac-alert__title">No LAN address detected</p><p class="ac-alert__text">The server is not connected to Wi-Fi or Ethernet, so no other device can reach it.</p></div></div>'})}var Et=[{id:"rule",label:"The inbound rule for the port exists",hint:"Run the PowerShell command above once, as an administrator."},{id:"private",label:"The network profile is Private",hint:"The server can set this for you with the button in the table above."},{id:"router",label:"The router allows the classroom Wi-Fi to reach the server",hint:"Some school routers block device-to-device traffic. Only the operator can see the router."},{id:"tested",label:"A student device opened the address above successfully",hint:"The real proof: open the student URL on a phone or a tablet on the classroom Wi-Fi."}],Ie="quizConsoleFirewallChecks";function ia(){try{let e=localStorage.getItem(Ie)||"[]",a=JSON.parse(e);return Array.isArray(a)&&a.length===Et.length}catch{return!1}}function zs(e,a){let t=Array.isArray(e.networkProfile)?e.networkProfile:[],n=ia();return q({title:"Windows firewall & network profile",subtitle:"Two things must be configured: the Windows network profile must be Private, and a firewall rule must allow inbound TCP on the port.",body:`<h4 class="ac-section-panel__title" style="margin:0 0 8px">Network profile</h4>
			${t.length?E({columns:[{key:"interface",label:"Interface"},{key:"name",label:"Connection"},{key:"category",label:"Category",render:s=>s.category==="Private"?'<span class="ac-badge ac-badge--success">Private</span>':s.category==="DomainAuthenticated"?'<span class="ac-badge">Domain</span>':'<span class="ac-badge ac-badge--warning">Public</span>'},{key:"actions",label:"",align:"right",render:s=>s.category==="Private"||s.category==="DomainAuthenticated"?'<span class="ac-table__muted">\u2014</span>':`<button type="button" class="ac-btn ac-btn--sm" data-ac-network-profile="${v(s.interface)}" data-ac-network-category="Private">Switch to Private</button>`}],rows:t}):`<p class="ac-field__hint">The network profile is only reported on Windows. Check it manually:</p>
					<pre class="ac-pre">Get-NetConnectionProfile | Select-Object Name, InterfaceAlias, NetworkCategory</pre>`}
			<h4 class="ac-section-panel__title" style="margin:20px 0 8px">The inbound rule</h4>
			<p class="ac-field__hint" style="margin-bottom:8px">Run this once in an administrator PowerShell on the machine that serves the app.</p>
			<textarea class="ac-input ac-input--full" id="set-firewall-command" rows="4" readonly>${v(Is(a))}</textarea>
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
				${Et.map(s=>{let o=!1;try{let f=localStorage.getItem(Ie)||"[]";o=JSON.parse(f).includes(s.id)}catch{o=!1}return`<label class="ac-check">
						<input type="checkbox" data-ac-firewall-check="${v(s.id)}" ${o?"checked":""} />
						<span>
							<span class="ac-check__label">${v(s.label)}</span>
							<span class="ac-check__hint">${v(s.hint)}</span>
						</span>
					</label>`}).join("")}
			</div>
			<p class="ac-field__hint" data-ac-firewall-status style="margin-top:8px">${n?"All four checks are confirmed. The Summary step now shows the setup as verified.":"None of this changes the application \u2014 it is a note to yourself. Tick what you have actually confirmed."}</p>`})}function Cs(e){let a=e.database||{},t=a.inferredInfo||{};return q({title:"Database safety",subtitle:"The database is a single SQLite file. Back it up before you change anything \u2014 the backup button is at the bottom of this step.",body:`<div class="ac-defs">
				${Q("Configured URL",a.url||"\u2014")}
				${a.inferred?Q("Prisma uses",a.inferred,t.exists?"ok":"fail"):""}
				${a.expected?Q("prisma/dev.db",a.expected.exists?`${a.expected.size||0} bytes`:"not found",a.expected.exists?"ok":"warn"):""}
				${a.rootDevDb&&a.rootDevDb.exists?Q("Root ./dev.db","found \u2014 may indicate a URL mismatch","warn"):""}
			</div>
			${a.rootDevDb&&a.rootDevDb.exists&&(!a.inferred||!t.exists)?'<div class="ac-alert ac-alert--warning" style="margin-top:14px"><div class="ac-alert__body"><p class="ac-alert__title">Database path inconsistency</p><p class="ac-alert__text">The <code>.env</code> file points at a different path than expected. The data may be in <code>./dev.db</code> instead of <code>prisma/dev.db</code> \u2014 back up both before reinstalling.</p></div></div>':""}
			<div class="ac-quick-actions" style="margin-top:16px">
				<button type="button" class="ac-btn ac-btn--primary" data-ac-setup-backup>Download a backup</button>
				<span class="ac-table__muted" data-ac-setup-backup-status></span>
			</div>`})}function Ps(e){let a=Array.isArray(e.cdn)?e.cdn:[],t=a.filter(o=>o.vendored).length,n=a.length-t,s=a.filter(o=>!o.vendored&&o.ok).length;return q({title:"Offline & CDN dependencies",subtitle:"The frontend libraries are served locally. The only external dependency is the web font, and it is optional.",body:`${t>0?`<div class="ac-alert ac-alert--success" style="margin-bottom:14px"><div class="ac-alert__body"><p class="ac-alert__title">${t} libraries are vendored locally</p><p class="ac-alert__text">No internet access is required for any core feature.</p></div></div>`:""}
		${E({columns:[{key:"host",label:"Host",render:o=>`<code>${v(o.host||o.id||"")}</code>`},{key:"vendored",label:"Source",render:o=>o.vendored?'<span class="ac-badge ac-badge--success">vendored locally</span>':'<span class="ac-badge ac-badge--warning">remote</span>'},{key:"ok",label:"Reachable",render:o=>o.vendored?'<span class="ac-table__muted">not needed</span>':`<span class="ac-badge ac-badge--${o.ok?"success":"danger"}">${o.ok?"yes":"no"}</span>`},{key:"ms",label:"Time",align:"right",render:o=>o.vendored?"\u2014":o.ms!=null?`${o.ms} ms`:"\u2014"}],rows:a,empty:"No probe was run."})}
		${n>0&&s<n?'<div class="ac-alert ac-alert--warning" style="margin-top:14px"><div class="ac-alert__body"><p class="ac-alert__title">Some remote resources are unreachable</p><p class="ac-alert__text">Only the web font is affected \u2014 the application works with the system font stack.</p></div></div>':'<div class="ac-alert ac-alert--info" style="margin-top:14px"><div class="ac-alert__body"><p class="ac-alert__title">All the core dependencies are vendored</p><p class="ac-alert__text">The application works fully offline. The web font is the only optional external dependency.</p></div></div>'}`})}function Ms(e,a){let t=Rs(e,a),n=ia();return q({title:"Summary",subtitle:"Every classroom deployment check, and every part of the platform you can manage from here.",body:`<h4 class="ac-section-panel__title" style="margin:0 0 10px">The deployment checks</h4>
			<div class="ac-summary">
				${t.map(s=>`<div class="ac-summary__item">
							<span class="ac-badge ac-badge--${s.status==="ok"?"success":s.status==="warn"?"warning":"danger"}">${s.status==="ok"?"\u2713":s.status==="warn"?"\u26A0":"\u2717"}</span>
							<div>
								<p class="ac-summary__label">${v(s.label)}</p>
								<p class="ac-summary__detail">${v(s.detail)}</p>
								${s.action?`<button type="button" class="ac-btn ac-btn--sm" data-ac-setup-goto="${v(s.action.step)}">${v(s.action.label)}</button>`:""}
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
			${e.capacity?`<div class="ac-alert ac-alert--info" style="margin-top:14px"><div class="ac-alert__body"><p class="ac-alert__title">Configured capacity</p><p class="ac-alert__text">${v(String(e.capacity.maxUsers||100))} users and ${v(String(e.capacity.maxGamePlayers||30))} players per game. These are recorded values, not enforced limits.</p></div></div>`:""}
			<h4 class="ac-section-panel__title" style="margin:24px 0 6px">Manage the platform from here</h4>
			<p class="ac-field__hint" style="margin-bottom:12px">Every part of the control center, and what each one is for.</p>
			<div class="ac-manage-grid">
				${Ns.map(s=>`<a class="ac-manage-card" href="${v(s.href)}">
						<span class="ac-manage-card__title">${v(s.title)}</span>
						<span class="ac-manage-card__desc">${v(s.desc)}</span>
					</a>`).join("")}
			</div>`})}var Ns=[{href:"#/overview",title:"Overview",desc:"The workbench: control, access, credentials, maintenance, activity, analytics, documents, notes and planning."},{href:"#/organizations",title:"Organizations",desc:"Every tenant: create one, edit its profile, suspend it, reactivate it, remove it."},{href:"#/users",title:"Users & access",desc:"The hub: the account counts, the requests waiting for a decision, and the three rosters."},{href:"#/users/teachers",title:"Teachers",desc:"Add a teacher, change their role, suspend them, reset their password, remove them."},{href:"#/users/students",title:"Students",desc:"Add a student, move them to a class, suspend them, reset their password, remove them."},{href:"#/users/administrators",title:"Directors & administrators",desc:"The people who can administer: the school directors and the platform administrators."},{href:"#/analytics",title:"Platform analytics",desc:"Adoption, activity and engagement, per organization and per class."},{href:"#/audit",title:"Activity & audit",desc:"Every administrative action and every authentication event, searchable."},{href:"#/health",title:"System health",desc:"Availability, error rate, latency, the database, the storage and the scheduled work."},{href:"#/settings?section=general",title:"General settings",desc:"The organization identity, the quiz defaults and the appearance."},{href:"#/settings?section=profile",title:"My profile",desc:"Your own account, and your own password."},{href:"#/settings?section=access",title:"Users & access settings",desc:"The pending account requests and the pending profile changes."},{href:"#/settings?section=teaching",title:"Teacher access",desc:"The seventeen switches that decide what a teacher may reach in the classroom."},{href:"#/settings?section=realtime",title:"Realtime",desc:"The broadcast switches, the recovery code, the connected devices and the sync actions."},{href:"#/settings?section=presets",title:"Presets",desc:"The quiz presets and the game presets."},{href:"#/settings?section=documents",title:"Documents & data",desc:"The generated documents, the export, the import, the archives and the factory reset."},{href:"#/settings?section=ai",title:"Artificial intelligence",desc:"The providers, the keys, the models, the shared catalogue and your own model."},{href:"#/settings?section=roles",title:"Roles & permissions",desc:"What each role may do, and the full permission catalogue."},{href:"#/settings?section=deployment",title:"Deployment & session",desc:"Where this installation runs, and what this session can reach."}];function Rs(e,a){let t=[],n=e.hostBinding==="0.0.0.0";t.push({id:"binding",label:`Server listening on ${e.hostBinding||"0.0.0.0"}:${e.port||3e3}`,status:n?"ok":"warn",detail:n?"Every network interface \u2014 the students can reach this server.":"The server is not bound to every interface.",action:n?null:{step:"server",label:"Look at the server step"}});let s=e.nodeEnv!=="production";t.push({id:"env",label:`NODE_ENV = ${e.nodeEnv||"development"}`,status:s?"ok":"warn",detail:s?"HTTP works for the login and refresh cookies.":"Production mode sets Secure cookies \u2014 HTTP sign-in will fail. Use HTTPS or NODE_ENV=development.",action:s?null:{step:"server",label:"Look at the server step"}}),t.push({id:"lan",label:a&&a.length?`${a.length} LAN address(es) found`:"No LAN address found",status:a&&a.length?"ok":"fail",detail:a&&a.length?a.map(r=>r.address).join(", "):"No IPv4 LAN interface was detected.",action:a&&a.length?{step:"access",label:"Show the address"}:null});let o=e.database||{},f=o.inferredInfo&&o.inferredInfo.exists;if(t.push({id:"database",label:"Database file exists",status:f?"ok":"warn",detail:o.inferred?`Prisma uses: ${o.inferred}`:"The database path could not be resolved.",action:{step:"database",label:"Open the database step"}}),Array.isArray(e.cdn)&&e.cdn.length){let r=e.cdn.filter(d=>d.ok).length;t.push({id:"cdn",label:`Resource reachability: ${r}/${e.cdn.length}`,status:r===e.cdn.length?"ok":r>0?"warn":"fail",detail:r===e.cdn.length?"Every probed resource answered.":"Some resources are unreachable \u2014 an offline or restricted network.",action:{step:"offline",label:"Open the offline step"}})}return t.push({id:"realtime",label:"The realtime channel",status:"ok",detail:"There is no separate realtime server: the pages, the API and the realtime channel are served by this one process, on this one port.",action:{step:"access",label:"Show the student address"}}),t.push({id:"fonts",label:"The web font is served locally",status:"ok",detail:"The interface fonts are vendored under public/fonts/, so the application renders with no internet access.",action:{step:"offline",label:"Open the offline step"}}),t}function Q(e,a,t=""){let n=t==="ok"?'<span class="ac-badge ac-badge--success">\u2713</span>':t==="warn"?'<span class="ac-badge ac-badge--warning">\u26A0</span>':t==="fail"?'<span class="ac-badge ac-badge--danger">\u2717</span>':"";return`<div class="ac-defs__item">
		<p class="ac-defs__term">${v(e)}</p>
		<p class="ac-defs__desc">${v(a)} ${n}</p>
	</div>`}function Os(e){return e.port||3e3}function Is(e){return`New-NetFirewallRule -DisplayName "Quiz Portal ${e}" -Direction Inbound -Action Allow -Protocol TCP -LocalPort ${e}`}async function At(e){try{await navigator.clipboard.writeText(e)}catch{let a=document.createElement("textarea");a.value=e,document.body.appendChild(a),a.select(),document.execCommand("copy"),a.remove()}}function js(){return typeof window.qrcode=="function"?Promise.resolve():new Promise((e,a)=>{let t=document.createElement("script");t.src="/qrcode-generator.js",t.onload=()=>{typeof window.qrcode=="function"?e():a(new Error("The QR generator could not be loaded."))},t.onerror=()=>a(new Error("The QR generator could not be loaded.")),document.head.appendChild(t)})}function Ds(e,a){let t=URL.createObjectURL(e),n=document.createElement("a");n.href=t,n.download=a,document.body.appendChild(n),n.click(),n.remove(),setTimeout(()=>URL.revokeObjectURL(t),2e3)}var Hs=[{value:"openrouter",label:"OpenRouter \u2014 all providers, free tier"},{value:"openai",label:"OpenAI (GPT family)"},{value:"anthropic",label:"Anthropic (Claude)"},{value:"google",label:"Google AI (Gemini)"},{value:"deepseek",label:"DeepSeek"},{value:"custom",label:"Custom / Local (Ollama, LM Studio\u2026)"}],Bs={openrouter:"https://openrouter.ai/keys",openai:"https://platform.openai.com/api-keys",anthropic:"https://console.anthropic.com/settings/keys",google:"https://aistudio.google.com/app/apikey",deepseek:"https://platform.deepseek.com/api_keys"};async function Lt(e){let a=await k.get("ai/configs"),t=Array.isArray(a?.data)?a.data:[],n=t.filter(r=>r.is_shared),s=t.filter(r=>!r.is_shared),o=[q({title:"Nothing here is required",subtitle:"The platform works fully without an AI provider.",body:`<div class="ac-alert ac-alert--info">
					<div class="ac-alert__body">
						<p class="ac-alert__title">Optional by design</p>
						<p class="ac-alert__text">Without a configured model, question generation returns a generated set rather than an error, and image generation falls back to text options. A LAN installation can point a custom provider at a model server on the local network \u2014 no internet access is required for that either.</p>
					</div>
				</div>`}),q({title:"Load models from a provider",subtitle:"Enter the provider key once, fetch the live model list, then publish the models the teachers should see.",body:`<div class="ac-field-grid">
					${D({id:"set-ai-provider",label:"Provider",options:Hs,value:"openrouter"})}
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
				</div>`}),q({title:"Shared models",subtitle:"The models every teacher in this organization may use.",body:n.length?E({columns:[{key:"name",label:"Name",render:r=>`<span class="ac-table__primary">${v(r.name)}</span><br><span class="ac-table__muted">${v(r.provider)} \xB7 ${v(r.model_id)}</span>`},{key:"key_hint",label:"Key",render:r=>r.has_key?`<code>${v(r.key_hint||"\u2022\u2022\u2022\u2022")}</code>`:'<span class="ac-badge">none (local server)</span>'},{key:"is_default",label:"Default",render:r=>r.is_default?'<span class="ac-badge ac-badge--success">yes</span>':'<span class="ac-badge">no</span>'},{key:"actions",label:"",align:"right",render:r=>`<button type="button" class="ac-btn ac-btn--sm" data-ac-ai-test="${v(r.id)}">Test</button> <button type="button" class="ac-btn ac-btn--sm" data-ac-ai-delete="${v(r.id)}">Delete</button>`}],rows:n}):'<p class="ac-empty__message">No shared model yet. Load a provider list above and publish the models the teachers should use.</p>'}),q({title:"My own model",subtitle:"Private to you. A local server needs no key at all.",body:`<div class="ac-field-grid">
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
				${s.length?E({columns:[{key:"name",label:"Model",render:r=>`<span class="ac-table__primary">${v(r.name)}</span><br><span class="ac-table__muted">${v(r.provider)} \xB7 ${v(r.model_id)}</span>`},{key:"actions",label:"",align:"right",render:r=>`<button type="button" class="ac-btn ac-btn--sm" data-ac-ai-test="${v(r.id)}">Test</button> <button type="button" class="ac-btn ac-btn--sm" data-ac-ai-delete="${v(r.id)}">Delete</button>`}],rows:s}):'<p class="ac-empty__message">You have no personal model yet.</p>'}`})].join("");function f(r){let d=r.querySelector("[data-ac-ai-status]"),l=b=>{d&&(d.textContent=b)},u=r.querySelector("#set-ai-provider"),i=r.querySelector("[data-ac-ai-base]"),h=r.querySelector("#set-ai-key"),g=()=>{let b=u?.value||"";if(i&&(i.hidden=b!=="custom"),h){let _=Bs[b];h.placeholder=b==="custom"?"Not needed for a local server":"sk-\u2026"}};u?.addEventListener("change",g),g();let m=[],x=()=>{let b=r.querySelector("[data-ac-ai-models]");if(b){if(!m.length){b.innerHTML='<p class="ac-empty__message">The provider returned no model.</p>';return}b.innerHTML=`<div class="ac-model-catalog">
				${m.map(_=>`<label class="ac-model-catalog__item">
					<input type="checkbox" value="${v(_.id)}" data-ac-ai-model />
					<span class="ac-model-catalog__name">${v(_.label||_.id)}</span>
					<code class="ac-model-catalog__id">${v(_.id)}</code>
				</label>`).join("")}
			</div>`}},p=r.querySelector("#set-ai-model-filter");p?.addEventListener("input",()=>{let b=p.value.trim().toLowerCase();r.querySelectorAll(".ac-model-catalog__item").forEach(S=>{let $=S.textContent.toLowerCase();S.hidden=b!==""&&!$.includes(b)})}),r.querySelector("[data-ac-ai-load]")?.addEventListener("click",async()=>{l("Loading\u2026");try{let b=r.querySelector("#set-ai-provider")?.value,_=r.querySelector("#set-ai-key")?.value||void 0,S=r.querySelector("#set-ai-base-url")?.value||void 0,$=await k.post("ai/models/refresh",{provider:b,api_key:_||void 0,base_url:S||void 0});m=Array.isArray($?.data)?$.data:[];let L=r.querySelector("[data-ac-ai-catalog]");L&&(L.hidden=!1),x(),l(`${m.length} model(s) returned.`)}catch(b){l(b.message),y(b.message,"error")}}),r.querySelector("[data-ac-ai-test-key]")?.addEventListener("click",async()=>{l("Testing\u2026");try{let b=r.querySelector("#set-ai-provider")?.value,_=r.querySelector("#set-ai-key")?.value||void 0,S=r.querySelector("#set-ai-base-url")?.value||void 0,$=await k.post("ai/models/refresh",{provider:b,api_key:_||void 0,base_url:S||void 0}),L=Array.isArray($?.data)?$.data.length:0;l(L?`The provider answered: ${L} model(s).`:"The provider answered but returned no model.")}catch(b){l(b.message)}}),r.querySelector("[data-ac-ai-publish]")?.addEventListener("click",async()=>{let b=Array.from(r.querySelectorAll("[data-ac-ai-model]:checked")).map(L=>L.value);if(!b.length){y("Select at least one model to publish.","error");return}let _=r.querySelector("#set-ai-provider")?.value,S=r.querySelector("#set-ai-key")?.value||void 0,$=r.querySelector("#set-ai-base-url")?.value||void 0;try{for(let L of b)await k.post("ai/configs",{provider:_,name:L,model_id:L,base_url:_==="custom"?$:void 0,api_key:S||void 0,shared:!0});y(`${b.length} model(s) published.`,"success"),e.rerender()}catch(L){y(L.message,"error")}}),r.querySelector("[data-ac-ai-save-personal]")?.addEventListener("click",async()=>{let b=r.querySelector("[data-ac-ai-personal-status]"),_=W=>r.querySelector(`#${W}`)?.value?.trim()??"",S=_("set-ai-personal-name"),$=_("set-ai-personal-model"),L=_("set-ai-personal-base"),P=_("set-ai-personal-key");if(!S||!$){y("A display name and a model id are required.","error");return}try{await k.post("ai/configs",{provider:L?"custom":"openrouter",name:S,model_id:$,base_url:L||void 0,api_key:P||void 0,shared:!1}),b&&(b.textContent="Saved."),y("Your model was saved.","success"),e.rerender()}catch(W){b&&(b.textContent=W.message),y(W.message,"error")}}),r.querySelectorAll("[data-ac-ai-test]").forEach(b=>{b.addEventListener("click",async()=>{try{let _=await k.post(`ai/configs/${encodeURIComponent(b.dataset.acAiTest)}/test`);y(_?.message||(_?.ok?"The model is reachable.":"The model did not answer."),_?.ok?"success":"error")}catch(_){y(_.message,"error")}})}),r.querySelectorAll("[data-ac-ai-delete]").forEach(b=>{b.addEventListener("click",async()=>{if(await M({title:"Delete this model?",message:"The model is removed from the server. Anyone using it will have to pick another one.",confirmLabel:"Delete model",danger:!0}))try{await k.del(`ai/configs/${encodeURIComponent(b.dataset.acAiDelete)}`),y("The model was deleted.","success"),e.rerender()}catch(S){y(S.message,"error")}})})}return{markup:o,bind:f}}async function zt(){let e=await k.get("console/roles"),a=e.roles||[],t=e.catalog||[];return{markup:[q({title:"Roles",subtitle:"The roles the platform knows, and what each one may do.",body:E({columns:[{key:"label",label:"Role",render:s=>`<span class="ac-table__primary">${v(s.label)}</span><br><span class="ac-table__muted">${v(s.description||"")}</span>`},{key:"key",label:"Key",render:s=>`<code>${v(s.key)}</code>`},{key:"scopeLabel",label:"Scope",render:s=>`<span class="ac-badge">${v(s.scopeLabel)}</span>`},{key:"permissions",label:"Permissions",align:"right",render:s=>String(s.permissions.length)},{key:"isAssignable",label:"Assignable",render:s=>`<span class="ac-badge ac-badge--${s.isAssignable?"success":""}">${s.isAssignable?"yes":"no"}</span>`}],rows:a})}),q({title:"Permission catalog",subtitle:"Every capability, grouped by the scope it applies in.",body:t.map(s=>`<h4 class="ac-section-panel__title" style="margin:14px 0 6px">${v(s.group)}</h4>${E({columns:[{key:"label",label:"Permission",render:o=>`<span class="ac-table__primary">${v(o.label)}</span><br><span class="ac-table__muted">${v(o.description||"")}</span>`},{key:"id",label:"Identifier",render:o=>`<code>${v(o.id)}</code>`}],rows:s.permissions})}`).join("")})].join(""),bind:null}}async function Ct(e){let a=e.session||{},t=a.deployment||{},n=e.organization||{};return{markup:[q({title:"Deployment & session",subtitle:"Where this installation runs, and what this session can reach.",body:`<div class="ac-defs">
					<div class="ac-defs__item">
						<p class="ac-defs__term">Deployment mode</p>
						<p class="ac-defs__desc">${v(t.mode||"\u2014")}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Database provider</p>
						<p class="ac-defs__desc">${v(t.dbProvider||"\u2014")}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Signed in as</p>
						<p class="ac-defs__desc">${v(a.user?.name||"")}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Role</p>
						<p class="ac-defs__desc">${v(a.user?.roleLabel||a.user?.role||"")}</p>
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
				</div>`}),q({title:"Plan and capacity",subtitle:"Observed configuration \u2014 nothing is enforced from it.",body:`<div class="ac-alert ac-alert--info">
					<div class="ac-alert__body">
						<p class="ac-alert__title">Plan and capacity are observed, not enforced</p>
						<p class="ac-alert__text">The business model does not support subscriptions or quotas yet. The plan and the student capacity recorded on the organization are displayed for information only \u2014 no entitlement is derived from them.</p>
					</div>
				</div>
				<div class="ac-defs">
					<div class="ac-defs__item">
						<p class="ac-defs__term">Plan</p>
						<p class="ac-defs__desc">${v(n?.plan||"\u2014")}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Student capacity</p>
						<p class="ac-defs__desc">${v(String(n?.maxStudents??"\u2014"))}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Academic year</p>
						<p class="ac-defs__desc">${v(n?.schoolYear||"not set")}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Organization status</p>
						<p class="ac-defs__desc">${v(n?.status||"\u2014")}</p>
					</div>
				</div>`})].join(""),bind:null}}var xe=[{id:"general",label:"General",icon:"general"},{id:"profile",label:"My profile",icon:"profile"},{id:"access",label:"Users & access",icon:"access"},{id:"teaching",label:"Teacher access",icon:"teaching"},{id:"realtime",label:"Realtime",icon:"realtime"},{id:"presets",label:"Presets",icon:"presets"},{id:"documents",label:"Documents & data",icon:"data"},{id:"setup",label:"Setup & diagnostics",icon:"setup"},{id:"ai",label:"Artificial intelligence",icon:"ai"},{id:"roles",label:"Roles & permissions",icon:"roles"},{id:"deployment",label:"Deployment & session",icon:"deployment"}],Us={general:lt,profile:dt,access:pt,teaching:ht,realtime:bt,presets:kt,documents:Tt,setup:qt,ai:Lt,roles:zt,deployment:Ct},Pt={id:"settings",path:"/settings",title:"Application Settings",description:"General configuration, the organization profile, access, data and the deployment \u2014 as a page, not a dialog.",permission:["platform.settings.manage","school.settings.manage"],async render(e,a,t){let n=xe.some(u=>u.id===t.query?.section)?t.query.section:xe[0].id;e.innerHTML=`<div class="ac-split" data-ac-settings>
			<div class="ac-split__main" data-ac-settings-main>${R(5)}</div>
			<div data-ac-settings-menu></div>
		</div>`;let s=e.querySelector(".ac-split"),o=e.querySelector("[data-ac-settings-menu]"),f=e.querySelector("[data-ac-settings-main]"),r=0,d=rt();s.classList.toggle("ac-split--collapsed",d),o.innerHTML=st({sections:xe,active:n,collapsed:d}),nt(e,{onSelect:u=>{Y(`/settings?section=${encodeURIComponent(u)}`,{replace:!0})}}),await(async u=>{let i=++r;f.innerHTML=R(4);let h=Us[u];if(!h){f.innerHTML=N({title:"Unknown section",message:`There is no settings section called "${u}".`});return}try{let{markup:g,bind:m}=await h(a,t);if(i!==r)return;f.innerHTML=g,typeof m=="function"&&m(f,a)}catch(g){if(i!==r)return;f.innerHTML=N({title:"This section could not be loaded",message:g.message})}})(n)}};async function ne(){let e=await k.get("settings/admin"),a=new Map;for(let t of Array.isArray(e)?e:[])a.set(t.key,t);return a}async function F(e,a){let t=typeof a=="string"?a:JSON.stringify(a);await k.patch(`settings/${encodeURIComponent(e)}`,{key:e,value:t})}var Mt={id:"organization-detail",path:"/organizations/:id",title:"Organization",description:"Profile, accounts, usage, activity and administrative history.",permission:["platform.organizations.read","school.profile.read"],async render(e,a,t){let n=t.params?.id;e.innerHTML=`<div class="ac-stack" data-ac-org-detail>${R(4)}</div>`;let s;try{s=(await k.get(`console/organizations/${encodeURIComponent(n)}`)).data}catch(l){e.innerHTML=N({title:"This organization could not be loaded",message:l.message});return}let o=s.organization,f=s.usage,r=a.isPlatform||(a.session.permissions||[]).includes("school.profile.manage");a.setTitle(o.name,`${o.slug} \xB7 ${o.schoolType||"organization"}${o.schoolYear?` \xB7 academic year ${o.schoolYear}`:""}`),e.innerHTML=`
			${U({chips:'<a class="ac-btn" href="#/organizations">\u2190 All organizations</a>',actions:r?`<button type="button" class="ac-btn" data-ac-toggle-status>${o.status==="suspended"?"Reactivate organization":"Suspend organization"}</button>`:""})}

			<div class="ac-panel">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title">${c(o.name)}</h3>
						<p class="ac-panel__subtitle">${c(o.slug)} \xB7 ${c(o.schoolType||"\u2014")}${o.schoolYear?` \xB7 academic year ${c(o.schoolYear)}`:""}</p>
					</div>
					<div class="ac-panel__actions">
						<span class="ac-badge ${o.status==="active"?"ac-badge--success":o.status==="pending"?"ac-badge--warning":"ac-badge--danger"}">${c(o.status)}</span>
					</div>
				</div>
				<div class="ac-panel__body">
					<div class="ac-defs">
						<div class="ac-defs__item">
							<p class="ac-defs__term">Plan</p>
							<p class="ac-defs__desc">${c(o.plan||"\u2014")}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">City</p>
							<p class="ac-defs__desc">${c(o.city||"\u2014")}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Contact</p>
							<p class="ac-defs__desc">${c(o.email||o.phone||"\u2014")}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Created</p>
							<p class="ac-defs__desc">${c(C(o.createdAt,{withTime:!1}))}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Last activity</p>
							<p class="ac-defs__desc">${f.lastActivity?c(O(f.lastActivity)):"never"}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Student capacity</p>
							<p class="ac-defs__desc">${c(String(o.maxStudents??"\u2014"))}</p>
						</div>
					</div>
					${o.status==="suspended"?`<div class="ac-alert ac-alert--danger" style="margin-top:16px">
								<div class="ac-alert__body">
									<p class="ac-alert__title">Access is suspended</p>
									<p class="ac-alert__text">${o.suspendedReason?c(o.suspendedReason):"No reason was recorded."} \xB7 suspended ${c(C(o.suspendedAt))}</p>
								</div>
							</div>`:""}
				</div>
			</div>

			<div class="ac-grid ac-grid--kpi" style="margin-top:16px">
				${T({label:"Teachers",value:w(f.teachers),note:`${w(f.activeTeachers)} active in 30 days`,tone:"primary",tooltip:"Teacher accounts, and how many produced a recorded event in the last 30 days."})}
				${T({label:"Students",value:w(f.students),note:`${w(f.activeStudents)} active in 30 days`,tone:"primary",tooltip:"Student accounts, and how many produced a recorded event in the last 30 days."})}
				${T({label:"Attempts (30d)",value:w(f.attempts30d),note:`${w(f.formalAttempts30d)} formal`,tooltip:"Completed attempts of any mode inside the last 30 days."})}
				${T({label:"Content",value:w(f.questions+f.exams),note:`${w(f.questions)} questions \xB7 ${w(f.exams)} exams`,tooltip:"Rows that exist in this organization. These are totals, not period counts."})}
				${T({label:"Needs attention",value:w(f.suspendedAccounts+f.pendingRequests),note:`${w(f.suspendedAccounts)} suspended \xB7 ${w(f.pendingRequests)} pending`,tone:f.suspendedAccounts+f.pendingRequests>0?"warning":"",tooltip:"Suspended accounts and account requests awaiting a decision."})}
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
						${E({columns:[{key:"name",label:"Account",render:l=>`<a href="#/users/${l.id}" class="ac-table__primary">${c(l.name)}</a><br><span class="ac-table__muted">${c(l.username)}</span>`},{key:"status",label:"Status",render:l=>`<span class="ac-badge ac-badge--${l.status==="active"?"success":"warning"}">${c(l.status)}</span>`},{key:"lastLogin",label:"Last sign-in",render:l=>l.lastLogin?c(O(l.lastLogin)):"never"}],rows:s.administrators,empty:"This organization has no administrator account."})}
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
						${E({columns:[{key:"name",label:"Class",render:l=>`<span class="ac-table__primary">${c(l.name)}</span>`},{key:"studentCount",label:"Students",align:"right"},{key:"createdAt",label:"Created",render:l=>c(C(l.createdAt,{withTime:!1}))}],rows:s.classes,empty:"No class has been created in this organization."})}
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
						${E({columns:[{key:"name",label:"Teacher",render:l=>`<a href="#/users/${l.id}" class="ac-table__primary">${c(l.name)}</a>`},{key:"active",label:"Active (30d)",render:l=>l.active?'<span class="ac-badge ac-badge--success">yes</span>':'<span class="ac-badge ac-badge--warning">no</span>'},{key:"lastLogin",label:"Last sign-in",render:l=>l.lastLogin?c(O(l.lastLogin)):"never"}],rows:s.teachers,empty:"No teacher account in this organization."})}
					</div>
				</section>
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles"><h3 class="ac-panel__title">Students</h3></div>
					</div>
					<div class="ac-panel__body ac-panel__body--flush">
						${E({columns:[{key:"name",label:"Student",render:l=>`<a href="#/users/${l.id}" class="ac-table__primary">${c(l.name)}</a>`},{key:"active",label:"Active (30d)",render:l=>l.active?'<span class="ac-badge ac-badge--success">yes</span>':'<span class="ac-badge ac-badge--warning">no</span>'},{key:"lastLogin",label:"Last sign-in",render:l=>l.lastLogin?c(O(l.lastLogin)):"never"}],rows:s.students,empty:"No student account in this organization."})}
					</div>
				</section>
			</div>

			<div class="ac-section">
				<h2 class="ac-section__title">Administrative history</h2>
				<p class="ac-section__hint">The fifteen most recent recorded actions inside this organization.</p>
			</div>
			<section class="ac-panel">
				<div class="ac-panel__body ac-panel__body--flush">
					${E({columns:[{key:"occurredAt",label:"When",render:l=>c(C(l.occurredAt))},{key:"actorName",label:"Actor",render:l=>c(l.actorName||"system")},{key:"action",label:"Action"},{key:"entityType",label:"Entity"},{key:"outcome",label:"Outcome",render:l=>`<span class="ac-badge ac-badge--${l.outcome==="success"?"success":"warning"}">${c(l.outcome)}</span>`}],rows:s.recentActivity,empty:"No administrative action has been recorded for this organization."})}
				</div>
			</section>`;let d=e.querySelector("[data-ac-toggle-status]");d&&d.addEventListener("click",async()=>{let l=o.status!=="suspended";if(!await M({title:l?"Suspend this organization?":"Reactivate this organization?",message:l?"Suspending revokes access for every account in this organization. Their data is retained.":"Reactivating restores access for the accounts that were suspended with the organization.",detail:l?"The action is recorded in the audit trail with the reason you give.":"",confirmLabel:l?"Suspend":"Reactivate",danger:l}))return;let i=null;if(!(l&&(i=window.prompt("Reason for suspending (recorded in the audit trail):",""),i===null)))try{await k.patch(`console/organizations/${encodeURIComponent(n)}`,{status:l?"suspended":"active",reason:i||null}),y(l?"Organization suspended.":"Organization reactivated.","success"),a.rerender()}catch(h){y(h.message,"error")}})}};var Nt={super_admin:"Platform administrator",admin:"Organization administrator",teacher:"Teacher",student:"Student"},Rt={id:"user-detail",path:"/users/:id",title:"Account",description:"Profile, access, recent activity and the administrative actions available.",permission:["platform.users.read","school.users.read"],async render(e,a,t){let n=t.params?.id;e.innerHTML=`<div class="ac-stack" data-ac-user-detail>${R(4)}</div>`;let s;try{s=(await k.get(`console/users/${encodeURIComponent(n)}`)).data}catch(d){e.innerHTML=N({title:"This account could not be loaded",message:d.message});return}let o=s.account,f=a.isPlatform||(a.session.permissions||[]).includes("school.users.manage"),r=a.isPlatform||(a.session.permissions||[]).includes("school.roles.manage");a.setTitle(o.name||o.username,`${Nt[o.role]||o.role} \xB7 ${s.organization?.name||"organization"} \xB7 ${o.status}`),e.innerHTML=`
			${U({chips:'<a class="ac-btn" href="#/users">\u2190 All accounts</a>',actions:`${f?`<button type="button" class="ac-btn" data-ac-toggle-status>${o.status==="active"?"Suspend account":"Reactivate account"}</button>`:""}
				${r?'<button type="button" class="ac-btn" data-ac-change-role>Change role</button>':""}
				${r?'<button type="button" class="ac-btn" data-ac-grant>Grant permission</button>':""}
				<button type="button" class="ac-btn" data-ac-revoke-sessions>Revoke sessions</button>
				${f&&String(o.id)!==String(a.session.user?.id)?'<button type="button" class="ac-btn" data-ac-reset-credential>Reset credential</button>':""}
				${f&&String(o.id)!==String(a.session.user?.id)?'<button type="button" class="ac-btn ac-btn--danger" data-ac-delete-account>Delete account</button>':""}`})}

			<div class="ac-panel">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title">${c(o.name||o.username)}</h3>
						<p class="ac-panel__subtitle">${c(o.username)}${o.email?` \xB7 ${c(o.email)}`:""}</p>
					</div>
					<div class="ac-panel__actions">
						<span class="ac-badge ac-badge--brand">${c(Nt[o.role]||o.role)}</span>
						<span class="ac-badge ac-badge--${o.status==="active"?"success":o.status==="suspended"?"danger":"warning"}">${c(o.status)}</span>
					</div>
				</div>
				<div class="ac-panel__body">
					<div class="ac-defs">
						<div class="ac-defs__item">
							<p class="ac-defs__term">Organization</p>
							<p class="ac-defs__desc">${c(s.organization?.name||"\u2014")}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Class</p>
							<p class="ac-defs__desc">${c(s.class?.name||"\u2014")}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Student number</p>
							<p class="ac-defs__desc">${c(o.numero||"\u2014")}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Last sign-in</p>
							<p class="ac-defs__desc">${o.lastLogin?c(O(o.lastLogin)):"never"}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Account created</p>
							<p class="ac-defs__desc">${c(C(o.createdAt,{withTime:!1}))}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Attempts (30d)</p>
							<p class="ac-defs__desc">${w(s.activity.attempts30d)}</p>
						</div>
					</div>
				</div>
			</div>

			<div class="ac-grid ac-grid--kpi" style="margin-top:16px">
				${T({label:"Attempts (30d)",value:w(s.activity.attempts30d),note:`${w(s.activity.formalAttempts30d)} formal`,tooltip:"Completed attempts of any mode inside the last 30 days."})}
				${T({label:"Last sign-in",value:o.lastLogin?c(O(o.lastLogin)):"never",tone:o.lastLogin?"primary":"warning",tooltip:"From the recorded authentication trail."})}
				${T({label:"Permission overrides",value:w(s.permissionOverrides.length),note:s.permissionOverrides.length?"grants or denies on top of the role":"role baseline only",tone:s.permissionOverrides.length?"warning":"",tooltip:"Individual permissions granted to, or denied from, this account on top of what its role carries."})}
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
					${s.permissionOverrides.length?E({columns:[{key:"permission",label:"Permission",render:d=>`<code>${c(d.permission)}</code>`},{key:"effect",label:"Effect",render:d=>`<span class="ac-badge ac-badge--${d.effect==="grant"?"success":"danger"}">${c(d.effect)}</span>`},{key:"scopeKey",label:"Applies to",render:d=>c(d.scopeKey==="*"?"every scope":d.scopeKey)},{key:"reason",label:"Reason",render:d=>c(d.reason||"\u2014")},{key:"createdAt",label:"Recorded",render:d=>c(C(d.createdAt))},{key:"actions",label:"",className:"ac-table__actions",render:d=>r?`<button type="button" class="ac-btn ac-btn--sm" data-ac-remove-override="${c(d.permission)}">Remove</button>`:""}],rows:s.permissionOverrides}):I({title:"No overrides",message:"This account holds exactly the permissions its role carries. Nothing has been granted or denied on top."})}
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
						${E({columns:[{key:"dateTaken",label:"When",render:d=>c(C(d.dateTaken))},{key:"mode",label:"Mode"},{key:"score20",label:"Score",align:"right",render:d=>d.mode==="exam"?`${d.score20.toFixed(2)} /20`:`${Math.round(d.score)}%`}],rows:s.recentResults,empty:"This account has no recorded attempt."})}
					</div>
				</section>
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles"><h3 class="ac-panel__title">Administrative actions</h3></div>
					</div>
					<div class="ac-panel__body ac-panel__body--flush">
						${E({columns:[{key:"occurredAt",label:"When",render:d=>c(C(d.occurredAt))},{key:"action",label:"Action"},{key:"entityType",label:"Entity"},{key:"outcome",label:"Outcome",render:d=>`<span class="ac-badge ac-badge--${d.outcome==="success"?"success":"warning"}">${c(d.outcome)}</span>`}],rows:s.recentActivity,empty:"This account has performed no recorded administrative action."})}
					</div>
				</section>
			</div>`,Fs(e,a,n,o,s)}};function Fs(e,a,t,n,s){let o=e.querySelector("[data-ac-toggle-status]");o&&o.addEventListener("click",async()=>{let i=n.status==="active";if(!await M({title:i?"Suspend this account?":"Reactivate this account?",message:i?"The account will not be able to sign in. Its data is retained.":"The account will be able to sign in again.",detail:"The action is recorded in the audit trail and in the security event trail.",confirmLabel:i?"Suspend":"Reactivate",danger:i}))return;let g=null;if(!(i&&(g=window.prompt("Reason for suspending (recorded in the audit trail):",""),g===null)))try{await k.patch(`console/users/${encodeURIComponent(t)}`,{status:i?"suspended":"active",reason:g||null}),y(i?"Account suspended.":"Account reactivated.","success"),a.rerender()}catch(m){y(m.message,"error")}});let f=e.querySelector("[data-ac-change-role]");f&&f.addEventListener("click",async()=>{let h=j({title:"Change the role of this account",subtitle:"The change is recorded in the audit trail with the previous role.",body:`<div class="ac-field">
					<label class="ac-field__label" for="ac-new-role">New role</label>
					<select class="ac-select" id="ac-new-role">
						${[{value:"admin",label:"Organization administrator"},{value:"teacher",label:"Teacher"},{value:"student",label:"Student"}].map(g=>`<option value="${g.value}"${g.value===n.role?" selected":""}>${g.label}</option>`).join("")}
					</select>
				</div>`,footer:`
					<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
					<button type="button" class="ac-btn ac-btn--primary" data-ac-confirm>Change role</button>
				`});h.root.querySelector("[data-ac-cancel]").addEventListener("click",h.close),h.root.querySelector("[data-ac-confirm]").addEventListener("click",async()=>{let g=h.root.querySelector("#ac-new-role").value;h.close();try{await k.patch(`console/users/${encodeURIComponent(t)}`,{role:g}),y("Role updated.","success"),a.rerender()}catch(m){y(m.message,"error")}})});let r=e.querySelector("[data-ac-grant]");r&&r.addEventListener("click",async()=>{let i=[];try{i=((await k.get("console/roles")).catalog||[]).flatMap(x=>x.permissions)}catch{y("The permission catalog could not be loaded.","error");return}let h=new Set(s.permissionOverrides.map(m=>m.permission)),g=j({title:"Grant or deny a permission",subtitle:"Grants and denies sit on top of the role. A deny removes a permission the role carries.",body:`<div class="ac-field">
						<label class="ac-field__label" for="ac-permission">Permission</label>
						<select class="ac-select" id="ac-permission">
							${i.map(m=>`<option value="${m.id}"${h.has(m.id)?" disabled":""}>${m.label} \u2014 ${m.id}</option>`).join("")}
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
				`});g.root.querySelector("[data-ac-cancel]").addEventListener("click",g.close),g.root.querySelector("[data-ac-confirm]").addEventListener("click",async()=>{let m=g.root.querySelector("#ac-permission").value,x=g.root.querySelector("#ac-effect").value,p=g.root.querySelector("#ac-override-reason").value||null;g.close();try{await k.post(`console/users/${encodeURIComponent(t)}/permissions`,{permission:m,effect:x,reason:p}),y("Permission override applied.","success"),a.rerender()}catch(b){y(b.message,"error")}})}),e.querySelectorAll("[data-ac-remove-override]").forEach(i=>{i.addEventListener("click",async()=>{let h=i.dataset.acRemoveOverride;if(await M({title:"Remove this override?",message:`The account returns to the permissions its role carries. "${h}" is no longer individually granted or denied.`,confirmLabel:"Remove override"}))try{await k.del(`console/users/${encodeURIComponent(t)}/permissions/${encodeURIComponent(h)}`),y("Override removed.","success"),a.rerender()}catch(m){y(m.message,"error")}})});let d=e.querySelector("[data-ac-revoke-sessions]");d&&d.addEventListener("click",async()=>{if(await M({title:"Revoke every session of this account?",message:"All sign-ins of this account end immediately. The next sign-in starts a new session.",detail:"The revocation is recorded in the security event trail.",confirmLabel:"Revoke sessions",danger:!0}))try{await k.del(`console/users/${encodeURIComponent(t)}/sessions`),y("Sessions revoked.","success")}catch(h){y(h.message,"error")}});let l=e.querySelector("[data-ac-reset-credential]");l&&l.addEventListener("click",()=>{let i=j({title:"Reset this credential",subtitle:"The account keeps everything except its password. Every live session of the account is revoked and the change is recorded in the audit trail.",body:`<div class="ac-field">
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
				`});i.root.querySelector("#ac-generate-password").addEventListener("click",()=>{let h=i.root.querySelector("#ac-new-password");h.value=Ws(14),h.focus(),h.select()}),i.root.querySelector("[data-ac-cancel]").addEventListener("click",i.close),i.root.querySelector("[data-ac-confirm]").addEventListener("click",async()=>{let h=i.root.querySelector("#ac-new-password").value.trim();if(h.length<8){y("The password must be at least 8 characters.","error");return}try{let g=await k.post(`console/users/${encodeURIComponent(t)}/credential`,{newPassword:h});i.close(),y(`Credential reset. ${g?.data?.revokedSessions||0} session(s) revoked.`,"success")}catch(g){y(g.message,"error")}})});let u=e.querySelector("[data-ac-delete-account]");u&&u.addEventListener("click",async()=>{if(await M({title:`Delete "${n.username}"?`,message:"The account is removed, together with its sessions and its results. This cannot be undone \u2014 suspending the account keeps the record if you only need to end the access.",confirmLabel:"Delete the account",danger:!0}))try{await k.del(`console/users/${encodeURIComponent(t)}`),y("The account was deleted.","success"),window.location.hash="#/users"}catch(h){y(h.message,"error")}})}function Ws(e=14){let a="ABCDEFGHJKMNPQRSTUVWXYZ",t="abcdefghijkmnpqrstuvwxyz",n="23456789",s="!@#$%&*+-",o=a+t+n+s,f=d=>{let l=new Uint32Array(1);return crypto.getRandomValues(l),d[l[0]%d.length]},r=[f(a),f(t),f(n),f(s)];for(;r.length<e;)r.push(f(o));for(let d=r.length-1;d>0;d-=1){let l=new Uint32Array(1);crypto.getRandomValues(l);let u=l[0]%(d+1);[r[d],r[u]]=[r[u],r[d]]}return r.join("")}var Gs=[{id:"overview",path:"/",title:"Overview",icon:"overview",permission:["platform.console","school.console"]},{id:"organizations",path:"/organizations",title:"Organizations",icon:"organizations",permission:["platform.organizations.read","school.profile.read"]},{id:"users",path:"/users",title:"Users & Access",icon:"users",permission:["platform.users.read","school.users.read"]},{id:"analytics",path:"/analytics",title:"Platform Analytics",icon:"analytics",permission:["platform.analytics.read","school.analytics.read"]},{id:"audit",path:"/audit",title:"Activity & Audit",icon:"audit",permission:["platform.audit.read","school.audit.read"]},{id:"health",path:"/health",title:"System Health",icon:"health",permission:["platform.health.read","school.health.read"]},{id:"settings",path:"/settings",title:"Settings",icon:"settings",permission:["platform.settings.manage","school.settings.manage"]}],ca=[Qe,{...Qe,id:"overview-alias",path:"/overview"},Fa,Mt,Wa,Qa,Ja,Za,Rt,Xa,et,at,Pt],je=document.getElementById("ac-boot-status"),Ys=document.getElementById("ac-boot"),Vs=document.getElementById("ac-root");function Ot(e,a=""){if(!je)return;je.textContent=e,je.style.color="var(--ac-danger)";let t=je.parentElement;if(a){let n=document.createElement("p");n.className="ac-boot__status",n.style.marginTop="10px",n.innerHTML=a,t.appendChild(n)}}var It=null,da=null;async function Ks(){Ke(),ua(()=>{ba()});let e;try{e=await ga()}catch(l){Ot("Could not open the control center.",`${l.message}<br><br><a class="ac-btn ac-btn--primary" href="/admin.html">Go to the sign-in page</a>`);return}if(!e?.user){Ot("Could not open the control center.",'<a class="ac-btn ac-btn--primary" href="/admin.html">Go to the sign-in page</a>');return}let a=Ca(Vs,{session:e,navItems:Gs,canAny:We,onNavigate:l=>Y(l)}),t={canAny:We,session:e,organization:e.scope?.organization||null,isPlatform:!!e.scope?.isPlatform,deployment:e.deployment||{},isOffline:!!e.deployment?.isOffline,getState:ma,setPeriod:fa,rerender:()=>jt(a,t,It),setTitle:(l,u)=>{l&&(a.title.textContent=l),u!==void 0&&(a.description.textContent=u),document.title=`${l||a.title.textContent} \xB7 Control Center`}};xa(t),_a(ca,{notFound:{id:"not-found",path:"/not-found",title:"Page not found",description:"That section does not exist in the control center.",render(l){l.innerHTML=`<div class="ac-empty">
					<p class="ac-empty__title">Page not found</p>
					<p class="ac-empty__message">The address you opened does not match a section of the control center.</p>
					<a class="ac-btn ac-btn--primary" href="#/">Back to the overview</a>
				</div>`}}}),wa(l=>{It=l,a.title.textContent=l.title,a.description.textContent=l.description||"",a.setActive(l.path),document.title=`${l.title} \xB7 Control Center`,jt(a,t,l)});let n='<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"></path><polyline points="12 19 5 12 12 5"></polyline></svg>';function s(l){let u=Ve();if(!u)return;let i=l.querySelector(".ac-toolbar__push");if(!i||i.querySelector(".ac-back-btn"))return;let h=document.createElement("button");h.type="button",h.className="ac-btn ac-btn--ghost ac-back-btn",h.innerHTML=`${n}<span class="ac-back-btn__label">Back</span>`;let g=o(u);g&&(h.title=`Back to ${g}`),h.setAttribute("aria-label",g?`Back to ${g}`:"Back to the previous page"),h.addEventListener("click",()=>$a()),i.prepend(h)}function o(l){let u=String(l||"").replace(/^#/,"").split("?")[0],i=ca.find(h=>h.path===u);return i?i.title:u.startsWith("/users/")?"Users & Access":u.startsWith("/organizations/")?"Organizations":null}da=s;function f(){let l=document.getElementById("ac-global-search"),u=document.getElementById("ac-search-panel");if(!l||!u)return;let i=Pa(ca,xe),h=[],g=-1,m=null,x=()=>{u.hidden=!0,u.innerHTML="",h=[],g=-1},p=$=>{x(),l.value="",l.blur(),Y($)},b=$=>{h=$,u.innerHTML=$.length?r($):`<p class="ac-search__empty">Nothing matches \u201C${d(l.value.trim())}\u201D.</p>`,u.hidden=!1,g=-1},_=async()=>{let $=l.value.trim();if($.length<2){x();return}let L=await Ma($,{places:i,canUsers:t.canAny(["platform.users.read","school.users.read"]),canOrganizations:t.canAny(["platform.organizations.read","school.profile.read"])});l.value.trim()===$&&b(L)};l.addEventListener("input",()=>{clearTimeout(m),m=setTimeout(_,180)}),l.addEventListener("focus",()=>{l.value.trim().length>=2&&_()}),l.addEventListener("keydown",$=>{if(u.hidden){$.key==="Enter"&&l.value.trim().length>=2&&_();return}if($.key==="ArrowDown")$.preventDefault(),S(1);else if($.key==="ArrowUp")$.preventDefault(),S(-1);else if($.key==="Enter"){$.preventDefault();let L=h[g]||h[0];L&&p(L.path)}else $.key==="Escape"&&($.preventDefault(),x(),l.blur())}),u.addEventListener("mousedown",$=>{let L=$.target.closest("[data-ac-search-path]");L?($.preventDefault(),p(L.dataset.acSearchPath)):$.preventDefault()}),document.addEventListener("mousedown",$=>{!u.hidden&&!$.target.closest(".ac-search")&&x()});function S($){h.length&&(g=(g+$+h.length)%h.length,u.querySelectorAll(".ac-search__item").forEach((L,P)=>{L.classList.toggle("is-active",P===g)}))}}function r(l){let u=[];for(let i of l){let h=i.kind==="settings"?"Settings":i.kind==="user"?"Accounts":i.kind==="organization"?"Organizations":"Go to",g=u.find(m=>m.label===h);g||(g={label:h,items:[]},u.push(g)),g.items.push(i)}return u.map(i=>`<p class="ac-search__group">${i.label}</p>${i.items.map(h=>`<button type="button" class="ac-search__item" data-ac-search-path="${d(h.path)}">
									<span class="ac-search__item-title">${d(h.title)}</span>
									${h.sub?`<span class="ac-search__item-sub">${d(h.sub)}</span>`:""}
									<span class="ac-search__badge${h.kind==="user"?" ac-search__badge--user":""}">${d(h.badge||"")}</span>
								</button>`).join("")}`).join("")}function d(l){return String(l??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}f(),Sa(),Ys.remove()}var la=0;async function jt(e,a,t){let n=++la,s=document.createElement("div");s.className="ac-page",e.content.replaceChildren(s),s.innerHTML=`<div class="ac-skeleton-stack" aria-busy="true">
		<div class="ac-skeleton" style="width:40%"></div>
		<div class="ac-skeleton" style="width:100%"></div>
		<div class="ac-skeleton" style="width:80%"></div>
	</div>`;try{if(await t.render(s,a,t),n!==la)return;da&&da(s)}catch(o){if(n!==la)return;console.error("[console] page render failed",o),s.innerHTML=`<div class="ac-error" role="alert">
			<div>
				<p class="ac-error__title">This section could not be rendered</p>
				<p class="ac-error__message">${o.message}</p>
			</div>
		</div>`}}Ks();})();
