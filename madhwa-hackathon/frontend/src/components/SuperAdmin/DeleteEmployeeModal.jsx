// src/components/SuperAdmin/DeleteEmployeeModal.jsx
import React from 'react';
import { AlertTriangle, Trash2, X, Loader2 } from 'lucide-react';

const DeleteEmployeeModal = ({ isOpen, employee, onClose, onConfirm, loading = false }) => {
  if (!isOpen || !employee) return null;

  return (
    <div className="superadmin-modal-overlay" onClick={loading ? undefined : onClose}>
      <div
        className="superadmin-modal-card delete-dialog-card"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
      >
        <div className="delete-dialog-header">
          <div className="delete-icon-badge">
            <AlertTriangle size={24} />
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close dialog"
            disabled={loading}
          >
            <X size={18} />
          </button>
        </div>

        <div className="delete-dialog-body">
          <h2 id="delete-dialog-title" className="delete-dialog-title">Remove Employee?</h2>
          <p className="delete-dialog-text">
            Are you sure you want to remove <strong>{employee.name || employee.email}</strong>
            {employee.employeeId ? ` (${employee.employeeId})` : ''}?
          </p>

          {(employee.department || employee.email) && (
            <div className="delete-dialog-details">
              {employee.email && (
                <div className="dialog-detail-row">
                  <span className="dialog-detail-label">Email:</span>
                  <span className="dialog-detail-val">{employee.email}</span>
                </div>
              )}
              {employee.department && (
                <div className="dialog-detail-row">
                  <span className="dialog-detail-label">Department:</span>
                  <span className="dialog-detail-val">{employee.department}</span>
                </div>
              )}
            </div>
          )}

          <div className="delete-dialog-warning">
            <span className="warning-heading">Irreversible Account Removal:</span>
            <span> This will permanently delete their login account and revoke canteen access. Historical meal and working-mode records will remain preserved for audit and reporting.</span>
          </div>
        </div>

        <div className="superadmin-modal-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => onConfirm(employee.id || employee.uid)}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="spin-icon" /> Removing...
              </>
            ) : (
              <>
                <Trash2 size={16} /> Remove Employee
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteEmployeeModal;
