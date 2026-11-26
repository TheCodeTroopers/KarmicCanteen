// server/core/userManager.js
/**
 * Core User Management Engine for Karmic Canteen.
 *
 * Reusable backend module for managing employees and admins with Firebase Admin SDK.
 * Compatible with:
 *   1. Local development Node.js server (₹0 Spark)
 *   2. Vercel Serverless Functions (/api/admin/*)
 *   3. Firebase Cloud Functions (Blaze plan production)
 *   4. Company on-premise Docker / Express containers
 */

const admin = require('firebase-admin');
const crypto = require('crypto');

const FIREBASE_WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_API_KEY || 'AIzaSyCR-a2dg3kGHV3tY8LA9B9_FVBx0fm41BI';

/**
 * Generates a unique, cryptographically secure random password.
 * High entropy: 24 characters with uppercase, lowercase, numbers, and symbols.
 */
function generateSecureRandomPassword(length = 24) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}';
  const randomBytes = crypto.randomBytes(length);
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset[randomBytes[i] % charset.length];
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[!@#$%^&*()_+\-=[\]{}]/.test(password)) {
    return generateSecureRandomPassword(length);
  }
  return password;
}

/**
 * Dispatches a password setup/reset email to the user via Firebase Identity Toolkit.
 * This triggers Firebase's built-in email template with a secure out-of-band link.
 *
 * @param {string} email
 * @returns {Promise<{ success: boolean }>}
 */
async function sendFirebasePasswordResetEmail(email) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${FIREBASE_WEB_API_KEY}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestType: 'PASSWORD_RESET',
      email: email
    })
  });

  const data = await response.json();
  if (!response.ok) {
    const errorMsg = data?.error?.message || 'Failed to dispatch password setup email via Identity Toolkit';
    throw new Error(errorMsg);
  }

  return { success: true };
}


/**
 * Helper to verify that the caller is an admin or super admin.
 * Returns the caller UID and email on success.
 */
const ADMIN_ROLES = ['admin', 'super_admin'];
async function assertAdmin(idToken) {
  if (!idToken || typeof idToken !== 'string') {
    throw new AppError(401, 'unauthenticated', 'You must be signed in with a valid ID token.');
  }

  let decodedToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(idToken);
  } catch (err) {
    console.error('ID Token verification failed:', err.message);
    throw new AppError(401, 'unauthenticated', 'Invalid or expired authentication token.');
  }

  const uid = decodedToken.uid;
  const doc = await admin.firestore().collection('users').doc(uid).get();
  const role = doc.get('role');
  if (!doc.exists || !ADMIN_ROLES.includes(role)) {
    throw new AppError(403, 'permission-denied', 'Only admins can perform this action.');
  }
  return { uid, email: decodedToken.email || doc.get('email') };
}

/**
 * Helper to verify that the caller is an authenticated employee.
 * Returns the caller UID and email on success.
 */
async function assertEmployee(idToken) {
  if (!idToken || typeof idToken !== 'string') {
    throw new AppError(401, 'unauthenticated', 'You must be signed in with a valid ID token.');
  }

  let decodedToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(idToken);
  } catch (err) {
    console.error('ID Token verification failed:', err.message);
    throw new AppError(401, 'unauthenticated', 'Invalid or expired authentication token.');
  }

  const uid = decodedToken.uid;
  const doc = await admin.firestore().collection('users').doc(uid).get();
  const role = doc.get('role');
  if (!doc.exists || (role !== 'employee' && role !== 'student')) {
    throw new AppError(403, 'permission-denied', 'Only employees can perform this action.');
  }
  return {
    uid,
    email: decodedToken.email || doc.get('email'),
    name: doc.get('name') || decodedToken.name || decodedToken.email || 'Employee'
  };
}

