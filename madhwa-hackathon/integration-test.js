// integration-test.js
// Run with: npx firebase emulators:exec "node integration-test.js"
// This script uses **Firebase client SDKs** (Auth, Firestore, Functions) to enforce security rules.
// It creates employee and admin users via the Admin SDK, signs them in with the client SDK,
// performs booking operations, and calls the `cancelBooking` callable.
// NOTE: Exact‑boundary deadline testing would require a mockable server clock, which the
// production callable does not expose. We therefore test the "before" and "after"
// scenarios by setting the deadline far enough in the future or past relative to the real
// current time. The "exact" deadline case is reported as **not reliably testable**.

const admin = require('firebase-admin');
const { initializeTestApp, initializeAdminApp } = require('firebase-functions-test')({
  projectId: 'karmicsolutions'
});

// ----- Client SDK imports (Node) -----
const { initializeApp, deleteApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword, signOut } = require('firebase/auth');
const { getFirestore, doc, setDoc, updateDoc, deleteDoc, getDoc } = require('firebase/firestore');
const { getFunctions, httpsCallable } = require('firebase/functions');

const { DateTime } = require('luxon');

// Helper to output PASS/FAIL lines
function logResult(name, passed, detail) {
  console.log(`${passed ? '✓ PASS' : '✗ FAIL'}: ${name} – ${detail}`);
}

// ---------------------------------------------------------------------
// Environment: point client SDKs to the emulators (hosted locally).
// ---------------------------------------------------------------------
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099'; // default auth emulator port

// Minimal firebase config – values are ignored by the emulators but required for init.
const firebaseConfig = {
  apiKey: 'fake-api-key',
  authDomain: 'fake-auth-domain',
  projectId: 'karmicsolutions',
  appId: 'fake-app-id'
};

