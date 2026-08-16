// src/components/Employee/WeeklyMealSelector.jsx
import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { getLocalDateString } from '../../utils/dateUtils';
import {
  Calendar, Clock, CheckCircle2, AlertTriangle,
  Info, Coffee, Soup, Cookie, ChefHat, Check, History
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

const EMPTY_DAY_SELECTION = { breakfast: [], lunch: [], snacks: [], dinner: [] };

const WeeklyMealSelector = () => {
  const { currentUser } = useAuth();
  const [weekDays, setWeekDays] = useState([]);
  const [weeklySelections, setWeeklySelections] = useState({});
  const [weeklyMenus, setWeeklyMenus] = useState({});
  const [staples, setStaples] = useState(EMPTY_DAY_SELECTION);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [showHistory, setShowHistory] = useState(false);
  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  useEffect(() => {
    initializeWeek();
  }, []);

  // Build the next 7 days starting from TOMORROW, skipping Sunday.
  const initializeWeek = async () => {
    const days = [];
    let cursor = new Date();
    cursor.setDate(cursor.getDate() + 1); // start from tomorrow

    while (days.length < 7) {
      if (cursor.getDay() !== 0) { // skip Sunday
        const dateStr = getLocalDateString(cursor);
        days.push({
          date: dateStr,
          dayName: cursor.toLocaleDateString('en-US', { weekday: 'short' }),
          dayNumber: cursor.getDate(),
          month: cursor.toLocaleDateString('en-US', { month: 'short' }),
        });
      }
      cursor = new Date(cursor);
      cursor.setDate(cursor.getDate() + 1);
    }

    setWeekDays(days);

    const initialSelections = {};
    days.forEach(day => {
      initialSelections[day.date] = { breakfast: [], lunch: [], snacks: [], dinner: [] };
    });
    setWeeklySelections(initialSelections);

    await loadStaples();
    await loadWeeklyData(days);
    setLoading(false);
  };

  const loadStaples = async () => {
    try {
      const ref = doc(db, 'dailyStaples', 'config');
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();
        setStaples({
          breakfast: data.breakfast || [],
          lunch: data.lunch || [],
          snacks: data.snacks || [],
          dinner: data.dinner || [],
        });
      }
    } catch (error) {
      console.error('Error loading daily staples:', error);
    }
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
      const selectionSnap = await getDoc(selectionRef);

      if (selectionSnap.exists()) {
        const data = selectionSnap.data();
        const hasAnyItems = MEAL_TYPES.some(m => (data[m.key] || []).length > 0);
        if (hasAnyItems) {
          results.push({
            date: dateStr,
            dayLabel: pastDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
            breakfast: data.breakfast || [],
            lunch: data.lunch || [],
            snacks: data.snacks || [],
            dinner: data.dinner || [],
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
  }};

  const loadWeeklyData = async (days) => {
    try {
      const menusData = {};
      const selectionsData = {};

      for (const day of days) {
        const menuRef = doc(db, 'menus', day.date);
        const menuSnap = await getDoc(menuRef);
        if (menuSnap.exists()) {
          menusData[day.date] = menuSnap.data();
        }

        const selectionRef = doc(db, 'mealSelections', day.date, 'users', currentUser.uid);
        const selectionSnap = await getDoc(selectionRef);
        if (selectionSnap.exists()) {
          const data = selectionSnap.data();
          selectionsData[day.date] = {
            breakfast: Array.isArray(data.breakfast) ? data.breakfast : [],
            lunch: Array.isArray(data.lunch) ? data.lunch : [],
            snacks: Array.isArray(data.snacks) ? data.snacks : [],
            dinner: Array.isArray(data.dinner) ? data.dinner : [],
          };
        }
      }

      setWeeklyMenus(menusData);
      setWeeklySelections(prev => ({ ...prev, ...selectionsData }));
    } catch (error) {
      console.error('Error loading weekly data:', error);
      showMessage('error', 'Failed to load weekly data');
    }
  };

  // Merge staples + that day's special menu items for a given meal, deduplicated.
  const getAvailableItems = (dateStr, mealType) => {
    const dayMenuItems = weeklyMenus[dateStr]?.[mealType] || [];
    const combined = [...staples[mealType], ...dayMenuItems];
    return [...new Set(combined)]; // dedupe in case admin added "Tea" both as staple and special
  };

  const isEditAllowed = (dateStr) => {
    const mealDate = new Date(dateStr + 'T00:00:00');
    const now = new Date();
    const cutoff = new Date(mealDate);
    cutoff.setDate(mealDate.getDate() - 1);
    cutoff.setHours(12, 30, 0, 0);
    return now <= cutoff;
  };

  const handleItemToggle = (dateStr, mealType, itemName) => {
    const currentItems = weeklySelections[dateStr]?.[mealType] || [];
    const alreadySelected = currentItems.includes(itemName);
    const editAllowed = isEditAllowed(dateStr);

    // Block adding new items after the deadline, but still allow removing.
    if (!editAllowed && !alreadySelected) {
      const mealDate = new Date(dateStr + 'T00:00:00');
      const cutoff = new Date(mealDate);
      cutoff.setDate(mealDate.getDate() - 1);
      showMessage('error', `Deadline passed! You can only add items before 12:30 PM on ${cutoff.toLocaleDateString()}`);
      return;
    }

    setWeeklySelections(prev => {
      const dayData = prev[dateStr] || { ...EMPTY_DAY_SELECTION };
      const items = dayData[mealType] || [];
      const updatedItems = alreadySelected
        ? items.filter(i => i !== itemName)
        : [...items, itemName];

      return {
        ...prev,
        [dateStr]: {
          ...dayData,
          [mealType]: updatedItems,
        },
      };
    });
  };

  const handleSaveWeekly = async () => {
    try {
      setSaving(true);
      showMessage('info', 'Saving weekly selections...');

      let savedCount = 0;
      for (const day of weekDays) {
        const dateStr = day.date;
        const selections = weeklySelections[dateStr];

        if (selections) {
          const selectionRef = doc(db, 'mealSelections', dateStr, 'users', currentUser.uid);
          await setDoc(selectionRef, {
            ...selections,
            date: dateStr,
            userId: currentUser.uid,
            userEmail: currentUser.email,
            timestamp: new Date().toISOString()
          });
          savedCount++;
        }
      }

      showMessage('success', `✓ Saved selections for ${savedCount} days!`);
    } catch (error) {
      console.error('Error saving weekly selections:', error);
      showMessage('error', 'Failed to save selections');
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
    return MEAL_TYPES.reduce((sum, m) => sum + (selections[m.key]?.length || 0), 0);
  };

  const getTotalSelectedItems = () => {
    let total = 0;
    Object.values(weeklySelections).forEach(daySelections => {
      MEAL_TYPES.forEach(m => {
        total += daySelections[m.key]?.length || 0;
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
     <div className="weekly-header">
  <div className="weekly-header-top">
    <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <Calendar size={22} style={{ color: 'var(--accent-primary)' }} />
      Weekly Meal Selection
    </h2>
    <button className="history-btn" onClick={fetchHistory}>
      <History size={16} /> History
    </button>
  </div>
  <p className="subtitle">Pick exactly what you want for the next 7 days</p>
        <div className="deadline-notice" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <Clock size={14} style={{ color: 'var(--accent-primary)' }} />
          <span><strong>Important:</strong> You can add items until 12:30 PM of the previous day. Removing items is always allowed.</span>
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
                  {getSelectedCountForDay(day.date)} items
                </div>
              </div>

              {!editAllowed && (
                <div className="deadline-locked-badge">Deadline passed — remove only</div>
              )}

              <div className="day-meals-groups">
                {MEAL_TYPES.map(({ key, label, icon: Icon }) => {
                  const availableItems = getAvailableItems(day.date, key);
                  const selectedItems = weeklySelections[day.date]?.[key] || [];

                  if (availableItems.length === 0) return null;

                  return (
                    <div className="meal-group" key={key}>
                      <div className="meal-group-header">
                        <Icon size={14} style={{ color: 'var(--accent-primary)' }} />
                        <span>{label}</span>
                        <span className="meal-group-time">{mealTimings[key].start}</span>
                      </div>
                      <div className="item-chip-row">
                        {availableItems.map(item => {
                          const isSelected = selectedItems.includes(item);
                          return (
                            <button
                              key={item}
                              type="button"
                              className={`item-chip ${isSelected ? 'selected' : ''}`}
                              onClick={() => handleItemToggle(day.date, key, item)}
                            >
                              {isSelected && <Check size={12} />}
                              {item}
                            </button>
                          );
                        })}
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
            <span className="stat-label">Total Items Selected</span>
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
          disabled={saving || getTotalSelectedItems() === 0}
        >
          {saving ? 'Saving...' : 'Save Weekly Selections'}
        </button>
      </div>
      {showHistory && (
        <div className="history-modal-overlay" onClick={() => setShowHistory(false)}>
          <div className="history-modal" onClick={(e) => e.stopPropagation()}>
            <div className="history-modal-header">
              <h3>Your Meal History (Last 14 Days)</h3>
              <button className="history-close-btn" onClick={() => setShowHistory(false)}>×</button>
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
                      {MEAL_TYPES.map(({ key, label }) => (
                        day[key].length > 0 && (
                          <div key={key} className="history-meal-row">
                            <span className="history-meal-label">{label}:</span>
                            <span className="history-meal-items">{day[key].join(', ')}</span>
                          </div>
                        )
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