// Short-window event deduplication to prevent duplicate notifications
const recentNotificationEvents = new Map();
function isDuplicateEvent(key, windowMs = 10000) {
  if (!key) return false;
  const now = Date.now();
  const last = recentNotificationEvents.get(key);
  if (last && now - last < windowMs) {
    return true;
  }
  recentNotificationEvents.set(key, now);
  if (recentNotificationEvents.size > 500) {
    for (const [k, ts] of recentNotificationEvents.entries()) {
      if (now - ts >= windowMs) recentNotificationEvents.delete(k);
    }
  }
  return false;
}

/**
 * Shared FCM multicast sender with batching and invalid-token cleanup.
 */
async function sendFcmToTokenDocs(tokenDocs, { title, body, data = {} }) {
  if (!tokenDocs || tokenDocs.length === 0) {
    return { sentCount: 0, failureCount: 0, cleanedCount: 0 };
  }

  let sentCount = 0;
  let failureCount = 0;
  let cleanedCount = 0;
  const BATCH_SIZE = 500;

  // Ensure all data values are strings as required by FCM
  const stringData = {};
  Object.entries(data || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null) {
      stringData[k] = String(v);
    }
  });

  for (let i = 0; i < tokenDocs.length; i += BATCH_SIZE) {
    const batchDocs = tokenDocs.slice(i, i + BATCH_SIZE);
    const batchTokens = batchDocs.map((d) => d.token);

    const response = await admin.messaging().sendEachForMulticast({
      tokens: batchTokens,
      notification: { title, body },
      data: stringData
    });

    sentCount += response.successCount;
    failureCount += response.failureCount;

    const batch = admin.firestore().batch();
    let hasDeletions = false;
    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const errCode = resp.error?.code;
        if (
          errCode === 'messaging/registration-token-not-registered' ||
          errCode === 'messaging/invalid-registration-token'
        ) {
          batch.delete(batchDocs[idx].ref);
          cleanedCount++;
          hasDeletions = true;
        }
      }
    });
    if (hasDeletions) {
      await batch.commit();
    }
  }

  return { sentCount, failureCount, cleanedCount };
}

/**
 * Collects unique FCM token docs for a list of user UIDs and sends a notification.
 */
async function sendNotificationToUsers(uids, message) {
  const uniqueUids = [...new Set((uids || []).filter(Boolean))];
  if (uniqueUids.length === 0) {
    return { sentCount: 0, failureCount: 0, cleanedCount: 0 };
  }

  const tokenDocs = [];
  const seenTokens = new Set();

  await Promise.all(
    uniqueUids.map(async (uid) => {
      const snap = await admin.firestore()
        .collection('users')
        .doc(uid)
        .collection('fcmTokens')
        .get();

      snap.forEach((doc) => {
        const token = doc.get('token');
        if (typeof token === 'string' && token && !seenTokens.has(token)) {
          seenTokens.add(token);
          tokenDocs.push({ ref: doc.ref, token });
        }
      });
    })
  );

  return sendFcmToTokenDocs(tokenDocs, message);
}

/**
 * Queries Firestore `users` for UIDs matching any of the provided roles.
 */
async function getUserUidsByRoles(roles) {
  const snap = await admin.firestore()
    .collection('users')
    .where('role', 'in', roles)
    .get();
  return snap.docs.map((d) => d.id);
}

/**
 * Core logic for sending a test FCM push notification.
 * Returns { sentCount, failureCount, cleanedCount }.
 */
async function sendTestNotificationCore(requesterUid, payload = {}) {
  const targetUid = typeof payload.targetUid === 'string' && payload.targetUid.trim() !== ''
    ? payload.targetUid.trim()
    : requesterUid;
  const title = typeof payload.title === 'string' && payload.title.trim() !== ''
    ? payload.title.trim().substring(0, 100)
    : 'Test Notification';
  const body = typeof payload.body === 'string' && payload.body.trim() !== ''
    ? payload.body.trim().substring(0, 500)
    : 'This is a test.';

  return sendNotificationToUsers([targetUid], {
    title,
    body,
    data: { tag: `test-${targetUid}` }
  });
}

