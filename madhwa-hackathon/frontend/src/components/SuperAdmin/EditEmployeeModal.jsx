// src/components/SuperAdmin/EditEmployeeModal.jsx
import React, { useState, useEffect } from 'react';
import { X, UserCheck, Mail, User, Building, IdCard, AlertCircle, Loader2 } from 'lucide-react';
import { DEPARTMENTS } from './mockEmployees';

const EditEmployeeModal = ({
  isOpen,
  employee,
  onClose,
  onSave,
  loading = false,
  existingEmployees = []
}) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    employeeId: '',
    department: DEPARTMENTS[0]
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (isOpen && employee) {
      setFormData({
        name: employee.name || '',
        email: employee.email || '',
        employeeId: employee.employeeId || '',
        department: employee.department || DEPARTMENTS[0] || 'Engineering'
      });
      setErrors({});
    }
  }, [isOpen, employee]);

  if (!isOpen || !employee) return null;

  const validate = () => {
    const errs = {};
    const trimmedName = formData.name.trim();
    const trimmedEmail = formData.email.trim().toLowerCase();
    const trimmedEmpId = formData.employeeId.trim().toUpperCase();

    const currentId = employee.id || employee.uid;
    const currentEmail = (employee.email || '').trim().toLowerCase();
    const currentEmpId = (employee.employeeId || '').trim().toUpperCase();

    if (!trimmedName) {
      errs.name = 'Full name is required';
    }

    if (!trimmedEmail) {
      errs.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errs.email = 'Enter a valid email address';
    } else if (
      trimmedEmail !== currentEmail &&
      existingEmployees.some(
        (emp) => (emp.id || emp.uid) !== currentId && (emp.email || '').trim().toLowerCase() === trimmedEmail
      )
    ) {
      errs.email = 'An employee with this email already exists';
    }

    if (!trimmedEmpId) {
      errs.employeeId = 'Employee ID is required';
    } else if (
      trimmedEmpId !== currentEmpId &&
      existingEmployees.some(
        (emp) => (emp.id || emp.uid) !== currentId && (emp.employeeId || '').trim().toUpperCase() === trimmedEmpId
      )
    ) {
      errs.employeeId = 'An employee with this ID already exists';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (loading || !validate()) return;

    onSave({
      uid: employee.id || employee.uid,
      name: formData.name.trim(),
      email: formData.email.trim().toLowerCase(),
      employeeId: formData.employeeId.trim().toUpperCase(),
      department: formData.department
    });
  };

  const handleClose = () => {
    if (loading) return;
    setErrors({});
    onClose();
  };

  const emailHasChanged = formData.email.trim().toLowerCase() !== (employee.email || '').trim().toLowerCase();

  return (
    <div className="superadmin-modal-overlay" onClick={handleClose}>
      <div
        className="superadmin-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-employee-title"
      >
        <div className="superadmin-modal-header">
          <div className="modal-title-wrap">
            <div className="modal-icon-badge">
              <UserCheck size={20} />
            </div>
            <div>
              <h2 id="edit-employee-title" className="modal-title">Edit Employee</h2>
              <p className="modal-subtitle">Update profile and authentication records</p>
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
            <label htmlFor="edit-name" className="form-label">
              <User size={14} className="form-label-icon" /> Full Name
            </label>
            <input
              id="edit-name"
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
            <label htmlFor="edit-email" className="form-label">
              <Mail size={14} className="form-label-icon" /> Email Address
            </label>
            <input
              id="edit-email"
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
            {errors.email ? (
              <span className="field-error">
                <AlertCircle size={12} /> {errors.email}
              </span>
            ) : emailHasChanged ? (
              <span className="form-hint" style={{ color: 'var(--accent-primary)' }}>
                ℹ️ Changing email will update their sign-in credentials in Firebase Authentication.
              </span>
            ) : null}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="edit-employeeId" className="form-label">
                <IdCard size={14} className="form-label-icon" /> Employee ID
              </label>
              <input
                id="edit-employeeId"
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
              <label htmlFor="edit-department" className="form-label">
                <Building size={14} className="form-label-icon" /> Department
              </label>
              <select
                id="edit-department"
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
                  <Loader2 size={16} className="spin-icon" /> Saving...
                </>
              ) : (
                <>
                  <UserCheck size={16} /> Save Changes
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditEmployeeModal;
