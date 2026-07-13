/**
 * src/frontend/ui/pages/admin/components/DataTable.js
 * Reusable sortable, paginated data table for admin CRUD pages.
 *
 * All cell content is rendered via DOM APIs or safeSetHTML — never raw innerHTML
 * with user content. Column `render(value, row)` callbacks receive model data and
 * must return either a string of *trusted/escaped* HTML, a text string, or a DOM Node.
 */

import { escapeHTML, safeSetHTML } from '../../../../utils/sanitize.js';

/**
 * Build a DataTable instance.
 *
 * @param {Object} opts
 * @param {string} opts.containerId - id of the host element
 * @param {Array<{key:string,label:string,sortable?:boolean,render?:(val,row)=>string|Node}>} opts.columns
 * @param {(params:{limit:number,offset:number,orderBy:string,direction:'asc'|'desc',search:string|null}) => Promise<{data:Array, total:number}>} opts.fetch
 *   - fetch function returning { data, total }
 * @param {string} [opts.initialOrderBy]
 * @param {'asc'|'desc'} [opts.initialDirection='desc']
 * @param {number} [opts.pageSize=20]
 * @param {boolean} [opts.searchable=true]
 * @param {number} [opts.searchDebounceMs=350]
 * @returns {DataTable} instance with render() and refresh()
 */
export function createDataTable({
  containerId,
  columns,
  fetch,
  initialOrderBy = 'created_at',
  initialDirection = 'desc',
  pageSize = 20,
  searchable = true,
  searchDebounceMs = 350,
}) {
  const host = document.getElementById(containerId);
  if (!host) {
    throw new Error(`DataTable host "#${containerId}" not found`);
  }

  let state = {
    limit: pageSize,
    offset: 0,
    orderBy: initialOrderBy,
    direction: initialDirection,
    search: null,
  };
  let debounceTimer = null;
  let emptyMsg = 'No records found.';

  /**
   * Render the table frame into the host. Built once per instance.
   */
  function buildFrame() {
    host.replaceChildren();

    // Optional search bar
    let searchInput = null;
    if (searchable) {
      const toolbar = document.createElement('div');
      toolbar.className = 'admin-table__toolbar';

      searchInput = document.createElement('input');
      searchInput.type = 'search';
      searchInput.className = 'admin-table__search';
      searchInput.placeholder = 'Search…';
      searchInput.setAttribute('aria-label', 'Search table');
      searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          state.search = searchInput.value.trim() || null;
          state.offset = 0;
          renderRows();
        }, searchDebounceMs);
      });
      toolbar.appendChild(searchInput);
      host.appendChild(toolbar);
    }

    const tableWrap = document.createElement('div');
    tableWrap.className = 'admin-table__wrap';

    const table = document.createElement('table');
    table.className = 'data-table admin-table';

    const thead = document.createElement('thead');
    const tr = document.createElement('tr');
    for (const col of columns) {
      const th = document.createElement('th');
      th.textContent = col.label;
      if (col.sortable !== false) {
        th.classList.add('admin-table__th--sortable');
        th.setAttribute('role', 'button');
        th.setAttribute('tabindex', '0');
        const doSort = () => {
          if (state.orderBy === col.key) {
            state.direction = state.direction === 'asc' ? 'desc' : 'asc';
          } else {
            state.orderBy = col.key;
            state.direction = 'asc';
          }
          state.offset = 0;
          renderRows();
        };
        th.addEventListener('click', doSort);
        th.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); doSort(); }
        });
      }
      tr.appendChild(th);
    }
    thead.appendChild(tr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    tbody.className = 'admin-table__body';
    table.appendChild(tbody);

    const caption = document.createElement('caption');
    caption.className = 'admin-table__caption';
    caption.setAttribute('aria-live', 'polite');
    table.appendChild(caption);

    tableWrap.appendChild(table);
    host.appendChild(tableWrap);

    // Pagination controls
    const pager = document.createElement('div');
    pager.className = 'admin-table__pager';

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'btn btn-secondary';
    prevBtn.textContent = '‹ Prev';
    prevBtn.addEventListener('click', () => {
      if (state.offset > 0) { state.offset = Math.max(0, state.offset - state.limit); renderRows(); }
    });

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'btn btn-secondary';
    nextBtn.textContent = 'Next ›';
    nextBtn.addEventListener('click', () => {
      state.offset += state.limit;
      renderRows();
    });

    const pageLabel = document.createElement('span');
    pageLabel.className = 'admin-table__page-label';

    pager.append(prevBtn, pageLabel, nextBtn);
    host.appendChild(pager);

    return { tbody, caption, prevBtn, nextBtn, pageLabel };
  }

  const frame = buildFrame();

  /**
   * Fetch data + render the <tbody>. Sets loading state, then renders rows or
   * an empty-state message. Updates sort markers and pager state.
   */
  async function renderRows() {
    frame.tbody.replaceChildren();
    frame.caption.textContent = 'Loading…';
    try {
      const { data, total } = await fetch(state);

      // Update sort marker
      const ths = frame.tbody.closest('table').querySelectorAll('thead th');
      columns.forEach((col, i) => {
        const th = ths[i];
        if (!th) return;
        th.classList.toggle('admin-table__th--sorted-asc', col.key === state.orderBy && state.direction === 'asc');
        th.classList.toggle('admin-table__th--sorted-desc', col.key === state.orderBy && state.direction === 'desc');
      });

      if (!data || data.length === 0) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = columns.length;
        cell.className = 'admin-table__empty';
        cell.textContent = emptyMsg;
        row.appendChild(cell);
        frame.tbody.appendChild(row);
      } else {
        for (const item of data) renderRow(frame.tbody, item);
      }

      // Pager state
      const start = total === 0 ? 0 : state.offset + 1;
      const end = Math.min(state.offset + state.limit, total);
      frame.pageLabel.textContent = total === 0
        ? 'No results'
        : `${start}–${end} of ${total}`;
      frame.prevBtn.disabled = state.offset === 0;
      frame.nextBtn.disabled = state.offset + state.limit >= total;
      frame.caption.textContent = total === 0 ? '' : `${total} record${total === 1 ? '' : 's'}`;
    } catch (err) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = columns.length;
      cell.className = 'admin-table__error';
      cell.textContent = `Error: ${err.message}`;
      row.appendChild(cell);
      frame.tbody.appendChild(row);
      frame.pageLabel.textContent = '—';
      frame.prevBtn.disabled = true;
      frame.nextBtn.disabled = true;
    }
  }

  function renderRow(tbody, item) {
    const tr = document.createElement('tr');
    for (const col of columns) {
      const td = document.createElement('td');
      const val = item[col.key];
      if (col.render) {
        const out = col.render(val, item);
        if (out instanceof Node) {
          td.appendChild(out);
        } else if (typeof out === 'string') {
          // render() returns trusted HTML (e.g. escaped strings we built deliberately)
          safeSetHTML(td, out, true);
        } else {
          td.textContent = String(out ?? '');
        }
      } else {
        td.textContent = String(val ?? '');
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  /** Force a re-render (e.g. after a delete/mutation). */
  function refresh() { renderRows(); }
  /** Change the empty-state message. */
  function setEmptyMessage(msg) { emptyMsg = msg; }
  /** Reset to first page and re-render. */
  function resetAndRefresh() { state.offset = 0; renderRows(); }

  return { render: renderRows, refresh, resetAndRefresh, setEmptyMessage };
}
