import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { requireOwner, signOwnerToken } from '../auth.js';
import { DEFAULT_SETTINGS, FLAG_KEYS, NUMERIC_KEYS, getSettings } from '../settings.js';
import { HttpError, isoDate, text, toInt, toMoney } from '../utils.js';
import { cancelOrder, createOrder, markDelivered } from '../orderService.js';
import reportsRouter from './reports.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in 15 minutes.' },
});

// ---------- login (the only public admin route) ----------
router.post('/login', loginLimiter, async (req, res) => {
  const passcode = String(req.body?.passcode ?? '');
  const [rows] = await pool.query('SELECT password_hash FROM admins ORDER BY id LIMIT 1');
  const ok = rows[0] && passcode && (await bcrypt.compare(passcode, rows[0].password_hash));
  if (!ok) throw new HttpError(401, 'Incorrect passcode.');
  res.json({ token: signOwnerToken() });
});

router.use(requireOwner);
router.use('/reports', reportsRouter);

router.post('/passcode', async (req, res) => {
  const current = String(req.body?.current ?? '');
  const next = text(req.body?.next, { field: 'New passcode', min: 6, max: 72 });
  const [rows] = await pool.query('SELECT id, password_hash FROM admins ORDER BY id LIMIT 1');
  if (!rows[0] || !(await bcrypt.compare(current, rows[0].password_hash))) {
    throw new HttpError(400, 'Current passcode is incorrect.');
  }
  await pool.query('UPDATE admins SET password_hash = ? WHERE id = ?', [await bcrypt.hash(next, 10), rows[0].id]);
  res.json({ ok: true });
});

// ---------- dashboard ----------
router.get('/dashboard', async (req, res) => {
  const settings = await getSettings();
  const [[today]] = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN status = 'Delivered' THEN total_cans END), 0) AS cans,
       COALESCE(SUM(CASE WHEN status <> 'Cancelled' AND payment_status = 'Paid' THEN amount END), 0) AS revenue
     FROM orders WHERE DATE(created_at) = CURDATE()`);
  const [[empty]] = await pool.query(
    "SELECT COALESCE(SUM(total_cans - empty_returned), 0) AS pending FROM orders WHERE status = 'Delivered'");
  const [[free]] = await pool.query(
    'SELECT COUNT(*) AS n FROM customers WHERE points >= ? AND ? > 0',
    [Number(settings.redeem_points), Number(settings.redeem_points)]);
  const [[open]] = await pool.query("SELECT COUNT(*) AS n FROM orders WHERE status = 'Pending'");
  res.json({
    cansToday: Number(today.cans),
    revenueToday: Number(today.revenue),
    emptyPending: Number(empty.pending),
    freeDue: free.n,
    pendingOrders: open.n,
  });
});

// ---------- orders ----------
router.get('/orders', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, public_id AS publicId, customer_name AS name, phone, address, pincode,
            total_cans AS cans, subtotal, discount, amount,
            payment_method AS method, payment_status AS paymentStatus, status,
            empty_returned AS emptyReturned, points_used AS pointsUsed, source, created_at AS createdAt
     FROM orders ORDER BY id DESC LIMIT 200`);
  res.json(rows);
});

router.post('/orders', async (req, res) => {
  const { name, phone, productId, qty, method } = req.body || {};
  const order = await createOrder({
    customer: { name, phone },
    items: [{ productId, qty }],
    method,
    source: 'manual',
  });
  res.status(201).json(order);
});

router.post('/orders/:id/deliver', async (req, res) => {
  await markDelivered(Number(req.params.id));
  res.json({ ok: true });
});

router.post('/orders/:id/cancel', async (req, res) => {
  await cancelOrder(Number(req.params.id));
  res.json({ ok: true });
});

router.post('/orders/:id/mark-paid', async (req, res) => {
  const [result] = await pool.query(
    "UPDATE orders SET payment_status = 'Paid' WHERE id = ? AND status <> 'Cancelled'", [Number(req.params.id)]);
  if (!result.affectedRows) throw new HttpError(404, 'Order not found.');
  res.json({ ok: true });
});

