import { prisma } from '../index.js';
import { AppError, NotFoundError } from '../utils/AppError.js';

export const providerService = {
  async getProviders(filters = {}, pagination = {}) {
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = pagination;
    const { type, isActive, search } = filters;

    const where = {};
    if (type) where.type = type;
    if (isActive !== undefined) where.isActive = isActive === 'true';
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { apiUrl: { contains: search } },
      ];
    }

    const [providers, total] = await Promise.all([
      prisma.provider.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          _count: { select: { subscriptions: true, users: true } },
        },
      }),
      prisma.provider.count({ where }),
    ]);

    return {
      data: providers,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },

  async getProviderById(id) {
    const provider = await prisma.provider.findUnique({
      where: { id },
      include: {
        _count: { select: { subscriptions: true, users: true } },
        creditPackages: true,
      },
    });

    if (!provider) throw new NotFoundError('Provider');
    return provider;
  },

  async createProvider(data) {
    const provider = await prisma.provider.create({
      data: {
        ...data,
        creditPackages: data.creditPackages || [],
      },
    });
    return provider;
  },

  async updateProvider(id, data) {
    const provider = await prisma.provider.findUnique({ where: { id } });
    if (!provider) throw new NotFoundError('Provider');

    return prisma.provider.update({
      where: { id },
      data,
    });
  },

  async deleteProvider(id) {
    const provider = await prisma.provider.findUnique({ where: { id } });
    if (!provider) throw new NotFoundError('Provider');

    await prisma.provider.delete({ where: { id } });
    return { message: 'Provider deleted successfully' };
  },

  async testConnection(id) {
    const provider = await prisma.provider.findUnique({ where: { id } });
    if (!provider) throw new NotFoundError('Provider');

    try {
      const response = await this.callProviderAPI(provider, 'GET', '/player_api.php', {
        action: 'get_server_info',
      });

      await prisma.provider.update({
        where: { id },
        data: {
          lastSyncAt: new Date(),
          lastError: null,
          uptime: 100,
        },
      });

      return { success: true, data: response };
    } catch (error) {
      await prisma.provider.update({
        where: { id },
        data: { lastError: error.message },
      });

      await this.logProviderAction(id, 'test_connection', 'failed', null, { error: error.message });

      return { success: false, error: error.message };
    }
  },

  async syncProvider(id) {
    const provider = await prisma.provider.findUnique({ where: { id } });
    if (!provider) throw new NotFoundError('Provider');

    try {
      const [channels, vod, series] = await Promise.all([
        this.callProviderAPI(provider, 'GET', '/player_api.php', { action: 'get_live_categories' }),
        this.callProviderAPI(provider, 'GET', '/player_api.php', { action: 'get_vod_categories' }),
        this.callProviderAPI(provider, 'GET', '/player_api.php', { action: 'get_series_categories' }),
      ]);

      const countries = [...new Set([
        ...channels.map(c => c.country).filter(Boolean),
        ...vod.map(v => v.country).filter(Boolean),
        ...series.map(s => s.country).filter(Boolean),
      ])];

      const categories = [...new Set([
        ...channels.map(c => c.category_name).filter(Boolean),
        ...vod.map(v => v.category_name).filter(Boolean),
        ...series.map(s => s.category_name).filter(Boolean),
      ])];

      await prisma.provider.update({
        where: { id },
        data: {
          channelsCount: channels.length,
          vodCount: vod.length,
          seriesCount: series.length,
          countries,
          categories,
          lastSyncAt: new Date(),
          lastError: null,
        },
      });

      await this.logProviderAction(id, 'sync', 'success', { channels: channels.length, vod: vod.length, series: series.length });

      return { success: true, channels: channels.length, vod: vod.length, series: series.length };
    } catch (error) {
      await prisma.provider.update({
        where: { id },
        data: { lastError: error.message },
      });

      await this.logProviderAction(id, 'sync', 'failed', null, { error: error.message });

      throw error;
    }
  },

  async callProviderAPI(provider, method, endpoint, params = {}) {
    const url = new URL(`${provider.apiUrl}${endpoint}`);
    url.searchParams.append('username', provider.username || '');
    url.searchParams.append('password', provider.password || '');

    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    const response = await fetch(url.toString(), {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': provider.apiKey,
      },
      timeout: 10000,
    });

    if (!response.ok) {
      throw new Error(`Provider API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  },

  async createSubscriptionLine(providerId, data) {
    const provider = await prisma.provider.findUnique({ where: { id: providerId } });
    if (!provider) throw new NotFoundError('Provider');

    const response = await this.callProviderAPI(provider, 'GET', '/player_api.php', {
      action: 'create_line',
      ...data,
    });

    await this.logProviderAction(providerId, 'create_line', 'success', data, response);

    return response;
  },

  async logProviderAction(providerId, action, status, request, response, error = null) {
    await prisma.providerLog.create({
      data: { providerId, action, status, request, response, error },
    });
  },

  async getProviderStats(providerId) {
    const provider = await prisma.provider.findUnique({ where: { id: providerId } });
    if (!provider) throw new NotFoundError('Provider');

    const [activeSubscriptions, totalCreditsUsed, revenue, logs] = await Promise.all([
      prisma.subscription.count({ where: { providerId, status: 'ACTIVE' } }),
      prisma.subscription.aggregate({ where: { providerId }, _sum: { creditsUsed: true } }),
      prisma.transaction.aggregate({
        where: { subscription: { providerId }, type: 'SUBSCRIPTION_CREATE', status: 'COMPLETED' },
        _sum: { amount: true },
      }),
      prisma.providerLog.findMany({
        where: { providerId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

    return {
      provider: {
        id: provider.id,
        name: provider.name,
        type: provider.type,
        isActive: provider.isActive,
        uptime: provider.uptime,
        lastSyncAt: provider.lastSyncAt,
      },
      stats: {
        activeSubscriptions,
        totalCreditsUsed: Number(totalCreditsUsed._sum.creditsUsed || 0),
        revenue: Number(revenue._sum.amount || 0),
        channelsCount: provider.channelsCount,
        vodCount: provider.vodCount,
        seriesCount: provider.seriesCount,
      },
      recentLogs: logs,
    };
  },

  async assignProviderToReseller(resellerId, providerId, allowed = true) {
    const reseller = await prisma.user.findUnique({ where: { id: resellerId } });
    if (!reseller) throw new NotFoundError('Reseller');

    const current = reseller.allowedProviders || [];
    if (allowed) {
      if (!current.includes(providerId)) {
        current.push(providerId);
      }
    } else {
      const index = current.indexOf(providerId);
      if (index > -1) current.splice(index, 1);
    }

    return prisma.user.update({
      where: { id: resellerId },
      data: { allowedProviders: current },
    });
  },
};