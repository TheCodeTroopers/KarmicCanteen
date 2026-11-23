
// src/utils/notificationService.js

/**
 * Notification Service for Karmic Canteen
 * Handles browser notifications for meal reminders and confirmations.
 */

class NotificationService {
  constructor() {
    this.permission =
      typeof Notification !== 'undefined' ? Notification.permission : 'default';
    this.reminderTime = { hour: 8, minute: 0 }; // 8:00 AM
  }

  /**
   * Check if browser supports notifications.
   */
  isSupported() {
    return typeof window !== 'undefined' && 'Notification' in window;
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
    if (!this.isSupported() || this.permission !== 'granted') {
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
