export const MEAL_KEYS = ['breakfast', 'lunch', 'snacks', 'dinner'];

export const createEmptyMealItemsMap = () => ({
  breakfast: [],
  lunch: [],
  snacks: [],
  dinner: []
});

/**
 * Normalizes raw menu items into { name, available } objects.
 * Preserves unavailable items so the UI can display them as non-selectable.
 */
export const normalizeMealItemsForSelection = (raw) => {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : typeof raw === 'object' ? Object.values(raw) : [];
  const seen = new Set();
  const result = [];

  for (const item of list) {
    const name = typeof item === 'string' ? item.trim() : String(item?.name || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const available = typeof item === 'string' ? true : item?.available !== false;
    result.push({ name, available });
  }

  return result;
};

/**
 * Step 1: Toggle an individual item's highlight state within a single meal category.
 * Unavailable items cannot be selected.
 */
export const toggleMealItemHighlight = (highlightedMap, mealKey, itemName, isAvailable = true) => {
  if (!isAvailable || !itemName || !MEAL_KEYS.includes(mealKey)) {
    return highlightedMap;
  }

  const current = highlightedMap[mealKey] || [];
  const exists = current.includes(itemName);
  const nextList = exists
    ? current.filter((name) => name !== itemName)
    : [...current, itemName];

  return {
    ...highlightedMap,
    [mealKey]: nextList
  };
};

/**
 * Step 2: Confirm ONLY the individually highlighted items for the given meal category.
 * Does not select all items in the category.
 */
export const confirmCategorySelection = (highlightedMap, confirmedMap, mealKey) => {
  if (!MEAL_KEYS.includes(mealKey)) return confirmedMap;
  const highlighted = highlightedMap[mealKey] || [];

  return {
    ...confirmedMap,
    [mealKey]: [...highlighted]
  };
};

/**
 * Builds the Firestore mealSelections/{date}/users/{uid} payload from confirmed items.
 * Keeps top-level breakfast/lunch/snacks/dinner as booleans for Firestore rules and
 * report compatibility, while storing exact item choices in selectedItems.
 */
export const buildBookingPayload = ({ uid, email = '', dateStr, confirmedItems, isModified = false }) => {
  const safeConfirmed = {
    breakfast: [...(confirmedItems?.breakfast || [])],
    lunch: [...(confirmedItems?.lunch || [])],
    snacks: [...(confirmedItems?.snacks || [])],
    dinner: [...(confirmedItems?.dinner || [])]
  };

  return {
    employeeId: uid,
    userId: uid,
    email,
    date: dateStr,
    breakfast: safeConfirmed.breakfast.length > 0,
    lunch: safeConfirmed.lunch.length > 0,
    snacks: safeConfirmed.snacks.length > 0,
    dinner: safeConfirmed.dinner.length > 0,
    selectedItems: safeConfirmed,
    status: 'Confirmed',
    timestamp: new Date().toISOString(),
    modified: Boolean(isModified)
  };
};
