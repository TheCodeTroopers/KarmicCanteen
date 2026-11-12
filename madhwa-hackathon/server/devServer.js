// server/devServer.js
/**
 * Local Development Server for Karmic Canteen.
 *
 * Provides local HTTP endpoints for Super Admin operations:
 *   - POST /api/admin/create-user
 *   - POST /api/admin/delete-user
 *
 * Runs on port 5001, handles CORS for the Vite dev server (localhost:5173),
 * verifies Firebase ID tokens, and delegates execution to `server/core/userManager.js`.
 */

const path = require('path');
// Load environment variables from server/.env if present
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const {
  createUserAccountCore,
  deleteUserAccountCore,
  updateUserAccountCore,
  bulkCreateUserAccountsCore,
  AppError
} = require('./core/userManager');

const app = express();
const PORT = process.env.PORT || 5001;

// Middlewares
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://localhost:5175',
    'https://karmic-canteen-web.vercel.app/'
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

/**
 * Helper to extract Bearer ID token from request headers
 */
function extractBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError(401, 'unauthenticated', 'Missing or malformed Authorization header. Bearer token required.');
  }
  return authHeader.split('Bearer ')[1].trim();
}

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'karmic-canteen-dev-server',
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /api/admin/create-user
 * Creates an employee or admin account in Firebase Auth + Firestore
 */
app.post(['/api/admin/create-user', '/api/admin/create-user/'], async (req, res) => {
  try {
    const idToken = extractBearerToken(req);
    const result = await createUserAccountCore(idToken, req.body);
    return res.status(201).json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error('Error in /api/admin/create-user:', err.message);
    const status = err.status || 500;
    return res.status(status).json({
      success: false,
      error: {
        code: err.code || 'internal',
        message: err.message || 'An internal error occurred.'
      }
    });
  }
});

/**
 * POST /api/admin/delete-user
 * Safely deletes employee account while preserving historical meal/work selections
 */
app.post(['/api/admin/delete-user', '/api/admin/delete-user/'], async (req, res) => {
  try {
    const idToken = extractBearerToken(req);
    const uid = req.body?.uid;
    const result = await deleteUserAccountCore(idToken, uid);
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error('Error in /api/admin/delete-user:', err.message);
    const status = err.status || 500;
    return res.status(status).json({
      success: false,
      error: {
        code: err.code || 'internal',
        message: err.message || 'An internal error occurred.'
      }
    });
  }
});

/**
 * POST /api/admin/update-user
 * Updates an employee account in Firebase Auth + Firestore
 */
app.post(['/api/admin/update-user', '/api/admin/update-user/'], async (req, res) => {
  try {
    const idToken = extractBearerToken(req);
    const { uid, ...payload } = req.body || {};
    const result = await updateUserAccountCore(idToken, uid, payload);
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error('Error in /api/admin/update-user:', err.message);
    const status = err.status || 500;
    return res.status(status).json({
      success: false,
      error: {
        code: err.code || 'internal',
        message: err.message || 'An internal error occurred.'
      }
    });
  }
});

/**
 * POST /api/admin/bulk-create-users
 * Bulk creates multiple employee accounts in Firebase Auth + Firestore
 */
app.post(['/api/admin/bulk-create-users', '/api/admin/bulk-create-users/'], async (req, res) => {
  try {
    const idToken = extractBearerToken(req);
    const employees = req.body?.employees || req.body;
    const result = await bulkCreateUserAccountsCore(idToken, employees);
    return res.status(200).json({
      success: true,
      ...result,
      data: result
    });
  } catch (err) {
    console.error('Error in /api/admin/bulk-create-users:', err.message);
    const status = err.status || 500;
    return res.status(status).json({
      success: false,
      error: {
        code: err.code || 'internal',
        message: err.message || 'An internal error occurred.'
      }
    });
  }
});

// Fallback 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'not-found',
      message: `Cannot ${req.method} ${req.originalUrl}`
    }
  });
});

// Start listening if run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🚀 Karmic Canteen local dev server running at: http://localhost:${PORT}`);
    console.log(`📡 Endpoints available:`);
    console.log(`   - GET  http://localhost:${PORT}/api/health`);
    console.log(`   - POST http://localhost:${PORT}/api/admin/create-user`);
    console.log(`   - POST http://localhost:${PORT}/api/admin/update-user`);
    console.log(`   - POST http://localhost:${PORT}/api/admin/delete-user`);
    console.log(`   - POST http://localhost:${PORT}/api/admin/bulk-create-users\n`);
  });
}

module.exports = app;
