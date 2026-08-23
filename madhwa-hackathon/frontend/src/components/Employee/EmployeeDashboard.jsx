// src/components/Employee/EmployeeDashboard.jsx
import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { getLocalDateString } from '../../utils/dateUtils';
import { 
  Lock, Clock, Building2, Bell, Calendar, Coffee, Soup, Cookie, ChefHat, 
  Info, CheckCircle2, AlertTriangle, Utensils, Check, ClipboardCheck, ClipboardList
} from 'lucide-react';
import notificationService from '../../utils/notificationService';
import WorkingModeSelector from './WorkingModeSelector';
import WorkingFromHome from './WorkingFromHome';
import WeeklyMealSelector from './WeeklyMealSelector';
import './EmployeeDashboard.css';

const MEAL_TYPES = [
  { key: 'breakfast', label: 'Breakfast', icon: Coffee },
  { key: 'lunch', label: 'Lunch', icon: Soup },
  { key: 'snacks', label: 'Snacks', icon: Cookie },
  { key: 'dinner', label: 'Dinner', icon: ChefHat },
];

const EMPTY_SELECTIONS = { breakfast: [], lunch: [], snacks: [], dinner: [] };

const EmployeeDashboard = () => {
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  const [menu, setMenu] = useState(null);
  const [staples, setStaples] = useState(EMPTY_SELECTIONS);
  const [selections, setSelections] = useState(EMPTY_SELECTIONS);
  const [savedSelections, setSavedSelections] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deadlinePassed, setDeadlinePassed] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [currentTime, setCurrentTime] = useState(new Date());
  const [deadlineHour, setDeadlineHour] = useState(21);
  const [deadlineMinute, setDeadlineMinute] = useState(0);
  const [notificationPermission, setNotificationPermission] = useState('default');
  const [showNotificationBanner, setShowNotificationBanner] = useState(false);
  const [reminderScheduled, setReminderScheduled] = useState(false);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [workingMode, setWorkingMode] = useState(null); // 'office' or 'home'
  const [showModeSelector, setShowModeSelector] = useState(false);
  const [showDeadlineWarning, setShowDeadlineWarning] = useState(false);
  const [warningShown, setWarningShown] = useState(false);
  const [viewMode, setViewMode] = useState('daily'); // 'daily' or 'weekly'
  const [showDefaultMenu, setShowDefaultMenu] = useState(true); // Toggle for default menu items

  useEffect(() => {
    fetchDeadlineSettings();
    fetchTomorrowMenu();
    loadStaples();
    loadUserSelections();
    loadWorkingMode();
    initializeNotifications();
  }, []);

  useEffect(() => {
    checkDeadline();

    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);
      checkDeadline();

      if (now.getHours() === 0 && now.getMinutes() === 0) {
        console.log('Midnight detected - refreshing menu for new day');
        fetchTomorrowMenu();
        loadUserSelections();
        loadWorkingMode();
      }
    }, 60000);

    return () => clearInterval(timer);
  }, [deadlineHour, deadlineMinute]);

  const getTomorrowDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = getLocalDateString(tomorrow);
    console.log('Tomorrow date:', dateStr); // Debug log
    return dateStr;
  };

  const formatDate = (dateStr) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const fetchDeadlineSettings = async () => {
    try {
      const settingsRef = doc(db, 'settings', 'deadline');
      const settingsSnap = await getDoc(settingsRef);
      if (settingsSnap.exists()) {
        const data = settingsSnap.data();
        setDeadlineHour(data.deadlineHour || 21);
        setDeadlineMinute(data.deadlineMinute || 0);
      }
    } catch (error) {
      console.error('Error fetching deadline settings:', error);
    }
  };

  const checkDeadline = () => {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const currentMinutes = hours * 60 + minutes;
    const deadlineMinutes = deadlineHour * 60 + deadlineMinute;

    setDeadlinePassed(currentMinutes >= deadlineMinutes);

    const tenMinutesBeforeDeadline = deadlineMinutes - 10;
    if (currentMinutes >= tenMinutesBeforeDeadline && currentMinutes < deadlineMinutes && !warningShown && !deadlinePassed) {
      setShowDeadlineWarning(true);
      setWarningShown(true);
    }
  };

  const getTimeUntilDeadline = () => {
    const now = new Date();
    const deadline = new Date();
    deadline.setHours(deadlineHour, deadlineMinute, 0, 0);

    if (now > deadline) {
      return t('dashboard.deadlinePassed');
    }

    const diff = deadline - now;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    return t('dashboard.remaining', { hours, minutes });
  };

  const fetchTomorrowMenu = async () => {
    try {
      const tomorrow = getTomorrowDate();
     const today = getLocalDateString();
      
      // First try to get tomorrow's menu
      const menuRef = doc(db, 'menus', tomorrow);
      const menuSnap = await getDoc(menuRef);

      if (menuSnap.exists()) {
        const menuData = menuSnap.data();
        if (menuData.date === tomorrow) {
          setMenu(menuData);
          setLoading(false);
          return;
        }
      }

      const todayMenuRef = doc(db, 'menus', today);
      const todayMenuSnap = await getDoc(todayMenuRef);
      if (todayMenuSnap.exists() && todayMenuSnap.data().date === today) {
        console.log('Found today\'s menu but not tomorrow\'s');
      }

      setMenu(null);
      showMessage('info', 'No menu available for tomorrow yet. Please check back later.');
    } catch (error) {
      console.error('Error fetching menu:', error);
      showMessage('error', 'Failed to load menu. Please try again later.');
    } finally {
      setLoading(false);
    }
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

  // Normalize menu/staple items while preserving quantity and availability.
  // Selections remain item names for compatibility with mealSelections.
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

  const getAvailableItems = (mealType) => {
    const rawMenuItems = menu?.[mealType] || [];
    const rawStaplesItems = showDefaultMenu ? (staples[mealType] || []) : [];
    const combined = [
      ...rawStaplesItems.map(normalizeMenuItem),
      ...rawMenuItems.map(normalizeMenuItem)
    ].filter(item => item.name && item.available);

    const uniqueItems = [];
    const seen = new Set();
    combined.forEach(item => {
      const key = item.name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        uniqueItems.push(item);
      }
    });
    return uniqueItems;
  };

  const loadUserSelections = async () => {
    try {
      const tomorrow = getTomorrowDate();
      const selectionRef = doc(db, 'mealSelections', tomorrow, 'users', currentUser.uid);
      const selectionSnap = await getDoc(selectionRef);

      if (selectionSnap.exists()) {
        const data = selectionSnap.data();
        if (data.date === tomorrow) {
          const loaded = {
            breakfast: Array.isArray(data.breakfast) ? data.breakfast : [],
            lunch: Array.isArray(data.lunch) ? data.lunch : [],
            snacks: Array.isArray(data.snacks) ? data.snacks : [],
            dinner: Array.isArray(data.dinner) ? data.dinner : [],
          };
          setSelections(loaded);
          setSavedSelections(loaded);
        } else {
          resetSelections();
        }
      } else {
        resetSelections();
      }
    } catch (error) {
      console.error('Error loading selections:', error);
    }
  };

  const loadWorkingMode = async () => {
    try {
      const tomorrow = getTomorrowDate();
      const modeRef = doc(db, 'workingModes', tomorrow, 'users', currentUser.uid);
      const modeSnap = await getDoc(modeRef);

      if (modeSnap.exists()) {
        setWorkingMode(modeSnap.data().mode);
      } else {
        setShowModeSelector(true);
      }
    } catch (error) {
      console.error('Error loading working mode:', error);
      setShowModeSelector(true);
    }
  };

  const handleModeSelect = async (mode) => {
    try {
      const tomorrow = getTomorrowDate();
      const modeRef = doc(db, 'workingModes', tomorrow, 'users', currentUser.uid);

      await setDoc(modeRef, {
        mode: mode,
        userId: currentUser.uid,
        userEmail: currentUser.email,
        timestamp: new Date().toISOString(),
        date: tomorrow
      });

      setWorkingMode(mode);
      setShowModeSelector(false);

      if (mode === 'office') {
        showMessage('success', 'Working mode set to Office. You can now select your meals.');
      }
    } catch (error) {
      console.error('Error saving working mode:', error);
      showMessage('error', 'Failed to save working mode. Please try again.');
    }
  };

  const handleChangeModeClick = () => {
    if (!deadlinePassed) {
      setShowModeSelector(true);
    }
  };

  // Toggle one specific item within a meal type (item-level selection).
  const handleItemToggle = (mealType, itemName) => {
    const alreadySelected = selections[mealType]?.includes(itemName);

    if (deadlinePassed && !alreadySelected) {
      showMessage('error', t('dashboard.deadlinePassed'));
      return;
    }

    setSelections(prev => {
      const items = prev[mealType] || [];
      const updated = alreadySelected
        ? items.filter(i => i !== itemName)
        : [...items, itemName];
      return { ...prev, [mealType]: updated };
    });
  };

  const formatDeadlineTime = () => {
    const h = parseInt(deadlineHour);
    const m = parseInt(deadlineMinute);
    const period = h >= 12 ? 'PM' : 'AM';
    const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${displayHour}:${m.toString().padStart(2, '0')} ${period}`;
  };

  const initializeNotifications = async () => {
    if (!notificationService.isSupported()) {
      console.log('Notifications not supported in this browser');
      return;
    }

    const currentPermission = Notification.permission;
    setNotificationPermission(currentPermission);

    if (currentPermission === 'default') {
      setShowNotificationBanner(true);
    }

    if (currentPermission === 'granted') {
      scheduleMorningReminder();
    }
  };

  const requestNotificationPermission = async () => {
    const granted = await notificationService.requestPermission();
    setNotificationPermission(Notification.permission);

    if (granted) {
      setShowNotificationBanner(false);
      scheduleMorningReminder();
      showMessage('success', t('notifications.enableReminders'));
    } else {
      showMessage('error', 'Notification permission denied. You can enable it in browser settings.');
    }
  };

  const scheduleMorningReminder = () => {
    if (reminderScheduled) return;

    notificationService.scheduleMorningReminder(() => {
      const hasMenu = menu !== null;
      notificationService.showMorningReminder(hasMenu);
    });

    setReminderScheduled(true);
    console.log('Morning reminder scheduled for 8:00 AM daily');
  };

  const showConfirmationNotification = () => {
    if (notificationPermission === 'granted') {
      notificationService.showConfirmationNotification(selections);
    }
  };

  const handleSubmit = async () => {
    if (deadlinePassed) {
      const deadlineTime = formatDeadlineTime();
      showMessage('error', `Selection deadline has passed (${deadlineTime})`);
      return;
    }

    try {
      setSaving(true);
      const tomorrow = getTomorrowDate();
      const selectionRef = doc(db, 'mealSelections', tomorrow, 'users', currentUser.uid);

      const selectionData = {
        ...selections,
        userId: currentUser.uid,
        email: currentUser.email,
        timestamp: new Date().toISOString(),
        modified: savedSelections !== null
      };

      await setDoc(selectionRef, selectionData);
      setSavedSelections(selections);
      showMessage('success', 'Meal preferences saved successfully!');
      setShowSuccessPopup(true);
      showConfirmationNotification();
    } catch (error) {
      console.error('Error saving selections:', error);
      showMessage('error', 'Failed to save preferences. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 5000);
  };

  const hasChanges = () => {
    if (!savedSelections) return true;
    return MEAL_TYPES.some(({ key }) => {
      const current = [...(selections[key] || [])].sort().join(',');
      const saved = [...(savedSelections[key] || [])].sort().join(',');
      return current !== saved;
    });
  };

  const getSelectedCount = () => {
    return MEAL_TYPES.reduce((sum, { key }) => sum + (selections[key]?.length || 0), 0);
  };

  const resetSelections = () => {
    setSelections({ ...EMPTY_SELECTIONS });
    setSavedSelections({ ...EMPTY_SELECTIONS });
  };

  const mealTimings = {
    breakfast: { start: '8:30 AM', end: '10:00 AM' },
    lunch: { start: '1:00 PM', end: '2:30 PM' },
    snacks: { start: '5:00 PM', end: '6:30 PM' },
    dinner: { start: '8:00 PM', end: '9:30 PM' }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading menu...</p>
      </div>
    );
  }

  if (showModeSelector) {
    return (
      <WorkingModeSelector
        onModeSelect={handleModeSelect}
        currentMode={workingMode}
        canChange={!deadlinePassed}
      />
    );
  }

  if (workingMode === 'home') {
    return (
      <WorkingFromHome
        onChangeMode={handleChangeModeClick}
        canChange={!deadlinePassed}
        deadline={formatDeadlineTime()}
      />
    );
  }

  return (
    <div className="employee-dashboard">
      <div className="dashboard-header">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ClipboardCheck size={28} style={{ color: 'var(--accent-primary)' }} />
            {t('employee.dashboard.title')}
          </h1>
          <p className="subtitle">{t('employee.dashboard.subtitle')}</p>
        </div>
      </div>

      <div className="working-mode-indicator">
        <span className="mode-badge">
          <Building2 size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
          {t('workingMode.office')}
        </span>
        {!deadlinePassed && (
          <button className="btn btn-secondary btn-sm" onClick={handleChangeModeClick}>
            {t('workingMode.changeToOffice').replace('Office', 'Home')}
          </button>
        )}
      </div>

      {showNotificationBanner && (
        <div className="notification-banner">
          <div className="notification-banner-content">
            <div className="notification-icon">
              <Bell size={20} style={{ color: 'var(--accent-primary)' }} />
            </div>
            <div className="notification-text">
              <strong>{t('notifications.enable')}</strong>
              <p>{t('notifications.enableReminders')}</p>
            </div>
            <div className="notification-actions">
              <button className="btn btn-primary btn-sm" onClick={requestNotificationPermission}>
                {t('notifications.enable')}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowNotificationBanner(false)}>
                {t('notifications.maybeLater')}
              </button>
            </div>
          </div>
        </div>
      )}

      {message.text && (
        <div className={`message ${message.type}`}>
          {message.type === 'success' ? (
            <CheckCircle2 size={16} style={{ marginRight: '6px', verticalAlign: 'middle', display: 'inline-block' }} />
          ) : (
            <AlertTriangle size={16} style={{ marginRight: '6px', verticalAlign: 'middle', display: 'inline-block' }} />
          )}{' '}
          {message.text}
        </div>
      )}

      <div className="date-card">
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px'}}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={20} style={{ color: 'var(--accent-primary)' }} />
            {viewMode === 'daily' ? t('dashboard.selectMeals') + ' ' + formatDate(getTomorrowDate()) : 'Weekly Meal Selection'}
          </h3>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div className="default-menu-toggle" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label htmlFor="showDefaultMenu" style={{ fontSize: '13px', fontWeight: '600', color: 'white', cursor: 'pointer' }}>
                Show Default Menu
              </label>
              <input
                id="showDefaultMenu"
                type="checkbox"
                checked={showDefaultMenu}
                onChange={(e) => setShowDefaultMenu(e.target.checked)}
                style={{
                  width: '18px',
                  height: '18px',
                  cursor: 'pointer',
                  accentColor: 'var(--accent-primary)'
                }}
              />
            </div>
            <div className="view-toggle">
              <button
                className={`toggle-btn ${viewMode === 'daily' ? 'active' : ''}`}
                onClick={() => setViewMode('daily')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Calendar size={14} /> Daily
              </button>
              <button
                className={`toggle-btn ${viewMode === 'weekly' ? 'active' : ''}`}
                onClick={() => setViewMode('weekly')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Calendar size={14} /> Weekly
              </button>
            </div>
          </div>
        </div>
      </div>

      {viewMode === 'weekly' ? (
        <WeeklyMealSelector
          showDefaultMenu={showDefaultMenu}
          setShowDefaultMenu={setShowDefaultMenu}
        />
      ) : (
        <>
          {!menu ? (
            <div className="no-menu-card">
              <div className="empty-state">
                <span className="empty-icon">
                  <Utensils size={40} style={{ color: 'var(--text-tertiary)' }} />
                </span>
                <h3>{t('dashboard.noMenu')}</h3>
                <p>{t('dashboard.noMenuText')}</p>
                <p className="small-text">{t('dashboard.contactAdmin')}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="meals-grid">
                {MEAL_TYPES.map(({ key, label, icon: Icon }) => {
                  const availableItems = getAvailableItems(key);
                  const selectedItems = selections[key] || [];

                  return (
                    <div className={`meal-card ${selectedItems.length > 0 ? 'selected' : ''}`} key={key}>
                      <div className="meal-header">
                        <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
                          <div className="meal-icon">
                            <Icon size={20} style={{ color: 'var(--accent-primary)' }} />
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <h3>{t(`dashboard.${key}`) === `dashboard.${key}` ? label : t(`dashboard.${key}`)}</h3>
                            <div className="meal-timing">
                              <Clock size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                              {mealTimings[key].start} - {mealTimings[key].end}
                            </div>
                          </div>
                        </div>
                        <span className="meal-item-count">{selectedItems.length} selected</span>
                      </div>

                      {availableItems.length === 0 ? (
                        <p className="no-items">{t('dashboard.noItems')}</p>
                      ) : (
                        <div className="item-chip-row">
                          {availableItems.map(item => {
                            const isSelected = selectedItems.includes(item.name);
                            const isOutOfStock = item.quantity !== null && item.quantity <= 0;
                            return (
                              <button
                                key={item.name}
                                type="button"
                                className={`item-chip ${isSelected ? 'selected' : ''}`}
                                onClick={() => handleItemToggle(key, item.name)}
                                disabled={isOutOfStock || (deadlinePassed && !isSelected)}
                                title={isOutOfStock ? `${item.name} is out of stock` : item.quantity !== null ? `${item.quantity} available` : item.name}
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

              <div className="summary-section">
                <div className="summary-card">
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ClipboardList size={20} style={{ color: 'var(--accent-primary)' }} />
                    {t('dashboard.summary')}
                  </h3>
                  <div className="summary-stats">
                    <div className="stat">
                      <span className="stat-label">{t('dashboard.mealsSelected')}</span>
                      <span className="stat-value">{getSelectedCount()} items</span>
                    </div>
                    {savedSelections && (
                      <div className="stat">
                        <span className="stat-label">{t('dashboard.status')}</span>
                        <span className={`stat-value ${hasChanges() ? 'warning' : 'success'}`}>
                          {hasChanges() ? t('dashboard.unsavedChanges') : t('dashboard.saved')}
                        </span>
                      </div>
                    )}
                  </div>

                  <button
                    className="btn btn-primary btn-full save-btn"
                    onClick={handleSubmit}
                    disabled={deadlinePassed || saving || !hasChanges()}
                  >
                    {saving ? t('auth.signingIn').replace('Signing', 'Saving') : hasChanges() ? t('dashboard.savePreferences') : t('dashboard.noChanges')}
                  </button>

                  <p className="help-text" style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                    <Info size={14} style={{ color: 'var(--accent-primary)' }} />
                    <span>{t('dashboard.helpText', { time: formatDeadlineTime() })}</span>
                  </p>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {showSuccessPopup && (
        <div className="popup-overlay" onClick={() => setShowSuccessPopup(false)}>
          <div className="popup-modal" onClick={(e) => e.stopPropagation()}>
            <div className="popup-icon">
              <div className="success-checkmark">
                <div className="check-icon">
                  <span className="icon-line line-tip"></span>
                  <span className="icon-line line-long"></span>
                  <div className="icon-circle"></div>
                  <div className="icon-fix"></div>
                </div>
              </div>
            </div>
            <h2 className="popup-title">Success!</h2>
            <p className="popup-message">{t('notifications.saved')}</p>
            <div className="popup-details">
              <div className="selected-meals-summary">
                <h3>{t('dashboard.mealsSelected')}</h3>
                <div className="meals-list">
                  {MEAL_TYPES.map(({ key, label, icon: Icon }) => (
                    selections[key]?.length > 0 && (
                      <div key={key} className="meal-item-popup" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Icon size={16} style={{ color: 'var(--accent-primary)' }} />
                        <span>{label}: {selections[key].join(', ')}</span>
                      </div>
                    )
                  ))}
                  {getSelectedCount() === 0 && (
                    <p className="no-meals-selected">{t('dashboard.noItems')}</p>
                  )}
                </div>
              </div>
              <div className="popup-info">
                <p style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Check size={14} style={{ color: 'var(--success)' }} />
                  {t('dashboard.saved')} {formatDate(getTomorrowDate())}
                </p>
                <p style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Check size={14} style={{ color: 'var(--success)' }} />
                  {t('dashboard.helpText', { time: formatDeadlineTime() })}
                </p>
              </div>
            </div>
            <button className="btn btn-primary popup-close-btn" onClick={() => setShowSuccessPopup(false)}>
              {t('buttons.done')}
            </button>
          </div>
        </div>
      )}

      {showDeadlineWarning && (
        <div className="popup-overlay" onClick={() => setShowDeadlineWarning(false)}>
          <div className="popup-modal warning-popup" onClick={(e) => e.stopPropagation()}>
            <div className="popup-icon">
              <div className="warning-icon" style={{ display: 'flex', justifyContent: 'center' }}>
                <Clock size={48} style={{ color: 'var(--warning)' }} />
              </div>
            </div>
            <h2 className="popup-title warning-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <AlertTriangle size={24} style={{ color: 'var(--warning)' }} />
              Deadline Approaching!
            </h2>
            <p className="popup-message">
              The meal selection window is closing in <strong>10 minutes</strong>!
            </p>
            <div className="popup-details warning-details">
              <p style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Calendar size={14} />
                <span>Deadline: <strong>{formatDeadlineTime()}</strong></span>
              </p>
              <p style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Utensils size={14} />
                <span>Please complete your meal selection before the deadline.</span>
              </p>
              {getSelectedCount() === 0 && (
                <p className="warning-text" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertTriangle size={14} style={{ color: 'var(--warning)' }} />
                  You haven't selected any items yet!
                </p>
              )}
            </div>
            <button className="btn btn-primary popup-close-btn" onClick={() => setShowDeadlineWarning(false)}>
              Got it!
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeDashboard;