import dotenv from 'dotenv';
dotenv.config();

export const config = {
  // Server
  port: parseInt(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  apiPrefix: '/api/v1',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  // Database
  databaseUrl: process.env.DATABASE_URL,

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
    expiresIn: '7d',
    refreshExpiresIn: '30d',
  },

  // Encryption
  encryption: {
    key: process.env.ENCRYPTION_KEY || '32-char-encryption-key-here!!',
    algorithm: 'aes-256-gcm',
  },

  // Bcrypt
  bcryptRounds: 12,

  // Rate Limiting
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100,
  },

  // Email
  email: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.EMAIL_FROM || 'noreply@streamingreseller.com',
  },

  // SMS/WhatsApp
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
    whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER,
  },

  // WhatsApp Business API (Meta)
  whatsapp: {
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    appSecret: process.env.WHATSAPP_APP_SECRET,
    apiVersion: 'v18.0',
  },

  // Instagram/Facebook (Meta)
  meta: {
    appId: process.env.META_APP_ID,
    appSecret: process.env.META_APP_SECRET,
    redirectUri: process.env.META_REDIRECT_URI,
  },

  // TikTok Shop
  tiktok: {
    appKey: process.env.TIKTOK_APP_KEY,
    appSecret: process.env.TIKTOK_APP_SECRET,
    redirectUri: process.env.TIKTOK_REDIRECT_URI,
  },

  // Stripe
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  },

  // File Upload
  upload: {
    maxSize: 10 * 1024 * 1024, // 10MB
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    path: './uploads',
  },

  // Redis (for caching/sessions)
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD,
  },

  // Provider Defaults
  provider: {
    defaultTrialHours: 24,
    defaultTrialLimit: 10,
    creditPackages: [
      { credits: 10, price: 25, bonus: 0 },
      { credits: 30, price: 70, bonus: 2 },
      { credits: 60, price: 135, bonus: 5 },
      { credits: 120, price: 260, bonus: 12 },
      { credits: 240, price: 500, bonus: 30 },
      { credits: 500, price: 1000, bonus: 75 },
    ],
  },

  // Commission Defaults
  commission: {
    superReseller: { type: 'PERCENTAGE', rate: 15 }, // 15% from sub-resellers
    subReseller: { type: 'PERCENTAGE', rate: 10 },   // 10% from customers
    provider: { type: 'PERCENTAGE', rate: 5 },       // 5% platform fee
  },

  // Pagination
  pagination: {
    defaultLimit: 20,
    maxLimit: 100,
  },

  // Security
  security: {
    corsOrigin: process.env.FRONTEND_URL || 'http://localhost:5173',
    helmet: true,
    xssProtection: true,
    noSniff: true,
    frameguard: 'deny',
  },
};

export default config;