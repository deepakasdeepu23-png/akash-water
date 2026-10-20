import { Router } from 'express';
import { pool } from '../db.js';
import { HttpError } from '../utils.js';

const router = Router();

const pad = (n) => String(n).padStart(2, '0');
const round = (n) => Math.round(Number(n || 0) * 100) / 100;

function parsePeriod(type, period) {
  if (type === 'month' && /^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    const [y, m] = period.split('-').map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
    return { from: `${period}-01`, to: `${next}-01` };
  }
  if (type === 'year' && /^\d{4}$/.test(period)) {
    return { from: `${period}-01-01`, to: `${Number(period) + 1}-01-01` };
  }
  throw new HttpError(400, 'Choose a valid month or year.');
}

// Live numbers for one period [from, to)
async function totalsFor(from, to) {
  const [[o]] = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN status <> 'Cancelled' AND payment_status = 'Paid'   THEN amount END), 0) AS revenue,
       COALESCE(SUM(CASE WHEN status <> 'Cancelled' AND payment_status = 'Credit' THEN amount END), 0) AS creditDue,
       COALESCE(SUM(CASE WHEN status = 'Delivered' THEN total_cans END), 0) AS cans,
       COALESCE(SUM(status <> 'Cancelled'), 0) AS orders
     FROM orders WHERE created_at >= ? AND created_at < ?`, [from, to]);
  const [cats] = await pool.query(
    `SELECT category, SUM(amount) AS amount FROM expenses
     WHERE expense_date >= ? AND expense_date < ? GROUP BY category ORDER BY amount DESC`, [from, to]);
  const expenses = round(cats.reduce((s, c) => s + c.amount, 0));
  const revenue = round(o.revenue);
  return {
    revenue, creditDue: round(o.creditDue), expenses, profit: round(revenue - expenses),
    cans: Number(o.cans), orders: Number(o.orders),
    byCategory: cats.map((c) => ({ category: c.category, amount: round(c.amount) })),
  };
}

const savedRow = (r) => ({
  revenue: r.revenue, creditDue: r.credit_due, expenses: r.expenses, profit: r.profit,
  orders: r.orders, cans: r.cans, savedAt: r.saved_at,
});

// 12 months of one year, with the year total and any saved snapshots
router.get('/monthly', async (req, res) => {
  const year = String(req.query.year || new Date().getFullYear());
  const { from, to } = parsePeriod('year', year);

  const [orderRows] = await pool.query(
    `SELECT DATE_FORMAT(created_at, '%Y-%m') AS ym,
       COALESCE(SUM(CASE WHEN status <> 'Cancelled' AND payment_status = 'Paid'   THEN amount END), 0) AS revenue,
       COALESCE(SUM(CASE WHEN status <> 'Cancelled' AND payment_status = 'Credit' THEN amount END), 0) AS creditDue,
       COALESCE(SUM(CASE WHEN status = 'Delivered' THEN total_cans END), 0) AS cans,
       COALESCE(SUM(status <> 'Cancelled'), 0) AS orders
     FROM orders WHERE created_at >= ? AND created_at < ? GROUP BY ym`, [from, to]);
  const [expRows] = await pool.query(
    `SELECT DATE_FORMAT(expense_date, '%Y-%m') AS ym, SUM(amount) AS expenses
     FROM expenses WHERE expense_date >= ? AND expense_date < ? GROUP BY ym`, [from, to]);
  const [saved] = await pool.query(
    "SELECT * FROM pnl_reports WHERE period_type = 'month' AND period LIKE ?", [`${year}-%`]);
  const [[savedYear]] = await pool.query(
    "SELECT * FROM pnl_reports WHERE period_type = 'year' AND period = ?", [year]);

  const months = [];
  for (let m = 1; m <= 12; m++) {
    const ym = `${year}-${pad(m)}`;
    const o = orderRows.find((r) => r.ym === ym);
    const e = expRows.find((r) => r.ym === ym);
    const revenue = round(o?.revenue);
    const expenses = round(e?.expenses);
    const snap = saved.find((s) => s.period === ym);
    months.push({
      period: ym, revenue, creditDue: round(o?.creditDue), expenses, profit: round(revenue - expenses),
      cans: Number(o?.cans || 0), orders: Number(o?.orders || 0), saved: snap ? savedRow(snap) : null,
    });
  }
  const sum = (k) => round(months.reduce((s, x) => s + x[k], 0));
  res.json({
    year,
    months,
    total: {
      revenue: sum('revenue'), creditDue: sum('creditDue'), expenses: sum('expenses'), profit: sum('profit'),
      cans: months.reduce((s, x) => s + x.cans, 0), orders: months.reduce((s, x) => s + x.orders, 0),
      saved: savedYear ? savedRow(savedYear) : null,
    },
  });
});

// One row per year that has any orders or expenses
router.get('/yearly', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT y AS year, SUM(revenue) AS revenue, SUM(expenses) AS expenses FROM (
       SELECT YEAR(created_at) AS y,
              CASE WHEN status <> 'Cancelled' AND payment_status = 'Paid' THEN amount ELSE 0 END AS revenue,
              0 AS expenses FROM orders
       UNION ALL
       SELECT YEAR(expense_date), 0, amount FROM expenses
     ) t GROUP BY y ORDER BY y DESC`);
  const [saved] = await pool.query("SELECT period FROM pnl_reports WHERE period_type = 'year'");
  res.json(rows.map((r) => ({
    year: String(r.year), revenue: round(r.revenue), expenses: round(r.expenses),
    profit: round(r.revenue - r.expenses), saved: saved.some((s) => s.period === String(r.year)),
  })));
});

// Detail for one month or one year, including the expense breakdown
router.get('/detail', async (req, res) => {
  const type = req.query.type === 'year' ? 'year' : 'month';
  const period = String(req.query.period || '');
  const { from, to } = parsePeriod(type, period);
  const live = await totalsFor(from, to);
  const [[snap]] = await pool.query('SELECT * FROM pnl_reports WHERE period_type = ? AND period = ?', [type, period]);
  res.json({ type, period, ...live, saved: snap ? savedRow(snap) : null });
});

// Save (or update) the report for a month or a year in the database
router.post('/save', async (req, res) => {
  const type = req.body?.type === 'year' ? 'year' : 'month';
  const period = String(req.body?.period || '');
  const { from, to } = parsePeriod(type, period);
  const t = await totalsFor(from, to);
  await pool.query(
    `INSERT INTO pnl_reports (period_type, period, revenue, credit_due, expenses, profit, orders, cans)
     VALUES (?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE revenue = VALUES(revenue), credit_due = VALUES(credit_due),
       expenses = VALUES(expenses), profit = VALUES(profit), orders = VALUES(orders), cans = VALUES(cans)`,
    [type, period, t.revenue, t.creditDue, t.expenses, t.profit, t.orders, t.cans]);
  res.json({ ok: true, ...t });
});

export default router;
