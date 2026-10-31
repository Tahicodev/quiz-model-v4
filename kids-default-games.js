/**
 * kids-default-games.js — Built-in Kids Games catalog (3 subjects × 5 games).
 *
 * Ported from the standalone `kids-learning-games` demo. These are GAMES the
 * teacher picks in wizard Step 1 under the French / Arabic / Math cards; the
 * fourth card, "Custom game", leads to the nine original game types.
 *
 * Two consumers, one source of truth:
 *  1. The Kids player — questions are kept in the canonical kid shape
 *     { type, text, options_json, answer } so the existing pipeline grades
 *     them (KidsGameService.checkAnswer), publishes them (PIN) and tracks
 *     results. No schema, no parallel engine, no local score.
 *  2. The quiz app question bank — on first publish the same questions are
 *     filed under `subject › axis` categories (see `subject`/`axis` below)
 *     as ordinary bank rows, so the teacher can edit them, add others and
 *     reuse them in quizzes and exams. `explanation` is what the student
 *     sees after answering, so every question carries one.
 *
 * Answer format contract (KidsGameService.checkAnswer + the kid renderers):
 *  - multiple-choice: answer is one EXACT option label (case-insensitive);
 *  - true-false:      "true" / "false";
 *  - odd-one-out:     the odd option label;
 *  - draggable:       BuildATower submits its blocks joined with ",", graded
 *    case- and spacing-sensitively → the answer must reuse the exact option
 *    strings, in the correct order;
 *  - fill-blank:      MagicWords submits the tapped bank word → the answer
 *    must be one of the bank words.
 * Studio chrome stays English; learning content stays in the subject's own
 * language (French exercises in French, Arabic exercises in Arabic).
 */
