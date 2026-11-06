// src/components/Employee/MyOrders.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { getDocWithCache, cacheDocument, docCacheKey } from '../../utils/indexedDbCache';
import { useAuth } from '../../context/AuthContext';
import { getLocalDateString } from '../../utils/dateUtils';
import {
  ShoppingBag, Calendar, Clock, CheckCircle2, XCircle, 
  Coffee, Soup, Cookie, ChefHat, RefreshCw, Lock, AlertTriangle,
  Utensils, Check, X
} from 'lucide-react';
import './MyOrders.css';

const MEAL_ICONS = {
  breakfast: Coffee,
  lunch: Soup,
  snacks: Cookie,
  dinner: ChefHat,
};

const MEAL_LABELS = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snacks: 'Snacks',
  dinner: 'Dinner',
};

const getDismissedOrdersKey = (uid) => `dismissed_orders_${uid || 'anonymous'}`;

const loadDismissedOrders = (uid) => {
  try {
    const raw = localStorage.getItem(getDismissedOrdersKey(uid));
    return new Set(JSON.parse(raw || '[]'));
  } catch {
    return new Set();
  }
};

const MyOrders = ({
  deadlineHour = 21,
  deadlineMinute = 0,
  onOrderCancelled,
  refreshTrigger = 0
}) => {
  const { currentUser } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cancellingDate, setCancellingDate] = useState(null);
  const [activeTab, setActiveTab] = useState('upcoming'); // 'upcoming' | 'past' | 'all'
  const [bannerMessage, setBannerMessage] = useState({ type: '', text: '' });
  const [offline, setOffline] = useState(false);
  const [showExtendedHistory, setShowExtendedHistory] = useState(false);
  const [dismissedDates, setDismissedDates] = useState(() => loadDismissedOrders(currentUser?.uid));
  const [orderToRemove, setOrderToRemove] = useState(null);

  useEffect(() => {
    setDismissedDates(loadDismissedOrders(currentUser?.uid));
  }, [currentUser?.uid]);

  const fetchOrders = useCallback(async (isManualRefresh = false, extended = showExtendedHistory) => {
    if (!currentUser?.uid) return;
    if (isManualRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const datesToScan = [];
      const today = new Date();

      // Scan past days: 14 days standard, or 30 days if extended
      const pastDaysCount = extended ? 30 : 14;
      for (let i = pastDaysCount; i >= 1; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        datesToScan.push(getLocalDateString(d));
      }

      // Today
      datesToScan.push(getLocalDateString(today));

      // Scan upcoming days (next 14 days)
      for (let i = 1; i <= 14; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        datesToScan.push(getLocalDateString(d));
      }

      const fetchPromises = datesToScan.map(async (dateStr) => {
        try {
          const docRef = doc(db, 'mealSelections', dateStr, 'users', currentUser.uid);
          const cacheKey = docCacheKey('mealSelections', dateStr, 'users', currentUser.uid);
          const result = await getDocWithCache(docRef, cacheKey);

          if (result.fromCache) {
            setOffline(true);
          }

          if (!result.exists || !result.data) {
            return null;
          }

          const data = result.data;
          const breakfast = Array.isArray(data.breakfast) ? data.breakfast : [];
          const lunch = Array.isArray(data.lunch) ? data.lunch : [];
          const snacks = Array.isArray(data.snacks) ? data.snacks : [];
          const dinner = Array.isArray(data.dinner) ? data.dinner : [];

          const hasActiveItems = (breakfast.length + lunch.length + snacks.length + dinner.length) > 0;
          const isCancelled = data.status === 'Cancelled' || data.status === 'cancelled';

          // An order is valid if cancelled (with saved meal details) or has active items
          if (!hasActiveItems && !isCancelled) {
            return null;
          }

          const displayMeals = isCancelled && data.originalSelections
            ? {
                breakfast: data.originalSelections.breakfast || [],
                lunch: data.originalSelections.lunch || [],
                snacks: data.originalSelections.snacks || [],
                dinner: data.originalSelections.dinner || [],
              }
            : { breakfast, lunch, snacks, dinner };

          const totalItemsCount =
            (displayMeals.breakfast?.length || 0) +
            (displayMeals.lunch?.length || 0) +
            (displayMeals.snacks?.length || 0) +
            (displayMeals.dinner?.length || 0);

          return {
            date: dateStr,
            status: isCancelled ? 'Cancelled' : (data.status || 'Confirmed'),
            timestamp: data.timestamp || null,
            cancelledAt: data.cancelledAt || null,
            meals: displayMeals,
            totalItemsCount,
            rawDoc: data,
          };
        } catch (fetchErr) {
          console.warn(`[MyOrders] Failed reading order for ${dateStr}:`, fetchErr);
          return null;
        }
      });

      const results = await Promise.all(fetchPromises);
      const validOrders = results.filter(Boolean);

      setOrders(validOrders);
    } catch (err) {
      console.error('[MyOrders] Error fetching orders:', err);
      setBannerMessage({ type: 'error', text: 'Failed to load your orders. Please try again.' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentUser, showExtendedHistory]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders, refreshTrigger]);

  useEffect(() => {
    if (bannerMessage.text) {
      const timer = setTimeout(() => {
        setBannerMessage({ type: '', text: '' });
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [bannerMessage]);

  const todayStr = getLocalDateString();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = getLocalDateString(tomorrow);

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatDeadlineTime = () => {
    const h = parseInt(deadlineHour, 10);
    const m = parseInt(deadlineMinute, 10);
    const period = h >= 12 ? 'PM' : 'AM';
    const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${displayHour}:${m.toString().padStart(2, '0')} ${period}`;
  };

  const getRelativeBadge = (dateStr) => {
    if (dateStr === tomorrowStr) return { label: 'Tomorrow', className: 'badge-tomorrow' };
    if (dateStr === todayStr) return { label: 'Today', className: 'badge-today' };
    if (dateStr > tomorrowStr) return { label: 'Upcoming', className: 'badge-upcoming' };
    return { label: 'Past', className: 'badge-past' };
  };

  const checkEligibility = (order) => {
    if (order.status === 'Cancelled' || order.status === 'cancelled') {
      return { eligible: false, reason: 'Already cancelled' };
    }

    // Today's order or past orders cannot be cancelled (deadlines were previous day)
    if (order.date <= todayStr) {
      return { eligible: false, reason: 'Order date has arrived or passed' };
    }

    const now = new Date();

    // Tomorrow's order: deadline is today at deadlineHour:deadlineMinute
    if (order.date === tomorrowStr) {
      const deadlineToday = new Date();
      deadlineToday.setHours(deadlineHour, deadlineMinute, 0, 0);

      if (now >= deadlineToday) {
        return { eligible: false, reason: 'Deadline passed' };
      }
      return { eligible: true };
    }

    // Future orders: deadline is day before the meal date at deadlineHour:deadlineMinute
    const [year, month, day] = order.date.split('-').map(Number);
    const cutoffDate = new Date(year, month - 1, day - 1, deadlineHour, deadlineMinute, 0, 0);

    if (now >= cutoffDate) {
      return { eligible: false, reason: 'Deadline passed' };
    }

    return { eligible: true };
  };

  const handleCancelOrder = async (order) => {
    const { eligible, reason } = checkEligibility(order);
    if (!eligible) {
      setBannerMessage({ type: 'error', text: `Cannot cancel: ${reason}.` });
      return;
    }

    try {
      setCancellingDate(order.date);
      const selectionRef = doc(db, 'mealSelections', order.date, 'users', currentUser.uid);

      const cancelledDoc = {
        ...(order.rawDoc || {}),
        date: order.date,
        userId: currentUser.uid,
        email: currentUser.email,
        status: 'Cancelled',
        cancelledAt: new Date().toISOString(),
        originalSelections: {
          breakfast: order.meals?.breakfast || [],
          lunch: order.meals?.lunch || [],
          snacks: order.meals?.snacks || [],
          dinner: order.meals?.dinner || [],
        },
        breakfast: [],
        lunch: [],
        snacks: [],
        dinner: [],
      };

      await setDoc(selectionRef, cancelledDoc, { merge: true });
      await cacheDocument(docCacheKey('mealSelections', order.date, 'users', currentUser.uid), cancelledDoc);

      // Update state locally
      setOrders(prev => prev.map(o => {
        if (o.date === order.date) {
          return {
            ...o,
            status: 'Cancelled',
            cancelledAt: cancelledDoc.cancelledAt,
            rawDoc: cancelledDoc,
          };
        }
        return o;
      }));

      setBannerMessage({
        type: 'success',
        text: `Order for ${formatDate(order.date)} was cancelled successfully.`,
      });

      if (onOrderCancelled) {
        onOrderCancelled(order.date);
      }
    } catch (err) {
      console.error('[MyOrders] Error cancelling order:', err);
      setBannerMessage({
        type: 'error',
        text: 'Failed to cancel order. Please check your connection and try again.',
      });
    } finally {
      setCancellingDate(null);
    }
  };

  const handleConfirmRemove = (dateStr) => {
    const next = new Set(dismissedDates);
    next.add(dateStr);
    setDismissedDates(next);
    try {
      localStorage.setItem(getDismissedOrdersKey(currentUser?.uid), JSON.stringify(Array.from(next)));
    } catch (err) {
      console.warn('Failed to save dismissed order to localStorage:', err);
    }
    setOrderToRemove(null);
    setBannerMessage({
      type: 'success',
      text: `Removed cancelled order for ${formatDate(dateStr)} from your view.`,
    });
  };

  // Filter out cancelled orders that the employee chose to dismiss from their screen
  const visibleOrders = orders.filter((order) => {
    const isCancelled = order.status === 'Cancelled' || order.status === 'cancelled';
    return !(isCancelled && dismissedDates.has(order.date));
  });

  // Group and sort orders
  const upcomingOrders = visibleOrders
    .filter(order => order.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date)); // Earliest upcoming first (Tomorrow on top)

  const pastOrders = visibleOrders
    .filter(order => order.date < todayStr)
    .sort((a, b) => b.date.localeCompare(a.date)); // Most recent past first

  const allOrders = [...visibleOrders].sort((a, b) => b.date.localeCompare(a.date));

  const displayedOrders = activeTab === 'upcoming'
    ? upcomingOrders
    : activeTab === 'past'
      ? pastOrders
      : allOrders;

  return (
    <div className="my-orders-section">
      <div className="my-orders-card">
        <div className="my-orders-header">
          <div className="my-orders-title-group">
            <div className="my-orders-icon-wrap">
              <ShoppingBag size={22} style={{ color: 'var(--accent-primary)' }} />
            </div>
            <div>
              <h2 className="my-orders-title">My Orders</h2>
              <p className="my-orders-subtitle">
                Track your meal orders and manage cancellations before cutoff ({formatDeadlineTime()})
              </p>
            </div>
          </div>

          <div className="my-orders-header-actions">
            <button
              type="button"
              className={`refresh-orders-btn ${refreshing ? 'spinning' : ''}`}
              onClick={() => fetchOrders(true)}
              title="Refresh my orders"
              disabled={refreshing || loading}
            >
              <RefreshCw size={15} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {bannerMessage.text && (
          <div className={`my-orders-message ${bannerMessage.type}`}>
            {bannerMessage.type === 'success' ? (
              <CheckCircle2 size={16} />
            ) : (
              <AlertTriangle size={16} />
            )}
            <span>{bannerMessage.text}</span>
          </div>
        )}

        {/* Tab Controls */}
        <div className="my-orders-tabs">
          <button
            type="button"
            className={`tab-btn ${activeTab === 'upcoming' ? 'active' : ''}`}
            onClick={() => setActiveTab('upcoming')}
          >
            <Calendar size={14} />
            <span>Upcoming Orders</span>
            <span className="tab-count">{upcomingOrders.length}</span>
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'past' ? 'active' : ''}`}
            onClick={() => setActiveTab('past')}
          >
            <Clock size={14} />
            <span>Past Orders</span>
            <span className="tab-count">{pastOrders.length}</span>
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            <Utensils size={14} />
            <span>All</span>
            <span className="tab-count">{allOrders.length}</span>
          </button>
        </div>

        {/* Orders Content */}
        {loading ? (
          <div className="my-orders-loading">
            <div className="orders-spinner"></div>
            <p>Loading your orders...</p>
          </div>
        ) : displayedOrders.length === 0 ? (
          <div className="my-orders-empty">
            <div className="empty-icon-wrap">
              <ShoppingBag size={38} style={{ color: 'var(--text-tertiary)' }} />
            </div>
            <h3>
              {activeTab === 'upcoming'
                ? 'No upcoming meal orders'
                : activeTab === 'past'
                  ? 'No past orders recorded'
                  : 'No orders submitted yet'}
            </h3>
            <p>
              {activeTab === 'upcoming'
                ? 'Select meals above and click "Save Preferences" to pre-order meals for upcoming days.'
                : 'Your previous meal selections will show up here.'}
            </p>
          </div>
        ) : (
          <div className="my-orders-grid">
            {displayedOrders.map((order) => {
              const { eligible, reason } = checkEligibility(order);
              const relativeBadge = getRelativeBadge(order.date);
              const isCancelled = order.status === 'Cancelled' || order.status === 'cancelled';
              const isPastCompleted = !isCancelled && order.date < todayStr;
              const isCancelling = cancellingDate === order.date;

              return (
                <div
                  key={order.date}
                  className={`order-card ${isCancelled ? 'cancelled' : ''}`}
                >
                  <div className="order-card-header">
                    <div className="order-date-area">
                      <div className="order-date-row">
                        <span className="order-date-text">{formatDate(order.date)}</span>
                        <span className={`relative-badge ${relativeBadge.className}`}>
                          {relativeBadge.label}
                        </span>
                      </div>
                      {order.timestamp && (
                        <span className="order-timestamp">
                          Ordered on {new Date(order.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at{' '}
                          {new Date(order.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </span>
                      )}
                    </div>

                    <div className="order-header-right">
                      {isCancelled ? (
                        <div className="cancelled-badge-group">
                          <span className="order-status-badge badge-cancelled">
                            <XCircle size={13} />
                            Cancelled
                          </span>
                          <button
                            type="button"
                            className="remove-cancelled-order-btn"
                            onClick={() => setOrderToRemove(order)}
                            title="Remove from My Orders"
                            aria-label="Remove from My Orders"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : isPastCompleted ? (
                        <span className="order-status-badge badge-completed">
                          <CheckCircle2 size={13} />
                          Completed
                        </span>
                      ) : (
                        <span className="order-status-badge badge-confirmed">
                          <CheckCircle2 size={13} />
                          Confirmed
                        </span>
                      )}

                      {/* Cancel Button / Status Info */}
                      {eligible && (
                        <button
                          type="button"
                          className="one-click-cancel-btn"
                          onClick={() => handleCancelOrder(order)}
                          disabled={isCancelling}
                          title="Cancel this order immediately"
                        >
                          <XCircle size={14} />
                          <span>{isCancelling ? 'Cancelling...' : 'Cancel Order'}</span>
                        </button>
                      )}

                      {!eligible && !isCancelled && !isPastCompleted && (
                        <span className="deadline-passed-indicator" title={reason}>
                          <Lock size={12} />
                          Deadline Passed
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Meal Details Body */}
                  <div className="order-card-body">
                    <div className="order-meals-list">
                      {['breakfast', 'lunch', 'snacks', 'dinner'].map((mealKey) => {
                        const items = order.meals?.[mealKey] || [];
                        if (items.length === 0) return null;
                        const MealIcon = MEAL_ICONS[mealKey] || Utensils;

                        return (
                          <div key={mealKey} className="order-meal-row">
                            <div className="order-meal-type">
                              <MealIcon size={14} className="order-meal-icon" />
                              <span>{MEAL_LABELS[mealKey]}</span>
                            </div>
                            <div className="order-item-chips">
                              {items.map((item, idx) => (
                                <span
                                  key={idx}
                                  className={`order-chip ${isCancelled ? 'chip-cancelled' : ''}`}
                                >
                                  {item}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="order-card-footer">
                    <span className="order-count-text">
                      <Utensils size={13} style={{ marginRight: '5px', verticalAlign: 'middle' }} />
                      {order.totalItemsCount} {order.totalItemsCount === 1 ? 'item selected' : 'items selected'}
                      {isCancelled && ' (Cancelled)'}
                    </span>

                    {eligible && (
                      <span className="cancel-deadline-tip">
                        <Clock size={12} />
                        Cancellable until {formatDeadlineTime()} today
                      </span>
                    )}

                    {isCancelled && order.cancelledAt && (
                      <span className="cancelled-at-text">
                        Cancelled at {new Date(order.cancelledAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Show More Past Orders option if in Past tab and not extended */}
        {activeTab === 'past' && !showExtendedHistory && pastOrders.length > 0 && (
          <div className="load-more-orders-wrap">
            <button
              type="button"
              className="load-more-btn"
              onClick={() => {
                setShowExtendedHistory(true);
                fetchOrders(false, true);
              }}
            >
              Load Earlier History (past 30 days)
            </button>
          </div>
        )}
      </div>

      {/* Confirmation Dialog before removing cancelled order from My Orders */}
      {orderToRemove && (
        <div className="popup-overlay" onClick={() => setOrderToRemove(null)}>
          <div className="popup-modal remove-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="remove-confirm-icon-wrap">
              <AlertTriangle size={32} style={{ color: 'var(--error, #dc2626)' }} />
            </div>
            <h2 className="popup-title">Remove Cancelled Order?</h2>
            <p className="popup-message">
              Are you sure you want to remove the cancelled order for <strong>{formatDate(orderToRemove.date)}</strong> from your My Orders view?
            </p>
            <p className="remove-disclaimer-note">
              This only removes it from your My Orders screen. It does not permanently delete the Firestore order or affect admin records.
            </p>
            <div className="remove-modal-actions">
              <button
                type="button"
                className="btn-modal-cancel"
                onClick={() => setOrderToRemove(null)}
              >
                Keep Order
              </button>
              <button
                type="button"
                className="btn-modal-confirm-remove"
                onClick={() => handleConfirmRemove(orderToRemove.date)}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyOrders;

