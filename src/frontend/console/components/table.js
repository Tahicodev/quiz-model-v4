/**
 * src/frontend/console/components/table.js
 *
 * Dense, readable data table with optional sorting and server-side
 * pagination.
 *
 * The table is a pure renderer: it receives rows that the SERVER already
 * filtered, sorted and paginated. It never aggregates.
 */

import { esc } from '../viz/charts.js';

/**
 * @param {{ columns:Array<{key:string,label:string,align?:'left'|'right',
 *           sortable?:boolean,render?:(row:any)=>string,className?:string}>,
 *           rows:Array<object>, empty?:string, sort?:{key:string,direction:'asc'|'desc'},
 *           onSort?:(key:string)=>void, rowHref?:(row:any)=>string|null,
 *           rowClass?:(row:any)=>string }} options
 */
export function renderTable({
	columns,
	rows,
	empty = 'Nothing to show for the current filters.',
	sort = null,
	onSort = null,
	rowHref = null,
	rowClass = null,
}) {
	if (!rows || rows.length === 0) {
		return `<div class="ac-empty">
			<div class="ac-empty__icon" aria-hidden="true">
				<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
			</div>
			<p class="ac-empty__title">No data</p>
			<p class="ac-empty__message">${esc(empty)}</p>
		</div>`;
	}

	const head = columns
		.map((column) => {
			const align = column.align === 'right' ? ' is-numeric' : '';
			const sortable = column.sortable && onSort ? ' is-sortable' : '';
			const isSorted = sort && sort.key === column.key;
			const arrow = isSorted ? (sort.direction === 'asc' ? '▲' : '▼') : '';
			return `<th class="${align}${sortable}"${
				sortable ? ` data-ac-sort="${esc(column.key)}"` : ''
			}${isSorted ? ` aria-sort="${sort.direction === 'asc' ? 'ascending' : 'descending'}"` : ''}>
				${esc(column.label)}${arrow ? `<span class="ac-sort">${arrow}</span>` : ''}
			</th>`;
		})
		.join('');

	const body = rows
		.map((row, index) => {
			const href = rowHref ? rowHref(row) : null;
			const extraClass = rowClass ? rowClass(row) : '';
			const cells = columns
				.map((column) => {
					const align = column.align === 'right' ? ' is-numeric' : '';
					const content = column.render ? column.render(row) : esc(row[column.key] ?? '—');
					return `<td class="${align}${column.className ? ` ${column.className}` : ''}" data-label="${esc(
						column.label,
					)}">${content}</td>`;
				})
				.join('');
			return `<tr${href ? ` data-ac-href="${esc(href)}"` : ''} class="${esc(extraClass)}" data-ac-row="${index}">${cells}</tr>`;
		})
		.join('');

	return `<div class="ac-table-wrap"><table class="ac-table">
		<thead><tr>${head}</tr></thead>
		<tbody>${body}</tbody>
	</table></div>`;
}

/**
 * Pagination bar. The server owns the totals; this only renders controls.
 */
export function renderPagination({ total, limit, offset, onPage }) {
	const safeLimit = Math.max(1, Number(limit) || 50);
	const safeOffset = Math.max(0, Number(offset) || 0);
	const page = Math.floor(safeOffset / safeLimit) + 1;
	const pages = Math.max(1, Math.ceil((Number(total) || 0) / safeLimit));
	const from = total === 0 ? 0 : safeOffset + 1;
	const to = Math.min(safeOffset + safeLimit, Number(total) || 0);

	const button = (label, targetOffset, disabled, extra = '') =>
		`<button type="button" class="ac-btn ac-btn--sm" data-ac-page="${targetOffset}"${
			disabled ? ' disabled' : ''
		}${extra}>${label}</button>`;

	return `<div class="ac-pagination">
		<span>Showing ${from}–${to} of ${(Number(total) || 0).toLocaleString()}</span>
		<div class="ac-pagination__pages">
			${button('«', 0, safeOffset === 0)}
			${button('‹', Math.max(0, safeOffset - safeLimit), safeOffset === 0)}
			<span style="padding:0 6px">Page ${page} of ${pages}</span>
			${button('›', safeOffset + safeLimit, safeOffset + safeLimit >= (Number(total) || 0))}
			${button('»', Math.max(0, (pages - 1) * safeLimit), safeOffset + safeLimit >= (Number(total) || 0))}
		</div>
	</div>`;
}

/**
 * Bind the sorting and pagination controls of a rendered table.
 * @param {HTMLElement} root
 * @param {{ onSort?:(key:string)=>void, onPage?:(offset:number)=>void }} handlers
 */
export function bindTable(root, { onSort = null, onPage = null } = {}) {
	if (onSort) {
		root.querySelectorAll('[data-ac-sort]').forEach((th) => {
			th.addEventListener('click', () => onSort(th.dataset.acSort));
		});
	}
	if (onPage) {
		root.querySelectorAll('[data-ac-page]').forEach((btn) => {
			btn.addEventListener('click', () => onPage(Number(btn.dataset.acPage)));
		});
	}
	root.querySelectorAll('[data-ac-href]').forEach((row) => {
		row.style.cursor = 'pointer';
		row.addEventListener('click', (event) => {
			if (event.target.closest('a, button, input, select')) return;
			window.location.hash = row.dataset.acHref;
		});
	});
}
