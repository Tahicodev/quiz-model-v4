var QuizConsole=(()=>{var fe="quizSession",La="quizAuthToken",Me="",We=null,qa=null;function ut(e){qa=e}function mn(){try{let e=sessionStorage.getItem(fe)||localStorage.getItem(fe),a=e?JSON.parse(e):null;if(a?.token)return a.token}catch{}return localStorage.getItem(La)||""}function Ca(){return Me||(Me=mn(),Me)}function hn(e){if(e){Me=e;try{let a=sessionStorage.getItem(fe)||localStorage.getItem(fe),t=a?JSON.parse(a):null;if(t){t.token=e,sessionStorage.setItem(fe,JSON.stringify(t));let n=localStorage.getItem(fe),s=n?JSON.parse(n):null;s&&String(s.userId||"")===String(t.userId||"")&&String(s.role||"").toLowerCase()===String(t.role||"").toLowerCase()&&localStorage.setItem(fe,JSON.stringify(t))}localStorage.setItem(La,e)}catch{}}}function fn(){Me="";try{localStorage.removeItem(fe),localStorage.removeItem(La),sessionStorage.removeItem(fe)}catch{}}function mt(){return window.APP_CONFIG&&window.APP_CONFIG.apiUrl||"/api/v1"}async function gn(){return We||(We=fetch(`${mt()}/auth/refresh`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({portal:"admin"})}).then(async e=>{if(!e.ok)throw new Error(`Refresh failed (${e.status})`);let a=await e.json();if(!a?.accessToken)throw new Error("Refresh returned no token");return hn(a.accessToken),a.accessToken}).finally(()=>{We=null}),We)}var ra=class extends Error{constructor(a,t,n,s){super(a),this.name="ApiError",this.status=t,this.code=n,this.fields=s||null}};async function bn(e){let a=null;try{a=await e.json()}catch{}let t=a?.error||{};return new ra(t.message||a?.message||`Request failed (${e.status})`,e.status,t.code||a?.code||null,t.fields||null)}async function Ne(e,a={}){let{method:t="GET",body:n=null,query:s=null,retry:r=!0}=a,d=`${mt()}/${String(e).replace(/^\//,"")}`;if(s&&typeof s=="object"){let p=new URLSearchParams;for(let[m,g]of Object.entries(s))g==null||g===""||p.set(m,String(g));let l=p.toString();l&&(d+=`?${l}`)}let o={Accept:"application/json"},c=Ca();c&&(o.Authorization=`Bearer ${c}`),n!=null&&(o["Content-Type"]="application/json");let u=await fetch(d,{method:t,headers:o,credentials:"include",body:n==null?void 0:JSON.stringify(n)});if(u.status===401&&r){try{await gn()}catch{throw fn(),qa&&qa(),new ra("Your session has ended. Please sign in again.",401,"UNAUTHORIZED")}return Ne(e,{...a,retry:!1})}if(!u.ok)throw await bn(u);return u.status===204?null:u.json()}var _={get:(e,a)=>Ne(e,{method:"GET",query:a}),post:(e,a)=>Ne(e,{method:"POST",body:a}),patch:(e,a)=>Ne(e,{method:"PATCH",body:a}),put:(e,a)=>Ne(e,{method:"PUT",body:a}),del:(e,a)=>Ne(e,{method:"DELETE",body:a})};var J={session:null,permissions:new Set,deployment:{mode:"saas",isOffline:!1,isSaaS:!0,label:"Multi-tenant platform",description:"",dbProvider:"sqlite"},targetSchoolId:null,period:"30d",customRange:null},vn=new Set;function ia(){for(let e of vn)try{e(J)}catch(a){console.error("[console] store listener failed",a)}}function ht(){return J}function yn(e){return e?J.permissions.has(e):!0}function Ea(e=[]){let a=Array.isArray(e)?e:[e];return a.length===0?!0:a.some(t=>yn(t))}function ja(e){J.targetSchoolId=e||null,ia()}function ft(e,a=null){J.period=e,J.customRange=a,ia()}async function gt(){let e=await _.get("console/session");return J.session=e,J.permissions=new Set(Array.isArray(e.permissions)?e.permissions:[]),e.deployment&&(J.deployment={...J.deployment,...e.deployment}),ia(),e}function bt(){J.session=null,J.permissions=new Set,J.targetSchoolId=null,ia()}var ca=[],yt=null,Re=null,Ye=null,za=null;function _t(e,a={}){ca.length=0;for(let t of e)ca.push(t);yt=a.notFound||null}function wt(e){Ye=e}function xt(e){za=e}function oa(e){return e&&String(e).split("?")[0].replace(/^#/,"").replace(/\/+$/,"")||"/"}function _n(e){let a=oa(e);for(let t of ca)if(oa(t.path)===a)return t;for(let t of ca){if(!t.path.includes(":"))continue;let n=oa(t.path).split("/"),s=a.split("/");if(n.length!==s.length)continue;let r={},d=!0;for(let o=0;o<n.length;o+=1){let c=n[o];if(c.startsWith(":"))r[c.slice(1)]=decodeURIComponent(s[o]);else if(c!==s[o]){d=!1;break}}if(d)return{...t,params:r}}return null}function la(){let a=(window.location.hash||"#/").slice(1)||"/",[t,n]=a.split("?"),s={};if(n)for(let[r,d]of new URLSearchParams(n))s[r]=d;return{path:oa(t),query:s}}function ie(e,{replace:a=!1}={}){let t=e.startsWith("#")?e:`#${e}`;if(a)window.history.replaceState(null,"",t);else if(window.location.hash!==t){window.location.hash=t;return}Pa()}var Z=[];function vt(e){return String(e||"#/").replace(/^#/,"").split("?")[0]||"/"}function wn(e){let a=e||"#/",t=Z[Z.length-1];if(t&&vt(t)===vt(a)){Z[Z.length-1]=a;return}if(t===a)return;let n=Z.indexOf(a);if(n!==-1){Z.length=n+1;return}Z.push(a)}function xn(e){let a=String(e||"/").split("/").filter(Boolean);return a.length<2?null:a[0]==="users"?"/users":a[0]==="organizations"?"/organizations":null}function Na(){if(Z.length>1)return Z[Z.length-2];let e=xn(la().path);return e?`#${e}`:null}function kt(){let e=Na();if(!e)return!1;if(Z.length>1){let a=Z.lastIndexOf(e);a!==-1&&(Z.length=a+1)}return ie(e),!0}function Pa(){let{path:e,query:a}=la(),t=_n(e)||yt;if(!t)return null;wn(window.location.hash);let n=t.permission?Array.isArray(t.permission)?t.permission:[t.permission]:[];return n.length&&za&&!za.canAny(n)?(Re={...t,id:t.id||"forbidden",title:"Access restricted",description:"Your role does not include this section.",forbidden:!0},Ye&&Ye(Re,{path:e,query:a}),Re):(Re={...t,path:e,query:a,params:t.params||{}},Ye&&Ye(Re,{path:e,query:a}),Re)}function $t(){return window.addEventListener("hashchange",()=>Pa()),Pa()}var St={primary:"var(--ac-tone-1)",success:"var(--ac-tone-2)",warning:"var(--ac-tone-3)",danger:"var(--ac-tone-4)",info:"var(--ac-tone-5)",violet:"var(--ac-tone-6)",muted:"var(--ac-tone-7)"};function i(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;")}function Tt(e){let a=Number(e);return Number.isFinite(a)?a:null}function At(e,a=1){let t=Tt(e);if(t==null)return null;let n=10**a;return Math.round((t+Number.EPSILON)*n)/n}function kn(e){let a=At(e,1);return a==null?"\u2014":String(a)}function qt(e,a,t){return Math.min(t,Math.max(a,e))}function Lt(e,a=28){let t=String(e??"");return t.length>a?`${t.slice(0,a-1)}\u2026`:t}function Qe(e){return St[e]||St.primary}function ce(e){return`<div class="ac-legend">${e.map(a=>`<span class="ac-legend__item"><i class="ac-legend__key" style="background:${Qe(a.tone)}"></i>${i(a.label)}</span>`).join("")}</div>`}function le({title:e,subtitle:a,body:t,action:n="",className:s=""}){return`<section class="ac-panel ${s}">
		<div class="ac-panel__header">
			<div class="ac-panel__titles">
				<h3 class="ac-panel__title">${i(e)}</h3>
				${a?`<p class="ac-panel__subtitle">${i(a)}</p>`:""}
			</div>
			${n?`<div class="ac-panel__actions">${n}</div>`:""}
		</div>
		<div class="ac-panel__body">${t}</div>
	</section>`}function T({label:e,value:a,note:t,tone:n="",trend:s="",tooltip:r="",href:d=""}){let o=d?"a":"div",c=d?` href="${i(d)}"`:"",u=["ac-kpi",n?`ac-kpi--${n}`:"",d?"ac-kpi--link":""].filter(Boolean).join(" ");return`<${o} class="${u}"${c}${r?` title="${i(r)}"`:""}>
		<p class="ac-kpi__label">${i(e)}</p>
		<p class="ac-kpi__value">${i(a)}</p>
		${t||s?`<p class="ac-kpi__meta">${s||""}${t?`<span>${i(t)}</span>`:""}</p>`:""}
	</${o}>`}function te({rows:e=[],value:a,max:t=null,label:n=c=>c.label,display:s=c=>kn(c),tone:r="primary",threshold:d=null,ariaLabel:o="Comparison"}){let c=(Array.isArray(e)?e:[]).filter(Boolean);if(!c.length)return"";let u=680,p=38,l=150,m=64,g=10,h=8,w=c.length*p+g+h,f=c.map(R=>Number(typeof a=="function"?a(R):R[a])||0),b=Math.max(t||0,...f,1),y=u-l-m,$=R=>l+qt(R,0,b)/b*y,C=d==null?"":`<line x1="${$(d)}" y1="${g-4}" x2="${$(d)}" y2="${w-h+2}" class="ac-chart__threshold"/>`,j=c.map((R,E)=>{let F=typeof a=="function"?a(R):R[a],oe=Tt(F),ke=g+E*p+14,$e=12,ze=oe==null?0:Math.max(oe>0?2:0,$(oe)-l),Aa=typeof r=="function"?r(R):r,Ge=s(F,R);return`<g>
				<title>${i(n(R))}: ${i(Ge)}</title>
				<text x="${l-10}" y="${ke+10}" text-anchor="end" class="ac-chart__label">${i(Lt(n(R),24))}</text>
				<rect x="${l}" y="${ke}" width="${y}" height="${$e}" rx="3" class="ac-chart__track"/>
				<rect x="${l}" y="${ke}" width="${ze}" height="${$e}" rx="3" fill="${Qe(Aa)}" opacity="0.9"/>
				<text x="${u-m+8}" y="${ke+10}" class="ac-chart__value">${i(Ge)}</text>
			</g>`}).join("");return`<svg viewBox="0 0 ${u} ${w}" class="ac-chart ac-chart--bars" role="img" aria-label="${i(o)}">
		${C}${j}
	</svg>`}function Ct({rows:e=[],series:a=[],label:t=s=>s.label,ariaLabel:n="Comparison by group"}){let s=(Array.isArray(e)?e:[]).filter(Boolean);if(!s.length||!a.length)return"";let r=680,d=150,o=24,c=8,u=9,p=3,l=a.length*(u+p)+22,m=s.length*l+c+6,g=Math.max(1,...s.flatMap(f=>a.map(b=>Number(f[b.key])||0))),h=r-d-o,w=s.map((f,b)=>{let y=c+b*l,$=a.map((C,j)=>{let R=Number(f[C.key])||0,E=y+18+j*(u+p),F=R>0?Math.max(2,R/g*h):0;return`<g>
						<title>${i(t(f))} \xB7 ${i(C.label)}: ${R}</title>
						<rect x="${d}" y="${E}" width="${h}" height="${u}" rx="2" class="ac-chart__track"/>
						<rect x="${d}" y="${E}" width="${F}" height="${u}" rx="2" fill="${Qe(C.tone)}" opacity="0.9"/>
						<text x="${d+F+6}" y="${E+u-1}" class="ac-chart__value ac-chart__value--inline">${R}</text>
					</g>`}).join("");return`<g>
				<text x="${d-10}" y="${y+26}" text-anchor="end" class="ac-chart__label">${i(Lt(t(f),24))}</text>
				${$}
			</g>`}).join("");return`<svg viewBox="0 0 ${r} ${m}" class="ac-chart ac-chart--grouped" role="img" aria-label="${i(n)}">
		${w}
	</svg>`}function ge({points:e=[],series:a=[],labelKey:t="label",ariaLabel:n="Activity over time",height:s=220}){let r=Array.isArray(e)?e:[];if(!r.length||!a.length)return"";let d=680,o=38,c=14,u=16,p=34,l=Math.max(1,...r.flatMap(b=>a.map(y=>Number(b[y.key])||0))),m=(d-o-c)/r.length,g=Math.min(26,Math.max(5,m*.7/a.length)),h=b=>u+(1-qt(b,0,l)/l)*(s-u-p),w=Math.max(1,Math.ceil(r.length/7)),f=r.map((b,y)=>{let $=o+y*m+m/2,C=a.length*(g+2),j=$-C/2,R=a.map((F,oe)=>{let Fe=Number(b[F.key])||0,ke=s-p-h(Fe);return`<rect x="${j+oe*(g+2)}" y="${h(Fe)}" width="${g}" height="${Math.max(0,ke)}" rx="2" fill="${Qe(F.tone)}" opacity="0.9"><title>${i(b[t])} \xB7 ${i(F.label)}: ${Fe}</title></rect>`}).join(""),E=y%w===0?`<text x="${$}" y="${s-10}" text-anchor="middle" class="ac-chart__axis">${i(b[t])}</text>`:"";return`${R}${E}`}).join("");return`<svg viewBox="0 0 ${d} ${s}" class="ac-chart ac-chart--columns" role="img" aria-label="${i(n)}">
		<line x1="${o}" y1="${s-p}" x2="${d-c}" y2="${s-p}" class="ac-chart__grid"/>
		${f}
	</svg>`}function Et({buckets:e=[],ariaLabel:a="Distribution"}){return ge({points:e,series:[{key:"count",label:"Count",tone:"primary"}],labelKey:"label",ariaLabel:a,height:200})}function jt({segments:e=[],centerValue:a="",centerLabel:t="",ariaLabel:n="Composition",size:s=190}){let r=(Array.isArray(e)?e:[]).filter(m=>(Number(m.value)||0)>0);if(!r.length)return"";let d=r.reduce((m,g)=>m+(Number(g.value)||0),0),o=62,c=s/2,u=2*Math.PI*o,p=0,l=r.map(m=>{let g=Number(m.value)||0,h=g/d*u,w=`<circle cx="${c}" cy="${c}" r="${o}" fill="none" stroke="${Qe(m.tone)}" stroke-width="22"
				stroke-dasharray="${h} ${u-h}" stroke-dashoffset="${-p}"
				transform="rotate(-90 ${c} ${c})" opacity="0.92"><title>${i(m.label)}: ${g} (${At(g/d*100,1)}%)</title></circle>`;return p+=h,w}).join("");return`<svg viewBox="0 0 ${s} ${s}" class="ac-chart ac-chart--donut" role="img" aria-label="${i(n)}">
		<circle cx="${c}" cy="${c}" r="${o}" fill="none" class="ac-chart__donut-track" stroke-width="22"/>
		${l}
		<text x="${c}" y="${c-4}" text-anchor="middle" class="ac-chart__center">${i(a)}</text>
		<text x="${c}" y="${c+15}" text-anchor="middle" class="ac-chart__center-label">${i(t)}</text>
	</svg>`}var be={overview:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',organizations:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6"/><path d="M9 11h.01M15 11h.01"/></svg>',users:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',analytics:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></svg>',audit:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h4"/></svg>',learning:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',health:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',settings:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',search:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',menu:'<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',sun:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',moon:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',external:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',logo:'<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5-10-5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>'};var zt="quizConsoleTheme";function $n(e){let t=String(e||"?").trim().split(/\s+/).filter(Boolean);return t.length?t.length===1?t[0].slice(0,2).toUpperCase():`${t[0][0]}${t[t.length-1][0]}`.toUpperCase():"?"}function Ma(e){let a=document.documentElement,t=e||localStorage.getItem(zt)||(window.matchMedia?.("(prefers-color-scheme: dark)").matches?"dark":"light");return a.setAttribute("data-console-theme",t),localStorage.setItem(zt,t),t}function Sn(){let e=document.documentElement.getAttribute("data-console-theme")==="dark"?"light":"dark";return Ma(e),e}function Pt(e,{session:a,navItems:t,canAny:n,onNavigate:s}){let r=a.user,d=!!a.scope?.isPlatform,o=a.scope?.organization,u=!!(a.deployment||{}).isOffline,p=u?"Local installation":d?"Platform scope":o?.name?o.name:"Organization scope",l=t.filter(g=>{if(!g.permission)return!0;let h=Array.isArray(g.permission)?g.permission:[g.permission];return n(h)});e.innerHTML=`
		<aside class="ac-sidebar" id="ac-sidebar">
			<div class="ac-sidebar__brand">
				<div class="ac-sidebar__logo" aria-hidden="true">${be.logo}</div>
				<div class="ac-sidebar__titles">
					<p class="ac-sidebar__title">Control Center</p>
					<p class="ac-sidebar__subtitle">${i(u?"This installation":d?"All organizations":o?.name||"Organization")}</p>
				</div>
			</div>
			<nav class="ac-nav" aria-label="Console sections">
				${(()=>{let g=null;return l.map(h=>{let w=h.group||null,f=w&&w!==g?`<p class="ac-nav__group-label">${i(w)}</p>`:"";return g=w,`${f}
					<button type="button" class="ac-nav__item" data-ac-nav="${i(h.id)}" data-ac-path="${i(h.path)}">
						${be[h.icon]||be.overview}
						<span class="ac-nav__label">${i(h.title)}</span>
					</button>`}).join("")})()}
			</nav>
			<div class="ac-sidebar__footer">
				<div class="ac-user">
					<div class="ac-user__avatar" aria-hidden="true">${i($n(r.name))}</div>
					<div class="ac-user__meta">
						<p class="ac-user__name">${i(r.name||r.username)}</p>
						<p class="ac-user__role">${i(r.roleLabel||r.role)}</p>
					</div>
				</div>
			</div>
		</aside>

		<div class="ac-main">
			<header class="ac-header">
				<button type="button" class="ac-btn ac-btn--ghost ac-btn--icon ac-header__toggle" data-ac-menu aria-label="Toggle navigation">
					${be.menu}
				</button>
				<div class="ac-header__titles">
					<h1 class="ac-header__title" id="ac-page-title">Overview</h1>
					<p class="ac-header__description" id="ac-page-description"></p>
				</div>
				<div class="ac-header__actions">
					<span class="ac-scope${d&&!u?" ac-scope--platform":""}" title="The slice of the platform this session can reach">
						<span class="ac-scope__dot"></span>${i(p)}
					</span>
					<div class="ac-search">
						${be.search}
						<input type="search" id="ac-global-search" placeholder="Search\u2026" aria-label="Search the console" autocomplete="off" />
						<button type="button" class="ac-search__clear" id="ac-search-clear" aria-label="Clear the search" title="Clear" hidden>
							<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
						</button>
						<div class="ac-search__panel" id="ac-search-panel" hidden></div>
					</div>
					<button type="button" class="ac-btn ac-btn--ghost ac-btn--icon" data-ac-theme aria-label="Toggle colour theme">
						${be.sun}
					</button>
					<a class="ac-btn ac-btn--ghost" href="/admin.html" title="Open the classroom administration surface">
						${be.external}<span>Classroom</span>
					</a>
				</div>
			</header>
			<main class="ac-content" id="ac-content" tabindex="-1"></main>
		</div>`,e.hidden=!1;let m=e.querySelector("#ac-sidebar");return e.querySelector("[data-ac-menu]")?.addEventListener("click",()=>{m.classList.toggle("is-open")}),e.querySelector("[data-ac-theme]")?.addEventListener("click",g=>{let h=Sn();g.currentTarget.innerHTML=h==="dark"?be.moon:be.sun}),e.querySelectorAll("[data-ac-nav]").forEach(g=>{g.addEventListener("click",()=>{m.classList.remove("is-open"),s(g.dataset.acPath)})}),{content:e.querySelector("#ac-content"),title:e.querySelector("#ac-page-title"),description:e.querySelector("#ac-page-description"),setActive(g){let h=Array.from(e.querySelectorAll("[data-ac-nav]")),w=!1;h.forEach(f=>{let b=f.dataset.acPath,y=b===g||b!=="/"&&g.startsWith(b);y&&(w=!0),f.classList.toggle("is-active",y)}),w||h.forEach(f=>{f.dataset.acPath==="/"&&f.classList.add("is-active")})}}}function Nt(e,a=[]){let t=[];for(let n of e)n.id==="not-found"||n.id==="forbidden"||t.push({kind:"page",title:n.title,sub:n.description||"",path:n.path==="/"?"/":n.path,keywords:`${n.title} ${n.description||""}`.toLowerCase()});for(let n of a)t.push({kind:"settings",title:n.label,sub:"Settings",path:`/settings?section=${encodeURIComponent(n.id)}`,keywords:`settings ${n.label}`.toLowerCase()});return t}function Tn(e,a){let t=a.keywords,n=a.title.toLowerCase();if(!e)return 0;if(n.startsWith(e))return 100-n.length*.01;let s=n.indexOf(e);if(s!==-1)return 60-s;if(t.includes(e))return 30;let r=e.split(/\s+/).filter(Boolean);return r.length>1&&r.every(d=>t.includes(d))?20:0}async function Mt(e,{places:a,canUsers:t=!1,canOrganizations:n=!1}={}){let s=String(e||"").trim().toLowerCase();if(!s)return[];let r=a.map(p=>({place:p,value:Tn(s,p)})).filter(p=>p.value>0).sort((p,l)=>l.value-p.value).slice(0,6).map(({place:p})=>({...p,badge:"Page"})),[d,o]=await Promise.all([t?_.get(`console/users?search=${encodeURIComponent(e.trim())}&limit=4`).catch(()=>null):Promise.resolve(null),n?_.get(`console/organizations?search=${encodeURIComponent(e.trim())}&limit=4`).catch(()=>null):Promise.resolve(null)]),c=(d?.data||[]).slice(0,4).map(p=>({kind:"user",title:p.name||p.username,sub:p.username&&p.name?p.username:p.roleLabel||"",path:`/users/${p.id}`,badge:p.roleLabel||"Account"})),u=(o?.data||[]).slice(0,4).map(p=>({kind:"organization",title:p.name,sub:p.status==="suspended"?"suspended":"",path:`/organizations/${p.id}`,badge:"Organization"}));return[...r,...c,...u]}function q({columns:e,rows:a,empty:t="Nothing to show for the current filters.",sort:n=null,onSort:s=null,rowHref:r=null,rowClass:d=null}){if(!a||a.length===0)return`<div class="ac-empty">
			<div class="ac-empty__icon" aria-hidden="true">
				<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
			</div>
			<p class="ac-empty__title">No data</p>
			<p class="ac-empty__message">${i(t)}</p>
		</div>`;let o=e.map(u=>{let p=u.align==="right"?" is-numeric":"",l=u.sortable&&s?" is-sortable":"",m=n&&n.key===u.key,g=m?n.direction==="asc"?"\u25B2":"\u25BC":"";return`<th class="${p}${l}"${l?` data-ac-sort="${i(u.key)}"`:""}${m?` aria-sort="${n.direction==="asc"?"ascending":"descending"}"`:""}>
				${i(u.label)}${g?`<span class="ac-sort">${g}</span>`:""}
			</th>`}).join(""),c=a.map((u,p)=>{let l=r?r(u):null,m=d?d(u):"",g=e.map(h=>{let w=h.align==="right"?" is-numeric":"",f=h.render?h.render(u):i(u[h.key]??"\u2014");return`<td class="${w}${h.className?` ${h.className}`:""}" data-label="${i(h.label)}">${f}</td>`}).join("");return`<tr${l?` data-ac-href="${i(l)}"`:""} class="${i(m)}" data-ac-row="${p}">${g}</tr>`}).join("");return`<div class="ac-table-wrap"><table class="ac-table">
		<thead><tr>${o}</tr></thead>
		<tbody>${c}</tbody>
	</table></div>`}function se({total:e,limit:a,offset:t,onPage:n}){let s=Math.max(1,Number(a)||50),r=Math.max(0,Number(t)||0),d=Math.floor(r/s)+1,o=Math.max(1,Math.ceil((Number(e)||0)/s)),c=e===0?0:r+1,u=Math.min(r+s,Number(e)||0),p=(l,m,g,h="")=>`<button type="button" class="ac-btn ac-btn--sm" data-ac-page="${m}"${g?" disabled":""}${h}>${l}</button>`;return`<div class="ac-pagination">
		<span>Showing ${c}\u2013${u} of ${(Number(e)||0).toLocaleString()}</span>
		<div class="ac-pagination__pages">
			${p("\xAB",0,r===0)}
			${p("\u2039",Math.max(0,r-s),r===0)}
			<span style="padding:0 6px">Page ${d} of ${o}</span>
			${p("\u203A",r+s,r+s>=(Number(e)||0))}
			${p("\xBB",Math.max(0,(o-1)*s),r+s>=(Number(e)||0))}
		</div>
	</div>`}function da(e,{onSort:a=null,onPage:t=null}={}){a&&e.querySelectorAll("[data-ac-sort]").forEach(n=>{n.addEventListener("click",()=>a(n.dataset.acSort))}),t&&e.querySelectorAll("[data-ac-page]").forEach(n=>{n.addEventListener("click",()=>t(Number(n.dataset.acPage)))}),e.querySelectorAll("[data-ac-href]").forEach(n=>{n.style.cursor="pointer",n.addEventListener("click",s=>{s.target.closest("a, button, input, select")||(window.location.hash=n.dataset.acHref)})})}function H(e=3){return`<div class="ac-skeleton-stack" aria-busy="true">
		${Array.from({length:e}).map((a,t)=>`<div class="ac-skeleton" style="width:${100-t*12}%"></div>`).join("")}
	</div>`}function B({title:e="No data",message:a="There is nothing to report for the current filters and period.",action:t=""}={}){return`<div class="ac-empty">
		<div class="ac-empty__icon" aria-hidden="true">
			<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h18M3 12h18M3 17h10"/></svg>
		</div>
		<p class="ac-empty__title">${i(e)}</p>
		<p class="ac-empty__message">${i(a)}</p>
		${t}
	</div>`}function O({title:e="This section could not be loaded",message:a="An unexpected error occurred. The rest of the console is unaffected.",retry:t=!0}={}){return`<div class="ac-error" role="alert">
		<div>
			<p class="ac-error__title">${i(e)}</p>
			<p class="ac-error__message">${i(a)}</p>
		</div>
		${t?'<button type="button" class="ac-btn ac-btn--sm" data-ac-retry>Retry</button>':""}
	</div>`}var Ra=Object.freeze([{key:"7d",label:"7 days"},{key:"30d",label:"30 days"},{key:"90d",label:"90 days"},{key:"year",label:"Academic year"},{key:"custom",label:"Custom"}]);function Oa({options:e,value:a,name:t,onSelect:n=null}){return`<div class="ac-chip-group" role="group" aria-label="Period">${e.map(s=>`<button type="button" class="ac-chip${s.key===a?" is-active":""}" data-ac-chip="${t}" data-ac-value="${i(s.key)}" aria-pressed="${s.key===a}">${i(s.label)}</button>`).join("")}</div>`}function Oe(e,a,t){e.querySelectorAll(`[data-ac-chip="${a}"]`).forEach(n=>{n.addEventListener("click",()=>t(n.dataset.acValue))})}function de({id:e="ac-search",placeholder:a="Search\u2026",value:t=""}){return`<div class="ac-field">
		<label class="ac-field__label" for="${i(e)}">Search</label>
		<input class="ac-input" id="${i(e)}" type="search" placeholder="${i(a)}" value="${i(t)}" autocomplete="off" />
	</div>`}function V({id:e,label:a,options:t=[],value:n="",allLabel:s=null,includeAll:r=!1}){return`<div class="ac-field">
		<label class="ac-field__label" for="${i(e)}">${i(a)}</label>
		<select class="ac-select" id="${i(e)}" data-ac-select="${i(e)}">
			${r?`<option value=""${n?"":" selected"}>${i(s||"All")}</option>`:""}
			${t.map(d=>`<option value="${i(d.value)}"${String(d.value)===String(n)?" selected":""}>${i(d.label)}</option>`).join("")}
		</select>
	</div>`}function G({chips:e="",fields:a="",filters:t="",actions:n=""}={}){let s=a||t;return e?`<div class="ac-toolbar">
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
			</div></div>`}function pa({value:e,customFrom:a="",customTo:t=""}){let n=e==="custom"?`<div class="ac-field">
					<label class="ac-field__label" for="ac-period-from">From</label>
					<input class="ac-input" id="ac-period-from" type="date" value="${i(a)}" />
				</div>
				<div class="ac-field">
					<label class="ac-field__label" for="ac-period-to">To</label>
					<input class="ac-input" id="ac-period-to" type="date" value="${i(t)}" />
				</div>`:"";return G({chips:Oa({options:Ra,value:e,name:"period"}),fields:n})}var Le=null;function An(){return Le||(Le=document.createElement("div"),Le.className="ac-toasts",Le.setAttribute("role","status"),Le.setAttribute("aria-live","polite"),document.body.appendChild(Le)),Le}function v(e,a="info",t=4200){let n=An(),s=document.createElement("div");return s.className=`ac-toast ac-toast--${a}`,s.innerHTML=`<span class="ac-toast__text">${i(e)}</span>`,n.appendChild(s),window.setTimeout(()=>{s.style.opacity="0",s.style.transition="opacity .18s ease",window.setTimeout(()=>s.remove(),200)},t),s}var ua=0;function I({title:e,subtitle:a="",body:t,footer:n="",wide:s=!1,onMount:r=null}){let d=document.createElement("div");d.className="ac-modal-backdrop",d.setAttribute("role","dialog"),d.setAttribute("aria-modal","true"),d.setAttribute("aria-label",e),d.innerHTML=`
		<div class="ac-modal${s?" ac-modal--wide":""}">
			<div class="ac-modal__header">
				<div>
					<h2 class="ac-modal__title">${i(e)}</h2>
					${a?`<p class="ac-modal__subtitle">${i(a)}</p>`:""}
				</div>
				<button type="button" class="ac-close" data-ac-close aria-label="Close">&times;</button>
			</div>
			<div class="ac-modal__body" data-ac-modal-body></div>
			${n?'<div class="ac-modal__footer" data-ac-modal-footer></div>':""}
		</div>`;let o=d.querySelector("[data-ac-modal-body]");typeof t=="string"?o.innerHTML=t:t&&o.appendChild(t);let c=d.querySelector("[data-ac-modal-footer]");c&&(typeof n=="string"?c.innerHTML=n:n&&c.appendChild(n));function u(){d.remove(),ua=Math.max(0,ua-1),ua===0&&document.body.style.removeProperty("overflow"),document.removeEventListener("keydown",p)}function p(m){m.key==="Escape"&&u()}d.addEventListener("click",m=>{m.target===d&&u()}),d.querySelectorAll("[data-ac-close]").forEach(m=>m.addEventListener("click",u)),document.addEventListener("keydown",p),document.body.appendChild(d),ua+=1,document.body.style.overflow="hidden";let l=d.querySelector("input, select, textarea, button:not([data-ac-close])");return l&&l.focus(),r&&r(d),{close:u,root:d}}function D({title:e,message:a,detail:t="",confirmLabel:n="Confirm",danger:s=!1}){return new Promise(r=>{let d=I({title:e,body:`
				<p style="margin:0 0 10px;font-size:13.5px;line-height:1.55">${i(a)}</p>
				${t?`<div class="ac-alert ac-alert--${s?"danger":"info"}"><div class="ac-alert__body"><p class="ac-alert__text">${i(t)}</p></div></div>`:""}
			`,footer:`
				<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
				<button type="button" class="ac-btn ${s?"ac-btn--danger":"ac-btn--primary"}" data-ac-confirm>${i(n)}</button>
			`});d.root.querySelector("[data-ac-cancel]").addEventListener("click",()=>{d.close(),r(!1)}),d.root.querySelector("[data-ac-confirm]").addEventListener("click",()=>{d.close(),r(!0)}),d.root.addEventListener("click",o=>{o.target===d.root&&r(!1)})})}function k(e,a="\u2014"){if(e==null||e==="")return a;let t=Number(e);return Number.isFinite(t)?t.toLocaleString():a}function N(e,{withTime:a=!0}={}){if(!e)return"\u2014";let t=e instanceof Date?e:new Date(e);return Number.isNaN(t.getTime())?"\u2014":t.toLocaleString(void 0,{year:"numeric",month:"short",day:"2-digit",...a?{hour:"2-digit",minute:"2-digit"}:{}})}function W(e){if(!e)return"never";let a=e instanceof Date?e:new Date(e);if(Number.isNaN(a.getTime()))return"never";let t=Math.round((Date.now()-a.getTime())/1e3),n=[["year",31536e3],["month",2592e3],["day",86400],["hour",3600],["minute",60]];for(let[s,r]of n)if(Math.abs(t)>=r){let d=Math.round(t/r);return`${d} ${s}${d===1?"":"s"} ago`}return"just now"}var ve={control:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',access:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>',credentials:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',maintenance:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9l-3.7 3.8z"/></svg>',activity:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',analytics:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></svg>',documents:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',notes:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',planning:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>'},Ia={id:"overview",path:"/",title:"Overview",description:"Control, access, activity, documents and planning \u2014 the administrator's working view.",permission:["platform.console","school.console"],async render(e,a){let t=a.getState();e.innerHTML=`<div class="ac-stack" data-ac-overview>
			${pa({value:t.period})}
			<div data-ac-kpis class="ac-grid ac-grid--kpi">${H(1)}</div>
			<div data-ac-alerts class="ac-stack"></div>
			<div class="ac-workbench" data-ac-workbench></div>
			<div data-ac-trends class="ac-grid ac-grid--2"></div>
			<div data-ac-detail class="ac-grid ac-grid--3" style="margin-top:16px"></div>
		</div>`;let n={period:t.period==="year"?"year":t.period};t.period==="custom"&&t.customRange&&(n.from=t.customRange.from,n.to=t.customRange.to);let s,r,d;try{[s,r,d]=await Promise.all([_.get("console/overview",n),_.get("console/trends",n),_.get("console/workbench")])}catch(f){e.innerHTML=O({title:"The overview could not be loaded",message:f.message});return}let o=s.data,c=o.sections.glance,u=o.sections.activity,p=o.sections.operations,l=o.sections.content,m=o.meta.definitions,g=d.data.sections;e.querySelector("[data-ac-kpis]").innerHTML=[T({label:a.isPlatform?a.isOffline?"Organizations here":"Organizations":"Organization",value:a.isPlatform?k(c.organizations.total):a.organization?.name||"\u2014",note:a.isPlatform?`${c.organizations.active} active \xB7 ${c.organizations.pending} pending`:`Plan ${a.organization?.plan||"\u2014"}`,tone:"primary",tooltip:"The tenants of this installation.",href:a.isPlatform?"#/organizations":null}),T({label:"Accounts",value:k(c.users.teachers+c.users.students+c.users.administrators),note:`${k(c.users.teachers)} teachers \xB7 ${k(c.users.students)} students`,tooltip:"Every account in the current scope.",href:"#/users"}),T({label:"Live sessions",value:k(g.maintenance.liveSessions),note:"refresh tokens still valid",tooltip:"Accounts with a refresh token that has not expired or been revoked. An administrator can revoke them from the account page."}),T({label:"Availability",value:p.availabilityPercent==null?"\u2014":`${p.availabilityPercent.toFixed(1)}%`,note:"last 60 minutes",tone:p.availabilityPercent==null?"":p.availabilityPercent>=99?"success":"warning",tooltip:p.note,href:"#/health"}),T({label:"Failed sign-ins",value:k(p.failedAuthentications),note:o.meta.scope.periodLabel,tone:p.failedAuthentications>0?"warning":"",tooltip:"Failed authentication attempts recorded in the durable security trail.",href:"#/audit?stream=security"}),T({label:"Waiting for access",value:k(g.access.pendingAccountRequests+g.access.pendingProfileRequests),note:`${k(g.access.pendingAccountRequests)} requests \xB7 ${k(g.access.pendingProfileRequests)} profile changes`,tone:g.access.pendingAccountRequests+g.access.pendingProfileRequests>0?"warning":"",tooltip:"Account requests and profile change requests that are waiting for a decision."})].join(""),e.querySelector("[data-ac-alerts]").innerHTML=qn({glance:c,operations:p,activity:u,access:g.access,maintenance:g.maintenance}),e.querySelector("[data-ac-workbench]").innerHTML=[ye({icon:ve.access,title:"Access to grant",subtitle:"What is waiting for an administrator.",body:`
					<div class="ac-workbench__list">
						${Ve({title:"Account requests",sub:"New students waiting to be created",value:g.access.pendingAccountRequests,href:"#/users/students?status=pending"})}
						${Ve({title:"Profile change requests",sub:"Students asking for a correction",value:g.access.pendingProfileRequests,href:"#/audit"})}
						${Ve({title:"Suspended accounts",sub:"No access until restored",value:g.access.suspendedAccounts,href:"#/users?status=suspended"})}
						${Ve({title:"Permission overrides",sub:"Individual grants and denies",value:g.access.permissionOverrides,href:"#/settings?section=roles"})}
						${Ve({title:"Teachers without a class",sub:"They can author, but reach nobody",value:g.access.teachersWithoutClasses.length,href:"#/users/teachers"})}
					</div>`}),ye({icon:ve.credentials,title:"Credentials to check",subtitle:"Accounts that were provisioned but never used.",body:g.access.unusedCredentials.length?`<div class="ac-workbench__list">${g.access.unusedCredentials.map(f=>`
						<a class="ac-workbench__row" href="#/users/${f.id}" style="text-decoration:none;color:inherit">
							<div class="ac-workbench__row-main">
								<p class="ac-workbench__row-title">${i(f.name||f.username)}</p>
								<p class="ac-workbench__row-sub">${i(f.role)} \xB7 ${f.last_login?`last seen ${i(W(f.last_login))}`:"never signed in"}</p>
							</div>
							<span class="ac-workbench__row-value">${i(f.status)}</span>
						</a>`).join("")}</div>`:B({title:"Every account has been used",message:"No account in scope is waiting for its first sign-in."})}),ye({icon:ve.maintenance,title:"Maintenance & recent actions",subtitle:"The last administrative operations.",body:g.maintenance.recentAudit.length?`<div class="ac-workbench__list">${g.maintenance.recentAudit.map(f=>`
						<div class="ac-workbench__row">
							<div class="ac-workbench__row-main">
								<p class="ac-workbench__row-title">${i(f.action)}</p>
								<p class="ac-workbench__row-sub">${i(f.actorName||"system")} \xB7 ${i(f.entityType)} \xB7 ${i(W(f.occurredAt))}</p>
							</div>
							<span class="ac-badge ac-badge--${f.severity==="critical"?"danger":f.severity==="warning"?"warning":"success"}">${i(f.severity)}</span>
						</div>`).join("")}</div>`:B({title:"No administrative action recorded yet",message:"Actions appear here as soon as an administrator changes something."})}),ye({icon:ve.activity,title:"Teacher activity",subtitle:"Are the teachers working?",body:`<p class="ac-empty__message" style="margin:0 0 12px;font-size:12px">${i(m.activeTeacher)}</p>
				<div class="ac-defs">
					<div class="ac-defs__item">
						<p class="ac-defs__term">Active</p>
						<p class="ac-defs__desc">${k(c.users.activeTeachers)} of ${k(c.users.teachers)}</p>
					</div>
					<div class="ac-defs__term" style="margin-top:10px"><p class="ac-defs__term">Exams authored</p></div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">&nbsp;</p>
						<p class="ac-defs__desc">${k(l.exams)}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Questions</p>
						<p class="ac-defs__desc">${k(l.questions)}</p>
					</div>
				</div>`}),ye({icon:ve.activity,title:"Student participation",subtitle:"Are the students taking part?",body:`<p class="ac-empty__message" style="margin:0 0 12px;font-size:12px">${i(m.activeStudent)}</p>
				<div class="ac-defs">
					<div class="ac-defs__item">
						<p class="ac-defs__term">Active</p>
						<p class="ac-defs__desc">${k(c.users.activeStudents)} of ${k(c.users.students)}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Attempts</p>
						<p class="ac-defs__desc">${k(u.attempts)}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Participating</p>
						<p class="ac-defs__desc">${k(u.participatingStudents)}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Average score</p>
						<p class="ac-defs__desc">${u.averageScore20==null?"\u2014":`${u.averageScore20.toFixed(2)} /20`}</p>
					</div>
				</div>`}),ye({icon:ve.analytics,title:"Assessment activity",subtitle:"What the platform is being used for.",body:`<div class="ac-defs">
					<div class="ac-defs__item">
						<p class="ac-defs__term">Exams conducted</p>
						<p class="ac-defs__desc">${k(u.examsConducted)}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Formal attempts</p>
						<p class="ac-defs__desc">${k(u.formalAttempts)}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Courses</p>
						<p class="ac-defs__desc">${k(l.courses)}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Game sessions</p>
						<p class="ac-defs__desc">${k(u.gameSessions+u.kidsGameSessions)}</p>
					</div>
				</div>`})].join("");let h=e.querySelector("[data-ac-trends]");if(r){let f=r.data.series,b=f.labels.map((C,j)=>({label:C,formalAttempts:f.formalAttempts[j]||0,trainingAttempts:f.trainingAttempts[j]||0,gameAttempts:f.gameAttempts[j]||0,newTeachers:f.newTeachers[j]||0,newStudents:f.newStudents[j]||0})),y=[{key:"formalAttempts",label:"Formal exams",tone:"primary"},{key:"trainingAttempts",label:"Training",tone:"info"},{key:"gameAttempts",label:"Games",tone:"violet"}],$=[{key:"newTeachers",label:"Teachers",tone:"success"},{key:"newStudents",label:"Students",tone:"warning"}];h.innerHTML=`
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles">
							<h3 class="ac-panel__title">Educational activity</h3>
							<p class="ac-panel__subtitle">Completed attempts by mode. ${r.data.meta.granularity==="week"?"Weekly":"Daily"} buckets over ${i(r.data.meta.periodLabel)}.</p>
						</div>
					</div>
					<div class="ac-panel__body">
						${ce(y)}
						${ge({points:b,series:y,labelKey:"label",ariaLabel:"Completed attempts over time by mode"})}
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
						${ce($)}
						${ge({points:b,series:$,labelKey:"label",ariaLabel:"New accounts over time"})}
					</div>
				</section>`}e.querySelector("[data-ac-detail]").innerHTML=[ye({icon:ve.documents,title:"Documents",subtitle:"What has been produced.",flush:!0,body:g.documents.recent.length?`<div class="ac-workbench__list">${g.documents.recent.map(f=>`
					<div class="ac-workbench__row">
						<div class="ac-workbench__row-main">
							<p class="ac-workbench__row-title">${i(f.title||f.fileName)}</p>
							<p class="ac-workbench__row-sub">${i(f.kind)} \xB7 ${i(f.format||"").toUpperCase()} \xB7 ${i(W(f.createdAt))}</p>
						</div>
						<span class="ac-workbench__row-value">${Rt(f.sizeBytes)}</span>
					</div>`).join("")}</div>`:B({title:"No documents yet",message:"Course booklets, preparation sheets and exam papers appear here."})}),ye({icon:ve.notes,title:"Notes to teachers",subtitle:"What has been said, and a way to say more.",actions:'<button type="button" class="ac-btn ac-btn--sm" data-ac-compose-note>Write a note</button>',flush:!0,body:g.notes.recent.length?`<div class="ac-workbench__list">${g.notes.recent.map(f=>`
					<div class="ac-workbench__row">
						<div class="ac-workbench__row-main">
							<p class="ac-workbench__row-title">${i(f.title)}</p>
							<p class="ac-workbench__row-sub">${i(f.teacherName||"An administrator")}${f.className?` \xB7 ${i(f.className)}`:""} \xB7 ${i(W(f.date))}</p>
						</div>
					</div>`).join("")}</div>`:B({title:"No note sent yet",message:"A note reaches a teacher and their class."})}),ye({icon:ve.planning,title:"Planning",subtitle:"What is coming up.",flush:!0,body:`
					<div class="ac-workbench__list">
						${g.planning.upcomingAssignments.length?g.planning.upcomingAssignments.map(f=>`
							<div class="ac-workbench__row">
								<div class="ac-workbench__row-main">
									<p class="ac-workbench__row-title">${i(f.title)}</p>
									<p class="ac-workbench__row-sub">Due ${i(N(f.dueDate,{withTime:!1}))}</p>
								</div>
								<span class="ac-workbench__row-value">${f.dueDate&&new Date(f.dueDate)<new Date?'<span class="ac-badge ac-badge--danger">overdue</span>':'<span class="ac-badge">scheduled</span>'}</span>
							</div>`).join(""):""}
						${g.planning.recentExams.length?g.planning.recentExams.map(f=>`
							<div class="ac-workbench__row">
								<div class="ac-workbench__row-main">
									<p class="ac-workbench__row-title">${i(f.name)}</p>
									<p class="ac-workbench__row-sub">${f.isTraining?"Training":"Formal exam"} \xB7 created ${i(W(f.createdAt))}</p>
								</div>
								<span class="ac-badge ac-badge--${f.status==="active"?"success":""}">${i(f.status)}</span>
							</div>`).join(""):""}
						${g.planning.archives.length?g.planning.archives.map(f=>`
							<div class="ac-workbench__row">
								<div class="ac-workbench__row-main">
									<p class="ac-workbench__row-title">${i(f.label||`Archive ${f.year}`)}</p>
									<p class="ac-workbench__row-sub">School year ${i(f.year)}</p>
								</div>
								<span class="ac-workbench__row-value">${Rt(f.sizeBytes)}</span>
							</div>`).join(""):""}
					</div>
					${!g.planning.upcomingAssignments.length&&!g.planning.recentExams.length&&!g.planning.archives.length?B({title:"Nothing planned yet",message:"Exams, assignments and year archives appear here."}):""}`})].join("");let w=e.querySelector("[data-ac-compose-note]");w&&w.addEventListener("click",async()=>{let f=[];try{f=(await _.get("console/users?role=teacher&limit=200"))?.data||[]}catch{f=[]}if(!f.length){v("No teacher account is available to write to.","error");return}let b=I({title:"Write a note to a teacher",subtitle:"The note reaches the teacher and, when a class is chosen, that class.",body:`<div class="ac-field">
							<label class="ac-field__label" for="ac-note-teacher">Teacher</label>
							<select class="ac-select ac-input--full" id="ac-note-teacher">
								${f.map(y=>`<option value="${i(y.id)}">${i(y.name||y.username)}</option>`).join("")}
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
					`});b.root.querySelector("[data-ac-cancel]").addEventListener("click",b.close),b.root.querySelector("[data-ac-confirm]").addEventListener("click",async()=>{let y=b.root.querySelector("#ac-note-teacher").value,$=b.root.querySelector("#ac-note-title").value.trim(),C=b.root.querySelector("#ac-note-body").value.trim();if(!$||!C){v("A title and a message are required.","error");return}try{await _.post("console/notes",{teacherId:y,title:$,body:C}),b.close(),v("Note sent.","success"),a.rerender()}catch(j){v(j.message,"error")}})}),Oe(e,"period",f=>{if(f==="custom"){let b=prompt("From (YYYY-MM-DD)",new Date(Date.now()-2592e6).toISOString().slice(0,10));if(!b)return;let y=prompt("To (YYYY-MM-DD)",new Date().toISOString().slice(0,10));if(!y)return;a.setPeriod("custom",{from:b,to:y});return}a.setPeriod(f)})}};function ye({icon:e,title:a,subtitle:t,body:n,actions:s="",flush:r=!1}){return`<section class="ac-workbench__panel">
		<div class="ac-workbench__head">
			<div>
				<h3 class="ac-workbench__title">${e||""}${i(a)}</h3>
				${t?`<p class="ac-workbench__subtitle">${i(t)}</p>`:""}
			</div>
			${s?`<div class="ac-panel__actions">${s}</div>`:""}
		</div>
		<div class="ac-workbench__body${r?" ac-workbench__body--flush":""}">${n}</div>
	</section>`}function Ve({title:e,sub:a,value:t,href:n}){let s=n?"a":"div",r=n?` href="${i(n)}" style="text-decoration:none;color:inherit"`:"";return`<${s} class="ac-workbench__row"${r}>
		<div class="ac-workbench__row-main">
			<p class="ac-workbench__row-title">${i(e)}</p>
			<p class="ac-workbench__row-sub">${i(a)}</p>
		</div>
		<span class="ac-workbench__row-value">${k(t)}</span>
	</${s}>`}function Rt(e){let a=Number(e);return!Number.isFinite(a)||a<=0?"\u2014":a<1024?`${a} B`:a<1024*1024?`${Math.round(a/1024)} KB`:`${Math.round(a/1024/1024*10)/10} MB`}function qn({glance:e,operations:a,activity:t,access:n,maintenance:s}){let r=[];if(n.pendingAccountRequests>0&&r.push({kind:"warning",title:`${n.pendingAccountRequests} account request(s) waiting for a decision`,text:"A student or a teacher cannot sign in until an administrator approves the request.",action:{label:"Review accounts",href:"#/users/students"}}),n.pendingProfileRequests>0&&r.push({kind:"info",title:`${n.pendingProfileRequests} profile change request(s) waiting`,text:"A student is asking for a correction to their record.",action:{label:"Review the trail",href:"#/audit"}}),n.teachersWithoutClasses.length>0&&r.push({kind:"warning",title:`${n.teachersWithoutClasses.length} teacher(s) manage no class`,text:"They can author content but reach no student. Assign them a class, or deactivate the account.",action:{label:"Open teachers",href:"#/users/teachers"}}),a.failedAuthentications>0&&r.push({kind:"warning",title:`${a.failedAuthentications} failed sign-in attempt(s) in this period`,text:"Grouped by source address and attempted username on the Audit page \u2014 a concentration may indicate credential stuffing.",action:{label:"Inspect security events",href:"#/audit?stream=security"}}),a.serverErrorRatePercent!=null&&a.serverErrorRatePercent>=1&&r.push({kind:"danger",title:`Server error rate at ${a.serverErrorRatePercent}%`,text:"More than one request in a hundred failed with a server error in the last hour.",action:{label:"Open system health",href:"#/health"}}),t.attemptsPrevious!=null&&t.attempts>0&&t.attemptsPrevious>0){let d=Math.round((t.attempts-t.attemptsPrevious)/t.attemptsPrevious*1e3)/10;d<=-30&&r.push({kind:"warning",title:`Attempts fell ${Math.abs(d)}% versus the previous period`,text:"A sharp drop usually means an organization stopped using the platform, or a term boundary was crossed.",action:{label:"Compare organizations",href:"#/analytics"}})}return r.length?`<div class="ac-alert-list">${r.map(d=>`
		<div class="ac-alert-item">
			<div class="ac-alert-item__body">
				<p class="ac-alert-item__title">${i(d.title)}</p>
				<p class="ac-alert-item__text">${i(d.text)}</p>
			</div>
			<div class="ac-alert-item__action">
				<a class="ac-btn ac-btn--sm" href="${i(d.action.href)}">${i(d.action.label)}</a>
			</div>
		</div>`).join("")}</div>`:`<div class="ac-alert ac-alert--info">
			<div class="ac-alert__body">
				<p class="ac-alert__title">Nothing needs your attention</p>
				<p class="ac-alert__text">Every monitored threshold is inside its normal range.</p>
			</div>
		</div>`}function ne(e=[]){return`<div class="ac-row-actions">${e.filter(t=>!t.hidden).map(t=>`<button type="button" class="ac-btn ac-btn--sm${t.tone?` ac-btn--${t.tone}`:""}" data-ac-action="${ma(t.id)}" data-ac-action-value="${ma(t.value??"")}" title="${ma(t.title||t.label)}">${ma(t.label)}</button>`).join("")}</div>`}function _e(e,a={}){e.addEventListener("click",t=>{let n=t.target.closest("[data-ac-action]");if(!n||!e.contains(n))return;t.preventDefault(),t.stopPropagation();let s=a[n.dataset.acAction];s&&s(n.dataset.acActionValue,n)})}function Ot(e,{canManage:a=!0,canDelete:t=!0}={}){let n=[{id:"open",label:"Open",value:e.id,title:"Open the account"}];return a&&n.push({id:"toggle-status",label:e.status==="active"?"Suspend":"Reactivate",value:e.id,title:e.status==="active"?"End this account's access and keep its record":"Restore this account's access"}),t&&n.push({id:"delete",label:"Delete",value:e.id,tone:"danger",title:"Remove this account permanently"}),n}function It(e,{canManage:a=!0}={}){let t=[{id:"open",label:"Open",value:e.id}];return a&&(t.push({id:"toggle-status",label:e.status==="suspended"?"Reactivate":"Suspend",value:e.id,title:e.status==="suspended"?"Restore this organization's access":"Revoke this organization's access"}),t.push({id:"edit",label:"Edit",value:e.id,title:"Edit the organization profile"}),t.push({id:"delete",label:"Delete",value:e.id,tone:"danger",title:"Remove the organization and everything in it"})),t}function ma(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function L({title:e,subtitle:a="",body:t,actions:n="",flush:s=!1,id:r=""}={}){return`<section class="ac-section-panel"${r?` id="${i(r)}"`:""}>
		<div class="ac-section-panel__head">
			<div>
				<h3 class="ac-section-panel__title">${i(e)}</h3>
				${a?`<p class="ac-section-panel__subtitle">${i(a)}</p>`:""}
			</div>
			${n?`<div class="ac-panel__actions">${n}</div>`:""}
		</div>
		<div class="ac-section-panel__body${s?" ac-section-panel__body--flush":""}">${t}</div>
	</section>`}function A({id:e,label:a,value:t="",type:n="text",hint:s="",full:r=!1,placeholder:d="",disabled:o=!1}={}){return`<div class="ac-field${r?" ac-field--full":""}">
		<label class="ac-field__label" for="${i(e)}">${i(a)}</label>
		<input class="ac-input ac-input--full" id="${i(e)}" type="${i(n)}" value="${i(t??"")}" placeholder="${i(d)}" autocomplete="off" ${o?"disabled":""} />
		${s?`<p class="ac-field__hint">${i(s)}</p>`:""}
	</div>`}function Ce({id:e,label:a,value:t="",hint:n="",rows:s=4,placeholder:r=""}={}){return`<div class="ac-field ac-field--full">
		<label class="ac-field__label" for="${i(e)}">${i(a)}</label>
		<textarea class="ac-input ac-input--full" id="${i(e)}" rows="${s}" placeholder="${i(r)}">${i(t)}</textarea>
		${n?`<p class="ac-field__hint">${i(n)}</p>`:""}
	</div>`}function U({id:e,label:a,options:t=[],value:n="",hint:s="",allLabel:r=null}={}){let d=r?`<option value=""${n?"":" selected"}>${i(r)}</option>`:"";return`<div class="ac-field">
		<label class="ac-field__label" for="${i(e)}">${i(a)}</label>
		<select class="ac-select" id="${i(e)}">
			${d}
			${t.map(o=>`<option value="${i(o.value)}"${String(o.value)===String(n)?" selected":""}>${i(o.label)}</option>`).join("")}
		</select>
		${s?`<p class="ac-field__hint">${i(s)}</p>`:""}
	</div>`}function pe({id:e,label:a,hint:t="",checked:n=!1,disabled:s=!1}={}){return`<div class="ac-switch-row">
		<div class="ac-switch-row__text">
			<p class="ac-switch-row__label">${i(a)}</p>
			${t?`<p class="ac-switch-row__hint">${i(t)}</p>`:""}
		</div>
		<button
			type="button"
			class="ac-switch"
			id="${i(e)}"
			role="switch"
			aria-checked="${n?"true":"false"}"
			${s?"disabled":""}
		></button>
	</div>`}function Ke({id:e,label:a,hint:t="",checked:n=!1}={}){return`<label class="ac-check">
		<input type="checkbox" id="${i(e)}" ${n?"checked":""} />
		<span>
			<span class="ac-check__label">${i(a)}</span>
			${t?`<span class="ac-check__hint">${i(t)}</span>`:""}
		</span>
	</label>`}function x(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}var Dt=[{value:"primaire",label:"Primaire (Primary)"},{value:"college",label:"Coll\xE8ge (Middle School)"},{value:"lycee",label:"Lyc\xE9e (High School)"},{value:"autre",label:"Autre (Other)"}],Ht=[{value:"free",label:"Free"},{value:"pro",label:"Pro"},{value:"enterprise",label:"Enterprise"}];function Bt({onCreated:e=null}={}){let a=I({title:"Add an organization",subtitle:'The organization is created as "pending": it is provisioned, but it cannot sign in until you activate it.',body:`<div class="ac-field-grid">
				${A({id:"ac-org-new-name",label:"Name",placeholder:"Lyc\xE9e Al Khawarizmi",full:!0})}
				${A({id:"ac-org-new-slug",label:"Slug",placeholder:"derived from the name",hint:"A unique identifier. Leave it blank to derive it from the name.",full:!0})}
				${U({id:"ac-org-new-type",label:"Type",options:Dt,value:"primaire"})}
				${U({id:"ac-org-new-plan",label:"Plan",options:Ht,value:"free"})}
				${A({id:"ac-org-new-year",label:"Academic year",placeholder:"2025-2026"})}
				${A({id:"ac-org-new-capacity",label:"Student capacity",type:"number",value:"100",hint:"Recorded for information; no entitlement is derived from it yet."})}
				${A({id:"ac-org-new-city",label:"City"})}
				${A({id:"ac-org-new-email",label:"Email",type:"email"})}
			</div>`,footer:`
			<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
			<button type="button" class="ac-btn ac-btn--primary" data-ac-confirm>Create the organization</button>
		`}),t=a.root;return t.querySelector("[data-ac-cancel]").addEventListener("click",a.close),t.querySelector("[data-ac-confirm]").addEventListener("click",async()=>{let n=r=>t.querySelector(`#${r}`)?.value?.trim()??"",s=n("ac-org-new-name");if(!s){v("The organization needs a name.","error");return}try{let r=await _.post("console/organizations",{name:s,slug:n("ac-org-new-slug")||void 0,school_type:n("ac-org-new-type"),plan:n("ac-org-new-plan"),school_year:n("ac-org-new-year")||void 0,max_students:Number(n("ac-org-new-capacity"))||100,city:n("ac-org-new-city")||void 0,email:n("ac-org-new-email")||void 0});a.close(),v("The organization was created. It is pending until you activate it.","success"),typeof e=="function"&&e(r?.data)}catch(r){v(r.message,"error")}}),a}function Ut(e,{onSaved:a=null}={}){let t=I({title:`Edit "${e.name}"`,subtitle:"The profile of the organization. The slug is its unique identifier and is not changed here.",wide:!0,body:`<div class="ac-field-grid">
				${A({id:"ac-org-edit-name",label:"Name",value:e.name,full:!0})}
				${U({id:"ac-org-edit-type",label:"Type",options:Dt,value:e.schoolType||e.school_type||"primaire"})}
				${U({id:"ac-org-edit-plan",label:"Plan",options:Ht,value:e.plan||"free"})}
				${A({id:"ac-org-edit-year",label:"Academic year",value:e.schoolYear||e.school_year||""})}
				${A({id:"ac-org-edit-capacity",label:"Student capacity",type:"number",value:String(e.maxStudents??e.max_students??100)})}
				${A({id:"ac-org-edit-city",label:"City",value:e.city||""})}
				${A({id:"ac-org-edit-phone",label:"Phone",value:e.phone||""})}
				${A({id:"ac-org-edit-email",label:"Email",value:e.email||""})}
				${A({id:"ac-org-edit-address",label:"Address",value:e.address||"",full:!0})}
			</div>`,footer:`
			<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
			<button type="button" class="ac-btn ac-btn--primary" data-ac-confirm>Save the profile</button>
		`}),n=t.root;return n.querySelector("[data-ac-cancel]").addEventListener("click",t.close),n.querySelector("[data-ac-confirm]").addEventListener("click",async()=>{let s=r=>n.querySelector(`#${r}`)?.value?.trim()??"";try{await _.patch(`console/organizations/${encodeURIComponent(e.id)}`,{profile:{name:s("ac-org-edit-name"),school_type:s("ac-org-edit-type"),plan:s("ac-org-edit-plan"),school_year:s("ac-org-edit-year")||null,max_students:Number(s("ac-org-edit-capacity"))||100,city:s("ac-org-edit-city")||null,phone:s("ac-org-edit-phone")||null,email:s("ac-org-edit-email")||null,address:s("ac-org-edit-address")||null}}),t.close(),v("The organization profile was saved.","success"),typeof a=="function"&&a()}catch(r){v(r.message,"error")}}),t}async function Ft(e,{onDeleted:a=null}={}){if(!await D({title:`Delete "${e.name}"?`,message:"The organization is removed together with every account, class, question, exam, result and generated document it owns. This cannot be undone. Suspending the organization instead keeps everything and ends the access.",detail:"Type DELETE on the confirmation to go ahead.",confirmLabel:"Delete the organization",danger:!0}))return!1;try{return await _.del(`console/organizations/${encodeURIComponent(e.id)}`,{confirm:"DELETE"}),v("The organization was deleted.","success"),typeof a=="function"&&a(),!0}catch(n){return v(n.message,"error"),!1}}async function Gt(e,{onChanged:a=null}={}){let t=e.status!=="suspended";if(!await D({title:t?`Suspend "${e.name}"?`:`Reactivate "${e.name}"?`,message:t?"Nobody in the organization can sign in until it is restored. Nothing is deleted, and the administrator of the organization can still reach the console to reactivate it.":"The organization can sign in again immediately.",confirmLabel:t?"Suspend the organization":"Reactivate the organization",danger:t}))return!1;try{return await _.patch(`console/organizations/${encodeURIComponent(e.id)}`,{status:t?"suspended":"active",reason:t?"Suspended from the console":"Reactivated from the console"}),v(t?"The organization was suspended.":"The organization was reactivated.","success"),typeof a=="function"&&a(),!0}catch(s){return v(s.message,"error"),!1}}var Ln=25,K={search:"",status:"",offset:0,sort:{key:"name",direction:"asc"}},Wt={id:"organizations",path:"/organizations",title:"Organizations",description:"Every organization on the platform, its accounts, its usage and the conditions that need attention.",permission:["platform.organizations.read","school.profile.read"],async render(e,a){e.innerHTML=`
			${G({fields:`${de({id:"ac-org-search",placeholder:"Search organizations\u2026",value:K.search})}
					${V({id:"ac-org-status",label:"Status",value:K.status,includeAll:!0,allLabel:"All statuses",options:[{value:"active",label:"Active"},{value:"pending",label:"Pending"},{value:"suspended",label:"Suspended"}]})}`,actions:`${a.isPlatform?'<button type="button" class="ac-btn ac-btn--primary" data-ac-org-new>Add an organization</button>':""}<button type="button" class="ac-btn" data-ac-refresh>Refresh</button>`})}
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
			<div class="ac-grid ac-grid--2" style="margin-top:16px" data-ac-org-charts></div>`;let t=e.querySelector("[data-ac-org-body]"),n=e.querySelector("[data-ac-org-kpis]"),s=e.querySelector("[data-ac-org-charts]"),r;try{r=await _.get("console/organizations",{search:K.search||void 0,status:K.status||void 0,limit:Ln,offset:K.offset})}catch(f){t.innerHTML=O({message:f.message});return}let d=r.data,o=d.length,c=d.filter(f=>f.status==="active").length,u=d.filter(f=>f.status==="pending").length,p=d.filter(f=>f.status==="suspended").length,l=d.reduce((f,b)=>f+(b.teachers||0),0),m=d.reduce((f,b)=>f+(b.students||0),0),g=d.filter(f=>f.alerts.some(b=>b.code==="inactive"||b.code==="no_activity")).length;if(n.innerHTML=[T({label:"Organizations shown",value:k(o),note:r.total>d.length?`of ${k(r.total)} matching`:"matching the filter",tooltip:"The number of organizations matching the current search and status filter."}),T({label:"Active",value:k(c),tone:"success",tooltip:'Organizations whose lifecycle status is "active".'}),T({label:"Pending / suspended",value:`${k(u)} / ${k(p)}`,tone:u+p>0?"warning":"",tooltip:"Organizations awaiting activation, and organizations whose access has been revoked."}),T({label:"Accounts",value:k(l+m),note:`${k(l)} teachers \xB7 ${k(m)} students`,tooltip:"Teacher and student accounts across the organizations shown."}),T({label:"Needing attention",value:k(g),tone:g>0?"warning":"",tooltip:"Organizations with no activity in the last 30 days, or with no recorded activity at all."})].join(""),t.innerHTML=q({columns:[{key:"name",label:"Organization",sortable:!0,render:f=>`<a href="#/organizations/${f.id}" class="ac-table__primary">${i(f.name)}</a><br><span class="ac-table__muted">${i(f.slug)}</span>`},{key:"status",label:"Status",sortable:!0,render:f=>`<span class="ac-badge ${f.status==="active"?"ac-badge--success":f.status==="pending"?"ac-badge--warning":"ac-badge--danger"}">${i(f.status)}</span>`},{key:"plan",label:"Plan",render:f=>i(f.plan||"\u2014")},{key:"teachers",label:"Teachers",align:"right",sortable:!0},{key:"students",label:"Students",align:"right",sortable:!0},{key:"activeTeachers",label:"Active teachers",align:"right",sortable:!0,render:f=>`${k(f.activeTeachers)} / ${k(f.teachers)}`},{key:"activeStudents",label:"Active students",align:"right",sortable:!0,render:f=>`${k(f.activeStudents)} / ${k(f.students)}`},{key:"attempts30d",label:"Attempts (30d)",align:"right",sortable:!0},{key:"lastActivity",label:"Last activity",sortable:!0,render:f=>f.lastActivity?`<span title="${i(N(f.lastActivity))}">${i(W(f.lastActivity))}</span>`:'<span class="ac-badge ac-badge--danger">none</span>'},{key:"alerts",label:"Alerts",render:f=>f.alerts.length?f.alerts.map(b=>`<span class="ac-badge ac-badge--${b.kind==="danger"?"danger":b.kind==="warning"?"warning":"info"}" title="${i(b.message)}">${i(b.code)}</span>`).join(" "):'<span class="ac-table__muted">\u2014</span>'},{key:"actions",label:"Actions",align:"right",render:f=>ne(It(f,{canManage:a.isPlatform}))}],rows:d,sort:K.sort,onSort:f=>{K.sort={key:f,direction:K.sort.key===f&&K.sort.direction==="asc"?"desc":"asc"},a.rerender()},empty:a.isPlatform?"No organization matches the current search and status filter.":"This session is scoped to a single organization.",rowHref:f=>`#/organizations/${f.id}`}),t.insertAdjacentHTML("beforeend",se({total:r.total,limit:r.limit,offset:r.offset,onPage:f=>{K.offset=f,a.rerender()}})),a.isPlatform&&d.length){let f=[...d].sort((b,y)=>(y.activeStudents||0)-(b.activeStudents||0)).slice(0,8);s.innerHTML=`
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles">
							<h3 class="ac-panel__title">Usage by organization</h3>
							<p class="ac-panel__subtitle">Active students over the last 30 days, highest first.</p>
						</div>
					</div>
					<div class="ac-panel__body">
						${te({rows:f.map(b=>({label:b.name,value:b.activeStudents||0})),value:"value",label:b=>b.label,display:b=>k(b),tone:"primary",ariaLabel:"Active students by organization"})}
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
						${te({rows:f.map(b=>({label:b.name,teachers:b.teachers||0,students:b.students||0})),value:"students",label:b=>b.label,display:b=>k(b),tone:"primary",ariaLabel:"Students by organization"})}
					</div>
				</section>`}else s.innerHTML="";let h=e.querySelector("#ac-org-search"),w=null;h.addEventListener("input",()=>{window.clearTimeout(w),w=window.setTimeout(()=>{K.search=h.value.trim(),K.offset=0,a.rerender()},320)}),e.querySelector("#ac-org-status").addEventListener("change",f=>{K.status=f.target.value,K.offset=0,a.rerender()}),e.querySelector("[data-ac-refresh]").addEventListener("click",()=>a.rerender()),_e(t,{open:f=>{window.location.hash=`#/organizations/${f}`},"toggle-status":async f=>{let b=d.find(y=>y.id===f);b&&await Gt(b,{onChanged:()=>a.rerender()})},edit:f=>{let b=d.find(y=>y.id===f);b&&Ut(b,{onSaved:()=>a.rerender()})},delete:async f=>{let b=d.find(y=>y.id===f);b&&await Ft(b,{onDeleted:()=>a.rerender()})}}),e.querySelector("[data-ac-org-new]")?.addEventListener("click",()=>{Bt({onCreated:()=>a.rerender()})})}};var Cn=[{value:"student",label:"Student"},{value:"teacher",label:"Teacher"},{value:"admin",label:"Administrator"},{value:"super_admin",label:"Platform administrator"}];function ha({ctx:e,role:a="student",onCreated:t=null}){let n=!!e?.isPlatform,s=String(a||"student").split(",")[0].trim()||"student",r=I({title:"Add an account",subtitle:"The account is created in your organization. The password is stored hashed and is never shown again.",body:`<div class="ac-field-grid">
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
						${Cn.map(o=>`<option value="${i(o.value)}"${o.value===s?" selected":""}>${i(o.label)}</option>`).join("")}
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
		`}),d=r.root;return d.querySelector("[data-ac-cancel]").addEventListener("click",r.close),d.querySelector("[data-ac-confirm]").addEventListener("click",async()=>{let o=f=>d.querySelector(`#${f}`)?.value?.trim()??"",c=o("ac-new-name"),u=o("ac-new-username"),p=o("ac-new-password");if(!c||!u){v("A name and a username are required.","error");return}if(p.length<8){v("The password must be at least 8 characters.","error");return}let l={name:c,username:u,password:p,role:o("ac-new-role")||"student"},m=o("ac-new-numero"),g=o("ac-new-email"),h=o("ac-new-phone");m&&(l.numero=m),g&&(l.email=g),h&&(l.phone=h);let w=o("ac-new-school");w&&(l.school_id=w);try{let f=await _.post("console/users",l);r.close(),v(`The account "${u}" was created.`,"success"),typeof t=="function"?t(f?.data):e?.rerender&&e.rerender()}catch(f){v(f.message,"error")}}),r}var Yt={id:"users",path:"/users",title:"Users & Access",description:"Accounts, roles and access \u2014 separated by the population each list serves.",permission:["platform.users.read","school.users.read"],async render(e,a){e.innerHTML=`<div class="ac-stack" data-ac-users-hub>${H(3)}</div>`;let t;try{t=await _.get("console/users?limit=200")}catch(p){e.querySelector("[data-ac-users-hub]").innerHTML=O({title:"The accounts could not be loaded",message:p.message});return}let n=Array.isArray(t?.data)?t.data:[],s=p=>n.filter(l=>l.role===p).length,r=p=>n.filter(l=>l.role===p&&l.status==="active").length,d=n.filter(p=>!p.lastLogin).length,o=n.filter(p=>p.status==="suspended").length,c=a.isPlatform,u=({href:p,icon:l,title:m,desc:g,count:h,activeCount:w})=>`
			<a class="ac-role-card" href="${i(p)}">
				<span class="ac-role-card__icon">${l}</span>
				<p class="ac-role-card__title">${i(m)}</p>
				<p class="ac-role-card__desc">${i(g)}</p>
				<p class="ac-role-card__count">${Ie(h)} <small>${w!=null?`\xB7 ${Ie(w)} active`:"account"}</small></p>
			</a>`;e.querySelector("[data-ac-users-hub]").innerHTML=`
			<div class="ac-grid ac-grid--kpi">
				${T({label:"Accounts in scope",value:Ie(n.length),note:"matching the current scope"})}
				${T({label:"Never signed in",value:Ie(d),note:"provisioned, unused",tone:d>0?"warning":"",tooltip:"Accounts with no recorded sign-in. They may be waiting for the person to use them."})}
				${T({label:"Suspended",value:Ie(o),note:"no access",tone:o>0?"warning":""})}
			</div>

			<div class="ac-section">
				<h2 class="ac-section__title">Manage accounts</h2>
				<p class="ac-section__hint">Each population has its own page, its own filters and its own actions.</p>
			</div>

			<div class="ac-quick-actions" style="margin-bottom:16px">
				<button type="button" class="ac-quick-action" data-ac-add-account>Add an account</button>
			</div>

			<div class="ac-role-cards">
				${u({href:"#/users/teachers",icon:'<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/></svg>',title:"Teachers",desc:"The teaching staff. Their classes, subjects and content.",count:s("teacher"),activeCount:r("teacher")})}
				${u({href:"#/users/students",icon:'<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>',title:"Students",desc:"The enrolled pupils, their class and their activity.",count:s("student"),activeCount:r("student")})}
				${u({href:"#/users/administrators",icon:'<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',title:c?"Directors & platform administrators":"Directors",desc:c?"The school directors, and the platform administrators who reach every organization.":"The people who administer this school.",count:s("admin")+s("super_admin"),activeCount:r("admin")+r("super_admin")})}
			</div>

			${d>0?`<div class="ac-alert ac-alert--warning" style="margin-top:16px">
						<div class="ac-alert__body">
							<p class="ac-alert__title">${Ie(d)} account(s) have never signed in</p>
							<p class="ac-alert__text">They may be waiting to be used, or they may have been provisioned in error. Open the relevant page to review them.</p>
						</div>
					</div>`:""}`,e.querySelector("[data-ac-add-account]")?.addEventListener("click",()=>{ha({ctx:a})})}};function Ie(e){let a=Number(e);return Number.isFinite(a)?a.toLocaleString():"0"}var Qt=25;async function De({host:e,ctx:a,role:t,title:n,subtitle:s,columns:r,emptyMessage:d,state:o,extraFilters:c=[]}){e.innerHTML=`
		${G({fields:`<div class="ac-field">
				<label class="ac-field__label" for="ac-user-search">Search</label>
				<input class="ac-input" id="ac-user-search" type="search" placeholder="Name, username, email\u2026" value="${i(o.search||"")}" autocomplete="off" />
			</div>
			<div class="ac-field">
				<label class="ac-field__label" for="ac-user-status">Status</label>
				<select class="ac-select" id="ac-user-status">
					<option value="">All statuses</option>
					<option value="active"${o.status==="active"?" selected":""}>Active</option>
					<option value="inactive"${o.status==="inactive"?" selected":""}>Inactive</option>
					<option value="suspended"${o.status==="suspended"?" selected":""}>Suspended</option>
				</select>
			</div>
			${c.map(g=>`<div class="ac-field">
					<label class="ac-field__label" for="${i(g.id)}">${i(g.label)}</label>
					<select class="ac-select" id="${i(g.id)}">
						${g.options.map(h=>`<option value="${i(h.value)}"${String(o[g.key]??"")===String(h.value)?" selected":""}>${i(h.label)}</option>`).join("")}
					</select>
				</div>`).join("")}`,actions:'<button type="button" class="ac-btn" data-ac-user-refresh>Refresh</button>'})}
		<section class="ac-panel">
			<div class="ac-panel__header">
				<div class="ac-panel__titles">
					<h3 class="ac-panel__title">${i(n)}</h3>
					<p class="ac-panel__subtitle">${i(s)}</p>
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
		</section>`;let u=e.querySelector("[data-ac-user-table]"),p=async()=>{u.innerHTML=H(5);let g;try{g=await _.get("console/users",{role:t,search:o.search||void 0,status:o.status||void 0,...o.schoolId?{school_id:o.schoolId}:{},limit:Qt,offset:o.offset||0})}catch(f){u.innerHTML=O({title:"The accounts could not be loaded",message:f.message});return}let h=g?.data||[],w=a.canAny(["platform.users.manage","school.users.manage"]);u.innerHTML=h.length===0?B({title:"No accounts",message:d}):q({columns:[...r,{key:"actions",label:"Actions",align:"right",render:f=>ne(Ot(f,{canManage:w}))}],rows:h,rowHref:f=>`#/users/${f.id}`}),_e(u,{open:f=>{window.location.hash=`#/users/${f}`},"toggle-status":async f=>{let b=h.find(C=>C.id===f);if(!b)return;let y=b.status==="active";if(await D({title:y?`Suspend "${b.username}"?`:`Reactivate "${b.username}"?`,message:y?"The account keeps everything it owns, but it can no longer sign in. The action is recorded in the audit trail.":"The account can sign in again immediately. The action is recorded in the audit trail.",confirmLabel:y?"Suspend the account":"Reactivate the account",danger:y}))try{await _.patch(`console/users/${encodeURIComponent(f)}`,{status:y?"suspended":"active",reason:y?"Suspended from the account roster":"Reactivated from the account roster"}),v(y?"The account was suspended.":"The account was reactivated.","success"),p()}catch(C){v(C.message,"error")}},delete:async f=>{let b=h.find($=>$.id===f);if(!(!b||!await D({title:`Delete "${b.username}"?`,message:"The account is removed, together with its sessions and its results. This cannot be undone \u2014 suspending the account keeps the record if you only need to end the access.",confirmLabel:"Delete the account",danger:!0})))try{await _.del(`console/users/${encodeURIComponent(f)}`),v("The account was deleted.","success"),p()}catch($){v($.message,"error")}}}),u.insertAdjacentHTML("beforeend",se({total:g?.total||0,limit:g?.limit||Qt,offset:g?.offset||0,onPage:f=>{o.offset=f,p()}}))},l=e.querySelector("#ac-user-search"),m=null;l.addEventListener("input",()=>{window.clearTimeout(m),m=window.setTimeout(()=>{o.search=l.value.trim(),o.offset=0,p()},320)}),e.querySelector("#ac-user-status").addEventListener("change",g=>{o.status=g.target.value,o.offset=0,p()});for(let g of c)e.querySelector(`#${g.id}`).addEventListener("change",h=>{o[g.key]=h.target.value,o.offset=0,p()});e.querySelector("[data-ac-user-refresh]").addEventListener("click",p),e.querySelector("[data-ac-user-add]")?.addEventListener("click",()=>{ha({ctx:a,role:t,onCreated:()=>{o.offset=0,p()}})}),await p()}var Da=e=>`<span class="ac-badge ac-badge--${e.status==="active"?"success":e.status==="suspended"?"danger":"warning"}">${i(e.status)}</span>`,Ha=e=>e.lastLogin?`<span title="${i(N(e.lastLogin))}">${i(W(e.lastLogin))}</span>`:'<span class="ac-badge ac-badge--warning">never</span>',Vt=[{key:"name",label:"Teacher",render:e=>`<span class="ac-table__primary">${i(e.name||e.username)}</span><br><span class="ac-table__muted">${i(e.username)}${e.email?` \xB7 ${i(e.email)}`:""}</span>`},{key:"status",label:"Status",render:Da},{key:"schoolName",label:"Organization",render:e=>i(e.schoolName||"\u2014")},{key:"lastLogin",label:"Last sign-in",render:Ha},{key:"createdAt",label:"Created",render:e=>i(N(e.createdAt,{withTime:!1}))}],Kt=[{key:"name",label:"Student",render:e=>`<span class="ac-table__primary">${i(e.name||e.username)}</span><br><span class="ac-table__muted">${i(e.username)}${e.numero?` \xB7 #${i(e.numero)}`:""}</span>`},{key:"status",label:"Status",render:Da},{key:"className",label:"Class",render:e=>i(e.className||"\u2014")},{key:"schoolName",label:"Organization",render:e=>i(e.schoolName||"\u2014")},{key:"lastLogin",label:"Last sign-in",render:Ha}],Jt=[{key:"name",label:"Administrator",render:e=>`<span class="ac-table__primary">${i(e.name||e.username)}</span><br><span class="ac-table__muted">${i(e.username)}</span>`},{key:"role",label:"Level",render:e=>`<span class="ac-badge ${e.role==="super_admin"?"ac-badge--violet":"ac-badge--brand"}">${i(e.role==="super_admin"?"Platform":"Organization")}</span>`},{key:"status",label:"Status",render:Da},{key:"schoolName",label:"Organization",render:e=>i(e.schoolName||"\u2014")},{key:"lastLogin",label:"Last sign-in",render:Ha}];var En={search:"",status:"",offset:0},Zt={id:"users-teachers",path:"/users/teachers",title:"Teachers",description:"The teaching staff, their activity and their access.",permission:["platform.users.read","school.users.read"],async render(e,a){await De({host:e,ctx:a,role:"teacher",title:"Teachers",subtitle:"Every teacher account in scope. Open an account to change its status, role or permissions.",columns:Vt,emptyMessage:"No teacher account matches the current filters.",state:En})}};var jn={search:"",status:"",offset:0},Xt={id:"users-students",path:"/users/students",title:"Students",description:"The enrolled pupils, their class and their activity.",permission:["platform.users.read","school.users.read"],async render(e,a){await De({host:e,ctx:a,role:"student",title:"Students",subtitle:"Every student account in scope. Open an account to change its status, role or permissions.",columns:Kt,emptyMessage:"No student account matches the current filters.",state:jn})}};var zn={search:"",status:"",offset:0},es={id:"users-administrators",path:"/users/administrators",title:"Directors & administrators",description:"The accounts that can administer \u2014 the school director, and on a SaaS deployment the platform administrators.",permission:["platform.users.read","school.users.read"],async render(e,a){await De({host:e,ctx:a,role:"admin,super_admin",title:a.isPlatform?"Directors & platform administrators":"Directors",subtitle:a.isPlatform?"A platform administrator reaches every organization; an organization administrator reaches only their own.":"The accounts that administer this school.",columns:Jt,emptyMessage:"No administrator account matches the current filters.",state:zn})}};var as={id:"analytics",path:"/analytics",title:"Platform Analytics",description:"Adoption, engagement and usage of the platform \u2014 aggregated across organizations, never per class.",permission:["platform.analytics.read","school.analytics.read"],async render(e,a){let t=a.getState();e.innerHTML=`<div class="ac-stack" data-ac-analytics>
			${pa({value:t.period})}
			<div data-ac-kpis class="ac-grid ac-grid--kpi">${H(1)}</div>
			<div data-ac-sections class="ac-stack"></div>
		</div>`;let n={period:t.period==="year"?"year":t.period};t.period==="custom"&&t.customRange&&(n.from=t.customRange.from,n.to=t.customRange.to);let s,r,d;try{[s,r,d]=await Promise.all([_.get("console/overview",n),_.get("console/trends",n),_.get("console/organizations",{limit:100,offset:0})])}catch(w){e.querySelector("[data-ac-sections]").innerHTML=O({message:w.message});return}let o=s.data,c=o.sections.glance,u=o.sections.activity,p=o.sections.content,l=o.meta.definitions;e.querySelector("[data-ac-kpis]").innerHTML=[T({label:"Organizations",value:k(c.organizations.total),note:`${c.organizations.active} active`,tooltip:"Organizations in the current scope."}),T({label:"Teacher adoption",value:c.users.teachers>0?`${Math.round(c.users.activeTeachers/c.users.teachers*100)}%`:"\u2014",note:`${k(c.users.activeTeachers)} of ${k(c.users.teachers)} teachers active`,tone:"success",tooltip:l.activeTeacher}),T({label:"Student participation",value:c.users.students>0?`${Math.round(u.participatingStudents/c.users.students*100)}%`:"\u2014",note:`${k(u.participatingStudents)} of ${k(c.users.students)} students took part`,tone:"primary",tooltip:"Students with at least one completed attempt in the period, over the number of enrolled students. Attempts and unique students are reported separately and never conflated."}),T({label:"Attempts per student",value:u.participatingStudents>0?(u.attempts/u.participatingStudents).toFixed(1):"\u2014",note:`${k(u.attempts)} attempts`,tooltip:"Total completed attempts divided by the number of unique students who made at least one. A value above 1 means students attempted more than once on average."}),T({label:"Average score",value:u.averageScore20==null?"\u2014":u.averageScore20.toFixed(2),note:`/20 per formal attempt \xB7 ${k(u.averageScoreSample)} attempts`,tone:"primary",tooltip:l.averageScore}),T({label:"Content authored",value:k(p.questions+p.exams+p.courses),note:`${k(p.questions)} questions \xB7 ${k(p.exams)} exams \xB7 ${k(p.courses)} courses`,tooltip:"Content created in the selected period. The question and course totals are all-time row counts; the exam and course counts respect the period."})].join("");let m=r?.data?.series,g=m?m.labels.map((w,f)=>({label:w,formalAttempts:m.formalAttempts[f]||0,trainingAttempts:m.trainingAttempts[f]||0,gameAttempts:m.gameAttempts[f]||0,newTeachers:m.newTeachers[f]||0,newStudents:m.newStudents[f]||0})):[],h=(d?.data||[]).slice(0,10);e.querySelector("[data-ac-sections]").innerHTML=`
			<div class="ac-section">
				<h2 class="ac-section__title">Educational activity</h2>
				<p class="ac-section__hint">Completed attempts by mode, over ${i(r?.data?.meta?.periodLabel||"the selected period")}.</p>
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
						${g.length?`${ce([{label:"Formal exams",tone:"primary"},{label:"Training",tone:"info"},{label:"Games",tone:"violet"}])}${ge({points:g,series:[{key:"formalAttempts",label:"Formal exams",tone:"primary"},{key:"trainingAttempts",label:"Training",tone:"info"},{key:"gameAttempts",label:"Games",tone:"violet"}],labelKey:"label",ariaLabel:"Attempts by mode over time"})}`:B({title:"No attempts recorded",message:"No completed attempts fall inside the selected period."})}
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
						${g.length?`${ce([{label:"Teachers",tone:"success"},{label:"Students",tone:"warning"}])}${ge({points:g,series:[{key:"newTeachers",label:"Teachers",tone:"success"},{key:"newStudents",label:"Students",tone:"warning"}],labelKey:"label",ariaLabel:"New accounts over time"})}`:B({title:"No accounts created",message:"No accounts were created inside the selected period."})}
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
						${h.length?te({rows:h.map(w=>({label:w.name,value:w.activeStudents||0})),value:"value",label:w=>w.label,display:w=>k(w),ariaLabel:"Active students by organization"}):B({title:"No organizations to compare",message:"The current scope contains no organization with recorded usage."})}
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
						${h.length?Ct({rows:h.map(w=>({label:w.name,teachers:w.teachers||0,students:w.students||0})),series:[{key:"teachers",label:"Teachers",tone:"success"},{key:"students",label:"Students",tone:"primary"}],label:w=>w.label,ariaLabel:"Teachers and students by organization"}):B({title:"No organizations to compare",message:"The current scope contains no organization with recorded accounts."})}
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
								<p class="ac-defs__desc">${k(p.questions)}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Classes</p>
								<p class="ac-defs__desc">${k(p.classes)}</p>
							</div>
						</div>
						<p class="ac-empty__message" style="margin:12px 0 0;font-size:12px">${i(p.note)}</p>
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
								<p class="ac-defs__desc">${k(p.exams)}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Published exams</p>
								<p class="ac-defs__desc">${k(p.activeExams)}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Conducted in period</p>
								<p class="ac-defs__desc">${k(u.examsConducted)}</p>
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
								<p class="ac-defs__desc">${k(p.courses)}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Games created</p>
								<p class="ac-defs__desc">${k(p.games)}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Kids games created</p>
								<p class="ac-defs__desc">${k(p.kidsGames)}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Game sessions played</p>
								<p class="ac-defs__desc">${k(u.gameSessions+u.kidsGameSessions)}</p>
							</div>
						</div>
					</div>
				</section>
			</div>`,Oe(e,"period",w=>{if(w==="custom"){let f=prompt("From (YYYY-MM-DD)",new Date(Date.now()-2592e6).toISOString().slice(0,10));if(!f)return;let b=prompt("To (YYYY-MM-DD)",new Date().toISOString().slice(0,10));if(!b)return;a.setPeriod("custom",{from:f,to:b});return}a.setPeriod(w)})}};var ts={id:"teaching",path:"/teaching",title:"Teaching & Learning",description:"Teacher activity, class performance and student outcomes across every organization in scope.",permission:["platform.analytics.read","school.analytics.read"],async render(e,a){let t=a.getState(),n=t.targetSchoolId||"";e.innerHTML=`<div class="ac-stack">${H(4)}</div>`;let s={period:t.period};t.period==="custom"&&t.customRange&&(s.from=t.customRange.from,s.to=t.customRange.to),n&&(s.school_id=n);let r;try{r=(await _.get("console/teaching",s)).data}catch(S){if((S.status===403||S.status===404)&&n){ja(null),a.rerender();return}e.innerHTML=O({message:S.message}),e.querySelector("[data-ac-retry]")?.addEventListener("click",()=>a.rerender());return}let d=r.sections,o=r.meta,c=Array.isArray(o.scope.organizations)?o.scope.organizations:[],u=new Map(c.map(S=>[S.id,S.name])),p=c.length>1,l=c.length>1?V({id:"ac-teaching-org",label:"Organization",options:c.map(S=>({value:S.id,label:S.name})),value:n,includeAll:!0,allLabel:"All organizations"}):"";e.innerHTML=`<div class="ac-stack">
			${G({chips:Oa({options:Ra,value:t.period,name:"period"}),fields:l,actions:'<button type="button" class="ac-btn" data-ac-refresh>Refresh</button>'})}
			<div data-ac-kpis class="ac-grid ac-grid--kpi"></div>
			<div data-ac-sections class="ac-stack"></div>
		</div>`,e.querySelector("#ac-teaching-org")?.addEventListener("change",S=>{ja(S.target.value||null),a.rerender()}),e.querySelector("[data-ac-refresh]")?.addEventListener("click",()=>a.rerender());let m=d.glance,g=d.achievement,h=d.content,w=m.participationRate,f=g.avgExamScore,b=g.passRate;e.querySelector("[data-ac-kpis]").innerHTML=[T({label:"Students",value:k(m.totalStudents.value),note:"enrolled now",tooltip:"Student accounts in the current scope. A current-state total: it is not narrowed by the reporting period."}),T({label:"Teachers",value:k(m.totalTeachers.value),note:"accounts in scope",tooltip:"Teacher accounts in the current scope (current-state)."}),T({label:"Classes",value:k(m.totalClasses.value),note:"classes in scope",tooltip:"Classes in the current scope (current-state)."}),T({label:"Participation",value:w.value==null?"\u2014":`${w.value}%`,note:`${k(w.numerator)} of ${k(w.denominator)} students active`,tone:w.value==null?"":"primary",tooltip:"Unique students with at least one completed attempt (exam, training, game or tournament) in the period, over the enrolled population."}),T({label:"Active students",value:k(m.activeStudents.value),note:"took part in the period",tooltip:"Distinct students with at least one qualifying attempt in the reporting window."}),T({label:"Average score",value:f.value==null?"\u2014":f.value.toFixed(2),note:f.sample>0?`/20 over ${k(f.sample)} attempts`:"no formal attempts",tone:f.value==null?"":"primary",tooltip:"Mean final score of formal exam attempts in the period, rescaled from the stored 0\u2013100 to the familiar /20. Training, games and tournaments are excluded."}),T({label:"Pass rate",value:b.value==null?"\u2014":`${b.value}%`,note:`${k(b.passed)} of ${k(b.total)} attempts passed`,tone:b.value==null?"":b.value>=50?"success":"warning",tooltip:"Formal exam attempts that passed over all formal attempts. Passing uses the exam-configured threshold (default 10/20)."}),T({label:"Assessments conducted",value:k(g.examsConducted.value),note:"distinct exams sat",tooltip:"Distinct formal exams with at least one finalized result in the period."})].join("");let y=[...d.teacherInsights.teacherActivity||[]].sort((S,Pe)=>Pe.assessmentActivity-S.assessmentActivity||Pe.questionsCreated-S.questionsCreated||S.name.localeCompare(Pe.name)),$=[{key:"name",label:"Teacher",render:S=>`<span class="ac-table__primary">${i(S.name)}</span>${S.status&&S.status!=="active"?` <span class="ac-table__muted">(${i(S.status)})</span>`:""}`},...p?[{key:"schoolName",label:"Organization",render:S=>`<span class="ac-table__muted">${i(S.schoolName||u.get(S.schoolId)||"\u2014")}</span>`}]:[],{key:"questionsCreated",label:"Questions",align:"right",render:S=>k(S.questionsCreated)},{key:"examsCreated",label:"Exams",align:"right",render:S=>k(S.examsCreated)},{key:"classesManaged",label:"Classes",align:"right",render:S=>S.classesManaged?`<span title="${i(S.classNames.join(", "))}">${k(S.classesManaged)}</span>`:"0"},{key:"assessmentActivity",label:"Assessments",align:"right",render:S=>k(S.assessmentActivity)},{key:"avgScore20",label:"Avg /20",align:"right",render:S=>S.avgScore20==null?"\u2014":S.avgScore20.toFixed(2)},{key:"passRate",label:"Pass rate",align:"right",render:S=>S.passRate==null?"\u2014":`${S.passRate}%`}],C=(g.classComparison||[]).filter(S=>S.avgScore20!=null),j=S=>p?`${S.className} \xB7 ${u.get(S.schoolId)||"Organization"}`:S.className,R=C.length?`${ce([{label:"Class mean /20",tone:"primary"}])}${te({rows:C.map(S=>({...S,chartLabel:j(S)})),value:"avgScore20",max:20,threshold:10,label:S=>`${S.chartLabel} (n=${S.sample})`,display:S=>`${Number(S).toFixed(1)}/20`,ariaLabel:"Average formal exam score by class"})}`:B({title:"No formal results yet",message:"No class has a finalized formal exam result in the selected period."}),E=d.teacherInsights.classesNeedingAttention||[],F=E.length?`<div class="ac-defs">${E.map(S=>`<div class="ac-defs__item">
							<p class="ac-defs__term">${i(S.className)}${p?` <span class="ac-table__muted">\xB7 ${i(S.schoolName||u.get(S.schoolId)||"")}</span>`:""}</p>
							<p class="ac-defs__desc">${i(S.reasons.join(" \xB7 "))} \xB7 mean ${S.avgScore20==null?"\u2014":S.avgScore20}/20 over ${k(S.sample)} attempts</p>
						</div>`).join("")}</div>`:B({title:"No class is below the attention thresholds",message:"Attention is raised when a class has enough results to trust and either a mean below 8/20 or a pass rate below 40%."}),oe=g.scoreDistribution||[],ke=f.sample>0?`${Et({buckets:oe.map(S=>({label:S.label,count:S.count})),ariaLabel:"Formal exam score distribution"})}
					<div class="ac-defs" style="margin-top:10px">${oe.map(S=>`<div class="ac-defs__item">
								<p class="ac-defs__term">${i(S.label)}</p>
								<p class="ac-defs__desc">${k(S.count)} attempts${S.pct==null?"":` \xB7 ${S.pct}%`}</p>
							</div>`).join("")}</div>`:B({title:"No formal attempts to distribute",message:"Score bands need at least one finalized formal exam attempt in the period."}),$e=g.certifiedStudents.value||0,ze=g.pendingSuccess.value||0,Aa=$e+ze>0?`${jt({segments:[{label:"Passed at least one exam",value:$e,tone:"success"},{label:"Still pending success",value:ze,tone:"warning"}],centerValue:String($e+ze),centerLabel:"students assessed",ariaLabel:"Certified and pending students"})}
					${ce([{label:`Certified (${$e})`,tone:"success"},{label:`Pending (${ze})`,tone:"warning"}])}`:B({title:"No student sat a formal exam",message:"Certification compares students who passed an exam with those who sat one but did not."}),Ge=d.engagement.activityTrend||{points:[]},ct=(Ge.points||[]).map(S=>({label:S.period,exam:S.exam||0,training:S.training||0,game:S.game||0,tournament:S.tournament||0})),pn=ct.length?`${ce([{label:"Formal exams",tone:"primary"},{label:"Training",tone:"info"},{label:"Games",tone:"violet"},{label:"Tournaments",tone:"warning"}])}${ge({points:ct,series:[{key:"exam",label:"Formal exams",tone:"primary"},{key:"training",label:"Training",tone:"info"},{key:"game",label:"Games",tone:"violet"},{key:"tournament",label:"Tournaments",tone:"warning"}],labelKey:"label",ariaLabel:"Learning activity by mode over time"})}`:B({title:"No activity in the period",message:"No completed attempt falls inside the selected reporting window."}),na=d.engagement,lt=h.contentCoverage||{},dt=Object.values(o.unavailable||{}),un=`<div class="ac-defs">
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
				<p class="ac-defs__desc">A class needs at least ${k(g.minSampleForRank)} finalized attempts before it is ranked or flagged; smaller samples are still shown, never ranked confidently.</p>
			</div>
			${dt.length?`<div class="ac-defs__item">
							<p class="ac-defs__term">Not measurable</p>
							<p class="ac-defs__desc">${dt.map(S=>i(S)).join(" ")}</p>
						</div>`:""}
		</div>`;e.querySelector("[data-ac-sections]").innerHTML=`
			<div class="ac-section">
				<h2 class="ac-section__title">Teachers & classrooms</h2>
				<p class="ac-section__hint">Who teaches, what they author, and how their classes perform in ${i(o.scope.periodLabel||"the selected period")}${p?` \xB7 ${i(n?u.get(n)||"the selected organization":"all organizations")}`:""}.</p>
			</div>
			<section class="ac-panel">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title">Teacher activity</h3>
						<p class="ac-panel__subtitle">Active teachers first. \u201CAssessments\u201D counts formal results for exams the teacher created.</p>
					</div>
				</div>
				<div class="ac-panel__body ac-panel__body--flush">
					${q({columns:$,rows:y,empty:"No teacher account exists in the current scope."})}
				</div>
			</section>

			${le({title:"Class performance",subtitle:"Mean formal score per class. The dashed line is the 10/20 pass mark; n is the number of attempts.",body:R})}

			<div class="ac-grid ac-grid--2">
				${le({title:"Classes needing attention",subtitle:`Classes with at least ${k(g.minSampleForRank)} attempts and a low mean or low pass rate.`,body:F})}
				${le({title:"Score distribution",subtitle:"Formal exam attempts per score band, /20.",body:ke})}
			</div>

			<div class="ac-grid ac-grid--2">
				${le({title:"Certification",subtitle:"Students who passed at least one formal exam vs. those who sat one and have not.",body:Aa})}
				${le({title:"Learning activity",subtitle:`Completed attempts by mode, ${Ge.granularity==="week"?"weekly":"daily"} over the period.`,body:pn})}
			</div>

			<div class="ac-section">
				<h2 class="ac-section__title">Content & participation</h2>
				<p class="ac-section__hint">The material behind the activity, and the live game surface.</p>
			</div>
			<div class="ac-grid ac-grid--3">
				${le({title:"Question bank",subtitle:"Authored content in the current scope.",body:`<div class="ac-defs">
						<div class="ac-defs__item">
							<p class="ac-defs__term">Questions</p>
							<p class="ac-defs__desc">${k(h.totalQuestions.value)}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Active exams</p>
							<p class="ac-defs__desc">${k(h.activeExams.value)}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Categories used</p>
							<p class="ac-defs__desc">${k(lt.categoriesWithQuestions)} of ${k(lt.totalCategories)}</p>
						</div>
					</div>`})}
				${le({title:"Participation",subtitle:"Students, not attempt counts.",body:`<div class="ac-defs">
						<div class="ac-defs__item">
							<p class="ac-defs__term">Active students</p>
							<p class="ac-defs__desc">${k(m.activeStudents.value)}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Participation rate</p>
							<p class="ac-defs__desc">${w.value==null?"\u2014":`${w.value}%`}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Needing attention</p>
							<p class="ac-defs__desc">${k(m.studentsNeedingAttention.value)}</p>
						</div>
						<p class="ac-empty__message" style="margin:8px 0 0;font-size:12px">${i(m.studentsNeedingAttention.rule)}</p>
					</div>`})}
				${le({title:"Games & tournaments",subtitle:"Live snapshots \u2014 never date-filtered.",body:`<div class="ac-defs">
						<div class="ac-defs__item">
							<p class="ac-defs__term">Game lobbies waiting</p>
							<p class="ac-defs__desc">${k(na.gameLobbies.value)}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Live games</p>
							<p class="ac-defs__desc">${k(na.liveGames.value)}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Tournaments</p>
							<p class="ac-defs__desc">${k(na.activeTournaments.value)} active of ${k(na.totalTournaments.value)}</p>
						</div>
					</div>`})}
			</div>

			${le({title:"How these numbers are computed",subtitle:"The console never guesses. Every metric names its population and its window.",body:un})}`,Oe(e,"period",S=>{if(S==="custom"){let Pe=prompt("From (YYYY-MM-DD)",new Date(Date.now()-2592e6).toISOString().slice(0,10));if(!Pe)return;let pt=prompt("To (YYYY-MM-DD)",new Date().toISOString().slice(0,10));if(!pt)return;a.setPeriod("custom",{from:Pe,to:pt});return}a.setPeriod(S)})}};var Pn=25,M={stream:"actions",search:"",action:"",entityType:"",eventType:"",outcome:"",severity:"",offset:0},ss={id:"audit",path:"/audit",title:"Activity & Audit",description:"Every administrative action and every authentication event, searchable and traceable.",permission:["platform.audit.read","school.audit.read"],async render(e,a){e.innerHTML=`
			${G({chips:`<div class="ac-chip-group" role="group" aria-label="Trail">
					<button type="button" class="ac-chip is-active" data-ac-stream="actions">Administrative actions</button>
					<button type="button" class="ac-chip" data-ac-stream="security">Security events</button>
				</div>`,fields:de({id:"ac-audit-search",placeholder:"Search the trail\u2026",value:M.search}),filters:"<span data-ac-audit-filters></span>",actions:'<button type="button" class="ac-btn" data-ac-refresh>Refresh</button>'})}
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
			<div class="ac-grid ac-grid--2" style="margin-top:16px" data-ac-audit-charts></div>`;let t=e.querySelector("[data-ac-audit-body]"),n=e.querySelector("[data-ac-audit-kpis]"),s=e.querySelector("[data-ac-audit-charts]"),r=e.querySelector("[data-ac-audit-filters]"),d;try{d=await _.get("console/audit/summary")}catch{d={summary:{},facets:{}}}let o=d.facets||{},c=d.summary||{};r.innerHTML=M.stream==="actions"?`${V({id:"ac-audit-action",label:"Action",value:M.action,includeAll:!0,allLabel:"All actions",options:(o.actions||[]).map(h=>({value:h.value,label:`${h.label} (${h.count})`}))})}
					${V({id:"ac-audit-entity",label:"Entity",value:M.entityType,includeAll:!0,allLabel:"All entities",options:(o.entityTypes||[]).map(h=>({value:h.value,label:`${h.label} (${h.count})`}))})}`:`${V({id:"ac-audit-event",label:"Event",value:M.eventType,includeAll:!0,allLabel:"All events",options:(o.securityEventTypes||[]).map(h=>({value:h.value,label:h.label}))})}`,Nn(e,a);let u=c.security||{};n.innerHTML=[T({label:"Failed sign-ins",value:k(u.login_failure||0),tone:(u.login_failure||0)>0?"warning":"",tooltip:"Recorded failed authentication attempts. A concentration on one address or one username is the signal to investigate."}),T({label:"Successful sign-ins",value:k(u.login_success||0),tooltip:"Recorded successful authentication events."}),T({label:"Sessions revoked",value:k(u.session_revoked||0),tone:(u.session_revoked||0)>0?"warning":"",tooltip:"Sessions an administrator forcibly ended."}),T({label:"Denied actions",value:k(c.deniedActions||0),tone:(c.deniedActions||0)>0?"danger":"",tooltip:"Administrative actions that were refused. The refusal is itself recorded."}),T({label:"Password changes",value:k((u.password_change||0)+(u.password_reset||0)),tooltip:"Password changes and recovery-code resets recorded in the security trail."})].join("");let p;try{p=await _.get("console/audit",{stream:M.stream,search:M.search||void 0,action:M.stream==="actions"&&M.action||void 0,entityType:M.stream==="actions"&&M.entityType||void 0,eventType:M.stream==="security"&&M.eventType||void 0,limit:Pn,offset:M.offset})}catch(h){t.innerHTML=O({message:h.message});return}e.querySelector("[data-ac-audit-title]").textContent=M.stream==="actions"?"Administrative actions":"Security events",e.querySelector("[data-ac-audit-subtitle]").textContent=M.stream==="actions"?"Every administrative change, with the outcome it produced.":"Every authentication and access-control event, with the source address.",t.innerHTML=M.stream==="actions"?q({columns:[{key:"occurredAt",label:"When",render:h=>`<span title="${i(N(h.occurredAt))}">${i(N(h.occurredAt))}</span>`},{key:"actorName",label:"Actor",render:h=>h.actorName?`<span class="ac-table__primary">${i(h.actorName)}</span><br><span class="ac-table__muted">${i(h.actorRole||"")}</span>`:'<span class="ac-table__muted">system</span>'},{key:"action",label:"Action",render:h=>`<span class="ac-badge">${i(h.actionLabel)}</span>`},{key:"entityType",label:"Entity",render:h=>`${i(h.entityTypeLabel)}<br><span class="ac-table__muted">${i(h.entityId)}</span>`},{key:"outcome",label:"Outcome",render:h=>`<span class="ac-badge ac-badge--${h.outcome==="success"?"success":h.outcome==="denied"?"danger":"warning"}">${i(h.outcome)}</span>`},{key:"severity",label:"Severity",render:h=>`<span class="ac-badge ac-badge--${h.severity==="critical"?"danger":h.severity==="warning"?"warning":""}">${i(h.severity)}</span>`},{key:"schoolName",label:"Organization",render:h=>i(h.schoolName||"\u2014")}],rows:p.data,empty:"No administrative action matches the current filters.",rowClass:h=>h.outcome==="denied"?"ac-row--denied":""}):q({columns:[{key:"occurredAt",label:"When",render:h=>`<span title="${i(N(h.occurredAt))}">${i(N(h.occurredAt))}</span>`},{key:"typeLabel",label:"Event",render:h=>`<span class="ac-badge">${i(h.typeLabel)}</span>`},{key:"username",label:"Account",render:h=>h.userName?`<span class="ac-table__primary">${i(h.userName)}</span><br><span class="ac-table__muted">${i(h.username||"")}</span>`:i(h.username||"\u2014")},{key:"reason",label:"Reason",render:h=>i(h.reason||"\u2014")},{key:"outcome",label:"Outcome",render:h=>`<span class="ac-badge ac-badge--${h.outcome==="success"?"success":h.outcome==="denied"?"danger":"warning"}">${i(h.outcome)}</span>`},{key:"severity",label:"Severity",render:h=>`<span class="ac-badge ac-badge--${h.severity==="critical"?"danger":h.severity==="warning"?"warning":""}">${i(h.severity)}</span>`},{key:"ip",label:"Source",render:h=>i(h.ip||"\u2014")}],rows:p.data,empty:"No security event matches the current filters."}),t.insertAdjacentHTML("beforeend",se({total:p.total,limit:p.limit,offset:p.offset,onPage:h=>{M.offset=h,a.rerender()}}));let l=c.topFailureSources||{};l.byIp?.length||l.byUsername?.length?s.innerHTML=`
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles">
							<h3 class="ac-panel__title">Failed sign-in sources</h3>
							<p class="ac-panel__subtitle">Top source addresses by attempt count. A concentration may indicate credential stuffing.</p>
						</div>
					</div>
					<div class="ac-panel__body">
						${te({rows:(l.byIp||[]).map(h=>({label:h.ip,value:h.count})),value:"value",label:h=>h.label,display:h=>k(h),tone:"danger",ariaLabel:"Failed sign-ins by source address"})}
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
						${te({rows:(l.byUsername||[]).map(h=>({label:h.username,value:h.count})),value:"value",label:h=>h.label,display:h=>k(h),tone:"warning",ariaLabel:"Failed sign-ins by attempted username"})}
					</div>
				</section>`:s.innerHTML="",e.querySelectorAll("[data-ac-stream]").forEach(h=>{h.addEventListener("click",()=>{M.stream=h.dataset.acStream,M.offset=0,a.rerender()})});let m=e.querySelector("#ac-audit-search"),g=null;m.addEventListener("input",()=>{window.clearTimeout(g),g=window.setTimeout(()=>{M.search=m.value.trim(),M.offset=0,a.rerender()},320)}),e.querySelector("[data-ac-refresh]").addEventListener("click",()=>a.rerender())}};function Nn(e,a){let t=e.querySelector("#ac-audit-action");t&&t.addEventListener("change",r=>{M.action=r.target.value,M.offset=0,a.rerender()});let n=e.querySelector("#ac-audit-entity");n&&n.addEventListener("change",r=>{M.entityType=r.target.value,M.offset=0,a.rerender()});let s=e.querySelector("#ac-audit-event");s&&s.addEventListener("change",r=>{M.eventType=r.target.value,M.offset=0,a.rerender()})}var Mn=[{key:"15",label:"15 min"},{key:"60",label:"1 hour"},{key:"360",label:"6 hours"},{key:"1440",label:"24 hours"}],Ba={minutes:"60"},ns={id:"health",path:"/health",title:"System Health & Operations",description:"Service availability, error trends, latency, database and storage \u2014 measured, not asserted.",permission:["platform.health.read","school.health.read"],async render(e,a){e.innerHTML=`
			${G({chips:`<div class="ac-chip-group" role="group" aria-label="Window">
					${Mn.map(l=>`<button type="button" class="ac-chip${Ba.minutes===l.key?" is-active":""}" data-ac-window="${l.key}">${i(l.label)}</button>`).join("")}
				</div>`,actions:'<button type="button" class="ac-btn" data-ac-refresh>Refresh</button>'})}
			<div data-ac-health><div class="ac-skeleton-stack" aria-busy="true">
				<div class="ac-skeleton" style="width:45%"></div>
				<div class="ac-skeleton" style="width:100%"></div>
			</div></div>`;let t;try{t=await _.get("console/health",{minutes:Ba.minutes})}catch(l){e.querySelector("[data-ac-health]").innerHTML=O({message:l.message});return}let n=t.data,s=n.sections.api,r=n.sections.latency,d=n.sections.database,o=n.sections.realtime,c=n.sections.storage,u=n.sections.scheduled,p=s.availabilityPercent==null?"":s.availabilityPercent>=99?"success":s.availabilityPercent>=95?"warning":"danger";e.querySelector("[data-ac-health]").innerHTML=`
			<div class="ac-grid ac-grid--kpi">
				${T({label:"API availability",value:s.availabilityPercent==null?"\u2014":`${s.availabilityPercent.toFixed(1)}%`,note:`${k(s.totalCalls)} requests in the window`,tone:p,tooltip:n.meta.notes.availability})}
				${T({label:"Server error rate",value:s.serverErrorRatePercent==null?"\u2014":`${s.serverErrorRatePercent.toFixed(1)}%`,note:`${k(s.serverErrors??0)} server errors`,tone:s.serverErrorRatePercent==null?"":s.serverErrorRatePercent>=1?"danger":s.serverErrorRatePercent>0?"warning":"success",tooltip:"Share of API requests in the window that failed with a 5xx status. This is the measure of service health: a 4xx is a client mistake, not an outage."})}
				${T({label:"Error rate (all)",value:s.errorRatePercent==null?"\u2014":`${s.errorRatePercent.toFixed(1)}%`,note:`${k(s.errors)} failed requests`,tone:s.errorRatePercent==null?"":s.errorRatePercent>=20?"warning":"",tooltip:"Share of API requests in the window that returned a 4xx or 5xx status. A high value here with a low server error rate usually means rejected or expired requests, not an outage."})}
				${T({label:"p95 latency",value:r.available&&r.p95!=null?`${r.p95} ms`:"\u2014",note:r.available&&r.p50!=null?`p50 ${r.p50} ms \xB7 p99 ${r.p99} ms`:"no requests in the window",tone:r.available&&r.p95!=null&&r.p95>1e3?"warning":"",tooltip:n.meta.notes.latency})}
				${T({label:"Database",value:d.available?"Reachable":"Unreachable",note:d.available?`${d.roundTripMs} ms round trip`:d.error||"",tone:d.available?"success":"danger",tooltip:"A live COUNT query against the configured database, plus the row counts of the principal tables."})}
				${T({label:"Uptime",value:W(new Date(n.meta.process.startedAt)),note:`process started ${N(n.meta.process.startedAt)}`,tooltip:"Process uptime. The request log resets with the process, so availability cannot be measured across a restart."})}
				${T({label:"Storage used",value:c.available?`${c.megabytes} MB`:"\u2014",note:c.available?`${k(c.files)} files in uploads`:c.error||"",tooltip:n.meta.notes.storage})}
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
						${r.available&&r.statuses?.length?te({rows:r.statuses.map(l=>({label:l.bucket,value:l.count})),value:"value",label:l=>l.label,display:l=>k(l),tone:l=>l.label==="5xx"?"danger":l.label==="4xx"?"warning":"success",ariaLabel:"Response status distribution"}):B({title:"No requests recorded",message:"The request log is empty for this window. It is process-local and starts empty after a restart."})}
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
								<p class="ac-defs__desc">${c.available?`${c.megabytes} MB`:"\u2014"}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Files</p>
								<p class="ac-defs__desc">${c.available?k(c.files):"\u2014"}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Realtime status</p>
								<p class="ac-defs__desc">${i(o.status||"unknown")}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Tracked connections</p>
								<p class="ac-defs__desc">${k(o.trackedConnections??0)}</p>
							</div>
						</div>
						<p class="ac-empty__message" style="margin:14px 0 0;font-size:12px">${i(c.available?c.directory:c.error||"")}</p>
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
					${q({columns:[{key:"method",label:"Method"},{key:"path",label:"Path",render:l=>`<code>${i(l.path)}</code>`},{key:"calls",label:"Calls",align:"right"},{key:"errors",label:"Errors",align:"right"},{key:"errorRatePercent",label:"Error rate",align:"right",render:l=>`<span class="ac-badge ${l.errorRatePercent>=5?"ac-badge--danger":l.errorRatePercent>0?"ac-badge--warning":"ac-badge--success"}">${l.errorRatePercent.toFixed(1)}%</span>`},{key:"averageMs",label:"Avg (ms)",align:"right"}],rows:s.endpoints||[],empty:"No API traffic was recorded in this window."})}
				</div>
			</section>

			<div class="ac-section">
				<h2 class="ac-section__title">Scheduled work</h2>
				<p class="ac-section__hint">${i(u.note||"")}</p>
			</div>
			<section class="ac-panel">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title">Background tasks</h3>
						<p class="ac-panel__subtitle">Each task runs on a fixed interval inside the server process.</p>
					</div>
				</div>
				<div class="ac-panel__body ac-panel__body--flush">
					${q({columns:[{key:"name",label:"Task",render:l=>`<span class="ac-table__primary">${i(l.name)}</span>`},{key:"intervalMinutes",label:"Interval",align:"right",render:l=>`${l.intervalMinutes} min`},{key:"description",label:"Purpose"}],rows:u.tasks||[],empty:"No scheduled task is registered."})}
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
							${q({columns:[{key:"level",label:"Level",render:l=>`<span class="ac-badge ac-badge--${l.level==="error"||l.level==="fatal"?"danger":l.level==="warn"?"warning":"info"}">${i(l.level)}</span>`},{key:"message",label:"Message"},{key:"source",label:"Source",render:l=>`<code>${i(l.source)}</code>`},{key:"count",label:"Count",align:"right"},{key:"lastAt",label:"Last seen",render:l=>i(N(l.lastAt))}],rows:s.repeatedLogs,empty:"No repeated log entries in this window."})}
						</div>
					</section>`:""}`,e.querySelectorAll("[data-ac-window]").forEach(l=>{l.addEventListener("click",()=>{Ba.minutes=l.dataset.acWindow,a.rerender()})}),e.querySelector("[data-ac-refresh]").addEventListener("click",()=>a.rerender())}};var rs={general:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',organization:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6"/></svg>',profile:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',realtime:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14"/></svg>',presets:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 6.2L21 10l-5.4 4 1.6 6.6L12 17l-5.2 3.6L8.4 14 3 10l6.6-1.8z"/></svg>',access:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>',teaching:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/></svg>',data:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.7-4 3-9 3s-9-1.3-9-3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/></svg>',setup:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',ai:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l1.9 5.1L19 9l-5.1 1.9L12 16l-1.9-5.1L5 9l5.1-1.9L12 2z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z"/></svg>',roles:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',deployment:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z"/></svg>'};function is({sections:e,active:a,collapsed:t=!1}){let n=e.map(s=>{let r=rs[s.icon]||rs.general,d=s.badge==null?"":`<span class="ac-section-menu__badge">${i(String(s.badge))}</span>`;return`<button type="button" class="ac-section-menu__item${s.id===a?" is-active":""}" data-ac-section="${i(s.id)}" title="${i(s.label)}" aria-current="${s.id===a?"true":"false"}">
				<span class="ac-section-menu__icon">${r}</span>
				<span class="ac-section-menu__label">${i(s.label)}</span>
				${d}
			</button>`}).join("");return`<nav class="ac-section-menu${t?" ac-section-menu--collapsed":""}" aria-label="Settings sections">
		<div class="ac-section-menu__head">
			<span>Sections</span>
			<button type="button" class="ac-section-menu__toggle" data-ac-menu-toggle aria-label="${t?"Expand the section menu":"Collapse the section menu"}" title="${t?"Expand":"Collapse"}">${t?"\xBB":"\xAB"}</button>
		</div>
		<div class="ac-section-menu__list">${n}</div>
	</nav>`}function os(e,{onSelect:a}){e.querySelectorAll("[data-ac-section]").forEach(n=>{n.addEventListener("click",()=>a(n.dataset.acSection))});let t=e.querySelector("[data-ac-menu-toggle]");t&&t.addEventListener("click",()=>{let n=e.querySelector(".ac-section-menu"),s=e.querySelector(".ac-split");if(!n||!s)return;let r=!n.classList.contains("ac-section-menu--collapsed");n.classList.toggle("ac-section-menu--collapsed",r),s.classList.toggle("ac-split--collapsed",r),t.textContent=r?"\xBB":"\xAB",t.setAttribute("aria-label",r?"Expand the section menu":"Collapse the section menu");try{localStorage.setItem("quizConsoleSettingsMenuCollapsed",r?"1":"0")}catch{}})}function cs(){try{return localStorage.getItem("quizConsoleSettingsMenuCollapsed")==="1"}catch{return!1}}var Rn=[{value:"primaire",label:"Primaire (Primary)"},{value:"college",label:"Coll\xE8ge (Middle School)"},{value:"lycee",label:"Lyc\xE9e (High School)"},{value:"autre",label:"Autre (Other)"}],ls=[{key:"primaryColor",label:"Primary colour",type:"color",hint:"Buttons, links and highlights across the classroom surface."},{key:"secondaryColor",label:"Secondary colour",type:"color",hint:"The darker companion of the primary colour."},{key:"backgroundColor",label:"Background colour",type:"color",hint:"The page background of the classroom surface."},{key:"textColor",label:"Text colour",type:"color",hint:"The default body text colour."},{key:"inputFocusColor",label:"Input focus colour",type:"color",hint:"The ring shown around a focused input."}],ds=[{key:"totalQuestions",label:"Questions per quiz",type:"number",hint:"The default length offered when a teacher creates a quiz."},{key:"timeLimit",label:"Time limit (seconds)",type:"number",hint:"The default countdown of a quiz."},{key:"penalty",label:"Penalty per wrong answer",type:"number",hint:"Points deducted for a wrong answer."}],ps=[{key:"welcomeTitle",label:"Welcome title",hint:"Shown above the quiz on the student workspace."},{key:"welcomeMessage",label:"Welcome message",hint:"The line under the welcome title."}];async function us(e){let[a,t]=await Promise.all([_.get("school/profile/full"),Se()]),n=a||{},s=o=>t.get(o)?.value??"",r=[L({title:"Organization information",subtitle:"How this organization appears on the sign-in page, in the classroom header and on the generated documents.",body:`<div class="ac-field-grid">
					${A({id:"set-school-name",label:"Name",value:n.name??"",full:!0,hint:"Shown on the sign-in page and on every generated document."})}
					${U({id:"set-school-type",label:"Type",options:Rn,value:n.school_type??""})}
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
				</div>`}),L({title:"Quiz defaults",subtitle:"The starting values a teacher gets when creating a quiz.",body:`<div class="ac-field-grid">
					${ds.map(o=>A({id:`set-${o.key}`,label:o.label,value:s(o.key),type:o.type,hint:o.hint})).join("")}
				</div>
				<div class="ac-toolbar" style="margin-bottom:0">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-save-quiz>Save quiz defaults</button>
						<span class="ac-table__muted" data-ac-quiz-status></span>
					</div>
				</div>`}),L({title:"Appearance",subtitle:"The colours the classroom surface paints itself with.",body:`<div class="ac-field-grid">
					${ls.map(o=>A({id:`set-${o.key}`,label:o.label,value:s(o.key)||"#2563eb",type:"color",hint:o.hint})).join("")}
				</div>
				<div class="ac-field-grid">
					${ps.map(o=>A({id:`set-${o.key}`,label:o.label,value:s(o.key),hint:o.hint})).join("")}
				</div>
				<div class="ac-toolbar" style="margin-bottom:0">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-save-appearance>Save appearance</button>
						<span class="ac-table__muted" data-ac-appearance-status></span>
					</div>
				</div>`})].join("");function d(o){let c=p=>o.querySelector(p);o.querySelector("[data-ac-save-org]")?.addEventListener("click",async()=>{let p=c("[data-ac-org-status]"),l=m=>o.querySelector(`#${m}`)?.value??"";try{await _.put("school/profile",{name:l("set-school-name"),school_type:l("set-school-type"),school_year:l("set-school-year"),city:l("set-school-city"),phone:l("set-school-phone"),email:l("set-school-email"),address:l("set-school-address"),logo_url:l("set-school-logo")}),p&&(p.textContent="Saved."),v("Organization information saved.","success")}catch(m){p&&(p.textContent=m.message),v(m.message,"error")}});let u=async(p,l,m,g)=>{o.querySelector(p)?.addEventListener("click",async()=>{let h=c(l);try{for(let w of m){let f=o.querySelector(`#set-${w}`);if(!f)continue;let b=f.value,y=Number(b);await X(w,f.type==="number"&&b!==""?y:b)}h&&(h.textContent="Saved."),v(g,"success")}catch(w){h&&(h.textContent=w.message),v(w.message,"error")}})};u("[data-ac-save-quiz]","[data-ac-quiz-status]",ds.map(p=>p.key),"Quiz defaults saved."),u("[data-ac-save-appearance]","[data-ac-appearance-status]",[...ls,...ps].map(p=>p.key),"Appearance saved.")}return{markup:r,bind:d}}var On=[{value:"",label:"\u2014"},{value:"Mr",label:"Mr"},{value:"Mme",label:"Mme"},{value:"Mlle",label:"Mlle"},{value:"Dr",label:"Dr"}];async function ms(e){let t=(e.session||{}).user||{},n=[L({title:"My profile",subtitle:"Your own account information. The role, the status and the class assignments are managed by an administrator.",body:`<div class="ac-field-grid">
					${U({id:"set-profile-title",label:"Title",options:On,value:t.title??""})}
					${A({id:"set-profile-name",label:"Full name",value:t.name??""})}
					${A({id:"set-profile-email",label:"Email",value:t.email??"",type:"email"})}
					${A({id:"set-profile-phone",label:"Phone",value:t.phone??"",type:"tel"})}
				</div>
				<div class="ac-defs" style="margin-bottom:14px">
					<div class="ac-defs__item">
						<p class="ac-defs__term">Username</p>
						<p class="ac-defs__desc">${x(t.username||"\u2014")}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Role</p>
						<p class="ac-defs__desc">${x(t.roleLabel||t.role||"\u2014")}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Organization</p>
						<p class="ac-defs__desc">${x(e.organization?.name||t.schoolName||"\u2014")}</p>
					</div>
				</div>
				<div class="ac-toolbar" style="margin-bottom:0">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-save-profile>Save profile</button>
						<span class="ac-table__muted" data-ac-profile-status></span>
					</div>
				</div>`}),L({title:"Change my password",subtitle:"The current password is required. Every other session of this account ends when the password changes.",body:`<div class="ac-field-grid">
					${A({id:"set-profile-current",label:"Current password",type:"password",full:!0})}
					${A({id:"set-profile-new",label:"New password",type:"password",hint:"At least 8 characters."})}
					${A({id:"set-profile-confirm",label:"Confirm new password",type:"password"})}
				</div>
				<div class="ac-toolbar" style="margin-bottom:0">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-change-password>Update password</button>
						<span class="ac-table__muted" data-ac-password-status></span>
					</div>
				</div>`})].join("");function s(r){r.querySelector("[data-ac-save-profile]")?.addEventListener("click",async()=>{let d=r.querySelector("[data-ac-profile-status]"),o=c=>r.querySelector(`#${c}`)?.value??"";try{await _.patch("users/me",{title:o("set-profile-title"),name:o("set-profile-name"),email:o("set-profile-email"),phone:o("set-profile-phone")}),d&&(d.textContent="Saved."),v("Profile saved.","success")}catch(c){d&&(d.textContent=c.message),v(c.message,"error")}}),r.querySelector("[data-ac-change-password]")?.addEventListener("click",async()=>{let d=r.querySelector("[data-ac-password-status]"),o=r.querySelector("#set-profile-current")?.value??"",c=r.querySelector("#set-profile-new")?.value??"",u=r.querySelector("#set-profile-confirm")?.value??"";if(!o||!c){v("The current and the new password are both required.","error");return}if(c!==u){v("The two new passwords do not match.","error");return}if(c.length<8){v("The new password must be at least 8 characters.","error");return}try{await _.post("auth/change-password",{oldPassword:o,newPassword:c}),r.querySelector("#set-profile-current").value="",r.querySelector("#set-profile-new").value="",r.querySelector("#set-profile-confirm").value="",d&&(d.textContent="The password was changed."),v("Password changed. Your other sessions were signed out.","success")}catch(p){d&&(d.textContent=p.message),v(p.message,"error")}})}return{markup:n,bind:s}}async function hs(e){let[a,t,n]=await Promise.all([_.get("console/users?limit=500"),_.get("profile-requests?status=pending").catch(()=>[]),_.get("account-requests?status=pending").catch(()=>[])]),s=Array.isArray(a?.data)?a.data:[],r=Array.isArray(t)?t:[],d=Array.isArray(n)?n:[],o=m=>s.filter(g=>g.role===m).length,c=s.filter(m=>!m.lastLogin).length,u=s.filter(m=>m.status==="suspended").length,p=[L({title:"Users & access",subtitle:"Who can reach this platform, and what they may do.",body:`<div class="ac-grid ac-grid--kpi" style="margin-bottom:16px">
					${T({label:"Teachers",value:String(o("teacher")),note:"accounts"})}
					${T({label:"Students",value:String(o("student")),note:"accounts"})}
					${T({label:"Administrators",value:String(o("admin")+o("super_admin")),note:"accounts"})}
					${T({label:"Never signed in",value:String(c),note:"provisioned, unused",tone:c>0?"warning":""})}
					${T({label:"Suspended",value:String(u),note:"no access",tone:u>0?"warning":""})}
				</div>
				<div class="ac-quick-actions">
					<a class="ac-quick-action" href="#/users/teachers">Manage teachers</a>
					<a class="ac-quick-action" href="#/users/students">Manage students</a>
					<a class="ac-quick-action" href="#/users/administrators">Manage administrators</a>
					<a class="ac-quick-action" href="#/audit?stream=security">Review access events</a>
				</div>`}),L({title:"Account requests",subtitle:"New accounts registered from a browser. They cannot sign in until a request is approved.",body:d.length?q({columns:[{key:"full_name",label:"Requested account",render:m=>`<span class="ac-table__primary">${x(m.full_name||"")}</span><br><span class="ac-table__muted">${x(m.username||"")}${m.student_number?` \xB7 #${x(m.student_number)}`:""}</span>`},{key:"class_name",label:"Class",render:m=>x(m.class_name||"\u2014")},{key:"note",label:"Note",render:m=>x(m.note||"\u2014")},{key:"actions",label:"",align:"right",render:m=>`<button type="button" class="ac-btn ac-btn--sm" data-ac-approve-account="${x(m.id)}">Approve</button> <button type="button" class="ac-btn ac-btn--sm" data-ac-reject-account="${x(m.id)}">Reject</button>`}],rows:d}):'<p class="ac-empty__message">No account request is waiting.</p>'}),L({title:"Profile change requests",subtitle:"A student asking for a correction to their record.",body:r.length?q({columns:[{key:"user_id",label:"Account",render:m=>`<a href="#/users/${x(m.user_id)}" class="ac-table__primary">${x(m.user_id)}</a>`},{key:"changes",label:"Requested change",render:m=>x(In(m.changes_json))},{key:"note",label:"Note",render:m=>x(m.note||"\u2014")},{key:"actions",label:"",align:"right",render:m=>`<button type="button" class="ac-btn ac-btn--sm" data-ac-approve-profile="${x(m.id)}">Approve</button> <button type="button" class="ac-btn ac-btn--sm" data-ac-reject-profile="${x(m.id)}">Reject</button>`}],rows:r}):'<p class="ac-empty__message">No profile change request is waiting.</p>'})].join("");function l(m){let g=async(h,w,f,b)=>{try{await _.post(`${h}/${encodeURIComponent(w)}/${f?"approve":"reject"}`,{note:null}),v(`${b} ${f?"approved":"rejected"}.`,"success"),e.rerender()}catch(y){v(y.message,"error")}};m.querySelectorAll("[data-ac-approve-account]").forEach(h=>{h.addEventListener("click",()=>g("account-requests",h.dataset.acApproveAccount,!0,"The request was"))}),m.querySelectorAll("[data-ac-reject-account]").forEach(h=>{h.addEventListener("click",()=>g("account-requests",h.dataset.acRejectAccount,!1,"The request was"))}),m.querySelectorAll("[data-ac-approve-profile]").forEach(h=>{h.addEventListener("click",()=>g("profile-requests",h.dataset.acApproveProfile,!0,"The request was"))}),m.querySelectorAll("[data-ac-reject-profile]").forEach(h=>{h.addEventListener("click",()=>g("profile-requests",h.dataset.acRejectProfile,!1,"The request was"))})}return{markup:p,bind:l}}function In(e){if(!e)return"\u2014";try{let a=typeof e=="string"?JSON.parse(e):e,t=Object.entries(a||{});return t.length?t.map(([n,s])=>`${n}: ${s}`).join(" \xB7 "):"\u2014"}catch{return String(e)}}var fs="teacherAccess",Ga=4,Ua=[{key:"overview",label:"Overview",hint:"The teacher dashboard."},{key:"questions",label:"Questions",hint:"The question bank."},{key:"subjects",label:"Subjects",hint:"The subject and category tree."},{key:"exams",label:"Exams",hint:"Creating and running exams."},{key:"classes",label:"Classes",hint:"The classes and their students."},{key:"games",label:"Games",hint:"The game arena."},{key:"kidsGames",label:"Kids Games",hint:"The Kids arena."},{key:"results",label:"Results",hint:"The results of the attempts."}],Fa=[{key:"general",label:"General"},{key:"profile",label:"My profile"},{key:"presets",label:"Presets"},{key:"data",label:"Data"},{key:"realtime",label:"Realtime"},{key:"ai-generation",label:"AI generation"},{key:"users",label:"Users"},{key:"games",label:"Game presets"}];function fa(){return{rev:Ga,tabs:{overview:!0,questions:!0,subjects:!0,exams:!0,classes:!0,games:!0,kidsGames:!0,results:!0,notifications:!0,activity:!1},settings:!0,settingsTabs:{general:!0,profile:!0,presets:!0,data:!0,realtime:!0,"ai-generation":!0,users:!0,games:!0}}}function Dn(e){let a=fa();if(!e)return a;let t=e;if(typeof e=="string")try{t=JSON.parse(e)}catch{return a}return!t||typeof t!="object"?a:{rev:Ga,tabs:{...a.tabs,...t.tabs||{}},settings:t.settings===void 0?a.settings:!!t.settings,settingsTabs:{...a.settingsTabs,...t.settingsTabs||{}}}}async function gs(){let e=await Se(),a=Dn(e.get(fs)?.value),t=[L({title:"Teacher access control",subtitle:"Choose which dashboard tabs and settings tabs a teacher may reach in the classroom surface.",body:`<h4 class="ac-section-panel__title" style="margin:0 0 8px">Dashboard tabs</h4>
				${Ua.map(s=>pe({id:`set-teacher-tab-${s.key}`,label:s.label,hint:s.hint,checked:a.tabs[s.key]!==!1})).join("")}
				${pe({id:"set-teacher-settings",label:"The settings modal",hint:"Whether a teacher may open the settings dialog at all.",checked:a.settings!==!1})}
				<h4 class="ac-section-panel__title" style="margin:20px 0 8px">Settings tabs</h4>
				${Fa.map(s=>pe({id:`set-teacher-settings-${s.key}`,label:s.label,checked:a.settingsTabs[s.key]!==!1})).join("")}
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
				</div>`})].join("");function n(s){let r=s.querySelector("[data-ac-teacher-access-status]"),d=()=>{let c={rev:Ga,tabs:{...fa().tabs},settings:s.querySelector("#set-teacher-settings")?.getAttribute("aria-checked")==="true",settingsTabs:{...fa().settingsTabs}};for(let u of Ua){let p=s.querySelector(`#set-teacher-tab-${u.key}`);p&&(c.tabs[u.key]=p.getAttribute("aria-checked")==="true")}for(let u of Fa){let p=s.querySelector(`#set-teacher-settings-${u.key}`);p&&(c.settingsTabs[u.key]=p.getAttribute("aria-checked")==="true")}return c};s.querySelectorAll(".ac-switch").forEach(c=>{c.addEventListener("click",()=>{let u=c.getAttribute("aria-checked")==="true"?"false":"true";c.setAttribute("aria-checked",u)})});let o=async c=>{try{await X(fs,JSON.stringify(c)),r&&(r.textContent="Saved."),v("Teacher access saved.","success")}catch(u){r&&(r.textContent=u.message),v(u.message,"error")}};s.querySelector("[data-ac-save-teacher-access]")?.addEventListener("click",()=>{o(d())}),s.querySelector("[data-ac-reset-teacher-access]")?.addEventListener("click",async()=>{let c=fa();for(let p of Ua){let l=s.querySelector(`#set-teacher-tab-${p.key}`);l&&l.setAttribute("aria-checked",c.tabs[p.key]?"true":"false")}let u=s.querySelector("#set-teacher-settings");u&&u.setAttribute("aria-checked",c.settings?"true":"false");for(let p of Fa){let l=s.querySelector(`#set-teacher-settings-${p.key}`);l&&l.setAttribute("aria-checked",c.settingsTabs[p.key]?"true":"false")}await o(c)})}return{markup:t,bind:n}}var Je=null,we=null;function Hn(){return window.io?Promise.resolve(window.io):new Promise((e,a)=>{let t=document.createElement("script");t.src="/vendor/socket.io.min.js",t.async=!0,t.onload=()=>{window.io?e(window.io):a(new Error("The realtime client could not be loaded."))},t.onerror=()=>a(new Error("The realtime client could not be loaded.")),document.head.appendChild(t)})}async function bs({force:e=!1}={}){return we&&we.connected&&!e?we:(Je&&!e||(Je=(async()=>{try{let a=await Hn();return we&&(we.disconnect(),we=null),we=a({auth:{token:Ca()},transports:["websocket","polling"],reconnectionAttempts:5,timeout:8e3}),we}catch{return we=null,null}finally{Je=null}})()),Je)}function vs(e,a=8e3){return e?e.connected?Promise.resolve(!0):new Promise(t=>{let n=setTimeout(()=>{e.off("connect",s),t(!1)},a),s=()=>{clearTimeout(n),t(!0)};e.on("connect",s)}):Promise.resolve(!1)}async function _s(e){let[a,t]=await Promise.all([Se(),_.get("devices").catch(()=>[])]),n=o=>{let c=a.get(o)?.value??"";return c==="false"?!1:c==="true"?!0:c},s=Array.isArray(t)?t:[],r=[L({title:"How the realtime channel works here",subtitle:"There is no second server to run.",body:`<div class="ac-alert ac-alert--info">
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
				</div>`}),L({title:"Realtime behaviour",subtitle:"How much this installation pushes to the connected devices.",body:`${pe({id:"set-realtime-enabled",label:"Use this session for realtime broadcasts",hint:"Whether this administration session broadcasts and lists the connected devices.",checked:n("realtimeEnabled")!==!1})}
				${pe({id:"set-realtime-autosync",label:"Auto-sync results",hint:"Automatically push the quiz results to the connected devices.",checked:n("autoSync")!==!1})}
				${pe({id:"set-realtime-broadcast",label:"Broadcast updates",hint:"Push question and exam updates to the connected devices.",checked:n("broadcastUpdates")!==!1})}
				${pe({id:"set-realtime-autosync-questions",label:"Auto-sync questions (training categories)",hint:"Periodically push the questions of the training-enabled categories to the connected devices.",checked:n("autoSyncQuestions")!==!1})}
				<div class="ac-field-grid" style="margin-top:14px">
					${A({id:"set-realtime-interval",label:"Sync interval (seconds)",type:"number",value:n("realtimeSyncInterval")||5,hint:"How often the data is synchronised between the devices."})}
					${A({id:"set-realtime-host",label:"Server host (fallback for the classroom panel)",value:n("serverHost")||"",placeholder:"http://192.168.1.5:3000",hint:"The realtime channel itself always connects to the address this page was served from. This value is only the fallback the classroom panel reads."})}
				</div>
				<div class="ac-toolbar" style="margin-bottom:0">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-save-realtime>Save realtime settings</button>
						<span class="ac-table__muted" data-ac-realtime-status></span>
					</div>
				</div>`}),L({title:"Recovery code",subtitle:'The code the "forgot password" panel on the sign-in page accepts. It is stored as a server-side hash.',body:`<div class="ac-field-grid">
					${A({id:"set-recovery-code",label:"New recovery code",type:"password",full:!0,hint:"Leave it blank to keep the existing code. The code itself is never sent back to a browser."})}
				</div>
				<div class="ac-toolbar" style="margin-bottom:0">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-save-recovery>Save recovery code</button>
						<span class="ac-table__muted" data-ac-recovery-status></span>
					</div>
				</div>`}),L({title:"Connected devices",subtitle:"The machines currently connected to this installation.",actions:'<button type="button" class="ac-btn ac-btn--sm" data-ac-realtime-refresh>Refresh</button>',body:`<div class="ac-toolbar" style="margin-bottom:12px">
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
					${s.length?ys(s):'<p class="ac-empty__message">No device has registered with this installation yet.</p>'}
				</div>`})].join("");function d(o){let c=o.querySelector("[data-ac-realtime-status]"),u=o.querySelector("[data-ac-realtime-connection]"),p=o.querySelector("[data-ac-realtime-devices]");o.querySelectorAll(".ac-switch").forEach(f=>{f.addEventListener("click",()=>{let b=f.getAttribute("aria-checked")==="true"?"false":"true";f.setAttribute("aria-checked",b)})});let l=f=>o.querySelector(`#${f}`)?.getAttribute("aria-checked")==="true";o.querySelector("[data-ac-save-realtime]")?.addEventListener("click",async()=>{try{await X("realtimeEnabled",String(l("set-realtime-enabled"))),await X("autoSync",String(l("set-realtime-autosync"))),await X("broadcastUpdates",String(l("set-realtime-broadcast"))),await X("autoSyncQuestions",String(l("set-realtime-autosync-questions")));let f=o.querySelector("#set-realtime-interval")?.value??"5";await X("realtimeSyncInterval",String(Math.max(1,Number(f)||5))),await X("serverHost",o.querySelector("#set-realtime-host")?.value??""),c&&(c.textContent="Saved."),v("Realtime settings saved.","success")}catch(f){c&&(c.textContent=f.message),v(f.message,"error")}}),o.querySelector("[data-ac-save-recovery]")?.addEventListener("click",async()=>{let f=o.querySelector("[data-ac-recovery-status]"),b=o.querySelector("#set-recovery-code")?.value?.trim()??"";if(!b){v("Type a new recovery code, or leave the field alone to keep the current one.","error");return}try{await _.post("auth/recover/set",{code:b}),o.querySelector("#set-recovery-code").value="",f&&(f.textContent="Saved."),v("Recovery code saved.","success")}catch(y){f&&(f.textContent=y.message),v(y.message,"error")}});let m=!1,g=async({force:f=!1}={})=>{u&&(u.textContent="Connecting\u2026");let b=await bs({force:f});return b?await vs(b)?(b.emit("identify",{role:"admin"}),u&&(u.textContent="Connected."),b):(u&&(u.textContent="Could not connect to the realtime channel."),null):(u&&(u.textContent="The realtime client could not be loaded."),null)},h=async()=>{try{let f=await _.get("devices"),b=Array.isArray(f)?f:[],y=m?b.filter($=>$.status==="active"||$.online):b;p&&(p.innerHTML=y.length?ys(y):'<p class="ac-empty__message">No device matches the current filter.</p>')}catch(f){p&&(p.innerHTML=`<p class="ac-empty__message">${x(f.message)}</p>`)}};o.querySelector("[data-ac-realtime-refresh]")?.addEventListener("click",h),o.querySelector("[data-ac-realtime-online-only]")?.addEventListener("click",async()=>{m=!m;let f=o.querySelector("[data-ac-realtime-online-only]");f&&(f.textContent=m?"Show all devices":"Show online only"),await h()}),o.querySelector("[data-ac-realtime-test]")?.addEventListener("click",async()=>{await g({force:!0})&&(v("The realtime channel answered.","success"),await h())});let w=async(f,b,y)=>{let $=await g();if(!$){v("The realtime channel is not connected.","error");return}try{$.emit(f,b||{}),v(`${y} was sent to the connected devices.`,"success")}catch(C){v(C.message,"error")}};o.querySelector("[data-ac-realtime-sync-all]")?.addEventListener("click",async()=>{await w("admin:refreshStudentBootstrap",{},"The full synchronisation"),await w("admin:syncUsers",{quizUsers:[]},"The user accounts"),await w("admin:syncGamification",{},"The gamification")}),o.querySelector("[data-ac-realtime-sync-users]")?.addEventListener("click",()=>w("admin:syncUsers",{quizUsers:[]},"The user accounts")),o.querySelector("[data-ac-realtime-sync-classroom]")?.addEventListener("click",()=>w("admin:refreshStudentBootstrap",{},"The classroom data")),o.querySelector("[data-ac-realtime-sync-games]")?.addEventListener("click",async()=>{await w("admin:syncGames",{},"The regular games"),await w("admin:syncKidsGames",{},"The Kids games")}),n("realtimeEnabled")!==!1&&g().then(async f=>{f&&f.on("clients:update",()=>{h()})}).catch(()=>{})}return{markup:r,bind:d}}function ys(e){return q({columns:[{key:"hostname",label:"Device",render:a=>`<span class="ac-table__primary">${x(a.hostname||a.name||"\u2014")}</span>`},{key:"device_type",label:"Type",render:a=>x(a.device_type||a.platform||"\u2014")},{key:"assignedUser",label:"Assigned to",render:a=>x(a.assignedUser?.name||a.assignedUser?.username||"unassigned")},{key:"ip_address",label:"Address",render:a=>`<code>${x(a.ip_address||a.ip||"\u2014")}</code>`},{key:"status",label:"Status",render:a=>`<span class="ac-badge ac-badge--${a.status==="blocked"?"danger":""}">${x(a.status||"\u2014")}</span>`}],rows:e,empty:"No device matches the current filter."})}var $s="quizPresets",ws=[{value:"quiz",label:"Quiz"},{value:"battle",label:"Battle"},{value:"tournament",label:"Tournament"},{value:"kids",label:"Kids game"}],xs=[{value:"individual",label:"Individual"},{value:"team",label:"Team"},{value:"tournament",label:"Tournament"}];function ga(){try{let e=localStorage.getItem($s),a=e?JSON.parse(e):[];return Array.isArray(a)?a:[]}catch{return[]}}function Wa(e){try{return localStorage.setItem($s,JSON.stringify(e)),!0}catch{return!1}}var ks=[{key:"name",label:"Name",type:"text",width:"full"},{key:"totalQuestions",label:"Questions",type:"number"},{key:"timerMode",label:"Timer mode",type:"select",options:[{value:"fixed",label:"One limit for the whole quiz"},{value:"per-question",label:"A limit per question"},{value:"none",label:"No limit"}]},{key:"perQuestionTime",label:"Seconds per question",type:"number"},{key:"timeLimit",label:"Total time (seconds)",type:"number"},{key:"penalty",label:"Penalty per wrong answer",type:"number"},{key:"passingScore",label:"Passing score (%)",type:"number"},{key:"shuffleQuestions",label:"Shuffle the questions",type:"checkbox"},{key:"showExplanations",label:"Show the explanations",type:"checkbox"},{key:"primaryColor",label:"Primary colour",type:"color"},{key:"secondaryColor",label:"Secondary colour",type:"color"},{key:"backgroundColor",label:"Background colour",type:"color"},{key:"textColor",label:"Text colour",type:"color"},{key:"inputFocusColor",label:"Input focus colour",type:"color"},{key:"fontFamily",label:"Typeface",type:"text",width:"full"},{key:"welcomeTitle",label:"Welcome title",type:"text",width:"full"},{key:"welcomeMessage",label:"Welcome message",type:"text",width:"full"}],Ss={name:"",totalQuestions:5,timerMode:"fixed",perQuestionTime:60,timeLimit:300,penalty:0,passingScore:50,shuffleQuestions:!0,showExplanations:!1,primaryColor:"#2563eb",secondaryColor:"#1e40af",backgroundColor:"#f8fafc",textColor:"#1e293b",inputFocusColor:"#3b82f6",fontFamily:"'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",welcomeTitle:"",welcomeMessage:""};function Bn(e,a){let t=`preset-${a.key}`,n=e?.[a.key]??Ss[a.key];return a.type==="checkbox"?`<label class="ac-check">
			<input type="checkbox" id="${x(t)}" ${n?"checked":""} />
			<span><span class="ac-check__label">${x(a.label)}</span></span>
		</label>`:a.type==="select"?`<div class="ac-field">
			<label class="ac-field__label" for="${x(t)}">${x(a.label)}</label>
			<select class="ac-select" id="${x(t)}">
				${a.options.map(s=>`<option value="${x(s.value)}"${String(s.value)===String(n)?" selected":""}>${x(s.label)}</option>`).join("")}
			</select>
		</div>`:`<div class="ac-field${a.width==="full"?" ac-field--full":""}">
		<label class="ac-field__label" for="${x(t)}">${x(a.label)}</label>
		<input class="ac-input ac-input--full" id="${x(t)}" type="${x(a.type)}" value="${x(n??"")}" autocomplete="off" />
	</div>`}async function Ts(e){let[a,t]=await Promise.all([_.get("game-presets").catch(()=>[]),Se()]),n=Array.isArray(a)?a:[],s=ga(),r=t.get("trainingPresetId")?.value??"",d=[L({title:"Quiz presets",subtitle:"The ready-made quick-quiz configurations. They are stored in this browser and are shared with the classroom panel.",actions:'<button type="button" class="ac-btn ac-btn--sm ac-btn--primary" data-ac-preset-new>New quiz preset</button>',body:`${s.length?q({columns:[{key:"name",label:"Preset",render:c=>`<span class="ac-table__primary">${x(c.name||"")}</span><br><span class="ac-table__muted">${x(c.id||"")}</span>`},{key:"totalQuestions",label:"Questions",align:"right",render:c=>String(c.totalQuestions??"\u2014")},{key:"timeLimit",label:"Time limit (s)",align:"right",render:c=>String(c.timeLimit??"\u2014")},{key:"passingScore",label:"Passing score",align:"right",render:c=>String(c.passingScore??"\u2014")},{key:"actions",label:"",align:"right",render:c=>`<button type="button" class="ac-btn ac-btn--sm" data-ac-preset-edit="${x(c.id)}">Edit</button> <button type="button" class="ac-btn ac-btn--sm" data-ac-preset-rename="${x(c.id)}">Rename</button> <button type="button" class="ac-btn ac-btn--sm" data-ac-preset-delete="${x(c.id)}">Delete</button>`}],rows:s}):'<p class="ac-empty__message">No quiz preset is stored in this browser yet. Create one here, or in the classroom panel.</p>'}
			<div class="ac-field-grid" style="margin-top:16px">
				${A({id:"set-training-preset",label:"The preset used for training mode",value:r,hint:"The id of the quiz preset a training session starts from. Leave it blank for the default."})}
			</div>
			<div class="ac-toolbar" style="margin-bottom:0">
				<div class="ac-toolbar__row">
					<button type="button" class="ac-btn ac-btn--primary" data-ac-save-training-preset>Save training preset</button>
					<span class="ac-table__muted" data-ac-training-preset-status></span>
				</div>
			</div>`}),L({title:"Game presets",subtitle:"The arena configurations this organization shares.",actions:'<button type="button" class="ac-btn ac-btn--sm ac-btn--primary" data-ac-game-preset-new>New game preset</button>',body:n.length?q({columns:[{key:"name",label:"Preset",render:c=>`<span class="ac-table__primary">${x(c.name||"")}</span><br><span class="ac-table__muted">${x(c.game_type||"")} \xB7 ${x(c.game_mode||"")}</span>`},{key:"is_default",label:"Default",render:c=>c.is_default?'<span class="ac-badge ac-badge--success">yes</span>':'<span class="ac-badge">no</span>'},{key:"actions",label:"",align:"right",render:c=>`<button type="button" class="ac-btn ac-btn--sm" data-ac-game-preset-edit="${x(c.id)}">Edit</button> <button type="button" class="ac-btn ac-btn--sm" data-ac-game-preset-delete="${x(c.id)}">Delete</button>`}],rows:n}):'<p class="ac-empty__message">No game preset yet.</p>'})].join("");function o(c){let u=l=>{let m=!l,g={...Ss,...l||{}},h=I({title:m?"Create a quiz preset":"Edit the quiz preset",subtitle:"A preset is stored in this browser and is shared with the classroom panel, so it is offered there too.",wide:!0,body:`<div class="ac-field-grid">
						${ks.map(f=>Bn(g,f)).join("")}
					</div>`,footer:`
					<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
					<button type="button" class="ac-btn ac-btn--primary" data-ac-confirm>${m?"Create the preset":"Save the preset"}</button>
				`}),w=h.root;w.querySelector("[data-ac-cancel]").addEventListener("click",h.close),w.querySelector("[data-ac-confirm]").addEventListener("click",()=>{let f={...g};for(let y of ks){let $=w.querySelector(`#preset-${y.key}`);$&&(y.type==="checkbox"?f[y.key]=$.checked:y.type==="number"?f[y.key]=$.value===""?0:Number($.value):f[y.key]=$.value)}if(!String(f.name||"").trim()){v("A preset needs a name.","error");return}let b=ga();if(m)f.id=`preset-${Date.now()}`,f.createdAt=new Date().toISOString(),b.push(f);else{let y=b.findIndex($=>$.id===l.id);y!==-1&&(b[y]={...b[y],...f})}if(!Wa(b)){v("The browser refused to save the preset.","error");return}h.close(),v(m?"The preset was created.":"The preset was saved.","success"),e.rerender()})};c.querySelector("[data-ac-preset-new]")?.addEventListener("click",()=>u(null)),c.querySelectorAll("[data-ac-preset-edit]").forEach(l=>{l.addEventListener("click",()=>{let m=s.find(g=>g.id===l.dataset.acPresetEdit);m&&u(m)})}),c.querySelectorAll("[data-ac-preset-rename]").forEach(l=>{l.addEventListener("click",()=>{let m=l.dataset.acPresetRename,g=ga(),h=g.find(f=>f.id===m);if(!h)return;let w=I({title:"Rename this preset",body:`<div class="ac-field">
							<label class="ac-field__label" for="ac-preset-name">Name</label>
							<input class="ac-input ac-input--full" id="ac-preset-name" type="text" value="${x(h.name||"")}" />
						</div>`,footer:`
						<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
						<button type="button" class="ac-btn ac-btn--primary" data-ac-confirm>Rename</button>
					`});w.root.querySelector("[data-ac-cancel]").addEventListener("click",w.close),w.root.querySelector("[data-ac-confirm]").addEventListener("click",()=>{let f=w.root.querySelector("#ac-preset-name").value.trim();if(!f){v("A preset needs a name.","error");return}h.name=f,Wa(g)?(w.close(),v("Preset renamed.","success"),e.rerender()):v("The browser refused to save the preset.","error")})})}),c.querySelectorAll("[data-ac-preset-delete]").forEach(l=>{l.addEventListener("click",async()=>{let m=l.dataset.acPresetDelete;if(!await D({title:"Delete this preset?",message:"It is removed from this browser. The classroom panel will not offer it any more.",confirmLabel:"Delete preset",danger:!0}))return;let h=ga().filter(w=>w.id!==m);Wa(h)?(v("Preset deleted.","success"),e.rerender()):v("The browser refused to save the preset.","error")})}),c.querySelector("[data-ac-save-training-preset]")?.addEventListener("click",async()=>{let l=c.querySelector("[data-ac-training-preset-status]");try{await X("trainingPresetId",c.querySelector("#set-training-preset")?.value??""),l&&(l.textContent="Saved."),v("The training preset was saved.","success")}catch(m){l&&(l.textContent=m.message),v(m.message,"error")}});let p=l=>{let m=I({title:l?"Edit the game preset":"New game preset",body:`<div class="ac-field-grid">
						${A({id:"set-game-name",label:"Name",value:l?.name??"",full:!0})}
						${U({id:"set-game-type",label:"Game type",options:ws,value:l?.game_type??ws[0]?.value??""})}
						${U({id:"set-game-mode",label:"Game mode",options:xs,value:l?.game_mode??xs[0]?.value??""})}
						${A({id:"set-game-rules",label:"Rules (JSON)",value:Un(l?.rules_json),full:!0,hint:"The rule set of the arena. It is stored as JSON."})}
					</div>
					${Ke({id:"set-game-default",label:"The default preset",hint:"Used when a game starts without an explicit preset.",checked:!!l?.is_default})}`,footer:`
					<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
					<button type="button" class="ac-btn ac-btn--primary" data-ac-confirm>${l?"Save the preset":"Create the preset"}</button>
				`});m.root.querySelector("[data-ac-cancel]").addEventListener("click",m.close),m.root.querySelector("[data-ac-confirm]").addEventListener("click",async()=>{let g=m.root.querySelector("#set-game-name").value.trim();if(!g){v("A preset needs a name.","error");return}let h={name:g,game_type:m.root.querySelector("#set-game-type").value,game_mode:m.root.querySelector("#set-game-mode").value,rules:m.root.querySelector("#set-game-rules").value,is_default:m.root.querySelector("#set-game-default").checked};try{l?await _.patch(`game-presets/${encodeURIComponent(l.id)}`,h):await _.post("game-presets",h),m.close(),v("The game preset was saved.","success"),e.rerender()}catch(w){v(w.message,"error")}})};c.querySelector("[data-ac-game-preset-new]")?.addEventListener("click",()=>p(null)),c.querySelectorAll("[data-ac-game-preset-edit]").forEach(l=>{l.addEventListener("click",()=>{let m=n.find(g=>g.id===l.dataset.acGamePresetEdit);m&&p(m)})}),c.querySelectorAll("[data-ac-game-preset-delete]").forEach(l=>{l.addEventListener("click",async()=>{if(await D({title:"Delete this game preset?",message:"It is removed for the whole organization.",confirmLabel:"Delete preset",danger:!0}))try{await _.del(`game-presets/${encodeURIComponent(l.dataset.acGamePresetDelete)}`),v("The game preset was deleted.","success"),e.rerender()}catch(g){v(g.message,"error")}})})}return{markup:d,bind:o}}function Un(e){if(!e)return"";if(typeof e=="object")return JSON.stringify(e,null,2);try{return JSON.stringify(JSON.parse(e),null,2)}catch{return String(e)}}async function Ls(e){let[a,t]=await Promise.all([_.get("generated-documents?limit=200").catch(()=>null),_.get("archives").catch(()=>null)]),n=Array.isArray(a?.data)?a.data:Array.isArray(a)?a:[],s=Array.isArray(t?.items)?t.items:[],r=[L({title:"Recent documents",subtitle:"Every booklet, preparation sheet and exam paper the platform has generated. The title opens the file; the folder shows where it lives.",body:n.length?q({columns:[{key:"title",label:"Document",render:o=>{let c=o.url||"",u=x(o.title||o.file_name||"Document");return c?`<a class="ac-table__primary" href="${x(c)}" target="_blank" rel="noopener">${u}</a>`:`<span class="ac-table__primary">${u}</span>`}},{key:"kind",label:"Kind",render:o=>x(o.kind||"\u2014")},{key:"rel_path",label:"Folder",render:o=>`<code class="ac-table__muted" title="${x(o.rel_path||"")}">${x(Yn(o.rel_path))}</code>`},{key:"size_bytes",label:"Size",align:"right",render:o=>As(o.size_bytes)},{key:"created_at",label:"Created",render:o=>x(qs(o.created_at))},{key:"actions",label:"",align:"right",render:o=>`<a class="ac-btn ac-btn--sm" href="${x(`/api/v1/generated-documents/${encodeURIComponent(o.id)}/download`)}">Download</a>`}],rows:n}):'<p class="ac-empty__message">No document has been generated yet. The course booklets, the preparation sheets and the exam papers appear here once they are produced.</p>'}),L({title:"Export",subtitle:"A snapshot of this organization, taken from the database.",body:`<div class="ac-alert ac-alert--info">
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
				</div>`}),L({title:"Import",subtitle:"Restore a backup exported from this application.",body:`<div class="ac-field-grid">
					${Wn("ac-import-file","Backup file",'A .zip produced by "Export as ZIP", or a .json produced by "Export as JSON".')}
				</div>
				<div class="ac-toolbar" style="margin-bottom:0">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-import-run>Import the backup</button>
						<span class="ac-table__muted" data-ac-import-status></span>
					</div>
				</div>`}),L({title:"School-year archives",subtitle:"A frozen snapshot of a school year, kept per year.",actions:'<button type="button" class="ac-btn ac-btn--sm ac-btn--primary" data-ac-archive-new>Create an archive</button>',body:s.length?q({columns:[{key:"label",label:"Archive",render:o=>`<span class="ac-table__primary">${x(o.label||`Archive ${o.year}`)}</span><br><span class="ac-table__muted">${x(o.year)}</span>`},{key:"size_bytes",label:"Size",align:"right",render:o=>As(o.size_bytes)},{key:"created_at",label:"Created",render:o=>x(qs(o.created_at))},{key:"actions",label:"",align:"right",render:o=>`<button type="button" class="ac-btn ac-btn--sm" data-ac-archive-view="${x(o.year)}">Open</button> <button type="button" class="ac-btn ac-btn--sm" data-ac-archive-delete="${x(o.year)}">Delete</button>`}],rows:s}):'<p class="ac-empty__message">No archive yet.</p>'}),L({title:"Factory reset",subtitle:"Erase this organization's content and keep only its administrators.",body:`<div class="ac-alert ac-alert--danger">
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
				</div>`})].join("");function d(o){let c=o.querySelector("[data-ac-export-status]"),u=o.querySelector("[data-ac-import-status]"),p=async()=>{let l=await _.get("console/export");if(!l?.data)throw new Error("The export was empty.");return l.data};o.querySelector("[data-ac-export-json]")?.addEventListener("click",async()=>{c&&(c.textContent="Collecting\u2026");try{let l=await p();Ya(new Blob([JSON.stringify(l,null,2)],{type:"application/json"}),`quiz-app-backup-${l.timestamp.slice(0,10)}.json`),c&&(c.textContent="The backup was downloaded."),v("Backup created.","success")}catch(l){c&&(c.textContent=l.message),v(l.message,"error")}}),o.querySelector("[data-ac-export-zip]")?.addEventListener("click",async()=>{c&&(c.textContent="Packaging\u2026");try{let l=await p(),m=await fetch("/api/v1/exports/bundle",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json",Authorization:`Bearer ${window.APP_CONFIG?.token||Qa()}`},body:JSON.stringify({data:l.data})});if(!m.ok)throw new Error(`The server refused the export (${m.status}).`);let g=await m.blob();Ya(g,`quiz-app-backup-${l.timestamp.slice(0,10)}.zip`),c&&(c.textContent="The backup was downloaded."),v("Backup created.","success")}catch(l){c&&(c.textContent=l.message),v(l.message,"error")}}),o.querySelectorAll("[data-ac-file-input]").forEach(l=>{l.addEventListener("change",()=>{let m=o.querySelector(`[data-ac-file-name="${l.dataset.acFileInput}"]`);if(!m)return;let g=l.files?.[0];m.textContent=g?g.name:"No file chosen yet",m.classList.toggle("is-set",!!g)})}),o.querySelector("[data-ac-import-run]")?.addEventListener("click",async()=>{let m=o.querySelector("#ac-import-file")?.files?.[0];if(!m){v("Choose a backup file first.","error");return}if(await D({title:"Import this backup?",message:"The records of the backup are written over the records of this organization. The accounts that already exist keep their password.",confirmLabel:"Import the backup",danger:!0})){u&&(u.textContent="Importing\u2026");try{let h=null,w=null;if(m.name.toLowerCase().endsWith(".zip")){let y=await fetch("/api/v1/imports/bundle",{method:"POST",credentials:"include",headers:{"Content-Type":"application/zip",Authorization:`Bearer ${Qa()}`},body:m});if(!y.ok)throw new Error(`The server refused the backup (${y.status}).`);let $=await y.json();h=$.data,w=$.uploadToken}else{let y=JSON.parse(await m.text());h=y?.data?y.data:y}if(!h||typeof h!="object")throw new Error("The backup held no data.");let f=await Gn(h);w&&await fetch(`/api/v1/imports/bundle/${encodeURIComponent(w)}/commit`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json",Authorization:`Bearer ${Qa()}`},body:JSON.stringify({uploadToken:w})});let b=Object.entries(f).filter(([,y])=>y>0).map(([y,$])=>`${$} ${y}`).join(", ");u&&(u.textContent=b?`Imported: ${b}.`:"Nothing to import."),v("The backup was imported.","success"),e.rerender()}catch(h){u&&(u.textContent=h.message),v(h.message,"error")}}}),o.querySelector("[data-ac-archive-new]")?.addEventListener("click",async()=>{let l=prompt("Which school year? (YYYY-YYYY)",Qn());if(l)try{await _.post("archives",{year:l,label:`Archive ${l}`,data:{}}),v("The archive was created.","success"),e.rerender()}catch(m){v(m.message,"error")}}),o.querySelectorAll("[data-ac-archive-view]").forEach(l=>{l.addEventListener("click",async()=>{try{let m=await _.get(`archives/${encodeURIComponent(l.dataset.acArchiveView)}`),g=new Blob([JSON.stringify(m.data??{},null,2)],{type:"application/json"});Ya(g,`archive-${l.dataset.acArchiveView}.json`),v("The archive was downloaded.","success")}catch(m){v(m.message,"error")}})}),o.querySelectorAll("[data-ac-archive-delete]").forEach(l=>{l.addEventListener("click",async()=>{if(await D({title:"Delete this archive?",message:"The frozen snapshot of that year is removed. It cannot be recovered.",confirmLabel:"Delete the archive",danger:!0}))try{await _.del(`archives/${encodeURIComponent(l.dataset.acArchiveDelete)}`),v("The archive was deleted.","success"),e.rerender()}catch(g){v(g.message,"error")}})}),o.querySelector("[data-ac-reset-data]")?.addEventListener("click",async()=>{let l=o.querySelector("[data-ac-reset-status]");if(await D({title:"Reset every record of this organization?",message:"The questions, the exams, the classes, the results, the games, the documents and the archives are erased. The administrator accounts are kept. This cannot be undone.",detail:"Take a backup first if there is anything here you want to keep.",confirmLabel:"Reset the data",danger:!0})){l&&(l.textContent="Resetting\u2026");try{let g=await _.post("admin/reset-data",{confirm:"RESET"});return l&&(l.textContent="The organization was reset."),v("The organization was reset.","success"),e.rerender(),g}catch(g){l&&(l.textContent=g.message),v(g.message,"error")}}})}return{markup:r,bind:d}}var Fn=["categories","classes","users","questions","exams","results","games","tournaments","notifications","gamification","settings","learning_objectives","competencies","learning_objective_competencies","learning_prerequisites","question_assessment_criteria"];async function Gn(e){let a={};for(let t of Fn){let n=Array.isArray(e[t])?e[t]:[];if(!n.length){a[t]=0;continue}try{await _.post(`bulk/${t}`,{items:n}),a[t]=n.length}catch{a[t]=0}}return a}function Wn(e,a,t){return`<div class="ac-field ac-field--full">
		<label class="ac-field__label" for="${x(e)}">${x(a)}</label>
		<label class="ac-file" for="${x(e)}">
			<input id="${x(e)}" type="file" accept=".json,.zip" data-ac-file-input="${x(e)}" />
			<span class="ac-btn ac-file__btn" aria-hidden="true">Choose a file</span>
			<span class="ac-file__name" data-ac-file-name="${x(e)}">No file chosen yet</span>
		</label>
		<p class="ac-field__hint">${x(t)}</p>
	</div>`}function Ya(e,a){let t=URL.createObjectURL(e),n=document.createElement("a");n.href=t,n.download=a,document.body.appendChild(n),n.click(),n.remove(),setTimeout(()=>URL.revokeObjectURL(t),2e3)}function Qa(){try{let e=sessionStorage.getItem("quizSession")||localStorage.getItem("quizSession"),a=e?JSON.parse(e):null;if(a?.token)return a.token}catch{}return localStorage.getItem("quizAuthToken")||""}function Yn(e){let a=String(e||""),t=a.lastIndexOf("/");return t===-1?"(root)":a.slice(0,t)}function As(e){let a=Number(e);return!Number.isFinite(a)||a<=0?"\u2014":a<1024?`${a} B`:a<1024*1024?`${Math.round(a/1024)} KB`:`${Math.round(a/1024/1024*10)/10} MB`}function qs(e){if(!e)return"\u2014";let a=new Date(e);return Number.isNaN(a.getTime())?"\u2014":a.toLocaleDateString()}function Qn(){let e=new Date,a=e.getMonth()>=8?e.getFullYear():e.getFullYear()-1;return`${a}-${a+1}`}var He=e=>`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${e}</svg>`,xe=[{id:"server",label:"Server & network",icon:He('<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><path d="M6 6h.01M6 18h.01"/>')},{id:"access",label:"Student access",icon:He('<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>')},{id:"firewall",label:"Windows firewall",icon:He('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>')},{id:"database",label:"Database safety",icon:He('<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>')},{id:"offline",label:"Offline & CDNs",icon:He('<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>')},{id:"summary",label:"Summary",icon:He('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>')}];async function Es(e,a){let t=await _.get("admin/setup/diagnostics"),n=t?.data||t||{},s=xe.some(o=>o.id===a?.query?.step)?a.query.step:xe[0].id,r=[Vn(s),`<div data-ac-setup-step>${Kn(s,n,e)}</div>`].join("");function d(o){o.querySelectorAll("[data-ac-setup-goto]").forEach(p=>{p.addEventListener("click",()=>{ie(`/settings?section=setup&step=${encodeURIComponent(p.dataset.acSetupGoto)}`,{replace:!0})})});let c=o.querySelector("[data-ac-setup-next]");c&&c.addEventListener("click",()=>{let p=xe.findIndex(m=>m.id===s),l=xe[Math.min(xe.length-1,p+1)];ie(`/settings?section=setup&step=${encodeURIComponent(l.id)}`,{replace:!0})});let u=o.querySelector("[data-ac-setup-back]");u&&u.addEventListener("click",()=>{let p=xe.findIndex(m=>m.id===s),l=xe[Math.max(0,p-1)];ie(`/settings?section=setup&step=${encodeURIComponent(l.id)}`,{replace:!0})}),o.querySelector("[data-ac-copy-lan]")?.addEventListener("click",async()=>{await Cs(o.querySelector("#set-lan-address")?.value??""),v("The address was copied.","success")}),o.querySelector("[data-ac-copy-firewall]")?.addEventListener("click",async()=>{await Cs(o.querySelector("#set-firewall-command")?.value??""),v("The command was copied.","success")}),o.querySelector("[data-ac-show-qr]")?.addEventListener("click",async()=>{let p=o.querySelector("[data-ac-qr]");if(!p)return;let l=o.querySelector("#set-lan-address")?.value??"";p.hidden=!1,p.innerHTML='<p class="ac-field__hint">Generating the QR code\u2026</p>';try{await or();let m=window.qrcode(0,"M");m.addData(l),m.make(),p.innerHTML=m.createSvgTag(4,8)}catch(m){p.innerHTML=`<pre class="ac-pre">${x(l)}</pre><p class="ac-field__hint">${x(m.message)} \u2014 use the address above.</p>`}}),o.querySelectorAll("[data-ac-network-profile]").forEach(p=>{p.addEventListener("click",async()=>{try{await _.post("admin/setup/network-profile",{interfaceAlias:p.dataset.acNetworkProfile,category:p.dataset.acNetworkCategory||"Private"}),v("The network profile was changed.","success"),e.rerender()}catch(l){v(l.message,"error")}})}),o.querySelector("[data-ac-setup-backup]")?.addEventListener("click",async()=>{let p=o.querySelector("[data-ac-setup-backup-status]");p&&(p.textContent="Collecting\u2026");try{let l=(await _.get("console/export"))?.data;if(!l)throw new Error("The export was empty.");cr(new Blob([JSON.stringify(l,null,2)],{type:"application/json"}),`quiz-app-backup-${l.timestamp.slice(0,10)}.json`),p&&(p.textContent="The backup was downloaded."),v("Backup created.","success")}catch(l){p&&(p.textContent=l.message),v(l.message,"error")}}),o.querySelectorAll("[data-ac-firewall-check]").forEach(p=>{p.addEventListener("change",()=>{try{let g=localStorage.getItem(ba)||"[]",h=JSON.parse(g),w=p.dataset.acFirewallCheck,f=h.indexOf(w);p.checked&&f===-1&&h.push(w),!p.checked&&f!==-1&&h.splice(f,1),localStorage.setItem(ba,JSON.stringify(h))}catch{}let l=Va(),m=o.querySelector("[data-ac-firewall-status]");m&&(m.textContent=l?"All the manual checks are completed.":"Complete the checklist on the Firewall step.")})})}return{markup:r,bind:d}}function Vn(e){let a=xe.findIndex(t=>t.id===e);return`<nav class="ac-stepper" aria-label="Setup steps">
		${xe.map((t,n)=>`<button type="button" class="ac-stepper__step${t.id===e?" is-active":""}${n<a?" is-done":""}" data-ac-setup-goto="${x(t.id)}">
			<span class="ac-stepper__icon" aria-hidden="true">${t.icon}</span>
			<span class="ac-stepper__label">${x(t.label)}</span>
		</button>`).join("")}
	</nav>`}function Kn(e,a,t){let n=a.port||3e3,s=Array.isArray(a.lan)?a.lan:[],r=s.find(o=>o.recommended)||s[0]||null,d=r?`http://${r.address}:${n}`:`http://localhost:${n}`;switch(e){case"server":return Jn(a);case"access":return Zn(a,s,r,d,n);case"firewall":return Xn(a,n);case"database":return er(a);case"offline":return ar(a);case"summary":return tr(a,s);default:return L({title:"Unknown step",body:"<p>That step does not exist.</p>"})}}function Jn(e){let a=e.process||{},t=e.hostBinding==="0.0.0.0",n=e.nodeEnv!=="production";return L({title:"Server & network",subtitle:"This server must listen on every network interface so the students can reach it over Wi-Fi.",body:`<div class="ac-defs">
				${ue("Bind address",e.hostBinding||"0.0.0.0",t?"ok":"warn")}
				${ue("Port",String(rr(e)),"ok")}
				${ue("NODE_ENV",e.nodeEnv||"development",n?"ok":"warn")}
				${ue("Cookies",e.cookieSecure?"Secure (HTTPS only)":"Not secure (HTTP works)",e.cookieSecure?"warn":"ok")}
				${ue("Platform",a.platform||"\u2014")}
				${ue("Hostname",a.hostname||"\u2014")}
			</div>
			${e.cookieSecure?'<div class="ac-alert ac-alert--warning" style="margin-top:14px"><div class="ac-alert__body"><p class="ac-alert__title">Production mode detected</p><p class="ac-alert__text">The refresh cookie is marked <code>Secure</code>, so a browser will not send it over plain HTTP. For a classroom installation use <code>NODE_ENV=development</code>; for production, use HTTPS or a reverse proxy.</p></div></div>':""}`})}function Zn(e,a,t,n,s){return a.length?L({title:"Student access",subtitle:"The students must use the server's LAN address, not localhost. Share this URL, or let them scan the QR code.",body:`<div class="ac-primary-url">
				<p class="ac-primary-url__label">Students should open</p>
				<p class="ac-primary-url__value">${x(n)}</p>
				${t?`<p class="ac-primary-url__note">Recommended \u2014 the ${x(t.interface)} interface (a physical adapter).</p>`:""}
				<div class="ac-quick-actions" style="margin-top:12px">
					<button type="button" class="ac-btn" data-ac-copy-lan>Copy the address</button>
					<button type="button" class="ac-btn" data-ac-show-qr>Show the QR code</button>
				</div>
			</div>
			<div data-ac-qr hidden style="margin-top:16px"></div>
			${a.length>1?`<h4 class="ac-section-panel__title" style="margin:20px 0 8px">Every available address</h4>
					${q({columns:[{key:"interface",label:"Interface"},{key:"address",label:"URL",render:r=>`<code>http://${x(r.address)}:${x(String(s))}</code>`},{key:"type",label:"Type"},{key:"recommended",label:"Recommended",render:r=>r.recommended?'<span class="ac-badge ac-badge--success">yes</span>':r.type==="virtual"?'<span class="ac-badge ac-badge--warning">virtual</span>':'<span class="ac-badge">no</span>'}],rows:a})}`:""}
			<div class="ac-alert ac-alert--info" style="margin-top:16px"><div class="ac-alert__body"><p class="ac-alert__title">The students must not use <code>localhost</code></p><p class="ac-alert__text">On their own device <code>localhost</code> means the device itself. They must use the server's Wi-Fi address above. Virtual adapters (Hyper-V, WSL, Docker) are not reachable from another device.</p></div></div>`}):L({title:"Student access",subtitle:"The address the students use.",body:'<div class="ac-alert ac-alert--warning"><div class="ac-alert__body"><p class="ac-alert__title">No LAN address detected</p><p class="ac-alert__text">The server is not connected to Wi-Fi or Ethernet, so no other device can reach it.</p></div></div>'})}var js=[{id:"rule",label:"The inbound rule for the port exists",hint:"Run the PowerShell command above once, as an administrator."},{id:"private",label:"The network profile is Private",hint:"The server can set this for you with the button in the table above."},{id:"router",label:"The router allows the classroom Wi-Fi to reach the server",hint:"Some school routers block device-to-device traffic. Only the operator can see the router."},{id:"tested",label:"A student device opened the address above successfully",hint:"The real proof: open the student URL on a phone or a tablet on the classroom Wi-Fi."}],ba="quizConsoleFirewallChecks";function Va(){try{let e=localStorage.getItem(ba)||"[]",a=JSON.parse(e);return Array.isArray(a)&&a.length===js.length}catch{return!1}}function Xn(e,a){let t=Array.isArray(e.networkProfile)?e.networkProfile:[],n=Va();return L({title:"Windows firewall & network profile",subtitle:"Two things must be configured: the Windows network profile must be Private, and a firewall rule must allow inbound TCP on the port.",body:`<h4 class="ac-section-panel__title" style="margin:0 0 8px">Network profile</h4>
			${t.length?q({columns:[{key:"interface",label:"Interface"},{key:"name",label:"Connection"},{key:"category",label:"Category",render:s=>s.category==="Private"?'<span class="ac-badge ac-badge--success">Private</span>':s.category==="DomainAuthenticated"?'<span class="ac-badge">Domain</span>':'<span class="ac-badge ac-badge--warning">Public</span>'},{key:"actions",label:"",align:"right",render:s=>s.category==="Private"||s.category==="DomainAuthenticated"?'<span class="ac-table__muted">\u2014</span>':`<button type="button" class="ac-btn ac-btn--sm" data-ac-network-profile="${x(s.interface)}" data-ac-network-category="Private">Switch to Private</button>`}],rows:t}):`<p class="ac-field__hint">The network profile is only reported on Windows. Check it manually:</p>
					<pre class="ac-pre">Get-NetConnectionProfile | Select-Object Name, InterfaceAlias, NetworkCategory</pre>`}
			<h4 class="ac-section-panel__title" style="margin:20px 0 8px">The inbound rule</h4>
			<p class="ac-field__hint" style="margin-bottom:8px">Run this once in an administrator PowerShell on the machine that serves the app.</p>
			<textarea class="ac-input ac-input--full" id="set-firewall-command" rows="4" readonly>${x(ir(a))}</textarea>
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
				${js.map(s=>{let r=!1;try{let d=localStorage.getItem(ba)||"[]";r=JSON.parse(d).includes(s.id)}catch{r=!1}return`<label class="ac-check">
						<input type="checkbox" data-ac-firewall-check="${x(s.id)}" ${r?"checked":""} />
						<span>
							<span class="ac-check__label">${x(s.label)}</span>
							<span class="ac-check__hint">${x(s.hint)}</span>
						</span>
					</label>`}).join("")}
			</div>
			<p class="ac-field__hint" data-ac-firewall-status style="margin-top:8px">${n?"All four checks are confirmed. The Summary step now shows the setup as verified.":"None of this changes the application \u2014 it is a note to yourself. Tick what you have actually confirmed."}</p>`})}function er(e){let a=e.database||{},t=a.inferredInfo||{};return L({title:"Database safety",subtitle:"The database is a single SQLite file. Back it up before you change anything \u2014 the backup button is at the bottom of this step.",body:`<div class="ac-defs">
				${ue("Configured URL",a.url||"\u2014")}
				${a.inferred?ue("Prisma uses",a.inferred,t.exists?"ok":"fail"):""}
				${a.expected?ue("prisma/dev.db",a.expected.exists?`${a.expected.size||0} bytes`:"not found",a.expected.exists?"ok":"warn"):""}
				${a.rootDevDb&&a.rootDevDb.exists?ue("Root ./dev.db","found \u2014 may indicate a URL mismatch","warn"):""}
			</div>
			${a.rootDevDb&&a.rootDevDb.exists&&(!a.inferred||!t.exists)?'<div class="ac-alert ac-alert--warning" style="margin-top:14px"><div class="ac-alert__body"><p class="ac-alert__title">Database path inconsistency</p><p class="ac-alert__text">The <code>.env</code> file points at a different path than expected. The data may be in <code>./dev.db</code> instead of <code>prisma/dev.db</code> \u2014 back up both before reinstalling.</p></div></div>':""}
			<div class="ac-quick-actions" style="margin-top:16px">
				<button type="button" class="ac-btn ac-btn--primary" data-ac-setup-backup>Download a backup</button>
				<span class="ac-table__muted" data-ac-setup-backup-status></span>
			</div>`})}function ar(e){let a=Array.isArray(e.cdn)?e.cdn:[],t=a.filter(r=>r.vendored).length,n=a.length-t,s=a.filter(r=>!r.vendored&&r.ok).length;return L({title:"Offline & CDN dependencies",subtitle:"The frontend libraries are served locally. The only external dependency is the web font, and it is optional.",body:`${t>0?`<div class="ac-alert ac-alert--success" style="margin-bottom:14px"><div class="ac-alert__body"><p class="ac-alert__title">${t} libraries are vendored locally</p><p class="ac-alert__text">No internet access is required for any core feature.</p></div></div>`:""}
		${q({columns:[{key:"host",label:"Host",render:r=>`<code>${x(r.host||r.id||"")}</code>`},{key:"vendored",label:"Source",render:r=>r.vendored?'<span class="ac-badge ac-badge--success">vendored locally</span>':'<span class="ac-badge ac-badge--warning">remote</span>'},{key:"ok",label:"Reachable",render:r=>r.vendored?'<span class="ac-table__muted">not needed</span>':`<span class="ac-badge ac-badge--${r.ok?"success":"danger"}">${r.ok?"yes":"no"}</span>`},{key:"ms",label:"Time",align:"right",render:r=>r.vendored?"\u2014":r.ms!=null?`${r.ms} ms`:"\u2014"}],rows:a,empty:"No probe was run."})}
		${n>0&&s<n?'<div class="ac-alert ac-alert--warning" style="margin-top:14px"><div class="ac-alert__body"><p class="ac-alert__title">Some remote resources are unreachable</p><p class="ac-alert__text">Only the web font is affected \u2014 the application works with the system font stack.</p></div></div>':'<div class="ac-alert ac-alert--info" style="margin-top:14px"><div class="ac-alert__body"><p class="ac-alert__title">All the core dependencies are vendored</p><p class="ac-alert__text">The application works fully offline. The web font is the only optional external dependency.</p></div></div>'}`})}function tr(e,a){let t=nr(e,a),n=Va();return L({title:"Summary",subtitle:"Every classroom deployment check, and every part of the platform you can manage from here.",body:`<h4 class="ac-section-panel__title" style="margin:0 0 10px">The deployment checks</h4>
			<div class="ac-summary">
				${t.map(s=>`<div class="ac-summary__item">
							<span class="ac-badge ac-badge--${s.status==="ok"?"success":s.status==="warn"?"warning":"danger"}">${s.status==="ok"?"\u2713":s.status==="warn"?"\u26A0":"\u2717"}</span>
							<div>
								<p class="ac-summary__label">${x(s.label)}</p>
								<p class="ac-summary__detail">${x(s.detail)}</p>
								${s.action?`<button type="button" class="ac-btn ac-btn--sm" data-ac-setup-goto="${x(s.action.step)}">${x(s.action.label)}</button>`:""}
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
			${e.capacity?`<div class="ac-alert ac-alert--info" style="margin-top:14px"><div class="ac-alert__body"><p class="ac-alert__title">Configured capacity</p><p class="ac-alert__text">${x(String(e.capacity.maxUsers||100))} users and ${x(String(e.capacity.maxGamePlayers||30))} players per game. These are recorded values, not enforced limits.</p></div></div>`:""}
			<h4 class="ac-section-panel__title" style="margin:24px 0 6px">Manage the platform from here</h4>
			<p class="ac-field__hint" style="margin-bottom:12px">Every part of the control center, and what each one is for.</p>
			<div class="ac-manage-grid">
				${sr.map(s=>`<a class="ac-manage-card" href="${x(s.href)}">
						<span class="ac-manage-card__title">${x(s.title)}</span>
						<span class="ac-manage-card__desc">${x(s.desc)}</span>
					</a>`).join("")}
			</div>`})}var sr=[{href:"#/overview",title:"Overview",desc:"The workbench: control, access, credentials, maintenance, activity, analytics, documents, notes and planning."},{href:"#/organizations",title:"Organizations",desc:"Every tenant: create one, edit its profile, suspend it, reactivate it, remove it."},{href:"#/users",title:"Users & access",desc:"The hub: the account counts, the requests waiting for a decision, and the three rosters."},{href:"#/users/teachers",title:"Teachers",desc:"Add a teacher, change their role, suspend them, reset their password, remove them."},{href:"#/users/students",title:"Students",desc:"Add a student, move them to a class, suspend them, reset their password, remove them."},{href:"#/users/administrators",title:"Directors & administrators",desc:"The people who can administer: the school directors and the platform administrators."},{href:"#/analytics",title:"Platform analytics",desc:"Adoption, activity and engagement, per organization and per class."},{href:"#/audit",title:"Activity & audit",desc:"Every administrative action and every authentication event, searchable."},{href:"#/health",title:"System health",desc:"Availability, error rate, latency, the database, the storage and the scheduled work."},{href:"#/settings?section=general",title:"General settings",desc:"The organization identity, the quiz defaults and the appearance."},{href:"#/settings?section=profile",title:"My profile",desc:"Your own account, and your own password."},{href:"#/settings?section=access",title:"Users & access settings",desc:"The pending account requests and the pending profile changes."},{href:"#/settings?section=teaching",title:"Teacher access",desc:"The seventeen switches that decide what a teacher may reach in the classroom."},{href:"#/settings?section=realtime",title:"Realtime",desc:"The broadcast switches, the recovery code, the connected devices and the sync actions."},{href:"#/settings?section=presets",title:"Presets",desc:"The quiz presets and the game presets."},{href:"#/settings?section=documents",title:"Documents & data",desc:"The generated documents, the export, the import, the archives and the factory reset."},{href:"#/settings?section=ai",title:"Artificial intelligence",desc:"The providers, the keys, the models, the shared catalogue and your own model."},{href:"#/settings?section=roles",title:"Roles & permissions",desc:"What each role may do, and the full permission catalogue."},{href:"#/settings?section=deployment",title:"Deployment & session",desc:"Where this installation runs, and what this session can reach."}];function nr(e,a){let t=[],n=e.hostBinding==="0.0.0.0";t.push({id:"binding",label:`Server listening on ${e.hostBinding||"0.0.0.0"}:${e.port||3e3}`,status:n?"ok":"warn",detail:n?"Every network interface \u2014 the students can reach this server.":"The server is not bound to every interface.",action:n?null:{step:"server",label:"Look at the server step"}});let s=e.nodeEnv!=="production";t.push({id:"env",label:`NODE_ENV = ${e.nodeEnv||"development"}`,status:s?"ok":"warn",detail:s?"HTTP works for the login and refresh cookies.":"Production mode sets Secure cookies \u2014 HTTP sign-in will fail. Use HTTPS or NODE_ENV=development.",action:s?null:{step:"server",label:"Look at the server step"}}),t.push({id:"lan",label:a&&a.length?`${a.length} LAN address(es) found`:"No LAN address found",status:a&&a.length?"ok":"fail",detail:a&&a.length?a.map(o=>o.address).join(", "):"No IPv4 LAN interface was detected.",action:a&&a.length?{step:"access",label:"Show the address"}:null});let r=e.database||{},d=r.inferredInfo&&r.inferredInfo.exists;if(t.push({id:"database",label:"Database file exists",status:d?"ok":"warn",detail:r.inferred?`Prisma uses: ${r.inferred}`:"The database path could not be resolved.",action:{step:"database",label:"Open the database step"}}),Array.isArray(e.cdn)&&e.cdn.length){let o=e.cdn.filter(c=>c.ok).length;t.push({id:"cdn",label:`Resource reachability: ${o}/${e.cdn.length}`,status:o===e.cdn.length?"ok":o>0?"warn":"fail",detail:o===e.cdn.length?"Every probed resource answered.":"Some resources are unreachable \u2014 an offline or restricted network.",action:{step:"offline",label:"Open the offline step"}})}return t.push({id:"realtime",label:"The realtime channel",status:"ok",detail:"There is no separate realtime server: the pages, the API and the realtime channel are served by this one process, on this one port.",action:{step:"access",label:"Show the student address"}}),t.push({id:"fonts",label:"The web font is served locally",status:"ok",detail:"The interface fonts are vendored under public/fonts/, so the application renders with no internet access.",action:{step:"offline",label:"Open the offline step"}}),t}function ue(e,a,t=""){let n=t==="ok"?'<span class="ac-badge ac-badge--success">\u2713</span>':t==="warn"?'<span class="ac-badge ac-badge--warning">\u26A0</span>':t==="fail"?'<span class="ac-badge ac-badge--danger">\u2717</span>':"";return`<div class="ac-defs__item">
		<p class="ac-defs__term">${x(e)}</p>
		<p class="ac-defs__desc">${x(a)} ${n}</p>
	</div>`}function rr(e){return e.port||3e3}function ir(e){return`New-NetFirewallRule -DisplayName "Quiz Portal ${e}" -Direction Inbound -Action Allow -Protocol TCP -LocalPort ${e}`}async function Cs(e){try{await navigator.clipboard.writeText(e)}catch{let a=document.createElement("textarea");a.value=e,document.body.appendChild(a),a.select(),document.execCommand("copy"),a.remove()}}function or(){return typeof window.qrcode=="function"?Promise.resolve():new Promise((e,a)=>{let t=document.createElement("script");t.src="/qrcode-generator.js",t.onload=()=>{typeof window.qrcode=="function"?e():a(new Error("The QR generator could not be loaded."))},t.onerror=()=>a(new Error("The QR generator could not be loaded.")),document.head.appendChild(t)})}function cr(e,a){let t=URL.createObjectURL(e),n=document.createElement("a");n.href=t,n.download=a,document.body.appendChild(n),n.click(),n.remove(),setTimeout(()=>URL.revokeObjectURL(t),2e3)}var lr=[{value:"openrouter",label:"OpenRouter \u2014 all providers, free tier"},{value:"openai",label:"OpenAI (GPT family)"},{value:"anthropic",label:"Anthropic (Claude)"},{value:"google",label:"Google AI (Gemini)"},{value:"deepseek",label:"DeepSeek"},{value:"custom",label:"Custom / Local (Ollama, LM Studio\u2026)"}],dr={openrouter:"https://openrouter.ai/keys",openai:"https://platform.openai.com/api-keys",anthropic:"https://console.anthropic.com/settings/keys",google:"https://aistudio.google.com/app/apikey",deepseek:"https://platform.deepseek.com/api_keys"};async function zs(e){let a=await _.get("ai/configs"),t=Array.isArray(a?.data)?a.data:[],n=t.filter(o=>o.is_shared),s=t.filter(o=>!o.is_shared),r=[L({title:"Nothing here is required",subtitle:"The platform works fully without an AI provider.",body:`<div class="ac-alert ac-alert--info">
					<div class="ac-alert__body">
						<p class="ac-alert__title">Optional by design</p>
						<p class="ac-alert__text">Without a configured model, question generation returns a generated set rather than an error, and image generation falls back to text options. A LAN installation can point a custom provider at a model server on the local network \u2014 no internet access is required for that either.</p>
					</div>
				</div>`}),L({title:"Load models from a provider",subtitle:"Enter the provider key once, fetch the live model list, then publish the models the teachers should see.",body:`<div class="ac-field-grid">
					${U({id:"set-ai-provider",label:"Provider",options:lr,value:"openrouter"})}
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
				</div>`}),L({title:"Shared models",subtitle:"The models every teacher in this organization may use.",body:n.length?q({columns:[{key:"name",label:"Name",render:o=>`<span class="ac-table__primary">${x(o.name)}</span><br><span class="ac-table__muted">${x(o.provider)} \xB7 ${x(o.model_id)}</span>`},{key:"key_hint",label:"Key",render:o=>o.has_key?`<code>${x(o.key_hint||"\u2022\u2022\u2022\u2022")}</code>`:'<span class="ac-badge">none (local server)</span>'},{key:"is_default",label:"Default",render:o=>o.is_default?'<span class="ac-badge ac-badge--success">yes</span>':'<span class="ac-badge">no</span>'},{key:"actions",label:"",align:"right",render:o=>`<button type="button" class="ac-btn ac-btn--sm" data-ac-ai-test="${x(o.id)}">Test</button> <button type="button" class="ac-btn ac-btn--sm" data-ac-ai-delete="${x(o.id)}">Delete</button>`}],rows:n}):'<p class="ac-empty__message">No shared model yet. Load a provider list above and publish the models the teachers should use.</p>'}),L({title:"My own model",subtitle:"Private to you. A local server needs no key at all.",body:`<div class="ac-field-grid">
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
				${s.length?q({columns:[{key:"name",label:"Model",render:o=>`<span class="ac-table__primary">${x(o.name)}</span><br><span class="ac-table__muted">${x(o.provider)} \xB7 ${x(o.model_id)}</span>`},{key:"actions",label:"",align:"right",render:o=>`<button type="button" class="ac-btn ac-btn--sm" data-ac-ai-test="${x(o.id)}">Test</button> <button type="button" class="ac-btn ac-btn--sm" data-ac-ai-delete="${x(o.id)}">Delete</button>`}],rows:s}):'<p class="ac-empty__message">You have no personal model yet.</p>'}`})].join("");function d(o){let c=o.querySelector("[data-ac-ai-status]"),u=b=>{c&&(c.textContent=b)},p=o.querySelector("#set-ai-provider"),l=o.querySelector("[data-ac-ai-base]"),m=o.querySelector("#set-ai-key"),g=()=>{let b=p?.value||"";if(l&&(l.hidden=b!=="custom"),m){let y=dr[b];m.placeholder=b==="custom"?"Not needed for a local server":"sk-\u2026"}};p?.addEventListener("change",g),g();let h=[],w=()=>{let b=o.querySelector("[data-ac-ai-models]");if(b){if(!h.length){b.innerHTML='<p class="ac-empty__message">The provider returned no model.</p>';return}b.innerHTML=`<div class="ac-model-catalog">
				${h.map(y=>`<label class="ac-model-catalog__item">
					<input type="checkbox" value="${x(y.id)}" data-ac-ai-model />
					<span class="ac-model-catalog__name">${x(y.label||y.id)}</span>
					<code class="ac-model-catalog__id">${x(y.id)}</code>
				</label>`).join("")}
			</div>`}},f=o.querySelector("#set-ai-model-filter");f?.addEventListener("input",()=>{let b=f.value.trim().toLowerCase();o.querySelectorAll(".ac-model-catalog__item").forEach($=>{let C=$.textContent.toLowerCase();$.hidden=b!==""&&!C.includes(b)})}),o.querySelector("[data-ac-ai-load]")?.addEventListener("click",async()=>{u("Loading\u2026");try{let b=o.querySelector("#set-ai-provider")?.value,y=o.querySelector("#set-ai-key")?.value||void 0,$=o.querySelector("#set-ai-base-url")?.value||void 0,C=await _.post("ai/models/refresh",{provider:b,api_key:y||void 0,base_url:$||void 0});h=Array.isArray(C?.data)?C.data:[];let j=o.querySelector("[data-ac-ai-catalog]");j&&(j.hidden=!1),w(),u(`${h.length} model(s) returned.`)}catch(b){u(b.message),v(b.message,"error")}}),o.querySelector("[data-ac-ai-test-key]")?.addEventListener("click",async()=>{u("Testing\u2026");try{let b=o.querySelector("#set-ai-provider")?.value,y=o.querySelector("#set-ai-key")?.value||void 0,$=o.querySelector("#set-ai-base-url")?.value||void 0,C=await _.post("ai/models/refresh",{provider:b,api_key:y||void 0,base_url:$||void 0}),j=Array.isArray(C?.data)?C.data.length:0;u(j?`The provider answered: ${j} model(s).`:"The provider answered but returned no model.")}catch(b){u(b.message)}}),o.querySelector("[data-ac-ai-publish]")?.addEventListener("click",async()=>{let b=Array.from(o.querySelectorAll("[data-ac-ai-model]:checked")).map(j=>j.value);if(!b.length){v("Select at least one model to publish.","error");return}let y=o.querySelector("#set-ai-provider")?.value,$=o.querySelector("#set-ai-key")?.value||void 0,C=o.querySelector("#set-ai-base-url")?.value||void 0;try{for(let j of b)await _.post("ai/configs",{provider:y,name:j,model_id:j,base_url:y==="custom"?C:void 0,api_key:$||void 0,shared:!0});v(`${b.length} model(s) published.`,"success"),e.rerender()}catch(j){v(j.message,"error")}}),o.querySelector("[data-ac-ai-save-personal]")?.addEventListener("click",async()=>{let b=o.querySelector("[data-ac-ai-personal-status]"),y=E=>o.querySelector(`#${E}`)?.value?.trim()??"",$=y("set-ai-personal-name"),C=y("set-ai-personal-model"),j=y("set-ai-personal-base"),R=y("set-ai-personal-key");if(!$||!C){v("A display name and a model id are required.","error");return}try{await _.post("ai/configs",{provider:j?"custom":"openrouter",name:$,model_id:C,base_url:j||void 0,api_key:R||void 0,shared:!1}),b&&(b.textContent="Saved."),v("Your model was saved.","success"),e.rerender()}catch(E){b&&(b.textContent=E.message),v(E.message,"error")}}),o.querySelectorAll("[data-ac-ai-test]").forEach(b=>{b.addEventListener("click",async()=>{try{let y=await _.post(`ai/configs/${encodeURIComponent(b.dataset.acAiTest)}/test`);v(y?.message||(y?.ok?"The model is reachable.":"The model did not answer."),y?.ok?"success":"error")}catch(y){v(y.message,"error")}})}),o.querySelectorAll("[data-ac-ai-delete]").forEach(b=>{b.addEventListener("click",async()=>{if(await D({title:"Delete this model?",message:"The model is removed from the server. Anyone using it will have to pick another one.",confirmLabel:"Delete model",danger:!0}))try{await _.del(`ai/configs/${encodeURIComponent(b.dataset.acAiDelete)}`),v("The model was deleted.","success"),e.rerender()}catch($){v($.message,"error")}})})}return{markup:r,bind:d}}async function Ps(){let e=await _.get("console/roles"),a=e.roles||[],t=e.catalog||[];return{markup:[L({title:"Roles",subtitle:"The roles the platform knows, and what each one may do.",body:q({columns:[{key:"label",label:"Role",render:s=>`<span class="ac-table__primary">${x(s.label)}</span><br><span class="ac-table__muted">${x(s.description||"")}</span>`},{key:"key",label:"Key",render:s=>`<code>${x(s.key)}</code>`},{key:"scopeLabel",label:"Scope",render:s=>`<span class="ac-badge">${x(s.scopeLabel)}</span>`},{key:"permissions",label:"Permissions",align:"right",render:s=>String(s.permissions.length)},{key:"isAssignable",label:"Assignable",render:s=>`<span class="ac-badge ac-badge--${s.isAssignable?"success":""}">${s.isAssignable?"yes":"no"}</span>`}],rows:a})}),L({title:"Permission catalog",subtitle:"Every capability, grouped by the scope it applies in.",body:t.map(s=>`<h4 class="ac-section-panel__title" style="margin:14px 0 6px">${x(s.group)}</h4>${q({columns:[{key:"label",label:"Permission",render:r=>`<span class="ac-table__primary">${x(r.label)}</span><br><span class="ac-table__muted">${x(r.description||"")}</span>`},{key:"id",label:"Identifier",render:r=>`<code>${x(r.id)}</code>`}],rows:s.permissions})}`).join("")})].join(""),bind:null}}async function Ns(e){let a=e.session||{},t=a.deployment||{},n=e.organization||{};return{markup:[L({title:"Deployment & session",subtitle:"Where this installation runs, and what this session can reach.",body:`<div class="ac-defs">
					<div class="ac-defs__item">
						<p class="ac-defs__term">Deployment mode</p>
						<p class="ac-defs__desc">${x(t.mode||"\u2014")}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Database provider</p>
						<p class="ac-defs__desc">${x(t.dbProvider||"\u2014")}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Signed in as</p>
						<p class="ac-defs__desc">${x(a.user?.name||"")}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Role</p>
						<p class="ac-defs__desc">${x(a.user?.roleLabel||a.user?.role||"")}</p>
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
				</div>`}),L({title:"Plan and capacity",subtitle:"Observed configuration \u2014 nothing is enforced from it.",body:`<div class="ac-alert ac-alert--info">
					<div class="ac-alert__body">
						<p class="ac-alert__title">Plan and capacity are observed, not enforced</p>
						<p class="ac-alert__text">The business model does not support subscriptions or quotas yet. The plan and the student capacity recorded on the organization are displayed for information only \u2014 no entitlement is derived from them.</p>
					</div>
				</div>
				<div class="ac-defs">
					<div class="ac-defs__item">
						<p class="ac-defs__term">Plan</p>
						<p class="ac-defs__desc">${x(n?.plan||"\u2014")}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Student capacity</p>
						<p class="ac-defs__desc">${x(String(n?.maxStudents??"\u2014"))}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Academic year</p>
						<p class="ac-defs__desc">${x(n?.schoolYear||"not set")}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Organization status</p>
						<p class="ac-defs__desc">${x(n?.status||"\u2014")}</p>
					</div>
				</div>`})].join(""),bind:null}}var Ze=[{id:"general",label:"General",icon:"general"},{id:"profile",label:"My profile",icon:"profile"},{id:"access",label:"Users & access",icon:"access"},{id:"teaching",label:"Teacher access",icon:"teaching"},{id:"realtime",label:"Realtime",icon:"realtime"},{id:"presets",label:"Presets",icon:"presets"},{id:"documents",label:"Documents & data",icon:"data"},{id:"setup",label:"Setup & diagnostics",icon:"setup"},{id:"ai",label:"Artificial intelligence",icon:"ai"},{id:"roles",label:"Roles & permissions",icon:"roles"},{id:"deployment",label:"Deployment & session",icon:"deployment"}],pr={general:us,profile:ms,access:hs,teaching:gs,realtime:_s,presets:Ts,documents:Ls,setup:Es,ai:zs,roles:Ps,deployment:Ns},Ms={id:"settings",path:"/settings",title:"Application Settings",description:"General configuration, the organization profile, access, data and the deployment \u2014 as a page, not a dialog.",permission:["platform.settings.manage","school.settings.manage"],async render(e,a,t){let n=Ze.some(p=>p.id===t.query?.section)?t.query.section:Ze[0].id;e.innerHTML=`<div class="ac-split" data-ac-settings>
			<div class="ac-split__main" data-ac-settings-main>${H(5)}</div>
			<div data-ac-settings-menu></div>
		</div>`;let s=e.querySelector(".ac-split"),r=e.querySelector("[data-ac-settings-menu]"),d=e.querySelector("[data-ac-settings-main]"),o=0,c=cs();s.classList.toggle("ac-split--collapsed",c),r.innerHTML=is({sections:Ze,active:n,collapsed:c}),os(e,{onSelect:p=>{ie(`/settings?section=${encodeURIComponent(p)}`,{replace:!0})}}),await(async p=>{let l=++o;d.innerHTML=H(4);let m=pr[p];if(!m){d.innerHTML=O({title:"Unknown section",message:`There is no settings section called "${p}".`});return}try{let{markup:g,bind:h}=await m(a,t);if(l!==o)return;d.innerHTML=g,typeof h=="function"&&h(d,a)}catch(g){if(l!==o)return;d.innerHTML=O({title:"This section could not be loaded",message:g.message})}})(n)}};async function Se(){let e=await _.get("settings/admin"),a=new Map;for(let t of Array.isArray(e)?e:[])a.set(t.key,t);return a}async function X(e,a){let t=typeof a=="string"?a:JSON.stringify(a);await _.patch(`settings/${encodeURIComponent(e)}`,{key:e,value:t})}var Rs={id:"organization-detail",path:"/organizations/:id",title:"Organization",description:"Profile, accounts, usage, activity and administrative history.",permission:["platform.organizations.read","school.profile.read"],async render(e,a,t){let n=t.params?.id;e.innerHTML=`<div class="ac-stack" data-ac-org-detail>${H(4)}</div>`;let s;try{s=(await _.get(`console/organizations/${encodeURIComponent(n)}`)).data}catch(u){e.innerHTML=O({title:"This organization could not be loaded",message:u.message});return}let r=s.organization,d=s.usage,o=a.isPlatform||(a.session.permissions||[]).includes("school.profile.manage");a.setTitle(r.name,`${r.slug} \xB7 ${r.schoolType||"organization"}${r.schoolYear?` \xB7 academic year ${r.schoolYear}`:""}`),e.innerHTML=`
			${G({chips:'<a class="ac-btn" href="#/organizations">\u2190 All organizations</a>',actions:o?`<button type="button" class="ac-btn" data-ac-toggle-status>${r.status==="suspended"?"Reactivate organization":"Suspend organization"}</button>`:""})}

			<div class="ac-panel">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title">${i(r.name)}</h3>
						<p class="ac-panel__subtitle">${i(r.slug)} \xB7 ${i(r.schoolType||"\u2014")}${r.schoolYear?` \xB7 academic year ${i(r.schoolYear)}`:""}</p>
					</div>
					<div class="ac-panel__actions">
						<span class="ac-badge ${r.status==="active"?"ac-badge--success":r.status==="pending"?"ac-badge--warning":"ac-badge--danger"}">${i(r.status)}</span>
					</div>
				</div>
				<div class="ac-panel__body">
					<div class="ac-defs">
						<div class="ac-defs__item">
							<p class="ac-defs__term">Plan</p>
							<p class="ac-defs__desc">${i(r.plan||"\u2014")}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">City</p>
							<p class="ac-defs__desc">${i(r.city||"\u2014")}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Contact</p>
							<p class="ac-defs__desc">${i(r.email||r.phone||"\u2014")}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Created</p>
							<p class="ac-defs__desc">${i(N(r.createdAt,{withTime:!1}))}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Last activity</p>
							<p class="ac-defs__desc">${d.lastActivity?i(W(d.lastActivity)):"never"}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Student capacity</p>
							<p class="ac-defs__desc">${i(String(r.maxStudents??"\u2014"))}</p>
						</div>
					</div>
					${r.status==="suspended"?`<div class="ac-alert ac-alert--danger" style="margin-top:16px">
								<div class="ac-alert__body">
									<p class="ac-alert__title">Access is suspended</p>
									<p class="ac-alert__text">${r.suspendedReason?i(r.suspendedReason):"No reason was recorded."} \xB7 suspended ${i(N(r.suspendedAt))}</p>
								</div>
							</div>`:""}
				</div>
			</div>

			<div class="ac-grid ac-grid--kpi" style="margin-top:16px">
				${T({label:"Teachers",value:k(d.teachers),note:`${k(d.activeTeachers)} active in 30 days`,tone:"primary",tooltip:"Teacher accounts, and how many produced a recorded event in the last 30 days."})}
				${T({label:"Students",value:k(d.students),note:`${k(d.activeStudents)} active in 30 days`,tone:"primary",tooltip:"Student accounts, and how many produced a recorded event in the last 30 days."})}
				${T({label:"Attempts (30d)",value:k(d.attempts30d),note:`${k(d.formalAttempts30d)} formal`,tooltip:"Completed attempts of any mode inside the last 30 days."})}
				${T({label:"Content",value:k(d.questions+d.exams),note:`${k(d.questions)} questions \xB7 ${k(d.exams)} exams`,tooltip:"Rows that exist in this organization. These are totals, not period counts."})}
				${T({label:"Needs attention",value:k(d.suspendedAccounts+d.pendingRequests),note:`${k(d.suspendedAccounts)} suspended \xB7 ${k(d.pendingRequests)} pending`,tone:d.suspendedAccounts+d.pendingRequests>0?"warning":"",tooltip:"Suspended accounts and account requests awaiting a decision."})}
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
						${q({columns:[{key:"name",label:"Account",render:u=>`<a href="#/users/${u.id}" class="ac-table__primary">${i(u.name)}</a><br><span class="ac-table__muted">${i(u.username)}</span>`},{key:"status",label:"Status",render:u=>`<span class="ac-badge ac-badge--${u.status==="active"?"success":"warning"}">${i(u.status)}</span>`},{key:"lastLogin",label:"Last sign-in",render:u=>u.lastLogin?i(W(u.lastLogin)):"never"}],rows:s.administrators,empty:"This organization has no administrator account."})}
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
						${q({columns:[{key:"name",label:"Class",render:u=>`<span class="ac-table__primary">${i(u.name)}</span>`},{key:"studentCount",label:"Students",align:"right"},{key:"createdAt",label:"Created",render:u=>i(N(u.createdAt,{withTime:!1}))}],rows:s.classes,empty:"No class has been created in this organization."})}
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
						${q({columns:[{key:"name",label:"Teacher",render:u=>`<a href="#/users/${u.id}" class="ac-table__primary">${i(u.name)}</a>`},{key:"active",label:"Active (30d)",render:u=>u.active?'<span class="ac-badge ac-badge--success">yes</span>':'<span class="ac-badge ac-badge--warning">no</span>'},{key:"lastLogin",label:"Last sign-in",render:u=>u.lastLogin?i(W(u.lastLogin)):"never"}],rows:s.teachers,empty:"No teacher account in this organization."})}
					</div>
				</section>
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles"><h3 class="ac-panel__title">Students</h3></div>
					</div>
					<div class="ac-panel__body ac-panel__body--flush">
						${q({columns:[{key:"name",label:"Student",render:u=>`<a href="#/users/${u.id}" class="ac-table__primary">${i(u.name)}</a>`},{key:"active",label:"Active (30d)",render:u=>u.active?'<span class="ac-badge ac-badge--success">yes</span>':'<span class="ac-badge ac-badge--warning">no</span>'},{key:"lastLogin",label:"Last sign-in",render:u=>u.lastLogin?i(W(u.lastLogin)):"never"}],rows:s.students,empty:"No student account in this organization."})}
					</div>
				</section>
			</div>

			<div class="ac-section">
				<h2 class="ac-section__title">Administrative history</h2>
				<p class="ac-section__hint">The fifteen most recent recorded actions inside this organization.</p>
			</div>
			<section class="ac-panel">
				<div class="ac-panel__body ac-panel__body--flush">
					${q({columns:[{key:"occurredAt",label:"When",render:u=>i(N(u.occurredAt))},{key:"actorName",label:"Actor",render:u=>i(u.actorName||"system")},{key:"action",label:"Action"},{key:"entityType",label:"Entity"},{key:"outcome",label:"Outcome",render:u=>`<span class="ac-badge ac-badge--${u.outcome==="success"?"success":"warning"}">${i(u.outcome)}</span>`}],rows:s.recentActivity,empty:"No administrative action has been recorded for this organization."})}
				</div>
			</section>`;let c=e.querySelector("[data-ac-toggle-status]");c&&c.addEventListener("click",async()=>{let u=r.status!=="suspended";if(!await D({title:u?"Suspend this organization?":"Reactivate this organization?",message:u?"Suspending revokes access for every account in this organization. Their data is retained.":"Reactivating restores access for the accounts that were suspended with the organization.",detail:u?"The action is recorded in the audit trail with the reason you give.":"",confirmLabel:u?"Suspend":"Reactivate",danger:u}))return;let l=null;if(!(u&&(l=window.prompt("Reason for suspending (recorded in the audit trail):",""),l===null)))try{await _.patch(`console/organizations/${encodeURIComponent(n)}`,{status:u?"suspended":"active",reason:l||null}),v(u?"Organization suspended.":"Organization reactivated.","success"),a.rerender()}catch(m){v(m.message,"error")}})}};var Os={super_admin:"Platform administrator",admin:"Organization administrator",teacher:"Teacher",student:"Student"},Is={id:"user-detail",path:"/users/:id",title:"Account",description:"Profile, access, recent activity and the administrative actions available.",permission:["platform.users.read","school.users.read"],async render(e,a,t){let n=t.params?.id;e.innerHTML=`<div class="ac-stack" data-ac-user-detail>${H(4)}</div>`;let s;try{s=(await _.get(`console/users/${encodeURIComponent(n)}`)).data}catch(c){e.innerHTML=O({title:"This account could not be loaded",message:c.message});return}let r=s.account,d=a.isPlatform||(a.session.permissions||[]).includes("school.users.manage"),o=a.isPlatform||(a.session.permissions||[]).includes("school.roles.manage");a.setTitle(r.name||r.username,`${Os[r.role]||r.role} \xB7 ${s.organization?.name||"organization"} \xB7 ${r.status}`),e.innerHTML=`
			${G({chips:'<a class="ac-btn" href="#/users">\u2190 All accounts</a>',actions:`${d?`<button type="button" class="ac-btn" data-ac-toggle-status>${r.status==="active"?"Suspend account":"Reactivate account"}</button>`:""}
				${o?'<button type="button" class="ac-btn" data-ac-change-role>Change role</button>':""}
				${o?'<button type="button" class="ac-btn" data-ac-grant>Grant permission</button>':""}
				<button type="button" class="ac-btn" data-ac-revoke-sessions>Revoke sessions</button>
				${d&&String(r.id)!==String(a.session.user?.id)?'<button type="button" class="ac-btn" data-ac-reset-credential>Reset credential</button>':""}
				${d&&String(r.id)!==String(a.session.user?.id)?'<button type="button" class="ac-btn ac-btn--danger" data-ac-delete-account>Delete account</button>':""}`})}

			<div class="ac-panel">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title">${i(r.name||r.username)}</h3>
						<p class="ac-panel__subtitle">${i(r.username)}${r.email?` \xB7 ${i(r.email)}`:""}</p>
					</div>
					<div class="ac-panel__actions">
						<span class="ac-badge ac-badge--brand">${i(Os[r.role]||r.role)}</span>
						<span class="ac-badge ac-badge--${r.status==="active"?"success":r.status==="suspended"?"danger":"warning"}">${i(r.status)}</span>
					</div>
				</div>
				<div class="ac-panel__body">
					<div class="ac-defs">
						<div class="ac-defs__item">
							<p class="ac-defs__term">Organization</p>
							<p class="ac-defs__desc">${i(s.organization?.name||"\u2014")}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Class</p>
							<p class="ac-defs__desc">${i(s.class?.name||"\u2014")}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Student number</p>
							<p class="ac-defs__desc">${i(r.numero||"\u2014")}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Last sign-in</p>
							<p class="ac-defs__desc">${r.lastLogin?i(W(r.lastLogin)):"never"}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Account created</p>
							<p class="ac-defs__desc">${i(N(r.createdAt,{withTime:!1}))}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Attempts (30d)</p>
							<p class="ac-defs__desc">${k(s.activity.attempts30d)}</p>
						</div>
					</div>
				</div>
			</div>

			<div class="ac-grid ac-grid--kpi" style="margin-top:16px">
				${T({label:"Attempts (30d)",value:k(s.activity.attempts30d),note:`${k(s.activity.formalAttempts30d)} formal`,tooltip:"Completed attempts of any mode inside the last 30 days."})}
				${T({label:"Last sign-in",value:r.lastLogin?i(W(r.lastLogin)):"never",tone:r.lastLogin?"primary":"warning",tooltip:"From the recorded authentication trail."})}
				${T({label:"Permission overrides",value:k(s.permissionOverrides.length),note:s.permissionOverrides.length?"grants or denies on top of the role":"role baseline only",tone:s.permissionOverrides.length?"warning":"",tooltip:"Individual permissions granted to, or denied from, this account on top of what its role carries."})}
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
					${s.permissionOverrides.length?q({columns:[{key:"permission",label:"Permission",render:c=>`<code>${i(c.permission)}</code>`},{key:"effect",label:"Effect",render:c=>`<span class="ac-badge ac-badge--${c.effect==="grant"?"success":"danger"}">${i(c.effect)}</span>`},{key:"scopeKey",label:"Applies to",render:c=>i(c.scopeKey==="*"?"every scope":c.scopeKey)},{key:"reason",label:"Reason",render:c=>i(c.reason||"\u2014")},{key:"createdAt",label:"Recorded",render:c=>i(N(c.createdAt))},{key:"actions",label:"",className:"ac-table__actions",render:c=>o?`<button type="button" class="ac-btn ac-btn--sm" data-ac-remove-override="${i(c.permission)}">Remove</button>`:""}],rows:s.permissionOverrides}):B({title:"No overrides",message:"This account holds exactly the permissions its role carries. Nothing has been granted or denied on top."})}
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
						${q({columns:[{key:"dateTaken",label:"When",render:c=>i(N(c.dateTaken))},{key:"mode",label:"Mode"},{key:"score20",label:"Score",align:"right",render:c=>c.mode==="exam"?`${c.score20.toFixed(2)} /20`:`${Math.round(c.score)}%`}],rows:s.recentResults,empty:"This account has no recorded attempt."})}
					</div>
				</section>
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles"><h3 class="ac-panel__title">Administrative actions</h3></div>
					</div>
					<div class="ac-panel__body ac-panel__body--flush">
						${q({columns:[{key:"occurredAt",label:"When",render:c=>i(N(c.occurredAt))},{key:"action",label:"Action"},{key:"entityType",label:"Entity"},{key:"outcome",label:"Outcome",render:c=>`<span class="ac-badge ac-badge--${c.outcome==="success"?"success":"warning"}">${i(c.outcome)}</span>`}],rows:s.recentActivity,empty:"This account has performed no recorded administrative action."})}
					</div>
				</section>
			</div>`,ur(e,a,n,r,s)}};function ur(e,a,t,n,s){let r=e.querySelector("[data-ac-toggle-status]");r&&r.addEventListener("click",async()=>{let l=n.status==="active";if(!await D({title:l?"Suspend this account?":"Reactivate this account?",message:l?"The account will not be able to sign in. Its data is retained.":"The account will be able to sign in again.",detail:"The action is recorded in the audit trail and in the security event trail.",confirmLabel:l?"Suspend":"Reactivate",danger:l}))return;let g=null;if(!(l&&(g=window.prompt("Reason for suspending (recorded in the audit trail):",""),g===null)))try{await _.patch(`console/users/${encodeURIComponent(t)}`,{status:l?"suspended":"active",reason:g||null}),v(l?"Account suspended.":"Account reactivated.","success"),a.rerender()}catch(h){v(h.message,"error")}});let d=e.querySelector("[data-ac-change-role]");d&&d.addEventListener("click",async()=>{let m=I({title:"Change the role of this account",subtitle:"The change is recorded in the audit trail with the previous role.",body:`<div class="ac-field">
					<label class="ac-field__label" for="ac-new-role">New role</label>
					<select class="ac-select" id="ac-new-role">
						${[{value:"admin",label:"Organization administrator"},{value:"teacher",label:"Teacher"},{value:"student",label:"Student"}].map(g=>`<option value="${g.value}"${g.value===n.role?" selected":""}>${g.label}</option>`).join("")}
					</select>
				</div>`,footer:`
					<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
					<button type="button" class="ac-btn ac-btn--primary" data-ac-confirm>Change role</button>
				`});m.root.querySelector("[data-ac-cancel]").addEventListener("click",m.close),m.root.querySelector("[data-ac-confirm]").addEventListener("click",async()=>{let g=m.root.querySelector("#ac-new-role").value;m.close();try{await _.patch(`console/users/${encodeURIComponent(t)}`,{role:g}),v("Role updated.","success"),a.rerender()}catch(h){v(h.message,"error")}})});let o=e.querySelector("[data-ac-grant]");o&&o.addEventListener("click",async()=>{let l=[];try{l=((await _.get("console/roles")).catalog||[]).flatMap(w=>w.permissions)}catch{v("The permission catalog could not be loaded.","error");return}let m=new Set(s.permissionOverrides.map(h=>h.permission)),g=I({title:"Grant or deny a permission",subtitle:"Grants and denies sit on top of the role. A deny removes a permission the role carries.",body:`<div class="ac-field">
						<label class="ac-field__label" for="ac-permission">Permission</label>
						<select class="ac-select" id="ac-permission">
							${l.map(h=>`<option value="${h.id}"${m.has(h.id)?" disabled":""}>${h.label} \u2014 ${h.id}</option>`).join("")}
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
				`});g.root.querySelector("[data-ac-cancel]").addEventListener("click",g.close),g.root.querySelector("[data-ac-confirm]").addEventListener("click",async()=>{let h=g.root.querySelector("#ac-permission").value,w=g.root.querySelector("#ac-effect").value,f=g.root.querySelector("#ac-override-reason").value||null;g.close();try{await _.post(`console/users/${encodeURIComponent(t)}/permissions`,{permission:h,effect:w,reason:f}),v("Permission override applied.","success"),a.rerender()}catch(b){v(b.message,"error")}})}),e.querySelectorAll("[data-ac-remove-override]").forEach(l=>{l.addEventListener("click",async()=>{let m=l.dataset.acRemoveOverride;if(await D({title:"Remove this override?",message:`The account returns to the permissions its role carries. "${m}" is no longer individually granted or denied.`,confirmLabel:"Remove override"}))try{await _.del(`console/users/${encodeURIComponent(t)}/permissions/${encodeURIComponent(m)}`),v("Override removed.","success"),a.rerender()}catch(h){v(h.message,"error")}})});let c=e.querySelector("[data-ac-revoke-sessions]");c&&c.addEventListener("click",async()=>{if(await D({title:"Revoke every session of this account?",message:"All sign-ins of this account end immediately. The next sign-in starts a new session.",detail:"The revocation is recorded in the security event trail.",confirmLabel:"Revoke sessions",danger:!0}))try{await _.del(`console/users/${encodeURIComponent(t)}/sessions`),v("Sessions revoked.","success")}catch(m){v(m.message,"error")}});let u=e.querySelector("[data-ac-reset-credential]");u&&u.addEventListener("click",()=>{let l=I({title:"Reset this credential",subtitle:"The account keeps everything except its password. Every live session of the account is revoked and the change is recorded in the audit trail.",body:`<div class="ac-field">
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
				`}),m=l.root.querySelector("#ac-new-password"),g=l.root.querySelector("#ac-generate-password"),h="",w=f=>{g.dataset.mode=f,g.textContent=f==="copy"?"Copy":"Generate",g.title=f==="copy"?"Copy the generated password":"Generate a strong password"};w("generate"),g.addEventListener("click",async()=>{if(g.dataset.mode==="copy"){try{await navigator.clipboard.writeText(m.value),v("Password copied to the clipboard.","success")}catch{m.focus(),m.select();try{document.execCommand("copy"),v("Password copied to the clipboard.","success")}catch{v("The password is selected \u2014 press Ctrl+C to copy it.","error")}}return}h=mr(14),m.value=h,m.focus(),m.select(),w("copy")}),m.addEventListener("input",()=>{g.dataset.mode==="copy"&&m.value!==h&&w("generate")}),l.root.querySelector("[data-ac-cancel]").addEventListener("click",l.close),l.root.querySelector("[data-ac-confirm]").addEventListener("click",async()=>{let f=l.root.querySelector("#ac-new-password").value.trim();if(f.length<8){v("The password must be at least 8 characters.","error");return}try{let b=await _.post(`console/users/${encodeURIComponent(t)}/credential`,{newPassword:f});l.close(),v(`Credential reset. ${b?.data?.revokedSessions||0} session(s) revoked.`,"success")}catch(b){v(b.message,"error")}})});let p=e.querySelector("[data-ac-delete-account]");p&&p.addEventListener("click",async()=>{if(await D({title:`Delete "${n.username}"?`,message:"The account is removed, together with its sessions and its results. This cannot be undone \u2014 suspending the account keeps the record if you only need to end the access.",confirmLabel:"Delete the account",danger:!0}))try{await _.del(`console/users/${encodeURIComponent(t)}`),v("The account was deleted.","success"),window.location.hash="#/users"}catch(m){v(m.message,"error")}})}function mr(e=14){let a="ABCDEFGHJKMNPQRSTUVWXYZ",t="abcdefghijkmnpqrstuvwxyz",n="23456789",s="!@#$%&*+-",r=a+t+n+s,d=c=>{let u=new Uint32Array(1);return crypto.getRandomValues(u),c[u[0]%c.length]},o=[d(a),d(t),d(n),d(s)];for(;o.length<e;)o.push(d(r));for(let c=o.length-1;c>0;c-=1){let u=new Uint32Array(1);crypto.getRandomValues(u);let p=u[0]%(c+1);[o[c],o[p]]=[o[p],o[c]]}return o.join("")}var va=Object.freeze([{key:"en",label:"English",dir:"ltr"},{key:"fr",label:"Fran\xE7ais",dir:"ltr"},{key:"ar",label:"\u0627\u0644\u0639\u0631\u0628\u064A\u0629",dir:"rtl"}]),Ds="quizLearningLang",Xe="en";function Ja(e){return va.some(a=>a.key===e)}function Hs(e){return va.find(a=>a.key===e)?.dir||"ltr"}function Y(){try{let e=localStorage.getItem(Ds);return Ja(e)?e:Xe}catch{return Xe}}function Bs(e){if(Ja(e))try{localStorage.setItem(Ds,e)}catch{}}var Ka={en:{"lang.label":"Language","learning.title":"Learning","learning.description":"The learning taxonomy and question classification of this organization.","nav.hub":"Learning","nav.questions":"Question pedagogy","nav.taxonomy":"Taxonomy","card.questions.desc":"Review the bank, see what each question assesses, and classify it.","card.taxonomy.desc":"The objectives and competencies the classification is built on.","flag.disabled.title":"Learning is not enabled","flag.disabled.body":"The learning taxonomy and question classification are off for this organization. Turning it on shows them to teachers; nothing is deleted when it is off.","flag.enabled.title":"Learning is enabled","flag.enabled.body":"Teachers may classify the questions they authored and propose learning objectives.","flag.toggle.on":"Turn learning on","flag.toggle.off":"Turn learning off","flag.teacherCreation.on":"Teachers create objectives directly","flag.teacherCreation.off":"Teacher objectives need approval","flag.adminOnly":"Only an administrator can change this.","action.refresh":"Refresh","action.search":"Search","action.add":"Add","action.save":"Save","action.cancel":"Cancel","action.close":"Close","action.edit":"Edit","action.open":"Open","action.archive":"Archive","action.approve":"Approve","action.reject":"Reject","action.classify":"Classify","action.classifySelected":"Classify selected","action.clearClassification":"Clear classification","action.addCriterion":"Add criterion","action.removeCriterion":"Remove","action.markReviewed":"Reviewed by me","action.newObjective":"New objective","action.proposeObjective":"Propose objective","action.newCompetency":"New competency","action.linkCompetency":"Link competency","action.addPrerequisite":"Add prerequisite","action.unlink":"Unlink","action.remove":"Remove","action.selectAll":"Select all","action.clearSelection":"Clear selection","field.statement":"Statement","field.description":"Description","field.code":"Code","field.name":"Name","field.subject":"Subject","field.category":"Category","field.parent":"Parent objective","field.status":"Status","field.kind":"Kind","field.orderIndex":"Order","field.note":"Note","field.weight":"Weight","field.criterionKey":"Criterion key","field.rubric":"Rubric (optional)","field.maxScore":"Max score","field.competency":"Competency","field.objective":"Objective","field.bloom":"Bloom dimension","field.pedagogyStatus":"Classification","field.primaryCompetency":"Primary competency","field.strength":"Strength","field.rationale":"Rationale","field.minMastery":"Minimum mastery","field.reviewNote":"Review note","hint.weightSum":"Weights must add up to 1.00","hint.criteriaRequired":"At least one criterion is required to save.","hint.saveQuestionFirst":"This question must be saved before it can be classified.","hint.noCriteria":"No criteria yet \u2014 this question is unclassified.","hint.teacherProposal":"A proposed objective becomes available to teachers once an administrator approves it.","hint.readOnlyTeacher":"Only administrators manage competencies and prerequisites.","hint.rubricJson":"A JSON object or free text, shown to graders.","hint.language":"Labels only \u2014 it does not change the school language.","table.question":"Question","table.type":"Type","table.bloom":"Bloom","table.status":"Classification","table.criteria":"Criteria","table.objective":"Objective","table.competency":"Competency","table.kind":"Kind","table.subject":"Subject","table.code":"Code","table.statement":"Statement","table.weight":"Weight","table.proposedBy":"Proposed by","table.created":"Created","status.unclassified":"Unclassified","status.partial":"Partly classified","status.classified":"Classified","status.needs_review":"Needs review","objective.proposed":"Proposed","objective.active":"Active","objective.rejected":"Rejected","objective.archived":"Archived","kind.competency":"Competency","kind.skill":"Skill","kind.domain":"Domain","strength.required":"Required","strength.recommended":"Recommended","summary.classified":"Classified questions","summary.unclassified":"Unclassified","summary.needsReview":"Needs review","summary.objectives":"Objectives","summary.proposed":"Awaiting approval","summary.competencies":"Competencies","summary.prerequisites":"Prerequisites","empty.questions.title":"No questions match the current filters","empty.questions.message":"Adjust the search, the classification or the Bloom filter.","empty.objectives.title":"No objectives yet","empty.objectives.message":"Create the first objective, then classify the questions that assess it.","empty.competencies.title":"No competencies yet","empty.competencies.message":"Competencies group the skills an objective builds.","empty.proposals.title":"Nothing awaiting approval","empty.proposals.message":"Teacher proposals appear here for review.","empty.prerequisites.title":"No prerequisites","empty.prerequisites.message":"A prerequisite states what must be learned first.","bulk.title":"Classify {count} question(s)","bulk.confirm":"This replaces the classification of the selected questions with one criterion of weight 1.00.","bulk.done":"{count} question(s) classified.","bulk.partial":"{done} classified, {failed} failed.","toast.classified":"The classification was saved.","toast.cleared":"The classification was cleared.","toast.objectiveSaved":"The objective was saved.","toast.competencySaved":"The competency was saved.","toast.approved":"The objective was approved.","toast.rejected":"The objective was rejected.","toast.archived":"The objective was archived.","toast.linked":"The competency was linked.","toast.unlinked":"The link was removed.","toast.prerequisiteAdded":"The prerequisite was added.","toast.prerequisiteRemoved":"The prerequisite was removed.","toast.flagOn":"Learning is now enabled for this organization.","toast.flagOff":"Learning is now disabled for this organization.","error.load":"This section could not be loaded","error.save":"The change could not be saved"},fr:{"lang.label":"Langue","learning.title":"Apprentissage","learning.description":"La taxonomie d'apprentissage et la classification des questions de cet \xE9tablissement.","nav.hub":"Apprentissage","nav.questions":"P\xE9dagogie des questions","nav.taxonomy":"Taxonomie","card.questions.desc":"Parcourez la banque, voyez ce que chaque question \xE9value et classez-la.","card.taxonomy.desc":"Les objectifs et comp\xE9tences sur lesquels repose la classification.","flag.disabled.title":"L'apprentissage n'est pas activ\xE9","flag.disabled.body":"La taxonomie d'apprentissage et la classification des questions sont d\xE9sactiv\xE9es pour cet \xE9tablissement. Les activer les rend visibles aux enseignants ; rien n'est supprim\xE9 lorsqu'elles sont d\xE9sactiv\xE9es.","flag.enabled.title":"L'apprentissage est activ\xE9","flag.enabled.body":"Les enseignants peuvent classer les questions qu'ils ont cr\xE9\xE9es et proposer des objectifs d'apprentissage.","flag.toggle.on":"Activer l'apprentissage","flag.toggle.off":"D\xE9sactiver l'apprentissage","flag.teacherCreation.on":"Les enseignants cr\xE9ent les objectifs directement","flag.teacherCreation.off":"Les objectifs des enseignants doivent \xEAtre approuv\xE9s","flag.adminOnly":"Seul un administrateur peut modifier ceci.","action.refresh":"Actualiser","action.search":"Rechercher","action.add":"Ajouter","action.save":"Enregistrer","action.cancel":"Annuler","action.close":"Fermer","action.edit":"Modifier","action.open":"Ouvrir","action.archive":"Archiver","action.approve":"Approuver","action.reject":"Rejeter","action.classify":"Classer","action.classifySelected":"Classer la s\xE9lection","action.clearClassification":"Effacer la classification","action.addCriterion":"Ajouter un crit\xE8re","action.removeCriterion":"Retirer","action.markReviewed":"V\xE9rifi\xE9 par moi","action.newObjective":"Nouvel objectif","action.proposeObjective":"Proposer un objectif","action.newCompetency":"Nouvelle comp\xE9tence","action.linkCompetency":"Lier une comp\xE9tence","action.addPrerequisite":"Ajouter un pr\xE9requis","action.unlink":"D\xE9lier","action.remove":"Retirer","action.selectAll":"Tout s\xE9lectionner","action.clearSelection":"Effacer la s\xE9lection","field.statement":"\xC9nonc\xE9","field.description":"Description","field.code":"Code","field.name":"Nom","field.subject":"Mati\xE8re","field.category":"Cat\xE9gorie","field.parent":"Objectif parent","field.status":"Statut","field.kind":"Type","field.orderIndex":"Ordre","field.note":"Note","field.weight":"Poids","field.criterionKey":"Cl\xE9 du crit\xE8re","field.rubric":"Grille (facultatif)","field.maxScore":"Note maximale","field.competency":"Comp\xE9tence","field.objective":"Objectif","field.bloom":"Dimension de Bloom","field.pedagogyStatus":"Classification","field.primaryCompetency":"Comp\xE9tence principale","field.strength":"Force","field.rationale":"Justification","field.minMastery":"Ma\xEEtrise minimale","field.reviewNote":"Note de r\xE9vision","hint.weightSum":"La somme des poids doit \xEAtre de 1,00","hint.criteriaRequired":"Au moins un crit\xE8re est requis pour enregistrer.","hint.saveQuestionFirst":"Cette question doit \xEAtre enregistr\xE9e avant de pouvoir \xEAtre class\xE9e.","hint.noCriteria":"Aucun crit\xE8re \u2014 cette question n'est pas class\xE9e.","hint.teacherProposal":"Un objectif propos\xE9 devient disponible pour les enseignants apr\xE8s approbation par un administrateur.","hint.readOnlyTeacher":"Seuls les administrateurs g\xE8rent les comp\xE9tences et les pr\xE9requis.","hint.rubricJson":"Un objet JSON ou du texte libre, montr\xE9 aux correcteurs.","hint.language":"Libell\xE9s uniquement \u2014 ne change pas la langue de l'\xE9tablissement.","table.question":"Question","table.type":"Type","table.bloom":"Bloom","table.status":"Classification","table.criteria":"Crit\xE8res","table.objective":"Objectif","table.competency":"Comp\xE9tence","table.kind":"Type","table.subject":"Mati\xE8re","table.code":"Code","table.statement":"\xC9nonc\xE9","table.weight":"Poids","table.proposedBy":"Propos\xE9 par","table.created":"Cr\xE9\xE9","status.unclassified":"Non class\xE9e","status.partial":"Partiellement class\xE9e","status.classified":"Class\xE9e","status.needs_review":"\xC0 v\xE9rifier","objective.proposed":"Propos\xE9","objective.active":"Actif","objective.rejected":"Rejet\xE9","objective.archived":"Archiv\xE9","kind.competency":"Comp\xE9tence","kind.skill":"Habilet\xE9","kind.domain":"Domaine","strength.required":"Requis","strength.recommended":"Recommand\xE9","summary.classified":"Questions class\xE9es","summary.unclassified":"Non class\xE9es","summary.needsReview":"\xC0 v\xE9rifier","summary.objectives":"Objectifs","summary.proposed":"En attente d'approbation","summary.competencies":"Comp\xE9tences","summary.prerequisites":"Pr\xE9requis","empty.questions.title":"Aucune question ne correspond aux filtres","empty.questions.message":"Ajustez la recherche, la classification ou le filtre Bloom.","empty.objectives.title":"Aucun objectif","empty.objectives.message":"Cr\xE9ez le premier objectif, puis classez les questions qui l'\xE9valuent.","empty.competencies.title":"Aucune comp\xE9tence","empty.competencies.message":"Les comp\xE9tences regroupent les habilet\xE9s qu'un objectif d\xE9veloppe.","empty.proposals.title":"Rien en attente d'approbation","empty.proposals.message":"Les propositions des enseignants apparaissent ici pour r\xE9vision.","empty.prerequisites.title":"Aucun pr\xE9requis","empty.prerequisites.message":"Un pr\xE9requis indique ce qui doit \xEAtre appris avant.","bulk.title":"Classer {count} question(s)","bulk.confirm":"Ceci remplace la classification des questions s\xE9lectionn\xE9es par un seul crit\xE8re de poids 1,00.","bulk.done":"{count} question(s) class\xE9e(s).","bulk.partial":"{done} class\xE9e(s), {failed} en \xE9chec.","toast.classified":"La classification a \xE9t\xE9 enregistr\xE9e.","toast.cleared":"La classification a \xE9t\xE9 effac\xE9e.","toast.objectiveSaved":"L'objectif a \xE9t\xE9 enregistr\xE9.","toast.competencySaved":"La comp\xE9tence a \xE9t\xE9 enregistr\xE9e.","toast.approved":"L'objectif a \xE9t\xE9 approuv\xE9.","toast.rejected":"L'objectif a \xE9t\xE9 rejet\xE9.","toast.archived":"L'objectif a \xE9t\xE9 archiv\xE9.","toast.linked":"La comp\xE9tence a \xE9t\xE9 li\xE9e.","toast.unlinked":"Le lien a \xE9t\xE9 supprim\xE9.","toast.prerequisiteAdded":"Le pr\xE9requis a \xE9t\xE9 ajout\xE9.","toast.prerequisiteRemoved":"Le pr\xE9requis a \xE9t\xE9 retir\xE9.","toast.flagOn":"L'apprentissage est maintenant activ\xE9 pour cet \xE9tablissement.","toast.flagOff":"L'apprentissage est maintenant d\xE9sactiv\xE9 pour cet \xE9tablissement.","error.load":"Cette section n'a pas pu \xEAtre charg\xE9e","error.save":"La modification n'a pas pu \xEAtre enregistr\xE9e"},ar:{"lang.label":"\u0627\u0644\u0644\u063A\u0629","learning.title":"\u0627\u0644\u062A\u0639\u0644\u0651\u0645","learning.description":"\u062A\u0635\u0646\u064A\u0641 \u0627\u0644\u062A\u0639\u0644\u0651\u0645 \u0648\u062A\u0635\u0646\u064A\u0641 \u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u062E\u0627\u0635 \u0628\u0647\u0630\u0647 \u0627\u0644\u0645\u0624\u0633\u0633\u0629.","nav.hub":"\u0627\u0644\u062A\u0639\u0644\u0651\u0645","nav.questions":"\u0628\u064A\u062F\u0627\u063A\u0648\u062C\u064A\u0627 \u0627\u0644\u0623\u0633\u0626\u0644\u0629","nav.taxonomy":"\u0627\u0644\u062A\u0635\u0646\u064A\u0641","card.questions.desc":"\u0631\u0627\u062C\u0639 \u0628\u0646\u0643 \u0627\u0644\u0623\u0633\u0626\u0644\u0629\u060C \u0648\u0627\u0637\u0651\u0644\u0639 \u0639\u0644\u0649 \u0645\u0627 \u064A\u0642\u064A\u0633\u0647 \u0643\u0644 \u0633\u0624\u0627\u0644\u060C \u062B\u0645 \u0635\u0646\u0651\u0641\u0647.","card.taxonomy.desc":"\u0627\u0644\u0623\u0647\u062F\u0627\u0641 \u0648\u0627\u0644\u0643\u0641\u0627\u0621\u0627\u062A \u0627\u0644\u062A\u064A \u064A\u0642\u0648\u0645 \u0639\u0644\u064A\u0647\u0627 \u0627\u0644\u062A\u0635\u0646\u064A\u0641.","flag.disabled.title":"\u0627\u0644\u062A\u0639\u0644\u0651\u0645 \u063A\u064A\u0631 \u0645\u064F\u0641\u0639\u0651\u0644","flag.disabled.body":"\u062A\u0635\u0646\u064A\u0641 \u0627\u0644\u062A\u0639\u0644\u0651\u0645 \u0648\u062A\u0635\u0646\u064A\u0641 \u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u0645\u0639\u0637\u0651\u0644\u0627\u0646 \u0644\u0647\u0630\u0647 \u0627\u0644\u0645\u0624\u0633\u0633\u0629. \u0639\u0646\u062F \u062A\u0641\u0639\u064A\u0644\u0647\u0645\u0627 \u064A\u0638\u0647\u0631\u0627\u0646 \u0644\u0644\u0645\u0639\u0644\u0651\u0645\u064A\u0646\u061B \u0648\u0644\u0627 \u064A\u064F\u062D\u0630\u0641 \u0623\u064A \u0634\u064A\u0621 \u0639\u0646\u062F \u0627\u0644\u062A\u0639\u0637\u064A\u0644.","flag.enabled.title":"\u0627\u0644\u062A\u0639\u0644\u0651\u0645 \u0645\u064F\u0641\u0639\u0651\u0644","flag.enabled.body":"\u064A\u0645\u0643\u0646 \u0644\u0644\u0645\u0639\u0644\u0651\u0645\u064A\u0646 \u062A\u0635\u0646\u064A\u0641 \u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u062A\u064A \u0623\u0646\u0634\u0623\u0648\u0647\u0627 \u0648\u0627\u0642\u062A\u0631\u0627\u062D \u0623\u0647\u062F\u0627\u0641 \u062A\u0639\u0644\u0651\u0645.","flag.toggle.on":"\u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u062A\u0639\u0644\u0651\u0645","flag.toggle.off":"\u062A\u0639\u0637\u064A\u0644 \u0627\u0644\u062A\u0639\u0644\u0651\u0645","flag.teacherCreation.on":"\u064A\u0646\u0634\u0626 \u0627\u0644\u0645\u0639\u0644\u0651\u0645\u0648\u0646 \u0627\u0644\u0623\u0647\u062F\u0627\u0641 \u0645\u0628\u0627\u0634\u0631\u0629","flag.teacherCreation.off":"\u0623\u0647\u062F\u0627\u0641 \u0627\u0644\u0645\u0639\u0644\u0651\u0645\u064A\u0646 \u062A\u062D\u062A\u0627\u062C \u0625\u0644\u0649 \u0645\u0648\u0627\u0641\u0642\u0629","flag.adminOnly":"\u064A\u0645\u0643\u0646 \u0644\u0644\u0645\u0634\u0631\u0641 \u0641\u0642\u0637 \u062A\u063A\u064A\u064A\u0631 \u0647\u0630\u0627.","action.refresh":"\u062A\u062D\u062F\u064A\u062B","action.search":"\u0628\u062D\u062B","action.add":"\u0625\u0636\u0627\u0641\u0629","action.save":"\u062D\u0641\u0638","action.cancel":"\u0625\u0644\u063A\u0627\u0621","action.close":"\u0625\u063A\u0644\u0627\u0642","action.edit":"\u062A\u062D\u0631\u064A\u0631","action.open":"\u0641\u062A\u062D","action.archive":"\u0623\u0631\u0634\u0641\u0629","action.approve":"\u0645\u0648\u0627\u0641\u0642\u0629","action.reject":"\u0631\u0641\u0636","action.classify":"\u062A\u0635\u0646\u064A\u0641","action.classifySelected":"\u062A\u0635\u0646\u064A\u0641 \u0627\u0644\u0645\u062D\u062F\u064E\u0651\u062F","action.clearClassification":"\u0645\u0633\u062D \u0627\u0644\u062A\u0635\u0646\u064A\u0641","action.addCriterion":"\u0625\u0636\u0627\u0641\u0629 \u0645\u0639\u064A\u0627\u0631","action.removeCriterion":"\u0625\u0632\u0627\u0644\u0629","action.markReviewed":"\u0631\u0627\u062C\u0639\u062A\u0647\u0627 \u0628\u0646\u0641\u0633\u064A","action.newObjective":"\u0647\u062F\u0641 \u062C\u062F\u064A\u062F","action.proposeObjective":"\u0627\u0642\u062A\u0631\u0627\u062D \u0647\u062F\u0641","action.newCompetency":"\u0643\u0641\u0627\u0621\u0629 \u062C\u062F\u064A\u062F\u0629","action.linkCompetency":"\u0631\u0628\u0637 \u0643\u0641\u0627\u0621\u0629","action.addPrerequisite":"\u0625\u0636\u0627\u0641\u0629 \u0645\u062A\u0637\u0644\u0628 \u0633\u0627\u0628\u0642","action.unlink":"\u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u0631\u0628\u0637","action.remove":"\u0625\u0632\u0627\u0644\u0629","action.selectAll":"\u062A\u062D\u062F\u064A\u062F \u0627\u0644\u0643\u0644","action.clearSelection":"\u0645\u0633\u062D \u0627\u0644\u062A\u062D\u062F\u064A\u062F","field.statement":"\u0627\u0644\u0646\u0635","field.description":"\u0627\u0644\u0648\u0635\u0641","field.code":"\u0627\u0644\u0631\u0645\u0632","field.name":"\u0627\u0644\u0627\u0633\u0645","field.subject":"\u0627\u0644\u0645\u0627\u062F\u0629","field.category":"\u0627\u0644\u0641\u0626\u0629","field.parent":"\u0627\u0644\u0647\u062F\u0641 \u0627\u0644\u0623\u0628","field.status":"\u0627\u0644\u062D\u0627\u0644\u0629","field.kind":"\u0627\u0644\u0646\u0648\u0639","field.orderIndex":"\u0627\u0644\u062A\u0631\u062A\u064A\u0628","field.note":"\u0645\u0644\u0627\u062D\u0638\u0629","field.weight":"\u0627\u0644\u0648\u0632\u0646","field.criterionKey":"\u0645\u0641\u062A\u0627\u062D \u0627\u0644\u0645\u0639\u064A\u0627\u0631","field.rubric":"\u0645\u0639\u064A\u0627\u0631 \u0627\u0644\u062A\u0642\u064A\u064A\u0645 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)","field.maxScore":"\u0627\u0644\u062F\u0631\u062C\u0629 \u0627\u0644\u0642\u0635\u0648\u0649","field.competency":"\u0627\u0644\u0643\u0641\u0627\u0621\u0629","field.objective":"\u0627\u0644\u0647\u062F\u0641","field.bloom":"\u0628\u064F\u0639\u062F \u0628\u0644\u0648\u0645","field.pedagogyStatus":"\u0627\u0644\u062A\u0635\u0646\u064A\u0641","field.primaryCompetency":"\u0627\u0644\u0643\u0641\u0627\u0621\u0629 \u0627\u0644\u0623\u0633\u0627\u0633\u064A\u0629","field.strength":"\u0627\u0644\u0642\u0648\u0629","field.rationale":"\u0627\u0644\u0645\u0628\u0631\u0631","field.minMastery":"\u0627\u0644\u062D\u062F \u0627\u0644\u0623\u062F\u0646\u0649 \u0644\u0644\u0625\u062A\u0642\u0627\u0646","field.reviewNote":"\u0645\u0644\u0627\u062D\u0638\u0629 \u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629","hint.weightSum":"\u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0645\u062C\u0645\u0648\u0639 \u0627\u0644\u0623\u0648\u0632\u0627\u0646 1.00","hint.criteriaRequired":"\u0645\u0639\u064A\u0627\u0631 \u0648\u0627\u062D\u062F \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644 \u0645\u0637\u0644\u0648\u0628 \u0644\u0644\u062D\u0641\u0638.","hint.saveQuestionFirst":"\u064A\u062C\u0628 \u062D\u0641\u0638 \u0627\u0644\u0633\u0624\u0627\u0644 \u0642\u0628\u0644 \u062A\u0635\u0646\u064A\u0641\u0647.","hint.noCriteria":"\u0644\u0627 \u062A\u0648\u062C\u062F \u0645\u0639\u0627\u064A\u064A\u0631 \u2014 \u0647\u0630\u0627 \u0627\u0644\u0633\u0624\u0627\u0644 \u063A\u064A\u0631 \u0645\u0635\u0646\u064E\u0651\u0641.","hint.teacherProposal":"\u064A\u0635\u0628\u062D \u0627\u0644\u0647\u062F\u0641 \u0627\u0644\u0645\u0642\u062A\u0631\u062D \u0645\u062A\u0627\u062D\u064B\u0627 \u0644\u0644\u0645\u0639\u0644\u0651\u0645\u064A\u0646 \u0628\u0639\u062F \u0645\u0648\u0627\u0641\u0642\u0629 \u0627\u0644\u0645\u0634\u0631\u0641.","hint.readOnlyTeacher":"\u0627\u0644\u0645\u0634\u0631\u0641\u0648\u0646 \u0641\u0642\u0637 \u064A\u062F\u064A\u0631\u0648\u0646 \u0627\u0644\u0643\u0641\u0627\u0621\u0627\u062A \u0648\u0627\u0644\u0645\u062A\u0637\u0644\u0628\u0627\u062A.","hint.rubricJson":"\u0643\u0627\u0626\u0646 JSON \u0623\u0648 \u0646\u0635 \u062D\u0631 \u064A\u064F\u0639\u0631\u0636 \u0639\u0644\u0649 \u0627\u0644\u0645\u0635\u062D\u0651\u062D\u064A\u0646.","hint.language":"\u0627\u0644\u062A\u0633\u0645\u064A\u0627\u062A \u0641\u0642\u0637 \u2014 \u0644\u0627 \u062A\u063A\u064A\u0651\u0631 \u0644\u063A\u0629 \u0627\u0644\u0645\u0624\u0633\u0633\u0629.","table.question":"\u0627\u0644\u0633\u0624\u0627\u0644","table.type":"\u0627\u0644\u0646\u0648\u0639","table.bloom":"\u0628\u0644\u0648\u0645","table.status":"\u0627\u0644\u062A\u0635\u0646\u064A\u0641","table.criteria":"\u0627\u0644\u0645\u0639\u0627\u064A\u064A\u0631","table.objective":"\u0627\u0644\u0647\u062F\u0641","table.competency":"\u0627\u0644\u0643\u0641\u0627\u0621\u0629","table.kind":"\u0627\u0644\u0646\u0648\u0639","table.subject":"\u0627\u0644\u0645\u0627\u062F\u0629","table.code":"\u0627\u0644\u0631\u0645\u0632","table.statement":"\u0627\u0644\u0646\u0635","table.weight":"\u0627\u0644\u0648\u0632\u0646","table.proposedBy":"\u0627\u0642\u062A\u0631\u062D\u0647","table.created":"\u0623\u064F\u0646\u0634\u0626","status.unclassified":"\u063A\u064A\u0631 \u0645\u0635\u0646\u064E\u0651\u0641","status.partial":"\u0645\u0635\u0646\u064E\u0651\u0641 \u062C\u0632\u0626\u064A\u064B\u0627","status.classified":"\u0645\u0635\u0646\u064E\u0651\u0641","status.needs_review":"\u064A\u062D\u062A\u0627\u062C \u0645\u0631\u0627\u062C\u0639\u0629","objective.proposed":"\u0645\u0642\u062A\u0631\u062D","objective.active":"\u0646\u0634\u0637","objective.rejected":"\u0645\u0631\u0641\u0648\u0636","objective.archived":"\u0645\u0624\u0631\u0634\u0641","kind.competency":"\u0643\u0641\u0627\u0621\u0629","kind.skill":"\u0645\u0647\u0627\u0631\u0629","kind.domain":"\u0645\u062C\u0627\u0644","strength.required":"\u0645\u0637\u0644\u0648\u0628","strength.recommended":"\u0645\u064F\u0633\u062A\u062D\u0633\u0646","summary.classified":"\u0623\u0633\u0626\u0644\u0629 \u0645\u0635\u0646\u064E\u0651\u0641\u0629","summary.unclassified":"\u063A\u064A\u0631 \u0645\u0635\u0646\u064E\u0651\u0641\u0629","summary.needsReview":"\u062A\u062D\u062A\u0627\u062C \u0645\u0631\u0627\u062C\u0639\u0629","summary.objectives":"\u0627\u0644\u0623\u0647\u062F\u0627\u0641","summary.proposed":"\u0628\u0627\u0646\u062A\u0638\u0627\u0631 \u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629","summary.competencies":"\u0627\u0644\u0643\u0641\u0627\u0621\u0627\u062A","summary.prerequisites":"\u0627\u0644\u0645\u062A\u0637\u0644\u0628\u0627\u062A \u0627\u0644\u0633\u0627\u0628\u0642\u0629","empty.questions.title":"\u0644\u0627 \u062A\u0648\u062C\u062F \u0623\u0633\u0626\u0644\u0629 \u0645\u0637\u0627\u0628\u0642\u0629 \u0644\u0644\u0645\u0639\u0627\u064A\u064A\u0631 \u0627\u0644\u062D\u0627\u0644\u064A\u0629","empty.questions.message":"\u0639\u062F\u0651\u0644 \u0627\u0644\u0628\u062D\u062B \u0623\u0648 \u0627\u0644\u062A\u0635\u0646\u064A\u0641 \u0623\u0648 \u0645\u0631\u0634\u0651\u062D \u0628\u0644\u0648\u0645.","empty.objectives.title":"\u0644\u0627 \u062A\u0648\u062C\u062F \u0623\u0647\u062F\u0627\u0641 \u0628\u0639\u062F","empty.objectives.message":"\u0623\u0646\u0634\u0626 \u0627\u0644\u0647\u062F\u0641 \u0627\u0644\u0623\u0648\u0644 \u062B\u0645 \u0635\u0646\u0651\u0641 \u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u062A\u064A \u062A\u0642\u064A\u0633\u0647.","empty.competencies.title":"\u0644\u0627 \u062A\u0648\u062C\u062F \u0643\u0641\u0627\u0621\u0627\u062A \u0628\u0639\u062F","empty.competencies.message":"\u062A\u062C\u0645\u0639 \u0627\u0644\u0643\u0641\u0627\u0621\u0627\u062A \u0627\u0644\u0645\u0647\u0627\u0631\u0627\u062A \u0627\u0644\u062A\u064A \u064A\u0628\u0646\u064A\u0647\u0627 \u0627\u0644\u0647\u062F\u0641.","empty.proposals.title":"\u0644\u0627 \u0634\u064A\u0621 \u0628\u0627\u0646\u062A\u0638\u0627\u0631 \u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629","empty.proposals.message":"\u062A\u0638\u0647\u0631 \u0627\u0642\u062A\u0631\u0627\u062D\u0627\u062A \u0627\u0644\u0645\u0639\u0644\u0651\u0645\u064A\u0646 \u0647\u0646\u0627 \u0644\u0644\u0645\u0631\u0627\u062C\u0639\u0629.","empty.prerequisites.title":"\u0644\u0627 \u062A\u0648\u062C\u062F \u0645\u062A\u0637\u0644\u0628\u0627\u062A \u0633\u0627\u0628\u0642\u0629","empty.prerequisites.message":"\u064A\u062D\u062F\u0651\u062F \u0627\u0644\u0645\u062A\u0637\u0644\u0628 \u0627\u0644\u0633\u0627\u0628\u0642 \u0645\u0627 \u064A\u062C\u0628 \u062A\u0639\u0644\u0651\u0645\u0647 \u0623\u0648\u0644\u064B\u0627.","bulk.title":"\u062A\u0635\u0646\u064A\u0641 {count} \u0633\u0624\u0627\u0644/\u0623\u0633\u0626\u0644\u0629","bulk.confirm":"\u0633\u064A\u0633\u062A\u0628\u062F\u0644 \u0647\u0630\u0627 \u062A\u0635\u0646\u064A\u0641 \u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u0645\u062D\u062F\u064E\u0651\u062F\u0629 \u0628\u0645\u0639\u064A\u0627\u0631 \u0648\u0627\u062D\u062F \u0628\u0648\u0632\u0646 1.00.","bulk.done":"\u062A\u0645 \u062A\u0635\u0646\u064A\u0641 {count} \u0633\u0624\u0627\u0644/\u0623\u0633\u0626\u0644\u0629.","bulk.partial":"\u0646\u062C\u062D {done}\u060C \u0641\u0634\u0644 {failed}.","toast.classified":"\u062A\u0645 \u062D\u0641\u0638 \u0627\u0644\u062A\u0635\u0646\u064A\u0641.","toast.cleared":"\u062A\u0645 \u0645\u0633\u062D \u0627\u0644\u062A\u0635\u0646\u064A\u0641.","toast.objectiveSaved":"\u062A\u0645 \u062D\u0641\u0638 \u0627\u0644\u0647\u062F\u0641.","toast.competencySaved":"\u062A\u0645 \u062D\u0641\u0638 \u0627\u0644\u0643\u0641\u0627\u0621\u0629.","toast.approved":"\u062A\u0645\u062A \u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629 \u0639\u0644\u0649 \u0627\u0644\u0647\u062F\u0641.","toast.rejected":"\u062A\u0645 \u0631\u0641\u0636 \u0627\u0644\u0647\u062F\u0641.","toast.archived":"\u062A\u0645\u062A \u0623\u0631\u0634\u0641\u0629 \u0627\u0644\u0647\u062F\u0641.","toast.linked":"\u062A\u0645 \u0631\u0628\u0637 \u0627\u0644\u0643\u0641\u0627\u0621\u0629.","toast.unlinked":"\u062A\u0645 \u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u0631\u0628\u0637.","toast.prerequisiteAdded":"\u062A\u0645\u062A \u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0645\u062A\u0637\u0644\u0628 \u0627\u0644\u0633\u0627\u0628\u0642.","toast.prerequisiteRemoved":"\u062A\u0645\u062A \u0625\u0632\u0627\u0644\u0629 \u0627\u0644\u0645\u062A\u0637\u0644\u0628 \u0627\u0644\u0633\u0627\u0628\u0642.","toast.flagOn":"\u062A\u0645 \u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u062A\u0639\u0644\u0651\u0645 \u0644\u0647\u0630\u0647 \u0627\u0644\u0645\u0624\u0633\u0633\u0629.","toast.flagOff":"\u062A\u0645 \u062A\u0639\u0637\u064A\u0644 \u0627\u0644\u062A\u0639\u0644\u0651\u0645 \u0644\u0647\u0630\u0647 \u0627\u0644\u0645\u0624\u0633\u0633\u0629.","error.load":"\u062A\u0639\u0630\u0651\u0631 \u062A\u062D\u0645\u064A\u0644 \u0647\u0630\u0627 \u0627\u0644\u0642\u0633\u0645","error.save":"\u062A\u0639\u0630\u0651\u0631 \u062D\u0641\u0638 \u0627\u0644\u062A\u063A\u064A\u064A\u0631"}};function hr(e,a,t=null){let s=(Ka[e]||Ka[Xe])[a]??Ka[Xe][a]??a;if(t)for(let[r,d]of Object.entries(t))s=s.replaceAll(`{${r}}`,String(d));return s}function Q(e){let a=Ja(e)?e:Xe;return(t,n)=>hr(a,t,n)}var Us="learning.adaptive.enabled",Za=["school.learning.read","class.learning.read","school.learning.manage","class.learning.classify"];var ee={loaded:!1,adaptive_enabled:!1,teacher_objective_creation:!1};async function Fs({force:e=!1}={}){if(ee.loaded&&!e)return{...ee};try{let a=await _.get("learning/flags");ee.adaptive_enabled=a?.adaptive_enabled===!0,ee.teacher_objective_creation=a?.teacher_objective_creation===!0,ee.loaded=!0}catch{ee.adaptive_enabled=!1,ee.teacher_objective_creation=!1,ee.loaded=!0}return{...ee}}function Gs(){return ee.adaptive_enabled===!0}function Ws(){return ee.teacher_objective_creation===!0}async function ya(e){let a=e?"true":"false";return await _.patch(`settings/${encodeURIComponent(Us)}`,{key:Us,value:a}),ee.loaded=!0,ee.adaptive_enabled=e===!0,e===!0}function Te(){return Q(Y())}function me({body:e,actions:a=""}){let t=Y(),n=Q(t);return`<div class="learning-panel ac-stack" dir="${Hs(t)}" data-ac-learning-panel>
		<div class="learning-panel__head">
			<div class="ac-field learning-panel__lang">
				<label class="ac-field__label" for="ac-learning-lang">${i(n("lang.label"))}</label>
				<select class="ac-select" id="ac-learning-lang" data-ac-learning-lang>
					${va.map(s=>`<option value="${i(s.key)}"${s.key===t?" selected":""}>${i(s.label)}</option>`).join("")}
				</select>
				<p class="ac-field__hint">${i(n("hint.language"))}</p>
			</div>
			${a?`<div class="learning-panel__actions">${a}</div>`:""}
		</div>
		<div class="learning-panel__body">${e}</div>
	</div>`}function he(e,a){let t=e.querySelector("[data-ac-learning-lang]");t&&t.addEventListener("change",()=>{Bs(t.value),a.rerender()})}async function Be(e,a){return await Fs({force:!0}),Gs()?!0:(e.innerHTML=me({body:fr(a)}),he(e,a),gr(e,a),!1)}function fr(e){let a=Te(),t=e.canAny(["school.learning.manage"]);return`<div class="ac-section-panel">
		<div class="ac-section-panel__body">
			<div class="ac-alert ac-alert--info">
				<div class="ac-alert__body">
					<p class="ac-alert__title">${i(a("flag.disabled.title"))}</p>
					<p class="ac-alert__text">${i(a("flag.disabled.body"))}</p>
				</div>
			</div>
			${t?`<div class="learning-panel__toggle"><button type="button" class="ac-btn ac-btn--primary" data-ac-learning-enable>${i(a("flag.toggle.on"))}</button></div>`:`<p class="ac-field__hint">${i(a("flag.adminOnly"))}</p>`}
		</div>
	</div>`}function gr(e,a){let t=e.querySelector("[data-ac-learning-enable]");if(!t)return;let n=Te();t.addEventListener("click",async()=>{t.disabled=!0;try{await ya(!0),v(n("toast.flagOn"),"success"),a.rerender()}catch(s){t.disabled=!1,v(s.message,"error")}})}async function _a(){let e=await _.get("learning/bloom");return Array.isArray(e?.data)?e.data:[]}function Ee(e,a=Y()){if(!e)return null;let n=e.labels||e.labels_json||null;if(typeof n=="string")try{n=JSON.parse(n)}catch{n=null}return n?.[a]||n?.en||e.name||e.key||null}function Ue(e,{includeAll:a=!1,allLabel:t=null,lang:n=Y()}={}){let s=(e||[]).map(r=>({value:r.id,label:Ee(r,n)}));return a?[{value:"",label:t||"All"},...s]:s}function ea(e,a){return a&&(e||[]).find(t=>t.id===a)||null}function aa(e,a){let t=a||"unclassified",n=Q(e);return`<span class="learning-chip learning-chip--${i(t)}">${i(n(`status.${t}`))}</span>`}function ta(e,a){let t=a||"proposed",n=Q(e);return`<span class="learning-chip learning-chip--obj-${i(t)}">${i(n(`objective.${t}`))}</span>`}function Ae(e,a,t){e.innerHTML=me({body:O({title:Te()("error.load"),message:t?.message||""})}),he(e,a);let n=e.querySelector("[data-ac-retry]");return n&&n.addEventListener("click",()=>a.rerender()),!0}function wa(e,a,t=4){e.innerHTML=me({body:H(t)}),he(e,a)}var Ys={id:"learning",path:"/learning",title:"Learning",description:"The learning taxonomy and question classification of this organization.",permission:["school.learning.read","class.learning.read"],async render(e,a){if(!await Be(e,a))return;let t=Te(),n=a.canAny(["school.learning.manage"]),s,r,d,o;try{[s,r,d,o]=await Promise.all([_.get("learning/objectives",{limit:1}),_.get("learning/objectives",{status:"proposed",limit:1}),_.get("learning/competencies",{limit:1}),_.get("questions",{limit:1})])}catch(g){Ae(e,a,g);return}let c=g=>Number(g?.total??0),u=c(r),p=`<section class="ac-section-panel">
			<div class="ac-section-panel__head">
				<div>
					<h3 class="ac-section-panel__title">${i(t("flag.enabled.title"))}</h3>
					<p class="ac-section-panel__subtitle">${i(t("flag.enabled.body"))}</p>
				</div>
				${n?`<div class="ac-panel__actions"><button type="button" class="ac-btn ac-btn--danger" data-ac-learning-disable>${i(t("flag.toggle.off"))}</button></div>`:""}
			</div>
			<div class="ac-section-panel__body">
				<div class="learning-panel__fact">
					<span class="learning-panel__fact-label">${i(t("table.objective"))}</span>
					<span>${i(Ws()?t("flag.teacherCreation.on"):t("flag.teacherCreation.off"))}</span>
				</div>
				${n?"":`<p class="ac-field__hint">${i(t("flag.adminOnly"))}</p>`}
			</div>
		</section>`,l=`<div class="ac-grid ac-grid--kpi">
				${T({label:t("summary.objectives"),value:c(s).toLocaleString(),note:t("nav.taxonomy"),href:"#/learning/taxonomy"})}
				${T({label:t("summary.proposed"),value:u.toLocaleString(),note:t("table.proposedBy"),tone:u>0?"warning":"",href:n?"#/learning/taxonomy?tab=proposals":""})}
				${T({label:t("summary.competencies"),value:c(d).toLocaleString(),note:t("table.competency"),href:"#/learning/taxonomy?tab=competencies"})}
			</div>

			<div class="ac-section">
				<h2 class="ac-section__title">${i(t("learning.title"))}</h2>
				<p class="ac-section__hint">${i(t("learning.description"))}</p>
			</div>

			<div class="ac-role-cards">
				<a class="ac-role-card" href="#/learning/questions">
					<span class="ac-role-card__icon"><svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg></span>
					<p class="ac-role-card__title">${i(t("nav.questions"))}</p>
					<p class="ac-role-card__desc">${i(t("card.questions.desc"))}</p>
					<p class="ac-role-card__count">${c(o).toLocaleString()} <small>${i(t("table.question"))}</small></p>
				</a>
				<a class="ac-role-card" href="#/learning/taxonomy">
					<span class="ac-role-card__icon"><svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h18M3 12h18M3 17h10"/></svg></span>
					<p class="ac-role-card__title">${i(t("nav.taxonomy"))}</p>
					<p class="ac-role-card__desc">${i(t("card.taxonomy.desc"))}</p>
					<p class="ac-role-card__count">${c(s).toLocaleString()} <small>${i(t("summary.objectives"))}</small></p>
				</a>
			</div>

			${p}`;e.innerHTML=me({body:l}),he(e,a);let m=e.querySelector("[data-ac-learning-disable]");m&&m.addEventListener("click",async()=>{m.disabled=!0;try{await ya(!1),v(t("toast.flagOff"),"success"),a.rerender()}catch(g){m.disabled=!1,v(g.message,"error")}})}};var Qs=.001;async function Vs({question:e,bloom:a,objectives:t,competencies:n,onSaved:s=null}){let r=Y(),d=Q(r),o=I({title:d("action.classify"),subtitle:xa(e),wide:!0,body:`<div data-ac-pedagogy-host>${H(3)}</div>`,footer:"<div data-ac-pedagogy-footer></div>"}),c=o.root.querySelector("[data-ac-pedagogy-host]"),u=o.root.querySelector("[data-ac-pedagogy-footer]"),p;try{p=await _.get(`learning/questions/${encodeURIComponent(e.id)}/pedagogy`)}catch(b){c.innerHTML=O({title:d("error.load"),message:b.message,retry:!1});return}let l={rows:(p.criteria||[]).map($r),status:p.pedagogy_status,reviewedAt:p.question?.pedagogy_reviewed_at||null,busy:!1};m(),c.addEventListener("input",b=>{b.target.matches("[data-ac-crit-weight]")&&g()}),c.addEventListener("click",b=>{let y=b.target.closest("[data-ac-remove-criterion]");y&&(b.preventDefault(),l.rows=h(),l.rows.splice(Number(y.dataset.acRemoveCriterion),1),m())}),c.addEventListener("click",b=>{b.target.closest("[data-ac-add-criterion]")&&(b.preventDefault(),l.rows=h(),l.rows.push(kr(t)),m())}),u.addEventListener("click",b=>{let y=b.target.closest("button");!y||l.busy||(y.matches("[data-ac-pedagogy-cancel]")&&o.close(),y.matches("[data-ac-pedagogy-clear]")&&f(),y.matches("[data-ac-pedagogy-save]")&&w(y))});function m(){c.innerHTML=br(l,{bloom:a,objectives:t,competencies:n,lang:r,t:d}),u.innerHTML=yr(l,{lang:r,t:d}),g()}function g(){let b=h(),y=b.reduce((R,E)=>R+(Number.isFinite(E.weight)?E.weight:0),0),$=c.querySelector("[data-ac-weight-sum]"),C=b.length>0&&Math.abs(y-1)<=Qs;$&&($.textContent=`${y.toFixed(2)} / 1.00`,$.classList.toggle("is-complete",C),$.classList.toggle("is-incomplete",b.length>0&&!C));let j=u.querySelector("[data-ac-pedagogy-save]");j&&(j.disabled=l.busy||!C)}function h(){return Array.from(c.querySelectorAll("[data-ac-criterion]")).map(b=>({objective_id:b.querySelector("[data-ac-crit-objective]").value,bloom_dimension_id:b.querySelector("[data-ac-crit-bloom]").value,competency_id:b.querySelector("[data-ac-crit-competency]").value||null,weight:Number(b.querySelector("[data-ac-crit-weight]").value),criterion_key:b.querySelector("[data-ac-crit-key]").value.trim(),max_score:xr(b.querySelector("[data-ac-crit-max]").value),rubric:b.querySelector("[data-ac-crit-rubric]").value.trim()}))}async function w(b){let y=h(),$=Ar(y,d);if($){v($,"error");return}l.busy=!0,b.disabled=!0;let C=!!u.querySelector("[data-ac-mark-reviewed]")?.checked;try{let j=await _.put(`learning/questions/${encodeURIComponent(e.id)}/pedagogy`,{criteria:y.map(Tr),source:"manual",mark_reviewed:C});v(d("toast.classified"),"success"),o.close(),s&&s(j)}catch(j){l.busy=!1,b.disabled=!1,v(j.message,"error")}}async function f(){if(await D({title:d("action.clearClassification"),message:d("action.clearClassification"),detail:xa(e),confirmLabel:d("action.clearClassification"),danger:!0})){l.busy=!0;try{let y=await _.del(`learning/questions/${encodeURIComponent(e.id)}/pedagogy`);v(d("toast.cleared"),"success"),o.close(),s&&s(y)}catch(y){l.busy=!1,v(y.message,"error")}}}}function br(e,{bloom:a,objectives:t,competencies:n,lang:s,t:r}){let d=e.reviewedAt?`<p class="learning-panel__stamp">${i(r("action.markReviewed"))} \xB7 ${i(N(e.reviewedAt))}</p>`:"";if(e.rows.length===0)return`<div class="learning-criteria" data-ac-criteria>
			<div class="learning-panel__status-row">
				${aa(s,"unclassified")}
				<button type="button" class="ac-btn ac-btn--sm ac-btn--primary" data-ac-add-criterion>${i(r("action.addCriterion"))}</button>
			</div>
			<p class="ac-field__hint">${i(r("hint.noCriteria"))}</p>
			${d}
		</div>`;let o=e.rows.map((c,u)=>vr(c,u,{bloom:a,objectives:t,competencies:n,lang:s,t:r})).join("");return`<div class="learning-criteria" data-ac-criteria>
		<div class="learning-panel__status-row">
			${aa(s,e.status)}
			<span class="learning-weightsum" data-ac-weight-sum>0.00 / 1.00</span>
		</div>
		<div class="learning-criteria__rows">${o}</div>
		<div class="learning-criteria__actions">
			<button type="button" class="ac-btn ac-btn--sm" data-ac-add-criterion>${i(r("action.addCriterion"))}</button>
			<span class="ac-field__hint">${i(r("hint.weightSum"))}</span>
		</div>
		${d}
	</div>`}function vr(e,a,{bloom:t,objectives:n,competencies:s,lang:r,t:d}){let o=[{value:"",label:`\u2014 ${d("field.objective")} \u2014`},...n.map(p=>({value:p.id,label:wr(p)}))],c=[{value:"",label:`\u2014 ${d("field.bloom")} \u2014`},...Ue(t,{lang:r})],u=[{value:"",label:`\u2014 ${d("field.competency")} \u2014`},...s.map(p=>({value:p.id,label:`${p.code} \u2014 ${p.name}`}))];return`<div class="learning-criterion" data-ac-criterion data-ac-criterion-index="${a}">
		<div class="learning-criterion__head">
			<span class="learning-criterion__key">${i(d("field.criterionKey"))} ${a+1}</span>
			<button type="button" class="ac-btn ac-btn--sm ac-btn--ghost" data-ac-remove-criterion="${a}">${i(d("action.removeCriterion"))}</button>
		</div>
		<div class="learning-criterion__grid">
			<label class="ac-field">
				<span class="ac-field__label">${i(d("field.objective"))}</span>
				<select class="ac-select" data-ac-crit-objective>${Xa(o,e.objective_id)}</select>
			</label>
			<label class="ac-field">
				<span class="ac-field__label">${i(d("field.bloom"))}</span>
				<select class="ac-select" data-ac-crit-bloom>${Xa(c,e.bloom_dimension_id)}</select>
			</label>
			<label class="ac-field">
				<span class="ac-field__label">${i(d("field.competency"))}</span>
				<select class="ac-select" data-ac-crit-competency>${Xa(u,e.competency_id)}</select>
			</label>
			<label class="ac-field">
				<span class="ac-field__label">${i(d("field.weight"))}</span>
				<input class="ac-input" type="number" min="0" max="1" step="0.05" value="${i(Number(e.weight)||0)}" data-ac-crit-weight />
			</label>
			<label class="ac-field">
				<span class="ac-field__label">${i(d("field.criterionKey"))}</span>
				<input class="ac-input" type="text" value="${i(e.criterion_key||"")}" data-ac-crit-key />
			</label>
			<label class="ac-field">
				<span class="ac-field__label">${i(d("field.maxScore"))}</span>
				<input class="ac-input" type="number" min="0" step="0.5" value="${i(e.max_score??"")}" data-ac-crit-max />
			</label>
		</div>
		<label class="ac-field ac-field--full">
			<span class="ac-field__label">${i(d("field.rubric"))}</span>
			<textarea class="ac-input ac-input--full" rows="2" data-ac-crit-rubric>${i(e.rubric||"")}</textarea>
			<span class="ac-field__hint">${i(d("hint.rubricJson"))}</span>
		</label>
	</div>`}function yr(e,{t:a}){return`<div class="learning-panel__footer">
		<div class="learning-panel__footer-left">
			<button type="button" class="ac-btn ac-btn--sm ac-btn--danger" data-ac-pedagogy-clear${e.rows.length===0?" disabled":""}>${i(a("action.clearClassification"))}</button>
		</div>
		<label class="ac-check">
			<input type="checkbox" data-ac-mark-reviewed checked />
			<span class="ac-check__label">${i(a("action.markReviewed"))}</span>
		</label>
		<button type="button" class="ac-btn" data-ac-pedagogy-cancel>${i(a("action.cancel"))}</button>
		<button type="button" class="ac-btn ac-btn--primary" data-ac-pedagogy-save disabled>${i(a("action.save"))}</button>
	</div>`}function Xa(e,a){return e.map(t=>`<option value="${i(t.value)}"${String(t.value)===String(a??"")?" selected":""}>${i(t.label)}</option>`).join("")}function xa(e){return`${e.type||"question"} \xB7 ${_r(e.text)}`}function _r(e,a=70){let t=String(e??"");return t.length>a?`${t.slice(0,a-1)}\u2026`:t}function wr(e){let a=String(e.statement??"");return`${e.code} \u2014 ${a.length>60?`${a.slice(0,59)}\u2026`:a}`}function xr(e){return e===""||e==null?null:Number(e)}function kr(e){return{objective_id:e.length===1?e[0].id:"",bloom_dimension_id:"",competency_id:null,weight:1,criterion_key:"",max_score:null,rubric:""}}function $r(e){return{objective_id:e.objective_id||"",bloom_dimension_id:e.bloom_dimension_id||"",competency_id:e.competency_id||null,weight:Number(e.weight)||0,criterion_key:e.criterion_key&&e.criterion_key!=="main"?e.criterion_key:"",max_score:e.max_score??null,rubric:Sr(e.rubric_json)}}function Sr(e){if(!e)return"";if(typeof e=="object")return e.text!=null?String(e.text):"";try{let a=JSON.parse(e);return a&&typeof a=="object"&&a.text!=null?String(a.text):typeof a=="string"?a:""}catch{return String(e)}}function Tr(e){let a={objective_id:e.objective_id,bloom_dimension_id:e.bloom_dimension_id,weight:e.weight};return e.competency_id&&(a.competency_id=e.competency_id),e.criterion_key&&(a.criterion_key=e.criterion_key),e.max_score!=null&&Number.isFinite(e.max_score)&&(a.max_score=e.max_score),e.rubric&&(a.rubric_json={text:e.rubric}),a}function Ar(e,a){if(e.length===0)return a("hint.criteriaRequired");for(let n of e){if(!n.objective_id)return`${a("field.objective")} \u2014 ${a("error.save")}`;if(!n.bloom_dimension_id)return`${a("field.bloom")} \u2014 ${a("error.save")}`;if(!Number.isFinite(n.weight)||n.weight<0)return`${a("field.weight")} \u2014 ${a("error.save")}`}let t=e.reduce((n,s)=>n+s.weight,0);return Math.abs(t-1)>Qs?a("hint.weightSum"):null}function Ks({questions:e,bloom:a,objectives:t,onDone:n=null}){let s=Y(),r=Q(s),d=Array.isArray(e)?e:[],o=I({title:r("bulk.title",{count:d.length}),subtitle:r("bulk.confirm"),body:`
			<div class="learning-bulk" data-ac-bulk>
				<div class="learning-bulk__grid">
					<label class="ac-field">
						<span class="ac-field__label">${i(r("field.objective"))}</span>
						<select class="ac-select" data-ac-bulk-objective>
							<option value="">\u2014 ${i(r("field.objective"))} \u2014</option>
							${t.map(h=>`<option value="${i(h.id)}">${i(`${h.code} \u2014 ${qr(h.statement)}`)}</option>`).join("")}
						</select>
					</label>
					<label class="ac-field">
						<span class="ac-field__label">${i(r("field.bloom"))}</span>
						<select class="ac-select" data-ac-bulk-bloom>
							<option value="">\u2014 ${i(r("field.bloom"))} \u2014</option>
							${Ue(a,{lang:s}).map(h=>`<option value="${i(h.value)}">${i(h.label)}</option>`).join("")}
						</select>
					</label>
					<label class="ac-field">
						<span class="ac-field__label">${i(r("field.weight"))}</span>
						<input class="ac-input" type="text" value="1.00" data-ac-bulk-weight readonly />
					</label>
				</div>

				<label class="ac-check">
					<input type="checkbox" data-ac-bulk-reviewed checked />
					<span class="ac-check__label">${i(r("action.markReviewed"))}</span>
				</label>

				<div class="learning-bulk__progress" data-ac-bulk-progress hidden></div>
				<div class="learning-bulk__failures" data-ac-bulk-failures hidden></div>
			</div>`,footer:`
			<div class="learning-panel__footer">
				<button type="button" class="ac-btn" data-ac-bulk-cancel>${i(r("action.cancel"))}</button>
				<button type="button" class="ac-btn ac-btn--ghost" data-ac-bulk-done hidden>${i(r("action.close"))}</button>
				<button type="button" class="ac-btn ac-btn--primary" data-ac-bulk-run>${i(r("action.classifySelected"))}</button>
			</div>`}),c=o.root,u=c.querySelector("[data-ac-bulk-progress]"),p=c.querySelector("[data-ac-bulk-failures]"),l=c.querySelector("[data-ac-bulk-run]"),m=c.querySelector("[data-ac-bulk-done]"),g=c.querySelector("[data-ac-bulk-cancel]");g.addEventListener("click",()=>o.close()),m.addEventListener("click",()=>o.close()),l.addEventListener("click",async()=>{let h=c.querySelector("[data-ac-bulk-objective]").value,w=c.querySelector("[data-ac-bulk-bloom]").value;if(!h||!w){v(`${r("field.objective")} / ${r("field.bloom")}`,"error");return}if(d.length===0)return;let f=!!c.querySelector("[data-ac-bulk-reviewed]").checked;l.disabled=!0,p.hidden=!0,p.innerHTML="",u.hidden=!1;let b=[],y=0;for(let $=0;$<d.length;$+=1){let C=d[$];u.textContent=`${$+1} / ${d.length}`;try{await _.put(`learning/questions/${encodeURIComponent(C.id)}/pedagogy`,{criteria:[{objective_id:h,bloom_dimension_id:w,weight:1}],source:"manual",mark_reviewed:f}),y+=1}catch(j){b.push({question:C,message:j.message})}}u.textContent=r("bulk.done",{count:y}),l.hidden=!0,m.hidden=!1,g.hidden=!0,b.length?(p.hidden=!1,p.innerHTML=`<p class="ac-field__hint">${i(r("bulk.partial",{done:y,failed:b.length}))}</p>
			<ul class="learning-bulk__list">${b.map($=>`<li><strong>${i(xa($.question))}</strong> \u2014 ${i($.message)}</li>`).join("")}</ul>`,v(r("bulk.partial",{done:y,failed:b.length}),"error")):v(r("bulk.done",{count:y}),"success"),n&&n({done:y,failed:b.length})})}function qr(e,a=60){let t=String(e??"");return t.length>a?`${t.slice(0,a-1)}\u2026`:t}var Lr=["unclassified","partial","classified","needs_review"],Js=200,Cr=500,z={search:"",status:"",bloomId:"",objectiveId:"",limit:50,offset:0,selected:new Map},Zs={id:"learning-questions",path:"/learning/questions",title:"Question pedagogy",description:"Classify the questions of this organization against its learning objectives.",permission:["school.learning.read","class.learning.read"],async render(e,a){if(!await Be(e,a))return;wa(e,a,5);let t,n,s,r;try{[t,n,s,r]=await Promise.all([_a(),Er(),jr(),zr()])}catch(h){Ae(e,a,h);return}let d=Y(),o=Q(d),c=a.canAny(["school.learning.manage","class.learning.classify"]),u=Array.isArray(r?.data)?r.data:[],p=Number(r?.total??u.length),l=n.length===0,m=[z.search,z.status,z.bloomId,z.objectiveId].join("|");m!==z.signature&&(z.signature=m,z.selected.clear());let g=`
			${l?Nr(o):""}
			${G({fields:de({id:"ac-learning-search",placeholder:o("action.search"),value:z.search})+V({id:"ac-learning-status",label:o("field.pedagogyStatus"),value:z.status,includeAll:!0,allLabel:o("table.status"),options:Lr.map(h=>({value:h,label:o(`status.${h}`)}))})+V({id:"ac-learning-bloom",label:o("field.bloom"),value:z.bloomId,includeAll:!0,allLabel:o("field.bloom"),options:t.map(h=>({value:h.id,label:Ee(h,d)}))})+V({id:"ac-learning-objective",label:o("field.objective"),value:z.objectiveId,includeAll:!0,allLabel:o("field.objective"),options:n.map(h=>({value:h.id,label:`${h.code} \u2014 ${Xs(h.statement)}`}))}),actions:`
					<button type="button" class="ac-btn ac-btn--sm" data-ac-learning-refresh>${i(o("action.refresh"))}</button>
					<button type="button" class="ac-btn ac-btn--sm ac-btn--primary" data-ac-learning-bulk${c&&z.selected.size>0?"":" disabled"}>${i(o("action.classifySelected"))}${z.selected.size?` (${z.selected.size})`:""}</button>
					<button type="button" class="ac-btn ac-btn--sm" data-ac-learning-selectall${u.length?"":" disabled"}>${i(o("action.selectAll"))}</button>
					<button type="button" class="ac-btn ac-btn--sm" data-ac-learning-clearsel${z.selected.size?"":" disabled"}>${i(o("action.clearSelection"))}</button>`})}
			<div data-ac-learning-table>
				${q({columns:Pr({lang:d,t:o,bloom:t,canClassify:c,classifiable:!l}),rows:u,empty:o("empty.questions.message"),rowClass:h=>z.selected.has(h.id)?"is-selected":""})}
			</div>
			${se({total:p,limit:z.limit,offset:z.offset})}`;e.innerHTML=me({body:g}),he(e,a),Mr(e,a,{rows:u,objectives:n,bloom:t,competencies:s,canClassify:c,classifiable:!l})}};function Er(){return _.get("learning/objectives",{status:"active",limit:Js}).then(e=>Array.isArray(e?.data)?e.data:[])}function jr(){return _.get("learning/competencies",{status:"active",limit:Js}).then(e=>Array.isArray(e?.data)?e.data:[])}async function zr(){let e={limit:z.limit,offset:z.offset};if(z.search&&(e.search=z.search),z.status&&(e.pedagogy_status=z.status),z.bloomId&&(e.primary_bloom_dimension_id=z.bloomId),z.objectiveId){let a=await _.get(`learning/objectives/${encodeURIComponent(z.objectiveId)}/questions`,{limit:Cr}),t=[...new Set((a?.data||[]).map(n=>n.question_id).filter(Boolean))];if(t.length===0)return{data:[],total:0};e.ids=t.join(",")}return _.get("questions",e)}function Pr({lang:e,t:a,bloom:t,canClassify:n,classifiable:s}){return[{key:"select",label:"",className:"learning-col-select",render:r=>`<input type="checkbox" data-ac-learning-row="${i(r.id)}"${z.selected.has(r.id)?" checked":""} aria-label="${i(a("action.classify"))}" />`},{key:"text",label:a("table.question"),render:r=>`<span class="learning-question">
				<span class="learning-question__text">${i(Xs(r.text,90))}</span>
				<span class="learning-question__type">${i(r.type||"")}</span>
			</span>`},{key:"bloom",label:a("table.bloom"),render:r=>{let d=ea(t,r.primary_bloom_dimension_id);return d?i(Ee(d,e)):`<span class="ac-muted">${i(a("status.unclassified"))}</span>`}},{key:"pedagogy_status",label:a("table.status"),render:r=>aa(e,r.pedagogy_status||"unclassified")},{key:"actions",label:"",className:"learning-col-actions",render:r=>n?ne([{id:"classify",label:a("action.classify"),value:r.id,tone:"primary",hidden:!s}]):""}]}function Nr(e){return`<div class="ac-alert ac-alert--warning">
		<div class="ac-alert__body">
			<p class="ac-alert__title">${i(e("empty.objectives.title"))}</p>
			<p class="ac-alert__text">${i(e("empty.objectives.message"))}</p>
			<a class="ac-btn ac-btn--sm" href="#/learning/taxonomy">${i(e("nav.taxonomy"))}</a>
		</div>
	</div>`}function Mr(e,a,{rows:t,objectives:n,bloom:s,competencies:r,canClassify:d,classifiable:o}){for(let m of s)bloomCache.set(m.id,m);let c=()=>a.rerender(),u=e.querySelector("#ac-learning-search"),p=null;u?.addEventListener("input",()=>{clearTimeout(p),p=setTimeout(()=>{z.search=u.value.trim(),z.offset=0,c()},220)});let l=(m,g)=>{let h=e.querySelector(`#${m}`);h?.addEventListener("change",()=>{z[g]=h.value,z.offset=0,c()})};l("ac-learning-status","status"),l("ac-learning-bloom","bloomId"),l("ac-learning-objective","objectiveId"),e.querySelector("[data-ac-learning-refresh]")?.addEventListener("click",c),da(e,{onPage:m=>{z.offset=m,c()}}),e.querySelectorAll("[data-ac-learning-row]").forEach(m=>{m.addEventListener("change",()=>{let g=t.find(h=>h.id===m.dataset.acLearningRow);g&&(m.checked?z.selected.set(g.id,g):z.selected.delete(g.id),Rr(e))})}),e.querySelector("[data-ac-learning-selectall]")?.addEventListener("click",()=>{for(let m of t)z.selected.set(m.id,m);c()}),e.querySelector("[data-ac-learning-clearsel]")?.addEventListener("click",()=>{z.selected.clear(),c()}),d&&_e(e,{classify:m=>{let g=t.find(h=>h.id===m);g&&Or({question:g,ctx:a,bloom:s,objectives:n,competencies:r})}}),e.querySelector("[data-ac-learning-bulk]")?.addEventListener("click",()=>{!d||z.selected.size===0||Ks({questions:[...z.selected.values()],bloom:s,objectives:n,onDone:({done:m})=>{m>0&&(z.selected.clear(),c())}})})}function Rr(e){let a=e.querySelector("[data-ac-learning-bulk]"),t=e.querySelector("[data-ac-learning-clearsel]"),n=z.selected.size;a&&(a.disabled=n===0,a.textContent=n?`${Te()("action.classifySelected")} (${n})`:Te()("action.classifySelected")),t&&(t.disabled=n===0)}function Or({question:e,ctx:a,bloom:t,objectives:n,competencies:s}){Vs({question:e,bloom:t,objectives:n,competencies:s,onSaved:()=>{z.selected.delete(e.id),a.rerender()}})}function Xs(e,a=60){let t=String(e??"");return t.length>a?`${t.slice(0,a-1)}\u2026`:t}function $a({objective:e=null,subjects:a,objectives:t,categories:n,bloom:s,onSaved:r}){let d=Y(),o=Q(d),c=!!e,u=e?.id||null,p=(t||[]).filter(f=>f.id!==u),l=I({title:o(c?"action.edit":"action.newObjective"),subtitle:c?e.code:o("hint.teacherProposal"),wide:!0,body:`
			<div class="ac-form" data-ac-form>
				<div data-ac-form-error hidden></div>
				<div class="ac-form__grid">
					${U({id:"ac-obj-subject",label:o("field.subject"),value:e?.subject_id||"",options:a.map(f=>({value:f.id,label:f.name})),allLabel:null})}
					${A({id:"ac-obj-code",label:o("field.code"),value:e?.code||""})}
					${A({id:"ac-obj-order",label:o("field.orderIndex"),type:"number",value:e?.order_index??0})}
					${U({id:"ac-obj-bloom",label:o("field.bloom"),value:e?.primary_bloom_dimension_id||"",options:Ue(s,{lang:d}),allLabel:"\u2014"})}
					<div class="ac-field ac-field--full">
						<label class="ac-field__label" for="ac-obj-statement">${i(o("field.statement"))}</label>
						<input class="ac-input ac-input--full" id="ac-obj-statement" type="text" value="${i(e?.statement||"")}" autocomplete="off" />
					</div>
					${Ce({id:"ac-obj-description",label:o("field.description"),value:e?.description||"",rows:3})}
					<div data-ac-obj-dependent class="ac-field ac-field--full"></div>
				</div>
			</div>`,footer:`
			<button type="button" class="ac-btn" data-ac-form-cancel>${i(o("action.cancel"))}</button>
			<button type="button" class="ac-btn ac-btn--primary" data-ac-form-save>${i(o("action.save"))}</button>`}),m=l.root,g=m.querySelector("#ac-obj-subject"),h=m.querySelector("[data-ac-obj-dependent]");function w(){let f=g.value||e?.subject_id||"",b=(n||[]).filter($=>!f||!$.subject_id||$.subject_id===f),y=p.filter($=>!f||$.subject_id===f);h.innerHTML=`<div class="ac-form__grid">
			${U({id:"ac-obj-category",label:o("field.category"),value:e?.category_id||"",options:b.map($=>({value:$.id,label:$.name})),allLabel:"\u2014"})}
			${U({id:"ac-obj-parent",label:o("field.parent"),value:e?.parent_id||"",options:y.map($=>({value:$.id,label:`${$.code} \u2014 ${ka($.statement)}`})),allLabel:"\u2014"})}
		</div>`}w(),g.addEventListener("change",w),m.querySelector("[data-ac-form-cancel]").addEventListener("click",()=>l.close()),m.querySelector("[data-ac-form-save]").addEventListener("click",async f=>{let b=f.currentTarget,y={subject_id:re(m,"#ac-obj-subject"),code:re(m,"#ac-obj-code"),statement:re(m,"#ac-obj-statement"),description:qe(m.querySelector("#ac-obj-description")),category_id:qe(m.querySelector("#ac-obj-category")),parent_id:qe(m.querySelector("#ac-obj-parent")),primary_bloom_dimension_id:qe(m.querySelector("#ac-obj-bloom"))},$=re(m,"#ac-obj-order");$!==""&&(y.order_index=$),await Sa({root:m,button:b,url:c?`learning/objectives/${encodeURIComponent(u)}`:"learning/objectives",method:c?"patch":"post",body:y,toastMessage:o("toast.objectiveSaved"),onSaved:C=>{l.close(),r?.(C)}})})}function et({competency:e=null,subjects:a,competencies:t,onSaved:n}){let s=Y(),r=Q(s),d=!!e,o=e?.id||null,c=I({title:r(d?"action.edit":"action.newCompetency"),subtitle:d?e.code:"",wide:!0,body:`
			<div class="ac-form" data-ac-form>
				<div data-ac-form-error hidden></div>
				<div class="ac-form__grid">
					${A({id:"ac-comp-code",label:r("field.code"),value:e?.code||""})}
					${A({id:"ac-comp-name",label:r("field.name"),value:e?.name||""})}
					${U({id:"ac-comp-kind",label:r("field.kind"),value:e?.kind||"competency",options:["competency","skill","domain"].map(p=>({value:p,label:r(`kind.${p}`)}))})}
					${U({id:"ac-comp-subject",label:r("field.subject"),value:e?.subject_id||"",options:a.map(p=>({value:p.id,label:p.name})),allLabel:"\u2014"})}
					${U({id:"ac-comp-parent",label:r("field.parent"),value:e?.parent_id||"",options:(t||[]).filter(p=>p.id!==o).map(p=>({value:p.id,label:`${p.code} \u2014 ${p.name}`})),allLabel:"\u2014"})}
					${Ce({id:"ac-comp-description",label:r("field.description"),value:e?.description||"",rows:3})}
				</div>
			</div>`,footer:`
			<button type="button" class="ac-btn" data-ac-form-cancel>${i(r("action.cancel"))}</button>
			<button type="button" class="ac-btn ac-btn--primary" data-ac-form-save>${i(r("action.save"))}</button>`}),u=c.root;u.querySelector("[data-ac-form-cancel]").addEventListener("click",()=>c.close()),u.querySelector("[data-ac-form-save]").addEventListener("click",async p=>{await Sa({root:u,button:p.currentTarget,url:d?`learning/competencies/${encodeURIComponent(o)}`:"learning/competencies",method:d?"patch":"post",body:{code:re(u,"#ac-comp-code"),name:re(u,"#ac-comp-name"),description:qe(u.querySelector("#ac-comp-description")),kind:re(u,"#ac-comp-kind"),subject_id:qe(u.querySelector("#ac-comp-subject")),parent_id:qe(u.querySelector("#ac-comp-parent"))},toastMessage:r("toast.competencySaved"),onSaved:l=>{c.close(),n?.(l)}})})}function en({objective:e,competencies:a,onSaved:t}){let n=Y(),s=Q(n),r=I({title:s("action.linkCompetency"),subtitle:`${e.code} \u2014 ${ka(e.statement)}`,body:`
			<div class="ac-form" data-ac-form>
				<div data-ac-form-error hidden></div>
				<div class="ac-form__grid">
					${U({id:"ac-link-competency",label:s("field.competency"),value:"",options:(a||[]).map(o=>({value:o.id,label:`${o.code} \u2014 ${o.name}`})),allLabel:"\u2014"})}
					${A({id:"ac-link-weight",label:s("field.weight"),type:"number",value:1})}
				</div>
				${Ke({id:"ac-link-primary",label:s("field.primaryCompetency")})}
			</div>`,footer:`
			<button type="button" class="ac-btn" data-ac-form-cancel>${i(s("action.cancel"))}</button>
			<button type="button" class="ac-btn ac-btn--primary" data-ac-form-save>${i(s("action.linkCompetency"))}</button>`}),d=r.root;d.querySelector("[data-ac-form-cancel]").addEventListener("click",()=>r.close()),d.querySelector("[data-ac-form-save]").addEventListener("click",async o=>{await Sa({root:d,button:o.currentTarget,url:`learning/objectives/${encodeURIComponent(e.id)}/competencies`,method:"post",body:{competency_id:re(d,"#ac-link-competency"),weight:Number(re(d,"#ac-link-weight"))||1,is_primary:d.querySelector("#ac-link-primary").checked},toastMessage:s("toast.linked"),onSaved:()=>{r.close(),t?.()}})})}function an({objective:e,objectives:a,onSaved:t}){let n=Y(),s=Q(n),r=(a||[]).filter(c=>c.id!==e?.id),d=I({title:s("action.addPrerequisite"),subtitle:`${e.code} \u2014 ${ka(e.statement)}`,body:`
			<div class="ac-form" data-ac-form>
				<div data-ac-form-error hidden></div>
				<div class="ac-form__grid">
					${U({id:"ac-prereq-objective",label:s("field.objective"),value:"",options:r.map(c=>({value:c.id,label:`${c.code} \u2014 ${ka(c.statement)}`})),allLabel:"\u2014"})}
					${U({id:"ac-prereq-strength",label:s("field.strength"),value:"required",options:["required","recommended"].map(c=>({value:c,label:s(`strength.${c}`)}))})}
					${A({id:"ac-prereq-mastery",label:s("field.minMastery"),value:"developing"})}
					${Ce({id:"ac-prereq-rationale",label:s("field.rationale"),value:"",rows:2})}
				</div>
			</div>`,footer:`
			<button type="button" class="ac-btn" data-ac-form-cancel>${i(s("action.cancel"))}</button>
			<button type="button" class="ac-btn ac-btn--primary" data-ac-form-save>${i(s("action.addPrerequisite"))}</button>`}),o=d.root;o.querySelector("[data-ac-form-cancel]").addEventListener("click",()=>d.close()),o.querySelector("[data-ac-form-save]").addEventListener("click",async c=>{let u=re(o,"#ac-prereq-objective");if(!u){v(`${s("field.objective")} \u2014 ${s("error.save")}`,"error");return}await Sa({root:o,button:c.currentTarget,url:`learning/objectives/${encodeURIComponent(e.id)}/prerequisites`,method:"post",body:{prerequisite_objective_id:u,strength:re(o,"#ac-prereq-strength"),min_mastery_state:re(o,"#ac-prereq-mastery")||"developing",rationale:qe(o.querySelector("#ac-prereq-rationale"))},toastMessage:s("toast.prerequisiteAdded"),onSaved:()=>{d.close(),t?.()}})})}async function Sa({root:e,button:a,url:t,method:n,body:s,toastMessage:r,onSaved:d}){a.disabled=!0,Dr(e);try{let o=await(n==="patch"?_.patch(t,s):_.post(t,s));v(r,"success"),d?.(o)}catch(o){a.disabled=!1,Ir(e,o)}}function Ir(e,a){let t=e.querySelector("[data-ac-form-error]");if(!t)return;let n=Hr(a);t.hidden=!1,t.innerHTML=`<div class="ac-alert ac-alert--danger"><div class="ac-alert__body">${n.map(s=>`<p class="ac-alert__text">${i(s)}</p>`).join("")}</div></div>`}function Dr(e){let a=e.querySelector("[data-ac-form-error]");a&&(a.hidden=!0,a.innerHTML="")}function Hr(e){let a=e?.fields&&typeof e.fields=="object"?e.fields:null;if(!a)return[e?.message||"The change could not be saved"];let t=[];for(let[n,s]of Object.entries(a)){let r=Array.isArray(s)?s:[s];for(let d of r)t.push(`${n}: ${typeof d=="string"?d:JSON.stringify(d)}`)}return t.length?t:[e?.message||"The change could not be saved"]}function re(e,a){return String(e.querySelector(a)?.value??"").trim()}function qe(e){let a=String(e?.value??"").trim();return a===""?null:a}function ka(e,a=56){let t=String(e??"");return t.length>a?`${t.slice(0,a-1)}\u2026`:t}var Br=["proposed","active","rejected","archived"],Ur=["competency","skill","domain"],Fr=["active","archived"],Ta=200,P={tab:"objectives",detailId:null,search:"",status:"",kind:"",limit:25,offset:0},nn={id:"learning-taxonomy",path:"/learning/taxonomy",title:"Taxonomy",description:"The learning objectives and competencies of this organization.",permission:["school.learning.read","class.learning.read"],async render(e,a,t){if(!await Be(e,a))return;wa(e,a,5);let n=a.canAny(["school.learning.manage"]),s=t?.query?.tab;["objectives","competencies","proposals"].includes(s)&&(P.tab=s,P.detailId=null,P.offset=0),!n&&P.tab!=="objectives"&&(P.tab="objectives");let r;try{r=await Gr()}catch(m){Ae(e,a,m);return}if(P.detailId){await Zr(e,a,{canManage:n,lookups:r});return}let d;try{d=await Wr()}catch(m){Ae(e,a,m);return}let o=Y(),c=Q(o),u=Array.isArray(d?.data)?d.data:[],p=Number(d?.total??u.length),l=`
			${Yr({state:P,t:c,canManage:n})}
			${Qr({state:P,rows:u,total:p,lang:o,t:c,canManage:n,lookups:r})}`;e.innerHTML=me({body:l}),he(e,a),ai(e,a,{rows:u,t:c,canManage:n,lookups:r})}};async function Gr(){let[e,a,t,n]=await Promise.all([_.get("subjects",{limit:Ta}).then(s=>s?.data||[]),_.get("categories",{limit:Ta}).then(s=>s?.data||[]),_a(),_.get("learning/objectives",{limit:Ta}).then(s=>s?.data||[])]);return{subjects:e,categories:a,bloom:t,objectives:n}}function Wr(){if(P.tab==="competencies"){let a={limit:P.limit,offset:P.offset};return P.search&&(a.search=P.search),P.kind&&(a.kind=P.kind),P.status&&(a.status=P.status),_.get("learning/competencies",a)}let e={limit:P.limit,offset:P.offset};return P.search&&(e.search=P.search),P.tab==="proposals"?e.status="proposed":P.status&&(e.status=P.status),_.get("learning/objectives",e)}function Yr({state:e,t:a,canManage:t}){let n=[{key:"objectives",label:a("summary.objectives")}];return t&&(n.push({key:"competencies",label:a("summary.competencies")}),n.push({key:"proposals",label:a("summary.proposed")})),`<div class="learning-tabs" role="tablist">${n.map(s=>`<button type="button" class="learning-tab${s.key===e.tab?" is-active":""}" role="tab" aria-selected="${s.key===e.tab}" data-ac-learning-tab="${i(s.key)}">${i(s.label)}</button>`).join("")}</div>`}function Qr({state:e,rows:a,total:t,lang:n,t:s,canManage:r,lookups:d}){return e.tab==="competencies"?`
			${G({fields:de({id:"ac-tax-search",placeholder:s("action.search"),value:e.search})+V({id:"ac-tax-kind",label:s("field.kind"),value:e.kind,includeAll:!0,allLabel:s("field.kind"),options:Ur.map(o=>({value:o,label:s(`kind.${o}`)}))})+V({id:"ac-tax-status",label:s("field.status"),value:e.status,includeAll:!0,allLabel:s("field.status"),options:Fr.map(o=>({value:o,label:s(`objective.${o}`)}))}),actions:`<button type="button" class="ac-btn ac-btn--sm" data-ac-tax-refresh>${i(s("action.refresh"))}</button><button type="button" class="ac-btn ac-btn--sm ac-btn--primary" data-ac-tax-new-competency>${i(s("action.newCompetency"))}</button>`})}
			${q({columns:Kr({lang:n,t:s,lookups:d}),rows:a,empty:s("empty.competencies.message")})}
			${se({total:t,limit:e.limit,offset:e.offset})}`:e.tab==="proposals"?`
			${G({fields:de({id:"ac-tax-search",placeholder:s("action.search"),value:e.search}),actions:`<button type="button" class="ac-btn ac-btn--sm" data-ac-tax-refresh>${i(s("action.refresh"))}</button>`})}
			${q({columns:Jr({lang:n,t:s}),rows:a,empty:s("empty.proposals.message")})}
			${se({total:t,limit:e.limit,offset:e.offset})}`:`
		${G({fields:de({id:"ac-tax-search",placeholder:s("action.search"),value:e.search})+V({id:"ac-tax-status",label:s("field.status"),value:e.status,includeAll:!0,allLabel:s("field.status"),options:Br.map(o=>({value:o,label:s(`objective.${o}`)}))}),actions:`<button type="button" class="ac-btn ac-btn--sm" data-ac-tax-refresh>${i(s("action.refresh"))}</button><button type="button" class="ac-btn ac-btn--sm ac-btn--primary" data-ac-tax-new-objective>${i(s(r?"action.newObjective":"action.proposeObjective"))}</button>`})}
		${q({columns:Vr({lang:n,t:s,canManage:r,lookups:d}),rows:a,empty:s("empty.objectives.message")})}
		${se({total:t,limit:e.limit,offset:e.offset})}`}function Vr({lang:e,t:a,canManage:t,lookups:n}){return[{key:"code",label:a("table.code"),render:s=>i(s.code)},{key:"statement",label:a("table.statement"),render:s=>i(je(s.statement,90))},{key:"subject",label:a("table.subject"),render:s=>i(at(n.subjects,s.subject_id))},{key:"bloom",label:a("table.bloom"),render:s=>{let r=ea(n.bloom,s.primary_bloom_dimension_id);return r?i(Ee(r,e)):"\u2014"}},{key:"status",label:a("field.status"),render:s=>ta(e,s.status)},{key:"actions",label:"",className:"learning-col-actions",render:s=>ne([{id:"open",label:a("action.open"),value:s.id},{id:"edit",label:a("action.edit"),value:s.id},{id:"archive",label:a("action.archive"),value:s.id,tone:"danger",hidden:!t||s.status==="archived"}])}]}function Kr({lang:e,t:a,lookups:t}){return[{key:"code",label:a("table.code"),render:n=>i(n.code)},{key:"name",label:a("table.competency"),render:n=>i(je(n.name,80))},{key:"kind",label:a("table.kind"),render:n=>i(a(`kind.${n.kind||"competency"}`))},{key:"subject",label:a("table.subject"),render:n=>i(at(t.subjects,n.subject_id))},{key:"status",label:a("field.status"),render:n=>ta(e,n.status)},{key:"actions",label:"",className:"learning-col-actions",render:n=>ne([{id:"edit-competency",label:a("action.edit"),value:n.id},{id:"archive-competency",label:a("action.archive"),value:n.id,tone:"danger",hidden:n.status==="archived"}])}]}function Jr({lang:e,t:a}){return[{key:"code",label:a("table.code"),render:t=>i(t.code)},{key:"statement",label:a("table.statement"),render:t=>i(je(t.statement,110))},{key:"created",label:a("table.created"),render:t=>i(N(t.created_at,{withTime:!1}))},{key:"status",label:a("field.status"),render:t=>ta(e,t.status)},{key:"actions",label:"",className:"learning-col-actions",render:t=>ne([{id:"approve",label:a("action.approve"),value:t.id,tone:"primary"},{id:"reject",label:a("action.reject"),value:t.id,tone:"danger"}])}]}async function Zr(e,a,{canManage:t,lookups:n}){let s=Y(),r=Q(s),d;try{d=await _.get(`learning/objectives/${encodeURIComponent(P.detailId)}`)}catch(l){P.detailId=null,Ae(e,a,l);return}let o=Array.isArray(d.competencies)?d.competencies:[],c=Array.isArray(d.prerequisites)?d.prerequisites:[],u=ea(n.bloom,d.primary_bloom_dimension_id),p=`
		<div class="learning-detail">
			<button type="button" class="ac-btn ac-btn--sm" data-ac-tax-back>\u2190 ${i(r("summary.objectives"))}</button>
			<div class="learning-detail__head">
				<span class="learning-detail__code">${i(d.code)}</span>
				${ta(s,d.status)}
				${t?`<button type="button" class="ac-btn ac-btn--sm" data-ac-tax-edit="${i(d.id)}">${i(r("action.edit"))}</button>`:""}
			</div>
			<p class="learning-detail__statement">${i(d.statement)}</p>
			${d.description?`<p class="learning-detail__description">${i(d.description)}</p>`:""}
			<p class="learning-detail__meta">
				<span>${i(r("field.subject"))}: ${i(at(n.subjects,d.subject_id))}</span>
				${u?`<span>${i(r("field.bloom"))}: ${i(Ee(u,s))}</span>`:""}
			</p>
		</div>

		<section class="ac-section-panel">
			<div class="ac-section-panel__head">
				<h3 class="ac-section-panel__title">${i(r("summary.competencies"))}</h3>
				${t?`<div class="ac-panel__actions"><button type="button" class="ac-btn ac-btn--sm" data-ac-tax-link>${i(r("action.linkCompetency"))}</button></div>`:""}
			</div>
			<div class="ac-section-panel__body">
				${o.length?Xr(o,{t:r,canManage:t}):B({title:r("empty.competencies.title"),message:r("empty.competencies.message")})}
			</div>
		</section>

		<section class="ac-section-panel">
			<div class="ac-section-panel__head">
				<h3 class="ac-section-panel__title">${i(r("summary.prerequisites"))}</h3>
				${t?`<div class="ac-panel__actions"><button type="button" class="ac-btn ac-btn--sm" data-ac-tax-prereq>${i(r("action.addPrerequisite"))}</button></div>`:""}
			</div>
			<div class="ac-section-panel__body">
				${c.length?ei(c,{t:r,canManage:t,lookups:n}):B({title:r("empty.prerequisites.title"),message:r("empty.prerequisites.message")})}
			</div>
		</section>`;e.innerHTML=me({body:p}),he(e,a),e.querySelector("[data-ac-tax-back]")?.addEventListener("click",()=>{P.detailId=null,a.rerender()}),e.querySelector("[data-ac-tax-edit]")?.addEventListener("click",()=>{$a({objective:d,subjects:n.subjects,objectives:n.objectives,categories:n.categories,bloom:n.bloom,onSaved:()=>a.rerender()})}),e.querySelector("[data-ac-tax-link]")?.addEventListener("click",async()=>{en({objective:d,competencies:await ti(),onSaved:()=>a.rerender()})}),e.querySelector("[data-ac-tax-prereq]")?.addEventListener("click",()=>{an({objective:d,objectives:n.objectives,onSaved:()=>a.rerender()})}),_e(e,{unlink:async l=>{try{await _.del(`learning/objectives/${encodeURIComponent(d.id)}/competencies/${encodeURIComponent(l)}`),v(r("toast.unlinked"),"success"),a.rerender()}catch(m){v(m.message,"error")}},"unlink-prerequisite":async l=>{try{await _.del(`learning/objectives/${encodeURIComponent(d.id)}/prerequisites/${encodeURIComponent(l)}`),v(r("toast.prerequisiteRemoved"),"success"),a.rerender()}catch(m){v(m.message,"error")}}})}function Xr(e,{t:a,canManage:t}){return q({columns:[{key:"code",label:a("table.code"),render:n=>i(n.code||"\u2014")},{key:"name",label:a("table.competency"),render:n=>i(n.name||"\u2014")},{key:"weight",label:a("table.weight"),render:n=>i(String(n.weight??"\u2014"))},{key:"actions",label:"",className:"learning-col-actions",render:n=>t?ne([{id:"unlink",label:a("action.unlink"),value:n.competency_id,tone:"danger"}]):""}],rows:e,empty:a("empty.competencies.message")})}function ei(e,{t:a,canManage:t,lookups:n}){return q({columns:[{key:"objective",label:a("table.objective"),render:s=>i(si(n.objectives,s.prerequisite_objective_id))},{key:"strength",label:a("field.strength"),render:s=>i(a(`strength.${s.strength}`))},{key:"min_mastery_state",label:a("field.minMastery"),render:s=>i(s.min_mastery_state||"\u2014")},{key:"rationale",label:a("field.rationale"),render:s=>i(je(s.rationale||"\u2014",60))},{key:"actions",label:"",className:"learning-col-actions",render:s=>t?ne([{id:"unlink-prerequisite",label:a("action.remove"),value:s.prerequisite_objective_id,tone:"danger"}]):""}],rows:e,empty:a("empty.prerequisites.message")})}function ai(e,a,{rows:t,t:n,canManage:s,lookups:r}){e.querySelectorAll("[data-ac-learning-tab]").forEach(c=>{c.addEventListener("click",()=>{P.tab=c.dataset.acLearningTab,P.detailId=null,P.offset=0,P.search="",P.status="",P.kind="",a.rerender()})});let d=e.querySelector("#ac-tax-search"),o=null;d?.addEventListener("input",()=>{clearTimeout(o),o=setTimeout(()=>{P.search=d.value.trim(),P.offset=0,a.rerender()},220)});for(let[c,u]of[["ac-tax-status","status"],["ac-tax-kind","kind"]]){let p=e.querySelector(`#${c}`);p?.addEventListener("change",()=>{P[u]=p.value,P.offset=0,a.rerender()})}e.querySelector("[data-ac-tax-refresh]")?.addEventListener("click",()=>a.rerender()),da(e,{onPage:c=>{P.offset=c,a.rerender()}}),e.querySelector("[data-ac-tax-new-objective]")?.addEventListener("click",()=>{$a({subjects:r.subjects,objectives:r.objectives,categories:r.categories,bloom:r.bloom,onSaved:()=>a.rerender()})}),e.querySelector("[data-ac-tax-new-competency]")?.addEventListener("click",()=>{et({subjects:r.subjects,competencies:t,onSaved:()=>a.rerender()})}),_e(e,{open:c=>{P.detailId=c,a.rerender()},edit:c=>{let u=t.find(p=>p.id===c);u&&$a({objective:u,subjects:r.subjects,objectives:r.objectives,categories:r.categories,bloom:r.bloom,onSaved:()=>a.rerender()})},archive:async c=>{let u=t.find(l=>l.id===c);if(await D({title:n("action.archive"),message:n("action.archive"),detail:u?`${u.code} \u2014 ${je(u.statement,80)}`:"",confirmLabel:n("action.archive"),danger:!0}))try{await _.patch(`learning/objectives/${encodeURIComponent(c)}`,{status:"archived"}),v(n("toast.archived"),"success"),a.rerender()}catch(l){v(l.message,"error")}},"edit-competency":c=>{let u=t.find(p=>p.id===c);u&&et({competency:u,subjects:r.subjects,competencies:t,onSaved:()=>a.rerender()})},"archive-competency":async c=>{let u=t.find(l=>l.id===c);if(await D({title:n("action.archive"),message:n("action.archive"),detail:u?`${u.code} \u2014 ${u.name}`:"",confirmLabel:n("action.archive"),danger:!0}))try{await _.post(`learning/competencies/${encodeURIComponent(c)}/archive`,{}),v(n("toast.competencySaved"),"success"),a.rerender()}catch(l){v(l.message,"error")}},approve:c=>{let u=t.find(p=>p.id===c);u&&tn({objective:u,mode:"approve",t:n,onDone:()=>a.rerender()})},reject:c=>{let u=t.find(p=>p.id===c);u&&tn({objective:u,mode:"reject",t:n,onDone:()=>a.rerender()})}})}async function ti(){try{return(await _.get("learning/competencies",{limit:Ta,status:"active"}))?.data||[]}catch{return[]}}function tn({objective:e,mode:a,t,onDone:n}){let s=a==="approve",r=I({title:t(s?"action.approve":"action.reject"),subtitle:`${e.code} \u2014 ${je(e.statement,70)}`,body:`
			<div class="ac-form" data-ac-form>
				<div data-ac-form-error hidden></div>
				${Ce({id:"ac-review-note",label:t("field.reviewNote"),value:"",rows:3,hint:s?"":t("hint.teacherProposal")})}
			</div>`,footer:`
			<button type="button" class="ac-btn" data-ac-review-cancel>${i(t("action.cancel"))}</button>
			<button type="button" class="ac-btn ${s?"ac-btn--primary":"ac-btn--danger"}" data-ac-review-save>${i(t(s?"action.approve":"action.reject"))}</button>`}),d=r.root;d.querySelector("[data-ac-review-cancel]").addEventListener("click",()=>r.close()),d.querySelector("[data-ac-review-save]").addEventListener("click",async o=>{let c=d.querySelector("#ac-review-note").value.trim();if(!s&&!c){sn(d,t("field.reviewNote"));return}let u=o.currentTarget;u.disabled=!0;try{await _.post(`learning/objectives/${encodeURIComponent(e.id)}/${s?"approve":"reject"}`,{note:c||null}),v(t(s?"toast.approved":"toast.rejected"),"success"),r.close(),n?.()}catch(p){u.disabled=!1,sn(d,p.message)}})}function sn(e,a){let t=e.querySelector("[data-ac-form-error]");t&&(t.hidden=!1,t.innerHTML=`<div class="ac-alert ac-alert--danger"><div class="ac-alert__body"><p class="ac-alert__text">${i(a)}</p></div></div>`)}function at(e,a){return a&&(e||[]).find(t=>t.id===a)?.name||"\u2014"}function si(e,a){let t=(e||[]).find(n=>n.id===a);return t?`${t.code} \u2014 ${je(t.statement,50)}`:"\u2014"}function je(e,a=60){let t=String(e??"");return t.length>a?`${t.slice(0,a-1)}\u2026`:t}var ni=[{id:"overview",path:"/",title:"Overview",icon:"overview",permission:["platform.console","school.console"]},{id:"teaching",path:"/teaching",title:"Teaching & Learning",icon:"analytics",group:"Analytics",permission:["platform.analytics.read","school.analytics.read"]},{id:"analytics",path:"/analytics",title:"Platform Analytics",icon:"analytics",group:"Analytics",permission:["platform.analytics.read","school.analytics.read"]},{id:"learning",path:"/learning",title:"Learning",icon:"learning",group:"Teaching",permission:Za},{id:"organizations",path:"/organizations",title:"Organizations",icon:"organizations",group:"Manage",permission:["platform.organizations.read","school.profile.read"]},{id:"users",path:"/users",title:"Users & Access",icon:"users",group:"Manage",permission:["platform.users.read","school.users.read"]},{id:"audit",path:"/audit",title:"Activity & Audit",icon:"audit",group:"Manage",permission:["platform.audit.read","school.audit.read"]},{id:"health",path:"/health",title:"System Health",icon:"health",group:"Manage",permission:["platform.health.read","school.health.read"]},{id:"settings",path:"/settings",title:"Settings",icon:"settings",group:"Manage",permission:["platform.settings.manage","school.settings.manage"]}],tt=[Ia,{...Ia,id:"overview-alias",path:"/overview"},Wt,Rs,Yt,Zt,Xt,es,Is,as,ts,ss,ns,Ms,Ys,Zs,nn],sa=document.getElementById("ac-boot"),ri=document.getElementById("ac-root"),cn="/admin.html",st={cap:["M22 10v6M2 10l10-5 10 5-10 5-10-5z","M6 12v5c3 3 9 3 12 0v-5"],lock:["M7 10V7a5 5 0 0 1 10 0v3","M5 10h14v11H5z","M12 15v2"],warning:["M10.3 3.9 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z","M12 9v4","M12 17h.01"]};function ae(e,a,t){let n=document.createElement(e);return a&&(n.className=a),t!=null&&(n.textContent=t),n}function rn(e,a=22){let t="http://www.w3.org/2000/svg",n=document.createElementNS(t,"svg");n.setAttribute("viewBox","0 0 24 24"),n.setAttribute("width",String(a)),n.setAttribute("height",String(a)),n.setAttribute("fill","none"),n.setAttribute("stroke","currentColor"),n.setAttribute("stroke-width","1.8"),n.setAttribute("stroke-linecap","round"),n.setAttribute("stroke-linejoin","round"),n.setAttribute("aria-hidden","true"),n.setAttribute("focusable","false");for(let s of e){let r=document.createElementNS(t,"path");r.setAttribute("d",s),n.appendChild(r)}return n}function ln({message:e,hint:a="",code:t="",meta:n="",tone:s="danger",actions:r=[]}){if(!sa)return;document.title="Could not open \xB7 Control Center",sa.classList.add("ac-boot--error"),sa.replaceChildren();let d=ae("div","ac-boot__card");d.setAttribute("role","alert");let o=ae("div","ac-boot__brand"),c=ae("span","ac-boot__brand-mark");c.appendChild(rn(st.cap,13)),o.append(c,ae("span","ac-boot__brand-text","Platform Control Center"));let u=ae("div",`ac-boot__icon ac-boot__icon--${s}`);u.setAttribute("aria-hidden","true"),u.appendChild(rn(s==="warning"?st.warning:st.lock));let p=ae("h1","ac-boot__title","Could not open the control center"),l=ae("p","ac-boot__message",e);if(d.append(o,u,p,l),a&&d.appendChild(ae("p","ac-boot__hint",a)),r.length){let m=ae("div","ac-boot__actions");for(let g of r)if(g.href){let h=ae("a",`ac-btn ${g.variant||""}`.trim(),g.label);h.href=g.href,m.appendChild(h)}else{let h=ae("button",`ac-btn ${g.variant||""}`.trim(),g.label);h.type="button",h.addEventListener("click",g.onClick),m.appendChild(h)}d.appendChild(m)}if(t||n){let m=ae("p","ac-boot__meta");t&&m.appendChild(ae("span","ac-boot__code",t)),n&&m.appendChild(document.createTextNode(n)),d.appendChild(m)}sa.appendChild(d)}var dn=()=>window.location.reload();function on(){ln({message:"Your session has ended. Please sign in again.",meta:"Signing in again reopens this console.",actions:[{label:"Go to the sign-in page",href:cn,variant:"ac-btn--primary"},{label:"Try again",onClick:dn,variant:"ac-btn--ghost"}]})}var nt=null,ot=null;async function ii(){Ma(),ut(()=>{bt()});let e;try{e=await gt()}catch(p){p?.status===401||p?.code==="UNAUTHORIZED"?on():ln({message:p?.message||"The console could not reach the server.",hint:"Check that the server is running, then try again.",code:p?.code||"",tone:"warning",actions:[{label:"Try again",onClick:dn,variant:"ac-btn--primary"},{label:"Go to the sign-in page",href:cn}]});return}if(!e?.user){on();return}let a=Pt(ri,{session:e,navItems:ni,canAny:Ea,onNavigate:p=>ie(p)}),t={canAny:Ea,session:e,organization:e.scope?.organization||null,isPlatform:!!e.scope?.isPlatform,deployment:e.deployment||{},isOffline:!!e.deployment?.isOffline,getState:ht,setPeriod:(p,l)=>{ft(p,l),it(a,t,nt)},rerender:()=>it(a,t,nt),setTitle:(p,l)=>{p&&(a.title.textContent=p),l!==void 0&&(a.description.textContent=l),document.title=`${p||a.title.textContent} \xB7 Control Center`}};xt(t),_t(tt,{notFound:{id:"not-found",path:"/not-found",title:"Page not found",description:"That section does not exist in the control center.",render(p){p.innerHTML=`<div class="ac-empty">
					<p class="ac-empty__title">Page not found</p>
					<p class="ac-empty__message">The address you opened does not match a section of the control center.</p>
					<a class="ac-btn ac-btn--primary" href="#/">Back to the overview</a>
				</div>`}}}),wt(p=>{nt=p,a.title.textContent=p.title,a.description.textContent=p.description||"",a.setActive(p.path),document.title=`${p.title} \xB7 Control Center`,it(a,t,p)});let n='<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"></path><polyline points="12 19 5 12 12 5"></polyline></svg>';function s(p){let l=Na();if(!l||Array.from(p.querySelectorAll("a, button")).find(f=>/^←\s/.test(f.textContent.trim())))return;let g=p.querySelector(".ac-toolbar__push");if(!g||g.querySelector(".ac-back-btn"))return;let h=document.createElement("button");h.type="button",h.className="ac-btn ac-back-btn",h.innerHTML=`${n}<span class="ac-back-btn__label">Back</span>`;let w=r(l);w&&(h.title=`Back to ${w}`),h.setAttribute("aria-label",w?`Back to ${w}`:"Back to the previous page"),h.addEventListener("click",()=>kt()),g.prepend(h)}function r(p){let l=String(p||"").replace(/^#/,"").split("?")[0],m=tt.find(g=>g.path===l);return m?m.title:l.startsWith("/users/")?"Users & Access":l.startsWith("/organizations/")?"Organizations":null}ot=s;function d(){let p=document.getElementById("ac-global-search"),l=document.getElementById("ac-search-panel"),m=document.getElementById("ac-search-clear");if(!p||!l)return;let g=Nt(tt,Ze),h=[],w=-1,f=null,b=()=>{m&&(m.hidden=p.value.length===0)},y=()=>{l.hidden=!0,l.innerHTML="",h=[],w=-1,b()},$=E=>{y(),p.value="",p.blur(),b(),ie(E)},C=E=>{h=E,l.innerHTML=E.length?o(E):`<p class="ac-search__empty">Nothing matches \u201C${c(p.value.trim())}\u201D.</p>`,l.hidden=!1,w=-1},j=async()=>{let E=p.value.trim();if(E.length<2){y();return}let F=await Mt(E,{places:g,canUsers:t.canAny(["platform.users.read","school.users.read"]),canOrganizations:t.canAny(["platform.organizations.read","school.profile.read"])});p.value.trim()===E&&C(F)};p.addEventListener("input",()=>{b(),clearTimeout(f),f=setTimeout(j,180)}),m?.addEventListener("click",()=>{p.value="",b(),y(),p.focus()}),p.addEventListener("focus",()=>{b(),p.value.trim().length>=2&&j()}),p.addEventListener("keydown",E=>{if(l.hidden){E.key==="Enter"&&p.value.trim().length>=2&&j();return}if(E.key==="ArrowDown")E.preventDefault(),R(1);else if(E.key==="ArrowUp")E.preventDefault(),R(-1);else if(E.key==="Enter"){E.preventDefault();let F=h[w]||h[0];F&&$(F.path)}else E.key==="Escape"&&(E.preventDefault(),y(),p.blur())}),l.addEventListener("mousedown",E=>{let F=E.target.closest("[data-ac-search-path]");F?(E.preventDefault(),$(F.dataset.acSearchPath)):E.preventDefault()}),document.addEventListener("mousedown",E=>{!l.hidden&&!E.target.closest(".ac-search")&&y()});function R(E){h.length&&(w=(w+E+h.length)%h.length,l.querySelectorAll(".ac-search__item").forEach((F,oe)=>{F.classList.toggle("is-active",oe===w)}))}}function o(p){let l=[];for(let m of p){let g=m.kind==="settings"?"Settings":m.kind==="user"?"Accounts":m.kind==="organization"?"Organizations":"Go to",h=l.find(w=>w.label===g);h||(h={label:g,items:[]},l.push(h)),h.items.push(m)}return l.map(m=>`<p class="ac-search__group">${m.label}</p>${m.items.map(g=>`<button type="button" class="ac-search__item" data-ac-search-path="${c(g.path)}">
									<span class="ac-search__item-title">${c(g.title)}</span>
									${g.sub?`<span class="ac-search__item-sub">${c(g.sub)}</span>`:""}
									<span class="ac-search__badge${g.kind==="user"?" ac-search__badge--user":""}">${c(g.badge||"")}</span>
								</button>`).join("")}`).join("")}function c(p){return String(p??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}d();function u(){t.canAny(["platform.console","school.console"])||!t.canAny(Za)||la().path==="/"&&ie("/learning",{replace:!0})}u(),$t(),sa.remove()}var rt=0;async function it(e,a,t){let n=++rt,s=document.createElement("div");s.className="ac-page",e.content.replaceChildren(s),s.innerHTML=`<div class="ac-skeleton-stack" aria-busy="true">
		<div class="ac-skeleton" style="width:40%"></div>
		<div class="ac-skeleton" style="width:100%"></div>
		<div class="ac-skeleton" style="width:80%"></div>
	</div>`;try{if(await t.render(s,a,t),n!==rt)return;ot&&ot(s)}catch(r){if(n!==rt)return;console.error("[console] page render failed",r),s.innerHTML=`<div class="ac-error" role="alert">
			<div>
				<p class="ac-error__title">This section could not be rendered</p>
				<p class="ac-error__message">${r.message}</p>
			</div>
		</div>`}}ii();})();
