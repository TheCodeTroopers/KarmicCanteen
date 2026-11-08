// src/components/SuperAdmin/EmployeeTable.jsx
import React from 'react';
import { Trash2, UserX, Mail, IdCard, Building, Calendar, Edit3 } from 'lucide-react';

const EmployeeTable = ({ employees, onSelectEmployee, onInitiateEdit, onInitiateDelete }) => {
  if (employees.length === 0) {
    return (
      <div className="empty-employee-state">
        <div className="empty-icon-wrap">
          <UserX size={36} />
        </div>
        <h3 className="empty-title">No employees found</h3>
        <p className="empty-subtitle">No matching employee records in Firestore. You can add one using the "Add Employee" button.</p>
      </div>
    );
  }

  // Format short createdAt date for table column
  const formatTableDate = (dateVal) => {
    if (!dateVal) return '—';
    try {
      if (typeof dateVal?.toDate === 'function') {
        return dateVal.toDate().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
      }
      if (typeof dateVal?.seconds === 'number') {
        return new Date(dateVal.seconds * 1000).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
      }
      const d = new Date(dateVal);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
      }
    } catch {
      return '—';
    }
    return '—';
  };

  return (
    <div className="employee-table-container">
      <table className="employee-table">
        <thead>
          <tr>
            <th>Employee</th>
            <th>Email</th>
            <th>Employee ID</th>
            <th>Department</th>
            <th>Created</th>
            <th className="th-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((emp) => (
            <tr
              key={emp.id}
              className="employee-row clickable-row"
              onClick={() => onSelectEmployee && onSelectEmployee(emp)}
              title="Click to view details"
            >
              <td className="td-employee">
                <div className="employee-avatar">
                  {emp.name && emp.name.trim()
                    ? emp.name
                        .trim()
                        .split(/\s+/)
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase()
                    : 'E'}
                </div>
                <div className="employee-name-block">
                  <span className="employee-name">{emp.name || 'Unnamed Employee'}</span>
                  <span className="employee-role-badge">Employee</span>
                </div>
              </td>
              <td className="td-email">
                <div className="table-cell-icon-text">
                  <Mail size={14} className="cell-icon" />
                  <span title={emp.email}>{emp.email || '—'}</span>
                </div>
              </td>
              <td className="td-emp-id">
                <div className="table-cell-icon-text">
                  <IdCard size={14} className="cell-icon" />
                  <span className="emp-id-badge">{emp.employeeId || 'N/A'}</span>
                </div>
              </td>
              <td className="td-dept">
                {emp.department ? (
                  <span className="dept-tag">
                    <Building size={12} className="dept-icon" />
                    {emp.department}
                  </span>
                ) : (
                  <span className="text-muted">General</span>
                )}
              </td>
              <td className="td-created">
                <div className="table-cell-icon-text table-date-text">
                  <Calendar size={13} className="cell-icon" />
                  <span>{formatTableDate(emp.createdAt)}</span>
                </div>
              </td>
              <td className="td-actions" onClick={(e) => e.stopPropagation()}>
                {onInitiateEdit && (
                  <button
                    type="button"
                    className="btn-action-edit"
                    onClick={(e) => {
                      e.stopPropagation();
                      onInitiateEdit(emp);
                    }}
                    title={`Edit ${emp.name || emp.email}`}
                    aria-label={`Edit ${emp.name || emp.email}`}
                  >
                    <Edit3 size={14} />
                    <span className="btn-action-text">Edit</span>
                  </button>
                )}
                <button
                  type="button"
                  className="btn-action-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    onInitiateDelete(emp);
                  }}
                  title={`Remove ${emp.name || emp.email}`}
                  aria-label={`Remove ${emp.name || emp.email}`}
                >
                  <Trash2 size={14} />
                  <span className="btn-action-text">Remove</span>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default EmployeeTable;
