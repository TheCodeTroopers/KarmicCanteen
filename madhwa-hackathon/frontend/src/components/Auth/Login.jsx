// src/components/Auth/Login.jsx
import React, { useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { useAuth } from '../../context/AuthContext';
import { auth } from '../../firebase/config';
import './Login.css';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setError('');
      setSuccess('');
      setLoading(true);
      await login(email, password);

      // Navigation will be handled by App.js based on role
      // User will be automatically redirected after successful login

    } catch (err) {
      console.error('Login error code:', err.code);
      console.error('Login error message:', err.message);
      console.error('Full login error:', err);

      // User-friendly error messages
      switch (err.code) {
        case 'auth/user-not-found':
          setError('User not found. Please check your email.');
          break;

        case 'auth/wrong-password':
          setError('Incorrect password. Please try again.');
          break;

        case 'auth/invalid-credential':
          setError('Invalid login credentials. Please check your email and password.');
          break;

        case 'auth/too-many-requests':
          setError('Too many failed attempts. Please try again later.');
          break;

        case 'auth/network-request-failed':
          setError('Network error. Please check your internet connection.');
          break;

        default:
          setError('Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Please enter your registered email address.');
      return;
    }

    try {
      setError('');
      setSuccess('');
      setLoading(true);
      await sendPasswordResetEmail(auth, trimmedEmail);
      setSuccess('Password reset link sent! Please check your email inbox.');
    } catch (err) {
      console.error('Password reset error code:', err.code);
      console.error('Password reset error message:', err.message);

      switch (err.code) {
        case 'auth/user-not-found':
          setError('No user found with this email address.');
          break;

        case 'auth/invalid-email':
          setError('Please enter a valid email address.');
          break;

        case 'auth/missing-email':
          setError('Please enter your registered email address.');
          break;

        case 'auth/too-many-requests':
          setError('Too many requests. Please try again later.');
          break;

        case 'auth/network-request-failed':
          setError('Network error. Please check your internet connection.');
          break;

        default:
          setError('Failed to send reset email. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <img src="/logo.png" alt="Karmic Canteen Logo" className="login-logo" />
          <h1>Karmic Canteen</h1>
        </div>
        <p className="subtitle">
          {isForgotPassword ? 'Reset your password' : 'Good food good taste'}
        </p>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        {isForgotPassword ? (
          <form onSubmit={handleForgotPassword}>
            <div className="form-group">
              <label>Registered Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your registered email"
                required
                autoComplete="email"
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-full"
              disabled={loading}
            >
              {loading ? 'Sending link...' : 'Send Reset Link'}
            </button>

            <div className="back-to-login-container">
              <button
                type="button"
                className="back-to-login-link"
                onClick={() => {
                  setIsForgotPassword(false);
                  setError('');
                  setSuccess('');
                }}
              >
                ← Back to Sign In
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your email"
                required
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                required
                autoComplete="current-password"
              />
              <div className="forgot-password-link-container">
                <button
                  type="button"
                  className="forgot-password-link"
                  onClick={() => {
                    setIsForgotPassword(true);
                    setError('');
                    setSuccess('');
                  }}
                >
                  Forgot Password?
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-full"
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        )}

        {/* Development Helper - Remove in production */}
        {!isForgotPassword && import.meta.env.DEV && (
          <div className="test-credentials">
            <p style={{ fontSize: '12px', color: '#666', marginTop: '16px' }}>
              Test logins
            </p>
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setEmail('employee@sode-edu.in');
                  setPassword('employee@123');
                }}
                style={{ fontSize: '12px', padding: '6px 12px', flex: 1 }}
              >
                Employee
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setEmail('admin@sode-edu.in');
                  setPassword('admin@123');
                }}
                style={{ fontSize: '12px', padding: '6px 12px', flex: 1 }}
              >
                Admin
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;
