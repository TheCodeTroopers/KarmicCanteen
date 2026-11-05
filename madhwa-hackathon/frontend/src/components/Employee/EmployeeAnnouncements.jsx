// src/components/Employee/EmployeeAnnouncements.jsx
import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Megaphone, X } from 'lucide-react';
import './EmployeeAnnouncements.css';

// Show the latest few announcements from the last 30 days, so old
// festival notices don't stay on the dashboard forever.
const MAX_ANNOUNCEMENTS = 3;
const MAX_AGE_DAYS = 30;
const DISMISSED_KEY = 'dismissedAnnouncements';

const loadDismissed = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]'));
  } catch {
    return new Set();
  }
};

const EmployeeAnnouncements = () => {
  const [announcements, setAnnouncements] = useState([]);
  const [dismissed, setDismissed] = useState(loadDismissed);

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - MAX_AGE_DAYS);

      // timestamp is stored as an ISO string, so string comparison orders by time
      const q = query(
        collection(db, 'announcements'),
        where('timestamp', '>=', cutoff.toISOString()),
        orderBy('timestamp', 'desc'),
        limit(MAX_ANNOUNCEMENTS)
      );
      const snapshot = await getDocs(q);
      setAnnouncements(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
      console.error('Error fetching announcements:', error);
    }
  };

  const handleDismiss = (id) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]));
    } catch {
      // Storage unavailable (e.g. private mode); dismissal lasts for this session only
    }
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const visible = announcements.filter(a => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  return (
    <div className="employee-announcements">
      {visible.map(announcement => (
        <div key={announcement.id} className="announcement-banner">
          <div className="announcement-icon">
            <Megaphone size={20} style={{ color: 'var(--accent-primary)' }} />
          </div>
          <div className="announcement-body">
            <div className="announcement-title-row">
              <strong>{announcement.title}</strong>
              <span className="announcement-date">{formatDate(announcement.timestamp)}</span>
            </div>
            <p>{announcement.message}</p>
          </div>
          <button
            className="announcement-dismiss"
            onClick={() => handleDismiss(announcement.id)}
            aria-label="Dismiss announcement"
            title="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
};

export default EmployeeAnnouncements;
