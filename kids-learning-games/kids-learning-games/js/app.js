(() => {
const $ = s => document.querySelector(s);
const state = {category:"all",game:null,round:0,stars:0,totalStars:Number(localStorage.getItem("klg-stars")||0),selected:[],order:[],question:null,answered:false,roundStars:0};
const animalData=[["🐱","chat"],["🐶","chien"],["🦁","lion"],["🐘","éléphant"],["🐸","grenouille"],["🐰","lapin"],["🐼","panda"],["🦒","girafe"],["🐟","poisson"],["🦋","papillon"]];
const wordData=[[["pa","pier"],"papier"],[["la","pin"],"lapin"],[["ba","na","ne"],"banane"],[["to","ma","te"],"tomate"],[["ca","na","ri"],"canari"],[["cho","co","lat"],"chocolat"]];
const conjugations=[{s:"Je ___ une pomme.",v:"manger",a:"mange",o:["manges","mange","mangent"]},{s:"Nous ___ à l'école.",v:"aller",a:"allons",o:["allez","va","allons"]},{s:"Tu ___ un livre.",v:"lire",a:"lis",o:["lit","lis","lisez"]},{s:"Ils ___ dans la cour.",v:"jouer",a:"jouent",o:["joue","jouons","jouent"]},{s:"Elle ___ une chanson.",v:"chanter",a:"chante",o:["chantes","chantent","chante"]},{s:"Vous ___ rapidement.",v:"courir",a:"courez",o:["court","courons","courez"]}];
const spelling=[["éléphant","éléfant","éléphant"],["maison","maizon","maison"],["beaucoup","bocoup","beaucoup"],["oiseau","oiseux","oiseau"],["toujours","toujour","toujours"],["chocolat","chocola","chocolat"]];
const arLetters=["ا","ب","ت","ث","ج","ح","خ","د","ر","س","ش","ص","ع","ف","ق","ك","ل","م","ن","ه","و","ي"];
const arWords=[["🐱","قِطَّة"],["🐶","كَلْب"],["🌞","شَمْس"],["🌙","قَمَر"],["📖","كِتَاب"],["🏠","بَيْت"],["🌳","شَجَرَة"]];
const arBuild=[["ب","ا","ب","بَاب"],["ق","ل","م","قَلَم"],["ك","ت","ا","ب","كِتَاب"],["س","م","ك","سَمَك"],["ن","ج","م","نَجْم"]];
const shapes=[["ب","بـ","ـبـ","ـب"],["ع","عـ","ـعـ","ـع"],["م","مـ","ـمـ","ـم"],["ن","نـ","ـنـ","ـن"],["س","سـ","ـسـ","ـس"]];
const rand = a => a[Math.floor(Math.random()*a.length)];
const shuffle = a => [...a].sort(()=>Math.random()-.5);
function renderHome(){
 $("#home-view").classList.remove("hidden");$("#game-view").classList.add("hidden");$("#total-stars").textContent=state.totalStars;
 $("#category-grid").innerHTML=CATEGORIES.map(c=>`<button class="category-card ${state.category===c.id?"active":""}" style="--accent:${c.color};--tint:${c.tint}" data-cat="${c.id}"><span class="category-icon">${c.icon}</span><span><strong>${c.name}</strong><small>${c.sub}</small></span><span class="category-arrow">›</span></button>`).join("");
 $("#games-title").textContent=state.category==="all"?"Tous les jeux":CATEGORIES.find(c=>c.id===state.category).name;
 const list=GAMES.filter(g=>state.category==="all"||g.cat===state.category);
 $("#games-grid").innerHTML=list.map(g=>{const c=CATEGORIES.find(x=>x.id===g.cat);return `<article class="game-card" style="--accent:${c.color};--tint:${c.tint}"><div class="game-card-top"><span class="game-emoji">${g.emoji}</span><span class="game-tag">${g.tag}</span></div><h3>${g.title}</h3><p>${g.desc}</p><button class="play-link" data-game="${g.id}">Jouer maintenant →</button></article>`}).join("");
}
function startGame(id){
 state.game=GAMES.find(g=>g.id===id);state.round=0;state.roundStars=0;state.selected=[];state.answered=false;
 $("#home-view").classList.add("hidden");$("#game-view").classList.remove("hidden");
 $("#game-title").textContent=state.game.title;$("#game-subtitle").textContent=state.game.desc;
 $("#game-category-label").textContent=CATEGORIES.find(c=>c.id===state.game.cat).name.toUpperCase();
 $("#activity-area").classList.toggle("rtl",state.game.cat==="ar");nextRound();
}
function nextRound(){
 if(state.round>=5){showComplete();return}
 state.answered=false;state.selected=[];state.order=[];state.question=makeQuestion(state.game.kind);
 $("#round-number").textContent=state.round+1;$("#round-label").textContent=`DÉFI ${state.round+1}`;$("#round-stars").textContent=state.roundStars;
 $("#progress-fill").style.width=`${state.round/5*100}%`;
 $("#feedback").textContent="";$("#feedback").className="feedback";
 $("#check-answer").classList.remove("hidden");$("#check-answer").disabled=false;$("#next-question").classList.add("hidden");
 drawQuestion();
}
function makeQuestion(kind){
 let q={};
 if(kind==="orderLetters"){const start=Math.floor(Math.random()*20);q.answer=[..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].slice(start,start+4);q.items=shuffle(q.answer);q.prompt="Remets ces lettres dans l'ordre alphabétique.";q.mode="order"}
 if(kind==="animal"){const item=rand(animalData);q.prompt="Quel est le nom de cet animal ?";q.visual=item[0];q.answer=item[1];q.items=shuffle([item[1],...shuffle(animalData.filter(x=>x!==item)).slice(0,2).map(x=>x[1])]);q.mode="choice"}
 if(kind==="buildWord"){const item=rand(wordData);q.prompt="Assemble les syllabes pour former le mot.";q.parts=item[0];q.answer=item[1];q.items=shuffle(q.parts);q.mode="build"}
 if(kind==="conjugation"){const x=rand(conjugations);q.prompt=x.s;q.answer=x.a;q.items=shuffle(x.o);q.mode="choice"}
 if(kind==="spelling"){const x=rand(spelling);q.prompt="Quelle est la bonne orthographe ?";q.answer=x[0];q.items=shuffle([x[0],x[1],x[0].slice(0,-1)+"e"]);q.items=[...new Set(q.items)];q.mode="choice"}
 if(kind==="arabicLetter"){q.answer=rand(arLetters);q.prompt="اختر الحرف المطلوب";q.visual="🔤";q.items=shuffle([q.answer,...shuffle(arLetters.filter(x=>x!==q.answer)).slice(0,3)]);q.mode="choice";q.rtl=true}
 if(kind==="arabicShape"){const x=rand(shapes);q.answer=x[2];q.prompt=`اختر شكل الحرف «${x[0]}» في وسط الكلمة`;q.items=shuffle(x.slice(1));q.mode="choice";q.rtl=true}
 if(kind==="harakat"){const x=rand([["بَ","َ","فتحة"],["بُ","ُ","ضمة"],["بِ","ِ","كسرة"],["بْ","ْ","سكون"]]);q.prompt=`ما الحركة في «${x[0]}»؟`;q.answer=x[2];q.items=shuffle(["فتحة","ضمة","كسرة","سكون"]);q.mode="choice";q.rtl=true}
 if(kind==="arabicBuild"){const x=rand(arBuild);q.prompt="رتّب الحروف لتكوين الكلمة";q.answer=x[x.length-1].replace(/[َُِّْٰ]/g,"");q.parts=x.slice(0,-1);q.items=shuffle(q.parts);q.mode="arabicBuild";q.rtl=true}
 if(kind==="arabicVocab"){const x=rand(arWords);q.prompt="اختر الكلمة المناسبة للصورة";q.visual=x[0];q.answer=x[1];q.items=shuffle([x[1],...shuffle(arWords.filter(y=>y!==x)).slice(0,3).map(y=>y[1])]);q.mode="choice";q.rtl=true}
 if(kind==="count"){const n=1+Math.floor(Math.random()*9);q.prompt="Combien y a-t-il d'objets ?";q.visual="🍎 ".repeat(n);q.answer=String(n);q.items=shuffle([n,n+1,Math.max(1,n-1),n+2].map(String));q.mode="choice"}
 if(kind==="compare"){const a=2+Math.floor(Math.random()*30),b=2+Math.floor(Math.random()*30);q.prompt=`Compare ${a} et ${b}.`;q.answer=a>b?">":a<b?"<":"=";q.items=["<","=",">"];q.mode="choice"}
 if(kind==="sortNumbers"){const nums=shuffle(Array.from({length:4},()=>1+Math.floor(Math.random()*50)));q.prompt="Range les nombres du plus petit au plus grand.";q.answer=[...nums].sort((a,b)=>a-b).map(String);q.items=nums.map(String);q.mode="order"}
 if(kind==="operation"){const a=1+Math.floor(Math.random()*20),b=1+Math.floor(Math.random()*Math.min(10,a));const op=Math.random()>.5?"+":"−";q.prompt="Calcule le résultat.";q.equation=`${a} ${op} ${b} = ?`;q.answer=String(op==="+"?a+b:a-b);q.items=shuffle([q.answer,String(Number(q.answer)+1),String(Math.max(0,Number(q.answer)-2)),String(Number(q.answer)+3)]);q.mode="choice"}
 if(kind==="sequence"){const step=rand([2,3,5,10]),a=1+Math.floor(Math.random()*8);q.prompt="Quel nombre complète cette suite ?";q.visual="";q.sequence=[a,a+step,a+2*step,"?",a+4*step];q.answer=String(a+3*step);q.items=shuffle([q.answer,String(a+2*step),String(a+4*step),String(a+3*step+step)]);q.mode="choice"}
 return q;
}
function drawQuestion(){
 const q=state.question,area=$("#activity-area");
 let html=`<h2 class="prompt">${q.prompt}</h2>`;
 if(q.visual)html+=`<div class="visual-emoji">${q.visual}</div>`;
 if(q.equation)html+=`<div class="math-equation">${q.equation}</div>`;
 if(q.sequence)html+=`<div class="options">${q.sequence.map(n=>`<span class="option" style="cursor:default">${n}</span>`).join("")}</div>`;
 if(q.mode==="choice")html+=`<div class="options">${q.items.map((x,i)=>`<button class="option" data-value="${escapeAttr(x)}">${x}</button>`).join("")}</div>`;
 if(q.mode==="order")html+=`<p class="subprompt">Choisis les éléments dans le bon ordre.</p><div class="sort-list" id="sort-list">${q.items.map((x,i)=>`<button class="sort-item" data-index="${i}">${x}</button>`).join("")}</div><div class="word-slots" id="answer-slots"></div>`;
 if(q.mode==="build"||q.mode==="arabicBuild")html+=`<div class="word-slots" id="answer-slots">${q.parts.map(()=>`<div class="word-slot"></div>`).join("")}</div><div class="builder-pieces">${q.items.map((x,i)=>`<button class="piece" data-piece="${i}">${x}</button>`).join("")}</div>`;
 area.innerHTML=html;
 area.querySelectorAll("[data-value]").forEach(b=>b.addEventListener("click",()=>{if(state.answered)return;area.querySelectorAll("[data-value]").forEach(x=>x.classList.remove("selected"));b.classList.add("selected");state.selected=[b.dataset.value]}));
 area.querySelectorAll("[data-index]").forEach(b=>b.addEventListener("click",()=>{if(state.answered)return;const idx=Number(b.dataset.index);if(state.selected.includes(idx))return;state.selected.push(idx);b.classList.add("selected");$("#answer-slots").innerHTML=state.selected.map(i=>`<span class="word-slot filled">${q.items[i]}</span>`).join("")}));
 area.querySelectorAll("[data-piece]").forEach(b=>b.addEventListener("click",()=>{if(state.answered||b.disabled)return;state.selected.push(Number(b.dataset.piece));b.disabled=true;const slots=[...area.querySelectorAll(".word-slot")];const slot=slots[state.selected.length-1];if(slot){slot.textContent=b.textContent;slot.classList.add("filled")}}));
}
function check(){
 if(state.answered)return;const q=state.question;let correct=false;
 if(q.mode==="choice")correct=state.selected.length===1&&state.selected[0]===String(q.answer);
 if(q.mode==="order")correct=state.selected.length===q.items.length&&state.selected.map(i=>q.items[i]).join("|")===q.answer.join("|");
 if(q.mode==="build"||q.mode==="arabicBuild")correct=state.selected.map(i=>q.items[i]).join("")===q.answer.replace(/\s/g,"");
 state.answered=true;$("#check-answer").classList.add("hidden");$("#next-question").classList.remove("hidden");
 const fb=$("#feedback");fb.className="feedback "+(correct?"good":"try");
 if(correct){state.roundStars++;state.totalStars++;localStorage.setItem("klg-stars",state.totalStars);fb.textContent=rand(["Bravo ! Tu as trouvé ! ⭐","Excellent travail ! 🎉","Super, continue comme ça ! 🌟","Bonne réponse ! Tu es formidable !"]);$("#round-stars").textContent=state.roundStars;$("#total-stars").textContent=state.totalStars}
 else{fb.textContent=`Presque ! La bonne réponse était : ${Array.isArray(q.answer)?q.answer.join(" → "):q.answer} 💛`}
}
function showComplete(){
 $("#progress-fill").style.width="100%";$("#activity-area").innerHTML=`<div class="complete"><div class="trophy">🏆</div><h2>Défi terminé !</h2><p>Tu as terminé cette série de cinq défis.</p><div class="stars">${"⭐".repeat(Math.max(1,Math.min(5,state.roundStars)))}</div><strong>${state.roundStars} / 5 bonnes réponses</strong></div>`;
 $("#feedback").textContent="Tu progresses à chaque essai !";$("#check-answer").classList.add("hidden");$("#next-question").textContent="Rejouer ↻";$("#next-question").classList.remove("hidden");$("#next-question").onclick=()=>startGame(state.game.id);
}
function escapeAttr(s){return String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;")}
$("#category-grid").addEventListener("click",e=>{const b=e.target.closest("[data-cat]");if(b){state.category=b.dataset.cat;renderHome()}});
$("#games-grid").addEventListener("click",e=>{const b=e.target.closest("[data-game]");if(b)startGame(b.dataset.game)});
$("#show-all").addEventListener("click",()=>{state.category="all";renderHome()});
$("#back-home").addEventListener("click",renderHome);
$("#check-answer").addEventListener("click",check);
$("#next-question").addEventListener("click",()=>{state.round++;nextRound()});
renderHome();

/* API d'intégration facultative : le moteur de l'application hôte reste responsable du score officiel. */
window.KidsLearningGames={
 version:"1.0.0",
 mount({root,engine,config}={}){
   if(root && root!==document.body){root.innerHTML="";const frame=document.createElement("iframe");frame.src=(config&&config.baseUrl?config.baseUrl:"")+"index.html";frame.title="Kids Learning Games";frame.style.cssText="width:100%;min-height:900px;border:0;border-radius:18px";root.appendChild(frame)}
   return {destroy(){if(root)root.innerHTML=""},version:"1.0.0"};
 },
 getCatalog(){return GAMES.map(({id,cat,title,kind,desc})=>({id,category:cat,title,kind,description:desc}))}
};
})();