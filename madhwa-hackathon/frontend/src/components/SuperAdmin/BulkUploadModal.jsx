// src/components/SuperAdmin/BulkUploadModal.jsx
import React, { useState, useRef, useCallback } from 'react';
import {
  X,
  Upload,
  Download,
  AlertCircle,
  CheckCircle2,
  XCircle,
  FileText,
  Loader2,
  Users,
  ChevronDown,
  ChevronUp,
  Mail
} from 'lucide-react';
import { DEPARTMENTS } from './mockEmployees';

// ─── CSV Template ───────────────────────────────────────────────────────────
const CSV_TEMPLATE_HEADERS = ['Name', 'Email', 'Employee ID', 'Department'];
const CSV_TEMPLATE_SAMPLE = [
  ['John Doe', 'john.doe@example.com', 'EMP001', 'Engineering'],
  ['Jane Smith', 'jane.smith@example.com', 'EMP002', 'Human Resources']
];

function downloadTemplate() {
  const rows = [CSV_TEMPLATE_HEADERS, ...CSV_TEMPLATE_SAMPLE];
  const csv = rows.map((r) => r.map((v) => `"${v}"`).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'bulk_employee_template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ─── CSV Parser ─────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const rows = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        cols.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    cols.push(cur.trim());
    rows.push(cols);
  }
  return rows;
}

// ─── Email Regex ─────────────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── Row Validator ───────────────────────────────────────────────────────────
function validateRows(parsedRows, existingEmployees) {
  const header = parsedRows[0] || [];
  const normalizedHeader = header.map((h) => h.toLowerCase().replace(/\s+/g, ''));

  const nameIdx = normalizedHeader.indexOf('name');
  const emailIdx = normalizedHeader.indexOf('email');
  const empIdIdx = normalizedHeader.indexOf('employeeid');
  const deptIdx = normalizedHeader.indexOf('department');

  const headerMissing = [];
  if (nameIdx === -1) headerMissing.push('Name');
  if (emailIdx === -1) headerMissing.push('Email');
  if (empIdIdx === -1) headerMissing.push('Employee ID');
  if (deptIdx === -1) headerMissing.push('Department');

  if (headerMissing.length > 0) {
    return {
      headerError: `CSV is missing required columns: ${headerMissing.join(', ')}. Please use the provided template.`,
      valid: [],
      invalid: []
    };
  }

  const dataRows = parsedRows.slice(1);
  if (dataRows.length === 0) {
    return {
      headerError: 'The CSV file contains no data rows.',
      valid: [],
      invalid: []
    };
  }

  const existingEmails = new Set(
    existingEmployees.map((e) => (e.email || '').trim().toLowerCase())
  );
  const existingEmpIds = new Set(
    existingEmployees.map((e) => (e.employeeId || '').trim().toUpperCase())
  );

  // Track duplicates within the uploaded file itself
  const seenEmails = new Set();
  const seenEmpIds = new Set();

  const valid = [];
  const invalid = [];

  dataRows.forEach((cols, idx) => {
    const rowNum = idx + 2; // 1-based, skipping header
    const rawName = nameIdx >= 0 ? (cols[nameIdx] || '') : '';
    const rawEmail = emailIdx >= 0 ? (cols[emailIdx] || '') : '';
    const rawEmpId = empIdIdx >= 0 ? (cols[empIdIdx] || '') : '';
    const rawDept = deptIdx >= 0 ? (cols[deptIdx] || '') : '';

    const name = rawName.trim();
    const email = rawEmail.trim().toLowerCase();
    const employeeId = rawEmpId.trim().toUpperCase();
    const department = rawDept.trim() || DEPARTMENTS[0];

    const errors = [];

    if (!name) errors.push('Name is required');
    if (!email) {
      errors.push('Email is required');
    } else if (!EMAIL_RE.test(email)) {
      errors.push('Invalid email format');
    } else if (existingEmails.has(email)) {
      errors.push('Email already exists in Firebase');
    } else if (seenEmails.has(email)) {
      errors.push('Duplicate email in this file');
    }

    if (!employeeId) {
      errors.push('Employee ID is required');
    } else if (existingEmpIds.has(employeeId)) {
      errors.push('Employee ID already exists in Firebase');
    } else if (seenEmpIds.has(employeeId)) {
      errors.push('Duplicate Employee ID in this file');
    }

    const record = { rowNum, name, email, employeeId, department, errors };

    if (errors.length === 0) {
      valid.push(record);
      seenEmails.add(email);
      seenEmpIds.add(employeeId);
    } else {
      invalid.push(record);
      // Still track seen even for invalid so later duplicates get flagged too
      if (email && EMAIL_RE.test(email)) seenEmails.add(email);
      if (employeeId) seenEmpIds.add(employeeId);
    }
  });

  return { headerError: null, valid, invalid };
}

