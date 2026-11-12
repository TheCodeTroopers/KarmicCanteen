// api/admin/update-user.js
/**
 * Vercel Serverless Function — POST /api/admin/update-user
 *
 * Updates an employee's details (name, email, employeeId, department).
 * If email changes, updates both Firebase Auth and Firestore.
 * Requires a valid Firebase ID token from a super_admin caller in the Authorization header.
 *
 * Compatible with:
 *   - Vercel Serverless (production)
 *   - Local dev: use server/devServer.js instead (port 5001)
 */

'use strict';

const { updateUserAccountCore, AppError } = require('../../server/core/userManager');

// Allowed origins for CORS — add your production Vercel domain here
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  'https://karmic-canteen.vercel.app',
  'https://karmic-canteen-web.vercel.app/'
];

/**
 * Sets permissive-but-safe CORS headers.
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

/**
 * Vercel serverless handler.
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
module.exports = async function handler(req, res) {
  setCorsHeaders(req, res);

  // Handle CORS pre-flight
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Only POST is accepted
  if (req.method !== 'POST') {
    return res.status(405).json({
      code: 'method-not-allowed',
      message: 'Only POST requests are accepted on this endpoint.',
    });
  }

  // Extract Bearer token from Authorization header
  const authHeader = req.headers['authorization'] || '';
  const idToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : null;

  if (!idToken) {
    return res.status(401).json({
      code: 'unauthenticated',
      message: 'Missing or malformed Authorization header. Expected: Bearer <idToken>',
    });
  }

  // Extract payload from request body
  const {
    uid,
    name,
    email,
    employeeId,
    department,
    role,
  } = req.body || {};

  if (!uid || typeof uid !== 'string' || !uid.trim()) {
    return res.status(400).json({
      code: 'invalid-argument',
      message: 'Request body must include a valid "uid" field.',
    });
  }

  try {
    const result = await updateUserAccountCore(idToken, uid.trim(), {
      name,
      email,
      employeeId,
      department,
      role,
    });

    return res.status(200).json({
      success: true,
      uid: result.uid,
      message: result.message,
    });
  } catch (err) {
    if (err instanceof AppError) {
      const statusMap = {
        unauthenticated: 401,
        'permission-denied': 403,
        'invalid-argument': 400,
        'already-exists': 409,
        'failed-precondition': 422,
        'not-found': 404,
        internal: 500,
      };
      const status = statusMap[err.code] || 500;
      return res.status(status).json({
        code: err.code,
        message: err.message,
      });
    }

    // Unexpected error — do not leak internal details
    console.error('[update-user] Unexpected error:', err);
    return res.status(500).json({
      code: 'internal',
      message: 'An unexpected server error occurred.',
    });
  }
};
