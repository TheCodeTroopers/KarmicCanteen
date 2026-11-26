
// src/utils/notificationService.js

import { getToken, onMessage } from 'firebase/messaging';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db, firebaseConfig, getMessagingInstance } from '../firebase/config';

const DEVICE_ID_STORAGE_KEY = 'karmic_fcm_device_id';

/**
 * Notification Service for Karmic Canteen
 * Handles browser notifications, FCM initialization, token registration, and foreground messages.
 */

class NotificationService {
  constructor() {
    this.permission =
      typeof Notification !== 'undefined' ? Notification.permission : 'default';
    this.reminderTime = { hour: 8, minute: 0 }; // 8:00 AM
    this.fcmRegistration = null;
    this.tokenSyncPromise = null;
  }

  /**
   * Check if browser supports notifications.
   */
  isSupported() {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  /**
   * Check if browser supports Firebase Cloud Messaging.
   */
  async isMessagingSupported() {
    if (!this.isSupported() || !('serviceWorker' in navigator)) {
      return false;
    }

    const messaging = await getMessagingInstance();
    return Boolean(messaging);
  }

  /**
   * Initialize and return the Firebase Messaging instance if supported.
   */
  async initializeMessaging() {
    if (!this.isSupported() || !('serviceWorker' in navigator)) {
      return null;
    }

    return getMessagingInstance();
  }

  /**
   * Register the dedicated FCM service worker under an isolated scope so it
   * never conflicts with the root Workbox PWA service worker.
   */
  async registerMessagingServiceWorker() {
    if (!('serviceWorker' in navigator)) return null;
    if (this.fcmRegistration) return this.fcmRegistration;

    const params = new URLSearchParams({
      apiKey: firebaseConfig.apiKey || '',
      authDomain: firebaseConfig.authDomain || '',
      projectId: firebaseConfig.projectId || '',
      storageBucket: firebaseConfig.storageBucket || '',
      messagingSenderId: firebaseConfig.messagingSenderId || '',
      appId: firebaseConfig.appId || '',
    });

    const registration = await navigator.serviceWorker.register(
      `/firebase-messaging-sw.js?${params.toString()}`,
      { scope: '/firebase-cloud-messaging-push-scope' }
    );

    // Wait until the service worker is active before returning.
    const waitForActive = (reg) => new Promise((resolve, reject) => {
      if (reg.active) return resolve(reg);
      const sw = reg.installing || reg.waiting;
      if (!sw) {
        // Fallback to ready promise which resolves when any SW controls the page.
        navigator.serviceWorker.ready
          .then(() => resolve(reg))
          .catch(reject);
        return;
      }
      const timeoutId = setTimeout(() => {
        sw.removeEventListener('statechange', stateChange);
        reject(new Error('FCM service worker activation timeout'));
      }, 10000);
      const stateChange = () => {
        if (reg.active) {
          clearTimeout(timeoutId);
          sw.removeEventListener('statechange', stateChange);
          resolve(reg);
        }
      };
      sw.addEventListener('statechange', stateChange);
    });

    try {
      await waitForActive(registration);
    } catch (e) {
      console.warn('FCM service worker activation issue:', e);
    }

    this.fcmRegistration = registration;
    return registration;
  }

  /**
   * Retrieve an FCM registration token after notification permission is granted.
   */
  async getFcmToken() {
    if (!this.isSupported() || Notification.permission !== 'granted') {
      return null;
    }

    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    if (!vapidKey) {
      console.warn('VITE_FIREBASE_VAPID_KEY is not configured.');
      return null;
    }

    try {
      const supported = await this.isMessagingSupported();
      if (!supported) {
        console.warn('Firebase Messaging is not supported in this browser.');
        return null;
      }

      const messaging = await this.initializeMessaging();
      if (!messaging) {
        return null;
      }

      const serviceWorkerRegistration = await this.registerMessagingServiceWorker();
      if (!serviceWorkerRegistration) {
        console.warn('FCM service worker registration unavailable.');
        return null;
      }

      const token = await getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration,
      });

      if (token) {
        const maskedToken = `${token.slice(0, 8)}...${token.slice(-6)}`;
        console.info(
          `FCM token generated (${maskedToken}, length=${token.length}) for SW scope: ${serviceWorkerRegistration.scope}`
        );
      } else {
        console.warn('getToken() returned an empty token.');
      }

      return token || null;
    } catch (error) {
      console.error('Error retrieving FCM token:', {
        code: error?.code || 'unknown',
        message: error?.message || String(error),
      });
      return null;
    }
  }

  /**
   * Return a persistent identifier for this browser/device so multiple devices
   * per employee are stored separately and token refreshes update in place.
   */
  getOrCreateDeviceId() {
    if (typeof window === 'undefined') return 'web-default';

    let deviceId = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (!deviceId) {
      deviceId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
    }

    return deviceId;
  }

  /**
   * Register or update the current device's FCM token under
   * users/{currentUser.uid}/fcmTokens/{deviceId}.
   */
  async registerFcmToken() {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      return null;
    }

    if (this.tokenSyncPromise) {
      return this.tokenSyncPromise;
    }

    this.tokenSyncPromise = (async () => {
      try {
        const token = await this.getFcmToken();
        if (!token) {
          return null;
        }

        const deviceId = this.getOrCreateDeviceId();
        const tokenRef = doc(db, 'users', uid, 'fcmTokens', deviceId);
        const userAgent =
          typeof navigator !== 'undefined' && navigator.userAgent
            ? navigator.userAgent.slice(0, 512)
            : 'unknown';

        const existingSnap = await getDoc(tokenRef);

        if (existingSnap.exists()) {
          if (existingSnap.data()?.token === token) {
            return token;
          }

          await updateDoc(tokenRef, {
            token,
            platform: 'web',
            userAgent,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(tokenRef, {
            token,
            userId: uid,
            platform: 'web',
            userAgent,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        return token;
      } catch (error) {
        console.error('Error saving FCM token to Firestore:', {
          code: error?.code || 'unknown',
          message: error?.message || String(error),
        });
        return null;
      } finally {
        this.tokenSyncPromise = null;
      }
    })();

    return this.tokenSyncPromise;
  }

  /**
   * Remove only the current device's FCM token document on logout.
   */
  async removeFcmToken() {
    const uid = auth.currentUser?.uid;
    if (!uid || typeof window === 'undefined') {
      return;
    }

    const deviceId = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (!deviceId) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'users', uid, 'fcmTokens', deviceId));
    } catch (error) {
      console.warn('Error removing FCM token on logout:', {
        code: error?.code || 'unknown',
        message: error?.message || String(error),
      });
    }
  }

  /**
   * Subscribe to foreground FCM messages. Returns an unsubscribe function.
   */
  async onForegroundMessage(callback) {
    const messaging = await this.initializeMessaging();
    if (!messaging) {
      return () => {};
    }

    return onMessage(messaging, (payload) => {
      if (typeof callback === 'function') {
        callback(payload);
      }
    });
  }

  /**
   * Request notification permission from user.
   */
  async requestPermission() {
    if (!this.isSupported()) {
      console.warn('Browser does not support notifications');
      return false;
    }

    if (this.permission === 'granted') return true;

    try {
      const permission = await Notification.requestPermission();
      this.permission = permission;
      return permission === 'granted';
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  }

  /**
   * Show a notification.
   */
  showNotification(title, options = {}) {
    const currentPermission =
      typeof Notification !== 'undefined' ? Notification.permission : 'default';
    this.permission = currentPermission;

    if (!this.isSupported() || currentPermission !== 'granted') {
      console.warn('Notifications not available or not permitted');
      return null;
    }

    const defaultOptions = {
      icon: '/vite.svg',
      badge: '/vite.svg',
      vibrate: [200, 100, 200],
      requireInteraction: false,
      ...options,
    };

    try {
      const notification = new Notification(title, defaultOptions);

      // Auto-close after 10 seconds.
      setTimeout(() => notification.close(), 10000);

      return notification;
    } catch (error) {
      console.error('Error showing notification:', error);
      return null;
    }
  }

  /**
   * Check if user is working from office.
   */
  isWorkingFromOffice() {
    return true;
  }

  /**
   * Show morning reminder notification.
   */
  showMorningReminder(hasMenu = true) {
    if (!this.isWorkingFromOffice()) {
      console.log('Notification skipped: User is not working from office');
      return null;
    }

    const title = '🍽️ Karmic Canteen Reminder';

    const body = hasMenu
      ? "Good morning! Don't forget to select your meals for tomorrow. Deadline is approaching!"
      : "Good morning! The menu for tomorrow hasn't been published yet. You can still set your meal preferences.";

    return this.showNotification(title, {
      body,
      tag: 'morning-reminder',
      icon: '/vite.svg',
      requireInteraction: true,
      actions: [
        { action: 'view', title: 'View Menu' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
    });
  }

  /**
   * Supports current boolean meal preferences
   * and historical item arrays.
   */
  showConfirmationNotification(selectedMeals = {}) {
    const mealTypes = ['breakfast', 'lunch', 'snacks', 'dinner'];
    const selectedLabels = [];

    mealTypes.forEach((type) => {
      const value = selectedMeals?.[type];
      const label = type.charAt(0).toUpperCase() + type.slice(1);

      if (value === true) {
        selectedLabels.push(label);
      } else if (Array.isArray(value) && value.length > 0) {
        selectedLabels.push(
          `${label} (${value.length} item${value.length === 1 ? '' : 's'})`
        );
      }
    });

    const title = '✅ Meal Preferences Confirmed';

    const body = selectedLabels.length > 0
      ? `Your preferences are saved for: ${selectedLabels.join(', ')}.`
      : 'Your meal preferences have been saved. You have not opted in for any meals.';

    return this.showNotification(title, {
      body,
      tag: 'meal-confirmation',
      icon: '/vite.svg',
      requireInteraction: false,
    });
  }

  /**
   * Show deadline warning notification.
   */
  showDeadlineWarning(timeRemaining) {
    if (!this.isWorkingFromOffice()) {
      console.log('Notification skipped: User is not working from office');
      return null;
    }

    return this.showNotification('⏰ Deadline Approaching!', {
      body: `Only ${timeRemaining} left to select your meals for tomorrow. Don't miss out!`,
      tag: 'deadline-warning',
      icon: '/vite.svg',
      requireInteraction: true,
    });
  }

  /**
   * Schedule morning reminder.
   * Returns timeout ID that can be cleared.
   */
  scheduleMorningReminder(callback) {
    const now = new Date();
    const scheduledTime = new Date();

    scheduledTime.setHours(
      this.reminderTime.hour,
      this.reminderTime.minute,
      0,
      0
    );

    // If time has passed today, schedule for tomorrow.
    if (now > scheduledTime) {
      scheduledTime.setDate(scheduledTime.getDate() + 1);
    }

    const timeUntilReminder = scheduledTime - now;

    console.log(
      `Morning reminder scheduled for: ${scheduledTime.toLocaleString()}`
    );

    return setTimeout(() => {
      callback();
      this.scheduleMorningReminder(callback);
    }, timeUntilReminder);
  }

  /**
   * Check if it's time for morning reminder.
   */
  shouldShowMorningReminder() {
    const now = new Date();

    return now.getHours() === this.reminderTime.hour
      && now.getMinutes() === this.reminderTime.minute;
  }

  /**
   * Calculate time until next reminder.
   */
  getTimeUntilNextReminder() {
    const now = new Date();
    const scheduledTime = new Date();

    scheduledTime.setHours(
      this.reminderTime.hour,
      this.reminderTime.minute,
      0,
      0
    );

    if (now > scheduledTime) {
      scheduledTime.setDate(scheduledTime.getDate() + 1);
    }

    const diff = scheduledTime - now;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor(
      (diff % (1000 * 60 * 60)) / (1000 * 60)
    );

    return { hours, minutes, totalMs: diff };
  }

  /**
   * Save notification preferences to localStorage.
   */
  savePreferences(preferences) {
    localStorage.setItem(
      'notificationPreferences',
      JSON.stringify(preferences)
    );
  }

  /**
   * Load notification preferences from localStorage.
   */
  loadPreferences() {
    const saved = localStorage.getItem('notificationPreferences');

    return saved ? JSON.parse(saved) : {
      morningReminder: true,
      confirmationNotification: true,
      deadlineWarning: true,
    };
  }

  /**
   * Clear all scheduled notifications.
   */
  clearScheduledNotifications(timeoutIds = []) {
    timeoutIds.forEach((id) => clearTimeout(id));
  }
}

// Export singleton instance.
export const notificationService = new NotificationService();
export default notificationService;
