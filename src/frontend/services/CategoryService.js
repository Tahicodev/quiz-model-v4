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
    const parsed = CategoryFilterSchema.safeParse({ ...filters, ...pagination });
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);
    const { limit, offset, orderBy, direction, search, ...rest } = parsed.data;
    return this.#repo.getAll('categories', { filters: rest, limit, offset, orderBy, direction, search });
  }

  /**
   * Retrieves the full category tree for the given school.
   * Useful for building UI category pickers.
   */
  async getTree() {
    const { data: all } = await this.#repo.getAll('categories', { limit: 9999, orderBy: 'name' });
    const lookup = new Map(all.map(c => [c.id, { ...c, children: [] }]));
    const roots  = [];

    for (const cat of lookup.values()) {
      if (cat.parent_id && lookup.has(cat.parent_id)) {
        lookup.get(cat.parent_id).children.push(cat);
      } else {
        roots.push(cat);
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
    }

    return this.#repo.update('categories', id, parsed.data);
  }

  async delete(id, currentUser) {
    this.#requireAdmin(currentUser);
    const existing = await this.#repo.getById('categories', id);
    if (!existing) throw new NotFoundError('Category');

    // Rule 1: Cannot delete if it has children
    const { total: childCount } = await this.#repo.getAll('categories', { filters: { parent_id: id } });
    if (childCount > 0) {
      throw new ValidationError({ id: ['Cannot delete a category that has subcategories'] });
    }

    // Rule 2: Cannot delete if it has questions
    const { total: questionCount } = await this.#repo.getAll('questions', { filters: { category_id: id } });
    if (questionCount > 0) {
      throw new ValidationError({ id: ['Cannot delete a category that contains questions'] });
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
    if (!user || ![ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(user.role)) {
      throw new ForbiddenError();
    }
  }
}
