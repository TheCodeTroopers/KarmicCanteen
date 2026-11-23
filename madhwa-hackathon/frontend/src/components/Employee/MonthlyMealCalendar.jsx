// src/components/Employee/MonthlyMealCalendar.jsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  collection, 
  doc, 
  onSnapshot 
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { getDocWithCache, docCacheKey } from '../../utils/indexedDbCache';
import { getLocalDateString } from '../../utils/dateUtils';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  CalendarDays, 
  CheckCircle2, 
  Clock, 
  Info,
  Sparkles,
  ArrowRight,
  Utensils,
  ClipboardCheck,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  XCircle,
  Check,
  Layers
} from 'lucide-react';
import MonthlyDateDetailPanel from './MonthlyDateDetailPanel';
import './MonthlyMealCalendar.css';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEKDAY_HEADERS = [
  { short: 'Sun', letter: 'Su', name: 'Sunday', isWeekend: true },
  { short: 'Mon', letter: 'Mo', name: 'Monday', isWeekend: false },
  { short: 'Tue', letter: 'Tu', name: 'Tuesday', isWeekend: false },
  { short: 'Wed', letter: 'We', name: 'Wednesday', isWeekend: false },
  { short: 'Thu', letter: 'Th', name: 'Thursday', isWeekend: false },
  { short: 'Fri', letter: 'Fr', name: 'Friday', isWeekend: false },
  { short: 'Sat', letter: 'Sa', name: 'Saturday', isWeekend: true }
];

const MEAL_CATEGORIES = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'snacks', label: 'Snacks' },
  { key: 'dinner', label: 'Dinner' }
];

/**
 * Check if a given year is a leap year.
 */
const isLeapYear = (year) => {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
};

/**
 * Helper to determine if a date's booking deadline has passed.
 */
const isBookingDeadlinePassed = (dateStr, deadlineHour = 21, deadlineMinute = 0) => {
  const today = new Date();
  const todayStr = getLocalDateString(today);

  if (dateStr < todayStr) return true;
  if (dateStr === todayStr) return true;

  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowStr = getLocalDateString(tomorrow);

  if (dateStr === tomorrowStr) {
    const currentMinutes = today.getHours() * 60 + today.getMinutes();
    const deadlineMinutes = deadlineHour * 60 + deadlineMinute;
    return currentMinutes >= deadlineMinutes;
  }

  return false;
};

/**
 * MonthlyMealCalendar Component - Phase 4 (Complete)
 * Features:
 * - 12 Months full simultaneous display with Sunday-Saturday alignment and leap year support
 * - Year navigation and Today jump button
 * - Real-time Firestore connection (menus, deadline, employee bookings)
 * - Green (menu), Blue (booked), Orange (deadline passed) indicators
 * - 3 Monthly Statistic cards (Meals Booked, Published Menus, Upcoming Menus)
 * - Upcoming Meals section showing the next few dates with published menus & booking status
 * - Clicking any upcoming meal or date opens the responsive details panel
 * - Past dates show historical booking records and prevent prohibited modifications
 * - Responsive layout: Desktop (4-col calendar, 3-col upcoming, right drawer),
 *   Tablet (2-col calendar, 2-col upcoming), Mobile (1-col calendar, bottom sheet drawer)
 */
