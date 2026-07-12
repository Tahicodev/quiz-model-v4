/**
 * src/frontend/ui/pages/auth/LoginPage.js
 * Reference stub for the Login Page.
 * Wires DOM elements to the container's AuthService.
 */

import { getContainer } from '../../../container.js';
import { withError }    from '../../../utils/eventBus.js';
import { Router }       from '../../router.js';

export function initLoginPage() {
  const form = document.getElementById('login-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = form.username.value;
    const password = form.password.value;

    const { authSvc } = getContainer();

    await withError(async () => {
      const { user } = await authSvc.login(username, password);
      
      if (authSvc.isAdmin()) {
        Router.navigate('/admin.html');
      } else {
        Router.navigate('/student-workspace.html');
      }
    });
  });
}