/**
 * Handles employee-triggered notification events:
 *  - 'meal_submitted': confirms to the employee and notifies admins
 *  - 'deadline_reminder': notifies the employee about upcoming deadline
 */
async function sendEmployeeEventNotificationCore(caller, payload = {}) {
  const type = typeof payload.type === 'string' ? payload.type.trim() : '';
  const date = typeof payload.date === 'string' ? payload.date.trim() : '';

  if (type === 'meal_submitted') {
    const dedupKey = `meal_submitted:${caller.uid}:${date}:${JSON.stringify(payload.meals || [])}`;
    if (isDuplicateEvent(dedupKey, 5000)) {
      return { deduplicated: true, sentCount: 0, failureCount: 0, cleanedCount: 0 };
    }

    const mealsList = Array.isArray(payload.meals) && payload.meals.length > 0
      ? payload.meals.join(', ')
      : 'your selected meals';

    const employeeResult = await sendNotificationToUsers([caller.uid], {
      title: 'Meal Selection Submitted',
      body: `Your meal selection for ${date || 'tomorrow'} (${mealsList}) has been saved.`,
      data: { type: 'meal_submitted', date, tag: `meal-submitted-${caller.uid}-${date}` }
    });

    const adminUids = await getUserUidsByRoles(['admin', 'super_admin']);
    const adminResult = await sendNotificationToUsers(adminUids, {
      title: 'New Meal Selection',
      body: `${caller.name || caller.email} submitted meal preferences for ${date || 'tomorrow'}.`,
      data: { type: 'admin_meal_submitted', date, employeeUid: caller.uid, tag: `admin-meal-${caller.uid}-${date}` }
    });

    return {
      sentCount: employeeResult.sentCount + adminResult.sentCount,
      failureCount: employeeResult.failureCount + adminResult.failureCount,
      cleanedCount: employeeResult.cleanedCount + adminResult.cleanedCount
    };
  }

  if (type === 'deadline_reminder') {
    const dedupKey = `deadline_reminder:${caller.uid}:${date}`;
    if (isDuplicateEvent(dedupKey, 60000)) {
      return { deduplicated: true, sentCount: 0, failureCount: 0, cleanedCount: 0 };
    }

    const timeRemaining = typeof payload.timeRemaining === 'string' && payload.timeRemaining.trim()
      ? payload.timeRemaining.trim()
      : 'soon';

    return sendNotificationToUsers([caller.uid], {
      title: 'Meal Selection Deadline Approaching',
      body: `Deadline is in ${timeRemaining}. Complete your meal selection for ${date || 'tomorrow'} before it closes.`,
      data: { type: 'deadline_reminder', date, tag: `deadline-reminder-${caller.uid}-${date}` }
    });
  }

  throw new AppError(400, 'invalid-argument', 'Unsupported employee notification event type.');
}

/**
 * Handles admin-triggered notification events:
 *  - 'menu_published': notifies all employees + admins
 *  - 'menu_deleted': notifies admins
 *  - 'deadline_updated': notifies admins
 */