// ─── Component ───────────────────────────────────────────────────────────────
const BulkUploadModal = ({
  isOpen,
  onClose,
  onBulkInsert,
  existingEmployees = [],
  inserting = false
}) => {
  const fileInputRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState('');
  const [validRows, setValidRows] = useState([]);
  const [invalidRows, setInvalidRows] = useState([]);
  const [showInvalid, setShowInvalid] = useState(true);
  const [results, setResults] = useState(null); // null = not done yet
  const [phase, setPhase] = useState('upload'); // 'upload' | 'preview' | 'done'

  const reset = useCallback(() => {
    setFileName('');
    setParseError('');
    setValidRows([]);
    setInvalidRows([]);
    setShowInvalid(true);
    setResults(null);
    setPhase('upload');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleClose = () => {
    if (inserting) return;
    reset();
    onClose();
  };

  const handleFile = (file) => {
    if (!file) return;
    if (!file.name.endsWith('.csv')) {
      setParseError('Please upload a valid .csv file.');
      return;
    }
    setFileName(file.name);
    setParseError('');

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const rows = parseCSV(text);
        const { headerError, valid, invalid } = validateRows(rows, existingEmployees);
        if (headerError) {
          setParseError(headerError);
          setValidRows([]);
          setInvalidRows([]);
          setPhase('upload');
        } else {
          setValidRows(valid);
          setInvalidRows(invalid);
          setPhase('preview');
        }
      } catch {
        setParseError('Could not parse the CSV file. Please check the format.');
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    handleFile(file);
  };

  const handleInputChange = (e) => {
    handleFile(e.target.files[0]);
  };

  const handleInsert = async () => {
    if (inserting || validRows.length === 0) return;
    const payload = validRows.map(({ name, email, employeeId, department }) => ({
      name,
      email,
      employeeId,
      department,
      role: 'employee'
    }));
    const summary = await onBulkInsert(payload);
    setResults(summary);
    setPhase('done');
  };

  if (!isOpen) return null;

  return (
    <div className="superadmin-modal-overlay" onClick={handleClose}>
      <div
        className="superadmin-modal-card bulk-upload-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="bulk-modal-header">
          <div className="bulk-modal-title-row">
            <div className="bulk-modal-icon-wrap">
              <Upload size={20} />
            </div>
            <div>
              <h2 id="bulk-modal-title" className="bulk-modal-title">
                Bulk Upload Employees
              </h2>
              <p className="bulk-modal-subtitle">
                Upload a CSV file to add multiple employee accounts at once.
              </p>
            </div>
          </div>
          <button
            className="modal-close-btn"
            onClick={handleClose}
            disabled={inserting}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="bulk-modal-body">

          {/* Phase: upload */}
          {phase === 'upload' && (
            <>
              <div className="bulk-template-row">
                <span className="bulk-template-hint">
                  <FileText size={14} />
                  Download the CSV template with the required column headers.
                </span>
                <button
                  type="button"
                  className="btn btn-secondary bulk-template-btn"
                  onClick={downloadTemplate}
                >
                  <Download size={14} />
                  Download Template
                </button>
              </div>

              <div
                className="bulk-dropzone"
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                aria-label="Upload CSV file"
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
              >
                <Upload size={32} className="bulk-dropzone-icon" />
                <p className="bulk-dropzone-text">
                  Drag &amp; drop your CSV file here,<br />
                  or <span className="bulk-dropzone-link">click to browse</span>
                </p>
                <p className="bulk-dropzone-hint">Supported: .csv files only</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="bulk-file-input"
                  onChange={handleInputChange}
                  aria-hidden="true"
                />
              </div>

              {parseError && (
                <div className="bulk-parse-error">
                  <AlertCircle size={16} />
                  <span>{parseError}</span>
                </div>
              )}

              <div className="bulk-columns-info">
                <strong>Required CSV columns:</strong>
                {CSV_TEMPLATE_HEADERS.map((h) => (
                  <span key={h} className="bulk-col-tag">{h}</span>
                ))}
              </div>
            </>
          )}

          {/* Phase: preview */}
          {phase === 'preview' && (
            <>
              <div className="bulk-file-info">
                <FileText size={16} />
                <span className="bulk-file-name">{fileName}</span>
                <button
                  type="button"
                  className="bulk-change-file-btn"
                  onClick={reset}
                  disabled={inserting}
                >
                  Change file
                </button>
              </div>

              {/* Counts */}
              <div className="bulk-counts-row">
                <div className="bulk-count-pill valid">
                  <CheckCircle2 size={15} />
                  <span>{validRows.length} valid record{validRows.length !== 1 ? 's' : ''}</span>
                </div>
                {invalidRows.length > 0 && (
                  <div className="bulk-count-pill invalid">
                    <XCircle size={15} />
                    <span>{invalidRows.length} invalid record{invalidRows.length !== 1 ? 's' : ''}</span>
                  </div>
                )}
              </div>

              {/* Valid preview table */}
              {validRows.length > 0 && (
                <div className="bulk-preview-section">
                  <h4 className="bulk-preview-heading">Valid Records (will be inserted)</h4>
                  <div className="bulk-preview-table-wrap">
                    <table className="employee-table bulk-preview-table">
                      <thead>
                        <tr>
                          <th>Row</th>
                          <th>Name</th>
                          <th>Email</th>
                          <th>Employee ID</th>
                          <th>Department</th>
                        </tr>
                      </thead>
                      <tbody>
                        {validRows.map((r) => (
                          <tr key={r.rowNum}>
                            <td className="bulk-row-num">{r.rowNum}</td>
                            <td>{r.name}</td>
                            <td className="bulk-cell-email">{r.email}</td>
                            <td><span className="emp-id-badge">{r.employeeId}</span></td>
                            <td><span className="dept-tag">{r.department}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Invalid records collapsible */}
              {invalidRows.length > 0 && (
                <div className="bulk-preview-section bulk-invalid-section">
                  <button
                    type="button"
                    className="bulk-invalid-toggle"
                    onClick={() => setShowInvalid((v) => !v)}
                  >
                    <XCircle size={15} />
                    <span>{invalidRows.length} invalid record{invalidRows.length !== 1 ? 's' : ''} (will be skipped)</span>
                    {showInvalid ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>
                  {showInvalid && (
                    <div className="bulk-preview-table-wrap bulk-invalid-table-wrap">
                      <table className="employee-table bulk-preview-table">
                        <thead>
                          <tr>
                            <th>Row</th>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Employee ID</th>
                            <th>Reason(s)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {invalidRows.map((r) => (
                            <tr key={r.rowNum} className="bulk-invalid-row">
                              <td className="bulk-row-num">{r.rowNum}</td>
                              <td>{r.name || <em className="text-muted">—</em>}</td>
                              <td className="bulk-cell-email">{r.email || <em className="text-muted">—</em>}</td>
                              <td>{r.employeeId || <em className="text-muted">—</em>}</td>
                              <td>
                                <ul className="bulk-error-list">
                                  {r.errors.map((err, i) => (
                                    <li key={i}>{err}</li>
                                  ))}
                                </ul>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {validRows.length === 0 && (
                <div className="bulk-parse-error">
                  <AlertCircle size={16} />
                  <span>No valid records to insert. Please fix errors and re-upload.</span>
                </div>
              )}
            </>
          )}

          {/* Phase: done */}
          {phase === 'done' && results && (
            <div className="bulk-results-section">
              <div className="bulk-results-counts">
                <div className="bulk-result-pill success">
                  <CheckCircle2 size={18} />
                  <div>
                    <strong>{results.succeeded}</strong>
                    <span>Accounts Created</span>
                  </div>
                </div>
                {results.emailsSent !== undefined && (
                  <div className="bulk-result-pill email">
                    <Mail size={18} />
                    <div>
                      <strong>{results.emailsSent}</strong>
                      <span>Setup Emails Sent</span>
                    </div>
                  </div>
                )}
                <div className="bulk-result-pill failure">
                  <XCircle size={18} />
                  <div>
                    <strong>{results.failed}</strong>
                    <span>Failed</span>
                  </div>
                </div>
              </div>

              {results.details && results.details.length > 0 && (
                <div className="bulk-preview-table-wrap">
                  <table className="employee-table bulk-preview-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Account</th>
                        <th>Setup Email</th>
                        <th>Status Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.details.map((r, i) => (
                        <tr key={i} className={r.success ? '' : 'bulk-invalid-row'}>
                          <td>{r.name}</td>
                          <td className="bulk-cell-email">{r.email}</td>
                          <td>
                            {r.success
                              ? <span className="bulk-status-ok"><CheckCircle2 size={14} /> Created</span>
                              : <span className="bulk-status-fail"><XCircle size={14} /> Failed</span>}
                          </td>
                          <td>
                            {r.success ? (
                              r.emailSent
                                ? <span className="bulk-status-email-ok"><Mail size={13} /> Sent</span>
                                : <span className="bulk-status-email-fail"><AlertCircle size={13} /> Failed</span>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                          <td className="bulk-result-reason">{r.message || (r.success ? 'Created successfully' : 'Unknown error')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="bulk-modal-footer">
          {phase === 'upload' && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleClose}
            >
              Cancel
            </button>
          )}

          {phase === 'preview' && (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={reset}
                disabled={inserting}
              >
                Back
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleInsert}
                disabled={inserting || validRows.length === 0}
              >
                {inserting
                  ? <><Loader2 size={15} className="spin-icon" /> Inserting...</>
                  : <><Users size={15} /> Insert {validRows.length} Employee{validRows.length !== 1 ? 's' : ''}</>}
              </button>
            </>
          )}

          {phase === 'done' && (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={reset}
              >
                Upload Another File
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleClose}
              >
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default BulkUploadModal;
