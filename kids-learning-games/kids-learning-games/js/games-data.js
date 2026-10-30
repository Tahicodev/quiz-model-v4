/* Catalogue des 15 activités. Les questions sont générées dans app.js. */
window.GAMES = [
{id:"alphabet",cat:"fr",title:"Alphabet Explorer",emoji:"🔤",tag:"LETTRES",desc:"Retrouve les lettres manquantes et remets l'alphabet en ordre.",kind:"orderLetters"},
{id:"animals",cat:"fr",title:"Animal Match",emoji:"🐾",tag:"VOCABULAIRE",desc:"Observe les animaux et retrouve leur nom.",kind:"animal"},
{id:"words",cat:"fr",title:"Word Builder",emoji:"🧩",tag:"SYLLABES",desc:"Assemble les syllabes pour former le bon mot.",kind:"buildWord"},
{id:"conjugation",cat:"fr",title:"Conjugaison Challenge",emoji:"✍️",tag:"GRAMMAIRE",desc:"Choisis la bonne forme du verbe dans une phrase.",kind:"conjugation"},
{id:"spelling",cat:"fr",title:"Orthographe Detective",emoji:"🔎",tag:"ORTHOGRAPHE",desc:"Trouve l'écriture correcte du mot.",kind:"spelling"},
{id:"arabic-letters",cat:"ar",title:"رحلة الحروف",emoji:"🪄",tag:"الحروف",desc:"تعرّف على الحروف العربية واختر الحرف الصحيح.",kind:"arabicLetter"},
{id:"arabic-shapes",cat:"ar",title:"أشكال الحروف",emoji:"🔡",tag:"أشكال",desc:"اكتشف شكل الحرف في أول الكلمة ووسطها وآخرها.",kind:"arabicShape"},
{id:"harakat",cat:"ar",title:"الحركات",emoji:"🗣️",tag:"الضبط",desc:"اختر الحركة المناسبة للحرف.",kind:"harakat"},
{id:"arabic-build",cat:"ar",title:"ابنِ الكلمة",emoji:"🧱",tag:"الكلمات",desc:"رتّب الحروف لتكوين كلمة عربية صحيحة.",kind:"arabicBuild"},
{id:"arabic-vocab",cat:"ar",title:"عالم المفردات",emoji:"🖼️",tag:"المفردات",desc:"اربط الصورة بالكلمة العربية المناسبة.",kind:"arabicVocab"},
{id:"counting",cat:"math",title:"Number Explorer",emoji:"🔢",tag:"NOMBRES",desc:"Compte les objets et choisis le bon nombre.",kind:"count"},
{id:"compare",cat:"math",title:"Number Battle",emoji:"⚖️",tag:"COMPARAISON",desc:"Compare deux nombres avec le bon symbole.",kind:"compare"},
{id:"ordering",cat:"math",title:"Number Train",emoji:"🚂",tag:"ORDRE",desc:"Range les nombres du plus petit au plus grand.",kind:"sortNumbers"},
{id:"operations",cat:"math",title:"Math Factory",emoji:"🧮",tag:"CALCUL",desc:"Résous des additions et des soustractions.",kind:"operation"},
{id:"patterns",cat:"math",title:"Puzzle des nombres",emoji:"🧠",tag:"LOGIQUE",desc:"Observe la suite et trouve le nombre manquant.",kind:"sequence"}
];
window.CATEGORIES = [
{id:"fr",name:"Français",sub:"Lettres, mots et grammaire",icon:"📚",color:"#ef8b55",tint:"#fff0e6"},
{id:"ar",name:"العربية",sub:"الحروف والكلمات والقراءة",icon:"🌙",color:"#279b82",tint:"#e5f8f1"},
{id:"math",name:"Mathématiques",sub:"Nombres, calcul et logique",icon:"🚀",color:"#5e60d8",tint:"#eeedff"}
];