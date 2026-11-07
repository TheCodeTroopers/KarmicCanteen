// src/App.jsx
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ROLES } from './utils/roles';
import Login from './components/Auth/Login';
import EmployeeDashboard from './components/Employee/EmployeeDashboard';
import AdminDashboard from './components/Admin/AdminDashboard';
import SuperAdminDashboard from './components/SuperAdmin/SuperAdminDashboard';
import Navbar from './components/Layout/Navbar';
import PWAPrompt from './components/Common/PWAPrompt';
import './App.css';

// Home dashboard for each role. Unknown/missing roles have no dashboard.
const DASHBOARD_PATHS = {
  [ROLES.EMPLOYEE]: '/employee',
  [ROLES.ADMIN]: '/admin',
  [ROLES.SUPER_ADMIN]: '/super-admin'
};

const dashboardPathFor = (role) => DASHBOARD_PATHS[role] || null;

const LoadingScreen = () => (
  <div className="loading-container">
    <div className="spinner"></div>
    <p>Loading...</p>
  </div>
);

// Shown to signed-in users whose Firestore role is missing or unrecognized.
// (Redirecting them would loop, since no dashboard accepts them.)
const NoAccess = () => (
  <div className="loading-container">
    <p>Your account has no role assigned. Please contact your administrator.</p>
  </div>
);

// Sends a signed-in user to the dashboard for their role.
const RoleRedirect = () => {
  const { userRole } = useAuth();
  const path = dashboardPathFor(userRole);
  return path ? <Navigate to={path} replace /> : <NoAccess />;
};

// Protected Route Component
// allowedRoles: roles permitted on this route. Omit to allow any signed-in user.
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { currentUser, userRole, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(userRole)) {
    // Wrong role for this route: send them to their own dashboard.
    return <RoleRedirect />;
  }

  return children;
};

// Main App Component
function AppContent() {
  const { currentUser, loading } = useAuth();

  // Show loading spinner while checking auth
  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <Router>
      <div className="app">
        <PWAPrompt />
        {currentUser && <Navbar />}

        <div className="main-content">
          <Routes>
            {/* Public Route - Login (signed-in users go to their dashboard) */}
            <Route
              path="/login"
              element={currentUser ? <RoleRedirect /> : <Login />}
            />

            {/* Home Route - Redirects based on role */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <RoleRedirect />
                </ProtectedRoute>
              }
            />

            {/* Employee Routes - Only accessible by employees */}
            <Route
              path="/employee/*"
              element={
                <ProtectedRoute allowedRoles={[ROLES.EMPLOYEE]}>
                  <EmployeeDashboard />
                </ProtectedRoute>
              }
            />

            {/* Legacy student URLs redirect to the employee dashboard */}
            <Route path="/student/*" element={<Navigate to="/employee" replace />} />

            {/* Admin Routes - Only accessible by admins */}
            <Route
              path="/admin/*"
              element={
                <ProtectedRoute allowedRoles={[ROLES.ADMIN]}>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />

            {/* Super Admin Routes - Only accessible by super admins */}
            <Route
              path="/super-admin/*"
              element={
                <ProtectedRoute allowedRoles={[ROLES.SUPER_ADMIN]}>
                  <SuperAdminDashboard />
                </ProtectedRoute>
              }
            />

            {/* 404 Route - Redirect to appropriate dashboard */}
            <Route
              path="*"
              element={
                currentUser ? (
                  <Navigate to="/" replace />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
