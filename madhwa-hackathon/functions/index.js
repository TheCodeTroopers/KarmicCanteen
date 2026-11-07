// firebase-functions v6: the package root is the v2 API; the existing
// scheduled stubs use the v1 API, so they import from 'firebase-functions/v1'.
const functions = require('firebase-functions/v1');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
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

// Scheduled function to send reminders at 6 PM daily
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