(function () {
	'use strict';

	/* Subject cards: palette + mascot drive the Step 1 presentation. */
	var SUBJECTS = [
		{
			id: 'French', icon: '📚', name: 'French',
			blurb: 'Letters, syllables, words, grammar and spelling',
			accent: '#4f46e5', accentSoft: '#818cf8', tint: '#eef2ff',
			mascot: '/kids/assets/mascot-happy.jpg',
		},
		{
			id: 'Arabic', icon: '🌙', name: 'Arabic',
			blurb: 'الحروف والحركات والكلمات — letters, harakat and words',
			accent: '#0d9488', accentSoft: '#2dd4bf', tint: '#ecfdf5',
			mascot: '/kids/assets/mascot-excited.jpg',
		},
		{
			id: 'Math', icon: '🚀', name: 'Math',
			blurb: 'Counting, comparing, ordering, calculating and logic',
			accent: '#ea580c', accentSoft: '#fb923c', tint: '#fff7ed',
			mascot: '/kids/assets/mascot-idle.jpg',
		},
	];

	var FRENCH = [
		{
			id: 'french-alphabet-explorer',
			subject: 'French', axis: 'Alphabet & Letters',
			name: 'Alphabet Explorer', icon: '🔤', tag: 'LETTERS',
			game_type: 'build-a-tower', grade: 'cp', difficulty: 'easy',
			description: 'Put the shuffled letters back in alphabetical order.',
			preview: ['🔤', 'a → z', '🚂'],
			questions: [
				{ type: 'draggable', text: "Remets ces lettres dans l'ordre alphabétique. 🔤", options_json: ['b', 'd', 'f', 'h'], answer: 'b,d,f,h', explanation: "Dans l'alphabet on dit b, puis d, puis f, puis h." },
				{ type: 'draggable', text: "Remets ces lettres dans l'ordre alphabétique. 🔤", options_json: ['m', 'n', 'p', 'q'], answer: 'm,n,p,q', explanation: "L'ordre est m, n, p, q." },
				{ type: 'draggable', text: "Remets ces lettres dans l'ordre alphabétique. 🔤", options_json: ['c', 'e', 'g', 'i'], answer: 'c,e,g,i', explanation: "Après c vient e, puis g, puis i." },
				{ type: 'draggable', text: "Remets ces lettres dans l'ordre alphabétique. 🔤", options_json: ['j', 'l', 'o', 'r'], answer: 'j,l,o,r', explanation: "j est avant l, qui est avant o, qui est avant r." },
				{ type: 'draggable', text: "Remets ces lettres dans l'ordre alphabétique. 🔤", options_json: ['s', 't', 'v', 'z'], answer: 's,t,v,z', explanation: "z est la dernière lettre de l'alphabet." },
			],
		},
		{
			id: 'french-animal-match',
			subject: 'French', axis: 'French Words',
			name: 'Animal Match', icon: '🐾', tag: 'VOCABULARY',
			game_type: 'bubble-pop', grade: 'maternelle', difficulty: 'easy',
			description: 'Look at the animal and pop the bubble with its name.',
			preview: ['🐱', '🐘', '🦋'],
			questions: [
				{ type: 'multiple-choice', text: 'Quel est le nom de cet animal ? 🐱', options_json: ['chat', 'chien', 'lion', 'lapin'], answer: 'chat', explanation: '🐱 est un chat.' },
				{ type: 'multiple-choice', text: 'Quel est le nom de cet animal ? 🐘', options_json: ['éléphant', 'girafe', 'hippopotame', 'rhinocéros'], answer: 'éléphant', explanation: "🐘 est un éléphant : il a une longue trompe." },
				{ type: 'multiple-choice', text: 'Quel est le nom de cet animal ? 🐸', options_json: ['grenouille', 'tortue', 'lézard', 'crabe'], answer: 'grenouille', explanation: '🐸 est une grenouille : elle saute et dit croa croa.' },
				{ type: 'multiple-choice', text: 'Quel est le nom de cet animal ? 🦋', options_json: ['papillon', 'abeille', 'coccinelle', 'mouche'], answer: 'papillon', explanation: '🦋 est un papillon avec de grandes ailes colorées.' },
				{ type: 'multiple-choice', text: 'Quel est le nom de cet animal ? 🐟', options_json: ['poisson', 'canard', 'grenouille', 'mouette'], answer: 'poisson', explanation: '🐟 est un poisson : il nage dans l’eau.' },
			],
		},
		{
			id: 'french-word-builder',
			subject: 'French', axis: 'Syllables',
			name: 'Word Builder', icon: '🧩', tag: 'SYLLABLES',
			game_type: 'build-a-tower', grade: 'cp', difficulty: 'easy',
			description: 'Stack the syllable blocks in the right order to build the word.',
			preview: ['🍌', '🍅', '🍫'],
			questions: [
				{ type: 'draggable', text: 'Assemble les syllabes pour former le mot. 🍌', options_json: ['na', 'ba', 'na'], answer: 'ba,na,na', explanation: 'ba - na - na → banane.' },
				{ type: 'draggable', text: 'Assemble les syllabes pour former le mot. 🍅', options_json: ['ma', 'to', 'to'], answer: 'to,ma,to', explanation: 'to - ma - to → tomate.' },
				{ type: 'draggable', text: 'Assemble les syllabes pour former le mot. 📄', options_json: ['pier', 'pa'], answer: 'pa,pier', explanation: 'pa - pier → papier.' },
				{ type: 'draggable', text: 'Assemble les syllabes pour former le mot. 🐰', options_json: ['pin', 'la'], answer: 'la,pin', explanation: 'la - pin → lapin.' },
				{ type: 'draggable', text: 'Assemble les syllabes pour former le mot. 🍫', options_json: ['co', 'cho', 'lat'], answer: 'cho,co,lat', explanation: 'cho - co - lat → chocolat.' },
			],
		},
		{
			id: 'french-conjugation-challenge',
			subject: 'French', axis: 'Conjugation',
			name: 'Conjugation Challenge', icon: '✍️', tag: 'GRAMMAR',
			game_type: 'magic-words', grade: 'ce1', difficulty: 'medium',
			description: 'Drop the right verb form into the blank of the sentence.',
			preview: ['Je …', 'Nous …', 'Ils …'],
			questions: [
				{ type: 'fill-blank', text: 'Je ___ une pomme. 🍎', options_json: ['manges', 'mange', 'mangent'], answer: 'mange', explanation: 'Avec « je », le verbe manger s’écrit mange.' },
				{ type: 'fill-blank', text: 'Nous ___ à l’école. 🏫', options_json: ['allez', 'allons', 'va'], answer: 'allons', explanation: 'Avec « nous », on écrit allons. Allez, c’est avec « vous ».' },
				{ type: 'fill-blank', text: 'Tu ___ un livre. 📖', options_json: ['lit', 'lis', 'lisez'], answer: 'lis', explanation: 'Avec « tu », lire donne lis. Lit, c’est avec il/elle.' },
				{ type: 'fill-blank', text: 'Ils ___ dans la cour. ⚽', options_json: ['joue', 'jouons', 'jouent'], answer: 'jouent', explanation: 'Avec « ils », le verbe finit par -ent : jouent.' },
				{ type: 'fill-blank', text: 'Elle ___ une chanson. 🎵', options_json: ['chantes', 'chantent', 'chante'], answer: 'chante', explanation: 'Avec « elle », on écrit chante.' },
			],
		},
		{
			id: 'french-spelling-detective',
			subject: 'French', axis: 'Spelling',
			name: 'Spelling Detective', icon: '🔎', tag: 'SPELLING',
			game_type: 'bubble-pop', grade: 'ce2', difficulty: 'medium',
			description: 'Find the word written the right way among the traps.',
			preview: ['🔎', '🐘', '🍫'],
			questions: [
				{ type: 'multiple-choice', text: 'Quelle est la bonne orthographe ? 🔎', options_json: ['éléphant', 'éléfant', 'élélphant'], answer: 'éléphant', explanation: 'éléphant : é-l-é-p-h-a-n-t.' },
				{ type: 'multiple-choice', text: 'Quelle est la bonne orthographe ? 🔎', options_json: ['maison', 'maizon', 'méson'], answer: 'maison', explanation: 'maison s’écrit avec ai : mai-son.' },
				{ type: 'multiple-choice', text: 'Quelle est la bonne orthographe ? 🔎', options_json: ['beaucoup', 'bocoup', 'beaucou'], answer: 'beaucoup', explanation: 'beaucoup prend l, e, a, u, c, o, u, p.' },
				{ type: 'multiple-choice', text: 'Quelle est la bonne orthographe ? 🔎', options_json: ['oiseau', 'oiseux', 'wizeau'], answer: 'oiseau', explanation: 'oiseau : oi-seau, sans x.' },
				{ type: 'multiple-choice', text: 'Quelle est la bonne orthographe ? 🔎', options_json: ['chocolat', 'chocola', 'chokola'], answer: 'chocolat', explanation: 'chocolat finit par -at et commence par cho-.' },
			],
		},
	];

	var ARABIC = [
		{
			id: 'arabic-letter-journey',
			subject: 'Arabic', axis: 'Arabic Letters',
			name: 'Letter Journey', icon: '🪄', tag: 'الحروف',
			game_type: 'bubble-pop', grade: 'cp', difficulty: 'easy',
			description: 'Read the letter named in the question and pop the matching bubble.',
			preview: ['ش', 'ح', 'م'],
			questions: [
				{ type: 'multiple-choice', text: 'اختر الحرف المطلوب: ش', options_json: ['ش', 'س', 'ث', 'ص'], answer: 'ش', explanation: 'الحرف المطلوب هو ش وهو حرف أسنان.' },
				{ type: 'multiple-choice', text: 'اختر الحرف المطلوب: ح', options_json: ['ح', 'ج', 'خ', 'هـ'], answer: 'ح', explanation: 'الحرف ح ليس عليه نقطة ولا نقطة في وسطه.' },
				{ type: 'multiple-choice', text: 'اختر الحرف المطلوب: م', options_json: ['م', 'ن', 'ل', 'و'], answer: 'م', explanation: 'الحرف م له « رأس » صغير في الأعلى.' },
				{ type: 'multiple-choice', text: 'اختر الحرف المطلوب: ت', options_json: ['ت', 'ث', 'ب', 'ن'], answer: 'ت', explanation: 'الحرف ت له نقطتان فوقته.' },
				{ type: 'multiple-choice', text: 'اختر الحرف المطلوب: ص', options_json: ['ص', 'ض', 'س', 'د'], answer: 'ص', explanation: 'الحرف ص يشبه س لكنه طويل.' },
			],
		},
		{
			id: 'arabic-letter-shapes',
			subject: 'Arabic', axis: 'Letter Shapes',
			name: 'Letter Shapes', icon: '🔡', tag: 'أشكال الحروف',
			game_type: 'bubble-pop', grade: 'ce1', difficulty: 'medium',
			description: 'Discover how a letter changes shape inside a word.',
			preview: ['ب', 'ـبـ', 'ع'],
			questions: [
				{ type: 'multiple-choice', text: 'اختر شكل الحرف «ب» في وسط الكلمة', options_json: ['ـبـ', 'بـ', 'ـب', 'ب'], answer: 'ـبـ', explanation: 'في وسط الكلمة يكتب الحرف متصلا من الجانبين: ـبـ.' },
				{ type: 'multiple-choice', text: 'اختر شكل الحرف «ع» في وسط الكلمة', options_json: ['ـعـ', 'عـ', 'ـع', 'ع'], answer: 'ـعـ', explanation: 'شكل «ع» في وسط الكلمة هو ـعـ.' },
				{ type: 'multiple-choice', text: 'اختر شكل الحرف «م» في وسط الكلمة', options_json: ['ـمـ', 'مـ', 'ـم', 'م'], answer: 'ـمـ', explanation: 'شكل «م» في وسط الكلمة هو ـمـ.' },
				{ type: 'multiple-choice', text: 'اختر شكل الحرف «ن» في وسط الكلمة', options_json: ['ـنـ', 'نـ', 'ـن', 'ن'], answer: 'ـنـ', explanation: 'شكل «ن» في وسط الكلمة هو ـنـ.' },
				{ type: 'multiple-choice', text: 'اختر شكل الحرف «س» في وسط الكلمة', options_json: ['ـسـ', 'سـ', 'ـس', 'س'], answer: 'ـسـ', explanation: 'شكل «س» في وسط الكلمة هو ـسـ.' },
			],
		},
		{
			id: 'arabic-short-vowels',
			subject: 'Arabic', axis: 'Harakat',
			name: 'Short Vowels (Harakat)', icon: '🗣️', tag: 'الحركات',
			game_type: 'bubble-pop', grade: 'ce1', difficulty: 'medium',
			description: 'Name the harakah carried by the letter.',
			preview: ['َ', 'ُ', 'ِ'],
			questions: [
				{ type: 'multiple-choice', text: 'ما الحركة في «بَ»؟', options_json: ['فتحة', 'ضمة', 'كسرة', 'سكون'], answer: 'فتحة', explanation: 'الفتحة هي الخط الصغير فوق الحرف: بَ.' },
				{ type: 'multiple-choice', text: 'ما الحركة في «بُ»؟', options_json: ['فتحة', 'ضمة', 'كسرة', 'سكون'], answer: 'ضمة', explanation: 'الضمة هي الواو الصغيرة فوق الحرف: بُ.' },
				{ type: 'multiple-choice', text: 'ما الحركة في «بِ»؟', options_json: ['فتحة', 'ضمة', 'كسرة', 'سكون'], answer: 'كسرة', explanation: 'الكسرة هي الخط الصغير تحت الحرف: بِ.' },
				{ type: 'multiple-choice', text: 'ما الحركة في «بْ»؟', options_json: ['فتحة', 'ضمة', 'كسرة', 'سكون'], answer: 'سكون', explanation: 'السكون هو الحلقة الصغيرة فوق الحرف: بْ.' },
				{ type: 'multiple-choice', text: 'ما الحركة في «مُ»؟', options_json: ['فتحة', 'ضمة', 'كسرة', 'سكون'], answer: 'ضمة', explanation: 'فوق الميم ضمة: مُ.' },
			],
		},
		{
			id: 'arabic-word-builder',
			subject: 'Arabic', axis: 'Arabic Word Building',
			name: 'Build the Word', icon: '🧱', tag: 'الكلمات',
			game_type: 'build-a-tower', grade: 'ce2', difficulty: 'medium',
			description: 'Stack the letters in reading order to build the Arabic word.',
			preview: ['🚪', '✏️', '📖'],
			questions: [
				{ type: 'draggable', text: 'رتّب الحروف لتكوين الكلمة: بَاب 🚪', options_json: ['ا', 'ب', 'ب'], answer: 'ب,ا,ب', explanation: 'نقرأ الكلمة من اليمين إلى اليسار: بَ - ا - ب = بَاب.' },
				{ type: 'draggable', text: 'رتّب الحروف لتكوين الكلمة: قَلَم ✏️', options_json: ['ل', 'ق', 'م'], answer: 'ق,ل,م', explanation: 'قَ - لَ - م = قَلَم.' },
				{ type: 'draggable', text: 'رتّب الحروف لتكوين الكلمة: كِتاب 📖', options_json: ['ت', 'ا', 'ب', 'ك'], answer: 'ك,ت,ا,ب', explanation: 'كِ - تا - ب = كِتَاب.' },
				{ type: 'draggable', text: 'رتّب الحروف لتكوين الكلمة: سَمَك 🐟', options_json: ['م', 'ك', 'س'], answer: 'س,م,ك', explanation: 'سَ - مَ - ك = سَمَك.' },
				{ type: 'draggable', text: 'رتّب الحروف لتكوين الكلمة: نَجْم ⭐', options_json: ['ج', 'م', 'ن'], answer: 'ن,ج,م', explanation: 'نَ - جْ - م = نَجْم.' },
			],
		},
		{
			id: 'arabic-word-world',
			subject: 'Arabic', axis: 'Arabic Words',
			name: 'Word World', icon: '🖼️', tag: 'المفردات',
			game_type: 'bubble-pop', grade: 'cp', difficulty: 'easy',
			description: 'Match each picture to its Arabic word.',
			preview: ['🐱', '🌞', '🏠'],
			questions: [
				{ type: 'multiple-choice', text: 'اختر الكلمة المناسبة للصورة: 🐱', options_json: ['قِطَّة', 'كَلْب', 'حِصان', 'أَسَد'], answer: 'قِطَّة', explanation: 'الصورة تُظهر قطّة 🐱.' },
				{ type: 'multiple-choice', text: 'اختر الكلمة المناسبة للصورة: 🌞', options_json: ['شَمْس', 'قَمَر', 'نَجْم', 'سَحَاب'], answer: 'شَمْس', explanation: '🌞 هي الشَّمس.' },
				{ type: 'multiple-choice', text: 'اختر الكلمة المناسبة للصورة: 📖', options_json: ['كِتاب', 'قَلَم', 'دَفْتَر', 'سَبُّورة'], answer: 'كِتاب', explanation: '📖 كِتاب.' },
				{ type: 'multiple-choice', text: 'اختر الكلمة المناسبة للصورة: 🏠', options_json: ['بَيْت', 'مَدْرَسَة', 'حَدِيقَة', 'سُوق'], answer: 'بَيْت', explanation: '🏠 بَيْت.' },
				{ type: 'multiple-choice', text: 'اختر الكلمة المناسبة للصورة: 🌳', options_json: ['شَجَرَة', 'زَهْرَة', 'وَرْدَة', 'نَخْلَة'], answer: 'شَجَرَة', explanation: '🌳 شَجَرَة.' },
			],
		},
	];

	var MATH = [
		{
			id: 'math-number-explorer',
			subject: 'Math', axis: 'Counting',
			name: 'Number Explorer', icon: '🔢', tag: 'COUNTING',
			game_type: 'bubble-pop', grade: 'maternelle', difficulty: 'easy',
			description: 'Count the objects one by one and pop the right number.',
			preview: ['🍎', '⭐', '🎈'],
			questions: [
				{ type: 'multiple-choice', text: 'Combien y a-t-il de pommes ? 🍎🍎🍎', options_json: ['2', '3', '4', '5'], answer: '3', explanation: 'On compte : 1, 2, 3 → trois pommes.' },
				{ type: 'multiple-choice', text: 'Combien y a-t-il d’étoiles ? ⭐⭐⭐⭐⭐', options_json: ['4', '5', '6', '7'], answer: '5', explanation: '1, 2, 3, 4, 5 → cinq étoiles.' },
				{ type: 'multiple-choice', text: 'Combien y a-t-il de ballons ? 🎈🎈🎈🎈🎈🎈', options_json: ['5', '6', '7', '8'], answer: '6', explanation: 'En comptant un par un, il y a 6 ballons.' },
				{ type: 'multiple-choice', text: 'Combien y a-t-il de grenouilles ? 🐸🐸', options_json: ['1', '2', '3', '4'], answer: '2', explanation: 'Deux grenouilles.' },
				{ type: 'multiple-choice', text: 'Combien y a-t-il de fleurs ? 🌸🌸🌸🌸🌸🌸🌸', options_json: ['6', '7', '8', '9'], answer: '7', explanation: 'En comptant un par un, il y a 7 fleurs.' },
			],
		},
		{
			id: 'math-number-battle',
			subject: 'Math', axis: 'Comparing Numbers',
			name: 'Number Battle', icon: '⚖️', tag: 'COMPARISON',
			game_type: 'bubble-pop', grade: 'cp', difficulty: 'medium',
			description: 'Compare two numbers with the right symbol <, = or >.',
			preview: ['7 … 4', '5 … 9', '6 … 6'],
			questions: [
				{ type: 'multiple-choice', text: 'Compare les deux nombres : 7 … 4', options_json: ['<', '=', '>'], answer: '>', explanation: '7 est plus grand que 4, donc 7 > 4.' },
				{ type: 'multiple-choice', text: 'Compare les deux nombres : 5 … 9', options_json: ['<', '=', '>'], answer: '<', explanation: '5 est plus petit que 9, donc 5 < 9.' },
				{ type: 'multiple-choice', text: 'Compare les deux nombres : 6 … 6', options_json: ['<', '=', '>'], answer: '=', explanation: 'Les deux nombres sont identiques : 6 = 6.' },
				{ type: 'multiple-choice', text: 'Compare les deux nombres : 12 … 17', options_json: ['<', '=', '>'], answer: '<', explanation: '12 vient avant 17 sur la ligne des nombres : 12 < 17.' },
				{ type: 'multiple-choice', text: 'Compare les deux nombres : 20 … 13', options_json: ['<', '=', '>'], answer: '>', explanation: '20 est plus grand que 13 : 20 > 13.' },
			],
		},
		{
			id: 'math-number-train',
			subject: 'Math', axis: 'Ordering Numbers',
			name: 'Number Train', icon: '🚂', tag: 'ORDER',
			game_type: 'build-a-tower', grade: 'ce1', difficulty: 'medium',
			description: 'Arrange the numbers from the smallest to the biggest.',
			preview: ['3,5,7,9', '🚂', '↗'],
			questions: [
				{ type: 'draggable', text: 'Range les nombres du plus petit au plus grand. 🚂', options_json: ['7', '3', '9', '5'], answer: '3,5,7,9', explanation: '3 < 5 < 7 < 9.' },
				{ type: 'draggable', text: 'Range les nombres du plus petit au plus grand. 🚂', options_json: ['12', '8', '15', '10'], answer: '8,10,12,15', explanation: '8 < 10 < 12 < 15.' },
				{ type: 'draggable', text: 'Range les nombres du plus petit au plus grand. 🚂', options_json: ['20', '13', '17', '11'], answer: '11,13,17,20', explanation: '11 < 13 < 17 < 20.' },
				{ type: 'draggable', text: 'Range les nombres du plus petit au plus grand. 🚂', options_json: ['34', '21', '43', '30'], answer: '21,30,34,43', explanation: '21 < 30 < 34 < 43.' },
				{ type: 'draggable', text: 'Range les nombres du plus petit au plus grand. 🚂', options_json: ['55', '39', '47', '62'], answer: '39,47,55,62', explanation: '39 < 47 < 55 < 62.' },
			],
		},
		{
			id: 'math-math-factory',
			subject: 'Math', axis: 'Operations',
			name: 'Math Factory', icon: '🧮', tag: 'CALCULUS',
			game_type: 'bubble-pop', grade: 'ce2', difficulty: 'medium',
			description: 'Solve the additions and the subtractions.',
			preview: ['7+5', '14−6', '12+8'],
			questions: [
				{ type: 'multiple-choice', text: 'Calcule : 7 + 5', options_json: ['11', '12', '13', '14'], answer: '12', explanation: '7 + 5 = 12.' },
				{ type: 'multiple-choice', text: 'Calcule : 14 − 6', options_json: ['7', '8', '9', '11'], answer: '8', explanation: '14 − 6 = 8.' },
				{ type: 'multiple-choice', text: 'Calcule : 9 + 6', options_json: ['13', '14', '15', '16'], answer: '15', explanation: '9 + 6 = 15.' },
				{ type: 'multiple-choice', text: 'Calcule : 17 − 9', options_json: ['6', '7', '8', '9'], answer: '8', explanation: '17 − 9 = 8.' },
				{ type: 'multiple-choice', text: 'Calcule : 12 + 8', options_json: ['18', '19', '20', '21'], answer: '20', explanation: '12 + 8 = 20 : on atteint la dizaine juste.' },
			],
		},
		{
			id: 'math-pattern-detective',
			subject: 'Math', axis: 'Patterns & Logic',
			name: 'Pattern Detective', icon: '🧠', tag: 'LOGIC',
			game_type: 'bubble-pop', grade: 'cm1', difficulty: 'hard',
			description: 'Find the rule of the sequence and the missing number.',
			preview: ['2,4,6', '+2', '…'],
			questions: [
				{ type: 'multiple-choice', text: 'Complète la suite : 2, 4, 6, 8, …', options_json: ['9', '10', '11', '12'], answer: '10', explanation: 'On ajoute 2 à chaque fois : 8 + 2 = 10.' },
				{ type: 'multiple-choice', text: 'Complète la suite : 5, 10, 15, 20, …', options_json: ['21', '24', '25', '30'], answer: '25', explanation: 'On ajoute 5 : 20 + 5 = 25 (la table de 5).' },
				{ type: 'multiple-choice', text: 'Complète la suite : 1, 3, 5, 7, …', options_json: ['8', '9', '10', '11'], answer: '9', explanation: 'Ce sont les nombres impairs : après 7 vient 9.' },
				{ type: 'multiple-choice', text: 'Complète la suite : 10, 20, 30, 40, …', options_json: ['45', '50', '55', '60'], answer: '50', explanation: 'On compte de dix en dix : 40 + 10 = 50.' },
				{ type: 'multiple-choice', text: 'Complète la suite : 3, 6, 9, 12, …', options_json: ['14', '15', '16', '18'], answer: '15', explanation: 'C’est la table de 3 : 12 + 3 = 15.' },
			],
		},
	];

	var GAMES = FRENCH.concat(ARABIC, MATH);
	var BY_ID = {};
	GAMES.forEach(function (g) { BY_ID[g.id] = g; });

	window.KidsDefaultGames = {
		subjects: SUBJECTS,
		list: function () { return GAMES; },
		bySubject: function (id) {
			return GAMES.filter(function (g) { return g.subject === id; });
		},
		get: function (id) { return BY_ID[id] || null; },
		subject: function (id) {
			var found = null;
			SUBJECTS.forEach(function (s) { if (s.id === id) found = s; });
			return found;
		},
		/** Category path a game's questions are filed under in the bank. */
		bankPath: function (id) {
			var g = BY_ID[id];
			return g ? [g.subject, g.axis] : null;
		},
	};
})();
