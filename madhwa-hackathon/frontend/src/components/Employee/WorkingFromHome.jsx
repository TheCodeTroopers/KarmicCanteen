/**
 * Working From Home Component
 * 
 * Displays when user selects "Working from Home"
 * Shows a friendly message and option to change mode
 */

import React from 'react';
import './WorkingFromHome.css';

const WorkingFromHome = ({ onChangeMode, canChange, deadline }) => {
  return (
    <div className="working-from-home">
      <div className="wfh-card">
        <div className="wfh-icon-container">
          <div className="wfh-icon">🏠</div>
          <div className="wfh-icon-bg"></div>
        </div>

        <h1 className="wfh-title">Working from Home Today</h1>
        <p className="wfh-message">You have marked your status as Working from Home for today.</p>

        <div className="wfh-info-box">
          <div className="info-item">
            <span className="info-icon">📍</span>
            <div className="info-content">
              <strong>Location</strong>
              <p>Home</p>
            </div>
          </div>

          <div className="info-item">
            <span className="info-icon">🍽️</span>
            <div className="info-content">
              <strong>Meal Status</strong>
              <p>No meals booked</p>
            </div>
          </div>

          {deadline && (
            <div className="info-item">
              <span className="info-icon">⏰</span>
              <div className="info-content">
                <strong>Can change mode until</strong>
                <p>{deadline}</p>
              </div>
            </div>
          )}
        </div>

        {canChange ? (
          <div className="wfh-actions">
            <button
              className="btn btn-primary btn-full"
              onClick={onChangeMode}
            >
              Change to Working from Office
            </button>
            <p className="wfh-help-text">
              💡 You can switch to office mode before the daily cut-off time.
            </p>
          </div>
        ) : (
          <div className="wfh-locked">
            <span className="lock-icon">🔒</span>
            <p>The cut-off time to change your working mode has passed for today.</p>
          </div>
        )}

        <div className="wfh-tips">
          <h3>Remote Work Guidelines</h3>
          <ul>
            <li>
              <span className="tip-icon">✅</span>
              Ensure you are connected to your team communication channels.
            </li>
            <li>
              <span className="tip-icon">✅</span>
              Take regular breaks and stay hydrated during your workday.
            </li>
            <li>
              <span className="tip-icon">✅</span>
              Update your task status before the end of the day.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default WorkingFromHome;