async function sendAdminEventNotificationCore(caller, payload = {}) {
  const type = typeof payload.type === 'string' ? payload.type.trim() : '';
  const date = typeof payload.date === 'string' ? payload.date.trim() : '';
  const dateLabel = typeof payload.dateLabel === 'string' && payload.dateLabel.trim()
    ? payload.dateLabel.trim()
    : date;

  if (type === 'menu_published') {
    const dedupKey = `menu_published:${date}`;
    if (isDuplicateEvent(dedupKey, 10000)) {
      return { deduplicated: true, sentCount: 0, failureCount: 0, cleanedCount: 0 };
    }

    const employeeUids = await getUserUidsByRoles(['employee', 'student']);
    const employeeResult = await sendNotificationToUsers(employeeUids, {
      title: 'New Meal Menu Published',
      body: `The menu for ${dateLabel || 'upcoming meals'} is now available. Submit your meal selection before the deadline!`,
      data: { type: 'menu_published', date, tag: `menu-published-${date}` }
    });

    const adminUids = (await getUserUidsByRoles(['admin', 'super_admin'])).filter(
      (id) => id !== caller.uid
    );
    const adminResult = await sendNotificationToUsers(adminUids, {
      title: 'Menu Published',
      body: `${caller.email} published the meal menu for ${dateLabel || date}.`,
      data: { type: 'admin_menu_published', date, tag: `admin-menu-published-${date}` }
    });

    return {
      sentCount: employeeResult.sentCount + adminResult.sentCount,
      failureCount: employeeResult.failureCount + adminResult.failureCount,
      cleanedCount: employeeResult.cleanedCount + adminResult.cleanedCount
    };
  }

  if (type === 'menu_deleted') {
    const dedupKey = `menu_deleted:${date}`;
    if (isDuplicateEvent(dedupKey, 10000)) {
      return { deduplicated: true, sentCount: 0, failureCount: 0, cleanedCount: 0 };
    }

    const adminUids = await getUserUidsByRoles(['admin', 'super_admin']);
    return sendNotificationToUsers(adminUids, {
      title: 'Meal Menu Deleted',
      body: `The meal menu for ${dateLabel || date} was deleted by ${caller.email}.`,
      data: { type: 'menu_deleted', date, tag: `menu-deleted-${date}` }
    });
  }

  if (type === 'deadline_updated') {
    const timeLabel = typeof payload.timeLabel === 'string' ? payload.timeLabel.trim() : '';
    const dedupKey = `deadline_updated:${timeLabel}`;
    if (isDuplicateEvent(dedupKey, 10000)) {
      return { deduplicated: true, sentCount: 0, failureCount: 0, cleanedCount: 0 };
    }

    const adminUids = await getUserUidsByRoles(['admin', 'super_admin']);
    return sendNotificationToUsers(adminUids, {
      title: 'Meal Deadline Updated',
      body: `Daily meal selection deadline was updated to ${timeLabel || 'a new time'} by ${caller.email}.`,
      data: { type: 'deadline_updated', tag: `deadline-updated-${timeLabel}` }
    });
  }

  throw new AppError(400, 'invalid-argument', 'Unsupported admin notification event type.');
}

function initAdmin() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  // 1. Service account JSON via environment variable
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY.trim();
      // Handle base64 encoded or direct JSON string
      const serviceAccount = rawKey.startsWith('{')
        ? JSON.parse(rawKey)
        : JSON.parse(Buffer.from(rawKey, 'base64').toString('utf8'));

      return admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    } catch (err) {
      console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:', err);
    }
  }

  // 2. Default application credentials (used by Google Cloud / Firebase Cloud Functions) or project ID fallback
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || 'karmicsolutions';
  return admin.initializeApp({ projectId });
}

// Ensure initialization
initAdmin();

// Constants matching existing rules & schema
const SUPER_ADMIN_ROLE = 'super_admin';
const ASSIGNABLE_ROLES = ['employee', 'admin'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Standard Application Error with HTTP-compatible status code
 */
class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * Verifies the caller's Firebase ID token and validates that they possess
 * the `super_admin` role in Firestore.
 *
 * @param {string} idToken - Raw Firebase ID Token from Authorization header
 * @returns {Promise<{ uid: string, email: string }>} Authenticated caller details
 */
async function assertSuperAdmin(idToken) {
  if (!idToken || typeof idToken !== 'string') {
    throw new AppError(401, 'unauthenticated', 'You must be signed in with a valid ID token.');
  }

  let decodedToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(idToken);
  } catch (err) {
    console.error('ID Token verification failed:', err.message);
    throw new AppError(401, 'unauthenticated', 'Invalid or expired authentication token.');
  }

  const callerUid = decodedToken.uid;
  const callerDoc = await admin
    .firestore()
    .collection('users')
    .doc(callerUid)
    .get();

  if (!callerDoc.exists || callerDoc.get('role') !== SUPER_ADMIN_ROLE) {
    throw new AppError(
      403,
      'permission-denied',
      'Forbidden: Only super admins can perform account management operations.'
    );
  }

  return {
    uid: callerUid,
    email: decodedToken.email || callerDoc.get('email')
  };
}

