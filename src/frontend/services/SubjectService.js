import { ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors.js';
import {
  SubjectCreateSchema,
  SubjectUpdateSchema,
  SubjectFilterSchema,
} from '../../shared/schemas/subject.schema.js';
import { ROLES } from '../../shared/constants.js';

const MANAGE_ROLES = [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.TEACHER];

export class SubjectService {
  #repo;

  constructor(repo) {
    this.#repo = repo;
  }

  #requireManager(user) {
    if (!user || !MANAGE_ROLES.includes(user.role)) throw new ForbiddenError();
  }

  #assertOwnership(subject, user) {
    if (user.role === ROLES.TEACHER && String(subject.created_by) !== String(user.id)) {
      throw new ForbiddenError('Not your subject');
    }
  }

  async list(filters = {}, pagination = {}) {
    const { created_by = undefined, ...restFilters } = filters;
    const parsed = SubjectFilterSchema.safeParse({ ...restFilters, ...pagination });
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);
    const { limit, offset, orderBy, direction, search, ...rest } = parsed.data;
    if (created_by !== undefined) rest.created_by = created_by;
    return this.#repo.getAll('subjects', { filters: rest, limit, offset, orderBy, direction, search });
  }

  async getById(id) {
    const subject = await this.#repo.getById('subjects', id);
    if (!subject) throw new NotFoundError('Subject');
    return subject;
  }

  async assertCanUse(id, user, schoolId = user?.school_id) {
    const subject = await this.getById(id);
    if (String(subject.school_id) !== String(schoolId)) {
      throw new ValidationError({ subject_id: ['Subject does not belong to this school.'] });
    }
    this.#assertOwnership(subject, user);
    return subject;
  }

  async create(data, user) {
    this.#requireManager(user);
    const parsed = SubjectCreateSchema.safeParse(data);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);
    const name = parsed.data.name.trim();
    const { data: existing } = await this.#repo.getAll('subjects', {
      filters: { school_id: user.school_id, created_by: user.id },
      limit: 100000,
    });
    if (existing.some((subject) => subject.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      throw new ValidationError({ name: ['You already have a subject with this name.'] });
    }
    return this.#repo.create('subjects', {
      name,
      school_id: user.school_id,
      created_by: user.id,
    });
  }

  async update(id, data, user) {
    this.#requireManager(user);
    const subject = await this.getById(id);
    if (String(subject.school_id) !== String(user.school_id)) {
      throw new NotFoundError('Subject');
    }
    this.#assertOwnership(subject, user);
    const parsed = SubjectUpdateSchema.safeParse(data);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);
    if (parsed.data.name) {
      const name = parsed.data.name.trim();
      const { data: siblings } = await this.#repo.getAll('subjects', {
        filters: { school_id: subject.school_id, created_by: subject.created_by },
        limit: 100000,
      });
      if (siblings.some((item) => item.id !== id && item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
        throw new ValidationError({ name: ['You already have a subject with this name.'] });
      }
      parsed.data.name = name;
    }
    return this.#repo.update('subjects', id, parsed.data);
  }
}
