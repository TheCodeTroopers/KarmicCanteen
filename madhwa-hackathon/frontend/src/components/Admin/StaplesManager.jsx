// src/components/Admin/StaplesManager.jsx
// Manages the "Daily Staples" — items that are always available (e.g. Tea,
// Coffee, Bread & Butter) regardless of what the day's special menu is.
// Stored once at dailyStaples/config and merged into the employee-facing0
import React, { useState, useEffect } from 'react';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Coffee, Soup, Cookie, ChefHat, Info, Check, AlertTriangle } from 'lucide-react';
import './StaplesManager.css';

const MEAL_TYPES = [
  { key: 'breakfast', label: 'Breakfast', icon: Coffee, placeholder: 'e.g., Tea, Coffee, Bread & Butter' },
  { key: 'lunch', label: 'Lunch', icon: Soup, placeholder: 'e.g., Curd Rice, Pickle, Papad' },
  { key: 'snacks', label: 'Snacks', icon: Cookie, placeholder: 'e.g., Tea, Coffee, Biscuits' },
  { key: 'dinner', label: 'Dinner', icon: ChefHat, placeholder: 'e.g., Curd Rice, Buttermilk' },
];

const EMPTY_STAPLES = { breakfast: [], lunch: [], snacks: [], dinner: [] };

const StaplesManager = () => {
  const [staples, setStaples] = useState(EMPTY_STAPLES);
  const [currentItem, setCurrentItem] = useState({ breakfast: '', lunch: '', snacks: '', dinner: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    loadStaples();
  }, []);

  const loadStaples = async () => {
    try {
      setLoading(true);
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
      showMessage('error', 'Failed to load daily staples');
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 4000);
  };

  const handleAddItem = (mealType) => {
    const item = currentItem[mealType].trim();
    if (!item) {
      showMessage('error', 'Please enter an item name');
      return;
    }
    if (staples[mealType].some(existing => existing.toLowerCase() === item.toLowerCase())) {
      showMessage('error', 'This item is already in the always-available list');
      return;
    }
    setStaples(prev => ({ ...prev, [mealType]: [...prev[mealType], item] }));
    setCurrentItem(prev => ({ ...prev, [mealType]: '' }));
  };

  const handleRemoveItem = (mealType, index) => {
    setStaples(prev => ({
      ...prev,
      [mealType]: prev[mealType].filter((_, i) => i !== index),
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const ref = doc(db, 'dailyStaples', 'config');
      await setDoc(ref, {
        ...staples,
        updatedAt: new Date().toISOString(),
      });
      showMessage('success', 'Daily staples saved! These will now show up every day.');
    } catch (error) {
      console.error('Error saving daily staples:', error);
      showMessage('error', 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const totalItems = MEAL_TYPES.reduce((sum, m) => sum + staples[m.key].length, 0);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading daily staples...</p>
      </div>
    );
  }

  return (
    <div className="staples-manager">
      <div className="staples-intro">
        <div className="staples-intro-icon"><Info size={18} /></div>
        <div>
          <h3>Daily Staples (Always Available)</h3>
          <p>
            Set this up once. These items appear every single day for employees to choose from,
            in addition to whatever special menu you add for a specific date — no need to
            re-add "Tea" or "Coffee" every day.
          </p>
        </div>
      </div>

      {message.text && (
        <div className={`message ${message.type}`}>
          {message.type === 'success' && <Check size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />}
          {message.type === 'error' && <AlertTriangle size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />}
          {message.text}
        </div>
      )}

      <div className="staples-editor">
        <div className="staples-header-row">
          <span className="staples-total-badge">{totalItems} always-available items</span>
        </div>

        <div className="staples-grid">
          {MEAL_TYPES.map(({ key, label, icon: Icon, placeholder }) => (
            <div className="staple-section" key={key}>
              <div className="staple-section-header">
                <span className="staple-section-title">
                  <Icon size={16} style={{ color: 'var(--accent-primary)' }} />
                  {label}
                </span>
                <span className="item-count">{staples[key].length} items</span>
              </div>

              <div className="add-item-form">
                <input
                  type="text"
                  placeholder={placeholder}
                  value={currentItem[key]}
                  onChange={(e) => setCurrentItem(prev => ({ ...prev, [key]: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddItem(key)}
                />
                <button className="btn btn-primary" onClick={() => handleAddItem(key)}>Add</button>
              </div>

              <div className="items-list">
                {staples[key].length === 0 ? (
                  <p className="empty-list">No {label.toLowerCase()} staples yet</p>
                ) : (
                  staples[key].map((item, index) => (
                    <div key={index} className="item-tag staple-tag">
                      <span>{item}</span>
                      <button className="remove-btn" onClick={() => handleRemoveItem(key, index)}>×</button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="save-section">
          <button className="btn btn-primary btn-large" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Daily Staples'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StaplesManager;