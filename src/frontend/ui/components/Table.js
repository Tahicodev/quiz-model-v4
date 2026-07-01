/**
 * src/frontend/ui/components/Table.js
 * Basic data table renderer that uses safeSetHTML for cell content.
 */

import { safeSetHTML, escapeHTML } from '../../utils/sanitize.js';

export function renderTable(containerId, columns, data, onRowClick = null) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (data.length === 0) {
    container.innerHTML = '<div class="empty-state">No records found.</div>';
    return;
  }

  const table = document.createElement('table');
  table.className = 'data-table';

  // Header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const col of columns) {
    const th = document.createElement('th');
    th.textContent = col.label; // Safe
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body
  const tbody = document.createElement('tbody');
  for (const row of data) {
    const tr = document.createElement('tr');
    if (onRowClick) {
      tr.style.cursor = 'pointer';
      tr.onclick = () => onRowClick(row);
    }
    
    for (const col of columns) {
      const td = document.createElement('td');
      const val = row[col.key];
      
      if (col.render) {
        // Assume render() returns safe HTML or DOM nodes
        const rendered = col.render(val, row);
        if (typeof rendered === 'string') {
          safeSetHTML(td, rendered, true); // True because we trust the render function to return safe HTML
        } else if (rendered instanceof Node) {
          td.appendChild(rendered);
        }
      } else {
        td.textContent = val ?? ''; // Safe text assignment
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  container.innerHTML = '';
  container.appendChild(table);
}