const MonthlyMealCalendar = ({ 
  selectedDate: initialSelectedDate, 
  onSelectDate, 
  onSwitchToDaily,
  refreshTrigger = 0
}) => {
  const { currentUser } = useAuth();
  const todayStr = getLocalDateString(new Date());
  const todayDate = useMemo(() => new Date(), []);

  const [currentYear, setCurrentYear] = useState(() => {
    if (initialSelectedDate) {
      const parsedYear = parseInt(initialSelectedDate.split('-')[0], 10);
      if (!isNaN(parsedYear)) return parsedYear;
    }
    return new Date().getFullYear();
  });

  const [selectedDate, setSelectedDate] = useState(() => {
    return initialSelectedDate || todayStr;
  });

  // Keep selectedDate in sync if parent passes a new initialSelectedDate
  useEffect(() => {
    if (initialSelectedDate && initialSelectedDate !== selectedDate) {
      setSelectedDate(initialSelectedDate);
    }
  }, [initialSelectedDate]);

  // Firestore Real-Time Data States
  const [menusMap, setMenusMap] = useState({});
  const [bookingsMap, setBookingsMap] = useState({});
  const [deadlineHour, setDeadlineHour] = useState(21);
  const [deadlineMinute, setDeadlineMinute] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [offline, setOffline] = useState(false);
  const [isDetailPanelOpen, setIsDetailPanelOpen] = useState(false);
  // State for default menu handling and selected menu
  const [defaultMenu, setDefaultMenu] = useState(null);
  const [selectedMenuData, setSelectedMenuData] = useState(null);
  const [isDefaultMenu, setIsDefaultMenu] = useState(false);

  // In-flight read tracking to optimize Firestore reads and eliminate duplicate requests
  const loadingBookingsRef = useRef(false);

  // Selected month index (0 to 11) derived from selectedDate
  const selectedMonthIndex = useMemo(() => {
    if (!selectedDate) return todayDate.getMonth();
    const parts = selectedDate.split('-');
    const m = parseInt(parts[1], 10) - 1;
    return isNaN(m) ? todayDate.getMonth() : m;
  }, [selectedDate, todayDate]);

  const selectedMonthName = MONTH_NAMES[selectedMonthIndex];

  // 1. Real-time Firestore Listener for Menus collection
  useEffect(() => {
    // Listen to date‑specific menus (skip the generic "default" doc)
    setLoading(true);
    const menusRef = collection(db, 'menus');

    const unsubscribe = onSnapshot(
      menusRef,
      { includeMetadataChanges: true },
      (snapshot) => {
        const nextMenus = {};
        setOffline(snapshot.metadata.fromCache);

        snapshot.forEach((docSnap) => {
          const docId = docSnap.id;
          if (docId === 'default') return; // ignore generic default doc – we load it separately below

          const data = docSnap.data();
          const hasItems = ['breakfast', 'lunch', 'snacks', 'dinner'].some((meal) => {
            const val = data[meal];
            if (Array.isArray(val)) return val.length > 0;
            if (val && typeof val === 'object') return Object.keys(val).length > 0;
            return Boolean(val);
          });

          if (hasItems || docSnap.exists()) {
            nextMenus[docId] = {
              id: docId,
              date: data.date || docId,
              breakfast: data.breakfast || [],
              lunch: data.lunch || [],
              snacks: data.snacks || [],
              dinner: data.dinner || [],
              fromCache: snapshot.metadata.fromCache
            };
          }
        });

        setMenusMap(nextMenus);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('[MonthlyMealCalendar] Error listening to menus:', err);
        setError('Failed to sync menus from Firestore. Showing cached data if available.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);



  // 2. Load the **default weekday** menu (priority: defaultMenu/config → menus/default → dailyStaples/config)
  // Added diagnostic logging
  console.log('[MonthlyMealCalendar] Starting default menu load');
  useEffect(() => {
    const loadDefaultMenu = async () => {
      try {
        // 1) defaultMenu/config
        let ref = doc(db, 'defaultMenu', 'config');
        let { data, exists, fromCache } = await getDocWithCache(
          ref,
          docCacheKey('defaultMenu', 'config')
        );
        console.log('[MonthlyMealCalendar] load defaultMenu/config', { exists, fromCache, data });
        // 2) fallback to menus/default if not found or empty data
        if (!exists || !(data?.breakfast?.length || data?.lunch?.length || data?.snacks?.length || data?.dinner?.length)) {
          ref = doc(db, 'menus', 'default');
          ({ data, exists, fromCache } = await getDocWithCache(
            ref,
            docCacheKey('menus', 'default')
          ));
          console.log('[MonthlyMealCalendar] fallback fetch menus/default', { exists, fromCache, data });
        }
        // 3) final fallback to dailyStaples/config
        if (!exists || !(data?.breakfast?.length || data?.lunch?.length || data?.snacks?.length || data?.dinner?.length)) {
          ref = doc(db, 'dailyStaples', 'config');
          ({ data, exists, fromCache } = await getDocWithCache(
            ref,
            docCacheKey('dailyStaples', 'config')
          ));
          console.log('[MonthlyMealCalendar] final fallback fetch dailyStaples/config', { exists, fromCache, data });
        }
        if (fromCache) setOffline(true);
        if (exists && data) {
          const normalized = {
            breakfast: data.breakfast || [],
            lunch: data.lunch || [],
            snacks: data.snacks || [],
            dinner: data.dinner || []
          };
          console.log('[MonthlyMealCalendar] setting defaultMenu state', normalized);
          setDefaultMenu(normalized);
        } else {
          console.log('[MonthlyMealCalendar] No default menu document found');
        }
      } catch (e) {
        console.error('[MonthlyMealCalendar] Error loading default menu:', e);
      }
    };
    loadDefaultMenu();
  }, []);



  // 3. When a date is clicked, decide which menu to show (date‑specific or default)
  const handleDateClick = (dateStr) => {
    if (!dateStr) return;
    const specific = menusMap[dateStr];
    const fallback = defaultMenu || null;
    const menuToShow = specific || fallback;
    console.log('[MonthlyMealCalendar] handleDateClick', { dateStr, specificExists: !!specific, usingDefault: !specific && !!fallback });
    setSelectedMenuData(menuToShow);
    setIsDefaultMenu(!specific && !!fallback);
    setSelectedDate(dateStr);
    const [y] = dateStr.split('-').map(Number);
    if (y && !isNaN(y) && y !== currentYear) {
      setCurrentYear(y);
    }
    if (onSelectDate) onSelectDate(dateStr);
    setIsDetailPanelOpen(true);
  };

  // 4. Also handle upcoming‑meal clicks the same way
  const handleUpcomingMealClick = (dateStr) => {
    if (!dateStr) return;
    const specific = menusMap[dateStr];
    const fallback = defaultMenu || null;
    const menuToShow = specific || fallback;
    console.log('[MonthlyMealCalendar] handleUpcomingMealClick', { dateStr, specificExists: !!specific, usingDefault: !specific && !!fallback });
    setSelectedMenuData(menuToShow);
    setIsDefaultMenu(!specific && !!fallback);
    setSelectedDate(dateStr);
    const [y] = dateStr.split('-').map(Number);
    if (y && !isNaN(y) && y !== currentYear) {
      setCurrentYear(y);
    }
    if (onSelectDate) onSelectDate(dateStr);
    setIsDetailPanelOpen(true);
  };

  // Duplicate default menu loader removed

  // 2. Real-time Firestore Listener for Deadline settings
  useEffect(() => {
    const settingsRef = doc(db, 'settings', 'deadline');

    const unsubscribe = onSnapshot(
      settingsRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setDeadlineHour(data.deadlineHour ?? 21);
          setDeadlineMinute(data.deadlineMinute ?? 0);
        }
      },
      (err) => {
        console.warn('[MonthlyMealCalendar] Error listening to deadline settings:', err);
      }
    );

    return () => unsubscribe();
  }, []);



  // 3. Fetch employee bookings (optimized read with IndexedDB cache)
  const loadEmployeeBookings = useCallback(async () => {
    if (!currentUser?.uid || loadingBookingsRef.current) return;

    loadingBookingsRef.current = true;
    try {
      const datesToScan = new Set();

      // All days of the selected month in currentYear
      const daysInMonth = new Date(currentYear, selectedMonthIndex + 1, 0).getDate();
      for (let day = 1; day <= daysInMonth; day++) {
        const mStr = String(selectedMonthIndex + 1).padStart(2, '0');
        const dStr = String(day).padStart(2, '0');
        datesToScan.add(`${currentYear}-${mStr}-${dStr}`);
      }

      // Dates in menusMap for currentYear
      Object.keys(menusMap).forEach((dateKey) => {
        if (dateKey.startsWith(String(currentYear))) {
          datesToScan.add(dateKey);
        }
      });

      // Recent window around today (past 14 days, upcoming 14 days)
      for (let i = -14; i <= 14; i++) {
        const d = new Date(todayDate);
        d.setDate(todayDate.getDate() + i);
        const dateStr = getLocalDateString(d);
        if (dateStr.startsWith(String(currentYear))) {
          datesToScan.add(dateStr);
        }
      }

      const results = {};
      const promises = Array.from(datesToScan).map(async (dateStr) => {
        try {
          const selectionRef = doc(db, 'mealSelections', dateStr, 'users', currentUser.uid);
          const cacheKey = docCacheKey('mealSelections', dateStr, 'users', currentUser.uid);
          const res = await getDocWithCache(selectionRef, cacheKey);

          if (res.fromCache) setOffline(true);

          if (res.exists && res.data) {
            const data = res.data;
            const isCancelled = String(data.status || '').toLowerCase() === 'cancelled';

            if (!isCancelled) {
              const bookedMeals = ['breakfast', 'lunch', 'snacks', 'dinner'].filter((mealKey) => {
                const val = data[mealKey];
                return val === true || (Array.isArray(val) && val.length > 0);
              });

              if (bookedMeals.length > 0) {
                results[dateStr] = {
                  date: dateStr,
                  count: bookedMeals.length,
                  meals: bookedMeals,
                  status: data.status || 'Confirmed',
                  raw: data
                };
              }
            } else {
              results[dateStr] = {
                date: dateStr,
                count: 0,
                meals: [],
                status: 'cancelled',
                raw: data
              };
            }
          }
        } catch (fetchErr) {
          console.warn(`[MonthlyMealCalendar] Failed reading booking for ${dateStr}:`, fetchErr);
        }
      });

      await Promise.all(promises);
      setBookingsMap(results);
    } catch (err) {
      console.error('[MonthlyMealCalendar] Error loading bookings:', err);
    } finally {
      loadingBookingsRef.current = false;
    }
  }, [currentUser?.uid, currentYear, selectedMonthIndex, menusMap, todayDate]);

  useEffect(() => {
    loadEmployeeBookings();
  }, [loadEmployeeBookings, refreshTrigger]);

  // Year navigation handlers
  const handlePrevYear = () => {
    const newYear = currentYear - 1;
    setCurrentYear(newYear);
    const parts = selectedDate.split('-');
    const m = parts[1] || '01';
    const d = parts[2] || '01';
    const newSelected = `${newYear}-${m}-${d}`;
    setSelectedDate(newSelected);
    if (onSelectDate) onSelectDate(newSelected);
  };

  const handleNextYear = () => {
    const newYear = currentYear + 1;
    setCurrentYear(newYear);
    const parts = selectedDate.split('-');
    const m = parts[1] || '01';
    const d = parts[2] || '01';
    const newSelected = `${newYear}-${m}-${d}`;
    setSelectedDate(newSelected);
    if (onSelectDate) onSelectDate(newSelected);
  };

  const handleToday = () => {
    const today = new Date();
    const todayLocalStr = getLocalDateString(today);
    setCurrentYear(today.getFullYear());
    setSelectedDate(todayLocalStr);
    if (onSelectDate) onSelectDate(todayLocalStr);
  };


  // Format date display for selected card
  const formatSelectedDate = (dateStr) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Format deadline time
  const formatDeadlineTime = () => {
    const h = parseInt(deadlineHour, 10);
    const m = parseInt(deadlineMinute, 10);
    const period = h >= 12 ? 'PM' : 'AM';
    const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${displayHour}:${m.toString().padStart(2, '0')} ${period}`;
  };

  // -------------------------------------------------------------
  // THREE MONTHLY STATISTICS (Selected Month + Annual Indicators)
  // -------------------------------------------------------------
  const monthlyStats = useMemo(() => {
    const monthPrefix = `${currentYear}-${String(selectedMonthIndex + 1).padStart(2, '0')}`;
    const yearPrefix = String(currentYear);

    let monthlyMealsBooked = 0;
    let annualMealsBooked = 0;
    Object.entries(bookingsMap).forEach(([dateStr, item]) => {
      if (item.status !== 'cancelled') {
        if (dateStr.startsWith(monthPrefix)) {
          monthlyMealsBooked += item.count || 0;
        }
        if (dateStr.startsWith(yearPrefix)) {
          annualMealsBooked += item.count || 0;
        }
      }
    });

    let monthlyPublishedMenus = 0;
    let annualPublishedMenus = 0;
    Object.keys(menusMap).forEach((dateStr) => {
      if (dateStr.startsWith(monthPrefix)) {
        monthlyPublishedMenus += 1;
      }
      if (dateStr.startsWith(yearPrefix)) {
        annualPublishedMenus += 1;
      }
    });

    let monthlyUpcomingMenus = 0;
    let annualUpcomingMenus = 0;
    Object.keys(menusMap).forEach((dateStr) => {
      if (dateStr >= todayStr) {
        if (dateStr.startsWith(monthPrefix)) {
          monthlyUpcomingMenus += 1;
        }
        if (dateStr.startsWith(yearPrefix)) {
          annualUpcomingMenus += 1;
        }
      }
    });

    return {
      monthlyMealsBooked,
      annualMealsBooked,
      monthlyPublishedMenus,
      annualPublishedMenus,
      monthlyUpcomingMenus,
      annualUpcomingMenus
    };
  }, [currentYear, selectedMonthIndex, bookingsMap, menusMap, todayStr]);

  // -------------------------------------------------------------
  // UPCOMING MEALS LIST (Next few dates with published menus)
  // -------------------------------------------------------------
  const upcomingMealsList = useMemo(() => {
    const datesWithMenus = Object.keys(menusMap)
      .filter((dateStr) => dateStr >= todayStr)
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 6); // Display next 6 upcoming published menu dates

    return datesWithMenus.map((dateStr) => {
      const menu = menusMap[dateStr] || {};
      const booking = bookingsMap[dateStr];
      const hasBooking = Boolean(booking && booking.count > 0 && booking.status !== 'cancelled');
      const isCancelled = booking?.status === 'cancelled';
      const deadlinePassed = isBookingDeadlinePassed(dateStr, deadlineHour, deadlineMinute);

      const [y, m, d] = dateStr.split('-').map(Number);
      const dateObj = new Date(y, m - 1, d);
      const weekdayShort = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
      const monthShort = dateObj.toLocaleDateString('en-US', { month: 'short' });
      const dayNum = dateObj.getDate();

      const tomorrow = new Date(todayDate);
      tomorrow.setDate(todayDate.getDate() + 1);
      const tomorrowStr = getLocalDateString(tomorrow);

      let relativeLabel = '';
      if (dateStr === todayStr) relativeLabel = 'Today';
      else if (dateStr === tomorrowStr) relativeLabel = 'Tomorrow';
      else {
        const diffMs = dateObj - new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
        relativeLabel = diffDays > 0 ? `In ${diffDays} days` : '';
      }

      // Meal category summary breakdown
      const mealsSummary = MEAL_CATEGORIES.map(({ key, label }) => {
        const raw = menu[key];
        let items = [];
        if (Array.isArray(raw)) {
          items = raw.map(i => (typeof i === 'string' ? i : i.name)).filter(Boolean);
        } else if (typeof raw === 'object' && raw) {
          items = Object.values(raw).map(i => (typeof i === 'string' ? i : i.name)).filter(Boolean);
        }

        const isMealBooked = hasBooking && (
          booking.raw?.[key] === true || 
          (Array.isArray(booking.raw?.[key]) && booking.raw[key].length > 0) || 
          (booking.meals || []).includes(key)
        );

        return {
          key,
          label,
          items,
          isBooked: isMealBooked
        };
      });

      return {
        dateStr,
        weekdayShort,
        monthShort,
        dayNum,
        relativeLabel,
        hasBooking,
        isCancelled,
        deadlinePassed,
        booking,
        mealsSummary,
        totalItemsCount: mealsSummary.reduce((acc, m) => acc + m.items.length, 0)
      };
    });
  }, [menusMap, bookingsMap, todayStr, todayDate, deadlineHour, deadlineMinute]);

  // Calculate days for a given month index (0-11)
  const getMonthDays = (monthIndex) => {
    const daysInMonth = new Date(currentYear, monthIndex + 1, 0).getDate();
    const firstDayIndex = new Date(currentYear, monthIndex, 1).getDay();

    const blanks = Array.from({ length: firstDayIndex }, (_, i) => i);
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    return { blanks, days, daysInMonth };
  };

  // Selected date status details
  const selectedDateDetails = useMemo(() => {
    const hasMenu = Boolean(menusMap[selectedDate]);
    const booking = bookingsMap[selectedDate];
    const hasBooking = Boolean(booking && booking.count > 0 && booking.status !== 'cancelled');
    const isCancelled = booking?.status === 'cancelled';
    const deadlinePassed = isBookingDeadlinePassed(selectedDate, deadlineHour, deadlineMinute);
    const menuData = menusMap[selectedDate];

    return {
      hasMenu,
      hasBooking,
      isCancelled,
      booking,
      deadlinePassed,
      menuData
    };
  }, [selectedDate, menusMap, bookingsMap, deadlineHour, deadlineMinute]);

  return (
    <div className="monthly-meal-calendar">
      {/* Offline notification */}
      {offline && (
        <div className="calendar-offline-banner">
          <AlertTriangle size={15} />
          <span>Offline mode active — showing cached Firestore menus & bookings.</span>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="calendar-error-banner">
          <AlertTriangle size={15} />
          <span>{error}</span>
          <button 
            type="button" 
            className="btn-retry" 
            onClick={loadEmployeeBookings}
          >
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      )}

      {/* Calendar Control Header Card */}
      <div className="calendar-header-card">
        <div className="calendar-header-left">
          <div className="calendar-title-badge">
            <CalendarIcon size={16} />
            <span>ANNUAL CANTEEN CALENDAR</span>
            {loading && <span className="calendar-syncing-tag">Syncing...</span>}
          </div>
          <h2>
            Yearly Meal Schedule — <span className="highlight-year">{currentYear}</span>
            {isLeapYear(currentYear) && (
              <span className="leap-year-tag" title="February has 29 days">
                <Sparkles size={12} /> Leap Year (366 Days)
              </span>
            )}
          </h2>
          <p className="calendar-subtitle">
            All 12 months overview synchronized in real-time with canteen menus & bookings.
          </p>
        </div>

        <div className="calendar-controls">
          <button 
            type="button"
            className="calendar-nav-btn" 
            onClick={handlePrevYear}
            aria-label="Previous Year"
            title={`View ${currentYear - 1}`}
          >
            <ChevronLeft size={18} />
            <span>{currentYear - 1}</span>
          </button>

          <button 
            type="button"
            className="calendar-today-btn" 
            onClick={handleToday}
            aria-label="Jump to Today"
          >
            <CalendarDays size={16} />
            <span>Today</span>
          </button>

          <button 
            type="button"
            className="calendar-nav-btn" 
            onClick={handleNextYear}
            aria-label="Next Year"
            title={`View ${currentYear + 1}`}
          >
            <span>{currentYear + 1}</span>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* -------------------------------------------------------------
          THREE MONTHLY STATISTICS CARDS ABOVE CALENDAR
          ------------------------------------------------------------- */}
      <div className="monthly-stats-section">
        <div className="stats-section-header">
          <div className="stats-title-wrap">
            <span className="stats-tag">Monthly Overview</span>
            <h3 className="stats-month-heading">
              {selectedMonthName} {currentYear} Statistics
            </h3>
          </div>
          <span className="stats-meta-info">
            Click any month's date below to update statistics for that month
          </span>
        </div>

        <div className="monthly-stats-grid">
          {/* Stat 1: Total Meals Booked */}
          <div className="stat-card stat-booked">
            <div className="stat-icon-wrap icon-blue">
              <Utensils size={22} />
            </div>
            <div className="stat-content">
              <div className="stat-value-row">
                <span className="stat-number">{monthlyStats.monthlyMealsBooked}</span>
                <span className="stat-badge badge-blue">
                  {monthlyStats.annualMealsBooked} in {currentYear}
                </span>
              </div>
              <div className="stat-label">Total Meals Booked</div>
              <div className="stat-subtext">
                Active meal pre-orders for {selectedMonthName}
              </div>
            </div>
          </div>

          {/* Stat 2: Dates with Published Menus */}
          <div className="stat-card stat-menus">
            <div className="stat-icon-wrap icon-green">
              <ClipboardCheck size={22} />
            </div>
            <div className="stat-content">
              <div className="stat-value-row">
                <span className="stat-number">{monthlyStats.monthlyPublishedMenus}</span>
                <span className="stat-badge badge-green">
                  {monthlyStats.annualPublishedMenus} in {currentYear}
                </span>
              </div>
              <div className="stat-label">Dates with Published Menus</div>
              <div className="stat-subtext">
                Published canteen menus in {selectedMonthName}
              </div>
            </div>
          </div>

          {/* Stat 3: Upcoming Dates with Available Menus */}
          <div className="stat-card stat-upcoming">
            <div className="stat-icon-wrap icon-amber">
              <Clock size={22} />
            </div>
            <div className="stat-content">
              <div className="stat-value-row">
                <span className="stat-number">{monthlyStats.monthlyUpcomingMenus}</span>
                <span className="stat-badge badge-amber">
                  {monthlyStats.annualUpcomingMenus} in {currentYear}
                </span>
              </div>
              <div className="stat-label">Upcoming Dates with Menus</div>
              <div className="stat-subtext">
                Ready for pre-ordering from {selectedMonthName}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Selected Date Summary & Quick Action Banner */}
      <div className="selected-date-banner">
        <div className="selected-date-info">
          <div className="date-icon-box">
            <CalendarIcon size={24} />
          </div>
          <div>
            <div className="selected-date-label">Selected Date Details</div>
            <div className="selected-date-value">
              {formatSelectedDate(selectedDate)}
              {selectedDate === todayStr && (
                <span className="today-badge">
                  <CheckCircle2 size={12} /> Today
                </span>
              )}
            </div>

            {/* Status Pills for Selected Date */}
            <div className="selected-date-badges">
              {selectedDateDetails.hasMenu ? (
                <span className="status-pill pill-menu">
                  <span className="pill-dot dot-green"></span> Menu Published
                </span>
              ) : (
                <span className="status-pill pill-muted">
                  No menu published yet
                </span>
              )}

              {selectedDateDetails.isCancelled ? (
                <span className="status-pill pill-cancelled">
                  <span className="pill-dot dot-orange"></span> Booking Cancelled
                </span>
              ) : selectedDateDetails.hasBooking ? (
                <span className="status-pill pill-booked">
                  <span className="pill-dot dot-blue"></span>
                  {selectedDateDetails.booking.count} Meal{selectedDateDetails.booking.count > 1 ? 's' : ''} Booked (
                  {selectedDateDetails.booking.meals.join(', ')})
                </span>
              ) : (
                <span className="status-pill pill-muted">
                  No meals booked
                </span>
              )}

              {selectedDateDetails.deadlinePassed ? (
                <span className="status-pill pill-deadline">
                  <span className="pill-dot dot-orange"></span> Booking Deadline Passed
                </span>
              ) : (
                <span className="status-pill pill-open">
                  <Clock size={12} /> Booking Open (Closes {formatDeadlineTime()})
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Legend & Action Buttons */}
        <div className="calendar-legend-group">
          <div className="legend-item" title="Admin has published a menu for this date">
            <span className="legend-dot dot-menu-legend"></span>
            <span>Published Menu (Green)</span>
          </div>
          <div className="legend-item" title="You have booked at least one meal for this date">
            <span className="legend-dot dot-booked-legend"></span>
            <span>Meal Booked (Blue)</span>
          </div>
          <div className="legend-item" title="Meal pre-order deadline has passed">
            <span className="legend-dot dot-deadline-legend"></span>
            <span>Deadline Passed (Orange)</span>
          </div>
          <button 
            type="button"
            className="open-details-panel-btn"
            onClick={() => setIsDetailPanelOpen(true)}
          >
            <ExternalLink size={14} />
            <span>View Details & Book</span>
          </button>
          {onSwitchToDaily && (
            <button 
              type="button"
              className="switch-daily-btn"
              onClick={() => onSwitchToDaily(selectedDate)}
            >
              <span>View / Order Daily Menu</span>
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>

      {/* -------------------------------------------------------------
          UPCOMING MEALS SECTION (Next few dates with published menus)
          ------------------------------------------------------------- */}
      <div className="upcoming-meals-section">
        <div className="upcoming-section-header">
          <div className="upcoming-title-wrap">
            <div className="upcoming-icon-pill">
              <Sparkles size={16} />
              <span>UPCOMING SCHEDULE</span>
            </div>
            <h3>Upcoming Canteen Meals</h3>
          </div>
          <span className="upcoming-subtitle">
            Next available published menus • Click any card to open date details & book
          </span>
        </div>

        {loading ? (
          <div className="upcoming-loading-grid">
            {[1, 2, 3].map((i) => (
              <div key={i} className="upcoming-meal-skeleton">
                <div className="skeleton-bar title-bar" />
                <div className="skeleton-bar text-bar" />
                <div className="skeleton-bar text-bar short" />
              </div>
            ))}
          </div>
        ) : upcomingMealsList.length === 0 ? (
          <div className="upcoming-empty-card">
            <div className="empty-icon-circle">
              <Utensils size={28} />
            </div>
            <div className="empty-text">
              <h4>No Upcoming Menus Published Yet</h4>
              <p>The canteen staff hasn't published menus for upcoming dates yet. Please check back later!</p>
            </div>
          </div>
        ) : (
          <div className="upcoming-meals-grid">
            {upcomingMealsList.map((item) => (
              <div 
                key={item.dateStr}
                className={`upcoming-meal-card ${item.hasBooking ? 'is-booked' : ''} ${selectedDate === item.dateStr ? 'is-selected-upcoming' : ''}`}
                onClick={() => handleUpcomingMealClick(item.dateStr)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleUpcomingMealClick(item.dateStr);
                  }
                }}
                aria-label={`View meals for ${item.monthShort} ${item.dayNum}`}
              >
                <div className="upcoming-card-header">
                  <div className="upcoming-date-badge">
                    <span className="date-weekday">{item.weekdayShort}</span>
                    <span className="date-day">{item.dayNum}</span>
                    <span className="date-month">{item.monthShort}</span>
                  </div>

                  <div className="upcoming-header-info">
                    <div className="upcoming-relative-row">
                      {item.relativeLabel && (
                        <span className={`relative-badge badge-${item.relativeLabel.toLowerCase().replace(/\s+/g, '-')}`}>
                          {item.relativeLabel}
                        </span>
                      )}

                      {/* Booking status badge */}
                      {item.isCancelled ? (
                        <span className="upcoming-booking-pill status-cancelled">
                          <XCircle size={11} /> Cancelled
                        </span>
                      ) : item.hasBooking ? (
                        <span className="upcoming-booking-pill status-booked">
                          <CheckCircle2 size={11} /> Booked ({item.booking.count})
                        </span>
                      ) : item.deadlinePassed ? (
                        <span className="upcoming-booking-pill status-deadline">
                          <Clock size={11} /> Deadline Passed
                        </span>
                      ) : (
                        <span className="upcoming-booking-pill status-open">
                          <Check size={11} /> Open to Book
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 4 Meal Categories Summary Breakdown */}
                <div className="upcoming-meals-breakdown">
                  {item.mealsSummary.map(({ key, label, items, isBooked }) => (
                    <div key={key} className={`upcoming-meal-cat-row ${isBooked ? 'is-cat-booked' : ''}`}>
                      <span className="cat-name">{label}:</span>
                      <span className="cat-items-summary">
                        {items.length > 0 ? (
                          items.slice(0, 3).join(', ') + (items.length > 3 ? ` +${items.length - 3} more` : '')
                        ) : (
                          <span className="no-items-label">Not published</span>
                        )}
                      </span>
                      {isBooked && (
                        <span className="cat-booked-badge">
                          <Check size={10} /> Booked
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                <div className="upcoming-card-footer">
                  <span className="upcoming-action-hint">
                    <span>{item.hasBooking ? 'View / Modify Booking' : 'View / Book Meals'}</span>
                    <ArrowRight size={13} />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 12 Months Grid: Desktop: 4 cols | Tablet: 2 cols | Mobile: 1 col */}
      <div className="months-grid">
        {MONTH_NAMES.map((monthName, monthIndex) => {
          const { blanks, days, daysInMonth } = getMonthDays(monthIndex);
          const isCurrentMonthOfToday = 
            todayDate.getFullYear() === currentYear && 
            todayDate.getMonth() === monthIndex;
          const isSelectedMonth = selectedMonthIndex === monthIndex;

          return (
            <div 
              key={monthName} 
              className={`month-card ${isCurrentMonthOfToday ? 'is-current-month' : ''} ${isSelectedMonth ? 'is-selected-month' : ''}`}
            >
              <div className="month-card-header">
                <div className="month-name">
                  <h3>{monthName}</h3>
                  {monthIndex === 1 && isLeapYear(currentYear) && (
                    <span className="feb-leap-badge">29 Days</span>
                  )}
                </div>
                <span className="month-days-count">{daysInMonth} days</span>
              </div>

              {/* Sunday - Saturday Weekday Headings */}
              <div className="weekdays-row" role="row">
                {WEEKDAY_HEADERS.map((header) => (
                  <div 
                    key={header.short} 
                    className={`weekday-cell ${header.isWeekend ? 'is-weekend' : ''}`}
                    title={header.name}
                    role="columnheader"
                  >
                    <span className="weekday-letter">{header.letter}</span>
                  </div>
                ))}
              </div>

              {/* Dates Grid with Correct Weekday Alignment */}
              <div className="days-grid" role="grid">
                {/* Empty alignment padding cells for days prior to the 1st */}
                {blanks.map((blankIndex) => (
                  <div 
                    key={`blank-${blankIndex}`} 
                    className="day-cell-empty" 
                    aria-hidden="true" 
                  />
                ))}

                {/* All days of the month (1..daysInMonth) */}
                {days.map((day) => {
                  const monthNum = String(monthIndex + 1).padStart(2, '0');
                  const dayNum = String(day).padStart(2, '0');
                  const dateStr = `${currentYear}-${monthNum}-${dayNum}`;
                  
                  const isToday = dateStr === todayStr;
                  const isSelected = dateStr === selectedDate;
                  const dayOfWeek = new Date(currentYear, monthIndex, day).getDay();
                  const isSunday = dayOfWeek === 0;

                  // Indicators
                  const hasMenu = Boolean(menusMap[dateStr]);
                  const hasBooking = Boolean(bookingsMap[dateStr] && bookingsMap[dateStr].count > 0 && bookingsMap[dateStr].status !== 'cancelled');
                  const isDeadlinePassed = isBookingDeadlinePassed(dateStr, deadlineHour, deadlineMinute);

                  return (
                    <button
                      key={dateStr}
                      type="button"
                      className={`day-cell-btn ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''} ${isSunday ? 'is-sunday' : ''}`}
                      onClick={() => handleDateClick(dateStr)}
                      aria-label={`${monthName} ${day}, ${currentYear}${isToday ? ' (Today)' : ''}${isSelected ? ' (Selected)' : ''}${hasMenu ? ' (Menu Published)' : ''}${hasBooking ? ' (Meal Booked)' : ''}${isDeadlinePassed ? ' (Deadline Passed)' : ''}`}
                      aria-pressed={isSelected}
                    >
                      <span className="day-number">{day}</span>
                      
                      {/* Three Firestore Indicators: Green (Menu), Blue (Booked), Orange (Deadline) */}
                      <div className="day-indicators-container">
                        {hasMenu && (
                          <span 
                            className="indicator-dot dot-menu" 
                            title="Menu Published"
                            aria-label="Menu Published"
                          />
                        )}
                        {hasBooking && (
                          <span 
                            className="indicator-dot dot-booked" 
                            title="Meal Booked"
                            aria-label="Meal Booked"
                          />
                        )}
                        {isDeadlinePassed && (
                          <span 
                            className="indicator-dot dot-deadline" 
                            title="Booking Deadline Passed"
                            aria-label="Booking Deadline Passed"
                          />
                        )}
                      </div>

                      {isToday && <span className="today-indicator-dot" />}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Date Details & Meal Booking Panel (Right-side drawer on desktop, bottom sheet on mobile) */}
      <MonthlyDateDetailPanel
        isOpen={isDetailPanelOpen}
        onClose={() => setIsDetailPanelOpen(false)}
        dateStr={selectedDate}
        menuData={selectedMenuData}
        bookingData={bookingsMap[selectedDate]}
        deadlineHour={deadlineHour}
        deadlineMinute={deadlineMinute}
        onBookingUpdated={() => {
          loadEmployeeBookings();
        }}
      />
    </div>
  );
};

export default MonthlyMealCalendar;