/**
 * Creates a new employee or admin user in Firebase Authentication and Firestore.
 * Performs automatic rollback if Firestore profile saving fails.
 *
 * @param {string} idToken - Caller's Firebase ID token
 * @param {Object} payload - { email, password, role, name, employeeId, department }
 * @returns {Promise<Object>} Created user details { uid, email, role, name, employeeId, department }
 */
async function createUserAccountCore(idToken, payload = {}) {
  const caller = await assertSuperAdmin(idToken);

  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  const password = typeof payload.password === 'string' ? payload.password : '';
  const role = typeof payload.role === 'string' ? payload.role.trim().toLowerCase() : 'employee';
  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  const employeeId = typeof payload.employeeId === 'string' ? payload.employeeId.trim().toUpperCase() : '';
  const department = typeof payload.department === 'string' ? payload.department.trim() : '';

  // Validations matching schema
  if (!EMAIL_PATTERN.test(email)) {
    throw new AppError(400, 'invalid-argument', 'A valid email address is required.');
  }
  if (!password || password.length < 6) {
    throw new AppError(400, 'invalid-argument', 'Password must be at least 6 characters.');
  }
  if (!ASSIGNABLE_ROLES.includes(role)) {
    throw new AppError(
      400,
      'invalid-argument',
      `Role must be one of: ${ASSIGNABLE_ROLES.join(', ')}.`
    );
  }

  // 1. Create Firebase Authentication Account
  let userRecord;
  try {
    userRecord = await admin.auth().createUser({
      email,
      password,
      ...(name ? { displayName: name } : {})
    });
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      throw new AppError(409, 'already-exists', 'An account with this email address already exists.');
    }
    if (err.code === 'auth/invalid-password') {
      throw new AppError(400, 'invalid-argument', 'Password does not meet Firebase requirements.');
    }
    console.error('admin.auth().createUser failed:', err);
    throw new AppError(500, 'internal', 'Could not create authentication account.');
  }

  // 2. Create user document in Firestore `users/{uid}`
  const profileDoc = {
    email,
    role,
    ...(name ? { name } : {}),
    ...(employeeId ? { employeeId } : {}),
    ...(department ? { department } : {}),
    createdBy: caller.uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };

  try {
    await admin
      .firestore()
      .collection('users')
      .doc(userRecord.uid)
      .set(profileDoc);
  } catch (err) {
    // Transactional rollback: Clean up Auth account if Firestore write fails
    console.error('Writing users doc failed. Rolling back created Auth account:', err);
    await admin.auth().deleteUser(userRecord.uid).catch((rollbackErr) => {
      console.error('Rollback deleteUser failed:', rollbackErr);
    });
    throw new AppError(500, 'internal', 'Could not save employee profile in Firestore.');
  }

  return {
    uid: userRecord.uid,
    id: userRecord.uid,
    email,
    role,
    name,
    employeeId,
    department
  };
}

/**
 * Removes an employee or admin account safely.
 *
 * Safe Deletion Principle:
 *   1. Deletes the Firebase Auth account so the user can no longer log in.
 *   2. Removes or soft-deletes the `users/{uid}` profile document.
 *   3. PRESERVES historical meal selections (`mealSelections/{date}/users/{uid}`)
 *      and working-mode records (`workingModes/{date}/users/{uid}`) to keep
 *      canteen demand forecasts, attendance metrics, and audit reports intact.
 *
 * @param {string} idToken - Caller's Firebase ID token
 * @param {string} targetUid - UID of the employee to remove
 * @returns {Promise<Object>} Result { uid, deleted: true }
 */
