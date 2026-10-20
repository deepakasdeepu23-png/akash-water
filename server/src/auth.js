import jwt from 'jsonwebtoken';

export const signOwnerToken = () =>
  jwt.sign({ role: 'owner' }, process.env.JWT_SECRET, { expiresIn: '8h' });

export function requireOwner(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  try {
    jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Please log in as the owner.' });
  }
}
