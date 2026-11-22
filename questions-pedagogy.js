/**
 * questions-pedagogy.js
 *
 * WP5 refactor (2026-11-21): Adaptive Learning integrated into the EXISTING
 * Questions tab of the application (admin.html). This module replaces the
 * teacher-facing Learning Console classification workflow — a teacher
 * classifies and aligns questions where they already work, without a
 * separate console.
 *
 * WHAT IT ADDS (only when the school's master switch
 * `learning.adaptive.enabled` is ON — with the flag off the Questions tab
 * renders exactly as before; the integration fails closed):
 *
 *   1. Per-row badges: pedagogy status + Bloom level, derived from the
 *      server-cached columns (`Question.pedagogy_status`,
 *      `Question.primary_bloom_dimension_id`) carried by the bootstrap rows.
 *   2. Adaptive filters (status / Bloom / objective) hooked into the existing
 *      `filterQuestions()` pipeline — no second filtering system.
 *   3. A collapsible "Learning alignment" section in the existing question
 *      editor: pick an objective + Bloom (+ optional competency) for the
 *      question. Entirely optional — ordinary questions need nothing here.
 *      Difficulty stays the existing, separate Difficulty field: Bloom and
 *      difficulty are different dimensions (owner decision).
 *   4. A per-question criteria editor (row action) for full weighted sets.
 *   5. Bulk classification for the existing bulk-selection toolbar.
 *   6. A Learning coverage panel: objectives of the teacher's authorized
 *      subjects, how many questions each one carries, which objectives carry
 *      none, and which questions are unaligned. Counts are QUESTION
 *      ASSOCIATIONS — they never claim mastery (mastery is the adaptive
 *      evidence domain's job, not the bank's).
 *
 * ALL WRITES reuse the existing WP1–WP4 endpoints (`/learning/…`); no new
 * backend route, service, permission or schema is introduced. The server
 * remains the sole authority: the client only hides what the server would
 * refuse, and every learning write goes through the same permissioned routes.
 *
 * Curriculum context comes FROM the taxonomy service (authorized objectives
 * for the caller's subjects); this module never creates or edits curriculum
 * structures — the Subjects tab keeps owning those, and official objectives
 * are never modified here.
 *
 * AI assistance is deliberately NOT part of this module: Phase 1 has no
 * suggestion service (deferred to Phase 6), and building one would exceed the
 * authorized WP5 scope.
 */
