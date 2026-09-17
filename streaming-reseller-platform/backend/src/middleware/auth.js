import { config } from '../config/index.js';
import jwt from 'jsonwebtoken';
import { prisma } from '../index.js';
import { AppError } from '../utils/AppError.js';

export const authMiddleware = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization?.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.token) {
      token = req.cookies.token;
    }

    if (!token) {
      throw new AppError('Not authorized, no token provided', 401);
    }

    const decoded = jwt.verify(token, config.jwt.secret);

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
        credits: true,
        commissionRate: true,
        commissionType: true,
        parentId: true,
        brandName: true,
        brandLogo: true,
        whiteLabelEnabled: true,
        twoFactorEnabled: true,
        language: true,
        timezone: true,
      },
    });

    if (!user) {
      throw new AppError('User not found', 401);
    }

    if (user.status !== 'ACTIVE') {
      throw new AppError('Account is not active', 403);
    }

    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return next(new AppError('Invalid token', 401));
    }
    if (error.name === 'TokenExpiredError') {
      return next(new AppError('Token expired', 401));
    }
    next(error);
  }
};

export const optionalAuth = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization?.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.token) {
      token = req.cookies.token;
    }

    if (token) {
      const decoded = jwt.verify(token, config.jwt.secret);
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          status: true,
        },
      });
      if (user && user.status === 'ACTIVE') {
        req.user = user;
      }
    }
    next();
  } catch {
    next();
  }
};

export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Not authorized', 401));
    }
    if (!roles.includes(req.user.role)) {
      return next(new AppError('Insufficient permissions', 403));
    }
    next();
  };
};

export const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Not authorized', 401));
    }
    const permissions = getRolePermissions(req.user.role);
    if (!permissions.includes(permission) && !permissions.includes('*')) {
      return next(new AppError('Insufficient permissions', 403));
    }
    next();
  };
};

const getRolePermissions = (role) => {
  const permissions = {
    SUPER_ADMIN: ['*'],
    ADMIN: [
      'users:read', 'users:write', 'users:delete',
      'providers:read', 'providers:write', 'providers:delete',
      'subscriptions:read', 'subscriptions:write', 'subscriptions:delete',
      'transactions:read', 'transactions:write',
      'commissions:read', 'commissions:write',
      'orders:read', 'orders:write',
      'analytics:read',
      'settings:read', 'settings:write',
      'support:read', 'support:write',
    ],
    SUPER_RESELLER: [
      'users:read', 'users:write',
      'subscriptions:read', 'subscriptions:write',
      'transactions:read',
      'commissions:read',
      'orders:read',
      'analytics:read',
      'support:read', 'support:write',
    ],
    SUB_RESELLER: [
      'subscriptions:read', 'subscriptions:write',
      'transactions:read',
      'commissions:read',
      'orders:read',
      'support:read', 'support:write',
    ],
    PROVIDER: [
      'subscriptions:read',
      'transactions:read',
    ],
    CUSTOMER: [
      'subscriptions:read',
      'orders:read',
      'support:read', 'support:write',
    ],
  };
  return permissions[role] || [];
};

export const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );

  const refreshToken = jwt.sign(
    { id: user.id, type: 'refresh' },
    config.jwt.secret,
    { expiresIn: config.jwt.refreshExpiresIn }
  );

  return { accessToken, refreshToken };
};

export const verifyRefreshToken = (token) => {
  return jwt.verify(token, config.jwt.secret);
};

export const hashPassword = async (password) => {
  const bcrypt = await import('bcryptjs');
  return bcrypt.hash(password, config.bcryptRounds);
};

export const comparePassword = async (password, hash) => {
  const bcrypt = await import('bcryptjs');
  return bcrypt.compare(password, hash);
};