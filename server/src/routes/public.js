import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { getSettings, razorpayConfigured } from '../settings.js';
import { HttpError, cleanPhone } from '../utils.js';
import { cancelOrder, createOrder, createRazorpayOrder, verifyRazorpaySignature } from '../orderService.js';

const router = Router();

const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many orders from this device. Please try again in a few minutes.' },
});

// Everything the storefront needs to draw itself
router.get('/site', async (req, res) => {
  const settings = await getSettings();
  const [products] = await pool.query(
    'SELECT id, name, cans, price, section FROM products WHERE active = 1 ORDER BY sort_order, id');
  const onlineReady = settings.pay_online === '1' && razorpayConfigured();
  res.json({
    settings,
    products,
    paymentMethods: {
      UPI: settings.pay_upi === '1',
      COD: settings.pay_cod === '1',
      ONLINE: onlineReady,
    },
  });
});

// Loyalty points for a phone number (points only, nothing else is exposed)
router.get('/customers/points', async (req, res) => {
  const phone = cleanPhone(req.query.phone);
  if (!phone) return res.json({ points: 0 });
  const [rows] = await pool.query('SELECT points FROM customers WHERE phone = ?', [phone]);
  res.json({ points: rows[0]?.points ?? 0 });
});

// Place an order
router.post('/orders', orderLimiter, async (req, res) => {
  const { customer, items, paymentMethod, usePoints } = req.body || {};
  const order = await createOrder({ customer, items, method: paymentMethod, usePoints: Boolean(usePoints), source: 'app' });
  const response = {
    order: {
      publicId: order.publicId, amount: order.amount, totalCans: order.totalCans,
      pointsEarned: order.pointsEarned, method: order.method, paymentStatus: order.paymentStatus,
    },
  };

  if (order.method === 'ONLINE') {
    if (!razorpayConfigured()) {
      await cancelOrder(order.id);
      throw new HttpError(400, 'Online payment is not set up.');
    }
    try {
      const gatewayOrderId = await createRazorpayOrder(order);
      response.razorpay = {
        keyId: process.env.RAZORPAY_KEY_ID,
        orderId: gatewayOrderId,
        amount: Math.round(order.amount * 100),
        name: settings.upi_name,
        prefill: { name: order.name, contact: order.phone },
      };
    } catch (err) {
      await cancelOrder(order.id); // give redeemed points back
      throw err;
    }
  }

  res.status(201).json(response);
});

// Razorpay calls this after checkout; we verify the signature before marking it paid
router.post('/orders/:publicId/razorpay-verify', async (req, res) => {
  if (!razorpayConfigured()) throw new HttpError(400, 'Online payment is not set up.');
  const { razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body || {};
  const [rows] = await pool.query(
    "SELECT id, gateway_order_id FROM orders WHERE public_id = ? AND payment_method = 'ONLINE'", [req.params.publicId]);
  const order = rows[0];
  if (!order || !order.gateway_order_id) throw new HttpError(404, 'Order not found.');
  if (!verifyRazorpaySignature(order.gateway_order_id, paymentId, signature)) {
    throw new HttpError(400, 'Payment could not be verified.');
  }
  await pool.query(
    "UPDATE orders SET payment_status = 'Paid', gateway_payment_id = ? WHERE id = ?", [String(paymentId), order.id]);
  res.json({ ok: true });
});

// Customer closed the card window without paying: free up the order and any redeemed points
router.post('/orders/:publicId/cancel-unpaid', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id FROM orders WHERE public_id = ? AND payment_method = 'ONLINE' AND payment_status = 'Pending'
       AND status = 'Pending' AND created_at > (NOW() - INTERVAL 30 MINUTE)`, [req.params.publicId]);
  if (rows[0]) await cancelOrder(rows[0].id);
  res.json({ ok: true });
});

export default router;
