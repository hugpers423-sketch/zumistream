import express from 'express';
import { config } from './config/index.js';

const router = express.Router();

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', api: 'streaming-reseller-platform', version: '1.0.0' });
});

// Auth routes
router.post('/auth/register', async (req, res, next) => {
  try {
    const { email, password, fullName, phone, role, parentId, referralCode } = req.body;
    // ... registration logic using authService
    res.json({ success: true, message: 'User registered' });
  } catch (error) {
    next(error);
  }
});

// ... more auth routes

// User routes
router.get('/users', async (req, res, next) => {
  try {
    const filters = req.query;
    const pagination = { page: req.query.page || 1, limit: req.query.limit || 20 };
    const requester = req.user;
    
    const result = await userService.getUsers(filters, pagination, requester);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// User CRUD
router.post('/users', async (req, res, next) => {
  try {
    const { ... } = req.body;
    const result = await userService.createUser(req.body, req.user);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.put('/users/:id', async (req, res, next) => {
  try {
    const result = await userService.updateUser(req.params.id, req.body, req.user);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.delete('/users/:id', async (req, res, next) => {
  try {
    const result = await userService.deleteUser(req.params.id, req.user);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Recharge credits (Yape)
router.post('/users/recharge', async (req, res, next) => {
  try {
    const { userId, amount, paymentData } = req.body;
    const result = await userService.rechargeCredits(userId, amount, req.user, paymentData);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Yape payment routes
router.post('/payments/yape', async (req, res, next) => {
  try {
    const result = await yapeService.createPayment(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/payments/yape/verify', async (req, res, next) => {
  try {
    const result = await yapeService.verifyPayment(req.body.paymentId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Yape webhook
router.post('/webhooks/yape', async (req, res, next) => {
  try {
    const { payload, signature } = req.body;
    const result = await yapeService.handleWebhook(payload, signature);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Subscription routes
router.get('/subscriptions', async (req, res, next) => {
  try {
    const filters = req.query;
    const pagination = { page: req.query.page || 1, limit: req.query.limit || 20 };
    const requester = req.user;
    
    const result = await subscriptionService.getSubscriptions(filters, pagination, requester);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Provider routes
router.get('/providers', async (req, res, next) => {
  try {
    const filters = req.query;
    const pagination = { page: req.query.page || 1, limit: req.query.limit || 20 };
    
    const result = await providerService.getProviders(filters, pagination);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Commission routes
router.get('/commissions', async (req, res, next) => {
  try {
    const result = await commissionService.getCommissions(req.query, {
      page: req.query.page || 1, limit: req.query.limit || 20,
    }, req.user);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Commission payment
router.post('/commissions/pay', async (req, res, next) => {
  try {
    const { commissionIds } = req.body;
    const result = await commissionService.payCommissions(commissionIds, req.user);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// ... more routes

export default router;