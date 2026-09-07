/**
 * scripts/repair-ai-questions.js
 *
 * One-off repair for AI-generated questions written before the answer-format
 * normalization fixes. Two classes of damage exist in existing rows:
 *
 * 1. Collapsed multi-answer tokens — e.g. answer "0,0" on options
 *    ["0","1","2","A"]: the AI answered with 0-based indices ("0,1") and the
 *    old 1-based index mapping turned the "1" token into the first option's
 *    text again. We cannot reconstruct the original intent with certainty, so
 *    these rows are flagged for the admin to review (their answer no longer
 *    matches exactly one/two distinct options).
 *
 * 2. Multi-answer questions stored without the multi metadata. The Prisma
 *    schema has no allowMultipleAnswers column; the new write paths encode a
 *    `multi::` prefix into the answer string. Backfill existing rows whose
 *    comma-joined answer tokens ALL match stored options — that is the same
 *    heuristic the bootstrap reader applies, but persisted once so every
 *    consumer (training/exams/games/tournaments) sees consistent data.
 *
 * Usage: node scripts/repair-ai-questions.js [--apply]
 *   (default is a dry run that prints what would change)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

const multiPrefix = 'multi::';

/** Returns { tokens, allMatchOptions } for a comma-joined MCQ answer. */
function analyzeMcqAnswer(answer, options) {
	const tokens = String(answer || '')
		.split(',')
		.map((t) => t.trim())
		.filter(Boolean);
	if (!tokens.length) return { tokens, allMatchOptions: false, distinct: 0 };
	const optionSet = new Set(
		options.map((o) => String(o || '').trim().toLowerCase()).filter(Boolean),
	);
	const distinct = new Set(tokens.map((t) => t.toLowerCase()));
	const allMatchOptions =
		optionSet.size > 0 &&
		tokens.every((t) => optionSet.has(t.toLowerCase())) &&
		distinct.size > 1 &&
		distinct.size < optionSet.size + 1; // not "every option selected" garbage
	return { tokens, allMatchOptions, distinct: distinct.size };
}

async function main() {
	const questions = await prisma.question.findMany({
		where: { type: 'mcq' },
		select: { id: true, text: true, answer: true, options_json: true },
	});

	const toFlag = [];
	const toBackfill = [];
	let alreadyPrefixed = 0;

	for (const q of questions) {
		const answer = String(q.answer || '');
		if (answer.startsWith(multiPrefix)) {
			alreadyPrefixed += 1;
			continue;
		}
		let options = [];
		try {
			options = q.options_json ? JSON.parse(q.options_json) : [];
		} catch (_) {
			options = [];
		}
		if (!Array.isArray(options) || !options.length) continue;

		const { tokens, allMatchOptions, distinct } = analyzeMcqAnswer(
			answer,
			options,
		);
		if (!tokens.length) continue;

		if (allMatchOptions && distinct > 1) {
			// Genuinely multi-answer: backfill the multi:: prefix.
			toBackfill.push({ id: q.id, text: q.text, answer, distinct });
		} else if (distinct === 1 && tokens.length > 1) {
			// Collapsed tokens ("0,0") — same answer repeated. Flag for review.
			toFlag.push({ id: q.id, text: q.text, answer });
		}
	}

	console.log(`Scanned ${questions.length} mcq rows.`);
	console.log(`- already prefixed: ${alreadyPrefixed}`);
	console.log(`- multi-answer backfill candidates: ${toBackfill.length}`);
	toBackfill.forEach((row) =>
		console.log(
			`  [backfill] ${row.answer} (${row.distinct} answers) :: ${String(row.text).slice(0, 70)}`,
		),
	);
	console.log(`- collapsed/duplicated answer rows to review: ${toFlag.length}`);
	toFlag.forEach((row) =>
		console.log(`  [review] ${row.answer} :: ${String(row.text).slice(0, 70)}`),
	);

	if (!apply) {
		console.log('\nDry run — re-run with --apply to write changes.');
		return;
	}

	let fixed = 0;
	for (const row of toBackfill) {
		const tokens = row.answer
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean);
		const prefixed = multiPrefix + tokens.join('|');
		await prisma.question.update({
			where: { id: row.id },
			data: { answer: prefixed },
		});
		fixed += 1;
	}
	console.log(`\nApplied: backfilled ${fixed} row(s) with the multi:: prefix.`);
}

main()
	.catch((err) => {
		console.error('repair failed:', err);
		process.exitCode = 1;
	})
	.finally(() => prisma.$disconnect());
