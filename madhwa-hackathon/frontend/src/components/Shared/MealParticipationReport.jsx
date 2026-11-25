
import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  CircleSlash,
  Search,
  RefreshCw,
  FileSpreadsheet,
  FileText
} from 'lucide-react';

import { collection, onSnapshot } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { db } from '../../firebase/config';
import './MealParticipationReport.css';

const MEALS = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'snacks', label: 'Snacks' },
  { key: 'dinner', label: 'Dinner' }
];

const getTomorrowDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

// Supports both the new boolean format and historical arrays.
const hasSelectedMeal = (value) => {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return value === true;
};

const getEmployeeName = (employee) =>
  employee.name ||
  employee.fullName ||
  employee.displayName ||
  employee.email ||
  'Unnamed employee';

const MealParticipationReport = () => {
  const [selectedDate, setSelectedDate] = useState(getTomorrowDate);

  const [employees, setEmployees] = useState([]);
  const [selectionsByUser, setSelectionsByUser] = useState({});

  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [loadingSelections, setLoadingSelections] = useState(true);

  const [error, setError] = useState('');

  const [activeMeal, setActiveMeal] = useState('breakfast');
  const [listFilter, setListFilter] = useState('opted');

  const [search, setSearch] = useState('');

  // --------------------------------------------------
  // 1. Listen to the employee directory in real time
  // --------------------------------------------------

  useEffect(() => {
    setLoadingEmployees(true);

    const unsubscribe = onSnapshot(
      collection(db, 'users'),

      (snapshot) => {
        const employeeRows = snapshot.docs
          .map((userDoc) => ({
            uid: userDoc.id,
            ...userDoc.data()
          }))
          .filter((user) =>
            ['employee', 'student'].includes(
              String(user.role || '').toLowerCase()
            )
          )
          .sort((a, b) =>
            getEmployeeName(a).localeCompare(getEmployeeName(b))
          );

        setEmployees(employeeRows);
        setLoadingEmployees(false);
      },

      (err) => {
        console.error(
          'Meal report employee listener failed:',
          err
        );

        setError(
          'Unable to load the employee directory. Check Firestore read permissions.'
        );

        setLoadingEmployees(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // --------------------------------------------------
  // 2. Listen to meal selections for the selected date
  // --------------------------------------------------

  useEffect(() => {
    setLoadingSelections(true);
    setError('');

    const unsubscribe = onSnapshot(
      collection(db, 'mealSelections', selectedDate, 'users'),

      (snapshot) => {
        const rows = {};

        snapshot.docs.forEach((selectionDoc) => {
          rows[selectionDoc.id] = selectionDoc.data();
        });

        setSelectionsByUser(rows);
        setLoadingSelections(false);
      },

      (err) => {
        console.error(
          'Meal report selections listener failed:',
          err
        );

        setError(
          'Unable to load meal selections. Check the mealSelections Firestore read rules.'
        );

        setSelectionsByUser({});
        setLoadingSelections(false);
      }
    );

    return () => unsubscribe();
  }, [selectedDate]);

  // --------------------------------------------------
  // 3. Calculate participation counts for each meal
  // --------------------------------------------------

  const mealCounts = useMemo(() => {
    return MEALS.reduce((result, meal) => {
      const opted = employees.filter((employee) =>
        hasSelectedMeal(
          selectionsByUser[employee.uid]?.[meal.key]
        )
      );

      const notOpted = employees.filter((employee) =>
        !hasSelectedMeal(
          selectionsByUser[employee.uid]?.[meal.key]
        )
      );

      result[meal.key] = {
        opted,
        notOpted
      };

      return result;
    }, {});
  }, [employees, selectionsByUser]);

  // --------------------------------------------------
  // 4. Employee list for the selected meal filter
  // --------------------------------------------------

  const visibleEmployees = useMemo(() => {
    const rows =
      mealCounts[activeMeal]?.[
        listFilter === 'opted' ? 'opted' : 'notOpted'
      ] || [];

    const term = search.trim().toLowerCase();

    if (!term) return rows;

    return rows.filter((employee) =>
      [
        getEmployeeName(employee),
        employee.email,
        employee.employeeId,
        employee.department
      ].some((value) =>
        String(value || '').toLowerCase().includes(term)
      )
    );
  }, [mealCounts, activeMeal, listFilter, search]);

  // --------------------------------------------------
  // 5. Search for employee-wise overview table
  // --------------------------------------------------

  const filteredOverviewEmployees = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return employees;

    return employees.filter((employee) =>
      [
        getEmployeeName(employee),
        employee.email,
        employee.employeeId,
        employee.department
      ].some((value) =>
        String(value || '').toLowerCase().includes(term)
      )
    );
  }, [employees, search]);

  const busy = loadingEmployees || loadingSelections;

  // Export data is based on the complete employee directory for the
  // selected date, not the current on-screen search/filter.
  const getEmployeeMealStatus = (employee, meal) => {
    const selection = selectionsByUser[employee.uid];
    const chosen = hasSelectedMeal(selection?.[meal.key]);

    return {
      chosen,
      submitted: Boolean(selection),
      status: chosen ? 'Chosen' : selection ? 'Not chosen' : 'Not submitted'
    };
  };

  const getExportRows = () => employees.map((employee) => {
    const row = {
      Employee: getEmployeeName(employee),
      'Employee ID': employee.employeeId || '',
      Department: employee.department || '',
      Email: employee.email || ''
    };

    MEALS.forEach((meal) => {
      row[meal.label] = getEmployeeMealStatus(employee, meal).status;
    });

    return row;
  });

  const getFileDate = () => selectedDate || 'meal-report';

  const downloadExcelReport = () => {
    if (busy || employees.length === 0) return;

    const workbook = XLSX.utils.book_new();
    const summaryRows = [
      ['Meal Participation Report'],
      ['Meal date', selectedDate],
      ['Total employees', employees.length],
      [],
      ['Meal', 'Opted in', 'Not opted in', 'Not submitted']
    ];

    MEALS.forEach((meal) => {
      const opted = mealCounts[meal.key]?.opted || [];
      const notOpted = mealCounts[meal.key]?.notOpted || [];
      const notSubmitted = notOpted.filter(
        (employee) => !selectionsByUser[employee.uid]
      ).length;

      summaryRows.push([
        meal.label,
        opted.length,
        notOpted.length,
        notSubmitted
      ]);
    });

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
    summarySheet['!cols'] = [
      { wch: 24 }, { wch: 16 }, { wch: 18 }, { wch: 18 }
    ];
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

    const employeeSheet = XLSX.utils.json_to_sheet(getExportRows());
    employeeSheet['!cols'] = [
      { wch: 26 }, { wch: 18 }, { wch: 20 }, { wch: 30 },
      { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }
    ];
    XLSX.utils.book_append_sheet(workbook, employeeSheet, 'Employee-wise');

    MEALS.forEach((meal) => {
      const rows = employees.map((employee) => {
        const status = getEmployeeMealStatus(employee, meal);
        return {
          Employee: getEmployeeName(employee),
          'Employee ID': employee.employeeId || '',
          Department: employee.department || '',
          Email: employee.email || '',
          'Selection status': status.status
        };
      });
      const sheet = XLSX.utils.json_to_sheet(rows);
      sheet['!cols'] = [
        { wch: 26 }, { wch: 18 }, { wch: 20 }, { wch: 30 }, { wch: 20 }
      ];
      XLSX.utils.book_append_sheet(workbook, sheet, meal.label);
    });

    XLSX.writeFile(workbook, `meal-participation-${getFileDate()}.xlsx`);
  };

  const downloadPdfReport = () => {
    if (busy || employees.length === 0) return;

    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();

    pdf.setFontSize(17);
    pdf.text('Meal Participation Report', 14, 16);
    pdf.setFontSize(10);
    pdf.text(`Meal date: ${selectedDate}`, 14, 23);
    pdf.text(`Total employees: ${employees.length}`, pageWidth - 14, 23, {
      align: 'right'
    });

    const summaryBody = MEALS.map((meal) => {
      const opted = mealCounts[meal.key]?.opted || [];
      const notOpted = mealCounts[meal.key]?.notOpted || [];
      const notSubmitted = notOpted.filter(
        (employee) => !selectionsByUser[employee.uid]
      ).length;
      return [meal.label, opted.length, notOpted.length, notSubmitted];
    });

    pdf.setFontSize(12);
    pdf.text('Meal Summary', 14, 33);
    autoTable(pdf, {
      startY: 37,
      head: [['Meal', 'Opted in', 'Not opted in', 'Not submitted']],
      body: summaryBody,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: [48, 83, 145] }
    });

    let nextY = pdf.lastAutoTable.finalY + 10;
    pdf.setFontSize(12);
    pdf.text('Employee-wise Meal Selections', 14, nextY);
    autoTable(pdf, {
      startY: nextY + 4,
      head: [[
        'Employee', 'Employee ID', 'Department',
        'Breakfast', 'Lunch', 'Snacks', 'Dinner'
      ]],
      body: employees.map((employee) => [
        getEmployeeName(employee),
        employee.employeeId || '—',
        employee.department || '—',
        ...MEALS.map((meal) => getEmployeeMealStatus(employee, meal).status)
      ]),
      theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: 2 },
      headStyles: { fillColor: [48, 83, 145] },
      margin: { left: 14, right: 14 },
      didDrawPage: () => {
        pdf.setFontSize(8);
        pdf.text(
          `Meal Participation Report | ${selectedDate}`,
          14,
          pdf.internal.pageSize.getHeight() - 7
        );
      }
    });

    MEALS.forEach((meal) => {
      pdf.addPage('a4', 'landscape');
      pdf.setFontSize(14);
      pdf.text(`${meal.label} - Employee Details`, 14, 16);

      const rows = employees.map((employee) => {
        const status = getEmployeeMealStatus(employee, meal);
        return [
          getEmployeeName(employee),
          employee.employeeId || '—',
          employee.department || '—',
          employee.email || '—',
          status.status
        ];
      });

      autoTable(pdf, {
        startY: 22,
        head: [['Employee', 'Employee ID', 'Department', 'Email', 'Selection status']],
        body: rows,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: [48, 83, 145] },
        margin: { left: 14, right: 14 },
        didDrawPage: () => {
          pdf.setFontSize(8);
          pdf.text(
            `Meal Participation Report | ${selectedDate}`,
            14,
            pdf.internal.pageSize.getHeight() - 7
          );
        }
      });
    });

    pdf.save(`meal-participation-${getFileDate()}.pdf`);
  };

  // --------------------------------------------------
  // UI
  // --------------------------------------------------

  return (
    <section className="meal-participation">

      {/* Header and date selector */}

      <div className="mpr-header">
        <div>
          <h2>Employee Meal Participation</h2>

          <p>
            See who selected each meal and who has not opted in.
          </p>
        </div>

        <div className="mpr-export-actions">
          <button
            type="button"
            className="mpr-export-button mpr-export-excel"
            onClick={downloadExcelReport}
            disabled={busy || employees.length === 0}
            title="Download the complete report as an Excel workbook"
          >
            <FileSpreadsheet size={16} />
            Download Excel
          </button>
          <button
            type="button"
            className="mpr-export-button mpr-export-pdf"
            onClick={downloadPdfReport}
            disabled={busy || employees.length === 0}
            title="Download the complete report as a PDF"
          >
            <FileText size={16} />
            Download PDF
          </button>
        </div>

        <label className="mpr-date-control">
          <CalendarDays size={17} />

          <span>Meal date</span>

          <input
            type="date"
            value={selectedDate}
            onChange={(event) =>
              setSelectedDate(event.target.value)
            }
          />
        </label>
      </div>

      {error && (
        <div className="mpr-error" role="alert">
          {error}
        </div>
      )}

      {/* Meal summary cards */}

      <div className="mpr-summary-grid">
        {MEALS.map((meal) => {
          const counts = mealCounts[meal.key] || {
            opted: [],
            notOpted: []
          };

          return (
            <button
              type="button"
              key={meal.key}
              className={`mpr-summary-card ${
                activeMeal === meal.key ? 'active' : ''
              }`}
              onClick={() => setActiveMeal(meal.key)}
            >
              <span className="mpr-meal-name">
                {meal.label}
              </span>

              <strong>
                {counts.opted.length}
                <small> / {employees.length}</small>
              </strong>

              <span className="mpr-card-caption">
                Opted in
              </span>

              <span className="mpr-card-secondary">
                {counts.notOpted.length} not opted in
              </span>
            </button>
          );
        })}
      </div>

      {/* NEW: Employee-wise meal selection overview */}

      <div className="mpr-list-panel mpr-overview-panel">

        <div className="mpr-list-heading">
          <div>
            <h3>Employee-wise Meal Selections</h3>

            <p>
              Complete meal selection status for every employee.
            </p>
          </div>

          <div className="mpr-search">
            <Search size={16} />

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search employees..."
              aria-label="Search employees"
            />
          </div>
        </div>

        {busy ? (
          <div className="mpr-state">
            <RefreshCw size={20} className="mpr-spin" />
            Loading participation data...
          </div>
        ) : filteredOverviewEmployees.length === 0 ? (
          <div className="mpr-state">
            No employees found.
          </div>
        ) : (
          <div className="mpr-table-wrap">

            <table className="mpr-table mpr-all-meals-table">

              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Employee ID</th>
                  <th>Department</th>

                  {MEALS.map((meal) => (
                    <th key={meal.key}>
                      {meal.label}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {filteredOverviewEmployees.map((employee) => {
                  const employeeSelection =
                    selectionsByUser[employee.uid];

                  return (
                    <tr key={employee.uid}>

                      <td>
                        <div className="mpr-employee">

                          <span className="mpr-avatar">
                            {getEmployeeName(employee)
                              .slice(0, 1)
                              .toUpperCase()}
                          </span>

                          <span>
                            <strong>
                              {getEmployeeName(employee)}
                            </strong>

                            <small>
                              {employee.email || '—'}
                            </small>
                          </span>

                        </div>
                      </td>

                      <td>
                        {employee.employeeId || '—'}
                      </td>

                      <td>
                        {employee.department || '—'}
                      </td>

                      {MEALS.map((meal) => {
                        const chosen = hasSelectedMeal(
                          employeeSelection?.[meal.key]
                        );

                        return (
                          <td key={meal.key}>

                            <span
                              className={`mpr-status ${
                                chosen ? 'opted' : 'not-opted'
                              }`}
                              title={
                                !employeeSelection
                                  ? 'No meal selection submitted for this date'
                                  : chosen
                                    ? 'Employee selected this meal'
                                    : 'Employee submitted preferences but did not select this meal'
                              }
                            >
                              {chosen ? 'Chosen' : 'Not chosen'}
                            </span>

                            {!employeeSelection && (
                              <small className="mpr-cell-note">
                                Not submitted
                              </small>
                            )}

                          </td>
                        );
                      })}

                    </tr>
                  );
                })}
              </tbody>

            </table>
          </div>
        )}
      </div>

      {/* Existing individual meal participation list */}

      <div className="mpr-list-panel">

        <div className="mpr-list-heading">

          <div>
            <h3>
              {MEALS.find(
                (meal) => meal.key === activeMeal
              )?.label} Employees
            </h3>

            <p>
              {listFilter === 'opted'
                ? 'Employees who selected this meal'
                : 'Employees who did not select this meal'}
            </p>
          </div>

          <div className="mpr-search">
            <Search size={16} />

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search employees..."
            />
          </div>

        </div>

        <div className="mpr-filter-tabs">

          <button
            type="button"
            className={
              listFilter === 'opted' ? 'active' : ''
            }
            onClick={() => setListFilter('opted')}
          >
            <CheckCircle2 size={15} />

            Opted in (
              {mealCounts[activeMeal]?.opted.length || 0}
            )
          </button>

          <button
            type="button"
            className={
              listFilter === 'notOpted' ? 'active' : ''
            }
            onClick={() => setListFilter('notOpted')}
          >
            <CircleSlash size={15} />

            Not opted in (
              {mealCounts[activeMeal]?.notOpted.length || 0}
            )
          </button>

        </div>

        {busy ? (
          <div className="mpr-state">
            <RefreshCw size={20} className="mpr-spin" />
            Loading participation data...
          </div>
        ) : visibleEmployees.length === 0 ? (
          <div className="mpr-state">
            No employees found in this list.
          </div>
        ) : (
          <div className="mpr-table-wrap">

            <table className="mpr-table">

              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Employee ID</th>
                  <th>Department</th>
                  <th>Selection status</th>
                </tr>
              </thead>

              <tbody>
                {visibleEmployees.map((employee) => {
                  const submitted = Boolean(
                    selectionsByUser[employee.uid]
                  );

                  return (
                    <tr key={employee.uid}>

                      <td>
                        <div className="mpr-employee">

                          <span className="mpr-avatar">
                            {getEmployeeName(employee)
                              .slice(0, 1)
                              .toUpperCase()}
                          </span>

                          <span>
                            <strong>
                              {getEmployeeName(employee)}
                            </strong>

                            <small>
                              {employee.email || '—'}
                            </small>
                          </span>

                        </div>
                      </td>

                      <td>
                        {employee.employeeId || '—'}
                      </td>

                      <td>
                        {employee.department || '—'}
                      </td>

                      <td>
                        {listFilter === 'opted' ? (
                          <span className="mpr-status opted">
                            Opted in
                          </span>
                        ) : (
                          <span
                            className={`mpr-status ${
                              submitted
                                ? 'not-opted'
                                : 'not-submitted'
                            }`}
                          >
                            {submitted
                              ? 'Not selected'
                              : 'Not submitted'}
                          </span>
                        )}
                      </td>

                    </tr>
                  );
                })}
              </tbody>

            </table>
          </div>
        )}
      </div>

      <p className="mpr-footnote">
        Employees without a selection document are included under
        "Not opted in" and marked "Not submitted". Changes update
        automatically as Firestore data changes.
      </p>

    </section>
  );
};

export default MealParticipationReport;
