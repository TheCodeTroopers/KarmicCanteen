/**
 * Working Mode Selector Component
 * 
 * Prompts users to select their working mode (Office/Home)
 * Shows on first login and can be changed until deadline
 */

import React, { useState } from 'react';
import './WorkingModeSelector.css';

const WorkingModeSelector = ({ onModeSelect, currentMode, canChange }) => {
  const [selectedMode, setSelectedMode] = useState(currentMode || null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleModeSelect = (mode) => {
    if (!canChange && currentMode) {
      return; // Can't change after deadline
    }
    setSelectedMode(mode);
  };

  const handleSubmit = async () => {
    if (!selectedMode) return;
    
    setIsSubmitting(true);
    try {
      await onModeSelect(selectedMode);
    } catch (error) {
      console.error('Error setting working mode:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="working-mode-overlay">
      <div className="working-mode-modal">
        <div className="mode-header">
          <div className="mode-icon">🏢</div>
          <h2>Select Working Mode</h2>
          <p className="mode-subtitle">Please select where you will be working from today</p>
        </div>

        <div className="mode-options">
          {/* Office Mode */}
          <button
            className={`mode-option ${selectedMode === 'office' ? 'selected' : ''}`}
            onClick={() => handleModeSelect('office')}
            disabled={!canChange && currentMode && currentMode !== 'office'}
          >
            <div className="mode-option-icon">🏢</div>
            <div className="mode-option-content">
              <h3>Working from Office</h3>
              <p>You will be attending office and can select your canteen meals</p>
            </div>
            {selectedMode === 'office' && (
              <div className="mode-check">✓</div>
            )}
          </button>

          {/* Home Mode */}
          <button
            className={`mode-option ${selectedMode === 'home' ? 'selected' : ''}`}
            onClick={() => handleModeSelect('home')}
            disabled={!canChange && currentMode && currentMode !== 'home'}
          >
            <div className="mode-option-icon">🏠</div>
            <div className="mode-option-content">
              <h3>Working from Home</h3>
              <p>You will be working remotely today (no meal ordering)</p>
            </div>
            {selectedMode === 'home' && (
              <div className="mode-check">✓</div>
            )}
          </button>
        </div>

        {!canChange && currentMode && (
          <div className="mode-warning">
            <span className="warning-icon">⚠️</span>
            <p>The deadline to change your working mode has passed for today.</p>
          </div>
        )}

        <div className="mode-actions">
          <button
            className="btn btn-primary btn-full"
            onClick={handleSubmit}
            disabled={!selectedMode || isSubmitting || (!canChange && currentMode)}
          >
            {isSubmitting ? 'Confirming...' : 'Confirm Working Mode'}
          </button>
          
          {canChange && currentMode && (
            <p className="mode-help-text">
              💡 You can update this mode before the morning cut-off time.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default WorkingModeSelector;
