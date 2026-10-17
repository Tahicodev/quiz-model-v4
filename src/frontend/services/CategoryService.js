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
    
    if (parsed.data.parent_id) {
      const parent = await this.#repo.getById('categories', parsed.data.parent_id);
      if (!parent) throw new ValidationError({ parent_id: ['Parent category not found'] });
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

    if (parsed.data.parent_id) {
      if (parsed.data.parent_id === id) throw new ValidationError({ parent_id: ['Cannot set category as its own parent'] });
      const parent = await this.#repo.getById('categories', parsed.data.parent_id);
      if (!parent) throw new ValidationError({ parent_id: ['Parent category not found'] });
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

    return this.#repo.update('categories', id, parsed.data);
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
