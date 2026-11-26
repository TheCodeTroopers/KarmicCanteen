// src/components/Admin/AdminDashboard.jsx
import React, { useState, useEffect } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { Settings, BarChart3, UtensilsCrossed, TrendingUp, Cpu, Megaphone, Settings2, Coffee, Users, Bell } from 'lucide-react';
import notificationService from '../../utils/notificationService';
import AnalyticsDashboard from './AnalyticsDashboard';
import MenuManager from './MenuManager';
import ReportsDashboard from './ReportsDashboard';
import AdminSettings from './AdminSettings';
import FestivalAnnouncements from './FestivalAnnouncements';
import DefaultMenuManager from './DefaultMenuManager';
import MealParticipationReport from '../Shared/MealParticipationReport';
import './AdminDashboard.css';

const AdminDashboard = () => {
  const [notificationPermission, setNotificationPermission] = useState(
    notificationService.isSupported() ? Notification.permission : 'unsupported'
  );
  const [pushAlert, setPushAlert] = useState('');

  // Register admin FCM token only when permission is granted.
  // This helper ensures the token registration runs after the service worker is ready
  // and provides detailed logging for troubleshooting.
  const registerAdminFcmIfAllowed = async () => {
    if (notificationPermission !== 'granted') {
      console.info('Admin notification permission not granted; skipping FCM registration.');
      return;
    }
    try {
      // Ensure the service worker is ready before token retrieval
      const swReady = await navigator.serviceWorker.ready;
      console.debug('ServiceWorker ready for admin FCM:', swReady.scope);
      await notificationService.registerFcmToken();
    } catch (err) {
      console.error('Admin FCM token registration failed:', {
        code: err?.code || 'unknown',
        message: err?.message || String(err),
      });
    }
  };

  useEffect(() => {
    // Run registration when component mounts or permission changes
    registerAdminFcmIfAllowed();

    let active = true;
    let unsubscribe = () => {};

    notificationService
      .onForegroundMessage((payload) => {
        if (!active) return;
        const title = payload?.notification?.title || payload?.data?.title || 'Karmic Canteen';
        const body = payload?.notification?.body || payload?.data?.body || '';
        notificationService.showNotification(title, {
          body,
          icon: '/icons/pwa-192x192.png',
          tag: payload?.data?.tag || payload?.messageId || undefined,
        });
        if (body) {
          setPushAlert(`${title}: ${body}`);
          setTimeout(() => {
            if (active) setPushAlert('');
          }, 6000);
        }
      })
      .then((unsub) => {
        if (active) {
          unsubscribe = unsub;
        } else {
          unsub();
        }
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [notificationPermission]);

  const handleEnableAdminNotifications = async () => {
    const granted = await notificationService.requestPermission();
    setNotificationPermission(
      notificationService.isSupported() ? Notification.permission : 'unsupported'
    );
    if (granted) {
      await notificationService.registerFcmToken();
      setPushAlert('Push notifications enabled for admin alerts.');
      setTimeout(() => setPushAlert(''), 5000);
    }
  };

  return (
    <div className="admin-dashboard">
      <div className="admin-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Settings size={28} className="header-icon" style={{ color: 'var(--accent-primary)' }} />
            <h1>Admin Dashboard</h1>
          </div>
          {notificationPermission === 'default' && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleEnableAdminNotifications}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Bell size={14} /> Enable Push Alerts
            </button>
          )}
        </div>
        <p className="subtitle">Manage menus and view reports</p>
      </div>

      {pushAlert && (
        <div className="message info" style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Bell size={16} />
          <span>{pushAlert}</span>
        </div>
      )}

      <div className="admin-tabs">
        <NavLink
          to="/admin/analytics"
          className={({ isActive }) => isActive ? 'tab active' : 'tab'}
        >
          <BarChart3 size={16} /> Analytics
        </NavLink>
        <NavLink
          to="/admin/menu"
          className={({ isActive }) => isActive ? 'tab active' : 'tab'}
        >
          <UtensilsCrossed size={16} /> Menu
        </NavLink>
        <NavLink
          to="/admin/default-menu"
          className={({ isActive }) => isActive ? 'tab active' : 'tab'}
        >
          <Coffee size={16} /> Default Menu
        </NavLink>
        <NavLink
          to="/admin/meal-participation"
          className={({ isActive }) => isActive ? 'tab active' : 'tab'}
        >
          <Users size={16} /> Meal Participation
        </NavLink>
        <NavLink
          to="/admin/reports"
          className={({ isActive }) => isActive ? 'tab active' : 'tab'}
        >
          <TrendingUp size={16} /> Reports
        </NavLink>
        <NavLink
          to="/admin/announcements"
          className={({ isActive }) => isActive ? 'tab active' : 'tab'}
        >
          <Megaphone size={16} /> Announcements
        </NavLink>
        <NavLink
          to="/admin/settings"
          className={({ isActive }) => isActive ? 'tab active' : 'tab'}
        >
          <Settings2 size={16} /> Settings
        </NavLink>
      </div>

      <div className="admin-content">
        <Routes>
          <Route index element={<Navigate to="analytics" replace />} />
          <Route path="analytics" element={<AnalyticsDashboard />} />
          <Route path="menu" element={<MenuManager />} />
          <Route path="default-menu" element={<DefaultMenuManager />} />
          <Route path="staples" element={<DefaultMenuManager />} />
          <Route path="reports" element={<ReportsDashboard />} />
          <Route path="meal-participation" element={<MealParticipationReport />} />
          <Route path="announcements" element={<FestivalAnnouncements />} />
          <Route path="settings" element={<AdminSettings />} />
        </Routes>
      </div>
    </div>
  );
};

export default AdminDashboard;
