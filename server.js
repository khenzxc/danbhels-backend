const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Global System Middlewares
app.use(cors());
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

