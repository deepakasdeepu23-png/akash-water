import { pool } from './db.js';

// Everything the owner can edit from the Site Editor.
export const DEFAULT_SETTINGS = {
  brand_name: 'akash',
  brand_sub: 'DRINKING WATER',
  logo_emoji: '💧',
  tagline_title: 'PURE & CLEAN',
  tagline_text: 'Premium 20L bottled water • Ready for delivery',
  quote: '"Water is life\'s simplest medicine"',
  cta_text: 'ORDER NOW!',
  order_note: 'Each can = 20 litres • Earns 5 points per can',
  footer_text: 'AKASH Water Management System',
  accent_color: '#38bdf8',
  support_phone: '9880536414',
  upi_id: '9880536414@ybl',
  upi_name: 'AKASH Drinking Water',
  pay_upi: '1',
  pay_cod: '1',
  pay_online: '0',
  points_per_can: '5',
  redeem_points: '100',
  redeem_value: '40',
};

export const NUMERIC_KEYS = ['points_per_can', 'redeem_points', 'redeem_value'];
export const FLAG_KEYS = ['pay_upi', 'pay_cod', 'pay_online'];

export async function getSettings(conn = pool) {
  const [rows] = await conn.query('SELECT key_name, value FROM settings');
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows) if (r.key_name in DEFAULT_SETTINGS) out[r.key_name] = r.value;
  return out;
}

export const razorpayConfigured = () =>
  Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
