/**
 * src/frontend/console/pages/learning/labels.js
 *
 * The learning label dictionary (EN / FR / AR) and the panel's direction rule.
 *
 * WHY A DICTIONARY AND NOT INLINE STRINGS
 * ──────────────────────────────────────
 * The learning surfaces are the first part of the console that a teacher
 * reads, in a product whose schools are French- and Arabic-speaking. The
 * dictionary keeps every user-facing string in one place so the Phase 8
 * localization gate ("a native Arabic and a native French reviewer sign off on
 * every new label") can be discharged by reading one file.
 *
 * The Bloom dimension names themselves are NOT here: they are seeded data,
 * served with their own `labels_json` (en/fr/ar) by `GET /learning/bloom`, so
 * there is exactly one translation of "Apply" in the product.
 *
 * The active language is a UI preference, not data: it is stored in
 * localStorage (the same place the theme lives) and never written back to the
 * database. `dir` is applied to the LEARNING PANEL ROOT ONLY — the rest of the
 * console stays LTR, exactly as the frozen spec requires.
 *
 * NOTE (WP7 gate): the FR and AR strings below are best-effort and MUST be
 * reviewed by native speakers before any real-school pilot.
 */

export const LANGUAGES = Object.freeze([
	{ key: 'en', label: 'English', dir: 'ltr' },
	{ key: 'fr', label: 'Français', dir: 'ltr' },
	{ key: 'ar', label: 'العربية', dir: 'rtl' },
]);

const STORAGE_KEY = 'quizLearningLang';
const DEFAULT_LANG = 'en';

/** @returns {boolean} whether `lang` is one of the supported languages. */
export function isLanguage(lang) {
	return LANGUAGES.some((entry) => entry.key === lang);
}

/** The writing direction for a language ('rtl' for Arabic, else 'ltr'). */
export function dirFor(lang) {
	return LANGUAGES.find((entry) => entry.key === lang)?.dir || 'ltr';
}

/** The stored language preference, falling back to English. */
export function getLanguage() {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		return isLanguage(stored) ? stored : DEFAULT_LANG;
	} catch (_error) {
		return DEFAULT_LANG;
	}
}

/** Persist the language preference (UI only — never sent to the server). */
export function setLanguage(lang) {
	if (!isLanguage(lang)) return;
	try {
		localStorage.setItem(STORAGE_KEY, lang);
	} catch (_error) {
		/* a blocked localStorage must not break the page */
	}
}

