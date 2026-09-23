const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const { ensureDatabaseSchema } = require('./config/migrate');

const app = express();

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'https://danbhels-gym.vercel.app',
  ...(process.env.FRONTEND_URL || '').split(',').map((origin) => origin.trim()).filter(Boolean)
];

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'TOO_MANY_REQUESTS' }
});

app.disable('x-powered-by');
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('CORS_NOT_ALLOWED'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.options(/.*/, cors());
app.use(apiLimiter);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Main Routing Mounting Point Pipelines
app.use('/api/members', require('./routes/memberRoutes'));
app.use('/api/plans', require('./routes/planRoutes'));
app.use('/api/coaches', require('./routes/coachRoutes'));
app.use('/api/reports', require('./routes/reportRoutes'));
app.use('/api/inventory', require('./routes/inventoryRoutes'));
app.use('/api/auth', require('./routes/authRoutes'));

// Root Welcome Route
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Welcome to Danbhels Gym API Core',
    version: '1.0.0',
    endpoints: [
      '/api/members',
      '/api/plans',
      '/api/coaches',
      '/api/reports',
      '/api/inventory',
      '/api/auth'
    ]
  });
});
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));
// Server Port Bootstrap Listener
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || !process.env.ADMIN_PASSWORD)) {
      throw new Error('JWT_SECRET and ADMIN_PASSWORD must be configured in production');
    }
    await ensureDatabaseSchema();
    app.listen(PORT, () => {
      console.log(`// DANBHELS_BACKEND_CORE_RUNNING_ON_PORT_${PORT}`);
    });
  } catch (error) {
    console.error('// DATABASE_SCHEMA_MIGRATION_FAILED:', error.message);
    process.exitCode = 1;
  }
};

startServer();

