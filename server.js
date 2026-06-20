const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Global System Middlewares
// Palitan ang app.use(cors()); ng configuration na ito:
app.use(cors({
  origin: [
    'http://localhost:5173', // Para gumana kapag nagte-test ka locally gamit ang Vite
    'https://danbhels-gym.vercel.app' // IPALIT MO DITO ANG TOTOONG LIVE URL NG FRONTEND MO NA GALING SA VERCEL
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
app.use(express.json());

// Main Routing Mounting Point Pipelines
app.use('/api/members', require('./routes/memberRoutes'));
app.use('/api/plans', require('./routes/planRoutes'));
app.use('/api/coaches', require('./routes/coachRoutes'));
app.use('/api/reports', require('./routes/reportRoutes'));

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
      '/api/reports'
    ]
  });
});
// Server Port Bootstrap Listener
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`// DANBHELS_BACKEND_CORE_RUNNING_ON_PORT_${PORT}`);
});

