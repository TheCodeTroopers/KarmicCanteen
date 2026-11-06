// src/components/Employee/MyOrders.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { getDocWithCache, cacheDocument, docCacheKey } from '../../utils/indexedDbCache';
import { useAuth } from '../../context/AuthContext';
import { getLocalDateString } from '../../utils/dateUtils';
import {
  ShoppingBag, Calendar, Clock, CheckCircle2, XCircle, 
  Coffee, Soup, Cookie, ChefHat, RefreshCw, Lock, AlertTriangle,
  Utensils, Check, X, Pencil
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

const normalizeMenuItem = (item) => {
  if (typeof item === 'string') return { name: item.trim(), available: true, quantity: null };
  if (item && typeof item === 'object') {
    const name = String(item.name || '').trim();
    let quantity = null;
    if (item.quantity !== null && item.quantity !== undefined && item.quantity !== '') {
      const parsed = Number(item.quantity);
      quantity = Number.isFinite(parsed) ? Math.max(0, parsed) : null;
    }
    return { name, available: item.available !== false, quantity };
  }
  return { name: String(item || '').trim(), available: true, quantity: null };
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
  onOrderUpdated,
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

  // Ref that is true while a cancellation Firestore write is in progress.
  // Any fetchOrders() triggered during this window is skipped — the optimistic
  // setOrders update is already correct and a stale re-fetch would undo it.
  const cancellingRef = useRef(false);

  // Edit Order state
  const [editingOrder, setEditingOrder] = useState(null);
  const [editingMenu, setEditingMenu] = useState(null);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [editSelections, setEditSelections] = useState({ breakfast: [], lunch: [], snacks: [], dinner: [] });
  const [savingEdit, setSavingEdit] = useState(false);
  const [staples, setStaples] = useState({ breakfast: [], lunch: [], snacks: [], dinner: [] });
  const [staplesLoaded, setStaplesLoaded] = useState(false);

  useEffect(() => {
    setDismissedDates(loadDismissedOrders(currentUser?.uid));
  }, [currentUser?.uid]);

  const fetchOrders = useCallback(async (isManualRefresh = false, extended = showExtendedHistory) => {
    // Skip re-fetch while a cancellation write is still in progress to prevent
    // a stale Firestore read from overwriting the optimistic UI update.
    if (cancellingRef.current && !isManualRefresh) return;

    const uid = currentUser?.uid;
    if (!uid) return;
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
          const docRef = doc(db, 'mealSelections', dateStr, 'users', uid);
          const cacheKey = docCacheKey('mealSelections', dateStr, 'users', uid);
          const result = await getDocWithCache(docRef, cacheKey);

          if (result.fromCache) {
            setOffline(true);
          }

          if (!result.exists || !result.data) {
            return null;
          }

          const data = result.data;
          const isCancelled = String(data.status || '').toLowerCase() === 'cancelled';

          const breakfastRaw = Array.isArray(data.breakfast) ? data.breakfast : [];
          const lunchRaw = Array.isArray(data.lunch) ? data.lunch : [];
          const snacksRaw = Array.isArray(data.snacks) ? data.snacks : [];
          const dinnerRaw = Array.isArray(data.dinner) ? data.dinner : [];

          // Normalize items to simple strings (name) for UI rendering
          const normalizeItems = (arr) => arr.map(item => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object') return item.name || '';
            return '';
          }).filter(Boolean);

          const displayMeals = {
            breakfast: normalizeItems(breakfastRaw).length > 0 ? normalizeItems(breakfastRaw) : (data.originalSelections?.breakfast || []),
            lunch: normalizeItems(lunchRaw).length > 0 ? normalizeItems(lunchRaw) : (data.originalSelections?.lunch || []),
            snacks: normalizeItems(snacksRaw).length > 0 ? normalizeItems(snacksRaw) : (data.originalSelections?.snacks || []),
            dinner: normalizeItems(dinnerRaw).length > 0 ? normalizeItems(dinnerRaw) : (data.originalSelections?.dinner || []),
          };

          // Keep all orders visible (even if no items — cancelled orders may have no active items)
          const totalItemsCount =
            (displayMeals.breakfast?.length || 0) +
            (displayMeals.lunch?.length || 0) +
            (displayMeals.snacks?.length || 0) +
            (displayMeals.dinner?.length || 0);

          // A confirmed order with 0 items is an empty placeholder — flag it so the UI
          // can show "No meals selected" instead of "Confirmed".
          const hasNoMeals = totalItemsCount === 0;
          const effectiveStatus = isCancelled
            ? 'cancelled'
            : hasNoMeals
              ? 'empty'
              : (data.status || 'Confirmed');

          return {
            date: dateStr,
            status: effectiveStatus,
            timestamp: data.timestamp || null,
            cancelledAt: data.cancelledAt || data.cancellationTimestamp || null,
            cancellationTimestamp: data.cancellationTimestamp || data.cancelledAt || null,
            cancellationDate: data.cancellationDate || null,
            cancellationTime: data.cancellationTime || null,
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
  // Use uid string (not the whole currentUser object) so the callback reference
  // only changes when the user actually logs in/out — not on every Auth token refresh.
  }, [currentUser?.uid, showExtendedHistory]);

  // Initial load and when the user changes
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Explicit refresh requested by the parent (e.g. after saving new selections)
  const prevRefreshTrigger = useRef(refreshTrigger);
  useEffect(() => {
    if (prevRefreshTrigger.current !== refreshTrigger) {
      prevRefreshTrigger.current = refreshTrigger;
      fetchOrders();
    }
  }, [refreshTrigger, fetchOrders]);

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
    if (String(order.status || '').toLowerCase() === 'cancelled') {
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

    // Guard: block any background re-fetches while we write + apply the optimistic update.
    // Cleared after 4 s — enough for Firestore to propagate the write so the next
    // manual or trigger-based fetch reads the correct cancelled status.
    cancellingRef.current = true;

    try {
      setCancellingDate(order.date);
      const selectionRef = doc(db, 'mealSelections', order.date, 'users', currentUser.uid);

      const now = new Date();
      const cancellationTimestamp = now.toISOString();
      const cancellationDate = getLocalDateString(now);
      const cancellationTime = now.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });

      // Preserve all existing order data in Firestore!
      const breakfast = Array.isArray(order.meals?.breakfast) ? order.meals.breakfast : (order.rawDoc?.breakfast || []);
      const lunch = Array.isArray(order.meals?.lunch) ? order.meals.lunch : (order.rawDoc?.lunch || []);
      const snacks = Array.isArray(order.meals?.snacks) ? order.meals.snacks : (order.rawDoc?.snacks || []);
      const dinner = Array.isArray(order.meals?.dinner) ? order.meals.dinner : (order.rawDoc?.dinner || []);

      const cancelledDoc = {
        ...(order.rawDoc || {}),
        date: order.date,
        userId: currentUser.uid,
        email: currentUser.email,
        status: 'cancelled',
        cancelledAt: cancellationTimestamp,
        cancellationTimestamp,
        cancellationDate,
        cancellationTime,
        breakfast,
        lunch,
        snacks,
        dinner,
      };

      await setDoc(selectionRef, cancelledDoc, { merge: true });
      await cacheDocument(docCacheKey('mealSelections', order.date, 'users', currentUser.uid), cancelledDoc);

      // Keep the cancelled order visible in My Orders with 'cancelled' status
      setOrders(prev => prev.map(o => {
        if (o.date === order.date) {
          return {
            ...o,
            status: 'cancelled',
            cancelledAt: cancellationTimestamp,
            cancellationTimestamp,
            cancellationDate,
            cancellationTime,
            meals: { breakfast, lunch, snacks, dinner },
            rawDoc: cancelledDoc,
          };
        }
        return o;
      }));

      // Switch to All tab so the cancelled order is immediately visible with its badge
      setActiveTab('all');

      setBannerMessage({
        type: 'success',
        text: `Order for ${formatDate(order.date)} was cancelled. It has moved to the All tab — use × to hide it.`,
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
      // Allow re-fetches again after 4 s — by then Firestore has propagated the write
      // and any subsequent fetch will correctly read status: 'cancelled'.
      setTimeout(() => { cancellingRef.current = false; }, 4000);
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

  const fetchMenuForDate = async (dateStr) => {
    setLoadingMenu(true);
    try {
      const menuRef = doc(db, 'menus', dateStr);
      const menuRes = await getDocWithCache(menuRef, docCacheKey('menus', dateStr));
      if (menuRes.fromCache) setOffline(true);
      const dateMenu = menuRes.exists && menuRes.data ? menuRes.data : null;

      let staplesData = staples;
      if (!staplesLoaded) {
        let stapleRef = doc(db, 'menus', 'default');
        let stapleRes = await getDocWithCache(stapleRef, docCacheKey('menus', 'default'));
        if (stapleRes.fromCache) setOffline(true);

        if (!stapleRes.exists) {
          stapleRef = doc(db, 'defaultMenu', 'config');
          stapleRes = await getDocWithCache(stapleRef, docCacheKey('defaultMenu', 'config'));
          if (stapleRes.fromCache) setOffline(true);
        }
        if (!stapleRes.exists) {
          stapleRef = doc(db, 'dailyStaples', 'config');
          stapleRes = await getDocWithCache(stapleRef, docCacheKey('dailyStaples', 'config'));
          if (stapleRes.fromCache) setOffline(true);
        }

        if (stapleRes.exists && stapleRes.data) {
          staplesData = {
            breakfast: stapleRes.data.breakfast || [],
            lunch: stapleRes.data.lunch || [],
            snacks: stapleRes.data.snacks || [],
            dinner: stapleRes.data.dinner || [],
          };
          setStaples(staplesData);
          setStaplesLoaded(true);
        }
      }

      setEditingMenu(dateMenu);
    } catch (err) {
      console.warn('Error loading menu for edit:', err);
    } finally {
      setLoadingMenu(false);
    }
  };

  const handleStartEditOrder = (order) => {
    const { eligible, reason } = checkEligibility(order);
    if (!eligible) {
      setBannerMessage({ type: 'error', text: `Cannot edit order: ${reason}.` });
      return;
    }

    setEditingOrder(order);
    setEditSelections({
      breakfast: Array.isArray(order.meals?.breakfast) ? [...order.meals.breakfast] : [],
      lunch: Array.isArray(order.meals?.lunch) ? [...order.meals.lunch] : [],
      snacks: Array.isArray(order.meals?.snacks) ? [...order.meals.snacks] : [],
      dinner: Array.isArray(order.meals?.dinner) ? [...order.meals.dinner] : [],
    });
    fetchMenuForDate(order.date);
  };

  const handleEditItemToggle = (mealType, itemName) => {
    setEditSelections(prev => {
      const items = prev[mealType] || [];
      const alreadySelected = items.includes(itemName);
      const updated = alreadySelected
        ? items.filter(i => i !== itemName)
        : [...items, itemName];
      return { ...prev, [mealType]: updated };
    });
  };

  const getEditAvailableItems = (mealType) => {
    const rawMenuItems = editingMenu?.[mealType] || [];
    const rawStaplesItems = staples[mealType] || [];
    const combined = [
      ...rawStaplesItems.map(normalizeMenuItem),
      ...rawMenuItems.map(normalizeMenuItem)
    ].filter(item => item.name && item.available);

    const currentlySelected = editSelections[mealType] || [];
    currentlySelected.forEach(name => {
      if (!combined.some(i => i.name.toLowerCase() === name.toLowerCase())) {
        combined.push({ name, available: true, quantity: null });
      }
    });

    const uniqueItems = [];
    const seen = new Set();
    combined.forEach(item => {
      const k = item.name.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        uniqueItems.push(item);
      }
    });
    return uniqueItems;
  };

  const getEditTotalSelectedCount = () => {
    return (
      (editSelections.breakfast?.length || 0) +
      (editSelections.lunch?.length || 0) +
      (editSelections.snacks?.length || 0) +
      (editSelections.dinner?.length || 0)
    );
  };

  const handleSaveEditedOrder = async () => {
    if (!editingOrder) return;

    const { eligible, reason } = checkEligibility(editingOrder);
    if (!eligible) {
      setBannerMessage({ type: 'error', text: `Cannot save changes: ${reason}.` });
      setEditingOrder(null);
      return;
    }

    try {
      setSavingEdit(true);
      const selectionRef = doc(db, 'mealSelections', editingOrder.date, 'users', currentUser.uid);

      const now = new Date();
      const updatedAt = now.toISOString();

      const updatedDoc = {
        ...(editingOrder.rawDoc || {}),
        date: editingOrder.date,
        userId: currentUser.uid,
        email: currentUser.email,
        status: 'Confirmed',
        breakfast: editSelections.breakfast || [],
        lunch: editSelections.lunch || [],
        snacks: editSelections.snacks || [],
        dinner: editSelections.dinner || [],
        updatedAt,
        modified: true,
      };

      await setDoc(selectionRef, updatedDoc, { merge: true });
      await cacheDocument(docCacheKey('mealSelections', editingOrder.date, 'users', currentUser.uid), updatedDoc);

      const totalItems = getEditTotalSelectedCount();

      setOrders(prev => prev.map(o => {
        if (o.date === editingOrder.date) {
          return {
            ...o,
            status: 'Confirmed',
            meals: {
              breakfast: updatedDoc.breakfast,
              lunch: updatedDoc.lunch,
              snacks: updatedDoc.snacks,
              dinner: updatedDoc.dinner,
            },
            totalItemsCount: totalItems,
            updatedAt,
            rawDoc: updatedDoc,
          };
        }
        return o;
      }));

      setBannerMessage({
        type: 'success',
        text: `Order for ${formatDate(editingOrder.date)} was successfully updated!`,
      });

      if (onOrderUpdated) {
        onOrderUpdated(editingOrder.date, editSelections);
      }

      setEditingOrder(null);
    } catch (err) {
      console.error('[MyOrders] Error updating order:', err);
      setBannerMessage({
        type: 'error',
        text: 'Failed to update order. Please try again.',
      });
    } finally {
      setSavingEdit(false);
    }
  };

  // Filter out cancelled orders that the employee chose to dismiss from their screen
  const visibleOrders = orders.filter((order) => {
    const isCancelled = order.status === 'Cancelled' || order.status === 'cancelled';
    return !(isCancelled && dismissedDates.has(order.date));
  });

  // Group and sort orders
  // Upcoming: future/today orders that are NOT cancelled (cancelled ones move to All only)
  const upcomingOrders = visibleOrders
    .filter(order => {
      const isCancelled = order.status === 'Cancelled' || order.status === 'cancelled';
      return order.date >= todayStr && !isCancelled;
    })
    .sort((a, b) => a.date.localeCompare(b.date)); // Earliest upcoming first

  // Past: orders with a past date (including cancelled past orders)
  const pastOrders = visibleOrders
    .filter(order => order.date < todayStr)
    .sort((a, b) => b.date.localeCompare(a.date)); // Most recent past first

  // All: every visible order (including cancelled future orders)
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
                ? 'Select meals above and click "Save Preferences" to pre-order meals for upcoming days. Cancelled orders appear in the All tab.'
                : activeTab === 'past'
                  ? 'Your previous meal selections will show up here.'
                  : 'Your meal orders (including cancelled ones) will appear here.'}
            </p>
          </div>
        ) : (
          <div className="my-orders-grid">
            {displayedOrders.map((order) => {
              const { eligible, reason } = checkEligibility(order);
              const relativeBadge = getRelativeBadge(order.date);
              const isCancelled = order.status === 'Cancelled' || order.status === 'cancelled';
              const isEmpty = order.status === 'empty';
              const isPastCompleted = !isCancelled && !isEmpty && order.date < todayStr;
              const isCancelling = cancellingDate === order.date;

              return (
                <div
                  key={order.date}
                  className={`order-card ${isCancelled ? 'cancelled' : ''} ${isEmpty ? 'empty-order' : ''}`}
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
                      ) : isEmpty ? (
                        <span className="order-status-badge badge-empty">
                          <AlertTriangle size={13} />
                          No meals selected
                        </span>
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

                      {/* Actions: Edit & Cancel (Disabled for cancelled and expired orders) */}
                      {eligible && (
                        <div className="order-actions-row">
                          <button
                            type="button"
                            className="edit-order-btn"
                            onClick={() => handleStartEditOrder(order)}
                            title="Edit meal items in this order"
                          >
                            <Pencil size={13} />
                            <span>Edit Order</span>
                          </button>

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
                        </div>
                      )}

                      {!eligible && !isCancelled && !isEmpty && !isPastCompleted && (
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
                      {isEmpty ? (
                        <div className="order-no-meals-msg">
                          <AlertTriangle size={14} style={{ color: 'var(--warning-color, #f59e0b)', marginRight: '6px', flexShrink: 0 }} />
                          <span>No meal items were selected for this day.</span>
                        </div>
                      ) : (
                        ['breakfast', 'lunch', 'snacks', 'dinner'].map((mealKey) => {
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
                        })
                      )}
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="order-card-footer">
                    <span className="order-count-text">
                      <Utensils size={13} style={{ marginRight: '5px', verticalAlign: 'middle' }} />
                      {isEmpty
                        ? 'No meals selected'
                        : `${order.totalItemsCount} ${order.totalItemsCount === 1 ? 'item selected' : 'items selected'}${isCancelled ? ' (Cancelled)' : ''}`}
                    </span>

                    {eligible && (
                      <span className="cancel-deadline-tip">
                        <Clock size={12} />
                        Cancellable until {formatDeadlineTime()} today
                      </span>
                    )}

                    {order.updatedAt && !isCancelled && (
                      <span className="order-updated-at-tip">
                        <Clock size={11} />
                        Edited at {new Date(order.updatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    )}

                    {isCancelled && (order.cancellationTime || order.cancelledAt) && (
                      <span className="cancelled-at-text">
                        Cancelled {order.cancellationDate ? `on ${order.cancellationDate}` : ''} at{' '}
                        {order.cancellationTime || new Date(order.cancelledAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
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

      {/* Edit Order Modal */}
      {editingOrder && (
        <div className="popup-overlay" onClick={() => setEditingOrder(null)}>
          <div className="popup-modal edit-order-modal" onClick={(e) => e.stopPropagation()}>
            <div className="edit-order-header">
              <div className="edit-order-header-title">
                <div className="edit-order-icon-wrap">
                  <Pencil size={20} style={{ color: 'var(--accent-primary)' }} />
                </div>
                <div>
                  <h2>Edit Order – {formatDate(editingOrder.date)}</h2>
                  <p className="edit-order-subtitle">
                    Add or remove items before deadline ({formatDeadlineTime()})
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="edit-order-close-btn"
                onClick={() => setEditingOrder(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {loadingMenu ? (
              <div className="edit-order-loading">
                <div className="orders-spinner"></div>
                <p>Loading available menu...</p>
              </div>
            ) : (
              <div className="edit-order-meals-container">
                {['breakfast', 'lunch', 'snacks', 'dinner'].map((mealKey) => {
                  const availableItems = getEditAvailableItems(mealKey);
                  const selectedItems = editSelections[mealKey] || [];
                  const MealIcon = MEAL_ICONS[mealKey] || Utensils;

                  return (
                    <div key={mealKey} className="edit-meal-section">
                      <div className="edit-meal-section-header">
                        <div className="edit-meal-title">
                          <MealIcon size={16} className="order-meal-icon" />
                          <span>{MEAL_LABELS[mealKey]}</span>
                        </div>
                        <span className="edit-meal-badge">
                          {selectedItems.length} selected
                        </span>
                      </div>

                      {availableItems.length === 0 ? (
                        <p className="no-items-text">No items configured for this meal</p>
                      ) : (
                        <div className="item-chip-row">
                          {availableItems.map((item) => {
                            const isSelected = selectedItems.includes(item.name);
                            const isOutOfStock = item.quantity !== null && item.quantity <= 0;

                            return (
                              <button
                                key={item.name}
                                type="button"
                                className={`item-chip ${isSelected ? 'selected' : ''}`}
                                onClick={() => handleEditItemToggle(mealKey, item.name)}
                                disabled={isOutOfStock}
                                title={
                                  isOutOfStock
                                    ? `${item.name} is out of stock`
                                    : item.quantity !== null
                                    ? `${item.quantity} available`
                                    : item.name
                                }
                              >
                                {isSelected && <Check size={12} />}
                                <span>{item.name}</span>
                                {item.quantity !== null && (
                                  <span style={{ marginLeft: '6px', fontSize: '11px', opacity: 0.75 }}>
                                    {isOutOfStock ? 'Out of stock' : `${item.quantity} left`}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="edit-order-footer">
              <div className="edit-total-badge">
                <Utensils size={14} />
                <span>{getEditTotalSelectedCount()} items selected</span>
              </div>

              <div className="edit-order-actions">
                <button
                  type="button"
                  className="btn-modal-cancel"
                  onClick={() => setEditingOrder(null)}
                  disabled={savingEdit}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-modal-save"
                  onClick={handleSaveEditedOrder}
                  disabled={savingEdit || loadingMenu}
                >
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyOrders;