const STRINGS = {
	en: {
		'lang.label': 'Language',
		'learning.title': 'Learning',
		'learning.description':
			'The learning taxonomy and question classification of this organization.',
		'nav.hub': 'Learning',
		'nav.questions': 'Question pedagogy',
		'nav.taxonomy': 'Taxonomy',
		'card.questions.desc': 'Review the bank, see what each question assesses, and classify it.',
		'card.taxonomy.desc': 'The objectives and competencies the classification is built on.',

		'flag.disabled.title': 'Learning is not enabled',
		'flag.disabled.body':
			'The learning taxonomy and question classification are off for this organization. Turning it on shows them to teachers; nothing is deleted when it is off.',
		'flag.enabled.title': 'Learning is enabled',
		'flag.enabled.body':
			'Teachers may classify the questions they authored and propose learning objectives.',
		'flag.toggle.on': 'Turn learning on',
		'flag.toggle.off': 'Turn learning off',
		'flag.teacherCreation.on': 'Teachers create objectives directly',
		'flag.teacherCreation.off': 'Teacher objectives need approval',
		'flag.adminOnly': 'Only an administrator can change this.',

		'action.refresh': 'Refresh',
		'action.search': 'Search',
		'action.add': 'Add',
		'action.save': 'Save',
		'action.cancel': 'Cancel',
		'action.close': 'Close',
		'action.edit': 'Edit',
		'action.open': 'Open',
		'action.archive': 'Archive',
		'action.approve': 'Approve',
		'action.reject': 'Reject',
		'action.classify': 'Classify',
		'action.classifySelected': 'Classify selected',
		'action.clearClassification': 'Clear classification',
		'action.addCriterion': 'Add criterion',
		'action.removeCriterion': 'Remove',
		'action.markReviewed': 'Reviewed by me',
		'action.newObjective': 'New objective',
		'action.proposeObjective': 'Propose objective',
		'action.newCompetency': 'New competency',
		'action.linkCompetency': 'Link competency',
		'action.addPrerequisite': 'Add prerequisite',
		'action.unlink': 'Unlink',
		'action.remove': 'Remove',
		'action.selectAll': 'Select all',
		'action.clearSelection': 'Clear selection',

		'field.statement': 'Statement',
		'field.description': 'Description',
		'field.code': 'Code',
		'field.name': 'Name',
		'field.subject': 'Subject',
		'field.category': 'Category',
		'field.parent': 'Parent objective',
		'field.status': 'Status',
		'field.kind': 'Kind',
		'field.orderIndex': 'Order',
		'field.note': 'Note',
		'field.weight': 'Weight',
		'field.criterionKey': 'Criterion key',
		'field.rubric': 'Rubric (optional)',
		'field.maxScore': 'Max score',
		'field.competency': 'Competency',
		'field.objective': 'Objective',
		'field.bloom': 'Bloom dimension',
		'field.pedagogyStatus': 'Classification',
		'field.primaryCompetency': 'Primary competency',
		'field.strength': 'Strength',
		'field.rationale': 'Rationale',
		'field.minMastery': 'Minimum mastery',
		'field.reviewNote': 'Review note',

		'hint.weightSum': 'Weights must add up to 1.00',
		'hint.criteriaRequired': 'At least one criterion is required to save.',
		'hint.saveQuestionFirst':
			'This question must be saved before it can be classified.',
		'hint.noCriteria': 'No criteria yet — this question is unclassified.',
		'hint.teacherProposal':
			'A proposed objective becomes available to teachers once an administrator approves it.',
		'hint.readOnlyTeacher': 'Only administrators manage competencies and prerequisites.',
		'hint.rubricJson': 'A JSON object or free text, shown to graders.',
		'hint.language': 'Labels only — it does not change the school language.',

		'table.question': 'Question',
		'table.type': 'Type',
		'table.bloom': 'Bloom',
		'table.status': 'Classification',
		'table.criteria': 'Criteria',
		'table.objective': 'Objective',
		'table.competency': 'Competency',
		'table.kind': 'Kind',
		'table.subject': 'Subject',
		'table.code': 'Code',
		'table.statement': 'Statement',
		'table.weight': 'Weight',
		'table.proposedBy': 'Proposed by',
		'table.created': 'Created',

		'status.unclassified': 'Unclassified',
		'status.partial': 'Partly classified',
		'status.classified': 'Classified',
		'status.needs_review': 'Needs review',
		'objective.proposed': 'Proposed',
		'objective.active': 'Active',
		'objective.rejected': 'Rejected',
		'objective.archived': 'Archived',
		'kind.competency': 'Competency',
		'kind.skill': 'Skill',
		'kind.domain': 'Domain',
		'strength.required': 'Required',
		'strength.recommended': 'Recommended',

		'summary.classified': 'Classified questions',
		'summary.unclassified': 'Unclassified',
		'summary.needsReview': 'Needs review',
		'summary.objectives': 'Objectives',
		'summary.proposed': 'Awaiting approval',
		'summary.competencies': 'Competencies',
		'summary.prerequisites': 'Prerequisites',

		'empty.questions.title': 'No questions match the current filters',
		'empty.questions.message':
			'Adjust the search, the classification or the Bloom filter.',
		'empty.objectives.title': 'No objectives yet',
		'empty.objectives.message':
			'Create the first objective, then classify the questions that assess it.',
		'empty.competencies.title': 'No competencies yet',
		'empty.competencies.message': 'Competencies group the skills an objective builds.',
		'empty.proposals.title': 'Nothing awaiting approval',
		'empty.proposals.message': 'Teacher proposals appear here for review.',
		'empty.prerequisites.title': 'No prerequisites',
		'empty.prerequisites.message': 'A prerequisite states what must be learned first.',

		'bulk.title': 'Classify {count} question(s)',
		'bulk.confirm':
			'This replaces the classification of the selected questions with one criterion of weight 1.00.',
		'bulk.done': '{count} question(s) classified.',
		'bulk.partial': '{done} classified, {failed} failed.',

		'toast.classified': 'The classification was saved.',
		'toast.cleared': 'The classification was cleared.',
		'toast.objectiveSaved': 'The objective was saved.',
		'toast.competencySaved': 'The competency was saved.',
		'toast.approved': 'The objective was approved.',
		'toast.rejected': 'The objective was rejected.',
		'toast.archived': 'The objective was archived.',
		'toast.linked': 'The competency was linked.',
		'toast.unlinked': 'The link was removed.',
		'toast.prerequisiteAdded': 'The prerequisite was added.',
		'toast.prerequisiteRemoved': 'The prerequisite was removed.',
		'toast.flagOn': 'Learning is now enabled for this organization.',
		'toast.flagOff': 'Learning is now disabled for this organization.',

		'error.load': 'This section could not be loaded',
		'error.save': 'The change could not be saved',
	},

	fr: {
		'lang.label': 'Langue',
		'learning.title': 'Apprentissage',
		'learning.description':
			'La taxonomie d\'apprentissage et la classification des questions de cet établissement.',
		'nav.hub': 'Apprentissage',
		'nav.questions': 'Pédagogie des questions',
		'nav.taxonomy': 'Taxonomie',
		'card.questions.desc': 'Parcourez la banque, voyez ce que chaque question évalue et classez-la.',
		'card.taxonomy.desc': 'Les objectifs et compétences sur lesquels repose la classification.',

		'flag.disabled.title': 'L\'apprentissage n\'est pas activé',
		'flag.disabled.body':
			'La taxonomie d\'apprentissage et la classification des questions sont désactivées pour cet établissement. Les activer les rend visibles aux enseignants ; rien n\'est supprimé lorsqu\'elles sont désactivées.',
		'flag.enabled.title': 'L\'apprentissage est activé',
		'flag.enabled.body':
			'Les enseignants peuvent classer les questions qu\'ils ont créées et proposer des objectifs d\'apprentissage.',
		'flag.toggle.on': 'Activer l\'apprentissage',
		'flag.toggle.off': 'Désactiver l\'apprentissage',
		'flag.teacherCreation.on': 'Les enseignants créent les objectifs directement',
		'flag.teacherCreation.off': 'Les objectifs des enseignants doivent être approuvés',
		'flag.adminOnly': 'Seul un administrateur peut modifier ceci.',

		'action.refresh': 'Actualiser',
		'action.search': 'Rechercher',
		'action.add': 'Ajouter',
		'action.save': 'Enregistrer',
		'action.cancel': 'Annuler',
		'action.close': 'Fermer',
		'action.edit': 'Modifier',
		'action.open': 'Ouvrir',
		'action.archive': 'Archiver',
		'action.approve': 'Approuver',
		'action.reject': 'Rejeter',
		'action.classify': 'Classer',
		'action.classifySelected': 'Classer la sélection',
		'action.clearClassification': 'Effacer la classification',
		'action.addCriterion': 'Ajouter un critère',
		'action.removeCriterion': 'Retirer',
		'action.markReviewed': 'Vérifié par moi',
		'action.newObjective': 'Nouvel objectif',
		'action.proposeObjective': 'Proposer un objectif',
		'action.newCompetency': 'Nouvelle compétence',
		'action.linkCompetency': 'Lier une compétence',
		'action.addPrerequisite': 'Ajouter un prérequis',
		'action.unlink': 'Délier',
		'action.remove': 'Retirer',
		'action.selectAll': 'Tout sélectionner',
		'action.clearSelection': 'Effacer la sélection',

		'field.statement': 'Énoncé',
		'field.description': 'Description',
		'field.code': 'Code',
		'field.name': 'Nom',
		'field.subject': 'Matière',
		'field.category': 'Catégorie',
		'field.parent': 'Objectif parent',
		'field.status': 'Statut',
		'field.kind': 'Type',
		'field.orderIndex': 'Ordre',
		'field.note': 'Note',
		'field.weight': 'Poids',
		'field.criterionKey': 'Clé du critère',
		'field.rubric': 'Grille (facultatif)',
		'field.maxScore': 'Note maximale',
		'field.competency': 'Compétence',
		'field.objective': 'Objectif',
		'field.bloom': 'Dimension de Bloom',
		'field.pedagogyStatus': 'Classification',
		'field.primaryCompetency': 'Compétence principale',
		'field.strength': 'Force',
		'field.rationale': 'Justification',
		'field.minMastery': 'Maîtrise minimale',
		'field.reviewNote': 'Note de révision',

		'hint.weightSum': 'La somme des poids doit être de 1,00',
		'hint.criteriaRequired': 'Au moins un critère est requis pour enregistrer.',
		'hint.saveQuestionFirst':
			'Cette question doit être enregistrée avant de pouvoir être classée.',
		'hint.noCriteria': 'Aucun critère — cette question n\'est pas classée.',
		'hint.teacherProposal':
			'Un objectif proposé devient disponible pour les enseignants après approbation par un administrateur.',
		'hint.readOnlyTeacher':
			'Seuls les administrateurs gèrent les compétences et les prérequis.',
		'hint.rubricJson': 'Un objet JSON ou du texte libre, montré aux correcteurs.',
		'hint.language': 'Libellés uniquement — ne change pas la langue de l\'établissement.',

		'table.question': 'Question',
		'table.type': 'Type',
		'table.bloom': 'Bloom',
		'table.status': 'Classification',
		'table.criteria': 'Critères',
		'table.objective': 'Objectif',
		'table.competency': 'Compétence',
		'table.kind': 'Type',
		'table.subject': 'Matière',
		'table.code': 'Code',
		'table.statement': 'Énoncé',
		'table.weight': 'Poids',
		'table.proposedBy': 'Proposé par',
		'table.created': 'Créé',

		'status.unclassified': 'Non classée',
		'status.partial': 'Partiellement classée',
		'status.classified': 'Classée',
		'status.needs_review': 'À vérifier',
		'objective.proposed': 'Proposé',
		'objective.active': 'Actif',
		'objective.rejected': 'Rejeté',
		'objective.archived': 'Archivé',
		'kind.competency': 'Compétence',
		'kind.skill': 'Habileté',
		'kind.domain': 'Domaine',
		'strength.required': 'Requis',
		'strength.recommended': 'Recommandé',

		'summary.classified': 'Questions classées',
		'summary.unclassified': 'Non classées',
		'summary.needsReview': 'À vérifier',
		'summary.objectives': 'Objectifs',
		'summary.proposed': 'En attente d\'approbation',
		'summary.competencies': 'Compétences',
		'summary.prerequisites': 'Prérequis',

		'empty.questions.title': 'Aucune question ne correspond aux filtres',
		'empty.questions.message':
			'Ajustez la recherche, la classification ou le filtre Bloom.',
		'empty.objectives.title': 'Aucun objectif',
		'empty.objectives.message':
			'Créez le premier objectif, puis classez les questions qui l\'évaluent.',
		'empty.competencies.title': 'Aucune compétence',
		'empty.competencies.message':
			'Les compétences regroupent les habiletés qu\'un objectif développe.',
		'empty.proposals.title': 'Rien en attente d\'approbation',
		'empty.proposals.message':
			'Les propositions des enseignants apparaissent ici pour révision.',
		'empty.prerequisites.title': 'Aucun prérequis',
		'empty.prerequisites.message': 'Un prérequis indique ce qui doit être appris avant.',

		'bulk.title': 'Classer {count} question(s)',
		'bulk.confirm':
			'Ceci remplace la classification des questions sélectionnées par un seul critère de poids 1,00.',
		'bulk.done': '{count} question(s) classée(s).',
		'bulk.partial': '{done} classée(s), {failed} en échec.',

		'toast.classified': 'La classification a été enregistrée.',
		'toast.cleared': 'La classification a été effacée.',
		'toast.objectiveSaved': 'L\'objectif a été enregistré.',
		'toast.competencySaved': 'La compétence a été enregistrée.',
		'toast.approved': 'L\'objectif a été approuvé.',
		'toast.rejected': 'L\'objectif a été rejeté.',
		'toast.archived': 'L\'objectif a été archivé.',
		'toast.linked': 'La compétence a été liée.',
		'toast.unlinked': 'Le lien a été supprimé.',
		'toast.prerequisiteAdded': 'Le prérequis a été ajouté.',
		'toast.prerequisiteRemoved': 'Le prérequis a été retiré.',
		'toast.flagOn': 'L\'apprentissage est maintenant activé pour cet établissement.',
		'toast.flagOff': 'L\'apprentissage est maintenant désactivé pour cet établissement.',

		'error.load': 'Cette section n\'a pas pu être chargée',
		'error.save': 'La modification n\'a pas pu être enregistrée',
	},

	ar: {
		'lang.label': 'اللغة',
		'learning.title': 'التعلّم',
		'learning.description': 'تصنيف التعلّم وتصنيف الأسئلة الخاص بهذه المؤسسة.',
		'nav.hub': 'التعلّم',
		'nav.questions': 'بيداغوجيا الأسئلة',
		'nav.taxonomy': 'التصنيف',
		'card.questions.desc': 'راجع بنك الأسئلة، واطّلع على ما يقيسه كل سؤال، ثم صنّفه.',
		'card.taxonomy.desc': 'الأهداف والكفاءات التي يقوم عليها التصنيف.',

		'flag.disabled.title': 'التعلّم غير مُفعّل',
		'flag.disabled.body':
			'تصنيف التعلّم وتصنيف الأسئلة معطّلان لهذه المؤسسة. عند تفعيلهما يظهران للمعلّمين؛ ولا يُحذف أي شيء عند التعطيل.',
		'flag.enabled.title': 'التعلّم مُفعّل',
		'flag.enabled.body':
			'يمكن للمعلّمين تصنيف الأسئلة التي أنشأوها واقتراح أهداف تعلّم.',
		'flag.toggle.on': 'تفعيل التعلّم',
		'flag.toggle.off': 'تعطيل التعلّم',
		'flag.teacherCreation.on': 'ينشئ المعلّمون الأهداف مباشرة',
		'flag.teacherCreation.off': 'أهداف المعلّمين تحتاج إلى موافقة',
		'flag.adminOnly': 'يمكن للمشرف فقط تغيير هذا.',

		'action.refresh': 'تحديث',
		'action.search': 'بحث',
		'action.add': 'إضافة',
		'action.save': 'حفظ',
		'action.cancel': 'إلغاء',
		'action.close': 'إغلاق',
		'action.edit': 'تحرير',
		'action.open': 'فتح',
		'action.archive': 'أرشفة',
		'action.approve': 'موافقة',
		'action.reject': 'رفض',
		'action.classify': 'تصنيف',
		'action.classifySelected': 'تصنيف المحدَّد',
		'action.clearClassification': 'مسح التصنيف',
		'action.addCriterion': 'إضافة معيار',
		'action.removeCriterion': 'إزالة',
		'action.markReviewed': 'راجعتها بنفسي',
		'action.newObjective': 'هدف جديد',
		'action.proposeObjective': 'اقتراح هدف',
		'action.newCompetency': 'كفاءة جديدة',
		'action.linkCompetency': 'ربط كفاءة',
		'action.addPrerequisite': 'إضافة متطلب سابق',
		'action.unlink': 'إلغاء الربط',
		'action.remove': 'إزالة',
		'action.selectAll': 'تحديد الكل',
		'action.clearSelection': 'مسح التحديد',

		'field.statement': 'النص',
		'field.description': 'الوصف',
		'field.code': 'الرمز',
		'field.name': 'الاسم',
		'field.subject': 'المادة',
		'field.category': 'الفئة',
		'field.parent': 'الهدف الأب',
		'field.status': 'الحالة',
		'field.kind': 'النوع',
		'field.orderIndex': 'الترتيب',
		'field.note': 'ملاحظة',
		'field.weight': 'الوزن',
		'field.criterionKey': 'مفتاح المعيار',
		'field.rubric': 'معيار التقييم (اختياري)',
		'field.maxScore': 'الدرجة القصوى',
		'field.competency': 'الكفاءة',
		'field.objective': 'الهدف',
		'field.bloom': 'بُعد بلوم',
		'field.pedagogyStatus': 'التصنيف',
		'field.primaryCompetency': 'الكفاءة الأساسية',
		'field.strength': 'القوة',
		'field.rationale': 'المبرر',
		'field.minMastery': 'الحد الأدنى للإتقان',
		'field.reviewNote': 'ملاحظة المراجعة',

		'hint.weightSum': 'يجب أن يكون مجموع الأوزان 1.00',
		'hint.criteriaRequired': 'معيار واحد على الأقل مطلوب للحفظ.',
		'hint.saveQuestionFirst': 'يجب حفظ السؤال قبل تصنيفه.',
		'hint.noCriteria': 'لا توجد معايير — هذا السؤال غير مصنَّف.',
		'hint.teacherProposal': 'يصبح الهدف المقترح متاحًا للمعلّمين بعد موافقة المشرف.',
		'hint.readOnlyTeacher': 'المشرفون فقط يديرون الكفاءات والمتطلبات.',
		'hint.rubricJson': 'كائن JSON أو نص حر يُعرض على المصحّحين.',
		'hint.language': 'التسميات فقط — لا تغيّر لغة المؤسسة.',

		'table.question': 'السؤال',
		'table.type': 'النوع',
		'table.bloom': 'بلوم',
		'table.status': 'التصنيف',
		'table.criteria': 'المعايير',
		'table.objective': 'الهدف',
		'table.competency': 'الكفاءة',
		'table.kind': 'النوع',
		'table.subject': 'المادة',
		'table.code': 'الرمز',
		'table.statement': 'النص',
		'table.weight': 'الوزن',
		'table.proposedBy': 'اقترحه',
		'table.created': 'أُنشئ',

		'status.unclassified': 'غير مصنَّف',
		'status.partial': 'مصنَّف جزئيًا',
		'status.classified': 'مصنَّف',
		'status.needs_review': 'يحتاج مراجعة',
		'objective.proposed': 'مقترح',
		'objective.active': 'نشط',
		'objective.rejected': 'مرفوض',
		'objective.archived': 'مؤرشف',
		'kind.competency': 'كفاءة',
		'kind.skill': 'مهارة',
		'kind.domain': 'مجال',
		'strength.required': 'مطلوب',
		'strength.recommended': 'مُستحسن',

		'summary.classified': 'أسئلة مصنَّفة',
		'summary.unclassified': 'غير مصنَّفة',
		'summary.needsReview': 'تحتاج مراجعة',
		'summary.objectives': 'الأهداف',
		'summary.proposed': 'بانتظار الموافقة',
		'summary.competencies': 'الكفاءات',
		'summary.prerequisites': 'المتطلبات السابقة',

		'empty.questions.title': 'لا توجد أسئلة مطابقة للمعايير الحالية',
		'empty.questions.message': 'عدّل البحث أو التصنيف أو مرشّح بلوم.',
		'empty.objectives.title': 'لا توجد أهداف بعد',
		'empty.objectives.message': 'أنشئ الهدف الأول ثم صنّف الأسئلة التي تقيسه.',
		'empty.competencies.title': 'لا توجد كفاءات بعد',
		'empty.competencies.message': 'تجمع الكفاءات المهارات التي يبنيها الهدف.',
		'empty.proposals.title': 'لا شيء بانتظار الموافقة',
		'empty.proposals.message': 'تظهر اقتراحات المعلّمين هنا للمراجعة.',
		'empty.prerequisites.title': 'لا توجد متطلبات سابقة',
		'empty.prerequisites.message': 'يحدّد المتطلب السابق ما يجب تعلّمه أولًا.',

		'bulk.title': 'تصنيف {count} سؤال/أسئلة',
		'bulk.confirm':
			'سيستبدل هذا تصنيف الأسئلة المحدَّدة بمعيار واحد بوزن 1.00.',
		'bulk.done': 'تم تصنيف {count} سؤال/أسئلة.',
		'bulk.partial': 'نجح {done}، فشل {failed}.',

		'toast.classified': 'تم حفظ التصنيف.',
		'toast.cleared': 'تم مسح التصنيف.',
		'toast.objectiveSaved': 'تم حفظ الهدف.',
		'toast.competencySaved': 'تم حفظ الكفاءة.',
		'toast.approved': 'تمت الموافقة على الهدف.',
		'toast.rejected': 'تم رفض الهدف.',
		'toast.archived': 'تمت أرشفة الهدف.',
		'toast.linked': 'تم ربط الكفاءة.',
		'toast.unlinked': 'تم إلغاء الربط.',
		'toast.prerequisiteAdded': 'تمت إضافة المتطلب السابق.',
		'toast.prerequisiteRemoved': 'تمت إزالة المتطلب السابق.',
		'toast.flagOn': 'تم تفعيل التعلّم لهذه المؤسسة.',
		'toast.flagOff': 'تم تعطيل التعلّم لهذه المؤسسة.',

		'error.load': 'تعذّر تحميل هذا القسم',
		'error.save': 'تعذّر حفظ التغيير',
	},
};

/**
 * Translate one key. Unknown keys fall back to English, then to the key itself
 * — so a missing translation degrades to a readable label, never a blank.
 *
 * `{name}` placeholders are replaced from `vars`.
 */
export function t(lang, key, vars = null) {
	const dictionary = STRINGS[lang] || STRINGS[DEFAULT_LANG];
	let text = dictionary[key] ?? STRINGS[DEFAULT_LANG][key] ?? key;
	if (vars) {
		for (const [name, value] of Object.entries(vars)) {
			text = text.replaceAll(`{${name}}`, String(value));
		}
	}
	return text;
}

/** A translator bound to one language: `const tr = translator('fr')`. */
export function translator(lang) {
	const bound = isLanguage(lang) ? lang : DEFAULT_LANG;
	return (key, vars) => t(bound, key, vars);
}

/** The label for a derived pedagogy status, in one language. */
export function pedagogyStatusLabel(lang, status) {
	return t(lang, `status.${status || 'unclassified'}`);
}

/** The label for an objective status, in one language. */
export function objectiveStatusLabel(lang, status) {
	return t(lang, `objective.${status || 'proposed'}`);
}