(async () => {
  try {
    // -----------------------------------------------------------------
    // Admin SDK (bypasses rules) – used only for user creation / cleanup.
    // -----------------------------------------------------------------
    const adminApp = initializeAdminApp({ projectId: 'karmicsolutions' });
    const adminAuth = adminApp.auth();
    const adminDb = adminApp.firestore();
    adminDb.settings({ host: 'localhost:8080', ssl: false });

    // Helper to create a user and assign a role document.
    async function createUser(email, role) {
      const userRec = await adminAuth.createUser({ email, password: 'pw123456' });
      await adminDb.doc(`users/${userRec.uid}`).set({ email, role });
      return userRec;
    }

    // -----------------------------------------------------------------
    // Create test accounts.
    // -----------------------------------------------------------------
    const emp1 = await createUser('emp1@example.com', 'employee');
    const emp2 = await createUser('emp2@example.com', 'employee');
    const adminUser = await createUser('admin@example.com', 'admin');

    // -----------------------------------------------------------------
    // Initialize client apps for each user (isolated by name).
    // -----------------------------------------------------------------
    const emp1App = initializeApp({ ...firebaseConfig }, 'emp1');
    const emp2App = initializeApp({ ...firebaseConfig }, 'emp2');
    const adminAppClient = initializeApp({ ...firebaseConfig }, 'admin');

    const emp1Auth = getAuth(emp1App);
    const emp2Auth = getAuth(emp2App);
    const adminAuthClient = getAuth(adminAppClient);

    const emp1Db = getFirestore(emp1App);
    const emp2Db = getFirestore(emp2App);
    const adminDbClient = getFirestore(adminAppClient);

    const emp1Funcs = getFunctions(emp1App);
    const emp2Funcs = getFunctions(emp2App);
    const adminFuncs = getFunctions(adminAppClient);

    // Sign in each user (client SDK) – auth token will be attached to subsequent calls.
    await signInWithEmailAndPassword(emp1Auth, emp1.email, 'pw123456');
    await signInWithEmailAndPassword(emp2Auth, emp2.email, 'pw123456');
    await signInWithEmailAndPassword(adminAuthClient, adminUser.email, 'pw123456');

    const cancelBookingCallableEmp1 = httpsCallable(emp1Funcs, 'cancelBooking');
    const cancelBookingCallableEmp2 = httpsCallable(emp2Funcs, 'cancelBooking');
    const cancelBookingCallableAdmin = httpsCallable(adminFuncs, 'cancelBooking'); // not used but available

    const deadlineRefAdmin = doc(adminDbClient, 'settings', 'deadline');

    // -----------------------------------------------------------------
    // Common test data
    // -----------------------------------------------------------------
    const tomorrow = DateTime.now().setZone('Asia/Kolkata').plus({ days: 1 }).toFormat('yyyy-LL-dd');

    // Helper to clean up a booking document if it exists.
    async function deleteBookingIfExists(dbInstance, userId) {
      const ref = doc(dbInstance, 'mealSelections', tomorrow, 'users', userId);
      const snap = await getDoc(ref);
      if (snap.exists()) await deleteDoc(ref);
    }

    // -----------------------------------------------------------------
    // 1. Authenticated cancellation BEFORE deadline.
    // -----------------------------------------------------------------
    await setDoc(deadlineRefAdmin, { deadlineHour: 23, deadlineMinute: 0 }, { merge: true });
    await deleteBookingIfExists(emp1Db, emp1.uid);
    const bookingRef1 = doc(emp1Db, 'mealSelections', tomorrow, 'users', emp1.uid);
    await setDoc(bookingRef1, { breakfast: true, lunch: false, snacks: false, dinner: false }); // no status
    try {
      const res = await cancelBookingCallableEmp1({ date: tomorrow });
      const ok = res?.data?.success === true;
      logResult('Authenticated cancellation before deadline', ok, `Response: ${JSON.stringify(res?.data)}`);
    } catch (e) {
      logResult('Authenticated cancellation before deadline', false, e.message);
    }

    // -----------------------------------------------------------------
    // 2. Cancellation EXACTLY at deadline (5 PM IST).
    // -----------------------------------------------------------------
    // We set deadline to 5 PM *today* (previous calendar day of the meal).
    // If the current real time is already past 5 PM, the callable should reject.
    await setDoc(deadlineRefAdmin, { deadlineHour: 17, deadlineMinute: 0 }, { merge: true });
    await deleteBookingIfExists(emp1Db, emp1.uid);
    const bookingRef2 = doc(emp1Db, 'mealSelections', tomorrow, 'users', emp1.uid);
    await setDoc(bookingRef2, { breakfast: true, lunch: false, snacks: false, dinner: false });
    try {
      await cancelBookingCallableEmp1({ date: tomorrow });
      // If we reach here, cancellation succeeded – means the current time was BEFORE the deadline.
      const now = DateTime.now().setZone('Asia/Kolkata');
      const deadline = now.set({ hour: 17, minute: 0, second: 0, millisecond: 0 }).minus({ days: 1 });
      const passed = now >= deadline; // true when we are past the deadline (should reject)
      logResult('Cancellation exactly at deadline (5 PM)', !passed, 'Cancellation succeeded – cannot guarantee exact‑boundary without mock clock');
    } catch (e) {
      const isDeadlineError = e.code === 'failed-precondition' || e.message.toLowerCase().includes('deadline passed');
      logResult('Cancellation exactly at deadline (5 PM)', isDeadlineError, e.message);
    }

    // -----------------------------------------------------------------
    // 3. Cancellation AFTER deadline (9 AM IST) – guaranteed failure.
    // -----------------------------------------------------------------
    await setDoc(deadlineRefAdmin, { deadlineHour: 9, deadlineMinute: 0 }, { merge: true });
    await deleteBookingIfExists(emp1Db, emp1.uid);
    const bookingRef3 = doc(emp1Db, 'mealSelections', tomorrow, 'users', emp1.uid);
    await setDoc(bookingRef3, { breakfast: true, lunch: false, snacks: false, dinner: false });
    try {
      await cancelBookingCallableEmp1({ date: tomorrow });
      logResult('Cancellation after deadline (9 AM)', false, 'Expected failure but succeeded');
    } catch (e) {
      const isDeadlineError = e.code === 'failed-precondition' || e.message.toLowerCase().includes('deadline passed');
      logResult('Cancellation after deadline (9 AM)', isDeadlineError, e.message);
    }

    // -----------------------------------------------------------------
    // 4. Unauthenticated cancellation.
    // -----------------------------------------------------------------
    // Sign out emp1 to remove auth token.
    await signOut(emp1Auth);
    try {
      await cancelBookingCallableEmp1({ date: tomorrow });
      logResult('Unauthenticated cancellation', false, 'Expected failure but succeeded');
    } catch (e) {
      const isUnauth = e.code === 'unauthenticated' || e.message.toLowerCase().includes('signed in');
      logResult('Unauthenticated cancellation', isUnauth, e.message);
    } finally {
      // Sign back in for later tests.
      await signInWithEmailAndPassword(emp1Auth, emp1.email, 'pw123456');
    }

    // -----------------------------------------------------------------
    // 5. Cross‑user cancellation (emp1 trying to cancel emp2's booking).
    // -----------------------------------------------------------------
    await deleteBookingIfExists(emp2Db, emp2.uid);
    const bookingRef4 = doc(emp2Db, 'mealSelections', tomorrow, 'users', emp2.uid);
    await setDoc(bookingRef4, { breakfast: true, lunch: false, snacks: false, dinner: false });
    try {
      await cancelBookingCallableEmp1({ date: tomorrow });
      logResult('Cross‑user cancellation', false, 'Expected failure but succeeded');
    } catch (e) {
      const isNotFound = e.code === 'not-found' || e.message.toLowerCase().includes('no active meal booking');
      logResult('Cross‑user cancellation', isNotFound, e.message);
    }

    // -----------------------------------------------------------------
    // 6. Direct Firestore status update rejection (client‑side write).
    // -----------------------------------------------------------------
    try {
      await updateDoc(bookingRef4, { status: 'cancelled' });
      logResult('Direct Firestore status update rejection', false, 'Expected permission‑denied but succeeded');
    } catch (e) {
      const isPerm = e.message.toLowerCase().includes('permission-denied');
      logResult('Direct Firestore status update rejection', isPerm, e.message);
    }

    // -----------------------------------------------------------------
    // 7. Pre‑cancelled booking creation rejection.
    // -----------------------------------------------------------------
    try {
      const preCancelRef = doc(emp1Db, 'mealSelections', tomorrow, 'users', emp1.uid);
      await setDoc(preCancelRef, { breakfast: false, lunch: false, snacks: false, dinner: false, status: 'cancelled' });
      logResult('Pre‑cancelled booking creation rejection', false, 'Expected permission‑denied but succeeded');
    } catch (e) {
      const isPerm = e.message.toLowerCase().includes('permission-denied');
      logResult('Pre‑cancelled booking creation rejection', isPerm, e.message);
    }

    // -----------------------------------------------------------------
    // 8. Admin deadline update (authenticated admin client).
    // -----------------------------------------------------------------
    try {
      // Admin client is already signed in.
      await setDoc(deadlineRefAdmin, { deadlineHour: 20, deadlineMinute: 30 }, { merge: true });
      const snap = await getDoc(deadlineRefAdmin);
      const data = snap.data();
      const ok = data.deadlineHour === 20 && data.deadlineMinute === 30;
      logResult('Admin deadline update', ok, ok ? 'Updated successfully' : `Unexpected values ${JSON.stringify(data)}`);
    } catch (e) {
      logResult('Admin deadline update', false, e.message);
    }

    // -----------------------------------------------------------------
    // 9. Duplicate cancellation rejection.
    // -----------------------------------------------------------------
    await setDoc(deadlineRefAdmin, { deadlineHour: 23, deadlineMinute: 0 }, { merge: true });
    await deleteBookingIfExists(emp1Db, emp1.uid);
    const dupBookingRef = doc(emp1Db, 'mealSelections', tomorrow, 'users', emp1.uid);
    await setDoc(dupBookingRef, { breakfast: true, lunch: false, snacks: false, dinner: false });
    // First cancellation – should succeed.
    let firstOk = false;
    try {
      const res = await cancelBookingCallableEmp1({ date: tomorrow });
      firstOk = res?.data?.success === true;
    } catch (_) {}
    // Second cancellation – should fail.
    try {
      await cancelBookingCallableEmp1({ date: tomorrow });
      logResult('Duplicate cancellation rejection', false, 'Second call succeeded unexpectedly');
    } catch (e) {
      const isDup = e.code === 'failed-precondition' || e.message.toLowerCase().includes('already cancelled');
      logResult('Duplicate cancellation rejection', isDup, e.message);
    }

    // -----------------------------------------------------------------
    // Cleanup: sign out and delete test apps.
    // -----------------------------------------------------------------
    await signOut(emp1Auth);
    await signOut(emp2Auth);
    await signOut(adminAuthClient);
    await deleteApp(emp1App);
    await deleteApp(emp2App);
    await deleteApp(adminAppClient);

    console.log('--- END OF INTEGRATION TEST RUN ---');
  } catch (err) {
    console.error('Unexpected error in integration script:', err);
    process.exit(1);
  }
})();
