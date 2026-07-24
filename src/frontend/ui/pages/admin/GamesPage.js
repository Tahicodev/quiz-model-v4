/**
 * src/frontend/ui/pages/admin/GamesPage.js
 * Live Games and Tournaments management for admins.
 */

import { getContainer }    from '../../../container.js';
import { withError }       from '../../../utils/eventBus.js';
import { createDataTable } from './components/DataTable.js';
import { formModal, textField, selectField } from './components/FormModal.js';
import { confirmDialog }   from './components/ConfirmDialog.js';

let gamesTableCtl = null;
let tournamentsTableCtl = null;

export async function initGamesPage(host) {
  host.replaceChildren();

  const title = document.createElement('h1');
  title.className = 'page-title';
  title.textContent = 'Live Games & Tournaments';

  // Games Section
  const gamesHeader = document.createElement('div');
  gamesHeader.className = 'admin-toolbar';
  const gamesTitle = document.createElement('h2');
  gamesTitle.textContent = 'Live Games';
  gamesTitle.style.margin = '0';
  const newGameBtn = document.createElement('button');
  newGameBtn.className = 'btn btn-primary';
  newGameBtn.textContent = '+ Create Lobby';
  newGameBtn.onclick = () => openGameForm();
  
  const gamesSpacer = document.createElement('div');
  gamesSpacer.style.flex = '1';
  gamesHeader.append(gamesTitle, gamesSpacer, newGameBtn);

  const gamesTableHost = document.createElement('div');
  gamesTableHost.id = 'admin-games-table';

  // Tournaments Section
  const tournamentsHeader = document.createElement('div');
  tournamentsHeader.className = 'admin-toolbar';
  tournamentsHeader.style.marginTop = '2rem';
  const tourneyTitle = document.createElement('h2');
  tourneyTitle.textContent = 'Tournaments';
  tourneyTitle.style.margin = '0';
  const newTourneyBtn = document.createElement('button');
  newTourneyBtn.className = 'btn btn-primary';
  newTourneyBtn.textContent = '+ Create Tournament';
  newTourneyBtn.onclick = () => openTournamentForm();
  
  const tourneySpacer = document.createElement('div');
  tourneySpacer.style.flex = '1';
  tournamentsHeader.append(tourneyTitle, tourneySpacer, newTourneyBtn);

  const tournamentsTableHost = document.createElement('div');
  tournamentsTableHost.id = 'admin-tournaments-table';

  host.append(title, gamesHeader, gamesTableHost, tournamentsHeader, tournamentsTableHost);

  gamesTableCtl = createDataTable({
    containerId: 'admin-games-table',
    columns: [
      { key: 'join_code', label: 'Code', sortable: false },
      { key: 'status', label: 'Status', sortable: true },
      { key: 'mode', label: 'Mode', sortable: true },
      { key: 'created_at', label: 'Created', sortable: true },
      { key: 'actions', label: 'Actions', sortable: false, render: (_v, r) => gameActions(r) },
    ],
    fetch: async (p) => getContainer().gameSvc.list({}, p),
    initialOrderBy: 'created_at',
    initialDirection: 'desc',
  });

  tournamentsTableCtl = createDataTable({
    containerId: 'admin-tournaments-table',
    columns: [
      { key: 'name', label: 'Name', sortable: true },
      { key: 'status', label: 'Status', sortable: true },
      { key: 'start_time', label: 'Starts', sortable: true },
      { key: 'end_time', label: 'Ends', sortable: true },
      { key: 'actions', label: 'Actions', sortable: false, render: (_v, r) => tourneyActions(r) },
    ],
    fetch: async (p) => getContainer().tournamentSvc.list({}, p),
    initialOrderBy: 'created_at',
    initialDirection: 'desc',
  });

  await Promise.all([gamesTableCtl.render(), tournamentsTableCtl.render()]);

  return async () => {
    await gamesTableCtl.refresh();
    await tournamentsTableCtl.refresh();
  };
}

// Actions & Modals
function gameActions(row) {
  const wrap = document.createElement('div');
  wrap.className = 'admin-row-actions';
  const del = document.createElement('button');
  del.className = 'btn btn-danger btn-sm';
  del.textContent = 'End & Delete';
  del.onclick = async () => {
    if (await confirmDialog({ title: 'Delete Game?', message: 'This will kick all players.' })) {
      await withError(async () => {
        const c = getContainer();
        await c.gameSvc.delete(row.id, c.authSvc.getCurrentUser());
        await gamesTableCtl.refresh();
      }, 'Game deleted');
    }
  };
  wrap.appendChild(del);
  return wrap;
}

function tourneyActions(row) {
  const wrap = document.createElement('div');
  wrap.className = 'admin-row-actions';
  const del = document.createElement('button');
  del.className = 'btn btn-danger btn-sm';
  del.textContent = 'Delete';
  del.onclick = async () => {
    if (await confirmDialog({ title: 'Delete Tournament?', message: 'Are you sure?' })) {
      await withError(async () => {
        const c = getContainer();
        await c.tournamentSvc.delete(row.id, c.authSvc.getCurrentUser());
        await tournamentsTableCtl.refresh();
      }, 'Tournament deleted');
    }
  };
  wrap.appendChild(del);
  return wrap;
}

async function openGameForm() {
  formModal({
    title: 'Create Game Lobby',
    fieldsHTML: selectField('mode', 'Mode', { 'classic': 'Classic', 'blitz': 'Blitz' }, { value: 'classic' }),
    confirmText: 'Create',
    onSubmit: async (values) => {
      const c = getContainer();
      await c.gameSvc.create({ ...values, preset_id: null }, c.authSvc.getCurrentUser());
      await gamesTableCtl.refresh();
    }
  });
}

async function openTournamentForm() {
  formModal({
    title: 'Create Tournament',
    fieldsHTML: textField('name', 'Tournament Name', { required: true }),
    confirmText: 'Create',
    onSubmit: async (values) => {
      const c = getContainer();
      await c.tournamentSvc.create(values, c.authSvc.getCurrentUser());
      await tournamentsTableCtl.refresh();
    }
  });
}
