// src/components/Employee/MonthlyDateDetailPanel.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { cacheDocument, docCacheKey } from '../../utils/indexedDbCache';
import { getLocalDateString } from '../../utils/dateUtils';
import {
  X,
  Calendar,
  Clock,
  Coffee,
  Soup,
  Cookie,
  ChefHat,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  AlertCircle,
  Save,
  Ban,
  Info,
  Check,
  History
} from 'lucide-react';
import './MonthlyDateDetailPanel.css';

const MEAL_CONFIG = [
  { key: 'breakfast', label: 'Breakfast', icon: Coffee, timing: '8:30 AM – 10:00 AM' },
  { key: 'lunch', label: 'Lunch', icon: Soup, timing: '1:00 PM – 2:30 PM' },
  { key: 'snacks', label: 'Snacks', icon: Cookie, timing: '5:00 PM – 6:30 PM' },
  { key: 'dinner', label: 'Dinner', icon: ChefHat, timing: '8:00 PM – 9:30 PM' }
];

/**
 * MonthlyDateDetailPanel Component - Phase 4
 * Displays full date details, published menus, employee booking status,
 * historical booking records for past dates, and enforces strict booking/cancellation restrictions.
 */
const MonthlyDateDetailPanel = ({
  isOpen,
  onClose,
  dateStr,
  menuData,
  bookingData,
  deadlineHour = 21,
  deadlineMinute = 0,
  onBookingUpdated,
  isDefaultMenu = false
}) => {
  const { currentUser } = useAuth();
  const todayStr = getLocalDateString(new Date());
  const isPastDate = Boolean(dateStr && dateStr < todayStr);

  // Form selections state for the 4 meals
  const [selections, setSelections] = useState({
    breakfast: false,
    lunch: false,
    snacks: false,
    dinner: false
  });

  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Sync initial selections with active booking data (supports booleans & legacy arrays)
  useEffect(() => {
    if (bookingData && bookingData.status !== 'cancelled') {
      const raw = bookingData.raw || {};
      const mealsList = bookingData.meals || [];
      setSelections({
        breakfast: raw.breakfast === true || (Array.isArray(raw.breakfast) && raw.breakfast.length > 0) || mealsList.includes('breakfast'),
        lunch: raw.lunch === true || (Array.isArray(raw.lunch) && raw.lunch.length > 0) || mealsList.includes('lunch'),
        snacks: raw.snacks === true || (Array.isArray(raw.snacks) && raw.snacks.length > 0) || mealsList.includes('snacks'),
        dinner: raw.dinner === true || (Array.isArray(raw.dinner) && raw.dinner.length > 0) || mealsList.includes('dinner')
      });
    } else {
      setSelections({
        breakfast: false,
        lunch: false,
        snacks: false,
        dinner: false
      });
    }
    setMessage({ type: '', text: '' });
    setShowCancelConfirm(false);
  }, [bookingData, dateStr]);

  // Close drawer on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Format date details
  const dateInfo = useMemo(() => {
    if (!dateStr) return { formatted: '', weekday: '', relative: '' };
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);

    const weekday = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
    const formatted = dateObj.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = getLocalDateString(tomorrow);

    let relative = '';
    if (dateStr === todayStr) relative = 'Today';
    else if (dateStr === tomorrowStr) relative = 'Tomorrow';
    else if (dateStr > tomorrowStr) relative = 'Upcoming';
    else relative = 'Past';

    return { formatted, weekday, relative };
  }, [dateStr, todayStr]);

  // Deadline calculation
  const deadlineInfo = useMemo(() => {
    if (!dateStr) return { passed: false, text: '' };

    const h = parseInt(deadlineHour, 10);
    const m = parseInt(deadlineMinute, 10);
    const period = h >= 12 ? 'PM' : 'AM';
    const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const timeStr = `${displayHour}:${m.toString().padStart(2, '0')} ${period}`;

    // Past dates
    if (dateStr < todayStr) {
      return { passed: true, text: 'Date is in the past — booking closed.' };
    }

    // Today
    if (dateStr === todayStr) {
      return { passed: true, text: `Booking closed yesterday at ${timeStr}.` };
    }

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = getLocalDateString(tomorrow);

    // Tomorrow
    if (dateStr === tomorrowStr) {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const deadlineMinutes = h * 60 + m;

      if (currentMinutes >= deadlineMinutes) {
        return { passed: true, text: `Booking deadline passed at ${timeStr} today.` };
      }
      return { passed: false, text: `Booking closes today at ${timeStr}.` };
    }

    // Future dates
    return { passed: false, text: `Booking closes 1 day prior at ${timeStr}.` };
  }, [dateStr, todayStr, deadlineHour, deadlineMinute]);

  // Extract published items for each meal
  const publishedMealItems = useMemo(() => {
    const result = {};
    MEAL_CONFIG.forEach(({ key }) => {
      if (!menuData || !menuData[key]) {
        result[key] = [];
        return;
      }
      const raw = menuData[key];
      if (Array.isArray(raw)) {
        result[key] = raw.map(item => (typeof item === 'string' ? item : item.name)).filter(Boolean);
      } else if (typeof raw === 'object') {
        result[key] = Object.values(raw).map(item => (typeof item === 'string' ? item : item.name)).filter(Boolean);
      } else {
        result[key] = [];
      }
    });
    return result;
  }, [menuData]);

  // Overall employee booking status
  const bookingStatus = useMemo(() => {
    if (bookingData?.status === 'cancelled') {
      return {
        key: 'cancelled',
        label: 'Cancelled',
        className: 'status-badge-cancelled',
        icon: XCircle,
        description: 'You previously cancelled this booking.'
      };
    }
    if (bookingData && bookingData.count > 0) {
      return {
        key: 'booked',
        label: isPastDate ? 'Historical Booking' : 'Booked',
        className: 'status-badge-booked',
        icon: isPastDate ? History : CheckCircle2,
        description: `${bookingData.count} meal${bookingData.count > 1 ? 's' : ''} confirmed: ${bookingData.meals.join(', ')}`
      };
    }
    if (deadlineInfo.passed) {
      return {
        key: 'deadline_passed',
        label: isPastDate ? 'Past Date' : 'Deadline Passed',
        className: 'status-badge-deadline',
        icon: AlertTriangle,
        description: isPastDate ? 'Historical date — no active booking was made.' : 'Selection window closed for this date.'
      };
    }
    return {
      key: 'not_booked',
      label: 'Not Booked',
      className: 'status-badge-not-booked',
      icon: AlertCircle,
      description: 'No meals booked yet. Selection is currently open.'
    };
  }, [bookingData, deadlineInfo, isPastDate]);

  // Cancellation eligibility check
  const cancellationEligible = useMemo(() => {
    if (!bookingData || bookingData.status === 'cancelled' || bookingData.count === 0) {
      return { eligible: false, reason: 'No active booking to cancel' };
    }
    if (dateStr <= todayStr) {
      return { eligible: false, reason: 'Cannot cancel on or after meal date' };
    }
    if (deadlineInfo.passed) {
      return { eligible: false, reason: 'Cancellation deadline has passed' };
    }
    return { eligible: true };
  }, [bookingData, dateStr, todayStr, deadlineInfo]);

  // Has changes compared to existing booking
  const hasFormChanges = useMemo(() => {
    if (isPastDate) return false;
    const raw = bookingData?.raw || {};
    const existing = {
      breakfast: Boolean(raw.breakfast),
      lunch: Boolean(raw.lunch),
      snacks: Boolean(raw.snacks),
      dinner: Boolean(raw.dinner)
    };
    return MEAL_CONFIG.some(({ key }) => selections[key] !== existing[key]);
  }, [selections, bookingData, isPastDate]);

  // Toggle meal selection
  const handleToggleMeal = (mealKey) => {
    if (isPastDate) {
      showMessage('error', 'Cannot modify selection: This date has already occurred.');
      return;
    }
    if (deadlineInfo.passed) {
      showMessage('error', 'Cannot modify selection: Deadline has passed.');
      return;
    }
    // Prevent booking unpublished meals
    if (publishedMealItems[mealKey].length === 0) {
      showMessage('error', `Cannot select ${mealKey}: Menu has not been published yet.`);
      return;
    }

    setSelections(prev => ({
      ...prev,
      [mealKey]: !prev[mealKey]
    }));
  };

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 5000);
  };

  // Save / Update booking
  const handleSaveBooking = async () => {
    if (isPastDate) {
      showMessage('error', 'Cannot book meals for past dates.');
      return;
    }
    if (deadlineInfo.passed) {
      showMessage('error', 'Booking deadline has passed.');
      return;
    }
    if (!currentUser) {
      showMessage('error', 'Please log in to book meals.');
      return;
    }

    const selectedCount = Object.values(selections).filter(Boolean).length;
    if (selectedCount === 0) {
      showMessage('error', 'Please select at least one meal.');
      return;
    }

    // Ensure no unpublished meals are selected
    for (const { key, label } of MEAL_CONFIG) {
      if (selections[key] && publishedMealItems[key].length === 0) {
        showMessage('error', `Cannot book ${label}: Menu has not been published yet.`);
        return;
      }
    }

    try {
      setSaving(true);
      const selectionRef = doc(db, 'mealSelections', dateStr, 'users', currentUser.uid);

      const payload = {
        employeeId: currentUser.uid,
        userId: currentUser.uid,
        email: currentUser.email || '',
        date: dateStr,
        breakfast: Boolean(selections.breakfast),
        lunch: Boolean(selections.lunch),
        snacks: Boolean(selections.snacks),
        dinner: Boolean(selections.dinner),
        status: 'Confirmed',
        timestamp: new Date().toISOString(),
        modified: Boolean(bookingData && bookingData.count > 0)
      };

      await setDoc(selectionRef, payload);
      await cacheDocument(
        docCacheKey('mealSelections', dateStr, 'users', currentUser.uid),
        payload
      );

      showMessage('success', 'Meal preferences saved successfully!');
      if (onBookingUpdated) {
        onBookingUpdated(dateStr, payload);
      }
    } catch (err) {
      console.error('[MonthlyDateDetailPanel] Error saving booking:', err);
      showMessage('error', 'Failed to save booking. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Cancel booking
  const handleCancelBooking = async () => {
    if (!cancellationEligible.eligible) {
      showMessage('error', `Cannot cancel: ${cancellationEligible.reason}`);
      return;
    }

    try {
      setCancelling(true);
      const selectionRef = doc(db, 'mealSelections', dateStr, 'users', currentUser.uid);
      const now = new Date();
      const cancellationTimestamp = now.toISOString();

      const cancelledPayload = {
        ...(bookingData?.raw || {}),
        employeeId: currentUser.uid,
        userId: currentUser.uid,
        email: currentUser.email || '',
        date: dateStr,
        status: 'cancelled',
        cancelledAt: cancellationTimestamp,
        cancellationTimestamp,
        cancellationDate: getLocalDateString(now),
        cancellationTime: now.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        }),
        breakfast: false,
        lunch: false,
        snacks: false,
        dinner: false
      };

      await setDoc(selectionRef, cancelledPayload, { merge: true });
      await cacheDocument(
        docCacheKey('mealSelections', dateStr, 'users', currentUser.uid),
        cancelledPayload
      );

      setSelections({
        breakfast: false,
        lunch: false,
        snacks: false,
        dinner: false
      });
      setShowCancelConfirm(false);
      showMessage('success', 'Booking cancelled successfully.');

      if (onBookingUpdated) {
        onBookingUpdated(dateStr, cancelledPayload);
      }
    } catch (err) {
      console.error('[MonthlyDateDetailPanel] Error cancelling booking:', err);
      showMessage('error', 'Failed to cancel booking. Please try again.');
    } finally {
      setCancelling(false);
    }
  };

  if (!isOpen) return null;

  const StatusIcon = bookingStatus.icon;

  return (
    <div className="detail-panel-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div 
        className="detail-panel-container" 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile handle indicator */}
        <div className="mobile-drawer-handle" />

        {/* Panel Header */}
        <div className="detail-panel-header">
          <div className="panel-header-title">
            <div className="panel-badge-group">
              <span className="panel-weekday-badge">{dateInfo.weekday}</span>
              {dateInfo.relative && (
                <span className={`panel-relative-badge badge-${dateInfo.relative.toLowerCase()}`}> 
                  {dateInfo.relative}
                </span>
              )}
            </div>
            <h2>{dateInfo.formatted}</h2>
          </div>

          <button 
            type="button" 
            className="panel-close-btn" 
            onClick={onClose}
            aria-label="Close details panel"
          >
            <X size={20} />
          </button>
        </div>

        {/* Past Date Historical Banner */}
        {isPastDate && (
          <div className="past-historical-banner">
            <History size={16} />
            <span>Past Date (Historical View) — Menus and booking records are read-only.</span>
          </div>
        )}

        {/* Status & Deadline Banner */}
        <div className="panel-status-card">
          <div className="status-header-row">
            <div className={`status-pill-large ${bookingStatus.className}`}> 
              <StatusIcon size={16} />
              <span>{bookingStatus.label}</span>
            </div>

            <div className="deadline-time-badge" title="Booking cutoff time">
              <Clock size={13} />
              <span>{deadlineInfo.text}</span>
            </div>
          </div>
          <p className="status-description">{bookingStatus.description}</p>
        </div>

        {/* Feedback Message Banner */}
        {message.text && (
          <div className={`panel-message ${message.type}`}>
            {message.type === 'success' ? (
              <CheckCircle2 size={16} />
            ) : (
              <AlertTriangle size={16} />
            )}
            <span>{message.text}</span>
          </div>
        )}

        {/* Meal Categories Grid */}
        <div className="panel-content-body">
          <div className="panel-section-title">
            <h3>{isPastDate ? 'Historical Menu & Selections' : 'Published Menu & Meal Booking'}</h3>
            <span className="section-subtitle">
              {isPastDate 
                ? 'Review meals and past pre-orders for this date'
                : 'Select available meals to pre-order for canteen preparation'}
            </span>
          </div>

          <div className="meal-categories-list">
            {MEAL_CONFIG.map(({ key, label, icon: MealIcon, timing }) => {
              const items = publishedMealItems[key];
              const isPublished = items.length > 0;
              const isSelected = selections[key] === true;
              const isPreordered = bookingData?.status !== 'cancelled' && 
                (bookingData?.raw?.[key] === true || (Array.isArray(bookingData?.raw?.[key]) && bookingData.raw[key].length > 0) || (bookingData?.meals || []).includes(key));

              return (
                <div 
                  key={key} 
                  className={`meal-row-card ${isSelected ? 'is-selected' : ''} ${!isPublished ? 'is-unpublished' : ''} ${isPastDate ? 'is-past-card' : ''}`}
                >
                  <div className="meal-row-header">
                    <div className="meal-title-group">
                      <div className="meal-icon-box">
                        <MealIcon size={18} />
                      </div>
                      <div>
                        <h4>{label}</h4>
                        <span className="meal-timing-tag">
                          <Clock size={11} /> {timing}
                        </span>
                      </div>
                    </div>

                    {/* Booking Checkbox / Status */}
                    <div className="meal-selection-control">
                      {isPastDate ? (
                        isPreordered ? (
                          <span className="historical-booked-badge">
                            <CheckCircle2 size={12} /> Booked
                          </span>
                        ) : (
                          <span className="historical-not-booked-badge">
                            Not Booked
                          </span>
                        )
                      ) : isPublished ? (
                        <label className={`meal-checkbox-label ${deadlineInfo.passed ? 'disabled' : ''}`}>
                          <input 
                            type="checkbox"
                            checked={isSelected}
                            disabled={deadlineInfo.passed || saving || cancelling}
                            onChange={() => handleToggleMeal(key)}
                          />
                          <span className="checkbox-custom">
                            {isSelected && <Check size={12} />}
                          </span>
                          <span className="checkbox-text">
                            {isSelected ? 'Selected' : 'Select'}
                          </span>
                        </label>
                      ) : (
                        <span className="unpublished-badge">
                          Menu Not Published
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Published Menu Items List */}
                  <div className="meal-items-content">
                    {isPublished ? (
                      <div className="menu-items-pill-wrap">
                        {items.map((item, idx) => (
                          <span key={idx} className="menu-item-chip">
                            {item}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="no-menu-text">
                        <Info size={13} />
                        <span>Admin did not set a menu for {label} on this date.</span>
                      </p>
                    )}
                  </div>

                  {isPreordered && !isPastDate && (
                    <div className="preorder-indicator">
                      <CheckCircle2 size={12} /> Currently booked on your record
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Panel Footer Actions */}
        <div className="detail-panel-footer">
          {showCancelConfirm ? (
            <div className="cancel-confirm-box">
              <div className="confirm-text">
                <AlertTriangle size={18} style={{ color: '#dc2626' }} />
                <span>Are you sure you want to cancel your meal booking for this date?</span>
              </div>
              <div className="confirm-actions">
                <button
                  type="button"
                  className="btn-danger-confirm"
                  onClick={handleCancelBooking}
                  disabled={cancelling}
                >
                  {cancelling ? 'Cancelling...' : 'Yes, Cancel Booking'}
                </button>
                <button
                  type="button"
                  className="btn-secondary-cancel"
                  onClick={() => setShowCancelConfirm(false)}
                  disabled={cancelling}
                >
                  Keep Booking
                </button>
              </div>
            </div>
          ) : isPastDate ? (
            <div className="past-footer-notice">
              <History size={16} />
              <span>Historical record • Bookings cannot be made or cancelled for past dates.</span>
            </div>
          ) : (
            <div className="panel-actions-row">
              {cancellationEligible.eligible && (
                <button
                  type="button"
                  className="btn-cancel-booking"
                  onClick={() => setShowCancelConfirm(true)}
                  disabled={saving || cancelling}
                >
                  <Ban size={15} />
                  <span>Cancel Booking</span>
                </button>
              )}

              <button
                type="button"
                className="btn-save-booking"
                onClick={handleSaveBooking}
                disabled={deadlineInfo.passed || saving || cancelling || !hasFormChanges}
              >
                <Save size={15} />
                <span>
                  {saving 
                    ? 'Saving...' 
                    : deadlineInfo.passed 
                      ? 'Selection Closed' 
                      : bookingData && bookingData.count > 0 
                        ? 'Update Meal Booking' 
                        : 'Confirm Meal Booking'}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MonthlyDateDetailPanel;
