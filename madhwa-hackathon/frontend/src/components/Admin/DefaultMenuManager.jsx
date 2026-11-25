// src/components/Admin/DefaultMenuManager.jsx

/**
 * Manages the "Default Menu" — recurring weekday menu templates stored in Firestore.
 *
 * Firestore Document Path:
 *   menus/default (primary), dailyStaples/config (secondary), defaultMenu/config (tertiary)
 *
 * Schema:
 *   - weekdays: { monday, tuesday, wednesday, thursday, friday, saturday }
 *     Each weekday has { breakfast, lunch, snacks, dinner } arrays of { name, available }
 *   - Top-level breakfast/lunch/snacks/dinner fields are preserved for legacy compatibility.
 *   - Sunday is a permanent weekly holiday (Holiday – No Meals).
 */

import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { WEEKDAY_KEYS, WEEKDAY_LABELS, hasAnyMealItems } from '../../utils/dateUtils';
import {
  Coffee,
  Soup,
  Cookie,
  ChefHat,
  Info,
  Check,
  AlertTriangle,
  Save,
  UtensilsCrossed,
  Sparkles,
  CalendarOff,
  X
} from 'lucide-react';
import './DefaultMenuManager.css';

const MEAL_TYPES = [
  {
    key: 'breakfast',
    label: 'Breakfast',
    icon: Coffee,
    placeholder: 'Add default breakfast item...'
  },
  {
    key: 'lunch',
    label: 'Lunch',
    icon: Soup,
    placeholder: 'Add default lunch item...'
  },
  {
    key: 'snacks',
    label: 'Snacks',
    icon: Cookie,
    placeholder: 'Add default snacks item...'
  },
  {
    key: 'dinner',
    label: 'Dinner',
    icon: ChefHat,
    placeholder: 'Add default dinner item...'
  }
];

const createEmptyMenu = () => ({
  breakfast: [],
  lunch: [],
  snacks: [],
  dinner: []
});

const createEmptyWeekdays = () =>
  WEEKDAY_KEYS.reduce((acc, day) => {
    acc[day] = createEmptyMenu();
    return acc;
  }, {});

const normalizeMenuItem = (item) => {
  if (typeof item === 'string') {
    return {
      name: item,
      available: true
    };
  }

  return {
    name: item?.name || '',
    available: item?.available !== false
  };
};

const normalizeMealGroup = (menuObj) => ({
  breakfast: (menuObj?.breakfast || []).map(normalizeMenuItem),
  lunch: (menuObj?.lunch || []).map(normalizeMenuItem),
  snacks: (menuObj?.snacks || []).map(normalizeMenuItem),
  dinner: (menuObj?.dinner || []).map(normalizeMenuItem)
});

