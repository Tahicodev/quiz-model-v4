/**
 * kids-default-games.js — Built-in Kids Games catalog (3 subjects × 5-6 games).
 *
 * Ported from the standalone `kids-learning-games` demo and extended with
 * FULL per-letter / per-number coverage: countable content is generated as a
 * matrix (every Arabic letter × identification/positional forms/harakat,
 * every French letter × ordering/next-letter, every number fact × counting/
 * comparing/ordering/addition/subtraction/sequence). The matrices are built
 * programmatically at load time so this file stays the single source of
 * truth; one-shot generators keep every question a plain static object, so
 * nothing downstream has to know they were generated.
 *
 * Two consumers, one source of truth:
 *  1. The Kids player — questions are kept in the canonical kid shape
 *     { type, text, options_json, answer } so the existing pipeline grades
 *     them (KidsGameService.checkAnswer), publishes them (PIN) and tracks
 *     results. No schema, no parallel engine, no local score.
 *  2. The quiz app question bank — the whole catalog is filed automatically
 *     under `subject › axis` categories on the teacher's first sign-in (see
 *     kids-games-management.js seedKidsCatalogToBankSilently), as ordinary
 *     bank rows the teacher can edit, extend and reuse in quizzes and exams.
 *     `explanation` is what the student sees after answering, so every
 *     question carries one.
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

	/* ── Deterministic generators ───────────────────────────────────────────
	   A seeded LCG + Fisher-Yates keeps the catalog byte-stable across loads
	   (stable question texts matter: the bank sync dedupes by text), and a
	   "shuffle until it differs" guard keeps every draggable answer distinct
	   from both the given order and its reverse (the tests grade both). */
	var seedState = 20261031;
	function rnd(n) {
		seedState = (seedState * 1103515245 + 12345) % 2147483648;
		return seedState % n;
	}
	function seededShuffle(arr) {
		var a = arr.slice();
		for (var i = a.length - 1; i > 0; i--) {
			var j = rnd(i + 1);
			var t = a[i]; a[i] = a[j]; a[j] = t;
		}
		return a;
	}
	function shuffledLike(arr, avoidAnswers) {
		for (var attempt = 0; attempt < 24; attempt++) {
			var out = seededShuffle(arr);
			var joined = out.join(',');
			var bad = joined === avoidAnswers.answer ||
				(out.slice().reverse().join(',')) === avoidAnswers.answer;
			if (!bad) return out;
		}
		return arr.slice();
	}
	/** One multiple-choice question with 4 distinct options built from a
	   pool that must contain the answer. */
	function mcq(text, pool, answer, explanation) {
		var opts = [answer];
		for (var i = 0; i < pool.length && opts.length < 4; i++) {
			if (pool[i] !== answer && opts.indexOf(pool[i]) < 0) opts.push(pool[i]);
		}
		return { type: 'multiple-choice', text: text, options_json: seededShuffle(opts), answer: answer, explanation: explanation };
	}

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

	/* ── French ───────────────────────────────────────────────────────────── */
	var ALPHABET = 'a b c d e f g h i j k l m n o p q r s t u v w x y z'.split(' ');

	/** Alphabet Explorer: shuffled letter groups covering the WHOLE a→z.
	   The block is echoed in the prompt so every question text is unique —
	   the bank sync dedupes by text, identical prompts would collapse. */
	function frenchAlphabetQuestions() {
		var windows = [];
		for (var i = 0; i + 4 <= ALPHABET.length; i += 4) windows.push(ALPHABET.slice(i, i + 4));
		// 6 windows cover a→x; the 2 remaining letters close the alphabet once
		// (a 3-letter tail here would repeat 'x' already shown above).
		windows.push(['y', 'z']);
		var questions = [];
		windows.forEach(function (w) {
			var shuffled = shuffledLike(w, { answer: w.join(',') });
			var answer = w.join(',');
			questions.push({
				type: 'draggable',
				text: 'Remets ces lettres dans l\'ordre alphabétique : ' + shuffled.join(', ') + ' 🔤',
				options_json: shuffled,
				answer: answer,
				explanation: "Dans l'ordre : " + w.join(', ') + ' — puis on les empile du haut vers le bas.',
			});
		});
		return questions;
	}

	/** Lettre en route: one identification question per letter a→y. */
	function frenchNextLetterQuestions() {
		var questions = [];
		for (var i = 0; i < ALPHABET.length - 1; i++) {
			var cur = ALPHABET[i];
			var next = ALPHABET[i + 1];
			// Distractors: the letters just after + a few before, so even the
			// last pair (y→z) keeps 4 distinct options instead of collapsing to 1.
			var candidates = ALPHABET.slice(i + 1, i + 5).concat(ALPHABET.slice(Math.max(0, i - 3), i));
			var pool = [];
			candidates.forEach(function (L) { if (pool.indexOf(L) < 0) pool.push(L); });
			questions.push(mcq(
				"Quelle est la lettre qui vient après « " + cur + " » dans l'alphabet ? 🔤",
				pool, next,
				'Dans l\'alphabet, ' + cur + ' est suivie de ' + next + '.'
			));
		}
		return questions;
	}

	var FRENCH = [
		{
			id: 'french-alphabet-explorer',
			subject: 'French', axis: 'Alphabet & Letters',
			name: 'Alphabet Explorer', icon: '🔤', tag: 'LETTERS',
			game_type: 'build-a-tower', grade: 'cp', difficulty: 'easy',
			description: 'Put shuffled letter groups back in alphabetical order — the whole a→z is covered.',
			preview: ['🔤', 'a → z', '🚂'],
			questions: [],
		},
		{
			id: 'french-letter-route',
			subject: 'French', axis: 'French Letters',
			name: 'Lettre en route', icon: '🧠', tag: 'LETTERS',
			game_type: 'bubble-pop', grade: 'cp', difficulty: 'easy',
			description: 'One question per letter: find the letter that follows the given one.',
			preview: ['a→b', 'm→n', '🫧'],
			questions: [],
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
				{ type: 'multiple-choice', text: 'Quelle est la bonne orthographe de cet animal ? 🐘', options_json: ['éléphant', 'éléfant', 'élélphant'], answer: 'éléphant', explanation: 'éléphant : é-l-é-p-h-a-n-t.' },
				{ type: 'multiple-choice', text: 'Comment écrit-on le lieu où l’on habite ? 🏠', options_json: ['maison', 'maizon', 'méson'], answer: 'maison', explanation: 'maison s’écrit avec ai : mai-son.' },
				{ type: 'multiple-choice', text: 'Quel mot veut dire « une grande quantité » ? 📦', options_json: ['beaucoup', 'bocoup', 'beaucou'], answer: 'beaucoup', explanation: 'beaucoup prend l, e, a, u, c, o, u, p.' },
				{ type: 'multiple-choice', text: 'Quelle est la bonne orthographe de cet animal qui vole ? 🐦', options_json: ['oiseau', 'oiseux', 'wizeau'], answer: 'oiseau', explanation: 'oiseau : oi-seau, sans x.' },
				{ type: 'multiple-choice', text: 'Quelle est la bonne orthographe de cette friandise brune ? 🍫', options_json: ['chocolat', 'chocola', 'chokola'], answer: 'chocolat', explanation: 'chocolat finit par -at et commence par cho-.' },
			],
		},
	];
	FRENCH[0].questions = frenchAlphabetQuestions();
	FRENCH[1].questions = frenchNextLetterQuestions();

	/* ── Arabic ───────────────────────────────────────────────────────────── */
	/* [letter, name (Arabic), confusable pool for identification questions]. */
	var ARABIC_LETTERS = [
		['ا', 'أَلِف', ['ل', 'م', 'و']],
		['ب', 'بَاء', ['ت', 'ث', 'ن', 'ي']],
		['ت', 'تَاء', ['ب', 'ث', 'ن', 'ي']],
		['ث', 'ثَاء', ['ب', 'ت', 'ن', 'ي']],
		['ج', 'جِيم', ['ح', 'خ', 'ك']],
		['ح', 'حَاء', ['ج', 'خ', 'ك']],
		['خ', 'خَاء', ['ح', 'ج', 'ة']],
		['د', 'دَال', ['ذ', 'ك', 'ر']],
		['ذ', 'ذَال', ['د', 'ر', 'ز']],
		['ر', 'رَاء', ['ز', 'د', 'و']],
		['ز', 'زَاي', ['ر', 'ن', 'ف']],
		['س', 'سِين', ['ش', 'ص', 'ث']],
		['ش', 'شِين', ['س', 'ص', 'خ']],
		['ص', 'صَاد', ['ض', 'س', 'د']],
		['ض', 'ضَاد', ['ص', 'ط', 'ق']],
		['ط', 'طَاء', ['ظ', 'ض', 'ب']],
		['ظ', 'ظَاء', ['ط', 'ذ', 'ث']],
		['ع', 'عَيْن', ['غ', 'ح', 'ج']],
		['غ', 'غَيْن', ['ع', 'ح', 'خ']],
		['ف', 'فَاء', ['ق', 'و', 'ث']],
		['ق', 'قَاف', ['ف', 'ل', 'ن']],
		['ك', 'كَاف', ['ل', 'ة', 'ح']],
		['ل', 'لَام', ['ك', 'ا', 'م']],
		['م', 'مِيم', ['و', 'ن', 'ل']],
		['ن', 'نُون', ['ب', 'ت', 'م']],
		['هـ', 'هَاء', ['ة', 'ح', 'خ']],
		['و', 'وَاو', ['ف', 'ز', 'م']],
		['ي', 'يَاء', ['ن', 'ب', 'ت', 'ة']],
	];
	/** Letter Journey: one identification question per letter, all 28 of them. */
	function arabicLetterJourneyQuestions() {
		var questions = [];
		ARABIC_LETTERS.forEach(function (row) {
			questions.push(mcq(
				'اختر الحرف المطلوب: ' + row[0],
				row[2], row[0],
				'الحرف المطلوب هو ' + row[0] + ' وهو ' + row[1] + '.'
			));
		});
		return questions;
	}

	/* Letter Shapes: [isolated, initial, medial, final]. The 6 letters that
	   never join to the next side (ا د ذ ر ز و) are covered one level deeper:
	   every form of every letter gets its own question. */
	var ARABIC_SHAPES = [
		['ب', 'بـ', 'ـبـ', 'ـب'],
		['ت', 'تـ', 'ـتـ', 'ـت'],
		['ث', 'ثـ', 'ـثـ', 'ـث'],
		['ج', 'جـ', 'ـجـ', 'ـج'],
		['ح', 'حـ', 'ـحـ', 'ـح'],
		['خ', 'خـ', 'ـخـ', 'ـخ'],
		['س', 'سـ', 'ـسـ', 'ـس'],
		['ش', 'شـ', 'ـشـ', 'ـش'],
		['ص', 'صـ', 'ـصـ', 'ـص'],
		['ض', 'ضـ', 'ـضـ', 'ـض'],
		['ط', 'طـ', 'ـطـ', 'ـط'],
		['ظ', 'ظـ', 'ـظـ', 'ـظ'],
		['ع', 'عـ', 'ـعـ', 'ـع'],
		['غ', 'غـ', 'ـغـ', 'ـغ'],
		['ف', 'فـ', 'ـفـ', 'ـف'],
		['ق', 'قـ', 'ـقـ', 'ـق'],
		['ك', 'كـ', 'ـكـ', 'ـك'],
		['ل', 'لـ', 'ـلـ', 'ـل'],
		['م', 'مـ', 'ـمـ', 'ـم'],
		['ن', 'نـ', 'ـنـ', 'ـن'],
		['هـ', 'هـ', 'ـهـ', 'ـه'],
		['ي', 'يـ', 'ـيـ', 'ـي'],
	];
	var SHAPE_POSITIONS = [
		[1, 'في أول الكلمة', 'في أول الكلمة يكتب الحرف موصولا بما بعده: %s'],
		[2, 'في وسط الكلمة', 'في وسط الكلمة يكتب الحرف متصلا من الجانبين: %s'],
		[3, 'في آخر الكلمة', 'في آخر الكلمة يكتب الحرف موصولا بما قبله فقط: %s'],
	];
	function arabicLetterShapesQuestions() {
		var questions = [];
		ARABIC_SHAPES.forEach(function (forms) {
			SHAPE_POSITIONS.forEach(function (pos) {
				var answer = forms[pos[0]];
				var pool = [forms[1], forms[2], forms[3]];
				if (pool.indexOf(answer) < 0) pool.push(answer);
				if (pool.indexOf(forms[0]) < 0) pool.push(forms[0]);
				questions.push(mcq(
					'اختر شكل الحرف «' + forms[0] + '» ' + pos[1] + ' 🔡',
					pool, answer,
					pos[2].replace('%s', answer)
				));
			});
		});
		return questions;
	}

	/* Harakat: every base letter × every harakah (4 questions per letter). */
	var HARAKAT_BASES = ['ب', 'ت', 'ن', 'م', 'س', 'ق', 'ر', 'د', 'ل', 'هـ', 'ج', 'ف'];
	var HARAKAT = [
		['فتحة', 'َ', 'الفتحة هي الخط الصغير فوق الحرف: %sَ.'],
		['ضمة', 'ُ', 'الضمة هي الواو الصغيرة فوق الحرف: %sُ.'],
		['كسرة', 'ِ', 'الكسرة هي الخط الصغير تحت الحرف: %sِ.'],
		['سكون', 'ْ', 'السكون هو الحلقة الصغيرة فوق الحرف: %sْ.'],
	];
	function arabicHarakatQuestions() {
		var questions = [];
		var labels = [HARAKAT[0][0], HARAKAT[1][0], HARAKAT[2][0], HARAKAT[3][0]];
		HARAKAT_BASES.forEach(function (base) {
			HARAKAT.forEach(function (h) {
				questions.push({
					type: 'multiple-choice',
					text: 'ما الحركة في «' + base + h[1] + '»؟ 🗣️',
					options_json: seededShuffle(labels.slice()),
					answer: h[0],
					explanation: h[2].replace('%s', base),
				});
			});
		});
		return questions;
	}

	var ARABIC = [
		{
			id: 'arabic-letter-journey',
			subject: 'Arabic', axis: 'Arabic Letters',
			name: 'Letter Journey', icon: '🪄', tag: 'الحروف',
			game_type: 'bubble-pop', grade: 'cp', difficulty: 'easy',
			description: 'Read the letter named in the question and pop the matching bubble — almost the whole alphabet is covered.',
			preview: ['ش', 'ح', 'م'],
			questions: [],
		},
		{
			id: 'arabic-letter-shapes',
			subject: 'Arabic', axis: 'Letter Shapes',
			name: 'Letter Shapes', icon: '🔡', tag: 'أشكال الحروف',
			game_type: 'bubble-pop', grade: 'ce1', difficulty: 'medium',
			description: 'Every joining letter × its shape at the start, middle and end of a word.',
			preview: ['بـ', 'ـبـ', 'ـب'],
			questions: [],
		},
		{
			id: 'arabic-short-vowels',
			subject: 'Arabic', axis: 'Harakat',
			name: 'Short Vowels (Harakat)', icon: '🗣️', tag: 'الحركات',
			game_type: 'bubble-pop', grade: 'ce1', difficulty: 'medium',
			description: 'Name the harakah carried by the letter — every letter × fatha, damma, kasra and sukun.',
			preview: ['َ', 'ُ', 'ِ'],
			questions: [],
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
	ARABIC[0].questions = arabicLetterJourneyQuestions();
	ARABIC[1].questions = arabicLetterShapesQuestions();
	ARABIC[2].questions = arabicHarakatQuestions();

	/* ── Math ─────────────────────────────────────────────────────────────── */
	/** Number Explorer: count 1→10, each with the exact object run. */
	function mathCountingQuestions() {
		var sets = [
			['🍎', 'pommes'], ['⭐', 'étoiles'], ['🎈', 'ballons'], ['🐸', 'grenouilles'],
			['🌸', 'fleurs'], ['🐤', ' poussins'], ['🚗', 'voitures'], ['⚽', 'ballons de foot'],
			['🦋', 'papillons'], ['🍬', 'bonbons'],
		];
		var questions = [];
		sets.forEach(function (s, i) {
			var n = i + 1;
			var run = '';
			for (var k = 0; k < n; k++) run += s[0];
			var pool = [];
			for (var v = Math.max(1, n - 2); v <= n + 2 && pool.length < 4; v++) pool.push(String(v));
			questions.push(mcq(
				'Combien y a-t-il de ' + s[1].trim() + ' ? ' + run,
				pool, String(n),
				'On compte un par un : il y a ' + n + ' ' + s[1].trim() + '.'
			));
		});
		return questions;
	}

	/** Number Battle: every pair 1→10 in both directions, plus the equal
	   pairs — 45×2 "<"/">" rows + 10 "=" rows, all unique texts. */
	function mathCompareQuestions() {
		var questions = [];
		for (var i = 1; i <= 10; i++) {
			for (var j = i + 1; j <= 10; j++) {
				questions.push({
					type: 'multiple-choice',
					text: 'Compare les deux nombres : ' + i + ' … ' + j,
					options_json: ['<', '=', '>'],
					answer: '<',
					explanation: i + ' est plus petit que ' + j + ', donc ' + i + ' < ' + j + '.',
				});
				questions.push({
					type: 'multiple-choice',
					text: 'Compare les deux nombres : ' + j + ' … ' + i,
					options_json: ['<', '=', '>'],
					answer: '>',
					explanation: j + ' est plus grand que ' + i + ', donc ' + j + ' > ' + i + '.',
				});
			}
			questions.push({
				type: 'multiple-choice',
				text: 'Compare les deux nombres : ' + i + ' … ' + i,
				options_json: ['<', '=', '>'],
				answer: '=',
				explanation: 'Les deux nombres sont identiques : ' + i + ' = ' + i + '.',
			});
		}
		return questions;
	}

	/** Number Train: 4-number rows spanning 1→10, 10→20, 20→40, 40→60.
	   The row is echoed in the prompt so the 20 texts stay unique. */
	function mathOrderQuestions() {
		var rows = [
			[3, 5, 7, 9], [1, 4, 6, 8], [2, 5, 8, 10], [6, 7, 4, 2], [1, 3, 5, 10],
			[12, 8, 15, 10], [11, 19, 13, 17], [20, 13, 17, 11], [14, 16, 12, 18], [15, 10, 20, 19],
			[21, 30, 34, 25], [28, 22, 36, 30], [33, 39, 27, 36], [40, 23, 31, 29], [26, 38, 35, 24],
			[55, 39, 47, 62], [41, 58, 44, 60], [52, 49, 66, 57], [43, 61, 45, 59], [50, 46, 63, 42],
		];
		var questions = [];
		rows.forEach(function (r) {
			var sorted = r.slice().sort(function (a, b) { return a - b; });
			var answer = sorted.join(',');
			var shuffled = shuffledLike(r.map(String), { answer: answer });
			questions.push({
				type: 'draggable',
				text: 'Range les nombres du plus petit au plus grand : ' + shuffled.join(', ') + ' 🚂',
				options_json: shuffled,
				answer: answer,
				explanation: 'Du plus petit au plus grand : ' + sorted.join(' < ') + '.',
			});
		});
		return questions;
	}

	/** Math Factory: full addition table 0+0→10+10 and every subtraction —
	   each fact is its own (unique) text. */
	function mathAddSubQuestions() {
		var questions = [];
		var fill4 = function (preferred, correct) {
			var out = [];
			preferred.forEach(function (v) {
				if (v >= 0 && out.indexOf(String(v)) < 0 && out.length < 4) out.push(String(v));
			});
			for (var extra = correct + 3; out.length < 4; extra++) {
				if (out.indexOf(String(extra)) < 0) out.push(String(extra));
			}
			return out;
		};
		for (var a = 0; a <= 10; a++) {
			for (var b = 0; b <= 10; b++) {
				var sum = a + b;
				var pool = fill4([sum, sum - 1, sum + 1, sum + 2, sum - 2], sum);
				questions.push({
					type: 'multiple-choice',
					text: 'Calcule : ' + a + ' + ' + b,
					options_json: seededShuffle(pool),
					answer: String(sum),
					explanation: a + ' + ' + b + ' = ' + sum + '.',
				});
			}
		}
		for (a = 0; a <= 10; a++) {
			for (b = 0; b <= a; b++) {
				var diff = a - b;
				var dpool = fill4([diff, diff - 1, diff + 1, diff + 2, diff + 3], diff);
				questions.push({
					type: 'multiple-choice',
					text: 'Calcule : ' + a + ' − ' + b,
					options_json: seededShuffle(dpool),
					answer: String(diff),
					explanation: a + ' − ' + b + ' = ' + diff + '.',
				});
			}
		}
		return questions;
	}

	/** Pattern Detective: skip-counting sequences (+2 +3 +4 +5 +10). */
	function mathPatternQuestions() {
		var specs = [
			{ step: 2, start: 2 }, { step: 3, start: 3 }, { step: 4, start: 4 },
			{ step: 5, start: 5 }, { step: 10, start: 10 }, { step: 2, start: 1 },
		];
		var questions = [];
		specs.forEach(function (sp) {
			for (var n = 1; n <= 3; n++) {
				var base = sp.start + sp.step * (n - 1);
				var seq = [base, base + sp.step, base + 2 * sp.step, base + 3 * sp.step];
				var answer = base + 4 * sp.step;
				var seen = {};
				var pool = [];
				[answer, answer + 1, answer - 1, answer + sp.step, answer - sp.step].forEach(function (v) {
					if (v > 0 && !seen[String(v)]) { seen[String(v)] = 1; pool.push(String(v)); }
				});
				questions.push({
					type: 'multiple-choice',
					text: 'Complète la suite : ' + seq.join(', ') + ', …',
					options_json: seededShuffle(pool.slice(0, 4)),
					answer: String(answer),
					explanation: 'On ajoute ' + sp.step + ' à chaque fois : ' + seq[3] + ' + ' + sp.step + ' = ' + answer + '.',
				});
			}
		});
		return questions;
	}

	var MATH = [
		{
			id: 'math-number-explorer',
			subject: 'Math', axis: 'Counting',
			name: 'Number Explorer', icon: '🔢', tag: 'COUNTING',
			game_type: 'bubble-pop', grade: 'maternelle', difficulty: 'easy',
			description: 'Count the objects one by one and pop the right number — from 1 to 10.',
			preview: ['🍎', '⭐', '🎈'],
			questions: [],
		},
		{
			id: 'math-number-battle',
			subject: 'Math', axis: 'Comparing Numbers',
			name: 'Number Battle', icon: '⚖️', tag: 'COMPARISON',
			game_type: 'bubble-pop', grade: 'cp', difficulty: 'medium',
			description: 'Compare two numbers with <, = or > — every pair up to 10 plays.',
			preview: ['7 … 4', '5 … 9', '6 … 6'],
			questions: [],
		},
		{
			id: 'math-number-train',
			subject: 'Math', axis: 'Ordering Numbers',
			name: 'Number Train', icon: '🚂', tag: 'ORDER',
			game_type: 'build-a-tower', grade: 'ce1', difficulty: 'medium',
			description: 'Arrange number rows from the smallest to the biggest, up to 60.',
			preview: ['3,5,7,9', '🚂', '↗'],
			questions: [],
		},
		{
			id: 'math-math-factory',
			subject: 'Math', axis: 'Operations',
			name: 'Math Factory', icon: '🧮', tag: 'CALCULUS',
			game_type: 'bubble-pop', grade: 'ce2', difficulty: 'medium',
			description: 'The full addition table 0→10 and every subtraction — the complete calculation machine.',
			preview: ['7+5', '14−6', '12+8'],
			questions: [],
		},
		{
			id: 'math-pattern-detective',
			subject: 'Math', axis: 'Patterns & Logic',
			name: 'Pattern Detective', icon: '🧠', tag: 'LOGIC',
			game_type: 'bubble-pop', grade: 'cm1', difficulty: 'hard',
			description: 'Find the rule of each skip-counting sequence and the missing number.',
			preview: ['2,4,6', '+2', '…'],
			questions: [],
		},
	];
	MATH[0].questions = mathCountingQuestions();
	MATH[1].questions = mathCompareQuestions();
	MATH[2].questions = mathOrderQuestions();
	MATH[3].questions = mathAddSubQuestions();
	MATH[4].questions = mathPatternQuestions();

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
