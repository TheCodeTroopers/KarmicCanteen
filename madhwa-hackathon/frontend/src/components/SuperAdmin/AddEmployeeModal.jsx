// src/components/SuperAdmin/AddEmployeeModal.jsx
import React, { useState, useEffect } from 'react';
import { X, UserPlus, Mail, User, Building, IdCard, AlertCircle, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import { DEPARTMENTS } from './mockEmployees';

const AddEmployeeModal = ({ isOpen, onClose, onAddEmployee, loading = false, existingEmployees = [] }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    employeeId: '',
    department: DEPARTMENTS[0]
  });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (isOpen) {
      setFormData({
        name: '',
        email: '',
        password: '',
        employeeId: '',
        department: DEPARTMENTS[0] || 'Engineering'
      });
      setShowPassword(false);
      setErrors({});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const validate = () => {
    const errs = {};
    const trimmedName = formData.name.trim();
    const trimmedEmail = formData.email.trim().toLowerCase();
    const trimmedEmpId = formData.employeeId.trim().toUpperCase();

    if (!trimmedName) {
      errs.name = 'Full name is required';
    }

    if (!trimmedEmail) {
      errs.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errs.email = 'Enter a valid email address';
    } else if (existingEmployees.some((emp) => (emp.email || '').trim().toLowerCase() === trimmedEmail)) {
      errs.email = 'An employee with this email already exists';
    }

    if (!formData.password) {
      errs.password = 'Temporary password is required';
    } else if (formData.password.length < 6) {
      errs.password = 'Password must be at least 6 characters';
    }

    if (!trimmedEmpId) {
      errs.employeeId = 'Employee ID is required';
    } else if (existingEmployees.some((emp) => (emp.employeeId || '').trim().toUpperCase() === trimmedEmpId)) {
      errs.employeeId = 'An employee with this ID already exists';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (loading || !validate()) return;

    onAddEmployee({
      name: formData.name.trim(),
      email: formData.email.trim().toLowerCase(),
      password: formData.password,
      employeeId: formData.employeeId.trim().toUpperCase(),
      department: formData.department,
      role: 'employee'
    });
  };

  const handleClose = () => {
    if (loading) return;
    setShowPassword(false);
    setErrors({});
    onClose();
  };

  return (
    <div className="superadmin-modal-overlay" onClick={handleClose}>
      <div
        className="superadmin-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-employee-title"
      >
        <div className="superadmin-modal-header">
          <div className="modal-title-wrap">
            <div className="modal-icon-badge">
              <UserPlus size={20} />
            </div>
            <div>
              <h2 id="add-employee-title" className="modal-title">Add New Employee</h2>
              <p className="modal-subtitle">Create a new employee profile in Karmic Canteen</p>
            </div>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={handleClose}
            aria-label="Close modal"
            disabled={loading}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="superadmin-form">
          <div className="form-group">
            <label htmlFor="name" className="form-label">
              <User size={14} className="form-label-icon" /> Full Name
            </label>
            <input
              id="name"
              type="text"
              placeholder="e.g. Aarav Sharma"
              className={`form-input ${errors.name ? 'input-error' : ''}`}
              value={formData.name}
              onChange={(e) => {
                setFormData({ ...formData, name: e.target.value });
                if (errors.name) setErrors({ ...errors, name: null });
              }}
              disabled={loading}
              autoFocus
            />
            {errors.name && (
              <span className="field-error">
                <AlertCircle size={12} /> {errors.name}
              </span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="email" className="form-label">
              <Mail size={14} className="form-label-icon" /> Email Address
            </label>
            <input
              id="email"
              type="email"
              placeholder="e.g. employee@karmicsolutions.com"
              className={`form-input ${errors.email ? 'input-error' : ''}`}
              value={formData.email}
              onChange={(e) => {
                setFormData({ ...formData, email: e.target.value });
                if (errors.email) setErrors({ ...errors, email: null });
              }}
              disabled={loading}
            />
            {errors.email && (
              <span className="field-error">
                <AlertCircle size={12} /> {errors.email}
              </span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="password" className="form-label">
              <Lock size={14} className="form-label-icon" /> Temporary Password
            </label>
            <div className="password-input-wrapper">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="At least 6 characters"
                className={`form-input password-input ${errors.password ? 'input-error' : ''}`}
                value={formData.password}
                onChange={(e) => {
                  setFormData({ ...formData, password: e.target.value });
                  if (errors.password) setErrors({ ...errors, password: null });
                }}
                disabled={loading}
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
                disabled={loading}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.password ? (
              <span className="field-error">
                <AlertCircle size={12} /> {errors.password}
              </span>
            ) : (
              <span className="form-hint">At least 6 characters. Can be changed after first login.</span>
            )}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="employeeId" className="form-label">
                <IdCard size={14} className="form-label-icon" /> Employee ID
              </label>
              <input
                id="employeeId"
                type="text"
                placeholder="e.g. KC-1042"
                className={`form-input ${errors.employeeId ? 'input-error' : ''}`}
                value={formData.employeeId}
                onChange={(e) => {
                  setFormData({ ...formData, employeeId: e.target.value });
                  if (errors.employeeId) setErrors({ ...errors, employeeId: null });
                }}
                disabled={loading}
              />
              {errors.employeeId && (
                <span className="field-error">
                  <AlertCircle size={12} /> {errors.employeeId}
                </span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="department" className="form-label">
                <Building size={14} className="form-label-icon" /> Department
              </label>
              <select
                id="department"
                className="form-select"
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                disabled={loading}
              >
                {DEPARTMENTS.map((dept) => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="superadmin-modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="spin-icon" /> Creating...
                </>
              ) : (
                <>
                  <UserPlus size={16} /> Add Employee
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddEmployeeModal;
