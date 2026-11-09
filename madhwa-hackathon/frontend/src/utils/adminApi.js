// src/utils/adminApi.js
/**
 * Frontend client adapter for privileged Super Admin operations.
 * Communicates with:
 *   - Local dev server (http://localhost:5001) in development
 *   - Vercel Serverless endpoints (/api/admin/*) in production
 *
 * Requires user to be signed in with Firebase Auth. Sends caller's ID token
 * in Authorization: Bearer <token> for server-side super_admin verification.
 */

import { auth } from '../firebase/config';

/**
 * Determine the backend base URL for privileged admin actions.
 * - Uses VITE_ADMIN_API_URL if explicitly configured.
 * - Defaults to http://localhost:5001 in development mode.
 * - Defaults to '' (relative path) in production for Vercel Serverless.
 */
export function getAdminApiBaseUrl() {
  if (import.meta.env.VITE_ADMIN_API_URL) {
    return import.meta.env.VITE_ADMIN_API_URL.replace(/\/+$/, '');
  }
  if (import.meta.env.DEV) {
    return 'http://localhost:5001';
  }
  return '';
}

/**
 * Retrieves the current Firebase user's ID token.
 * Throws a clear error if the user is not authenticated.
 */
async function getIdToken() {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Authentication required. You must be signed in to perform this action.');
  }
  return user.getIdToken();
}

/**
 * Creates a new user account (employee or admin).
 *
 * @param {Object} payload
 * @param {string} payload.email
 * @param {string} payload.password
 * @param {string} [payload.name]
 * @param {string} [payload.employeeId]
 * @param {string} [payload.department]
 * @param {string} [payload.role='employee']
 * @returns {Promise<{ success: boolean, uid: string, message: string }>}
 */
export async function createUser(payload) {
  const token = await getIdToken();
  const baseUrl = getAdminApiBaseUrl();
  const url = `${baseUrl}/api/admin/create-user`;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
  } catch {
    if (import.meta.env.DEV) {
      throw new Error(
        'Could not reach the local admin server at localhost:5001. Please ensure the dev server is running (node server/devServer.js).'
      );
    }
    throw new Error('Network error. Failed to communicate with the admin server.');
  }

  let data;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const errorMsg = data?.error?.message || data?.message || `Request failed with status ${response.status}`;
    const err = new Error(errorMsg);
    err.code = data?.error?.code || data?.code || 'internal';
    err.status = response.status;
    throw err;
  }

  return data;
}

/**
 * Deletes / archives an employee or admin account.
 * Historical meal selections and working-mode records are preserved.
 *
 * @param {string|{ uid: string }} payload Either a UID string or an object with { uid }
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function deleteUser(payload) {
  const uid = typeof payload === 'string' ? payload : payload?.uid;
  if (!uid) {
    throw new Error('User ID (uid) is required to delete an account.');
  }

  const token = await getIdToken();
  const baseUrl = getAdminApiBaseUrl();
  const url = `${baseUrl}/api/admin/delete-user`;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ uid })
    });
  } catch {
    if (import.meta.env.DEV) {
      throw new Error(
        'Could not reach the local admin server at localhost:5001. Please ensure the dev server is running (node server/devServer.js).'
      );
    }
    throw new Error('Network error. Failed to communicate with the admin server.');
  }

  let data;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const errorMsg = data?.error?.message || data?.message || `Request failed with status ${response.status}`;
    const err = new Error(errorMsg);
    err.code = data?.error?.code || data?.code || 'internal';
    err.status = response.status;
    throw err;
  }

  return data;
}

/**
 * Updates an employee account (name, email, employeeId, department).
 * If email is changed, updates both Firebase Auth and Firestore.
 *
 * @param {Object} payload
 * @param {string} payload.uid - Target user UID
 * @param {string} [payload.name]
 * @param {string} [payload.email]
 * @param {string} [payload.employeeId]
 * @param {string} [payload.department]
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function updateUser(payload) {
  const uid = payload?.uid;
  if (!uid) {
    throw new Error('User ID (uid) is required to update an account.');
  }

  const token = await getIdToken();
  const baseUrl = getAdminApiBaseUrl();
  const url = `${baseUrl}/api/admin/update-user`;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
  } catch {
    if (import.meta.env.DEV) {
      throw new Error(
        'Could not reach the local admin server at localhost:5001. Please ensure the dev server is running (node server/devServer.js).'
      );
    }
    throw new Error('Network error. Failed to communicate with the admin server.');
  }

  let data;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const errorMsg = data?.error?.message || data?.message || `Request failed with status ${response.status}`;
    const err = new Error(errorMsg);
    err.code = data?.error?.code || data?.code || 'internal';
    err.status = response.status;
    throw err;
  }

  return data;
}

const adminApi = {
  createUser,
  deleteUser,
  updateUser,
  getAdminApiBaseUrl
};

export default adminApi;