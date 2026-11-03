/**
 * src/frontend/services/CategoryService.js
 * Manages question categories (supports tree structure via parent_id).
 */

import { NotFoundError, ForbiddenError, ValidationError }               from '../../shared/errors.js';
import { CategoryCreateSchema, CategoryUpdateSchema, CategoryFilterSchema } from '../../shared/schemas/category.schema.js';
import { ROLES }                                                         from '../../shared/constants.js';

export class CategoryService {
  #repo;
  constructor(repo) { this.#repo = repo; }

  async list(filters = {}, pagination = {}) {
    // `or` and author ids are server-derived (route-enforced), not client
    // input — keep them out of the query-shape validation and re-attach.
    const { or = null, created_by = undefined, ...restFilters } = filters;
    const parsed = CategoryFilterSchema.safeParse({ ...restFilters, ...pagination });
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);
    const { limit, offset, orderBy, direction, search, ...rest } = parsed.data;
    if (created_by !== undefined) rest.created_by = created_by;
    return this.#repo.getAll('categories', { filters: rest, limit, offset, orderBy, direction, search, ...(or ? { or } : {}) });
  }

  /**
   * Retrieves the full category tree for the given school.
   * Useful for building UI category pickers. Teachers receive only the
   * categories they authored; admins receive all.
   */
  async getTree(schoolId = null, { teacherId = null } = {}) {
    const { data: all } = await this.#repo.getAll('categories', {
      filters: {
        ...(schoolId ? { school_id: schoolId } : {}),
        ...(teacherId ? { created_by: teacherId } : {}),
      },
      limit: 9999,
      orderBy: 'name',
    });
    const lookup = new Map(all.map(c => [c.id, { ...c, children: [] }]));
    const roots  = [];

    for (const cat of lookup.values()) {
      if (cat.parent_id && lookup.has(cat.parent_id)) {
        lookup.get(cat.parent_id).children.push(cat);
      } else {
        roots.push(cat);
      }
    }
    // Cycle safety: rows trapped in a parent loop are reachable from no root
    // (the update route rejects new cycles, but legacy/mirrored data may
    // still contain one). Surface them as roots instead of dropping them.
    {
      const reachable = new Set();
      const visit = (node) => {
        if (!node || reachable.has(node.id)) return;
        reachable.add(node.id);
        for (const child of node.children) visit(child);
      };
      for (const root of roots) visit(root);
      for (const cat of lookup.values()) {
        if (!reachable.has(cat.id)) roots.push(cat);
      }
    }
    return roots;
  }

  async getById(id) {
    const cat = await this.#repo.getById('categories', id);
    if (!cat) throw new NotFoundError('Category');
    return cat;
  }

  async create(data, currentUser) {
    this.#requireAdmin(currentUser);
    const parsed = CategoryCreateSchema.safeParse(data);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);

    await this.#validateSubject(parsed.data.subject_id, currentUser);
    const { data: siblings } = await this.#repo.getAll('categories', {
      filters: {
        school_id: currentUser.school_id,
        subject_id: parsed.data.subject_id ?? null,
        parent_id: parsed.data.parent_id ?? null,
      },
      limit: 100000,
    });
    if (siblings.some((category) => category.name.toLocaleLowerCase() === parsed.data.name.toLocaleLowerCase())) {
      throw new ValidationError({ name: ['A category with this name already exists under this parent in this subject.'] });
    }
    if (parsed.data.parent_id) {
      const parent = await this.#repo.getById('categories', parsed.data.parent_id);
      if (!parent) throw new ValidationError({ parent_id: ['Parent category not found'] });
      this.#assertCategoryAccess(parent, currentUser);
      if (String(parent.school_id) !== String(currentUser.school_id) ||
          String(parent.subject_id || '') !== String(parsed.data.subject_id || '')) {
        throw new ValidationError({ parent_id: ['Parent and child categories must belong to the same subject.'] });
      }
    }

    return this.#repo.create('categories', {
      ...parsed.data,
      school_id: currentUser?.school_id,
      // Author attribution for teacher-scoped libraries (see QuestionService).
      ...(currentUser?.id ? { created_by: currentUser.id } : {}),
    });
  }

  async update(id, data, currentUser) {
    this.#requireAdmin(currentUser);
    const existing = await this.#repo.getById('categories', id);
    if (!existing) throw new NotFoundError('Category');

    const parsed = CategoryUpdateSchema.safeParse(data);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);

    this.#assertCategoryAccess(existing, currentUser);
    const subjectId = parsed.data.subject_id === undefined ? existing.subject_id : parsed.data.subject_id;
    await this.#validateSubject(subjectId, currentUser);
    const parentId = parsed.data.parent_id === undefined ? existing.parent_id : parsed.data.parent_id;
    const categoryName = parsed.data.name === undefined ? existing.name : parsed.data.name;
    if (parsed.data.name !== undefined ||
        String(parentId || '') !== String(existing.parent_id || '') ||
        String(subjectId || '') !== String(existing.subject_id || '')) {
      const { data: siblings } = await this.#repo.getAll('categories', {
        filters: {
          school_id: existing.school_id,
          subject_id: subjectId ?? null,
          parent_id: parentId ?? null,
        },
        limit: 100000,
      });
      if (siblings.some((category) =>
        String(category.id) !== String(id) &&
        category.name.toLocaleLowerCase() === categoryName.toLocaleLowerCase(),
      )) {
        throw new ValidationError({ name: ['A category with this name already exists under this parent in this subject.'] });
      }
    }

    let subjectMoveIds = [];
    if (parsed.data.subject_id !== undefined && String(parsed.data.subject_id || '') !== String(existing.subject_id || '')) {
      if (existing.parent_id) {
        throw new ValidationError({ subject_id: ['Change the subject from the top-level category.'] });
      }
      subjectMoveIds = await this.#getSubtreeIds(id);
      const { data: targetCategories } = await this.#repo.getAll('categories', {
        filters: { school_id: existing.school_id, subject_id: subjectId ?? null },
        limit: 100000,
      });
      const movingIds = new Set(subjectMoveIds.map(String));
      const movingCategories = [];
      for (const movingId of subjectMoveIds) {
        const category = await this.#repo.getById('categories', movingId);
        if (category) {
          this.#assertCategoryAccess(category, currentUser);
          movingCategories.push(category);
        }
      }
      const targetNames = new Set(targetCategories
        .filter((category) => !movingIds.has(String(category.id)))
        .map((category) => `${String(category.parent_id || '')}\u0000${category.name.toLocaleLowerCase()}`));
      if (movingCategories.some((category) =>
        targetNames.has(`${String(category.parent_id || '')}\u0000${category.name.toLocaleLowerCase()}`),
      )) {
        throw new ValidationError({ subject_id: ['A category in this branch already exists in the selected subject. Rename the conflicting category first.'] });
      }
    }

    if (parentId) {
      if (String(parentId) === String(id)) throw new ValidationError({ parent_id: ['Cannot set category as its own parent'] });
      const parent = await this.#repo.getById('categories', parentId);
      if (!parent) throw new ValidationError({ parent_id: ['Parent category not found'] });
      this.#assertCategoryAccess(parent, currentUser);
      if (String(parent.school_id) !== String(existing.school_id) ||
          String(parent.subject_id || '') !== String(subjectId || '')) {
        throw new ValidationError({ parent_id: ['Parent and child categories must belong to the same subject.'] });
      }
      // Cycle guard: walk the new parent's ancestor chain — if it leads back
      // to this category the tree would loop (and getTree would drop the
      // whole cycle from the roots).
      let ancestorId = parent.parent_id || null;
      const seen = new Set([id]);
      while (ancestorId) {
        if (ancestorId === id || seen.has(ancestorId)) {
          throw new ValidationError({ parent_id: ['Cannot move a category inside one of its own subcategories'] });
        }
        seen.add(ancestorId);
        const ancestor = await this.#repo.getById('categories', ancestorId);
        ancestorId = ancestor?.parent_id || null;
      }
    }

    const updated = await this.#repo.update('categories', id, parsed.data);
    for (const childId of subjectMoveIds.filter((categoryId) => String(categoryId) !== String(id))) {
      await this.#repo.update('categories', childId, { subject_id: subjectId || null });
    }
    if (subjectMoveIds.length) {
      const movingIds = new Set(subjectMoveIds.map(String));
      const { data: courses } = await this.#repo.getAll('courses', { limit: 100000 });
      for (const course of courses || []) {
        if (course.category_id && movingIds.has(String(course.category_id))) {
          await this.#repo.update('courses', course.id, { subject_id: subjectId || null });
        }
      }
    }
    return updated;
  }

  async #getSubtreeIds(rootId) {
    const ids = [String(rootId)];
    let frontier = [String(rootId)];
    while (frontier.length) {
      const next = [];
      for (const parentId of frontier) {
        const { data: children } = await this.#repo.getAll('categories', {
          filters: { parent_id: parentId },
          limit: 100000,
        });
        for (const child of children || []) {
          const childId = String(child.id);
          if (!ids.includes(childId)) {
            ids.push(childId);
            next.push(childId);
          }
        }
      }
      frontier = next;
    }
    return ids;
  }

  async #validateSubject(subjectId, user) {
    if (!subjectId) return;
    const subject = await this.#repo.getById('subjects', subjectId);
    if (!subject || String(subject.school_id) !== String(user.school_id)) {
      throw new ValidationError({ subject_id: ['Subject not found in this school.'] });
    }
    if (user.role === ROLES.TEACHER && String(subject.created_by) !== String(user.id)) {
      throw new ForbiddenError('Not your subject');
    }
  }

  #assertCategoryAccess(category, user) {
    if (category.school_id != null && user.school_id != null &&
        String(category.school_id) !== String(user.school_id)) {
      throw new ValidationError({ parent_id: ['Category does not belong to this school.'] });
    }
    if (user.role === ROLES.TEACHER && String(category.created_by) !== String(user.id)) {
      throw new ForbiddenError('Not your category');
    }
  }

  /**
   * Deleting a category deletes the WHOLE subtree (subcategories,
   * sub-subcategories…) and every question filed under it — this category
   * or any of its subcategories — becomes uncategorized (category_id NULL,
   * the UI's "Uncategorized" pseudo-category). Deep joins stay reachable:
   * no more "cannot delete: has subcategories / contains questions".
   */
  async delete(id, currentUser) {
    this.#requireAdmin(currentUser);
    const root = await this.#repo.getById('categories', id);
    if (!root) throw new NotFoundError('Category');

    // 1. Collect the full subtree iteratively (cycle-safe).
    const subtreeIds = [String(id)];
    let frontier = [id];
    let guard = 0;
    while (frontier.length && guard++ < 100) {
      const found = [];
      for (const parentId of frontier) {
        const { data: children } = await this.#repo.getAll('categories', {
          filters: { parent_id: parentId },
          limit: 100000,
        });
        for (const child of children || []) {
          if (child?.id && !subtreeIds.includes(String(child.id))) {
            subtreeIds.push(String(child.id));
            found.push(child.id);
          }
        }
      }
      frontier = found;
    }
    const subtree = new Set(subtreeIds);

    // 2. Detach every question filed under the subtree → uncategorized.
    //    Fetched once and filtered locally so both repo backends
    //    (Prisma REST-where and REST query-params) behave the same.
    const { data: questions } = await this.#repo.getAll('questions', { limit: 100000 });
    for (const q of questions || []) {
      if (q?.id && q.category_id && subtree.has(String(q.category_id))) {
        await this.#repo.update('questions', q.id, { category_id: null });
      }
    }

    // 3. Delete the whole subtree deepest-first (reverse BFS), the root
    //    last. The DB FK is ON DELETE SET NULL, but explicit child deletes
    //    keep the branch fully removed instead of orphaning it top-level.
    for (const cid of subtreeIds.slice().reverse()) {
      if (String(cid) === String(id)) continue;
      await this.#repo.delete('categories', cid);
    }
    await this.#repo.delete('categories', id);
  }

  async moveQuestion(questionId, newCategoryId, currentUser) {
    this.#requireAdmin(currentUser);
    const q = await this.#repo.getById('questions', questionId);
    if (!q) throw new NotFoundError('Question');
    const cat = await this.#repo.getById('categories', newCategoryId);
    if (!cat) throw new NotFoundError('Category');

    return this.#repo.update('questions', questionId, { category_id: newCategoryId });
  }

  #requireAdmin(user) {
    if (!user || ![ROLES.ADMIN, ROLES.TEACHER, ROLES.SUPER_ADMIN].includes(user.role)) {
      throw new ForbiddenError();
    }
  }
}
