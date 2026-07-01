/**
 * src/frontend/ui/components/Spinner.js
 * Centralized loading spinner component.
 */

export function showGlobalSpinner() {
  let spinner = document.getElementById('global-spinner');
  if (!spinner) {
    spinner = document.createElement('div');
    spinner.id = 'global-spinner';
    spinner.className = 'spinner-overlay';
    spinner.innerHTML = `
      <div class="spinner-container">
        <div class="loader"></div>
        <p>Loading...</p>
      </div>
    `;
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
