var QuizConsole=(()=>{var ae="quizSession",Ke="quizAuthToken",be="",Te=null,Qe=null;function Aa(e){Qe=e}function rs(){try{let e=sessionStorage.getItem(ae)||localStorage.getItem(ae),a=e?JSON.parse(e):null;if(a?.token)return a.token}catch{}return localStorage.getItem(Ke)||""}function Je(){return be||(be=rs(),be)}function os(e){if(e){be=e;try{let a=sessionStorage.getItem(ae)||localStorage.getItem(ae),t=a?JSON.parse(a):null;if(t){t.token=e,sessionStorage.setItem(ae,JSON.stringify(t));let n=localStorage.getItem(ae),s=n?JSON.parse(n):null;s&&String(s.userId||"")===String(t.userId||"")&&String(s.role||"").toLowerCase()===String(t.role||"").toLowerCase()&&localStorage.setItem(ae,JSON.stringify(t))}localStorage.setItem(Ke,e)}catch{}}}function is(){be="";try{localStorage.removeItem(ae),localStorage.removeItem(Ke),sessionStorage.removeItem(ae)}catch{}}function La(){return window.APP_CONFIG&&window.APP_CONFIG.apiUrl||"/api/v1"}async function cs(){return Te||(Te=fetch(`${La()}/auth/refresh`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({portal:"admin"})}).then(async e=>{if(!e.ok)throw new Error(`Refresh failed (${e.status})`);let a=await e.json();if(!a?.accessToken)throw new Error("Refresh returned no token");return os(a.accessToken),a.accessToken}).finally(()=>{Te=null}),Te)}var Pe=class extends Error{constructor(a,t,n,s){super(a),this.name="ApiError",this.status=t,this.code=n,this.fields=s||null}};async function ls(e){let a=null;try{a=await e.json()}catch{}let t=a?.error||{};return new Pe(t.message||a?.message||`Request failed (${e.status})`,e.status,t.code||a?.code||null,t.fields||null)}async function fe(e,a={}){let{method:t="GET",body:n=null,query:s=null,retry:o=!0}=a,f=`${La()}/${String(e).replace(/^\//,"")}`;if(s&&typeof s=="object"){let h=new URLSearchParams;for(let[m,g]of Object.entries(s))g==null||g===""||h.set(m,String(g));let c=h.toString();c&&(f+=`?${c}`)}let r={Accept:"application/json"},p=Je();p&&(r.Authorization=`Bearer ${p}`),n!=null&&(r["Content-Type"]="application/json");let l=await fetch(f,{method:t,headers:r,credentials:"include",body:n==null?void 0:JSON.stringify(n)});if(l.status===401&&o){try{await cs()}catch{throw is(),Qe&&Qe(),new Pe("Your session has ended. Please sign in again.",401,"UNAUTHORIZED")}return fe(e,{...a,retry:!1})}if(!l.ok)throw await ls(l);return l.status===204?null:l.json()}var k={get:(e,a)=>fe(e,{method:"GET",query:a}),post:(e,a)=>fe(e,{method:"POST",body:a}),patch:(e,a)=>fe(e,{method:"PATCH",body:a}),put:(e,a)=>fe(e,{method:"PUT",body:a}),del:(e,a)=>fe(e,{method:"DELETE",body:a})};var W={session:null,permissions:new Set,deployment:{mode:"saas",isOffline:!1,isSaaS:!0,label:"Multi-tenant platform",description:"",dbProvider:"sqlite"},targetSchoolId:null,period:"30d",customRange:null},ds=new Set;function Me(){for(let e of ds)try{e(W)}catch(a){console.error("[console] store listener failed",a)}}function Ca(){return W}function ps(e){return e?W.permissions.has(e):!0}function Ze(e=[]){let a=Array.isArray(e)?e:[e];return a.length===0?!0:a.some(t=>ps(t))}function Xe(e){W.targetSchoolId=e||null,Me()}function qa(e,a=null){W.period=e,W.customRange=a,Me()}async function Ea(){let e=await k.get("console/session");return W.session=e,W.permissions=new Set(Array.isArray(e.permissions)?e.permissions:[]),e.deployment&&(W.deployment={...W.deployment,...e.deployment}),Me(),e}function za(){W.session=null,W.permissions=new Set,W.targetSchoolId=null,Me()}var Re=[],Ma=null,ve=null,Ae=null,ea=null;function Na(e,a={}){Re.length=0;for(let t of e)Re.push(t);Ma=a.notFound||null}function Ra(e){Ae=e}function Oa(e){ea=e}function Ne(e){return e&&String(e).split("?")[0].replace(/^#/,"").replace(/\/+$/,"")||"/"}function us(e){let a=Ne(e);for(let t of Re)if(Ne(t.path)===a)return t;for(let t of Re){if(!t.path.includes(":"))continue;let n=Ne(t.path).split("/"),s=a.split("/");if(n.length!==s.length)continue;let o={},f=!0;for(let r=0;r<n.length;r+=1){let p=n[r];if(p.startsWith(":"))o[p.slice(1)]=decodeURIComponent(s[r]);else if(p!==s[r]){f=!1;break}}if(f)return{...t,params:o}}return null}function Ia(){let a=(window.location.hash||"#/").slice(1)||"/",[t,n]=a.split("?"),s={};if(n)for(let[o,f]of new URLSearchParams(n))s[o]=f;return{path:Ne(t),query:s}}function K(e,{replace:a=!1}={}){let t=e.startsWith("#")?e:`#${e}`;if(a)window.history.replaceState(null,"",t);else if(window.location.hash!==t){window.location.hash=t;return}aa()}var Y=[];function Pa(e){return String(e||"#/").replace(/^#/,"").split("?")[0]||"/"}function hs(e){let a=e||"#/",t=Y[Y.length-1];if(t&&Pa(t)===Pa(a)){Y[Y.length-1]=a;return}if(t===a)return;let n=Y.indexOf(a);if(n!==-1){Y.length=n+1;return}Y.push(a)}function ms(e){let a=String(e||"/").split("/").filter(Boolean);return a.length<2?null:a[0]==="users"?"/users":a[0]==="organizations"?"/organizations":null}function ta(){if(Y.length>1)return Y[Y.length-2];let e=ms(Ia().path);return e?`#${e}`:null}function ja(){let e=ta();if(!e)return!1;if(Y.length>1){let a=Y.lastIndexOf(e);a!==-1&&(Y.length=a+1)}return K(e),!0}function aa(){let{path:e,query:a}=Ia(),t=us(e)||Ma;if(!t)return null;hs(window.location.hash);let n=t.permission?Array.isArray(t.permission)?t.permission:[t.permission]:[];return n.length&&ea&&!ea.canAny(n)?(ve={...t,id:t.id||"forbidden",title:"Access restricted",description:"Your role does not include this section.",forbidden:!0},Ae&&Ae(ve,{path:e,query:a}),ve):(ve={...t,path:e,query:a,params:t.params||{}},Ae&&Ae(ve,{path:e,query:a}),ve)}function Da(){return window.addEventListener("hashchange",()=>aa()),aa()}var Ha={primary:"var(--ac-tone-1)",success:"var(--ac-tone-2)",warning:"var(--ac-tone-3)",danger:"var(--ac-tone-4)",info:"var(--ac-tone-5)",violet:"var(--ac-tone-6)",muted:"var(--ac-tone-7)"};function i(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;")}function Ba(e){let a=Number(e);return Number.isFinite(a)?a:null}function Ua(e,a=1){let t=Ba(e);if(t==null)return null;let n=10**a;return Math.round((t+Number.EPSILON)*n)/n}function gs(e){let a=Ua(e,1);return a==null?"\u2014":String(a)}function Fa(e,a,t){return Math.min(t,Math.max(a,e))}function Ga(e,a=28){let t=String(e??"");return t.length>a?`${t.slice(0,a-1)}\u2026`:t}function Le(e){return Ha[e]||Ha.primary}function J(e){return`<div class="ac-legend">${e.map(a=>`<span class="ac-legend__item"><i class="ac-legend__key" style="background:${Le(a.tone)}"></i>${i(a.label)}</span>`).join("")}</div>`}function Z({title:e,subtitle:a,body:t,action:n="",className:s=""}){return`<section class="ac-panel ${s}">
		<div class="ac-panel__header">
			<div class="ac-panel__titles">
				<h3 class="ac-panel__title">${i(e)}</h3>
				${a?`<p class="ac-panel__subtitle">${i(a)}</p>`:""}
			</div>
			${n?`<div class="ac-panel__actions">${n}</div>`:""}
		</div>
		<div class="ac-panel__body">${t}</div>
	</section>`}function S({label:e,value:a,note:t,tone:n="",trend:s="",tooltip:o="",href:f=""}){let r=f?"a":"div",p=f?` href="${i(f)}"`:"",l=["ac-kpi",n?`ac-kpi--${n}`:"",f?"ac-kpi--link":""].filter(Boolean).join(" ");return`<${r} class="${l}"${p}${o?` title="${i(o)}"`:""}>
		<p class="ac-kpi__label">${i(e)}</p>
		<p class="ac-kpi__value">${i(a)}</p>
		${t||s?`<p class="ac-kpi__meta">${s||""}${t?`<span>${i(t)}</span>`:""}</p>`:""}
	</${r}>`}function Q({rows:e=[],value:a,max:t=null,label:n=p=>p.label,display:s=p=>gs(p),tone:o="primary",threshold:f=null,ariaLabel:r="Comparison"}){let p=(Array.isArray(e)?e:[]).filter(Boolean);if(!p.length)return"";let l=680,h=38,c=150,m=64,g=10,u=8,w=p.length*h+g+u,d=p.map(A=>Number(typeof a=="function"?a(A):A[a])||0),b=Math.max(t||0,...d,1),x=l-c-m,T=A=>c+Fa(A,0,b)/b*x,E=f==null?"":`<line x1="${T(f)}" y1="${g-4}" x2="${T(f)}" y2="${w-u+2}" class="ac-chart__threshold"/>`,z=p.map((A,M)=>{let G=typeof a=="function"?a(A):A[a],ce=Ba(G),le=g+M*h+14,de=12,me=ce==null?0:Math.max(ce>0?2:0,T(ce)-c),Ve=typeof o=="function"?o(A):o,Se=s(G,A);return`<g>
				<title>${i(n(A))}: ${i(Se)}</title>
				<text x="${c-10}" y="${le+10}" text-anchor="end" class="ac-chart__label">${i(Ga(n(A),24))}</text>
				<rect x="${c}" y="${le}" width="${x}" height="${de}" rx="3" class="ac-chart__track"/>
				<rect x="${c}" y="${le}" width="${me}" height="${de}" rx="3" fill="${Le(Ve)}" opacity="0.9"/>
				<text x="${l-m+8}" y="${le+10}" class="ac-chart__value">${i(Se)}</text>
			</g>`}).join("");return`<svg viewBox="0 0 ${l} ${w}" class="ac-chart ac-chart--bars" role="img" aria-label="${i(r)}">
		${E}${z}
	</svg>`}function Wa({rows:e=[],series:a=[],label:t=s=>s.label,ariaLabel:n="Comparison by group"}){let s=(Array.isArray(e)?e:[]).filter(Boolean);if(!s.length||!a.length)return"";let o=680,f=150,r=24,p=8,l=9,h=3,c=a.length*(l+h)+22,m=s.length*c+p+6,g=Math.max(1,...s.flatMap(d=>a.map(b=>Number(d[b.key])||0))),u=o-f-r,w=s.map((d,b)=>{let x=p+b*c,T=a.map((E,z)=>{let A=Number(d[E.key])||0,M=x+18+z*(l+h),G=A>0?Math.max(2,A/g*u):0;return`<g>
						<title>${i(t(d))} \xB7 ${i(E.label)}: ${A}</title>
						<rect x="${f}" y="${M}" width="${u}" height="${l}" rx="2" class="ac-chart__track"/>
						<rect x="${f}" y="${M}" width="${G}" height="${l}" rx="2" fill="${Le(E.tone)}" opacity="0.9"/>
						<text x="${f+G+6}" y="${M+l-1}" class="ac-chart__value ac-chart__value--inline">${A}</text>
					</g>`}).join("");return`<g>
				<text x="${f-10}" y="${x+26}" text-anchor="end" class="ac-chart__label">${i(Ga(t(d),24))}</text>
				${T}
			</g>`}).join("");return`<svg viewBox="0 0 ${o} ${m}" class="ac-chart ac-chart--grouped" role="img" aria-label="${i(n)}">
		${w}
	</svg>`}function te({points:e=[],series:a=[],labelKey:t="label",ariaLabel:n="Activity over time",height:s=220}){let o=Array.isArray(e)?e:[];if(!o.length||!a.length)return"";let f=680,r=38,p=14,l=16,h=34,c=Math.max(1,...o.flatMap(b=>a.map(x=>Number(b[x.key])||0))),m=(f-r-p)/o.length,g=Math.min(26,Math.max(5,m*.7/a.length)),u=b=>l+(1-Fa(b,0,c)/c)*(s-l-h),w=Math.max(1,Math.ceil(o.length/7)),d=o.map((b,x)=>{let T=r+x*m+m/2,E=a.length*(g+2),z=T-E/2,A=a.map((G,ce)=>{let $e=Number(b[G.key])||0,le=s-h-u($e);return`<rect x="${z+ce*(g+2)}" y="${u($e)}" width="${g}" height="${Math.max(0,le)}" rx="2" fill="${Le(G.tone)}" opacity="0.9"><title>${i(b[t])} \xB7 ${i(G.label)}: ${$e}</title></rect>`}).join(""),M=x%w===0?`<text x="${T}" y="${s-10}" text-anchor="middle" class="ac-chart__axis">${i(b[t])}</text>`:"";return`${A}${M}`}).join("");return`<svg viewBox="0 0 ${f} ${s}" class="ac-chart ac-chart--columns" role="img" aria-label="${i(n)}">
		<line x1="${r}" y1="${s-h}" x2="${f-p}" y2="${s-h}" class="ac-chart__grid"/>
		${d}
	</svg>`}function Ya({buckets:e=[],ariaLabel:a="Distribution"}){return te({points:e,series:[{key:"count",label:"Count",tone:"primary"}],labelKey:"label",ariaLabel:a,height:200})}function Va({segments:e=[],centerValue:a="",centerLabel:t="",ariaLabel:n="Composition",size:s=190}){let o=(Array.isArray(e)?e:[]).filter(m=>(Number(m.value)||0)>0);if(!o.length)return"";let f=o.reduce((m,g)=>m+(Number(g.value)||0),0),r=62,p=s/2,l=2*Math.PI*r,h=0,c=o.map(m=>{let g=Number(m.value)||0,u=g/f*l,w=`<circle cx="${p}" cy="${p}" r="${r}" fill="none" stroke="${Le(m.tone)}" stroke-width="22"
				stroke-dasharray="${u} ${l-u}" stroke-dashoffset="${-h}"
				transform="rotate(-90 ${p} ${p})" opacity="0.92"><title>${i(m.label)}: ${g} (${Ua(g/f*100,1)}%)</title></circle>`;return h+=u,w}).join("");return`<svg viewBox="0 0 ${s} ${s}" class="ac-chart ac-chart--donut" role="img" aria-label="${i(n)}">
		<circle cx="${p}" cy="${p}" r="${r}" fill="none" class="ac-chart__donut-track" stroke-width="22"/>
		${c}
		<text x="${p}" y="${p-4}" text-anchor="middle" class="ac-chart__center">${i(a)}</text>
		<text x="${p}" y="${p+15}" text-anchor="middle" class="ac-chart__center-label">${i(t)}</text>
	</svg>`}var se={overview:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',organizations:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6"/><path d="M9 11h.01M15 11h.01"/></svg>',users:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',analytics:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></svg>',audit:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h4"/></svg>',health:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',settings:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',search:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',menu:'<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',sun:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',moon:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',external:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',logo:'<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5-10-5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>'};var Qa="quizConsoleTheme";function fs(e){let t=String(e||"?").trim().split(/\s+/).filter(Boolean);return t.length?t.length===1?t[0].slice(0,2).toUpperCase():`${t[0][0]}${t[t.length-1][0]}`.toUpperCase():"?"}function sa(e){let a=document.documentElement,t=e||localStorage.getItem(Qa)||(window.matchMedia?.("(prefers-color-scheme: dark)").matches?"dark":"light");return a.setAttribute("data-console-theme",t),localStorage.setItem(Qa,t),t}function bs(){let e=document.documentElement.getAttribute("data-console-theme")==="dark"?"light":"dark";return sa(e),e}function Ka(e,{session:a,navItems:t,canAny:n,onNavigate:s}){let o=a.user,f=!!a.scope?.isPlatform,r=a.scope?.organization,l=!!(a.deployment||{}).isOffline,h=l?"Local installation":f?"Platform scope":r?.name?r.name:"Organization scope",c=t.filter(g=>{if(!g.permission)return!0;let u=Array.isArray(g.permission)?g.permission:[g.permission];return n(u)});e.innerHTML=`
		<aside class="ac-sidebar" id="ac-sidebar">
			<div class="ac-sidebar__brand">
				<div class="ac-sidebar__logo" aria-hidden="true">${se.logo}</div>
				<div class="ac-sidebar__titles">
					<p class="ac-sidebar__title">Control Center</p>
					<p class="ac-sidebar__subtitle">${i(l?"This installation":f?"All organizations":r?.name||"Organization")}</p>
				</div>
			</div>
			<nav class="ac-nav" aria-label="Console sections">
				${(()=>{let g=null;return c.map(u=>{let w=u.group||null,d=w&&w!==g?`<p class="ac-nav__group-label">${i(w)}</p>`:"";return g=w,`${d}
					<button type="button" class="ac-nav__item" data-ac-nav="${i(u.id)}" data-ac-path="${i(u.path)}">
						${se[u.icon]||se.overview}
						<span class="ac-nav__label">${i(u.title)}</span>
					</button>`}).join("")})()}
			</nav>
			<div class="ac-sidebar__footer">
				<div class="ac-user">
					<div class="ac-user__avatar" aria-hidden="true">${i(fs(o.name))}</div>
					<div class="ac-user__meta">
						<p class="ac-user__name">${i(o.name||o.username)}</p>
						<p class="ac-user__role">${i(o.roleLabel||o.role)}</p>
					</div>
				</div>
			</div>
		</aside>

		<div class="ac-main">
			<header class="ac-header">
				<button type="button" class="ac-btn ac-btn--ghost ac-btn--icon ac-header__toggle" data-ac-menu aria-label="Toggle navigation">
					${se.menu}
				</button>
				<div class="ac-header__titles">
					<h1 class="ac-header__title" id="ac-page-title">Overview</h1>
					<p class="ac-header__description" id="ac-page-description"></p>
				</div>
				<div class="ac-header__actions">
					<span class="ac-scope${f&&!l?" ac-scope--platform":""}" title="The slice of the platform this session can reach">
						<span class="ac-scope__dot"></span>${i(h)}
					</span>
					<div class="ac-search">
						${se.search}
						<input type="search" id="ac-global-search" placeholder="Search\u2026" aria-label="Search the console" autocomplete="off" />
						<button type="button" class="ac-search__clear" id="ac-search-clear" aria-label="Clear the search" title="Clear" hidden>
							<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
						</button>
						<div class="ac-search__panel" id="ac-search-panel" hidden></div>
					</div>
					<button type="button" class="ac-btn ac-btn--ghost ac-btn--icon" data-ac-theme aria-label="Toggle colour theme">
						${se.sun}
					</button>
					<a class="ac-btn ac-btn--ghost" href="/admin.html" title="Open the classroom administration surface">
						${se.external}<span>Classroom</span>
					</a>
				</div>
			</header>
			<main class="ac-content" id="ac-content" tabindex="-1"></main>
		</div>`,e.hidden=!1;let m=e.querySelector("#ac-sidebar");return e.querySelector("[data-ac-menu]")?.addEventListener("click",()=>{m.classList.toggle("is-open")}),e.querySelector("[data-ac-theme]")?.addEventListener("click",g=>{let u=bs();g.currentTarget.innerHTML=u==="dark"?se.moon:se.sun}),e.querySelectorAll("[data-ac-nav]").forEach(g=>{g.addEventListener("click",()=>{m.classList.remove("is-open"),s(g.dataset.acPath)})}),{content:e.querySelector("#ac-content"),title:e.querySelector("#ac-page-title"),description:e.querySelector("#ac-page-description"),setActive(g){let u=Array.from(e.querySelectorAll("[data-ac-nav]")),w=!1;u.forEach(d=>{let b=d.dataset.acPath,x=b===g||b!=="/"&&g.startsWith(b);x&&(w=!0),d.classList.toggle("is-active",x)}),w||u.forEach(d=>{d.dataset.acPath==="/"&&d.classList.add("is-active")})}}}function Ja(e,a=[]){let t=[];for(let n of e)n.id==="not-found"||n.id==="forbidden"||t.push({kind:"page",title:n.title,sub:n.description||"",path:n.path==="/"?"/":n.path,keywords:`${n.title} ${n.description||""}`.toLowerCase()});for(let n of a)t.push({kind:"settings",title:n.label,sub:"Settings",path:`/settings?section=${encodeURIComponent(n.id)}`,keywords:`settings ${n.label}`.toLowerCase()});return t}function vs(e,a){let t=a.keywords,n=a.title.toLowerCase();if(!e)return 0;if(n.startsWith(e))return 100-n.length*.01;let s=n.indexOf(e);if(s!==-1)return 60-s;if(t.includes(e))return 30;let o=e.split(/\s+/).filter(Boolean);return o.length>1&&o.every(f=>t.includes(f))?20:0}async function Za(e,{places:a,canUsers:t=!1,canOrganizations:n=!1}={}){let s=String(e||"").trim().toLowerCase();if(!s)return[];let o=a.map(h=>({place:h,value:vs(s,h)})).filter(h=>h.value>0).sort((h,c)=>c.value-h.value).slice(0,6).map(({place:h})=>({...h,badge:"Page"})),[f,r]=await Promise.all([t?k.get(`console/users?search=${encodeURIComponent(e.trim())}&limit=4`).catch(()=>null):Promise.resolve(null),n?k.get(`console/organizations?search=${encodeURIComponent(e.trim())}&limit=4`).catch(()=>null):Promise.resolve(null)]),p=(f?.data||[]).slice(0,4).map(h=>({kind:"user",title:h.name||h.username,sub:h.username&&h.name?h.username:h.roleLabel||"",path:`/users/${h.id}`,badge:h.roleLabel||"Account"})),l=(r?.data||[]).slice(0,4).map(h=>({kind:"organization",title:h.name,sub:h.status==="suspended"?"suspended":"",path:`/organizations/${h.id}`,badge:"Organization"}));return[...o,...p,...l]}function q({columns:e,rows:a,empty:t="Nothing to show for the current filters.",sort:n=null,onSort:s=null,rowHref:o=null,rowClass:f=null}){if(!a||a.length===0)return`<div class="ac-empty">
			<div class="ac-empty__icon" aria-hidden="true">
				<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
			</div>
			<p class="ac-empty__title">No data</p>
			<p class="ac-empty__message">${i(t)}</p>
		</div>`;let r=e.map(l=>{let h=l.align==="right"?" is-numeric":"",c=l.sortable&&s?" is-sortable":"",m=n&&n.key===l.key,g=m?n.direction==="asc"?"\u25B2":"\u25BC":"";return`<th class="${h}${c}"${c?` data-ac-sort="${i(l.key)}"`:""}${m?` aria-sort="${n.direction==="asc"?"ascending":"descending"}"`:""}>
				${i(l.label)}${g?`<span class="ac-sort">${g}</span>`:""}
			</th>`}).join(""),p=a.map((l,h)=>{let c=o?o(l):null,m=f?f(l):"",g=e.map(u=>{let w=u.align==="right"?" is-numeric":"",d=u.render?u.render(l):i(l[u.key]??"\u2014");return`<td class="${w}${u.className?` ${u.className}`:""}" data-label="${i(u.label)}">${d}</td>`}).join("");return`<tr${c?` data-ac-href="${i(c)}"`:""} class="${i(m)}" data-ac-row="${h}">${g}</tr>`}).join("");return`<div class="ac-table-wrap"><table class="ac-table">
		<thead><tr>${r}</tr></thead>
		<tbody>${p}</tbody>
	</table></div>`}function ye({total:e,limit:a,offset:t,onPage:n}){let s=Math.max(1,Number(a)||50),o=Math.max(0,Number(t)||0),f=Math.floor(o/s)+1,r=Math.max(1,Math.ceil((Number(e)||0)/s)),p=e===0?0:o+1,l=Math.min(o+s,Number(e)||0),h=(c,m,g,u="")=>`<button type="button" class="ac-btn ac-btn--sm" data-ac-page="${m}"${g?" disabled":""}${u}>${c}</button>`;return`<div class="ac-pagination">
		<span>Showing ${p}\u2013${l} of ${(Number(e)||0).toLocaleString()}</span>
		<div class="ac-pagination__pages">
			${h("\xAB",0,o===0)}
			${h("\u2039",Math.max(0,o-s),o===0)}
			<span style="padding:0 6px">Page ${f} of ${r}</span>
			${h("\u203A",o+s,o+s>=(Number(e)||0))}
			${h("\xBB",Math.max(0,(r-1)*s),o+s>=(Number(e)||0))}
		</div>
	</div>`}function I(e=3){return`<div class="ac-skeleton-stack" aria-busy="true">
		${Array.from({length:e}).map((a,t)=>`<div class="ac-skeleton" style="width:${100-t*12}%"></div>`).join("")}
	</div>`}function R({title:e="No data",message:a="There is nothing to report for the current filters and period.",action:t=""}={}){return`<div class="ac-empty">
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
	</div>`}var na=Object.freeze([{key:"7d",label:"7 days"},{key:"30d",label:"30 days"},{key:"90d",label:"90 days"},{key:"year",label:"Academic year"},{key:"custom",label:"Custom"}]);function ra({options:e,value:a,name:t,onSelect:n=null}){return`<div class="ac-chip-group" role="group" aria-label="Period">${e.map(s=>`<button type="button" class="ac-chip${s.key===a?" is-active":""}" data-ac-chip="${t}" data-ac-value="${i(s.key)}" aria-pressed="${s.key===a}">${i(s.label)}</button>`).join("")}</div>`}function _e(e,a,t){e.querySelectorAll(`[data-ac-chip="${a}"]`).forEach(n=>{n.addEventListener("click",()=>t(n.dataset.acValue))})}function Oe({id:e="ac-search",placeholder:a="Search\u2026",value:t=""}){return`<div class="ac-field">
		<label class="ac-field__label" for="${i(e)}">Search</label>
		<input class="ac-input" id="${i(e)}" type="search" placeholder="${i(a)}" value="${i(t)}" autocomplete="off" />
	</div>`}function pe({id:e,label:a,options:t=[],value:n="",allLabel:s=null,includeAll:o=!1}){return`<div class="ac-field">
		<label class="ac-field__label" for="${i(e)}">${i(a)}</label>
		<select class="ac-select" id="${i(e)}" data-ac-select="${i(e)}">
			${o?`<option value=""${n?"":" selected"}>${i(s||"All")}</option>`:""}
			${t.map(f=>`<option value="${i(f.value)}"${String(f.value)===String(n)?" selected":""}>${i(f.label)}</option>`).join("")}
		</select>
	</div>`}function B({chips:e="",fields:a="",filters:t="",actions:n=""}={}){let s=a||t;return e?`<div class="ac-toolbar">
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
			</div></div>`}function Ie({value:e,customFrom:a="",customTo:t=""}){let n=e==="custom"?`<div class="ac-field">
					<label class="ac-field__label" for="ac-period-from">From</label>
					<input class="ac-input" id="ac-period-from" type="date" value="${i(a)}" />
				</div>
				<div class="ac-field">
					<label class="ac-field__label" for="ac-period-to">To</label>
					<input class="ac-input" id="ac-period-to" type="date" value="${i(t)}" />
				</div>`:"";return B({chips:ra({options:na,value:e,name:"period"}),fields:n})}var he=null;function ys(){return he||(he=document.createElement("div"),he.className="ac-toasts",he.setAttribute("role","status"),he.setAttribute("aria-live","polite"),document.body.appendChild(he)),he}function y(e,a="info",t=4200){let n=ys(),s=document.createElement("div");return s.className=`ac-toast ac-toast--${a}`,s.innerHTML=`<span class="ac-toast__text">${i(e)}</span>`,n.appendChild(s),window.setTimeout(()=>{s.style.opacity="0",s.style.transition="opacity .18s ease",window.setTimeout(()=>s.remove(),200)},t),s}var je=0;function H({title:e,subtitle:a="",body:t,footer:n="",wide:s=!1,onMount:o=null}){let f=document.createElement("div");f.className="ac-modal-backdrop",f.setAttribute("role","dialog"),f.setAttribute("aria-modal","true"),f.setAttribute("aria-label",e),f.innerHTML=`
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
		</div>`;let r=f.querySelector("[data-ac-modal-body]");typeof t=="string"?r.innerHTML=t:t&&r.appendChild(t);let p=f.querySelector("[data-ac-modal-footer]");p&&(typeof n=="string"?p.innerHTML=n:n&&p.appendChild(n));function l(){f.remove(),je=Math.max(0,je-1),je===0&&document.body.style.removeProperty("overflow"),document.removeEventListener("keydown",h)}function h(m){m.key==="Escape"&&l()}f.addEventListener("click",m=>{m.target===f&&l()}),f.querySelectorAll("[data-ac-close]").forEach(m=>m.addEventListener("click",l)),document.addEventListener("keydown",h),document.body.appendChild(f),je+=1,document.body.style.overflow="hidden";let c=f.querySelector("input, select, textarea, button:not([data-ac-close])");return c&&c.focus(),o&&o(f),{close:l,root:f}}function j({title:e,message:a,detail:t="",confirmLabel:n="Confirm",danger:s=!1}){return new Promise(o=>{let f=H({title:e,body:`
				<p style="margin:0 0 10px;font-size:13.5px;line-height:1.55">${i(a)}</p>
				${t?`<div class="ac-alert ac-alert--${s?"danger":"info"}"><div class="ac-alert__body"><p class="ac-alert__text">${i(t)}</p></div></div>`:""}
			`,footer:`
				<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
				<button type="button" class="ac-btn ${s?"ac-btn--danger":"ac-btn--primary"}" data-ac-confirm>${i(n)}</button>
			`});f.root.querySelector("[data-ac-cancel]").addEventListener("click",()=>{f.close(),o(!1)}),f.root.querySelector("[data-ac-confirm]").addEventListener("click",()=>{f.close(),o(!0)}),f.root.addEventListener("click",r=>{r.target===f.root&&o(!1)})})}function _(e,a="\u2014"){if(e==null||e==="")return a;let t=Number(e);return Number.isFinite(t)?t.toLocaleString():a}function N(e,{withTime:a=!0}={}){if(!e)return"\u2014";let t=e instanceof Date?e:new Date(e);return Number.isNaN(t.getTime())?"\u2014":t.toLocaleString(void 0,{year:"numeric",month:"short",day:"2-digit",...a?{hour:"2-digit",minute:"2-digit"}:{}})}function D(e){if(!e)return"never";let a=e instanceof Date?e:new Date(e);if(Number.isNaN(a.getTime()))return"never";let t=Math.round((Date.now()-a.getTime())/1e3),n=[["year",31536e3],["month",2592e3],["day",86400],["hour",3600],["minute",60]];for(let[s,o]of n)if(Math.abs(t)>=o){let f=Math.round(t/o);return`${f} ${s}${f===1?"":"s"} ago`}return"just now"}var ne={control:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',access:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>',credentials:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',maintenance:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9l-3.7 3.8z"/></svg>',activity:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',analytics:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></svg>',documents:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',notes:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',planning:'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>'},oa={id:"overview",path:"/",title:"Overview",description:"Control, access, activity, documents and planning \u2014 the administrator's working view.",permission:["platform.console","school.console"],async render(e,a){let t=a.getState();e.innerHTML=`<div class="ac-stack" data-ac-overview>
			${Ie({value:t.period})}
			<div data-ac-kpis class="ac-grid ac-grid--kpi">${I(1)}</div>
			<div data-ac-alerts class="ac-stack"></div>
			<div class="ac-workbench" data-ac-workbench></div>
			<div data-ac-trends class="ac-grid ac-grid--2"></div>
			<div data-ac-detail class="ac-grid ac-grid--3" style="margin-top:16px"></div>
		</div>`;let n={period:t.period==="year"?"year":t.period};t.period==="custom"&&t.customRange&&(n.from=t.customRange.from,n.to=t.customRange.to);let s,o,f;try{[s,o,f]=await Promise.all([k.get("console/overview",n),k.get("console/trends",n),k.get("console/workbench")])}catch(d){e.innerHTML=O({title:"The overview could not be loaded",message:d.message});return}let r=s.data,p=r.sections.glance,l=r.sections.activity,h=r.sections.operations,c=r.sections.content,m=r.meta.definitions,g=f.data.sections;e.querySelector("[data-ac-kpis]").innerHTML=[S({label:a.isPlatform?a.isOffline?"Organizations here":"Organizations":"Organization",value:a.isPlatform?_(p.organizations.total):a.organization?.name||"\u2014",note:a.isPlatform?`${p.organizations.active} active \xB7 ${p.organizations.pending} pending`:`Plan ${a.organization?.plan||"\u2014"}`,tone:"primary",tooltip:"The tenants of this installation.",href:a.isPlatform?"#/organizations":null}),S({label:"Accounts",value:_(p.users.teachers+p.users.students+p.users.administrators),note:`${_(p.users.teachers)} teachers \xB7 ${_(p.users.students)} students`,tooltip:"Every account in the current scope.",href:"#/users"}),S({label:"Live sessions",value:_(g.maintenance.liveSessions),note:"refresh tokens still valid",tooltip:"Accounts with a refresh token that has not expired or been revoked. An administrator can revoke them from the account page."}),S({label:"Availability",value:h.availabilityPercent==null?"\u2014":`${h.availabilityPercent.toFixed(1)}%`,note:"last 60 minutes",tone:h.availabilityPercent==null?"":h.availabilityPercent>=99?"success":"warning",tooltip:h.note,href:"#/health"}),S({label:"Failed sign-ins",value:_(h.failedAuthentications),note:r.meta.scope.periodLabel,tone:h.failedAuthentications>0?"warning":"",tooltip:"Failed authentication attempts recorded in the durable security trail.",href:"#/audit?stream=security"}),S({label:"Waiting for access",value:_(g.access.pendingAccountRequests+g.access.pendingProfileRequests),note:`${_(g.access.pendingAccountRequests)} requests \xB7 ${_(g.access.pendingProfileRequests)} profile changes`,tone:g.access.pendingAccountRequests+g.access.pendingProfileRequests>0?"warning":"",tooltip:"Account requests and profile change requests that are waiting for a decision."})].join(""),e.querySelector("[data-ac-alerts]").innerHTML=_s({glance:p,operations:h,activity:l,access:g.access,maintenance:g.maintenance}),e.querySelector("[data-ac-workbench]").innerHTML=[re({icon:ne.access,title:"Access to grant",subtitle:"What is waiting for an administrator.",body:`
					<div class="ac-workbench__list">
						${Ce({title:"Account requests",sub:"New students waiting to be created",value:g.access.pendingAccountRequests,href:"#/users/students?status=pending"})}
						${Ce({title:"Profile change requests",sub:"Students asking for a correction",value:g.access.pendingProfileRequests,href:"#/audit"})}
						${Ce({title:"Suspended accounts",sub:"No access until restored",value:g.access.suspendedAccounts,href:"#/users?status=suspended"})}
						${Ce({title:"Permission overrides",sub:"Individual grants and denies",value:g.access.permissionOverrides,href:"#/settings?section=roles"})}
						${Ce({title:"Teachers without a class",sub:"They can author, but reach nobody",value:g.access.teachersWithoutClasses.length,href:"#/users/teachers"})}
					</div>`}),re({icon:ne.credentials,title:"Credentials to check",subtitle:"Accounts that were provisioned but never used.",body:g.access.unusedCredentials.length?`<div class="ac-workbench__list">${g.access.unusedCredentials.map(d=>`
						<a class="ac-workbench__row" href="#/users/${d.id}" style="text-decoration:none;color:inherit">
							<div class="ac-workbench__row-main">
								<p class="ac-workbench__row-title">${i(d.name||d.username)}</p>
								<p class="ac-workbench__row-sub">${i(d.role)} \xB7 ${d.last_login?`last seen ${i(D(d.last_login))}`:"never signed in"}</p>
							</div>
							<span class="ac-workbench__row-value">${i(d.status)}</span>
						</a>`).join("")}</div>`:R({title:"Every account has been used",message:"No account in scope is waiting for its first sign-in."})}),re({icon:ne.maintenance,title:"Maintenance & recent actions",subtitle:"The last administrative operations.",body:g.maintenance.recentAudit.length?`<div class="ac-workbench__list">${g.maintenance.recentAudit.map(d=>`
						<div class="ac-workbench__row">
							<div class="ac-workbench__row-main">
								<p class="ac-workbench__row-title">${i(d.action)}</p>
								<p class="ac-workbench__row-sub">${i(d.actorName||"system")} \xB7 ${i(d.entityType)} \xB7 ${i(D(d.occurredAt))}</p>
							</div>
							<span class="ac-badge ac-badge--${d.severity==="critical"?"danger":d.severity==="warning"?"warning":"success"}">${i(d.severity)}</span>
						</div>`).join("")}</div>`:R({title:"No administrative action recorded yet",message:"Actions appear here as soon as an administrator changes something."})}),re({icon:ne.activity,title:"Teacher activity",subtitle:"Are the teachers working?",body:`<p class="ac-empty__message" style="margin:0 0 12px;font-size:12px">${i(m.activeTeacher)}</p>
				<div class="ac-defs">
					<div class="ac-defs__item">
						<p class="ac-defs__term">Active</p>
						<p class="ac-defs__desc">${_(p.users.activeTeachers)} of ${_(p.users.teachers)}</p>
					</div>
					<div class="ac-defs__term" style="margin-top:10px"><p class="ac-defs__term">Exams authored</p></div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">&nbsp;</p>
						<p class="ac-defs__desc">${_(c.exams)}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Questions</p>
						<p class="ac-defs__desc">${_(c.questions)}</p>
					</div>
				</div>`}),re({icon:ne.activity,title:"Student participation",subtitle:"Are the students taking part?",body:`<p class="ac-empty__message" style="margin:0 0 12px;font-size:12px">${i(m.activeStudent)}</p>
				<div class="ac-defs">
					<div class="ac-defs__item">
						<p class="ac-defs__term">Active</p>
						<p class="ac-defs__desc">${_(p.users.activeStudents)} of ${_(p.users.students)}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Attempts</p>
						<p class="ac-defs__desc">${_(l.attempts)}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Participating</p>
						<p class="ac-defs__desc">${_(l.participatingStudents)}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Average score</p>
						<p class="ac-defs__desc">${l.averageScore20==null?"\u2014":`${l.averageScore20.toFixed(2)} /20`}</p>
					</div>
				</div>`}),re({icon:ne.analytics,title:"Assessment activity",subtitle:"What the platform is being used for.",body:`<div class="ac-defs">
					<div class="ac-defs__item">
						<p class="ac-defs__term">Exams conducted</p>
						<p class="ac-defs__desc">${_(l.examsConducted)}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Formal attempts</p>
						<p class="ac-defs__desc">${_(l.formalAttempts)}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Courses</p>
						<p class="ac-defs__desc">${_(c.courses)}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Game sessions</p>
						<p class="ac-defs__desc">${_(l.gameSessions+l.kidsGameSessions)}</p>
					</div>
				</div>`})].join("");let u=e.querySelector("[data-ac-trends]");if(o){let d=o.data.series,b=d.labels.map((E,z)=>({label:E,formalAttempts:d.formalAttempts[z]||0,trainingAttempts:d.trainingAttempts[z]||0,gameAttempts:d.gameAttempts[z]||0,newTeachers:d.newTeachers[z]||0,newStudents:d.newStudents[z]||0})),x=[{key:"formalAttempts",label:"Formal exams",tone:"primary"},{key:"trainingAttempts",label:"Training",tone:"info"},{key:"gameAttempts",label:"Games",tone:"violet"}],T=[{key:"newTeachers",label:"Teachers",tone:"success"},{key:"newStudents",label:"Students",tone:"warning"}];u.innerHTML=`
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles">
							<h3 class="ac-panel__title">Educational activity</h3>
							<p class="ac-panel__subtitle">Completed attempts by mode. ${o.data.meta.granularity==="week"?"Weekly":"Daily"} buckets over ${i(o.data.meta.periodLabel)}.</p>
						</div>
					</div>
					<div class="ac-panel__body">
						${J(x)}
						${te({points:b,series:x,labelKey:"label",ariaLabel:"Completed attempts over time by mode"})}
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
						${J(T)}
						${te({points:b,series:T,labelKey:"label",ariaLabel:"New accounts over time"})}
					</div>
				</section>`}e.querySelector("[data-ac-detail]").innerHTML=[re({icon:ne.documents,title:"Documents",subtitle:"What has been produced.",flush:!0,body:g.documents.recent.length?`<div class="ac-workbench__list">${g.documents.recent.map(d=>`
					<div class="ac-workbench__row">
						<div class="ac-workbench__row-main">
							<p class="ac-workbench__row-title">${i(d.title||d.fileName)}</p>
							<p class="ac-workbench__row-sub">${i(d.kind)} \xB7 ${i(d.format||"").toUpperCase()} \xB7 ${i(D(d.createdAt))}</p>
						</div>
						<span class="ac-workbench__row-value">${Xa(d.sizeBytes)}</span>
					</div>`).join("")}</div>`:R({title:"No documents yet",message:"Course booklets, preparation sheets and exam papers appear here."})}),re({icon:ne.notes,title:"Notes to teachers",subtitle:"What has been said, and a way to say more.",actions:'<button type="button" class="ac-btn ac-btn--sm" data-ac-compose-note>Write a note</button>',flush:!0,body:g.notes.recent.length?`<div class="ac-workbench__list">${g.notes.recent.map(d=>`
					<div class="ac-workbench__row">
						<div class="ac-workbench__row-main">
							<p class="ac-workbench__row-title">${i(d.title)}</p>
							<p class="ac-workbench__row-sub">${i(d.teacherName||"An administrator")}${d.className?` \xB7 ${i(d.className)}`:""} \xB7 ${i(D(d.date))}</p>
						</div>
					</div>`).join("")}</div>`:R({title:"No note sent yet",message:"A note reaches a teacher and their class."})}),re({icon:ne.planning,title:"Planning",subtitle:"What is coming up.",flush:!0,body:`
					<div class="ac-workbench__list">
						${g.planning.upcomingAssignments.length?g.planning.upcomingAssignments.map(d=>`
							<div class="ac-workbench__row">
								<div class="ac-workbench__row-main">
									<p class="ac-workbench__row-title">${i(d.title)}</p>
									<p class="ac-workbench__row-sub">Due ${i(N(d.dueDate,{withTime:!1}))}</p>
								</div>
								<span class="ac-workbench__row-value">${d.dueDate&&new Date(d.dueDate)<new Date?'<span class="ac-badge ac-badge--danger">overdue</span>':'<span class="ac-badge">scheduled</span>'}</span>
							</div>`).join(""):""}
						${g.planning.recentExams.length?g.planning.recentExams.map(d=>`
							<div class="ac-workbench__row">
								<div class="ac-workbench__row-main">
									<p class="ac-workbench__row-title">${i(d.name)}</p>
									<p class="ac-workbench__row-sub">${d.isTraining?"Training":"Formal exam"} \xB7 created ${i(D(d.createdAt))}</p>
								</div>
								<span class="ac-badge ac-badge--${d.status==="active"?"success":""}">${i(d.status)}</span>
							</div>`).join(""):""}
						${g.planning.archives.length?g.planning.archives.map(d=>`
							<div class="ac-workbench__row">
								<div class="ac-workbench__row-main">
									<p class="ac-workbench__row-title">${i(d.label||`Archive ${d.year}`)}</p>
									<p class="ac-workbench__row-sub">School year ${i(d.year)}</p>
								</div>
								<span class="ac-workbench__row-value">${Xa(d.sizeBytes)}</span>
							</div>`).join(""):""}
					</div>
					${!g.planning.upcomingAssignments.length&&!g.planning.recentExams.length&&!g.planning.archives.length?R({title:"Nothing planned yet",message:"Exams, assignments and year archives appear here."}):""}`})].join("");let w=e.querySelector("[data-ac-compose-note]");w&&w.addEventListener("click",async()=>{let d=[];try{d=(await k.get("console/users?role=teacher&limit=200"))?.data||[]}catch{d=[]}if(!d.length){y("No teacher account is available to write to.","error");return}let b=H({title:"Write a note to a teacher",subtitle:"The note reaches the teacher and, when a class is chosen, that class.",body:`<div class="ac-field">
							<label class="ac-field__label" for="ac-note-teacher">Teacher</label>
							<select class="ac-select ac-input--full" id="ac-note-teacher">
								${d.map(x=>`<option value="${i(x.id)}">${i(x.name||x.username)}</option>`).join("")}
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
					`});b.root.querySelector("[data-ac-cancel]").addEventListener("click",b.close),b.root.querySelector("[data-ac-confirm]").addEventListener("click",async()=>{let x=b.root.querySelector("#ac-note-teacher").value,T=b.root.querySelector("#ac-note-title").value.trim(),E=b.root.querySelector("#ac-note-body").value.trim();if(!T||!E){y("A title and a message are required.","error");return}try{await k.post("console/notes",{teacherId:x,title:T,body:E}),b.close(),y("Note sent.","success"),a.rerender()}catch(z){y(z.message,"error")}})}),_e(e,"period",d=>{if(d==="custom"){let b=prompt("From (YYYY-MM-DD)",new Date(Date.now()-2592e6).toISOString().slice(0,10));if(!b)return;let x=prompt("To (YYYY-MM-DD)",new Date().toISOString().slice(0,10));if(!x)return;a.setPeriod("custom",{from:b,to:x});return}a.setPeriod(d)})}};function re({icon:e,title:a,subtitle:t,body:n,actions:s="",flush:o=!1}){return`<section class="ac-workbench__panel">
		<div class="ac-workbench__head">
			<div>
				<h3 class="ac-workbench__title">${e||""}${i(a)}</h3>
				${t?`<p class="ac-workbench__subtitle">${i(t)}</p>`:""}
			</div>
			${s?`<div class="ac-panel__actions">${s}</div>`:""}
		</div>
		<div class="ac-workbench__body${o?" ac-workbench__body--flush":""}">${n}</div>
	</section>`}function Ce({title:e,sub:a,value:t,href:n}){let s=n?"a":"div",o=n?` href="${i(n)}" style="text-decoration:none;color:inherit"`:"";return`<${s} class="ac-workbench__row"${o}>
		<div class="ac-workbench__row-main">
			<p class="ac-workbench__row-title">${i(e)}</p>
			<p class="ac-workbench__row-sub">${i(a)}</p>
		</div>
		<span class="ac-workbench__row-value">${_(t)}</span>
	</${s}>`}function Xa(e){let a=Number(e);return!Number.isFinite(a)||a<=0?"\u2014":a<1024?`${a} B`:a<1024*1024?`${Math.round(a/1024)} KB`:`${Math.round(a/1024/1024*10)/10} MB`}function _s({glance:e,operations:a,activity:t,access:n,maintenance:s}){let o=[];if(n.pendingAccountRequests>0&&o.push({kind:"warning",title:`${n.pendingAccountRequests} account request(s) waiting for a decision`,text:"A student or a teacher cannot sign in until an administrator approves the request.",action:{label:"Review accounts",href:"#/users/students"}}),n.pendingProfileRequests>0&&o.push({kind:"info",title:`${n.pendingProfileRequests} profile change request(s) waiting`,text:"A student is asking for a correction to their record.",action:{label:"Review the trail",href:"#/audit"}}),n.teachersWithoutClasses.length>0&&o.push({kind:"warning",title:`${n.teachersWithoutClasses.length} teacher(s) manage no class`,text:"They can author content but reach no student. Assign them a class, or deactivate the account.",action:{label:"Open teachers",href:"#/users/teachers"}}),a.failedAuthentications>0&&o.push({kind:"warning",title:`${a.failedAuthentications} failed sign-in attempt(s) in this period`,text:"Grouped by source address and attempted username on the Audit page \u2014 a concentration may indicate credential stuffing.",action:{label:"Inspect security events",href:"#/audit?stream=security"}}),a.serverErrorRatePercent!=null&&a.serverErrorRatePercent>=1&&o.push({kind:"danger",title:`Server error rate at ${a.serverErrorRatePercent}%`,text:"More than one request in a hundred failed with a server error in the last hour.",action:{label:"Open system health",href:"#/health"}}),t.attemptsPrevious!=null&&t.attempts>0&&t.attemptsPrevious>0){let f=Math.round((t.attempts-t.attemptsPrevious)/t.attemptsPrevious*1e3)/10;f<=-30&&o.push({kind:"warning",title:`Attempts fell ${Math.abs(f)}% versus the previous period`,text:"A sharp drop usually means an organization stopped using the platform, or a term boundary was crossed.",action:{label:"Compare organizations",href:"#/analytics"}})}return o.length?`<div class="ac-alert-list">${o.map(f=>`
		<div class="ac-alert-item">
			<div class="ac-alert-item__body">
				<p class="ac-alert-item__title">${i(f.title)}</p>
				<p class="ac-alert-item__text">${i(f.text)}</p>
			</div>
			<div class="ac-alert-item__action">
				<a class="ac-btn ac-btn--sm" href="${i(f.action.href)}">${i(f.action.label)}</a>
			</div>
		</div>`).join("")}</div>`:`<div class="ac-alert ac-alert--info">
			<div class="ac-alert__body">
				<p class="ac-alert__title">Nothing needs your attention</p>
				<p class="ac-alert__text">Every monitored threshold is inside its normal range.</p>
			</div>
		</div>`}function He(e=[]){return`<div class="ac-row-actions">${e.filter(t=>!t.hidden).map(t=>`<button type="button" class="ac-btn ac-btn--sm${t.tone?` ac-btn--${t.tone}`:""}" data-ac-action="${De(t.id)}" data-ac-action-value="${De(t.value??"")}" title="${De(t.title||t.label)}">${De(t.label)}</button>`).join("")}</div>`}function Be(e,a={}){e.addEventListener("click",t=>{let n=t.target.closest("[data-ac-action]");if(!n||!e.contains(n))return;t.preventDefault(),t.stopPropagation();let s=a[n.dataset.acAction];s&&s(n.dataset.acActionValue,n)})}function et(e,{canManage:a=!0,canDelete:t=!0}={}){let n=[{id:"open",label:"Open",value:e.id,title:"Open the account"}];return a&&n.push({id:"toggle-status",label:e.status==="active"?"Suspend":"Reactivate",value:e.id,title:e.status==="active"?"End this account's access and keep its record":"Restore this account's access"}),t&&n.push({id:"delete",label:"Delete",value:e.id,tone:"danger",title:"Remove this account permanently"}),n}function at(e,{canManage:a=!0}={}){let t=[{id:"open",label:"Open",value:e.id}];return a&&(t.push({id:"toggle-status",label:e.status==="suspended"?"Reactivate":"Suspend",value:e.id,title:e.status==="suspended"?"Restore this organization's access":"Revoke this organization's access"}),t.push({id:"edit",label:"Edit",value:e.id,title:"Edit the organization profile"}),t.push({id:"delete",label:"Delete",value:e.id,tone:"danger",title:"Remove the organization and everything in it"})),t}function De(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function C({title:e,subtitle:a="",body:t,actions:n="",flush:s=!1,id:o=""}={}){return`<section class="ac-section-panel"${o?` id="${i(o)}"`:""}>
		<div class="ac-section-panel__head">
			<div>
				<h3 class="ac-section-panel__title">${i(e)}</h3>
				${a?`<p class="ac-section-panel__subtitle">${i(a)}</p>`:""}
			</div>
			${n?`<div class="ac-panel__actions">${n}</div>`:""}
		</div>
		<div class="ac-section-panel__body${s?" ac-section-panel__body--flush":""}">${t}</div>
	</section>`}function L({id:e,label:a,value:t="",type:n="text",hint:s="",full:o=!1,placeholder:f="",disabled:r=!1}={}){return`<div class="ac-field${o?" ac-field--full":""}">
		<label class="ac-field__label" for="${i(e)}">${i(a)}</label>
		<input class="ac-input ac-input--full" id="${i(e)}" type="${i(n)}" value="${i(t??"")}" placeholder="${i(f)}" autocomplete="off" ${r?"disabled":""} />
		${s?`<p class="ac-field__hint">${i(s)}</p>`:""}
	</div>`}function U({id:e,label:a,options:t=[],value:n="",hint:s="",allLabel:o=null}={}){let f=o?`<option value=""${n?"":" selected"}>${i(o)}</option>`:"";return`<div class="ac-field">
		<label class="ac-field__label" for="${i(e)}">${i(a)}</label>
		<select class="ac-select" id="${i(e)}">
			${f}
			${t.map(r=>`<option value="${i(r.value)}"${String(r.value)===String(n)?" selected":""}>${i(r.label)}</option>`).join("")}
		</select>
		${s?`<p class="ac-field__hint">${i(s)}</p>`:""}
	</div>`}function X({id:e,label:a,hint:t="",checked:n=!1,disabled:s=!1}={}){return`<div class="ac-switch-row">
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
	</div>`}function ia({id:e,label:a,hint:t="",checked:n=!1}={}){return`<label class="ac-check">
		<input type="checkbox" id="${i(e)}" ${n?"checked":""} />
		<span>
			<span class="ac-check__label">${i(a)}</span>
			${t?`<span class="ac-check__hint">${i(t)}</span>`:""}
		</span>
	</label>`}function v(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}var tt=[{value:"primaire",label:"Primaire (Primary)"},{value:"college",label:"Coll\xE8ge (Middle School)"},{value:"lycee",label:"Lyc\xE9e (High School)"},{value:"autre",label:"Autre (Other)"}],st=[{value:"free",label:"Free"},{value:"pro",label:"Pro"},{value:"enterprise",label:"Enterprise"}];function nt({onCreated:e=null}={}){let a=H({title:"Add an organization",subtitle:'The organization is created as "pending": it is provisioned, but it cannot sign in until you activate it.',body:`<div class="ac-field-grid">
				${L({id:"ac-org-new-name",label:"Name",placeholder:"Lyc\xE9e Al Khawarizmi",full:!0})}
				${L({id:"ac-org-new-slug",label:"Slug",placeholder:"derived from the name",hint:"A unique identifier. Leave it blank to derive it from the name.",full:!0})}
				${U({id:"ac-org-new-type",label:"Type",options:tt,value:"primaire"})}
				${U({id:"ac-org-new-plan",label:"Plan",options:st,value:"free"})}
				${L({id:"ac-org-new-year",label:"Academic year",placeholder:"2025-2026"})}
				${L({id:"ac-org-new-capacity",label:"Student capacity",type:"number",value:"100",hint:"Recorded for information; no entitlement is derived from it yet."})}
				${L({id:"ac-org-new-city",label:"City"})}
				${L({id:"ac-org-new-email",label:"Email",type:"email"})}
			</div>`,footer:`
			<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
			<button type="button" class="ac-btn ac-btn--primary" data-ac-confirm>Create the organization</button>
		`}),t=a.root;return t.querySelector("[data-ac-cancel]").addEventListener("click",a.close),t.querySelector("[data-ac-confirm]").addEventListener("click",async()=>{let n=o=>t.querySelector(`#${o}`)?.value?.trim()??"",s=n("ac-org-new-name");if(!s){y("The organization needs a name.","error");return}try{let o=await k.post("console/organizations",{name:s,slug:n("ac-org-new-slug")||void 0,school_type:n("ac-org-new-type"),plan:n("ac-org-new-plan"),school_year:n("ac-org-new-year")||void 0,max_students:Number(n("ac-org-new-capacity"))||100,city:n("ac-org-new-city")||void 0,email:n("ac-org-new-email")||void 0});a.close(),y("The organization was created. It is pending until you activate it.","success"),typeof e=="function"&&e(o?.data)}catch(o){y(o.message,"error")}}),a}function rt(e,{onSaved:a=null}={}){let t=H({title:`Edit "${e.name}"`,subtitle:"The profile of the organization. The slug is its unique identifier and is not changed here.",wide:!0,body:`<div class="ac-field-grid">
				${L({id:"ac-org-edit-name",label:"Name",value:e.name,full:!0})}
				${U({id:"ac-org-edit-type",label:"Type",options:tt,value:e.schoolType||e.school_type||"primaire"})}
				${U({id:"ac-org-edit-plan",label:"Plan",options:st,value:e.plan||"free"})}
				${L({id:"ac-org-edit-year",label:"Academic year",value:e.schoolYear||e.school_year||""})}
				${L({id:"ac-org-edit-capacity",label:"Student capacity",type:"number",value:String(e.maxStudents??e.max_students??100)})}
				${L({id:"ac-org-edit-city",label:"City",value:e.city||""})}
				${L({id:"ac-org-edit-phone",label:"Phone",value:e.phone||""})}
				${L({id:"ac-org-edit-email",label:"Email",value:e.email||""})}
				${L({id:"ac-org-edit-address",label:"Address",value:e.address||"",full:!0})}
			</div>`,footer:`
			<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
			<button type="button" class="ac-btn ac-btn--primary" data-ac-confirm>Save the profile</button>
		`}),n=t.root;return n.querySelector("[data-ac-cancel]").addEventListener("click",t.close),n.querySelector("[data-ac-confirm]").addEventListener("click",async()=>{let s=o=>n.querySelector(`#${o}`)?.value?.trim()??"";try{await k.patch(`console/organizations/${encodeURIComponent(e.id)}`,{profile:{name:s("ac-org-edit-name"),school_type:s("ac-org-edit-type"),plan:s("ac-org-edit-plan"),school_year:s("ac-org-edit-year")||null,max_students:Number(s("ac-org-edit-capacity"))||100,city:s("ac-org-edit-city")||null,phone:s("ac-org-edit-phone")||null,email:s("ac-org-edit-email")||null,address:s("ac-org-edit-address")||null}}),t.close(),y("The organization profile was saved.","success"),typeof a=="function"&&a()}catch(o){y(o.message,"error")}}),t}async function ot(e,{onDeleted:a=null}={}){if(!await j({title:`Delete "${e.name}"?`,message:"The organization is removed together with every account, class, question, exam, result and generated document it owns. This cannot be undone. Suspending the organization instead keeps everything and ends the access.",detail:"Type DELETE on the confirmation to go ahead.",confirmLabel:"Delete the organization",danger:!0}))return!1;try{return await k.del(`console/organizations/${encodeURIComponent(e.id)}`,{confirm:"DELETE"}),y("The organization was deleted.","success"),typeof a=="function"&&a(),!0}catch(n){return y(n.message,"error"),!1}}async function it(e,{onChanged:a=null}={}){let t=e.status!=="suspended";if(!await j({title:t?`Suspend "${e.name}"?`:`Reactivate "${e.name}"?`,message:t?"Nobody in the organization can sign in until it is restored. Nothing is deleted, and the administrator of the organization can still reach the console to reactivate it.":"The organization can sign in again immediately.",confirmLabel:t?"Suspend the organization":"Reactivate the organization",danger:t}))return!1;try{return await k.patch(`console/organizations/${encodeURIComponent(e.id)}`,{status:t?"suspended":"active",reason:t?"Suspended from the console":"Reactivated from the console"}),y(t?"The organization was suspended.":"The organization was reactivated.","success"),typeof a=="function"&&a(),!0}catch(s){return y(s.message,"error"),!1}}var ws=25,F={search:"",status:"",offset:0,sort:{key:"name",direction:"asc"}},ct={id:"organizations",path:"/organizations",title:"Organizations",description:"Every organization on the platform, its accounts, its usage and the conditions that need attention.",permission:["platform.organizations.read","school.profile.read"],async render(e,a){e.innerHTML=`
			${B({fields:`${Oe({id:"ac-org-search",placeholder:"Search organizations\u2026",value:F.search})}
					${pe({id:"ac-org-status",label:"Status",value:F.status,includeAll:!0,allLabel:"All statuses",options:[{value:"active",label:"Active"},{value:"pending",label:"Pending"},{value:"suspended",label:"Suspended"}]})}`,actions:`${a.isPlatform?'<button type="button" class="ac-btn ac-btn--primary" data-ac-org-new>Add an organization</button>':""}<button type="button" class="ac-btn" data-ac-refresh>Refresh</button>`})}
			<div class="ac-grid ac-grid--kpi" data-ac-org-kpis></div>
			<section class="ac-panel" style="margin-top:16px">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title">Organizations</h3>
						<p class="ac-panel__subtitle">${a.isOffline?"Every organization hosted on this installation. Active users are measured over the last 30 days from real sign-ins, attempts and content creation.":"Every organization on the platform. Active users are measured over the last 30 days from real sign-ins, attempts and content creation."}</p>
					</div>
				</div>
				<div class="ac-panel__body ac-panel__body--flush" data-ac-org-body>
					${I(4)}
				</div>
			</section>
			<div class="ac-grid ac-grid--2" style="margin-top:16px" data-ac-org-charts></div>`;let t=e.querySelector("[data-ac-org-body]"),n=e.querySelector("[data-ac-org-kpis]"),s=e.querySelector("[data-ac-org-charts]"),o;try{o=await k.get("console/organizations",{search:F.search||void 0,status:F.status||void 0,limit:ws,offset:F.offset})}catch(d){t.innerHTML=O({message:d.message});return}let f=o.data,r=f.length,p=f.filter(d=>d.status==="active").length,l=f.filter(d=>d.status==="pending").length,h=f.filter(d=>d.status==="suspended").length,c=f.reduce((d,b)=>d+(b.teachers||0),0),m=f.reduce((d,b)=>d+(b.students||0),0),g=f.filter(d=>d.alerts.some(b=>b.code==="inactive"||b.code==="no_activity")).length;if(n.innerHTML=[S({label:"Organizations shown",value:_(r),note:o.total>f.length?`of ${_(o.total)} matching`:"matching the filter",tooltip:"The number of organizations matching the current search and status filter."}),S({label:"Active",value:_(p),tone:"success",tooltip:'Organizations whose lifecycle status is "active".'}),S({label:"Pending / suspended",value:`${_(l)} / ${_(h)}`,tone:l+h>0?"warning":"",tooltip:"Organizations awaiting activation, and organizations whose access has been revoked."}),S({label:"Accounts",value:_(c+m),note:`${_(c)} teachers \xB7 ${_(m)} students`,tooltip:"Teacher and student accounts across the organizations shown."}),S({label:"Needing attention",value:_(g),tone:g>0?"warning":"",tooltip:"Organizations with no activity in the last 30 days, or with no recorded activity at all."})].join(""),t.innerHTML=q({columns:[{key:"name",label:"Organization",sortable:!0,render:d=>`<a href="#/organizations/${d.id}" class="ac-table__primary">${i(d.name)}</a><br><span class="ac-table__muted">${i(d.slug)}</span>`},{key:"status",label:"Status",sortable:!0,render:d=>`<span class="ac-badge ${d.status==="active"?"ac-badge--success":d.status==="pending"?"ac-badge--warning":"ac-badge--danger"}">${i(d.status)}</span>`},{key:"plan",label:"Plan",render:d=>i(d.plan||"\u2014")},{key:"teachers",label:"Teachers",align:"right",sortable:!0},{key:"students",label:"Students",align:"right",sortable:!0},{key:"activeTeachers",label:"Active teachers",align:"right",sortable:!0,render:d=>`${_(d.activeTeachers)} / ${_(d.teachers)}`},{key:"activeStudents",label:"Active students",align:"right",sortable:!0,render:d=>`${_(d.activeStudents)} / ${_(d.students)}`},{key:"attempts30d",label:"Attempts (30d)",align:"right",sortable:!0},{key:"lastActivity",label:"Last activity",sortable:!0,render:d=>d.lastActivity?`<span title="${i(N(d.lastActivity))}">${i(D(d.lastActivity))}</span>`:'<span class="ac-badge ac-badge--danger">none</span>'},{key:"alerts",label:"Alerts",render:d=>d.alerts.length?d.alerts.map(b=>`<span class="ac-badge ac-badge--${b.kind==="danger"?"danger":b.kind==="warning"?"warning":"info"}" title="${i(b.message)}">${i(b.code)}</span>`).join(" "):'<span class="ac-table__muted">\u2014</span>'},{key:"actions",label:"Actions",align:"right",render:d=>He(at(d,{canManage:a.isPlatform}))}],rows:f,sort:F.sort,onSort:d=>{F.sort={key:d,direction:F.sort.key===d&&F.sort.direction==="asc"?"desc":"asc"},a.rerender()},empty:a.isPlatform?"No organization matches the current search and status filter.":"This session is scoped to a single organization.",rowHref:d=>`#/organizations/${d.id}`}),t.insertAdjacentHTML("beforeend",ye({total:o.total,limit:o.limit,offset:o.offset,onPage:d=>{F.offset=d,a.rerender()}})),a.isPlatform&&f.length){let d=[...f].sort((b,x)=>(x.activeStudents||0)-(b.activeStudents||0)).slice(0,8);s.innerHTML=`
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles">
							<h3 class="ac-panel__title">Usage by organization</h3>
							<p class="ac-panel__subtitle">Active students over the last 30 days, highest first.</p>
						</div>
					</div>
					<div class="ac-panel__body">
						${Q({rows:d.map(b=>({label:b.name,value:b.activeStudents||0})),value:"value",label:b=>b.label,display:b=>_(b),tone:"primary",ariaLabel:"Active students by organization"})}
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
						${Q({rows:d.map(b=>({label:b.name,teachers:b.teachers||0,students:b.students||0})),value:"students",label:b=>b.label,display:b=>_(b),tone:"primary",ariaLabel:"Students by organization"})}
					</div>
				</section>`}else s.innerHTML="";let u=e.querySelector("#ac-org-search"),w=null;u.addEventListener("input",()=>{window.clearTimeout(w),w=window.setTimeout(()=>{F.search=u.value.trim(),F.offset=0,a.rerender()},320)}),e.querySelector("#ac-org-status").addEventListener("change",d=>{F.status=d.target.value,F.offset=0,a.rerender()}),e.querySelector("[data-ac-refresh]").addEventListener("click",()=>a.rerender()),Be(t,{open:d=>{window.location.hash=`#/organizations/${d}`},"toggle-status":async d=>{let b=f.find(x=>x.id===d);b&&await it(b,{onChanged:()=>a.rerender()})},edit:d=>{let b=f.find(x=>x.id===d);b&&rt(b,{onSaved:()=>a.rerender()})},delete:async d=>{let b=f.find(x=>x.id===d);b&&await ot(b,{onDeleted:()=>a.rerender()})}}),e.querySelector("[data-ac-org-new]")?.addEventListener("click",()=>{nt({onCreated:()=>a.rerender()})})}};var xs=[{value:"student",label:"Student"},{value:"teacher",label:"Teacher"},{value:"admin",label:"Administrator"},{value:"super_admin",label:"Platform administrator"}];function Ue({ctx:e,role:a="student",onCreated:t=null}){let n=!!e?.isPlatform,s=String(a||"student").split(",")[0].trim()||"student",o=H({title:"Add an account",subtitle:"The account is created in your organization. The password is stored hashed and is never shown again.",body:`<div class="ac-field-grid">
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
						${xs.map(r=>`<option value="${i(r.value)}"${r.value===s?" selected":""}>${i(r.label)}</option>`).join("")}
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
		`}),f=o.root;return f.querySelector("[data-ac-cancel]").addEventListener("click",o.close),f.querySelector("[data-ac-confirm]").addEventListener("click",async()=>{let r=d=>f.querySelector(`#${d}`)?.value?.trim()??"",p=r("ac-new-name"),l=r("ac-new-username"),h=r("ac-new-password");if(!p||!l){y("A name and a username are required.","error");return}if(h.length<8){y("The password must be at least 8 characters.","error");return}let c={name:p,username:l,password:h,role:r("ac-new-role")||"student"},m=r("ac-new-numero"),g=r("ac-new-email"),u=r("ac-new-phone");m&&(c.numero=m),g&&(c.email=g),u&&(c.phone=u);let w=r("ac-new-school");w&&(c.school_id=w);try{let d=await k.post("console/users",c);o.close(),y(`The account "${l}" was created.`,"success"),typeof t=="function"?t(d?.data):e?.rerender&&e.rerender()}catch(d){y(d.message,"error")}}),o}var lt={id:"users",path:"/users",title:"Users & Access",description:"Accounts, roles and access \u2014 separated by the population each list serves.",permission:["platform.users.read","school.users.read"],async render(e,a){e.innerHTML=`<div class="ac-stack" data-ac-users-hub>${I(3)}</div>`;let t;try{t=await k.get("console/users?limit=200")}catch(h){e.querySelector("[data-ac-users-hub]").innerHTML=O({title:"The accounts could not be loaded",message:h.message});return}let n=Array.isArray(t?.data)?t.data:[],s=h=>n.filter(c=>c.role===h).length,o=h=>n.filter(c=>c.role===h&&c.status==="active").length,f=n.filter(h=>!h.lastLogin).length,r=n.filter(h=>h.status==="suspended").length,p=a.isPlatform,l=({href:h,icon:c,title:m,desc:g,count:u,activeCount:w})=>`
			<a class="ac-role-card" href="${i(h)}">
				<span class="ac-role-card__icon">${c}</span>
				<p class="ac-role-card__title">${i(m)}</p>
				<p class="ac-role-card__desc">${i(g)}</p>
				<p class="ac-role-card__count">${we(u)} <small>${w!=null?`\xB7 ${we(w)} active`:"account"}</small></p>
			</a>`;e.querySelector("[data-ac-users-hub]").innerHTML=`
			<div class="ac-grid ac-grid--kpi">
				${S({label:"Accounts in scope",value:we(n.length),note:"matching the current scope"})}
				${S({label:"Never signed in",value:we(f),note:"provisioned, unused",tone:f>0?"warning":"",tooltip:"Accounts with no recorded sign-in. They may be waiting for the person to use them."})}
				${S({label:"Suspended",value:we(r),note:"no access",tone:r>0?"warning":""})}
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
				${l({href:"#/users/administrators",icon:'<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',title:p?"Directors & platform administrators":"Directors",desc:p?"The school directors, and the platform administrators who reach every organization.":"The people who administer this school.",count:s("admin")+s("super_admin"),activeCount:o("admin")+o("super_admin")})}
			</div>

			${f>0?`<div class="ac-alert ac-alert--warning" style="margin-top:16px">
						<div class="ac-alert__body">
							<p class="ac-alert__title">${we(f)} account(s) have never signed in</p>
							<p class="ac-alert__text">They may be waiting to be used, or they may have been provisioned in error. Open the relevant page to review them.</p>
						</div>
					</div>`:""}`,e.querySelector("[data-ac-add-account]")?.addEventListener("click",()=>{Ue({ctx:a})})}};function we(e){let a=Number(e);return Number.isFinite(a)?a.toLocaleString():"0"}var dt=25;async function xe({host:e,ctx:a,role:t,title:n,subtitle:s,columns:o,emptyMessage:f,state:r,extraFilters:p=[]}){e.innerHTML=`
		${B({fields:`<div class="ac-field">
				<label class="ac-field__label" for="ac-user-search">Search</label>
				<input class="ac-input" id="ac-user-search" type="search" placeholder="Name, username, email\u2026" value="${i(r.search||"")}" autocomplete="off" />
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
			${p.map(g=>`<div class="ac-field">
					<label class="ac-field__label" for="${i(g.id)}">${i(g.label)}</label>
					<select class="ac-select" id="${i(g.id)}">
						${g.options.map(u=>`<option value="${i(u.value)}"${String(r[g.key]??"")===String(u.value)?" selected":""}>${i(u.label)}</option>`).join("")}
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
				${I(5)}
			</div>
		</section>`;let l=e.querySelector("[data-ac-user-table]"),h=async()=>{l.innerHTML=I(5);let g;try{g=await k.get("console/users",{role:t,search:r.search||void 0,status:r.status||void 0,...r.schoolId?{school_id:r.schoolId}:{},limit:dt,offset:r.offset||0})}catch(d){l.innerHTML=O({title:"The accounts could not be loaded",message:d.message});return}let u=g?.data||[],w=a.canAny(["platform.users.manage","school.users.manage"]);l.innerHTML=u.length===0?R({title:"No accounts",message:f}):q({columns:[...o,{key:"actions",label:"Actions",align:"right",render:d=>He(et(d,{canManage:w}))}],rows:u,rowHref:d=>`#/users/${d.id}`}),Be(l,{open:d=>{window.location.hash=`#/users/${d}`},"toggle-status":async d=>{let b=u.find(E=>E.id===d);if(!b)return;let x=b.status==="active";if(await j({title:x?`Suspend "${b.username}"?`:`Reactivate "${b.username}"?`,message:x?"The account keeps everything it owns, but it can no longer sign in. The action is recorded in the audit trail.":"The account can sign in again immediately. The action is recorded in the audit trail.",confirmLabel:x?"Suspend the account":"Reactivate the account",danger:x}))try{await k.patch(`console/users/${encodeURIComponent(d)}`,{status:x?"suspended":"active",reason:x?"Suspended from the account roster":"Reactivated from the account roster"}),y(x?"The account was suspended.":"The account was reactivated.","success"),h()}catch(E){y(E.message,"error")}},delete:async d=>{let b=u.find(T=>T.id===d);if(!(!b||!await j({title:`Delete "${b.username}"?`,message:"The account is removed, together with its sessions and its results. This cannot be undone \u2014 suspending the account keeps the record if you only need to end the access.",confirmLabel:"Delete the account",danger:!0})))try{await k.del(`console/users/${encodeURIComponent(d)}`),y("The account was deleted.","success"),h()}catch(T){y(T.message,"error")}}}),l.insertAdjacentHTML("beforeend",ye({total:g?.total||0,limit:g?.limit||dt,offset:g?.offset||0,onPage:d=>{r.offset=d,h()}}))},c=e.querySelector("#ac-user-search"),m=null;c.addEventListener("input",()=>{window.clearTimeout(m),m=window.setTimeout(()=>{r.search=c.value.trim(),r.offset=0,h()},320)}),e.querySelector("#ac-user-status").addEventListener("change",g=>{r.status=g.target.value,r.offset=0,h()});for(let g of p)e.querySelector(`#${g.id}`).addEventListener("change",u=>{r[g.key]=u.target.value,r.offset=0,h()});e.querySelector("[data-ac-user-refresh]").addEventListener("click",h),e.querySelector("[data-ac-user-add]")?.addEventListener("click",()=>{Ue({ctx:a,role:t,onCreated:()=>{r.offset=0,h()}})}),await h()}var ca=e=>`<span class="ac-badge ac-badge--${e.status==="active"?"success":e.status==="suspended"?"danger":"warning"}">${i(e.status)}</span>`,la=e=>e.lastLogin?`<span title="${i(N(e.lastLogin))}">${i(D(e.lastLogin))}</span>`:'<span class="ac-badge ac-badge--warning">never</span>',pt=[{key:"name",label:"Teacher",render:e=>`<span class="ac-table__primary">${i(e.name||e.username)}</span><br><span class="ac-table__muted">${i(e.username)}${e.email?` \xB7 ${i(e.email)}`:""}</span>`},{key:"status",label:"Status",render:ca},{key:"schoolName",label:"Organization",render:e=>i(e.schoolName||"\u2014")},{key:"lastLogin",label:"Last sign-in",render:la},{key:"createdAt",label:"Created",render:e=>i(N(e.createdAt,{withTime:!1}))}],ut=[{key:"name",label:"Student",render:e=>`<span class="ac-table__primary">${i(e.name||e.username)}</span><br><span class="ac-table__muted">${i(e.username)}${e.numero?` \xB7 #${i(e.numero)}`:""}</span>`},{key:"status",label:"Status",render:ca},{key:"className",label:"Class",render:e=>i(e.className||"\u2014")},{key:"schoolName",label:"Organization",render:e=>i(e.schoolName||"\u2014")},{key:"lastLogin",label:"Last sign-in",render:la}],ht=[{key:"name",label:"Administrator",render:e=>`<span class="ac-table__primary">${i(e.name||e.username)}</span><br><span class="ac-table__muted">${i(e.username)}</span>`},{key:"role",label:"Level",render:e=>`<span class="ac-badge ${e.role==="super_admin"?"ac-badge--violet":"ac-badge--brand"}">${i(e.role==="super_admin"?"Platform":"Organization")}</span>`},{key:"status",label:"Status",render:ca},{key:"schoolName",label:"Organization",render:e=>i(e.schoolName||"\u2014")},{key:"lastLogin",label:"Last sign-in",render:la}];var ks={search:"",status:"",offset:0},mt={id:"users-teachers",path:"/users/teachers",title:"Teachers",description:"The teaching staff, their activity and their access.",permission:["platform.users.read","school.users.read"],async render(e,a){await xe({host:e,ctx:a,role:"teacher",title:"Teachers",subtitle:"Every teacher account in scope. Open an account to change its status, role or permissions.",columns:pt,emptyMessage:"No teacher account matches the current filters.",state:ks})}};var $s={search:"",status:"",offset:0},gt={id:"users-students",path:"/users/students",title:"Students",description:"The enrolled pupils, their class and their activity.",permission:["platform.users.read","school.users.read"],async render(e,a){await xe({host:e,ctx:a,role:"student",title:"Students",subtitle:"Every student account in scope. Open an account to change its status, role or permissions.",columns:ut,emptyMessage:"No student account matches the current filters.",state:$s})}};var Ss={search:"",status:"",offset:0},ft={id:"users-administrators",path:"/users/administrators",title:"Directors & administrators",description:"The accounts that can administer \u2014 the school director, and on a SaaS deployment the platform administrators.",permission:["platform.users.read","school.users.read"],async render(e,a){await xe({host:e,ctx:a,role:"admin,super_admin",title:a.isPlatform?"Directors & platform administrators":"Directors",subtitle:a.isPlatform?"A platform administrator reaches every organization; an organization administrator reaches only their own.":"The accounts that administer this school.",columns:ht,emptyMessage:"No administrator account matches the current filters.",state:Ss})}};var bt={id:"analytics",path:"/analytics",title:"Platform Analytics",description:"Adoption, engagement and usage of the platform \u2014 aggregated across organizations, never per class.",permission:["platform.analytics.read","school.analytics.read"],async render(e,a){let t=a.getState();e.innerHTML=`<div class="ac-stack" data-ac-analytics>
			${Ie({value:t.period})}
			<div data-ac-kpis class="ac-grid ac-grid--kpi">${I(1)}</div>
			<div data-ac-sections class="ac-stack"></div>
		</div>`;let n={period:t.period==="year"?"year":t.period};t.period==="custom"&&t.customRange&&(n.from=t.customRange.from,n.to=t.customRange.to);let s,o,f;try{[s,o,f]=await Promise.all([k.get("console/overview",n),k.get("console/trends",n),k.get("console/organizations",{limit:100,offset:0})])}catch(w){e.querySelector("[data-ac-sections]").innerHTML=O({message:w.message});return}let r=s.data,p=r.sections.glance,l=r.sections.activity,h=r.sections.content,c=r.meta.definitions;e.querySelector("[data-ac-kpis]").innerHTML=[S({label:"Organizations",value:_(p.organizations.total),note:`${p.organizations.active} active`,tooltip:"Organizations in the current scope."}),S({label:"Teacher adoption",value:p.users.teachers>0?`${Math.round(p.users.activeTeachers/p.users.teachers*100)}%`:"\u2014",note:`${_(p.users.activeTeachers)} of ${_(p.users.teachers)} teachers active`,tone:"success",tooltip:c.activeTeacher}),S({label:"Student participation",value:p.users.students>0?`${Math.round(l.participatingStudents/p.users.students*100)}%`:"\u2014",note:`${_(l.participatingStudents)} of ${_(p.users.students)} students took part`,tone:"primary",tooltip:"Students with at least one completed attempt in the period, over the number of enrolled students. Attempts and unique students are reported separately and never conflated."}),S({label:"Attempts per student",value:l.participatingStudents>0?(l.attempts/l.participatingStudents).toFixed(1):"\u2014",note:`${_(l.attempts)} attempts`,tooltip:"Total completed attempts divided by the number of unique students who made at least one. A value above 1 means students attempted more than once on average."}),S({label:"Average score",value:l.averageScore20==null?"\u2014":l.averageScore20.toFixed(2),note:`/20 per formal attempt \xB7 ${_(l.averageScoreSample)} attempts`,tone:"primary",tooltip:c.averageScore}),S({label:"Content authored",value:_(h.questions+h.exams+h.courses),note:`${_(h.questions)} questions \xB7 ${_(h.exams)} exams \xB7 ${_(h.courses)} courses`,tooltip:"Content created in the selected period. The question and course totals are all-time row counts; the exam and course counts respect the period."})].join("");let m=o?.data?.series,g=m?m.labels.map((w,d)=>({label:w,formalAttempts:m.formalAttempts[d]||0,trainingAttempts:m.trainingAttempts[d]||0,gameAttempts:m.gameAttempts[d]||0,newTeachers:m.newTeachers[d]||0,newStudents:m.newStudents[d]||0})):[],u=(f?.data||[]).slice(0,10);e.querySelector("[data-ac-sections]").innerHTML=`
			<div class="ac-section">
				<h2 class="ac-section__title">Educational activity</h2>
				<p class="ac-section__hint">Completed attempts by mode, over ${i(o?.data?.meta?.periodLabel||"the selected period")}.</p>
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
						${g.length?`${J([{label:"Formal exams",tone:"primary"},{label:"Training",tone:"info"},{label:"Games",tone:"violet"}])}${te({points:g,series:[{key:"formalAttempts",label:"Formal exams",tone:"primary"},{key:"trainingAttempts",label:"Training",tone:"info"},{key:"gameAttempts",label:"Games",tone:"violet"}],labelKey:"label",ariaLabel:"Attempts by mode over time"})}`:R({title:"No attempts recorded",message:"No completed attempts fall inside the selected period."})}
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
						${g.length?`${J([{label:"Teachers",tone:"success"},{label:"Students",tone:"warning"}])}${te({points:g,series:[{key:"newTeachers",label:"Teachers",tone:"success"},{key:"newStudents",label:"Students",tone:"warning"}],labelKey:"label",ariaLabel:"New accounts over time"})}`:R({title:"No accounts created",message:"No accounts were created inside the selected period."})}
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
						${u.length?Q({rows:u.map(w=>({label:w.name,value:w.activeStudents||0})),value:"value",label:w=>w.label,display:w=>_(w),ariaLabel:"Active students by organization"}):R({title:"No organizations to compare",message:"The current scope contains no organization with recorded usage."})}
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
						${u.length?Wa({rows:u.map(w=>({label:w.name,teachers:w.teachers||0,students:w.students||0})),series:[{key:"teachers",label:"Teachers",tone:"success"},{key:"students",label:"Students",tone:"primary"}],label:w=>w.label,ariaLabel:"Teachers and students by organization"}):R({title:"No organizations to compare",message:"The current scope contains no organization with recorded accounts."})}
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
								<p class="ac-defs__desc">${_(h.questions)}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Classes</p>
								<p class="ac-defs__desc">${_(h.classes)}</p>
							</div>
						</div>
						<p class="ac-empty__message" style="margin:12px 0 0;font-size:12px">${i(h.note)}</p>
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
								<p class="ac-defs__desc">${_(h.exams)}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Published exams</p>
								<p class="ac-defs__desc">${_(h.activeExams)}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Conducted in period</p>
								<p class="ac-defs__desc">${_(l.examsConducted)}</p>
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
								<p class="ac-defs__desc">${_(h.courses)}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Games created</p>
								<p class="ac-defs__desc">${_(h.games)}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Kids games created</p>
								<p class="ac-defs__desc">${_(h.kidsGames)}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Game sessions played</p>
								<p class="ac-defs__desc">${_(l.gameSessions+l.kidsGameSessions)}</p>
							</div>
						</div>
					</div>
				</section>
			</div>`,_e(e,"period",w=>{if(w==="custom"){let d=prompt("From (YYYY-MM-DD)",new Date(Date.now()-2592e6).toISOString().slice(0,10));if(!d)return;let b=prompt("To (YYYY-MM-DD)",new Date().toISOString().slice(0,10));if(!b)return;a.setPeriod("custom",{from:d,to:b});return}a.setPeriod(w)})}};var vt={id:"teaching",path:"/teaching",title:"Teaching & Learning",description:"Teacher activity, class performance and student outcomes across every organization in scope.",permission:["platform.analytics.read","school.analytics.read"],async render(e,a){let t=a.getState(),n=t.targetSchoolId||"";e.innerHTML=`<div class="ac-stack">${I(4)}</div>`;let s={period:t.period};t.period==="custom"&&t.customRange&&(s.from=t.customRange.from,s.to=t.customRange.to),n&&(s.school_id=n);let o;try{o=(await k.get("console/teaching",s)).data}catch($){if(($.status===403||$.status===404)&&n){Xe(null),a.rerender();return}e.innerHTML=O({message:$.message}),e.querySelector("[data-ac-retry]")?.addEventListener("click",()=>a.rerender());return}let f=o.sections,r=o.meta,p=Array.isArray(r.scope.organizations)?r.scope.organizations:[],l=new Map(p.map($=>[$.id,$.name])),h=p.length>1,c=p.length>1?pe({id:"ac-teaching-org",label:"Organization",options:p.map($=>({value:$.id,label:$.name})),value:n,includeAll:!0,allLabel:"All organizations"}):"";e.innerHTML=`<div class="ac-stack">
			${B({chips:ra({options:na,value:t.period,name:"period"}),fields:c,actions:'<button type="button" class="ac-btn" data-ac-refresh>Refresh</button>'})}
			<div data-ac-kpis class="ac-grid ac-grid--kpi"></div>
			<div data-ac-sections class="ac-stack"></div>
		</div>`,e.querySelector("#ac-teaching-org")?.addEventListener("change",$=>{Xe($.target.value||null),a.rerender()}),e.querySelector("[data-ac-refresh]")?.addEventListener("click",()=>a.rerender());let m=f.glance,g=f.achievement,u=f.content,w=m.participationRate,d=g.avgExamScore,b=g.passRate;e.querySelector("[data-ac-kpis]").innerHTML=[S({label:"Students",value:_(m.totalStudents.value),note:"enrolled now",tooltip:"Student accounts in the current scope. A current-state total: it is not narrowed by the reporting period."}),S({label:"Teachers",value:_(m.totalTeachers.value),note:"accounts in scope",tooltip:"Teacher accounts in the current scope (current-state)."}),S({label:"Classes",value:_(m.totalClasses.value),note:"classes in scope",tooltip:"Classes in the current scope (current-state)."}),S({label:"Participation",value:w.value==null?"\u2014":`${w.value}%`,note:`${_(w.numerator)} of ${_(w.denominator)} students active`,tone:w.value==null?"":"primary",tooltip:"Unique students with at least one completed attempt (exam, training, game or tournament) in the period, over the enrolled population."}),S({label:"Active students",value:_(m.activeStudents.value),note:"took part in the period",tooltip:"Distinct students with at least one qualifying attempt in the reporting window."}),S({label:"Average score",value:d.value==null?"\u2014":d.value.toFixed(2),note:d.sample>0?`/20 over ${_(d.sample)} attempts`:"no formal attempts",tone:d.value==null?"":"primary",tooltip:"Mean final score of formal exam attempts in the period, rescaled from the stored 0\u2013100 to the familiar /20. Training, games and tournaments are excluded."}),S({label:"Pass rate",value:b.value==null?"\u2014":`${b.value}%`,note:`${_(b.passed)} of ${_(b.total)} attempts passed`,tone:b.value==null?"":b.value>=50?"success":"warning",tooltip:"Formal exam attempts that passed over all formal attempts. Passing uses the exam-configured threshold (default 10/20)."}),S({label:"Assessments conducted",value:_(g.examsConducted.value),note:"distinct exams sat",tooltip:"Distinct formal exams with at least one finalized result in the period."})].join("");let x=[...f.teacherInsights.teacherActivity||[]].sort(($,ge)=>ge.assessmentActivity-$.assessmentActivity||ge.questionsCreated-$.questionsCreated||$.name.localeCompare(ge.name)),T=[{key:"name",label:"Teacher",render:$=>`<span class="ac-table__primary">${i($.name)}</span>${$.status&&$.status!=="active"?` <span class="ac-table__muted">(${i($.status)})</span>`:""}`},...h?[{key:"schoolName",label:"Organization",render:$=>`<span class="ac-table__muted">${i($.schoolName||l.get($.schoolId)||"\u2014")}</span>`}]:[],{key:"questionsCreated",label:"Questions",align:"right",render:$=>_($.questionsCreated)},{key:"examsCreated",label:"Exams",align:"right",render:$=>_($.examsCreated)},{key:"classesManaged",label:"Classes",align:"right",render:$=>$.classesManaged?`<span title="${i($.classNames.join(", "))}">${_($.classesManaged)}</span>`:"0"},{key:"assessmentActivity",label:"Assessments",align:"right",render:$=>_($.assessmentActivity)},{key:"avgScore20",label:"Avg /20",align:"right",render:$=>$.avgScore20==null?"\u2014":$.avgScore20.toFixed(2)},{key:"passRate",label:"Pass rate",align:"right",render:$=>$.passRate==null?"\u2014":`${$.passRate}%`}],E=(g.classComparison||[]).filter($=>$.avgScore20!=null),z=$=>h?`${$.className} \xB7 ${l.get($.schoolId)||"Organization"}`:$.className,A=E.length?`${J([{label:"Class mean /20",tone:"primary"}])}${Q({rows:E.map($=>({...$,chartLabel:z($)})),value:"avgScore20",max:20,threshold:10,label:$=>`${$.chartLabel} (n=${$.sample})`,display:$=>`${Number($).toFixed(1)}/20`,ariaLabel:"Average formal exam score by class"})}`:R({title:"No formal results yet",message:"No class has a finalized formal exam result in the selected period."}),M=f.teacherInsights.classesNeedingAttention||[],G=M.length?`<div class="ac-defs">${M.map($=>`<div class="ac-defs__item">
							<p class="ac-defs__term">${i($.className)}${h?` <span class="ac-table__muted">\xB7 ${i($.schoolName||l.get($.schoolId)||"")}</span>`:""}</p>
							<p class="ac-defs__desc">${i($.reasons.join(" \xB7 "))} \xB7 mean ${$.avgScore20==null?"\u2014":$.avgScore20}/20 over ${_($.sample)} attempts</p>
						</div>`).join("")}</div>`:R({title:"No class is below the attention thresholds",message:"Attention is raised when a class has enough results to trust and either a mean below 8/20 or a pass rate below 40%."}),ce=g.scoreDistribution||[],le=d.sample>0?`${Ya({buckets:ce.map($=>({label:$.label,count:$.count})),ariaLabel:"Formal exam score distribution"})}
					<div class="ac-defs" style="margin-top:10px">${ce.map($=>`<div class="ac-defs__item">
								<p class="ac-defs__term">${i($.label)}</p>
								<p class="ac-defs__desc">${_($.count)} attempts${$.pct==null?"":` \xB7 ${$.pct}%`}</p>
							</div>`).join("")}</div>`:R({title:"No formal attempts to distribute",message:"Score bands need at least one finalized formal exam attempt in the period."}),de=g.certifiedStudents.value||0,me=g.pendingSuccess.value||0,Ve=de+me>0?`${Va({segments:[{label:"Passed at least one exam",value:de,tone:"success"},{label:"Still pending success",value:me,tone:"warning"}],centerValue:String(de+me),centerLabel:"students assessed",ariaLabel:"Certified and pending students"})}
					${J([{label:`Certified (${de})`,tone:"success"},{label:`Pending (${me})`,tone:"warning"}])}`:R({title:"No student sat a formal exam",message:"Certification compares students who passed an exam with those who sat one but did not."}),Se=f.engagement.activityTrend||{points:[]},ka=(Se.points||[]).map($=>({label:$.period,exam:$.exam||0,training:$.training||0,game:$.game||0,tournament:$.tournament||0})),ss=ka.length?`${J([{label:"Formal exams",tone:"primary"},{label:"Training",tone:"info"},{label:"Games",tone:"violet"},{label:"Tournaments",tone:"warning"}])}${te({points:ka,series:[{key:"exam",label:"Formal exams",tone:"primary"},{key:"training",label:"Training",tone:"info"},{key:"game",label:"Games",tone:"violet"},{key:"tournament",label:"Tournaments",tone:"warning"}],labelKey:"label",ariaLabel:"Learning activity by mode over time"})}`:R({title:"No activity in the period",message:"No completed attempt falls inside the selected reporting window."}),ze=f.engagement,$a=u.contentCoverage||{},Sa=Object.values(r.unavailable||{}),ns=`<div class="ac-defs">
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
			${Sa.length?`<div class="ac-defs__item">
							<p class="ac-defs__term">Not measurable</p>
							<p class="ac-defs__desc">${Sa.map($=>i($)).join(" ")}</p>
						</div>`:""}
		</div>`;e.querySelector("[data-ac-sections]").innerHTML=`
			<div class="ac-section">
				<h2 class="ac-section__title">Teachers & classrooms</h2>
				<p class="ac-section__hint">Who teaches, what they author, and how their classes perform in ${i(r.scope.periodLabel||"the selected period")}${h?` \xB7 ${i(n?l.get(n)||"the selected organization":"all organizations")}`:""}.</p>
			</div>
			<section class="ac-panel">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title">Teacher activity</h3>
						<p class="ac-panel__subtitle">Active teachers first. \u201CAssessments\u201D counts formal results for exams the teacher created.</p>
					</div>
				</div>
				<div class="ac-panel__body ac-panel__body--flush">
					${q({columns:T,rows:x,empty:"No teacher account exists in the current scope."})}
				</div>
			</section>

			${Z({title:"Class performance",subtitle:"Mean formal score per class. The dashed line is the 10/20 pass mark; n is the number of attempts.",body:A})}

			<div class="ac-grid ac-grid--2">
				${Z({title:"Classes needing attention",subtitle:`Classes with at least ${_(g.minSampleForRank)} attempts and a low mean or low pass rate.`,body:G})}
				${Z({title:"Score distribution",subtitle:"Formal exam attempts per score band, /20.",body:le})}
			</div>

			<div class="ac-grid ac-grid--2">
				${Z({title:"Certification",subtitle:"Students who passed at least one formal exam vs. those who sat one and have not.",body:Ve})}
				${Z({title:"Learning activity",subtitle:`Completed attempts by mode, ${Se.granularity==="week"?"weekly":"daily"} over the period.`,body:ss})}
			</div>

			<div class="ac-section">
				<h2 class="ac-section__title">Content & participation</h2>
				<p class="ac-section__hint">The material behind the activity, and the live game surface.</p>
			</div>
			<div class="ac-grid ac-grid--3">
				${Z({title:"Question bank",subtitle:"Authored content in the current scope.",body:`<div class="ac-defs">
						<div class="ac-defs__item">
							<p class="ac-defs__term">Questions</p>
							<p class="ac-defs__desc">${_(u.totalQuestions.value)}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Active exams</p>
							<p class="ac-defs__desc">${_(u.activeExams.value)}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Categories used</p>
							<p class="ac-defs__desc">${_($a.categoriesWithQuestions)} of ${_($a.totalCategories)}</p>
						</div>
					</div>`})}
				${Z({title:"Participation",subtitle:"Students, not attempt counts.",body:`<div class="ac-defs">
						<div class="ac-defs__item">
							<p class="ac-defs__term">Active students</p>
							<p class="ac-defs__desc">${_(m.activeStudents.value)}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Participation rate</p>
							<p class="ac-defs__desc">${w.value==null?"\u2014":`${w.value}%`}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Needing attention</p>
							<p class="ac-defs__desc">${_(m.studentsNeedingAttention.value)}</p>
						</div>
						<p class="ac-empty__message" style="margin:8px 0 0;font-size:12px">${i(m.studentsNeedingAttention.rule)}</p>
					</div>`})}
				${Z({title:"Games & tournaments",subtitle:"Live snapshots \u2014 never date-filtered.",body:`<div class="ac-defs">
						<div class="ac-defs__item">
							<p class="ac-defs__term">Game lobbies waiting</p>
							<p class="ac-defs__desc">${_(ze.gameLobbies.value)}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Live games</p>
							<p class="ac-defs__desc">${_(ze.liveGames.value)}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Tournaments</p>
							<p class="ac-defs__desc">${_(ze.activeTournaments.value)} active of ${_(ze.totalTournaments.value)}</p>
						</div>
					</div>`})}
			</div>

			${Z({title:"How these numbers are computed",subtitle:"The console never guesses. Every metric names its population and its window.",body:ns})}`,_e(e,"period",$=>{if($==="custom"){let ge=prompt("From (YYYY-MM-DD)",new Date(Date.now()-2592e6).toISOString().slice(0,10));if(!ge)return;let Ta=prompt("To (YYYY-MM-DD)",new Date().toISOString().slice(0,10));if(!Ta)return;a.setPeriod("custom",{from:ge,to:Ta});return}a.setPeriod($)})}};var Ts=25,P={stream:"actions",search:"",action:"",entityType:"",eventType:"",outcome:"",severity:"",offset:0},yt={id:"audit",path:"/audit",title:"Activity & Audit",description:"Every administrative action and every authentication event, searchable and traceable.",permission:["platform.audit.read","school.audit.read"],async render(e,a){e.innerHTML=`
			${B({chips:`<div class="ac-chip-group" role="group" aria-label="Trail">
					<button type="button" class="ac-chip is-active" data-ac-stream="actions">Administrative actions</button>
					<button type="button" class="ac-chip" data-ac-stream="security">Security events</button>
				</div>`,fields:Oe({id:"ac-audit-search",placeholder:"Search the trail\u2026",value:P.search}),filters:"<span data-ac-audit-filters></span>",actions:'<button type="button" class="ac-btn" data-ac-refresh>Refresh</button>'})}
			<div class="ac-grid ac-grid--kpi" data-ac-audit-kpis></div>
			<section class="ac-panel" style="margin-top:16px">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title" data-ac-audit-title>Administrative actions</h3>
						<p class="ac-panel__subtitle" data-ac-audit-subtitle></p>
					</div>
				</div>
				<div class="ac-panel__body ac-panel__body--flush" data-ac-audit-body>
					${I(5)}
				</div>
			</section>
			<div class="ac-grid ac-grid--2" style="margin-top:16px" data-ac-audit-charts></div>`;let t=e.querySelector("[data-ac-audit-body]"),n=e.querySelector("[data-ac-audit-kpis]"),s=e.querySelector("[data-ac-audit-charts]"),o=e.querySelector("[data-ac-audit-filters]"),f;try{f=await k.get("console/audit/summary")}catch{f={summary:{},facets:{}}}let r=f.facets||{},p=f.summary||{};o.innerHTML=P.stream==="actions"?`${pe({id:"ac-audit-action",label:"Action",value:P.action,includeAll:!0,allLabel:"All actions",options:(r.actions||[]).map(u=>({value:u.value,label:`${u.label} (${u.count})`}))})}
					${pe({id:"ac-audit-entity",label:"Entity",value:P.entityType,includeAll:!0,allLabel:"All entities",options:(r.entityTypes||[]).map(u=>({value:u.value,label:`${u.label} (${u.count})`}))})}`:`${pe({id:"ac-audit-event",label:"Event",value:P.eventType,includeAll:!0,allLabel:"All events",options:(r.securityEventTypes||[]).map(u=>({value:u.value,label:u.label}))})}`,As(e,a);let l=p.security||{};n.innerHTML=[S({label:"Failed sign-ins",value:_(l.login_failure||0),tone:(l.login_failure||0)>0?"warning":"",tooltip:"Recorded failed authentication attempts. A concentration on one address or one username is the signal to investigate."}),S({label:"Successful sign-ins",value:_(l.login_success||0),tooltip:"Recorded successful authentication events."}),S({label:"Sessions revoked",value:_(l.session_revoked||0),tone:(l.session_revoked||0)>0?"warning":"",tooltip:"Sessions an administrator forcibly ended."}),S({label:"Denied actions",value:_(p.deniedActions||0),tone:(p.deniedActions||0)>0?"danger":"",tooltip:"Administrative actions that were refused. The refusal is itself recorded."}),S({label:"Password changes",value:_((l.password_change||0)+(l.password_reset||0)),tooltip:"Password changes and recovery-code resets recorded in the security trail."})].join("");let h;try{h=await k.get("console/audit",{stream:P.stream,search:P.search||void 0,action:P.stream==="actions"&&P.action||void 0,entityType:P.stream==="actions"&&P.entityType||void 0,eventType:P.stream==="security"&&P.eventType||void 0,limit:Ts,offset:P.offset})}catch(u){t.innerHTML=O({message:u.message});return}e.querySelector("[data-ac-audit-title]").textContent=P.stream==="actions"?"Administrative actions":"Security events",e.querySelector("[data-ac-audit-subtitle]").textContent=P.stream==="actions"?"Every administrative change, with the outcome it produced.":"Every authentication and access-control event, with the source address.",t.innerHTML=P.stream==="actions"?q({columns:[{key:"occurredAt",label:"When",render:u=>`<span title="${i(N(u.occurredAt))}">${i(N(u.occurredAt))}</span>`},{key:"actorName",label:"Actor",render:u=>u.actorName?`<span class="ac-table__primary">${i(u.actorName)}</span><br><span class="ac-table__muted">${i(u.actorRole||"")}</span>`:'<span class="ac-table__muted">system</span>'},{key:"action",label:"Action",render:u=>`<span class="ac-badge">${i(u.actionLabel)}</span>`},{key:"entityType",label:"Entity",render:u=>`${i(u.entityTypeLabel)}<br><span class="ac-table__muted">${i(u.entityId)}</span>`},{key:"outcome",label:"Outcome",render:u=>`<span class="ac-badge ac-badge--${u.outcome==="success"?"success":u.outcome==="denied"?"danger":"warning"}">${i(u.outcome)}</span>`},{key:"severity",label:"Severity",render:u=>`<span class="ac-badge ac-badge--${u.severity==="critical"?"danger":u.severity==="warning"?"warning":""}">${i(u.severity)}</span>`},{key:"schoolName",label:"Organization",render:u=>i(u.schoolName||"\u2014")}],rows:h.data,empty:"No administrative action matches the current filters.",rowClass:u=>u.outcome==="denied"?"ac-row--denied":""}):q({columns:[{key:"occurredAt",label:"When",render:u=>`<span title="${i(N(u.occurredAt))}">${i(N(u.occurredAt))}</span>`},{key:"typeLabel",label:"Event",render:u=>`<span class="ac-badge">${i(u.typeLabel)}</span>`},{key:"username",label:"Account",render:u=>u.userName?`<span class="ac-table__primary">${i(u.userName)}</span><br><span class="ac-table__muted">${i(u.username||"")}</span>`:i(u.username||"\u2014")},{key:"reason",label:"Reason",render:u=>i(u.reason||"\u2014")},{key:"outcome",label:"Outcome",render:u=>`<span class="ac-badge ac-badge--${u.outcome==="success"?"success":u.outcome==="denied"?"danger":"warning"}">${i(u.outcome)}</span>`},{key:"severity",label:"Severity",render:u=>`<span class="ac-badge ac-badge--${u.severity==="critical"?"danger":u.severity==="warning"?"warning":""}">${i(u.severity)}</span>`},{key:"ip",label:"Source",render:u=>i(u.ip||"\u2014")}],rows:h.data,empty:"No security event matches the current filters."}),t.insertAdjacentHTML("beforeend",ye({total:h.total,limit:h.limit,offset:h.offset,onPage:u=>{P.offset=u,a.rerender()}}));let c=p.topFailureSources||{};c.byIp?.length||c.byUsername?.length?s.innerHTML=`
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles">
							<h3 class="ac-panel__title">Failed sign-in sources</h3>
							<p class="ac-panel__subtitle">Top source addresses by attempt count. A concentration may indicate credential stuffing.</p>
						</div>
					</div>
					<div class="ac-panel__body">
						${Q({rows:(c.byIp||[]).map(u=>({label:u.ip,value:u.count})),value:"value",label:u=>u.label,display:u=>_(u),tone:"danger",ariaLabel:"Failed sign-ins by source address"})}
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
						${Q({rows:(c.byUsername||[]).map(u=>({label:u.username,value:u.count})),value:"value",label:u=>u.label,display:u=>_(u),tone:"warning",ariaLabel:"Failed sign-ins by attempted username"})}
					</div>
				</section>`:s.innerHTML="",e.querySelectorAll("[data-ac-stream]").forEach(u=>{u.addEventListener("click",()=>{P.stream=u.dataset.acStream,P.offset=0,a.rerender()})});let m=e.querySelector("#ac-audit-search"),g=null;m.addEventListener("input",()=>{window.clearTimeout(g),g=window.setTimeout(()=>{P.search=m.value.trim(),P.offset=0,a.rerender()},320)}),e.querySelector("[data-ac-refresh]").addEventListener("click",()=>a.rerender())}};function As(e,a){let t=e.querySelector("#ac-audit-action");t&&t.addEventListener("change",o=>{P.action=o.target.value,P.offset=0,a.rerender()});let n=e.querySelector("#ac-audit-entity");n&&n.addEventListener("change",o=>{P.entityType=o.target.value,P.offset=0,a.rerender()});let s=e.querySelector("#ac-audit-event");s&&s.addEventListener("change",o=>{P.eventType=o.target.value,P.offset=0,a.rerender()})}var Ls=[{key:"15",label:"15 min"},{key:"60",label:"1 hour"},{key:"360",label:"6 hours"},{key:"1440",label:"24 hours"}],da={minutes:"60"},_t={id:"health",path:"/health",title:"System Health & Operations",description:"Service availability, error trends, latency, database and storage \u2014 measured, not asserted.",permission:["platform.health.read","school.health.read"],async render(e,a){e.innerHTML=`
			${B({chips:`<div class="ac-chip-group" role="group" aria-label="Window">
					${Ls.map(c=>`<button type="button" class="ac-chip${da.minutes===c.key?" is-active":""}" data-ac-window="${c.key}">${i(c.label)}</button>`).join("")}
				</div>`,actions:'<button type="button" class="ac-btn" data-ac-refresh>Refresh</button>'})}
			<div data-ac-health><div class="ac-skeleton-stack" aria-busy="true">
				<div class="ac-skeleton" style="width:45%"></div>
				<div class="ac-skeleton" style="width:100%"></div>
			</div></div>`;let t;try{t=await k.get("console/health",{minutes:da.minutes})}catch(c){e.querySelector("[data-ac-health]").innerHTML=O({message:c.message});return}let n=t.data,s=n.sections.api,o=n.sections.latency,f=n.sections.database,r=n.sections.realtime,p=n.sections.storage,l=n.sections.scheduled,h=s.availabilityPercent==null?"":s.availabilityPercent>=99?"success":s.availabilityPercent>=95?"warning":"danger";e.querySelector("[data-ac-health]").innerHTML=`
			<div class="ac-grid ac-grid--kpi">
				${S({label:"API availability",value:s.availabilityPercent==null?"\u2014":`${s.availabilityPercent.toFixed(1)}%`,note:`${_(s.totalCalls)} requests in the window`,tone:h,tooltip:n.meta.notes.availability})}
				${S({label:"Server error rate",value:s.serverErrorRatePercent==null?"\u2014":`${s.serverErrorRatePercent.toFixed(1)}%`,note:`${_(s.serverErrors??0)} server errors`,tone:s.serverErrorRatePercent==null?"":s.serverErrorRatePercent>=1?"danger":s.serverErrorRatePercent>0?"warning":"success",tooltip:"Share of API requests in the window that failed with a 5xx status. This is the measure of service health: a 4xx is a client mistake, not an outage."})}
				${S({label:"Error rate (all)",value:s.errorRatePercent==null?"\u2014":`${s.errorRatePercent.toFixed(1)}%`,note:`${_(s.errors)} failed requests`,tone:s.errorRatePercent==null?"":s.errorRatePercent>=20?"warning":"",tooltip:"Share of API requests in the window that returned a 4xx or 5xx status. A high value here with a low server error rate usually means rejected or expired requests, not an outage."})}
				${S({label:"p95 latency",value:o.available&&o.p95!=null?`${o.p95} ms`:"\u2014",note:o.available&&o.p50!=null?`p50 ${o.p50} ms \xB7 p99 ${o.p99} ms`:"no requests in the window",tone:o.available&&o.p95!=null&&o.p95>1e3?"warning":"",tooltip:n.meta.notes.latency})}
				${S({label:"Database",value:f.available?"Reachable":"Unreachable",note:f.available?`${f.roundTripMs} ms round trip`:f.error||"",tone:f.available?"success":"danger",tooltip:"A live COUNT query against the configured database, plus the row counts of the principal tables."})}
				${S({label:"Uptime",value:D(new Date(n.meta.process.startedAt)),note:`process started ${N(n.meta.process.startedAt)}`,tooltip:"Process uptime. The request log resets with the process, so availability cannot be measured across a restart."})}
				${S({label:"Storage used",value:p.available?`${p.megabytes} MB`:"\u2014",note:p.available?`${_(p.files)} files in uploads`:p.error||"",tooltip:n.meta.notes.storage})}
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
						${o.available&&o.statuses?.length?Q({rows:o.statuses.map(c=>({label:c.bucket,value:c.count})),value:"value",label:c=>c.label,display:c=>_(c),tone:c=>c.label==="5xx"?"danger":c.label==="4xx"?"warning":"success",ariaLabel:"Response status distribution"}):R({title:"No requests recorded",message:"The request log is empty for this window. It is process-local and starts empty after a restart."})}
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
								<p class="ac-defs__desc">${p.available?`${p.megabytes} MB`:"\u2014"}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Files</p>
								<p class="ac-defs__desc">${p.available?_(p.files):"\u2014"}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Realtime status</p>
								<p class="ac-defs__desc">${i(r.status||"unknown")}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Tracked connections</p>
								<p class="ac-defs__desc">${_(r.trackedConnections??0)}</p>
							</div>
						</div>
						<p class="ac-empty__message" style="margin:14px 0 0;font-size:12px">${i(p.available?p.directory:p.error||"")}</p>
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
					${q({columns:[{key:"method",label:"Method"},{key:"path",label:"Path",render:c=>`<code>${i(c.path)}</code>`},{key:"calls",label:"Calls",align:"right"},{key:"errors",label:"Errors",align:"right"},{key:"errorRatePercent",label:"Error rate",align:"right",render:c=>`<span class="ac-badge ${c.errorRatePercent>=5?"ac-badge--danger":c.errorRatePercent>0?"ac-badge--warning":"ac-badge--success"}">${c.errorRatePercent.toFixed(1)}%</span>`},{key:"averageMs",label:"Avg (ms)",align:"right"}],rows:s.endpoints||[],empty:"No API traffic was recorded in this window."})}
				</div>
			</section>

			<div class="ac-section">
				<h2 class="ac-section__title">Scheduled work</h2>
				<p class="ac-section__hint">${i(l.note||"")}</p>
			</div>
			<section class="ac-panel">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title">Background tasks</h3>
						<p class="ac-panel__subtitle">Each task runs on a fixed interval inside the server process.</p>
					</div>
				</div>
				<div class="ac-panel__body ac-panel__body--flush">
					${q({columns:[{key:"name",label:"Task",render:c=>`<span class="ac-table__primary">${i(c.name)}</span>`},{key:"intervalMinutes",label:"Interval",align:"right",render:c=>`${c.intervalMinutes} min`},{key:"description",label:"Purpose"}],rows:l.tasks||[],empty:"No scheduled task is registered."})}
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
							${q({columns:[{key:"level",label:"Level",render:c=>`<span class="ac-badge ac-badge--${c.level==="error"||c.level==="fatal"?"danger":c.level==="warn"?"warning":"info"}">${i(c.level)}</span>`},{key:"message",label:"Message"},{key:"source",label:"Source",render:c=>`<code>${i(c.source)}</code>`},{key:"count",label:"Count",align:"right"},{key:"lastAt",label:"Last seen",render:c=>i(N(c.lastAt))}],rows:s.repeatedLogs,empty:"No repeated log entries in this window."})}
						</div>
					</section>`:""}`,e.querySelectorAll("[data-ac-window]").forEach(c=>{c.addEventListener("click",()=>{da.minutes=c.dataset.acWindow,a.rerender()})}),e.querySelector("[data-ac-refresh]").addEventListener("click",()=>a.rerender())}};var wt={general:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',organization:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6"/></svg>',profile:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',realtime:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14"/></svg>',presets:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 6.2L21 10l-5.4 4 1.6 6.6L12 17l-5.2 3.6L8.4 14 3 10l6.6-1.8z"/></svg>',access:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>',teaching:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/></svg>',data:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.7-4 3-9 3s-9-1.3-9-3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/></svg>',setup:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',ai:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l1.9 5.1L19 9l-5.1 1.9L12 16l-1.9-5.1L5 9l5.1-1.9L12 2z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z"/></svg>',roles:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',deployment:'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z"/></svg>'};function xt({sections:e,active:a,collapsed:t=!1}){let n=e.map(s=>{let o=wt[s.icon]||wt.general,f=s.badge==null?"":`<span class="ac-section-menu__badge">${i(String(s.badge))}</span>`;return`<button type="button" class="ac-section-menu__item${s.id===a?" is-active":""}" data-ac-section="${i(s.id)}" title="${i(s.label)}" aria-current="${s.id===a?"true":"false"}">
				<span class="ac-section-menu__icon">${o}</span>
				<span class="ac-section-menu__label">${i(s.label)}</span>
				${f}
			</button>`}).join("");return`<nav class="ac-section-menu${t?" ac-section-menu--collapsed":""}" aria-label="Settings sections">
		<div class="ac-section-menu__head">
			<span>Sections</span>
			<button type="button" class="ac-section-menu__toggle" data-ac-menu-toggle aria-label="${t?"Expand the section menu":"Collapse the section menu"}" title="${t?"Expand":"Collapse"}">${t?"\xBB":"\xAB"}</button>
		</div>
		<div class="ac-section-menu__list">${n}</div>
	</nav>`}function kt(e,{onSelect:a}){e.querySelectorAll("[data-ac-section]").forEach(n=>{n.addEventListener("click",()=>a(n.dataset.acSection))});let t=e.querySelector("[data-ac-menu-toggle]");t&&t.addEventListener("click",()=>{let n=e.querySelector(".ac-section-menu"),s=e.querySelector(".ac-split");if(!n||!s)return;let o=!n.classList.contains("ac-section-menu--collapsed");n.classList.toggle("ac-section-menu--collapsed",o),s.classList.toggle("ac-split--collapsed",o),t.textContent=o?"\xBB":"\xAB",t.setAttribute("aria-label",o?"Expand the section menu":"Collapse the section menu");try{localStorage.setItem("quizConsoleSettingsMenuCollapsed",o?"1":"0")}catch{}})}function $t(){try{return localStorage.getItem("quizConsoleSettingsMenuCollapsed")==="1"}catch{return!1}}var Cs=[{value:"primaire",label:"Primaire (Primary)"},{value:"college",label:"Coll\xE8ge (Middle School)"},{value:"lycee",label:"Lyc\xE9e (High School)"},{value:"autre",label:"Autre (Other)"}],St=[{key:"primaryColor",label:"Primary colour",type:"color",hint:"Buttons, links and highlights across the classroom surface."},{key:"secondaryColor",label:"Secondary colour",type:"color",hint:"The darker companion of the primary colour."},{key:"backgroundColor",label:"Background colour",type:"color",hint:"The page background of the classroom surface."},{key:"textColor",label:"Text colour",type:"color",hint:"The default body text colour."},{key:"inputFocusColor",label:"Input focus colour",type:"color",hint:"The ring shown around a focused input."}],Tt=[{key:"totalQuestions",label:"Questions per quiz",type:"number",hint:"The default length offered when a teacher creates a quiz."},{key:"timeLimit",label:"Time limit (seconds)",type:"number",hint:"The default countdown of a quiz."},{key:"penalty",label:"Penalty per wrong answer",type:"number",hint:"Points deducted for a wrong answer."}],At=[{key:"welcomeTitle",label:"Welcome title",hint:"Shown above the quiz on the student workspace."},{key:"welcomeMessage",label:"Welcome message",hint:"The line under the welcome title."}];async function Lt(e){let[a,t]=await Promise.all([k.get("school/profile/full"),ue()]),n=a||{},s=r=>t.get(r)?.value??"",o=[C({title:"Organization information",subtitle:"How this organization appears on the sign-in page, in the classroom header and on the generated documents.",body:`<div class="ac-field-grid">
					${L({id:"set-school-name",label:"Name",value:n.name??"",full:!0,hint:"Shown on the sign-in page and on every generated document."})}
					${U({id:"set-school-type",label:"Type",options:Cs,value:n.school_type??""})}
					${L({id:"set-school-year",label:"Academic year",value:n.school_year??"",placeholder:"2025-2026",hint:"Also names the year archive."})}
					${L({id:"set-school-city",label:"City",value:n.city??""})}
					${L({id:"set-school-phone",label:"Phone",value:n.phone??""})}
					${L({id:"set-school-email",label:"Email",value:n.email??""})}
					${L({id:"set-school-address",label:"Address",value:n.address??"",full:!0})}
					${L({id:"set-school-logo",label:"Logo URL",value:n.logo_url??"",full:!0,hint:"An absolute URL or a /uploads/\u2026 path."})}
				</div>
				<div class="ac-toolbar" style="margin-bottom:0">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-save-org>Save organization</button>
						<span class="ac-table__muted" data-ac-org-status></span>
					</div>
				</div>`}),C({title:"Quiz defaults",subtitle:"The starting values a teacher gets when creating a quiz.",body:`<div class="ac-field-grid">
					${Tt.map(r=>L({id:`set-${r.key}`,label:r.label,value:s(r.key),type:r.type,hint:r.hint})).join("")}
				</div>
				<div class="ac-toolbar" style="margin-bottom:0">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-save-quiz>Save quiz defaults</button>
						<span class="ac-table__muted" data-ac-quiz-status></span>
					</div>
				</div>`}),C({title:"Appearance",subtitle:"The colours the classroom surface paints itself with.",body:`<div class="ac-field-grid">
					${St.map(r=>L({id:`set-${r.key}`,label:r.label,value:s(r.key)||"#2563eb",type:"color",hint:r.hint})).join("")}
				</div>
				<div class="ac-field-grid">
					${At.map(r=>L({id:`set-${r.key}`,label:r.label,value:s(r.key),hint:r.hint})).join("")}
				</div>
				<div class="ac-toolbar" style="margin-bottom:0">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-save-appearance>Save appearance</button>
						<span class="ac-table__muted" data-ac-appearance-status></span>
					</div>
				</div>`})].join("");function f(r){let p=h=>r.querySelector(h);r.querySelector("[data-ac-save-org]")?.addEventListener("click",async()=>{let h=p("[data-ac-org-status]"),c=m=>r.querySelector(`#${m}`)?.value??"";try{await k.put("school/profile",{name:c("set-school-name"),school_type:c("set-school-type"),school_year:c("set-school-year"),city:c("set-school-city"),phone:c("set-school-phone"),email:c("set-school-email"),address:c("set-school-address"),logo_url:c("set-school-logo")}),h&&(h.textContent="Saved."),y("Organization information saved.","success")}catch(m){h&&(h.textContent=m.message),y(m.message,"error")}});let l=async(h,c,m,g)=>{r.querySelector(h)?.addEventListener("click",async()=>{let u=p(c);try{for(let w of m){let d=r.querySelector(`#set-${w}`);if(!d)continue;let b=d.value,x=Number(b);await V(w,d.type==="number"&&b!==""?x:b)}u&&(u.textContent="Saved."),y(g,"success")}catch(w){u&&(u.textContent=w.message),y(w.message,"error")}})};l("[data-ac-save-quiz]","[data-ac-quiz-status]",Tt.map(h=>h.key),"Quiz defaults saved."),l("[data-ac-save-appearance]","[data-ac-appearance-status]",[...St,...At].map(h=>h.key),"Appearance saved.")}return{markup:o,bind:f}}var qs=[{value:"",label:"\u2014"},{value:"Mr",label:"Mr"},{value:"Mme",label:"Mme"},{value:"Mlle",label:"Mlle"},{value:"Dr",label:"Dr"}];async function Ct(e){let t=(e.session||{}).user||{},n=[C({title:"My profile",subtitle:"Your own account information. The role, the status and the class assignments are managed by an administrator.",body:`<div class="ac-field-grid">
					${U({id:"set-profile-title",label:"Title",options:qs,value:t.title??""})}
					${L({id:"set-profile-name",label:"Full name",value:t.name??""})}
					${L({id:"set-profile-email",label:"Email",value:t.email??"",type:"email"})}
					${L({id:"set-profile-phone",label:"Phone",value:t.phone??"",type:"tel"})}
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
				</div>`}),C({title:"Change my password",subtitle:"The current password is required. Every other session of this account ends when the password changes.",body:`<div class="ac-field-grid">
					${L({id:"set-profile-current",label:"Current password",type:"password",full:!0})}
					${L({id:"set-profile-new",label:"New password",type:"password",hint:"At least 8 characters."})}
					${L({id:"set-profile-confirm",label:"Confirm new password",type:"password"})}
				</div>
				<div class="ac-toolbar" style="margin-bottom:0">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-change-password>Update password</button>
						<span class="ac-table__muted" data-ac-password-status></span>
					</div>
				</div>`})].join("");function s(o){o.querySelector("[data-ac-save-profile]")?.addEventListener("click",async()=>{let f=o.querySelector("[data-ac-profile-status]"),r=p=>o.querySelector(`#${p}`)?.value??"";try{await k.patch("users/me",{title:r("set-profile-title"),name:r("set-profile-name"),email:r("set-profile-email"),phone:r("set-profile-phone")}),f&&(f.textContent="Saved."),y("Profile saved.","success")}catch(p){f&&(f.textContent=p.message),y(p.message,"error")}}),o.querySelector("[data-ac-change-password]")?.addEventListener("click",async()=>{let f=o.querySelector("[data-ac-password-status]"),r=o.querySelector("#set-profile-current")?.value??"",p=o.querySelector("#set-profile-new")?.value??"",l=o.querySelector("#set-profile-confirm")?.value??"";if(!r||!p){y("The current and the new password are both required.","error");return}if(p!==l){y("The two new passwords do not match.","error");return}if(p.length<8){y("The new password must be at least 8 characters.","error");return}try{await k.post("auth/change-password",{oldPassword:r,newPassword:p}),o.querySelector("#set-profile-current").value="",o.querySelector("#set-profile-new").value="",o.querySelector("#set-profile-confirm").value="",f&&(f.textContent="The password was changed."),y("Password changed. Your other sessions were signed out.","success")}catch(h){f&&(f.textContent=h.message),y(h.message,"error")}})}return{markup:n,bind:s}}async function qt(e){let[a,t,n]=await Promise.all([k.get("console/users?limit=500"),k.get("profile-requests?status=pending").catch(()=>[]),k.get("account-requests?status=pending").catch(()=>[])]),s=Array.isArray(a?.data)?a.data:[],o=Array.isArray(t)?t:[],f=Array.isArray(n)?n:[],r=m=>s.filter(g=>g.role===m).length,p=s.filter(m=>!m.lastLogin).length,l=s.filter(m=>m.status==="suspended").length,h=[C({title:"Users & access",subtitle:"Who can reach this platform, and what they may do.",body:`<div class="ac-grid ac-grid--kpi" style="margin-bottom:16px">
					${S({label:"Teachers",value:String(r("teacher")),note:"accounts"})}
					${S({label:"Students",value:String(r("student")),note:"accounts"})}
					${S({label:"Administrators",value:String(r("admin")+r("super_admin")),note:"accounts"})}
					${S({label:"Never signed in",value:String(p),note:"provisioned, unused",tone:p>0?"warning":""})}
					${S({label:"Suspended",value:String(l),note:"no access",tone:l>0?"warning":""})}
				</div>
				<div class="ac-quick-actions">
					<a class="ac-quick-action" href="#/users/teachers">Manage teachers</a>
					<a class="ac-quick-action" href="#/users/students">Manage students</a>
					<a class="ac-quick-action" href="#/users/administrators">Manage administrators</a>
					<a class="ac-quick-action" href="#/audit?stream=security">Review access events</a>
				</div>`}),C({title:"Account requests",subtitle:"New accounts registered from a browser. They cannot sign in until a request is approved.",body:f.length?q({columns:[{key:"full_name",label:"Requested account",render:m=>`<span class="ac-table__primary">${v(m.full_name||"")}</span><br><span class="ac-table__muted">${v(m.username||"")}${m.student_number?` \xB7 #${v(m.student_number)}`:""}</span>`},{key:"class_name",label:"Class",render:m=>v(m.class_name||"\u2014")},{key:"note",label:"Note",render:m=>v(m.note||"\u2014")},{key:"actions",label:"",align:"right",render:m=>`<button type="button" class="ac-btn ac-btn--sm" data-ac-approve-account="${v(m.id)}">Approve</button> <button type="button" class="ac-btn ac-btn--sm" data-ac-reject-account="${v(m.id)}">Reject</button>`}],rows:f}):'<p class="ac-empty__message">No account request is waiting.</p>'}),C({title:"Profile change requests",subtitle:"A student asking for a correction to their record.",body:o.length?q({columns:[{key:"user_id",label:"Account",render:m=>`<a href="#/users/${v(m.user_id)}" class="ac-table__primary">${v(m.user_id)}</a>`},{key:"changes",label:"Requested change",render:m=>v(Es(m.changes_json))},{key:"note",label:"Note",render:m=>v(m.note||"\u2014")},{key:"actions",label:"",align:"right",render:m=>`<button type="button" class="ac-btn ac-btn--sm" data-ac-approve-profile="${v(m.id)}">Approve</button> <button type="button" class="ac-btn ac-btn--sm" data-ac-reject-profile="${v(m.id)}">Reject</button>`}],rows:o}):'<p class="ac-empty__message">No profile change request is waiting.</p>'})].join("");function c(m){let g=async(u,w,d,b)=>{try{await k.post(`${u}/${encodeURIComponent(w)}/${d?"approve":"reject"}`,{note:null}),y(`${b} ${d?"approved":"rejected"}.`,"success"),e.rerender()}catch(x){y(x.message,"error")}};m.querySelectorAll("[data-ac-approve-account]").forEach(u=>{u.addEventListener("click",()=>g("account-requests",u.dataset.acApproveAccount,!0,"The request was"))}),m.querySelectorAll("[data-ac-reject-account]").forEach(u=>{u.addEventListener("click",()=>g("account-requests",u.dataset.acRejectAccount,!1,"The request was"))}),m.querySelectorAll("[data-ac-approve-profile]").forEach(u=>{u.addEventListener("click",()=>g("profile-requests",u.dataset.acApproveProfile,!0,"The request was"))}),m.querySelectorAll("[data-ac-reject-profile]").forEach(u=>{u.addEventListener("click",()=>g("profile-requests",u.dataset.acRejectProfile,!1,"The request was"))})}return{markup:h,bind:c}}function Es(e){if(!e)return"\u2014";try{let a=typeof e=="string"?JSON.parse(e):e,t=Object.entries(a||{});return t.length?t.map(([n,s])=>`${n}: ${s}`).join(" \xB7 "):"\u2014"}catch{return String(e)}}var Et="teacherAccess",ha=4,pa=[{key:"overview",label:"Overview",hint:"The teacher dashboard."},{key:"questions",label:"Questions",hint:"The question bank."},{key:"subjects",label:"Subjects",hint:"The subject and category tree."},{key:"exams",label:"Exams",hint:"Creating and running exams."},{key:"classes",label:"Classes",hint:"The classes and their students."},{key:"games",label:"Games",hint:"The game arena."},{key:"kidsGames",label:"Kids Games",hint:"The Kids arena."},{key:"results",label:"Results",hint:"The results of the attempts."}],ua=[{key:"general",label:"General"},{key:"profile",label:"My profile"},{key:"presets",label:"Presets"},{key:"data",label:"Data"},{key:"realtime",label:"Realtime"},{key:"ai-generation",label:"AI generation"},{key:"users",label:"Users"},{key:"games",label:"Game presets"}];function Fe(){return{rev:ha,tabs:{overview:!0,questions:!0,subjects:!0,exams:!0,classes:!0,games:!0,kidsGames:!0,results:!0,notifications:!0,activity:!1},settings:!0,settingsTabs:{general:!0,profile:!0,presets:!0,data:!0,realtime:!0,"ai-generation":!0,users:!0,games:!0}}}function zs(e){let a=Fe();if(!e)return a;let t=e;if(typeof e=="string")try{t=JSON.parse(e)}catch{return a}return!t||typeof t!="object"?a:{rev:ha,tabs:{...a.tabs,...t.tabs||{}},settings:t.settings===void 0?a.settings:!!t.settings,settingsTabs:{...a.settingsTabs,...t.settingsTabs||{}}}}async function zt(){let e=await ue(),a=zs(e.get(Et)?.value),t=[C({title:"Teacher access control",subtitle:"Choose which dashboard tabs and settings tabs a teacher may reach in the classroom surface.",body:`<h4 class="ac-section-panel__title" style="margin:0 0 8px">Dashboard tabs</h4>
				${pa.map(s=>X({id:`set-teacher-tab-${s.key}`,label:s.label,hint:s.hint,checked:a.tabs[s.key]!==!1})).join("")}
				${X({id:"set-teacher-settings",label:"The settings modal",hint:"Whether a teacher may open the settings dialog at all.",checked:a.settings!==!1})}
				<h4 class="ac-section-panel__title" style="margin:20px 0 8px">Settings tabs</h4>
				${ua.map(s=>X({id:`set-teacher-settings-${s.key}`,label:s.label,checked:a.settingsTabs[s.key]!==!1})).join("")}
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
				</div>`})].join("");function n(s){let o=s.querySelector("[data-ac-teacher-access-status]"),f=()=>{let p={rev:ha,tabs:{...Fe().tabs},settings:s.querySelector("#set-teacher-settings")?.getAttribute("aria-checked")==="true",settingsTabs:{...Fe().settingsTabs}};for(let l of pa){let h=s.querySelector(`#set-teacher-tab-${l.key}`);h&&(p.tabs[l.key]=h.getAttribute("aria-checked")==="true")}for(let l of ua){let h=s.querySelector(`#set-teacher-settings-${l.key}`);h&&(p.settingsTabs[l.key]=h.getAttribute("aria-checked")==="true")}return p};s.querySelectorAll(".ac-switch").forEach(p=>{p.addEventListener("click",()=>{let l=p.getAttribute("aria-checked")==="true"?"false":"true";p.setAttribute("aria-checked",l)})});let r=async p=>{try{await V(Et,JSON.stringify(p)),o&&(o.textContent="Saved."),y("Teacher access saved.","success")}catch(l){o&&(o.textContent=l.message),y(l.message,"error")}};s.querySelector("[data-ac-save-teacher-access]")?.addEventListener("click",()=>{r(f())}),s.querySelector("[data-ac-reset-teacher-access]")?.addEventListener("click",async()=>{let p=Fe();for(let h of pa){let c=s.querySelector(`#set-teacher-tab-${h.key}`);c&&c.setAttribute("aria-checked",p.tabs[h.key]?"true":"false")}let l=s.querySelector("#set-teacher-settings");l&&l.setAttribute("aria-checked",p.settings?"true":"false");for(let h of ua){let c=s.querySelector(`#set-teacher-settings-${h.key}`);c&&c.setAttribute("aria-checked",p.settingsTabs[h.key]?"true":"false")}await r(p)})}return{markup:t,bind:n}}var qe=null,oe=null;function Ps(){return window.io?Promise.resolve(window.io):new Promise((e,a)=>{let t=document.createElement("script");t.src="/vendor/socket.io.min.js",t.async=!0,t.onload=()=>{window.io?e(window.io):a(new Error("The realtime client could not be loaded."))},t.onerror=()=>a(new Error("The realtime client could not be loaded.")),document.head.appendChild(t)})}async function Pt({force:e=!1}={}){return oe&&oe.connected&&!e?oe:(qe&&!e||(qe=(async()=>{try{let a=await Ps();return oe&&(oe.disconnect(),oe=null),oe=a({auth:{token:Je()},transports:["websocket","polling"],reconnectionAttempts:5,timeout:8e3}),oe}catch{return oe=null,null}finally{qe=null}})()),qe)}function Mt(e,a=8e3){return e?e.connected?Promise.resolve(!0):new Promise(t=>{let n=setTimeout(()=>{e.off("connect",s),t(!1)},a),s=()=>{clearTimeout(n),t(!0)};e.on("connect",s)}):Promise.resolve(!1)}async function Rt(e){let[a,t]=await Promise.all([ue(),k.get("devices").catch(()=>[])]),n=r=>{let p=a.get(r)?.value??"";return p==="false"?!1:p==="true"?!0:p},s=Array.isArray(t)?t:[],o=[C({title:"How the realtime channel works here",subtitle:"There is no second server to run.",body:`<div class="ac-alert ac-alert--info">
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
				</div>`}),C({title:"Realtime behaviour",subtitle:"How much this installation pushes to the connected devices.",body:`${X({id:"set-realtime-enabled",label:"Use this session for realtime broadcasts",hint:"Whether this administration session broadcasts and lists the connected devices.",checked:n("realtimeEnabled")!==!1})}
				${X({id:"set-realtime-autosync",label:"Auto-sync results",hint:"Automatically push the quiz results to the connected devices.",checked:n("autoSync")!==!1})}
				${X({id:"set-realtime-broadcast",label:"Broadcast updates",hint:"Push question and exam updates to the connected devices.",checked:n("broadcastUpdates")!==!1})}
				${X({id:"set-realtime-autosync-questions",label:"Auto-sync questions (training categories)",hint:"Periodically push the questions of the training-enabled categories to the connected devices.",checked:n("autoSyncQuestions")!==!1})}
				<div class="ac-field-grid" style="margin-top:14px">
					${L({id:"set-realtime-interval",label:"Sync interval (seconds)",type:"number",value:n("realtimeSyncInterval")||5,hint:"How often the data is synchronised between the devices."})}
					${L({id:"set-realtime-host",label:"Server host (fallback for the classroom panel)",value:n("serverHost")||"",placeholder:"http://192.168.1.5:3000",hint:"The realtime channel itself always connects to the address this page was served from. This value is only the fallback the classroom panel reads."})}
				</div>
				<div class="ac-toolbar" style="margin-bottom:0">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-save-realtime>Save realtime settings</button>
						<span class="ac-table__muted" data-ac-realtime-status></span>
					</div>
				</div>`}),C({title:"Recovery code",subtitle:'The code the "forgot password" panel on the sign-in page accepts. It is stored as a server-side hash.',body:`<div class="ac-field-grid">
					${L({id:"set-recovery-code",label:"New recovery code",type:"password",full:!0,hint:"Leave it blank to keep the existing code. The code itself is never sent back to a browser."})}
				</div>
				<div class="ac-toolbar" style="margin-bottom:0">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-save-recovery>Save recovery code</button>
						<span class="ac-table__muted" data-ac-recovery-status></span>
					</div>
				</div>`}),C({title:"Connected devices",subtitle:"The machines currently connected to this installation.",actions:'<button type="button" class="ac-btn ac-btn--sm" data-ac-realtime-refresh>Refresh</button>',body:`<div class="ac-toolbar" style="margin-bottom:12px">
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
					${s.length?Nt(s):'<p class="ac-empty__message">No device has registered with this installation yet.</p>'}
				</div>`})].join("");function f(r){let p=r.querySelector("[data-ac-realtime-status]"),l=r.querySelector("[data-ac-realtime-connection]"),h=r.querySelector("[data-ac-realtime-devices]");r.querySelectorAll(".ac-switch").forEach(d=>{d.addEventListener("click",()=>{let b=d.getAttribute("aria-checked")==="true"?"false":"true";d.setAttribute("aria-checked",b)})});let c=d=>r.querySelector(`#${d}`)?.getAttribute("aria-checked")==="true";r.querySelector("[data-ac-save-realtime]")?.addEventListener("click",async()=>{try{await V("realtimeEnabled",String(c("set-realtime-enabled"))),await V("autoSync",String(c("set-realtime-autosync"))),await V("broadcastUpdates",String(c("set-realtime-broadcast"))),await V("autoSyncQuestions",String(c("set-realtime-autosync-questions")));let d=r.querySelector("#set-realtime-interval")?.value??"5";await V("realtimeSyncInterval",String(Math.max(1,Number(d)||5))),await V("serverHost",r.querySelector("#set-realtime-host")?.value??""),p&&(p.textContent="Saved."),y("Realtime settings saved.","success")}catch(d){p&&(p.textContent=d.message),y(d.message,"error")}}),r.querySelector("[data-ac-save-recovery]")?.addEventListener("click",async()=>{let d=r.querySelector("[data-ac-recovery-status]"),b=r.querySelector("#set-recovery-code")?.value?.trim()??"";if(!b){y("Type a new recovery code, or leave the field alone to keep the current one.","error");return}try{await k.post("auth/recover/set",{code:b}),r.querySelector("#set-recovery-code").value="",d&&(d.textContent="Saved."),y("Recovery code saved.","success")}catch(x){d&&(d.textContent=x.message),y(x.message,"error")}});let m=!1,g=async({force:d=!1}={})=>{l&&(l.textContent="Connecting\u2026");let b=await Pt({force:d});return b?await Mt(b)?(b.emit("identify",{role:"admin"}),l&&(l.textContent="Connected."),b):(l&&(l.textContent="Could not connect to the realtime channel."),null):(l&&(l.textContent="The realtime client could not be loaded."),null)},u=async()=>{try{let d=await k.get("devices"),b=Array.isArray(d)?d:[],x=m?b.filter(T=>T.status==="active"||T.online):b;h&&(h.innerHTML=x.length?Nt(x):'<p class="ac-empty__message">No device matches the current filter.</p>')}catch(d){h&&(h.innerHTML=`<p class="ac-empty__message">${v(d.message)}</p>`)}};r.querySelector("[data-ac-realtime-refresh]")?.addEventListener("click",u),r.querySelector("[data-ac-realtime-online-only]")?.addEventListener("click",async()=>{m=!m;let d=r.querySelector("[data-ac-realtime-online-only]");d&&(d.textContent=m?"Show all devices":"Show online only"),await u()}),r.querySelector("[data-ac-realtime-test]")?.addEventListener("click",async()=>{await g({force:!0})&&(y("The realtime channel answered.","success"),await u())});let w=async(d,b,x)=>{let T=await g();if(!T){y("The realtime channel is not connected.","error");return}try{T.emit(d,b||{}),y(`${x} was sent to the connected devices.`,"success")}catch(E){y(E.message,"error")}};r.querySelector("[data-ac-realtime-sync-all]")?.addEventListener("click",async()=>{await w("admin:refreshStudentBootstrap",{},"The full synchronisation"),await w("admin:syncUsers",{quizUsers:[]},"The user accounts"),await w("admin:syncGamification",{},"The gamification")}),r.querySelector("[data-ac-realtime-sync-users]")?.addEventListener("click",()=>w("admin:syncUsers",{quizUsers:[]},"The user accounts")),r.querySelector("[data-ac-realtime-sync-classroom]")?.addEventListener("click",()=>w("admin:refreshStudentBootstrap",{},"The classroom data")),r.querySelector("[data-ac-realtime-sync-games]")?.addEventListener("click",async()=>{await w("admin:syncGames",{},"The regular games"),await w("admin:syncKidsGames",{},"The Kids games")}),n("realtimeEnabled")!==!1&&g().then(async d=>{d&&d.on("clients:update",()=>{u()})}).catch(()=>{})}return{markup:o,bind:f}}function Nt(e){return q({columns:[{key:"hostname",label:"Device",render:a=>`<span class="ac-table__primary">${v(a.hostname||a.name||"\u2014")}</span>`},{key:"device_type",label:"Type",render:a=>v(a.device_type||a.platform||"\u2014")},{key:"assignedUser",label:"Assigned to",render:a=>v(a.assignedUser?.name||a.assignedUser?.username||"unassigned")},{key:"ip_address",label:"Address",render:a=>`<code>${v(a.ip_address||a.ip||"\u2014")}</code>`},{key:"status",label:"Status",render:a=>`<span class="ac-badge ac-badge--${a.status==="blocked"?"danger":""}">${v(a.status||"\u2014")}</span>`}],rows:e,empty:"No device matches the current filter."})}var Dt="quizPresets",Ot=[{value:"quiz",label:"Quiz"},{value:"battle",label:"Battle"},{value:"tournament",label:"Tournament"},{value:"kids",label:"Kids game"}],It=[{value:"individual",label:"Individual"},{value:"team",label:"Team"},{value:"tournament",label:"Tournament"}];function Ge(){try{let e=localStorage.getItem(Dt),a=e?JSON.parse(e):[];return Array.isArray(a)?a:[]}catch{return[]}}function ma(e){try{return localStorage.setItem(Dt,JSON.stringify(e)),!0}catch{return!1}}var jt=[{key:"name",label:"Name",type:"text",width:"full"},{key:"totalQuestions",label:"Questions",type:"number"},{key:"timerMode",label:"Timer mode",type:"select",options:[{value:"fixed",label:"One limit for the whole quiz"},{value:"per-question",label:"A limit per question"},{value:"none",label:"No limit"}]},{key:"perQuestionTime",label:"Seconds per question",type:"number"},{key:"timeLimit",label:"Total time (seconds)",type:"number"},{key:"penalty",label:"Penalty per wrong answer",type:"number"},{key:"passingScore",label:"Passing score (%)",type:"number"},{key:"shuffleQuestions",label:"Shuffle the questions",type:"checkbox"},{key:"showExplanations",label:"Show the explanations",type:"checkbox"},{key:"primaryColor",label:"Primary colour",type:"color"},{key:"secondaryColor",label:"Secondary colour",type:"color"},{key:"backgroundColor",label:"Background colour",type:"color"},{key:"textColor",label:"Text colour",type:"color"},{key:"inputFocusColor",label:"Input focus colour",type:"color"},{key:"fontFamily",label:"Typeface",type:"text",width:"full"},{key:"welcomeTitle",label:"Welcome title",type:"text",width:"full"},{key:"welcomeMessage",label:"Welcome message",type:"text",width:"full"}],Ht={name:"",totalQuestions:5,timerMode:"fixed",perQuestionTime:60,timeLimit:300,penalty:0,passingScore:50,shuffleQuestions:!0,showExplanations:!1,primaryColor:"#2563eb",secondaryColor:"#1e40af",backgroundColor:"#f8fafc",textColor:"#1e293b",inputFocusColor:"#3b82f6",fontFamily:"'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",welcomeTitle:"",welcomeMessage:""};function Ms(e,a){let t=`preset-${a.key}`,n=e?.[a.key]??Ht[a.key];return a.type==="checkbox"?`<label class="ac-check">
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
	</div>`}async function Bt(e){let[a,t]=await Promise.all([k.get("game-presets").catch(()=>[]),ue()]),n=Array.isArray(a)?a:[],s=Ge(),o=t.get("trainingPresetId")?.value??"",f=[C({title:"Quiz presets",subtitle:"The ready-made quick-quiz configurations. They are stored in this browser and are shared with the classroom panel.",actions:'<button type="button" class="ac-btn ac-btn--sm ac-btn--primary" data-ac-preset-new>New quiz preset</button>',body:`${s.length?q({columns:[{key:"name",label:"Preset",render:p=>`<span class="ac-table__primary">${v(p.name||"")}</span><br><span class="ac-table__muted">${v(p.id||"")}</span>`},{key:"totalQuestions",label:"Questions",align:"right",render:p=>String(p.totalQuestions??"\u2014")},{key:"timeLimit",label:"Time limit (s)",align:"right",render:p=>String(p.timeLimit??"\u2014")},{key:"passingScore",label:"Passing score",align:"right",render:p=>String(p.passingScore??"\u2014")},{key:"actions",label:"",align:"right",render:p=>`<button type="button" class="ac-btn ac-btn--sm" data-ac-preset-edit="${v(p.id)}">Edit</button> <button type="button" class="ac-btn ac-btn--sm" data-ac-preset-rename="${v(p.id)}">Rename</button> <button type="button" class="ac-btn ac-btn--sm" data-ac-preset-delete="${v(p.id)}">Delete</button>`}],rows:s}):'<p class="ac-empty__message">No quiz preset is stored in this browser yet. Create one here, or in the classroom panel.</p>'}
			<div class="ac-field-grid" style="margin-top:16px">
				${L({id:"set-training-preset",label:"The preset used for training mode",value:o,hint:"The id of the quiz preset a training session starts from. Leave it blank for the default."})}
			</div>
			<div class="ac-toolbar" style="margin-bottom:0">
				<div class="ac-toolbar__row">
					<button type="button" class="ac-btn ac-btn--primary" data-ac-save-training-preset>Save training preset</button>
					<span class="ac-table__muted" data-ac-training-preset-status></span>
				</div>
			</div>`}),C({title:"Game presets",subtitle:"The arena configurations this organization shares.",actions:'<button type="button" class="ac-btn ac-btn--sm ac-btn--primary" data-ac-game-preset-new>New game preset</button>',body:n.length?q({columns:[{key:"name",label:"Preset",render:p=>`<span class="ac-table__primary">${v(p.name||"")}</span><br><span class="ac-table__muted">${v(p.game_type||"")} \xB7 ${v(p.game_mode||"")}</span>`},{key:"is_default",label:"Default",render:p=>p.is_default?'<span class="ac-badge ac-badge--success">yes</span>':'<span class="ac-badge">no</span>'},{key:"actions",label:"",align:"right",render:p=>`<button type="button" class="ac-btn ac-btn--sm" data-ac-game-preset-edit="${v(p.id)}">Edit</button> <button type="button" class="ac-btn ac-btn--sm" data-ac-game-preset-delete="${v(p.id)}">Delete</button>`}],rows:n}):'<p class="ac-empty__message">No game preset yet.</p>'})].join("");function r(p){let l=c=>{let m=!c,g={...Ht,...c||{}},u=H({title:m?"Create a quiz preset":"Edit the quiz preset",subtitle:"A preset is stored in this browser and is shared with the classroom panel, so it is offered there too.",wide:!0,body:`<div class="ac-field-grid">
						${jt.map(d=>Ms(g,d)).join("")}
					</div>`,footer:`
					<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
					<button type="button" class="ac-btn ac-btn--primary" data-ac-confirm>${m?"Create the preset":"Save the preset"}</button>
				`}),w=u.root;w.querySelector("[data-ac-cancel]").addEventListener("click",u.close),w.querySelector("[data-ac-confirm]").addEventListener("click",()=>{let d={...g};for(let x of jt){let T=w.querySelector(`#preset-${x.key}`);T&&(x.type==="checkbox"?d[x.key]=T.checked:x.type==="number"?d[x.key]=T.value===""?0:Number(T.value):d[x.key]=T.value)}if(!String(d.name||"").trim()){y("A preset needs a name.","error");return}let b=Ge();if(m)d.id=`preset-${Date.now()}`,d.createdAt=new Date().toISOString(),b.push(d);else{let x=b.findIndex(T=>T.id===c.id);x!==-1&&(b[x]={...b[x],...d})}if(!ma(b)){y("The browser refused to save the preset.","error");return}u.close(),y(m?"The preset was created.":"The preset was saved.","success"),e.rerender()})};p.querySelector("[data-ac-preset-new]")?.addEventListener("click",()=>l(null)),p.querySelectorAll("[data-ac-preset-edit]").forEach(c=>{c.addEventListener("click",()=>{let m=s.find(g=>g.id===c.dataset.acPresetEdit);m&&l(m)})}),p.querySelectorAll("[data-ac-preset-rename]").forEach(c=>{c.addEventListener("click",()=>{let m=c.dataset.acPresetRename,g=Ge(),u=g.find(d=>d.id===m);if(!u)return;let w=H({title:"Rename this preset",body:`<div class="ac-field">
							<label class="ac-field__label" for="ac-preset-name">Name</label>
							<input class="ac-input ac-input--full" id="ac-preset-name" type="text" value="${v(u.name||"")}" />
						</div>`,footer:`
						<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
						<button type="button" class="ac-btn ac-btn--primary" data-ac-confirm>Rename</button>
					`});w.root.querySelector("[data-ac-cancel]").addEventListener("click",w.close),w.root.querySelector("[data-ac-confirm]").addEventListener("click",()=>{let d=w.root.querySelector("#ac-preset-name").value.trim();if(!d){y("A preset needs a name.","error");return}u.name=d,ma(g)?(w.close(),y("Preset renamed.","success"),e.rerender()):y("The browser refused to save the preset.","error")})})}),p.querySelectorAll("[data-ac-preset-delete]").forEach(c=>{c.addEventListener("click",async()=>{let m=c.dataset.acPresetDelete;if(!await j({title:"Delete this preset?",message:"It is removed from this browser. The classroom panel will not offer it any more.",confirmLabel:"Delete preset",danger:!0}))return;let u=Ge().filter(w=>w.id!==m);ma(u)?(y("Preset deleted.","success"),e.rerender()):y("The browser refused to save the preset.","error")})}),p.querySelector("[data-ac-save-training-preset]")?.addEventListener("click",async()=>{let c=p.querySelector("[data-ac-training-preset-status]");try{await V("trainingPresetId",p.querySelector("#set-training-preset")?.value??""),c&&(c.textContent="Saved."),y("The training preset was saved.","success")}catch(m){c&&(c.textContent=m.message),y(m.message,"error")}});let h=c=>{let m=H({title:c?"Edit the game preset":"New game preset",body:`<div class="ac-field-grid">
						${L({id:"set-game-name",label:"Name",value:c?.name??"",full:!0})}
						${U({id:"set-game-type",label:"Game type",options:Ot,value:c?.game_type??Ot[0]?.value??""})}
						${U({id:"set-game-mode",label:"Game mode",options:It,value:c?.game_mode??It[0]?.value??""})}
						${L({id:"set-game-rules",label:"Rules (JSON)",value:Ns(c?.rules_json),full:!0,hint:"The rule set of the arena. It is stored as JSON."})}
					</div>
					${ia({id:"set-game-default",label:"The default preset",hint:"Used when a game starts without an explicit preset.",checked:!!c?.is_default})}`,footer:`
					<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
					<button type="button" class="ac-btn ac-btn--primary" data-ac-confirm>${c?"Save the preset":"Create the preset"}</button>
				`});m.root.querySelector("[data-ac-cancel]").addEventListener("click",m.close),m.root.querySelector("[data-ac-confirm]").addEventListener("click",async()=>{let g=m.root.querySelector("#set-game-name").value.trim();if(!g){y("A preset needs a name.","error");return}let u={name:g,game_type:m.root.querySelector("#set-game-type").value,game_mode:m.root.querySelector("#set-game-mode").value,rules:m.root.querySelector("#set-game-rules").value,is_default:m.root.querySelector("#set-game-default").checked};try{c?await k.patch(`game-presets/${encodeURIComponent(c.id)}`,u):await k.post("game-presets",u),m.close(),y("The game preset was saved.","success"),e.rerender()}catch(w){y(w.message,"error")}})};p.querySelector("[data-ac-game-preset-new]")?.addEventListener("click",()=>h(null)),p.querySelectorAll("[data-ac-game-preset-edit]").forEach(c=>{c.addEventListener("click",()=>{let m=n.find(g=>g.id===c.dataset.acGamePresetEdit);m&&h(m)})}),p.querySelectorAll("[data-ac-game-preset-delete]").forEach(c=>{c.addEventListener("click",async()=>{if(await j({title:"Delete this game preset?",message:"It is removed for the whole organization.",confirmLabel:"Delete preset",danger:!0}))try{await k.del(`game-presets/${encodeURIComponent(c.dataset.acGamePresetDelete)}`),y("The game preset was deleted.","success"),e.rerender()}catch(g){y(g.message,"error")}})})}return{markup:f,bind:r}}function Ns(e){if(!e)return"";if(typeof e=="object")return JSON.stringify(e,null,2);try{return JSON.stringify(JSON.parse(e),null,2)}catch{return String(e)}}async function Gt(e){let[a,t]=await Promise.all([k.get("generated-documents?limit=200").catch(()=>null),k.get("archives").catch(()=>null)]),n=Array.isArray(a?.data)?a.data:Array.isArray(a)?a:[],s=Array.isArray(t?.items)?t.items:[],o=[C({title:"Recent documents",subtitle:"Every booklet, preparation sheet and exam paper the platform has generated. The title opens the file; the folder shows where it lives.",body:n.length?q({columns:[{key:"title",label:"Document",render:r=>{let p=r.url||"",l=v(r.title||r.file_name||"Document");return p?`<a class="ac-table__primary" href="${v(p)}" target="_blank" rel="noopener">${l}</a>`:`<span class="ac-table__primary">${l}</span>`}},{key:"kind",label:"Kind",render:r=>v(r.kind||"\u2014")},{key:"rel_path",label:"Folder",render:r=>`<code class="ac-table__muted" title="${v(r.rel_path||"")}">${v(js(r.rel_path))}</code>`},{key:"size_bytes",label:"Size",align:"right",render:r=>Ut(r.size_bytes)},{key:"created_at",label:"Created",render:r=>v(Ft(r.created_at))},{key:"actions",label:"",align:"right",render:r=>`<a class="ac-btn ac-btn--sm" href="${v(`/api/v1/generated-documents/${encodeURIComponent(r.id)}/download`)}">Download</a>`}],rows:n}):'<p class="ac-empty__message">No document has been generated yet. The course booklets, the preparation sheets and the exam papers appear here once they are produced.</p>'}),C({title:"Export",subtitle:"A snapshot of this organization, taken from the database.",body:`<div class="ac-alert ac-alert--info">
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
				</div>`}),C({title:"Import",subtitle:"Restore a backup exported from this application.",body:`<div class="ac-field-grid">
					${Is("ac-import-file","Backup file",'A .zip produced by "Export as ZIP", or a .json produced by "Export as JSON".')}
				</div>
				<div class="ac-toolbar" style="margin-bottom:0">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-import-run>Import the backup</button>
						<span class="ac-table__muted" data-ac-import-status></span>
					</div>
				</div>`}),C({title:"School-year archives",subtitle:"A frozen snapshot of a school year, kept per year.",actions:'<button type="button" class="ac-btn ac-btn--sm ac-btn--primary" data-ac-archive-new>Create an archive</button>',body:s.length?q({columns:[{key:"label",label:"Archive",render:r=>`<span class="ac-table__primary">${v(r.label||`Archive ${r.year}`)}</span><br><span class="ac-table__muted">${v(r.year)}</span>`},{key:"size_bytes",label:"Size",align:"right",render:r=>Ut(r.size_bytes)},{key:"created_at",label:"Created",render:r=>v(Ft(r.created_at))},{key:"actions",label:"",align:"right",render:r=>`<button type="button" class="ac-btn ac-btn--sm" data-ac-archive-view="${v(r.year)}">Open</button> <button type="button" class="ac-btn ac-btn--sm" data-ac-archive-delete="${v(r.year)}">Delete</button>`}],rows:s}):'<p class="ac-empty__message">No archive yet.</p>'}),C({title:"Factory reset",subtitle:"Erase this organization's content and keep only its administrators.",body:`<div class="ac-alert ac-alert--danger">
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
				</div>`})].join("");function f(r){let p=r.querySelector("[data-ac-export-status]"),l=r.querySelector("[data-ac-import-status]"),h=async()=>{let c=await k.get("console/export");if(!c?.data)throw new Error("The export was empty.");return c.data};r.querySelector("[data-ac-export-json]")?.addEventListener("click",async()=>{p&&(p.textContent="Collecting\u2026");try{let c=await h();ga(new Blob([JSON.stringify(c,null,2)],{type:"application/json"}),`quiz-app-backup-${c.timestamp.slice(0,10)}.json`),p&&(p.textContent="The backup was downloaded."),y("Backup created.","success")}catch(c){p&&(p.textContent=c.message),y(c.message,"error")}}),r.querySelector("[data-ac-export-zip]")?.addEventListener("click",async()=>{p&&(p.textContent="Packaging\u2026");try{let c=await h(),m=await fetch("/api/v1/exports/bundle",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json",Authorization:`Bearer ${window.APP_CONFIG?.token||fa()}`},body:JSON.stringify({data:c.data})});if(!m.ok)throw new Error(`The server refused the export (${m.status}).`);let g=await m.blob();ga(g,`quiz-app-backup-${c.timestamp.slice(0,10)}.zip`),p&&(p.textContent="The backup was downloaded."),y("Backup created.","success")}catch(c){p&&(p.textContent=c.message),y(c.message,"error")}}),r.querySelectorAll("[data-ac-file-input]").forEach(c=>{c.addEventListener("change",()=>{let m=r.querySelector(`[data-ac-file-name="${c.dataset.acFileInput}"]`);if(!m)return;let g=c.files?.[0];m.textContent=g?g.name:"No file chosen yet",m.classList.toggle("is-set",!!g)})}),r.querySelector("[data-ac-import-run]")?.addEventListener("click",async()=>{let m=r.querySelector("#ac-import-file")?.files?.[0];if(!m){y("Choose a backup file first.","error");return}if(await j({title:"Import this backup?",message:"The records of the backup are written over the records of this organization. The accounts that already exist keep their password.",confirmLabel:"Import the backup",danger:!0})){l&&(l.textContent="Importing\u2026");try{let u=null,w=null;if(m.name.toLowerCase().endsWith(".zip")){let x=await fetch("/api/v1/imports/bundle",{method:"POST",credentials:"include",headers:{"Content-Type":"application/zip",Authorization:`Bearer ${fa()}`},body:m});if(!x.ok)throw new Error(`The server refused the backup (${x.status}).`);let T=await x.json();u=T.data,w=T.uploadToken}else{let x=JSON.parse(await m.text());u=x?.data?x.data:x}if(!u||typeof u!="object")throw new Error("The backup held no data.");let d=await Os(u);w&&await fetch(`/api/v1/imports/bundle/${encodeURIComponent(w)}/commit`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json",Authorization:`Bearer ${fa()}`},body:JSON.stringify({uploadToken:w})});let b=Object.entries(d).filter(([,x])=>x>0).map(([x,T])=>`${T} ${x}`).join(", ");l&&(l.textContent=b?`Imported: ${b}.`:"Nothing to import."),y("The backup was imported.","success"),e.rerender()}catch(u){l&&(l.textContent=u.message),y(u.message,"error")}}}),r.querySelector("[data-ac-archive-new]")?.addEventListener("click",async()=>{let c=prompt("Which school year? (YYYY-YYYY)",Ds());if(c)try{await k.post("archives",{year:c,label:`Archive ${c}`,data:{}}),y("The archive was created.","success"),e.rerender()}catch(m){y(m.message,"error")}}),r.querySelectorAll("[data-ac-archive-view]").forEach(c=>{c.addEventListener("click",async()=>{try{let m=await k.get(`archives/${encodeURIComponent(c.dataset.acArchiveView)}`),g=new Blob([JSON.stringify(m.data??{},null,2)],{type:"application/json"});ga(g,`archive-${c.dataset.acArchiveView}.json`),y("The archive was downloaded.","success")}catch(m){y(m.message,"error")}})}),r.querySelectorAll("[data-ac-archive-delete]").forEach(c=>{c.addEventListener("click",async()=>{if(await j({title:"Delete this archive?",message:"The frozen snapshot of that year is removed. It cannot be recovered.",confirmLabel:"Delete the archive",danger:!0}))try{await k.del(`archives/${encodeURIComponent(c.dataset.acArchiveDelete)}`),y("The archive was deleted.","success"),e.rerender()}catch(g){y(g.message,"error")}})}),r.querySelector("[data-ac-reset-data]")?.addEventListener("click",async()=>{let c=r.querySelector("[data-ac-reset-status]");if(await j({title:"Reset every record of this organization?",message:"The questions, the exams, the classes, the results, the games, the documents and the archives are erased. The administrator accounts are kept. This cannot be undone.",detail:"Take a backup first if there is anything here you want to keep.",confirmLabel:"Reset the data",danger:!0})){c&&(c.textContent="Resetting\u2026");try{let g=await k.post("admin/reset-data",{confirm:"RESET"});return c&&(c.textContent="The organization was reset."),y("The organization was reset.","success"),e.rerender(),g}catch(g){c&&(c.textContent=g.message),y(g.message,"error")}}})}return{markup:o,bind:f}}var Rs=["categories","classes","users","questions","exams","results","games","tournaments","notifications","gamification","settings"];async function Os(e){let a={};for(let t of Rs){let n=Array.isArray(e[t])?e[t]:[];if(!n.length){a[t]=0;continue}try{await k.post(`bulk/${t}`,{items:n}),a[t]=n.length}catch{a[t]=0}}return a}function Is(e,a,t){return`<div class="ac-field ac-field--full">
		<label class="ac-field__label" for="${v(e)}">${v(a)}</label>
		<label class="ac-file" for="${v(e)}">
			<input id="${v(e)}" type="file" accept=".json,.zip" data-ac-file-input="${v(e)}" />
			<span class="ac-btn ac-file__btn" aria-hidden="true">Choose a file</span>
			<span class="ac-file__name" data-ac-file-name="${v(e)}">No file chosen yet</span>
		</label>
		<p class="ac-field__hint">${v(t)}</p>
	</div>`}function ga(e,a){let t=URL.createObjectURL(e),n=document.createElement("a");n.href=t,n.download=a,document.body.appendChild(n),n.click(),n.remove(),setTimeout(()=>URL.revokeObjectURL(t),2e3)}function fa(){try{let e=sessionStorage.getItem("quizSession")||localStorage.getItem("quizSession"),a=e?JSON.parse(e):null;if(a?.token)return a.token}catch{}return localStorage.getItem("quizAuthToken")||""}function js(e){let a=String(e||""),t=a.lastIndexOf("/");return t===-1?"(root)":a.slice(0,t)}function Ut(e){let a=Number(e);return!Number.isFinite(a)||a<=0?"\u2014":a<1024?`${a} B`:a<1024*1024?`${Math.round(a/1024)} KB`:`${Math.round(a/1024/1024*10)/10} MB`}function Ft(e){if(!e)return"\u2014";let a=new Date(e);return Number.isNaN(a.getTime())?"\u2014":a.toLocaleDateString()}function Ds(){let e=new Date,a=e.getMonth()>=8?e.getFullYear():e.getFullYear()-1;return`${a}-${a+1}`}var ke=e=>`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${e}</svg>`,ie=[{id:"server",label:"Server & network",icon:ke('<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><path d="M6 6h.01M6 18h.01"/>')},{id:"access",label:"Student access",icon:ke('<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>')},{id:"firewall",label:"Windows firewall",icon:ke('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>')},{id:"database",label:"Database safety",icon:ke('<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>')},{id:"offline",label:"Offline & CDNs",icon:ke('<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>')},{id:"summary",label:"Summary",icon:ke('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>')}];async function Yt(e,a){let t=await k.get("admin/setup/diagnostics"),n=t?.data||t||{},s=ie.some(r=>r.id===a?.query?.step)?a.query.step:ie[0].id,o=[Hs(s),`<div data-ac-setup-step>${Bs(s,n,e)}</div>`].join("");function f(r){r.querySelectorAll("[data-ac-setup-goto]").forEach(h=>{h.addEventListener("click",()=>{K(`/settings?section=setup&step=${encodeURIComponent(h.dataset.acSetupGoto)}`,{replace:!0})})});let p=r.querySelector("[data-ac-setup-next]");p&&p.addEventListener("click",()=>{let h=ie.findIndex(m=>m.id===s),c=ie[Math.min(ie.length-1,h+1)];K(`/settings?section=setup&step=${encodeURIComponent(c.id)}`,{replace:!0})});let l=r.querySelector("[data-ac-setup-back]");l&&l.addEventListener("click",()=>{let h=ie.findIndex(m=>m.id===s),c=ie[Math.max(0,h-1)];K(`/settings?section=setup&step=${encodeURIComponent(c.id)}`,{replace:!0})}),r.querySelector("[data-ac-copy-lan]")?.addEventListener("click",async()=>{await Wt(r.querySelector("#set-lan-address")?.value??""),y("The address was copied.","success")}),r.querySelector("[data-ac-copy-firewall]")?.addEventListener("click",async()=>{await Wt(r.querySelector("#set-firewall-command")?.value??""),y("The command was copied.","success")}),r.querySelector("[data-ac-show-qr]")?.addEventListener("click",async()=>{let h=r.querySelector("[data-ac-qr]");if(!h)return;let c=r.querySelector("#set-lan-address")?.value??"";h.hidden=!1,h.innerHTML='<p class="ac-field__hint">Generating the QR code\u2026</p>';try{await Xs();let m=window.qrcode(0,"M");m.addData(c),m.make(),h.innerHTML=m.createSvgTag(4,8)}catch(m){h.innerHTML=`<pre class="ac-pre">${v(c)}</pre><p class="ac-field__hint">${v(m.message)} \u2014 use the address above.</p>`}}),r.querySelectorAll("[data-ac-network-profile]").forEach(h=>{h.addEventListener("click",async()=>{try{await k.post("admin/setup/network-profile",{interfaceAlias:h.dataset.acNetworkProfile,category:h.dataset.acNetworkCategory||"Private"}),y("The network profile was changed.","success"),e.rerender()}catch(c){y(c.message,"error")}})}),r.querySelector("[data-ac-setup-backup]")?.addEventListener("click",async()=>{let h=r.querySelector("[data-ac-setup-backup-status]");h&&(h.textContent="Collecting\u2026");try{let c=(await k.get("console/export"))?.data;if(!c)throw new Error("The export was empty.");en(new Blob([JSON.stringify(c,null,2)],{type:"application/json"}),`quiz-app-backup-${c.timestamp.slice(0,10)}.json`),h&&(h.textContent="The backup was downloaded."),y("Backup created.","success")}catch(c){h&&(h.textContent=c.message),y(c.message,"error")}}),r.querySelectorAll("[data-ac-firewall-check]").forEach(h=>{h.addEventListener("change",()=>{try{let g=localStorage.getItem(We)||"[]",u=JSON.parse(g),w=h.dataset.acFirewallCheck,d=u.indexOf(w);h.checked&&d===-1&&u.push(w),!h.checked&&d!==-1&&u.splice(d,1),localStorage.setItem(We,JSON.stringify(u))}catch{}let c=ba(),m=r.querySelector("[data-ac-firewall-status]");m&&(m.textContent=c?"All the manual checks are completed.":"Complete the checklist on the Firewall step.")})})}return{markup:o,bind:f}}function Hs(e){let a=ie.findIndex(t=>t.id===e);return`<nav class="ac-stepper" aria-label="Setup steps">
		${ie.map((t,n)=>`<button type="button" class="ac-stepper__step${t.id===e?" is-active":""}${n<a?" is-done":""}" data-ac-setup-goto="${v(t.id)}">
			<span class="ac-stepper__icon" aria-hidden="true">${t.icon}</span>
			<span class="ac-stepper__label">${v(t.label)}</span>
		</button>`).join("")}
	</nav>`}function Bs(e,a,t){let n=a.port||3e3,s=Array.isArray(a.lan)?a.lan:[],o=s.find(r=>r.recommended)||s[0]||null,f=o?`http://${o.address}:${n}`:`http://localhost:${n}`;switch(e){case"server":return Us(a);case"access":return Fs(a,s,o,f,n);case"firewall":return Gs(a,n);case"database":return Ws(a);case"offline":return Ys(a);case"summary":return Vs(a,s);default:return C({title:"Unknown step",body:"<p>That step does not exist.</p>"})}}function Us(e){let a=e.process||{},t=e.hostBinding==="0.0.0.0",n=e.nodeEnv!=="production";return C({title:"Server & network",subtitle:"This server must listen on every network interface so the students can reach it over Wi-Fi.",body:`<div class="ac-defs">
				${ee("Bind address",e.hostBinding||"0.0.0.0",t?"ok":"warn")}
				${ee("Port",String(Js(e)),"ok")}
				${ee("NODE_ENV",e.nodeEnv||"development",n?"ok":"warn")}
				${ee("Cookies",e.cookieSecure?"Secure (HTTPS only)":"Not secure (HTTP works)",e.cookieSecure?"warn":"ok")}
				${ee("Platform",a.platform||"\u2014")}
				${ee("Hostname",a.hostname||"\u2014")}
			</div>
			${e.cookieSecure?'<div class="ac-alert ac-alert--warning" style="margin-top:14px"><div class="ac-alert__body"><p class="ac-alert__title">Production mode detected</p><p class="ac-alert__text">The refresh cookie is marked <code>Secure</code>, so a browser will not send it over plain HTTP. For a classroom installation use <code>NODE_ENV=development</code>; for production, use HTTPS or a reverse proxy.</p></div></div>':""}`})}function Fs(e,a,t,n,s){return a.length?C({title:"Student access",subtitle:"The students must use the server's LAN address, not localhost. Share this URL, or let them scan the QR code.",body:`<div class="ac-primary-url">
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
					${q({columns:[{key:"interface",label:"Interface"},{key:"address",label:"URL",render:o=>`<code>http://${v(o.address)}:${v(String(s))}</code>`},{key:"type",label:"Type"},{key:"recommended",label:"Recommended",render:o=>o.recommended?'<span class="ac-badge ac-badge--success">yes</span>':o.type==="virtual"?'<span class="ac-badge ac-badge--warning">virtual</span>':'<span class="ac-badge">no</span>'}],rows:a})}`:""}
			<div class="ac-alert ac-alert--info" style="margin-top:16px"><div class="ac-alert__body"><p class="ac-alert__title">The students must not use <code>localhost</code></p><p class="ac-alert__text">On their own device <code>localhost</code> means the device itself. They must use the server's Wi-Fi address above. Virtual adapters (Hyper-V, WSL, Docker) are not reachable from another device.</p></div></div>`}):C({title:"Student access",subtitle:"The address the students use.",body:'<div class="ac-alert ac-alert--warning"><div class="ac-alert__body"><p class="ac-alert__title">No LAN address detected</p><p class="ac-alert__text">The server is not connected to Wi-Fi or Ethernet, so no other device can reach it.</p></div></div>'})}var Vt=[{id:"rule",label:"The inbound rule for the port exists",hint:"Run the PowerShell command above once, as an administrator."},{id:"private",label:"The network profile is Private",hint:"The server can set this for you with the button in the table above."},{id:"router",label:"The router allows the classroom Wi-Fi to reach the server",hint:"Some school routers block device-to-device traffic. Only the operator can see the router."},{id:"tested",label:"A student device opened the address above successfully",hint:"The real proof: open the student URL on a phone or a tablet on the classroom Wi-Fi."}],We="quizConsoleFirewallChecks";function ba(){try{let e=localStorage.getItem(We)||"[]",a=JSON.parse(e);return Array.isArray(a)&&a.length===Vt.length}catch{return!1}}function Gs(e,a){let t=Array.isArray(e.networkProfile)?e.networkProfile:[],n=ba();return C({title:"Windows firewall & network profile",subtitle:"Two things must be configured: the Windows network profile must be Private, and a firewall rule must allow inbound TCP on the port.",body:`<h4 class="ac-section-panel__title" style="margin:0 0 8px">Network profile</h4>
			${t.length?q({columns:[{key:"interface",label:"Interface"},{key:"name",label:"Connection"},{key:"category",label:"Category",render:s=>s.category==="Private"?'<span class="ac-badge ac-badge--success">Private</span>':s.category==="DomainAuthenticated"?'<span class="ac-badge">Domain</span>':'<span class="ac-badge ac-badge--warning">Public</span>'},{key:"actions",label:"",align:"right",render:s=>s.category==="Private"||s.category==="DomainAuthenticated"?'<span class="ac-table__muted">\u2014</span>':`<button type="button" class="ac-btn ac-btn--sm" data-ac-network-profile="${v(s.interface)}" data-ac-network-category="Private">Switch to Private</button>`}],rows:t}):`<p class="ac-field__hint">The network profile is only reported on Windows. Check it manually:</p>
					<pre class="ac-pre">Get-NetConnectionProfile | Select-Object Name, InterfaceAlias, NetworkCategory</pre>`}
			<h4 class="ac-section-panel__title" style="margin:20px 0 8px">The inbound rule</h4>
			<p class="ac-field__hint" style="margin-bottom:8px">Run this once in an administrator PowerShell on the machine that serves the app.</p>
			<textarea class="ac-input ac-input--full" id="set-firewall-command" rows="4" readonly>${v(Zs(a))}</textarea>
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
				${Vt.map(s=>{let o=!1;try{let f=localStorage.getItem(We)||"[]";o=JSON.parse(f).includes(s.id)}catch{o=!1}return`<label class="ac-check">
						<input type="checkbox" data-ac-firewall-check="${v(s.id)}" ${o?"checked":""} />
						<span>
							<span class="ac-check__label">${v(s.label)}</span>
							<span class="ac-check__hint">${v(s.hint)}</span>
						</span>
					</label>`}).join("")}
			</div>
			<p class="ac-field__hint" data-ac-firewall-status style="margin-top:8px">${n?"All four checks are confirmed. The Summary step now shows the setup as verified.":"None of this changes the application \u2014 it is a note to yourself. Tick what you have actually confirmed."}</p>`})}function Ws(e){let a=e.database||{},t=a.inferredInfo||{};return C({title:"Database safety",subtitle:"The database is a single SQLite file. Back it up before you change anything \u2014 the backup button is at the bottom of this step.",body:`<div class="ac-defs">
				${ee("Configured URL",a.url||"\u2014")}
				${a.inferred?ee("Prisma uses",a.inferred,t.exists?"ok":"fail"):""}
				${a.expected?ee("prisma/dev.db",a.expected.exists?`${a.expected.size||0} bytes`:"not found",a.expected.exists?"ok":"warn"):""}
				${a.rootDevDb&&a.rootDevDb.exists?ee("Root ./dev.db","found \u2014 may indicate a URL mismatch","warn"):""}
			</div>
			${a.rootDevDb&&a.rootDevDb.exists&&(!a.inferred||!t.exists)?'<div class="ac-alert ac-alert--warning" style="margin-top:14px"><div class="ac-alert__body"><p class="ac-alert__title">Database path inconsistency</p><p class="ac-alert__text">The <code>.env</code> file points at a different path than expected. The data may be in <code>./dev.db</code> instead of <code>prisma/dev.db</code> \u2014 back up both before reinstalling.</p></div></div>':""}
			<div class="ac-quick-actions" style="margin-top:16px">
				<button type="button" class="ac-btn ac-btn--primary" data-ac-setup-backup>Download a backup</button>
				<span class="ac-table__muted" data-ac-setup-backup-status></span>
			</div>`})}function Ys(e){let a=Array.isArray(e.cdn)?e.cdn:[],t=a.filter(o=>o.vendored).length,n=a.length-t,s=a.filter(o=>!o.vendored&&o.ok).length;return C({title:"Offline & CDN dependencies",subtitle:"The frontend libraries are served locally. The only external dependency is the web font, and it is optional.",body:`${t>0?`<div class="ac-alert ac-alert--success" style="margin-bottom:14px"><div class="ac-alert__body"><p class="ac-alert__title">${t} libraries are vendored locally</p><p class="ac-alert__text">No internet access is required for any core feature.</p></div></div>`:""}
		${q({columns:[{key:"host",label:"Host",render:o=>`<code>${v(o.host||o.id||"")}</code>`},{key:"vendored",label:"Source",render:o=>o.vendored?'<span class="ac-badge ac-badge--success">vendored locally</span>':'<span class="ac-badge ac-badge--warning">remote</span>'},{key:"ok",label:"Reachable",render:o=>o.vendored?'<span class="ac-table__muted">not needed</span>':`<span class="ac-badge ac-badge--${o.ok?"success":"danger"}">${o.ok?"yes":"no"}</span>`},{key:"ms",label:"Time",align:"right",render:o=>o.vendored?"\u2014":o.ms!=null?`${o.ms} ms`:"\u2014"}],rows:a,empty:"No probe was run."})}
		${n>0&&s<n?'<div class="ac-alert ac-alert--warning" style="margin-top:14px"><div class="ac-alert__body"><p class="ac-alert__title">Some remote resources are unreachable</p><p class="ac-alert__text">Only the web font is affected \u2014 the application works with the system font stack.</p></div></div>':'<div class="ac-alert ac-alert--info" style="margin-top:14px"><div class="ac-alert__body"><p class="ac-alert__title">All the core dependencies are vendored</p><p class="ac-alert__text">The application works fully offline. The web font is the only optional external dependency.</p></div></div>'}`})}function Vs(e,a){let t=Ks(e,a),n=ba();return C({title:"Summary",subtitle:"Every classroom deployment check, and every part of the platform you can manage from here.",body:`<h4 class="ac-section-panel__title" style="margin:0 0 10px">The deployment checks</h4>
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
				${Qs.map(s=>`<a class="ac-manage-card" href="${v(s.href)}">
						<span class="ac-manage-card__title">${v(s.title)}</span>
						<span class="ac-manage-card__desc">${v(s.desc)}</span>
					</a>`).join("")}
			</div>`})}var Qs=[{href:"#/overview",title:"Overview",desc:"The workbench: control, access, credentials, maintenance, activity, analytics, documents, notes and planning."},{href:"#/organizations",title:"Organizations",desc:"Every tenant: create one, edit its profile, suspend it, reactivate it, remove it."},{href:"#/users",title:"Users & access",desc:"The hub: the account counts, the requests waiting for a decision, and the three rosters."},{href:"#/users/teachers",title:"Teachers",desc:"Add a teacher, change their role, suspend them, reset their password, remove them."},{href:"#/users/students",title:"Students",desc:"Add a student, move them to a class, suspend them, reset their password, remove them."},{href:"#/users/administrators",title:"Directors & administrators",desc:"The people who can administer: the school directors and the platform administrators."},{href:"#/analytics",title:"Platform analytics",desc:"Adoption, activity and engagement, per organization and per class."},{href:"#/audit",title:"Activity & audit",desc:"Every administrative action and every authentication event, searchable."},{href:"#/health",title:"System health",desc:"Availability, error rate, latency, the database, the storage and the scheduled work."},{href:"#/settings?section=general",title:"General settings",desc:"The organization identity, the quiz defaults and the appearance."},{href:"#/settings?section=profile",title:"My profile",desc:"Your own account, and your own password."},{href:"#/settings?section=access",title:"Users & access settings",desc:"The pending account requests and the pending profile changes."},{href:"#/settings?section=teaching",title:"Teacher access",desc:"The seventeen switches that decide what a teacher may reach in the classroom."},{href:"#/settings?section=realtime",title:"Realtime",desc:"The broadcast switches, the recovery code, the connected devices and the sync actions."},{href:"#/settings?section=presets",title:"Presets",desc:"The quiz presets and the game presets."},{href:"#/settings?section=documents",title:"Documents & data",desc:"The generated documents, the export, the import, the archives and the factory reset."},{href:"#/settings?section=ai",title:"Artificial intelligence",desc:"The providers, the keys, the models, the shared catalogue and your own model."},{href:"#/settings?section=roles",title:"Roles & permissions",desc:"What each role may do, and the full permission catalogue."},{href:"#/settings?section=deployment",title:"Deployment & session",desc:"Where this installation runs, and what this session can reach."}];function Ks(e,a){let t=[],n=e.hostBinding==="0.0.0.0";t.push({id:"binding",label:`Server listening on ${e.hostBinding||"0.0.0.0"}:${e.port||3e3}`,status:n?"ok":"warn",detail:n?"Every network interface \u2014 the students can reach this server.":"The server is not bound to every interface.",action:n?null:{step:"server",label:"Look at the server step"}});let s=e.nodeEnv!=="production";t.push({id:"env",label:`NODE_ENV = ${e.nodeEnv||"development"}`,status:s?"ok":"warn",detail:s?"HTTP works for the login and refresh cookies.":"Production mode sets Secure cookies \u2014 HTTP sign-in will fail. Use HTTPS or NODE_ENV=development.",action:s?null:{step:"server",label:"Look at the server step"}}),t.push({id:"lan",label:a&&a.length?`${a.length} LAN address(es) found`:"No LAN address found",status:a&&a.length?"ok":"fail",detail:a&&a.length?a.map(r=>r.address).join(", "):"No IPv4 LAN interface was detected.",action:a&&a.length?{step:"access",label:"Show the address"}:null});let o=e.database||{},f=o.inferredInfo&&o.inferredInfo.exists;if(t.push({id:"database",label:"Database file exists",status:f?"ok":"warn",detail:o.inferred?`Prisma uses: ${o.inferred}`:"The database path could not be resolved.",action:{step:"database",label:"Open the database step"}}),Array.isArray(e.cdn)&&e.cdn.length){let r=e.cdn.filter(p=>p.ok).length;t.push({id:"cdn",label:`Resource reachability: ${r}/${e.cdn.length}`,status:r===e.cdn.length?"ok":r>0?"warn":"fail",detail:r===e.cdn.length?"Every probed resource answered.":"Some resources are unreachable \u2014 an offline or restricted network.",action:{step:"offline",label:"Open the offline step"}})}return t.push({id:"realtime",label:"The realtime channel",status:"ok",detail:"There is no separate realtime server: the pages, the API and the realtime channel are served by this one process, on this one port.",action:{step:"access",label:"Show the student address"}}),t.push({id:"fonts",label:"The web font is served locally",status:"ok",detail:"The interface fonts are vendored under public/fonts/, so the application renders with no internet access.",action:{step:"offline",label:"Open the offline step"}}),t}function ee(e,a,t=""){let n=t==="ok"?'<span class="ac-badge ac-badge--success">\u2713</span>':t==="warn"?'<span class="ac-badge ac-badge--warning">\u26A0</span>':t==="fail"?'<span class="ac-badge ac-badge--danger">\u2717</span>':"";return`<div class="ac-defs__item">
		<p class="ac-defs__term">${v(e)}</p>
		<p class="ac-defs__desc">${v(a)} ${n}</p>
	</div>`}function Js(e){return e.port||3e3}function Zs(e){return`New-NetFirewallRule -DisplayName "Quiz Portal ${e}" -Direction Inbound -Action Allow -Protocol TCP -LocalPort ${e}`}async function Wt(e){try{await navigator.clipboard.writeText(e)}catch{let a=document.createElement("textarea");a.value=e,document.body.appendChild(a),a.select(),document.execCommand("copy"),a.remove()}}function Xs(){return typeof window.qrcode=="function"?Promise.resolve():new Promise((e,a)=>{let t=document.createElement("script");t.src="/qrcode-generator.js",t.onload=()=>{typeof window.qrcode=="function"?e():a(new Error("The QR generator could not be loaded."))},t.onerror=()=>a(new Error("The QR generator could not be loaded.")),document.head.appendChild(t)})}function en(e,a){let t=URL.createObjectURL(e),n=document.createElement("a");n.href=t,n.download=a,document.body.appendChild(n),n.click(),n.remove(),setTimeout(()=>URL.revokeObjectURL(t),2e3)}var an=[{value:"openrouter",label:"OpenRouter \u2014 all providers, free tier"},{value:"openai",label:"OpenAI (GPT family)"},{value:"anthropic",label:"Anthropic (Claude)"},{value:"google",label:"Google AI (Gemini)"},{value:"deepseek",label:"DeepSeek"},{value:"custom",label:"Custom / Local (Ollama, LM Studio\u2026)"}],tn={openrouter:"https://openrouter.ai/keys",openai:"https://platform.openai.com/api-keys",anthropic:"https://console.anthropic.com/settings/keys",google:"https://aistudio.google.com/app/apikey",deepseek:"https://platform.deepseek.com/api_keys"};async function Qt(e){let a=await k.get("ai/configs"),t=Array.isArray(a?.data)?a.data:[],n=t.filter(r=>r.is_shared),s=t.filter(r=>!r.is_shared),o=[C({title:"Nothing here is required",subtitle:"The platform works fully without an AI provider.",body:`<div class="ac-alert ac-alert--info">
					<div class="ac-alert__body">
						<p class="ac-alert__title">Optional by design</p>
						<p class="ac-alert__text">Without a configured model, question generation returns a generated set rather than an error, and image generation falls back to text options. A LAN installation can point a custom provider at a model server on the local network \u2014 no internet access is required for that either.</p>
					</div>
				</div>`}),C({title:"Load models from a provider",subtitle:"Enter the provider key once, fetch the live model list, then publish the models the teachers should see.",body:`<div class="ac-field-grid">
					${U({id:"set-ai-provider",label:"Provider",options:an,value:"openrouter"})}
					${L({id:"set-ai-key",label:"API key",type:"password",hint:"Stored encrypted on the server. It is never sent back to a browser."})}
				</div>
				<div class="ac-field ac-field--full" data-ac-ai-base hidden>
					${L({id:"set-ai-base-url",label:"Base URL",value:"",placeholder:"http://localhost:11434/v1",hint:"The chat-completions endpoint of any OpenAI-compatible server (Ollama, LM Studio, vLLM, Groq, an enterprise gateway\u2026)."})}
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
						${L({id:"set-ai-model-filter",label:"Filter the list",value:"",placeholder:"Type to filter\u2026"})}
					</div>
					<div data-ac-ai-models></div>
					<div class="ac-toolbar" style="margin:12px 0 0">
						<div class="ac-toolbar__row">
							<button type="button" class="ac-btn ac-btn--primary" data-ac-ai-publish>Publish the selected models</button>
						</div>
					</div>
				</div>`}),C({title:"Shared models",subtitle:"The models every teacher in this organization may use.",body:n.length?q({columns:[{key:"name",label:"Name",render:r=>`<span class="ac-table__primary">${v(r.name)}</span><br><span class="ac-table__muted">${v(r.provider)} \xB7 ${v(r.model_id)}</span>`},{key:"key_hint",label:"Key",render:r=>r.has_key?`<code>${v(r.key_hint||"\u2022\u2022\u2022\u2022")}</code>`:'<span class="ac-badge">none (local server)</span>'},{key:"is_default",label:"Default",render:r=>r.is_default?'<span class="ac-badge ac-badge--success">yes</span>':'<span class="ac-badge">no</span>'},{key:"actions",label:"",align:"right",render:r=>`<button type="button" class="ac-btn ac-btn--sm" data-ac-ai-test="${v(r.id)}">Test</button> <button type="button" class="ac-btn ac-btn--sm" data-ac-ai-delete="${v(r.id)}">Delete</button>`}],rows:n}):'<p class="ac-empty__message">No shared model yet. Load a provider list above and publish the models the teachers should use.</p>'}),C({title:"My own model",subtitle:"Private to you. A local server needs no key at all.",body:`<div class="ac-field-grid">
					${L({id:"set-ai-personal-name",label:"Display name",placeholder:"My Ollama"})}
					${L({id:"set-ai-personal-model",label:"Model id",placeholder:"llama3.1:8b, gpt-5-mini"})}
					${L({id:"set-ai-personal-base",label:"Base URL",placeholder:"http://localhost:11434/v1"})}
					${L({id:"set-ai-personal-key",label:"API key",type:"password",hint:"Optional for a local server."})}
				</div>
				<div class="ac-toolbar" style="margin-bottom:12px">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-ai-save-personal>Save my model</button>
						<span class="ac-table__muted" data-ac-ai-personal-status></span>
					</div>
				</div>
				${s.length?q({columns:[{key:"name",label:"Model",render:r=>`<span class="ac-table__primary">${v(r.name)}</span><br><span class="ac-table__muted">${v(r.provider)} \xB7 ${v(r.model_id)}</span>`},{key:"actions",label:"",align:"right",render:r=>`<button type="button" class="ac-btn ac-btn--sm" data-ac-ai-test="${v(r.id)}">Test</button> <button type="button" class="ac-btn ac-btn--sm" data-ac-ai-delete="${v(r.id)}">Delete</button>`}],rows:s}):'<p class="ac-empty__message">You have no personal model yet.</p>'}`})].join("");function f(r){let p=r.querySelector("[data-ac-ai-status]"),l=b=>{p&&(p.textContent=b)},h=r.querySelector("#set-ai-provider"),c=r.querySelector("[data-ac-ai-base]"),m=r.querySelector("#set-ai-key"),g=()=>{let b=h?.value||"";if(c&&(c.hidden=b!=="custom"),m){let x=tn[b];m.placeholder=b==="custom"?"Not needed for a local server":"sk-\u2026"}};h?.addEventListener("change",g),g();let u=[],w=()=>{let b=r.querySelector("[data-ac-ai-models]");if(b){if(!u.length){b.innerHTML='<p class="ac-empty__message">The provider returned no model.</p>';return}b.innerHTML=`<div class="ac-model-catalog">
				${u.map(x=>`<label class="ac-model-catalog__item">
					<input type="checkbox" value="${v(x.id)}" data-ac-ai-model />
					<span class="ac-model-catalog__name">${v(x.label||x.id)}</span>
					<code class="ac-model-catalog__id">${v(x.id)}</code>
				</label>`).join("")}
			</div>`}},d=r.querySelector("#set-ai-model-filter");d?.addEventListener("input",()=>{let b=d.value.trim().toLowerCase();r.querySelectorAll(".ac-model-catalog__item").forEach(T=>{let E=T.textContent.toLowerCase();T.hidden=b!==""&&!E.includes(b)})}),r.querySelector("[data-ac-ai-load]")?.addEventListener("click",async()=>{l("Loading\u2026");try{let b=r.querySelector("#set-ai-provider")?.value,x=r.querySelector("#set-ai-key")?.value||void 0,T=r.querySelector("#set-ai-base-url")?.value||void 0,E=await k.post("ai/models/refresh",{provider:b,api_key:x||void 0,base_url:T||void 0});u=Array.isArray(E?.data)?E.data:[];let z=r.querySelector("[data-ac-ai-catalog]");z&&(z.hidden=!1),w(),l(`${u.length} model(s) returned.`)}catch(b){l(b.message),y(b.message,"error")}}),r.querySelector("[data-ac-ai-test-key]")?.addEventListener("click",async()=>{l("Testing\u2026");try{let b=r.querySelector("#set-ai-provider")?.value,x=r.querySelector("#set-ai-key")?.value||void 0,T=r.querySelector("#set-ai-base-url")?.value||void 0,E=await k.post("ai/models/refresh",{provider:b,api_key:x||void 0,base_url:T||void 0}),z=Array.isArray(E?.data)?E.data.length:0;l(z?`The provider answered: ${z} model(s).`:"The provider answered but returned no model.")}catch(b){l(b.message)}}),r.querySelector("[data-ac-ai-publish]")?.addEventListener("click",async()=>{let b=Array.from(r.querySelectorAll("[data-ac-ai-model]:checked")).map(z=>z.value);if(!b.length){y("Select at least one model to publish.","error");return}let x=r.querySelector("#set-ai-provider")?.value,T=r.querySelector("#set-ai-key")?.value||void 0,E=r.querySelector("#set-ai-base-url")?.value||void 0;try{for(let z of b)await k.post("ai/configs",{provider:x,name:z,model_id:z,base_url:x==="custom"?E:void 0,api_key:T||void 0,shared:!0});y(`${b.length} model(s) published.`,"success"),e.rerender()}catch(z){y(z.message,"error")}}),r.querySelector("[data-ac-ai-save-personal]")?.addEventListener("click",async()=>{let b=r.querySelector("[data-ac-ai-personal-status]"),x=M=>r.querySelector(`#${M}`)?.value?.trim()??"",T=x("set-ai-personal-name"),E=x("set-ai-personal-model"),z=x("set-ai-personal-base"),A=x("set-ai-personal-key");if(!T||!E){y("A display name and a model id are required.","error");return}try{await k.post("ai/configs",{provider:z?"custom":"openrouter",name:T,model_id:E,base_url:z||void 0,api_key:A||void 0,shared:!1}),b&&(b.textContent="Saved."),y("Your model was saved.","success"),e.rerender()}catch(M){b&&(b.textContent=M.message),y(M.message,"error")}}),r.querySelectorAll("[data-ac-ai-test]").forEach(b=>{b.addEventListener("click",async()=>{try{let x=await k.post(`ai/configs/${encodeURIComponent(b.dataset.acAiTest)}/test`);y(x?.message||(x?.ok?"The model is reachable.":"The model did not answer."),x?.ok?"success":"error")}catch(x){y(x.message,"error")}})}),r.querySelectorAll("[data-ac-ai-delete]").forEach(b=>{b.addEventListener("click",async()=>{if(await j({title:"Delete this model?",message:"The model is removed from the server. Anyone using it will have to pick another one.",confirmLabel:"Delete model",danger:!0}))try{await k.del(`ai/configs/${encodeURIComponent(b.dataset.acAiDelete)}`),y("The model was deleted.","success"),e.rerender()}catch(T){y(T.message,"error")}})})}return{markup:o,bind:f}}async function Kt(){let e=await k.get("console/roles"),a=e.roles||[],t=e.catalog||[];return{markup:[C({title:"Roles",subtitle:"The roles the platform knows, and what each one may do.",body:q({columns:[{key:"label",label:"Role",render:s=>`<span class="ac-table__primary">${v(s.label)}</span><br><span class="ac-table__muted">${v(s.description||"")}</span>`},{key:"key",label:"Key",render:s=>`<code>${v(s.key)}</code>`},{key:"scopeLabel",label:"Scope",render:s=>`<span class="ac-badge">${v(s.scopeLabel)}</span>`},{key:"permissions",label:"Permissions",align:"right",render:s=>String(s.permissions.length)},{key:"isAssignable",label:"Assignable",render:s=>`<span class="ac-badge ac-badge--${s.isAssignable?"success":""}">${s.isAssignable?"yes":"no"}</span>`}],rows:a})}),C({title:"Permission catalog",subtitle:"Every capability, grouped by the scope it applies in.",body:t.map(s=>`<h4 class="ac-section-panel__title" style="margin:14px 0 6px">${v(s.group)}</h4>${q({columns:[{key:"label",label:"Permission",render:o=>`<span class="ac-table__primary">${v(o.label)}</span><br><span class="ac-table__muted">${v(o.description||"")}</span>`},{key:"id",label:"Identifier",render:o=>`<code>${v(o.id)}</code>`}],rows:s.permissions})}`).join("")})].join(""),bind:null}}async function Jt(e){let a=e.session||{},t=a.deployment||{},n=e.organization||{};return{markup:[C({title:"Deployment & session",subtitle:"Where this installation runs, and what this session can reach.",body:`<div class="ac-defs">
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
				</div>`}),C({title:"Plan and capacity",subtitle:"Observed configuration \u2014 nothing is enforced from it.",body:`<div class="ac-alert ac-alert--info">
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
				</div>`})].join(""),bind:null}}var Ee=[{id:"general",label:"General",icon:"general"},{id:"profile",label:"My profile",icon:"profile"},{id:"access",label:"Users & access",icon:"access"},{id:"teaching",label:"Teacher access",icon:"teaching"},{id:"realtime",label:"Realtime",icon:"realtime"},{id:"presets",label:"Presets",icon:"presets"},{id:"documents",label:"Documents & data",icon:"data"},{id:"setup",label:"Setup & diagnostics",icon:"setup"},{id:"ai",label:"Artificial intelligence",icon:"ai"},{id:"roles",label:"Roles & permissions",icon:"roles"},{id:"deployment",label:"Deployment & session",icon:"deployment"}],sn={general:Lt,profile:Ct,access:qt,teaching:zt,realtime:Rt,presets:Bt,documents:Gt,setup:Yt,ai:Qt,roles:Kt,deployment:Jt},Zt={id:"settings",path:"/settings",title:"Application Settings",description:"General configuration, the organization profile, access, data and the deployment \u2014 as a page, not a dialog.",permission:["platform.settings.manage","school.settings.manage"],async render(e,a,t){let n=Ee.some(h=>h.id===t.query?.section)?t.query.section:Ee[0].id;e.innerHTML=`<div class="ac-split" data-ac-settings>
			<div class="ac-split__main" data-ac-settings-main>${I(5)}</div>
			<div data-ac-settings-menu></div>
		</div>`;let s=e.querySelector(".ac-split"),o=e.querySelector("[data-ac-settings-menu]"),f=e.querySelector("[data-ac-settings-main]"),r=0,p=$t();s.classList.toggle("ac-split--collapsed",p),o.innerHTML=xt({sections:Ee,active:n,collapsed:p}),kt(e,{onSelect:h=>{K(`/settings?section=${encodeURIComponent(h)}`,{replace:!0})}}),await(async h=>{let c=++r;f.innerHTML=I(4);let m=sn[h];if(!m){f.innerHTML=O({title:"Unknown section",message:`There is no settings section called "${h}".`});return}try{let{markup:g,bind:u}=await m(a,t);if(c!==r)return;f.innerHTML=g,typeof u=="function"&&u(f,a)}catch(g){if(c!==r)return;f.innerHTML=O({title:"This section could not be loaded",message:g.message})}})(n)}};async function ue(){let e=await k.get("settings/admin"),a=new Map;for(let t of Array.isArray(e)?e:[])a.set(t.key,t);return a}async function V(e,a){let t=typeof a=="string"?a:JSON.stringify(a);await k.patch(`settings/${encodeURIComponent(e)}`,{key:e,value:t})}var Xt={id:"organization-detail",path:"/organizations/:id",title:"Organization",description:"Profile, accounts, usage, activity and administrative history.",permission:["platform.organizations.read","school.profile.read"],async render(e,a,t){let n=t.params?.id;e.innerHTML=`<div class="ac-stack" data-ac-org-detail>${I(4)}</div>`;let s;try{s=(await k.get(`console/organizations/${encodeURIComponent(n)}`)).data}catch(l){e.innerHTML=O({title:"This organization could not be loaded",message:l.message});return}let o=s.organization,f=s.usage,r=a.isPlatform||(a.session.permissions||[]).includes("school.profile.manage");a.setTitle(o.name,`${o.slug} \xB7 ${o.schoolType||"organization"}${o.schoolYear?` \xB7 academic year ${o.schoolYear}`:""}`),e.innerHTML=`
			${B({chips:'<a class="ac-btn" href="#/organizations">\u2190 All organizations</a>',actions:r?`<button type="button" class="ac-btn" data-ac-toggle-status>${o.status==="suspended"?"Reactivate organization":"Suspend organization"}</button>`:""})}

			<div class="ac-panel">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title">${i(o.name)}</h3>
						<p class="ac-panel__subtitle">${i(o.slug)} \xB7 ${i(o.schoolType||"\u2014")}${o.schoolYear?` \xB7 academic year ${i(o.schoolYear)}`:""}</p>
					</div>
					<div class="ac-panel__actions">
						<span class="ac-badge ${o.status==="active"?"ac-badge--success":o.status==="pending"?"ac-badge--warning":"ac-badge--danger"}">${i(o.status)}</span>
					</div>
				</div>
				<div class="ac-panel__body">
					<div class="ac-defs">
						<div class="ac-defs__item">
							<p class="ac-defs__term">Plan</p>
							<p class="ac-defs__desc">${i(o.plan||"\u2014")}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">City</p>
							<p class="ac-defs__desc">${i(o.city||"\u2014")}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Contact</p>
							<p class="ac-defs__desc">${i(o.email||o.phone||"\u2014")}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Created</p>
							<p class="ac-defs__desc">${i(N(o.createdAt,{withTime:!1}))}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Last activity</p>
							<p class="ac-defs__desc">${f.lastActivity?i(D(f.lastActivity)):"never"}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Student capacity</p>
							<p class="ac-defs__desc">${i(String(o.maxStudents??"\u2014"))}</p>
						</div>
					</div>
					${o.status==="suspended"?`<div class="ac-alert ac-alert--danger" style="margin-top:16px">
								<div class="ac-alert__body">
									<p class="ac-alert__title">Access is suspended</p>
									<p class="ac-alert__text">${o.suspendedReason?i(o.suspendedReason):"No reason was recorded."} \xB7 suspended ${i(N(o.suspendedAt))}</p>
								</div>
							</div>`:""}
				</div>
			</div>

			<div class="ac-grid ac-grid--kpi" style="margin-top:16px">
				${S({label:"Teachers",value:_(f.teachers),note:`${_(f.activeTeachers)} active in 30 days`,tone:"primary",tooltip:"Teacher accounts, and how many produced a recorded event in the last 30 days."})}
				${S({label:"Students",value:_(f.students),note:`${_(f.activeStudents)} active in 30 days`,tone:"primary",tooltip:"Student accounts, and how many produced a recorded event in the last 30 days."})}
				${S({label:"Attempts (30d)",value:_(f.attempts30d),note:`${_(f.formalAttempts30d)} formal`,tooltip:"Completed attempts of any mode inside the last 30 days."})}
				${S({label:"Content",value:_(f.questions+f.exams),note:`${_(f.questions)} questions \xB7 ${_(f.exams)} exams`,tooltip:"Rows that exist in this organization. These are totals, not period counts."})}
				${S({label:"Needs attention",value:_(f.suspendedAccounts+f.pendingRequests),note:`${_(f.suspendedAccounts)} suspended \xB7 ${_(f.pendingRequests)} pending`,tone:f.suspendedAccounts+f.pendingRequests>0?"warning":"",tooltip:"Suspended accounts and account requests awaiting a decision."})}
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
						${q({columns:[{key:"name",label:"Account",render:l=>`<a href="#/users/${l.id}" class="ac-table__primary">${i(l.name)}</a><br><span class="ac-table__muted">${i(l.username)}</span>`},{key:"status",label:"Status",render:l=>`<span class="ac-badge ac-badge--${l.status==="active"?"success":"warning"}">${i(l.status)}</span>`},{key:"lastLogin",label:"Last sign-in",render:l=>l.lastLogin?i(D(l.lastLogin)):"never"}],rows:s.administrators,empty:"This organization has no administrator account."})}
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
						${q({columns:[{key:"name",label:"Class",render:l=>`<span class="ac-table__primary">${i(l.name)}</span>`},{key:"studentCount",label:"Students",align:"right"},{key:"createdAt",label:"Created",render:l=>i(N(l.createdAt,{withTime:!1}))}],rows:s.classes,empty:"No class has been created in this organization."})}
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
						${q({columns:[{key:"name",label:"Teacher",render:l=>`<a href="#/users/${l.id}" class="ac-table__primary">${i(l.name)}</a>`},{key:"active",label:"Active (30d)",render:l=>l.active?'<span class="ac-badge ac-badge--success">yes</span>':'<span class="ac-badge ac-badge--warning">no</span>'},{key:"lastLogin",label:"Last sign-in",render:l=>l.lastLogin?i(D(l.lastLogin)):"never"}],rows:s.teachers,empty:"No teacher account in this organization."})}
					</div>
				</section>
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles"><h3 class="ac-panel__title">Students</h3></div>
					</div>
					<div class="ac-panel__body ac-panel__body--flush">
						${q({columns:[{key:"name",label:"Student",render:l=>`<a href="#/users/${l.id}" class="ac-table__primary">${i(l.name)}</a>`},{key:"active",label:"Active (30d)",render:l=>l.active?'<span class="ac-badge ac-badge--success">yes</span>':'<span class="ac-badge ac-badge--warning">no</span>'},{key:"lastLogin",label:"Last sign-in",render:l=>l.lastLogin?i(D(l.lastLogin)):"never"}],rows:s.students,empty:"No student account in this organization."})}
					</div>
				</section>
			</div>

			<div class="ac-section">
				<h2 class="ac-section__title">Administrative history</h2>
				<p class="ac-section__hint">The fifteen most recent recorded actions inside this organization.</p>
			</div>
			<section class="ac-panel">
				<div class="ac-panel__body ac-panel__body--flush">
					${q({columns:[{key:"occurredAt",label:"When",render:l=>i(N(l.occurredAt))},{key:"actorName",label:"Actor",render:l=>i(l.actorName||"system")},{key:"action",label:"Action"},{key:"entityType",label:"Entity"},{key:"outcome",label:"Outcome",render:l=>`<span class="ac-badge ac-badge--${l.outcome==="success"?"success":"warning"}">${i(l.outcome)}</span>`}],rows:s.recentActivity,empty:"No administrative action has been recorded for this organization."})}
				</div>
			</section>`;let p=e.querySelector("[data-ac-toggle-status]");p&&p.addEventListener("click",async()=>{let l=o.status!=="suspended";if(!await j({title:l?"Suspend this organization?":"Reactivate this organization?",message:l?"Suspending revokes access for every account in this organization. Their data is retained.":"Reactivating restores access for the accounts that were suspended with the organization.",detail:l?"The action is recorded in the audit trail with the reason you give.":"",confirmLabel:l?"Suspend":"Reactivate",danger:l}))return;let c=null;if(!(l&&(c=window.prompt("Reason for suspending (recorded in the audit trail):",""),c===null)))try{await k.patch(`console/organizations/${encodeURIComponent(n)}`,{status:l?"suspended":"active",reason:c||null}),y(l?"Organization suspended.":"Organization reactivated.","success"),a.rerender()}catch(m){y(m.message,"error")}})}};var es={super_admin:"Platform administrator",admin:"Organization administrator",teacher:"Teacher",student:"Student"},as={id:"user-detail",path:"/users/:id",title:"Account",description:"Profile, access, recent activity and the administrative actions available.",permission:["platform.users.read","school.users.read"],async render(e,a,t){let n=t.params?.id;e.innerHTML=`<div class="ac-stack" data-ac-user-detail>${I(4)}</div>`;let s;try{s=(await k.get(`console/users/${encodeURIComponent(n)}`)).data}catch(p){e.innerHTML=O({title:"This account could not be loaded",message:p.message});return}let o=s.account,f=a.isPlatform||(a.session.permissions||[]).includes("school.users.manage"),r=a.isPlatform||(a.session.permissions||[]).includes("school.roles.manage");a.setTitle(o.name||o.username,`${es[o.role]||o.role} \xB7 ${s.organization?.name||"organization"} \xB7 ${o.status}`),e.innerHTML=`
			${B({chips:'<a class="ac-btn" href="#/users">\u2190 All accounts</a>',actions:`${f?`<button type="button" class="ac-btn" data-ac-toggle-status>${o.status==="active"?"Suspend account":"Reactivate account"}</button>`:""}
				${r?'<button type="button" class="ac-btn" data-ac-change-role>Change role</button>':""}
				${r?'<button type="button" class="ac-btn" data-ac-grant>Grant permission</button>':""}
				<button type="button" class="ac-btn" data-ac-revoke-sessions>Revoke sessions</button>
				${f&&String(o.id)!==String(a.session.user?.id)?'<button type="button" class="ac-btn" data-ac-reset-credential>Reset credential</button>':""}
				${f&&String(o.id)!==String(a.session.user?.id)?'<button type="button" class="ac-btn ac-btn--danger" data-ac-delete-account>Delete account</button>':""}`})}

			<div class="ac-panel">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title">${i(o.name||o.username)}</h3>
						<p class="ac-panel__subtitle">${i(o.username)}${o.email?` \xB7 ${i(o.email)}`:""}</p>
					</div>
					<div class="ac-panel__actions">
						<span class="ac-badge ac-badge--brand">${i(es[o.role]||o.role)}</span>
						<span class="ac-badge ac-badge--${o.status==="active"?"success":o.status==="suspended"?"danger":"warning"}">${i(o.status)}</span>
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
							<p class="ac-defs__desc">${i(o.numero||"\u2014")}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Last sign-in</p>
							<p class="ac-defs__desc">${o.lastLogin?i(D(o.lastLogin)):"never"}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Account created</p>
							<p class="ac-defs__desc">${i(N(o.createdAt,{withTime:!1}))}</p>
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
				${S({label:"Last sign-in",value:o.lastLogin?i(D(o.lastLogin)):"never",tone:o.lastLogin?"primary":"warning",tooltip:"From the recorded authentication trail."})}
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
					${s.permissionOverrides.length?q({columns:[{key:"permission",label:"Permission",render:p=>`<code>${i(p.permission)}</code>`},{key:"effect",label:"Effect",render:p=>`<span class="ac-badge ac-badge--${p.effect==="grant"?"success":"danger"}">${i(p.effect)}</span>`},{key:"scopeKey",label:"Applies to",render:p=>i(p.scopeKey==="*"?"every scope":p.scopeKey)},{key:"reason",label:"Reason",render:p=>i(p.reason||"\u2014")},{key:"createdAt",label:"Recorded",render:p=>i(N(p.createdAt))},{key:"actions",label:"",className:"ac-table__actions",render:p=>r?`<button type="button" class="ac-btn ac-btn--sm" data-ac-remove-override="${i(p.permission)}">Remove</button>`:""}],rows:s.permissionOverrides}):R({title:"No overrides",message:"This account holds exactly the permissions its role carries. Nothing has been granted or denied on top."})}
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
						${q({columns:[{key:"dateTaken",label:"When",render:p=>i(N(p.dateTaken))},{key:"mode",label:"Mode"},{key:"score20",label:"Score",align:"right",render:p=>p.mode==="exam"?`${p.score20.toFixed(2)} /20`:`${Math.round(p.score)}%`}],rows:s.recentResults,empty:"This account has no recorded attempt."})}
					</div>
				</section>
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles"><h3 class="ac-panel__title">Administrative actions</h3></div>
					</div>
					<div class="ac-panel__body ac-panel__body--flush">
						${q({columns:[{key:"occurredAt",label:"When",render:p=>i(N(p.occurredAt))},{key:"action",label:"Action"},{key:"entityType",label:"Entity"},{key:"outcome",label:"Outcome",render:p=>`<span class="ac-badge ac-badge--${p.outcome==="success"?"success":"warning"}">${i(p.outcome)}</span>`}],rows:s.recentActivity,empty:"This account has performed no recorded administrative action."})}
					</div>
				</section>
			</div>`,nn(e,a,n,o,s)}};function nn(e,a,t,n,s){let o=e.querySelector("[data-ac-toggle-status]");o&&o.addEventListener("click",async()=>{let c=n.status==="active";if(!await j({title:c?"Suspend this account?":"Reactivate this account?",message:c?"The account will not be able to sign in. Its data is retained.":"The account will be able to sign in again.",detail:"The action is recorded in the audit trail and in the security event trail.",confirmLabel:c?"Suspend":"Reactivate",danger:c}))return;let g=null;if(!(c&&(g=window.prompt("Reason for suspending (recorded in the audit trail):",""),g===null)))try{await k.patch(`console/users/${encodeURIComponent(t)}`,{status:c?"suspended":"active",reason:g||null}),y(c?"Account suspended.":"Account reactivated.","success"),a.rerender()}catch(u){y(u.message,"error")}});let f=e.querySelector("[data-ac-change-role]");f&&f.addEventListener("click",async()=>{let m=H({title:"Change the role of this account",subtitle:"The change is recorded in the audit trail with the previous role.",body:`<div class="ac-field">
					<label class="ac-field__label" for="ac-new-role">New role</label>
					<select class="ac-select" id="ac-new-role">
						${[{value:"admin",label:"Organization administrator"},{value:"teacher",label:"Teacher"},{value:"student",label:"Student"}].map(g=>`<option value="${g.value}"${g.value===n.role?" selected":""}>${g.label}</option>`).join("")}
					</select>
				</div>`,footer:`
					<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
					<button type="button" class="ac-btn ac-btn--primary" data-ac-confirm>Change role</button>
				`});m.root.querySelector("[data-ac-cancel]").addEventListener("click",m.close),m.root.querySelector("[data-ac-confirm]").addEventListener("click",async()=>{let g=m.root.querySelector("#ac-new-role").value;m.close();try{await k.patch(`console/users/${encodeURIComponent(t)}`,{role:g}),y("Role updated.","success"),a.rerender()}catch(u){y(u.message,"error")}})});let r=e.querySelector("[data-ac-grant]");r&&r.addEventListener("click",async()=>{let c=[];try{c=((await k.get("console/roles")).catalog||[]).flatMap(w=>w.permissions)}catch{y("The permission catalog could not be loaded.","error");return}let m=new Set(s.permissionOverrides.map(u=>u.permission)),g=H({title:"Grant or deny a permission",subtitle:"Grants and denies sit on top of the role. A deny removes a permission the role carries.",body:`<div class="ac-field">
						<label class="ac-field__label" for="ac-permission">Permission</label>
						<select class="ac-select" id="ac-permission">
							${c.map(u=>`<option value="${u.id}"${m.has(u.id)?" disabled":""}>${u.label} \u2014 ${u.id}</option>`).join("")}
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
				`});g.root.querySelector("[data-ac-cancel]").addEventListener("click",g.close),g.root.querySelector("[data-ac-confirm]").addEventListener("click",async()=>{let u=g.root.querySelector("#ac-permission").value,w=g.root.querySelector("#ac-effect").value,d=g.root.querySelector("#ac-override-reason").value||null;g.close();try{await k.post(`console/users/${encodeURIComponent(t)}/permissions`,{permission:u,effect:w,reason:d}),y("Permission override applied.","success"),a.rerender()}catch(b){y(b.message,"error")}})}),e.querySelectorAll("[data-ac-remove-override]").forEach(c=>{c.addEventListener("click",async()=>{let m=c.dataset.acRemoveOverride;if(await j({title:"Remove this override?",message:`The account returns to the permissions its role carries. "${m}" is no longer individually granted or denied.`,confirmLabel:"Remove override"}))try{await k.del(`console/users/${encodeURIComponent(t)}/permissions/${encodeURIComponent(m)}`),y("Override removed.","success"),a.rerender()}catch(u){y(u.message,"error")}})});let p=e.querySelector("[data-ac-revoke-sessions]");p&&p.addEventListener("click",async()=>{if(await j({title:"Revoke every session of this account?",message:"All sign-ins of this account end immediately. The next sign-in starts a new session.",detail:"The revocation is recorded in the security event trail.",confirmLabel:"Revoke sessions",danger:!0}))try{await k.del(`console/users/${encodeURIComponent(t)}/sessions`),y("Sessions revoked.","success")}catch(m){y(m.message,"error")}});let l=e.querySelector("[data-ac-reset-credential]");l&&l.addEventListener("click",()=>{let c=H({title:"Reset this credential",subtitle:"The account keeps everything except its password. Every live session of the account is revoked and the change is recorded in the audit trail.",body:`<div class="ac-field">
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
				`}),m=c.root.querySelector("#ac-new-password"),g=c.root.querySelector("#ac-generate-password"),u="",w=d=>{g.dataset.mode=d,g.textContent=d==="copy"?"Copy":"Generate",g.title=d==="copy"?"Copy the generated password":"Generate a strong password"};w("generate"),g.addEventListener("click",async()=>{if(g.dataset.mode==="copy"){try{await navigator.clipboard.writeText(m.value),y("Password copied to the clipboard.","success")}catch{m.focus(),m.select();try{document.execCommand("copy"),y("Password copied to the clipboard.","success")}catch{y("The password is selected \u2014 press Ctrl+C to copy it.","error")}}return}u=rn(14),m.value=u,m.focus(),m.select(),w("copy")}),m.addEventListener("input",()=>{g.dataset.mode==="copy"&&m.value!==u&&w("generate")}),c.root.querySelector("[data-ac-cancel]").addEventListener("click",c.close),c.root.querySelector("[data-ac-confirm]").addEventListener("click",async()=>{let d=c.root.querySelector("#ac-new-password").value.trim();if(d.length<8){y("The password must be at least 8 characters.","error");return}try{let b=await k.post(`console/users/${encodeURIComponent(t)}/credential`,{newPassword:d});c.close(),y(`Credential reset. ${b?.data?.revokedSessions||0} session(s) revoked.`,"success")}catch(b){y(b.message,"error")}})});let h=e.querySelector("[data-ac-delete-account]");h&&h.addEventListener("click",async()=>{if(await j({title:`Delete "${n.username}"?`,message:"The account is removed, together with its sessions and its results. This cannot be undone \u2014 suspending the account keeps the record if you only need to end the access.",confirmLabel:"Delete the account",danger:!0}))try{await k.del(`console/users/${encodeURIComponent(t)}`),y("The account was deleted.","success"),window.location.hash="#/users"}catch(m){y(m.message,"error")}})}function rn(e=14){let a="ABCDEFGHJKMNPQRSTUVWXYZ",t="abcdefghijkmnpqrstuvwxyz",n="23456789",s="!@#$%&*+-",o=a+t+n+s,f=p=>{let l=new Uint32Array(1);return crypto.getRandomValues(l),p[l[0]%p.length]},r=[f(a),f(t),f(n),f(s)];for(;r.length<e;)r.push(f(o));for(let p=r.length-1;p>0;p-=1){let l=new Uint32Array(1);crypto.getRandomValues(l);let h=l[0]%(p+1);[r[p],r[h]]=[r[h],r[p]]}return r.join("")}var on=[{id:"overview",path:"/",title:"Overview",icon:"overview",permission:["platform.console","school.console"]},{id:"teaching",path:"/teaching",title:"Teaching & Learning",icon:"analytics",group:"Analytics",permission:["platform.analytics.read","school.analytics.read"]},{id:"analytics",path:"/analytics",title:"Platform Analytics",icon:"analytics",group:"Analytics",permission:["platform.analytics.read","school.analytics.read"]},{id:"organizations",path:"/organizations",title:"Organizations",icon:"organizations",group:"Manage",permission:["platform.organizations.read","school.profile.read"]},{id:"users",path:"/users",title:"Users & Access",icon:"users",group:"Manage",permission:["platform.users.read","school.users.read"]},{id:"audit",path:"/audit",title:"Activity & Audit",icon:"audit",group:"Manage",permission:["platform.audit.read","school.audit.read"]},{id:"health",path:"/health",title:"System Health",icon:"health",group:"Manage",permission:["platform.health.read","school.health.read"]},{id:"settings",path:"/settings",title:"Settings",icon:"settings",group:"Manage",permission:["platform.settings.manage","school.settings.manage"]}],va=[oa,{...oa,id:"overview-alias",path:"/overview"},ct,Xt,lt,mt,gt,ft,as,bt,vt,yt,_t,Zt],Ye=document.getElementById("ac-boot-status"),cn=document.getElementById("ac-boot"),ln=document.getElementById("ac-root");function ts(e,a=""){if(!Ye)return;Ye.textContent=e,Ye.style.color="var(--ac-danger)";let t=Ye.parentElement;if(a){let n=document.createElement("p");n.className="ac-boot__status",n.style.marginTop="10px",n.innerHTML=a,t.appendChild(n)}}var ya=null,xa=null;async function dn(){sa(),Aa(()=>{za()});let e;try{e=await Ea()}catch(l){ts("Could not open the control center.",`${l.message}<br><br><a class="ac-btn ac-btn--primary" href="/admin.html">Go to the sign-in page</a>`);return}if(!e?.user){ts("Could not open the control center.",'<a class="ac-btn ac-btn--primary" href="/admin.html">Go to the sign-in page</a>');return}let a=Ka(ln,{session:e,navItems:on,canAny:Ze,onNavigate:l=>K(l)}),t={canAny:Ze,session:e,organization:e.scope?.organization||null,isPlatform:!!e.scope?.isPlatform,deployment:e.deployment||{},isOffline:!!e.deployment?.isOffline,getState:Ca,setPeriod:(l,h)=>{qa(l,h),wa(a,t,ya)},rerender:()=>wa(a,t,ya),setTitle:(l,h)=>{l&&(a.title.textContent=l),h!==void 0&&(a.description.textContent=h),document.title=`${l||a.title.textContent} \xB7 Control Center`}};Oa(t),Na(va,{notFound:{id:"not-found",path:"/not-found",title:"Page not found",description:"That section does not exist in the control center.",render(l){l.innerHTML=`<div class="ac-empty">
					<p class="ac-empty__title">Page not found</p>
					<p class="ac-empty__message">The address you opened does not match a section of the control center.</p>
					<a class="ac-btn ac-btn--primary" href="#/">Back to the overview</a>
				</div>`}}}),Ra(l=>{ya=l,a.title.textContent=l.title,a.description.textContent=l.description||"",a.setActive(l.path),document.title=`${l.title} \xB7 Control Center`,wa(a,t,l)});let n='<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"></path><polyline points="12 19 5 12 12 5"></polyline></svg>';function s(l){let h=ta();if(!h||Array.from(l.querySelectorAll("a, button")).find(w=>/^←\s/.test(w.textContent.trim())))return;let m=l.querySelector(".ac-toolbar__push");if(!m||m.querySelector(".ac-back-btn"))return;let g=document.createElement("button");g.type="button",g.className="ac-btn ac-back-btn",g.innerHTML=`${n}<span class="ac-back-btn__label">Back</span>`;let u=o(h);u&&(g.title=`Back to ${u}`),g.setAttribute("aria-label",u?`Back to ${u}`:"Back to the previous page"),g.addEventListener("click",()=>ja()),m.prepend(g)}function o(l){let h=String(l||"").replace(/^#/,"").split("?")[0],c=va.find(m=>m.path===h);return c?c.title:h.startsWith("/users/")?"Users & Access":h.startsWith("/organizations/")?"Organizations":null}xa=s;function f(){let l=document.getElementById("ac-global-search"),h=document.getElementById("ac-search-panel"),c=document.getElementById("ac-search-clear");if(!l||!h)return;let m=Ja(va,Ee),g=[],u=-1,w=null,d=()=>{c&&(c.hidden=l.value.length===0)},b=()=>{h.hidden=!0,h.innerHTML="",g=[],u=-1,d()},x=A=>{b(),l.value="",l.blur(),d(),K(A)},T=A=>{g=A,h.innerHTML=A.length?r(A):`<p class="ac-search__empty">Nothing matches \u201C${p(l.value.trim())}\u201D.</p>`,h.hidden=!1,u=-1},E=async()=>{let A=l.value.trim();if(A.length<2){b();return}let M=await Za(A,{places:m,canUsers:t.canAny(["platform.users.read","school.users.read"]),canOrganizations:t.canAny(["platform.organizations.read","school.profile.read"])});l.value.trim()===A&&T(M)};l.addEventListener("input",()=>{d(),clearTimeout(w),w=setTimeout(E,180)}),c?.addEventListener("click",()=>{l.value="",d(),b(),l.focus()}),l.addEventListener("focus",()=>{d(),l.value.trim().length>=2&&E()}),l.addEventListener("keydown",A=>{if(h.hidden){A.key==="Enter"&&l.value.trim().length>=2&&E();return}if(A.key==="ArrowDown")A.preventDefault(),z(1);else if(A.key==="ArrowUp")A.preventDefault(),z(-1);else if(A.key==="Enter"){A.preventDefault();let M=g[u]||g[0];M&&x(M.path)}else A.key==="Escape"&&(A.preventDefault(),b(),l.blur())}),h.addEventListener("mousedown",A=>{let M=A.target.closest("[data-ac-search-path]");M?(A.preventDefault(),x(M.dataset.acSearchPath)):A.preventDefault()}),document.addEventListener("mousedown",A=>{!h.hidden&&!A.target.closest(".ac-search")&&b()});function z(A){g.length&&(u=(u+A+g.length)%g.length,h.querySelectorAll(".ac-search__item").forEach((M,G)=>{M.classList.toggle("is-active",G===u)}))}}function r(l){let h=[];for(let c of l){let m=c.kind==="settings"?"Settings":c.kind==="user"?"Accounts":c.kind==="organization"?"Organizations":"Go to",g=h.find(u=>u.label===m);g||(g={label:m,items:[]},h.push(g)),g.items.push(c)}return h.map(c=>`<p class="ac-search__group">${c.label}</p>${c.items.map(m=>`<button type="button" class="ac-search__item" data-ac-search-path="${p(m.path)}">
									<span class="ac-search__item-title">${p(m.title)}</span>
									${m.sub?`<span class="ac-search__item-sub">${p(m.sub)}</span>`:""}
									<span class="ac-search__badge${m.kind==="user"?" ac-search__badge--user":""}">${p(m.badge||"")}</span>
								</button>`).join("")}`).join("")}function p(l){return String(l??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}f(),Da(),cn.remove()}var _a=0;async function wa(e,a,t){let n=++_a,s=document.createElement("div");s.className="ac-page",e.content.replaceChildren(s),s.innerHTML=`<div class="ac-skeleton-stack" aria-busy="true">
		<div class="ac-skeleton" style="width:40%"></div>
		<div class="ac-skeleton" style="width:100%"></div>
		<div class="ac-skeleton" style="width:80%"></div>
	</div>`;try{if(await t.render(s,a,t),n!==_a)return;xa&&xa(s)}catch(o){if(n!==_a)return;console.error("[console] page render failed",o),s.innerHTML=`<div class="ac-error" role="alert">
			<div>
				<p class="ac-error__title">This section could not be rendered</p>
				<p class="ac-error__message">${o.message}</p>
			</div>
		</div>`}}dn();})();
