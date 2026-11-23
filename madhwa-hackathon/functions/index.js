// firebase-functions v6: the package root is the v2 API; the existing
// scheduled stubs use the v1 API, so they import from 'firebase-functions/v1'.
const functions = require('firebase-functions/v1');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { DateTime } = require('luxon');
admin.initializeApp();

// =========================================================
// ROLES
// =========================================================

const SUPER_ADMIN_ROLE = 'super_admin';

// Roles a super admin may create/delete. Super admins themselves are only
// created manually in the Firebase Console.
const ASSIGNABLE_ROLES = ['employee', 'admin'];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Throws unless the caller is signed in and their users/<uid> doc has
 * role == 'super_admin'. The role is read from Firestore (server-side, via
 * the Admin SDK) so it can't be spoofed by the client.
 */
async function assertSuperAdmin(request) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }

  const callerDoc = await admin
    .firestore()
    .collection('users')
    .doc(request.auth.uid)
    .get();

  if (!callerDoc.exists || callerDoc.get('role') !== SUPER_ADMIN_ROLE) {
    throw new HttpsError(
      'permission-denied',
      'Only super admins can manage user accounts.'
    );
  }

  return request.auth.uid;
}

// =========================================================
// CREATE USER ACCOUNT (super admin only)
// =========================================================
// data: { email, password, role: 'admin' | 'employee', name? }
// Returns: { uid, email, role }
exports.createUserAccount = onCall(async (request) => {
  const callerUid = await assertSuperAdmin(request);

  const data = request.data || {};
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
  const password = typeof data.password === 'string' ? data.password : '';
  const role = typeof data.role === 'string' ? data.role.trim().toLowerCase() : '';
  const name = typeof data.name === 'string' ? data.name.trim() : '';

  if (!EMAIL_PATTERN.test(email)) {
    throw new HttpsError('invalid-argument', 'A valid email is required.');
  }
  if (password.length < 6) {
    throw new HttpsError('invalid-argument', 'Password must be at least 6 characters.');
  }
  if (!ASSIGNABLE_ROLES.includes(role)) {
    throw new HttpsError(
      'invalid-argument',
      `Role must be one of: ${ASSIGNABLE_ROLES.join(', ')}.`
    );
  }

  let userRecord;
  try {
    userRecord = await admin.auth().createUser({
      email,
      password,
      ...(name ? { displayName: name } : {})
    });
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', 'An account with this email already exists.');
    }
    if (err.code === 'auth/invalid-password') {
      throw new HttpsError('invalid-argument', 'Password does not meet requirements.');
    }
    console.error('createUser failed:', err);
    throw new HttpsError('internal', 'Could not create the account.');
  }

  try {
    await admin
      .firestore()
      .collection('users')
      .doc(userRecord.uid)
      .set({
        email,
        role,
        ...(name ? { name } : {}),
        createdBy: callerUid,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
  } catch (err) {
    // Don't leave an Auth account without a role document.
    console.error('Writing users doc failed, rolling back Auth account:', err);
    await admin.auth().deleteUser(userRecord.uid).catch((rollbackErr) => {
      console.error('Rollback deleteUser failed:', rollbackErr);
    });
    throw new HttpsError('internal', 'Could not save the user profile.');
  }

  return { uid: userRecord.uid, email, role };
});

// =========================================================
// DELETE USER ACCOUNT (super admin only)
// =========================================================
// data: { uid }
// Deletes the Firebase Auth account and its users/<uid> doc.
// Super admin accounts (including the caller) cannot be deleted here.
exports.deleteUserAccount = onCall(async (request) => {
  const callerUid = await assertSuperAdmin(request);

  const uid = typeof request.data?.uid === 'string' ? request.data.uid.trim() : '';

  if (!uid) {
    throw new HttpsError('invalid-argument', 'A user uid is required.');
  }
  if (uid === callerUid) {
    throw new HttpsError('failed-precondition', 'You cannot delete your own account.');
  }

  const userRef = admin.firestore().collection('users').doc(uid);
  const userDoc = await userRef.get();

  if (userDoc.exists && !ASSIGNABLE_ROLES.includes(userDoc.get('role'))) {
    throw new HttpsError(
      'permission-denied',
      'Only admin and employee accounts can be deleted.'
    );
  }

  try {
    await admin.auth().deleteUser(uid);
  } catch (err) {
    // If the Auth account is already gone, still clean up the profile doc.
    if (err.code !== 'auth/user-not-found') {
      console.error('deleteUser failed:', err);
      throw new HttpsError('internal', 'Could not delete the account.');
    }
  }

  if (userDoc.exists) {
    await userRef.delete();
  }

  return { uid, deleted: true };
});

// =========================================================
// SCHEDULED JOBS (existing stubs)
// =========================================================

// =========================================================
// CANCEL BOOKING (employee callable)
// =========================================================
// Secure backend cancellation endpoint enforcing:
// 1. Mandatory authentication (authenticated employee UID only)
// 2. Strict ISO date validation (YYYY-MM-DD)
// 3. Document ownership and existence in mealSelections/{date}/users/{uid}
// 4. Rejection of already-cancelled bookings
// 5. Dynamic deadline retrieval from settings/deadline
// 6. Explicit Asia/Kolkata timezone calculation for the calendar day prior to the meal
// 7. Atomic Firestore transaction ensuring consistency under concurrent requests
exports.cancelBooking = onCall(async (request) => {
  // 1. Authenticate caller
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to cancel a meal booking.');
  }

  const uid = request.auth.uid;
  if (!uid || typeof uid !== 'string') {
    throw new HttpsError('unauthenticated', 'Invalid authentication credentials.');
  }

  // 2. Validate requested meal date format (YYYY-MM-DD)
  const rawDate = request.data?.date;
  const dateStr = typeof rawDate === 'string' ? rawDate.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new HttpsError('invalid-argument', 'Valid date in YYYY-MM-DD format is required.');
  }

  // Parse meal date strictly in Asia/Kolkata timezone
  const mealDate = DateTime.fromISO(dateStr, { zone: 'Asia/Kolkata' });
  if (!mealDate.isValid) {
    throw new HttpsError('invalid-argument', 'The provided meal date is invalid.');
  }

  const bookingRef = admin
    .firestore()
    .collection('mealSelections')
    .doc(dateStr)
    .collection('users')
    .doc(uid);

  const deadlineRef = admin.firestore().doc('settings/deadline');

  // 3. Execute cancellation inside an atomic transaction
  const result = await admin.firestore().runTransaction(async (transaction) => {
    // Read booking document
    const bookingSnap = await transaction.get(bookingRef);
    if (!bookingSnap.exists) {
      throw new HttpsError('not-found', 'No active meal booking found for the specified date.');
    }

    const bookingData = bookingSnap.data() || {};
    const currentStatus = String(bookingData.status || '').toLowerCase();
    if (currentStatus === 'cancelled') {
      throw new HttpsError('failed-precondition', 'This meal booking is already cancelled.');
    }

    // Read deadline configuration document
    const deadlineSnap = await transaction.get(deadlineRef);
    if (!deadlineSnap.exists) {
      throw new HttpsError('internal', 'Cancellation deadline settings are not configured in the system.');
    }

    const deadlineData = deadlineSnap.data() || {};
    const deadlineHour = Number(deadlineData.deadlineHour ?? 21);
    const deadlineMinute = Number(deadlineData.deadlineMinute ?? 0);

    if (
      !Number.isInteger(deadlineHour) ||
      deadlineHour < 0 ||
      deadlineHour > 23 ||
      !Number.isInteger(deadlineMinute) ||
      deadlineMinute < 0 ||
      deadlineMinute > 59
    ) {
      throw new HttpsError('internal', 'Configured cancellation deadline time is invalid.');
    }

    // 4. Calculate deadline in Asia/Kolkata: previous calendar day before the meal
    const cancellationDeadline = mealDate
      .minus({ days: 1 })
      .set({
        hour: deadlineHour,
        minute: deadlineMinute,
        second: 0,
        millisecond: 0
      });

    // 5. Trusted server time converted to Asia/Kolkata
    const serverTimestamp = admin.firestore.Timestamp.now();
    const nowKolkata = DateTime.fromJSDate(serverTimestamp.toDate(), { zone: 'Asia/Kolkata' });

    // Reject if current server time is equal to or after the deadline
    if (nowKolkata.toMillis() >= cancellationDeadline.toMillis()) {
      throw new HttpsError(
        'failed-precondition',
        `Cancellation deadline passed on ${cancellationDeadline.toFormat('dd LLL yyyy, hh:mm a')} IST.`
      );
    }

    // 6. Update booking safely
    const cancellationIso = nowKolkata.toISO();
    const cancelledPayload = {
      ...bookingData,
      status: 'cancelled',
      cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
      cancellationTimestamp: cancellationIso,
      cancellationDate: nowKolkata.toISODate(),
      cancellationTime: nowKolkata.toFormat('hh:mm:ss a'),
      breakfast: false,
      lunch: false,
      snacks: false,
      dinner: false
    };

    transaction.set(bookingRef, cancelledPayload, { merge: true });

    return {
      success: true,
      date: dateStr,
      status: 'cancelled',
      cancelledAt: cancellationIso
    };
  });

  return result;
});


exports.sendMealReminder = functions.pubsub
  .schedule('0 18 * * *')
  .timeZone('Asia/Kolkata')
  .onRun(async (context) => {
    const usersSnapshot = await admin.firestore()
      .collection('users')
      .where('role', '==', 'employee')
      .get();

    // Send notifications/emails to users who haven't selected meals
    // Implementation depends on notification method
  });

// Auto-generate report at 9 PM
exports.generateDailyReport = functions.pubsub
  .schedule('0 21 * * *')
  .timeZone('Asia/Kolkata')
  .onRun(async (context) => {
    // Auto-generate consolidated report
    // Logic similar to ReportsDashboard generateReport()
  });
