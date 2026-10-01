/* Kids Space teacher workspace: seven-step authoring, preview and reporting. */
(function () {
  // Kids routes wrap failures as { error: { code, message, fields } }, so the
  // field-level detail has to be read from the nested envelope too. Previously
  // the generic "Validation failed" won and the actionable reason was discarded.
  // Goes through api-client's shared request, not a bare fetch: access tokens last
  // 15 minutes, and only the shared client answers a 401 by refreshing once and
  // replaying the call. With a raw fetch the teacher just got "Token expired" the
  // moment the token aged out, on whatever request happened to be next.
  const api = async (path, options = {}) => {
    const method = (options.method || 'GET').toUpperCase();
    let body;
    if (options.body !== undefined) { try { body = JSON.parse(options.body); } catch (_) { body = options.body; } }
    if (window.API?.raw) return window.API.raw(method, path, body);
    const r = await fetch((window.APP_CONFIG?.apiUrl || '/api/v1') + path, { method, ...options, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (window.__authToken || localStorage.getItem('quizAuthToken') || ''), ...(options.headers || {}) } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = d.error || {}; const detail = e.fields || e.details || d.fields || d.details; const fields = Object.values(detail || {}).flat().filter(Boolean).map(String); throw new Error([e.message || d.message, fields.join(' · ')].filter(Boolean).join(' — ') || `Kids Space request failed (${r.status})`); }
    return d;
  };
  const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  // Keep legacy validation failures inside the app's non-blocking notification
  // system. This shadows window.alert only in this module.
  function alert(message) {
    const text = String(message || 'Something needs your attention.');
    if (typeof window.showToast === 'function') return window.showToast(text, 'error');
    if (typeof window.showEnhancedToast === 'function') return window.showEnhancedToast(text, 'error');
    console.warn('[Kids Space]', text);
  }
  const state = { wizard: null, models: null, modelError: '', classes: null, facets: null, filters: {}, listTotal: 0, editingLevel: null };
  const themes = ['jungle','space','ocean','farm','castle','dinosaur','forest','city','circus','magic_world','school','superhero'];
  const themeNames = { jungle:'Jungle & Adventure', space:'Space & Galaxies', ocean:'Ocean & Reef', farm:'Farm & Countryside', castle:'Castle of Knights', dinosaur:'Dinosaur World', forest:'Enchanted Forest', city:'City of Discoveries', circus:'The Circus', magic_world:'Magic World', school:'The School', superhero:'Superhero' };
  const categoryNames = { core:'Core mechanics', adventure:'Adventure games', immersive:'Immersive worlds' };
  // Each theme ships a specific background filename; a naive /bg-<id>.png guess
  // 404s on magic_world, whose asset is bg-magic.jpg.
  const themeAsset = { jungle:'/kids/assets/bg-jungle.png', space:'/kids/assets/bg-space.png', ocean:'/kids/assets/bg-ocean.png', farm:'/kids/assets/bg-farm.png', castle:'/kids/assets/bg-castle.png', dinosaur:'/kids/assets/bg-dinosaur.png', forest:'/kids/assets/bg-forest.jpg', city:'/kids/assets/bg-city.png', circus:'/kids/assets/bg-circus.jpg', magic_world:'/kids/assets/bg-magic.jpg', school:'/kids/assets/bg-school.jpg', superhero:'/kids/assets/bg-superhero.jpg' };
  // Fallback used only if /kids/templates is unreachable, so the wizard still works.
  const fallbackTemplates = [['multiple_choice','Multiple Choice'],['word_order','Word / Letter Order'],['drag_drop','Drag & Drop in Text'],['matching','Match the Pairs'],['memory','Memory Game'],['sorting','Sort into Categories'],['sequence','Logic & Timeline'],['find_correct','Find the Right One'],['bubble_pop','Pop the Bubbles'],['treasure_hunt','Treasure Hunt'],['obstacle_run','Obstacle Run'],['puzzle','Mystery Puzzle'],['board_game','Educational Board Game'],['build_construct','Build & Craft'],['whack_tap','Whack-a-Mole'],['animal_rescue','Animal Rescue'],['space_adventure','Space Adventure'],['cooking','Little Chef'],['escape_room','School Escape Room'],['farm_garden','My Garden & Farm']].map(([id, name]) => ({ id, name, category: 'core', min_items: 1 }));
  let templates = null;
  const opts = (xs, value) => xs.map(x => { const pair = Array.isArray(x) ? x : [x, x]; return `<option value="${esc(pair[0])}" ${String(pair[0]) === String(value) ? 'selected' : ''}>${esc(pair[1])}</option>`; }).join('');
  // school_type is NOT part of quizSession (see auth.js buildSession) — it only
  // exists server-side. Read it from the school profile endpoint and cache it.
  const schoolType = { loaded: false, value: null };
  async function primary() { if (schoolType.loaded) return schoolType.value === 'primaire'; const base = window.APP_CONFIG?.apiUrl || '/api/v1'; const token = window.__authToken || localStorage.getItem('quizAuthToken') || ''; try { let r = await fetch(base + '/school/profile/full', { headers: token ? { Authorization: 'Bearer ' + token } : {} }); if (!r.ok) { r = await fetch(base + '/school/profile'); } const p = r.ok ? await r.json() : null; schoolType.value = p?.school_type || null; } catch (_) { schoolType.value = null; } schoolType.loaded = true; return schoolType.value === 'primaire'; }
  // Admins reach every school's content, so they get Kids Space as a sub-tab of
  // Games. Only a primaire teacher gets Kids Space as their whole Games entry;
  // every other teacher keeps the classroom Games tabs untouched.
  function currentRole() { return String(window.currentUser?.role || window.Auth?.getCurrentRole?.() || '').toLowerCase(); }
  function isAdminArea() { const r = currentRole(); return r === 'admin' || r === 'super_admin'; }
  function kidsSubTab() { return document.querySelector('[data-games-studio-tab="kids-studio"]'); }
  function kidsPane() { return document.querySelector('[data-games-studio-pane="kids-studio"]'); }
  function gamesNavLabel() { return document.querySelector('[data-games-nav-label]'); }
  async function applyGameEntryMode() {
    const admin = isAdminArea();
    const isPrimaire = await primary();
    // A primaire teacher gets Kids Space as the whole Games entry; an admin
    // gets it as an extra sub-tab next to the classroom Games and Tournament
    // ones. Anyone else keeps the Games tabs exactly as they were.
    const subTab = kidsSubTab();
    if (subTab) subTab.hidden = !admin;
    if (window.setGamesKidsOnlyMode) window.setGamesKidsOnlyMode(isPrimaire && !admin);
    const pane = kidsPane();
    if (pane && !isPrimaire && !admin) pane.hidden = true;
    const label = gamesNavLabel();
    if (label) label.textContent = admin || !isPrimaire ? 'Games' : 'Kids Space';
    if (admin || isPrimaire) {
      if (isPrimaire && !admin && window.setGamesStudioTab) window.setGamesStudioTab('kids-studio');
      else load();
    }
    return { admin, isPrimaire };
  }
  // games-management owns the sub-tab switcher, so it calls back in here to load
  // the activity list the first time Kids Space is opened.
  function onKidsStudioShown() { load(); }
  async function loadTemplates() { if (templates) return templates; try { const r = await api('/kids/templates'); templates = (r.templates || []).map(t => ({ id: t.id, name: t.name, category: t.category, min_items: t.min_items, description: t.description, requires_images: t.requires_images })); if (!templates.length) templates = fallbackTemplates; } catch (_) { templates = fallbackTemplates; } return templates; }
  // Classes are the existing /classes records, so the assignment the teacher
  // picks here is the same list used by exams and the Students tab. A failure is
  // not fatal: the step falls back to "open to the whole school".
  async function loadClasses() { if (state.classes) return state.classes; try { const r = await api('/classes?limit=100'); state.classes = (r.items || []).map(c => ({ id: c.id, name: c.name, students: c._count?.users ?? c.students_count ?? null })); } catch (_) { state.classes = []; } return state.classes; }
  // ── Filter bar ──────────────────────────────────────────────────────────
  // Every dropdown is filled from what this school actually has, so a sub-topic
  // a teacher typed by hand is selectable instead of being a hardcoded guess.
  const subjectNames = { french: 'French', math: 'Maths', science: 'Science', history: 'History', geography: 'Geography', english: 'English', arts: 'Arts', religion: 'Religion & ethics', sport: 'Sport', technology: 'Technology', life: 'Life skills' };
  const difficultyNames = { very_easy: 'Very easy', easy: 'Easy', medium: 'Medium', hard: 'Hard', adaptive: 'Adaptive' };
  const languageNames = { fr: 'Français', en: 'English', ar: 'العربية' };
  const statusNames = { draft: 'Draft', published: 'Published', archived: 'Archived' };
  const filterKeys = ['search','subject','sub_topic','grade','age_min','age_max','language','theme','difficulty','game_template','status','class_id','creator_id','is_favorite'];
  async function loadFacets() { if (state.facets) return state.facets; try { state.facets = await api('/kids/activities/facets'); } catch (_) { state.facets = null; } return state.facets; }
  // Fallback when the facets call is unavailable: the values are read off the
  // games that were just loaded. Fewer choices than the endpoint offers (it sees
  // every game, not one page) but never an empty dropdown.
  function facetsFromActivities(list) {
    const tally = (key) => { const m = new Map(); for (const a of list) { const v = a[key]; if (v !== null && v !== undefined && v !== '') m.set(v, (m.get(v) || 0) + 1); } return [...m].map(([value, count]) => ({ value, count })); };
    const ages = list.map(a => [a.age_min, a.age_max]).filter(([lo, hi]) => Number.isFinite(lo) && Number.isFinite(hi));
    return {
      subjects: tally('subject'), sub_topics: tally('sub_topic'), grades: tally('grade'),
      languages: tally('language'), themes: tally('theme'), difficulties: tally('difficulty'),
      game_templates: tally('game_template'), statuses: tally('status'),
      creators: [...new Map(list.map(a => [a.creator?.id, a.creator?.name])).entries()]
        .map(([value, name]) => ({ value, name, count: list.filter(a => a.creator?.id === value).length })),
      age: { min: ages.length ? Math.min(...ages.map(x => x[0])) : 3, max: ages.length ? Math.max(...ages.map(x => x[1])) : 15 },
    };
  }
  const facetOpts = (rows, current, labelFn) => {
    const list = (rows || []).filter(r => r && r.value !== null && r.value !== undefined && r.value !== '');
    return `<option value="">${esc(labelFn.all)}</option>` + list.map(r => `<option value="${esc(r.value)}"${String(r.value) === String(current) ? ' selected' : ''}>${esc(labelFn.one(r))}</option>`).join('');
  };
  function filterBar(admin, f, activities) {
    // The server facets cover every game in the school; the derived ones cover
    // only what is on screen, so they are the fallback, never the first choice.
    const fx = state.facets || facetsFromActivities(activities || []);
    const sel = (key, html) => `<select class="form-control" data-filter="${key}" onchange="KidsManagement.applyFilters()">${html}</select>`;
    return `<div class="kids-filters">
      <div class="kids-filter-row">
        <input type="search" class="form-control" data-filter="search" placeholder="Search title, sub-topic, objective…" value="${esc(f.search || '')}" oninput="KidsManagement.filterSearch(this.value)">
        ${sel('subject', facetOpts(fx.subjects, f.subject, { all: 'All subjects', one: r => `${subjectNames[r.value] || r.value} (${r.count})` }))}
        ${sel('sub_topic', facetOpts(fx.sub_topics, f.sub_topic, { all: 'All sub-topics', one: r => r.value }))}
        ${sel('grade', facetOpts(fx.grades, f.grade, { all: 'All grades', one: r => r.value }))}
        ${sel('language', facetOpts(fx.languages, f.language, { all: 'All languages', one: r => `${languageNames[r.value] || r.value} (${r.count})` }))}
      </div>
      <div class="kids-filter-row">
        <span class="kids-filter-age">
          <label>Age</label>
          <input type="number" min="${fx.age?.min ?? 3}" max="${fx.age?.max ?? 15}" class="form-control" data-filter="age_min" placeholder="${fx.age?.min ?? 3}" value="${esc(f.age_min || '')}" onchange="KidsManagement.applyFilters()">
          <span>to</span>
          <input type="number" min="${fx.age?.min ?? 3}" max="${fx.age?.max ?? 15}" class="form-control" data-filter="age_max" placeholder="${fx.age?.max ?? 15}" value="${esc(f.age_max || '')}" onchange="KidsManagement.applyFilters()">
        </span>
        ${sel('theme', facetOpts(fx.themes, f.theme, { all: 'All worlds', one: r => `${themeNames[r.value] || r.value} (${r.count})` }))}
        ${sel('difficulty', facetOpts(fx.difficulties, f.difficulty, { all: 'All difficulties', one: r => `${difficultyNames[r.value] || r.value}` }))}
        ${sel('game_template', facetOpts(fx.game_templates, f.game_template, { all: 'All games', one: r => `${(templates || fallbackTemplates).find(t => t.id === r.value)?.name || r.value} (${r.count})` }))}
      </div>
      <div class="kids-filter-row">
        ${sel('status', facetOpts(fx.statuses, f.status, { all: 'All statuses', one: r => `${statusNames[r.value] || r.value} (${r.count})` }))}
        <select class="form-control" data-filter="class_id" onchange="KidsManagement.applyFilters()">
          <option value="">All audiences</option>
          <option value="unassigned"${f.class_id === 'unassigned' ? ' selected' : ''}>Open to the whole school</option>
          ${(state.classes || []).map(c => `<option value="${esc(c.id)}"${f.class_id === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>
        ${admin ? sel('creator_id', `<option value="">All teachers</option>` + (fx.creators || []).map(c => `<option value="${esc(c.value || '')}"${f.creator_id === (c.value || '') ? ' selected' : ''}>${esc(c.name || 'Unknown teacher')} (${c.count})</option>`).join('')) : ''}
        <label class="kids-filter-check"><input type="checkbox" data-filter="is_favorite"${f.is_favorite ? ' checked' : ''} onchange="KidsManagement.applyFilters()"> Favourites only</label>
        <button type="button" class="btn btn-secondary" onclick="KidsManagement.clearFilters()">Clear filters</button>
        <span class="kids-filter-count" id="kidsFilterCount"></span>
      </div>
    </div>`;
  }
  // The search box fires on every keystroke, so it is debounced: one request per
  // pause instead of one per character.
  let filterTimer = null;
  function filterSearch(value) { clearTimeout(filterTimer); filterTimer = setTimeout(() => { state.filters.search = value; load(); }, 350); }
  function applyFilters() {
    const root = document.getElementById('kidsFilters');
    if (!root) return;
    for (const el of root.querySelectorAll('[data-filter]')) {
      const key = el.getAttribute('data-filter');
      if (el.type === 'checkbox') state.filters[key] = el.checked ? 'true' : '';
      else state.filters[key] = el.value;
    }
    load();
  }
  function clearFilters() { state.filters = {}; load(); }
  function activeFilterCount() { return filterKeys.filter(k => String(state.filters[k] ?? '') !== '').length; }
  async function load() { const root = document.getElementById('kidsDashboard'); if (!root) return; const admin = isAdminArea(); if (!admin && !await primary()) { root.innerHTML='<p class="text-muted">Kids Space is available to primary schools.</p>'; return; } root.innerHTML='<p class="text-muted">Loading activities…</p>'; try { await Promise.all([loadFacets(), loadClasses()]); const qs = new URLSearchParams({ limit: '100' }); for (const k of filterKeys) { const v = state.filters[k]; if (String(v ?? '') !== '') qs.set(k, String(v)); } const r = await api('/kids/activities?' + qs.toString()); const activities = r.items || r.data || r || []; state.listTotal = r.total ?? activities.length; const shown = activeFilterCount(); root.innerHTML=`<div class="kids-activity-grid">${activities.length ? activities.map(a => { const main=a.status==='published'?`KidsManagement.share('${a.id}')`:`KidsManagement.publish('${a.id}')`; const school=a.school; return `<article class="kids-activity-card"><div><span class="kids-status kids-status-${esc(a.status)}">${esc(a.status || 'draft')}</span><h3>${esc(a.title)}</h3><p>${esc(a.subject)} · ${esc(a.grade)} · ${a._count?.levels ?? a.levels?.length ?? 0} levels</p>${admin ? `<p class="kids-card-meta">${esc(a.creator?.name || 'Unknown teacher')}${a.theme ? ' · ' + esc(themeNames[a.theme] || a.theme) : ''}${a.difficulty ? ' · ' + esc(difficultyNames[a.difficulty] || a.difficulty) : ''}${a.language ? ' · ' + esc(languageNames[a.language] || a.language) : ''}${a.sub_topic ? ' · ' + esc(a.sub_topic) : ''}</p>` : ''}${admin && school ? `<p class="kids-card-school"><span class="kids-badge-kids" title="Primary school game">🧒 Kids</span> ${esc(school.name || '')}</p>` : ''}</div><div class="kids-card-actions"><button class="btn btn-sm" onclick="KidsManagement.edit('${a.id}')">Edit</button><button class="btn btn-sm" onclick="KidsManagement.preview('${a.id}')">Preview</button><button class="btn btn-sm btn-primary" onclick="${main}">${a.status === 'published' ? 'Join code' : 'Publish'}</button><button class="btn btn-sm" onclick="KidsManagement.monitor('${a.id}')">Live</button><button class="btn btn-sm" onclick="KidsManagement.results('${a.id}')">Results</button><button class="btn btn-sm" onclick="KidsManagement.toggleFavorite('${a.id}')">${a.is_favorite ? '★' : '☆'}</button><button class="btn btn-sm" onclick="KidsManagement.archive('${a.id}')">Archive</button></div></article>`; }).join('') : (shown ? '<p class="text-muted">No game matches these filters. <button type="button" class="btn btn-sm" onclick="KidsManagement.clearFilters()">Clear them</button></p>' : '<p class="text-muted">No activities yet. Create your first adventure!</p>')}</div>`; // The bar is placed after the grid is written, otherwise re-rendering the grid would wipe a bar that had to live inside it.
 const filterRoot = document.getElementById('kidsFilters') || root; filterRoot.innerHTML = filterBar(admin, state.filters, activities); const countEl = document.getElementById('kidsFilterCount'); if (countEl) countEl.textContent = shown ? `${activities.length} shown (${shown} filter${shown > 1 ? 's' : ''} active)` : `${activities.length} game${activities.length === 1 ? '' : 's'}`; } catch(e) { root.innerHTML=`<p class="text-danger">${esc(e.message)}</p>`; } }
  function templateOptions(current) { const list = templates || fallbackTemplates; const groups = ['core','adventure','immersive']; return groups.map(cat => { const items = list.filter(t => (t.category || 'core') === cat); return items.length ? `<optgroup label="${esc(categoryNames[cat] || cat)}">${items.map(t => `<option value="${esc(t.id)}" ${t.id === current ? 'selected' : ''}>${esc(t.name)} (${t.min_items}+)</option>`).join('')}</optgroup>` : ''; }).join(''); }
  function templateCard(id) { const t = (templates || fallbackTemplates).find(x => x.id === id); if (!t) return ''; return `<div class="kids-template-card"><b>${esc(t.name)}</b><p>${esc(t.description || '')}</p><small>${t.min_items} level${t.min_items > 1 ? 's' : ''} minimum · ${t.requires_images ? 'requires an image' : 'no image needed'}</small></div>`; }
  // Clipboard API needs a secure context; on a plain-http LAN address (the usual
  // classroom setup) navigator.clipboard is undefined, so fall back to prompt().
  async function copyText(text, btn) { try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); } else { throw new Error('no clipboard'); } if (btn) { const label = btn.textContent; btn.textContent = '✓ Copied!'; setTimeout(() => { btn.textContent = label; }, 1600); } } catch (_) { window.prompt('Copy this text:', text); } }
  async function share(id) { try { const a = await api('/kids/activities/' + id); const code = a.join_code || a.data?.join_code; if (!code) return alert('This activity has no game code yet. Publish it first.'); const link = location.origin + '/kids?code=' + encodeURIComponent(code); modal('Game code', `<div class="kids-share"><p class="text-muted">Share this code with your students, or send the direct link:</p><div class="kids-code">${esc(code)}</div><code class="kids-share-link">${esc(link)}</code><ol class="kids-share-steps"><li>The student <b>signs in</b> with their own account.</li><li>They open <b>${esc(link)}</b> (or type the code by hand).</li><li>The game starts and you watch their progress live.</li></ol><div class="kids-card-actions"><button class="btn btn-primary" onclick="KidsManagement.copyLink(this)">Copy code</button><button class="btn" onclick="KidsManagement.copyUrl(this)">Copy student link</button><button class="btn" onclick="KidsManagement.monitor('${a.id}')">Watch live</button><button class="btn" onclick="KidsManagement.preview('${a.id}')">Preview</button></div></div>`); } catch (e) { alert(e.message); } }
  function copyLink(btn) { copyText(document.querySelector('.kids-code')?.textContent?.trim() || '', btn); }
  function copyUrl(btn) { copyText(document.querySelector('.kids-share-link')?.textContent?.trim() || '', btn); }
  // ── Live class monitor ────────────────────────────────────────────────
  // The admin page shares one socket, so every handler is registered through
  // live.on and removed again on close; otherwise reopening the panel stacks
  // duplicate listeners and renders each progress event several times.
  const live = { sock: null, id: null, rows: new Map(), on: new Map(), poll: null, total: 0 };
  function liveStop() { const s = live.sock; if (s) { for (const [ev, fn] of live.on) { try { s.off(ev, fn); } catch (_) {} } try { s.emit('kids:leave', { activityId: live.id }); } catch (_) {} } live.on = new Map(); live.sock = null; live.id = null; live.rows = new Map(); if (live.poll) { clearInterval(live.poll); live.poll = null; } }
  function liveUpsert(p, patch) { if (!p || !p.userId) return; const r = live.rows.get(p.userId) || { userId: p.userId, name: p.name || 'Student', score: 0, level: 0, stars: 0, completed: false, online: true, left: false }; Object.assign(r, patch, { name: p.name || r.name, online: true, left: false }); live.rows.set(p.userId, r); livePaint(); }
  function livePaint() { const body = document.getElementById('kidsLiveBody'); if (!body) return; const rows = [...live.rows.values()].sort((a, b) => (a.completed === b.completed ? b.score - a.score : (a.completed ? 1 : -1))); const done = rows.filter(r => r.completed).length; const sum = document.getElementById('kidsLiveSummary'); if (sum) sum.innerHTML = `<b>${rows.length - done}</b> playing · <b>${done}</b> finished · average <b>${rows.length ? Math.round(rows.reduce((n, r) => n + r.score, 0) / rows.length) : 0}</b> pts`; body.innerHTML = rows.length ? rows.map((r, i) => `<tr class="${r.completed ? 'kids-done' : ''}"><td>${i + 1}</td><td>${esc(r.name)}${r.numero != null ? ` <span class="text-muted">#${esc(r.numero)}</span>` : ''}</td><td>${Math.min((r.level || 0) + 1, live.total || 99)}/${live.total || '?'}</td><td>${r.score || 0} pts</td><td>${r.stars ? '★'.repeat(r.stars) : '—'}</td><td>${r.completed ? '✔ Done' : (r.left ? '⏸ Left' : '▶ Playing')}</td></tr>`).join('') : '<tr><td colspan="6" class="text-muted">No students connected yet. Share the code and refresh.</td></tr>'; }
  async function monitor(id, title) { liveStop(); modal('Live classroom', `<p class="text-muted">${esc(title || '')}</p><div id="kidsLiveSummary" class="kids-analytics"></div><table class="kids-live"><thead><tr><th>#</th><th>Student</th><th>Level</th><th>Score</th><th>Stars</th><th>State</th></tr></thead><tbody id="kidsLiveBody"></tbody></table><p id="kidsLiveStatus" class="text-muted"></p><div class="kids-card-actions"><button class="btn" onclick="KidsManagement.monitor('${id}')">Refresh</button><button class="btn" onclick="KidsManagement.share('${id}')">Game code</button><button class="btn" onclick="KidsManagement.results('${id}')">Results</button></div>`); const status = document.getElementById('kidsLiveStatus'); const paint = async () => { try { const s = await api('/kids/activities/' + id + '/live'); live.total = s.activity?.total_levels || 0; live.rows = new Map((s.sessions || []).map(x => [x.userId, { ...x, online: !x.completed, left: false }])); livePaint(); } catch (e) { if (status) status.textContent = e.message; } }; await paint(); const bind = () => { if (live.sock || !document.getElementById('kidsLiveBody')) return; const s = window.getSocket ? window.getSocket() : null; if (!s || !s.connected) return; live.sock = s; live.on = new Map([['player:joined', p => liveUpsert(p, { score: p.score, level: p.currentLevel })], ['kids:progress', p => liveUpsert(p, { score: p.score, level: p.levelIndex, stars: p.stars, completed: !!p.completed })], ['player:left', p => { const r = live.rows.get(p.userId); if (r) { r.online = false; r.left = true; livePaint(); } }]]); for (const [ev, fn] of live.on) s.on(ev, fn); s.emit('kids:monitor', { activityId: id }, res => { if (status) status.textContent = res && res.success ? 'Live updates on.' : 'Live tracking refused: ' + (res?.error || 'unknown error'); }); if (status) status.textContent = 'Live updates on.'; }; const s0 = window.getSocket ? window.getSocket() : null; if (s0) { if (s0.connected) bind(); else { s0.once('connect', bind); setTimeout(() => { if (!live.sock) { if (status) status.textContent = 'Live updates unavailable — refreshing every 10 s.'; live.poll = setInterval(paint, 10000); } }, 3000); } } else { if (status) status.textContent = 'Live updates unavailable — refreshing every 10 s.'; live.poll = setInterval(paint, 10000); } }
  // ── Step 6: level editor ──────────────────────────────────────────────
  // Works on state.wizard.generated, which holds the same shape the backend
  // returns (id optional while the activity is still unsaved).
  function levelContent(level) { try { return typeof level.content_json === 'string' ? JSON.parse(level.content_json) : (level.content_json || {}); } catch (_) { return {}; } }
  // What a level shows on its review row. The question comes first and always:
  // the mechanic is how it is asked, not what it says, and a row that reads
  // "mechanic: multiple_choice" told a teacher nothing about the words their
  // child would be shown.
  function levelSummary(level) {
    const c = levelContent(level);
    if (c.question) return String(c.question);
    if (c.template) return String(c.template);
    if (c.answer) return String(c.answer);
    if (c.pairs) return `${c.pairs.length} pairs to match`;
    if (c.cards) return `${c.cards.length} cards`;
    if (c.blanks) return `${c.blanks.length} gap(s) to fill`;
    if (c.categories) return `${c.categories.length} categories, ${(c.items || []).length} items to sort`;
    if (c.correctOrder || c.sequence) return `${(c.items || c.sequence || []).length} steps to put in order`;
    if (c.bubbles) return `${c.bubbles.length} bubbles`;
    if (c.items) return `${c.items.length} items`;
    // A level added by hand and not yet written is not a level with no content,
    // it is a level waiting for a question, and it should say so.
    return 'Empty — click Edit to write the question';
  }

  /** A template's name as the teacher knows it, not its stored id. */
  function templateName(id) {
    const t = (templates || fallbackTemplates).find(x => x.id === id);
    return (t && t.name) || id || '';
  }
  // Step 6 is the review the teacher asked for: every level the model wrote is
  // shown in full, and each one can be kept, regenerated on its own, or dropped.
  // Regeneration always sends the kept levels back to the server, so a level the
  // teacher was happy with is never replaced.
  function levelEditor(w, d) {
    const levels = w.generated || [];
    const dropped = w.dropped || new Set();
    const kept = levels.filter((_, i) => !dropped.has(i));
    const tpl = (templates || fallbackTemplates).find(x => x.id === d.game_template);
    // Nothing to review is a normal state, not an error: a teacher who opened
    // the wizard, or whose generation failed, has to be able to start here.
    // Each way in is offered rather than only "go back".
    if (!kept.length) {
      return `<div class="kids-review"><h3>${esc(d.title || 'Untitled')}</h3>
        <p class="text-muted">No levels yet. This game needs ${tpl ? tpl.min_items : 1} level(s) before it can be published.</p>
        <div class="kids-card-actions">
          <button type="button" class="btn btn-primary" onclick="KidsManagement.previous()">✨ Generate levels</button>
          <button type="button" class="btn" onclick="KidsManagement.openBank()">📚 Load from the question bank</button>
          <button type="button" class="btn" onclick="KidsManagement.openLevelImport()">📂 Import a levels file</button>
          <button type="button" class="btn" onclick="KidsManagement.addLevel()">✎ Add a level by hand</button>
        </div></div>`;
    }
    const short = tpl && kept.length < tpl.min_items;
    const rows = levels.map((l, i) => {
      const isDropped = dropped.has(i);
      const open = state.editingLevel === i;
      const mechanic = levelMechanic(l);
      // An adventure shell shows both names: which game it is, and how this level
      // asks its question. One chip alone left the teacher guessing which was
      // which, and "mechanic: multiple_choice" read as a setting to configure
      // rather than as the way a child answers.
      const chips = [`<span class="kids-chip">${esc(templateName(l.level_type))}</span>`];
      if (mechanic && mechanic !== l.level_type) chips.push(`<span class="kids-chip kids-chip-mechanic" title="How the question is asked in this game">${esc(templateName(mechanic) || mechanic)}</span>`);
      chips.push(`<span class="kids-chip">${l.points ?? 10} pts</span>`);
      if (l.question_id) chips.push('<span class="kids-chip kids-chip-linked" title="Linked to the question bank">🔗 bank</span>');
      chips.push(l.id ? '<span class="kids-chip kids-chip-saved">saved</span>' : '<span class="kids-chip kids-chip-new">new</span>');
      if (isDropped) chips.push('<span class="kids-chip kids-chip-dropped">dropped</span>');
      return `<li class="kids-level-row${isDropped ? ' kids-level-dropped' : ''}" data-index="${i}">
      <div class="kids-level-head"><b>Level ${i + 1}</b>${chips.join('')}</div>
      ${reviewWorldText(l) ? `<p class="kids-level-world">${esc(reviewWorldText(l))}</p>` : ''}
      <p class="kids-level-text">${esc(levelSummary(l))}</p>
      ${l.media_url ? `<img class="kids-level-media" src="${esc(l.media_url)}" alt="" onerror="this.src='/kids/assets/puzzle-reveal-template.png'">` : ''}
      ${open && !isDropped && !l.question_id ? `<div class="kids-level-content">${contentFields(i, mechanic)}</div>` : ''}
      ${open && !isDropped && l.question_id ? `<p class="text-muted">This level is a copy of a question in the bank, so its wording is edited in the Questions tab.</p>` : ''}
      <div class="kids-level-fields">
        <label>Points<input type="number" min="1" max="500" class="form-control" value="${l.points ?? 10}" onchange="KidsManagement.editLevel(${i},'points',this.value)"${isDropped ? ' disabled' : ''}></label>
        <label>Hint<input class="form-control" maxlength="300" value="${esc(l.hint || '')}" onchange="KidsManagement.editLevel(${i},'hint',this.value)" placeholder="Optional"${isDropped ? ' disabled' : ''}></label>
        <label>Explanation<input class="form-control" maxlength="500" value="${esc(l.explanation || '')}" onchange="KidsManagement.editLevel(${i},'explanation',this.value)" placeholder="Shown after answering"${isDropped ? ' disabled' : ''}></label>
        <label>Image (URL)<input class="form-control" value="${esc(l.media_url || '')}" onchange="KidsManagement.editLevel(${i},'media_url',this.value)" placeholder="/kids/assets/…"${isDropped ? ' disabled' : ''}></label>
      </div>
      <div class="kids-card-actions">
        <button type="button" class="btn btn-sm" ${i === 0 ? 'disabled' : ''} onclick="KidsManagement.moveLevel(${i},-1)" title="Move up">↑</button>
        <button type="button" class="btn btn-sm" ${i === levels.length - 1 ? 'disabled' : ''} onclick="KidsManagement.moveLevel(${i},1)" title="Move down">↓</button>
        <button type="button" class="btn btn-sm" onclick="KidsManagement.previewLevel(${i})">Preview</button>
        ${l.question_id ? '' : `<button type="button" class="btn btn-sm" onclick="KidsManagement.toggleEdit(${i})">${open ? '✖ Close' : '✎ Edit'}</button>`}
        ${l.question_id ? '' : `<button type="button" class="btn btn-sm" onclick="KidsManagement.regenerateLevel(${i})" title="Ask the model for a new version of this level only">🔁 Regenerate</button>`}
        ${isDropped ? `<button type="button" class="btn btn-sm" onclick="KidsManagement.toggleLevel(${i},false)">↩ Keep it</button>` : `<button type="button" class="btn btn-sm btn-danger" onclick="KidsManagement.toggleLevel(${i},true)" title="Not saved when you publish">✖ Drop</button>`}
      </div>
    </li>`;
    }).join('');
    const droppedCount = dropped.size;
    return `<div class="kids-review"><h3>${esc(d.title || 'Untitled')}</h3><p>${esc(d.subject)} · ${esc(d.grade)} · ${d.age_min}–${d.age_max} yrs · ${esc(themeNames[d.theme] || d.theme)}</p><p>${esc(d.objective || 'No learning objective set')}</p></div>
      <h4>Review the ${kept.length} level(s) the model wrote</h4>
      ${short ? `<p class="text-danger">${esc(tpl.name)} needs at least ${tpl.min_items} levels; you are keeping ${kept.length}. Drop one more level or generate extra before publishing.</p>` : ''}
      ${droppedCount ? `<p class="text-muted">${droppedCount} level(s) marked as dropped will not be saved.</p>` : ''}
      <ol class="kids-levels">${rows}</ol>
      <div class="kids-card-actions">
        <button type="button" class="btn btn-secondary" onclick="KidsManagement.regenerateAll()" ${w.busy ? 'disabled' : ''}>${w.busy ? 'Regenerating…' : '🔁 Regenerate all'}</button>
        <button type="button" class="btn btn-secondary" onclick="KidsManagement.regenerateDropped()" ${droppedCount && !w.busy ? '' : 'disabled'}>🔁 Regenerate the ${droppedCount} dropped</button>
        <button type="button" class="btn" onclick="KidsManagement.openBank()">+ From question bank</button>
        <button type="button" class="btn" onclick="KidsManagement.addLevel()">+ Add empty level</button>
      </div>`;
  }
  // Only points/hint/explanation/media are level-local overrides. content_json is
  // owned by the linked Question row, so editing it here would silently diverge
  // from the bank copy: a linked level must be edited in the Questions tab.
  function editLevel(i, key, value) { const l = (state.wizard.generated || [])[i]; if (!l) return; if (key === 'content_json' && l.question_id) return alert('This level is linked to the question bank. Edit the question in the Questions tab so every activity using it stays in sync.'); const v = (key === 'points') ? (parseInt(value, 10) || 10) : value; l[key] = v; if (key === 'points') { const chip = document.querySelector(`.kids-level-row[data-index="${i}"] .kids-level-head .kids-chip:nth-of-type(2)`); if (chip) chip.textContent = v + ' pts'; } }
  function moveLevel(i, dir) { const arr = state.wizard.generated; const j = i + dir; if (!arr || j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; state.editingLevel = null; render(); }
  // Only one level's content is open at a time: with twenty levels open there is
  // no way to tell which field belongs to which question.
  function toggleEdit(i) { state.editingLevel = state.editingLevel === i ? null : i; render(); }
  // Deleting a level never deletes the Question behind it: other activities may
  // still reference it, so the bank row has to survive this activity.
  async function removeLevel(i) { const arr = state.wizard.generated || []; const l = arr[i]; if (!l) return; if (!confirm(l.question_id ? 'Remove this level from the activity? The question stays in the bank.' : 'Delete this level?')) return; try { if (l.id && state.wizard.id) await api('/kids/levels/' + l.id, { method: 'DELETE' }); } catch (e) { return alert(e.message); } arr.splice(i, 1); render(); }
  /**
   * A blank level, empty on purpose.
   *
   * The old one arrived pre-filled with "Question to customise", "Option A" and
   * "Every correct answer moves you closer!". A teacher who added three levels
   * and moved on shipped those sentences to a child as if they were the
   * teacher's own, and nothing ever said they were placeholders. An empty level
   * is honest, and the editor below is how it gets filled in.
   *
   * Mirrors blankLevelContent() in src/shared/kids-question-bridge.js; the two
   * are compared in tests/unit/kids-content-editor.test.js so they cannot drift.
   */
  function blankContent(mechanic) {
    switch (mechanic) {
      case 'matching':
        return { instruction: '', pairs: [{ id: 'p1', left: '', right: '' }, { id: 'p2', left: '', right: '' }] };
      case 'word_order':
        return { instruction: '', answer: '', items: [{ id: 'n1', value: '' }, { id: 'n2', value: '' }] };
      case 'drag_drop':
        return { instruction: '', template: '{blank}', blanks: [{ position: 0, answer: '' }], choices: [{ id: 'c1', value: '' }, { id: 'c2', value: '' }] };
      case 'memory':
        return { instruction: '', cards: [] };
      case 'sorting':
        return { instruction: '', categories: [], items: [] };
      case 'sequence':
        return { instruction: '', items: [], correctOrder: [] };
      case 'find_correct':
        return { instruction: '', question: '', items: [], correctId: '' };
      case 'bubble_pop':
        return { instruction: '', bubbles: [], target: { value: '' } };
      case 'multiple_choice':
      default:
        return { instruction: '', question: '', options: [{ id: 'opt1', value: '' }, { id: 'opt2', value: '' }], correctId: 'opt1' };
    }
  }

  /** The mechanic a level plays as: its own field, else the game's. */
  function levelMechanic(level) {
    const c = levelContent(level);
    return c.mechanic || c.baseMechanic || level.level_type || 'multiple_choice';
  }

  /**
   * The fields for one level's content, so a level added by hand is as editable
   * as one the model wrote. A mechanic with no simple form gets a JSON box
   * rather than a set of fields that would not cover it: the ids inside it
   * matter, so an editor that dropped them would quietly break the level.
   */
  function contentFields(i, mechanic) {
    const l = (state.wizard.generated || [])[i];
    const c = levelContent(l);
    const set = (path, value) => `onchange="KidsManagement.editContent(${i},'${path}',this.value)"`;
    const area = (label, path, value, rows) => `<label>${label}<textarea class="form-control" rows="${rows || 2}" ${set(path, 'this.value')}>${esc(value || '')}</textarea></label>`;
    const input = (label, path, value, placeholder) => `<label>${label}<input class="form-control" value="${esc(value == null ? '' : value)}" placeholder="${esc(placeholder || '')}" ${set(path, 'this.value')}></label>`;
    const list = (label, arr, key, pathBase) => `<label>${label}<textarea class="form-control" rows="${Math.max(3, (arr || []).length + 1)}" ${set(pathBase, 'this.value')} placeholder="One per line">${esc((arr || []).map(x => (x && x[key] != null ? x[key] : x)).join('\n'))}</textarea></label>`;

    // A narrative shell wraps a mechanic, so which one it is and what the hero
    // does next are part of this level. They come first: the fields below belong
    // to the wrapped mechanic, and a shell's own parts would be left unshown.
    const wrapped = c.mechanic || c.baseMechanic;
    const shell = (wrapped || c.worldText !== undefined)
      ? `<label>Mechanic<select class="form-control" ${set('mechanic', 'this.value')}>${coreMechanics().map(m => `<option value="${m}"${m === wrapped ? ' selected' : ''}>${m}</option>`).join('')}</select></label>${input('Story line', 'worldText', c.worldText, 'What the hero does next')}`
      : '';

    if (mechanic === 'multiple_choice') {
      const options = c.options || [];
      return `${shell}${input('Question', 'question', c.question, 'What is the question?')}
        ${list('Options (one per line)', options, 'value', 'options')}
        <label>Correct answer<select class="form-control" ${set('correctId', 'this.value')}>
          ${options.map(o => `<option value="${esc(o.id)}"${o.id === c.correctId ? ' selected' : ''}>${esc(o.value || '(empty)')}</option>`).join('')}
        </select></label>
        ${input('Instruction', 'instruction', c.instruction, 'Shown above the question')}`;
    }

    if (mechanic === 'matching') {
      const pairs = c.pairs || [];
      return `${shell}${input('Instruction', 'instruction', c.instruction)}
        ${list('Left column (one per line)', pairs, 'left', 'pairs_left')}
        ${list('Right column (one per line, same order)', pairs, 'right', 'pairs_right')}`;
    }

    if (mechanic === 'word_order') {
      return `${shell}${input('Word to rebuild', 'answer', c.answer, 'CHAT')}
        <p class="text-muted">The letters of the word become the pieces to drag, so nothing else to fill in.</p>
        ${input('Instruction', 'instruction', c.instruction)}`;
    }

    if (mechanic === 'drag_drop') {
      const blanks = c.blanks || [];
      return `${shell}${input('Sentence with {blank} for the gap', 'template', c.template, 'Le {blank} brille.')}
        ${input('Word that fills the gap', 'blank', blanks[0] && blanks[0].answer)}
        ${list('Words to drag (one per line)', c.choices, 'value', 'choices')}
        ${input('Instruction', 'instruction', c.instruction)}`;
    }

    return `${shell}${area('Content (JSON)', 'json', JSON.stringify(c, null, 2), 8)}
      <p class="text-muted">This mechanic has no simple form, so it is edited as JSON. Keep the ids: a correctId that matches no item is dropped on save.</p>`;
  }

  function coreMechanics() {
    return Object.keys(MECHANIC_FORMAT);
  }

  /** One field of a level's content, with the ids the mechanic needs kept in step. */
  function editContent(i, path, raw) {
    const l = (state.wizard.generated || [])[i];
    if (!l) return;
    const c = levelContent(l);
    const lines = String(raw == null ? '' : raw).split('\n').map(s => s.trim()).filter(Boolean);
    const value = String(raw == null ? '' : raw);
    const rows = (arr, key, prefix) => lines.map((v, n) => {
      const prev = (arr || [])[n];
      return prev && typeof prev === 'object' ? { ...prev, [key]: v } : { id: `${prefix}${n + 1}`, [key]: v };
    });

    switch (path) {
      case 'question': case 'instruction': case 'template': case 'answer':
        c[path] = value; break;
      case 'blank': {
        const blanks = c.blanks && c.blanks.length ? c.blanks : [{ position: 0, answer: '' }];
        blanks[0] = { ...blanks[0], answer: value };
        c.blanks = blanks;
        break;
      }
      case 'options': {
        // The correct answer was one of the old rows, so its position is kept
        // while the rows are rewritten: retyping an option must not silently
        // move the answer to whichever row happens to share its id.
        const previous = c.options || [];
        const index = Math.max(0, previous.findIndex(o => o.id === c.correctId));
        c.options = rows(previous, 'value', 'opt');
        c.correctId = (c.options[index] || c.options[0] || {}).id || '';
        break;
      }
      case 'pairs_left':
        c.pairs = lines.map((v, n) => ({ ...(c.pairs && c.pairs[n] ? c.pairs[n] : { id: `p${n + 1}` }), left: v }));
        break;
      case 'pairs_right':
        c.pairs = lines.map((v, n) => ({ ...(c.pairs && c.pairs[n] ? c.pairs[n] : { id: `p${n + 1}` }), right: v }));
        break;
      case 'choices':
        c.choices = rows(c.choices, 'value', 'c');
        break;
      case 'correctId':
        c.correctId = value; break;
      case 'mechanic': {
        // Switching mechanic changes the fields, so the old mechanic's content
        // would be left under them and re-save the previous shape. The words
        // that carry over are the ones that are not the mechanic's shape.
        const kept = { worldText: c.worldText, instruction: c.instruction, mechanic: value };
        Object.assign(l, { content_json: { ...blankContent(value), ...Object.fromEntries(Object.entries(kept).filter(([, v]) => v !== undefined)) } });
        return render();
      }
      case 'worldText':
        c.worldText = value; break;
      case 'json': {
        // A JSON box is edited as a whole, so nothing is half-applied when it
        // does not parse: the teacher is told instead of losing their level.
        try {
          Object.assign(l, { content_json: JSON.parse(value) });
        } catch (e) {
          return alert('That is not valid JSON: ' + e.message);
        }
        return render();
      }
      default:
        return;
    }

    // The pieces to drag are the letters of the word, so a new word rebuilds
    // them instead of leaving the level showing the old letters.
    if (path === 'answer' && levelMechanic(l) === 'word_order') {
      c.items = [...value.replace(/\s/g, '')].map((v, n) => ({ id: `n${n + 1}`, value: v }));
    }
    l.content_json = c;
    render();
  }

  function addLevel() {
    const tpl = (templates || fallbackTemplates).find(x => x.id === state.wizard.data.game_template);
    const isNarrative = !!tpl && tpl.category && tpl.category !== 'core';
    const mechanic = tpl && (tpl.category === 'core' || !tpl.category) ? tpl.id : 'multiple_choice';
    const content = blankContent(mechanic);
    if (isNarrative) { content.mechanic = mechanic; content.worldText = ''; }
    state.wizard.generated = [...(state.wizard.generated || []), { level_type: state.wizard.data.game_template, content_json: content, points: 10 }];
    state.editingLevel = (state.wizard.generated || []).length - 1;
    render();
  }

  // Previously this POSTed a copy of the level and previewed the WHOLE activity,
  // so "Preview" on one row silently duplicated content and showed everything.
  // A level that already belongs to the activity is previewed in place; only an
  // unsaved wizard row needs a temporary copy.
  async function previewLevel(i) { const l = (state.wizard.generated || [])[i]; if (!l) return; if (l.id && state.wizard.id) return preview(state.wizard.id); if (!state.wizard.id) return alert('Save the activity first to preview a single level.'); await api('/kids/activities/' + state.wizard.id + '/levels', { method: 'POST', body: JSON.stringify({ level_type: l.level_type, content_json: l.content_json, points: l.points ?? 10, hint: l.hint || null, explanation: l.explanation || null, media_url: l.media_url || null, order_index: i }) }).catch(e => alert(e.message)); preview(state.wizard.id); }
  // ── AI models ────────────────────────────────────────────────────────────
  // The teacher picks which model generates their levels. Keys never leave the
  // server: /kids/ai/models returns labels and model ids only.
  async function loadModels() { if (state.models) return state.models; try { const r = await api('/kids/ai/models'); state.models = r.items || []; } catch (e) { state.models = []; state.modelError = e.message; } return state.models; }
  function modelOptions(selected) { const list = state.models || []; if (!list.length) return `<option value="">${state.modelError ? 'Could not load the model list: ' + esc(state.modelError) : 'School default model (none configured)'}</option>`; return list.map(m => `<option value="${esc(m.id)}"${m.id === selected ? ' selected' : ''}>${esc(m.name)}${m.is_personal ? ' (personal)' : ''} — ${esc(m.provider)} / ${esc(m.model_id)}</option>`).join(''); }

  /**
   * Step 5. The model badge and the rejected-level list are shown here on
   * purpose: a provider quota error used to be swallowed and generic questions
   * were presented as if the model had written them.
   */
  // ── Levels format reference (shown in the AI content step) ────────────────
  // A teacher may write levels with ChatGPT, Claude or Gemini on their own
  // machine instead of using the built-in model. These skeletons are the same
  // shape the server accepts, kept next to the wizard so the format is visible
  // while the levels are being written rather than in a separate document.
  const MECHANIC_FORMAT = {
    multiple_choice: { name: 'Multiple choice', min: 1, skeleton: `{
  "level_type": "multiple_choice",
  "content_json": {
    "instruction": "Choisis la bonne réponse !",
    "question": "Combien font 4 + 3 ?",
    "options": [
      { "id": "opt1", "value": "6", "emoji": "🌱" },
      { "id": "opt2", "value": "7", "emoji": "⭐" },
      { "id": "opt3", "value": "8", "emoji": "🍎" }
    ],
    "correctId": "opt2"
  }
}`, note: '2 to 6 options. correctId must be the id of one of them.' },
    word_order: { name: 'Word order', min: 2, skeleton: `{
  "level_type": "word_order",
  "content_json": {
    "instruction": "Remets les lettres dans le bon ordre.",
    "answer": "CHAT",
    "items": [ { "id": "1", "value": "A" }, { "id": "2", "value": "C" },
               { "id": "3", "value": "T" }, { "id": "4", "value": "H" } ]
  }
}`, note: 'The pieces are the letters of answer, in any order: A, C, T, H is CHAT.' },
    drag_drop: { name: 'Drag and drop', min: 2, skeleton: `{
  "level_type": "drag_drop",
  "content_json": {
    "instruction": "Glisse le bon mot dans le trou.",
    "template": "Le {blank} brille dans le ciel.",
    "blanks": [ { "position": 0, "answer": "soleil" } ],
    "choices": [ { "id": "c1", "value": "soleil" },
                 { "id": "c2", "value": "poisson" } ]
  }
}`, note: 'position is the 0-based index of the {blank} token, counted left to right. One blank per {blank}, and every answer must be in choices.' },
    matching: { name: 'Matching', min: 2, skeleton: `{
  "level_type": "matching",
  "content_json": {
    "instruction": "Relie chaque mot à son contraire !",
    "pairs": [ { "id": "p1", "left": "Grand", "right": "Petit" },
               { "id": "p2", "left": "Chaud", "right": "Froid" } ]
  }
}`, note: '2 to 10 pairs, each id unique.' },
    memory: { name: 'Memory', min: 4, skeleton: `{
  "level_type": "memory",
  "content_json": {
    "instruction": "Retrouve les deux cartes identiques !",
    "cards": [ { "id": "c1", "matchId": "m1", "value": "Chien", "emoji": "🐶", "type": "emoji" },
               { "id": "c2", "matchId": "m2", "value": "Chiot", "emoji": "🐕", "type": "emoji" },
               { "id": "c3", "matchId": "m1", "value": "Chien", "emoji": "🐶", "type": "emoji" },
               { "id": "c4", "matchId": "m2", "value": "Chiot", "emoji": "🐕", "type": "emoji" } ]
  }
}`, note: '4 to 24 cards. Every matchId must appear exactly twice.' },
    sorting: { name: 'Sorting', min: 3, skeleton: `{
  "level_type": "sorting",
  "content_json": {
    "instruction": "Trie les animaux dans leur habitat !",
    "categories": [ { "id": "cat_farm", "label": "La ferme", "emoji": "🚜" },
                    { "id": "cat_sea", "label": "La mer", "emoji": "🌊" } ],
    "items": [ { "id": "i1", "value": "La vache", "emoji": "🐄", "categoryId": "cat_farm" },
               { "id": "i2", "value": "Le poisson", "emoji": "🐟", "categoryId": "cat_sea" },
               { "id": "i3", "value": "Le dauphin", "emoji": "🐬", "categoryId": "cat_sea" } ]
  }
}`, note: '2 to 4 categories, 3 to 30 items. Every categoryId must be a category you defined.' },
    sequence: { name: 'Sequence', min: 2, skeleton: `{
  "level_type": "sequence",
  "content_json": {
    "instruction": "Remets les étapes dans l'ordre !",
    "items": [ { "id": "n1", "value": "Semer" }, { "id": "n2", "value": "Arroser" },
               { "id": "n3", "value": "Récolter" } ],
    "correctOrder": ["n1", "n2", "n3"]
  }
}`, note: 'correctOrder must list every item id exactly once.' },
    find_correct: { name: 'Find the odd one', min: 3, skeleton: `{
  "level_type": "find_correct",
  "content_json": {
    "instruction": "Trouve l'élément qui ne va pas !",
    "question": "Lequel n'est pas un fruit ?",
    "items": [ { "id": "i1", "value": "Pomme", "emoji": "🍎" },
               { "id": "i2", "value": "Poire", "emoji": "🍐" },
               { "id": "i3", "value": "Voiture", "emoji": "🚗" } ],
    "correctId": "i3"
  }
}`, note: '3 to 12 items. correctId must be the id of the item that does not belong.' },
    bubble_pop: { name: 'Bubble pop', min: 3, skeleton: `{
  "level_type": "bubble_pop",
  "content_json": {
    "instruction": "Éclate seulement la bulle demandée !",
    "target": { "value": "étoile", "type": "emoji" },
    "bubbles": [ { "id": "b1", "value": "étoile", "isCorrect": true },
                 { "id": "b2", "value": "cœur", "isCorrect": false },
                 { "id": "b3", "value": "lune", "isCorrect": false } ]
  }
}`, note: '3 to 20 bubbles. Exactly one isCorrect, and it must match target.value.' },
  };
  const NARRATIVE_TEMPLATES = ['treasure_hunt', 'obstacle_run', 'puzzle', 'board_game', 'build_construct', 'whack_tap', 'animal_rescue', 'space_adventure', 'cooking', 'escape_room', 'farm_garden'];

  const LANGUAGE_NAMES = { fr: 'French', en: 'English', ar: 'Arabic' };
  // What each difficulty means in terms a model can actually act on. A bare
  // "easy" produces a spread of levels that is easy for nobody in particular.
  const DIFFICULTY_GUIDE = {
    very_easy: 'one idea per level, single words wherever possible, and only the most obvious distractors',
    easy: 'short sentences and everyday words, with distractors a classmate might really pick',
    medium: 'full sentences, and distractors built from the mistakes children actually make on this topic',
    hard: 'the reasoning is the question itself, so use longer sentences, subtle distractors and no giveaway wording',
    adaptive: 'start very easy and ramp up, so the last levels are clearly harder than the first',
  };

  // The mechanics a level can share with the Questions tab, written exactly the
  // way a question is written there: the keys below and nothing else, no
  // level_type, no content_json, no ids to keep in step. The import bridge turns
  // a level like this into the playable content, so the same prompt now also
  // produces questions that land in the question bank unchanged.
  // A core game plays one mechanic, so only the chosen one is ever sent, and
  // `type` is the value of QUESTION_TYPES in src/shared/constants.js.
  // true-false is not a game of its own, so it rides along as a variant of
  // multiple choice: the game shows the two answers as its two options.
  const COMMON_QUESTION_FORMAT = {
    multiple_choice: {
      name: 'Multiple choice',
      type: 'mcq',
      shape: { text: 'Combien font 4 + 3 ?', options: ['6', '7', '8'], answer: '7' },
      note: '2 to 6 options. answer is copied exactly from one of them.',
      variants: {
        'true-false': {
          text: 'Le chat peut voler.',
          answer: 'false',
          note: 'Leave options out, and answer is "true" or "false". The game shows the two as its two options.',
        },
      },
    },
    matching: {
      name: 'Matching',
      type: 'matching',
      shape: { text: 'Relie chaque animal à son cri', options: [['chat', 'miaou'], ['chien', 'ouah']] },
      note: '2 to 10 pairs, each one a [left, right] pair.',
    },
    drag_drop: {
      name: 'Drag and drop',
      type: 'fill-blank',
      shape: { text: 'Le ___ brille dans le ciel.', answer: 'soleil', options: ['soleil', 'poisson'] },
      note: '___ is the gap, and answer is the word that goes in it.',
    },
    word_order: {
      name: 'Word order',
      type: 'order',
      shape: { text: 'Remets les lettres du mot', answer: 'CHAT' },
      note: 'answer is the finished word, and its letters are the pieces to drag.',
    },
  };

  // Mechanics with no Questions-tab equivalent, so they keep a shape of their
  // own. These are the only ones the prompt has to spell out field by field: a
  // field name invented for them is a level that never imports.
  const GAME_ONLY_IDS = ['memory', 'sorting', 'sequence', 'find_correct', 'bubble_pop'];

  // Everything the wizard knows, as data. The server's own prompt gets the same
  // fields; without them an assistant writes for the wrong age, the wrong
  // language or the wrong topic, and nothing says so. An empty field is marked
  // rather than dropped, so a hole is visible instead of silently guessed at.
  function promptContext(d) {
    const tpl = (templates || fallbackTemplates).find(t => t.id === d.game_template);
    const min = tpl && tpl.min_items > 1 ? tpl.min_items : 0;
    const lang = d.language || 'fr';
    const topic = [d.subject, d.sub_topic].filter(Boolean).join(' - ');
    const ages = (d.age_min || d.age_max) ? `${d.age_min || d.age_max} to ${d.age_max || d.age_min}` : '';
    const classes = (d.class_ids || []).length;
    const themeLabel = d.theme ? (themeNames[d.theme] || d.theme) : '';
    // Below the template's minimum the file would be rejected on import, so the
    // prompt asks for enough to be playable and says why the number moved.
    const wanted = Number(d.count) || 5;
    const count = Math.max(wanted, min);
    const or = '<not set>';
    const context = {
      title: d.title || or,
      about: d.description || or,
      subject: d.subject || or,
      sub_topic: d.sub_topic || or,
      // An objective is what every level has to drill, so it is never left open.
      objective: d.objective || (topic ? `${or}, so drill "${topic}" at ${d.grade || 'primary'} level` : or),
      class_level: d.grade || or,
      ages: ages || or,
      difficulty: d.difficulty || 'easy',
      difficulty_means: DIFFICULTY_GUIDE[d.difficulty] || DIFFICULTY_GUIDE.easy,
      language: lang,
      language_name: LANGUAGE_NAMES[lang] || lang,
      game: d.game_template || or,
      minimum_levels: min || 1,
      world: themeLabel || or,
      levels: count,
      // Only the number of classes: the names and ids of real children are
      // never sent to a third-party assistant. The count is audience, not identity.
      played_by: classes ? `${classes} class${classes > 1 ? 'es' : ''} of this school` : 'every student in the school',
    };
    if (count !== wanted) context.levels_note = `raised from ${wanted}: this game needs at least ${min}`;
    return { context, text: JSON.stringify(context, null, 2) };
  }

  function formatPrompt(d) {
    const isNarrative = NARRATIVE_TEMPLATES.includes(d.game_template);
    const c = promptContext(d).context;
    // The examples are parsed back out of MECHANIC_FORMAT so the prompt stays a
    // single valid JSON object: a teacher can paste it into a checker, and a
    // broken example fails here instead of in the file the teacher imports.
    const example = id => ({
      example: JSON.parse(MECHANIC_FORMAT[id].skeleton),
      note: MECHANIC_FORMAT[id].note,
    });

    // A core game plays one mechanic and nothing else, so it is sent one shape:
    // a teacher who mixed mechanics here would get levels the game never shows.
    // An adventure shell wraps a mechanic per level, so it is sent them all.
    // The copy button also works before a game is picked, so an unknown template
    // falls back to multiple_choice and says so rather than sending nothing.
    const known = isNarrative || !!MECHANIC_FORMAT[d.game_template];
    const mechanic = known ? d.game_template : 'multiple_choice';
    const common = COMMON_QUESTION_FORMAT[mechanic];
    const shape = isNarrative
      ? {
        how: `Every level sets level_type to "${mechanic}" and puts "mechanic", "worldText" and the mechanic's own fields inside content_json. Copy that mechanic's fields exactly, and add no field that is not shown.`,
        mechanics: Object.fromEntries(Object.keys(MECHANIC_FORMAT).map(id => [id, example(id)])),
      }
      : common
        ? {
          how: `Every level of this game is a ${mechanic} level, written as a question exactly like the Questions tab: the keys below and nothing else, with no level_type, no content_json and no ids.`,
          type: common.type,
          ...common.shape,
          note: common.note,
          ...(common.variants ? { other_types: common.variants } : {}),
        }
        : {
          how: `Every level of this game sets level_type to "${mechanic}" and puts the fields below inside content_json. Copy them exactly, and add no field that is not shown.`,
          ...example(mechanic),
        };

    // An unmarked field still has to fall back to the generic wording, so the
    // marker is compared rather than just tested for truthiness.
    const hasAges = c.ages && c.ages !== '<not set>';

    const rules = [
      `Write every single word in ${c.language_name}, including the instructions, the options, the hints and the explanations.`,
      hasAges
        ? `The players are ${c.ages} years old: one idea per level, sentences under 12 words, and no word a child that age does not know.`
        : 'These are primary school children: short sentences and simple words.',
      `The difficulty is "${c.difficulty}", which means: ${c.difficulty_means}.`,
      'Every level must drill the learning objective. Do not drift into general knowledge about the subject.',
      `The ${c.levels} levels must be ${c.levels} different questions on that objective. Never ask the same thing twice in different words.`,
      `Make them get harder in order: level 1 is the easiest, level ${c.levels} is the hardest.`,
      isNarrative
        ? 'Vary the mechanic from level to level, and use multiple_choice when you are not certain of the exact shape.'
        : `Use the ${mechanic} shape shown above for every level, and do not add another mechanic.`,
      c.world === '<not set>'
        ? 'No world was chosen, so keep any wording neutral.'
        : `The world is "${c.world}": use it in the questions and in the emoji when it fits.`,
      'Give every level a short "hint" and one "explanation" of why the answer is right.',
      'points: 10, or 15 for the last and hardest levels.',
      'No HTML, no markdown, no LaTeX inside the text. Emoji are welcome.',
      'Re-read your own output and check every id reference in it.',
    ];

    // These pass a shape check and then break in front of a child, so they are
    // listed once for every mechanic that uses ids.
    const idRules = [
      'correctId must be the id of an option or an item that exists in that same level.',
      'correctOrder must list every item id exactly once.',
      'word_order: the item values are the letters of answer, in any order.',
      'drag_drop: one blank per {blank} token, position starts at 0 counting left to right, and every blank answer appears in choices.',
      'memory: every matchId appears exactly twice, at least 2 pairs.',
      'sorting: every categoryId is a category you defined, and every category has at least one item.',
      'find_correct: correctId is the id of the item that does NOT belong.',
      'bubble_pop: exactly one bubble has "isCorrect": true, and it is the one matching target.value.',
    ];

    return JSON.stringify({
      task: 'Write the levels file for a children\'s educational game. Everything you need is in context.',
      context: c,
      level_shape: shape,
      rules,
      id_rules: idRules,
      answer: {
        return: 'One JSON object and nothing else: no prose, and no markdown fence before or after it.',
        levels: c.levels,
      },
    }, null, 2);
  }


  function formatHelp(d) {
    const mechanic = Object.keys(MECHANIC_FORMAT);
    const isNarrative = NARRATIVE_TEMPLATES.includes(d.game_template);
    const tpl = (templates || fallbackTemplates).find(t => t.id === d.game_template);
    const shells = NARRATIVE_TEMPLATES.map(id => `<code>${id}</code>`).join(' ');
    return `<details class="kids-format-help">
      <summary>📋 Writing levels yourself (ChatGPT, Claude, Gemini)</summary>
      <p class="text-muted">You do not have to use the model above. Write the levels
      on your own machine with any assistant, then bring the JSON in. These are the exact
      shapes the app accepts.</p>
         <div class="kids-card-actions"><button type="button" class="btn btn-primary" onclick="KidsManagement.copyFormatPrompt()">Copy a ready-to-paste prompt</button><button type="button" class="btn" onclick="KidsManagement.openLevelImport()">Import a levels file</button></div>
         <p class="text-muted">The prompt is one JSON object carrying the title, description, subject, sub-topic, learning objective, class level, ages, difficulty, language, game, world and number of levels. Anything left empty is sent as
         <code>&lt;not set&gt;</code> so you can see the gap before you paste it. This is exactly what it sends:</p>
         <details class="kids-format-mechanic"><summary>The context the prompt sends</summary><pre class="kids-format-code">${esc(promptContext(d).text)}</pre></details>
      <h5>Level types</h5>
      <p class="text-muted">Core mechanics, one question each:
      ${mechanic.map(m => `<code>${m}</code>`).join(' ')}</p>
      <p class="text-muted">The first five are written like a question from the
      <b>Questions</b> tab, with no <code>level_type</code> and no
      <code>content_json</code>:</p>
      <pre class="kids-format-code">${esc(JSON.stringify(Object.fromEntries(Object.entries(COMMON_QUESTION_FORMAT).map(([id, f]) => [id, f.shape])), null, 2))}</pre>
      <p class="text-muted">The rest have no question equivalent, so they keep a
      <code>content_json</code> of their own:
      ${GAME_ONLY_IDS.map(m => `<code>${m}</code>`).join(' ')}</p>
      ${isNarrative ? `<p class="text-muted"><b>${esc(d.game_template)}</b> is an adventure shell, so each level sets
      <code>level_type</code> to <code>${esc(d.game_template)}</code> and adds a <code>mechanic</code> field
      inside <code>content_json</code> naming the core mechanic it wraps. The other shells are:
      ${shells}</p>` : ''}
      ${tpl ? `<p class="text-muted">This game needs at least <b>${tpl.min_items} level${tpl.min_items > 1 ? 's' : ''}</b> before it can be published.</p>` : ''}
      <h5>The shapes</h5>
      ${mechanic.map(m => { const f = MECHANIC_FORMAT[m]; return `<details class="kids-format-mechanic"><summary><code>${m}</code> — ${esc(f.name)}</summary><pre class="kids-format-code">${esc(f.skeleton)}</pre><p class="text-muted">${esc(f.note)}</p></details>`; }).join('')}
      <h5>What breaks silently</h5>
      <p class="text-muted">These pass a shape check and then fail in front of a child, so they
      are worth checking by eye: a correctId that matches no option, a drag_drop whose
      blank count does not match its {blank} tokens, a sequence whose correctOrder skips an
      item, a memory matchId used only once, a bubble_pop with two correct bubbles.</p>
      <p class="text-muted">Each level may also carry <code>points</code> (1-500, default 10),
      <code>hint</code>, <code>explanation</code>, and <code>order_index</code>. The full reference,
      including a per-template minimum, is in <code>docs/KIDS_LEVELS_IMPORT.md</code>.</p>
    </details>`;
  }

  function copyFormatPrompt() {
    const w = state.wizard;
    copyText(formatPrompt(w ? w.data : {}), null);
  }

  // ── Importing levels written elsewhere ───────────────────────────────────
  // The pasted file is checked by the server with the same rules the offline
  // validator uses, so the teacher is told every problem at once instead of
  // discovering them one save at a time.
  function openLevelImport() {
    if (!state.wizard) return;
    state.imported = null;
    modal('Import levels', `<div class="kids-import">
      <p class="text-muted">Paste the JSON your assistant produced, or choose the file it
      wrote. Nothing is imported until it has been checked.</p>
      <label class="kids-import-file">File<input type="file" id="kidsImportFile" accept=".json,application/json" onchange="KidsManagement.readImportFile(this)"></label>
      <textarea id="kidsImportText" class="form-control" rows="10" spellcheck="false" placeholder='{ "levels": [ { "level_type": "multiple_choice", "content_json": { ... } } ] }'></textarea>
      <div id="kidsImportReport"></div>
      <div class="kids-card-actions">
        <button type="button" class="btn" onclick="KidsManagement.checkImport()">Check the file</button>
        <button type="button" class="btn btn-primary" id="kidsImportGo" onclick="KidsManagement.applyImport()" disabled>Import levels</button>
        <button type="button" class="btn" onclick="KidsManagement.close()">Cancel</button>
      </div>
    </div>`);
  }

  async function readImportFile(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const text = await file.text();
    const box = document.getElementById('kidsImportText');
    if (box) box.value = text;
    checkImport();
  }

  function importReport(ok, html) {
    const el = document.getElementById('kidsImportReport');
    if (el) el.innerHTML = `<div class="kids-import-report ${ok ? 'is-ok' : 'is-bad'}">${html}</div>`;
    const go = document.getElementById('kidsImportGo');
    if (go) go.disabled = !ok;
  }

  /**
   * The language an imported file is in, taken from the file itself.
   *
   * A level set is often copied from another teacher's class, so the wizard's
   * own language is no guide: the validator and the prompt both have to agree
   * with the words in the file, or a correct French level set is checked against
   * English rules and rejected. Falls back to English when nothing says.
   */
  function importedLanguage(parsed) {
    const rows = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.levels) ? parsed.levels : []);
    const codes = new Set();
    for (const row of rows) {
      for (const code of [row?.language, row?.content_json?.language, row?.content?.language]) {
        if (typeof code === 'string' && /^[a-z]{2}$/i.test(code.trim())) codes.add(code.trim().toLowerCase());
      }
    }
    if (codes.size !== 1) return state.wizard?.data?.language || 'en';
    return [...codes][0];
  }

  async function checkImport() {
    const w = state.wizard;
    if (!w) return;
    state.imported = null;
    const box = document.getElementById('kidsImportText');
    const text = box ? box.value.trim() : '';
    if (!text) return importReport(false, '<b>Nothing to check yet.</b> Paste the JSON or choose a file.');

    let parsed;
    try { parsed = JSON.parse(text.replace(/^﻿/, '')); }
    catch (e) { return importReport(false, `<b>That is not valid JSON.</b><br>${esc(e.message)}`); }

    importReport(false, 'Checking…');
    state.importedLanguage = importedLanguage(parsed);
    try {
      const r = await api('/kids/levels/validate', {
        method: 'POST',
        // The file may be in a different language from the wizard, and the
        // validator checks the instructions it expects in that language.
        body: JSON.stringify({ levels: parsed, game_template: w.data.game_template, language: importedLanguage(parsed) }),
      });
      const levels = r.levels || [];
      state.imported = levels;
      const min = (templates || fallbackTemplates).find(t => t.id === w.data.game_template);
      importReport(true, `<b>${levels.length} level${levels.length === 1 ? '' : 's'} ready to import.</b>${min ? ` This game needs at least ${min.min_items}.` : ''} You can still review, drop or regenerate each one on the next step.`);
    } catch (e) {
      // Newlines are the server's separator between problems; api-client also
      // glues field lists with " · " on the fetch fallback path.
      const detail = esc(e.message).replace(/\r/g, '').replace(/\n/g, '<br>').replace(/ · /g, '<br>');
      importReport(false, `<b>This file cannot be imported.</b><br>${detail}`);
    }
  }

  async function applyImport() {
    const w = state.wizard;
    const levels = state.imported;
    if (!w || !levels || !levels.length) return;
    // Importing rewrites the whole level set, and the save reconciles by id, so
    // levels left out of the wizard are deleted on save. Say so before it happens.
    if (w.id && (w.generated || []).length && !confirm(`This replaces the ${w.generated.length} level(s) currently in this activity. Continue?`)) return;

    w.generated = levels;
    w.dropped = new Set();
    w.data.count = levels.length;
    w.generation = { source: 'import', model: null, rejected: [], generated_count: levels.length, kept_count: 0 };
    state.imported = null;
    close();
    // Straight to the review step: an imported level has never been seen, so it
    // is not saved until the teacher has looked at it.
    w.step = 6;
    render();
  }

  function aiStep(w, d) {
    const g = w.generation;
    const model = g && g.model;
    const badge = model
      ? `<div class="kids-source kids-source-ai">🤖 <b>Generated by ${esc(model.name || 'AI')}</b><small>${esc(model.provider || '')}${model.model_id ? ' / ' + esc(model.model_id) : ''}</small></div>`
      : g && g.source === 'import'
        ? `<div class="kids-source kids-source-import">📋 <b>Imported from a file</b><small>written outside Kids Space, checked before import</small></div>`
        : '';
    // The model is the only source of levels. When it wrote something that is
    // not playable, that is reported here instead of being replaced by a generic
    // question, so the teacher knows exactly what came back.
    const rejected = g && g.rejected && g.rejected.length
      ? `<ul class="kids-warnings">${g.rejected.map(r => `<li>⚠ Level ${r.index ?? '?'} was rejected: ${esc(r.reason || 'not playable')}</li>`).join('')}</ul>`
      : '';
    const preview = w.generated && w.generated.length
      ? `<div class="kids-generated"><h4>Here is what the model wrote (${w.generated.length})</h4>
          <ol class="kids-levels kids-levels-preview">${w.generated.slice(0, 6).map((l, i) => `<li class="kids-level-row"><div class="kids-level-head"><b>Level ${i + 1}</b><span class="kids-chip">${esc(l.level_type || '')}</span><span class="kids-chip">${l.points ?? 10} pts</span></div><p class="kids-level-text">${esc(levelSummary(l))}</p></li>`).join('')}</ol>
          ${w.generated.length > 6 ? `<p class="text-muted">…and ${w.generated.length - 6} more.</p>` : ''}
          <div class="kids-card-actions"><button type="button" class="btn btn-primary" onclick="KidsManagement.next()">Review, keep or regenerate each level →</button></div>
        </div>`
      : '<p class="text-muted">Nothing generated yet.</p>';
    return `<label>Number of levels<input name="count" type="number" min="1" max="30" class="form-control" value="${d.count}"></label>
      <label>AI model<select name="model_id" class="form-control" onchange="KidsManagement.collectModel()">${modelOptions(d.model_id)}</select></label>
      <p class="text-muted">The whole wizard (subject, sub-topic, objective, grade, ages, difficulty, game and level count) is sent to this model as JSON. If the model is unreachable or out of quota, Kids Space says so instead of silently using generic questions.</p>
      <div class="kids-card-actions"><button type="button" class="btn btn-secondary" onclick="KidsManagement.generate()"${w.busy ? ' disabled' : ''}>${w.busy ? 'Generating…' : 'Generate levels'}</button><button type="button" class="btn" onclick="KidsManagement.openBank()">Pick from question bank</button></div>
      ${badge}${rejected}${preview}${formatHelp(d)}`;
  }
  // model_id is a plain select, so it is safe to read straight from the form.
  function collectModel() {
    const sel = document.querySelector('#kidsWizardForm select[name=model_id]');
    if (sel && state.wizard) state.wizard.data.model_id = sel.value;
  }

  // ── Shared question bank picker ──────────────────────────────────────────
  // The pool is the same Question/Category data as the Questions tab. Only the
  // types that convert back into a playable level are offered; the exotic game
  // mechanics stay activity-local because they would not survive the flattening.
  const BANK_TYPE_LABELS = { mcq: 'Multiple choice', 'true-false': 'True / false', 'fill-blank': 'Fill the blank', matching: 'Matching', order: 'Order' };
  function bankRow(q, i) { return `<label class="kids-bank-item"><input type="checkbox" name="bank_${i}" value="${esc(q.id)}"><span class="kids-bank-body"><b>${esc(q.text)}</b><small>${esc(BANK_TYPE_LABELS[q.type] || q.type)}${q.category ? ' · ' + esc(q.category.name) : ''}${q.tags ? ' · ' + esc(String(q.tags).split(',').filter(Boolean).slice(0, 3).join(', ')) : ''}</small></span></label>`; }
  async function openBank() {
    const w = state.wizard;
    if (!w) return;
    // The wizard state stays in memory while the picker is open, so "Back"
    // returns to the step the teacher came from with every answer intact.
    w.bankReturnStep = w.bankReturnStep ?? w.step;
    if (!w.id && !confirm('This activity has not been saved yet, so the questions cannot be linked to it yet. Save the activity first?')) return;
    if (!w.id) {
      try { await save(false, true); } catch (e) { return alert(e.message); }
      if (!state.wizard || !state.wizard.id) return;
    }
    let cats = [], qs = [];
    try { [cats, qs] = await Promise.all([api('/kids/bank/categories'), api('/kids/bank/questions?limit=60')]); } catch (e) { return alert(e.message); }
    const items = qs.items || [];
    modal('Question bank', `<div class="kids-bank"><p class="text-muted">${items.length} question(s) available for this school. Selected questions are added as levels and stay linked to the bank.</p><label>Category<select id="kidsBankCat" class="form-control" onchange="KidsManagement.filterBank(this.value)"><option value="">All categories</option>${(cats.items || []).map(c => `<option value="${esc(c.id)}">${esc(c.name)} (${c._count?.questions ?? 0})</option>`).join('')}</select></label>${items.length ? `<div class="kids-bank-list" id="kidsBankList">${items.map(bankRow).join('')}</div>` : '<p class="text-muted">The bank is empty. Generate an activity first: its levels are saved into the pool automatically.</p>'}<div class="kids-card-actions"><button class="btn btn-primary" onclick="KidsManagement.addFromBank()">Add selected as levels</button><button class="btn" onclick="KidsManagement.backToWizard()">← Back to the activity</button><button class="btn" onclick="KidsManagement.close()">Close</button></div></div>`);
  }
  async function filterBank(categoryId) { try { const qs = await api('/kids/bank/questions?limit=60' + (categoryId ? '&categoryId=' + encodeURIComponent(categoryId) : '')); const list = document.getElementById('kidsBankList'); if (list) { const items = qs.items || []; list.innerHTML = items.length ? items.map(bankRow).join('') : '<p class="text-muted">No questions in this category.</p>'; } } catch (e) { alert(e.message); } }
  async function addFromBank() {
    const w = state.wizard;
    if (!w || !w.id) return;
    const picked = [...document.querySelectorAll('.kids-bank-list input[type=checkbox]:checked')].map(i => i.value);
    if (!picked.length) return alert('Select at least one question.');
    const added = [];
    for (const questionId of picked) {
      try {
        added.push(await api('/kids/bank/questions/' + encodeURIComponent(questionId) + '/attach', { method: 'POST', body: JSON.stringify({ activity_id: w.id }) }));
      } catch (e) {
        alert('Could not add one question: ' + e.message);
      }
    }
    if (!added.length) return;
    // A bank picker is often opened immediately after dropping generated levels.
    // Do not keep those discarded rows in the review count (or append the bank
    // questions after them); they were removed from the activity before attach.
    const kept = (w.generated || []).filter((_, i) => !w.dropped?.has(i));
    w.generated = [...kept, ...added];
    w.dropped = new Set();
    // The wizard is re-rendered, not closed, so the earlier steps survive.
    w.step = 6;
    backToWizard();
  }

  // ── Class results report ─────────────────────────────────────────────────
  // Rendered as tiles + a per-level bar chart + a leaderboard, instead of the
  // raw JSON that used to be dumped into a <pre> block.
  function statTile(label, value, hint, tone) { return `<div class="kids-stat${tone ? ' kids-stat-' + tone : ''}"><span class="kids-stat-label">${esc(label)}</span><span class="kids-stat-value">${esc(value)}</span>${hint ? `<span class="kids-stat-hint">${esc(hint)}</span>` : ''}</div>`; }
  function resultsReport(a, r) {
    const sessions = (r && r.sessions) || [];
    const levels = a.levels || [];
    if (!a.attempted) {
      return `<div class="kids-report"><h3>${esc(a.title || 'Activity')}</h3><div class="kids-report-empty">🕹️<p>No student has played this activity yet.</p><p class="text-muted">Share the game code, then open Live classroom to watch progress in real time. Results appear here after the first session.</p></div></div>`;
    }
    const tiles = [
      statTile('Players', a.attempted, `${a.completed} finished`, 'blue'),
      statTile('Completion', a.completion_rate + '%', `${a.completed}/${a.attempted} sessions`, a.completion_rate >= 60 ? 'green' : 'amber'),
      statTile('Accuracy', a.accuracy_rate + '%', `${a.total_answers ?? 0} answers`, a.accuracy_rate >= 70 ? 'green' : 'amber'),
      statTile('Average score', a.average_score, `best streak ${a.best_streak}`, 'violet'),
      statTile('Average time', formatTime(a.average_time_seconds), 'per session'),
      statTile('Stars earned', a.total_stars ?? 0, 'across all players', 'violet'),
    ].join('');

    const chart = levels.length ? levels.map((l, i) => {
      const rate = l.success_rate;
      const tone = rate === null ? 'none' : rate >= 70 ? 'good' : rate >= 40 ? 'mid' : 'poor';
      const label = rate === null ? 'not played' : rate + '%';
      const slowest = a.hardest_level && a.hardest_level.id === l.id;
      return `<li class="kids-level-bar kids-bar-${tone}"><span class="kids-bar-index">${i + 1}</span><span class="kids-bar-name">${esc(l.level_type)}${slowest ? ' <em title="Lowest success rate in this activity">needs work</em>' : ''}</span><span class="kids-bar-track"><span class="kids-bar-fill" style="width:${rate === null ? 0 : rate}%"></span></span><span class="kids-bar-value">${esc(label)}</span><span class="kids-bar-meta">${l.average_time_ms ? (l.average_time_ms / 1000).toFixed(1) + 's' : '—'}${l.average_attempts ? ' · ' + l.average_attempts + ' tries' : ''}</span></li>`;
    }).join('') : '<p class="text-muted">No levels recorded.</p>';

    const board = sessions.map((s, i) => `<tr class="${s.completed ? 'kids-done' : ''}"><td class="kids-rank">${i + 1}</td><td>${esc((s.user && (s.user.name || s.user.username)) || 'Student')}${(s.user && s.user.numero) ? ` <span class="text-muted">#${esc(s.user.numero)}</span>` : ''}</td><td>${s.stars ? '★'.repeat(Math.min(s.stars, 5)) : '—'}</td><td><b>${s.score ?? 0}</b></td><td>${s.streak ?? 0}</td><td>${s.completed ? '✔ Finished' : 'In progress'}</td><td>${formatTime(s.time_spent)}</td><td>${formatDate(s.completed_at || s.started_at)}</td></tr>`).join('');

    return `<div class="kids-report" id="kidsReport"><div class="kids-report-head"><div><h3>${esc(a.title || 'Activity')}</h3><p class="text-muted">${esc(a.game_template || '')} · ${a.attempted} player(s) · ${a.total_answers ?? 0} answers</p></div><div class="kids-card-actions"><button class="btn btn-sm" onclick="KidsManagement.exportResults()">Download CSV</button><button class="btn btn-sm" onclick="window.print()">Print</button></div></div><div class="kids-stats">${tiles}</div><h4>Success by level</h4><ul class="kids-level-chart">${chart}</ul><h4>Leaderboard</h4><div class="kids-table-scroll"><table class="kids-live"><thead><tr><th>#</th><th>Student</th><th>Stars</th><th>Score</th><th>Streak</th><th>State</th><th>Time</th><th>When</th></tr></thead><tbody>${board}</tbody></table></div></div>`;
  }
  function formatTime(seconds) { const s = Number(seconds) || 0; if (s < 60) return s + 's'; const m = Math.floor(s / 60); return m + 'm ' + (s % 60) + 's'; }
  function formatDate(value) { if (!value) return '—'; const d = new Date(value); return isNaN(d) ? '—' : d.toLocaleDateString(); }
  function exportResults() { const box = document.getElementById('kidsReport'); if (!box) return; const rows = [...box.querySelectorAll('table tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(td => '"' + td.textContent.trim().replace(/"/g, '""') + '"').join(',')).join('\n'); const blob = new Blob(['Student,Stars,Score,Streak,State,Time,When\n' + rows], { type: 'text/csv;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'game-studio-results.csv'; a.click(); URL.revokeObjectURL(a.href); }

  function refreshTemplateCard() { collect(); const box = document.getElementById('kidsTemplateCard'); if (box) box.innerHTML = templateCard(state.wizard.data.game_template); }
  function paintThemePreview() { collect(); const img = document.getElementById('kidsThemeImg'); const span = img?.parentElement?.querySelector('span'); const t = state.wizard.data.theme; if (img) img.src = themeAsset[t] || themeAsset.jungle; if (span) span.textContent = themeNames[t] || t; }
  // levelContent() swallows a JSON parse error and returns {}, so the old
  // "try { levelContent(l) } catch" could never report a failure. Parse strictly
  // here so a malformed level is actually caught before the teacher publishes.
  function levelContentStrict(level) { if (typeof level.content_json !== 'string') return level.content_json || {}; return JSON.parse(level.content_json); }
  // The story line lives inside content_json, not on the level row, so reading
  // level.worldText always found nothing and the line was never shown in review.
  function reviewWorldText(level) { const c = levelContent(level); return c && c.worldText ? String(c.worldText) : ''; }
  // A level is playable if the mechanic's own content is there, whatever it is
  // called. Checking a fixed list of field names let a valid level through as
  // blank (find_correct keeps its picture in "template" and its answers in
  // "choices"), and made preflight complain about a level that worked fine.
  // "answer" is deliberately absent: it points at the content rather than being
  // any, so answer: 0 with nothing to answer is still an empty level.
  function hasPlayableContent(c) { if (!c || typeof c !== 'object') return false; return ['question', 'items', 'cards', 'sequence', 'bubbles', 'leftItems', 'categories', 'pairs', 'options', 'template', 'choices', 'targets'].some(k => { const v = c[k]; if (v === undefined || v === null) return false; if (Array.isArray(v)) return v.length > 0; if (typeof v === 'object') return Object.keys(v).length > 0; if (typeof v === 'string') return v.trim() !== ''; return true; }); }
  function preflight(w, d) {
    const levels = (w.generated || []).filter((_, i) => !w.dropped?.has(i));
    const tpl = (templates || fallbackTemplates).find(x => x.id === d.game_template);
    const checks = [];
    checks.push({ ok: !!String(d.title || '').trim(), label: 'Title filled in' });
    checks.push({ ok: levels.length > 0, label: `${levels.length} level(s) added` });
    if (tpl) checks.push({ ok: levels.length >= tpl.min_items, label: `${esc(tpl.name)} needs at least ${tpl.min_items} levels` });
    const broken = levels.filter(l => { try { levelContentStrict(l); return false; } catch (_) { return true; } });
    checks.push({ ok: !broken.length, label: 'All level content is valid JSON' });
    const answerless = levels.filter(l => { try { const c = levelContentStrict(l); return !hasPlayableContent(c) && !c.worldText && !c.instruction; } catch (_) { return false; } });
    checks.push({ ok: !answerless.length, label: 'Every level has playable content' });
    return checks;
  }
  function publishStep(w, d) {
    const checks = preflight(w, d);
    const failed = checks.filter(c => !c.ok);
    const tpl = (templates || fallbackTemplates).find(x => x.id === d.game_template);
    return `<ul class="kids-preflight">${checks.map(c => `<li class="${c.ok ? 'kids-check-ok' : 'kids-check-bad'}">${c.ok ? '✔' : '✖'} ${c.label}</li>`).join('')}</ul>${failed.length ? `<p class="text-danger">Fix the points above before publishing.</p><button type="button" class="btn" onclick="KidsManagement.previous()">Back to levels</button>` : `<p>${esc(tpl?.name || d.game_template)} · ${esc(themeNames[d.theme] || d.theme)} · ${d.count} levels. A published activity gets a six-character code to share with your students.</p><p class="text-muted">Check it with "Preview" first: you will play exactly like the student.</p>`}`;
  }
  function close() { liveStop(); document.getElementById('kidsModal')?.remove(); state.wizard=null; }
  // Reuses the open modal instead of stacking a new one. The question bank used
  // to append a second #kidsModal, which threw away the wizard's DOM, so the
  // only way back was to restart the activity from step 1.
  function modal(title, body) {
    const existing = document.getElementById('kidsModal');
    if (existing) {
      existing.querySelector('.modal-header h2').innerHTML = title;
      const bodyEl = existing.querySelector('.modal-body');
      bodyEl.innerHTML = body;
      return existing;
    }
    const el = document.createElement('div');
    el.id = 'kidsModal';
    el.className = 'modal';
    el.style.display = 'block';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.innerHTML = `<div class="modal-content kids-modal-content"><div class="modal-header"><h2>${title}</h2><button class="modal-close" onclick="KidsManagement.close()">×</button></div><div class="modal-body">${body}</div></div>`;
    document.body.appendChild(el);
    return el;
  }
  // Leaves a sub-view (question bank, live monitor) and puts the wizard back with
  // every step the teacher had already filled in.
  function backToWizard() {
    const w = state.wizard;
    if (!w) return close();
    liveStop();
    modal(w.id ? 'Edit activity' : 'New Kids Space activity', '<div id="kidsWizard"></div>');
    render();
  }
  function openWizard(a={}) {
  state.wizard={id:a.id,step:1,data:{title:a.title||'',description:a.description||'',subject:a.subject||'french',sub_topic:a.sub_topic||'',grade:a.grade||'CP',age_min:a.age_min||6,age_max:a.age_max||8,objective:a.objective||'',game_template:a.game_template||'multiple_choice',theme:a.theme||'jungle',difficulty:a.difficulty||'easy',language:a.language||'fr',count:a.levels?.length||5,model_id:'',
    // An edit keeps the classes it was already assigned to.
    class_ids:(a.classes||[]).map(c => c.class_id || c.id)},generated:a.levels||null,generation:null,
    // Levels the teacher rejected in the review step are not saved.
    dropped:new Set()};
  modal(a.id?'Edit activity':'New Kids Space activity','<div id="kidsWizard"></div>');
  render();
  loadTemplates().then(() => { if (state.wizard) render(); });
  loadModels().then(() => { if (state.wizard) render(); });
  loadClasses().then(() => { if (state.wizard) render(); });
}
  function collect() {
    const f = document.getElementById('kidsWizardForm');
    if (!f) return;
    // FormData collapses repeated `class_ids` keys, so the checkboxes are read
    // from the DOM instead of through Object.fromEntries.
    const picked = [...f.querySelectorAll('input[name=class_ids]:checked')].map(i => i.value);
    if (f.querySelector('input[name=class_ids]')) state.wizard.data.class_ids = picked;
    Object.assign(state.wizard.data, Object.fromEntries(new FormData(f)));
    if (state.wizard.data.class_ids) state.wizard.data.class_ids = picked;
    ['age_min','age_max','count'].forEach(k=>state.wizard.data[k]=+state.wizard.data[k]);
  }
  // Step 2. The class list is the Audience: an activity assigned to a class is
  // the only one its students see when they sign in. An empty selection means
  // "everyone in the school", which is the pre-existing behaviour.
  function audienceStep(w, d) {
    const classes = state.classes || [];
    const chosen = new Set(d.class_ids || []);
    const body = classes.length
      ? classes.map(c => `<label class="kids-class-pick"><input type="checkbox" name="class_ids" value="${esc(c.id)}"${chosen.has(c.id) ? ' checked' : ''}><span class="kids-class-pick-body"><b>${esc(c.name)}</b><small>${c.students == null ? '' : `${c.students} student${c.students === 1 ? '' : 's'}`}</small></span></label>`).join('')
      : '<p class="text-muted">No classes found yet. Create them in the Students tab, or publish this game to the whole school by leaving this empty.</p>';
    const summary = classes.length
      ? (chosen.size ? `<p class="text-muted">Assigned to <b>${chosen.size}</b> class${chosen.size === 1 ? '' : 'es'}. Those students will see this game when they sign in.</p>`
        : '<p class="text-muted">No class selected: the game is open to every student in the school.</p>')
      : '';
    return `<div class="kids-form-row"><label>Grade<input name="grade" class="form-control" value="${esc(d.grade)}"></label><label>Language<select name="language" class="form-control">${opts(['fr','en','ar'],d.language)}</select></label></div>
      <div class="kids-form-row"><label>Minimum age<input name="age_min" type="number" min="3" max="15" class="form-control" value="${d.age_min}"></label><label>Maximum age<input name="age_max" type="number" min="3" max="15" class="form-control" value="${d.age_max}"></label></div>
      <fieldset class="kids-classes"><legend>Who should take this game?</legend>${body}${summary}</fieldset>`;
  }
  function render() { const w=state.wizard,d=w.data,root=document.getElementById('kidsWizard'), names=['Identity','Audience','Learning','World','AI content','Review','Publish']; let f=''; if(w.step===1)f=`<label>Title<input name="title" required class="form-control" value="${esc(d.title)}"></label><label>Description<textarea name="description" class="form-control">${esc(d.description)}</textarea></label>`; if(w.step===2)f=audienceStep(w,d); if(w.step===3)f=`<label>Subject<input name="subject" required class="form-control" value="${esc(d.subject)}"></label><label>Sub-topic<input name="sub_topic" class="form-control" value="${esc(d.sub_topic)}"></label><label>Learning objective<textarea name="objective" class="form-control">${esc(d.objective)}</textarea></label><label>Difficulty<select name="difficulty" class="form-control">${opts(['very_easy','easy','medium','hard','adaptive'],d.difficulty)}</select></label>`; if(w.step===4)f=`<label>Game<select name="game_template" class="form-control" onchange="KidsManagement.refreshTemplateCard()">${templateOptions(d.game_template)}</select></label><div id="kidsTemplateCard">${templateCard(d.game_template)}</div><label>Theme<select name="theme" class="form-control" onchange="KidsManagement.paintThemePreview()">${opts(themes.map(t=>[t,themeNames[t]||t]),d.theme)}</select></label><div class="kids-theme-preview"><img id="kidsThemeImg" src="${esc(themeAsset[d.theme]||themeAsset.jungle)}" alt=""><span>${esc(themeNames[d.theme]||d.theme)}</span></div>`; if(w.step===5)f=aiStep(w,d); if(w.step===6)f=levelEditor(w,d); if(w.step===7)f=publishStep(w,d); root.innerHTML=`<ol class="kids-wizard-steps">${names.map((n,i)=>`<li class="${i+1===w.step?'active':i+1<w.step?'complete':''}">${i+1}. ${n}</li>`).join('')}</ol><form id="kidsWizardForm" class="kids-wizard">${f}</form><div class="modal-footer"><button class="btn btn-secondary" ${w.step===1?'disabled':''} onclick="KidsManagement.previous()">Back</button><div>${w.step<7?'<button class="btn btn-primary" onclick="KidsManagement.next()">Next</button>':'<button class="btn btn-secondary" onclick="KidsManagement.save(false)">Save draft</button> <button class="btn btn-primary" onclick="KidsManagement.save(true)">Publish</button>'}</div></div>`; }
  function next(){collect();if(state.wizard.step===1&&!state.wizard.data.title.trim())return alert('A title is required.');if(state.wizard.step>=7)return;state.wizard.step++;render();} function previous(){collect();if(state.wizard.step<=1)return;state.wizard.step--;render();}
  // ── Generation with a review loop ─────────────────────────────────────────
  // keepIndices are the positions the teacher is happy with; they are sent back
  // to the server untouched. replaceIndices are the positions that should get a
  // freshly written level, and the results are stitched back into exactly those
  // slots, so regenerating level 2 never disturbs the other four.
  async function generate(keepIndices, replaceIndices) {
    collect();
    const w = state.wizard;
    if (!w) return;
    const d = w.data;
    if (!String(d.sub_topic || '').trim()) d.sub_topic = String(d.objective || d.subject || '').trim();
    if (!d.sub_topic) return alert('Add a sub-topic or a learning objective before generating levels.');
    const keep = Array.isArray(keepIndices) ? keepIndices : [];
    const keepSet = new Set(keep);
    // A slot is either kept or refilled, never both.
    const replaceAt = (Array.isArray(replaceIndices) ? replaceIndices : []).filter(i => !keepSet.has(i));
    const keptLevels = keep.map(i => w.generated[i]).filter(Boolean);
    // `count` is how many slots the activity must end up with, not how many are
    // being refilled: the server works out the shortfall against keep_levels.
    const totalSlots = keep.length + replaceAt.length || Number(d.count) || 5;
    w.busy = true;
    render();
    try {
      const r = await api('/kids/activities/generate', {
        method: 'POST',
        body: JSON.stringify({ ...d, count: totalSlots, keep_levels: keptLevels }),
      });
      const returned = r.levels || [];
      const keptQueue = returned.slice(0, keptLevels.length);
      const fresh = returned.slice(keptLevels.length);
      let merged;
      let dropped = new Set(w.dropped || []);
      if (!keep.length && !replaceAt.length) {
        merged = fresh;
        dropped = new Set();
      } else {
        // Rewrite the slots in place. The index a level sits at is its position
        // in the wizard, so moving entries around here is what used to leave a
        // successfully regenerated level still flagged as dropped.
        const next = (w.generated || []).slice();
        keep.forEach((pos, idx) => { if (keptQueue[idx]) next[pos] = keptQueue[idx]; });
        let f = 0;
        for (const pos of replaceAt) {
          if (f < fresh.length) {
            next[pos] = fresh[f++];
            // It has a level again, so it must not be filtered out on save.
            dropped.delete(pos);
          } else {
            // The model wrote fewer usable levels than slots asked for: the slot
            // stays visible but marked, rather than pulling an unrelated level
            // up into it.
            dropped.add(pos);
          }
        }
        merged = next;
        dropped = new Set([...dropped].filter(i => i >= 0 && i < merged.length));
      }
      w.generated = merged;
      w.dropped = dropped;
      w.generation = {
        source: r.source || 'ai',
        model: r.model || null,
        rejected: r.rejected_levels || [],
        generated_count: r.generated_count ?? fresh.length,
        kept_count: r.kept_count ?? keptLevels.length,
      };
      w.step = 6;
      w.busy = false;
      if (!w.generated.length) {
        render();
        return alert('Generation produced no levels. Check the subject, the sub-topic and your AI model settings.');
      }
      render();
      if (r.rejected_levels?.length) {
        alert(r.rejected_levels.length + ' level(s) the model wrote were invalid and were left out. Review the rest, or regenerate them.');
      }
    } catch (e) {
      w.busy = false;
      // Nothing is replaced on failure: the levels already on screen stay exactly
      // as they were, because there is no built-in pool to fall back to.
      render();
      alert(e.message);
    }
  }
  // Single level: keep every other level, ask the model for one replacement.
  function regenerateLevel(i) {
    const w = state.wizard;
    if (!w) return;
    const all = (w.generated || []).map((_, idx) => idx);
    return generate(all.filter(idx => idx !== i), [i]);
  }
  // Whole set: nothing is kept.
  function regenerateAll() {
    const w = state.wizard;
    if (!w) return;
    if (!confirm('Regenerate every level? The levels you are keeping will be replaced by new ones from the model.')) return;
    const all = (w.generated || []).map((_, idx) => idx);
    return generate([], all);
  }
  // Only the ones the teacher marked as dropped, so the kept levels survive.
  function regenerateDropped() {
    const w = state.wizard;
    if (!w) return;
    const dropped = new Set(w.dropped || []);
    if (!dropped.size) return;
    const all = (w.generated || []).map((_, idx) => idx);
    return generate(all.filter(idx => !dropped.has(idx)), all.filter(idx => dropped.has(idx)));
  }
  // Keep / drop a level without calling the model.
  function toggleLevel(i, drop) {
    const w = state.wizard;
    if (!w) return;
    if (!w.dropped) w.dropped = new Set();
    if (drop) w.dropped.add(i);
    else w.dropped.delete(i);
    render();
  }
  // keepOpen is used by the question-bank picker: it has to persist the activity
  // so the questions can be linked, but the wizard must stay exactly where the
  // teacher left it. The normal Save/Publish path closes the modal as before.
  async function save(publishNow, keepOpen) {
    collect();
    const w = state.wizard;
    if (!w) return null;
    if (publishNow && !(w.generated || []).length) {
      alert('Generate or add at least one level before publishing.');
      return null;
    }
    // Levels the teacher rejected in the review step never reach the server, and
    // any level that was already saved but is now rejected is removed by the
    // id-preserving reconciliation in the activity update.
    const keepLevels = (w.generated || []).filter((_, i) => !w.dropped || !w.dropped.has(i));
    // An empty array is meaningful for an existing activity: it reconciles and
    // removes levels the teacher dropped. Sending undefined kept the old rows in
    // the database, so adding six bank questions could look like 13 levels.
    const p = { ...w.data, levels: (w.id || (w.generated || []).length) ? keepLevels : undefined, class_ids: w.data.class_ids || [] };
    delete p.count;
    delete p.model_id;
    let a = null;
    try {
      a = await api(w.id ? '/kids/activities/' + w.id : '/kids/activities', {
        method: w.id ? 'PUT' : 'POST',
        body: JSON.stringify(p),
      });
      a = a.data || a;
      w.id = a.id;
      // The server may have normalised the level rows; keep the wizard in sync
      // so a later publish does not resurrect a level that was dropped.
      if (Array.isArray(a.levels)) {
        w.generated = a.levels;
        w.dropped = new Set();
      }
    } catch (e) {
      if (keepOpen) throw e;
      alert(e.message);
      return null;
    }
    await load();
    if (publishNow) {
      try {
        const pub = await api('/kids/activities/' + a.id + '/publish', { method: 'POST' });
        a = pub.data || pub;
        close();
        return share(a.id);
      } catch (pe) {
        close();
        alert('The activity was saved, but publishing failed:\n\n' + pe.message);
        return null;
      }
    }
    if (!keepOpen) close();
    return a;
  }
  async function edit(id){try{openWizard(await api('/kids/activities/'+id));}catch(e){alert(e.message);}}
  // The preview is a sub-view, the same as the question bank and the live
  // monitor. It used to be opened with modal(), which REPLACES the modal body's
  // HTML: previewing a level from step 6 threw the wizard out of the page, and
  // the only close button then closed the whole modal and set state.wizard to
  // null, so the teacher lost the activity they were writing. So it renders
  // inside the open modal and closes on its own, leaving the wizard behind.
  function preview(id) {
    const inWizard = !!state.wizard;
    const body = `<div class="kids-preview">
      <div class="kids-preview-bar">
        <p class="text-muted">This is the real player, running your activity from the first level. Playing it here does not change the activity.</p>
        <button type="button" class="btn btn-secondary" onclick="KidsManagement.closePreview()">${inWizard ? '← Back to the editor' : 'Close the game'}</button>
      </div>
      <iframe class="kids-preview-frame" title="Kids Space preview" src="/kids?activityId=${encodeURIComponent(id)}"></iframe>
    </div>`;
    modal('Interactive preview', body);
  }
  // Closing the game closes only the game. With a wizard open that means going
  // back to it, not discarding it.
  function closePreview() { if (state.wizard) backToWizard(); else close(); }
  async function publish(id){try{await api('/kids/activities/'+id+'/publish',{method:'POST'});await load();return share(id);}catch(e){alert(e.message);}}
  async function toggleFavorite(id){try{await api('/kids/activities/'+id+'/favorite',{method:'POST'});await load();}catch(e){alert(e.message);}}
  async function archive(id){if(!confirm('Archive this activity? Students will no longer see it.'))return;try{await api('/kids/activities/'+id+'/archive',{method:'POST'});await load();}catch(e){alert(e.message);}}   async function results(id){try{const [r,a]=await Promise.all([api('/kids/activities/'+id+'/results'),api('/kids/activities/'+id+'/analytics')]);modal('Class results','<div class="kids-modal-wide">'+resultsReport(a,r)+'</div>');}catch(e){alert(e.message);}}
  window.KidsManagement={load,applyFilters,clearFilters,filterSearch,loadFacets,openWizard,next,previous,generate,save,regenerateLevel,regenerateAll,regenerateDropped,toggleLevel,edit,preview,closePreview,publish,results,share,copyLink,copyUrl,monitor,close,backToWizard,toggleFavorite,archive,editLevel,editContent,toggleEdit,moveLevel,removeLevel,addLevel,previewLevel,refreshTemplateCard,paintThemePreview,openBank,addFromBank,filterBank,loadModels,loadClasses,collectModel,copyFormatPrompt,promptContext,openLevelImport,readImportFile,checkImport,applyImport,exportResults,onShown:onKidsStudioShown};
  // Runs once on load. A primaire teacher gets Kids Space as the whole Games
  // entry; an admin gets it as a Games sub-tab; anyone else is untouched.
  document.addEventListener('DOMContentLoaded',()=>{applyGameEntryMode();});
}());
