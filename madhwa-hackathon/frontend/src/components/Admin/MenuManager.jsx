// src/components/Admin/MenuManager.jsx
import React, { useState, useEffect } from 'react';
import { doc, setDoc, getDoc, collection, getDocs, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { getLocalDateString } from '../../utils/dateUtils';
import './MenuManager.css';

const MenuManager = () => {
  const [selectedDate, setSelectedDate] = useState('');
  const [menuItems, setMenuItems] = useState({
    breakfast: [],
    lunch: [],
    snacks: [],
    dinner: []
  });
  const [currentItem, setCurrentItem] = useState({
    breakfast: '',
    lunch: '',
    snacks: '',
    dinner: ''
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [existingMenus, setExistingMenus] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const MENUS_PER_PAGE = 10;

  useEffect(() => {
    // Set tomorrow as default date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
   setSelectedDate(getLocalDateString(tomorrow));

    fetchExistingMenus();
  }, []);

  useEffect(() => {
    if (selectedDate) {
      loadMenuForDate(selectedDate);
    }
  }, [selectedDate]);

  const fetchExistingMenus = async () => {
    try {
      const menusRef = collection(db, 'menus');
      const snapshot = await getDocs(menusRef);
      const menus = snapshot.docs.map(doc => ({
        date: doc.id,
        ...doc.data()
      }));
      setExistingMenus(menus.sort((a, b) => b.date.localeCompare(a.date)));
    } catch (error) {
      console.error('Error fetching menus:', error);
    }
  };

  const loadMenuForDate = async (date) => {
    try {
      setLoading(true);
      const menuRef = doc(db, 'menus', date);
      const menuSnap = await getDoc(menuRef);

      if (menuSnap.exists()) {
        const data = menuSnap.data();
        setMenuItems({
          breakfast: (data.breakfast || []).map(normalizeMenuItem),
          lunch: (data.lunch || []).map(normalizeMenuItem),
          snacks: (data.snacks || []).map(normalizeMenuItem),
          dinner: (data.dinner || []).map(normalizeMenuItem)
        });
        showMessage('info', `Loaded existing menu for ${formatDate(date)}`);
      } else {
        // Clear menu items for new date
        setMenuItems({
          breakfast: [],
          lunch: [],
          snacks: [],
          dinner: []
        });
        showMessage('info', `Creating new menu for ${formatDate(date)}`);
      }
    } catch (error) {
      console.error('Error loading menu:', error);
      showMessage('error', 'Failed to load menu');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const normalizeMenuItem = (item) => {
    // Existing menus may contain strings
    if (typeof item === 'string') {
      return {
        name: item,
        available: true,
        quantity: 0
      };
    }

    // New menu format
    return {
      name: item.name || '',
      available: item.available !== false,
      quantity: Number(item.quantity) || 0
    };
  };

  const handleAddItem = (mealType) => {
    const item = currentItem[mealType].trim();

    if (!item) {
      showMessage('error', 'Please enter an item name');
      return;
    }

    const exists = menuItems[mealType].some(
      menuItem =>
        menuItem.name.toLowerCase() === item.toLowerCase()
    );

    if (exists) {
      showMessage('error', 'This item already exists in the menu');
      return;
    }

    setMenuItems(prev => ({
      ...prev,
      [mealType]: [
        ...prev[mealType],
        {
          name: item,
          available: true,
          quantity: 0
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
        i === index
          ? {
              ...item,
              available: !item.available
            }
          : item
      )
    }));
  };

  const handleQuantityChange = (mealType, index, value) => {
    const quantity = Math.max(0, parseInt(value, 10) || 0);

    setMenuItems(prev => ({
      ...prev,
      [mealType]: prev[mealType].map((item, i) =>
        i === index
          ? {
              ...item,
              quantity
            }
          : item
      )
    }));
  };

  const normalizeStapleForMenuCheck = (item) => {
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

  const normalizeName = (name) => (name || '').trim().toLowerCase();

  const itemsAreEqual = (a, b) => (
    normalizeName(a?.name) === normalizeName(b?.name) &&
    a?.available === b?.available &&
    (a?.quantity ?? null) === (b?.quantity ?? null)
  );

  const removeItemByName = (items, name) =>
    items.filter(item => normalizeName(item?.name) !== normalizeName(name));

  const findItemByName = (items, name) =>
    items.find(item => normalizeName(item?.name) === normalizeName(name));

  const handleSaveMenu = async () => {
    if (!selectedDate) {
      showMessage('error', 'Please select a date');
      return;
    }

    const totalItems = getTotalItems();

    if (totalItems === 0) {
      showMessage('error', 'Please add at least one menu item');
      return;
    }

    try {
      setLoading(true);

      const menuRef = doc(db, 'menus', selectedDate);
      const staplesRef = doc(db, 'dailyStaples', 'config');

      // Read the existing menu and Daily Staples configuration so the
      // save operation can detect cross-category conflicts.
      const [existingMenuSnap, staplesSnap] = await Promise.all([
        getDoc(menuRef),
        getDoc(staplesRef)
      ]);

      const existingMenu = existingMenuSnap.exists()
        ? existingMenuSnap.data()
        : {
            breakfast: [],
            lunch: [],
            snacks: [],
            dinner: []
          };

      const existingStaples = staplesSnap.exists()
        ? staplesSnap.data()
        : {
            breakfast: [],
            lunch: [],
            snacks: [],
            dinner: []
          };

      const nextStaples = {
        breakfast: (existingStaples.breakfast || []).map(normalizeStapleForMenuCheck),
        lunch: (existingStaples.lunch || []).map(normalizeStapleForMenuCheck),
        snacks: (existingStaples.snacks || []).map(normalizeStapleForMenuCheck),
        dinner: (existingStaples.dinner || []).map(normalizeStapleForMenuCheck)
      };

      // Check each menu item against Daily Staples in the SAME meal category.
      // Existing items in the selected date's menu are not conflicts.
      for (const mealType of ['breakfast', 'lunch', 'snacks', 'dinner']) {
        for (const menuItem of menuItems[mealType]) {
          const stapleItem = findItemByName(nextStaples[mealType], menuItem.name);

          if (!stapleItem) continue;

          // The item is already a Daily Staple. Ask before moving it.
          const confirmed = window.confirm(
            `"${menuItem.name}" is already a Daily Staple for ${mealType}.\n\n` +
            `Do you want to remove it from Daily Staples and move it to the ` +
            `${formatDate(selectedDate)} menu with quantity ${menuItem.quantity ?? 0}?`
          );

          if (!confirmed) {
            showMessage(
              'info',
              `Save cancelled. "${menuItem.name}" remains a Daily Staple.`
            );
            return;
          }

          nextStaples[mealType] = removeItemByName(
            nextStaples[mealType],
            menuItem.name
          );
        }
      }

      const nextMenu = {
        breakfast: menuItems.breakfast,
        lunch: menuItems.lunch,
        snacks: menuItems.snacks,
        dinner: menuItems.dinner
      };

      // Detect whether the menu content actually changed.
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

      const staplesChanged = ['breakfast', 'lunch', 'snacks', 'dinner'].some(
        mealType =>
          (existingStaples[mealType] || []).length !==
          nextStaples[mealType].length ||
          (existingStaples[mealType] || []).some((item, index) => {
            const oldItem = normalizeStapleForMenuCheck(item);
            const newItem = nextStaples[mealType][index];
            return !itemsAreEqual(oldItem, newItem);
          })
      );

      if (!menuChanged && !staplesChanged) {
        showMessage('info', 'No changes detected. Nothing was updated.');
        return;
      }

      const batch = writeBatch(db);

      batch.set(menuRef, {
        ...nextMenu,
        date: selectedDate,
        createdAt:
          existingMenu.createdAt || new Date().toLocaleString('en-CA'),
        updatedAt: new Date().toLocaleString('en-CA')
      });

      // Only write Daily Staples when a confirmed move actually changed them.
      if (staplesChanged) {
        batch.set(staplesRef, {
          ...existingStaples,
          ...nextStaples,
          updatedAt: new Date().toISOString()
        });
      }

      await batch.commit();

      showMessage(
        'success',
        `Menu saved successfully for ${formatDate(selectedDate)}!`
      );

      await fetchExistingMenus();
    } catch (error) {
      console.error('Error saving menu:', error);
      showMessage('error', 'Failed to save menu. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMenu = async (date) => {
    if (!window.confirm(`Are you sure you want to delete the menu for ${formatDate(date)}?`)) {
      return;
    }

    try {
      const menuRef = doc(db, 'menus', date);
      await deleteDoc(menuRef);

      showMessage('success', 'Menu deleted successfully');
      fetchExistingMenus();

      if (date === selectedDate) {
        setMenuItems({
          breakfast: [],
          lunch: [],
          snacks: [],
          dinner: []
        });
      }
    } catch (error) {
      console.error('Error deleting menu:', error);
      showMessage('error', 'Failed to delete menu');
    }
  };

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 5000);
  };

  const getTotalItems = () => {
    return menuItems.breakfast.length + menuItems.lunch.length + menuItems.snacks.length + menuItems.dinner.length;
  };
  // Pagination calculations
const totalPages = Math.ceil(existingMenus.length / MENUS_PER_PAGE);
const paginatedMenus = existingMenus.slice(
  (currentPage - 1) * MENUS_PER_PAGE,
  currentPage * MENUS_PER_PAGE
);

const goToNextPage = () => {
  if (currentPage < totalPages) setCurrentPage(currentPage + 1);
};

const goToPreviousPage = () => {
  if (currentPage > 1) setCurrentPage(currentPage - 1);
};


  return (
    <div className="menu-manager">
      {message.text && (
        <div className={`message ${message.type}`}>
          {message.type === 'success' && '✓'}
          {message.type === 'error' && '⚠'}
          {message.type === 'info' && 'ℹ'}
          {' '}{message.text}
        </div>
      )}

      <div className="menu-editor">
        <div className="editor-header">
          <div className="date-selector">
            <label>📅 Select Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              min={getLocalDateString()}
            />
            <span className="selected-date-display">
              {selectedDate && formatDate(selectedDate)}
            </span>
          </div>

          <div className="menu-stats">
            <div className="stat-box">
              <span className="stat-label">Total Items</span>
              <span className="stat-value">{getTotalItems()}</span>
            </div>
          </div>
        </div>

        <div className="meals-editor">
          {/* Breakfast Section */}
          <div className="meal-section">
            <div className="meal-section-header">
              <h3>🌅 Breakfast</h3>
              <span className="item-count">{menuItems.breakfast.length} items</span>
            </div>

            <div className="add-item-form">
              <input
                type="text"
                placeholder="Add breakfast item (e.g., Idli, Sambar)"
                value={currentItem.breakfast}
                onChange={(e) => setCurrentItem(prev => ({ ...prev, breakfast: e.target.value }))}
                onKeyPress={(e) => e.key === 'Enter' && handleAddItem('breakfast')}
              />
              <button
                className="btn btn-primary"
                onClick={() => handleAddItem('breakfast')}
              >
                Add
              </button>
            </div>

            <div className="items-list">
              {menuItems.breakfast.length === 0 ? (
                <p className="empty-list">No breakfast items added yet</p>
              ) : (
                menuItems.breakfast.map((item, index) => (
                  <div key={index} className="item-tag menu-item-row">

                    <span className="menu-item-name">
                      {item.name}
                    </span>

                    <div className="menu-item-controls">

                      <label className="availability-toggle">
                        <input
                          type="checkbox"
                          checked={item.available}
                          onChange={() =>
                            handleAvailabilityChange('breakfast', index)
                          }
                        />
                        <span className="toggle-slider"></span>
                      </label>

                      <span className="availability-text">
                        {item.available ? 'Available' : 'Unavailable'}
                      </span>

                      <label className="quantity-label">
                        Qty:
                      </label>

                      <input
                        type="number"
                        min="0"
                        value={item.quantity}
                        onChange={(e) =>
                          handleQuantityChange(
                            'breakfast',
                            index,
                            e.target.value
                          )
                        }
                        className="quantity-input"
                      />

                      <button
                        className="remove-btn"
                        onClick={() =>
                          handleRemoveItem('breakfast', index)
                        }
                      >
                        ×
                      </button>

                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Lunch Section */}
          <div className="meal-section">
            <div className="meal-section-header">
              <h3>🌞 Lunch</h3>
              <span className="item-count">{menuItems.lunch.length} items</span>
            </div>

            <div className="add-item-form">
              <input
                type="text"
                placeholder="Add lunch item (e.g., Rice, Dal, Sabzi)"
                value={currentItem.lunch}
                onChange={(e) => setCurrentItem(prev => ({ ...prev, lunch: e.target.value }))}
                onKeyPress={(e) => e.key === 'Enter' && handleAddItem('lunch')}
              />
              <button
                className="btn btn-primary"
                onClick={() => handleAddItem('lunch')}
              >
                Add
              </button>
            </div>

            <div className="items-list">
              {menuItems.lunch.length === 0 ? (
                <p className="empty-list">No lunch items added yet</p>
              ) : (
                menuItems.lunch.map((item, index) => (
                  <div key={index} className="item-tag menu-item-row">

                    <span className="menu-item-name">
                      {item.name}
                    </span>

                    <div className="menu-item-controls">

                      <label className="availability-toggle">
                        <input
                          type="checkbox"
                          checked={item.available}
                          onChange={() =>
                            handleAvailabilityChange('lunch', index)
                          }
                        />
                        <span className="toggle-slider"></span>
                      </label>

                      <span className="availability-text">
                        {item.available ? 'Available' : 'Unavailable'}
                      </span>

                      <label className="quantity-label">
                        Qty:
                      </label>

                      <input
                        type="number"
                        min="0"
                        value={item.quantity}
                        onChange={(e) =>
                          handleQuantityChange(
                            'lunch',
                            index,
                            e.target.value
                          )
                        }
                        className="quantity-input"
                      />

                      <button
                        className="remove-btn"
                        onClick={() =>
                          handleRemoveItem('lunch', index)
                        }
                      >
                        ×
                      </button>

                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Snacks Section */}
          <div className="meal-section">
            <div className="meal-section-header">
              <h3>🌙 Snacks</h3>
              <span className="item-count">{menuItems.snacks.length} items</span>
            </div>

            <div className="add-item-form">
              <input
                type="text"
                placeholder="Add snacks item (e.g., Tea, Biscuits)"
                value={currentItem.snacks}
                onChange={(e) => setCurrentItem(prev => ({ ...prev, snacks: e.target.value }))}
                onKeyPress={(e) => e.key === 'Enter' && handleAddItem('snacks')}
              />
              <button
                className="btn btn-primary"
                onClick={() => handleAddItem('snacks')}
              >
                Add
              </button>
            </div>

            <div className="items-list">
              {menuItems.snacks.length === 0 ? (
                <p className="empty-list">No snacks items added yet</p>
              ) : (
                menuItems.snacks.map((item, index) => (
                  <div key={index} className="item-tag menu-item-row">

                    <span className="menu-item-name">
                      {item.name}
                    </span>

                    <div className="menu-item-controls">

                      <label className="availability-toggle">
                        <input
                          type="checkbox"
                          checked={item.available}
                          onChange={() =>
                            handleAvailabilityChange('snacks', index)
                          }
                        />
                        <span className="toggle-slider"></span>
                      </label>

                      <span className="availability-text">
                        {item.available ? 'Available' : 'Unavailable'}
                      </span>

                      <label className="quantity-label">
                        Qty:
                      </label>

                      <input
                        type="number"
                        min="0"
                        value={item.quantity}
                        onChange={(e) =>
                          handleQuantityChange(
                            'snacks',
                            index,
                            e.target.value
                          )
                        }
                        className="quantity-input"
                      />

                      <button
                        className="remove-btn"
                        onClick={() =>
                          handleRemoveItem('snacks', index)
                        }
                      >
                        ×
                      </button>

                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Dinner Section */}
          <div className="meal-section">
            <div className="meal-section-header">
              <h3>🍽️ Dinner</h3>
              <span className="item-count">{menuItems.dinner.length} items</span>
            </div>

            <div className="add-item-form">
              <input
                type="text"
                placeholder="Add dinner item (e.g., Roti, Curry)"
                value={currentItem.dinner}
                onChange={(e) => setCurrentItem(prev => ({ ...prev, dinner: e.target.value }))}
                onKeyPress={(e) => e.key === 'Enter' && handleAddItem('dinner')}
              />
              <button
                className="btn btn-primary"
                onClick={() => handleAddItem('dinner')}
              >
                Add
              </button>
            </div>

            <div className="items-list">
              {menuItems.dinner.length === 0 ? (
                <p className="empty-list">No dinner items added yet</p>
              ) : (
                menuItems.dinner.map((item, index) => (
                  <div key={index} className="item-tag menu-item-row">

                    <span className="menu-item-name">
                      {item.name}
                    </span>

                    <div className="menu-item-controls">

                      <label className="availability-toggle">
                        <input
                          type="checkbox"
                          checked={item.available}
                          onChange={() =>
                            handleAvailabilityChange('dinner', index)
                          }
                        />
                        <span className="toggle-slider"></span>
                      </label>

                      <span className="availability-text">
                        {item.available ? 'Available' : 'Unavailable'}
                      </span>

                      <label className="quantity-label">
                        Qty:
                      </label>

                      <input
                        type="number"
                        min="0"
                        value={item.quantity}
                        onChange={(e) =>
                          handleQuantityChange(
                            'dinner',
                            index,
                            e.target.value
                          )
                        }
                        className="quantity-input"
                      />

                      <button
                        className="remove-btn"
                        onClick={() =>
                          handleRemoveItem('dinner', index)
                        }
                      >
                        ×
                      </button>

                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="save-section">
          <button
            className="btn btn-primary btn-large"
            onClick={handleSaveMenu}
            disabled={loading || getTotalItems() === 0}
          >
            {loading ? 'Saving...' : 'Save Menu'}
          </button>
        </div>
      </div>

      {/* Existing Menus List */}
      <div className="existing-menus">
        <h3>📚 Existing Menus</h3>
        {existingMenus.length === 0 ? (
          <p className="empty-state">No menus created yet</p>
        ) : (
          <div className="menus-list">
            {paginatedMenus.map(menu => (
              <div key={menu.date} className="menu-card-small">
                <div className="menu-card-header">
                  <h4>{formatDate(menu.date)}</h4>
                  {/* <span className="menu-date-code">{menu.date}</span> */}
                </div>
                <div className="menu-summary">
                  <span>🌅 {menu.breakfast?.length || 0}</span>
                  <span>🌞 {menu.lunch?.length || 0}</span>
                  <span>🌙 {menu.snacks?.length || 0}</span>
                  <span>🍽️ {menu.dinner?.length || 0}</span>
                </div>
                <div className="menu-actions">
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setSelectedDate(menu.date)}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn-secondary btn-sm delete-btn"
                    onClick={() => handleDeleteMenu(menu.date)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="pagination-controls">
            <button
              className="btn btn-secondary btn-sm"
              onClick={goToPreviousPage}
              disabled={currentPage === 1}
            >
              ← Previous
            </button>
            <span className="pagination-info">
              Page {currentPage} of {totalPages}
            </span>
            <button
              className="btn btn-secondary btn-sm"
              onClick={goToNextPage}
              disabled={currentPage === totalPages}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MenuManager;