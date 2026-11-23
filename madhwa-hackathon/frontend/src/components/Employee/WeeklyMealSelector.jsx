// src/components/Employee/WeeklyMealSelector.jsx
import React, { useState, useEffect } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { getDocWithCache, cacheDocument, docCacheKey } from '../../utils/indexedDbCache';
import { useAuth } from '../../context/AuthContext';
import { getLocalDateString } from '../../utils/dateUtils';
import {
  Calendar, Clock, CheckCircle2, AlertTriangle,
  Info, Coffee, Soup, Cookie, ChefHat, Check, History, X
} from 'lucide-react';
import './WeeklyMealSelector.css';

const MEAL_TYPES = [
  { key: 'breakfast', label: 'Breakfast', icon: Coffee },
  { key: 'lunch', label: 'Lunch', icon: Soup },
  { key: 'snacks', label: 'Snacks', icon: Cookie },
  { key: 'dinner', label: 'Dinner', icon: ChefHat },
];

const mealTimings = {
  breakfast: { start: '8:30 AM', end: '10:00 AM' },
  lunch: { start: '1:00 PM', end: '2:30 PM' },
  snacks: { start: '5:00 PM', end: '6:30 PM' },
  dinner: { start: '8:00 PM', end: '9:30 PM' }
};

const EMPTY_DAY_SELECTION = {
  breakfast: false,
  lunch: false,
  snacks: false,
  dinner: false
};