const DefaultMenuManager = () => {
  const [selectedDay, setSelectedDay] = useState('monday');
  const [weeklyMenus, setWeeklyMenus] = useState(createEmptyWeekdays);
  const [configuredDays, setConfiguredDays] = useState(() => new Set());
  const [legacyMenu, setLegacyMenu] = useState(createEmptyMenu);
  const [currentItem, setCurrentItem] = useState({
    breakfast: '',
    lunch: '',
    snacks: '',
    dinner: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    loadDefaultMenu();
  }, []);

  const loadDefaultMenu = async () => {
    try {
      setLoading(true);
      let ref = doc(db, 'menus', 'default');
      let snap = await getDoc(ref);

      if (!snap.exists()) {
        ref = doc(db, 'defaultMenu', 'config');
        snap = await getDoc(ref);
      }

      if (!snap.exists()) {
        ref = doc(db, 'dailyStaples', 'config');
        snap = await getDoc(ref);
      }

      if (snap.exists()) {
        const data = snap.data();
        const normalizedLegacy = normalizeMealGroup(data);
        setLegacyMenu(normalizedLegacy);

        const nextWeekdays = createEmptyWeekdays();
        const nextConfigured = new Set();

        WEEKDAY_KEYS.forEach((day) => {
          if (data.weekdays?.[day] && typeof data.weekdays[day] === 'object') {
            nextWeekdays[day] = normalizeMealGroup(data.weekdays[day]);
            nextConfigured.add(day);
          }
        });

        setWeeklyMenus(nextWeekdays);
        setConfiguredDays(nextConfigured);
      } else {
        setLegacyMenu(createEmptyMenu());
        setWeeklyMenus(createEmptyWeekdays());
        setConfiguredDays(new Set());
      }
    } catch (error) {
      console.error('Error loading default menu:', error);
      showMessage('error', 'Failed to load Default Menu from Firestore');
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 4000);
  };

  const activeMenu = weeklyMenus[selectedDay] || createEmptyMenu();

  const updateSelectedDayMenu = (updater) => {
    setWeeklyMenus((prev) => ({
      ...prev,
      [selectedDay]: updater(prev[selectedDay] || createEmptyMenu())
    }));
    setConfiguredDays((prev) => {
      const next = new Set(prev);
      next.add(selectedDay);
      return next;
    });
  };

  const handleDayChange = (dayKey) => {
    setSelectedDay(dayKey);
    setCurrentItem({ breakfast: '', lunch: '', snacks: '', dinner: '' });
  };

  const handleApplyLegacyToDay = () => {
    if (!hasAnyMealItems(legacyMenu)) return;
    updateSelectedDayMenu(() => normalizeMealGroup(legacyMenu));
    showMessage('info', `Copied legacy default menu into ${WEEKDAY_LABELS[selectedDay]}. Click Save to persist.`);
  };

  const handleAddItem = (mealType) => {
    const itemName = currentItem[mealType].trim();

    if (!itemName) {
      showMessage('error', 'Please enter an item name');
      return;
    }

    const alreadyExists = activeMenu[mealType].some(
      (existing) => existing.name.toLowerCase() === itemName.toLowerCase()
    );

    if (alreadyExists) {
      showMessage('error', `This item is already in ${WEEKDAY_LABELS[selectedDay]}'s menu`);
      return;
    }

    updateSelectedDayMenu((dayMenu) => ({
      ...dayMenu,
      [mealType]: [
        ...dayMenu[mealType],
        {
          name: itemName,
          available: true
        }
      ]
    }));

    setCurrentItem((prev) => ({
      ...prev,
      [mealType]: ''
    }));
  };

  const handleRemoveItem = (mealType, index) => {
    updateSelectedDayMenu((dayMenu) => ({
      ...dayMenu,
      [mealType]: dayMenu[mealType].filter((_, i) => i !== index)
    }));
  };

  const handleAvailabilityChange = (mealType, index) => {
    updateSelectedDayMenu((dayMenu) => ({
      ...dayMenu,
      [mealType]: dayMenu[mealType].map((item, i) =>
        i === index ? { ...item, available: !item.available } : item
      )
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      const weekdaysPayload = {};
      WEEKDAY_KEYS.forEach((day) => {
        if (configuredDays.has(day) || hasAnyMealItems(weeklyMenus[day])) {
          weekdaysPayload[day] = normalizeMealGroup(weeklyMenus[day]);
        }
      });

      // Preserve legacy top-level fields if they exist, or seed from Monday if empty
      const topLevelSource = hasAnyMealItems(legacyMenu)
        ? legacyMenu
        : weekdaysPayload.monday || createEmptyMenu();

      const payload = {
        breakfast: topLevelSource.breakfast.map(normalizeMenuItem),
        lunch: topLevelSource.lunch.map(normalizeMenuItem),
        snacks: topLevelSource.snacks.map(normalizeMenuItem),
        dinner: topLevelSource.dinner.map(normalizeMenuItem),
        weekdays: weekdaysPayload,
        updatedAt: new Date().toISOString()
      };

      // 1. Primary write to menus/default (allowed under /menus/{date} rules)
      await setDoc(doc(db, 'menus', 'default'), payload);

      // 2. Secondary write to dailyStaples/config (allowed under /dailyStaples/{documentId} rules)
      try {
        await setDoc(doc(db, 'dailyStaples', 'config'), payload);
      } catch (e) {
        console.warn('dailyStaples update warning:', e);
      }

      // 3. Optional write to defaultMenu/config
      try {
        await setDoc(doc(db, 'defaultMenu', 'config'), payload);
      } catch (e) {
        console.warn('defaultMenu update warning (rule may be un-deployed on console):', e);
      }

      showMessage('success', 'Weekly Default Menus saved successfully to Cloud Firestore!');
    } catch (error) {
      console.error('Error saving default menu:', error);
      showMessage('error', `Failed to save Default Menu: ${error.message || 'Permission denied'}`);
    } finally {
      setSaving(false);
    }
  };

  const getDayTotalItems = (dayKey) => {
    const dayMenu = weeklyMenus[dayKey] || createEmptyMenu();
    return (
      dayMenu.breakfast.length +
      dayMenu.lunch.length +
      dayMenu.snacks.length +
      dayMenu.dinner.length
    );
  };

  const isUsingLegacyFallback =
    !configuredDays.has(selectedDay) &&
    getDayTotalItems(selectedDay) === 0 &&
    hasAnyMealItems(legacyMenu);

  if (loading) {
    return (
      <div className="default-menu-manager loading">
        <div className="spinner"></div>
        <p>Loading Default Menu from Firestore...</p>
      </div>
    );
  }

  return (
    <div className="default-menu-manager">
      <div className="manager-header">
        <div className="header-info">
          <h2>
            <UtensilsCrossed size={22} style={{ color: 'var(--accent-primary)', verticalAlign: 'middle', marginRight: '8px' }} />
            Weekly Default Menu Management
          </h2>
          <p className="subtitle">
            Configure recurring menus for Monday–Saturday. Each weekday repeats automatically throughout the year.
          </p>
        </div>

        <button
          className="btn btn-primary save-btn"
          onClick={handleSave}
          disabled={saving}
        >
          <Save size={16} style={{ marginRight: '6px' }} />
          {saving ? 'Saving...' : 'Save Weekly Menus'}
        </button>
      </div>

      {message.text && (
        <div className={`message ${message.type}`}>
          {message.type === 'success' && <Check size={16} style={{ marginRight: '6px' }} />}
          {message.type === 'error' && <AlertTriangle size={16} style={{ marginRight: '6px' }} />}
          {message.type === 'info' && <Info size={16} style={{ marginRight: '6px' }} />}
          {message.text}
        </div>
      )}

      {/* Weekday Tabs (Monday - Saturday) + Sunday Holiday Indicator */}
      <div className="weekday-tabs-bar" role="tablist" aria-label="Weekday Default Menus">
        {WEEKDAY_KEYS.map((dayKey) => {
          const count = getDayTotalItems(dayKey);
          const isActive = selectedDay === dayKey;
          return (
            <button
              key={dayKey}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`weekday-tab-btn ${isActive ? 'active' : ''}`}
              onClick={() => handleDayChange(dayKey)}
            >
              <span className="weekday-tab-label">{WEEKDAY_LABELS[dayKey]}</span>
              <span className="weekday-tab-count">{count}</span>
            </button>
          );
        })}

        <div
          className="weekday-sunday-pill"
          title="Sunday is a permanent weekly holiday — no menu and no meal booking"
        >
          <CalendarOff size={14} />
          <span>Sunday: Holiday – No Meals</span>
        </div>
      </div>

      <div className="stats-summary">
        <div className="stat-pill">
          <Sparkles size={14} style={{ color: 'var(--accent-primary)' }} />
          <span>
            {WEEKDAY_LABELS[selectedDay]} Items: <strong>{getDayTotalItems(selectedDay)}</strong>
          </span>
        </div>

        {isUsingLegacyFallback && (
          <div className="stat-pill legacy-fallback-pill">
            <Info size={14} style={{ color: 'var(--accent-primary)' }} />
            <span>Currently falling back to legacy generic default menu.</span>
            <button
              type="button"
              className="btn-copy-legacy"
              onClick={handleApplyLegacyToDay}
            >
              Copy Legacy to {WEEKDAY_LABELS[selectedDay]}
            </button>
          </div>
        )}
      </div>

      <div className="meals-grid">
        {MEAL_TYPES.map(({ key, label, icon: Icon, placeholder }) => (
          <div key={key} className="meal-card">
            <div className="meal-card-header">
              <div className="header-title">
                <Icon size={18} style={{ color: 'var(--accent-primary)', marginRight: '8px' }} />
                <h3>{label}</h3>
              </div>
              <span className="count-badge">{activeMenu[key].length} items</span>
            </div>

            <div className="add-item-form">
              <input
                type="text"
                placeholder={`${placeholder} (${WEEKDAY_LABELS[selectedDay]})`}
                value={currentItem[key]}
                onChange={(e) =>
                  setCurrentItem((prev) => ({ ...prev, [key]: e.target.value }))
                }
                onKeyPress={(e) => e.key === 'Enter' && handleAddItem(key)}
              />
              <button
                className="btn btn-primary add-btn"
                onClick={() => handleAddItem(key)}
              >
                Add
              </button>
            </div>

            <div className="items-list">
              {activeMenu[key].length === 0 ? (
                <p className="empty-text">
                  No items configured for {WEEKDAY_LABELS[selectedDay]} {label}
                </p>
              ) : (
                activeMenu[key].map((item, index) => (
                  <div key={index} className="item-row">
                    <span className="item-name" title={item.name}>{item.name}</span>

                    <div className="item-controls">
                      <label className="availability-toggle">
                        <input
                          type="checkbox"
                          checked={item.available}
                          onChange={() => handleAvailabilityChange(key, index)}
                        />
                        <span className="toggle-label">
                          {item.available ? 'Available' : 'Unavailable'}
                        </span>
                      </label>

                      <button
                        className="btn-remove"
                        onClick={() => handleRemoveItem(key, index)}
                        title="Remove item"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DefaultMenuManager;
