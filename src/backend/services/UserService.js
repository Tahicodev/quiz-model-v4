import bcrypt from 'bcrypt';
import { prisma } from '../prisma.js';
import { AppError } from '../../shared/errors.js';

export class UserService {
  static async list(tenantId) {
    return prisma.user.findMany({
      where: { school_id: tenantId },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        numero: true,
        status: true,
        class_id: true,
        last_login: true,
        created_at: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  static async getById(tenantId, id) {
    const user = await prisma.user.findFirst({
      where: { id, school_id: tenantId },
      include: { class: true },
    });
    if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');
    const { password_hash, ...rest } = user;
    return rest;
  }

  static async create(tenantId, data) {
    const existing = await prisma.user.findUnique({ where: { username: data.username } });
    if (existing) {
      throw new AppError('Username already taken', 400, 'USERNAME_TAKEN');
    }

    const password_hash = await bcrypt.hash(data.password, 10);
    
    const user = await prisma.user.create({
      data: {
        school_id: tenantId,
        username: data.username,
        name: data.name,
        password_hash,
        role: data.role || 'student',
        numero: data.numero,
        class_id: data.class_id,
        status: data.status || 'active',
      },
    });

    const { password_hash: _, ...rest } = user;
    return rest;
  }

  static async update(tenantId, id, data) {
    const user = await this.getById(tenantId, id); // validates exists and tenant

    const updateData = { ...data };
    if (updateData.password) {
      updateData.password_hash = await bcrypt.hash(updateData.password, 10);
      delete updateData.password;
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    const { password_hash: _, ...rest } = updated;
    return rest;
  }

  static async delete(tenantId, id) {
    await this.getById(tenantId, id); // validate
    await prisma.user.delete({ where: { id } });
  }
}