const WeeklyMealSelector = ({ onSaveSuccess }) => {
  const { currentUser } = useAuth();
  const [weekDays, setWeekDays] = useState([]);
  const [weeklySelections, setWeeklySelections] = useState({});
  const [weeklyMenus, setWeeklyMenus] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [showHistory, setShowHistory] = useState(false);
  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [offline, setOffline] = useState(false); // True when data was served from IndexedDB cache
  const [deadlineHour, setDeadlineHour] = useState(21);
  const [deadlineMinute, setDeadlineMinute] = useState(0);
  const [savedDates, setSavedDates] = useState(new Set()); // Days that already have a selection document

  useEffect(() => {
    initializeWeek();
  }, []);

  // Build the next 7 days starting from TOMORROW, skipping Sunday.
  const initializeWeek = async () => {
    const days = [];

    let cursor = new Date();
    cursor.setDate(cursor.getDate() + 1);

    while (days.length < 7) {
      if (cursor.getDay() !== 0) {
        const dateStr = getLocalDateString(cursor);

        days.push({
          date: dateStr,
          dayName: cursor.toLocaleDateString('en-US', { weekday: 'short' }),
          dayNumber: cursor.getDate(),
          month: cursor.toLocaleDateString('en-US', { month: 'short' }),
          isPast: cursor < new Date()
        });
      }

      cursor = new Date(cursor);
      cursor.setDate(cursor.getDate() + 1);
    }

    setWeekDays(days);

    const initialSelections = {};
    days.forEach(day => {
      initialSelections[day.date] = {
        ...EMPTY_DAY_SELECTION
      };
    });

    setWeeklySelections(initialSelections);

    await fetchDeadlineSettings();
    await loadWeeklyData(days);
    setLoading(false);
  };

  // Use the same admin-configured deadline as the daily view.
  const fetchDeadlineSettings = async () => {
    try {
      const settingsRef = doc(db, 'settings', 'deadline');
      const { data, exists, fromCache } = await getDocWithCache(
        settingsRef,
        docCacheKey('settings', 'deadline')
      );
      if (fromCache) setOffline(true);
      if (exists) {
        setDeadlineHour(data.deadlineHour ?? 21);
        setDeadlineMinute(data.deadlineMinute ?? 0);
      }
    } catch (error) {
      console.error('Error fetching deadline settings:', error);
    }
  };

  const formatDeadlineTime = () => {
    const period = deadlineHour >= 12 ? 'PM' : 'AM';
    const displayHour = deadlineHour % 12 === 0 ? 12 : deadlineHour % 12;
    return `${displayHour}:${String(deadlineMinute).padStart(2, '0')} ${period}`;
  };

  const fetchHistory = async () => {
    setHistoryLoading(true);
    setShowHistory(true);
    try {
      const results = [];
      const today = new Date();

      for (let i = 1; i <= 14; i++) {
        const pastDate = new Date(today);
        pastDate.setDate(today.getDate() - i);
        const dateStr = getLocalDateString(pastDate);

        const selectionRef = doc(db, 'mealSelections', dateStr, 'users', currentUser.uid);
        const selectionResult = await getDocWithCache(
          selectionRef,
          docCacheKey('mealSelections', dateStr, 'users', currentUser.uid)
        );

        if (selectionResult.fromCache) setOffline(true);

        if (selectionResult.exists) {
          const data = selectionResult.data;
          const hasAnyItems = MEAL_TYPES.some(m =>
            Array.isArray(data[m.key])
              ? data[m.key].length > 0
              : data[m.key] === true
          );
          if (hasAnyItems) {
            results.push({
              date: dateStr,

              dayLabel: pastDate.toLocaleDateString(
                'en-US',
                {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric'
                }
              ),

              breakfast: Array.isArray(data.breakfast)
                ? data.breakfast.length > 0
                : data.breakfast === true,

              lunch: Array.isArray(data.lunch)
                ? data.lunch.length > 0
                : data.lunch === true,

              snacks: Array.isArray(data.snacks)
                ? data.snacks.length > 0
                : data.snacks === true,

              dinner: Array.isArray(data.dinner)
                ? data.dinner.length > 0
                : data.dinner === true
            });
          }
        }
      }

      // Most recent first
      results.sort((a, b) => b.date.localeCompare(a.date));
      setHistoryData(results);
    } catch (error) {
      console.error('Error fetching history:', error);
      showMessage('error', 'Failed to load history');
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadWeeklyData = async (days) => {
    try {
      const menusData = {};
      const selectionsData = {};

      for (const day of days) {
        const menuRef = doc(db, 'menus', day.date);
        const menuResult = await getDocWithCache(
          menuRef,
          docCacheKey('menus', day.date)
        );
        if (menuResult.fromCache) setOffline(true);
        if (menuResult.exists) {
          menusData[day.date] = menuResult.data;
        }

        const selectionRef = doc(db, 'mealSelections', day.date, 'users', currentUser.uid);
        const selectionResult = await getDocWithCache(
          selectionRef,
          docCacheKey('mealSelections', day.date, 'users', currentUser.uid)
        );
        if (selectionResult.fromCache) setOffline(true);
        if (selectionResult.exists) {
          const data = selectionResult.data;
          if (selectionResult.exists) {
            const data = selectionResult.data;

            selectionsData[day.date] = {
              breakfast: Array.isArray(data.breakfast)
                ? data.breakfast.length > 0
                : data.breakfast === true,

              lunch: Array.isArray(data.lunch)
                ? data.lunch.length > 0
                : data.lunch === true,

              snacks: Array.isArray(data.snacks)
                ? data.snacks.length > 0
                : data.snacks === true,

              dinner: Array.isArray(data.dinner)
                ? data.dinner.length > 0
                : data.dinner === true
            };
          }
        }
      }

      setWeeklyMenus(menusData);
      setWeeklySelections(prev => ({ ...prev, ...selectionsData }));
      setSavedDates(new Set(Object.keys(selectionsData)));
    } catch (error) {
      console.error('Error loading weekly data:', error);
      showMessage('error', 'Failed to load weekly data');
    }
  };

  // Normalize menu/staple items while preserving quantity and availability.
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

  const isEditAllowed = (dateStr) => {
    const mealDate = new Date(dateStr + 'T00:00:00');
    const now = new Date();
    const cutoff = new Date(mealDate);
    cutoff.setDate(mealDate.getDate() - 1);
    cutoff.setHours(deadlineHour, deadlineMinute, 0, 0);
    return now < cutoff;
  };

  const handleMealToggle = (dateStr, mealType) => {
    const editAllowed = isEditAllowed(dateStr);

    if (!editAllowed) {
      const mealDate = new Date(`${dateStr}T00:00:00`);
      const cutoff = new Date(mealDate);

      cutoff.setDate(mealDate.getDate() - 1);

      showMessage(
        'error',
        `Deadline passed! Changes are allowed until ${formatDeadlineTime()} on ${cutoff.toLocaleDateString()}.`
      );

      return;
    }

    setWeeklySelections(prev => {
      const dayData = prev[dateStr] || { ...EMPTY_DAY_SELECTION };

      return {
        ...prev,
        [dateStr]: {
          ...dayData,
          [mealType]: !dayData[mealType]
        }
      };
    });
  };


const handleSaveWeekly = async () => {
  try {
    setSaving(true);
    showMessage('info', 'Saving weekly meal preferences...');

    let savedCount = 0;
    const nextSavedDates = new Set(savedDates);

    for (const day of weekDays) {
      const dateStr = day.date;
      const selections = weeklySelections[dateStr];

      if (!selections) continue;

      const hasAnyMeals = MEAL_TYPES.some(
        meal => selections[meal.key] === true
      );

      // Do not create empty records for days never saved.
      if (!hasAnyMeals && !savedDates.has(dateStr)) {
        continue;
      }

      const selectionRef = doc(
        db,
        'mealSelections',
        dateStr,
        'users',
        currentUser.uid
      );

      const dayData = {
        employeeId: currentUser.uid,
        userId: currentUser.uid,
        email: currentUser.email || '',
        date: dateStr,

        breakfast: selections.breakfast === true,
        lunch: selections.lunch === true,
        snacks: selections.snacks === true,
        dinner: selections.dinner === true,

        status: 'Confirmed',
        timestamp: new Date().toISOString()
      };

      await setDoc(selectionRef, dayData);

      await cacheDocument(
        docCacheKey(
          'mealSelections',
          dateStr,
          'users',
          currentUser.uid
        ),
        dayData
      );

      nextSavedDates.add(dateStr);
      savedCount++;
    }

    setSavedDates(nextSavedDates);

    showMessage(
      'success',
      `Saved meal preferences for ${savedCount} days!`
    );

    if (onSaveSuccess) {
      onSaveSuccess();
    }

  } catch (error) {
    console.error('Error saving weekly preferences:', error);
    showMessage('error', 'Failed to save meal preferences');
  } finally {
    setSaving(false);
  }
};


  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 5000);
  };

  const getSelectedCountForDay = (dateStr) => {
    const selections = weeklySelections[dateStr];

    if (!selections) return 0;

    return MEAL_TYPES.filter(
      meal => selections[meal.key] === true
    ).length;
  };

  const getTotalSelectedItems = () => {
    let total = 0;

    Object.values(weeklySelections).forEach(daySelections => {
      MEAL_TYPES.forEach(meal => {
        if (daySelections[meal.key] === true) {
          total++;
        }
      });
    });

    return total;
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading weekly menu...</p>
      </div>
    );
  }

  return (
    <div className="weekly-meal-selector">
      {offline && (
        <div className="offline-banner">
          <AlertTriangle size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
          You're offline — showing the last saved data. Changes can't be synced until you're back online.
        </div>
      )}

      <div className="weekly-header">
        <div className="weekly-header-top">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={22} style={{ color: 'var(--accent-primary)' }} />
            Weekly Meal Selection
          </h2>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button className="history-btn" onClick={fetchHistory}>
              <History size={16} /> History
            </button>
          </div>
        </div>
        <p className="subtitle">
          Set your meal preferences for the next 7 days.
        </p>
        <div className="deadline-notice">
          <Clock size={14} />
          <span>
            <strong>Important:</strong> You can change your meal preferences
            until {formatDeadlineTime()} on the previous day.
          </span>
        </div>
      </div>

      {message.text && (
        <div className={`message ${message.type}`}>
          {message.type === 'success' && <CheckCircle2 size={16} style={{ marginRight: '6px', verticalAlign: 'middle', display: 'inline-block' }} />}
          {message.type === 'error' && <AlertTriangle size={16} style={{ marginRight: '6px', verticalAlign: 'middle', display: 'inline-block' }} />}
          {message.type === 'info' && <Info size={16} style={{ marginRight: '6px', verticalAlign: 'middle', display: 'inline-block' }} />}
          {' '}{message.text}
        </div>
      )}

      <div className="week-calendar">
        {weekDays.map(day => {
          const editAllowed = isEditAllowed(day.date);
          return (
            <div key={day.date} className="day-card">
              <div className="day-header">
                <div className="day-info" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Calendar size={14} style={{ color: 'var(--accent-primary)' }} />
                  <span className="day-name">{day.dayName}</span>
                  <span className="day-number">{day.dayNumber}</span>
                  <span className="day-month">{day.month}</span>
                </div>
                <div className="day-count">
                  {getSelectedCountForDay(day.date)} meals requested
                </div>
              </div>

              {!editAllowed && (
                <div className="deadline-locked-badge">Deadline passed — remove only</div>
              )}


<div className="day-meals-groups">
  {MEAL_TYPES.map(({ key, label, icon: Icon }) => {
    const isInterested =
      weeklySelections[day.date]?.[key] === true;

    const menuItems = Array.isArray(weeklyMenus[day.date]?.[key])
      ? weeklyMenus[day.date][key]
          .map(item =>
            typeof item === 'string'
              ? item
              : item?.name || ''
          )
          .filter(Boolean)
      : [];

    return (
      <div className="meal-group" key={key}>
        <div className="meal-group-header">
          <Icon
            size={16}
            style={{ color: 'var(--accent-primary)' }}
          />

          <span>{label}</span>

          <span className="meal-group-time">
            {mealTimings[key].start}
          </span>
        </div>

        <div className="weekly-meal-option">
          <div className="weekly-assigned-menu">
            {menuItems.length > 0 ? (
              <span>{menuItems.join(', ')}</span>
            ) : (
              <span className="no-items">
                Menu not published yet
              </span>
            )}
          </div>

          <label className="weekly-meal-toggle">
            <span>
              {isInterested ? 'Interested' : 'Not Interested'}
            </span>

            <input
              type="checkbox"
              checked={isInterested}
              onChange={() =>
                handleMealToggle(day.date, key)
              }
              disabled={!editAllowed || saving || offline}
            />
          </label>
        </div>
      </div>
    );
  })}
</div>

            </div>
          );
        })}
      </div>

      <div className="weekly-summary">
        <div className="summary-stats">
          <div className="stat-item">
            <span className="stat-label">Total Meals Requested</span>
            <span className="stat-value">{getTotalSelectedItems()}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Days Shown</span>
            <span className="stat-value">{weekDays.length}</span>
          </div>
        </div>

        <button
          className="btn btn-primary btn-large"
          onClick={handleSaveWeekly}
          disabled={saving || offline}
        >
          {saving ? 'Saving...' : 'Save Weekly Selections'}
        </button>
      </div>
      {showHistory && (
        <div className="history-modal-overlay" onClick={() => setShowHistory(false)}>
          <div className="history-modal" onClick={(e) => e.stopPropagation()}>
            <div className="history-modal-header">
              <h3>Your Meal History (Last 14 Days)</h3>
              <button className="history-close-btn" onClick={() => setShowHistory(false)} aria-label="Close history"><X size={18} /></button>
            </div>
            <div className="history-modal-body">
              {historyLoading ? (
                <div className="history-loading">
                  <div className="spinner"></div>
                  <p>Loading history...</p>
                </div>
              ) : historyData.length === 0 ? (
                <p className="history-empty">No meal selections found in the last 14 days.</p>
              ) : (
                historyData.map(day => (
                  <div key={day.date} className="history-day-card">
                    <div className="history-day-label">{day.dayLabel}</div>
                    <div className="history-day-meals">
                      {MEAL_TYPES.map(({ key, label }) => day[key] && (
                        <div key={key} className="history-meal-row">
                          <span className="history-meal-label">
                            {label}:
                          </span>

                          <span className="history-meal-items">
                            Interested
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WeeklyMealSelector;
