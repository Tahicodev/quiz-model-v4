/**
 * src/frontend/ui/components/Spinner.js
 * Centralized loading spinner component. DOM-constructed (no innerHTML).
 */

export function showGlobalSpinner() {
  let spinner = document.getElementById('global-spinner');
  if (!spinner) {
    spinner = document.createElement('div');
    spinner.id = 'global-spinner';
    spinner.className = 'spinner-overlay';

    const container = document.createElement('div');
    container.className = 'spinner-container';

    const loader = document.createElement('div');
    loader.className = 'loader';

    const text = document.createElement('p');
    text.textContent = 'Loading…';

    container.append(loader, text);
    spinner.appendChild(container);
    document.body.appendChild(spinner);
  }
  spinner.style.display = 'flex';
}

export function hideGlobalSpinner() {
  const spinner = document.getElementById('global-spinner');
  if (spinner) {
    spinner.style.display = 'none';
  }
}
