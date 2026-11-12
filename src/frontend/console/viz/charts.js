/**
 * src/frontend/console/viz/charts.js
 *
 * Console chart kit — dependency-free inline SVG.
 *
 * Ported from `teacher-analytics.js` (the teacher session's chart kit) with the
 * `ta-` class prefix renamed to `ac-` and the tone palette re-pointed at the
 * console design tokens. The rendering logic is unchanged: these charts are
 * markup the browser can print, screenshot and theme with CSS variables.
 *
 * Contract:
 *  - Charts never invent data. A null value renders as "no data", not zero.
 *  - Every figure receives an aria-label and per-mark <title> tooltips.
 *  - Callers pass plain server payloads; this module owns only presentation.
 */

const TONES = {
	primary: 'var(--ac-tone-1)',
	success: 'var(--ac-tone-2)',
	warning: 'var(--ac-tone-3)',
	danger: 'var(--ac-tone-4)',
	info: 'var(--ac-tone-5)',
	violet: 'var(--ac-tone-6)',
	muted: 'var(--ac-tone-7)',
};

export function esc(value) {
	return String(value == null ? '' : value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

export function num(value) {
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

export function round(value, digits = 1) {
	const n = num(value);
	if (n == null) return null;
	const factor = 10 ** digits;
	return Math.round((n + Number.EPSILON) * factor) / factor;
}

export function trim(value) {
	const n = round(value, 1);
	return n == null ? '—' : String(n);
}

function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value));
}

