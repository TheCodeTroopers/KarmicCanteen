// src/components/Admin/DefaultMenuManager.jsx

/**
 * Manages the "Default Menu" — recurring menu template items stored in Firestore.
 * 
 * Firestore Document Path:
 *   defaultMenu/config  (and synced with dailyStaples/config)
 * 
 * Each Default Menu item follows the standard menu item schema:
 *   name       -> item name
 *   available  -> whether the item is available by default (true/false)
 *   quantity   -> optional daily portion limit (null for unlimited)
 */

import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { getLocalDateString } from '../../utils/dateUtils';
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
  Sparkles
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

const EMPTY_MENU = {
  breakfast: [],
  lunch: [],
  snacks: [],
  dinner: []
};

const normalizeMenuItem = (item) => {
  if (typeof item === 'string') {
    return {
      name: item,
      available: true,
      quantity: null
    };
  }

  return {
    name: item?.name || '',
    available: item?.available !== false,
    quantity:
      item?.quantity === null ||
      item?.quantity === undefined ||
      item?.quantity === ''
        ? null
        : Math.max(0, Number(item.quantity))
  };
};

const DefaultMenuManager = () => {
  const [menuItems, setMenuItems] = useState(EMPTY_MENU);
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
        setMenuItems({
          breakfast: (data.breakfast || []).map(normalizeMenuItem),
          lunch: (data.lunch || []).map(normalizeMenuItem),
          snacks: (data.snacks || []).map(normalizeMenuItem),
          dinner: (data.dinner || []).map(normalizeMenuItem)
        });
      } else {
        setMenuItems(EMPTY_MENU);
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

  const handleAddItem = (mealType) => {
    const itemName = currentItem[mealType].trim();

    if (!itemName) {
      showMessage('error', 'Please enter an item name');
      return;
    }

    const alreadyExists = menuItems[mealType].some(
      existing => existing.name.toLowerCase() === itemName.toLowerCase()
    );

    if (alreadyExists) {
      showMessage('error', 'This item is already in the default menu');
      return;
    }

    setMenuItems(prev => ({
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

  const handleRemoveItem = (mealType, index) => {
    setMenuItems(prev => ({
      ...prev,
      [mealType]: prev[mealType].filter((_, i) => i !== index)
    }));
  };

  const handleAvailabilityChange = (mealType, index) => {
    setMenuItems(prev => ({
      ...prev,
      [mealType]: prev[mealType].map((item, i) =>
        i === index ? { ...item, available: !item.available } : item
      )
    }));
  };

  const handleQuantityChange = (mealType, index, value) => {
    let quantity;
    if (value === '') {
      quantity = null;
    } else {
      const parsed = parseInt(value, 10);
      quantity = Number.isNaN(parsed) ? null : Math.max(0, parsed);
    }

    setMenuItems(prev => ({
      ...prev,
      [mealType]: prev[mealType].map((item, i) =>
        i === index ? { ...item, quantity } : item
      )
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const menusDefaultRef = doc(db, 'menus', 'default');
      const defaultMenuRef = doc(db, 'defaultMenu', 'config');
      const staplesRef = doc(db, 'dailyStaples', 'config');

      const payload = {
        breakfast: menuItems.breakfast.map(normalizeMenuItem),
        lunch: menuItems.lunch.map(normalizeMenuItem),
        snacks: menuItems.snacks.map(normalizeMenuItem),
        dinner: menuItems.dinner.map(normalizeMenuItem),
        updatedAt: new Date().toISOString()
      };

      const batch = writeBatch(db);
      batch.set(menusDefaultRef, payload);
      batch.set(defaultMenuRef, payload);
      batch.set(staplesRef, payload);

      await batch.commit();
      showMessage('success', '✓ Default Menu saved successfully to Firestore (menus/default & defaultMenu/config)!');
    } catch (error) {
      console.error('Error saving default menu:', error);
      showMessage('error', 'Failed to save Default Menu');
    } finally {
      setSaving(false);
    }
  };

  const getTotalItems = () =>
    menuItems.breakfast.length +
    menuItems.lunch.length +
    menuItems.snacks.length +
    menuItems.dinner.length;

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
            Default Menu Management
          </h2>
          <p className="subtitle">
            Configure default canteen menu templates stored dynamically in Cloud Firestore.
          </p>
        </div>

        <button
          className="btn btn-primary save-btn"
          onClick={handleSave}
          disabled={saving}
        >
          <Save size={16} style={{ marginRight: '6px' }} />
          {saving ? 'Saving...' : 'Save Default Menu'}
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

      <div className="stats-summary">
        <div className="stat-pill">
          <Sparkles size={14} style={{ color: 'var(--accent-primary)' }} />
          <span>Total Default Items: <strong>{getTotalItems()}</strong></span>
        </div>
      </div>

      <div className="meals-grid">
        {MEAL_TYPES.map(({ key, label, icon: Icon, placeholder }) => (
          <div key={key} className="meal-card">
            <div className="meal-card-header">
              <div className="header-title">
                <Icon size={18} style={{ color: 'var(--accent-primary)', marginRight: '8px' }} />
                <h3>{label}</h3>
              </div>
              <span className="count-badge">{menuItems[key].length} items</span>
            </div>

            <div className="add-item-form">
              <input
                type="text"
                placeholder={placeholder}
                value={currentItem[key]}
                onChange={e =>
                  setCurrentItem(prev => ({ ...prev, [key]: e.target.value }))
                }
                onKeyPress={e => e.key === 'Enter' && handleAddItem(key)}
              />
              <button
                className="btn btn-primary add-btn"
                onClick={() => handleAddItem(key)}
              >
                Add
              </button>
            </div>

            <div className="items-list">
              {menuItems[key].length === 0 ? (
                <p className="empty-text">No default items configured for {label}</p>
              ) : (
                menuItems[key].map((item, index) => (
                  <div key={index} className="item-row">
                    <span className="item-name">{item.name}</span>

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

                      <div className="quantity-control">
                        <label>Qty:</label>
                        <input
                          type="number"
                          min="0"
                          placeholder="∞"
                          value={item.quantity === null ? '' : item.quantity}
                          onChange={e =>
                            handleQuantityChange(key, index, e.target.value)
                          }
                        />
                      </div>

                      <button
                        className="btn-remove"
                        onClick={() => handleRemoveItem(key, index)}
                        title="Remove item"
                      >
                        ×
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
