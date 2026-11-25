// src/components/Employee/MonthlyDateDetailPanel.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { cacheDocument, docCacheKey } from '../../utils/indexedDbCache';
import { getLocalDateString, isSundayDate } from '../../utils/dateUtils';
import {
  MEAL_KEYS,
  createEmptyMealItemsMap,
  normalizeMealItemsForSelection,
  toggleMealItemHighlight,
  confirmCategorySelection,
  buildBookingPayload
} from '../../utils/mealSelectionUtils';
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
  const isSunday = Boolean(dateStr && isSundayDate(dateStr));

  // Two-step item selection state per meal category:
  // Step 1: highlightedItems (chips clicked by employee)
  // Step 2: confirmedItems (locked in when employee clicks category "Select" button)
  const [highlightedItems, setHighlightedItems] = useState(createEmptyMealItemsMap);
  const [confirmedItems, setConfirmedItems] = useState(createEmptyMealItemsMap);

  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Sync initial item selections with active booking data
  useEffect(() => {
    if (bookingData && bookingData.status !== 'cancelled') {
      const raw = bookingData.raw || {};
      const savedSelectedItems = raw.selectedItems || {};
      const next = createEmptyMealItemsMap();

      MEAL_KEYS.forEach((key) => {
        if (Array.isArray(savedSelectedItems[key])) {
          next[key] = savedSelectedItems[key].filter(Boolean);
        } else if (Array.isArray(raw[key])) {
          next[key] = raw[key].filter(Boolean);
        } else {
          next[key] = [];
        }
      });

      setHighlightedItems(next);
      setConfirmedItems(next);
    } else {
      setHighlightedItems(createEmptyMealItemsMap());
      setConfirmedItems(createEmptyMealItemsMap());
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
    if (isSunday) {
      return { passed: true, text: 'Holiday – No Meals (Sunday).' };
    }

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
  }, [dateStr, todayStr, deadlineHour, deadlineMinute, isSunday]);

  // Extract published items for each meal (preserving available flag so unavailable items are non-selectable)
  const publishedMealItems = useMemo(() => {
    const result = {};
    MEAL_CONFIG.forEach(({ key }) => {
      if (isSunday || !menuData || !menuData[key]) {
        result[key] = [];
        return;
      }
      result[key] = normalizeMealItemsForSelection(menuData[key]);
    });
    return result;
  }, [menuData, isSunday]);

  // Overall employee booking status
  const bookingStatus = useMemo(() => {
    if (isSunday) {
      return {
        key: 'holiday',
        label: 'Holiday – No Meals',
        className: 'status-badge-cancelled',
        icon: Ban,
        description: 'Sunday is a permanent weekly holiday. Meal selection and booking are disabled.'
      };
    }
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
  }, [bookingData, deadlineInfo, isPastDate, isSunday]);

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
    if (isPastDate || isSunday) return false;
    const raw = bookingData?.raw || {};
    const savedSelectedItems = raw.selectedItems || {};

    return MEAL_KEYS.some((key) => {
      const prevItems = Array.isArray(savedSelectedItems[key])
        ? savedSelectedItems[key].filter(Boolean)
        : Array.isArray(raw[key])
          ? raw[key].filter(Boolean)
          : [];
      const currItems = confirmedItems[key] || [];
      if (prevItems.length !== currItems.length) return true;
      return prevItems.some((val, idx) => val !== currItems[idx]);
    });
  }, [confirmedItems, bookingData, isPastDate, isSunday]);

  // Step 1: Toggle individual food item highlight
  const handleToggleItemHighlight = (mealKey, item) => {
    if (isSunday) {
      showMessage('error', 'Sunday is a weekly holiday — meal selection is disabled.');
      return;
    }
    if (isPastDate) {
      showMessage('error', 'Cannot modify selection: This date has already occurred.');
      return;
    }
    if (deadlineInfo.passed) {
      showMessage('error', 'Cannot modify selection: Deadline has passed.');
      return;
    }
    if (!item.available) {
      showMessage('error', `"${item.name}" is currently unavailable.`);
      return;
    }

    setHighlightedItems((prev) =>
      toggleMealItemHighlight(prev, mealKey, item.name, item.available)
    );
  };

  // Step 2: Confirm only the individually highlighted items for that category
  const handleConfirmCategory = (mealKey) => {
    if (isSunday) {
      showMessage('error', 'Sunday is a weekly holiday — meal selection is disabled.');
      return;
    }
    if (isPastDate) {
      showMessage('error', 'Cannot modify selection: This date has already occurred.');
      return;
    }
    if (deadlineInfo.passed) {
      showMessage('error', 'Cannot modify selection: Deadline has passed.');
      return;
    }

    const availableItems = publishedMealItems[mealKey].filter((i) => i.available);
    if (availableItems.length === 0) {
      showMessage('error', `Cannot select ${mealKey}: No available menu items.`);
      return;
    }

    const highlighted = highlightedItems[mealKey] || [];
    const alreadyConfirmed = confirmedItems[mealKey] || [];

    if (highlighted.length === 0 && alreadyConfirmed.length === 0) {
      showMessage('error', `Please click at least one ${mealKey} item first, then click Select.`);
      return;
    }

    setConfirmedItems((prev) => confirmCategorySelection(highlightedItems, prev, mealKey));
  };

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 5000);
  };

  // Save / Update booking using ONLY confirmedItems
  const handleSaveBooking = async () => {
    if (isSunday) {
      showMessage('error', 'Sunday is a weekly holiday — meal booking is disabled.');
      return;
    }
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

    const totalConfirmedCount = MEAL_KEYS.reduce(
      (sum, key) => sum + (confirmedItems[key]?.length || 0),
      0
    );
    if (totalConfirmedCount === 0) {
      showMessage('error', 'Please select items and click Select on at least one meal category.');
      return;
    }

    try {
      setSaving(true);
      const selectionRef = doc(db, 'mealSelections', dateStr, 'users', currentUser.uid);

      const payload = buildBookingPayload({
        uid: currentUser.uid,
        email: currentUser.email || '',
        dateStr,
        confirmedItems,
        isModified: Boolean(bookingData && bookingData.count > 0)
      });

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

  // Cancel booking via secure backend Cloud Function
  const handleCancelBooking = async () => {
    if (cancelling) return;

    if (!currentUser) {
      showMessage('error', 'Please log in to cancel meals.');
      return;
    }

    if (!bookingData || bookingData.status === 'cancelled' || bookingData.count === 0) {
      showMessage('error', 'No active booking found to cancel.');
      return;
    }

    try {
      setCancelling(true);

      // Invoke the secure callable Cloud Function (UID is determined server-side from auth token)
      const cancelMealBooking = httpsCallable(functions, 'cancelBooking');
      const result = await cancelMealBooking({ date: dateStr });

      const now = new Date();
      const cancellationTimestamp = result.data?.cancelledAt || now.toISOString();

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

      await cacheDocument(
        docCacheKey('mealSelections', dateStr, 'users', currentUser.uid),
        cancelledPayload
      );

      setHighlightedItems(createEmptyMealItemsMap());
      setConfirmedItems(createEmptyMealItemsMap());
      setShowCancelConfirm(false);
      showMessage('success', 'Booking cancelled successfully.');

      if (onBookingUpdated) {
        onBookingUpdated(dateStr, cancelledPayload);
      }
    } catch (err) {
      console.error('[MonthlyDateDetailPanel] Error cancelling booking:', err);
      let errorMsg = 'Failed to cancel booking. Please try again.';
      if (err?.code === 'functions/failed-precondition' || err?.code === 'failed-precondition') {
        errorMsg = err.message || 'Cancellation deadline has passed.';
      } else if (err?.code === 'functions/unauthenticated' || err?.code === 'unauthenticated') {
        errorMsg = 'You must be signed in to cancel a booking.';
      } else if (err?.code === 'functions/not-found' || err?.code === 'not-found') {
        errorMsg = err.message || 'No active meal booking found for this date.';
      } else if (err?.code === 'functions/unavailable' || err?.code === 'unavailable') {
        errorMsg = 'Network error: Service temporarily unavailable. Please check your connection.';
      } else if (err?.message) {
        errorMsg = err.message;
      }
      showMessage('error', errorMsg);
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
              {isDefaultMenu && (
                <span className="panel-default-badge badge-default">(Default Menu)</span>
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
              const availableItems = items.filter((i) => i.available);
              const isPublished = availableItems.length > 0;
              const highlighted = highlightedItems[key] || [];
              const confirmed = confirmedItems[key] || [];
              const isConfirmed = confirmed.length > 0;
              const hasPendingDiff =
                highlighted.length !== confirmed.length ||
                highlighted.some((val, idx) => val !== confirmed[idx]);
              const isPreordered = bookingData?.status !== 'cancelled' && 
                (bookingData?.raw?.[key] === true || (Array.isArray(bookingData?.raw?.[key]) && bookingData.raw[key].length > 0) || (bookingData?.meals || []).includes(key));

              return (
                <div 
                  key={key} 
                  className={`meal-row-card ${isConfirmed ? 'is-selected' : ''} ${!isPublished ? 'is-unpublished' : ''} ${isPastDate ? 'is-past-card' : ''}`}
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

                    {/* Step 2: Category Select / Confirm button */}
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
                      ) : isSunday ? (
                        <span className="unpublished-badge">
                          Holiday – No Meals
                        </span>
                      ) : isPublished ? (
                        <button
                          type="button"
                          className={`category-select-btn ${isConfirmed && !hasPendingDiff ? 'is-confirmed' : ''}`}
                          disabled={isSunday || deadlineInfo.passed || saving || cancelling}
                          onClick={() => handleConfirmCategory(key)}
                        >
                          <Check size={13} />
                          <span>
                            {isConfirmed && !hasPendingDiff
                              ? `Confirmed (${confirmed.length})`
                              : highlighted.length === 0 && isConfirmed
                                ? 'Clear'
                                : 'Select'}
                          </span>
                        </button>
                      ) : (
                        <span className="unpublished-badge">
                          Menu Not Published
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Step 1: Clickable Food Item Chips */}
                  <div className="meal-items-content">
                    {isSunday ? (
                      <p className="no-menu-text">
                        <Ban size={13} />
                        <span>Holiday – No Meals on Sunday.</span>
                      </p>
                    ) : items.length > 0 ? (
                      <div className="menu-items-pill-wrap">
                        {items.map((item, idx) => {
                          const isHighlighted = highlighted.includes(item.name);
                          const isLockedIn = confirmed.includes(item.name);
                          const chipDisabled =
                            !item.available || isPastDate || isSunday || deadlineInfo.passed || saving || cancelling;

                          return (
                            <button
                              key={idx}
                              type="button"
                              disabled={chipDisabled}
                              onClick={() => handleToggleItemHighlight(key, item)}
                              className={`menu-item-chip ${isHighlighted ? 'is-highlighted' : ''} ${!item.available ? 'is-unavailable' : ''} ${isLockedIn ? 'is-confirmed-item' : ''}`}
                              aria-pressed={isHighlighted}
                              title={
                                !item.available
                                  ? `${item.name} (Unavailable)`
                                  : isHighlighted
                                    ? `Deselect ${item.name}`
                                    : `Select ${item.name}`
                              }
                            >
                              <span>{item.name}</span>
                              {!item.available && <span className="chip-unavailable-tag">Unavailable</span>}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="no-menu-text">
                        <Info size={13} />
                        <span>Admin did not set a menu for {label} on this date.</span>
                      </p>
                    )}
                  </div>

                  {!isPastDate && !isSunday && isPublished && (
                    <div className="category-selection-status">
                      {isConfirmed && !hasPendingDiff ? (
                        <span className="confirmed-items-summary">
                          <CheckCircle2 size={12} /> Confirmed: {confirmed.join(', ')}
                        </span>
                      ) : highlighted.length > 0 ? (
                        <span className="pending-items-hint">
                          <Info size={12} /> {highlighted.length} highlighted — click Select to confirm
                        </span>
                      ) : null}
                    </div>
                  )}

                  {isPreordered && !isPastDate && (
                    <div className="preorder-indicator">
                      <CheckCircle2 size={12} /> Currently booked on your record
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Booking Summary of exact confirmed items */}
          {!isPastDate && !isSunday && (
            <div className="booking-items-summary-card">
              <h4>Booking Summary</h4>
              {MEAL_CONFIG.some(({ key }) => (confirmedItems[key] || []).length > 0) ? (
                <ul className="booking-summary-list">
                  {MEAL_CONFIG.map(({ key, label }) => {
                    const list = confirmedItems[key] || [];
                    if (list.length === 0) return null;
                    return (
                      <li key={key}>
                        <strong>{label}:</strong> {list.join(', ')}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="booking-summary-empty">
                  Select individual items above and click Select on each meal category to add them to your booking.
                </p>
              )}
            </div>
          )}
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
          ) : isSunday ? (
            <div className="past-footer-notice">
              <Ban size={16} />
              <span>Holiday – No Meals • Meal booking is disabled on Sundays.</span>
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
