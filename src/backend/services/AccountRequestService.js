/**
 * src/backend/services/AccountRequestService.js
 * Anonymous signup requests; admin approval materializes a real User.
 */

import bcrypt from 'bcrypt';
import { NotFoundError, ForbiddenError, ValidationError } from '../../shared/errors.js';
import { ROLES } from '../../shared/constants.js';

export class AccountRequestService {
  #repo;
  #userSvc;
  constructor(repo, userSvc) { this.#repo = repo; this.#userSvc = userSvc; }

  async submit(schoolId, data) {
    const username = String(data.username || '').trim();
    const fullName = String(data.full_name ?? data.fullName ?? data.name ?? '').trim();
    const password = String(data.password ?? '');
    const studentNumber = String(data.student_number ?? data.studentNumber ?? data.numero ?? '').trim();
    if (!username || !fullName || !password || !studentNumber) {
      throw new ValidationError({
        username: !username ? ['Required'] : undefined,
        full_name: !fullName ? ['Required'] : undefined,
        password: !password ? ['Required'] : undefined,
        student_number: !studentNumber ? ['Required'] : undefined,
      });
    }
    if (password.length < 6) throw new ValidationError({ password: ['Minimum 6 characters'] });

    // Username must not collide with an existing user
    const { total } = await this.#repo.getAll('users', {
      filters: { school_id: schoolId, username }, limit: 1,
    });
    if (total > 0) throw new ValidationError({ username: ['Username already taken'] });

    // Idempotent pending request per username
    const { data: existing } = await this.#repo.getAll('account_requests', {
      filters: { school_id: schoolId, username, status: 'pending' }, limit: 1,
    });
    if (existing.length) throw new ValidationError({ username: ['A pending request already exists for this username'] });

    const passwordHash = await bcrypt.hash(password, 10);
    const model = this.#repo.modelFor('account_requests');
    try {
      return await model.create({
        data: {
          school_id: schoolId,
          full_name: fullName,
          username,
          student_number: studentNumber,
          class_id: data.class_id ?? null,
          class_name: data.class_name ?? data.className ?? null,
          password_hash: passwordHash,
          note: data.note ?? null,
        },
      });
    } catch (err) {
      if (err?.code === 'P2002') {
        throw new ValidationError({ username: ['Username already requested'] });
      }
      throw err;
    }
  }

  async listForCaller(user, { status, limit = 100, offset = 0 } = {}) {
    this.#requireAdmin(user);
    const filters = { school_id: user.school_id };
    if (status) filters.status = status;
    const { data, total } = await this.#repo.getAll('account_requests', {
      filters, limit, offset, orderBy: 'created_at', direction: 'desc',
    });
    // Never leak password hashes
    return { data: data.map(({ password_hash, ...safe }) => safe), total };
  }

  async getOwned(id, user) {
    this.#requireAdmin(user);
    const req = await this.#repo.getById('account_requests', id);
    if (!req || req.school_id !== user.school_id) throw new NotFoundError('AccountRequest');
    return req;
  }

  async approve(id, user, { note = null } = {}) {
    const req = await this.getOwned(id, user);
    if (req.status !== 'pending') throw new ValidationError({ status: ['Request already reviewed'] });

    // Create the user (password already bcrypt-hashed at submit time)
    const created = await this.#repo.modelFor('users').create({
      data: {
        school_id: req.school_id,
        username: req.username,
        password_hash: req.password_hash,
        name: req.full_name,
        role: ROLES.STUDENT,
        status: 'active',
        numero: req.student_number,
        class_id: req.class_id ?? null,
      },
    });

    const reviewed = await this.#repo.update('account_requests', id, {
      status: 'approved',
      reviewer_id: user.id,
      reviewed_at: new Date(),
      review_note: note,
      created_user_id: created.id,
    });

    const { password_hash, ...safe } = reviewed;
    return { request: safe, userId: created.id };
  }

  async reject(id, user, { note = null } = {}) {
    const req = await this.getOwned(id, user);
    if (req.status !== 'pending') throw new ValidationError({ status: ['Request already reviewed'] });
    const reviewed = await this.#repo.update('account_requests', id, {
      status: 'rejected',
      reviewer_id: user.id,
      reviewed_at: new Date(),
      review_note: note,
    });
    const { password_hash, ...safe } = reviewed;
    return safe;
  }

  #requireAdmin(user) {
    if (!user || ![ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(user.role)) throw new ForbiddenError();
  }
}
