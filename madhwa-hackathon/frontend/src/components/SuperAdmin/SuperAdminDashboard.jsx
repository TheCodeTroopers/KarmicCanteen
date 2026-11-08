// src/components/SuperAdmin/SuperAdminDashboard.jsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Search,
  UserPlus,
  ShieldCheck,
  X,
  CheckCircle2,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import {
  collection,
  query,
  where,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import adminApi from '../../utils/adminApi';
import { DEPARTMENTS } from './mockEmployees';
import EmployeeTable from './EmployeeTable';
import AddEmployeeModal from './AddEmployeeModal';
import EditEmployeeModal from './EditEmployeeModal';
import DeleteEmployeeModal from './DeleteEmployeeModal';
import EmployeeDetailsModal from './EmployeeDetailsModal';
import './SuperAdminDashboard.css';

const SuperAdminDashboard = () => {
  // Real Firestore employees state
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Search and department filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('All');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [employeeToEdit, setEmployeeToEdit] = useState(null);
  const [employeeToDelete, setEmployeeToDelete] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // User feedback notice
  const [notice, setNotice] = useState(null);

  const showNotice = (type, message) => {
    setNotice({ type, message });
    setTimeout(() => {
      setNotice(null);
    }, 4500);
  };

  // 1. Fetch real employees from Firestore `users` collection where role == 'employee'
  useEffect(() => {
    setLoading(true);
    setError(null);

    // Query for employees (and handle potential legacy 'student' role if present)
    const usersRef = collection(db, 'users');
    const employeesQuery = query(usersRef, where('role', 'in', ['employee', 'student']));

    const unsubscribe = onSnapshot(
      employeesQuery,
      (snapshot) => {
        const fetched = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            uid: docSnap.id,
            email: data.email || '',
            name: data.name || '',
            employeeId: data.employeeId || '',
            department: data.department || '',
            role: data.role || 'employee',
            createdAt: data.createdAt || null,
            createdBy: data.createdBy || null
          };
        });

        // Sort alphabetically by name (or email if name is empty)
        fetched.sort((a, b) => {
          const nameA = (a.name || a.email).toLowerCase();
          const nameB = (b.name || b.email).toLowerCase();
          return nameA.localeCompare(nameB);
        });

        setEmployees(fetched);
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching employees from Firestore:', err);
        setError('Failed to load employees from Firestore. Please check your connection or permissions.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Update selectedEmployee if real-time snapshot changes it
  useEffect(() => {
    if (selectedEmployee) {
      const updated = employees.find((e) => e.id === selectedEmployee.id);
      if (updated) {
        setSelectedEmployee(updated);
      }
    }
  }, [employees, selectedEmployee]);

  // 3. Search across actual name, email, employeeId, and filter by department
  const filteredEmployees = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return employees.filter((emp) => {
      // Department filter
      if (selectedDepartment !== 'All' && emp.department !== selectedDepartment) {
        return false;
      }

      if (!query) return true;

      const name = (emp.name || '').toLowerCase();
      const email = (emp.email || '').toLowerCase();
      const employeeId = (emp.employeeId || '').toLowerCase();
      const department = (emp.department || '').toLowerCase();

      return (
        name.includes(query) ||
        email.includes(query) ||
        employeeId.includes(query) ||
        department.includes(query)
      );
    });
  }, [employees, searchQuery, selectedDepartment]);

  // 6. Add Employee via adminApi (compatible with ₹0 Spark dev server & Vercel serverless)
  const handleAddEmployee = async (formData) => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      await adminApi.createUser({
        email: formData.email,
        password: formData.password,
        role: formData.role || 'employee',
        name: formData.name || '',
        employeeId: formData.employeeId || '',
        department: formData.department || ''
      });

      showNotice('success', `Employee "${formData.name || formData.email}" successfully created!`);
      setIsAddModalOpen(false);
    } catch (err) {
      console.error('Failed to create employee account:', err);
      const errorMsg = err.message || 'Failed to create employee account.';
      showNotice('error', errorMsg);
    } finally {
      setActionLoading(false);
    }
  };

  // 6. Edit Employee via adminApi.updateUser
  const handleSaveEditEmployee = async (formData) => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      await adminApi.updateUser({
        uid: formData.uid,
        name: formData.name,
        email: formData.email,
        employeeId: formData.employeeId,
        department: formData.department
      });

      showNotice('success', `Employee "${formData.name || formData.email}" updated successfully!`);
      setEmployeeToEdit(null);

      // If edited employee was currently selected in details modal, update details view immediately
      if (selectedEmployee && (selectedEmployee.id === formData.uid || selectedEmployee.uid === formData.uid)) {
        setSelectedEmployee((prev) => ({
          ...prev,
          name: formData.name,
          email: formData.email,
          employeeId: formData.employeeId,
          department: formData.department
        }));
      }
    } catch (err) {
      console.error('Failed to update employee account:', err);
      const errorMsg = err.message || 'Failed to update employee account.';
      showNotice('error', errorMsg);
    } finally {
      setActionLoading(false);
    }
  };

  // 6. Remove Employee via adminApi (safely preserves historical meals & working modes)
  const handleConfirmDelete = async (id) => {
    if (actionLoading) return;
    setActionLoading(true);
    const target = employees.find((e) => e.id === id);
    try {
      await adminApi.deleteUser({ uid: id });

      if (selectedEmployee?.id === id) {
        setSelectedEmployee(null);
      }
      setEmployeeToDelete(null);
      showNotice('success', `Employee "${target?.name || target?.email || id}" removed successfully.`);
    } catch (err) {
      console.error('Failed to delete employee account:', err);
      const errorMsg = err.message || 'Failed to delete employee account.';
      showNotice('error', errorMsg);
    } finally {
      setActionLoading(false);
    }
  };

  const retryFetch = () => {
    setLoading(true);
    setError(null);
  };

  return (
    <div className="super-admin-dashboard">
      {/* Header */}
      <div className="super-admin-header">
        <div className="header-title-row">
          <div className="header-icon-wrap">
            <ShieldCheck size={26} />
          </div>
          <div>
            <h1>Super Admin Dashboard</h1>
            <p className="subtitle">Manage user accounts, roles and staff directory</p>
          </div>
        </div>
        <div className="header-stats-pill">
          <Users size={16} />
          <span>
            {loading ? 'Loading...' : `${employees.length} Registered Employee${employees.length === 1 ? '' : 's'}`}
          </span>
        </div>
      </div>

      {/* Floating Notice / Toast */}
      {notice && (
        <div className={`toast-notice ${notice.type}`}>
          {notice.type === 'success' ? (
            <CheckCircle2 size={18} />
          ) : (
            <AlertCircle size={18} />
          )}
          <span>{notice.message}</span>
        </div>
      )}

      {/* Employee Management Section */}
      <section className="employee-management-section">
        {/* Toolbar: Search + Add Button */}
        <div className="employee-toolbar">
          <div className="toolbar-filters">
            <div className="search-input-wrapper">
              <Search size={18} className="search-icon" />
              <input
                type="text"
                className="search-input"
                placeholder="Search by name, email, employee ID, or department..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                disabled={loading || !!error}
                aria-label="Search employees"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="clear-search-btn"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="department-filter-wrapper">
              <select
                className="dept-filter-select"
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                disabled={loading || !!error}
                aria-label="Filter by department"
              >
                <option value="All">All Departments</option>
                {DEPARTMENTS.map((dept) => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="toolbar-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setIsAddModalOpen(true)}
              disabled={actionLoading}
            >
              <UserPlus size={16} />
              <span>Add Employee</span>
            </button>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="superadmin-state-container loading-state">
            <div className="spinner"></div>
            <p className="state-title">Loading employees from Firestore...</p>
            <span className="state-subtitle">Syncing live directory</span>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="superadmin-state-container error-state">
            <div className="state-icon-badge error">
              <AlertCircle size={32} />
            </div>
            <h3 className="state-title">Unable to Load Employees</h3>
            <p className="state-subtitle">{error}</p>
            <button
              type="button"
              className="btn btn-secondary retry-btn"
              onClick={retryFetch}
            >
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        )}

        {/* Employee Table */}
        {!loading && !error && (
          <EmployeeTable
            employees={filteredEmployees}
            onSelectEmployee={(employee) => setSelectedEmployee(employee)}
            onInitiateEdit={(employee) => setEmployeeToEdit(employee)}
            onInitiateDelete={(employee) => setEmployeeToDelete(employee)}
          />
        )}
      </section>

      {/* 4. Employee Details Modal */}
      <EmployeeDetailsModal
        isOpen={!!selectedEmployee}
        employee={selectedEmployee}
        onClose={() => setSelectedEmployee(null)}
        onEdit={(employee) => {
          setSelectedEmployee(null);
          setEmployeeToEdit(employee);
        }}
      />

      {/* Add Employee Modal */}
      <AddEmployeeModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddEmployee={handleAddEmployee}
        loading={actionLoading}
        existingEmployees={employees}
      />

      {/* Edit Employee Modal */}
      <EditEmployeeModal
        isOpen={!!employeeToEdit}
        employee={employeeToEdit}
        onClose={() => setEmployeeToEdit(null)}
        onSave={handleSaveEditEmployee}
        loading={actionLoading}
        existingEmployees={employees}
      />

      {/* Remove Employee Confirmation Dialog */}
      <DeleteEmployeeModal
        isOpen={!!employeeToDelete}
        employee={employeeToDelete}
        onClose={() => setEmployeeToDelete(null)}
        onConfirm={handleConfirmDelete}
        loading={actionLoading}
      />
    </div>
  );
};

export default SuperAdminDashboard;