async function deleteUserAccountCore(idToken, targetUid) {
  const caller = await assertSuperAdmin(idToken);

  const uid = typeof targetUid === 'string' ? targetUid.trim() : '';
  if (!uid) {
    throw new AppError(400, 'invalid-argument', 'A target user UID is required.');
  }

  if (uid === caller.uid) {
    throw new AppError(400, 'failed-precondition', 'Security violation: You cannot delete your own account.');
  }

  const userRef = admin.firestore().collection('users').doc(uid);
  const userDoc = await userRef.get();

  if (userDoc.exists) {
    const existingRole = userDoc.get('role');
    if (!ASSIGNABLE_ROLES.includes(existingRole)) {
      throw new AppError(
        403,
        'permission-denied',
        'Only employee and admin accounts can be removed.'
      );
    }
  }

  // 1. Delete user from Firebase Authentication
  try {
    await admin.auth().deleteUser(uid);
  } catch (err) {
    if (err.code !== 'auth/user-not-found') {
      console.error('admin.auth().deleteUser failed:', err);
      throw new AppError(500, 'internal', 'Failed to delete authentication account.');
    }
  }

  // 2. Remove profile document from `users/{uid}`
  // NOTE: /mealSelections/{date}/users/{uid} and /workingModes/ are strictly left intact
  if (userDoc.exists) {
    await userRef.delete();
  }

  return {
    uid,
    deleted: true
  };
}

/**
 * Updates an employee account.
 *
 * Safe Update Principle:
 *   1. Verifies caller is super_admin.
 *   2. Forbids modifying super_admin accounts or editing roles.
 *   3. If email changed: updates Firebase Auth account and Firestore user document.
 *   4. Validates required fields, email format, and unique employee ID / email.
 *   5. Preserves historical meal selections and working-mode records.
 *
 * @param {string} idToken - Caller's Firebase ID token
 * @param {string} targetUid - UID of the employee to edit
 * @param {Object} payload - { name, email, employeeId, department, role }
 * @returns {Promise<Object>} Result { uid, updated: true, message: string }
 */
