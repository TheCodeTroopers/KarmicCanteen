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
  RefreshCw,
  LayoutDashboard,
  UserRound,
  Shield,
  Trash2,
  Upload,
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
import BulkUploadModal from './BulkUploadModal';
import './SuperAdminDashboard.css';

const SuperAdminDashboard = () => {
  // Real Firestore employees state
  const [employees, setEmployees] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [activeView, setActiveView] = useState('overview');
  const [adminForm, setAdminForm] = useState({ name: '', email: '', password: '' });
  const [showAdminForm, setShowAdminForm] = useState(false);
  const [adminToRemove, setAdminToRemove] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Live user directory powers dashboard counts and Admin Management.
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'users'),
      (snapshot) => {
        setAllUsers(snapshot.docs.map((docSnap) => ({ id: docSnap.id, uid: docSnap.id, ...docSnap.data() })));
      },
      (err) => {
        console.error('Unable to load user directory:', err);
        showNotice('error', 'Unable to load user statistics. Check Firestore permissions.');
      }
    );
    return () => unsubscribe();
  }, []);

  const admins = useMemo(() => allUsers.filter((user) => user.role === 'admin'), [allUsers]);
  const totalEmployees = allUsers.filter((user) => ['employee', 'student'].includes(user.role)).length;
  const totalAdmins = admins.length;
  const totalRegisteredUsers = allUsers.length;

  const handleCreateAdmin = async (event) => {
    event.preventDefault();
    if (actionLoading) return;
    const name = adminForm.name.trim();
    const email = adminForm.email.trim().toLowerCase();
    if (!name || !email || adminForm.password.length < 6) {
      showNotice('error', 'Enter a name, valid email, and password of at least 6 characters.');
      return;
    }
    if (allUsers.some((user) => (user.email || '').toLowerCase() === email)) {
      showNotice('error', 'An account with this email already exists.');
      return;
    }
    setActionLoading(true);
    try {
      await adminApi.createUser({ name, email, password: adminForm.password, role: 'admin' });
      setAdminForm({ name: '', email: '', password: '' });
      setShowAdminForm(false);
      showNotice('success', `Admin account for ${name} created successfully.`);
    } catch (err) {
      showNotice('error', err.message || 'Failed to create admin account.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveAdmin = async () => {
    if (!adminToRemove || actionLoading) return;
    setActionLoading(true);
    try {
      await adminApi.deleteUser({ uid: adminToRemove.uid });
      showNotice('success', `Admin ${adminToRemove.name || adminToRemove.email} removed successfully.`);
      setAdminToRemove(null);
    } catch (err) {
      showNotice('error', err.message || 'Failed to remove admin.');
    } finally {
      setActionLoading(false);
    }
  };

  // Search and department filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('All');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
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

  // 6. Bulk Insert Employees via adminApi.bulkCreateUsers
  const handleBulkInsert = async (records) => {
    setActionLoading(true);
    try {
      const summary = await adminApi.bulkCreateUsers(records);
      if (summary.succeeded > 0) {
        showNotice(
          'success',
          `Bulk insertion complete: ${summary.succeeded} employee account${summary.succeeded !== 1 ? 's' : ''} created.`
        );
      } else {
        showNotice('error', 'Bulk insertion finished with 0 accounts created.');
      }
      return summary;
    } catch (err) {
      console.error('Failed bulk insertion:', err);
      const errorMsg = err.message || 'Failed to complete bulk insertion.';
      showNotice('error', errorMsg);
      return {
        succeeded: 0,
        failed: records.length,
        details: records.map((r) => ({
          name: r.name,
          email: r.email,
          success: false,
          message: errorMsg
        }))
      };
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
    <div className="super-admin-shell">
      <aside className="super-admin-sidebar">
        <div className="super-admin-side-brand"><ShieldCheck size={23} /><span>Super Admin</span></div>
        <button className={`super-admin-nav-item ${activeView === 'overview' ? 'active' : ''}`} onClick={() => setActiveView('overview')}><LayoutDashboard size={18} />Dashboard</button>
        <button className={`super-admin-nav-item ${activeView === 'employees' ? 'active' : ''}`} onClick={() => setActiveView('employees')}><Users size={18} />Employee Management</button>
        <button className={`super-admin-nav-item ${activeView === 'admins' ? 'active' : ''}`} onClick={() => setActiveView('admins')}><Shield size={18} />Admin Management</button>
      </aside>

      <main className="super-admin-dashboard">
        <div className="super-admin-header">
          <div className="header-title-row">
            <div className="header-icon-wrap"><ShieldCheck size={26} /></div>
            <div>
              <h1>{activeView === 'overview' ? 'Super Admin Dashboard' : activeView === 'admins' ? 'Admin Management' : 'Employee Management'}</h1>
              <p className="subtitle">{activeView === 'overview' ? 'Overview of registered users and account management' : activeView === 'admins' ? 'Create and manage administrator accounts' : 'Manage employee accounts and staff directory'}</p>
            </div>
          </div>
          <div className="header-stats-pill"><Users size={16} /><span>{allUsers.length} Registered Users</span></div>
        </div>

        {notice && <div className={`toast-notice ${notice.type}`}>{notice.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}<span>{notice.message}</span></div>}

        {activeView === 'overview' && (
          <section className="super-admin-overview">
            <div className="super-admin-stat-grid">
              <article className="super-admin-stat-card"><div className="stat-card-icon employees"><Users size={22} /></div><div><span>Total Employees</span><strong>{totalEmployees}</strong></div></article>
              <article className="super-admin-stat-card"><div className="stat-card-icon admins"><Shield size={22} /></div><div><span>Total Admins</span><strong>{totalAdmins}</strong></div></article>
              <article className="super-admin-stat-card"><div className="stat-card-icon registered"><UserRound size={22} /></div><div><span>Total Registered Users</span><strong>{totalRegisteredUsers}</strong></div></article>
            </div>
            <div className="super-admin-quick-links">
              <h2>Account Management</h2>
              <p>Manage employee and administrator access to Karmic Canteen.</p>
              <div className="super-admin-quick-actions">
                <button className="btn btn-primary" onClick={() => setActiveView('employees')}><Users size={16} />Employee Management</button>
                <button className="btn btn-primary" onClick={() => setActiveView('admins')}><Shield size={16} />Admin Management</button>
              </div>
            </div>
          </section>
        )}

        {activeView === 'employees' && (
          <section className="employee-management-section">
            <div className="employee-toolbar">
              <div className="toolbar-filters">
                <div className="search-input-wrapper"><Search size={18} className="search-icon" /><input type="text" className="search-input" placeholder="Search by name, email, employee ID, or department..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} disabled={loading || !!error} aria-label="Search employees" />{searchQuery && <button type="button" className="clear-search-btn" onClick={() => setSearchQuery('')} aria-label="Clear search"><X size={14} /></button>}</div>
                <div className="department-filter-wrapper"><select className="dept-filter-select" value={selectedDepartment} onChange={(e) => setSelectedDepartment(e.target.value)} disabled={loading || !!error} aria-label="Filter by department"><option value="All">All Departments</option>{DEPARTMENTS.map((dept) => <option key={dept} value={dept}>{dept}</option>)}</select></div>
              </div>
              <div className="toolbar-actions">
                <button
                  type="button"
                  className="btn btn-secondary bulk-upload-btn"
                  onClick={() => setIsBulkModalOpen(true)}
                  disabled={actionLoading}
                >
                  <Upload size={16} /><span>Bulk Upload</span>
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setIsAddModalOpen(true)}
                  disabled={actionLoading}
                >
                  <UserPlus size={16} /><span>Add Employee</span>
                </button>
              </div>
            </div>
            {loading && <div className="superadmin-state-container loading-state"><div className="spinner"></div><p className="state-title">Loading employees from Firestore...</p><span className="state-subtitle">Syncing live directory</span></div>}
            {!loading && error && <div className="superadmin-state-container error-state"><div className="state-icon-badge error"><AlertCircle size={32} /></div><h3 className="state-title">Unable to Load Employees</h3><p className="state-subtitle">{error}</p><button type="button" className="btn btn-secondary retry-btn" onClick={retryFetch}><RefreshCw size={14} /> Retry</button></div>}
            {!loading && !error && <EmployeeTable employees={filteredEmployees} onSelectEmployee={setSelectedEmployee} onInitiateEdit={setEmployeeToEdit} onInitiateDelete={setEmployeeToDelete} />}
          </section>
        )}

        {activeView === 'admins' && (
          <section className="employee-management-section admin-management-section">
            <div className="employee-toolbar"><div><h2 className="admin-list-heading">Registered Administrators</h2><p className="subtitle">{admins.length} administrator account{admins.length === 1 ? '' : 's'}</p></div><button className="btn btn-primary" onClick={() => setShowAdminForm((value) => !value)} disabled={actionLoading}><UserPlus size={16} />Add Admin</button></div>
            {showAdminForm && <form className="admin-create-form" onSubmit={handleCreateAdmin}>
              <h3>Create Admin Account</h3>
              <div className="admin-form-grid">
                <label>Full name<input required value={adminForm.name} onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })} placeholder="Admin full name" /></label>
                <label>Email address<input required type="email" value={adminForm.email} onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })} placeholder="admin@example.com" /></label>
                <label>Temporary password<input required type="password" minLength={6} value={adminForm.password} onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })} placeholder="At least 6 characters" /></label>
              </div>
              <div className="admin-form-actions"><button type="button" className="btn btn-secondary" onClick={() => setShowAdminForm(false)} disabled={actionLoading}>Cancel</button><button type="submit" className="btn btn-primary" disabled={actionLoading}>{actionLoading ? 'Creating...' : 'Create Admin'}</button></div>
            </form>}
            {admins.length === 0 ? <div className="empty-employee-state"><div className="empty-icon-wrap"><Shield size={36} /></div><h3 className="empty-title">No administrators found</h3><p className="empty-subtitle">Create an admin account to grant canteen management access.</p></div> : <div className="employee-table-container"><table className="employee-table"><thead><tr><th>Administrator</th><th>Email</th><th>Created</th><th className="th-actions">Actions</th></tr></thead><tbody>{admins.slice().sort((a,b) => (a.name || a.email || '').localeCompare(b.name || b.email || '')).map((admin) => <tr key={admin.uid}><td className="td-employee"><div className="employee-avatar">{(admin.name || admin.email || 'A').slice(0,1).toUpperCase()}</div><div className="employee-name-block"><span className="employee-name">{admin.name || 'Unnamed Admin'}</span><span className="employee-role-badge">Admin</span></div></td><td className="td-email">{admin.email || '—'}</td><td>{admin.createdAt?.toDate ? admin.createdAt.toDate().toLocaleDateString() : '—'}</td><td className="td-actions"><button type="button" className="btn-action-delete" onClick={() => setAdminToRemove(admin)} disabled={actionLoading}><Trash2 size={14} /><span className="btn-action-text">Remove</span></button></td></tr>)}</tbody></table></div>}
          </section>
        )}
      </main>

      <EmployeeDetailsModal isOpen={!!selectedEmployee} employee={selectedEmployee} onClose={() => setSelectedEmployee(null)} onEdit={(employee) => { setSelectedEmployee(null); setEmployeeToEdit(employee); }} />
      <AddEmployeeModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onAddEmployee={handleAddEmployee} loading={actionLoading} existingEmployees={employees} />
      <BulkUploadModal isOpen={isBulkModalOpen} onClose={() => setIsBulkModalOpen(false)} onBulkInsert={handleBulkInsert} existingEmployees={employees} inserting={actionLoading} />
      <EditEmployeeModal isOpen={!!employeeToEdit} employee={employeeToEdit} onClose={() => setEmployeeToEdit(null)} onSave={handleSaveEditEmployee} loading={actionLoading} existingEmployees={employees} />
      <DeleteEmployeeModal isOpen={!!employeeToDelete} employee={employeeToDelete} onClose={() => setEmployeeToDelete(null)} onConfirm={handleConfirmDelete} loading={actionLoading} />

      {adminToRemove && <div className="superadmin-modal-overlay" onClick={() => !actionLoading && setAdminToRemove(null)}><div className="superadmin-modal-card" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}><div className="delete-dialog-header"><div className="delete-icon-badge"><AlertCircle size={24} /></div><button className="modal-close-btn" onClick={() => setAdminToRemove(null)} disabled={actionLoading} aria-label="Close"><X size={18} /></button></div><div className="delete-dialog-body"><h2 className="delete-dialog-title">Remove Admin?</h2><p className="delete-dialog-text">Are you sure you want to remove <strong>{adminToRemove.name || adminToRemove.email}</strong>? This permanently removes their Firebase login and admin profile. Historical meal records are preserved.</p></div><div className="superadmin-modal-actions"><button className="btn btn-secondary" onClick={() => setAdminToRemove(null)} disabled={actionLoading}>Cancel</button><button className="btn btn-danger" onClick={handleRemoveAdmin} disabled={actionLoading}>{actionLoading ? 'Removing...' : 'Confirm Remove'}</button></div></div></div>}
    </div>
  );
};

export default SuperAdminDashboard;
