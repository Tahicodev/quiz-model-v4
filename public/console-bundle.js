var QuizConsole=(()=>{var I="quizSession",ve="quizAuthToken",W="",ae=null,he=null;function Se(e){he=e}function ra(){try{let e=sessionStorage.getItem(I)||localStorage.getItem(I),a=e?JSON.parse(e):null;if(a?.token)return a.token}catch{}return localStorage.getItem(ve)||""}function ia(){return W||(W=ra(),W)}function oa(e){if(e){W=e;try{let a=sessionStorage.getItem(I)||localStorage.getItem(I),s=a?JSON.parse(a):null;if(s){s.token=e,sessionStorage.setItem(I,JSON.stringify(s));let l=localStorage.getItem(I),r=l?JSON.parse(l):null;r&&String(r.userId||"")===String(s.userId||"")&&String(r.role||"").toLowerCase()===String(s.role||"").toLowerCase()&&localStorage.setItem(I,JSON.stringify(s))}localStorage.setItem(ve,e)}catch{}}}function ca(){W="";try{localStorage.removeItem(I),localStorage.removeItem(ve),sessionStorage.removeItem(I)}catch{}}function Te(){return window.APP_CONFIG&&window.APP_CONFIG.apiUrl||"/api/v1"}async function la(){return ae||(ae=fetch(`${Te()}/auth/refresh`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({portal:"admin"})}).then(async e=>{if(!e.ok)throw new Error(`Refresh failed (${e.status})`);let a=await e.json();if(!a?.accessToken)throw new Error("Refresh returned no token");return oa(a.accessToken),a.accessToken}).finally(()=>{ae=null}),ae)}var ne=class extends Error{constructor(a,s,l,r){super(a),this.name="ApiError",this.status=s,this.code=l,this.fields=r||null}};async function da(e){let a=null;try{a=await e.json()}catch{}let s=a?.error||{};return new ne(s.message||a?.message||`Request failed (${e.status})`,e.status,s.code||a?.code||null,s.fields||null)}async function Y(e,a={}){let{method:s="GET",body:l=null,query:r=null,retry:n=!0}=a,c=`${Te()}/${String(e).replace(/^\//,"")}`;if(r&&typeof r=="object"){let m=new URLSearchParams;for(let[v,_]of Object.entries(r))_==null||_===""||m.set(v,String(_));let i=m.toString();i&&(c+=`?${i}`)}let g={Accept:"application/json"},d=ia();d&&(g.Authorization=`Bearer ${d}`),l!=null&&(g["Content-Type"]="application/json");let o=await fetch(c,{method:s,headers:g,credentials:"include",body:l==null?void 0:JSON.stringify(l)});if(o.status===401&&n){try{await la()}catch{throw ca(),he&&he(),new ne("Your session has ended. Please sign in again.",401,"UNAUTHORIZED")}return Y(e,{...a,retry:!1})}if(!o.ok)throw await da(o);return o.status===204?null:o.json()}var $={get:(e,a)=>Y(e,{method:"GET",query:a}),post:(e,a)=>Y(e,{method:"POST",body:a}),patch:(e,a)=>Y(e,{method:"PATCH",body:a}),put:(e,a)=>Y(e,{method:"PUT",body:a}),del:(e,a)=>Y(e,{method:"DELETE",body:a})};var H={session:null,permissions:new Set,targetSchoolId:null,period:"30d",customRange:null},pa=new Set;function fe(){for(let e of pa)try{e(H)}catch(a){console.error("[console] store listener failed",a)}}function re(){return H}function ua(e){return e?H.permissions.has(e):!0}function be(e=[]){let a=Array.isArray(e)?e:[e];return a.length===0?!0:a.some(s=>ua(s))}function Ae(e,a=null){H.period=e,H.customRange=a,fe()}async function ze(){let e=await $.get("console/session");return H.session=e,H.permissions=new Set(Array.isArray(e.permissions)?e.permissions:[]),fe(),e}function Le(){H.session=null,H.permissions=new Set,H.targetSchoolId=null,fe()}var oe=[],Me=null,K=null,te=null,_e=null;function Pe(e,a={}){oe.length=0;for(let s of e)oe.push(s);Me=a.notFound||null}function Ee(e){te=e}function Ce(e){_e=e}function ie(e){return e&&String(e).split("?")[0].replace(/^#/,"").replace(/\/+$/,"")||"/"}function ma(e){let a=ie(e);for(let s of oe)if(ie(s.path)===a)return s;for(let s of oe){if(!s.path.includes(":"))continue;let l=ie(s.path).split("/"),r=a.split("/");if(l.length!==r.length)continue;let n={},c=!0;for(let g=0;g<l.length;g+=1){let d=l[g];if(d.startsWith(":"))n[d.slice(1)]=decodeURIComponent(r[g]);else if(d!==r[g]){c=!1;break}}if(c)return{...s,params:n}}return null}function ga(){let a=(window.location.hash||"#/").slice(1)||"/",[s,l]=a.split("?"),r={};if(l)for(let[n,c]of new URLSearchParams(l))r[n]=c;return{path:ie(s),query:r}}function Ne(e,{replace:a=!1}={}){let s=e.startsWith("#")?e:`#${e}`;if(a)window.history.replaceState(null,"",s);else if(window.location.hash!==s){window.location.hash=s;return}ye()}function ye(){let{path:e,query:a}=ga(),s=ma(e)||Me;if(!s)return null;let l=s.permission?Array.isArray(s.permission)?s.permission:[s.permission]:[];return l.length&&_e&&!_e.canAny(l)?(K={...s,id:s.id||"forbidden",title:"Access restricted",description:"Your role does not include this section.",forbidden:!0},te&&te(K,{path:e,query:a}),K):(K={...s,path:e,query:a,params:s.params||{}},te&&te(K,{path:e,query:a}),K)}function Re(){return window.addEventListener("hashchange",()=>ye()),ye()}var qe={primary:"var(--ac-tone-1)",success:"var(--ac-tone-2)",warning:"var(--ac-tone-3)",danger:"var(--ac-tone-4)",info:"var(--ac-tone-5)",violet:"var(--ac-tone-6)",muted:"var(--ac-tone-7)"};function t(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;")}function He(e){let a=Number(e);return Number.isFinite(a)?a:null}function ha(e,a=1){let s=He(e);if(s==null)return null;let l=10**a;return Math.round((s+Number.EPSILON)*l)/l}function va(e){let a=ha(e,1);return a==null?"\u2014":String(a)}function Oe(e,a,s){return Math.min(s,Math.max(a,e))}function je(e,a=28){let s=String(e??"");return s.length>a?`${s.slice(0,a-1)}\u2026`:s}function ce(e){return qe[e]||qe.primary}function V(e){return`<div class="ac-legend">${e.map(a=>`<span class="ac-legend__item"><i class="ac-legend__key" style="background:${ce(a.tone)}"></i>${t(a.label)}</span>`).join("")}</div>`}function f({label:e,value:a,note:s,tone:l="",trend:r="",tooltip:n="",href:c=""}){let g=c?"a":"div",d=c?` href="${t(c)}"`:"",o=["ac-kpi",l?`ac-kpi--${l}`:"",c?"ac-kpi--link":""].filter(Boolean).join(" ");return`<${g} class="${o}"${d}${n?` title="${t(n)}"`:""}>
		<p class="ac-kpi__label">${t(e)}</p>
		<p class="ac-kpi__value">${t(a)}</p>
		${s||r?`<p class="ac-kpi__meta">${r||""}${s?`<span>${t(s)}</span>`:""}</p>`:""}
	</${g}>`}function O({rows:e=[],value:a,max:s=null,label:l=d=>d.label,display:r=d=>va(d),tone:n="primary",threshold:c=null,ariaLabel:g="Comparison"}){let d=(Array.isArray(e)?e:[]).filter(Boolean);if(!d.length)return"";let o=680,m=38,i=150,v=64,_=10,p=8,y=d.length*m+_+p,h=d.map(A=>Number(typeof a=="function"?a(A):A[a])||0),b=Math.max(s||0,...h,1),w=o-i-v,P=A=>i+Oe(A,0,b)/b*w,x=c==null?"":`<line x1="${P(c)}" y1="${_-4}" x2="${P(c)}" y2="${y-p+2}" class="ac-chart__threshold"/>`,q=d.map((A,j)=>{let E=typeof a=="function"?a(A):A[a],ee=He(E),U=_+j*m+14,ge=12,sa=ee==null?0:Math.max(ee>0?2:0,P(ee)-i),na=typeof n=="function"?n(A):n,ke=r(E,A);return`<g>
				<title>${t(l(A))}: ${t(ke)}</title>
				<text x="${i-10}" y="${U+10}" text-anchor="end" class="ac-chart__label">${t(je(l(A),24))}</text>
				<rect x="${i}" y="${U}" width="${w}" height="${ge}" rx="3" class="ac-chart__track"/>
				<rect x="${i}" y="${U}" width="${sa}" height="${ge}" rx="3" fill="${ce(na)}" opacity="0.9"/>
				<text x="${o-v+8}" y="${U+10}" class="ac-chart__value">${t(ke)}</text>
			</g>`}).join("");return`<svg viewBox="0 0 ${o} ${y}" class="ac-chart ac-chart--bars" role="img" aria-label="${t(g)}">
		${x}${q}
	</svg>`}function Ie({rows:e=[],series:a=[],label:s=r=>r.label,ariaLabel:l="Comparison by group"}){let r=(Array.isArray(e)?e:[]).filter(Boolean);if(!r.length||!a.length)return"";let n=680,c=150,g=24,d=8,o=9,m=3,i=a.length*(o+m)+22,v=r.length*i+d+6,_=Math.max(1,...r.flatMap(h=>a.map(b=>Number(h[b.key])||0))),p=n-c-g,y=r.map((h,b)=>{let w=d+b*i,P=a.map((x,q)=>{let A=Number(h[x.key])||0,j=w+18+q*(o+m),E=A>0?Math.max(2,A/_*p):0;return`<g>
						<title>${t(s(h))} \xB7 ${t(x.label)}: ${A}</title>
						<rect x="${c}" y="${j}" width="${p}" height="${o}" rx="2" class="ac-chart__track"/>
						<rect x="${c}" y="${j}" width="${E}" height="${o}" rx="2" fill="${ce(x.tone)}" opacity="0.9"/>
						<text x="${c+E+6}" y="${j+o-1}" class="ac-chart__value ac-chart__value--inline">${A}</text>
					</g>`}).join("");return`<g>
				<text x="${c-10}" y="${w+26}" text-anchor="end" class="ac-chart__label">${t(je(s(h),24))}</text>
				${P}
			</g>`}).join("");return`<svg viewBox="0 0 ${n} ${v}" class="ac-chart ac-chart--grouped" role="img" aria-label="${t(l)}">
		${y}
	</svg>`}function J({points:e=[],series:a=[],labelKey:s="label",ariaLabel:l="Activity over time",height:r=220}){let n=Array.isArray(e)?e:[];if(!n.length||!a.length)return"";let c=680,g=38,d=14,o=16,m=34,i=Math.max(1,...n.flatMap(b=>a.map(w=>Number(b[w.key])||0))),v=(c-g-d)/n.length,_=Math.min(26,Math.max(5,v*.7/a.length)),p=b=>o+(1-Oe(b,0,i)/i)*(r-o-m),y=Math.max(1,Math.ceil(n.length/7)),h=n.map((b,w)=>{let P=g+w*v+v/2,x=a.length*(_+2),q=P-x/2,A=a.map((E,ee)=>{let se=Number(b[E.key])||0,U=r-m-p(se);return`<rect x="${q+ee*(_+2)}" y="${p(se)}" width="${_}" height="${Math.max(0,U)}" rx="2" fill="${ce(E.tone)}" opacity="0.9"><title>${t(b[s])} \xB7 ${t(E.label)}: ${se}</title></rect>`}).join(""),j=w%y===0?`<text x="${P}" y="${r-10}" text-anchor="middle" class="ac-chart__axis">${t(b[s])}</text>`:"";return`${A}${j}`}).join("");return`<svg viewBox="0 0 ${c} ${r}" class="ac-chart ac-chart--columns" role="img" aria-label="${t(l)}">
		<line x1="${g}" y1="${r-m}" x2="${c-d}" y2="${r-m}" class="ac-chart__grid"/>
		${h}
	</svg>`}var B={overview:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',organizations:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6"/><path d="M9 11h.01M15 11h.01"/></svg>',users:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',analytics:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></svg>',audit:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h4"/></svg>',health:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',settings:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',search:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',menu:'<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',sun:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',moon:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',external:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',logo:'<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5-10-5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>'};var Be="quizConsoleTheme";function fa(e){let s=String(e||"?").trim().split(/\s+/).filter(Boolean);return s.length?s.length===1?s[0].slice(0,2).toUpperCase():`${s[0][0]}${s[s.length-1][0]}`.toUpperCase():"?"}function xe(e){let a=document.documentElement,s=e||localStorage.getItem(Be)||(window.matchMedia?.("(prefers-color-scheme: dark)").matches?"dark":"light");return a.setAttribute("data-console-theme",s),localStorage.setItem(Be,s),s}function ba(){let e=document.documentElement.getAttribute("data-console-theme")==="dark"?"light":"dark";return xe(e),e}function Fe(e,{session:a,navItems:s,canAny:l,onNavigate:r}){let n=a.user,c=!!a.scope?.isPlatform,g=a.scope?.organization,d=s.filter(i=>{if(!i.permission)return!0;let v=Array.isArray(i.permission)?i.permission:[i.permission];return l(v)}),o=c?"Platform scope":g?.name?g.name:"Organization scope";e.innerHTML=`
		<aside class="ac-sidebar" id="ac-sidebar">
			<div class="ac-sidebar__brand">
				<div class="ac-sidebar__logo" aria-hidden="true">${B.logo}</div>
				<div class="ac-sidebar__titles">
					<p class="ac-sidebar__title">Control Center</p>
					<p class="ac-sidebar__subtitle">${t(c?"All organizations":g?.name||"Organization")}</p>
				</div>
			</div>
			<nav class="ac-nav" aria-label="Console sections">
				${d.map(i=>`
					<button type="button" class="ac-nav__item" data-ac-nav="${t(i.id)}" data-ac-path="${t(i.path)}">
						${B[i.icon]||B.overview}
						<span class="ac-nav__label">${t(i.title)}</span>
					</button>`).join("")}
			</nav>
			<div class="ac-sidebar__footer">
				<div class="ac-user">
					<div class="ac-user__avatar" aria-hidden="true">${t(fa(n.name))}</div>
					<div class="ac-user__meta">
						<p class="ac-user__name">${t(n.name||n.username)}</p>
						<p class="ac-user__role">${t(n.roleLabel||n.role)}</p>
					</div>
				</div>
			</div>
		</aside>

		<div class="ac-main">
			<header class="ac-header">
				<button type="button" class="ac-btn ac-btn--ghost ac-btn--icon ac-header__toggle" data-ac-menu aria-label="Toggle navigation">
					${B.menu}
				</button>
				<div class="ac-header__titles">
					<h1 class="ac-header__title" id="ac-page-title">Overview</h1>
					<p class="ac-header__description" id="ac-page-description"></p>
				</div>
				<div class="ac-header__actions">
					<span class="ac-scope${c?" ac-scope--platform":""}" title="The slice of the platform this session can reach">
						<span class="ac-scope__dot"></span>${t(o)}
					</span>
					<div class="ac-search">
						${B.search}
						<input type="search" id="ac-global-search" placeholder="Search\u2026" aria-label="Search the console" autocomplete="off" />
					</div>
					<button type="button" class="ac-btn ac-btn--ghost ac-btn--icon" data-ac-theme aria-label="Toggle colour theme">
						${B.sun}
					</button>
					<a class="ac-btn ac-btn--ghost" href="/admin.html" title="Open the classroom administration surface">
						${B.external}<span>Classroom</span>
					</a>
				</div>
			</header>
			<main class="ac-content" id="ac-content" tabindex="-1"></main>
		</div>`,e.hidden=!1;let m=e.querySelector("#ac-sidebar");return e.querySelector("[data-ac-menu]")?.addEventListener("click",()=>{m.classList.toggle("is-open")}),e.querySelector("[data-ac-theme]")?.addEventListener("click",i=>{let v=ba();i.currentTarget.innerHTML=v==="dark"?B.moon:B.sun}),e.querySelectorAll("[data-ac-nav]").forEach(i=>{i.addEventListener("click",()=>{m.classList.remove("is-open"),r(i.dataset.acPath)})}),{content:e.querySelector("#ac-content"),title:e.querySelector("#ac-page-title"),description:e.querySelector("#ac-page-description"),setActive(i){e.querySelectorAll("[data-ac-nav]").forEach(v=>{v.classList.toggle("is-active",v.dataset.acPath===i||i!=="/"&&v.dataset.acPath!=="/"&&i.startsWith(v.dataset.acPath))})}}}function T({columns:e,rows:a,empty:s="Nothing to show for the current filters.",sort:l=null,onSort:r=null,rowHref:n=null,rowClass:c=null}){if(!a||a.length===0)return`<div class="ac-empty">
			<div class="ac-empty__icon" aria-hidden="true">
				<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
			</div>
			<p class="ac-empty__title">No data</p>
			<p class="ac-empty__message">${t(s)}</p>
		</div>`;let g=e.map(o=>{let m=o.align==="right"?" is-numeric":"",i=o.sortable&&r?" is-sortable":"",v=l&&l.key===o.key,_=v?l.direction==="asc"?"\u25B2":"\u25BC":"";return`<th class="${m}${i}"${i?` data-ac-sort="${t(o.key)}"`:""}${v?` aria-sort="${l.direction==="asc"?"ascending":"descending"}"`:""}>
				${t(o.label)}${_?`<span class="ac-sort">${_}</span>`:""}
			</th>`}).join(""),d=a.map((o,m)=>{let i=n?n(o):null,v=c?c(o):"",_=e.map(p=>{let y=p.align==="right"?" is-numeric":"",h=p.render?p.render(o):t(o[p.key]??"\u2014");return`<td class="${y}${p.className?` ${p.className}`:""}" data-label="${t(p.label)}">${h}</td>`}).join("");return`<tr${i?` data-ac-href="${t(i)}"`:""} class="${t(v)}" data-ac-row="${m}">${_}</tr>`}).join("");return`<div class="ac-table-wrap"><table class="ac-table">
		<thead><tr>${g}</tr></thead>
		<tbody>${d}</tbody>
	</table></div>`}function Z({total:e,limit:a,offset:s,onPage:l}){let r=Math.max(1,Number(a)||50),n=Math.max(0,Number(s)||0),c=Math.floor(n/r)+1,g=Math.max(1,Math.ceil((Number(e)||0)/r)),d=e===0?0:n+1,o=Math.min(n+r,Number(e)||0),m=(i,v,_,p="")=>`<button type="button" class="ac-btn ac-btn--sm" data-ac-page="${v}"${_?" disabled":""}${p}>${i}</button>`;return`<div class="ac-pagination">
		<span>Showing ${d}\u2013${o} of ${(Number(e)||0).toLocaleString()}</span>
		<div class="ac-pagination__pages">
			${m("\xAB",0,n===0)}
			${m("\u2039",Math.max(0,n-r),n===0)}
			<span style="padding:0 6px">Page ${c} of ${g}</span>
			${m("\u203A",n+r,n+r>=(Number(e)||0))}
			${m("\xBB",Math.max(0,(g-1)*r),n+r>=(Number(e)||0))}
		</div>
	</div>`}function C(e=3){return`<div class="ac-skeleton-stack" aria-busy="true">
		${Array.from({length:e}).map((a,s)=>`<div class="ac-skeleton" style="width:${100-s*12}%"></div>`).join("")}
	</div>`}function F({title:e="No data",message:a="There is nothing to report for the current filters and period.",action:s=""}={}){return`<div class="ac-empty">
		<div class="ac-empty__icon" aria-hidden="true">
			<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h18M3 12h18M3 17h10"/></svg>
		</div>
		<p class="ac-empty__title">${t(e)}</p>
		<p class="ac-empty__message">${t(a)}</p>
		${s}
	</div>`}function z({title:e="This section could not be loaded",message:a="An unexpected error occurred. The rest of the console is unaffected.",retry:s=!0}={}){return`<div class="ac-error" role="alert">
		<div>
			<p class="ac-error__title">${t(e)}</p>
			<p class="ac-error__message">${t(a)}</p>
		</div>
		${s?'<button type="button" class="ac-btn ac-btn--sm" data-ac-retry>Retry</button>':""}
	</div>`}var _a=Object.freeze([{key:"7d",label:"7 days"},{key:"30d",label:"30 days"},{key:"90d",label:"90 days"},{key:"year",label:"Academic year"},{key:"custom",label:"Custom"}]);function ya({options:e,value:a,name:s,onSelect:l=null}){return`<div class="ac-chip-group" role="group" aria-label="Period">${e.map(r=>`<button type="button" class="ac-chip${r.key===a?" is-active":""}" data-ac-chip="${s}" data-ac-value="${t(r.key)}" aria-pressed="${r.key===a}">${t(r.label)}</button>`).join("")}</div>`}function le(e,a,s){e.querySelectorAll(`[data-ac-chip="${a}"]`).forEach(l=>{l.addEventListener("click",()=>s(l.dataset.acValue))})}function Q({id:e="ac-search",placeholder:a="Search\u2026",value:s=""}){return`<div class="ac-field">
		<label class="ac-field__label" for="${t(e)}">Search</label>
		<input class="ac-input" id="${t(e)}" type="search" placeholder="${t(a)}" value="${t(s)}" autocomplete="off" />
	</div>`}function D({id:e,label:a,options:s=[],value:l="",allLabel:r=null,includeAll:n=!1}){return`<div class="ac-field">
		<label class="ac-field__label" for="${t(e)}">${t(a)}</label>
		<select class="ac-select" id="${t(e)}" data-ac-select="${t(e)}">
			${n?`<option value=""${l?"":" selected"}>${t(r||"All")}</option>`:""}
			${s.map(c=>`<option value="${t(c.value)}"${String(c.value)===String(l)?" selected":""}>${t(c.label)}</option>`).join("")}
		</select>
	</div>`}function de({value:e,customFrom:a="",customTo:s=""}){let l=e==="custom"?`<div class="ac-field">
					<label class="ac-field__label" for="ac-period-from">From</label>
					<input class="ac-input" id="ac-period-from" type="date" value="${t(a)}" />
				</div>
				<div class="ac-field">
					<label class="ac-field__label" for="ac-period-to">To</label>
					<input class="ac-input" id="ac-period-to" type="date" value="${t(s)}" />
				</div>`:"";return`<div class="ac-toolbar">
		${ya({options:_a,value:e,name:"period"})}
		${l}
	</div>`}var G=null;function xa(){return G||(G=document.createElement("div"),G.className="ac-toasts",G.setAttribute("role","status"),G.setAttribute("aria-live","polite"),document.body.appendChild(G)),G}function L(e,a="info",s=4200){let l=xa(),r=document.createElement("div");return r.className=`ac-toast ac-toast--${a}`,r.innerHTML=`<span class="ac-toast__text">${t(e)}</span>`,l.appendChild(r),window.setTimeout(()=>{r.style.opacity="0",r.style.transition="opacity .18s ease",window.setTimeout(()=>r.remove(),200)},s),r}var pe=0;function ue({title:e,subtitle:a="",body:s,footer:l="",wide:r=!1,onMount:n=null}){let c=document.createElement("div");c.className="ac-modal-backdrop",c.setAttribute("role","dialog"),c.setAttribute("aria-modal","true"),c.setAttribute("aria-label",e),c.innerHTML=`
		<div class="ac-modal${r?" ac-modal--wide":""}">
			<div class="ac-modal__header">
				<div>
					<h2 class="ac-modal__title">${t(e)}</h2>
					${a?`<p class="ac-modal__subtitle">${t(a)}</p>`:""}
				</div>
				<button type="button" class="ac-close" data-ac-close aria-label="Close">&times;</button>
			</div>
			<div class="ac-modal__body" data-ac-modal-body></div>
			${l?'<div class="ac-modal__footer" data-ac-modal-footer></div>':""}
		</div>`;let g=c.querySelector("[data-ac-modal-body]");typeof s=="string"?g.innerHTML=s:s&&g.appendChild(s);let d=c.querySelector("[data-ac-modal-footer]");d&&(typeof l=="string"?d.innerHTML=l:l&&d.appendChild(l));function o(){c.remove(),pe=Math.max(0,pe-1),pe===0&&document.body.style.removeProperty("overflow"),document.removeEventListener("keydown",m)}function m(v){v.key==="Escape"&&o()}c.addEventListener("click",v=>{v.target===c&&o()}),c.querySelectorAll("[data-ac-close]").forEach(v=>v.addEventListener("click",o)),document.addEventListener("keydown",m),document.body.appendChild(c),pe+=1,document.body.style.overflow="hidden";let i=c.querySelector("input, select, textarea, button:not([data-ac-close])");return i&&i.focus(),n&&n(c),{close:o,root:c}}function X({title:e,message:a,detail:s="",confirmLabel:l="Confirm",danger:r=!1}){return new Promise(n=>{let c=ue({title:e,body:`
				<p style="margin:0 0 10px;font-size:13.5px;line-height:1.55">${t(a)}</p>
				${s?`<div class="ac-alert ac-alert--${r?"danger":"info"}"><div class="ac-alert__body"><p class="ac-alert__text">${t(s)}</p></div></div>`:""}
			`,footer:`
				<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
				<button type="button" class="ac-btn ${r?"ac-btn--danger":"ac-btn--primary"}" data-ac-confirm>${t(l)}</button>
			`});c.root.querySelector("[data-ac-cancel]").addEventListener("click",()=>{c.close(),n(!1)}),c.root.querySelector("[data-ac-confirm]").addEventListener("click",()=>{c.close(),n(!0)}),c.root.addEventListener("click",g=>{g.target===c.root&&n(!1)})})}function u(e,a="\u2014"){if(e==null||e==="")return a;let s=Number(e);return Number.isFinite(s)?s.toLocaleString():a}function S(e,{withTime:a=!0}={}){if(!e)return"\u2014";let s=e instanceof Date?e:new Date(e);return Number.isNaN(s.getTime())?"\u2014":s.toLocaleString(void 0,{year:"numeric",month:"short",day:"2-digit",...a?{hour:"2-digit",minute:"2-digit"}:{}})}function M(e){if(!e)return"never";let a=e instanceof Date?e:new Date(e);if(Number.isNaN(a.getTime()))return"never";let s=Math.round((Date.now()-a.getTime())/1e3),l=[["year",31536e3],["month",2592e3],["day",86400],["hour",3600],["minute",60]];for(let[r,n]of l)if(Math.abs(s)>=n){let c=Math.round(s/n);return`${c} ${r}${c===1?"":"s"} ago`}return"just now"}function $e(e,a,s="s"){let l=Number(e)||0;return`${u(l)} ${a}${l===1?"":s}`}var $a=10,Ge={id:"overview",path:"/",title:"Overview",description:"Platform health, growth, adoption and the actions that need attention.",permission:["platform.console","school.console"],async render(e,a){let s=re();e.innerHTML=`<div class="ac-stack" data-ac-overview>
			${de({value:s.period})}
			<div data-ac-kpis class="ac-grid ac-grid--kpi">${C(1)}</div>
			<div data-ac-alerts class="ac-stack"></div>
			<div data-ac-trends class="ac-grid ac-grid--2"></div>
			<div data-ac-orgs></div>
			<div data-ac-engagement class="ac-grid ac-grid--2"></div>
		</div>`;let r={period:s.period==="year"?"year":s.period};s.period==="custom"&&s.customRange&&(r.from=s.customRange.from,r.to=s.customRange.to);let n,c;try{[n,c]=await Promise.all([$.get("console/overview",r),$.get("console/trends",r)])}catch(w){e.innerHTML=z({title:"The overview could not be loaded",message:w.message}),e.querySelector("[data-ac-retry]")?.addEventListener("click",()=>{a.rerender()});return}let g=n.data,d=g.sections.glance,o=g.sections.activity,m=g.sections.operations,i=g.sections.content,v=g.meta.definitions,_=g.meta.scope.kind==="platform",p=[];_?p.push(f({label:"Organizations",value:u(d.organizations.total),note:`${d.organizations.active} active \xB7 ${d.organizations.pending} pending \xB7 ${d.organizations.suspended} suspended`,tone:"primary",tooltip:'Organizations are the tenants of the platform. "Active" means status = active. "New" counts organizations created inside the selected period.',href:"#/organizations"}),f({label:"New organizations",value:u(d.organizations.newInPeriod),note:g.meta.scope.periodLabel,tooltip:"Organizations whose created_at falls inside the selected period. The previous equal-length period is used for the comparison when one exists."})):p.push(f({label:"Organization",value:a.organization?.name||"\u2014",note:a.organization?.plan?`Plan: ${a.organization.plan}`:"",tone:"primary",tooltip:"The organization this session is scoped to.",href:"#/organizations"})),p.push(f({label:"Active teachers",value:u(d.users.activeTeachers),note:`of ${u(d.users.teachers)} total`,tone:"success",tooltip:v.activeTeacher,href:"#/analytics"}),f({label:"Active students",value:u(d.users.activeStudents),note:`of ${u(d.users.students)} total`,tone:"success",tooltip:v.activeStudent,href:"#/analytics"}),f({label:"Exams conducted",value:u(o.examsConducted),note:$e(o.formalAttempts,"formal attempt"),tooltip:v.examsConducted}),f({label:"Average score",value:o.averageScore20==null?"\u2014":`${o.averageScore20.toFixed(2)}`,note:o.averageScoreSample>0?`/20 \xB7 ${$e(o.averageScoreSample,"attempt")}`:"no formal attempts in this period",tone:o.averageScore20==null?"":"primary",tooltip:v.averageScore}),f({label:"Service availability",value:m.availabilityPercent==null?"\u2014":`${m.availabilityPercent.toFixed(1)}%`,note:"last 60 minutes",tone:m.availabilityPercent==null?"":m.availabilityPercent>=99?"success":"warning",tooltip:m.note,href:"#/health"}),f({label:"Failed sign-ins",value:u(m.failedAuthentications),note:g.meta.scope.periodLabel,tone:m.failedAuthentications>0?"warning":"",tooltip:"Failed sign-in attempts recorded in the durable security trail inside the selected period. Grouped by source address and attempted username on the Audit page.",href:"#/audit"})),e.querySelector("[data-ac-kpis]").innerHTML=p.join(""),e.querySelector("[data-ac-alerts]").innerHTML=wa(g,d,m,o);let y=e.querySelector("[data-ac-trends]");if(c){let w=c.data.series,P=w.labels,x=[{key:"formalAttempts",label:"Formal exams",tone:"primary"},{key:"trainingAttempts",label:"Training",tone:"info"},{key:"gameAttempts",label:"Games",tone:"violet"}],q=[{key:"newTeachers",label:"Teachers",tone:"success"},{key:"newStudents",label:"Students",tone:"warning"}],A=P.map((j,E)=>({label:j,formalAttempts:w.formalAttempts[E]||0,trainingAttempts:w.trainingAttempts[E]||0,gameAttempts:w.gameAttempts[E]||0,newTeachers:w.newTeachers[E]||0,newStudents:w.newStudents[E]||0}));y.innerHTML=`
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles">
							<h3 class="ac-panel__title">Educational activity over time</h3>
							<p class="ac-panel__subtitle">Completed attempts, split by mode. ${t(c.data.meta.granularity==="week"?"Weekly":"Daily")} buckets over ${t(c.data.meta.periodLabel)}.</p>
						</div>
					</div>
					<div class="ac-panel__body">
						${V(x)}
						${J({points:A,series:x,labelKey:"label",ariaLabel:"Completed attempts over time by mode"})}
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
						${V(q)}
						${J({points:A,series:q,labelKey:"label",ariaLabel:"New accounts over time"})}
					</div>
				</section>`}let h=e.querySelector("[data-ac-orgs]");h.innerHTML=`<section class="ac-panel">
			<div class="ac-panel__header">
				<div class="ac-panel__titles">
					<h3 class="ac-panel__title">Organizations requiring attention</h3>
					<p class="ac-panel__subtitle">Active users are measured over the last 30 days. Alerts come from real account, request and activity records.</p>
				</div>
				<div class="ac-panel__actions"><a class="ac-btn ac-btn--sm" href="#/organizations">Open organizations</a></div>
			</div>
			<div class="ac-panel__body ac-panel__body--flush" data-ac-org-table>
				${C(3)}
			</div>
		</section>`;try{let w=await $.get("console/organizations",{limit:$a,offset:0}),P=h.querySelector("[data-ac-org-table]");P.innerHTML=T({columns:[{key:"name",label:"Organization",render:x=>`<span class="ac-table__primary">${t(x.name)}</span><br><span class="ac-table__muted">${t(x.schoolType||"")} \xB7 ${t(x.plan||"")}</span>`},{key:"teachers",label:"Teachers",align:"right"},{key:"students",label:"Students",align:"right"},{key:"activeStudents",label:"Active (30d)",align:"right",render:x=>`<span title="Active students over the last 30 days">${u(x.activeStudents)}</span>`},{key:"attempts30d",label:"Attempts (30d)",align:"right"},{key:"lastActivity",label:"Last activity",render:x=>x.lastActivity?`<span title="${t(S(x.lastActivity))}">${t(M(x.lastActivity))}</span>`:'<span class="ac-badge ac-badge--danger">none</span>'},{key:"status",label:"Status",render:x=>`<span class="ac-badge ${x.status==="active"?"ac-badge--success":x.status==="pending"?"ac-badge--warning":"ac-badge--danger"}">${t(x.status)}</span>`},{key:"alerts",label:"Alerts",render:x=>x.alerts.length?x.alerts.map(q=>`<span class="ac-badge ac-badge--${q.kind==="danger"?"danger":q.kind==="warning"?"warning":"info"}" title="${t(q.message)}">${t(q.code)}</span>`).join(" "):'<span class="ac-table__muted">\u2014</span>'}],rows:w.data,empty:"No organizations are visible in this scope yet.",rowHref:x=>`#/organizations/${x.id}`})}catch(w){h.querySelector("[data-ac-org-table]").innerHTML=z({message:w.message})}let b=e.querySelector("[data-ac-engagement]");b.innerHTML=`
			<section class="ac-panel">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title">Teacher engagement</h3>
						<p class="ac-panel__subtitle">${t(v.activeTeacher)}</p>
					</div>
				</div>
				<div class="ac-panel__body">
					${De([{label:"Active teachers",value:d.users.activeTeachers,total:d.users.teachers,tone:"success"},{label:"Content-producing teachers",value:i.exams,total:d.users.teachers,tone:"primary"},{label:"Organizations with activity",value:d.organizations.withActivity,total:d.organizations.total,tone:"info"}])}
				</div>
			</section>
			<section class="ac-panel">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title">Student participation</h3>
						<p class="ac-panel__subtitle">${t(v.activeStudent)}</p>
					</div>
				</div>
				<div class="ac-panel__body">
					${De([{label:"Participating students",value:o.participatingStudents,total:d.users.students,tone:"primary"},{label:"Active students (period)",value:d.users.activeStudents,total:d.users.students,tone:"success"},{label:"Game sessions played",value:o.gameSessions+o.kidsGameSessions,total:null,tone:"violet"}])}
					<div class="ac-defs" style="margin-top:16px">
						<div class="ac-defs__item">
							<p class="ac-defs__term">Total attempts</p>
							<p class="ac-defs__desc">${u(o.attempts)}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Unique participating students</p>
							<p class="ac-defs__desc">${u(o.participatingStudents)}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Attempts vs students</p>
							<p class="ac-defs__desc">${u(o.attempts)} attempts from ${u(o.participatingStudents)} students</p>
						</div>
					</div>
				</div>
			</section>`,le(e,"period",async w=>{if(w==="custom"){let P=prompt("From (YYYY-MM-DD)",new Date(Date.now()-2592e6).toISOString().slice(0,10));if(!P){L("Custom period needs a start date.","error");return}let x=prompt("To (YYYY-MM-DD)",new Date().toISOString().slice(0,10));if(!x){L("Custom period needs an end date.","error");return}a.setPeriod("custom",{from:P,to:x});return}a.setPeriod(w)})}};function De(e){return`<div class="ac-stack" style="gap:12px">${e.map(a=>{let s=a.total&&a.total>0?Math.min(1,a.total?a.value/a.total:0):null,l=s==null?null:Math.round(s*1e3)/10;return`<div>
				<div style="display:flex;justify-content:space-between;gap:10px;font-size:12.5px;margin-bottom:4px">
					<span style="color:var(--ac-text-muted)">${t(a.label)}</span>
					<span style="font-weight:650;font-variant-numeric:tabular-nums">${u(a.value)}${a.total!=null?` <span style="color:var(--ac-text-subtle);font-weight:500">/ ${u(a.total)}</span>`:""}</span>
				</div>
				<div class="ac-chart__track" style="height:8px;border-radius:4px;overflow:hidden;background:var(--ac-surface-3)">
					<div style="height:100%;width:${l??0}%;background:var(--ac-tone-${a.tone==="success"?2:a.tone==="warning"?3:a.tone==="violet"?6:1});border-radius:4px"></div>
				</div>
				${l==null?"":`<div style="font-size:11px;color:var(--ac-text-subtle);margin-top:2px">${l}% of the population</div>`}
			</div>`}).join("")}</div>`}function wa(e,a,s,l){let r=[];if(a.organizations.suspended>0&&r.push({kind:"danger",title:`${a.organizations.suspended} organization${a.organizations.suspended===1?" is":"s are"} suspended`,text:"Suspended organizations cannot sign in. Review whether access should be restored.",action:{label:"Review organizations",href:"#/organizations?status=suspended"}}),a.organizations.pending>0&&r.push({kind:"warning",title:`${a.organizations.pending} organization${a.organizations.pending===1?"":"s"} awaiting activation`,text:"Provisioned organizations that have never been activated.",action:{label:"Review organizations",href:"#/organizations?status=pending"}}),a.users.pendingInvitations>0&&r.push({kind:"info",title:`${a.users.pendingInvitations} account request${a.users.pendingInvitations===1?"":"s"} awaiting a decision`,text:"Account requests are waiting for an administrator to approve or reject them.",action:{label:"Review requests",href:"#/users?status=pending"}}),a.users.suspended>0&&r.push({kind:"warning",title:`${a.users.suspended} suspended account${a.users.suspended===1?"":"s"}`,text:"Suspended accounts keep their data but cannot sign in.",action:{label:"Review accounts",href:"#/users?status=suspended"}}),s.failedAuthentications>0&&r.push({kind:"warning",title:`${s.failedAuthentications} failed sign-in attempt${s.failedAuthentications===1?"":"s"} in this period`,text:"Grouped by source address and attempted username on the Audit page \u2014 a concentration may indicate credential stuffing.",action:{label:"Inspect security events",href:"#/audit"}}),s.serverErrorRatePercent!=null&&s.serverErrorRatePercent>=1&&r.push({kind:"danger",title:`Server error rate at ${s.serverErrorRatePercent}%`,text:"More than one in a hundred requests failed with a server error in the last hour. See System Health for the affected endpoints.",action:{label:"Open system health",href:"#/health"}}),l.attemptsPrevious!=null&&l.attempts>0&&l.attemptsPrevious>0){let n=Math.round((l.attempts-l.attemptsPrevious)/l.attemptsPrevious*1e3)/10;n<=-30&&r.push({kind:"warning",title:`Attempts fell ${Math.abs(n)}% versus the previous period`,text:"A sharp drop usually means an organization stopped using the platform, or a term boundary was crossed.",action:{label:"Compare organizations",href:"#/analytics"}})}return r.length?`<div class="ac-alert-list">${r.map(n=>`
			<div class="ac-alert-item">
				<div class="ac-alert-item__body">
					<p class="ac-alert-item__title">${t(n.title)}</p>
					<p class="ac-alert-item__text">${t(n.text)}</p>
				</div>
				<div class="ac-alert-item__action">
					<a class="ac-btn ac-btn--sm" href="${t(n.action.href)}">${t(n.action.label)}</a>
				</div>
			</div>`).join("")}</div>`:`<div class="ac-alert ac-alert--info">
			<div class="ac-alert__body">
				<p class="ac-alert__title">No administrative alerts</p>
				<p class="ac-alert__text">Every monitored threshold is inside its normal range for ${t(e.meta.scope.periodLabel.toLowerCase())}.</p>
			</div>
		</div>`}var ka=25,N={search:"",status:"",offset:0,sort:{key:"name",direction:"asc"}},Ue={id:"organizations",path:"/organizations",title:"Organizations",description:"Every organization on the platform, its accounts, its usage and the conditions that need attention.",permission:["platform.organizations.read","school.profile.read"],async render(e,a){e.innerHTML=`
			<div class="ac-toolbar">
				${Q({id:"ac-org-search",placeholder:"Search organizations\u2026",value:N.search})}
				${D({id:"ac-org-status",label:"Status",value:N.status,includeAll:!0,allLabel:"All statuses",options:[{value:"active",label:"Active"},{value:"pending",label:"Pending"},{value:"suspended",label:"Suspended"}]})}
				<button type="button" class="ac-btn" data-ac-refresh>Refresh</button>
			</div>
			<div class="ac-grid ac-grid--kpi" data-ac-org-kpis></div>
			<section class="ac-panel" style="margin-top:16px">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title">Organizations</h3>
						<p class="ac-panel__subtitle">Active users are measured over the last 30 days from real sign-ins, attempts and content creation.</p>
					</div>
				</div>
				<div class="ac-panel__body ac-panel__body--flush" data-ac-org-body>
					${C(4)}
				</div>
			</section>
			<div class="ac-grid ac-grid--2" style="margin-top:16px" data-ac-org-charts></div>`;let s=e.querySelector("[data-ac-org-body]"),l=e.querySelector("[data-ac-org-kpis]"),r=e.querySelector("[data-ac-org-charts]"),n;try{n=await $.get("console/organizations",{search:N.search||void 0,status:N.status||void 0,limit:ka,offset:N.offset})}catch(h){s.innerHTML=z({message:h.message});return}let c=n.data,g=c.length,d=c.filter(h=>h.status==="active").length,o=c.filter(h=>h.status==="pending").length,m=c.filter(h=>h.status==="suspended").length,i=c.reduce((h,b)=>h+(b.teachers||0),0),v=c.reduce((h,b)=>h+(b.students||0),0),_=c.filter(h=>h.alerts.some(b=>b.code==="inactive"||b.code==="no_activity")).length;if(l.innerHTML=[f({label:"Organizations shown",value:u(g),note:n.total>c.length?`of ${u(n.total)} matching`:"matching the filter",tooltip:"The number of organizations matching the current search and status filter."}),f({label:"Active",value:u(d),tone:"success",tooltip:'Organizations whose lifecycle status is "active".'}),f({label:"Pending / suspended",value:`${u(o)} / ${u(m)}`,tone:o+m>0?"warning":"",tooltip:"Organizations awaiting activation, and organizations whose access has been revoked."}),f({label:"Accounts",value:u(i+v),note:`${u(i)} teachers \xB7 ${u(v)} students`,tooltip:"Teacher and student accounts across the organizations shown."}),f({label:"Needing attention",value:u(_),tone:_>0?"warning":"",tooltip:"Organizations with no activity in the last 30 days, or with no recorded activity at all."})].join(""),s.innerHTML=T({columns:[{key:"name",label:"Organization",sortable:!0,render:h=>`<a href="#/organizations/${h.id}" class="ac-table__primary">${t(h.name)}</a><br><span class="ac-table__muted">${t(h.slug)}</span>`},{key:"status",label:"Status",sortable:!0,render:h=>`<span class="ac-badge ${h.status==="active"?"ac-badge--success":h.status==="pending"?"ac-badge--warning":"ac-badge--danger"}">${t(h.status)}</span>`},{key:"plan",label:"Plan",render:h=>t(h.plan||"\u2014")},{key:"teachers",label:"Teachers",align:"right",sortable:!0},{key:"students",label:"Students",align:"right",sortable:!0},{key:"activeTeachers",label:"Active teachers",align:"right",sortable:!0,render:h=>`${u(h.activeTeachers)} / ${u(h.teachers)}`},{key:"activeStudents",label:"Active students",align:"right",sortable:!0,render:h=>`${u(h.activeStudents)} / ${u(h.students)}`},{key:"attempts30d",label:"Attempts (30d)",align:"right",sortable:!0},{key:"lastActivity",label:"Last activity",sortable:!0,render:h=>h.lastActivity?`<span title="${t(S(h.lastActivity))}">${t(M(h.lastActivity))}</span>`:'<span class="ac-badge ac-badge--danger">none</span>'},{key:"alerts",label:"Alerts",render:h=>h.alerts.length?h.alerts.map(b=>`<span class="ac-badge ac-badge--${b.kind==="danger"?"danger":b.kind==="warning"?"warning":"info"}" title="${t(b.message)}">${t(b.code)}</span>`).join(" "):'<span class="ac-table__muted">\u2014</span>'}],rows:c,sort:N.sort,onSort:h=>{N.sort={key:h,direction:N.sort.key===h&&N.sort.direction==="asc"?"desc":"asc"},a.rerender()},empty:a.isPlatform?"No organization matches the current search and status filter.":"This session is scoped to a single organization.",rowHref:h=>`#/organizations/${h.id}`}),s.insertAdjacentHTML("beforeend",Z({total:n.total,limit:n.limit,offset:n.offset,onPage:h=>{N.offset=h,a.rerender()}})),a.isPlatform&&c.length){let h=[...c].sort((b,w)=>(w.activeStudents||0)-(b.activeStudents||0)).slice(0,8);r.innerHTML=`
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles">
							<h3 class="ac-panel__title">Usage by organization</h3>
							<p class="ac-panel__subtitle">Active students over the last 30 days, highest first.</p>
						</div>
					</div>
					<div class="ac-panel__body">
						${O({rows:h.map(b=>({label:b.name,value:b.activeStudents||0})),value:"value",label:b=>b.label,display:b=>u(b),tone:"primary",ariaLabel:"Active students by organization"})}
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
						${O({rows:h.map(b=>({label:b.name,teachers:b.teachers||0,students:b.students||0})),value:"students",label:b=>b.label,display:b=>u(b),tone:"primary",ariaLabel:"Students by organization"})}
					</div>
				</section>`}else r.innerHTML="";let p=e.querySelector("#ac-org-search"),y=null;p.addEventListener("input",()=>{window.clearTimeout(y),y=window.setTimeout(()=>{N.search=p.value.trim(),N.offset=0,a.rerender()},320)}),e.querySelector("#ac-org-status").addEventListener("change",h=>{N.status=h.target.value,N.offset=0,a.rerender()}),e.querySelector("[data-ac-refresh]").addEventListener("click",()=>a.rerender())}};var Sa=25,R={search:"",role:"",status:"",offset:0},Ta={super_admin:"Platform administrator",admin:"Administrator",teacher:"Teacher",student:"Student"},Ye={id:"users",path:"/users",title:"Users & Access",description:"Accounts, roles, invitations and access decisions across every organization in scope.",permission:["platform.users.read","school.users.read"],async render(e,a){e.innerHTML=`
			<div class="ac-toolbar">
				${Q({id:"ac-user-search",placeholder:"Search name, username or email\u2026",value:R.search})}
				${D({id:"ac-user-role",label:"Role",value:R.role,includeAll:!0,allLabel:"All roles",options:[{value:"super_admin",label:"Platform administrator"},{value:"admin",label:"Administrator"},{value:"teacher",label:"Teacher"},{value:"student",label:"Student"}]})}
				${D({id:"ac-user-status",label:"Status",value:R.status,includeAll:!0,allLabel:"All statuses",options:[{value:"active",label:"Active"},{value:"inactive",label:"Inactive"},{value:"suspended",label:"Suspended"}]})}
				<button type="button" class="ac-btn" data-ac-refresh>Refresh</button>
			</div>
			<div class="ac-grid ac-grid--kpi" data-ac-user-kpis"></div>
			<section class="ac-panel" style="margin-top:16px">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title">Accounts</h3>
						<p class="ac-panel__subtitle">Last sign-in comes from the recorded authentication trail, not from a guess.</p>
					</div>
				</div>
				<div class="ac-panel__body ac-panel__body--flush" data-ac-user-body>
					${C(4)}
				</div>
			</section>`;let s=e.querySelector("[data-ac-user-body]"),l=e.querySelector("[data-ac-user-kpis]"),r;try{r=await $.get("console/users",{search:R.search||void 0,role:R.role||void 0,status:R.status||void 0,limit:Sa,offset:R.offset})}catch(i){s.innerHTML=z({message:i.message});return}let n=r.data,c={super_admin:0,admin:0,teacher:0,student:0},g=0,d=0;for(let i of n)c[i.role]!==void 0&&(c[i.role]+=1),i.status==="suspended"&&(g+=1),i.lastLogin||(d+=1);l.innerHTML=[f({label:"Accounts shown",value:u(n.length),note:r.total>n.length?`of ${u(r.total)} matching`:"matching the filter",tooltip:"Accounts matching the current search, role and status filters."}),f({label:"Teachers",value:u(c.teacher),tone:"primary",tooltip:"Teacher accounts in the filtered set."}),f({label:"Students",value:u(c.student),tooltip:"Student accounts in the filtered set."}),f({label:"Administrators",value:u(c.admin+c.super_admin),tone:"primary",tooltip:"Organization administrators plus platform administrators. Platform administrators can reach every organization."}),f({label:"Suspended",value:u(g),tone:g>0?"warning":"",tooltip:"Suspended accounts cannot sign in. Their data is retained and their sessions are revoked on the next request."}),f({label:"Never signed in",value:u(d),tone:d>0?"warning":"",tooltip:"Accounts with no recorded sign-in. Provisioned but unused \u2014 a common sign of a stale invitation."})].join(""),s.innerHTML=T({columns:[{key:"name",label:"Account",render:i=>`<span class="ac-table__primary">${t(i.name||i.username)}</span><br><span class="ac-table__muted">${t(i.username)}${i.email?` \xB7 ${t(i.email)}`:""}</span>`},{key:"role",label:"Role",render:i=>`<span class="ac-badge ${i.role==="super_admin"?"ac-badge--violet":i.role==="admin"?"ac-badge--brand":""}">${t(Ta[i.role]||i.role)}</span>`},{key:"status",label:"Status",render:i=>`<span class="ac-badge ${i.status==="active"?"ac-badge--success":i.status==="suspended"?"ac-badge--danger":"ac-badge--warning"}">${t(i.status)}</span>`},{key:"schoolName",label:"Organization",render:i=>t(i.schoolName||"\u2014")},{key:"className",label:"Class",render:i=>t(i.className||"\u2014")},{key:"lastLogin",label:"Last sign-in",render:i=>i.lastLogin?`<span title="${t(S(i.lastLogin))}">${t(M(i.lastLogin))}</span>`:'<span class="ac-badge ac-badge--warning">never</span>'},{key:"createdAt",label:"Created",render:i=>t(S(i.createdAt,{withTime:!1}))}],rows:n,empty:"No account matches the current filters."}),s.insertAdjacentHTML("beforeend",Z({total:r.total,limit:r.limit,offset:r.offset,onPage:i=>{R.offset=i,a.rerender()}}));let o=e.querySelector("#ac-user-search"),m=null;o.addEventListener("input",()=>{window.clearTimeout(m),m=window.setTimeout(()=>{R.search=o.value.trim(),R.offset=0,a.rerender()},320)}),e.querySelector("#ac-user-role").addEventListener("change",i=>{R.role=i.target.value,R.offset=0,a.rerender()}),e.querySelector("#ac-user-status").addEventListener("change",i=>{R.status=i.target.value,R.offset=0,a.rerender()}),e.querySelector("[data-ac-refresh]").addEventListener("click",()=>a.rerender())}};var We={id:"analytics",path:"/analytics",title:"Platform Analytics",description:"Adoption, engagement and usage of the platform \u2014 aggregated across organizations, never per class.",permission:["platform.analytics.read","school.analytics.read"],async render(e,a){let s=a.getState();e.innerHTML=`<div class="ac-stack" data-ac-analytics>
			${de({value:s.period})}
			<div data-ac-kpis class="ac-grid ac-grid--kpi">${C(1)}</div>
			<div data-ac-sections class="ac-stack"></div>
		</div>`;let l={period:s.period==="year"?"year":s.period};s.period==="custom"&&s.customRange&&(l.from=s.customRange.from,l.to=s.customRange.to);let r,n,c;try{[r,n,c]=await Promise.all([$.get("console/overview",l),$.get("console/trends",l),$.get("console/organizations",{limit:100,offset:0})])}catch(y){e.querySelector("[data-ac-sections]").innerHTML=z({message:y.message});return}let g=r.data,d=g.sections.glance,o=g.sections.activity,m=g.sections.content,i=g.meta.definitions;e.querySelector("[data-ac-kpis]").innerHTML=[f({label:"Organizations",value:u(d.organizations.total),note:`${d.organizations.active} active`,tooltip:"Organizations in the current scope."}),f({label:"Teacher adoption",value:d.users.teachers>0?`${Math.round(d.users.activeTeachers/d.users.teachers*100)}%`:"\u2014",note:`${u(d.users.activeTeachers)} of ${u(d.users.teachers)} teachers active`,tone:"success",tooltip:i.activeTeacher}),f({label:"Student participation",value:d.users.students>0?`${Math.round(o.participatingStudents/d.users.students*100)}%`:"\u2014",note:`${u(o.participatingStudents)} of ${u(d.users.students)} students took part`,tone:"primary",tooltip:"Students with at least one completed attempt in the period, over the number of enrolled students. Attempts and unique students are reported separately and never conflated."}),f({label:"Attempts per student",value:o.participatingStudents>0?(o.attempts/o.participatingStudents).toFixed(1):"\u2014",note:`${u(o.attempts)} attempts`,tooltip:"Total completed attempts divided by the number of unique students who made at least one. A value above 1 means students attempted more than once on average."}),f({label:"Average score",value:o.averageScore20==null?"\u2014":o.averageScore20.toFixed(2),note:`/20 per formal attempt \xB7 ${u(o.averageScoreSample)} attempts`,tone:"primary",tooltip:i.averageScore}),f({label:"Content authored",value:u(m.questions+m.exams+m.courses),note:`${u(m.questions)} questions \xB7 ${u(m.exams)} exams \xB7 ${u(m.courses)} courses`,tooltip:"Content created in the selected period. The question and course totals are all-time row counts; the exam and course counts respect the period."})].join("");let v=n?.data?.series,_=v?v.labels.map((y,h)=>({label:y,formalAttempts:v.formalAttempts[h]||0,trainingAttempts:v.trainingAttempts[h]||0,gameAttempts:v.gameAttempts[h]||0,newTeachers:v.newTeachers[h]||0,newStudents:v.newStudents[h]||0})):[],p=(c?.data||[]).slice(0,10);e.querySelector("[data-ac-sections]").innerHTML=`
			<div class="ac-section">
				<h2 class="ac-section__title">Educational activity</h2>
				<p class="ac-section__hint">Completed attempts by mode, over ${t(n?.data?.meta?.periodLabel||"the selected period")}.</p>
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
						${_.length?`${V([{label:"Formal exams",tone:"primary"},{label:"Training",tone:"info"},{label:"Games",tone:"violet"}])}${J({points:_,series:[{key:"formalAttempts",label:"Formal exams",tone:"primary"},{key:"trainingAttempts",label:"Training",tone:"info"},{key:"gameAttempts",label:"Games",tone:"violet"}],labelKey:"label",ariaLabel:"Attempts by mode over time"})}`:F({title:"No attempts recorded",message:"No completed attempts fall inside the selected period."})}
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
						${_.length?`${V([{label:"Teachers",tone:"success"},{label:"Students",tone:"warning"}])}${J({points:_,series:[{key:"newTeachers",label:"Teachers",tone:"success"},{key:"newStudents",label:"Students",tone:"warning"}],labelKey:"label",ariaLabel:"New accounts over time"})}`:F({title:"No accounts created",message:"No accounts were created inside the selected period."})}
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
						${p.length?O({rows:p.map(y=>({label:y.name,value:y.activeStudents||0})),value:"value",label:y=>y.label,display:y=>u(y),ariaLabel:"Active students by organization"}):F({title:"No organizations to compare",message:"The current scope contains no organization with recorded usage."})}
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
						${p.length?Ie({rows:p.map(y=>({label:y.name,teachers:y.teachers||0,students:y.students||0})),series:[{key:"teachers",label:"Teachers",tone:"success"},{key:"students",label:"Students",tone:"primary"}],label:y=>y.label,ariaLabel:"Teachers and students by organization"}):F({title:"No organizations to compare",message:"The current scope contains no organization with recorded accounts."})}
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
								<p class="ac-defs__desc">${u(m.questions)}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Classes</p>
								<p class="ac-defs__desc">${u(m.classes)}</p>
							</div>
						</div>
						<p class="ac-empty__message" style="margin:12px 0 0;font-size:12px">${t(m.note)}</p>
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
								<p class="ac-defs__desc">${u(m.exams)}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Published exams</p>
								<p class="ac-defs__desc">${u(m.activeExams)}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Conducted in period</p>
								<p class="ac-defs__desc">${u(o.examsConducted)}</p>
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
								<p class="ac-defs__desc">${u(m.courses)}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Games created</p>
								<p class="ac-defs__desc">${u(m.games)}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Kids games created</p>
								<p class="ac-defs__desc">${u(m.kidsGames)}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Game sessions played</p>
								<p class="ac-defs__desc">${u(o.gameSessions+o.kidsGameSessions)}</p>
							</div>
						</div>
					</div>
				</section>
			</div>`,le(e,"period",y=>{if(y==="custom"){let h=prompt("From (YYYY-MM-DD)",new Date(Date.now()-2592e6).toISOString().slice(0,10));if(!h)return;let b=prompt("To (YYYY-MM-DD)",new Date().toISOString().slice(0,10));if(!b)return;a.setPeriod("custom",{from:h,to:b});return}a.setPeriod(y)})}};var Aa=25,k={stream:"actions",search:"",action:"",entityType:"",eventType:"",outcome:"",severity:"",offset:0},Ke={id:"audit",path:"/audit",title:"Activity & Audit",description:"Every administrative action and every authentication event, searchable and traceable.",permission:["platform.audit.read","school.audit.read"],async render(e,a){e.innerHTML=`
			<div class="ac-toolbar">
				<div class="ac-chip-group" role="group" aria-label="Trail">
					<button type="button" class="ac-chip is-active" data-ac-stream="actions">Administrative actions</button>
					<button type="button" class="ac-chip" data-ac-stream="security">Security events</button>
				</div>
				${Q({id:"ac-audit-search",placeholder:"Search the trail\u2026",value:k.search})}
				<span data-ac-audit-filters></span>
				<button type="button" class="ac-btn" data-ac-refresh>Refresh</button>
			</div>
			<div class="ac-grid ac-grid--kpi" data-ac-audit-kpis></div>
			<section class="ac-panel" style="margin-top:16px">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title" data-ac-audit-title>Administrative actions</h3>
						<p class="ac-panel__subtitle" data-ac-audit-subtitle></p>
					</div>
				</div>
				<div class="ac-panel__body ac-panel__body--flush" data-ac-audit-body>
					${C(5)}
				</div>
			</section>
			<div class="ac-grid ac-grid--2" style="margin-top:16px" data-ac-audit-charts></div>`;let s=e.querySelector("[data-ac-audit-body]"),l=e.querySelector("[data-ac-audit-kpis]"),r=e.querySelector("[data-ac-audit-charts]"),n=e.querySelector("[data-ac-audit-filters]"),c;try{c=await $.get("console/audit/summary")}catch{c={summary:{},facets:{}}}let g=c.facets||{},d=c.summary||{};n.innerHTML=k.stream==="actions"?`${D({id:"ac-audit-action",label:"Action",value:k.action,includeAll:!0,allLabel:"All actions",options:(g.actions||[]).map(p=>({value:p.value,label:`${p.label} (${p.count})`}))})}
					${D({id:"ac-audit-entity",label:"Entity",value:k.entityType,includeAll:!0,allLabel:"All entities",options:(g.entityTypes||[]).map(p=>({value:p.value,label:`${p.label} (${p.count})`}))})}`:`${D({id:"ac-audit-event",label:"Event",value:k.eventType,includeAll:!0,allLabel:"All events",options:(g.securityEventTypes||[]).map(p=>({value:p.value,label:p.label}))})}`,za(e,a);let o=d.security||{};l.innerHTML=[f({label:"Failed sign-ins",value:u(o.login_failure||0),tone:(o.login_failure||0)>0?"warning":"",tooltip:"Recorded failed authentication attempts. A concentration on one address or one username is the signal to investigate."}),f({label:"Successful sign-ins",value:u(o.login_success||0),tooltip:"Recorded successful authentication events."}),f({label:"Sessions revoked",value:u(o.session_revoked||0),tone:(o.session_revoked||0)>0?"warning":"",tooltip:"Sessions an administrator forcibly ended."}),f({label:"Denied actions",value:u(d.deniedActions||0),tone:(d.deniedActions||0)>0?"danger":"",tooltip:"Administrative actions that were refused. The refusal is itself recorded."}),f({label:"Password changes",value:u((o.password_change||0)+(o.password_reset||0)),tooltip:"Password changes and recovery-code resets recorded in the security trail."})].join("");let m;try{m=await $.get("console/audit",{stream:k.stream,search:k.search||void 0,action:k.stream==="actions"&&k.action||void 0,entityType:k.stream==="actions"&&k.entityType||void 0,eventType:k.stream==="security"&&k.eventType||void 0,limit:Aa,offset:k.offset})}catch(p){s.innerHTML=z({message:p.message});return}e.querySelector("[data-ac-audit-title]").textContent=k.stream==="actions"?"Administrative actions":"Security events",e.querySelector("[data-ac-audit-subtitle]").textContent=k.stream==="actions"?"Every administrative change, with the outcome it produced.":"Every authentication and access-control event, with the source address.",s.innerHTML=k.stream==="actions"?T({columns:[{key:"occurredAt",label:"When",render:p=>`<span title="${t(S(p.occurredAt))}">${t(S(p.occurredAt))}</span>`},{key:"actorName",label:"Actor",render:p=>p.actorName?`<span class="ac-table__primary">${t(p.actorName)}</span><br><span class="ac-table__muted">${t(p.actorRole||"")}</span>`:'<span class="ac-table__muted">system</span>'},{key:"action",label:"Action",render:p=>`<span class="ac-badge">${t(p.actionLabel)}</span>`},{key:"entityType",label:"Entity",render:p=>`${t(p.entityTypeLabel)}<br><span class="ac-table__muted">${t(p.entityId)}</span>`},{key:"outcome",label:"Outcome",render:p=>`<span class="ac-badge ac-badge--${p.outcome==="success"?"success":p.outcome==="denied"?"danger":"warning"}">${t(p.outcome)}</span>`},{key:"severity",label:"Severity",render:p=>`<span class="ac-badge ac-badge--${p.severity==="critical"?"danger":p.severity==="warning"?"warning":""}">${t(p.severity)}</span>`},{key:"schoolName",label:"Organization",render:p=>t(p.schoolName||"\u2014")}],rows:m.data,empty:"No administrative action matches the current filters.",rowClass:p=>p.outcome==="denied"?"ac-row--denied":""}):T({columns:[{key:"occurredAt",label:"When",render:p=>`<span title="${t(S(p.occurredAt))}">${t(S(p.occurredAt))}</span>`},{key:"typeLabel",label:"Event",render:p=>`<span class="ac-badge">${t(p.typeLabel)}</span>`},{key:"username",label:"Account",render:p=>p.userName?`<span class="ac-table__primary">${t(p.userName)}</span><br><span class="ac-table__muted">${t(p.username||"")}</span>`:t(p.username||"\u2014")},{key:"reason",label:"Reason",render:p=>t(p.reason||"\u2014")},{key:"outcome",label:"Outcome",render:p=>`<span class="ac-badge ac-badge--${p.outcome==="success"?"success":p.outcome==="denied"?"danger":"warning"}">${t(p.outcome)}</span>`},{key:"severity",label:"Severity",render:p=>`<span class="ac-badge ac-badge--${p.severity==="critical"?"danger":p.severity==="warning"?"warning":""}">${t(p.severity)}</span>`},{key:"ip",label:"Source",render:p=>t(p.ip||"\u2014")}],rows:m.data,empty:"No security event matches the current filters."}),s.insertAdjacentHTML("beforeend",Z({total:m.total,limit:m.limit,offset:m.offset,onPage:p=>{k.offset=p,a.rerender()}}));let i=d.topFailureSources||{};i.byIp?.length||i.byUsername?.length?r.innerHTML=`
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles">
							<h3 class="ac-panel__title">Failed sign-in sources</h3>
							<p class="ac-panel__subtitle">Top source addresses by attempt count. A concentration may indicate credential stuffing.</p>
						</div>
					</div>
					<div class="ac-panel__body">
						${O({rows:(i.byIp||[]).map(p=>({label:p.ip,value:p.count})),value:"value",label:p=>p.label,display:p=>u(p),tone:"danger",ariaLabel:"Failed sign-ins by source address"})}
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
						${O({rows:(i.byUsername||[]).map(p=>({label:p.username,value:p.count})),value:"value",label:p=>p.label,display:p=>u(p),tone:"warning",ariaLabel:"Failed sign-ins by attempted username"})}
					</div>
				</section>`:r.innerHTML="",e.querySelectorAll("[data-ac-stream]").forEach(p=>{p.addEventListener("click",()=>{k.stream=p.dataset.acStream,k.offset=0,a.rerender()})});let v=e.querySelector("#ac-audit-search"),_=null;v.addEventListener("input",()=>{window.clearTimeout(_),_=window.setTimeout(()=>{k.search=v.value.trim(),k.offset=0,a.rerender()},320)}),e.querySelector("[data-ac-refresh]").addEventListener("click",()=>a.rerender())}};function za(e,a){let s=e.querySelector("#ac-audit-action");s&&s.addEventListener("change",n=>{k.action=n.target.value,k.offset=0,a.rerender()});let l=e.querySelector("#ac-audit-entity");l&&l.addEventListener("change",n=>{k.entityType=n.target.value,k.offset=0,a.rerender()});let r=e.querySelector("#ac-audit-event");r&&r.addEventListener("change",n=>{k.eventType=n.target.value,k.offset=0,a.rerender()})}var La=[{key:"15",label:"15 min"},{key:"60",label:"1 hour"},{key:"360",label:"6 hours"},{key:"1440",label:"24 hours"}],we={minutes:"60"},Ve={id:"health",path:"/health",title:"System Health & Operations",description:"Service availability, error trends, latency, database and storage \u2014 measured, not asserted.",permission:["platform.health.read","school.health.read"],async render(e,a){e.innerHTML=`
			<div class="ac-toolbar">
				<div class="ac-chip-group" role="group" aria-label="Window">
					${La.map(i=>`<button type="button" class="ac-chip${we.minutes===i.key?" is-active":""}" data-ac-window="${i.key}">${t(i.label)}</button>`).join("")}
				</div>
				<button type="button" class="ac-btn" data-ac-refresh>Refresh</button>
			</div>
			<div data-ac-health><div class="ac-skeleton-stack" aria-busy="true">
				<div class="ac-skeleton" style="width:45%"></div>
				<div class="ac-skeleton" style="width:100%"></div>
			</div></div>`;let s;try{s=await $.get("console/health",{minutes:we.minutes})}catch(i){e.querySelector("[data-ac-health]").innerHTML=z({message:i.message});return}let l=s.data,r=l.sections.api,n=l.sections.latency,c=l.sections.database,g=l.sections.realtime,d=l.sections.storage,o=l.sections.scheduled,m=r.availabilityPercent==null?"":r.availabilityPercent>=99?"success":r.availabilityPercent>=95?"warning":"danger";e.querySelector("[data-ac-health]").innerHTML=`
			<div class="ac-grid ac-grid--kpi">
				${f({label:"API availability",value:r.availabilityPercent==null?"\u2014":`${r.availabilityPercent.toFixed(1)}%`,note:`${u(r.totalCalls)} requests in the window`,tone:m,tooltip:l.meta.notes.availability})}
				${f({label:"Server error rate",value:r.serverErrorRatePercent==null?"\u2014":`${r.serverErrorRatePercent.toFixed(1)}%`,note:`${u(r.serverErrors??0)} server errors`,tone:r.serverErrorRatePercent==null?"":r.serverErrorRatePercent>=1?"danger":r.serverErrorRatePercent>0?"warning":"success",tooltip:"Share of API requests in the window that failed with a 5xx status. This is the measure of service health: a 4xx is a client mistake, not an outage."})}
				${f({label:"Error rate (all)",value:r.errorRatePercent==null?"\u2014":`${r.errorRatePercent.toFixed(1)}%`,note:`${u(r.errors)} failed requests`,tone:r.errorRatePercent==null?"":r.errorRatePercent>=20?"warning":"",tooltip:"Share of API requests in the window that returned a 4xx or 5xx status. A high value here with a low server error rate usually means rejected or expired requests, not an outage."})}
				${f({label:"p95 latency",value:n.available&&n.p95!=null?`${n.p95} ms`:"\u2014",note:n.available&&n.p50!=null?`p50 ${n.p50} ms \xB7 p99 ${n.p99} ms`:"no requests in the window",tone:n.available&&n.p95!=null&&n.p95>1e3?"warning":"",tooltip:l.meta.notes.latency})}
				${f({label:"Database",value:c.available?"Reachable":"Unreachable",note:c.available?`${c.roundTripMs} ms round trip`:c.error||"",tone:c.available?"success":"danger",tooltip:"A live COUNT query against the configured database, plus the row counts of the principal tables."})}
				${f({label:"Uptime",value:M(new Date(l.meta.process.startedAt)),note:`process started ${S(l.meta.process.startedAt)}`,tooltip:"Process uptime. The request log resets with the process, so availability cannot be measured across a restart."})}
				${f({label:"Storage used",value:d.available?`${d.megabytes} MB`:"\u2014",note:d.available?`${u(d.files)} files in uploads`:d.error||"",tooltip:l.meta.notes.storage})}
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
						${n.available&&n.statuses?.length?O({rows:n.statuses.map(i=>({label:i.bucket,value:i.count})),value:"value",label:i=>i.label,display:i=>u(i),tone:i=>i.label==="5xx"?"danger":i.label==="4xx"?"warning":"success",ariaLabel:"Response status distribution"}):F({title:"No requests recorded",message:"The request log is empty for this window. It is process-local and starts empty after a restart."})}
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
								<p class="ac-defs__desc">${d.available?u(d.files):"\u2014"}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Realtime status</p>
								<p class="ac-defs__desc">${t(g.status||"unknown")}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Tracked connections</p>
								<p class="ac-defs__desc">${u(g.trackedConnections??0)}</p>
							</div>
						</div>
						<p class="ac-empty__message" style="margin:14px 0 0;font-size:12px">${t(d.available?d.directory:d.error||"")}</p>
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
					${T({columns:[{key:"method",label:"Method"},{key:"path",label:"Path",render:i=>`<code>${t(i.path)}</code>`},{key:"calls",label:"Calls",align:"right"},{key:"errors",label:"Errors",align:"right"},{key:"errorRatePercent",label:"Error rate",align:"right",render:i=>`<span class="ac-badge ${i.errorRatePercent>=5?"ac-badge--danger":i.errorRatePercent>0?"ac-badge--warning":"ac-badge--success"}">${i.errorRatePercent.toFixed(1)}%</span>`},{key:"averageMs",label:"Avg (ms)",align:"right"}],rows:r.endpoints||[],empty:"No API traffic was recorded in this window."})}
				</div>
			</section>

			<div class="ac-section">
				<h2 class="ac-section__title">Scheduled work</h2>
				<p class="ac-section__hint">${t(o.note||"")}</p>
			</div>
			<section class="ac-panel">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title">Background tasks</h3>
						<p class="ac-panel__subtitle">Each task runs on a fixed interval inside the server process.</p>
					</div>
				</div>
				<div class="ac-panel__body ac-panel__body--flush">
					${T({columns:[{key:"name",label:"Task",render:i=>`<span class="ac-table__primary">${t(i.name)}</span>`},{key:"intervalMinutes",label:"Interval",align:"right",render:i=>`${i.intervalMinutes} min`},{key:"description",label:"Purpose"}],rows:o.tasks||[],empty:"No scheduled task is registered."})}
				</div>
			</section>

			${(r.repeatedLogs||[]).length?`<div class="ac-section">
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
							${T({columns:[{key:"level",label:"Level",render:i=>`<span class="ac-badge ac-badge--${i.level==="error"||i.level==="fatal"?"danger":i.level==="warn"?"warning":"info"}">${t(i.level)}</span>`},{key:"message",label:"Message"},{key:"source",label:"Source",render:i=>`<code>${t(i.source)}</code>`},{key:"count",label:"Count",align:"right"},{key:"lastAt",label:"Last seen",render:i=>t(S(i.lastAt))}],rows:r.repeatedLogs,empty:"No repeated log entries in this window."})}
						</div>
					</section>`:""}`,e.querySelectorAll("[data-ac-window]").forEach(i=>{i.addEventListener("click",()=>{we.minutes=i.dataset.acWindow,a.rerender()})}),e.querySelector("[data-ac-refresh]").addEventListener("click",()=>a.rerender())}};var Je={id:"settings",path:"/settings",title:"Platform Settings",description:"The access model the platform enforces, and the scope of this administration session.",permission:["platform.settings.manage","school.settings.manage"],async render(e,a){e.innerHTML=`<div data-ac-settings><div class="ac-skeleton-stack" aria-busy="true">
			<div class="ac-skeleton" style="width:50%"></div>
			<div class="ac-skeleton" style="width:100%"></div>
		</div></div>`;let s;try{s=await $.get("console/roles")}catch(c){e.querySelector("[data-ac-settings]").innerHTML=z({message:c.message});return}let l=s.roles||[],r=s.catalog||[],n=a.organization;e.querySelector("[data-ac-settings]").innerHTML=`
			<div class="ac-grid ac-grid--kpi">
				${f({label:"Roles",value:String(l.length),note:"system roles",tooltip:"The role catalog. Roles are fixed by the application; permissions can be granted or denied per user."})}
				${f({label:"Permissions",value:String(r.reduce((c,g)=>c+g.permissions.length,0)),note:`${r.length} groups`,tooltip:"The permission catalog, grouped by scope."})}
				${f({label:"Your scope",value:a.isPlatform?"Platform":"Organization",note:a.isPlatform?"every organization":n?.name||"",tone:a.isPlatform?"primary":"",tooltip:"The slice of the platform this session can reach. A platform administrator sees every organization; an organization administrator sees only their own."})}
				${f({label:"Your permissions",value:String(a.session.permissions?.length||0),note:"effective for this session",tooltip:"The permissions the server granted this session, after applying any per-user grants or denies."})}
			</div>

			<div class="ac-section">
				<h2 class="ac-section__title">This session</h2>
				<p class="ac-section__hint">What this administrator is, and what they can reach.</p>
			</div>
			<section class="ac-panel">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title">Session scope</h3>
						<p class="ac-panel__subtitle">The scope is decided by the server from the signed token. A query parameter can narrow a platform session; it can never widen it.</p>
					</div>
				</div>
				<div class="ac-panel__body">
					<div class="ac-defs">
						<div class="ac-defs__item">
							<p class="ac-defs__term">Signed in as</p>
							<p class="ac-defs__desc">${t(a.session.user.name)}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Role</p>
							<p class="ac-defs__desc">${t(a.session.user.roleLabel)}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Scope</p>
							<p class="ac-defs__desc">${t(a.isPlatform?"Every organization":n?.name||"\u2014")}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Organization status</p>
							<p class="ac-defs__desc">${t(n?.status||"\u2014")}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Plan</p>
							<p class="ac-defs__desc">${t(n?.plan||"\u2014")}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Student capacity</p>
							<p class="ac-defs__desc">${t(n?.maxStudents!=null?String(n.maxStudents):"\u2014")}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Academic year</p>
							<p class="ac-defs__desc">${t(n?.schoolYear||"not set")}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Last sign-in</p>
							<p class="ac-defs__desc">${t(S(a.session.user.lastLogin))}</p>
						</div>
					</div>
					<div class="ac-alert ac-alert--info" style="margin-top:16px">
						<div class="ac-alert__body">
							<p class="ac-alert__title">Plan and capacity are observed, not enforced</p>
							<p class="ac-alert__text">The business model does not support subscriptions or quotas yet. The plan and the student capacity recorded on the organization are displayed for information only \u2014 no entitlement is derived from them.</p>
						</div>
					</div>
				</div>
			</section>

			<div class="ac-section">
				<h2 class="ac-section__title">Access model</h2>
				<p class="ac-section__hint">The roles the platform enforces and the permissions each carries.</p>
			</div>
			<section class="ac-panel">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title">Roles</h3>
						<p class="ac-panel__subtitle">System roles are defined by the application and cannot be edited here.</p>
					</div>
				</div>
				<div class="ac-panel__body ac-panel__body--flush">
					${T({columns:[{key:"label",label:"Role",render:c=>`<span class="ac-table__primary">${t(c.label)}</span><br><span class="ac-table__muted">${t(c.description||"")}</span>`},{key:"key",label:"Key",render:c=>`<code>${t(c.key)}</code>`},{key:"scopeLabel",label:"Scope",render:c=>`<span class="ac-badge">${t(c.scopeLabel)}</span>`},{key:"permissions",label:"Permissions",align:"right",render:c=>String(c.permissions.length)},{key:"isAssignable",label:"Assignable",render:c=>c.isAssignable?'<span class="ac-badge ac-badge--success">yes</span>':'<span class="ac-badge">no</span>'}],rows:l,empty:"The role catalog is empty."})}
				</div>
			</section>

			${r.map(c=>`
				<div class="ac-section">
					<h2 class="ac-section__title">${t(c.group)} permissions</h2>
					<p class="ac-section__hint">Scope: ${t(c.scope||"\u2014")}</p>
				</div>
				<section class="ac-panel">
					<div class="ac-panel__body ac-panel__body--flush">
						${T({columns:[{key:"label",label:"Permission",render:g=>`<span class="ac-table__primary">${t(g.label)}</span><br><span class="ac-table__muted">${t(g.description||"")}</span>`},{key:"id",label:"Identifier",render:g=>`<code>${t(g.id)}</code>`},{key:"scope",label:"Scope",render:g=>`<span class="ac-badge">${t(g.scope||"\u2014")}</span>`}],rows:c.permissions,empty:"No permission in this group."})}
					</div>
				</section>`).join("")}`}};var Ze={id:"organization-detail",path:"/organizations/:id",title:"Organization",description:"Profile, accounts, usage, activity and administrative history.",permission:["platform.organizations.read","school.profile.read"],async render(e,a,s){let l=s.params?.id;e.innerHTML=`<div class="ac-stack" data-ac-org-detail>${C(4)}</div>`;let r;try{r=(await $.get(`console/organizations/${encodeURIComponent(l)}`)).data}catch(o){e.innerHTML=z({title:"This organization could not be loaded",message:o.message});return}let n=r.organization,c=r.usage,g=a.isPlatform||(a.session.permissions||[]).includes("school.profile.manage");a.setTitle(n.name,`${n.slug} \xB7 ${n.schoolType||"organization"}${n.schoolYear?` \xB7 academic year ${n.schoolYear}`:""}`),e.innerHTML=`
			<div class="ac-toolbar">
				<a class="ac-btn" href="#/organizations">\u2190 All organizations</a>
				<span style="flex:1"></span>
				${g?`<button type="button" class="ac-btn" data-ac-toggle-status>${n.status==="suspended"?"Reactivate organization":"Suspend organization"}</button>`:""}
			</div>

			<div class="ac-panel">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title">${t(n.name)}</h3>
						<p class="ac-panel__subtitle">${t(n.slug)} \xB7 ${t(n.schoolType||"\u2014")}${n.schoolYear?` \xB7 academic year ${t(n.schoolYear)}`:""}</p>
					</div>
					<div class="ac-panel__actions">
						<span class="ac-badge ${n.status==="active"?"ac-badge--success":n.status==="pending"?"ac-badge--warning":"ac-badge--danger"}">${t(n.status)}</span>
					</div>
				</div>
				<div class="ac-panel__body">
					<div class="ac-defs">
						<div class="ac-defs__item">
							<p class="ac-defs__term">Plan</p>
							<p class="ac-defs__desc">${t(n.plan||"\u2014")}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">City</p>
							<p class="ac-defs__desc">${t(n.city||"\u2014")}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Contact</p>
							<p class="ac-defs__desc">${t(n.email||n.phone||"\u2014")}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Created</p>
							<p class="ac-defs__desc">${t(S(n.createdAt,{withTime:!1}))}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Last activity</p>
							<p class="ac-defs__desc">${c.lastActivity?t(M(c.lastActivity)):"never"}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Student capacity</p>
							<p class="ac-defs__desc">${t(String(n.maxStudents??"\u2014"))}</p>
						</div>
					</div>
					${n.status==="suspended"?`<div class="ac-alert ac-alert--danger" style="margin-top:16px">
								<div class="ac-alert__body">
									<p class="ac-alert__title">Access is suspended</p>
									<p class="ac-alert__text">${n.suspendedReason?t(n.suspendedReason):"No reason was recorded."} \xB7 suspended ${t(S(n.suspendedAt))}</p>
								</div>
							</div>`:""}
				</div>
			</div>

			<div class="ac-grid ac-grid--kpi" style="margin-top:16px">
				${f({label:"Teachers",value:u(c.teachers),note:`${u(c.activeTeachers)} active in 30 days`,tone:"primary",tooltip:"Teacher accounts, and how many produced a recorded event in the last 30 days."})}
				${f({label:"Students",value:u(c.students),note:`${u(c.activeStudents)} active in 30 days`,tone:"primary",tooltip:"Student accounts, and how many produced a recorded event in the last 30 days."})}
				${f({label:"Attempts (30d)",value:u(c.attempts30d),note:`${u(c.formalAttempts30d)} formal`,tooltip:"Completed attempts of any mode inside the last 30 days."})}
				${f({label:"Content",value:u(c.questions+c.exams),note:`${u(c.questions)} questions \xB7 ${u(c.exams)} exams`,tooltip:"Rows that exist in this organization. These are totals, not period counts."})}
				${f({label:"Needs attention",value:u(c.suspendedAccounts+c.pendingRequests),note:`${u(c.suspendedAccounts)} suspended \xB7 ${u(c.pendingRequests)} pending`,tone:c.suspendedAccounts+c.pendingRequests>0?"warning":"",tooltip:"Suspended accounts and account requests awaiting a decision."})}
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
						${T({columns:[{key:"name",label:"Account",render:o=>`<a href="#/users/${o.id}" class="ac-table__primary">${t(o.name)}</a><br><span class="ac-table__muted">${t(o.username)}</span>`},{key:"status",label:"Status",render:o=>`<span class="ac-badge ac-badge--${o.status==="active"?"success":"warning"}">${t(o.status)}</span>`},{key:"lastLogin",label:"Last sign-in",render:o=>o.lastLogin?t(M(o.lastLogin)):"never"}],rows:r.administrators,empty:"This organization has no administrator account."})}
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
						${T({columns:[{key:"name",label:"Class",render:o=>`<span class="ac-table__primary">${t(o.name)}</span>`},{key:"studentCount",label:"Students",align:"right"},{key:"createdAt",label:"Created",render:o=>t(S(o.createdAt,{withTime:!1}))}],rows:r.classes,empty:"No class has been created in this organization."})}
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
						${T({columns:[{key:"name",label:"Teacher",render:o=>`<a href="#/users/${o.id}" class="ac-table__primary">${t(o.name)}</a>`},{key:"active",label:"Active (30d)",render:o=>o.active?'<span class="ac-badge ac-badge--success">yes</span>':'<span class="ac-badge ac-badge--warning">no</span>'},{key:"lastLogin",label:"Last sign-in",render:o=>o.lastLogin?t(M(o.lastLogin)):"never"}],rows:r.teachers,empty:"No teacher account in this organization."})}
					</div>
				</section>
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles"><h3 class="ac-panel__title">Students</h3></div>
					</div>
					<div class="ac-panel__body ac-panel__body--flush">
						${T({columns:[{key:"name",label:"Student",render:o=>`<a href="#/users/${o.id}" class="ac-table__primary">${t(o.name)}</a>`},{key:"active",label:"Active (30d)",render:o=>o.active?'<span class="ac-badge ac-badge--success">yes</span>':'<span class="ac-badge ac-badge--warning">no</span>'},{key:"lastLogin",label:"Last sign-in",render:o=>o.lastLogin?t(M(o.lastLogin)):"never"}],rows:r.students,empty:"No student account in this organization."})}
					</div>
				</section>
			</div>

			<div class="ac-section">
				<h2 class="ac-section__title">Administrative history</h2>
				<p class="ac-section__hint">The fifteen most recent recorded actions inside this organization.</p>
			</div>
			<section class="ac-panel">
				<div class="ac-panel__body ac-panel__body--flush">
					${T({columns:[{key:"occurredAt",label:"When",render:o=>t(S(o.occurredAt))},{key:"actorName",label:"Actor",render:o=>t(o.actorName||"system")},{key:"action",label:"Action"},{key:"entityType",label:"Entity"},{key:"outcome",label:"Outcome",render:o=>`<span class="ac-badge ac-badge--${o.outcome==="success"?"success":"warning"}">${t(o.outcome)}</span>`}],rows:r.recentActivity,empty:"No administrative action has been recorded for this organization."})}
				</div>
			</section>`;let d=e.querySelector("[data-ac-toggle-status]");d&&d.addEventListener("click",async()=>{let o=n.status!=="suspended";if(!await X({title:o?"Suspend this organization?":"Reactivate this organization?",message:o?"Suspending revokes access for every account in this organization. Their data is retained.":"Reactivating restores access for the accounts that were suspended with the organization.",detail:o?"The action is recorded in the audit trail with the reason you give.":"",confirmLabel:o?"Suspend":"Reactivate",danger:o}))return;let i=null;if(!(o&&(i=window.prompt("Reason for suspending (recorded in the audit trail):",""),i===null)))try{await $.patch(`console/organizations/${encodeURIComponent(l)}`,{status:o?"suspended":"active",reason:i||null}),L(o?"Organization suspended.":"Organization reactivated.","success"),a.rerender()}catch(v){L(v.message,"error")}})}};var Qe={super_admin:"Platform administrator",admin:"Organization administrator",teacher:"Teacher",student:"Student"},Xe={id:"user-detail",path:"/users/:id",title:"Account",description:"Profile, access, recent activity and the administrative actions available.",permission:["platform.users.read","school.users.read"],async render(e,a,s){let l=s.params?.id;e.innerHTML=`<div class="ac-stack" data-ac-user-detail>${C(4)}</div>`;let r;try{r=(await $.get(`console/users/${encodeURIComponent(l)}`)).data}catch(d){e.innerHTML=z({title:"This account could not be loaded",message:d.message});return}let n=r.account,c=a.isPlatform||(a.session.permissions||[]).includes("school.users.manage"),g=a.isPlatform||(a.session.permissions||[]).includes("school.roles.manage");a.setTitle(n.name||n.username,`${Qe[n.role]||n.role} \xB7 ${r.organization?.name||"organization"} \xB7 ${n.status}`),e.innerHTML=`
			<div class="ac-toolbar">
				<a class="ac-btn" href="#/users">\u2190 All accounts</a>
				<span style="flex:1"></span>
				${c?`<button type="button" class="ac-btn" data-ac-toggle-status>${n.status==="active"?"Suspend account":"Reactivate account"}</button>`:""}
				${g?'<button type="button" class="ac-btn" data-ac-change-role>Change role</button>':""}
				${g?'<button type="button" class="ac-btn" data-ac-grant>Grant permission</button>':""}
				<button type="button" class="ac-btn" data-ac-revoke-sessions>Revoke sessions</button>
			</div>

			<div class="ac-panel">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title">${t(n.name||n.username)}</h3>
						<p class="ac-panel__subtitle">${t(n.username)}${n.email?` \xB7 ${t(n.email)}`:""}</p>
					</div>
					<div class="ac-panel__actions">
						<span class="ac-badge ac-badge--brand">${t(Qe[n.role]||n.role)}</span>
						<span class="ac-badge ac-badge--${n.status==="active"?"success":n.status==="suspended"?"danger":"warning"}">${t(n.status)}</span>
					</div>
				</div>
				<div class="ac-panel__body">
					<div class="ac-defs">
						<div class="ac-defs__item">
							<p class="ac-defs__term">Organization</p>
							<p class="ac-defs__desc">${t(r.organization?.name||"\u2014")}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Class</p>
							<p class="ac-defs__desc">${t(r.class?.name||"\u2014")}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Student number</p>
							<p class="ac-defs__desc">${t(n.numero||"\u2014")}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Last sign-in</p>
							<p class="ac-defs__desc">${n.lastLogin?t(M(n.lastLogin)):"never"}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Account created</p>
							<p class="ac-defs__desc">${t(S(n.createdAt,{withTime:!1}))}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Attempts (30d)</p>
							<p class="ac-defs__desc">${u(r.activity.attempts30d)}</p>
						</div>
					</div>
				</div>
			</div>

			<div class="ac-grid ac-grid--kpi" style="margin-top:16px">
				${f({label:"Attempts (30d)",value:u(r.activity.attempts30d),note:`${u(r.activity.formalAttempts30d)} formal`,tooltip:"Completed attempts of any mode inside the last 30 days."})}
				${f({label:"Last sign-in",value:n.lastLogin?t(M(n.lastLogin)):"never",tone:n.lastLogin?"primary":"warning",tooltip:"From the recorded authentication trail."})}
				${f({label:"Permission overrides",value:u(r.permissionOverrides.length),note:r.permissionOverrides.length?"grants or denies on top of the role":"role baseline only",tone:r.permissionOverrides.length?"warning":"",tooltip:"Individual permissions granted to, or denied from, this account on top of what its role carries."})}
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
					${r.permissionOverrides.length?T({columns:[{key:"permission",label:"Permission",render:d=>`<code>${t(d.permission)}</code>`},{key:"effect",label:"Effect",render:d=>`<span class="ac-badge ac-badge--${d.effect==="grant"?"success":"danger"}">${t(d.effect)}</span>`},{key:"scopeKey",label:"Applies to",render:d=>t(d.scopeKey==="*"?"every scope":d.scopeKey)},{key:"reason",label:"Reason",render:d=>t(d.reason||"\u2014")},{key:"createdAt",label:"Recorded",render:d=>t(S(d.createdAt))},{key:"actions",label:"",className:"ac-table__actions",render:d=>g?`<button type="button" class="ac-btn ac-btn--sm" data-ac-remove-override="${t(d.permission)}">Remove</button>`:""}],rows:r.permissionOverrides}):F({title:"No overrides",message:"This account holds exactly the permissions its role carries. Nothing has been granted or denied on top."})}
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
						${T({columns:[{key:"dateTaken",label:"When",render:d=>t(S(d.dateTaken))},{key:"mode",label:"Mode"},{key:"score20",label:"Score",align:"right",render:d=>d.mode==="exam"?`${d.score20.toFixed(2)} /20`:`${Math.round(d.score)}%`}],rows:r.recentResults,empty:"This account has no recorded attempt."})}
					</div>
				</section>
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles"><h3 class="ac-panel__title">Administrative actions</h3></div>
					</div>
					<div class="ac-panel__body ac-panel__body--flush">
						${T({columns:[{key:"occurredAt",label:"When",render:d=>t(S(d.occurredAt))},{key:"action",label:"Action"},{key:"entityType",label:"Entity"},{key:"outcome",label:"Outcome",render:d=>`<span class="ac-badge ac-badge--${d.outcome==="success"?"success":"warning"}">${t(d.outcome)}</span>`}],rows:r.recentActivity,empty:"This account has performed no recorded administrative action."})}
					</div>
				</section>
			</div>`,Ma(e,a,l,n,r)}};function Ma(e,a,s,l,r){let n=e.querySelector("[data-ac-toggle-status]");n&&n.addEventListener("click",async()=>{let o=l.status==="active";if(!await X({title:o?"Suspend this account?":"Reactivate this account?",message:o?"The account will not be able to sign in. Its data is retained.":"The account will be able to sign in again.",detail:"The action is recorded in the audit trail and in the security event trail.",confirmLabel:o?"Suspend":"Reactivate",danger:o}))return;let i=null;if(!(o&&(i=window.prompt("Reason for suspending (recorded in the audit trail):",""),i===null)))try{await $.patch(`console/users/${encodeURIComponent(s)}`,{status:o?"suspended":"active",reason:i||null}),L(o?"Account suspended.":"Account reactivated.","success"),a.rerender()}catch(v){L(v.message,"error")}});let c=e.querySelector("[data-ac-change-role]");c&&c.addEventListener("click",async()=>{let m=ue({title:"Change the role of this account",subtitle:"The change is recorded in the audit trail with the previous role.",body:`<div class="ac-field">
					<label class="ac-field__label" for="ac-new-role">New role</label>
					<select class="ac-select" id="ac-new-role">
						${[{value:"admin",label:"Organization administrator"},{value:"teacher",label:"Teacher"},{value:"student",label:"Student"}].map(i=>`<option value="${i.value}"${i.value===l.role?" selected":""}>${i.label}</option>`).join("")}
					</select>
				</div>`,footer:`
					<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
					<button type="button" class="ac-btn ac-btn--primary" data-ac-confirm>Change role</button>
				`});m.root.querySelector("[data-ac-cancel]").addEventListener("click",m.close),m.root.querySelector("[data-ac-confirm]").addEventListener("click",async()=>{let i=m.root.querySelector("#ac-new-role").value;m.close();try{await $.patch(`console/users/${encodeURIComponent(s)}`,{role:i}),L("Role updated.","success"),a.rerender()}catch(v){L(v.message,"error")}})});let g=e.querySelector("[data-ac-grant]");g&&g.addEventListener("click",async()=>{let o=[];try{o=((await $.get("console/roles")).catalog||[]).flatMap(_=>_.permissions)}catch{L("The permission catalog could not be loaded.","error");return}let m=new Set(r.permissionOverrides.map(v=>v.permission)),i=ue({title:"Grant or deny a permission",subtitle:"Grants and denies sit on top of the role. A deny removes a permission the role carries.",body:`<div class="ac-field">
						<label class="ac-field__label" for="ac-permission">Permission</label>
						<select class="ac-select" id="ac-permission">
							${o.map(v=>`<option value="${v.id}"${m.has(v.id)?" disabled":""}>${v.label} \u2014 ${v.id}</option>`).join("")}
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
				`});i.root.querySelector("[data-ac-cancel]").addEventListener("click",i.close),i.root.querySelector("[data-ac-confirm]").addEventListener("click",async()=>{let v=i.root.querySelector("#ac-permission").value,_=i.root.querySelector("#ac-effect").value,p=i.root.querySelector("#ac-override-reason").value||null;i.close();try{await $.post(`console/users/${encodeURIComponent(s)}/permissions`,{permission:v,effect:_,reason:p}),L("Permission override applied.","success"),a.rerender()}catch(y){L(y.message,"error")}})}),e.querySelectorAll("[data-ac-remove-override]").forEach(o=>{o.addEventListener("click",async()=>{let m=o.dataset.acRemoveOverride;if(await X({title:"Remove this override?",message:`The account returns to the permissions its role carries. "${m}" is no longer individually granted or denied.`,confirmLabel:"Remove override"}))try{await $.del(`console/users/${encodeURIComponent(s)}/permissions/${encodeURIComponent(m)}`),L("Override removed.","success"),a.rerender()}catch(v){L(v.message,"error")}})});let d=e.querySelector("[data-ac-revoke-sessions]");d&&d.addEventListener("click",async()=>{if(await X({title:"Revoke every session of this account?",message:"All sign-ins of this account end immediately. The next sign-in starts a new session.",detail:"The revocation is recorded in the security event trail.",confirmLabel:"Revoke sessions",danger:!0}))try{await $.del(`console/users/${encodeURIComponent(s)}/sessions`),L("Sessions revoked.","success")}catch(m){L(m.message,"error")}})}var Pa=[{id:"overview",path:"/",title:"Overview",icon:"overview",permission:["platform.console","school.console"]},{id:"organizations",path:"/organizations",title:"Organizations",icon:"organizations",permission:["platform.organizations.read","school.profile.read"]},{id:"users",path:"/users",title:"Users & Access",icon:"users",permission:["platform.users.read","school.users.read"]},{id:"analytics",path:"/analytics",title:"Platform Analytics",icon:"analytics",permission:["platform.analytics.read","school.analytics.read"]},{id:"audit",path:"/audit",title:"Activity & Audit",icon:"audit",permission:["platform.audit.read","school.audit.read"]},{id:"health",path:"/health",title:"System Health",icon:"health",permission:["platform.health.read","school.health.read"]},{id:"settings",path:"/settings",title:"Settings",icon:"settings",permission:["platform.settings.manage","school.settings.manage"]}],Ea=[Ge,Ue,Ze,Ye,Xe,We,Ke,Ve,Je],me=document.getElementById("ac-boot-status"),Ca=document.getElementById("ac-boot"),Na=document.getElementById("ac-root");function ea(e,a=""){if(!me)return;me.textContent=e,me.style.color="var(--ac-danger)";let s=me.parentElement;if(a){let l=document.createElement("p");l.className="ac-boot__status",l.style.marginTop="10px",l.innerHTML=a,s.appendChild(l)}}var aa=null;async function Ra(){xe(),Se(()=>{Le()});let e;try{e=await ze()}catch(l){ea("Could not open the control center.",`${l.message}<br><br><a class="ac-btn ac-btn--primary" href="/admin.html">Go to the sign-in page</a>`);return}if(!e?.user){ea("Could not open the control center.",'<a class="ac-btn ac-btn--primary" href="/admin.html">Go to the sign-in page</a>');return}let a=Fe(Na,{session:e,navItems:Pa,canAny:be,onNavigate:l=>Ne(l)}),s={canAny:be,session:e,organization:e.scope?.organization||null,isPlatform:!!e.scope?.isPlatform,getState:re,setPeriod:Ae,rerender:()=>ta(a,s,aa),setTitle:(l,r)=>{l&&(a.title.textContent=l),r!==void 0&&(a.description.textContent=r),document.title=`${l||a.title.textContent} \xB7 Control Center`}};Ce(s),Pe(Ea,{notFound:{id:"not-found",path:"/not-found",title:"Page not found",description:"That section does not exist in the control center.",render(l){l.innerHTML=`<div class="ac-empty">
					<p class="ac-empty__title">Page not found</p>
					<p class="ac-empty__message">The address you opened does not match a section of the control center.</p>
					<a class="ac-btn ac-btn--primary" href="#/">Back to the overview</a>
				</div>`}}}),Ee(l=>{aa=l,a.title.textContent=l.title,a.description.textContent=l.description||"",a.setActive(l.path),document.title=`${l.title} \xB7 Control Center`,ta(a,s,l)}),Re(),Ca.remove()}async function ta(e,a,s){let l=e.content;l.innerHTML=`<div class="ac-skeleton-stack" aria-busy="true">
		<div class="ac-skeleton" style="width:40%"></div>
		<div class="ac-skeleton" style="width:100%"></div>
		<div class="ac-skeleton" style="width:80%"></div>
	</div>`;try{await s.render(l,a,s)}catch(r){console.error("[console] page render failed",r),l.innerHTML=`<div class="ac-error" role="alert">
			<div>
				<p class="ac-error__title">This section could not be rendered</p>
				<p class="ac-error__message">${r.message}</p>
			</div>
		</div>`}}Ra();})();