async function updateUserAccountCore(idToken, targetUid, payload = {}) {
  const caller = await assertSuperAdmin(idToken);

  const uid = typeof targetUid === 'string' ? targetUid.trim() : '';
  if (!uid) {
    throw new AppError(400, 'invalid-argument', 'A target user UID is required.');
  }

  // Reject self-updates
  if (uid === caller.uid) {
    throw new AppError(400, 'failed-precondition', 'Security violation: Super Admins cannot update their own account through this interface.');
  }

  const { name, email, employeeId, department, role } = payload;

  // Never allow changing roles through this feature
  if (role !== undefined && role !== 'employee') {
    throw new AppError(403, 'permission-denied', 'Role changes are not permitted through this interface.');
  }

  const userRef = admin.firestore().collection('users').doc(uid);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    throw new AppError(404, 'not-found', 'Employee profile not found.');
  }

  const currentRole = userDoc.get('role');
  if (!ASSIGNABLE_ROLES.includes(currentRole)) {
    throw new AppError(403, 'permission-denied', 'Super Admin accounts cannot be edited.');
  }

  // Validate Name
  if (name !== undefined && typeof name === 'string' && !name.trim()) {
    throw new AppError(400, 'invalid-argument', 'Full name cannot be empty.');
  }

  // Validate Employee ID
  if (employeeId !== undefined && typeof employeeId === 'string') {
    const trimmedId = employeeId.trim().toUpperCase();
    if (!trimmedId) {
      throw new AppError(400, 'invalid-argument', 'Employee ID cannot be empty.');
    }

    // Check if another user already has this employeeId
    const existingSnap = await admin.firestore().collection('users')
      .where('employeeId', '==', trimmedId)
      .get();
    const conflict = existingSnap.docs.find(d => d.id !== uid);
    if (conflict) {
      throw new AppError(409, 'already-exists', 'Another employee already has this Employee ID.');
    }
  }

  // Validate & Handle Email
  const currentEmail = (userDoc.get('email') || '').toLowerCase().trim();
  let emailUpdated = false;
  let originalEmail = currentEmail;

  if (email !== undefined && typeof email === 'string') {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !EMAIL_PATTERN.test(trimmedEmail)) {
      throw new AppError(400, 'invalid-argument', 'A valid email address is required.');
    }

    if (trimmedEmail !== currentEmail) {
      // Check if email already in use in Firestore by another user
      const existingEmailSnap = await admin.firestore().collection('users')
        .where('email', '==', trimmedEmail)
        .get();
      const emailConflict = existingEmailSnap.docs.find(d => d.id !== uid);
      if (emailConflict) {
        throw new AppError(409, 'already-exists', 'An account with this email address already exists.');
      }

      // Update in Firebase Auth
      try {
        await admin.auth().updateUser(uid, {
          email: trimmedEmail,
          displayName: name ? name.trim() : userDoc.get('name') || undefined
        });
        emailUpdated = true;
      } catch (authErr) {
        if (authErr.code === 'auth/email-already-exists') {
          throw new AppError(409, 'already-exists', 'An account with this email address already exists in Authentication.');
        }
        console.error('admin.auth().updateUser failed:', authErr);
        throw new AppError(500, 'internal', 'Failed to update authentication account email.');
      }
    }
  }

  // If displayName changed but email did not, update Auth displayName
  if (!emailUpdated && name !== undefined && typeof name === 'string') {
    try {
      await admin.auth().updateUser(uid, {
        displayName: name.trim()
      });
    } catch (authErr) {
      console.warn('Could not update Auth displayName:', authErr.message);
    }
  }

  // Update Firestore user document
  const updateData = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: caller.uid
  };

  if (name !== undefined) updateData.name = name.trim();
  if (email !== undefined) updateData.email = email.trim().toLowerCase();
  if (employeeId !== undefined) updateData.employeeId = employeeId.trim().toUpperCase();
  if (department !== undefined) updateData.department = department.trim();

  try {
    await userRef.update(updateData);
  } catch (dbErr) {
    // Rollback email in Firebase Auth if Firestore write fails
    if (emailUpdated) {
      try {
        await admin.auth().updateUser(uid, { email: originalEmail });
      } catch (rollbackErr) {
        console.error('Failed to rollback Auth email after Firestore failure:', rollbackErr);
      }
    }
    console.error('userRef.update failed:', dbErr);
    throw new AppError(500, 'internal', 'Failed to update employee profile in database.');
  }

  return {
    uid,
    updated: true,
    message: 'Employee updated successfully.'
  };
}

/**
 * Bulk-creates multiple employee accounts in Firebase Auth + Firestore.
 * Handles partial failures safely with individual rollbacks.
 *
 * @param {string} idToken - Caller's Firebase ID token
 * @param {Array<Object>} employees - Array of employee payloads { name, email, employeeId, department, password }
 * @returns {Promise<Object>} { succeeded, failed, total, details }
 */
