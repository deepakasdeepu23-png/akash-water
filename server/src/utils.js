export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Indian 10-digit mobile number; accepts +91 / spaces / dashes. Returns null if invalid.
export function cleanPhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  const ten = digits.length > 10 ? digits.slice(-10) : digits;
  return /^[6-9]\d{9}$/.test(ten) ? ten : null;
}

export function toInt(value, { min = 0, max = 1_000_000, field = 'value' } = {}) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new HttpError(400, `${field} must be a whole number between ${min} and ${max}`);
  }
  return n;
}

export function toMoney(value, { field = 'amount', min = 0 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > 10_000_000) {
    throw new HttpError(400, `${field} must be a valid amount`);
  }
  return Math.round(n * 100) / 100;
}

export function text(value, { field = 'value', min = 0, max = 255 } = {}) {
  const s = String(value ?? '').trim();
  if (s.length < min || s.length > max) {
    throw new HttpError(400, `${field} must be ${min === 0 ? 'at most' : `${min} to`} ${max} characters`);
  }
  return s;
}

export function isoDate(value, field = 'date') {
  const s = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) {
    throw new HttpError(400, `${field} must be a valid date`);
  }
  return s;
}
