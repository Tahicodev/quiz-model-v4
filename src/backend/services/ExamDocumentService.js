/**
 * src/backend/services/ExamDocumentService.js
 *
 * Turns a saved exam into the normalized document model that the HTML / PDF /
 * DOCX renderers consume.
 *
 * Design rules enforced here:
 *  - The exam header lives in `Exam.options_json.examDocHeader` (merged, never
 *    replaced wholesale), so no migration is needed and `presetSnapshot` /
 *    `classes` keep surviving.
 *  - Defaults come from real rows only (School, creator User, Class, Category,
 *    Exam). Missing information stays missing — it is never invented.
 *  - Generation is read-only for questions, exams and scores. The `/20`
 *    normalization exists on paper only and requires an explicit teacher
 *    confirmation.
 *  - Student and answer-key builds take different code paths; the student path
 *    is handed rows with `answer` / `explanation` already deleted.
 */

import { NotFoundError, ValidationError } from '../../shared/errors.js';
import {
  EXAM_DOC_TARGET_SCORE,
  EXAM_DOC_POINT_STEP,
  sanitizeExamDocHeader,
} from '../../shared/schemas/examDocument.schema.js';
import {
  splitQuestion,
  buildStudentContent,
  buildAnswerKeyContent,
  keyFeedbackLines,
} from './exam-doc/questionRenderers.js';
import { formatPoints } from './exam-doc/text.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function parseJsonObject(raw) {
  if (!raw || typeof raw !== 'string') return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

/**
 * Proportional reallocation of `weights` onto `target` using the
 * largest-remainder method at a fixed `step` granularity.
 * Deterministic: identical input always yields identical output, ties break by
 * remainder then by original order, and the result sums EXACTLY to the target.
 */
export function normalizeWeights(weights, target = EXAM_DOC_TARGET_SCORE, step = EXAM_DOC_POINT_STEP) {
  const list = (Array.isArray(weights) ? weights : []).map((w) => {
    const n = Number(w);
    return Number.isFinite(n) && n > 0 ? n : 0;
  });
  const sum = list.reduce((acc, n) => acc + n, 0);
  if (!list.length || sum <= 0) return list.map(() => 0);

  const unitsPerPoint = 1 / step;
  const totalUnits = Math.round(target * unitsPerPoint);
  const exact = list.map((n) => (n / sum) * totalUnits);
  const floors = exact.map((v) => Math.floor(v));
  let used = floors.reduce((acc, v) => acc + v, 0);
  const order = exact
    .map((v, i) => ({ i, remainder: v - Math.floor(v), weight: list[i] }))
    .sort((a, b) => b.remainder - a.remainder || b.weight - a.weight || a.i - b.i);

  let cursor = 0;
  while (used < totalUnits && order.length) {
    floors[order[cursor % order.length].i] += 1;
    used += 1;
    cursor += 1;
  }
  return floors.map((u) => round2(u * step));
}

export class ExamDocumentService {
  #repo;

  constructor(repo) {
    this.#repo = repo;
  }

  // ─── Header ────────────────────────────────────────────────────────────────
  /**
   * Persisted header merged over defaults resolved from existing rows.
   * @returns {{ header: object, defaults: object, saved: object }}
   */
  async resolveHeader(examId, schoolId) {
    const exam = await this.#getExam(examId, schoolId);
    return this.#headerFor(exam, schoolId);
  }

