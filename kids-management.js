/* Kids Space teacher workspace: seven-step authoring, preview and reporting. */
(function () {
  // Kids routes wrap failures as { error: { code, message, fields } }, so the
  // field-level detail has to be read from the nested envelope too. Previously
  // the generic "Validation failed" won and the actionable reason was discarded.
  const api = (path, options = {}) => fetch((window.APP_CONFIG?.apiUrl || '/api/v1') + path, { ...options, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (window.__authToken || localStorage.getItem('quizAuthToken') || ''), ...(options.headers || {}) } }).then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) { const e = d.error || {}; const detail = e.fields || e.details || d.fields || d.details; const fields = Object.values(detail || {}).flat().filter(Boolean).map(String); const message = fields.length ? fields.join(' · ') : ''; throw new Error([e.message || d.message, message].filter(Boolean).join(' — ') || `Kids Space request failed (${r.status})`); } return d; });
  const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const state = { wizard: null, models: null };
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
  function templateOptions(current) { const list = templates || fallbackTemplates; const groups = ['core','adventure','immersive']; return groups.map(cat => { const items = list.filter(t => (t.category || 'core') === cat); return items.length ? `<optgroup label="${esc(categoryNames[cat] || cat)}">${items.map(t => `<option value="${esc(t.id)}" ${t.id === current ? 'selected' : ''}>${esc(t.name)} (${t.min_items}+)</option>`).join('')}</optgroup>` : ''; }).join(''); }
  function templateCard(id) { const t = (templates || fallbackTemplates).find(x => x.id === id); if (!t) return ''; return `<div class="kids-template-card"><b>${esc(t.name)}</b><p>${esc(t.description || '')}</p><small>${t.min_items} level${t.min_items > 1 ? 's' : ''} minimum · ${t.requires_images ? 'requires an image' : 'no image needed'}</small></div>`; }
  async function load() { const root = document.getElementById('kidsDashboard'); if (!root) return; const admin = isAdminArea(); if (!admin && !await primary()) { root.innerHTML='<p class="text-muted">Kids Space is available to primary schools.</p>'; return; } root.innerHTML='<p class="text-muted">Loading activities…</p>'; try { const r = await api('/kids/activities?limit=100'); const activities = r.items || r.data || r || []; root.innerHTML=`<div class="kids-activity-grid">${activities.length ? activities.map(a => { const main=a.status==='published'?`KidsManagement.share('${a.id}')`:`KidsManagement.publish('${a.id}')`; const school=a.school; return `<article class="kids-activity-card"><div><span class="kids-status kids-status-${esc(a.status)}">${esc(a.status || 'draft')}</span><h3>${esc(a.title)}</h3><p>${esc(a.subject)} · ${esc(a.grade)} · ${a._count?.levels ?? a.levels?.length ?? 0} levels</p>${admin && school ? `<p class="kids-card-school"><span class="kids-badge-kids" title="Primary school game">🧒 Kids</span> ${esc(school.name || '')}</p>` : ''}</div><div class="kids-card-actions"><button class="btn btn-sm" onclick="KidsManagement.edit('${a.id}')">Edit</button><button class="btn btn-sm" onclick="KidsManagement.preview('${a.id}')">Preview</button><button class="btn btn-sm btn-primary" onclick="${main}">${a.status === 'published' ? 'Join code' : 'Publish'}</button><button class="btn btn-sm" onclick="KidsManagement.monitor('${a.id}')">Live</button><button class="btn btn-sm" onclick="KidsManagement.results('${a.id}')">Results</button><button class="btn btn-sm" onclick="KidsManagement.toggleFavorite('${a.id}')">${a.is_favorite ? '★' : '☆'}</button><button class="btn btn-sm" onclick="KidsManagement.archive('${a.id}')">Archive</button></div></article>`; }).join('') : '<p class="text-muted">No activities yet. Create your first adventure!</p>'}</div>`; } catch(e) { root.innerHTML=`<p class="text-danger">${esc(e.message)}</p>`; } }
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
  function levelSummary(level) {
    const c = levelContent(level);
    if (c.mechanic || c.baseMechanic) return `mechanic: ${c.mechanic || c.baseMechanic}`;
    if (c.question) return String(c.question);
    if (c.items) return `${c.items.length} item(s)`;
    if (c.blanks) return `${c.blanks.length} gap(s) to fill`;
    if (c.pairs) return `${c.pairs.length} pair(s)`;
    if (c.cards) return `${c.cards.length} card(s)`;
    if (c.sequence) return `${c.sequence.length} item(s) to order`;
    if (c.correctIds) return `${c.correctIds.length} correct answer(s)`;
    if (c.bubbles) return `${c.bubbles.length} bubble(s)`;
    return level.level_type || 'level';
  }
  function levelEditor(w, d) {
    const levels = w.generated || [];
    const tpl = (templates || fallbackTemplates).find(x => x.id === d.game_template);
    if (tpl && levels.length < tpl.min_items) return `<div class="kids-review"><p class="text-danger">This game needs at least ${tpl.min_items} levels. You have ${levels.length}. Go back to "AI content" to generate more.</p></div>`;
    const rows = levels.map((l, i) => `<li class="kids-level-row" data-index="${i}">
      <div class="kids-level-head"><b>Level ${i + 1}</b><span class="kids-chip">${esc(l.level_type || '')}</span><span class="kids-chip">${l.points ?? 10} pts</span>${l.question_id ? `<span class="kids-chip kids-chip-linked" title="Linked to the question bank">🔗 bank</span>` : ''}${l.id ? '<span class="kids-chip kids-chip-saved">saved</span>' : '<span class="kids-chip kids-chip-new">new</span>'}</div>
      <p class="kids-level-text">${esc(levelSummary(l))}</p>
      ${l.media_url ? `<img class="kids-level-media" src="${esc(l.media_url)}" alt="" onerror="this.src='/kids/assets/puzzle-reveal-template.png'">` : ''}
      <div class="kids-level-fields">
        <label>Points<input type="number" min="1" max="500" class="form-control" value="${l.points ?? 10}" onchange="KidsManagement.editLevel(${i},'points',this.value)"></label>
        <label>Hint<input class="form-control" maxlength="300" value="${esc(l.hint || '')}" onchange="KidsManagement.editLevel(${i},'hint',this.value)" placeholder="Optional"></label>
        <label>Explanation<input class="form-control" maxlength="500" value="${esc(l.explanation || '')}" onchange="KidsManagement.editLevel(${i},'explanation',this.value)" placeholder="Shown after answering"></label>
        <label>Image (URL)<input class="form-control" value="${esc(l.media_url || '')}" onchange="KidsManagement.editLevel(${i},'media_url',this.value)" placeholder="/kids/assets/…"></label>
      </div>
      <div class="kids-card-actions">
        <button type="button" class="btn btn-sm" ${i === 0 ? 'disabled' : ''} onclick="KidsManagement.moveLevel(${i},-1)" title="Move up">↑</button>
        <button type="button" class="btn btn-sm" ${i === levels.length - 1 ? 'disabled' : ''} onclick="KidsManagement.moveLevel(${i},1)" title="Move down">↓</button>
        <button type="button" class="btn btn-sm" onclick="KidsManagement.previewLevel(${i})">Preview</button>
        <button type="button" class="btn btn-sm btn-danger" onclick="KidsManagement.removeLevel(${i})">Delete</button>
      </div>
    </li>`).join('');
    return `<div class="kids-review"><h3>${esc(d.title || 'Untitled')}</h3><p>${esc(d.subject)} · ${esc(d.grade)} · ${d.age_min}–${d.age_max} yrs · ${esc(themeNames[d.theme] || d.theme)}</p><p>${esc(d.objective || 'No learning objective set')}</p></div>
      <h4>Levels (${levels.length})</h4>
      ${levels.length ? `<ol class="kids-levels">${rows}</ol>` : '<p class="text-muted">No levels yet: go back to "AI content" and generate some, or add levels from the question bank.</p>'}
      <div class="kids-card-actions"><button type="button" class="btn btn-secondary" onclick="KidsManagement.generate()">Regenerate with AI</button><button type="button" class="btn" onclick="KidsManagement.openBank()">+ From question bank</button><button type="button" class="btn" onclick="KidsManagement.addLevel()">+ Add empty level</button></div>`;
  }
  // Only points/hint/explanation/media are level-local overrides. content_json is
  // owned by the linked Question row, so editing it here would silently diverge
  // from the bank copy: a linked level must be edited in the Questions tab.
  function editLevel(i, key, value) { const l = (state.wizard.generated || [])[i]; if (!l) return; if (key === 'content_json' && l.question_id) return alert('This level is linked to the question bank. Edit the question in the Questions tab so every activity using it stays in sync.'); const v = (key === 'points') ? (parseInt(value, 10) || 10) : value; l[key] = v; if (key === 'points') { const chip = document.querySelector(`.kids-level-row[data-index="${i}"] .kids-level-head .kids-chip:nth-of-type(2)`); if (chip) chip.textContent = v + ' pts'; } }
  function moveLevel(i, dir) { const arr = state.wizard.generated; const j = i + dir; if (!arr || j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; render(); }
  // Deleting a level never deletes the Question behind it: other activities may
  // still reference it, so the bank row has to survive this activity.
  async function removeLevel(i) { const arr = state.wizard.generated || []; const l = arr[i]; if (!l) return; if (!confirm(l.question_id ? 'Remove this level from the activity? The question stays in the bank.' : 'Delete this level?')) return; try { if (l.id && state.wizard.id) await api('/kids/levels/' + l.id, { method: 'DELETE' }); } catch (e) { return alert(e.message); } arr.splice(i, 1); render(); }
  async function addLevel() { const tpl = (templates || fallbackTemplates).find(x => x.id === state.wizard.data.game_template); const mechanic = tpl && (tpl.category === 'core' || !tpl.category) ? tpl.id : 'multiple_choice'; const isNarrative = !!tpl && tpl.category && tpl.category !== 'core'; const content = isNarrative ? { mechanic, instruction: 'Help the hero move forward!', worldText: 'Every correct answer moves you closer!', question: 'Question to customise', options: [{ id: 'opt1', value: 'Option A' }, { id: 'opt2', value: 'Option B' }] } : mechanic === 'multiple_choice' ? { instruction: 'Choose the right answer!', question: 'Question to customise', options: [{ id: 'opt1', value: 'Option A' }, { id: 'opt2', value: 'Option B' }] } : { mechanic, instruction: 'Help the hero move forward!', question: 'Question to customise', options: [{ id: 'opt1', value: 'Option A' }, { id: 'opt2', value: 'Option B' }] }; state.wizard.generated = [...(state.wizard.generated || []), { level_type: state.wizard.data.game_template, content_json: content, points: 10 }]; render(); }
  // Previously this POSTed a copy of the level and previewed the WHOLE activity,
  // so "Preview" on one row silently duplicated content and showed everything.
  // A level that already belongs to the activity is previewed in place; only an
  // unsaved wizard row needs a temporary copy.
  async function previewLevel(i) { const l = (state.wizard.generated || [])[i]; if (!l) return; if (l.id && state.wizard.id) return preview(state.wizard.id); if (!state.wizard.id) return alert('Save the activity first to preview a single level.'); await api('/kids/activities/' + state.wizard.id + '/levels', { method: 'POST', body: JSON.stringify({ level_type: l.level_type, content_json: l.content_json, points: l.points ?? 10, hint: l.hint || null, explanation: l.explanation || null, media_url: l.media_url || null, order_index: i }) }).catch(e => alert(e.message)); preview(state.wizard.id); }
  // ── AI models ────────────────────────────────────────────────────────────
  // The teacher picks which model generates their levels. Keys never leave the
  // server: /kids/ai/models returns labels and model ids only.
  async function loadModels() { if (state.models) return state.models; try { const r = await api('/kids/ai/models'); state.models = r.items || []; } catch (_) { state.models = []; } return state.models; }
  function modelOptions(selected) { const list = state.models || []; if (!list.length) return '<option value="">School default model (none configured)</option>'; return list.map(m => `<option value="${esc(m.id)}"${m.id === selected ? ' selected' : ''}>${esc(m.name)}${m.is_personal ? ' (personal)' : ''} — ${esc(m.provider)} / ${esc(m.model_id)}</option>`).join(''); }

  /**
   * Step 5. The source badge and the warning list are shown here on purpose:
   * a provider quota error used to be swallowed and generic questions were
   * presented as if the model had written them.
   */
  function aiStep(w, d) {
    const g = w.generation;
    const isAi = g && g.source === 'ai';
    const badge = g
      ? `<div class="kids-source ${isAi ? 'kids-source-ai' : 'kids-source-fallback'}">${isAi ? '🤖' : '📚'} <b>${isAi ? 'Generated by ' + esc((g.model && g.model.name) || 'AI') : 'Built-in question pool'}</b>${g.model && g.model.model_id && isAi ? `<small>${esc(g.model.provider)} / ${esc(g.model.model_id)}</small>` : ''}</div>`
      : '';
    const warn = g && g.warnings && g.warnings.length
      ? `<ul class="kids-warnings">${g.warnings.map(t => `<li>⚠ ${esc(t)}</li>`).join('')}</ul>`
      : '';
    const summary = w.generated
      ? `<p class="kids-generation-ok">✓ ${w.generated.length} level(s) ready.</p>`
      : '';
    return `<label>Number of levels<input name="count" type="number" min="1" max="30" class="form-control" value="${d.count}"></label>
      <label>AI model<select name="model_id" class="form-control" onchange="KidsManagement.collect">${modelOptions(d.model_id)}</select></label>
      <p class="text-muted">The whole wizard (subject, sub-topic, objective, grade, ages, difficulty, game and level count) is sent to this model as JSON. If the model is unreachable or out of quota, Kids Space says so instead of silently using generic questions.</p>
      <div class="kids-card-actions"><button type="button" class="btn btn-secondary" onclick="KidsManagement.generate()"${w.busy ? ' disabled' : ''}>${w.busy ? 'Generating…' : 'Generate levels'}</button><button type="button" class="btn" onclick="KidsManagement.openBank()">Pick from question bank</button></div>
      ${badge}${warn}${summary}`;
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
    if (!w.id) return alert('Save the activity first, then pick questions from the bank.');
    let cats = [], qs = [];
    try { [cats, qs] = await Promise.all([api('/kids/bank/categories'), api('/kids/bank/questions?limit=60')]); } catch (e) { return alert(e.message); }
    const items = qs.items || [];
    modal('Question bank', `<div class="kids-bank"><p class="text-muted">${items.length} question(s) available for this school. Selected questions are added as levels and stay linked to the bank.</p><label>Category<select id="kidsBankCat" class="form-control" onchange="KidsManagement.filterBank(this.value)"><option value="">All categories</option>${(cats.items || []).map(c => `<option value="${esc(c.id)}">${esc(c.name)} (${c._count?.questions ?? 0})</option>`).join('')}</select></label>${items.length ? `<div class="kids-bank-list" id="kidsBankList">${items.map(bankRow).join('')}</div>` : '<p class="text-muted">The bank is empty. Generate an activity first: its levels are saved into the pool automatically.</p>'}<div class="kids-card-actions"><button class="btn btn-primary" onclick="KidsManagement.addFromBank()">Add selected as levels</button><button class="btn" onclick="KidsManagement.close()">Close</button></div></div>`);
  }
  async function filterBank(categoryId) { try { const qs = await api('/kids/bank/questions?limit=60' + (categoryId ? '&categoryId=' + encodeURIComponent(categoryId) : '')); const list = document.getElementById('kidsBankList'); if (list) { const items = qs.items || []; list.innerHTML = items.length ? items.map(bankRow).join('') : '<p class="text-muted">No questions in this category.</p>'; } } catch (e) { alert(e.message); } }
  async function addFromBank() { const w = state.wizard; if (!w || !w.id) return; const picked = [...document.querySelectorAll('.kids-bank-list input[type=checkbox]:checked')].map(i => i.value); if (!picked.length) return alert('Select at least one question.'); const added = []; for (const questionId of picked) { try { added.push(await api('/kids/bank/questions/' + encodeURIComponent(questionId) + '/attach', { method: 'POST', body: JSON.stringify({ activity_id: w.id }) })); } catch (e) { alert('Could not add one question: ' + e.message); } } if (!added.length) return; w.generated = [...(w.generated || []), ...added]; close(); render(); }

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
  function preflight(w, d) {
    const levels = w.generated || [];
    const tpl = (templates || fallbackTemplates).find(x => x.id === d.game_template);
    const checks = [];
    checks.push({ ok: !!String(d.title || '').trim(), label: 'Title filled in' });
    checks.push({ ok: levels.length > 0, label: `${levels.length} level(s) added` });
    if (tpl) checks.push({ ok: levels.length >= tpl.min_items, label: `${esc(tpl.name)} needs at least ${tpl.min_items} levels` });
    const broken = levels.filter(l => { try { levelContentStrict(l); return false; } catch (_) { return true; } });
    checks.push({ ok: !broken.length, label: 'All level content is valid JSON' });
    const answerless = levels.filter(l => { try { const c = levelContentStrict(l); return !c.question && !(c.items || c.cards || c.sequence || c.bubbles || c.leftItems || c.categories); } catch (_) { return false; } });
    checks.push({ ok: !answerless.length, label: 'Every level has playable content' });
    return checks;
  }
  function publishStep(w, d) {
    const checks = preflight(w, d);
    const failed = checks.filter(c => !c.ok);
    const tpl = (templates || fallbackTemplates).find(x => x.id === d.game_template);
    return `<ul class="kids-preflight">${checks.map(c => `<li class="${c.ok ? 'kids-check-ok' : 'kids-check-bad'}">${c.ok ? '✔' : '✖'} ${c.label}</li>`).join('')}</ul>${failed.length ? `<p class="text-danger">Fix the points above before publishing.</p><button type="button" class="btn" onclick="KidsManagement.previous()">Back to levels</button>` : `<p>${esc(tpl?.name || d.game_template)} · ${esc(themeNames[d.theme] || d.theme)} · ${d.count} levels. A published activity gets a six-character code to share with your students.</p><p class="text-muted">Check it with "Preview" first: you will play exactly like the student.</p>`}`;
  }
  function close() { liveStop(); document.getElementById('kidsModal')?.remove(); state.wizard=null; }  function modal(title, body) { document.body.insertAdjacentHTML('beforeend',`<div id="kidsModal" class="modal" style="display:block" role="dialog" aria-modal="true"><div class="modal-content kids-modal-content"><div class="modal-header"><h2>${title}</h2><button class="modal-close" onclick="KidsManagement.close()">×</button></div><div class="modal-body">${body}</div></div></div>`); }
  function openWizard(a={}) { state.wizard={id:a.id,step:1,data:{title:a.title||'',description:a.description||'',subject:a.subject||'french',sub_topic:a.sub_topic||'',grade:a.grade||'CP',age_min:a.age_min||6,age_max:a.age_max||8,objective:a.objective||'',game_template:a.game_template||'multiple_choice',theme:a.theme||'jungle',difficulty:a.difficulty||'easy',language:a.language||'fr',count:a.levels?.length||5,model_id:''},generated:a.levels||null,generation:null}; modal(a.id?'Edit activity':'New Kids Space activity','<div id="kidsWizard"></div>'); render(); loadTemplates().then(() => { if (state.wizard) render(); }); loadModels().then(() => { if (state.wizard) render(); }); }
  function collect() { const f=document.getElementById('kidsWizardForm'); if (!f) return; Object.assign(state.wizard.data,Object.fromEntries(new FormData(f))); ['age_min','age_max','count'].forEach(k=>state.wizard.data[k]=+state.wizard.data[k]); }
  function render() { const w=state.wizard,d=w.data,root=document.getElementById('kidsWizard'), names=['Identity','Audience','Learning','World','AI content','Review','Publish']; let f=''; if(w.step===1)f=`<label>Title<input name="title" required class="form-control" value="${esc(d.title)}"></label><label>Description<textarea name="description" class="form-control">${esc(d.description)}</textarea></label>`; if(w.step===2)f=`<div class="kids-form-row"><label>Grade<input name="grade" class="form-control" value="${esc(d.grade)}"></label><label>Language<select name="language" class="form-control">${opts(['fr','en','ar'],d.language)}</select></label></div><div class="kids-form-row"><label>Minimum age<input name="age_min" type="number" min="3" max="15" class="form-control" value="${d.age_min}"></label><label>Maximum age<input name="age_max" type="number" min="3" max="15" class="form-control" value="${d.age_max}"></label></div>`; if(w.step===3)f=`<label>Subject<input name="subject" required class="form-control" value="${esc(d.subject)}"></label><label>Sub-topic<input name="sub_topic" class="form-control" value="${esc(d.sub_topic)}"></label><label>Learning objective<textarea name="objective" class="form-control">${esc(d.objective)}</textarea></label><label>Difficulty<select name="difficulty" class="form-control">${opts(['very_easy','easy','medium','hard','adaptive'],d.difficulty)}</select></label>`; if(w.step===4)f=`<label>Game<select name="game_template" class="form-control" onchange="KidsManagement.refreshTemplateCard()">${templateOptions(d.game_template)}</select></label><div id="kidsTemplateCard">${templateCard(d.game_template)}</div><label>Theme<select name="theme" class="form-control" onchange="KidsManagement.paintThemePreview()">${opts(themes.map(t=>[t,themeNames[t]||t]),d.theme)}</select></label><div class="kids-theme-preview"><img id="kidsThemeImg" src="${esc(themeAsset[d.theme]||themeAsset.jungle)}" alt=""><span>${esc(themeNames[d.theme]||d.theme)}</span></div>`; if(w.step===5)f=aiStep(w,d); if(w.step===6)f=levelEditor(w,d); if(w.step===7)f=publishStep(w,d); root.innerHTML=`<ol class="kids-wizard-steps">${names.map((n,i)=>`<li class="${i+1===w.step?'active':i+1<w.step?'complete':''}">${i+1}. ${n}</li>`).join('')}</ol><form id="kidsWizardForm" class="kids-wizard">${f}</form><div class="modal-footer"><button class="btn btn-secondary" ${w.step===1?'disabled':''} onclick="KidsManagement.previous()">Back</button><div>${w.step<7?'<button class="btn btn-primary" onclick="KidsManagement.next()">Next</button>':'<button class="btn btn-secondary" onclick="KidsManagement.save(false)">Save draft</button> <button class="btn btn-primary" onclick="KidsManagement.save(true)">Publish</button>'}</div></div>`; }
  function next(){collect();if(state.wizard.step===1&&!state.wizard.data.title.trim())return alert('A title is required.');if(state.wizard.step>=7)return;state.wizard.step++;render();} function previous(){collect();if(state.wizard.step<=1)return;state.wizard.step--;render();}
  async function generate(){collect();const d=state.wizard.data;if(!String(d.sub_topic || '').trim())d.sub_topic=String(d.objective || d.subject || '').trim();if(!d.sub_topic)return alert('Add a sub-topic or a learning objective before generating levels.');if(d.model_id)state.wizard.busy=true;render();try{const r=await api('/kids/activities/generate',{method:'POST',body:JSON.stringify(d)});state.wizard.generated=r.levels||[];state.wizard.generation={source:r.source||'ai',warnings:r.warnings||[],model:r.model||null};if(!state.wizard.generated.length){state.wizard.busy=false;return alert("Generation produced no levels. Check the subject, the sub-topic and your AI model settings.");}render();}catch(e){state.wizard.busy=false;render();alert(e.message);}}
  async function save(publishNow){collect();const w=state.wizard;if(!w)return;if(publishNow && !(w.generated || []).length)return alert('Generate or add at least one level before publishing.');const p={...w.data,levels:w.generated||undefined};delete p.count;delete p.model_id;let a=null;try{a=await api(w.id?'/kids/activities/'+w.id:'/kids/activities',{method:w.id?'PUT':'POST',body:JSON.stringify(p)});a=a.data||a;if(publishNow){try{const pub=await api('/kids/activities/'+a.id+'/publish',{method:'POST'});a=pub.data||pub;close();await load();return share(a.id);}catch(pe){close();await load();alert("The activity was saved, but publishing failed:\n\n"+pe.message);}}else{close();await load();}}catch(e){alert(e.message);}}
  async function edit(id){try{openWizard(await api('/kids/activities/'+id));}catch(e){alert(e.message);}} async function preview(id){modal('Interactive preview','<p class="text-muted">The real player opens with your current session.</p><iframe class="kids-preview-frame" title="Kids Space preview" src="/kids?activityId='+encodeURIComponent(id)+'"></iframe>');}   async function publish(id){try{await api('/kids/activities/'+id+'/publish',{method:'POST'});await load();return share(id);}catch(e){alert(e.message);}}
  async function toggleFavorite(id){try{await api('/kids/activities/'+id+'/favorite',{method:'POST'});await load();}catch(e){alert(e.message);}}
  async function archive(id){if(!confirm('Archive this activity? Students will no longer see it.'))return;try{await api('/kids/activities/'+id+'/archive',{method:'POST'});await load();}catch(e){alert(e.message);}}   async function results(id){try{const [r,a]=await Promise.all([api('/kids/activities/'+id+'/results'),api('/kids/activities/'+id+'/analytics')]);modal('Class results','<div class="kids-modal-wide">'+resultsReport(a,r)+'</div>');}catch(e){alert(e.message);}}
  window.KidsManagement={load,openWizard,next,previous,generate,save,edit,preview,publish,results,share,copyLink,copyUrl,monitor,close,toggleFavorite,archive,editLevel,moveLevel,removeLevel,addLevel,previewLevel,refreshTemplateCard,paintThemePreview,openBank,addFromBank,loadModels,exportResults,onShown:onKidsStudioShown};
  // Runs once on load. A primaire teacher gets Kids Space as the whole Games
  // entry; an admin gets it as a Games sub-tab; anyone else is untouched.
  document.addEventListener('DOMContentLoaded',()=>{applyGameEntryMode();});
}());