async function bulkCreateUserAccountsCore(idToken, employees = []) {
  const caller = await assertSuperAdmin(idToken);

  if (!Array.isArray(employees) || employees.length === 0) {
    throw new AppError(400, 'invalid-argument', 'An array of employee records is required.');
  }

  // Pre-load all existing emails & employeeIds from Firestore for fast conflict detection
  const usersSnap = await admin.firestore().collection('users').get();
  const existingEmails = new Set();
  const existingEmpIds = new Set();

  usersSnap.forEach((docSnap) => {
    const data = docSnap.data();
    if (data.email) existingEmails.add(data.email.trim().toLowerCase());
    if (data.employeeId) existingEmpIds.add(data.employeeId.trim().toUpperCase());
  });

  const details = [];
  let succeeded = 0;
  let failed = 0;
  let emailsSent = 0;

  for (const emp of employees) {
    const name = typeof emp.name === 'string' ? emp.name.trim() : '';
    const email = typeof emp.email === 'string' ? emp.email.trim().toLowerCase() : '';
    const employeeId = typeof emp.employeeId === 'string' ? emp.employeeId.trim().toUpperCase() : '';
    const department = typeof emp.department === 'string' ? emp.department.trim() : 'Engineering';
    const securePassword = generateSecureRandomPassword(24);

    // 1. Validation
    if (!name) {
      failed++;
      details.push({
        name,
        email,
        employeeId,
        department,
        success: false,
        emailSent: false,
        message: 'Full name is required.'
      });
      continue;
    }

    if (!email || !EMAIL_PATTERN.test(email)) {
      failed++;
      details.push({
        name,
        email,
        employeeId,
        department,
        success: false,
        emailSent: false,
        message: 'A valid email address is required.'
      });
      continue;
    }

    if (!employeeId) {
      failed++;
      details.push({
        name,
        email,
        employeeId,
        department,
        success: false,
        emailSent: false,
        message: 'Employee ID is required.'
      });
      continue;
    }

    if (existingEmails.has(email)) {
      failed++;
      details.push({
        name,
        email,
        employeeId,
        department,
        success: false,
        emailSent: false,
        message: 'An account with this email already exists.'
      });
      continue;
    }

    if (existingEmpIds.has(employeeId)) {
      failed++;
      details.push({
        name,
        email,
        employeeId,
        department,
        success: false,
        emailSent: false,
        message: 'An employee with this Employee ID already exists.'
      });
      continue;
    }

    // 2. Creation with rollback safety
    let userRecord = null;
    try {
      userRecord = await admin.auth().createUser({
        email,
        password: securePassword,
        displayName: name
      });

      const profileDoc = {
        name,
        email,
        employeeId,
        department: department || 'Engineering',
        role: 'employee',
        createdBy: caller.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      };

      await admin.firestore().collection('users').doc(userRecord.uid).set(profileDoc);

      existingEmails.add(email);
      existingEmpIds.add(employeeId);
      succeeded++;

      // 3. Dispatch password setup/reset email (handled separately from account creation)
      let emailSent = false;
      let emailError = null;
      try {
        await sendFirebasePasswordResetEmail(email);
        emailSent = true;
        emailsSent++;
      } catch (eErr) {
        emailSent = false;
        emailError = eErr.message;
        console.warn(`[bulkCreate] Account created for ${email}, but setup email delivery failed:`, eErr.message);
      }

      details.push({
        uid: userRecord.uid,
        name,
        email,
        employeeId,
        department,
        success: true,
        emailSent,
        message: emailSent
          ? 'Account created and password setup email sent.'
          : `Account created, but password reset email failed to send: ${emailError || 'Email delivery failed'}`
      });
    } catch (err) {
      if (userRecord?.uid) {
        await admin.auth().deleteUser(userRecord.uid).catch((rbErr) => {
          console.error('Rollback deleteUser failed during bulk insertion:', rbErr.message);
        });
      }
      failed++;
      let errorMsg = err.message || 'Failed to create account.';
      if (err.code === 'auth/email-already-exists') {
        errorMsg = 'An account with this email already exists in Authentication.';
        existingEmails.add(email);
      }
      details.push({
        name,
        email,
        employeeId,
        department,
        success: false,
        emailSent: false,
        message: errorMsg
      });
    }
  }

  return {
    succeeded,
    failed,
    total: employees.length,
    emailsSent,
    details
  };
}

module.exports = {
  admin,
  AppError,
  assertSuperAdmin,
  createUserAccountCore,
  deleteUserAccountCore,
  updateUserAccountCore,
  bulkCreateUserAccountsCore,
  generateSecureRandomPassword,
  sendFirebasePasswordResetEmail,
  sendTestNotificationCore,
  sendEmployeeEventNotificationCore,
  sendAdminEventNotificationCore,
  assertAdmin,
  assertEmployee,
};
