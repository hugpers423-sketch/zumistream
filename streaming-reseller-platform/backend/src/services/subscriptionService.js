import { prisma } from '../index.js';
import { AppError, NotFoundError, ForbiddenError } from '../utils/AppError.js';
import { providerService } from './providerService.js';

export const subscriptionService = {
  async getSubscriptions(filters = {}, pagination = {}, requester) {
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = pagination;
    const { status, userId, resellerId, providerId, search } = filters;

    const where = {};

    if (requester.role !== 'SUPER_ADMIN' && requester.role !== 'ADMIN') {
      if (requester.role === 'SUPER_RESELLER' || requester.role === 'SUB_RESELLER') {
        where.resellerId = requester.id;
      } else {
        where.userId = requester.id;
      }
    } else {
      if (userId) where.userId = userId;
      if (resellerId) where.resellerId = resellerId;
    }

    if (providerId) where.providerId = providerId;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { username: { contains: search, mode: 'insensitive' } },
        { user: { fullName: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [subscriptions, total] = await Promise.all([
      prisma.subscription.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          user: { select: { id: true, fullName: true, email: true, phone: true } },
          reseller: { select: { id: true, fullName: true, email: true } },
          provider: { select: { id: true, name: true, type: true } },
        },
      }),
      prisma.subscription.count({ where }),
    ]);

    return {
      data: subscriptions,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },

  async getSubscriptionById(id, requester) {
    const subscription = await prisma.subscription.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, fullName: true, email: true, phone: true, role: true } },
        reseller: { select: { id: true, fullName: true, email: true } },
        provider: true,
      },
    });

    if (!subscription) throw new NotFoundError('Subscription');

    if (requester.role !== 'SUPER_ADMIN' && requester.role !== 'ADMIN') {
      if (subscription.userId !== requester.id && subscription.resellerId !== requester.id) {
        throw new ForbiddenError('Access denied');
      }
    }

    return subscription;
  },

  async createSubscription(data, requester) {
    const { userId, providerId, durationMonths = 1, connections = 1, bouquetIds = [], creditsUsed } = data;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User');

    const provider = await prisma.provider.findUnique({ where: { id: providerId } });
    if (!provider) throw new NotFoundError('Provider');

    if (requester.role !== 'SUPER_ADMIN' && requester.role !== 'ADMIN') {
      if (user.parentId !== requester.id && user.id !== requester.id) {
        throw new ForbiddenError('Can only create subscriptions for own customers');
      }
      if (!requester.allowedProviders?.includes(providerId)) {
        throw new ForbiddenError('Provider not allowed for this reseller');
      }
    }

    const requiredCredits = this.calculateCredits(durationMonths, connections);
    if (creditsUsed && creditsUsed !== requiredCredits) {
      throw new AppError('Invalid credits amount', 400);
    }

    if (requester.credits < requiredCredits) {
      throw new AppError('Insufficient credits', 400);
    }

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + durationMonths);

    const subscription = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: requester.id },
        data: { credits: { decrement: requiredCredits } },
      });

      const subscription = await tx.subscription.create({
        data: {
          username: this.generateUsername(),
          password: this.generatePassword(),
          userId,
          resellerId: requester.id,
          providerId,
          durationMonths,
          connections,
          expiresAt,
          creditsUsed: requiredCredits,
          bouquetIds,
          status: 'PENDING_PAYMENT',
        },
      });

      await tx.transaction.create({
        data: {
          type: 'SUBSCRIPTION_CREATE',
          status: 'PENDING',
          amount: requiredCredits,
          currency: 'PEN',
          userId: requester.id,
          subscriptionId: subscription.id,
          description: `Create subscription: ${durationMonths} month(s), ${connections} connection(s)`,
        },
      });

      return subscription;
    });

    const providerLine = await providerService.createSubscriptionLine(providerId, {
      username: subscription.username,
      password: subscription.password,
      duration_months: durationMonths,
      max_connections: connections,
      bouquet_ids: bouquetIds.join(','),
    });

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        providerLineId: providerLine.line_id || providerLine.id,
        m3uUrl: providerLine.m3u_url,
        xtreamUrl: providerLine.xtream_url,
        status: 'ACTIVE',
        activatedAt: new Date(),
      },
    });

    await prisma.transaction.updateMany({
      where: { subscriptionId: subscription.id, type: 'SUBSCRIPTION_CREATE' },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });

    return this.getSubscriptionById(subscription.id, requester);
  },

  async renewSubscription(id, durationMonths, requester) {
    const subscription = await this.getSubscriptionById(id, requester);

    const requiredCredits = this.calculateCredits(durationMonths, subscription.connections);
    if (requester.credits < requiredCredits) {
      throw new AppError('Insufficient credits', 400);
    }

    const newExpiresAt = subscription.expiresAt > new Date()
      ? new Date(subscription.expiresAt)
      : new Date();
    newExpiresAt.setMonth(newExpiresAt.getMonth() + durationMonths);

    const updated = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: requester.id },
        data: { credits: { decrement: requiredCredits } },
      });

      const updated = await tx.subscription.update({
        where: { id },
        data: {
          expiresAt: newExpiresAt,
          durationMonths: subscription.durationMonths + durationMonths,
          creditsUsed: { increment: requiredCredits },
          status: 'ACTIVE',
        },
      });

      await tx.transaction.create({
        data: {
          type: 'SUBSCRIPTION_RENEW',
          status: 'COMPLETED',
          amount: requiredCredits,
          currency: 'PEN',
          userId: requester.id,
          subscriptionId: id,
          description: `Renew subscription: ${durationMonths} month(s)`,
          completedAt: new Date(),
        },
      });

      return updated;
    });

    await providerService.callProviderAPI(
      await prisma.provider.findUnique({ where: { id: subscription.providerId } }),
      'GET',
      '/player_api.php',
      { action: 'renew_line', line_id: subscription.providerLineId, duration_months: durationMonths }
    );

    return this.getSubscriptionById(id, requester);
  },

  async upgradeSubscription(id, newConnections, requester) {
    const subscription = await this.getSubscriptionById(id, requester);

    if (newConnections <= subscription.connections) {
      throw new AppError('New connections must be greater than current', 400);
    }

    const additionalCredits = this.calculateCredits(
      subscription.durationMonths,
      newConnections - subscription.connections
    );

    if (requester.credits < additionalCredits) {
      throw new AppError('Insufficient credits', 400);
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: requester.id },
        data: { credits: { decrement: additionalCredits } },
      });

      const updated = await tx.subscription.update({
        where: { id },
        data: {
          connections: newConnections,
          maxConnections: newConnections,
          creditsUsed: { increment: additionalCredits },
        },
      });

      await tx.transaction.create({
        data: {
          type: 'SUBSCRIPTION_UPGRADE',
          status: 'COMPLETED',
          amount: additionalCredits,
          currency: 'PEN',
          userId: requester.id,
          subscriptionId: id,
          description: `Upgrade subscription: ${subscription.connections} -> ${newConnections} connections`,
          completedAt: new Date(),
        },
      });

      return updated;
    });

    await providerService.callProviderAPI(
      await prisma.provider.findUnique({ where: { id: subscription.providerId } }),
      'GET',
      '/player_api.php',
      { action: 'update_line', line_id: subscription.providerLineId, max_connections: newConnections }
    );

    return this.getSubscriptionById(id, requester);
  },

  async suspendSubscription(id, requester) {
    const subscription = await this.getSubscriptionById(id, requester);

    await prisma.subscription.update({
      where: { id },
      data: { status: 'SUSPENDED' },
    });

    await providerService.callProviderAPI(
      await prisma.provider.findUnique({ where: { id: subscription.providerId } }),
      'GET',
      '/player_api.php',
      { action: 'suspend_line', line_id: subscription.providerLineId }
    );

    return { message: 'Subscription suspended' };
  },

  async activateSubscription(id, requester) {
    const subscription = await this.getSubscriptionById(id, requester);

    await prisma.subscription.update({
      where: { id },
      data: { status: 'ACTIVE' },
    });

    await providerService.callProviderAPI(
      await prisma.provider.findUnique({ where: { id: subscription.providerId } }),
      'GET',
      '/player_api.php',
      { action: 'activate_line', line_id: subscription.providerLineId }
    );

    return { message: 'Subscription activated' };
  },

  async createTrialSubscription(userId, providerId, requester) {
    const provider = await prisma.provider.findUnique({ where: { id: providerId } });
    if (!provider || !provider.trialEnabled) {
      throw new AppError('Trial not available for this provider', 400);
    }

    const todayTrials = await prisma.subscription.count({
      where: {
        resellerId: requester.id,
        status: 'TRIAL',
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    });

    if (todayTrials >= provider.trialLimitPerDay) {
      throw new AppError('Daily trial limit reached', 400);
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + provider.trialDuration);

    const subscription = await prisma.subscription.create({
      data: {
        username: this.generateUsername('trial'),
        password: this.generatePassword(),
        userId,
        resellerId: requester.id,
        providerId,
        durationMonths: 0,
        connections: 1,
        expiresAt,
        creditsUsed: 0,
        status: 'TRIAL',
        trialUsed: true,
      },
    });

    const providerLine = await providerService.createSubscriptionLine(providerId, {
      username: subscription.username,
      password: subscription.password,
      duration_hours: provider.trialDuration,
      max_connections: 1,
    });

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        providerLineId: providerLine.line_id || providerLine.id,
        m3uUrl: providerLine.m3u_url,
        xtreamUrl: providerLine.xtream_url,
      },
    });

    await prisma.transaction.create({
      data: {
        type: 'TRIAL_USED',
        status: 'COMPLETED',
        amount: 0,
        currency: 'PEN',
        userId: requester.id,
        subscriptionId: subscription.id,
        description: `Trial created: ${provider.trialDuration} hours`,
        completedAt: new Date(),
      },
    });

    return this.getSubscriptionById(subscription.id, requester);
  },

  async getSubscriptionCredentials(id, requester) {
    const subscription = await this.getSubscriptionById(id, requester);

    return {
      username: subscription.username,
      password: subscription.password,
      m3uUrl: subscription.m3uUrl,
      xtreamUrl: subscription.xtreamUrl,
      expiresAt: subscription.expiresAt,
      connections: subscription.connections,
      status: subscription.status,
      provider: subscription.provider.name,
    };
  },

  async getExpiringSubscriptions(days = 7, requester) {
    const where = {
      status: 'ACTIVE',
      expiresAt: {
        lte: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
        gt: new Date(),
      },
    };

    if (requester.role !== 'SUPER_ADMIN' && requester.role !== 'ADMIN') {
      where.resellerId = requester.id;
    }

    return prisma.subscription.findMany({
      where,
      include: {
        user: { select: { id: true, fullName: true, email: true, phone: true } },
        provider: { select: { id: true, name: true } },
      },
      orderBy: { expiresAt: 'asc' },
    });
  },

  calculateCredits(durationMonths, connections) {
    const baseCredits = durationMonths * connections;
    return Math.round(baseCredits * 100) / 100;
  },

  generateUsername(prefix = 'user') {
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${random}`;
  },

  generatePassword(length = 10) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < length; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  },
};