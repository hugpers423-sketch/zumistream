import { prisma } from '../index.js';
import { logger } from '../utils/logger.js';

export const auditMiddleware = async (req, res, next) => {
  const originalSend = res.send;
  let responseBody;

  res.send = function (body) {
    responseBody = body;
    return originalSend.call(this, body);
  };

  res.on('finish', async () => {
    if (req.user && req.method !== 'GET') {
      try {
        await prisma.auditLog.create({
          data: {
            action: `${req.method} ${req.route?.path || req.path}`,
            entityType: getEntityType(req.path),
            entityId: getEntityId(req),
            oldData: req.oldData || null,
            newData: responseBody ? JSON.parse(responseBody) : null,
            ipAddress: req.ip || req.headers['x-forwarded-for'] || 'unknown',
            userAgent: req.headers['user-agent'] || 'unknown',
            userId: req.user.id,
          },
        });
      } catch (error) {
        logger.error('Audit log error:', error);
      }
    }
  });

  next();
};

const getEntityType = (path) => {
  if (path.includes('/users')) return 'User';
  if (path.includes('/subscriptions')) return 'Subscription';
  if (path.includes('/providers')) return 'Provider';
  if (path.includes('/transactions')) return 'Transaction';
  if (path.includes('/orders')) return 'Order';
  if (path.includes('/commissions')) return 'Commission';
  return 'Unknown';
};

const getEntityId = (req) => {
  return req.params.id || req.body.id || req.query.id || null;
};