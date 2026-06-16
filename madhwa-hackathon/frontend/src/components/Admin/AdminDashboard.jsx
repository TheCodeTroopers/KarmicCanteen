// src/components/Admin/AdminDashboard.jsx
import React from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { Settings, BarChart3, UtensilsCrossed, TrendingUp, Cpu, Megaphone, Settings2 } from 'lucide-react';
import AnalyticsDashboard from './AnalyticsDashboard';
import MenuManager from './MenuManager';
import ReportsDashboard from './ReportsDashboard';
import AdminSettings from './AdminSettings';
import PredictionsDashboard from './PredictionsDashboard';
import FestivalAnnouncements from './FestivalAnnouncements';
import './AdminDashboard.css';

const AdminDashboard = () => {
  return (
    <div className="admin-dashboard">
      <div className="admin-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Settings size={28} className="header-icon" style={{ color: 'var(--accent-primary)' }} />
          <h1>Admin Dashboard</h1>
        </div>
        <p className="subtitle">Manage menus and view reports</p>
      </div>

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
          to="/admin/reports" 
          className={({ isActive }) => isActive ? 'tab active' : 'tab'}
        >
          <TrendingUp size={16} /> Reports
        </NavLink>
        <NavLink 
          to="/admin/predictions" 
          className={({ isActive }) => isActive ? 'tab active' : 'tab'}
        >
          <Cpu size={16} /> AI Predictions
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
          <Route path="reports" element={<ReportsDashboard />} />
          <Route path="predictions" element={<PredictionsDashboard />} />
          <Route path="announcements" element={<FestivalAnnouncements />} />
          <Route path="settings" element={<AdminSettings />} />
        </Routes>
      </div>
    </div>
  );
};

export default AdminDashboard;
