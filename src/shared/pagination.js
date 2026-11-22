/**
 * src/shared/pagination.js
 *
 * Completeness helper over the repository's existing pagination contract:
 * `getAll(table, { filters, orderBy, direction, limit, offset })` returns
 * `{ data, total }`.
 *
 * `fetchAllRows` reads EVERY page until the dataset is complete and then
 * returns it. It never returns a partial dataset as if it were complete — the
 * silent-truncation failure it exists to prevent. If completeness cannot be
 * established it throws, so a caller can never validate against (or label from)
 * an incomplete set without knowing it.
 *
 * Why a loop and not a bigger single limit: a per-school lookup is unbounded in
 * the schema, so any fixed cap is a correctness boundary waiting to be crossed.
 *
 * ── Consistency model (known limit, not a defect) ──────────────────────────
 * Completeness is guaranteed *relative to the dataset the repository reports
 * during the read*, NOT relative to an immutable database snapshot. Offset
 * pagination is not a snapshot read. The helper pins the first reported `total`
 * and refuses any page whose `total` differs, so churn that MOVES the total is
 * caught. But a dataset can change WITHOUT changing its total — one row deleted
 * and another inserted between two pages — and a mixed result would then be
 * undetected. The `id` sort keeps pages from overlapping while the dataset is
 * stable; it does not make the read atomic.
 *
 * Callers assume taxonomy writes are serialized per request and do not race
 * with these reads (the interactive classifiers are per-question, per-admin).
 * If concurrent mutation of the same school's taxonomy ever becomes possible, a
 * transaction with suitable isolation, or a keyset/cursor read, will be needed.
 *
 * ── Response contract ──────────────────────────────────────────────────────
 * Assumes `data` is an array and `total` a finite number — which is what
 * `PrismaRepository.getAll` always returns. Deviations are handled as follows:
 *   • absent `total` (NaN/undefined)      → completion falls back to
 *                                           "a short page ends the read";
 *   • non-array / missing `data`          → treated as an EMPTY page (i.e. end
 *                                           of data) — not rejected here;
 *   • a `total` that `null`/`''` coerce to → treated as a real total of 0.
 * A total that changes mid-read, or fewer rows than the total, always throws.
 */

/** Default page size — the same generous page used before, now as a page, not a cap. */
export const DEFAULT_PAGE_SIZE = 1000;

/**
 * Safety valve: if a repository never advances (returns full pages forever)
 * paging stops and fails loudly instead of looping. 100k pages is far beyond
 * any real dataset.
 */
const MAX_PAGES = 100000;

/**
 * Read the complete result set, page by page.
 *
 * @param {{getAll: Function}} repo  repository exposing `getAll`
 * @param {string} table             generic table name
 * @param {object} [options]
 * @param {object} [options.filters]  Exact-match filters applied to EVERY page.
 * @param {string} [options.orderBy]  Stable sort field. Pass a unique column
 *                                    (e.g. `id`) so pages cannot overlap.
 * @param {'asc'|'desc'} [options.direction]
 * @param {number} [options.pageSize]
 * @returns {Promise<object[]>} every row, or throws if completeness fails.
 */
export async function fetchAllRows(
  repo,
  table,
  { filters = {}, orderBy, direction, pageSize = DEFAULT_PAGE_SIZE } = {},
) {
  if (!repo || typeof repo.getAll !== 'function') {
    throw new Error(`fetchAllRows(${table}): repository does not implement getAll()`);
  }
  if (!Number.isFinite(pageSize) || pageSize <= 0) {
    throw new Error(`fetchAllRows(${table}): pageSize must be a positive, finite number`);
  }

  const rows = [];
  let offset = 0;
  let total = null; // established from the first page that reports it
  let pages = 0;

  for (;;) {
    const query = { filters, limit: pageSize, offset };
    if (orderBy !== undefined) query.orderBy = orderBy;
    if (direction !== undefined) query.direction = direction;

    const page = await repo.getAll(table, query);
    const data = Array.isArray(page?.data) ? page.data : [];
    const reportedTotal = Number(page?.total);

    if (Number.isFinite(reportedTotal)) {
      if (total === null) total = reportedTotal;
      else if (reportedTotal !== total) {
        // The dataset moved while we were paging: the result would be a mix of
        // two states, so refuse it rather than return something inconsistent.
        throw new Error(
          `fetchAllRows(${table}): the dataset changed while paging (total ${total} → ${reportedTotal})`,
        );
      }
    }

    if (data.length === 0) break; // nothing more to read
    rows.push(...data);
    offset += data.length;
    pages += 1;

    if (Number.isFinite(total) && rows.length > total) {
      throw new Error(
        `fetchAllRows(${table}): read ${rows.length} rows but the dataset reports only ${total}`,
      );
    }
    // Complete when the reported total is reached. With no reported total, a
    // short page is the last page (a full page means "keep going").
    if (Number.isFinite(total) ? rows.length >= total : data.length < pageSize) break;

    if (pages >= MAX_PAGES) {
      throw new Error(`fetchAllRows(${table}): exceeded ${MAX_PAGES} pages without completing the dataset`);
    }
  }

  if (Number.isFinite(total) && rows.length !== total) {
    throw new Error(
      `fetchAllRows(${table}): retrieved ${rows.length} of ${total} rows — the dataset is incomplete`,
    );
  }
  return rows;
}
