import crypto from 'node:crypto';
import { pool, withTransaction } from './db.js';
import { getSettings } from './settings.js';
import { HttpError, cleanPhone, text, toInt } from './utils.js';

const APP_METHODS = { UPI: 'pay_upi', COD: 'pay_cod', ONLINE: 'pay_online' };
const MANUAL_METHODS = ['CASH', 'UPI', 'CREDIT'];

/**
 * Creates an order. All prices are calculated here from the database,
 * never trusted from the browser.
 *
 * source 'app'    -> customer checkout (UPI / COD / ONLINE / POINTS)
 * source 'manual' -> owner adds a phone order (CASH / UPI / CREDIT)
 */
export async function createOrder({ customer = {}, items, method, usePoints = false, source = 'app' }) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 20) {
    throw new HttpError(400, 'Choose at least one pack.');
  }
  const wanted = items.map((it) => ({
    productId: toInt(it.productId, { min: 1, field: 'productId' }),
    qty: toInt(it.qty, { min: 1, max: 500, field: 'quantity' }),
  }));

  const name = source === 'app'
    ? text(customer.name, { field: 'Name', min: 2, max: 100 })
    : text(customer.name || 'Phone Customer', { field: 'Name', min: 1, max: 100 });

  let phone = cleanPhone(customer.phone);
  if (source === 'app' && !phone) throw new HttpError(400, 'Enter a valid 10-digit mobile number.');
  if (source === 'manual' && customer.phone && !phone) throw new HttpError(400, 'Phone number is not valid.');

  let address = '';
  let pincode = '';
  if (source === 'app') {
    address = text(customer.address, { field: 'Address', min: 5, max: 255 });
    pincode = String(customer.pincode ?? '').trim();
    if (!/^\d{6}$/.test(pincode)) throw new HttpError(400, 'Enter a valid 6-digit pin code.');
  }

  return withTransaction(async (conn) => {
    const settings = await getSettings(conn);

    // ---- price the cart from the products table ----
    const ids = [...new Set(wanted.map((w) => w.productId))];
    const [products] = await conn.query(
      'SELECT id, name, cans, price FROM products WHERE active = 1 AND id IN (?)', [ids]);
    const byId = new Map(products.map((p) => [p.id, p]));

    const lines = wanted.map((w) => {
      const p = byId.get(w.productId);
      if (!p) throw new HttpError(400, 'One of the packs is no longer available. Please refresh.');
      return { ...w, product: p };
    });
    const subtotal = lines.reduce((s, l) => s + l.product.price * l.qty, 0);
    const totalCans = lines.reduce((s, l) => s + l.product.cans * l.qty, 0);

    // ---- customer + loyalty points (row is locked while we change points) ----
    let customerId = null;
    let discount = 0;
    let pointsUsed = 0;
    if (phone) {
      await conn.query(
        `INSERT INTO customers (phone, name, address, pincode) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name),
           address = IF(VALUES(address) = '', address, VALUES(address)),
           pincode = IF(VALUES(pincode) = '', pincode, VALUES(pincode))`,
        [phone, name, address, pincode]);
      const [[cust]] = await conn.query('SELECT id, points FROM customers WHERE phone = ? FOR UPDATE', [phone]);
      customerId = cust.id;

      if (usePoints) {
        const need = Number(settings.redeem_points);
        if (source !== 'app') throw new HttpError(400, 'Points can only be used on customer orders.');
        if (!(need > 0) || cust.points < need) throw new HttpError(400, `You need ${need} points to redeem.`);
        discount = Math.min(Number(settings.redeem_value), subtotal);
        pointsUsed = need;
        await conn.query('UPDATE customers SET points = points - ? WHERE id = ?', [pointsUsed, customerId]);
      }
    } else if (usePoints) {
      throw new HttpError(400, 'Points need a mobile number.');
    }

    const amount = Math.round((subtotal - discount) * 100) / 100;

    // ---- payment method and status ----
    let payMethod = String(method || '').toUpperCase();
    let paymentStatus = 'Pending';
    if (source === 'app') {
      if (amount === 0) {
        if (!usePoints) throw new HttpError(400, 'This order has nothing to pay.');
        payMethod = 'POINTS';
        paymentStatus = 'Paid';
      } else {
        if (!(payMethod in APP_METHODS) || settings[APP_METHODS[payMethod]] !== '1') {
          throw new HttpError(400, 'That payment method is not available.');
        }
      }
    } else {
      if (!MANUAL_METHODS.includes(payMethod)) throw new HttpError(400, 'Choose Cash, UPI or Credit.');
      paymentStatus = payMethod === 'CREDIT' ? 'Credit' : 'Paid';
    }

    const pointsEarned = totalCans * Number(settings.points_per_can);
    const prefix = source === 'app' ? 'A' : 'M';

    // ---- insert (retry if the random public id already exists) ----
    let orderId = null;
    let publicId = '';
    for (let attempt = 0; attempt < 6 && !orderId; attempt++) {
      publicId = prefix + crypto.randomInt(10000, 99999);
      try {
        const [result] = await conn.query(
          `INSERT INTO orders (public_id, customer_id, customer_name, phone, address, pincode,
             total_cans, subtotal, discount, amount, payment_method, payment_status,
             points_used, points_earned, source)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [publicId, customerId, name, phone || '', address, pincode,
           totalCans, subtotal, discount, amount, payMethod, paymentStatus,
           pointsUsed, pointsEarned, source]);
        orderId = result.insertId;
      } catch (err) {
        if (err.code !== 'ER_DUP_ENTRY') throw err;
      }
    }
    if (!orderId) throw new HttpError(500, 'Could not create the order. Try again.');

    for (const l of lines) {
      await conn.query(
        `INSERT INTO order_items (order_id, product_id, product_name, unit_cans, unit_price, qty)
         VALUES (?,?,?,?,?,?)`,
        [orderId, l.product.id, l.product.name, l.product.cans, l.product.price, l.qty]);
    }

    return {
      id: orderId, publicId, amount, subtotal, discount, totalCans,
      pointsEarned, method: payMethod, paymentStatus, name, phone,
    };
  });
}

// Pending orders only: give back any points that were redeemed
export async function cancelOrder(orderId) {
  return withTransaction(async (conn) => {
    const [[order]] = await conn.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderId]);
    if (!order) throw new HttpError(404, 'Order not found.');
    if (order.status !== 'Pending') throw new HttpError(400, 'Only pending orders can be cancelled.');
    await conn.query("UPDATE orders SET status = 'Cancelled' WHERE id = ?", [orderId]);
    if (order.points_used > 0 && order.customer_id) {
      await conn.query('UPDATE customers SET points = points + ? WHERE id = ?', [order.points_used, order.customer_id]);
    }
  });
}

// Delivered: COD cash is now in hand, and the loyalty points are awarded once
export async function markDelivered(orderId) {
  return withTransaction(async (conn) => {
    const [[order]] = await conn.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderId]);
    if (!order) throw new HttpError(404, 'Order not found.');
    if (order.status !== 'Pending') throw new HttpError(400, 'This order is already closed.');
    const paid = order.payment_method === 'COD' && order.payment_status === 'Pending';
    await conn.query(
      `UPDATE orders SET status = 'Delivered', payment_status = IF(?, 'Paid', payment_status),
         points_awarded = 1 WHERE id = ?`, [paid ? 1 : 0, orderId]);
    if (!order.points_awarded && order.customer_id) {
      await conn.query('UPDATE customers SET points = points + ? WHERE id = ?', [order.points_earned, order.customer_id]);
    }
  });
}

// ---------- Razorpay (optional) ----------
export async function createRazorpayOrder(order) {
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
  const resp = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
    body: JSON.stringify({ amount: Math.round(order.amount * 100), currency: 'INR', receipt: order.publicId }),
  });
  if (!resp.ok) throw new HttpError(502, 'Online payment is unavailable right now. Please choose another method.');
  const data = await resp.json();
  await pool.query('UPDATE orders SET gateway_order_id = ? WHERE id = ?', [data.id, order.id]);
  return data.id;
}

export function verifyRazorpaySignature(gatewayOrderId, paymentId, signature) {
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${gatewayOrderId}|${paymentId}`)
    .digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