  async #headerFor(exam, schoolId) {
    const saved = sanitizeExamDocHeader(parseJsonObject(exam.options_json).examDocHeader || {});
    const defaults = await this.#defaultHeader(exam, schoolId);
    const header = { ...defaults, ...saved };
    return { header, defaults, saved };
  }

  /** Read-modify-write of the `examDocHeader` slice only. */
  async saveHeader(examId, schoolId, header) {
    const exam = await this.#getExam(examId, schoolId);
    const blob = parseJsonObject(exam.options_json);
    const clean = sanitizeExamDocHeader(header || {});
    if (Object.keys(clean).length) blob.examDocHeader = clean;
    else delete blob.examDocHeader;
    await this.#repo.update('exams', exam.id, { options_json: JSON.stringify(blob) });
    return { header: clean, defaults: await this.#defaultHeader(exam, schoolId) };
  }

  async #getExam(examId, schoolId) {
    const exam = schoolId
      ? await this.#repo.query('exam.withQuestions', { examId: String(examId), schoolId: String(schoolId) })
      : await this.#repo.getById('exams', String(examId));
    if (!exam) throw new NotFoundError('Exam');
    return exam;
  }

  async #defaultHeader(exam, schoolId) {
    const [school, creator, categories, classes] = await Promise.all([
      schoolId ? this.#repo.getById('schools', String(schoolId)).catch(() => null) : Promise.resolve(null),
      exam.creator_id
        ? this.#repo.getById('users', String(exam.creator_id)).catch(() => null)
        : Promise.resolve(null),
      this.#repo.getAll('categories', {
        ...(schoolId ? { filters: { school_id: String(schoolId) } } : {}),
        limit: 1000,
      }).catch(() => ({ data: [] })),
      this.#assignedClassNames(exam, schoolId),
    ]);

    const catById = new Map((categories?.data || []).map((c) => [String(c.id), c]));
    const questionCats = new Set(
      (exam.questions || [])
        .map((q) => q.category_id)
        .filter((id) => id && catById.has(String(id)))
        .map((id) => String(id)),
    );
    // Subject only when the exam genuinely draws from one category.
    const subject = questionCats.size === 1 ? catById.get([...questionCats][0]).name : null;

    return {
      ministry: null,
      academy: null,
      schoolName: school?.name || null,
      logoUrl: school?.logo_url || null,
      logoDataUrl: null,
      logoScale: 1,
      academicYear: school?.school_year || null,
      title: exam.name || null,
      sessionType: null,
      subject: subject || null,
      teacherName: creator?.name || null,
      level: classes.length ? classes.join(' / ') : null,
      group: null,
      term: null,
      date: null,
      durationMinutes: exam.duration ?? null,
      instructions: null,
      showHeader: true,
      studentNameField: true,
      studentNumberField: true,
      showClassField: true,
      grouping: 'none',
      numbering: 'continuous',
    };
  }

  async #assignedClassNames(exam, schoolId) {
    const names = new Set();
    try {
      const { data: links } = await this.#repo.getAll('exam_classes', {
        filters: { exam_id: exam.id },
        limit: 200,
      });
      if (links?.length) {
        const { data: rows } = await this.#repo.getAll('classes', { limit: 500 });
        const byId = new Map((rows || []).map((c) => [String(c.id), c.name]));
        for (const link of links) {
          const name = byId.get(String(link.class_id));
          if (name) names.add(name);
        }
      }
    } catch (_) {
      /* junction unavailable — fall through to the legacy blob */
    }
    if (names.size) return [...names];

    // Legacy exams may carry class names/ids only in options_json.
    const legacy = parseJsonObject(exam.options_json).classes;
    if (!Array.isArray(legacy)) return [];
    try {
      const { data: rows } = await this.#repo.getAll('classes', {
        ...(schoolId ? { filters: { school_id: String(schoolId) } } : {}),
        limit: 500,
      });
      const byId = new Map((rows || []).map((c) => [String(c.id), c.name]));
      const byName = new Set((rows || []).map((c) => String(c.name).toLowerCase()));
      for (const entry of legacy) {
        const value = String(entry?.id || entry?.classId || entry?.name || entry || '').trim();
        if (!value) continue;
        const resolved = byId.get(value.toLowerCase()) ?? (byName.has(value.toLowerCase()) ? value : null);
        if (resolved) names.add(resolved);
      }
    } catch (_) {
      /* ignore — level simply stays empty */
    }
    return [...names];
  }

  // ─── Document model ────────────────────────────────────────────────────────
  /**
   * @param {object} args
   * @param {'student'|'answer_key'} args.document
   * @param {object} [args.header]        unsaved header edits from the modal
   * @param {object} [args.normalization] { mode, confirmed }
   */
  async buildExamDocument({ examId, schoolId, document, header = null, normalization = null } = {}) {
    if (!['student', 'answer_key'].includes(document)) {
      throw new ValidationError({ document: ['Unknown document type'] });
    }
    const exam = await this.#getExam(examId, schoolId);
    const rows = Array.isArray(exam.questions) ? exam.questions : [];
    if (!rows.length) {
      throw new ValidationError({
        questions: [
          'Cet examen n’a pas encore de questions enregistrées côté serveur. Ouvrez « Assign Questions », enregistrez, puis relancez la génération.',
        ],
      });
    }

    const { header: baseHeader } = await this.#headerFor(exam, schoolId);
    const headerOverride = sanitizeExamDocHeader(header || {});
    const finalHeader = { ...baseHeader, ...headerOverride };

    const warnings = [];
    const isKey = document === 'answer_key';
    const categoryNames = await this.#categoryNameMap(schoolId);
    const items = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const { type, options, publicRow, confidential, pairs } = splitQuestion(row);
      const naturalPoints = Number(row.points_override ?? row.points ?? 1) || 0;
      const content = buildStudentContent({
        type,
        options,
        // Answer-free row: the student branch cannot read a field it was not given.
        row: publicRow,
        pairs,
        points: naturalPoints,
      });
      warnings.push(...content.warnings);

      const item = {
        number: i + 1,
        questionId: String(row.id ?? ''),
        type,
        categoryId: row.category_id ? String(row.category_id) : null,
        categoryName: row.category_id ? categoryNames.get(String(row.category_id)) || null : null,
        points: naturalPoints,
        naturalPoints,
        block: content.block,
      };
      if (isKey) {
        const key = buildAnswerKeyContent({
          type,
          options,
          confidential,
          questionId: String(row.id ?? ''),
          text: publicRow.text ?? publicRow.question ?? '',
          pairs,
        });
        item.answer = key.answer;
        item.feedback = keyFeedbackLines(confidential);
        warnings.push(...key.warnings);
      }
      items.push(item);
    }

    const sections = this.#buildSections(items, finalHeader);
    const scoring = this.#computeScoring(items, sections, normalization || {});

    return {
      meta: {
        examId: String(exam.id),
        examName: exam.name || 'Examen',
        document,
        generatedAt: new Date().toISOString(),
        status: exam.status || null,
        isTraining: !!exam.is_training,
      },
      header: this.#presentHeader(finalHeader, scoring),
      sections,
      items,
      scoring,
      warnings: dedupeWarnings(warnings),
      confidentiality: {
        includesAnswers: isKey,
        strippedForStudent: isKey ? [] : ['answer', 'explanation'],
      },
    };
  }

  async #categoryNameMap(schoolId) {
    try {
      const { data } = await this.#repo.getAll('categories', {
        ...(schoolId ? { filters: { school_id: String(schoolId) } } : {}),
        limit: 1000,
      });
      return new Map((data || []).map((c) => [String(c.id), c.name]));
    } catch (_) {
      return new Map();
    }
  }

  #buildSections(items, header) {
    if (header.grouping !== 'by-category') {
      return [
        {
          id: 'all',
          title: null,
          items,
          subtotal: round2(items.reduce((acc, it) => acc + it.points, 0)),
        },
      ];
    }
    const buckets = new Map();
    for (const item of items) {
      const key = item.categoryId || '__uncategorized';
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(item);
    }
    let index = 0;
    return [...buckets.entries()].map(([key, groupItems]) => {
      index += 1;
      const name = key === '__uncategorized' ? 'Sans catégorie' : groupItems[0].categoryName || 'Sans catégorie';
      return {
        id: key,
        title: `Exercice ${index} · ${name}`,
        items: groupItems,
        subtotal: round2(groupItems.reduce((acc, it) => acc + it.points, 0)),
      };
    });
  }

  #computeScoring(items, sections, normalization) {
    const naturalTotal = round2(items.reduce((acc, it) => acc + it.naturalPoints, 0));
    const valid20 = naturalTotal === EXAM_DOC_TARGET_SCORE;
    const mode = normalization?.mode === 'scale-to-20' ? 'scale-to-20' : 'as-is';

    const scoring = {
      scale: EXAM_DOC_TARGET_SCORE,
      naturalTotal,
      total: naturalTotal,
      valid20,
      normalized: false,
      mode: 'as-is',
      label: `${formatPoints(naturalTotal)} / ${EXAM_DOC_TARGET_SCORE}`,
      sections: sections.map((s) => ({ id: s.id, title: s.title, subtotal: s.subtotal })),
    };

    if (valid20) return scoring;

    scoring.error = {
      code: 'TOTAL_NOT_20',
      naturalTotal,
      delta: round2(EXAM_DOC_TARGET_SCORE - naturalTotal),
      message:
        `Le total des points est de ${formatPoints(naturalTotal)} sur ${EXAM_DOC_TARGET_SCORE}. ` +
        'Ajustez les barèmes de l’examen ou confirmez la normalisation sur 20.',
    };
    scoring.normalizedPreview = normalizeWeights(
      items.map((it) => it.naturalPoints),
      EXAM_DOC_TARGET_SCORE,
      EXAM_DOC_POINT_STEP,
    ).map((to, i) => ({
      questionId: items[i].questionId,
      number: items[i].number,
      from: items[i].naturalPoints,
      to,
    }));

    if (mode !== 'scale-to-20') return scoring;
    if (!normalization?.confirmed) {
      scoring.error = {
        ...scoring.error,
        code: 'NORMALIZATION_NOT_CONFIRMED',
        message:
          'La normalisation sur 20 doit être confirmée explicitement : le barème affiché serait sinon différent du barème enregistré.',
      };
      return scoring;
    }

    // Document-only reallocation. Stored rows are never written back.
    scoring.normalizedPreview.forEach((entry, i) => {
      items[i].points = entry.to;
    });
    sections.forEach((section) => {
      section.subtotal = round2(section.items.reduce((acc, it) => acc + it.points, 0));
    });
    scoring.total = EXAM_DOC_TARGET_SCORE;
    scoring.normalized = true;
    scoring.mode = 'scale-to-20';
    scoring.label = `${EXAM_DOC_TARGET_SCORE} / ${EXAM_DOC_TARGET_SCORE}`;
    scoring.sections = sections.map((s) => ({ id: s.id, title: s.title, subtotal: s.subtotal }));
    delete scoring.error;
    return scoring;
  }

  #presentHeader(header, scoring) {
    const out = { ...header };
    out.totalLabel = `${formatPoints(scoring.total)} / ${scoring.scale}`;
    out.scaleNote = scoring.normalized
      ? 'Barème normalisé sur 20 pour l’impression — les points enregistrés de l’examen restent inchangés.'
      : null;
    return out;
  }
}

function dedupeWarnings(list) {
  const seen = new Set();
  const out = [];
  for (const w of list) {
    const key = `${w.type}:${w.questionId || ''}:${w.message || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
}