router.post('/orders/:id/empty-received', async (req, res) => {
  const id = Number(req.params.id);
  const [[order]] = await pool.query('SELECT total_cans FROM orders WHERE id = ?', [id]);
  if (!order) throw new HttpError(404, 'Order not found.');
  const count = req.body?.count === undefined
    ? order.total_cans
    : toInt(req.body.count, { min: 0, max: order.total_cans, field: 'Empty cans' });
  await pool.query('UPDATE orders SET empty_returned = ? WHERE id = ?', [count, id]);
  res.json({ ok: true });
});

router.delete('/orders/:id', async (req, res) => {
  const id = Number(req.params.id);
  const [[order]] = await pool.query('SELECT status FROM orders WHERE id = ?', [id]);
  if (!order) throw new HttpError(404, 'Order not found.');
  if (order.status === 'Pending') await cancelOrder(id); // refunds redeemed points first
  await pool.query('DELETE FROM orders WHERE id = ?', [id]);
  res.json({ ok: true });
});

// ---------- site editor: settings ----------
router.get('/settings', async (req, res) => res.json(await getSettings()));

router.put('/settings', async (req, res) => {
  const body = req.body || {};
  const entries = [];
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (!(key in body)) continue;
    let value = String(body[key] ?? '').trim();
    if (NUMERIC_KEYS.includes(key)) value = String(toInt(value, { min: 0, max: 100000, field: key }));
    else if (FLAG_KEYS.includes(key)) value = value === '1' || value === 'true' ? '1' : '0';
    else if (key === 'accent_color') {
      if (!/^#[0-9a-fA-F]{6}$/.test(value)) throw new HttpError(400, 'Accent colour must look like #38bdf8.');
    } else if (key === 'upi_id') {
      if (value && !/^[\w.\-]{2,}@[\w.\-]{2,}$/.test(value)) throw new HttpError(400, 'UPI ID looks wrong (example: name@bank).');
    } else value = text(value, { field: key, max: 300 });
    entries.push([key, value]);
  }
  for (const [k, v] of entries) {
    await pool.query(
      'INSERT INTO settings (key_name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)', [k, v]);
  }
  res.json(await getSettings());
});

// ---------- site editor: products ----------
const readProduct = (b) => ({
  name: text(b?.name, { field: 'Name', min: 1, max: 80 }),
  cans: toInt(b?.cans, { min: 1, max: 1000, field: 'Cans per pack' }),
  price: toMoney(b?.price, { field: 'Price' }),
  section: text(b?.section || 'Order', { field: 'Section', min: 1, max: 40 }),
  sort_order: toInt(b?.sortOrder ?? 0, { min: 0, max: 1000, field: 'Sort order' }),
  active: b?.active === false || b?.active === 0 ? 0 : 1,
});

router.get('/products', async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, name, cans, price, section, sort_order AS sortOrder, active FROM products ORDER BY sort_order, id');
  res.json(rows.map((r) => ({ ...r, active: Boolean(r.active) })));
});

router.post('/products', async (req, res) => {
  const p = readProduct(req.body);
  const [r] = await pool.query(
    'INSERT INTO products (name, cans, price, section, sort_order, active) VALUES (?,?,?,?,?,?)',
    [p.name, p.cans, p.price, p.section, p.sort_order, p.active]);
  res.status(201).json({ id: r.insertId });
});

router.put('/products/:id', async (req, res) => {
  const p = readProduct(req.body);
  const [r] = await pool.query(
    'UPDATE products SET name=?, cans=?, price=?, section=?, sort_order=?, active=? WHERE id=?',
    [p.name, p.cans, p.price, p.section, p.sort_order, p.active, Number(req.params.id)]);
  if (!r.affectedRows) throw new HttpError(404, 'Pack not found.');
  res.json({ ok: true });
});

router.delete('/products/:id', async (req, res) => {
  await pool.query('DELETE FROM products WHERE id = ?', [Number(req.params.id)]);
  res.json({ ok: true });
});

