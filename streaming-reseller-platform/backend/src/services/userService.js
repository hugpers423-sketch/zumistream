import { prisma } from '../index.js';
import { AppError, NotFoundError, ForbiddenError } from '../utils/AppError.js';
import { hashPassword, comparePassword } from '../middleware/auth.js';

export const userService = {
  async getUsers(filters = {}, pagination = {}, requester) {
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = pagination;
    const { role, status, search, parentId } = filters;

    const where = {};

    if (requester.role !== 'SUPER_ADMIN' && requester.role !== 'ADMIN') {
      where.parentId = requester.id;
    }

    if (role) where.role = role;
    if (status) where.status = status;
    if (parentId) where.parentId = parentId;
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { fullName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: this.getUserSelect(requester.role),
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      prisma.user.count({ where }),
    ]);

    return {
      data: users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async getUserById(id, requester) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: this.getUserSelect(requester.role),
    });

    if (!user) throw new NotFoundError('User');

    if (requester.role !== 'SUPER_ADMIN' && requester.role !== 'ADMIN') {
      if (user.parentId !== requester.id && user.id !== requester.id) {
        throw new ForbiddenError('Access denied');
      }
    }

    return user;
  },

  async createUser(data, requester) {
    if (requester.role !== 'SUPER_ADMIN' && requester.role !== 'ADMIN') {
      if (!['SUPER_RESELLER', 'SUB_RESELLER'].includes(requester.role)) {
        throw new ForbiddenError('Only resellers can create sub-users');
      }
      data.parentId = requester.id;
      data.role = requester.role === 'SUPER_RESELLER' ? 'SUB_RESELLER' : 'CUSTOMER';
    }

    const existingUser = await prisma.user.findUnique({ where: { email: data.email } });
    if (existingUser) throw new AppError('Email already exists', 400);

    const passwordHash = await hashPassword(data.password || 'TempPass123!');
    const referralCode = crypto.randomBytes(6).toString('hex').toUpperCase();

    const user = await prisma.user.create({
      data: {
        ...data,
        passwordHash,
        referralCode,
        status: 'PENDING_VERIFICATION',
        credits: data.credits || 0,
        commissionRate: data.commissionRate || this.getDefaultCommissionRate(data.role),
        commissionType: data.commissionType || 'PERCENTAGE',
        maxSubResellers: data.maxSubResellers || this.getMaxSubResellers(data.role),
      },
      select: this.getUserSelect(requester.role),
    });

    return user;
  },

  async updateUser(id, data, requester) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundError('User');

    if (requester.role !== 'SUPER_ADMIN' && requester.role !== 'ADMIN') {
      if (user.parentId !== requester.id && user.id !== requester.id) {
        throw new ForbiddenError('Access denied');
      }
    }

    const updateData = { ...data };
    if (data.password) {
      updateData.passwordHash = await hashPassword(data.password);
      delete updateData.password;
    }

    if (requester.role !== 'SUPER_ADMIN' && requester.role !== 'ADMIN') {
      delete updateData.role;
      delete updateData.credits;
      delete updateData.commissionRate;
      delete updateData.status;
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
      select: this.getUserSelect(requester.role),
    });

    return updated;
  },

  async deleteUser(id, requester) {
    if (requester.role !== 'SUPER_ADMIN' && requester.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can delete users');
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundError('User');

    await prisma.user.delete({ where: { id } });
    return { message: 'User deleted successfully' };
  },

  async rechargeCredits(userId, amount, requester, paymentData = {}) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User');

    if (requester.role !== 'SUPER_ADMIN' && requester.role !== 'ADMIN') {
      if (user.parentId !== requester.id && user.id !== requester.id) {
        throw new ForbiddenError('Can only recharge own or direct children credits');
      }
    }

    const transaction = await prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          credits: { increment: amount },
          totalCreditsPurchased: { increment: amount },
        },
      });

      const transaction = await tx.transaction.create({
        data: {
          type: 'CREDIT_PURCHASE',
          status: 'COMPLETED',
          amount,
          currency: 'PEN',
          userId,
          fromUserId: requester.id,
          description: `Credit recharge: ${amount} credits`,
          paymentMethod: paymentData.method || 'YAPE',
          paymentReference: paymentData.reference,
          gatewayResponse: paymentData.gatewayResponse,
          completedAt: new Date(),
        },
      });

      return { user: updatedUser, transaction };
    });

    await this.checkAndTriggerCommissions(userId, amount, requester.id);

    return transaction;
  },

  async transferCredits(fromUserId, toUserId, amount, requester) {
    const fromUser = await prisma.user.findUnique({ where: { id: fromUserId } });
    const toUser = await prisma.user.findUnique({ where: { id: toUserId } });

    if (!fromUser || !toUser) throw new NotFoundError('User');
    if (fromUser.credits < amount) throw new AppError('Insufficient credits', 400);

    if (requester.role !== 'SUPER_ADMIN' && requester.role !== 'ADMIN') {
      if (fromUser.id !== requester.id && fromUser.parentId !== requester.id) {
        throw new ForbiddenError('Can only transfer from own or direct children accounts');
      }
      if (toUser.parentId !== fromUser.id && toUser.id !== fromUser.id) {
        throw new ForbiddenError('Can only transfer to direct children or self');
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: fromUserId },
        data: { credits: { decrement: amount } },
      });

      await tx.user.update({
        where: { id: toUserId },
        data: { credits: { increment: amount } },
      });

      const transaction = await tx.transaction.create({
        data: {
          type: 'CREDIT_TRANSFER',
          status: 'COMPLETED',
          amount,
          currency: 'PEN',
          userId: fromUserId,
          fromUserId,
          toUserId,
          description: `Credit transfer: ${amount} credits to ${toUser.fullName}`,
          completedAt: new Date(),
        },
      });

      return transaction;
    });

    return result;
  },

  async getHierarchy(userId, requester) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User');

    if (requester.role !== 'SUPER_ADMIN' && requester.role !== 'ADMIN') {
      if (user.id !== requester.id) {
        throw new ForbiddenError('Can only view own hierarchy');
      }
    }

    const children = await prisma.user.findMany({
      where: { parentId: userId },
      select: this.getUserSelect(requester.role),
    });

    const descendants = await this.getAllDescendants(userId);

    return {
      user: this.sanitizeUser(user),
      children,
      totalDescendants: descendants.length,
      totalCredits: descendants.reduce((sum, u) => sum + Number(u.credits), 0) + Number(user.credits),
    };
  },

  async getAllDescendants(userId) {
    const descendants = [];
    const queue = [userId];

    while (queue.length > 0) {
      const currentId = queue.shift();
      const children = await prisma.user.findMany({
        where: { parentId: currentId },
        select: { id: true, credits: true },
      });

      for (const child of children) {
        descendants.push(child);
        queue.push(child.id);
      }
    }

    return descendants;
  },

  async getStats(userId, requester) {
    const where = requester.role === 'SUPER_ADMIN' || requester.role === 'ADMIN'
      ? {}
      : { parentId: userId };

    const [totalUsers, activeUsers, totalCredits, totalRevenue, pendingTransactions] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.count({ where: { ...where, status: 'ACTIVE' } }),
      prisma.user.aggregate({ where, _sum: { credits: true } }),
      prisma.transaction.aggregate({
        where: { userId: { in: (await prisma.user.findMany({ where, select: { id: true } })).map(u => u.id) }, type: 'CREDIT_PURCHASE', status: 'COMPLETED' },
        _sum: { amount: true },
      }),
      prisma.transaction.count({ where: { userId: userId, status: 'PENDING' } }),
    ]);

    return {
      totalUsers,
      activeUsers,
      inactiveUsers: totalUsers - activeUsers,
      totalCredits: Number(totalCredits._sum.credits || 0),
      totalRevenue: Number(totalRevenue._sum.amount || 0),
      pendingTransactions,
    };
  },

  getUserSelect(role) {
    const baseSelect = {
      id: true,
      email: true,
      fullName: true,
      phone: true,
      role: true,
      status: true,
      avatar: true,
      credits: true,
      totalCreditsPurchased: true,
      commissionRate: true,
      commissionType: true,
      maxSubResellers: true,
      brandName: true,
      brandLogo: true,
      whiteLabelEnabled: true,
      parentId: true,
      createdAt: true,
      lastLoginAt: true,
    };

    if (role === 'SUPER_ADMIN' || role === 'ADMIN') {
      return {
        ...baseSelect,
        twoFactorEnabled: true,
        emailVerifiedAt: true,
        referralCode: true,
      };
    }

    return baseSelect;
  },

  sanitizeUser(user) {
    const { passwordHash, twoFactorSecret, passwordResetToken, emailVerificationToken, ...safe } = user;
    return safe;
  },

  getDefaultCommissionRate(role) {
    const rates = { SUPER_RESELLER: 15, SUB_RESELLER: 10 };
    return rates[role] || 0;
  },

  getMaxSubResellers(role) {
    const limits = { SUPER_RESELLER: 50, SUB_RESELLER: 10 };
    return limits[role] || 0;
  },

  async checkAndTriggerCommissions(userId, amount, fromUserId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.parentId) return;

    const parent = await prisma.user.findUnique({ where: { id: user.parentId } });
    if (!parent || parent.commissionRate <= 0) return;

    const commissionAmount = (amount * Number(parent.commissionRate)) / 100;

    await prisma.$transaction(async (tx) => {
      await tx.commission.create({
        data: {
          type: parent.commissionType,
          rate: parent.commissionRate,
          amount: commissionAmount,
          status: 'COMPLETED',
          level: 1,
          userId: parent.id,
          fromUserId: userId,
        },
      });

      await tx.user.update({
        where: { id: parent.id },
        data: { credits: { increment: commissionAmount } },
      });

      await tx.transaction.create({
        data: {
          type: 'COMMISSION_EARNED',
          status: 'COMPLETED',
          amount: commissionAmount,
          currency: 'PEN',
          userId: parent.id,
          fromUserId: userId,
          description: `Commission from ${user.fullName}: ${commissionAmount} credits`,
          completedAt: new Date(),
        },
      });
    });

    if (parent.parentId) {
      await this.checkAndTriggerCommissions(parent.id, commissionAmount, userId);
    }
  },
};

import crypto from 'crypto';