function truncate(text, max = 28) {
	const value = String(text == null ? '' : text);
	return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function color(tone) {
	return TONES[tone] || TONES.primary;
}

export function toneOf(value, threshold, { goodAbove = true } = {}) {
	if (value == null) return 'muted';
	if (threshold == null) return 'primary';
	const good = goodAbove ? value >= threshold : value <= threshold;
	return good ? 'success' : 'danger';
}

export function empty(title, message) {
	return `<p class="ac-empty"><strong>${esc(title || 'No data')}</strong>${message ? ` ${esc(message)}` : ''}</p>`;
}

export function legend(items) {
	return `<div class="ac-legend">${items
		.map(
			(item) =>
				`<span class="ac-legend__item"><i class="ac-legend__key" style="background:${color(item.tone)}"></i>${esc(item.label)}</span>`,
		)
		.join('')}</div>`;
}

export function panel({ title, subtitle, body, action = '', className = '' }) {
	return `<section class="ac-panel ${className}">
		<div class="ac-panel__header">
			<div class="ac-panel__titles">
				<h3 class="ac-panel__title">${esc(title)}</h3>
				${subtitle ? `<p class="ac-panel__subtitle">${esc(subtitle)}</p>` : ''}
			</div>
			${action ? `<div class="ac-panel__actions">${action}</div>` : ''}
		</div>
		<div class="ac-panel__body">${body}</div>
	</section>`;
}

/**
 * A KPI card. `tooltip` becomes the card's title attribute and is the place
 * to document EXACTLY how the number was computed.
 */
export function stat({ label, value, note, tone = '', trend = '', tooltip = '', href = '' }) {
	const tag = href ? 'a' : 'div';
	const attrs = href ? ` href="${esc(href)}"` : '';
	const classes = [
		'ac-kpi',
		tone ? `ac-kpi--${tone}` : '',
		href ? 'ac-kpi--link' : '',
	]
		.filter(Boolean)
		.join(' ');
	return `<${tag} class="${classes}"${attrs}${tooltip ? ` title="${esc(tooltip)}"` : ''}>
		<p class="ac-kpi__label">${esc(label)}</p>
		<p class="ac-kpi__value">${esc(value)}</p>
		${note || trend ? `<p class="ac-kpi__meta">${trend || ''}${note ? `<span>${esc(note)}</span>` : ''}</p>` : ''}
	</${tag}>`;
}

/**
 * Trend indicator. `delta` may be null (no comparison available).
 * `higherIsBetter` defaults to true — a rising count is good.
 */
export function trend({ delta, suffix = '', higherIsBetter = true, tooltip = '' }) {
	if (delta == null || !Number.isFinite(Number(delta))) {
		return `<span class="ac-kpi__trend ac-kpi__trend--flat"${tooltip ? ` title="${esc(tooltip)}"` : ''}>—</span>`;
	}
	const value = Number(delta);
	const direction = value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
	const good = direction === 'flat' ? 'flat' : (value > 0) === higherIsBetter ? 'up' : 'down';
	const arrow = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '▬';
	return `<span class="ac-kpi__trend ac-kpi__trend--${good}"${tooltip ? ` title="${esc(tooltip)}"` : ''}>${arrow} ${value > 0 ? '+' : ''}${trim(value)}${esc(suffix)}</span>`;
}

// ── line ───────────────────────────────────────────────────────────────────

export function lineChart({
	points = [],
	previousPoints = [],
	valueKey = 'value',
	max = 100,
	threshold = null,
	ariaLabel = 'Trend',
	height = 240,
}) {
	const list = Array.isArray(points) ? points : [];
	if (!list.length) return '';
	const width = 680;
	const padL = 40;
	const padR = 18;
	const padT = 18;
	const padB = 34;
	const n = Math.max(list.length, Array.isArray(previousPoints) ? previousPoints.length : 0, 2);
	const x = (index) => padL + (index / (n - 1)) * (width - padL - padR);
	const y = (value) => padT + (1 - clamp(num(value) || 0, 0, max) / max) * (height - padT - padB);
	const gridValues = [0, max / 4, max / 2, (max * 3) / 4, max];

	const grid = gridValues
		.map(
			(value) =>
				`<line x1="${padL}" y1="${y(value)}" x2="${width - padR}" y2="${y(value)}" class="ac-chart__grid"/>` +
				`<text x="${padL - 8}" y="${y(value) + 4}" text-anchor="end" class="ac-chart__axis">${trim(value)}</text>`,
		)
		.join('');

	const thresholdLine =
		threshold == null
			? ''
			: `<line x1="${padL}" y1="${y(threshold)}" x2="${width - padR}" y2="${y(threshold)}" class="ac-chart__threshold"/>` +
				`<text x="${width - padR}" y="${y(threshold) - 5}" text-anchor="end" class="ac-chart__axis ac-chart__axis--threshold">${trim(threshold)}</text>`;

	const pathFor = (series, className) => {
		let d = '';
		series.forEach((point, index) => {
			if (index >= n) return;
			const value = num(point?.[valueKey]);
			if (value == null) return;
			d += `${d ? 'L' : 'M'}${x(index).toFixed(1)},${y(value).toFixed(1)} `;
		});
		return d ? `<path d="${d}" class="${className}"/>` : '';
	};

	const dots = list
		.map((point, index) => {
			const value = num(point?.[valueKey]);
			if (value == null) return '';
			return `<circle cx="${x(index).toFixed(1)}" cy="${y(value).toFixed(1)}" r="3.6" class="ac-chart__dot">
				<title>${esc(point.label || point.period || '')}: ${trim(value)}</title>
			</circle>`;
		})
		.join('');

	const labelEvery = Math.max(1, Math.ceil(list.length / 6));
	const labels = list
		.map((point, index) =>
			index % labelEvery === 0
				? `<text x="${x(index).toFixed(1)}" y="${height - 10}" text-anchor="middle" class="ac-chart__axis">${esc(
						point.label || point.period || '',
					)}</text>`
				: '',
		)
		.join('');

	return `<svg viewBox="0 0 ${width} ${height}" class="ac-chart ac-chart--line" role="img" aria-label="${esc(ariaLabel)}">
		${grid}${thresholdLine}
		${pathFor(Array.isArray(previousPoints) ? previousPoints : [], 'ac-chart__line ac-chart__line--prev')}
		${pathFor(list, 'ac-chart__line ac-chart__line--current')}
		${dots}${labels}
	</svg>`;
}

// ── horizontal bars ────────────────────────────────────────────────────────

export function barChart({
	rows = [],
	value,
	max = null,
	label = (row) => row.label,
	display = (v) => trim(v),
	tone = 'primary',
	threshold = null,
	ariaLabel = 'Comparison',
}) {
	const list = (Array.isArray(rows) ? rows : []).filter(Boolean);
	if (!list.length) return '';
	const width = 680;
	const rowH = 38;
	const padL = 150;
	const padR = 64;
	const padT = 10;
	const padB = 8;
	const height = list.length * rowH + padT + padB;
	const values = list.map((row) => Number(typeof value === 'function' ? value(row) : row[value]) || 0);
	const maxValue = Math.max(max || 0, ...values, 1);
	const plotW = width - padL - padR;
	const x = (v) => padL + (clamp(v, 0, maxValue) / maxValue) * plotW;
	const thresholdLine =
		threshold == null
			? ''
			: `<line x1="${x(threshold)}" y1="${padT - 4}" x2="${x(threshold)}" y2="${height - padB + 2}" class="ac-chart__threshold"/>`;

	const body = list
		.map((row, index) => {
			const raw = typeof value === 'function' ? value(row) : row[value];
			const numeric = num(raw);
			const top = padT + index * rowH;
			const barY = top + 14;
			const barH = 12;
			const widthValue = numeric == null ? 0 : Math.max(numeric > 0 ? 2 : 0, x(numeric) - padL);
			const rowTone = typeof tone === 'function' ? tone(row) : tone;
			const text = display(raw, row);
			return `<g>
				<title>${esc(label(row))}: ${esc(text)}</title>
				<text x="${padL - 10}" y="${barY + 10}" text-anchor="end" class="ac-chart__label">${esc(
					truncate(label(row), 24),
				)}</text>
				<rect x="${padL}" y="${barY}" width="${plotW}" height="${barH}" rx="3" class="ac-chart__track"/>
				<rect x="${padL}" y="${barY}" width="${widthValue}" height="${barH}" rx="3" fill="${color(rowTone)}" opacity="0.9"/>
				<text x="${width - padR + 8}" y="${barY + 10}" class="ac-chart__value">${esc(text)}</text>
			</g>`;
		})
		.join('');

	return `<svg viewBox="0 0 ${width} ${height}" class="ac-chart ac-chart--bars" role="img" aria-label="${esc(ariaLabel)}">
		${thresholdLine}${body}
	</svg>`;
}

// ── stacked horizontal bars ────────────────────────────────────────────────

export function stackedBarChart({
	rows = [],
	segments = [],
	label = (row) => row.label,
	valueText = null,
	ariaLabel = 'Distribution by group',
}) {
	const list = (Array.isArray(rows) ? rows : []).filter(Boolean);
	if (!list.length || !segments.length) return '';
	const width = 680;
	const rowH = 38;
	const padL = 150;
	const padR = 90;
	const padT = 10;
	const totalFor = (row) => segments.reduce((sum, segment) => sum + (Number(row[segment.key]) || 0), 0);
	const maxTotal = Math.max(1, ...list.map(totalFor));
	const plotW = width - padL - padR;
	const height = list.length * rowH + padT + 8;

	const body = list
		.map((row, index) => {
			const top = padT + index * rowH;
			const barY = top + 14;
			const barH = 12;
			let cursor = padL;
			const pieces = segments
				.map((segment) => {
					const count = Number(row[segment.key]) || 0;
					if (!count) return '';
					const segmentWidth = (count / maxTotal) * plotW;
					const x = cursor;
					cursor += segmentWidth;
					return `<rect x="${x}" y="${barY}" width="${Math.max(1, segmentWidth)}" height="${barH}" fill="${color(
						segment.tone,
					)}" opacity="0.9"><title>${esc(segment.label)}: ${count}</title></rect>`;
				})
				.join('');
			const total = totalFor(row);
			const text = valueText ? valueText(row) : `${total}`;
			return `<g>
				<title>${esc(label(row))}: ${esc(text)}</title>
				<text x="${padL - 10}" y="${barY + 10}" text-anchor="end" class="ac-chart__label">${esc(
					truncate(label(row), 24),
				)}</text>
				<rect x="${padL}" y="${barY}" width="${plotW}" height="${barH}" rx="3" class="ac-chart__track"/>
				${pieces}
				<text x="${width - padR + 8}" y="${barY + 10}" class="ac-chart__value">${esc(text)}</text>
			</g>`;
		})
		.join('');

	return `<svg viewBox="0 0 ${width} ${height}" class="ac-chart ac-chart--stacked" role="img" aria-label="${esc(ariaLabel)}">
		${body}
	</svg>`;
}

// ── grouped horizontal bars ────────────────────────────────────────────────

export function groupedBarChart({
	rows = [],
	series = [],
	label = (row) => row.label,
	ariaLabel = 'Comparison by group',
}) {
	const list = (Array.isArray(rows) ? rows : []).filter(Boolean);
	if (!list.length || !series.length) return '';
	const width = 680;
	const padL = 150;
	const padR = 24;
	const padT = 8;
	const barH = 9;
	const gap = 3;
	const rowH = series.length * (barH + gap) + 22;
	const height = list.length * rowH + padT + 6;
	const maxValue = Math.max(
		1,
		...list.flatMap((row) => series.map((item) => Number(row[item.key]) || 0)),
	);
	const plotW = width - padL - padR;

	const body = list
		.map((row, index) => {
			const top = padT + index * rowH;
			const bars = series
				.map((item, seriesIndex) => {
					const value = Number(row[item.key]) || 0;
					const barY = top + 18 + seriesIndex * (barH + gap);
					const barW = value > 0 ? Math.max(2, (value / maxValue) * plotW) : 0;
					return `<g>
						<title>${esc(label(row))} · ${esc(item.label)}: ${value}</title>
						<rect x="${padL}" y="${barY}" width="${plotW}" height="${barH}" rx="2" class="ac-chart__track"/>
						<rect x="${padL}" y="${barY}" width="${barW}" height="${barH}" rx="2" fill="${color(
							item.tone,
						)}" opacity="0.9"/>
						<text x="${padL + barW + 6}" y="${barY + barH - 1}" class="ac-chart__value ac-chart__value--inline">${value}</text>
					</g>`;
				})
				.join('');
			return `<g>
				<text x="${padL - 10}" y="${top + 26}" text-anchor="end" class="ac-chart__label">${esc(
					truncate(label(row), 24),
				)}</text>
				${bars}
			</g>`;
		})
		.join('');

	return `<svg viewBox="0 0 ${width} ${height}" class="ac-chart ac-chart--grouped" role="img" aria-label="${esc(ariaLabel)}">
		${body}
	</svg>`;
}

// ── vertical columns ───────────────────────────────────────────────────────

export function columnChart({
	points = [],
	series = [],
	labelKey = 'label',
	ariaLabel = 'Activity over time',
	height = 220,
}) {
	const list = Array.isArray(points) ? points : [];
	if (!list.length || !series.length) return '';
	const width = 680;
	const padL = 38;
	const padR = 14;
	const padT = 16;
	const padB = 34;
	const maxValue = Math.max(
		1,
		...list.flatMap((point) => series.map((item) => Number(point[item.key]) || 0)),
	);
	const slot = (width - padL - padR) / list.length;
	const barW = Math.min(26, Math.max(5, (slot * 0.7) / series.length));
	const y = (value) => padT + (1 - clamp(value, 0, maxValue) / maxValue) * (height - padT - padB);
	const labelEvery = Math.max(1, Math.ceil(list.length / 7));

	const columns = list
		.map((point, index) => {
			const center = padL + index * slot + slot / 2;
			const groupWidth = series.length * (barW + 2);
			const start = center - groupWidth / 2;
			const bars = series
				.map((item, seriesIndex) => {
					const value = Number(point[item.key]) || 0;
					const barH = height - padB - y(value);
					const x = start + seriesIndex * (barW + 2);
					return `<rect x="${x}" y="${y(value)}" width="${barW}" height="${Math.max(0, barH)}" rx="2" fill="${color(
						item.tone,
					)}" opacity="0.9"><title>${esc(point[labelKey])} · ${esc(item.label)}: ${value}</title></rect>`;
				})
				.join('');
			const label =
				index % labelEvery === 0
					? `<text x="${center}" y="${height - 10}" text-anchor="middle" class="ac-chart__axis">${esc(
							point[labelKey],
						)}</text>`
					: '';
			return `${bars}${label}`;
		})
		.join('');

	return `<svg viewBox="0 0 ${width} ${height}" class="ac-chart ac-chart--columns" role="img" aria-label="${esc(ariaLabel)}">
		<line x1="${padL}" y1="${height - padB}" x2="${width - padR}" y2="${height - padB}" class="ac-chart__grid"/>
		${columns}
	</svg>`;
}

export function histogram({ buckets = [], ariaLabel = 'Distribution' }) {
	return columnChart({
		points: buckets,
		series: [{ key: 'count', label: 'Count', tone: 'primary' }],
		labelKey: 'label',
		ariaLabel,
		height: 200,
	});
}

// ── donut ──────────────────────────────────────────────────────────────────

export function donut({
	segments = [],
	centerValue = '',
	centerLabel = '',
	ariaLabel = 'Composition',
	size = 190,
}) {
	const list = (Array.isArray(segments) ? segments : []).filter((item) => (Number(item.value) || 0) > 0);
	if (!list.length) return '';
	const total = list.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
	const r = 62;
	const center = size / 2;
	const circumference = 2 * Math.PI * r;
	let offset = 0;
	const arcs = list
		.map((item) => {
			const value = Number(item.value) || 0;
			const length = (value / total) * circumference;
			const circle = `<circle cx="${center}" cy="${center}" r="${r}" fill="none" stroke="${color(item.tone)}" stroke-width="22"
				stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-offset}"
				transform="rotate(-90 ${center} ${center})" opacity="0.92"><title>${esc(item.label)}: ${value} (${round(
					(value / total) * 100,
					1,
				)}%)</title></circle>`;
			offset += length;
			return circle;
		})
		.join('');
	return `<svg viewBox="0 0 ${size} ${size}" class="ac-chart ac-chart--donut" role="img" aria-label="${esc(ariaLabel)}">
		<circle cx="${center}" cy="${center}" r="${r}" fill="none" class="ac-chart__donut-track" stroke-width="22"/>
		${arcs}
		<text x="${center}" y="${center - 4}" text-anchor="middle" class="ac-chart__center">${esc(centerValue)}</text>
		<text x="${center}" y="${center + 15}" text-anchor="middle" class="ac-chart__center-label">${esc(centerLabel)}</text>
	</svg>`;
}

// ── ring / gauge ───────────────────────────────────────────────────────────

export function ring({ value, max = 100, label = '', sublabel = '', tone = 'primary', size = 150 }) {
	const numeric = num(value);
	const ratio = numeric == null ? 0 : clamp(numeric / max, 0, 1);
	const r = 56;
	const center = size / 2;
	const circumference = 2 * Math.PI * r;
	return `<div class="ac-ring" role="img" aria-label="${esc(label)}: ${esc(
		numeric == null ? 'no data' : `${trim(numeric)}${max === 100 ? '%' : `/${max}`}`,
	)}">
		<svg viewBox="0 0 ${size} ${size}" class="ac-chart">
			<circle cx="${center}" cy="${center}" r="${r}" fill="none" class="ac-chart__donut-track" stroke-width="12"/>
			<circle cx="${center}" cy="${center}" r="${r}" fill="none" stroke="${color(tone)}" stroke-width="12"
				stroke-linecap="round" stroke-dasharray="${circumference * ratio} ${circumference}"
				transform="rotate(-90 ${center} ${center})"/>
			<text x="${center}" y="${center - 2}" text-anchor="middle" class="ac-chart__center">${esc(
				numeric == null ? '—' : trim(numeric),
			)}${max === 100 && numeric != null ? '%' : ''}</text>
			<text x="${center}" y="${center + 17}" text-anchor="middle" class="ac-chart__center-label">${esc(sublabel || `of ${max}`)}</text>
		</svg>
		<span class="ac-ring__label">${esc(label)}</span>
	</div>`;
}

// ── heatmap ────────────────────────────────────────────────────────────────

export function heatmap({
	rowLabels = [],
	columnLabels = [],
	values = [],
	tone = 'danger',
	ariaLabel = 'Heatmap',
	format = (value) => (value == null ? '—' : `${trim(value)}%`),
}) {
	if (!rowLabels.length || !columnLabels.length) return '';
	const width = 680;
	const padL = 130;
	const padT = 28;
	const cellH = 26;
	const cellW = (width - padL - 12) / columnLabels.length;
	const height = padT + rowLabels.length * cellH + 8;
	const cells = rowLabels
		.map((rowLabel, rowIndex) => {
			const row = values[rowIndex] || [];
			const rowCells = columnLabels
				.map((columnLabel, columnIndex) => {
					const value = num(row[columnIndex]);
					const x = padL + columnIndex * cellW;
					const y = padT + rowIndex * cellH;
					const opacity = value == null ? 0 : clamp(value / 100, 0.06, 0.9);
					const fill = value == null ? 'transparent' : color(tone);
					return `<rect x="${x}" y="${y}" width="${cellW - 3}" height="${cellH - 3}" rx="4" fill="${fill}" opacity="${opacity.toFixed(
						2,
					)}" class="ac-chart__cell"><title>${esc(rowLabel)} · ${esc(columnLabel)}: ${esc(
						format(value),
					)}</title></rect>
					<text x="${x + (cellW - 3) / 2}" y="${y + 16}" text-anchor="middle" class="ac-chart__cell-value">${esc(
						format(value),
					)}</text>`;
				})
				.join('');
			return `<text x="${padL - 10}" y="${padT + rowIndex * cellH + 17}" text-anchor="end" class="ac-chart__label">${esc(
				truncate(rowLabel, 20),
			)}</text>${rowCells}`;
		})
		.join('');
	const headers = columnLabels
		.map(
			(columnLabel, index) =>
				`<text x="${padL + index * cellW + (cellW - 3) / 2}" y="${padT - 10}" text-anchor="middle" class="ac-chart__axis">${esc(
					truncate(columnLabel, 16),
				)}</text>`,
		)
		.join('');
	return `<svg viewBox="0 0 ${width} ${height}" class="ac-chart ac-chart--heatmap" role="img" aria-label="${esc(ariaLabel)}">
		${headers}${cells}
	</svg>`;
}

// ── sparkline ──────────────────────────────────────────────────────────────

export function sparkline(values = [], { max = 100, tone = 'primary' } = {}) {
	const list = (Array.isArray(values) ? values : []).map(num).filter((value) => value != null);
	if (list.length < 2) return '';
	const width = 120;
	const height = 34;
	const step = width / (list.length - 1);
	const y = (value) => 4 + (1 - clamp(value, 0, max) / max) * (height - 8);
	const d = list.map((value, index) => `${index ? 'L' : 'M'}${(index * step).toFixed(1)},${y(value).toFixed(1)}`).join(' ');
	return `<svg viewBox="0 0 ${width} ${height}" class="ac-chart" role="img" aria-label="Mini trend">
		<path d="${d}" fill="none" stroke="${color(tone)}" stroke-width="2" stroke-linecap="round"/>
	</svg>`;
}
