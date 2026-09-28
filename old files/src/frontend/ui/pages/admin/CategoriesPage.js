/**
 * src/frontend/ui/pages/admin/CategoriesPage.js
 * Category management: hierarchical tree view + flat CRUD.
 *
 * Uses CategoryService via the container:
 *   list / getTree / getById / create / update / delete
 */

import { getContainer }    from '../../../container.js';
import { withError }       from '../../../utils/eventBus.js';
import { logger }          from '../../../utils/logger.js';
import { confirmDialog }   from './components/ConfirmDialog.js';
import { formModal, textField, selectField } from './components/FormModal.js';

let hostRef = null;
let allCats = [];
let treeRoots = [];

export async function initCategoriesPage(host) {
  hostRef = host;
  host.replaceChildren();

  const title = document.createElement('h1');
  title.className = 'page-title';
  title.textContent = 'Categories';

  const toolbar = document.createElement('div');
  toolbar.className = 'admin-toolbar';
  const spacer = document.createElement('span');
  spacer.style.flex = '1';
  const newBtn = document.createElement('button');
  newBtn.type = 'button'; newBtn.className = 'btn btn-primary';
  newBtn.textContent = '+ New Category';
  newBtn.addEventListener('click', () => openCategoryForm(null, null));
  toolbar.append(spacer, newBtn);

  const treeWrap = document.createElement('div');
  treeWrap.className = 'admin-category-tree';
  treeWrap.id = 'category-tree';

  host.append(title, toolbar, treeWrap);

  const load = async () => {
    const c = getContainer();
    // Flat list for parent options in the form
    try {
      const res = await c.categorySvc.list({}, { limit: 500, orderBy: 'name' });
      allCats = res?.data ?? [];
    } catch (err) { logger.warn('Could not load categories', err); allCats = []; }
    try { treeRoots = await c.categorySvc.getTree(); }
    catch (err) { logger.warn('Could not load category tree', err); treeRoots = []; }
    renderTree(treeWrap);
  };
  await withError(load);
  return load;
}

function renderTree(container) {
  container.replaceChildren();
  if (treeRoots.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'admin-empty-inline';
    empty.textContent = 'No categories yet. Create one to organize your questions.';
    container.appendChild(empty);
    return;
  }
  const ul = document.createElement('ul');
  ul.className = 'category-list';
  for (const root of treeRoots) ul.appendChild(renderNode(root, 0));
  container.appendChild(ul);
}

function renderNode(node, depth) {
  const li = document.createElement('li');
  li.className = 'category-node';
  li.style.marginLeft = `${depth * 1.5}rem`;

  const row = document.createElement('div');
  row.className = 'category-node__row';
  if (node.icon) {
    const ic = document.createElement('span');
    ic.textContent = node.icon;
    row.appendChild(ic);
  }
  const name = document.createElement('span');
  name.className = 'category-node__name';
  name.textContent = node.name;
  row.appendChild(name);

  const actions = document.createElement('div');
  actions.className = 'admin-row-actions';
  const add = document.createElement('button');
  add.type = 'button'; add.className = 'btn btn-secondary btn-sm';
  add.textContent = 'Add subcategory';
  add.addEventListener('click', () => openCategoryForm(null, node.id));
  const edit = document.createElement('button');
  edit.type = 'button'; edit.className = 'btn btn-secondary btn-sm';
  edit.textContent = 'Edit'; edit.addEventListener('click', () => openCategoryForm(node, null));
  const del = document.createElement('button');
  del.type = 'button'; del.className = 'btn btn-danger btn-sm';
  del.textContent = 'Delete'; del.addEventListener('click', () => deleteCategory(node));
  actions.append(add, edit, del);
  row.appendChild(actions);
  li.appendChild(row);

  if (node.children?.length) {
    const childUl = document.createElement('ul');
    childUl.className = 'category-list';
    for (const child of node.children) childUl.appendChild(renderNode(child, depth + 1));
    li.appendChild(childUl);
  }
  return li;
}

function openCategoryForm(cat, parentId) {
  const isEdit = !!cat;
  // Parent options: all categories except the current one (no self-parent)
  const parentOptions = { '': '— Root (top level) —' };
  for (const c of allCats) {
    if (isEdit && c.id === cat.id) continue;
    parentOptions[c.id] = c.name;
  }
  const fieldsHTML = [
    textField('name', 'Name', { value: cat?.name ?? '', required: true }),
    textField('icon', 'Icon (emoji, optional)', { value: cat?.icon ?? '' }),
    textField('color', 'Color (hex, optional)', { value: cat?.color ?? '', placeholder: '#3b82f6' }),
    selectField('parent_id', 'Parent', parentOptions, { value: cat?.parent_id ?? parentId ?? '' }),
  ].join('');
  formModal({
    title: isEdit ? 'Edit Category' : 'New Category',
    fieldsHTML,
    confirmText: isEdit ? 'Update' : 'Create',
    onSubmit: async (values) => {
      const c = getContainer();
      const me = c.authSvc.getCurrentUser();
      const payload = { ...values, parent_id: values.parent_id || null, icon: values.icon || null, color: values.color || null };
      if (isEdit) await c.categorySvc.update(cat.id, payload, me);
      else        await c.categorySvc.create(payload, me);
      await refresh();
    },
  });
}

async function deleteCategory(cat) {
  const ok = await confirmDialog({
    title: 'Delete category?',
    message: `Delete "${cat.name}"? Categories with subcategories or containing questions cannot be deleted.`,
    confirmText: 'Delete',
  });
  if (!ok) return;
  await withError(async () => {
    const c = getContainer();
    await c.categorySvc.delete(cat.id, c.authSvc.getCurrentUser());
    await refresh();
  }, 'Category deleted');
}

async function refresh() {
  const c = getContainer();
  try {
    const res = await c.categorySvc.list({}, { limit: 500, orderBy: 'name' });
    allCats = res?.data ?? [];
    treeRoots = await c.categorySvc.getTree();
    renderTree(document.getElementById('category-tree'));
  } catch (err) { logger.warn('Could not refresh categories', err); }
}
