export const WEEKDAY_KEYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday'
];

export const WEEKDAY_LABELS = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday'
};

const JS_DAY_TO_KEY = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday'
];

export const getLocalDateString = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const parseLocalDate = (dateStr) => {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  const [year, month, day] = parts;
  return new Date(year, month - 1, day);
};

export const isSundayDate = (dateStr) => {
  const date = parseLocalDate(dateStr);
  return date ? date.getDay() === 0 : false;
};

export const getWeekdayKey = (dateStr) => {
  const date = parseLocalDate(dateStr);
  return date ? JS_DAY_TO_KEY[date.getDay()] : null;
};

export const hasAnyMealItems = (menuObj) => {
  if (!menuObj || typeof menuObj !== 'object') return false;
  return ['breakfast', 'lunch', 'snacks', 'dinner'].some((meal) => {
    const val = menuObj[meal];
    if (Array.isArray(val)) return val.length > 0;
    if (val && typeof val === 'object') return Object.keys(val).length > 0;
    return Boolean(val);
  });
};

/**
 * Resolves the recurring default menu for a specific YYYY-MM-DD date.
 * - Returns null on Sunday (permanent weekly holiday).
 * - Uses data.weekdays[weekdayKey] when configured for that weekday.
 * - Falls back to legacy top-level breakfast/lunch/snacks/dinner fields when
 *   no weekday-specific menu is configured.
 */
export const resolveDefaultMenuForDate = (defaultDocData, dateStr) => {
  if (!defaultDocData || !dateStr || isSundayDate(dateStr)) return null;

  const weekdayKey = getWeekdayKey(dateStr);
  const weekdayMenu = weekdayKey ? defaultDocData.weekdays?.[weekdayKey] : undefined;

  if (weekdayMenu && typeof weekdayMenu === 'object') {
    return {
      breakfast: weekdayMenu.breakfast || [],
      lunch: weekdayMenu.lunch || [],
      snacks: weekdayMenu.snacks || [],
      dinner: weekdayMenu.dinner || []
    };
  }

  if (hasAnyMealItems(defaultDocData)) {
    return {
      breakfast: defaultDocData.breakfast || [],
      lunch: defaultDocData.lunch || [],
      snacks: defaultDocData.snacks || [],
      dinner: defaultDocData.dinner || []
    };
  }

  return null;
};
