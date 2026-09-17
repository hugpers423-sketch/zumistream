import { prisma } from '../index.js';
import { AppError, NotFoundError } from '../utils/AppError.js';

export const commissionService = {
  async getCommissions(filters = {}, pagination = {}, requester) {
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = pagination;
    const { status, fromUserId, level, startDate, endDate } = filters;

    const where = {};

    if (requester.role !== 'SUPER_ADMIN' && requester.role !== 'ADMIN') {
      where.userId = requester.id;
    } else {
      if (fromUserId) where.fromUserId = fromUserId;
    }

    if (status) where.status = status;
    if (level) where.level = level;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [commissions, total] = await Promise.all([
      prisma.commission.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          user: { select: { id: true, fullName: true, email: true } },
          fromUser: { select: { id: true, fullName: true, email: true } },
          transaction: { select: { id: true, type: true, amount: true } },
          subscription: { select: { id: true, username: true } },
        },
      }),
      prisma.commission.count({ where }),
    ]);

    return {
      data: commissions,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },

  async getCommissionById(id, requester) {
    const commission = await prisma.commission.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        fromUser: { select: { id: true, fullName: true, email: true } },
        transaction: true,
        subscription: true,
        order: true,
      },
    });

    if (!commission) throw new NotFoundError('Commission');

    if (requester.role !== 'SUPER_ADMIN' && requester.role !== 'ADMIN') {
      if (commission.userId !== requester.id) {
        throw new AppError('Access denied', 403);
      }
    }

    return commission;
  },

  async getCommissionStats(requester) {
    const where = requester.role === 'SUPER_ADMIN' || requester.role === 'ADMIN'
      ? {}
      : { userId: requester.id };

    const [totalEarned, pending, paid, thisMonth, byLevel] = await Promise.all([
      prisma.commission.aggregate({ where: { ...where, status: 'COMPLETED' }, _sum: { amount: true } }),
      prisma.commission.aggregate({ where: { ...where, status: 'PENDING' }, _sum: { amount: true } }),
      prisma.commission.aggregate({ where: { ...where, status: 'PAID' }, _sum: { amount: true } }),
      prisma.commission.aggregate({
        where: {
          ...where,
          status: 'COMPLETED',
          createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
        },
        _sum: { amount: true },
      }),
      prisma.commission.groupBy({
        by: ['level'],
        where: { ...where, status: 'COMPLETED' },
        _sum: { amount: true },
        _count: { id: true },
      }),
    ]);

    return {
      totalEarned: Number(totalEarned._sum.amount || 0),
      pending: Number(pending._sum.amount || 0),
      paid: Number(paid._sum.amount || 0),
      thisMonth: Number(thisMonth._sum.amount || 0),
      byLevel: byLevel.map(l => ({
        level: l.level,
        total: Number(l._sum.amount || 0),
        count: l._count.id,
      })),
    };
  },

  async payCommissions(commissionIds, requester) {
    if (requester.role !== 'SUPER_ADMIN' && requester.role !== 'ADMIN') {
      throw new AppError('Only admins can pay commissions', 403);
    }

    const commissions = await prisma.commission.findMany({
      where: { id: { in: commissionIds }, status: 'COMPLETED' },
    });

    if (commissions.length === 0) {
      throw new AppError('No valid commissions to pay', 400);
    }

    const totalAmount = commissions.reduce((sum, c) => sum + Number(c.amount), 0);

    await prisma.$transaction(async (tx) => {
      await tx.commission.updateMany({
        where: { id: { in: commissionIds } },
        data: { status: 'PAID', paidAt: new Date() },
      });

      for (const commission of commissions) {
        await tx.transaction.create({
          data: {
            type: 'COMMISSION_PAID',
            status: 'COMPLETED',
            amount: commission.amount,
            currency: 'PEN',
            userId: commission.userId,
            fromUserId: requester.id,
            description: `Commission payment: ${commission.id}`,
            completedAt: new Date(),
          },
        });

        await tx.notification.create({
          data: {
            userId: commission.userId,
            type: 'COMMISSION_PAID',
            title: 'Comisión pagada',
            message: `Se ha pagado una comisión de ${commission.amount} PEN`,
            data: { commissionId: commission.id, amount: commission.amount },
          },
        });
      }
    });

    return { message: `${commissions.length} commissions paid`, totalAmount };
  },

  async getCommissionReport(filters = {}, requester) {
    const { startDate, endDate, groupBy = 'day' } = filters;

    const where = requester.role === 'SUPER_ADMIN' || requester.role === 'ADMIN'
      ? {}
      : { userId: requester.id };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const commissions = await prisma.commission.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: {
        fromUser: { select: { id: true, fullName: true, email: true } },
      },
    });

    const grouped = this.groupCommissions(commissions, groupBy);

    return {
      summary: {
        total: commissions.reduce((sum, c) => sum + Number(c.amount), 0),
        count: commissions.length,
        byStatus: this.groupByStatus(commissions),
        byLevel: this.groupByLevel(commissions),
      },
      timeline: grouped,
      topReferrers: this.getTopReferrers(commissions),
    };
  },

  groupCommissions(commissions, groupBy) {
    const groups = {};

    for (const commission of commissions) {
      const date = new Date(commission.createdAt);
      let key;

      switch (groupBy) {
        case 'hour':
          key = date.toISOString().slice(0, 13);
          break;
        case 'day':
          key = date.toISOString().slice(0, 10);
          break;
        case 'week':
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = weekStart.toISOString().slice(0, 10);
          break;
        case 'month':
          key = date.toISOString().slice(0, 7);
          break;
        default:
          key = date.toISOString().slice(0, 10);
      }

      if (!groups[key]) {
        groups[key] = { period: key, total: 0, count: 0, byLevel: {} };
      }

      groups[key].total += Number(commission.amount);
      groups[key].count += 1;
      groups[key].byLevel[commission.level] = (groups[key].byLevel[commission.level] || 0) + Number(commission.amount);
    }

    return Object.values(groups).sort((a, b) => a.period.localeCompare(b.period));
  },

  groupByStatus(commissions) {
    const groups = {};
    for (const c of commissions) {
      groups[c.status] = (groups[c.status] || 0) + Number(c.amount);
    }
    return groups;
  },

  groupByLevel(commissions) {
    const groups = {};
    for (const c of commissions) {
      groups[c.level] = (groups[c.level] || 0) + Number(c.amount);
    }
    return groups;
  },

  getTopReferrers(commissions, limit = 10) {
    const referrerMap = {};

    for (const c of commissions) {
      const key = c.fromUserId;
      if (!referrerMap[key]) {
        referrerMap[key] = {
          user: c.fromUser,
          total: 0,
          count: 0,
          levels: {},
        };
      }
      referrerMap[key].total += Number(c.amount);
      referrerMap[key].count += 1;
      referrerMap[key].levels[c.level] = (referrerMap[key].levels[c.level] || 0) + Number(c.amount);
    }

    return Object.values(referrerMap)
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);
  },

  async simulateCommissionEarnings(userId, months = 12) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { children: true },
    });

    if (!user) throw new NotFoundError('User');

    const scenarios = {
      conservative: { monthlyReferrals: 2, avgCreditsPerSale: 12, conversionRate: 0.3 },
      realistic: { monthlyReferrals: 5, avgCreditsPerSale: 12, conversionRate: 0.5 },
      optimistic: { monthlyReferrals: 10, avgCreditsPerSale: 24, conversionRate: 0.7 },
    };

    const results = {};

    for (const [scenario, params] of Object.entries(scenarios)) {
      let totalCredits = 0;
      let totalCommissions = 0;
      let downline = user.children.length;

      for (let month = 1; month <= months; month++) {
        const newReferrals = Math.floor(params.monthlyReferrals * params.conversionRate);
        const creditsFromSales = newReferrals * params.avgCreditsPerSale;
        const commissionFromSales = (creditsFromSales * Number(user.commissionRate)) / 100;

        downline += newReferrals;
        const downlineCommissions = downline * 5 * (Number(user.commissionRate) / 100) * 0.5;

        totalCredits += creditsFromSales;
        totalCommissions += commissionFromSales + downlineCommissions;
      }

      results[scenario] = {
        totalCredits,
        totalCommissions: Math.round(totalCommissions * 100) / 100,
        estimatedDownline: downline,
        monthlyAverage: Math.round((totalCommissions / months) * 100) / 100,
      };
    }

    return results;
  },
};