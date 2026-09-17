import { prisma } from '../index.js';
import { generateTokens, hashPassword, comparePassword } from '../middleware/auth.js';
import { AppError, ConflictError, UnauthorizedError } from '../utils/AppError.js';
import { sendEmail } from './emailService.js';
import crypto from 'crypto';

export const authService = {
  async register(data) {
    const { email, password, fullName, phone, role = 'CUSTOMER', parentId, referralCode } = data;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictError('Email already registered');
    }

    let parent = null;
    if (parentId) {
      parent = await prisma.user.findUnique({ where: { id: parentId } });
      if (!parent || !['SUPER_RESELLER', 'SUB_RESELLER', 'ADMIN', 'SUPER_ADMIN'].includes(parent.role)) {
        throw new AppError('Invalid parent user', 400);
      }
      if (parent.maxSubResellers > 0) {
        const childrenCount = await prisma.user.count({ where: { parentId: parent.id } });
        if (childrenCount >= parent.maxSubResellers) {
          throw new AppError('Parent has reached maximum sub-resellers limit', 400);
        }
      }
    }

    if (referralCode) {
      const referrer = await prisma.user.findUnique({ where: { referralCode } });
      if (referrer) {
        parent = referrer;
      }
    }

    const passwordHash = await hashPassword(password);
    const referralCode = crypto.randomBytes(6).toString('hex').toUpperCase();

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        phone,
        role,
        parentId: parent?.id,
        referralCode,
        status: role === 'CUSTOMER' ? 'ACTIVE' : 'PENDING_VERIFICATION',
        credits: role === 'CUSTOMER' ? 0 : 10,
        commissionRate: this.getDefaultCommissionRate(role),
        commissionType: 'PERCENTAGE',
        maxSubResellers: this.getMaxSubResellers(role),
      },
    });

    await this.sendWelcomeEmail(user);

    const tokens = generateTokens(user);
    await this.createSession(user.id, tokens.refreshToken);

    return { user: this.sanitizeUser(user), tokens };
  },

  async login(email, password, rememberMe = false) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedError('Invalid credentials');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedError('Account not active. Please verify your email.');
    }

    const isValid = await comparePassword(password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedError('Invalid credentials');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), lastLoginIp: null },
    });

    const tokens = generateTokens(user);
    await this.createSession(user.id, tokens.refreshToken, rememberMe);

    return { user: this.sanitizeUser(user), tokens };
  },

  async refreshToken(refreshToken) {
    const session = await prisma.session.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    const tokens = generateTokens(session.user);
    await prisma.session.update({
      where: { id: session.id },
      data: { token: tokens.refreshToken, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    });

    return tokens;
  },

  async logout(refreshToken) {
    await prisma.session.deleteMany({ where: { token: refreshToken } });
  },

  async requestPasswordReset(email) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return;

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: resetTokenHash,
        passwordResetExpires: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    await sendEmail({
      to: user.email,
      subject: 'Password Reset Request',
      template: 'passwordReset',
      data: { resetToken, userName: user.fullName },
    });
  },

  async resetPassword(token, newPassword) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: tokenHash,
        passwordResetExpires: { gt: new Date() },
      },
    });

    if (!user) {
      throw new AppError('Invalid or expired reset token', 400);
    }

    const passwordHash = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    });

    await prisma.session.deleteMany({ where: { userId: user.id } });
  },

  async verifyEmail(token) {
    const user = await prisma.user.findFirst({
      where: { emailVerificationToken: token },
    });

    if (!user) {
      throw new AppError('Invalid verification token', 400);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        emailVerificationToken: null,
      },
    });

    return { message: 'Email verified successfully' };
  },

  async resendVerificationEmail(email) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.emailVerifiedAt) return;

    const verificationToken = crypto.randomBytes(32).toString('hex');
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerificationToken: verificationToken },
    });

    await sendEmail({
      to: user.email,
      subject: 'Verify Your Email',
      template: 'emailVerification',
      data: { verificationToken, userName: user.fullName },
    });
  },

  async enable2FA(userId) {
    const otplib = await import('otplib');
    const secret = otplib.authenticator.generateSecret();
    const qrcode = await import('qrcode');
    const qrCodeUrl = await qrcode.toDataURL(
      otplib.authenticator.keyuri(user.email, 'StreamingReseller', secret)
    );

    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret, twoFactorEnabled: false },
    });

    return { secret, qrCodeUrl };
  },

  async verify2FA(userId, token) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.twoFactorSecret) {
      throw new AppError('2FA not set up', 400);
    }

    const otplib = await import('otplib');
    const isValid = otplib.authenticator.check(token, user.twoFactorSecret);

    if (!isValid) {
      throw new AppError('Invalid 2FA code', 400);
    }

    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    });

    return { message: '2FA enabled successfully' };
  },

  async disable2FA(userId, password) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const isValid = await comparePassword(password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedError('Invalid password');
    }

    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });

    return { message: '2FA disabled successfully' },
  },

  getDefaultCommissionRate(role) {
    const rates = {
      SUPER_RESELLER: 15,
      SUB_RESELLER: 10,
      ADMIN: 0,
      SUPER_ADMIN: 0,
    };
    return rates[role] || 0;
  },

  getMaxSubResellers(role) {
    const limits = {
      SUPER_RESELLER: 50,
      SUB_RESELLER: 10,
      ADMIN: 100,
      SUPER_ADMIN: 1000,
    };
    return limits[role] || 0;
  },

  sanitizeUser(user) {
    const { passwordHash, twoFactorSecret, passwordResetToken, emailVerificationToken, ...safe } = user;
    return safe;
  },

  async createSession(userId, refreshToken, rememberMe = false) {
    const expiresAt = new Date(
      Date.now() + (rememberMe ? 90 : 30) * 24 * 60 * 60 * 1000
    );

    await prisma.session.create({
      data: { userId, token: refreshToken, expiresAt },
    });
  },

  async sendWelcomeEmail(user) {
    await sendEmail({
      to: user.email,
      subject: 'Welcome to StreamingReseller Platform!',
      template: 'welcome',
      data: { userName: user.fullName, role: user.role },
    });
  },
};