// ---------- partners (Exam Center, Garage, Worknox, ...) ----------
router.get('/partners', async (req, res) => {
  const [partners] = await pool.query(
    'SELECT id, name, billing_note AS billingNote FROM partners ORDER BY sort_order, id');
  const [logs] = await pool.query(
    `SELECT id, partner_id AS partnerId, log_date AS date, cans_supplied AS cans, empty_received AS empty
     FROM partner_logs ORDER BY log_date DESC, id DESC`);
  res.json(partners.map((p) => ({ ...p, logs: logs.filter((l) => l.partnerId === p.id) })));
});

router.post('/partners', async (req, res) => {
  const [r] = await pool.query('INSERT INTO partners (name, billing_note, sort_order) VALUES (?,?,?)', [
    text(req.body?.name, { field: 'Name', min: 1, max: 80 }),
    text(req.body?.billingNote, { field: 'Billing note', max: 80 }),
    99,
  ]);
  res.status(201).json({ id: r.insertId });
});

router.put('/partners/:id', async (req, res) => {
  await pool.query('UPDATE partners SET name = ?, billing_note = ? WHERE id = ?', [
    text(req.body?.name, { field: 'Name', min: 1, max: 80 }),
    text(req.body?.billingNote, { field: 'Billing note', max: 80 }),
    Number(req.params.id),
  ]);
  res.json({ ok: true });
});

router.delete('/partners/:id', async (req, res) => {
  await pool.query('DELETE FROM partners WHERE id = ?', [Number(req.params.id)]);
  res.json({ ok: true });
});

router.post('/partners/:id/logs', async (req, res) => {
  const [[partner]] = await pool.query('SELECT id FROM partners WHERE id = ?', [Number(req.params.id)]);
  if (!partner) throw new HttpError(404, 'Partner not found.');
  await pool.query(
    'INSERT INTO partner_logs (partner_id, log_date, cans_supplied, empty_received) VALUES (?,?,?,?)',
    [partner.id, isoDate(req.body?.date), toInt(req.body?.cans, { field: 'Cans supplied' }),
     toInt(req.body?.empty, { field: 'Empty received' })]);
  res.status(201).json({ ok: true });
});

router.delete('/logs/:id', async (req, res) => {
  await pool.query('DELETE FROM partner_logs WHERE id = ?', [Number(req.params.id)]);
  res.json({ ok: true });
});

// ---------- expenses ----------
router.get('/expenses', async (req, res) => {
  // ?month=2026-10 lists one month; with no month it lists the latest 200
  const month = String(req.query.month || '');
  let where = '';
  const args = [];
  if (month) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new HttpError(400, 'Choose a valid month.');
    where = "WHERE DATE_FORMAT(expense_date, '%Y-%m') = ?";
    args.push(month);
  }
  const [rows] = await pool.query(
    `SELECT id, category, amount, note, expense_date AS date FROM expenses ${where}
     ORDER BY expense_date DESC, id DESC LIMIT 500`, args);
  const byCategory = {};
  for (const r of rows) byCategory[r.category] = Math.round(((byCategory[r.category] || 0) + r.amount) * 100) / 100;
  res.json({
    items: rows,
    total: Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100,
    byCategory: Object.entries(byCategory).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
  });
});

router.post('/expenses', async (req, res) => {
  const date = req.body?.date ? isoDate(req.body.date) : new Date().toISOString().slice(0, 10);
  await pool.query('INSERT INTO expenses (category, amount, note, expense_date) VALUES (?,?,?,?)', [
    text(req.body?.category, { field: 'Category', min: 1, max: 40 }),
    toMoney(req.body?.amount, { field: 'Amount', min: 0.01 }),
    text(req.body?.note, { field: 'Note', max: 160 }),
    date,
  ]);
  res.status(201).json({ ok: true });
});

router.delete('/expenses/:id', async (req, res) => {
  await pool.query('DELETE FROM expenses WHERE id = ?', [Number(req.params.id)]);
  res.json({ ok: true });
});

export default router;
