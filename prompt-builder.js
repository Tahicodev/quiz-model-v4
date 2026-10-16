// ============================================
// PROMPT BUILDER — hierarchical course → copy-paste prompt for ChatGPT/Claude
// Structure: Category > Sub-category > Sub-sub-category > Axe (topic)
// Each Axe carries: title, count, time/question, difficulty, points, type mix.
// Generates a strict prompt whose JSON answer imports directly
// (categories auto-created + questions filed in leaf categories).
// ============================================

(function () {
  'use strict';

  const STORAGE_KEY = 'quizPromptBuilderV1';
  const QUESTION_TYPES = [
    { id: 'multiple-choice', label: 'QCM (1 réponse)' },
    { id: 'multiple-choice-multi', label: 'QCM (plusieurs)' },
    { id: 'true-false', label: 'Vrai / Faux' },
    { id: 'fill-blank', label: 'Texte à trous' },
    { id: 'odd-one-out', label: 'Intrus' },
    { id: 'draggable', label: 'Ordre / Drag&Drop' },
    { id: 'matching-pairs', label: 'Appariement' },
  ];

  function uid(prefix) {
    return (
      (prefix || 'id') +
      '_' +
      Date.now().toString(36) +
      '_' +
      Math.random().toString(36).slice(2, 8)
    );
  }

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function defaultAxe(title) {
    const types = {};
    QUESTION_TYPES.forEach((t) => { types[t.id] = 0; });
    types['multiple-choice'] = 3;
    types['true-false'] = 1;
    return {
      id: uid('axe'),
      title: title || '',
      count: 4,
      timeSeconds: 30,
      difficulty: 'medium',
      points: 1,
      types,
    };
  }

  function defaultState() {
    return {
      language: 'fr',
      extraInstruction: '',
      categories: [],
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.categories)) return parsed;
      }
    } catch (_) {}
    return defaultState();
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {}
  }

  let state = loadState();
  if (!state.language) state.language = 'fr';

  // ---------- lookups ----------
  function getCategory(id) { return state.categories.find((c) => c.id === id); }
  function getSub(catId, subId) {
    const c = getCategory(catId);
    return c ? (c.subs || []).find((s) => s.id === subId) : null;
  }
  function getSubSub(catId, subId, ssId) {
    const s = getSub(catId, subId);
    return s ? (s.subsubs || []).find((x) => x.id === ssId) : null;
  }

  // ---------- mutations (global, called from inline onclick) ----------
  window.addCategoryNode = function () {
    state.categories.push({ id: uid('cat'), name: '', subs: [] });
    saveState();
    window.renderPromptBuilderTree();
  };

  window.addSubcategoryNode = function (catId) {
    const c = getCategory(catId);
    if (!c) return;
    c.subs = c.subs || [];
    c.subs.push({ id: uid('sub'), name: '', subsubs: [], axes: [] });
    saveState();
    window.renderPromptBuilderTree();
  };

  window.addSubSubcategoryNode = function (catId, subId) {
    const s = getSub(catId, subId);
    if (!s) return;
    s.subsubs = s.subsubs || [];
    s.subsubs.push({ id: uid('ss'), name: '', axes: [] });
    saveState();
    window.renderPromptBuilderTree();
  };

  window.addAxeNode = function (catId, subId, ssId) {
    const axe = defaultAxe('');
    if (ssId) {
      const ss = getSubSub(catId, subId, ssId);
      if (!ss) return;
      ss.axes = ss.axes || [];
      ss.axes.push(axe);
    } else {
      const s = getSub(catId, subId);
      if (!s) return;
      s.axes = s.axes || [];
      s.axes.push(axe);
    }
    saveState();
    window.renderPromptBuilderTree();
  };

  window.deleteCategoryNode = function (catId) {
    state.categories = state.categories.filter((c) => c.id !== catId);
    saveState();
    window.renderPromptBuilderTree();
  };
  window.deleteSubcategoryNode = function (catId, subId) {
    const c = getCategory(catId);
    if (c) c.subs = (c.subs || []).filter((s) => s.id !== subId);
    saveState();
    window.renderPromptBuilderTree();
  };
  window.deleteSubSubcategoryNode = function (catId, subId, ssId) {
    const s = getSub(catId, subId);
    if (s) s.subsubs = (s.subsubs || []).filter((x) => x.id !== ssId);
    saveState();
    window.renderPromptBuilderTree();
  };
  window.deleteAxeNode = function (catId, subId, ssId, axeId) {
    const removeFrom = (list) => (list || []).filter((a) => a.id !== axeId);
    if (ssId) {
      const ss = getSubSub(catId, subId, ssId);
      if (ss) ss.axes = removeFrom(ss.axes);
    } else {
      const s = getSub(catId, subId);
      if (s) s.axes = removeFrom(s.axes);
    }
    saveState();
    window.renderPromptBuilderTree();
  };

  window.clearPromptBuilder = function () {
    if (!confirm('Effacer toute la structure du Prompt Builder ?')) return;
    state.categories = [];
    saveState();
    window.renderPromptBuilderTree();
    window.updatePromptBuilderStats();
  };

  window.loadPromptBuilderTemplate = function () {
    state.language = 'fr';
    state.extraInstruction =
      'Questions en français académique (cours d’informatique — niveau collège/lycée). Une seule bonne réponse sauf QCM-multiple.';
    const mkAxe = (title, count, mc, tf, fb, diff, time) => ({
      id: uid('axe'),
      title,
      count,
      timeSeconds: time || 30,
      difficulty: diff || 'medium',
      points: 1,
      types: {
        'multiple-choice': mc || 0,
        'multiple-choice-multi': 0,
        'true-false': tf || 0,
        'fill-blank': fb || 0,
        'odd-one-out': 0,
        draggable: 0,
        'matching-pairs': 0,
      },
    });
    state.categories = [
      {
        id: uid('cat'),
        name: 'Module 1 : Généralités sur les systèmes informatiques',
        subs: [
          {
            id: uid('sub'),
            name: 'Vocabulaire de base',
            subsubs: [],
            axes: [
              mkAxe('Informatique', 4, 2, 1, 1, 'easy', 30),
              mkAxe('Système informatique', 4, 2, 1, 1, 'medium', 30),
              mkAxe('Traitement de l’information', 3, 2, 1, 0, 'medium', 30),
              mkAxe('L’information en informatique', 3, 2, 1, 0, 'medium', 30),
            ],
          },
          {
            id: uid('sub'),
            name: 'Représentation de l’information et systèmes de numération',
            subsubs: [
              {
                id: uid('ss'),
                name: 'Systèmes de numération',
                axes: [
                  mkAxe('Le système binaire', 4, 2, 1, 1, 'medium', 45),
                  mkAxe('Le système octal', 3, 2, 1, 0, 'medium', 45),
                  mkAxe('Le système décimal', 3, 2, 1, 0, 'easy', 30),
                  mkAxe('Le système hexadécimal', 4, 2, 1, 1, 'hard', 60),
                ],
              },
              {
                id: uid('ss'),
                name: 'Codage',
                axes: [
                  mkAxe('Codage du texte (ASCII, ASCII étendu, Unicode, UTF-8…)', 4, 2, 1, 1, 'medium', 45),
                  mkAxe('Codage de l’image (bitmap, JPEG, définition en pixels, profondeur en bits, calcul de la taille)', 5, 3, 1, 1, 'hard', 60),
                  mkAxe('Codage du son (échantillonnage)', 3, 2, 1, 0, 'medium', 45),
                ],
              },
            ],
            axes: [],
          },
        ],
      },
    ];
    saveState();
    window.renderPromptBuilderTree();
    window.updatePromptBuilderStats();
    const langSync = document.getElementById('pbLanguage');
    if (langSync) langSync.value = state.language || 'fr';
    const extraSync = document.getElementById('pbExtra');
    if (extraSync) extraSync.value = state.extraInstruction || '';
    if (typeof showToast === 'function') showToast('Modèle Module 1 chargé — adaptez les nombres puis Générer.', 'success');
  };

  // ---------- input sync (no full re-render on keystroke) ----------
  window.pbSync = function (el) {
    const kind = el.getAttribute('data-pb-kind');
    const catId = el.getAttribute('data-cat');
    const subId = el.getAttribute('data-sub');
    const ssId = el.getAttribute('data-ss');
    const axeId = el.getAttribute('data-axe');
    const field = el.getAttribute('data-field');
    const tId = el.getAttribute('data-type');
    const val = el.type === 'number' ? Number(el.value) : el.value;

    if (kind === 'global') {
      if (field === 'language' || field === 'extraInstruction') state[field] = val;
      saveState();
      window.updatePromptBuilderStats();
      return;
    }
    if (kind === 'cat') {
      const c = getCategory(catId);
      if (c && field === 'name') c.name = val;
    } else if (kind === 'sub') {
      const s = getSub(catId, subId);
      if (s && field === 'name') s.name = val;
    } else if (kind === 'ss') {
      const ss = getSubSub(catId, subId, ssId);
      if (ss && field === 'name') ss.name = val;
    } else if (kind === 'axe') {
      const axe = findAxe(catId, subId, ssId, axeId);
      if (!axe) return;
      if (field === 'title') axe.title = val;
      else if (field === 'count') axe.count = Math.max(1, Math.min(50, Number(val) || 1));
      else if (field === 'timeSeconds') axe.timeSeconds = Math.max(0, Math.min(3600, Number(val) || 0));
      else if (field === 'difficulty') axe.difficulty = val;
      else if (field === 'points') axe.points = Math.max(1, Math.min(100, Number(val) || 1));
      else if (field === 'typeCount' && tId) axe.types[tId] = Math.max(0, Math.min(50, Number(val) || 0));
    }
    saveState();
    window.updatePromptBuilderStats();
  };

  function findAxe(catId, subId, ssId, axeId) {
    let list = [];
    if (ssId) {
      const ss = getSubSub(catId, subId, ssId);
      list = (ss && ss.axes) || [];
    } else {
      const s = getSub(catId, subId);
      list = (s && s.axes) || [];
    }
    return list.find((a) => a.id === axeId);
  }

  // ---------- stats ----------
  function collectAxes() {
    const out = [];
    (state.categories || []).forEach((c) => {
      (c.subs || []).forEach((s) => {
        (s.axes || []).forEach((a) => out.push({ cat: c.name, sub: s.name, ss: '', axe: a }));
        (s.subsubs || []).forEach((ss) => {
          (ss.axes || []).forEach((a) => out.push({ cat: c.name, sub: s.name, ss: ss.name, axe: a }));
        });
      });
    });
    return out;
  }

  window.updatePromptBuilderStats = function () {
    const axes = collectAxes();
    const total = axes.reduce((n, e) => n + (Number(e.axe.count) || 0), 0);
    const el = document.getElementById('promptBuilderStats');
    if (el) {
      el.textContent =
        state.categories.length === 0
          ? 'Aucune structure — ajoutez une catégorie.'
          : `${state.categories.length} catégorie(s) • ${axes.length} axe(s) • ${total} question(s) au total`;
    }
  };

  // ---------- render ----------
  function axeCard(catId, subId, ssId, axe, pathLabel) {
    const typeInputs = QUESTION_TYPES.map((t) => {
      const v = Number((axe.types || {})[t.id]) || 0;
      return `<label style="display:flex;align-items:center;gap:4px;font-size:0.75rem;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:3px 6px;" title="${esc(t.id)}">
        <span style="white-space:nowrap;">${esc(t.label)}</span>
        <input type="number" min="0" max="50" value="${v}" style="width:48px;padding:2px 4px;border:1px solid #cbd5e1;border-radius:4px;"
          data-pb-kind="axe" data-cat="${catId}" data-sub="${subId || ''}" data-ss="${ssId || ''}" data-axe="${axe.id}" data-field="typeCount" data-type="${t.id}" oninput="pbSync(this)" />
      </label>`;
    }).join('');

    const typeSum = QUESTION_TYPES.reduce((n, t) => n + (Number((axe.types || {})[t.id]) || 0), 0);
    const warn = typeSum !== Number(axe.count)
      ? `<span style="color:#b45309;font-size:0.75rem;">⚠ types (${typeSum}) ≠ nombre (${axe.count}) — le modèle suivra les types si &gt; 0, sinon il répartit.</span>`
      : `<span style="color:#059669;font-size:0.75rem;">✓ ${typeSum} / ${axe.count}</span>`;

    return `<div style="border:1px solid #e2e8f0;border-left:4px solid #8b5cf6;border-radius:8px;padding:10px;background:#fff;margin-top:8px;">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <span style="font-size:0.75rem;font-weight:700;color:#7c3aed;">🎯 AXE</span>
        <span style="font-size:0.72rem;color:#64748b;">${esc(pathLabel)}</span>
        <div style="flex:1;"></div>
        <button type="button" class="btn btn-sm btn-secondary" onclick="deleteAxeNode('${catId}','${subId || ''}','${ssId || ''}','${axe.id}')">✕</button>
      </div>
      <div style="display:grid;grid-template-columns:2fr 70px 80px 110px 70px;gap:6px;margin-top:8px;">
        <input type="text" placeholder="Titre de l'axe — ex : Le système binaire" value="${esc(axe.title)}" style="padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;"
          data-pb-kind="axe" data-cat="${catId}" data-sub="${subId || ''}" data-ss="${ssId || ''}" data-axe="${axe.id}" data-field="title" oninput="pbSync(this)" />
        <input type="number" min="1" max="50" value="${Number(axe.count) || 1}" title="Nombre de questions" style="padding:6px;border:1px solid #cbd5e1;border-radius:6px;"
          data-pb-kind="axe" data-cat="${catId}" data-sub="${subId || ''}" data-ss="${ssId || ''}" data-axe="${axe.id}" data-field="count" oninput="pbSync(this)" />
        <input type="number" min="0" max="3600" value="${Number(axe.timeSeconds) || 0}" title="Secondes / question (0 = sans limite)" style="padding:6px;border:1px solid #cbd5e1;border-radius:6px;"
          data-pb-kind="axe" data-cat="${catId}" data-sub="${subId || ''}" data-ss="${ssId || ''}" data-axe="${axe.id}" data-field="timeSeconds" oninput="pbSync(this)" />
        <select data-pb-kind="axe" data-cat="${catId}" data-sub="${subId || ''}" data-ss="${ssId || ''}" data-axe="${axe.id}" data-field="difficulty" onchange="pbSync(this)" style="padding:6px;border:1px solid #cbd5e1;border-radius:6px;">
          ${['easy', 'medium', 'hard', 'mixed'].map((d) => `<option value="${d}" ${axe.difficulty === d ? 'selected' : ''}>${d}</option>`).join('')}
        </select>
        <input type="number" min="1" max="100" value="${Number(axe.points) || 1}" title="Points / question" style="padding:6px;border:1px solid #cbd5e1;border-radius:6px;"
          data-pb-kind="axe" data-cat="${catId}" data-sub="${subId || ''}" data-ss="${ssId || ''}" data-axe="${axe.id}" data-field="points" oninput="pbSync(this)" />
      </div>
      <div style="display:flex;gap:6px;font-size:0.7rem;color:#64748b;margin-top:4px;"><span>Titre</span><span style="margin-left:52%;">Nb Q</span><span>Temps(s)</span><span>Difficulté</span><span>Pts</span></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">${typeInputs}</div>
      <div style="margin-top:6px;">${warn}</div>
    </div>`;
  }

  window.renderPromptBuilderTree = function () {
    const tree = document.getElementById('promptBuilderTree');
    if (!tree) return;
    if (!state.categories.length) {
      tree.innerHTML = `<div class="prompt-builder-empty" style="text-align:center;padding:48px 20px;background:#f8fafc;border:2px dashed #cbd5e1;border-radius:12px;">
        <div style="font-size:2.2rem;margin-bottom:8px;">🧱</div>
        <h3 style="margin:0 0 8px;color:#334155;font-weight:700;">No course structure yet</h3>
        <p style="margin:0 0 16px;font-size:0.9rem;color:#64748b;">Start building your quiz hierarchy by adding categories or loading a sample curriculum.</p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
          <button type="button" class="btn btn-primary" onclick="addCategoryNode()" style="background:linear-gradient(135deg, #0d9488 0%, #14b8a6 100%);border:none;font-weight:600;padding:8px 18px;border-radius:8px;color:#fff;cursor:pointer;">＋ Add Category</button>
          <button type="button" class="btn btn-secondary" onclick="loadPromptBuilderTemplate()" style="padding:8px 18px;border-radius:8px;cursor:pointer;">Load Example Template</button>
        </div>
      </div>`;
      window.updatePromptBuilderStats();
      return;
    }
    tree.innerHTML = state.categories.map((c, ci) => {
      const subs = (c.subs || []).map((s) => {
        const directAxes = (s.axes || []).map((a) =>
          axeCard(c.id, s.id, '', a, `${c.name || 'Catégorie'} › ${s.name || 'Sous-catégorie'}`),
        ).join('');
        const subsubs = (s.subsubs || []).map((ss) => {
          const axes = (ss.axes || []).map((a) =>
            axeCard(c.id, s.id, ss.id, a, `${c.name || '?'} › ${s.name || '?'} › ${ss.name || '?'}`),
          ).join('');
          return `<div style="border:1px dashed #c4b5fd;border-radius:8px;padding:10px;margin-top:8px;background:#faf5ff;">
            <div style="display:flex;gap:8px;align-items:center;">
              <span style="font-size:0.75rem;font-weight:700;color:#6d28d9;">🏷️ SOUS-SOUS-CATÉGORIE</span>
              <input type="text" placeholder="ex : Systèmes de numération / Codage" value="${esc(ss.name)}" style="flex:1;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;"
                data-pb-kind="ss" data-cat="${c.id}" data-sub="${s.id}" data-ss="${ss.id}" data-field="name" oninput="pbSync(this)" />
              <button type="button" class="btn btn-sm btn-secondary" onclick="addAxeNode('${c.id}','${s.id}','${ss.id}')">+ Axe</button>
              <button type="button" class="btn btn-sm btn-secondary" onclick="deleteSubSubcategoryNode('${c.id}','${s.id}','${ss.id}')">✕</button>
            </div>
            ${axes || '<div style="font-size:0.78rem;color:#94a3b8;margin-top:6px;">Ajoutez un axe (titre + nombre + temps + difficulté + types).</div>'}
          </div>`;
        }).join('');
        return `<div style="border:1px solid #bae6fd;border-radius:8px;padding:10px;margin-top:8px;background:#f0f9ff;">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <span style="font-size:0.75rem;font-weight:700;color:#0369a1;">📁 SOUS-CATÉGORIE</span>
            <input type="text" placeholder="ex : Vocabulaire de base" value="${esc(s.name)}" style="flex:1;min-width:180px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;"
              data-pb-kind="sub" data-cat="${c.id}" data-sub="${s.id}" data-field="name" oninput="pbSync(this)" />
            <button type="button" class="btn btn-sm btn-secondary" onclick="addAxeNode('${c.id}','${s.id}','')">+ Axe</button>
            <button type="button" class="btn btn-sm btn-secondary" onclick="addSubSubcategoryNode('${c.id}','${s.id}')">+ Sous-sous-cat.</button>
            <button type="button" class="btn btn-sm btn-secondary" onclick="deleteSubcategoryNode('${c.id}','${s.id}')">✕</button>
          </div>
          ${directAxes}
          ${subsubs}
        </div>`;
      }).join('');
      return `<div style="border:2px solid #10b981;border-radius:10px;padding:12px;margin-bottom:12px;background:#ecfdf5;">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <span style="font-size:0.8rem;font-weight:800;color:#065f46;">📂 CATÉGORIE (Module) ${ci + 1}</span>
          <input type="text" placeholder="ex : Module 1 : Généralités sur les systèmes informatiques" value="${esc(c.name)}" style="flex:1;min-width:200px;padding:8px;border:1px solid #6ee7b7;border-radius:6px;font-weight:600;"
            data-pb-kind="cat" data-cat="${c.id}" data-field="name" oninput="pbSync(this)" />
          <button type="button" class="btn btn-sm btn-secondary" onclick="addSubcategoryNode('${c.id}')">+ Sous-catégorie</button>
          <button type="button" class="btn btn-sm btn-secondary" onclick="deleteCategoryNode('${c.id}')">✕</button>
        </div>
        ${subs || '<div style="font-size:0.85rem;color:#047857;margin-top:8px;">Ajoutez une sous-catégorie pour commencer.</div>'}
      </div>`;
    }).join('');
    window.updatePromptBuilderStats();
  };

  // ---------- prompt generation ----------
  function typeSpecText() {
    return [
      '- "multiple-choice": "options" = 4 chaînes plausibles ; "answer" = le texte EXACT de la bonne option',
      '- "multiple-choice-multi": "options" = 4-6 chaînes ; "answer" = bonnes options jointes par "," (ex : "A,B") + "allowMultipleAnswers": true',
      '- "true-false": "options" = ["Vrai","Faux"] (ou ["True","False"] si anglais) ; "answer" = une des 2',
      '- "fill-blank": "question" contient "___" par trou ; "options" = banque de mots ; "answer" = "1:mot|2:mot" (ordre gauche→droite)',
      '- "odd-one-out": "options" = 4 chaînes dont une intruse ; "answer" = l\'intrus (texte exact)',
      '- "draggable": "options" = 4-6 chaînes dans le DÉSORDRE ; "answer" = le bon ordre joint par "," ; ajouter "isDraggable": true',
      '- "matching-pairs": "options" = toutes les clés+valeurs ; "answer" = "Clé1-->Valeur1|Clé2-->Valeur2"',
    ].join('\n');
  }

  function buildPromptText() {
    const lang = state.language === 'en' ? 'English' : state.language === 'ar' ? 'Arabic (with French technical terms kept)' : 'French (professionnel, académique)';
    const axes = collectAxes();
    const total = axes.reduce((n, e) => n + (Number(e.axe.count) || 0), 0);

    function axeLine2(c, s, ss, a) {
      const path = ss ? `${c.name} > ${s.name} > ${ss.name} > ${a.title}` : `${c.name} > ${s.name} > ${a.title}`;
      const mix = QUESTION_TYPES.map((t) => `${t.id}: ${Number((a.types || {})[t.id]) || 0}`).join(', ');
      return `AXE "${a.title || '(sans titre)'}" [path: ${path}] → ${a.count} question(s) | difficulté: ${a.difficulty} | temps: ${a.timeSeconds}s/question | points: ${a.points} | types { ${mix} }`;
    }
    const lines2 = [];
    state.categories.forEach((c) => {
      lines2.push(`CATEGORY: "${c.name || '(sans nom)'}"`);
      (c.subs || []).forEach((s) => {
        lines2.push(`  SUB-CATEGORY of "${c.name}": "${s.name || '(sans nom)'}"`);
        (s.axes || []).forEach((a) => lines2.push('  ' + axeLine2(c, s, null, a)));
        (s.subsubs || []).forEach((ss) => {
          lines2.push(`    SUB-SUB-CATEGORY of "${s.name}": "${ss.name || '(sans nom)'}"`);
          (ss.axes || []).forEach((a) => lines2.push('    ' + axeLine2(c, s, ss, a)));
        });
      });
    });

    const perAxeJsonHints = axes.map((e) => {
      const p = e.ss ? `${e.cat} > ${e.sub} > ${e.ss} > ${e.axe.title}` : `${e.cat} > ${e.sub} > ${e.axe.title}`;
      return `- "${p}": ${e.axe.count} question(s), difficulty "${e.axe.difficulty}", "time_limit": ${e.axe.timeSeconds}, "points": ${e.axe.points}`;
    });

    return `You are a quiz-question generator for a school quiz app. Language of ALL questions/options/explanations: ${lang}.
${state.language === 'fr' ? 'Tout le contenu pédagogique doit être en français académique.' : ''}

COURSE HIERARCHY TO COVER (respect exactly — generate the EXACT number per axe):
${lines2.join('\n')}

TOTAL: EXACTLY ${total} questions.
${perAxeJsonHints.length ? 'RECAP BY AXE:\n' + perAxeJsonHints.join('\n') + '\n' : ''}
TYPE RULES (per question):
${typeSpecText()}

OUTPUT FORMAT — respond with ONE valid JSON OBJECT and NOTHING else (no markdown, no commentary):
{
  "categories": [
    { "name": "Module 1 : ...", "parent": null },
    { "name": "Vocabulaire de base", "parent": "Module 1 : ..." },
    { "name": "Informatique", "parent": "Vocabulaire de base" }
  ],
  "questions": [
    {
      "categoryPath": "Module 1 : ... > Vocabulaire de base > Informatique",
      "question": "…?",
      "type": "multiple-choice",
      "options": ["A", "B", "C", "D"],
      "answer": "A",
      "explanation": "…",
      "difficulty": "easy",
      "points": 1,
      "time_limit": 30
    }
  ]
}

STRICT RULES:
1. "categories": list EVERY category, sub-category and sub-sub-category from the hierarchy above, each with its parent name (top-level parent = null). Use the EXACT names given.
2. "questions": EXACTLY ${total} objects, each assigned to its axe via "categoryPath" built as "Category > Sub-category > [Sub-sub-category >] Axe-title" using the EXACT names above.
3. Per axe, respect count + difficulty + time_limit + points + type mix. If a type mix lists 0 for every type, distribute evenly.
4. "type" is ONLY one of: multiple-choice, multiple-choice-multi, true-false, fill-blank, draggable, odd-one-out, matching-pairs. (QCM-multiple → "type": "multiple-choice" + "allowMultipleAnswers": true.)
5. "answer" must be copy-pasteable from "options" (exact text), except fill-blank ("1:mot|2:mot") and matching-pairs ("A-->B|C-->D").
6. No trailing commas, double quotes everywhere, escape quotes inside strings. No \`\`\`json fences.
${state.extraInstruction ? 'ADDITIONAL TEACHER INSTRUCTION:\n' + state.extraInstruction + '\n' : ''}
Generate now.`;
  }

  window.generateAndCopyPrompt = async function () {
    const axes = collectAxes();
    if (!axes.length) {
      if (typeof showToast === 'function') showToast('Ajoutez au moins un axe avec un titre et un nombre.', 'warning');
      return;
    }
    const missing = axes.filter((e) => !String(e.axe.title || '').trim());
    if (missing.length && !confirm(`${missing.length} axe(s) sans titre. Continuer quand même ?`)) return;
    const prompt = buildPromptText();
    const out = document.getElementById('promptBuilderOutput');
    if (out) {
      out.value = prompt;
      out.style.display = 'block';
      const wrap = document.getElementById('promptBuilderOutputWrap');
      if (wrap) wrap.style.display = 'block';
      out.focus();
      out.select();
      try { out.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (_) {}
    }
    const total = axes.reduce((n, e) => n + (Number(e.axe.count) || 0), 0);
    const status = document.getElementById('promptBuilderStatus');
    let copied = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(prompt);
        copied = true;
      } else {
        const ta = document.createElement('textarea');
        ta.value = prompt;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        copied = document.execCommand('copy');
        ta.remove();
      }
    } catch (_) { copied = false; }
    if (status) {
      status.textContent = copied
        ? `✓ Prompt copié (${total} questions) — collez-le dans ChatGPT/Claude, puis importez sa réponse JSON via « Import generated JSON ».`
        : 'Prompt généré ci-dessous — copiez-le manuellement (presse-papiers bloqué).';
    }
    if (typeof showToast === 'function') {
      showToast(copied ? 'Prompt copié !' : 'Prompt généré — copie manuelle', copied ? 'success' : 'warning');
    }
    try { console.log('[Prompt Builder]\n\n' + prompt); } catch (_) {}
  };

  window.downloadPromptBuilderPrompt = function () {    const out = document.getElementById('promptBuilderOutput');
    const text = (out && out.value) || buildPromptText();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'prompt-chatgpt-claude.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  window.clearPromptBuilderImport = function () {
    const ta = document.getElementById('promptBuilderImportInput');
    if (ta) ta.value = '';
    const status = document.getElementById('promptBuilderImportStatus');
    if (status) status.textContent = '';
  };

  // Paste-zone import: uses the same engine as Settings → Data file import.
  window.importPromptBuilderJSON = async function () {
    const ta = document.getElementById('promptBuilderImportInput');
    const status = document.getElementById('promptBuilderImportStatus');
    const rawText = String(ta?.value || '').trim();
    const say = (msg) => { if (status) status.textContent = msg; };
    if (!rawText) {
      say('Collez d’abord la réponse JSON du modèle ci-dessus.');
      if (typeof showToast === 'function') showToast('Zone vide — collez le JSON du modèle.', 'warning');
      return;
    }
    if (typeof parseAIImportPayload !== 'function' || typeof window.importParsedAIQuestions !== 'function') {
      say('Import non chargé — utilisez Settings → Data → Import generated JSON.');
      if (typeof showToast === 'function') showToast('Rechargez la page (Ctrl+F5) puis réessayez.', 'error');
      return;
    }
    let parsed;
    try {
      parsed = parseAIImportPayload(rawText);
    } catch (err) {
      say(`JSON invalide : ${err?.message || 'erreur'}`);
      return;
    }
    const { categories, questions } = parsed || {};
    if (!questions || !questions.length) {
      say('Aucune question trouvée — vérifiez le format {"categories": […], "questions": […]}.');
      if (typeof showToast === 'function') showToast('Aucune question dans ce JSON.', 'error');
      return;
    }
    if (!confirm(`Importer ${questions.length} question(s)${categories?.length ? ` + ${categories.length} catégorie(s)` : ''} ? Les catégories seront créées automatiquement.`)) return;
    say('Import en cours…');
    try {
      const imported = await window.importParsedAIQuestions(categories, questions);
      if (imported > 0 && ta) ta.value = '';
      say(imported > 0 ? `✓ ${imported} question(s) importée(s).` : 'Échec — voir la console.');
    } catch (err) {
      console.error('[prompt-builder] paste import failed:', err);
      say(`Échec : ${err?.message || 'erreur serveur'}`);
    }
  };

  // ---------- open/close: the builder now lives as a tab of the AI Generator modal ----------
  function ensureGeneratorOpen() {
    const modal = document.getElementById('aiGeneratorModal');
    if (!modal) return null;
    const isOpen =
      modal.classList.contains('is-open') || modal.style.display === 'flex';
    if (!isOpen) {
      if (modal.parentElement !== document.body) {
        document.body.appendChild(modal);
      }
      try {
        modal.inert = false;
        modal.removeAttribute('inert');
      } catch (_) {}
      modal.style.setProperty('display', 'flex', 'important');
      modal.style.setProperty('position', 'fixed', 'important');
      modal.style.setProperty('inset', '0', 'important');
      modal.style.setProperty('z-index', '2147483000', 'important');
      modal.style.setProperty('opacity', '1', 'important');
      modal.style.setProperty('visibility', 'visible', 'important');
      modal.style.setProperty('pointer-events', 'auto', 'important');
      modal.classList.add('is-open', 'active');
      modal.setAttribute('aria-hidden', 'false');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('role', 'dialog');
      document.documentElement.classList.add('modal-open');
      document.body.classList.add('modal-open');
    }
    return modal;
  }

  function syncBuilderInputs() {
    const lang = document.getElementById('pbLanguage');
    if (lang) lang.value = state.language || 'fr';
    const extra = document.getElementById('pbExtra');
    if (extra) extra.value = state.extraInstruction || '';
  }
  window.syncPromptBuilderInputs = syncBuilderInputs;

  window.openPromptBuilderModal = function () {
    if (!ensureGeneratorOpen()) {
      if (typeof showToast === 'function') showToast('AI Generator introuvable — rechargez la page (Ctrl+F5).', 'error');
      return;
    }
    syncBuilderInputs();
    if (typeof window.switchAIGeneratorTab === 'function') {
      window.switchAIGeneratorTab('builder');
    } else {
      const pane = document.getElementById('ai-builder-form');
      if (pane) pane.style.display = 'block';
    }
    window.renderPromptBuilderTree();
  };

  window.closePromptBuilderModal = function () {
    if (typeof window.closeAIGeneratorModal === 'function') {
      window.closeAIGeneratorModal();
      return;
    }
    const pane = document.getElementById('ai-builder-form');
    if (pane) pane.style.display = 'none';
  };

  // One-command diagnostic for the browser console:
  //   __aiBuilderDiag()
  window.__aiBuilderDiag = function () {
    const out = { pbVersion: '2026-10-16-r1' };
    try {
      out.switchFn = typeof window.switchAIGeneratorTab;
      out.renderFn = typeof window.renderPromptBuilderTree;
      const pane = document.getElementById('ai-builder-form');
      out.paneFound = !!pane;
      out.paneDisplay = pane ? pane.style.display : null;
      const tree = document.getElementById('promptBuilderTree');
      out.treeFound = !!tree;
      out.treeChildren = tree ? tree.children.length : null;
      out.treeTextHead = tree ? String(tree.textContent || '').slice(0, 80) : null;
      out.tabBtn = !!document.getElementById('tab-ai-builder');
      out.cats = (state.categories || []).length;
      out.axes = collectAxes().length;
    } catch (e) {
      out.error = String((e && e.message) || e);
    }
    return out;
  };

  // global inputs wiring on load
  function initPromptBuilder() {
    window.renderPromptBuilderTree();
    const lang = document.getElementById('pbLanguage');
    if (lang) {
      lang.value = state.language || 'fr';
      lang.addEventListener('change', () => { state.language = lang.value; saveState(); });
    }
    const extra = document.getElementById('pbExtra');
    if (extra) {
      extra.value = state.extraInstruction || '';
      extra.addEventListener('input', () => { state.extraInstruction = extra.value; saveState(); });
    }
    try { console.log('[prompt-builder] loaded ✓'); } catch (_) {}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPromptBuilder, { once: true });
  } else {
    initPromptBuilder();
  }
})();
