import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin.js';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error('Set JWT_SECRET (at least 16 characters) in server/.env before starting.');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1);

// CORS
app.use(cors({
  origin: [
    'https://akash-water.netlify.app',
    'http://localhost:5173'
  ],
  credentials: true,
}));

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://checkout.razorpay.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: [
          "'self'",
          'https://api.razorpay.com',
          'https://lumberjack.razorpay.com',
          'https://akash-water.onrender.com'
        ],
        frameSrc: [
          "'self'",
          'https://api.razorpay.com',
          'https://checkout.razorpay.com'
        ],
      },
    },
  }),
);

app.use(express.json({ limit: '50kb' }));

app.use('/api/admin', adminRoutes);
app.use('/api', publicRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../../client/dist');

if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, req, res, next) => {
  if (err.status) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Bad request.' });

  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

const port = Number(process.env.PORT || 5000);
app.listen(port, () => {
  console.log(`AKASH server running on http://localhost:${port}`);
});