(function () {
	'use strict';

	/* ════════════════════════════ constants ════════════════════════════════ */

	var WEIGHT_TOLERANCE = 0.001; // mirrors the server's validator
	var OBJECTIVE_PAGE_SIZE = 200;
	var OBJECTIVE_MAX_PAGES = 5; // 1,000 objectives is a hard, honest ceiling for a dropdown
	var CONCURRENCY = 4;

	var LANGUAGES = [
		{ key: 'en', label: 'English', dir: 'ltr' },
		{ key: 'fr', label: 'Français', dir: 'ltr' },
		{ key: 'ar', label: 'العربية', dir: 'rtl' },
	];
	var LANG_STORAGE_KEY = 'quizLearningLang'; // shared with the taxonomy UI's preference

	var STATUS_META = {
		unclassified: { cls: 'qp-chip--grey', order: 0, icon: '○' },
		partial: { cls: 'qp-chip--amber', order: 1, icon: '◐' },
		classified: { cls: 'qp-chip--green', order: 2, icon: '✓' },
		needs_review: { cls: 'qp-chip--red', order: 3, icon: '⚠' },
	};

	var STRINGS = {
		en: {
			panel: 'Learning alignment',
			panelOptional: 'Learning alignment (optional)',
			panelHint: 'Link this question to a learning objective and a Bloom level. Both are optional — ordinary questions do not need this.',
			editorSub: 'Optional · link this question to a curriculum objective',
			editorStatusNone: 'Not aligned',
			editorStatusPartial: 'Incomplete',
			editorStatusAligned: 'Aligned',
			editorStatusMulti: 'Multiple criteria',
			editorObjectiveHelp: 'Search by code or wording. Only objectives for the selected subject are offered.',
			editorBloomHelp: 'The thinking skill this question exercises.',
			editorCompetencyHelp: 'Optional — the broader skill this objective builds.',
			editorAdvancedHint: 'Use the criteria editor to split a question across several objectives, or to add weights and rubrics.',
			editorAdvancedOpen: 'Open criteria editor',
			filterClearShort: 'Clear',
			filterActive: '{n} active',
			coverageEmptyTitle: 'Nothing to show yet',
			coverageEmptyHint: 'Objectives published for your subjects will appear here with their question counts.',
			criteriaCount: '{n} criterion(s)',
			criteriaEmptyTitle: 'No criteria yet',
			criteriaEmptyBody: 'Add the first criterion to align this question with a learning objective.',
			criteriaAddFirst: 'Add the first criterion',
			bulkHint: 'Every selected question receives the same single criterion (weight 1.00). Finer-grained sets belong to the per-question editor.',
			bulkNeedSelection: 'Choose an objective and a Bloom level to continue.',
			bulkReady: 'Ready to classify',
			objective: 'Learning objective',
			bloom: 'Bloom level',
			competency: 'Competency (optional)',
			difficultyNote: 'Difficulty is set in its own field above — it is a separate dimension from Bloom.',
			advanced: 'Advanced criteria editor…',
			statusLabel: 'Status',
			filterBar: 'Learning',
			filterAllStatuses: 'All statuses',
			filterAllBloom: 'All Bloom levels',
			filterAllObjectives: 'All objectives',
			filterUnaligned: 'Unaligned (no objective)',
			filterClear: 'Clear learning filters',
			badges: 'Learning coverage',
			coverageTitle: 'Question coverage by objective',
			coverageIntro: 'Counts show question ASSOCIATIONS, not mastery — a linked question does not by itself prove a student learned the objective.',
			coverageRefresh: 'Refresh',
			coverageClose: 'Close',
			coverageNoObjectives: 'No learning objectives are published for your authorized subjects yet. Objectives are managed in the curriculum governance surface; ask your administrator (or propose one, if your school enables teacher proposals).',
			coverageNoQuestions: 'No questions associated yet',
			coverageUnaligned: 'Unaligned questions',
			coverageAssociated: 'associated questions',
			coverageOpenFilter: 'Show these questions',
			coverageLoading: 'Loading coverage…',
			criteriaTitle: 'Assessment criteria',
			criteriaHint: 'The criteria ARE the classification: the status and Bloom badge are derived from this set.',
			scoringDetails: 'Scoring details',
			scoringDetailsHint: 'Weight · key · max score · rubric',
			weightOver: 'Total is {w} over 1.00 — reduce some weights.',
			weightOf: 'Weight of the assessment — must total 1.00 across criteria.',
			criterion: 'Criterion',
			addCriterion: 'Add criterion',
			removeCriterion: 'Remove',
			weight: 'Weight',
			weightSum: 'Total weight',
			weightSumHint: 'Weights must total 1.00 (± 0.001).',
			key: 'Key',
			keyHint: 'Leave blank for the primary criterion.',
			maxScore: 'Max score',
			maxScoreHint: 'Optional.',
			rubric: 'Rubric',
			rubricHint: 'Optional, free text.',
			markReviewed: 'Mark as reviewed',
			clear: 'Clear classification',
			clearConfirm: 'Remove all assessment criteria from this question? It will return to "Unclassified".',
			cancel: 'Cancel',
			save: 'Save',
			bulkTitle: 'Classify selected questions',
			bulkSelected: '{n} selected — the same objective and Bloom level will be applied to each.',
			bulkIntro: 'Applies ONE criterion (objective + Bloom, weight 1.00) to each selected question, one by one. Finer-grained sets belong to the per-question editor.',
			bulkRun: 'Classify {n} question(s)',
			bulkProgress: '{i} / {n}',
			bulkDone: 'Done: {done} classified, {failed} failed.',
			bulkFailures: 'Not classified:',
			close: 'Close',
			toastClassified: 'Learning alignment saved.',
			toastCleared: 'Classification cleared.',
			toastSaveFailed: 'Question saved, but the learning alignment could not be saved: {msg}',
			toastClearedQuestion: 'Question saved with its learning alignment removed.',
			loadFailed: 'Learning surfaces are unavailable right now ({msg}).',
			unclassified: 'Unclassified',
			partial: 'Partial',
			classified: 'Classified',
			needs_review: 'Needs review',
			noBloom: 'No Bloom level',
			unchanged: 'Unchanged — the existing set has more than one criterion. Use the advanced editor to change it.',
			advancedNeedsSave: 'Save the question first — the advanced editor opens for a saved question.',
			statusExplain_unclassified: 'Not linked to a learning objective yet. Use “Learning alignment” in the question editor, or the classify action on the row.',
			statusExplain_partial: 'Linked to an objective, but the criteria weights do not total 100%. Open the criteria editor to complete it.',
			statusExplain_classified: 'Linked to a learning objective with complete weighting.',
			statusExplain_needs_review: 'Flagged for review — check the objective and Bloom choice, then confirm.',
			bloomExplain: 'Bloom describes the thinking skill the question exercises (remember, apply, analyze…). Difficulty — the separate field above — describes how hard it is.',
			objectiveExplain: 'The school objective this question helps assess.',
			pickerPlaceholder: 'Search objectives…',
			pickerClear: 'Clear selected objective',
			pickerEmpty: 'No objective matches.',
			contextSubject: 'Curriculum context',
			immutabilityNote: 'Objectives listed are the published school curriculum for your subjects. They are shared and cannot be edited here — ask your administrator for changes.',
			coverageSubtitle: 'How your question bank covers each learning objective. Counts are question associations — not student mastery.',
			attentionTitle: 'Needs attention',
			attentionZero: 'No questions yet',
			attentionUnaligned: 'question(s) not linked to any objective',
			bloomConcentrated: 'All at one Bloom level',
			bloomSpread: '{n} Bloom level(s)',
			weightMore: 'Add {w} more to reach 1.00',
			weightOk: 'Total 1.00 — ready to save',
			bulkPreview: 'Each selected question will be set to:',
			bulkResultOk: '{done} question(s) classified.',
			bulkResultPartial: '{done} classified · {failed} failed.',
			loading: 'Loading…',
			retry: 'Retry',
			myProposal: 'My proposal',
			questionsWord: 'questions',
			select: '— Select —',
			none: '— None —',
		},
		fr: {
			panel: 'Alignement pédagogique',
			panelOptional: 'Alignement pédagogique (optionnel)',
			panelHint: 'Reliez cette question à un objectif d’apprentissage et à un niveau de Bloom. Les deux sont optionnels — une question ordinaire n’en a pas besoin.',
			objective: 'Objectif d’apprentissage',
			editorSub: 'Optionnel · reliez cette question à un objectif du programme',
			editorStatusNone: 'Non alignée',
			editorStatusPartial: 'Incomplet',
			editorStatusAligned: 'Alignée',
			editorStatusMulti: 'Critères multiples',
			editorObjectiveHelp: 'Recherchez par code ou libellé. Seuls les objectifs de la matière sélectionnée sont proposés.',
			editorBloomHelp: 'La compétence de pensée exercée par cette question.',
			editorCompetencyHelp: 'Optionnel — la compétence plus large développée par cet objectif.',
			editorAdvancedHint: 'Utilisez l’éditeur de critères pour répartir une question sur plusieurs objectifs, ou ajouter des pondérations et des grilles.',
			editorAdvancedOpen: 'Ouvrir l’éditeur de critères',
			filterClearShort: 'Effacer',
			filterActive: '{n} actif(s)',
			coverageEmptyTitle: 'Rien à afficher pour le moment',
			coverageEmptyHint: 'Les objectifs publiés pour vos matières apparaîtront ici avec leur nombre de questions.',
			criteriaCount: '{n} critère(s)',
			criteriaEmptyTitle: 'Aucun critère',
			criteriaEmptyBody: 'Ajoutez le premier critère pour aligner cette question avec un objectif d’apprentissage.',
			criteriaAddFirst: 'Ajouter le premier critère',
			bulkHint: 'Chaque question sélectionnée reçoit le même critère unique (poids 1.00). Les ensembles plus fins relèvent de l’éditeur par question.',
			bulkNeedSelection: 'Choisissez un objectif et un niveau de Bloom pour continuer.',
			bulkReady: 'Prêt à classer',
			bloom: 'Niveau de Bloom',
			competency: 'Compétence (optionnel)',
			difficultyNote: 'La difficulté se règle dans son propre champ ci-dessus — c’est une dimension distincte de Bloom.',
			advanced: 'Éditeur de critères avancé…',
			statusLabel: 'Statut',
			filterBar: 'Apprentissage',
			filterAllStatuses: 'Tous les statuts',
			filterAllBloom: 'Tous les niveaux de Bloom',
			filterAllObjectives: 'Tous les objectifs',
			filterUnaligned: 'Non alignées (sans objectif)',
			filterClear: 'Effacer les filtres d’apprentissage',
			badges: 'Couverture d’apprentissage',
			coverageTitle: 'Couverture des questions par objectif',
			coverageIntro: 'Les chiffres montrent des ASSOCIATIONS de questions, pas la maîtrise — une question liée ne prouve pas à elle seule qu’un élève a appris l’objectif.',
			coverageRefresh: 'Actualiser',
			coverageClose: 'Fermer',
			coverageNoObjectives: 'Aucun objectif d’apprentissage publié pour vos sujets autorisés. Les objectifs sont gérés dans la surface de gouvernance du curriculum ; demandez à votre administrateur (ou proposez-en un si votre école l’autorise).',
			coverageNoQuestions: 'Aucune question associée pour l’instant',
			coverageUnaligned: 'Questions non alignées',
			coverageAssociated: 'questions associées',
			coverageOpenFilter: 'Afficher ces questions',
			coverageLoading: 'Chargement de la couverture…',
			criteriaTitle: 'Critères d’évaluation',
			criteriaHint: 'Les critères SONT la classification : le statut et le badge de Bloom sont dérivés de cet ensemble.',
			scoringDetails: 'Détails de notation',
			scoringDetailsHint: 'Poids · clé · score max · grille',
			weightOver: 'Le total dépasse 1,00 de {w} — réduisez certains poids.',
			weightOf: 'Poids de l’évaluation — doit totaliser 1,00 sur tous les critères.',
			criterion: 'Critère',
			addCriterion: 'Ajouter un critère',
			removeCriterion: 'Retirer',
			weight: 'Poids',
			weightSum: 'Poids total',
			weightSumHint: 'Les poids doivent totaliser 1,00 (± 0,001).',
			key: 'Clé',
			keyHint: 'Laisser vide pour le critère principal.',
			maxScore: 'Score max',
			maxScoreHint: 'Optionnel.',
			rubric: 'Barème',
			rubricHint: 'Optionnel, texte libre.',
			markReviewed: 'Marquer comme révisé',
			clear: 'Effacer la classification',
			clearConfirm: 'Retirer tous les critères d’évaluation de cette question ? Elle redeviendra « Non classée ».',
			cancel: 'Annuler',
			save: 'Enregistrer',
			bulkTitle: 'Classer les questions sélectionnées',
			bulkSelected: '{n} sélectionnée(s) — le même objectif et le même niveau de Bloom seront appliqués à chacune.',
			bulkIntro: 'Applique UN critère (objectif + Bloom, poids 1,00) à chaque question sélectionnée, une par une. Les ensembles plus fins relèvent de l’éditeur par question.',
			bulkRun: 'Classer {n} question(s)',
			bulkProgress: '{i} / {n}',
			bulkDone: 'Terminé : {done} classées, {failed} en échec.',
			bulkFailures: 'Non classées :',
			close: 'Fermer',
			toastClassified: 'Alignement pédagogique enregistré.',
			toastCleared: 'Classification effacée.',
			toastSaveFailed: 'Question enregistrée, mais l’alignement pédagogique n’a pas pu être enregistré : {msg}',
			toastClearedQuestion: 'Question enregistrée sans alignement pédagogique.',
			loadFailed: 'Les surfaces d’apprentissage sont indisponibles ({msg}).',
			unclassified: 'Non classée',
			partial: 'Partielle',
			classified: 'Classée',
			needs_review: 'À réviser',
			noBloom: 'Aucun niveau de Bloom',
			unchanged: 'Inchangé — l’ensemble existant compte plus d’un critère. Utilisez l’éditeur avancé pour le modifier.',
			advancedNeedsSave: 'Enregistrez d’abord la question — l’éditeur avancé s’ouvre pour une question enregistrée.',
			statusExplain_unclassified: 'Pas encore liée à un objectif d’apprentissage. Utilisez « Alignement pédagogique » dans l’éditeur, ou l’action de classification sur la ligne.',
			statusExplain_partial: 'Liée à un objectif, mais les poids ne totalisent pas 100 %. Ouvrez l’éditeur de critères pour la compléter.',
			statusExplain_classified: 'Liée à un objectif d’apprentissage avec une pondération complète.',
			statusExplain_needs_review: 'À réviser — vérifiez l’objectif et le niveau de Bloom, puis confirmez.',
			bloomExplain: 'Bloom décrit l’habileté de pensée exercée par la question (mémoriser, appliquer, analyser…). La difficulté — champ séparé ci-dessus — décrit sa difficulté.',
			objectiveExplain: 'L’objectif de l’école que cette question aide à évaluer.',
			pickerPlaceholder: 'Rechercher un objectif…',
			pickerClear: 'Effacer l’objectif sélectionné',
			pickerEmpty: 'Aucun objectif correspondant.',
			contextSubject: 'Contexte du curriculum',
			immutabilityNote: 'Les objectifs listés sont le curriculum publié de l’école pour vos sujets. Ils sont partagés et ne peuvent pas être modifiés ici — demandez à votre administrateur.',
			coverageSubtitle: 'Comment votre banque de questions couvre chaque objectif. Les chiffres sont des associations de questions — pas la maîtrise des élèves.',
			attentionTitle: 'À traiter',
			attentionZero: 'Aucune question pour l’instant',
			attentionUnaligned: 'question(s) non liée(s) à un objectif',
			bloomConcentrated: 'Un seul niveau de Bloom',
			bloomSpread: '{n} niveau(x) de Bloom',
			weightMore: 'Ajoutez {w} pour atteindre 1,00',
			weightOk: 'Total 1,00 — prêt à enregistrer',
			bulkPreview: 'Chaque question sélectionnée deviendra :',
			bulkResultOk: '{done} question(s) classée(s).',
			bulkResultPartial: '{done} classée(s) · {failed} en échec.',
			loading: 'Chargement…',
			retry: 'Réessayer',
			myProposal: 'Ma proposition',
			questionsWord: 'questions',
			select: '— Choisir —',
			none: '— Aucun —',
		},
		ar: {
			panel: 'الترافق التعليمي',
			panelOptional: 'الترافق التعليمي (اختياري)',
			panelHint: 'اربط هذا السؤال بهدف تعلّم ومستوى بلوم. كلاهما اختياري — السؤال العادي لا يحتاج إلى ذلك.',
			objective: 'هدف التعلّم',
			editorSub: 'اختياري · اربط هذا السؤال بهدف من المنهج',
			editorStatusNone: 'غير مرتبط',
			editorStatusPartial: 'غير مكتمل',
			editorStatusAligned: 'مرتبط',
			editorStatusMulti: 'معايير متعددة',
			editorObjectiveHelp: 'ابحث بالرمز أو النص. تُعرض أهداف المادة المحددة فقط.',
			editorBloomHelp: 'مهارة التفكير التي يمارسها هذا السؤال.',
			editorCompetencyHelp: 'اختياري — المهارة الأوسع التي يبنيها هذا الهدف.',
			editorAdvancedHint: 'استخدم محرر المعايير لتوزيع السؤال على عدة أهداف، أو لإضافة الأوزان ومعايير التقييم.',
			editorAdvancedOpen: 'فتح محرر المعايير',
			filterClearShort: 'مسح',
			filterActive: '{n} نشط',
			coverageEmptyTitle: 'لا يوجد ما يُعرض بعد',
			coverageEmptyHint: 'ستظهر هنا أهداف المواد المنشورة مع عدد الأسئلة المرتبطة بها.',
			criteriaCount: '{n} معيار',
			criteriaEmptyTitle: 'لا توجد معايير بعد',
			criteriaEmptyBody: 'أضف المعيار الأول لربط هذا السؤال بهدف تعلّم.',
			criteriaAddFirst: 'إضافة المعيار الأول',
			bulkHint: 'يحصل كل سؤال محدد على المعيار الواحد نفسه (الوزن 1.00). المجموعات الأدق من اختصاص محرر السؤال.',
			bulkNeedSelection: 'اختر هدفًا ومستوى بلوم للمتابعة.',
			bulkReady: 'جاهز للتصنيف',
			bloom: 'مستوى بلوم',
			competency: 'الكفاية (اختياري)',
			difficultyNote: 'تُضبط الصعوبة في حقلها الخاص أعلاه — وهي بُعد مستقل عن بلوم.',
			advanced: 'محرّر المعايير المتقدم…',
			statusLabel: 'الحالة',
			filterBar: 'التعلّم',
			filterAllStatuses: 'كل الحالات',
			filterAllBloom: 'كل مستويات بلوم',
			filterAllObjectives: 'كل الأهداف',
			filterUnaligned: 'غير مرتبطة (بلا هدف)',
			filterClear: 'مسح مرشّحات التعلّم',
			badges: 'تغطية التعلّم',
			coverageTitle: 'تغطية الأسئلة حسب الهدف',
			coverageIntro: 'الأرقام تُظهر ارتباط الأسئلة، لا الإتقان — سؤال مرتبط لا يثبت وحده أنّ الطالب تعلّم الهدف.',
			coverageRefresh: 'تحديث',
			coverageClose: 'إغلاق',
			coverageNoObjectives: 'لا توجد أهداف تعلّم منشورة لموادك المصرّح بها بعد. تُدار الأهداف في واجهة إدارة المنهاج؛ اسأل مديرك (أو اقترح هدفًا إن كانت مدرستك تسمح بذلك).',
			coverageNoQuestions: 'لا توجد أسئلة مرتبطة بعد',
			coverageUnaligned: 'أسئلة غير مرتبطة',
			coverageAssociated: 'أسئلة مرتبطة',
			coverageOpenFilter: 'اعرض هذه الأسئلة',
			coverageLoading: 'جارٍ تحميل التغطية…',
			criteriaTitle: 'معايير التقييم',
			scoringDetails: 'تفاصيل التنقيط',
			scoringDetailsHint: 'الوزن · المفتاح · الدرجة القصوى · سلم التصحيح',
			weightOver: 'المجموع يتجاوز 1٫00 بمقدار {w} — خفّض بعض الأوزان.',
			weightOf: 'وزن التقييم — يجب أن يبلغ 1٫00 عبر جميع المعايير.',
			criteriaHint: 'المعايير هي التصنيف نفسه: الحالة وشارة بلوم مشتقّتان من هذه المجموعة.',
			criterion: 'معيار',
			addCriterion: 'إضافة معيار',
			removeCriterion: 'إزالة',
			weight: 'الوزن',
			weightSum: 'مجموع الأوزان',
			weightSumHint: 'يجب أن يبلغ مجموع الأوزان 1.00 (± 0.001).',
			key: 'المفتاح',
			keyHint: 'اتركه فارغًا للمعيار الرئيس.',
			maxScore: 'الدرجة القصوى',
			maxScoreHint: 'اختياري.',
			rubric: 'سلم التنقيط',
			rubricHint: 'اختياري، نص حر.',
			markReviewed: 'وضع علامة "مُراجَع"',
			clear: 'مسح التصنيف',
			clearConfirm: 'إزالة كل معايير التقييم من هذا السؤال؟ سيعود إلى "غير مصنَّف".',
			cancel: 'إلغاء',
			save: 'حفظ',
			bulkTitle: 'تصنيف الأسئلة المحددة',
			bulkSelected: '{n} محددة — سيُطبَّق الهدف نفسه ومستوى بلوم نفسه على كل سؤال.',
			bulkIntro: 'يطبّق معيارًا واحدًا (هدف + بلوم، وزن 1.00) على كل سؤال محدد، واحدًا تلو الآخر. المجموعات الأدقّ تُدار من محرّر السؤال الواحد.',
			bulkRun: 'تصنيف {n} سؤال(أأسئلة)',
			bulkProgress: '{i} / {n}',
			bulkDone: 'انتهى: {done} مصنَّفة، {failed} فاشلة.',
			bulkFailures: 'غير مصنَّفة:',
			close: 'إغلاق',
			toastClassified: 'تم حفظ الترافق التعليمي.',
			toastCleared: 'تم مسح التصنيف.',
			toastSaveFailed: 'حُفظ السؤال، لكن تعذّر حفظ الترافق التعليمي: {msg}',
			toastClearedQuestion: 'حُفظ السؤال بتصنيف تعليمي ممسوح.',
			loadFailed: 'واجهات التعلّم غير متاحة حاليًا ({msg}).',
			unclassified: 'غير مصنَّف',
			partial: 'جزئي',
			classified: 'مصنَّف',
			needs_review: 'يحتاج مراجعة',
			noBloom: 'بلا مستوى بلوم',
			unchanged: 'دون تغيير — المجموعة الحالية تضم أكثر من معيار. استخدم المحرّر المتقدم لتعديلها.',
			advancedNeedsSave: 'احفظ السؤال أولًا — يفتح المحرّر المتقدم لسؤال محفوظ.',
			statusExplain_unclassified: 'غير مرتبطة بعد بهدف تعلّم. استخدم «الترافق التعليمي» في محرّر السؤال، أو إجراء التصنيف على السطر.',
			statusExplain_partial: 'مرتبطة بهدف، لكن أوزان المعايير لا تبلغ 100٪. افتح محرّر المعايير لإكمالها.',
			statusExplain_classified: 'مرتبطة بهدف تعلّم بترجيح كامل.',
			statusExplain_needs_review: 'بانتظار المراجعة — تحقّق من الهدف ومستوى بلوم ثم أكّد.',
			bloomExplain: 'يصف بلوم مهارة التفكير التي يمارسها السؤال (تذكّر، تطبيق، تحليل…). أما الصعوبة — الحقل المنفصل أعلاه — فتصدر صعوبته.',
			objectiveExplain: 'هدف المدرسة الذي يساعد هذا السؤال على تقييمه.',
			pickerPlaceholder: 'ابحث عن هدف…',
			pickerClear: 'مسح الهدف المحدد',
			pickerEmpty: 'لا يوجد هدف مطابق.',
			contextSubject: 'سياق المنهاج',
			immutabilityNote: 'الأهداف المعروضة هي منهاج المدرسة المنشور لموادك. وهي مشتركة ولا يمكن تعديلها من هنا — اطلب التغيير من مديرك.',
			coverageSubtitle: 'كيف تغطي بنك أسئلتك كل هدف تعلّم. الأرقام ارتباط أسئلة — لا إتقان الطلاب.',
			attentionTitle: 'يحتاج انتباهًا',
			attentionZero: 'لا أسئلة بعد',
			attentionUnaligned: 'سؤال(أسئلة) غير مرتبطة بأي هدف',
			bloomConcentrated: 'مستوى بلوم واحد فقط',
			bloomSpread: '{n} مستوى(أ уровни) بلوم',
			weightMore: 'أضِف {w} للوصول إلى 1.00',
			weightOk: 'المجموع 1.00 — جاهز للحفظ',
			bulkPreview: 'ستصبح كل سؤال محدد:',
			bulkResultOk: 'تم تصنيف {done} سؤال(أسئلة).',
			bulkResultPartial: '{done} مصنَّفة · {failed} فاشلة.',
			loading: 'جارٍ التحميل…',
			retry: 'إعادة المحاولة',
			myProposal: 'مقترحي',
			questionsWord: 'أسئلة',
			select: '— اختر —',
			none: '— لا شيء —',
		},
	};

	/* ═════════════════════════════ state ═══════════════════════════════════ */

	var state = {
		booted: false,
		enabled: false, // master switch resolved; integration is inert until true
		failed: false, // flags/catalog could not be read — stay inert
		teacherObjectiveCreation: false,
		bloom: [], // [{id, key, name, labels:{en,fr,ar}, order_index}]
		objectives: [], // active objectives the caller may see
		objectivesComplete: false,
		competencies: [],
		objectiveQuestionIds: {}, // objectiveId -> Promise<{ids:Set, total}>
		coverageLoaded: false,
		coverageLoading: false,
		coverageCounts: null, // objectiveId -> {questions, bloomCounts}
		// simple editor state for the question currently open in the form modal
		editor: {
			questionId: null, // null = new question
			dirty: false,
			multi: false, // existing set has >1 criterion → simple fields locked
			objectiveId: '',
			bloomId: '',
			competencyId: '',
		},
	};

	/* ═══════════════════════ small utilities (pure unless noted) ═══════════ */

	function esc(value) {
		return String(value == null ? '' : value)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	function getLang() {
		try {
			var stored = localStorage.getItem(LANG_STORAGE_KEY);
			for (var i = 0; i < LANGUAGES.length; i++) if (LANGUAGES[i].key === stored) return stored;
		} catch (_) { /* blocked storage must not break the page */ }
		return 'en';
	}

	function setLang(lang) {
		for (var i = 0; i < LANGUAGES.length; i++) {
			if (LANGUAGES[i].key === lang) {
				try { localStorage.setItem(LANG_STORAGE_KEY, lang); } catch (_) { /* ignore */ }
				return;
			}
		}
	}

	function t(key, vars) {
		var dict = STRINGS[getLang()] || STRINGS.en;
		var out = dict[key] != null ? dict[key] : STRINGS.en[key] != null ? STRINGS.en[key] : key;
		if (vars) {
			Object.keys(vars).forEach(function (k) {
				out = out.split('{' + k + '}').join(String(vars[k]));
			});
		}
		return out;
	}

	function langDir() {
		var lang = getLang();
		for (var i = 0; i < LANGUAGES.length; i++) if (LANGUAGES[i].key === lang) return LANGUAGES[i].dir;
		return 'ltr';
	}

	/** Pure: the human label for a pedagogy status in the current language. */
	function statusLabel(status) {
		var key = STATUS_META[status] ? status : 'unclassified';
		return t(key);
	}

	/** Pure: chip class for a status. */
	function statusChipClass(status) {
		return (STATUS_META[status] || STATUS_META.unclassified).cls;
	}

	/** Pure: the display name of a Bloom dimension in the current language. */
	function bloomLabel(bloomId) {
		var row = null;
		for (var i = 0; i < state.bloom.length; i++) if (state.bloom[i].id === bloomId) { row = state.bloom[i]; break; }
		if (!row) return null;
		var labels = row.labels || {};
		return labels[getLang()] || row.name || null;
	}

	/** Pure: chip HTML for one question's cached columns (empty when unknown). */
	function rowBadgeHtml(question) {
		if (!state.enabled || !question) return '';
		var status = question.pedagogy_status || 'unclassified';
		var meta = STATUS_META[status] || STATUS_META.unclassified;
		var bloomName = bloomLabel(question.primary_bloom_dimension_id);
		var chips = '<span class="qp-chip ' + meta.cls + '" title="' + esc(t('statusExplain_' + (STATUS_META[status] ? status : 'unclassified'))) + '">' +
			'<span class="qp-chip-icon" aria-hidden="true">' + meta.icon + '</span>' + esc(statusLabel(status)) + '</span>';
		if (bloomName) {
			chips += ' <span class="qp-chip qp-chip--bloom" title="' + esc(t('bloomExplain')) + '">' + esc(bloomName) + '</span>';
		}
		return '<span class="q-ped-badge" dir="' + langDir() + '">' + chips + '</span>';
	}

	/** Pure: the row action button HTML (empty when the feature is off). */
	function rowActionHtml(question) {
		if (!state.enabled || !question || !question.id) return '';
		return '<button class="exam-action-btn qp-classify-btn" title="' + esc(t('panel')) + ' — ' +
			esc(t('criteriaTitle')) + '" aria-label="' + esc(t('panel')) + '"' +
			' onclick="QuestionsPedagogy.openCriteriaEditorById(\'' + esc(question.id) + '\')">' +
			'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>' +
			'</button>';
	}

	/**
	 * Pure: does a question row (its cached columns + an optional id set)
	 * match the current adaptive filter selections?
	 * @param {{status:string, bloomId:string, objectiveIds:Set|null}} filters
	 * @param {{id:string, pedagogy_status:string, primary_bloom_dimension_id:string}} question
	 */
	function rowMatchesPedagogyFilter(filters, question) {
		if (!filters) return true;
		var status = question.pedagogy_status || 'unclassified';
		if (filters.status && filters.status !== 'any' && status !== filters.status) return false;
		if (filters.status === 'any' && status === 'unclassified') return false; // "has any classification"
		if (filters.bloomId && (question.primary_bloom_dimension_id || '') !== filters.bloomId) return false;
		if (filters.objectiveIds && !filters.objectiveIds.has(String(question.id || ''))) return false;
		return true;
	}

	/** Pure: summarize a list of questions by pedagogy status. */
	function summarizeStatuses(questions) {
		var out = { total: 0, unclassified: 0, partial: 0, classified: 0, needs_review: 0 };
		(questions || []).forEach(function (q) {
			var status = q && (q.pedagogy_status || 'unclassified');
			if (!(status in out)) status = 'unclassified';
			out.total += 1;
			out[status] += 1;
		});
		return out;
	}

	/** Pure: build the single-criterion PUT payload from the simple editor. */
	function buildSingleCriterion(objectiveId, bloomId, competencyId) {
		if (!objectiveId || !bloomId) return null;
		var criterion = { objective_id: objectiveId, bloom_dimension_id: bloomId, weight: 1 };
		if (competencyId) criterion.competency_id = competencyId;
		return { criteria: [criterion], source: 'manual', mark_reviewed: true };
	}

	/** Toast in the app's own style (falls back silently if utils are absent). */
	function toast(message, type) {
		if (typeof window.showToast === 'function') window.showToast(message, type || 'info');
		else if (typeof console !== 'undefined') console.log('[pedagogy] ' + message);
	}

	/* ═══════════════════════════ data loading ══════════════════════════════ */

	function apiRaw(method, path, body) {
		if (!window.API || typeof window.API.raw !== 'function') {
			return Promise.reject(new Error('API client unavailable'));
		}
		return Promise.resolve(window.API.raw(method, path, body));
	}

	function loadFlags() {
		return apiRaw('GET', '/learning/flags').then(function (data) {
			state.enabled = data && data.adaptive_enabled === true;
			state.teacherObjectiveCreation = !!(data && data.teacher_objective_creation);
		});
	}

	/** Fetch all pages of an /learning list (defensive; stops at the ceiling). */
	function fetchAllPages(path, extraQuery) {
		var pages = [];
		function page(offset) {
			var query = (path.indexOf('?') >= 0 ? '&' : '?') +
				'limit=' + OBJECTIVE_PAGE_SIZE + '&offset=' + offset + (extraQuery || '');
			return apiRaw('GET', path + query).then(function (result) {
				var rows = (result && result.data) || [];
				var total = result && typeof result.total === 'number' ? result.total : null;
				pages = pages.concat(rows);
				if (
					total != null &&
					pages.length < Math.min(total, OBJECTIVE_PAGE_SIZE * OBJECTIVE_MAX_PAGES) &&
					rows.length === OBJECTIVE_PAGE_SIZE
				) {
					return page(offset + OBJECTIVE_PAGE_SIZE);
				}
				return { data: pages, total: total == null ? pages.length : total, truncated: total != null && total > pages.length };
			});
		}
		return page(0);
	}

	function loadCatalog() {
		return Promise.all([
			apiRaw('GET', '/learning/bloom'),
			fetchAllPages('/learning/objectives', '&status=active'),
			fetchAllPages('/learning/competencies'),
		]).then(function (results) {
			state.bloom = ((results[0] && results[0].data) || []).slice().sort(function (a, b) {
				return (a.order_index || 0) - (b.order_index || 0);
			}).map(function (row) {
				var labels = {};
				try { labels = row.labels_json ? JSON.parse(row.labels_json) : {}; } catch (_) { labels = {}; }
				if (typeof labels !== 'object' || labels === null) labels = {};
				return { id: row.id, key: row.key, name: row.name, labels: labels, order_index: row.order_index };
			});
			state.objectives = results[1].data || [];
			state.objectivesComplete = !results[1].truncated;
			state.competencies = results[2].data || [];
		});
	}

	/**
	 * The questions classified against one objective (cached per objective).
	 * Resolves {ids:string[], truncated:boolean, bloomCounts:{bloomId:count}} —
	 * the Bloom counts power the coverage panel's spread indicator.
	 */
	function objectiveQuestionIds(objectiveId) {
		if (state.objectiveQuestionIds[objectiveId]) return state.objectiveQuestionIds[objectiveId];
		var promise = apiRaw('GET', '/learning/objectives/' + encodeURIComponent(objectiveId) + '/questions?limit=1000')
			.then(function (result) {
				var rows = (result && result.data) || [];
				var ids = {};
				var bloomCounts = {};
				rows.forEach(function (row) {
					if (row && row.question_id) ids[row.question_id] = true;
					if (row && row.bloom_dimension_id) bloomCounts[row.bloom_dimension_id] = (bloomCounts[row.bloom_dimension_id] || 0) + 1;
				});
				var truncated = !!(result && typeof result.total === 'number' && result.total > rows.length);
				return { ids: Object.keys(ids), truncated: truncated, bloomCounts: bloomCounts };
			})
			.catch(function (err) {
				delete state.objectiveQuestionIds[objectiveId]; // retryable
				throw err;
			});
		state.objectiveQuestionIds[objectiveId] = promise;
		return promise;
	}

	/* ═══════════════════════════ list integration ══════════════════════════ */

	function questionRows() {
		var list = document.getElementById('question-list');
		return list ? Array.prototype.slice.call(list.querySelectorAll('tr.question-table-row')) : [];
	}

	function rowQuestion(row) {
		return {
			id: row.getAttribute('data-id') || '',
			pedagogy_status: row.getAttribute('data-pedagogy-status') || 'unclassified',
			primary_bloom_dimension_id: row.getAttribute('data-pedagogy-bloom') || '',
		};
	}

	function currentFilters() {
		if (!state.enabled) return null;
		var bar = document.getElementById('qpFilterBar');
		if (!bar) return null;
		var status = (document.getElementById('qpFilterStatus') || {}).value || '';
		var bloomId = (document.getElementById('qpFilterBloom') || {}).value || '';
		var objective = (document.getElementById('qpFilterObjective') || {}).value || '';
		var filters = { status: status, bloomId: bloomId, objectiveIds: null };
		if (objective === '__unaligned__') {
			filters.status = filters.status || '';
			filters.unalignedOnly = true;
		} else if (objective) {
			filters.pendingObjective = objective;
		}
		return filters;
	}

	/**
	 * Apply the adaptive filters to the currently rendered rows. Only ever
	 * ADDS `filtered-out` — the original filter owns removal — then re-paginates.
	 */
	function applyPedagogyFilter() {
		var filters = currentFilters();
		if (!filters) return;
		var rows = questionRows();
		if (filters.pendingObjective) {
			// Resolve the id set first, then re-run once it is known.
			var objectiveId = filters.pendingObjective;
			objectiveQuestionIds(objectiveId)
				.then(function (result) {
					filters.objectiveIds = {};
					(result.ids || []).forEach(function (id) { filters.objectiveIds[id] = true; });
					rows.forEach(function (row) {
						var q = rowQuestion(row);
						var pass = rowMatchesPedagogyFilter({ status: '', bloomId: filters.bloomId, objectiveIds: filters.objectiveIds }, q);
						if (!pass) row.classList.add('filtered-out');
					});
					if (typeof window.applyPagination === 'function') window.applyPagination();
					if (result.truncated) toast(t('coverageLoading'), 'info');
				})
				.catch(function (err) { toast(t('loadFailed', { msg: err.message }), 'error'); });
			return;
		}
		rows.forEach(function (row) {
			var q = rowQuestion(row);
			var pass = rowMatchesPedagogyFilter(
				{ status: filters.unalignedOnly ? 'unclassified' : filters.status, bloomId: filters.bloomId, objectiveIds: null },
				q,
			);
			if (!pass) row.classList.add('filtered-out');
		});
		if (typeof window.applyPagination === 'function') window.applyPagination();
	}

	function hookFilterQuestions() {
		if (state._filterHooked || typeof window.filterQuestions !== 'function') return;
		var original = window.filterQuestions;
		window.filterQuestions = function (resetPage) {
			var out = original(resetPage);
			try { applyPedagogyFilter(); } catch (err) { console.warn('[pedagogy] filter failed', err); }
			return out;
		};
		state._filterHooked = true;
	}

	/** Called by questions-management.js after the bank list has (re)rendered. */
	function onListRendered() {
		if (!state.enabled) return;
		paintRowBadges();
		applyPedagogyFilter();
		updateCoverageSummary();
	}

	function paintRowBadges() {
		questionRows().forEach(function (row) {
			var badge = row.querySelector('[data-ped-badge]');
			if (!badge) return;
			badge.innerHTML = rowBadgeHtml({ pedagogy_status: row.getAttribute('data-pedagogy-status'), primary_bloom_dimension_id: row.getAttribute('data-pedagogy-bloom') });
		});
	}

	/* ═══════════════════════ filter bar + coverage panel UI ════════════════ */

	function ensureFilterBar() {
		if (document.getElementById('qpFilterBar')) return;
		var typeBar = document.querySelector('#questions .questions-type-filters');
		if (!typeBar || !typeBar.parentNode) return;

		var bar = document.createElement('div');
		bar.id = 'qpFilterBar';
		// Deliberately NOT collapsible-filter-controls: that app class is display:none
		// below 768px until the app's own Filters button opens it, and this bar is not
		// a data-filter-target — it must stay visible at every width.
		bar.className = 'qp-filter-bar';
		bar.dir = langDir();
		bar.setAttribute('role', 'group');
		bar.setAttribute('aria-label', t('filterBar'));
		/** A select with a visible mini-label, so each control says what it is. */
		function labeled(id, label, options, extraClass) {
			return '<span class="qp-filter-field">' +
				'<label class="qp-filter-label" for="' + id + '">' + esc(label) + '</label>' +
				'<select id="' + id + '" class="form-control qp-filter-select ' + (extraClass || '') + '">' + options + '</select>' +
				'</span>';
		}
		bar.innerHTML =
			'<span class="qp-filter-brand">' +
			'<span class="qp-filter-brand-icon" aria-hidden="true">' +
			'<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>' +
			'</span>' +
			'<span class="qp-filter-brand-text">' + esc(t('filterBar')) + '</span>' +
			'<span class="qp-filter-active" id="qpFilterActive" hidden></span></span>' +
			labeled('qpFilterStatus', t('statusLabel'),
				'<option value="">' + esc(t('filterAllStatuses')) + '</option>' +
				'<option value="any">' + esc(t('classified')) + ' / ' + esc(t('partial')) + ' / ' + esc(t('needs_review')) + '</option>' +
				'<option value="classified">' + esc(t('classified')) + '</option>' +
				'<option value="partial">' + esc(t('partial')) + '</option>' +
				'<option value="needs_review">' + esc(t('needs_review')) + '</option>' +
				'<option value="unclassified">' + esc(t('unclassified')) + '</option>') +
			labeled('qpFilterBloom', t('bloom'),
				'<option value="">' + esc(t('filterAllBloom')) + '</option>' +
				state.bloom.map(function (row) {
					return '<option value="' + esc(row.id) + '">' + esc(bloomLabel(row.id) || row.name) + '</option>';
				}).join('')) +
			labeled('qpFilterObjective', t('objective'),
				'<option value="">' + esc(t('filterAllObjectives')) + '</option>' +
				'<option value="__unaligned__">' + esc(t('filterUnaligned')) + '</option>' +
				state.objectives.map(function (objective) {
					return '<option value="' + esc(objective.id) + '">' + esc(objective.code + ' — ' + objectiveLabelStatement(objective)) + '</option>';
				}).join(''), 'qp-filter-objective') +
			'<span class="qp-filter-actions">' +
			'<button type="button" id="qpFilterClear" class="btn btn-secondary btn-sm qp-filter-clear" hidden>' +
			'<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>' +
			'<span>' + esc(t('filterClearShort')) + '</span></button>' +
			'<button type="button" id="qpCoverageToggle" class="btn btn-secondary btn-sm qp-coverage-toggle" aria-expanded="false" aria-controls="qpCoveragePanel">' +
			'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 3v18h18"></path><path d="M18 17V9"></path><path d="M13 17V5"></path><path d="M8 17v-3"></path></svg>' +
			'<span>' + esc(t('badges')) + '</span>' +
			'<span class="qp-coverage-toggle-arrow" aria-hidden="true">▾</span></button>' +
			'</span>';

		bar.addEventListener('change', function (event) {
			if (event.target.closest('select')) {
				syncClearVisibility();
				applyPedagogyFilter();
			}
		});
		bar.addEventListener('click', function (event) {
			var clear = event.target.closest('#qpFilterClear');
			if (clear) {
				bar.querySelectorAll('select').forEach(function (select) { select.value = ''; });
				syncClearVisibility();
				if (typeof window.filterQuestions === 'function') window.filterQuestions(true);
				else applyPedagogyFilter();
				return;
			}
			if (event.target.closest('#qpCoverageToggle')) toggleCoveragePanel();
		});

		function syncClearVisibility() {
			var count = 0;
			bar.querySelectorAll('select').forEach(function (select) {
				if (select.value !== '') count += 1;
			});
			var clear = bar.querySelector('#qpFilterClear');
			if (clear) clear.hidden = count === 0;
			var badge = bar.querySelector('#qpFilterActive');
			if (badge) {
				badge.hidden = count === 0;
				badge.textContent = t('filterActive', { n: count });
			}
		}
		bar._syncClearVisibility = syncClearVisibility;

		typeBar.parentNode.insertBefore(bar, typeBar.nextSibling);

		var panel = document.createElement('div');
		panel.id = 'qpCoveragePanel';
		panel.className = 'qp-coverage-panel';
		panel.hidden = true;
		bar.parentNode.insertBefore(panel, bar.nextSibling);
	}

	function objectiveLabelStatement(objective) {
		var statement = String(objective.statement || '');
		return statement.length > 70 ? statement.slice(0, 69) + '…' : statement;
	}

	function toggleCoveragePanel(force) {
		var panel = document.getElementById('qpCoveragePanel');
		if (!panel) return;
		var show = typeof force === 'boolean' ? force : panel.hidden;
		panel.hidden = !show;
		panel.dir = langDir();
		var toggle = document.getElementById('qpCoverageToggle');
		if (toggle) {
			toggle.setAttribute('aria-expanded', show ? 'true' : 'false');
			toggle.classList.toggle('is-open', show);
		}
		if (show) {
			panel.innerHTML =
				'<div class="qp-coverage-head">' +
				'<div class="qp-coverage-heading">' +
				'<span class="qp-coverage-icon" aria-hidden="true">' +
				'<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"></path><path d="M18 17V9"></path><path d="M13 17V5"></path><path d="M8 17v-3"></path></svg>' +
				'</span>' +
				'<div><strong class="qp-coverage-title">' + esc(t('coverageTitle')) + '</strong>' +
				'<p class="qp-coverage-subtitle">' + esc(t('coverageSubtitle')) + '</p></div>' +
				'</div>' +
				'<span class="qp-coverage-actions">' +
				'<button type="button" id="qpCoverageRefresh" class="btn btn-secondary btn-sm">' + esc(t('coverageRefresh')) + '</button>' +
				'<button type="button" id="qpCoverageCloseBtn" class="btn btn-secondary btn-sm qp-coverage-close" aria-label="' + esc(t('coverageClose')) + '" title="' + esc(t('coverageClose')) + '">✕</button>' +
				'</span></div>' +
				'<div id="qpCoverageSummary" class="qp-coverage-summary" aria-live="polite"></div>' +
				'<div id="qpCoverageBody" class="qp-coverage-body" aria-live="polite"></div>';
			panel.querySelector('#qpCoverageRefresh').addEventListener('click', function () {
				state.coverageLoaded = false;
				state.coverageCounts = null;
				renderCoverage();
			});
			panel.querySelector('#qpCoverageCloseBtn').addEventListener('click', function () { toggleCoveragePanel(false); });
			renderCoverage();
		}
	}

	/** Instant summary strip from the mirror list; per-objective detail is lazy. */
	function updateCoverageSummary() {
		var summary = document.getElementById('qpCoverageSummary');
		if (!summary) return;
		var panel = document.getElementById('qpCoveragePanel');
		if (!panel || panel.hidden) return;
		var rows = questionRows();
		var counts = summarizeStatuses(rows.map(rowQuestion));
		var meta = STATUS_META;
		function chip(status, value) {
			return '<span class="qp-chip ' + meta[status].cls + ' qp-stat" title="' + esc(t('statusExplain_' + status)) + '">' +
				'<span class="qp-chip-icon" aria-hidden="true">' + meta[status].icon + '</span>' +
				esc(statusLabel(status)) + '<strong class="qp-stat-value">' + value + '</strong></span>';
		}
		summary.innerHTML =
			chip('unclassified', counts.unclassified) +
			chip('partial', counts.partial) +
			chip('classified', counts.classified) +
			chip('needs_review', counts.needs_review) +
			'<span class="qp-coverage-total">' + esc(String(counts.total)) + ' ' + esc(t('questionsWord')) + '</span>';
	}

	/** Per-objective coverage: loaded lazily, with bounded concurrency. */
	function loadCoverageCounts() {
		if (state.coverageLoaded || state.coverageLoading) return Promise.resolve(state.coverageCounts);
		if (!state.objectives.length) return Promise.resolve({});
		state.coverageLoading = true;
		var objectives = state.objectives;
		var counts = {};
		var index = 0;
		function next() {
			if (index >= objectives.length) return Promise.resolve();
			var batch = [];
			while (batch.length < CONCURRENCY && index < objectives.length) {
				(function (objective) {
					batch.push(
						objectiveQuestionIds(objective.id)
							.then(function (result) { counts[objective.id] = { questions: result.ids.length, truncated: result.truncated, bloomCounts: result.bloomCounts }; })
							.catch(function () { counts[objective.id] = { questions: null, truncated: false, bloomCounts: null, error: true }; })
					);
					index += 1;
				})(objectives[index]);
			}
			return Promise.all(batch).then(next);
		}
		return next().then(function () {
			state.coverageCounts = counts;
			state.coverageLoaded = true;
			state.coverageLoading = false;
			return counts;
		}).catch(function (err) {
			state.coverageLoading = false;
			throw err;
		});
	}

	/**
	 * Pure: the coverage rows ordered by what needs the teacher's attention
	 * first — zero-coverage objectives, then objectives carrying questions,
	 * each annotated with its Bloom spread.
	 */
	function coverageAttentionRows(objectives, perObjective) {
		var rows = (objectives || []).map(function (objective) {
			var entry = (perObjective || {})[objective.id] || {};
			var count = entry.questions;
			return {
				objective: objective,
				count: count == null ? null : count,
				truncated: !!entry.truncated,
				error: !!entry.error,
				zero: count === 0,
				spread: bloomSpreadNote(entry.bloomCounts),
			};
		});
		rows.sort(function (a, b) {
			// Zero coverage first; then fewest questions; ties alphabetical by code.
			var av = a.zero ? -1 : (a.count == null ? 0 : a.count);
			var bv = b.zero ? -1 : (b.count == null ? 0 : b.count);
			if (av !== bv) return av - bv;
			return String(a.objective.code || '').localeCompare(String(b.objective.code || ''));
		});
		return rows;
	}

	/** Pure: a human note about how a question count spreads over Bloom levels. */
	function bloomSpreadNote(bloomCounts) {
		if (!bloomCounts) return null;
		var total = 0;
		var levels = 0;
		var maxBloom = null;
		Object.keys(bloomCounts).forEach(function (bloomId) {
			total += bloomCounts[bloomId];
			levels += 1;
			if (!maxBloom || bloomCounts[bloomId] > bloomCounts[maxBloom]) maxBloom = bloomId;
		});
		if (total === 0) return null;
		if (levels === 1) return { concentrated: true, levels: 1, bloomId: maxBloom, label: t('bloomConcentrated') };
		return { concentrated: false, levels: levels, bloomId: maxBloom, label: t('bloomSpread', { n: levels }) };
	}

	/** Skeleton shimmer row (loading state for the coverage panel). */
	function coverageSkeleton() {
		var out = '';
		for (var i = 0; i < 4; i++) {
			out += '<div class="qp-coverage-row qp-skeleton-row"><span class="qp-skeleton" style="width:90px"></span>' +
				'<span class="qp-skeleton qp-skeleton--grow"></span>' +
				'<span class="qp-skeleton" style="width:70px"></span>' +
				'<span class="qp-skeleton" style="width:110px"></span></div>';
		}
		return out;
	}

	function renderCoverage() {
		var body = document.getElementById('qpCoverageBody');
		if (!body) return;
		var counts = summarizeStatuses(questionRows().map(rowQuestion));

		if (!state.objectives.length) {
			updateCoverageSummary();
			body.innerHTML = '<div class="qp-coverage-empty">' +
				'<span class="qp-coverage-empty-icon" aria-hidden="true">' +
				'<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>' +
				'</span><strong>' + esc(t('coverageEmptyTitle')) + '</strong>' +
				'<p>' + esc(t('coverageNoObjectives')) + '</p></div>';
			return;
		}

		updateCoverageSummary();
		body.innerHTML = coverageSkeleton();
		loadCoverageCounts().then(function (perObjective) {
			// Re-read: the list may have been re-rendered while loading.
			var stillThere = document.getElementById('qpCoverageBody');
			if (!stillThere || stillThere !== body) return;

			var maxCount = 1;
			var ordered = coverageAttentionRows(state.objectives, perObjective);
			ordered.forEach(function (row) { if (row.count > maxCount) maxCount = row.count; });

			var unalignedFirst =
				(counts.unclassified > 0
					? '<div class="qp-coverage-row qp-coverage-row--unaligned">' +
						'<span class="qp-coverage-flag qp-chip qp-chip--red"><span class="qp-chip-icon" aria-hidden="true">⚠</span>' + esc(t('attentionTitle')) + '</span>' +
						'<span class="qp-coverage-statement"><strong>' + counts.unclassified + '</strong> ' + esc(t('attentionUnaligned')) + '</span>' +
						'<button type="button" class="btn btn-secondary btn-sm qp-coverage-filter" data-qp-objective="__unaligned__" title="' + esc(t('coverageOpenFilter')) + '">' +
						esc(t('coverageOpenFilter')) + '<span class="qp-coverage-filter-arrow" aria-hidden="true">→</span></button>' +
						'</div>'
					: '');

			var zeroHeaderNeeded = ordered.some(function (row) { return row.zero; });
			var html = unalignedFirst;
			if (zeroHeaderNeeded) {
				html += '<div class="qp-coverage-section"><span class="qp-coverage-flag qp-chip qp-chip--amber"><span class="qp-chip-icon" aria-hidden="true">⚠</span>' + esc(t('attentionTitle')) + '</span>' +
					'<span class="qp-coverage-section-note">' + esc(t('attentionZero')) + '</span></div>';
			}
			ordered.forEach(function (row) {
				var objective = row.objective;
				var pct = row.count == null ? 0 : Math.round((row.count / maxCount) * 100);
				var spreadHtml = row.spread
					? '<span class="qp-coverage-spread' + (row.spread.concentrated ? ' qp-coverage-spread--warn' : '') + '" title="' + esc(t('bloom') + ': ' + (bloomLabel(row.spread.bloomId) || '')) + '">' + esc(row.spread.label) + '</span>'
					: '';
				var countHtml = row.error
					? '<span class="qp-coverage-na" title="' + esc(t('loadFailed', { msg: '' })) + '">—</span>'
					: row.zero
						? '<span class="qp-coverage-zero">' + esc(t('attentionZero')) + '</span>'
						: '<strong>' + row.count + '</strong>';
				html += '<div class="qp-coverage-row' + (row.zero ? ' qp-coverage-row--empty' : '') + '">' +
					'<span class="qp-coverage-code" title="' + esc(objective.code) + '">' + esc(objective.code) + '</span>' +
					'<span class="qp-coverage-main"><span class="qp-coverage-statement" title="' + esc(objective.statement || '') + '">' + esc(objectiveLabelStatement(objective)) + '</span>' +
					(row.zero ? '' : '<span class="qp-coverage-bar" aria-hidden="true"><span class="qp-coverage-bar-fill" style="width:' + pct + '%"></span></span>' + spreadHtml) + '</span>' +
					'<span class="qp-coverage-count">' + countHtml + (row.truncated ? '+' : '') + '</span>' +
					'<button type="button" class="btn btn-secondary btn-sm qp-coverage-filter" data-qp-objective="' + esc(objective.id) + '" title="' + esc(t('coverageOpenFilter')) + '">' +
					esc(t('coverageOpenFilter')) + '<span class="qp-coverage-filter-arrow" aria-hidden="true">→</span></button>' +
					'</div>';
			});
			body.innerHTML = html;
			updateCoverageSummary();
		}).catch(function (err) {
			var stillThere = document.getElementById('qpCoverageBody');
			if (!stillThere) return;
			stillThere.innerHTML = '<div class="qp-coverage-empty">' + esc(t('loadFailed', { msg: err.message })) +
				' <button type="button" class="btn btn-secondary btn-sm" id="qpCoverageRetry">' + esc(t('retry')) + '</button></div>';
			var retry = document.getElementById('qpCoverageRetry');
			if (retry) retry.addEventListener('click', renderCoverage);
		});
	}

	function wireCoverageFilterClicks() {
		document.addEventListener('click', function (event) {
			var button = event.target.closest('.qp-coverage-filter');
			if (!button) return;
			var value = button.getAttribute('data-qp-objective') || '';
			var select = document.getElementById('qpFilterObjective');
			if (!select) return;
			select.value = value;
			var bar = document.getElementById('qpFilterBar');
			if (bar && typeof bar._syncClearVisibility === 'function') bar._syncClearVisibility();
			// Unaligned filter is a status predicate — cheap and instant.
			if (value === '__unaligned__') {
				applyPedagogyFilter();
			} else if (typeof window.filterQuestions === 'function') {
				window.filterQuestions(true);
			} else {
				applyPedagogyFilter();
			}
			var panel = document.getElementById('qpCoveragePanel');
			if (panel) panel.hidden = true;
			var questionsTab = document.querySelector('.nav-tab[data-tab="questions"]');
			if (questionsTab && typeof window.openTab === 'function') window.openTab({ currentTarget: questionsTab }, 'questions');
		});
	}

	/* ═══════════════════════════ question editor ═══════════════════════════ */

	function ensureEditorSection() {
		if (document.getElementById('qpEditorBlock')) return;
		var difficulty = document.getElementById('difficulty');
		var anchor = difficulty ? difficulty.closest('.form-group') : null;
		var form = document.getElementById('questionForm');
		if (!anchor || !form) return;

		var block = document.createElement('div');
		block.className = 'form-group qp-editor-block';
		block.id = 'qpEditorBlock';
		block.dir = langDir();
		block.innerHTML =
			'<div class="qp-editor-head">' +
			'<div class="qp-editor-head-main">' +
			'<span class="qp-editor-icon" aria-hidden="true">' +
			'<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>' +
			'</span>' +
			'<div class="qp-editor-head-text">' +
			'<button type="button" id="qpEditorToggle" class="qp-editor-toggle" aria-expanded="false" aria-controls="qpEditorBody">' +
			'<span class="qp-editor-toggle-icon" aria-hidden="true">▸</span>' +
			'<span>' + esc(t('panelOptional')) + '</span></button>' +
			'<p class="qp-editor-sub">' + esc(t('editorSub')) + '</p>' +
			'</div></div>' +
			'<span class="qp-editor-status qp-editor-status--none" id="qpEditorStatusChip">' + esc(t('editorStatusNone')) + '</span>' +
			'</div>' +
			'<div id="qpEditorBody" class="qp-editor-body" hidden>' +
			'<div class="qp-editor-intro">' +
			'<p class="qp-editor-hint">' + esc(t('panelHint')) + '</p>' +
			'<p class="qp-editor-note" title="' + esc(t('bloomExplain')) + '">' + esc(t('difficultyNote')) + '</p>' +
			'</div>' +
			'<div class="qp-editor-context-row">' +
			'<p class="qp-editor-context" id="qpEditorContext" hidden></p>' +
			'<span id="qpEditorSummary" class="qp-editor-summary" aria-live="polite"></span>' +
			'</div>' +
			'<div class="qp-editor-field qp-editor-field--objective qp-picker-field">' +
			'<label for="qpEditorObjectiveSearch">' + esc(t('objective')) + '</label>' +
			'<input type="hidden" id="qpEditorObjective" value="" />' +
			'<span class="qp-picker" id="qpEditorPicker">' +
			'<input type="text" id="qpEditorObjectiveSearch" class="form-control qp-picker-input" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="qpEditorObjectiveList" aria-autocomplete="list" placeholder="' + esc(t('pickerPlaceholder')) + '" />' +
			'<button type="button" class="qp-picker-clear" id="qpEditorPickerClear" aria-label="' + esc(t('pickerClear')) + '" hidden>✕</button>' +
			'<ul class="qp-picker-list" id="qpEditorObjectiveList" role="listbox" hidden></ul>' +
			'</span>' +
			'<p class="qp-field-hint">' + esc(t('editorObjectiveHelp')) + '</p>' +
			'</div>' +
			'<div class="qp-editor-grid">' +
			'<div class="qp-editor-field"><label for="qpEditorBloom" title="' + esc(t('bloomExplain')) + '">' + esc(t('bloom')) + '</label>' +
			'<select id="qpEditorBloom" class="form-control"></select>' +
			'<p class="qp-field-hint">' + esc(t('editorBloomHelp')) + '</p></div>' +
			'<div class="qp-editor-field"><label for="qpEditorCompetency">' + esc(t('competency')) + '</label>' +
			'<select id="qpEditorCompetency" class="form-control"></select>' +
			'<p class="qp-field-hint">' + esc(t('editorCompetencyHelp')) + '</p></div>' +
			'</div>' +
			'<p class="qp-editor-immutability">' + esc(t('immutabilityNote')) + '</p>' +
			'<div class="qp-editor-advanced">' +
			'<div class="qp-editor-advanced-text"><strong>' + esc(t('advanced')) + '</strong>' +
			'<span>' + esc(t('editorAdvancedHint')) + '</span></div>' +
			'<button type="button" id="qpEditorAdvanced" class="btn btn-secondary btn-sm" title="' + esc(t('editorAdvancedOpen')) + '">' + esc(t('advanced')) + '</button>' +
			'</div>' +
			'</div>';

		// The section must start on its OWN LINE. Inserting after the difficulty
		// field would place it inside the surrounding .form-row, where it would
		// become a flex sibling of Points/Time/Difficulty and squeeze them.
		var row = anchor.closest ? anchor.closest('.form-row') : null;
		var insertAfter = row || anchor;
		insertAfter.parentNode.insertBefore(block, insertAfter.nextSibling);

		block.querySelector('#qpEditorToggle').addEventListener('click', function () {
			var body = block.querySelector('#qpEditorBody');
			var open = body.hidden;
			body.hidden = !open;
			this.setAttribute('aria-expanded', open ? 'true' : 'false');
			this.querySelector('.qp-editor-toggle-icon').textContent = open ? '▾' : '▸';
			block.classList.toggle('is-open', open);
			if (open) {
				populateEditorOptions();
				updateEditorStatus();
			}
		});
		block.querySelector('#qpEditorAdvanced').addEventListener('click', function () {
			if (!state.editor.questionId) {
				// A question that does not exist yet has nothing to classify: the
				// simple section applies after the first save (onQuestionSaved).
				toast(t('advancedNeedsSave'), 'info');
				return;
			}
			openCriteriaEditor({ id: state.editor.questionId });
		});
		['qpEditorBloom', 'qpEditorCompetency'].forEach(function (id) {
			block.querySelector('#' + id).addEventListener('change', function () {
				state.editor.dirty = true;
				updateEditorStatus();
			});
		});
	}

	/**
	 * The compact status pill in the section header. It answers "is this
	 * question aligned?" without making the teacher open the section.
	 */
	function updateEditorStatus() {
		var chip = document.getElementById('qpEditorStatusChip');
		if (!chip) return;
		var objectiveId = (document.getElementById('qpEditorObjective') || {}).value || '';
		var bloomId = (document.getElementById('qpEditorBloom') || {}).value || '';
		var status = 'none';
		if (state.editor.multi) status = 'multi';
		else if (objectiveId && bloomId) status = 'aligned';
		else if (objectiveId || bloomId) status = 'partial';
		var labels = {
			none: t('editorStatusNone'),
			partial: t('editorStatusPartial'),
			aligned: t('editorStatusAligned'),
			multi: t('editorStatusMulti'),
		};
		chip.className = 'qp-editor-status qp-editor-status--' + status;
		chip.textContent = labels[status];
	}

	/** Pure: the objectives visible for a subject context (empty = all). */
	function objectivesForSubject(subjectId, list) {
		var pool = list || state.objectives;
		if (!subjectId) return pool;
		return pool.filter(function (objective) { return String(objective.subject_id || '') === String(subjectId); });
	}

	/** Pure: match an objective against a search query (code + statement). */
	function objectiveMatchesQuery(objective, query) {
		var q = String(query || '').toLowerCase().trim();
		if (!q) return true;
		return (String(objective.code || '') + ' ' + String(objective.statement || '')).toLowerCase().indexOf(q) >= 0;
	}

	/** Pure: the picker display label for a selected objective id. */
	function objectivePickerLabel(objectiveId) {
		for (var i = 0; i < state.objectives.length; i++) {
			if (String(state.objectives[i].id) === String(objectiveId)) {
				var o = state.objectives[i];
				return o.code + ' — ' + objectiveLabelStatement(o);
			}
		}
		return '';
	}

	var PICKER_MAX_RESULTS = 40;

	function refreshEditorContext() {
		var context = document.getElementById('qpEditorContext');
		var subjectSelect = document.getElementById('questionSubject');
		if (!context) return;
		var subjectText = subjectSelect && subjectSelect.selectedIndex > -1 && subjectSelect.value
			? subjectSelect.options[subjectSelect.selectedIndex].text : '';
		if (subjectText) {
			context.hidden = false;
			context.innerHTML = '<span class="qp-editor-context-label">' + esc(t('contextSubject')) + ':</span> ' + esc(subjectText);
		} else {
			context.hidden = true;
			context.innerHTML = '';
		}
		refreshObjectivePicker();
	}

	/** Render the searchable objective picker's dropdown for a query. */
	function refreshObjectivePicker() {
		var list = document.getElementById('qpEditorObjectiveList');
		var input = document.getElementById('qpEditorObjectiveSearch');
		var hidden = document.getElementById('qpEditorObjective');
		if (!list || !input || !hidden) return;
		var subjectId = (document.getElementById('questionSubject') || {}).value || '';
		var pool = objectivesForSubject(subjectId);
		var query = state.editor.pickerQuery != null ? state.editor.pickerQuery : '';
		var selected = String(hidden.value || '');
		var matches = [];
		for (var i = 0; i < pool.length; i++) {
			if (objectiveMatchesQuery(pool[i], query)) matches.push(pool[i]);
		}
		var overflow = matches.length > PICKER_MAX_RESULTS ? matches.length - PICKER_MAX_RESULTS : 0;
		matches = matches.slice(0, PICKER_MAX_RESULTS);
		if (!pool.length) {
			list.innerHTML = '<li class="qp-picker-empty">' + esc(t('coverageNoObjectives')) + '</li>';
		} else if (!matches.length) {
			list.innerHTML = '<li class="qp-picker-empty">' + esc(t('pickerEmpty')) + '</li>';
		} else {
			list.innerHTML = matches.map(function (objective, index) {
				var selectedCls = String(objective.id) === selected ? ' qp-picker-option--selected' : '';
				var mine = objective.proposed_by ? ' <span class="qp-tag">' + esc(t('myProposal')) + '</span>' : '';
				return '<li class="qp-picker-option' + selectedCls + '" role="option" id="qpPickerOpt' + index + '" data-qp-objective-id="' + esc(objective.id) + '">' +
					'<span class="qp-picker-code">' + esc(objective.code) + '</span>' +
					'<span class="qp-picker-statement">' + esc(objectiveLabelStatement(objective)) + '</span>' + mine + '</li>';
			}).join('') + (overflow > 0 ? '<li class="qp-picker-empty">+ ' + overflow + '</li>' : '');
		}
		list.hidden = false;
		input.setAttribute('aria-expanded', 'true');
		state.editor.pickerActive = -1;
	}

	function closeObjectivePicker() {
		var list = document.getElementById('qpEditorObjectiveList');
		var input = document.getElementById('qpEditorObjectiveSearch');
		if (list) { list.hidden = true; list.innerHTML = ''; }
		if (input) {
			input.setAttribute('aria-expanded', 'false');
			// Restore the display label of the currently selected value.
			input.value = objectivePickerLabel((document.getElementById('qpEditorObjective') || {}).value || '');
		}
		state.editor.pickerQuery = '';
		state.editor.pickerActive = -1;
	}

	function selectObjective(objectiveId) {
		var hidden = document.getElementById('qpEditorObjective');
		if (hidden) hidden.value = String(objectiveId || '');
		state.editor.dirty = true;
		var clear = document.getElementById('qpEditorPickerClear');
		if (clear) clear.hidden = !objectiveId;
		closeObjectivePicker();
		updateEditorStatus();
	}

	function wireObjectivePicker() {
		var input = document.getElementById('qpEditorObjectiveSearch');
		var hidden = document.getElementById('qpEditorObjective');
		var clear = document.getElementById('qpEditorPickerClear');
		var list = document.getElementById('qpEditorObjectiveList');
		if (!input || !hidden || !list) return;

		input.addEventListener('focus', function () { refreshObjectivePicker(); });
		input.addEventListener('input', function () {
			state.editor.pickerQuery = input.value;
			refreshObjectivePicker();
		});
		input.addEventListener('keydown', function (event) {
			var listEl = document.getElementById('qpEditorObjectiveList');
			var options = listEl ? Array.prototype.slice.call(listEl.querySelectorAll('.qp-picker-option')) : [];
			if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
				if (!options.length) return;
				event.preventDefault();
				state.editor.pickerActive = (state.editor.pickerActive + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
				options.forEach(function (option, index) {
					option.classList.toggle('qp-picker-option--active', index === state.editor.pickerActive);
					if (index === state.editor.pickerActive) input.setAttribute('aria-activedescendant', option.id);
				});
			} else if (event.key === 'Enter') {
				var active = options[state.editor.pickerActive >= 0 ? state.editor.pickerActive : 0];
				if (active && !listEl.hidden) {
					event.preventDefault();
					selectObjective(active.getAttribute('data-qp-objective-id'));
				}
			} else if (event.key === 'Escape') {
				closeObjectivePicker();
			}
		});
		list.addEventListener('mousedown', function (event) {
			var option = event.target.closest('.qp-picker-option');
			if (!option) return;
			event.preventDefault(); // keep the input's focus
			selectObjective(option.getAttribute('data-qp-objective-id'));
		});
		if (clear) clear.addEventListener('click', function () { selectObjective(''); });
		// Click anywhere else closes the dropdown.
		document.addEventListener('click', function (event) {
			if (!event.target.closest('#qpEditorPicker')) closeObjectivePicker();
		});
		// The subject select drives both the context chip and the offered objectives.
		var subjectSelect = document.getElementById('questionSubject');
		if (subjectSelect) subjectSelect.addEventListener('change', refreshEditorContext);
	}

	function populateEditorOptions() {
		var hidden = document.getElementById('qpEditorObjective');
		var bloomSelect = document.getElementById('qpEditorBloom');
		var competencySelect = document.getElementById('qpEditorCompetency');
		if (!hidden || !bloomSelect || !competencySelect) return;

		bloomSelect.innerHTML = '<option value="">' + esc(t('none')) + '</option>' +
			state.bloom.map(function (row) {
				return '<option value="' + esc(row.id) + '">' + esc(bloomLabel(row.id) || row.name) + '</option>';
			}).join('');
		competencySelect.innerHTML = '<option value="">' + esc(t('none')) + '</option>' +
			state.competencies.map(function (competency) {
				return '<option value="' + esc(competency.id) + '">' + esc((competency.code ? competency.code + ' — ' : '') + (competency.name || '')) + '</option>';
			}).join('');

		bloomSelect.value = state.editor.bloomId || '';
		competencySelect.value = state.editor.competencyId || '';
		hidden.value = state.editor.objectiveId || '';

		// A multi-criterion question is summarized, never silently rewritten.
		var summary = document.getElementById('qpEditorSummary');
		var fields = [bloomSelect, competencySelect, document.getElementById('qpEditorObjectiveSearch')].filter(Boolean);
		var advancedButton = document.getElementById('qpEditorAdvanced');
		if (advancedButton) {
			advancedButton.disabled = !state.editor.questionId;
			advancedButton.title = state.editor.questionId ? t('advanced') : t('advancedNeedsSave');
		}
		if (state.editor.multi) {
			fields.forEach(function (field) { field.disabled = true; });
			summary.innerHTML = '<span class="qp-editor-multi">' + esc(t('unchanged')) + '</span>';
		} else {
			fields.forEach(function (field) { field.disabled = false; });
			summary.innerHTML = '';
		}
		var clear = document.getElementById('qpEditorPickerClear');
		if (clear) clear.hidden = !hidden.value;
		var search = document.getElementById('qpEditorObjectiveSearch');
		if (search) search.value = objectivePickerLabel(hidden.value);
		refreshEditorContext();
		updateEditorStatus();
	}

	/**
	 * Called by questions-management.js when the question form modal opens.
	 * `question` is the object being edited, or null for a new question.
	 */
	function onEditorOpened(question) {
		if (!state.enabled) return;
		state.editor = { questionId: question && question.id ? question.id : null, dirty: false, multi: false, objectiveId: '', bloomId: '', competencyId: '', pickerQuery: '', pickerActive: -1 };
		ensureEditorSection();
		var block = document.getElementById('qpEditorBlock');
		if (!block) return;
		var body = block.querySelector('#qpEditorBody');
		body.hidden = true; // progressive disclosure: collapsed until the teacher opens it
		block.querySelector('#qpEditorToggle').setAttribute('aria-expanded', 'false');
		block.querySelector('.qp-editor-toggle-icon').textContent = '▸';
		populateEditorOptions();
		if (question && question.id) {
			// Load the existing set; only the simple 0/1-criterion cases are editable here.
			apiRaw('GET', '/learning/questions/' + encodeURIComponent(question.id) + '/pedagogy')
				.then(function (payload) {
					var criteria = (payload && payload.criteria) || [];
					if (!criteria.length) return; // unclassified — nothing to prefill
					if (criteria.length > 1) {
						state.editor.multi = true;
						populateEditorOptions();
						return;
					}
					var only = criteria[0];
					state.editor.objectiveId = only.objective_id || '';
					state.editor.bloomId = only.bloom_dimension_id || '';
					state.editor.competencyId = only.competency_id || '';
					populateEditorOptions();
				})
				.catch(function (err) {
					console.warn('[pedagogy] prefill failed:', err);
					var summary = document.getElementById('qpEditorSummary');
					if (summary) summary.innerHTML = '<span class="qp-editor-multi">' + esc(t('loadFailed', { msg: err.message })) + '</span>';
				});
		}
	}

	/**
	 * Called by questions-management.js AFTER a question was persisted. Applies
	 * the simple editor's selection (PUT single criterion / PUT [] to clear).
	 * Never fails the question save: failures surface as a toast only.
	 * @returns {Promise<void>}
	 */
	function onQuestionSaved(question) {
		if (!state.enabled || !question || !question.id || !state.editor.dirty) return Promise.resolve();
		var questionId = question.id;
		var objectiveId = (document.getElementById('qpEditorObjective') || {}).value || '';
		var bloomId = (document.getElementById('qpEditorBloom') || {}).value || '';
		var competencyId = (document.getElementById('qpEditorCompetency') || {}).value || '';

		var hadPrevious = state.editor.questionId === questionId && (state.editor.objectiveId || state.editor.multi);
		var payload = buildSingleCriterion(objectiveId, bloomId, competencyId);

		if (!payload) {
			if (!hadPrevious || state.editor.multi) {
				// Nothing chosen and nothing (editable) existed before → no write.
				resetEditorState();
				return Promise.resolve();
			}
			// The teacher cleared a previously simple classification → clear it.
			return apiRaw('PUT', '/learning/questions/' + encodeURIComponent(questionId) + '/pedagogy', { criteria: [], source: 'manual' })
				.then(function () {
					syncMirrorQuestion(questionId, { pedagogy_status: 'unclassified', primary_bloom_dimension_id: '' });
					toast(t('toastClearedQuestion'), 'success');
					onListRendered();
				})
				.catch(function (err) { toast(t('toastSaveFailed', { msg: err.message }), 'error'); })
				.then(resetEditorState);
		}

		return apiRaw('PUT', '/learning/questions/' + encodeURIComponent(questionId) + '/pedagogy', payload)
			.then(function (result) {
				var updated = (result && result.question) || {};
				syncMirrorQuestion(questionId, {
					pedagogy_status: updated.pedagogy_status || 'classified',
					primary_bloom_dimension_id: updated.primary_bloom_dimension_id || bloomId,
				});
				toast(t('toastClassified'), 'success');
				onListRendered();
			})
			.catch(function (err) { toast(t('toastSaveFailed', { msg: err.message }), 'error'); })
			.then(resetEditorState);
	}

	function resetEditorState() {
		state.editor = { questionId: null, dirty: false, multi: false, objectiveId: '', bloomId: '', competencyId: '' };
	}

	/** Keep the local mirror row's cached columns aligned with the server write. */
	function syncMirrorQuestion(questionId, patch) {
		try {
			var questions = window.__DI_CONTAINER__.repo.getAll_sync('questions') || [];
			for (var i = 0; i < questions.length; i++) {
				if (String(questions[i].id) === String(questionId)) {
					questions[i] = Object.assign({}, questions[i], patch);
					window.__DI_CONTAINER__.repo.setAll_sync('questions', questions);
					return;
				}
			}
		} catch (err) {
			console.warn('[pedagogy] mirror sync failed:', err);
		}
	}

	/* ═══════════════════════ criteria editor (per question) ════════════════ */

	function ensureCriteriaModal() {
		if (document.getElementById('qpCriteriaModal')) return;
		var modal = document.createElement('div');
		modal.id = 'qpCriteriaModal';
		modal.className = 'modal qp-criteria-modal';
		modal.setAttribute('aria-hidden', 'true');
		modal.setAttribute('role', 'dialog');
		modal.setAttribute('aria-modal', 'true');
		modal.setAttribute('aria-labelledby', 'qpCriteriaTitle');
		modal.innerHTML =
			'<div class="modal-content qp-modal-content">' +
			'<div class="modal-header qp-modal-head">' +
			'<div class="modal-header-with-icon"><div class="modal-header-icon icon-violet">' +
			'<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>' +
			'</div><div class="modal-header-text"><h2 id="qpCriteriaTitle">' + esc(t('criteriaTitle')) + '</h2>' +
			'<p class="modal-header-subtitle" id="qpCriteriaSubtitle"></p></div></div>' +
			'<button type="button" class="close qp-modal-close" id="qpCriteriaClose" aria-label="' + esc(t('close')) + '">&times;</button></div>' +
			'<div class="modal-body qp-modal-body" id="qpCriteriaBody" dir="' + langDir() + '"></div>' +
			'<div class="modal-footer modal-footer--unified qp-modal-footer" id="qpCriteriaFooter" dir="' + langDir() + '"></div>' +
			'</div>';
		document.body.appendChild(modal);
		modal.querySelector('#qpCriteriaClose').addEventListener('click', closeCriteriaModal);
		modal.addEventListener('click', function (event) {
			if (event.target === modal) closeCriteriaModal();
			if (event.target.closest('[data-qp-add-criterion]')) {
				criteriaState.rows = readCriteriaRows();
				criteriaState.rows.push(emptyCriterionRow());
				paintCriteriaModal();
			}
			var remove = event.target.closest('[data-qp-remove-criterion]');
			if (remove) {
				criteriaState.rows = readCriteriaRows();
				criteriaState.rows.splice(Number(remove.getAttribute('data-qp-remove-criterion')), 1);
				paintCriteriaModal();
			}
			if (event.target.closest('[data-qp-cancel]')) closeCriteriaModal();
			if (event.target.closest('[data-qp-clear]')) clearClassification();
			if (event.target.closest('[data-qp-save]')) saveCriteria(event.target.closest('[data-qp-save]'));
		});
		// Escape closes the dialog — expected keyboard behaviour for modals.
		modal.addEventListener('keydown', function (event) {
			if (event.key === 'Escape' && modal.classList.contains('active')) {
				event.stopPropagation();
				closeCriteriaModal();
			}
		});
		modal.addEventListener('input', function (event) {
			if (event.target.matches('[data-qp-crit-weight]')) updateWeightSum();
		});
	}

	var criteriaState = { questionId: null, questionLabel: '', rows: [], status: 'unclassified', busy: false, loaded: false };

	function openCriteriaEditorById(questionId) {
		var questions = [];
		try { questions = window.__DI_CONTAINER__.repo.getAll_sync('questions') || []; } catch (_) { /* ignore */ }
		var question = null;
		for (var i = 0; i < questions.length; i++) if (String(questions[i].id) === String(questionId)) { question = questions[i]; break; }
		openCriteriaEditor(question || { id: questionId, question: '' });
	}

	function openCriteriaEditor(question) {
		if (!state.enabled || !question || !question.id) {
			if (state.enabled) toast(t('advancedNeedsSave'), 'info');
			return;
		}
		ensureCriteriaModal();
		criteriaState = { questionId: question.id, questionLabel: questionLabelOf(question), rows: [], status: 'unclassified', busy: false, loaded: false };
		var modal = document.getElementById('qpCriteriaModal');
		modal.classList.add('active');
		modal.style.display = 'flex';
		modal.setAttribute('aria-hidden', 'false');
		document.getElementById('qpCriteriaTitle').textContent = t('criteriaTitle');
		document.getElementById('qpCriteriaSubtitle').textContent = criteriaState.questionLabel;
		document.getElementById('qpCriteriaBody').innerHTML =
			'<div class="qp-criteria-loading" role="status" aria-live="polite">' +
			'<span class="qp-skeleton qp-skeleton--block"></span>' +
			'<span class="qp-skeleton qp-skeleton--block"></span>' +
			'<span class="qp-criteria-loading-label">' + esc(t('loading')) + '</span></div>';
		document.getElementById('qpCriteriaFooter').innerHTML = '';
		apiRaw('GET', '/learning/questions/' + encodeURIComponent(question.id) + '/pedagogy')
			.then(function (payload) {
				criteriaState.rows = ((payload && payload.criteria) || []).map(criterionToRow);
				criteriaState.status = (payload && payload.pedagogy_status) || 'unclassified';
				criteriaState.loaded = true;
				paintCriteriaModal();
			})
			.catch(function (err) {
				document.getElementById('qpCriteriaBody').innerHTML =
					'<div class="qp-coverage-empty"><strong>' + esc(t('coverageEmptyTitle')) + '</strong><p>' + esc(t('loadFailed', { msg: err.message })) + '</p></div>';
			});
	}

	function closeCriteriaModal() {
		var modal = document.getElementById('qpCriteriaModal');
		if (!modal) return;
		modal.classList.remove('active');
		modal.style.display = 'none';
		modal.setAttribute('aria-hidden', 'true');
		criteriaState = { questionId: null, questionLabel: '', rows: [], status: 'unclassified', busy: false, loaded: false };
		refreshList();
	}

	function refreshList() {
		if (typeof window.updateQuestionList === 'function') {
			try { window.updateQuestionList(); return; } catch (_) { /* fall through */ }
		}
		if (typeof window.filterQuestions === 'function') window.filterQuestions(false);
	}

	function questionLabelOf(question) {
		var text = String((question && (question.question || question.text)) || '');
		return (question && question.type ? question.type + ' · ' : '') + (text.length > 60 ? text.slice(0, 59) + '…' : text);
	}

	function criterionToRow(criterion) {
		return {
			objective_id: criterion.objective_id || '',
			bloom_dimension_id: criterion.bloom_dimension_id || '',
			competency_id: criterion.competency_id || '',
			weight: Number(criterion.weight) || 0,
			criterion_key: criterion.criterion_key && criterion.criterion_key !== 'main' ? criterion.criterion_key : '',
			max_score: criterion.max_score == null ? '' : String(criterion.max_score),
			rubric: rubricText(criterion.rubric_json),
		};
	}

	function rubricText(value) {
		if (!value) return '';
		if (typeof value === 'object') return value.text != null ? String(value.text) : '';
		try {
			var parsed = JSON.parse(value);
			if (parsed && typeof parsed === 'object' && parsed.text != null) return String(parsed.text);
			return typeof parsed === 'string' ? parsed : '';
		} catch (_) {
			return String(value);
		}
	}

	function emptyCriterionRow() {
		return { objective_id: '', bloom_dimension_id: '', competency_id: '', weight: 1, criterion_key: '', max_score: '', rubric: '' };
	}

	function readCriteriaRows() {
		var body = document.getElementById('qpCriteriaBody');
		if (!body) return criteriaState.rows;
		return Array.prototype.map.call(body.querySelectorAll('[data-qp-criterion]'), function (node) {
			return {
				objective_id: node.querySelector('[data-qp-crit-objective]').value,
				bloom_dimension_id: node.querySelector('[data-qp-crit-bloom]').value,
				competency_id: node.querySelector('[data-qp-crit-competency]').value,
				weight: Number(node.querySelector('[data-qp-crit-weight]').value),
				criterion_key: node.querySelector('[data-qp-crit-key]').value.trim(),
				max_score: node.querySelector('[data-qp-crit-max]').value.trim(),
				rubric: node.querySelector('[data-qp-crit-rubric]').value.trim(),
			};
		});
	}

	function paintCriteriaModal() {
		var body = document.getElementById('qpCriteriaBody');
		var footer = document.getElementById('qpCriteriaFooter');
		if (!body || !footer) return;
		body.dir = langDir();
		footer.dir = langDir();
		var status = criteriaState.status;

		var rowsHtml = criteriaState.rows.length
			? criteriaState.rows.map(function (row, index) { return criterionRowHtml(row, index); }).join('')
			: '<div class="qp-criteria-empty-card">' +
				'<span class="qp-criteria-empty-icon" aria-hidden="true">' +
				'<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>' +
				'</span>' +
				'<strong>' + esc(t('criteriaEmptyTitle')) + '</strong>' +
				'<p>' + esc(t('criteriaEmptyBody')) + '</p>' +
				'<button type="button" class="qp-criterion-add qp-criterion-add--inline" data-qp-add-criterion>＋ ' + esc(t('criteriaAddFirst')) + '</button>' +
				'</div>';

		// Plain-language task line first (what the teacher is here to do),
		// then the criteria — nothing else at the top level.
		body.innerHTML =
			'<div class="qp-criteria-banner" role="status" aria-live="polite">' +
				'<span class="qp-chip ' + statusChipClass(status) + '"><span class="qp-chip-icon" aria-hidden="true">' +
				(STATUS_META[status] || STATUS_META.unclassified).icon + '</span>' + esc(statusLabel(status)) + '</span> ' +
				'<span class="qp-criteria-task">' + esc(t('statusExplain_' + (STATUS_META[status] ? status : 'unclassified'))) + '</span>' +
				'<span class="qp-criteria-count">' + esc(t('criteriaCount', { n: criteriaState.rows.length })) + '</span>' +
			'</div>' +
			'<div class="qp-criteria-rows">' + rowsHtml + '</div>' +
			(criteriaState.rows.length
				? '<button type="button" class="qp-criterion-add" data-qp-add-criterion>＋ ' + esc(t('addCriterion')) + '</button>'
				: '');

		// Action hierarchy: quiet maintenance on the left, the live weight state
		// beside the primary decision (Cancel / Save) on the right.
		footer.innerHTML =
			'<div class="qp-footer-side">' +
				'<button type="button" class="btn btn-sm qp-criteria-clear" data-qp-clear' + (criteriaState.rows.length ? '' : ' disabled') + '>' + esc(t('clear')) + '</button>' +
				'<label class="qp-reviewed-label"><input type="checkbox" id="qpMarkReviewed" checked /> ' + esc(t('markReviewed')) + '</label>' +
			'</div>' +
			'<div class="qp-footer-main">' +
				'<span class="qp-weightmeter qp-weightmeter--short" role="status" aria-live="polite"><span class="qp-weightmeter-bar" aria-hidden="true"><span class="qp-weightmeter-fill qp-weightmeter-fill--short" id="qpWeightBarFill"></span></span>' +
				'<span class="qp-weightsum" id="qpWeightSum"></span></span>' +
				'<button type="button" class="btn btn-secondary" data-qp-cancel>' + esc(t('cancel')) + '</button>' +
				'<button type="button" class="btn btn-primary" data-qp-save disabled>' + esc(t('save')) + '</button>' +
			'</div>';
		updateWeightSum();
		var firstField = body.querySelector('.qp-criterion select');
		if (firstField) firstField.focus();
	}

	function criterionRowHtml(row, index) {
		var objectiveOptions = '<option value="">' + esc(t('select')) + '</option>' + state.objectives.map(function (objective) {
			return '<option value="' + esc(objective.id) + '"' + (String(objective.id) === String(row.objective_id) ? ' selected' : '') + '>' + esc(objective.code + ' — ' + objectiveLabelStatement(objective)) + '</option>';
		}).join('');
		var bloomOptionsHtml = '<option value="">' + esc(t('select')) + '</option>' + state.bloom.map(function (dimension) {
			return '<option value="' + esc(dimension.id) + '"' + (String(dimension.id) === String(row.bloom_dimension_id) ? ' selected' : '') + '>' + esc(bloomLabel(dimension.id) || dimension.name) + '</option>';
		}).join('');
		var competencyOptions = '<option value="">' + esc(t('none')) + '</option>' + state.competencies.map(function (competency) {
			return '<option value="' + esc(competency.id) + '"' + (String(competency.id) === String(row.competency_id) ? ' selected' : '') + '>' + esc((competency.code ? competency.code + ' — ' : '') + (competency.name || '')) + '</option>';
		}).join('');
		// Progressive disclosure: a first criterion with defaults stays focused
		// on the learning objective; scoring details open only when they exist
		// or when the teacher is combining several criteria.
		var hasExtras = row.criterion_key || row.max_score !== '' || row.rubric;
		var openDetails = hasExtras || index > 0;
		return '<div class="qp-criterion" data-qp-criterion data-qp-criterion-index="' + index + '">' +
			'<div class="qp-criterion-head">' +
				'<span class="qp-criterion-num" aria-hidden="true">' + (index + 1) + '</span>' +
				'<span class="qp-criterion-title">' + esc(t('criterion')) + (row.criterion_key ? ' <span class="qp-criterion-key-chip">' + esc(row.criterion_key) + '</span>' : '') + '</span>' +
				'<button type="button" class="qp-criterion-remove" data-qp-remove-criterion="' + index + '" aria-label="' + esc(t('removeCriterion')) + '" title="' + esc(t('removeCriterion')) + '">✕</button>' +
			'</div>' +
			// Primary field: what this question assesses.
			'<label class="qp-field qp-field--full"><span>' + esc(t('objective')) + '</span>' +
				'<select data-qp-crit-objective>' + objectiveOptions + '</select>' +
				'<small>' + esc(t('objectiveExplain')) + '</small></label>' +
			// Skill context, grouped beside it.
			'<div class="qp-criterion-duo">' +
				'<label class="qp-field"><span>' + esc(t('bloom')) + '</span><select data-qp-crit-bloom>' + bloomOptionsHtml + '</select>' +
					'<small>' + esc(t('editorBloomHelp')) + '</small></label>' +
				'<label class="qp-field"><span>' + esc(t('competency')) + '</span><select data-qp-crit-competency>' + competencyOptions + '</select>' +
					'<small>' + esc(t('editorCompetencyHelp')) + '</small></label>' +
			'</div>' +
			'<details class="qp-criterion-more"' + (openDetails ? ' open' : '') + '>' +
				'<summary>' + esc(t('scoringDetails')) + '<span class="qp-criterion-more-hint">' + esc(t('scoringDetailsHint')) + '</span></summary>' +
				'<div class="qp-criterion-scoring">' +
					'<label class="qp-field"><span>' + esc(t('weight')) + '</span><input type="number" min="0" max="1" step="0.05" value="' + esc(row.weight || 0) + '" data-qp-crit-weight /></label>' +
					'<label class="qp-field"><span>' + esc(t('key')) + '</span><input type="text" value="' + esc(row.criterion_key || '') + '" data-qp-crit-key /><small>' + esc(t('keyHint')) + '</small></label>' +
					'<label class="qp-field"><span>' + esc(t('maxScore')) + '</span><input type="number" min="0" step="0.5" value="' + esc(row.max_score) + '" data-qp-crit-max /><small>' + esc(t('maxScoreHint')) + '</small></label>' +
				'</div>' +
				'<label class="qp-field qp-field--full"><span>' + esc(t('rubric')) + '</span><textarea rows="2" data-qp-crit-rubric>' + esc(row.rubric || '') + '</textarea><small>' + esc(t('rubricHint')) + '</small></label>' +
			'</details>' +
			'</div>';
	}

	function updateWeightSum() {
		var rows = readCriteriaRows();
		var sum = rows.reduce(function (acc, row) { return acc + (Number.isFinite(row.weight) ? row.weight : 0); }, 0);
		var indicator = document.getElementById('qpWeightSum');
		var fill = document.getElementById('qpWeightBarFill');
		var complete = rows.length > 0 && Math.abs(sum - 1) <= WEIGHT_TOLERANCE;
		var meter = document.querySelector('#qpCriteriaFooter .qp-weightmeter');
		if (indicator) {
			indicator.textContent = complete
				? t('weightOk')
				: (sum > 1 + WEIGHT_TOLERANCE
					? t('weightOver', { w: (sum - 1).toFixed(2) })
					: t('weightMore', { w: Math.max(0, 1 - sum).toFixed(2) }));
		}
		if (fill) {
			fill.style.width = Math.max(0, Math.min(100, sum * 100)) + '%';
			fill.className = 'qp-weightmeter-fill ' + (complete ? 'qp-weightmeter-fill--ok' : 'qp-weightmeter-fill--short');
		}
		if (meter) meter.className = 'qp-weightmeter ' + (complete ? 'qp-weightmeter--ok' : 'qp-weightmeter--short');
		var save = document.querySelector('[data-qp-save]');
		if (save) save.disabled = criteriaState.busy || !complete;
	}

	/** Pure: the client-side pre-check, so an invalid set never becomes a request. */
	function criteriaProblem(rows) {
		if (!rows.length) return t('criteriaHint');
		for (var i = 0; i < rows.length; i++) {
			if (!rows[i].objective_id) return t('objective');
			if (!rows[i].bloom_dimension_id) return t('bloom');
			if (!Number.isFinite(rows[i].weight) || rows[i].weight < 0) return t('weight');
		}
		var sum = rows.reduce(function (acc, row) { return acc + row.weight; }, 0);
		if (Math.abs(sum - 1) > WEIGHT_TOLERANCE) return t('weightSumHint');
		return null;
	}

	/** Pure: editor row → wire criterion (CriteriaSetSchema shape). */
	function toWireCriterion(row) {
		var criterion = { objective_id: row.objective_id, bloom_dimension_id: row.bloom_dimension_id, weight: row.weight };
		if (row.competency_id) criterion.competency_id = row.competency_id;
		if (row.criterion_key) criterion.criterion_key = row.criterion_key;
		if (row.max_score !== '' && Number.isFinite(Number(row.max_score))) criterion.max_score = Number(row.max_score);
		if (row.rubric) criterion.rubric_json = { text: row.rubric };
		return criterion;
	}

	function saveCriteria(button) {
		var rows = readCriteriaRows();
		var problem = criteriaProblem(rows);
		if (problem) { toast(problem, 'error'); return; }
		criteriaState.busy = true;
		button.disabled = true;
		var markReviewed = !!(document.getElementById('qpMarkReviewed') || {}).checked;
		apiRaw('PUT', '/learning/questions/' + encodeURIComponent(criteriaState.questionId) + '/pedagogy', {
			criteria: rows.map(toWireCriterion),
			source: 'manual',
			mark_reviewed: markReviewed,
		}).then(function (result) {
			var updated = (result && result.question) || {};
			syncMirrorQuestion(criteriaState.questionId, {
				pedagogy_status: updated.pedagogy_status || 'classified',
				primary_bloom_dimension_id: updated.primary_bloom_dimension_id || '',
			});
			toast(t('toastClassified'), 'success');
			closeCriteriaModal();
		}).catch(function (err) {
			criteriaState.busy = false;
			button.disabled = false;
			toast(t('toastSaveFailed', { msg: err.message }), 'error');
		});
	}

	function clearClassification() {
		if (!confirm(t('clearConfirm'))) return;
		criteriaState.busy = true;
		apiRaw('PUT', '/learning/questions/' + encodeURIComponent(criteriaState.questionId) + '/pedagogy', { criteria: [], source: 'manual' })
			.then(function () {
				syncMirrorQuestion(criteriaState.questionId, { pedagogy_status: 'unclassified', primary_bloom_dimension_id: '' });
				toast(t('toastCleared'), 'success');
				closeCriteriaModal();
			})
			.catch(function (err) {
				criteriaState.busy = false;
				toast(t('toastSaveFailed', { msg: err.message }), 'error');
			});
	}

	/* ═══════════════════════════ bulk classification ═══════════════════════ */

	function selectedQuestions() {
		var ids = [];
		document.querySelectorAll('.question-checkbox:checked').forEach(function (checkbox) {
			var row = checkbox.closest('tr.question-table-row');
			var id = row ? row.getAttribute('data-id') : '';
			if (id) ids.push(id);
		});
		return ids;
	}

	function openBulkClassify() {
		if (!state.enabled) return;
		var ids = selectedQuestions();
		if (!ids.length) { toast(t('filterClear'), 'info'); return; }

		ensureCriteriaModal();
		var modal = document.createElement('div');
		modal.id = 'qpBulkModal';
		modal.className = 'modal active qp-bulk-modal';
		modal.style.display = 'flex';
		modal.setAttribute('aria-hidden', 'false');
		modal.setAttribute('role', 'dialog');
		modal.setAttribute('aria-modal', 'true');
		modal.innerHTML =
			'<div class="modal-content qp-modal-content"><div class="modal-header qp-modal-head">' +
			'<div class="modal-header-with-icon"><div class="modal-header-icon icon-violet">' +
			'<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>' +
			'</div><div class="modal-header-text"><h2>' + esc(t('bulkTitle')) + '</h2>' +
			'<p class="modal-header-subtitle">' + esc(t('bulkSelected', { n: String(ids.length) })) + '</p></div></div>' +
			'<button type="button" class="close qp-modal-close" aria-label="' + esc(t('close')) + '">&times;</button></div>' +
			'<div class="modal-body qp-modal-body" dir="' + langDir() + '">' +
			'<div class="qp-bulk-intro"><p class="qp-editor-hint">' + esc(t('bulkHint')) + '</p></div>' +
			'<div class="qp-bulk-preview"><span class="qp-bulk-preview-label">' + esc(t('bulkPreview')) + '</span>' +
			'<span class="qp-bulk-preview-value" id="qpBulkPreview">—</span></div>' +
			'<div class="qp-editor-grid">' +
			'<div class="qp-editor-field"><label for="qpBulkObjective">' + esc(t('objective')) + '</label><select id="qpBulkObjective" class="form-control">' +
			'<option value="">' + esc(t('select')) + '</option>' +
			state.objectives.map(function (objective) {
				return '<option value="' + esc(objective.id) + '">' + esc(objective.code + ' — ' + objectiveLabelStatement(objective)) + '</option>';
			}).join('') +
			'</select></div>' +
			'<div class="qp-editor-field"><label for="qpBulkBloom">' + esc(t('bloom')) + '</label><select id="qpBulkBloom" class="form-control">' +
			'<option value="">' + esc(t('select')) + '</option>' +
			state.bloom.map(function (dimension) {
				return '<option value="' + esc(dimension.id) + '">' + esc(bloomLabel(dimension.id) || dimension.name) + '</option>';
			}).join('') +
			'</select></div>' +
			'</div>' +
			'<p class="qp-bulk-hint" id="qpBulkHint">' + esc(t('bulkNeedSelection')) + '</p>' +
			'<div class="qp-bulk-progress" id="qpBulkProgress" hidden></div>' +
			'<div class="qp-bulk-failures" id="qpBulkFailures" hidden></div>' +
			'</div>' +
			'<div class="modal-footer modal-footer--unified" dir="' + langDir() + '">' +
			'<button type="button" class="btn btn-secondary" id="qpBulkCancel">' + esc(t('cancel')) + '</button>' +
			'<button type="button" class="btn btn-primary" id="qpBulkRun" disabled>' + esc(t('bulkRun', { n: ids.length })) + '</button>' +
			'</div></div>';
		document.body.appendChild(modal);
		modal.querySelector('.close').addEventListener('click', function () { modal.remove(); refreshList(); });
		modal.querySelector('#qpBulkCancel').addEventListener('click', function () { modal.remove(); refreshList(); });
		modal.addEventListener('click', function (event) { if (event.target === modal) { modal.remove(); refreshList(); } });
		modal.addEventListener('keydown', function (event) {
			if (event.key === 'Escape') { event.stopPropagation(); modal.remove(); refreshList(); }
		});

		// Live preview: the teacher sees exactly what will be written before running.
		function syncBulkPreview() {
			var objectiveId = modal.querySelector('#qpBulkObjective').value;
			var bloomId = modal.querySelector('#qpBulkBloom').value;
			var preview = modal.querySelector('#qpBulkPreview');
			var objectiveName = '';
			for (var i = 0; i < state.objectives.length; i++) {
				if (String(state.objectives[i].id) === String(objectiveId)) { objectiveName = state.objectives[i].code; break; }
			}
			var bloomName = bloomLabel(bloomId) || '';
			var ready = !!(objectiveName && bloomName);
			preview.innerHTML = ready
				? '<span class="qp-chip qp-chip--green">' + esc(objectiveName) + '</span> <span class="qp-chip qp-chip--bloom">' + esc(bloomName) + '</span> <span class="qp-chip qp-chip--grey">1.00</span>'
				: '—';
			var run = modal.querySelector('#qpBulkRun');
			if (run) run.disabled = !ready;
			var hint = modal.querySelector('#qpBulkHint');
			if (hint) {
				hint.textContent = ready ? t('bulkReady') : t('bulkNeedSelection');
				hint.classList.toggle('is-ready', ready);
			}
		}
		modal.querySelector('#qpBulkObjective').addEventListener('change', syncBulkPreview);
		modal.querySelector('#qpBulkBloom').addEventListener('change', syncBulkPreview);
		syncBulkPreview();

		modal.querySelector('#qpBulkRun').addEventListener('click', function () {
			var objectiveId = modal.querySelector('#qpBulkObjective').value;
			var bloomId = modal.querySelector('#qpBulkBloom').value;
			if (!objectiveId || !bloomId) { toast(t('objective') + ' / ' + t('bloom'), 'error'); return; }
			var runButton = modal.querySelector('#qpBulkRun');
			var progress = modal.querySelector('#qpBulkProgress');
			var failures = modal.querySelector('#qpBulkFailures');
			runButton.disabled = true;
			progress.hidden = false;
			failures.hidden = true;
			progress.setAttribute('role', 'status');

			var failed = [];
			var done = 0;
			var chain = Promise.resolve();
			ids.forEach(function (questionId, position) {
				chain = chain.then(function () {
					progress.textContent = t('bulkProgress', { i: position + 1, n: ids.length });
					progress.style.setProperty('--qp-progress', Math.round(((position) / ids.length) * 100) + '%');
					var questions = [];
					try { questions = window.__DI_CONTAINER__.repo.getAll_sync('questions') || []; } catch (_) { /* ignore */ }
					var question = null;
					for (var i = 0; i < questions.length; i++) if (String(questions[i].id) === String(questionId)) { question = questions[i]; break; }
					var payload = buildSingleCriterion(objectiveId, bloomId, '');
					return apiRaw('PUT', '/learning/questions/' + encodeURIComponent(questionId) + '/pedagogy', payload)
						.then(function (result) {
							done += 1;
							var updated = (result && result.question) || {};
							syncMirrorQuestion(questionId, {
								pedagogy_status: updated.pedagogy_status || 'classified',
								primary_bloom_dimension_id: updated.primary_bloom_dimension_id || bloomId,
							});
						})
						.catch(function (err) {
							failed.push({ label: questionLabelOf(question || { question: questionId }), message: err.message });
						});
				});
			});
			chain.then(function () {
				progress.textContent = failed.length ? t('bulkResultPartial', { done: done, failed: failed.length }) : t('bulkResultOk', { done: done });
				runButton.hidden = true;
				modal.querySelector('#qpBulkCancel').textContent = t('close');
				if (failed.length) {
					failures.hidden = false;
					failures.innerHTML = '<strong>' + esc(t('bulkFailures')) + '</strong><ul>' +
						failed.map(function (entry) { return '<li>' + esc(entry.label) + ' — ' + esc(entry.message) + '</li>'; }).join('') + '</ul>';
				}
				refreshList();
			});
		});
	}

	/* ═══════════════════════ per-question context (§F) ═════════════════════ */

	var rowContextCache = {}; // questionId -> Promise<payload>

	function hookQuestionExpand() {
		if (state._expandHooked || typeof window.toggleQuestionExpand !== 'function') return;
		var original = window.toggleQuestionExpand;
		window.toggleQuestionExpand = function (btn) {
			var out = original(btn);
			try {
				var row = btn && btn.closest ? btn.closest('tr.question-table-row') : null;
				if (row && row.classList.contains('is-expanded')) injectRowContext(row);
			} catch (err) { console.warn('[pedagogy] context failed', err); }
			return out;
		};
		state._expandHooked = true;
	}

	function injectRowContext(row) {
		if (!state.enabled) return;
		var questionId = row.getAttribute('data-id');
		var host = row.querySelector('.q-badges');
		if (!questionId || !host || row.querySelector('.qp-row-context')) return;
		var holder = document.createElement('div');
		holder.className = 'qp-row-context';
		holder.dir = langDir();
		holder.textContent = '…';
		host.parentNode.insertBefore(holder, host.nextSibling);

		if (!rowContextCache[questionId]) {
			rowContextCache[questionId] = apiRaw('GET', '/learning/questions/' + encodeURIComponent(questionId) + '/pedagogy')
				.catch(function (err) { delete rowContextCache[questionId]; throw err; });
		}
		rowContextCache[questionId].then(function (payload) {
			var lines = ((payload && payload.criteria) || []).map(function (criterion) {
				var objective = criterion.objective_code ? '<span class="qp-context-part"><span class="qp-context-key">' + esc(t('objective')) + ':</span> ' + esc(criterion.objective_code) + '</span>' : '';
				var bloom = (criterion.bloom_name || bloomLabel(criterion.bloom_dimension_id)) ? '<span class="qp-context-part"><span class="qp-context-key">' + esc(t('bloom')) + ':</span> ' + esc(criterion.bloom_name || bloomLabel(criterion.bloom_dimension_id)) + '</span>' : '';
				var competency = criterion.competency_code ? '<span class="qp-context-part"><span class="qp-context-key">' + esc(t('competency')) + ':</span> ' + esc(criterion.competency_code) + '</span>' : '';
				var weight = '<span class="qp-context-part"><span class="qp-context-key">' + esc(t('weight')) + ':</span> ' + esc(Number(criterion.weight).toFixed(2)) + '</span>';
				return '<div class="qp-context-line">' + objective + bloom + competency + weight + '</div>';
			});
			holder.innerHTML = '<span class="qp-context-title">' + esc(t('panel')) + ':</span> ' +
				'<span class="qp-chip ' + statusChipClass((payload && payload.pedagogy_status) || 'unclassified') + '">' +
				'<span class="qp-chip-icon" aria-hidden="true">' + (STATUS_META[(payload && payload.pedagogy_status)] || STATUS_META.unclassified).icon + '</span>' +
				esc(statusLabel((payload && payload.pedagogy_status) || 'unclassified')) + '</span>' +
				lines.join('');
		}).catch(function () {
			holder.remove(); // the row stays as it was — never break the bank on a context read
		});
	}

	/* ═══════════════════════════ boot ══════════════════════════════════════ */

	function boot() {
		if (state.booted) return;
		state.booted = true;
		loadFlags()
			.catch(function (err) {
				state.failed = true;
				console.warn('[pedagogy] flags unavailable — integration stays off:', err && err.message);
			})
			.then(function () {
				if (!state.enabled) return null; // fail closed: draw nothing at all
				return loadCatalog()
					.catch(function (err) {
						state.enabled = false; // no catalog → no surfaces rather than broken ones
						console.warn('[pedagogy] catalog unavailable — integration stays off:', err && err.message);
					});
			})
			.then(function () {
				if (!state.enabled) return;
				hookFilterQuestions();
				hookQuestionExpand();
				ensureFilterBar();
				ensureEditorSection();
				injectBulkButton();
				wireCoverageFilterClicks();
				onListRendered();
			});
	}

	function injectBulkButton() {
		if (document.getElementById('qpBulkClassifyBtn')) return;
		var container = document.getElementById('bulk-actions-container');
		if (!container) return;
		var divider = container.querySelector('.divider-vertical');
		var button = document.createElement('button');
		button.id = 'qpBulkClassifyBtn';
		button.className = 'btn btn-secondary';
		button.type = 'button';
		button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg> <span>' + esc(t('badges')) + '</span>';
		button.title = t('bulkTitle');
		button.addEventListener('click', openBulkClassify);
		if (divider) container.insertBefore(button, divider);
		else container.appendChild(button);
	}

	/* ═══════════════════════════ exports ═══════════════════════════════════ */

	var QuestionsPedagogy = {
		/** Hooks called by questions-management.js (all no-ops while disabled). */
		onListRendered: onListRendered,
		onEditorOpened: onEditorOpened,
		onQuestionSaved: onQuestionSaved,
		rowBadgeHtml: rowBadgeHtml,
		rowActionHtml: rowActionHtml,
		openCriteriaEditorById: openCriteriaEditorById,
		openBulkClassify: openBulkClassify,
		/** Language preference (display only). */
		getLanguage: getLang,
		setLanguage: setLang,
		/** Pure helpers, exported for the unit tests. */
		__internals: {
			statusLabel: statusLabel,
			statusChipClass: statusChipClass,
			rowMatchesPedagogyFilter: rowMatchesPedagogyFilter,
			summarizeStatuses: summarizeStatuses,
			buildSingleCriterion: buildSingleCriterion,
			criteriaProblem: criteriaProblem,
			toWireCriterion: toWireCriterion,
			criterionToRow: criterionToRow,
			rubricText: rubricText,
			objectiveLabelStatement: objectiveLabelStatement,
			coverageAttentionRows: coverageAttentionRows,
			bloomSpreadNote: bloomSpreadNote,
			objectivesForSubject: objectivesForSubject,
			objectiveMatchesQuery: objectiveMatchesQuery,
			STATUS_META: STATUS_META,
			WEIGHT_TOLERANCE: WEIGHT_TOLERANCE,
			STRINGS: STRINGS,
			state: state,
		},
	};

	if (typeof window !== 'undefined' && window.document) {
		window.QuestionsPedagogy = QuestionsPedagogy;
		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', boot);
		} else {
			boot();
		}
	}

	if (typeof module !== 'undefined' && module.exports) {
		module.exports = QuestionsPedagogy;
	}
})();
