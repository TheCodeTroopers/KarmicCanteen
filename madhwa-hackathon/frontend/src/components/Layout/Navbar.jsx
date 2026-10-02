// src/components/Layout/Navbar.jsx
import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Crown, User } from 'lucide-react';
import './Navbar.css';

const Navbar = () => {
  const { currentUser, logout, userRole } = useAuth();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Failed to logout', error);
    }
  };

  // Close mobile menu when user performs action
  const handleMenuItemClick = () => {
    setIsMobileMenuOpen(false);
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        {/* Logo & Brand */}
        <div className="navbar-brand">
          <img
            src="/logo.png"
            alt="Karmic Canteen Logo"
            className="navbar-logo"
          />
          <div className="brand-text">
            <h1>Karmic Canteen</h1>
            <span className={`role-badge ${userRole}`}>
              {userRole === 'admin' ? (
                <>
                  <Crown size={14} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                  Admin
                </>
              ) : (
                <>
                  <User size={14} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                  Student
                </>
              )}
            </span>
          </div>
        </div>

        {/* Mobile Menu Toggle */}
        <button
          className="mobile-menu-toggle"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label="Toggle menu"
          aria-expanded={isMobileMenuOpen}
        >
          <span className="hamburger-icon"></span>
          <span className="hamburger-icon"></span>
          <span className="hamburger-icon"></span>
        </button>

        {/* Navbar Actions */}
        <div className={`navbar-actions ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
          <div className="user-info">
            <span className="user-email" title={currentUser?.email}>
              {currentUser?.email}
            </span>
          </div>
          
          <button
            onClick={() => {
              handleLogout();
              handleMenuItemClick();
            }}
            className="btn btn-secondary"
            aria-label="Log Out"
          >
            Log Out
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
