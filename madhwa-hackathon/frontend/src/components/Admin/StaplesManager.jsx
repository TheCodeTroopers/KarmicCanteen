// src/components/Admin/StaplesManager.jsx

// Manages "Daily Staples" — items that appear every day.
// Each staple has:
//   name       -> item name
//   available  -> whether students can order it
//   quantity   -> optional daily quantity limit
//
// quantity = null means quantity is not being tracked.

import React, { useState, useEffect } from 'react';
import { doc, getDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { getLocalDateString } from '../../utils/dateUtils';
import {
  Coffee,
  Soup,
  Cookie,
  ChefHat,
  Info,
  Check,
  AlertTriangle
} from 'lucide-react';
import './StaplesManager.css';


const MEAL_TYPES = [
  {
    key: 'breakfast',
    label: 'Breakfast',
    icon: Coffee,
    placeholder: 'e.g., Tea, Coffee, Bread & Butter'
  },
  {
    key: 'lunch',
    label: 'Lunch',
    icon: Soup,
    placeholder: 'e.g., Curd Rice, Pickle, Papad'
  },
  {
    key: 'snacks',
    label: 'Snacks',
    icon: Cookie,
    placeholder: 'e.g., Tea, Coffee, Biscuits'
  },
  {
    key: 'dinner',
    label: 'Dinner',
    icon: ChefHat,
    placeholder: 'e.g., Curd Rice, Buttermilk'
  }
];


const EMPTY_STAPLES = {
  breakfast: [],
  lunch: [],
  snacks: [],
  dinner: []
};


/*
 * Convert old string-based staples into the new object format.
 *
 * Old:
 * "Tea"
 *
 * New:
 * {
 *   name: "Tea",
 *   available: true,
 *   quantity: null
 * }
 *
 * quantity is null because old staples did not have
 * quantity information.
 */
const normalizeStaple = (item) => {

  if (typeof item === 'string') {
    return {
      name: item,
      available: true,
      quantity: null
    };
  }

  return {
    name: item.name || '',
    available: item.available !== false,

    // null means quantity is not being tracked.
    quantity:
      item.quantity === null ||
      item.quantity === undefined ||
      item.quantity === ''
        ? null
        : Math.max(0, Number(item.quantity))
  };
};


const StaplesManager = () => {

  const [staples, setStaples] = useState(EMPTY_STAPLES);

  const [currentItem, setCurrentItem] = useState({
    breakfast: '',
    lunch: '',
    snacks: '',
    dinner: ''
  });

  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);

  // Daily Staples are global, but cross-category moves are checked against
  // this specific menu date. Default to tomorrow, matching MenuManager.
  const [selectedMenuDate, setSelectedMenuDate] = useState('');

  const [message, setMessage] = useState({
    type: '',
    text: ''
  });


  /*
   * ----------------------------------------------------------
   * LOAD DAILY STAPLES
   * ----------------------------------------------------------
   */

  useEffect(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setSelectedMenuDate(getLocalDateString(tomorrow));
    loadStaples();
  }, []);


  const loadStaples = async () => {

    try {

      setLoading(true);

      const ref = doc(
        db,
        'dailyStaples',
        'config'
      );

      const snap = await getDoc(ref);


      if (snap.exists()) {

        const data = snap.data();


        setStaples({
          breakfast: (data.breakfast || [])
            .map(normalizeStaple),

          lunch: (data.lunch || [])
            .map(normalizeStaple),

          snacks: (data.snacks || [])
            .map(normalizeStaple),

          dinner: (data.dinner || [])
            .map(normalizeStaple)
        });

      } else {

        setStaples({
          ...EMPTY_STAPLES
        });
      }

    } catch (error) {

      console.error(
        'Error loading daily staples:',
        error
      );

      showMessage(
        'error',
        'Failed to load daily staples'
      );

    } finally {

      setLoading(false);
    }
  };


  /*
   * ----------------------------------------------------------
   * MESSAGE
   * ----------------------------------------------------------
   */

  const showMessage = (type, text) => {

    setMessage({
      type,
      text
    });

    setTimeout(() => {

      setMessage({
        type: '',
        text: ''
      });

    }, 4000);
  };


  /*
   * ----------------------------------------------------------
   * ADD ITEM
   * ----------------------------------------------------------
   */

  const handleAddItem = (mealType) => {

    const itemName =
      currentItem[mealType].trim();


    if (!itemName) {

      showMessage(
        'error',
        'Please enter an item name'
      );

      return;
    }


    /*
     * Check duplicate names.
     */
    const alreadyExists =
      staples[mealType].some(
        existing =>
          existing.name.toLowerCase() ===
          itemName.toLowerCase()
      );


    if (alreadyExists) {

      showMessage(
        'error',
        'This item is already in the always-available list'
      );

      return;
    }


    /*
     * Add the new staple.
     *
     * By default:
     * available = true
     * quantity = null
     *
     * The admin can set the quantity later.
     */
    setStaples(prev => ({

      ...prev,

      [mealType]: [
        ...prev[mealType],

        {
          name: itemName,
          available: true,
          quantity: null
        }
      ]

    }));


    setCurrentItem(prev => ({

      ...prev,

      [mealType]: ''

    }));
  };


  /*
   * ----------------------------------------------------------
   * REMOVE ITEM
   * ----------------------------------------------------------
   */

  const handleRemoveItem = (mealType, index) => {

    setStaples(prev => ({

      ...prev,

      [mealType]:
        prev[mealType].filter(
          (_, i) => i !== index
        )

    }));
  };


  /*
   * ----------------------------------------------------------
   * TOGGLE AVAILABILITY
   * ----------------------------------------------------------
   */

  const handleAvailabilityChange = (
    mealType,
    index
  ) => {

    setStaples(prev => ({

      ...prev,

      [mealType]:
        prev[mealType].map(
          (item, i) => {

            if (i !== index) {
              return item;
            }

            return {
              ...item,
              available: !item.available
            };
          }
        )

    }));
  };


  /*
   * ----------------------------------------------------------
   * CHANGE QUANTITY
   * ----------------------------------------------------------
   *
   * Empty input = null
   * Number = quantity-controlled item
   *
   * Examples:
   *
   * ""  -> null
   * 50  -> 50
   * -5  -> 0
   */

  const handleQuantityChange = (
    mealType,
    index,
    value
  ) => {

    let quantity;


    if (value === '') {

      quantity = null;

    } else {

      const parsed =
        parseInt(value, 10);

      quantity =
        Number.isNaN(parsed)
          ? null
          : Math.max(0, parsed);
    }


    setStaples(prev => ({

      ...prev,

      [mealType]:
        prev[mealType].map(
          (item, i) => {

            if (i !== index) {
              return item;
            }

            return {
              ...item,
              quantity
            };
          }
        )

    }));
  };


  /*
   * ----------------------------------------------------------
   * SAVE
   * ----------------------------------------------------------
   */

  const normalizeName = (name) => (name || '').trim().toLowerCase();

  const normalizeMenuItem = (item) => {
    if (typeof item === 'string') {
      return {
        name: item,
        available: true,
        quantity: 0
      };
    }

    return {
      name: item?.name || '',
      available: item?.available !== false,
      quantity:
        item?.quantity === null ||
        item?.quantity === undefined ||
        item?.quantity === ''
          ? 0
          : Math.max(0, Number(item.quantity))
    };
  };

  const itemsAreEqual = (a, b) => (
    normalizeName(a?.name) === normalizeName(b?.name) &&
    a?.available === b?.available &&
    (a?.quantity ?? null) === (b?.quantity ?? null)
  );

  const removeItemByName = (items, name) =>
    items.filter(item => normalizeName(item?.name) !== normalizeName(name));

  const findItemByName = (items, name) =>
    items.find(item => normalizeName(item?.name) === normalizeName(name));

  const handleSave = async () => {
    if (!selectedMenuDate) {
      showMessage('error', 'Please select the menu date to check for conflicts');
      return;
    }

    try {
      setSaving(true);

      const staplesRef = doc(db, 'dailyStaples', 'config');
      const menuRef = doc(db, 'menus', selectedMenuDate);

      // Read both documents before saving so a move can be performed
      // as one atomic Firestore batch.
      const [staplesSnap, menuSnap] = await Promise.all([
        getDoc(staplesRef),
        getDoc(menuRef)
      ]);

      const existingStaples = staplesSnap.exists()
        ? staplesSnap.data()
        : {
            breakfast: [],
            lunch: [],
            snacks: [],
            dinner: []
          };

      const existingMenu = menuSnap.exists()
        ? menuSnap.data()
        : {
            breakfast: [],
            lunch: [],
            snacks: [],
            dinner: []
          };

      const nextStaples = {
        breakfast: staples.breakfast.map(normalizeStaple),
        lunch: staples.lunch.map(normalizeStaple),
        snacks: staples.snacks.map(normalizeStaple),
        dinner: staples.dinner.map(normalizeStaple)
      };

      const nextMenu = {
        breakfast: (existingMenu.breakfast || []).map(normalizeMenuItem),
        lunch: (existingMenu.lunch || []).map(normalizeMenuItem),
        snacks: (existingMenu.snacks || []).map(normalizeMenuItem),
        dinner: (existingMenu.dinner || []).map(normalizeMenuItem)
      };

      // Check each Daily Staple against the menu for ONLY the selected date
      // and ONLY the same meal category.
      for (const mealType of ['breakfast', 'lunch', 'snacks', 'dinner']) {
        for (const stapleItem of nextStaples[mealType]) {
          const menuItem = findItemByName(
            nextMenu[mealType],
            stapleItem.name
          );

          if (!menuItem) continue;

          const confirmed = window.confirm(
            `"${stapleItem.name}" is already in the ${mealType} menu ` +
            `for ${formatMenuDate(selectedMenuDate)}.\n\n` +
            `Do you want to remove it from the menu and move it to ` +
            `Daily Staples with quantity ` +
            `${stapleItem.quantity === null ? 'unlimited' : stapleItem.quantity}?`
          );

          if (!confirmed) {
            showMessage(
              'info',
              `Save cancelled. "${stapleItem.name}" remains in the menu.`
            );
            return;
          }

          nextMenu[mealType] = removeItemByName(
            nextMenu[mealType],
            stapleItem.name
          );
        }
      }

      // Compare the resulting configuration with the currently stored data.
      const staplesChanged = ['breakfast', 'lunch', 'snacks', 'dinner'].some(
        mealType => {
          const oldItems = (existingStaples[mealType] || []).map(normalizeStaple);
          const newItems = nextStaples[mealType];

          if (oldItems.length !== newItems.length) return true;

          return oldItems.some((oldItem, index) =>
            !itemsAreEqual(oldItem, newItems[index])
          );
        }
      );

      const menuChanged = ['breakfast', 'lunch', 'snacks', 'dinner'].some(
        mealType => {
          const oldItems = (existingMenu[mealType] || []).map(normalizeMenuItem);
          const newItems = nextMenu[mealType];

          if (oldItems.length !== newItems.length) return true;

          return oldItems.some((oldItem, index) =>
            !itemsAreEqual(oldItem, newItems[index])
          );
        }
      );

      if (!staplesChanged && !menuChanged) {
        showMessage('info', 'No changes detected. Nothing was updated.');
        return;
      }

      const batch = writeBatch(db);

      batch.set(staplesRef, {
        ...nextStaples,
        updatedAt: new Date().toISOString()
      });

      // Only update the selected date's menu if a confirmed move changed it.
      if (menuChanged) {
        batch.set(menuRef, {
          ...nextMenu,
          date: selectedMenuDate,
          createdAt:
            existingMenu.createdAt || new Date().toLocaleString('en-CA'),
          updatedAt: new Date().toLocaleString('en-CA')
        });
      }

      await batch.commit();

      setStaples(nextStaples);

      showMessage(
        'success',
        'Daily staples saved successfully!'
      );
    } catch (error) {
      console.error('Error saving daily staples:', error);

      showMessage(
        'error',
        'Failed to save. Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  const formatMenuDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  /*
   * ----------------------------------------------------------
   * TOTAL ITEMS
   * ----------------------------------------------------------
   */

  const totalItems =
    MEAL_TYPES.reduce(
      (sum, meal) =>
        sum +
        staples[meal.key].length,
      0
    );


  /*
   * ----------------------------------------------------------
   * LOADING
   * ----------------------------------------------------------
   */

  if (loading) {

    return (

      <div className="loading-container">

        <div className="spinner"></div>

        <p>
          Loading daily staples...
        </p>

      </div>
    );
  }


  /*
   * ----------------------------------------------------------
   * UI
   * ----------------------------------------------------------
   */

  return (

    <div className="staples-manager">

      <div className="staples-intro">

        <div className="staples-intro-icon">
          <Info size={18} />
        </div>

        <div>

          <h3>
            Daily Staples
          </h3>

          <p>
            These items appear every day for
            students in addition to the
            special menu for each date.
            Toggle availability and optionally
            set a quantity for each item.
          </p>

        </div>

      </div>


      <div className="staples-date-selector" style={{ marginBottom: '16px' }}>
        <label htmlFor="staples-menu-date">
          📅 Menu date to check for conflicts
        </label>
        <input
          id="staples-menu-date"
          type="date"
          value={selectedMenuDate}
          min={getLocalDateString()}
          onChange={(e) => setSelectedMenuDate(e.target.value)}
          style={{ marginLeft: '10px' }}
        />
        <span style={{ marginLeft: '10px', opacity: 0.75 }}>
          Daily Staples remain global; this date is used only for Menu conflict checking.
        </span>
      </div>


      {message.text && (

        <div
          className={`message ${message.type}`}
        >

          {message.type === 'success' && (
            <Check
              size={16}
              style={{
                marginRight: 6,
                verticalAlign: 'middle'
              }}
            />
          )}

          {message.type === 'error' && (
            <AlertTriangle
              size={16}
              style={{
                marginRight: 6,
                verticalAlign: 'middle'
              }}
            />
          )}

          {message.text}

        </div>
      )}


      <div className="staples-editor">

        <div className="staples-header-row">

          <span className="staples-total-badge">
            {totalItems} always-available items
          </span>

        </div>


        <div className="staples-grid">

          {MEAL_TYPES.map(
            ({
              key,
              label,
              icon: Icon,
              placeholder
            }) => (

              <div
                className="staple-section"
                key={key}
              >

                <div className="staple-section-header">

                  <span className="staple-section-title">

                    <Icon
                      size={16}
                      style={{
                        color:
                          'var(--accent-primary)'
                      }}
                    />

                    {label}

                  </span>

                  <span className="item-count">
                    {staples[key].length} items
                  </span>

                </div>


                <div className="add-item-form">

                  <input
                    type="text"
                    placeholder={placeholder}
                    value={currentItem[key]}

                    onChange={(e) =>
                      setCurrentItem(prev => ({
                        ...prev,
                        [key]: e.target.value
                      }))
                    }

                    onKeyDown={(e) => {

                      if (e.key === 'Enter') {
                        handleAddItem(key);
                      }

                    }}

                  />

                  <button
                    className="btn btn-primary"
                    onClick={() =>
                      handleAddItem(key)
                    }
                  >
                    Add
                  </button>

                </div>


                <div className="items-list">

                  {staples[key].length === 0 ? (

                    <p className="empty-list">
                      No {label.toLowerCase()}
                      {' '}staples yet
                    </p>

                  ) : (

                    staples[key].map(
                      (item, index) => (

                        <div
                          key={index}
                          className="item-tag staple-tag staple-item-row"
                        >

                          <span className="staple-item-name">
                            {item.name}
                          </span>


                          <div className="staple-item-controls">

                            {/* Availability toggle */}

                            <label className="staple-toggle">

                              <input
                                type="checkbox"
                                checked={item.available}
                                onChange={() =>
                                  handleAvailabilityChange(
                                    key,
                                    index
                                  )
                                }
                              />

                              <span className="staple-toggle-slider"></span>

                            </label>


                            <span className="staple-availability-text">

                              {item.available
                                ? 'Available'
                                : 'Unavailable'}

                            </span>


                            {/* Optional quantity */}

                            <label className="staple-quantity-label">
                              Qty:
                            </label>


                            <input
                              type="number"
                              min="0"
                              value={
                                item.quantity ?? ''
                              }

                              placeholder="—"

                              onChange={(e) =>
                                handleQuantityChange(
                                  key,
                                  index,
                                  e.target.value
                                )
                              }

                              className="staple-quantity-input"
                            />


                            {/* Remove */}

                            <button
                              className="remove-btn"
                              onClick={() =>
                                handleRemoveItem(
                                  key,
                                  index
                                )
                              }
                            >
                              ×
                            </button>

                          </div>

                        </div>

                      )
                    )

                  )}

                </div>

              </div>

            )
          )}

        </div>


        <div className="save-section">

          <button
            className="btn btn-primary btn-large"
            onClick={handleSave}
            disabled={saving}
          >

            {saving
              ? 'Saving...'
              : 'Save Daily Staples'}

          </button>

        </div>

      </div>

    </div>
  );
};


export default StaplesManager;