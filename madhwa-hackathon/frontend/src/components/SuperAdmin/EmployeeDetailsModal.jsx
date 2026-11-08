// src/components/SuperAdmin/EmployeeDetailsModal.jsx
import React from 'react';
import { X, User, Mail, IdCard, Building, Calendar, Shield, Clock, Edit3 } from 'lucide-react';

const EmployeeDetailsModal = ({ isOpen, employee, onClose, onEdit }) => {
  if (!isOpen || !employee) return null;

  // 5. Format createdAt as a readable date. Show "Not available" if missing.
  const formatAccountDate = (dateVal) => {
    if (!dateVal) return 'Not available';

    try {
      // Handle Firestore Timestamp object (has .toDate())
      if (typeof dateVal?.toDate === 'function') {
        const d = dateVal.toDate();
        return d.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      }

      // Handle Firestore timestamp with seconds/nanoseconds
      if (typeof dateVal?.seconds === 'number') {
        const d = new Date(dateVal.seconds * 1000);
        return d.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      }

      // Handle standard Date object
      if (dateVal instanceof Date) {
        if (isNaN(dateVal.getTime())) return 'Not available';
        return dateVal.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      }

      // Handle string format (ISO string)
      if (typeof dateVal === 'string' && dateVal.trim() !== '') {
        const d = new Date(dateVal);
        if (isNaN(d.getTime())) return 'Not available';
        return d.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      }
    } catch (err) {
      console.warn('Error formatting date:', err);
    }

    return 'Not available';
  };

  const getInitials = (name) => {
    if (!name || !name.trim()) return 'E';
    return name
      .trim()
      .split(/\s+/)
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  return (
    <div className="superadmin-modal-overlay" onClick={onClose}>
      <div
        className="superadmin-modal-card employee-details-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="employee-details-title"
      >
        {/* Modal Header */}
        <div className="superadmin-modal-header">
          <div className="modal-title-wrap">
            <div className="modal-icon-badge details-badge">
              <User size={20} />
            </div>
            <div>
              <h2 id="employee-details-title" className="modal-title">Employee Details</h2>
              <p className="modal-subtitle">Profile & account information</p>
            </div>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="employee-details-body">
          {/* Hero Banner / Avatar */}
          <div className="details-hero">
            <div className="details-avatar">
              {getInitials(employee.name || employee.email)}
            </div>
            <div className="details-hero-info">
              <h3 className="details-name">{employee.name || employee.email || 'Unnamed Employee'}</h3>
              <div className="details-hero-tags">
                <span className="details-role-pill">
                  <Shield size={12} />
                  {employee.role ? employee.role.charAt(0).toUpperCase() + employee.role.slice(1) : 'Employee'}
                </span>
                <span className="details-status-pill">Active</span>
              </div>
            </div>
          </div>

          {/* Details Grid */}
          <div className="details-grid">
            {/* Full Name */}
            <div className="details-item">
              <div className="details-item-label">
                <User size={15} className="details-item-icon" />
                <span>Full Name</span>
              </div>
              <div className="details-item-value">{employee.name || 'Not available'}</div>
            </div>

            {/* Email Address */}
            <div className="details-item">
              <div className="details-item-label">
                <Mail size={15} className="details-item-icon" />
                <span>Email Address</span>
              </div>
              <div className="details-item-value email-value" title={employee.email}>
                {employee.email || 'Not available'}
              </div>
            </div>

            {/* Employee ID */}
            <div className="details-item">
              <div className="details-item-label">
                <IdCard size={15} className="details-item-icon" />
                <span>Employee ID</span>
              </div>
              <div className="details-item-value">
                {employee.employeeId ? (
                  <span className="emp-id-badge">{employee.employeeId}</span>
                ) : (
                  <span className="text-muted">Not available</span>
                )}
              </div>
            </div>

            {/* Department */}
            <div className="details-item">
              <div className="details-item-label">
                <Building size={15} className="details-item-icon" />
                <span>Department</span>
              </div>
              <div className="details-item-value">
                {employee.department ? (
                  <span className="dept-tag">
                    <Building size={12} className="dept-icon" />
                    {employee.department}
                  </span>
                ) : (
                  <span className="text-muted">Not available</span>
                )}
              </div>
            </div>

            {/* Account Creation Date */}
            <div className="details-item full-width">
              <div className="details-item-label">
                <Calendar size={15} className="details-item-icon" />
                <span>Account Creation Date</span>
              </div>
              <div className="details-item-value creation-date-value">
                <Clock size={14} className="details-clock-icon" />
                <span>{formatAccountDate(employee.createdAt)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="superadmin-modal-actions details-modal-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
          >
            Close
          </button>
          {onEdit && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                onClose();
                onEdit(employee);
              }}
            >
              <Edit3 size={15} />
              <span>Edit Employee</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmployeeDetailsModal;
