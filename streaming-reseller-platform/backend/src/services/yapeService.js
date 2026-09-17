import crypto from 'crypto';
import { prisma } from '../index.js';
import { AppError } from '../utils/AppError.js';
import { config } from '../config/index.js';

export const yapeService = {
  async createPayment(data) {
    const { amount, orderId, customerPhone, customerEmail, customerName, description, returnUrl, webhookUrl } = data;

    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    const paymentData = {
      amount: Math.round(amount * 100),
      currency: 'PEN',
      orderNumber,
      description: description || `Recarga de créditos - Orden ${orderNumber}`,
      customer: {
        phone: customerPhone,
        email: customerEmail,
        name: customerName,
      },
      returnUrl: returnUrl || `${config.frontendUrl}/payment/success`,
      cancelUrl: `${config.frontendUrl}/payment/cancel`,
      webhookUrl: webhookUrl || `${config.apiPrefix}/webhooks/yape`,
      metadata: {
        orderId,
        type: 'CREDIT_RECHARGE',
      },
    };

    try {
      if (config.yape.useMercadoPago) {
        return await this.createMercadoPagoPayment(paymentData);
      } else {
        return await this.createDirectYapePayment(paymentData);
      }
    } catch (error) {
      throw new AppError(`Payment creation failed: ${error.message}`, 500);
    }
  },

  async createMercadoPagoPayment(paymentData) {
    const mp = await this.getMercadoPagoClient();

    const preference = {
      items: [{
        title: paymentData.description,
        quantity: 1,
        unit_price: paymentData.amount / 100,
        currency_id: 'PEN',
      }],
      payer: {
        email: paymentData.customer.email,
        phone: { number: paymentData.customer.phone },
        name: paymentData.customer.name,
      },
      back_urls: {
        success: paymentData.returnUrl,
        failure: paymentData.cancelUrl,
        pending: paymentData.cancelUrl,
      },
      notification_url: paymentData.webhookUrl,
      external_reference: paymentData.orderNumber,
      metadata: paymentData.metadata,
      payment_methods: {
        excluded_payment_types: [],
        default_payment_method_id: 'yape',
      },
    };

    const response = await mp.preferences.create(preference);

    return {
      paymentId: response.body.id,
      initPoint: response.body.init_point,
      sandboxInitPoint: response.body.sandbox_init_point,
      orderNumber: paymentData.orderNumber,
      qrCode: response.body.qr_code,
      qrCodeBase64: response.body.qr_code_base64,
    };
  },

  async createDirectYapePayment(paymentData) {
    const timestamp = Date.now();
    const signature = this.generateYapeSignature(paymentData, timestamp);

    const response = await fetch(`${config.yape.apiUrl}/v1/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.yape.apiKey}`,
        'X-Timestamp': timestamp.toString(),
        'X-Signature': signature,
      },
      body: JSON.stringify(paymentData),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Yape API error');
    }

    const result = await response.json();

    return {
      paymentId: result.paymentId,
      qrCode: result.qrCode,
      qrCodeBase64: result.qrCodeBase64,
      deepLink: result.deepLink,
      orderNumber: paymentData.orderNumber,
      expiresAt: result.expiresAt,
    };
  },

  async verifyPayment(paymentId) {
    if (config.yape.useMercadoPago) {
      return await this.verifyMercadoPagoPayment(paymentId);
    } else {
      return await this.verifyDirectYapePayment(paymentId);
    }
  },

  async verifyMercadoPagoPayment(paymentId) {
    const mp = await this.getMercadoPagoClient();
    const payment = await mp.payment.get(paymentId);

    return {
      paymentId: payment.body.id,
      status: payment.body.status,
      statusDetail: payment.body.status_detail,
      amount: payment.body.transaction_amount,
      currency: payment.body.currency_id,
      externalReference: payment.body.external_reference,
      metadata: payment.body.metadata,
      paidAt: payment.body.date_approved,
      payer: payment.body.payer,
    };
  },

  async verifyDirectYapePayment(paymentId) {
    const timestamp = Date.now();
    const signature = this.generateYapeSignature({ paymentId }, timestamp);

    const response = await fetch(`${config.yape.apiUrl}/v1/payments/${paymentId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.yape.apiKey}`,
        'X-Timestamp': timestamp.toString(),
        'X-Signature': signature,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Yape verification failed');
    }

    return response.json();
  },

  async handleWebhook(payload, signature) {
    const isValid = this.verifyWebhookSignature(payload, signature);
    if (!isValid) {
      throw new AppError('Invalid webhook signature', 401);
    }

    const event = JSON.parse(payload);

    switch (event.type) {
      case 'payment.approved':
      case 'payment.success':
        return await this.handleSuccessfulPayment(event.data);
      case 'payment.rejected':
      case 'payment.failed':
        return await this.handleFailedPayment(event.data);
      case 'payment.pending':
        return await this.handlePendingPayment(event.data);
      case 'payment.refunded':
        return await this.handleRefundedPayment(event.data);
      default:
        return { received: true, event: event.type };
    }
  },

  async handleSuccessfulPayment(data) {
    const { externalReference, paymentId, amount, metadata } = data;

    const transaction = await prisma.transaction.findFirst({
      where: { paymentReference: externalReference },
      include: { user: true },
    });

    if (!transaction) {
      throw new AppError('Transaction not found', 404);
    }

    if (transaction.status === 'COMPLETED') {
      return { message: 'Already processed' };
    }

    const credits = this.calculateCreditsFromAmount(amount);

    await prisma.$transaction(async (tx) => {
      await tx.transaction.update({
        where: { id: transaction.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          gatewayResponse: data,
        },
      });

      await tx.user.update({
        where: { id: transaction.userId },
        data: {
          credits: { increment: credits },
          totalCreditsPurchased: { increment: credits },
        },
      });

      await tx.notification.create({
        data: {
          userId: transaction.userId,
          type: 'CREDIT_RECHARGE',
          title: 'Recarga exitosa',
          message: `Se han agregado ${credits} créditos a tu cuenta por S/ ${amount}`,
          data: { credits, amount, paymentId },
        },
      });
    });

    return { success: true, credits, transactionId: transaction.id };
  },

  async handleFailedPayment(data) {
    const { externalReference } = data;

    const transaction = await prisma.transaction.findFirst({
      where: { paymentReference: externalReference },
    });

    if (transaction) {
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          status: 'FAILED',
          gatewayResponse: data,
        },
      });

      await prisma.notification.create({
        data: {
          userId: transaction.userId,
          type: 'PAYMENT_FAILED',
          title: 'Pago fallido',
          message: 'Tu pago no pudo ser procesado. Por favor intenta nuevamente.',
          data: { paymentId: data.paymentId },
        },
      });
    }

    return { success: true };
  },

  async handlePendingPayment(data) {
    const { externalReference } = data;

    const transaction = await prisma.transaction.findFirst({
      where: { paymentReference: externalReference },
    });

    if (transaction) {
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: 'PENDING', gatewayResponse: data },
      });
    }

    return { success: true };
  },

  async handleRefundedPayment(data) {
    const { externalReference, amount } = data;

    const transaction = await prisma.transaction.findFirst({
      where: { paymentReference: externalReference },
    });

    if (transaction) {
      await prisma.$transaction(async (tx) => {
        await tx.transaction.update({
          where: { id: transaction.id },
          data: {
            status: 'REFUNDED',
            gatewayResponse: data,
          },
        });

        await tx.user.update({
          where: { id: transaction.userId },
          data: { credits: { decrement: this.calculateCreditsFromAmount(amount) } },
        });

        await tx.notification.create({
          data: {
            userId: transaction.userId,
            type: 'REFUND_PROCESSED',
            title: 'Reembolso procesado',
            message: `Se ha reembolsado S/ ${amount} a tu cuenta`,
            data: { amount },
          },
        });
      });
    }

    return { success: true };
  },

  calculateCreditsFromAmount(amount) {
    const creditPackages = config.provider.creditPackages;
    for (const pkg of creditPackages) {
      if (amount >= pkg.price) {
        return pkg.credits + pkg.bonus;
      }
    }
    return Math.round(amount / 3);
  },

  generateYapeSignature(data, timestamp) {
    const payload = JSON.stringify(data) + timestamp;
    return crypto
      .createHmac('sha256', config.yape.apiSecret)
      .update(payload)
      .digest('hex');
  },

  verifyWebhookSignature(payload, signature) {
    const expected = crypto
      .createHmac('sha256', config.yape.webhookSecret)
      .update(payload)
      .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  },

  async getMercadoPagoClient() {
    const { default: MercadoPago } = await import('mercadopago');
    const mp = new MercadoPago({ accessToken: config.stripe.secretKey });
    return mp;
  },

  async refundPayment(paymentId, amount, reason) {
    if (config.yape.useMercadoPago) {
      const mp = await this.getMercadoPagoClient();
      return await mp.payment.refund(paymentId, { amount: amount / 100 });
    } else {
      const response = await fetch(`${config.yape.apiUrl}/v1/payments/${paymentId}/refund`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.yape.apiKey}`,
        },
        body: JSON.stringify({ amount: amount / 100, reason }),
      });
      return response.json();
    }
  },
};