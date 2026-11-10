// src/components/Admin/ReportsDashboard.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { getLocalDateString } from '../../utils/dateUtils';
import { Calendar, RefreshCw, Download, BarChart3, Coffee, Soup, Cookie, ClipboardList, Users, History, Check, X, CheckCircle2, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import './ReportsDashboard.css';

const MEAL_SECTIONS = [
  { key: 'breakfast', label: 'Breakfast', Icon: Coffee },
  { key: 'lunch', label: 'Lunch', Icon: Soup },
  { key: 'snacks', label: 'Snacks', Icon: Cookie }
];

// Tallies how many employees ordered each item, per meal, most ordered first.
// Names differing only by case or surrounding spaces count as one item.
const countItemsByMeal = (participants) => {
  const list = Array.isArray(participants) ? participants : [];
  const result = {};

  MEAL_SECTIONS.forEach(({ key }) => {
    const tally = new Map();

    list.forEach((participant) => {
      const items = Array.isArray(participant?.[key]) ? participant[key] : [];

      items.forEach((item) => {
        const rawName = typeof item === 'object' && item !== null ? item.name : item;
        if (typeof rawName !== 'string') return;

        const name = rawName.trim();
        if (!name) return;

        const id = name.toLowerCase();
        const entry = tally.get(id) || { name, count: 0 };
        entry.count += 1;
        tally.set(id, entry);
      });
    });

    result[key] = [...tally.values()].sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name)
    );
  });

  return result;
};

// Saved reports hold item arrays; older ones may hold true/false per meal.
const hasOrdered = (meal) => (Array.isArray(meal) ? meal.length > 0 : Boolean(meal));

const ReportsDashboard = () => {
  const [selectedDate, setSelectedDate] = useState('');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [allReports, setAllReports] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const PARTICIPANTS_PER_PAGE = 20;
  const [menu, setMenu] = useState(null);
  const itemCounts = useMemo(() => countItemsByMeal(report?.participants), [report]);

  useEffect(() => {
    // Set tomorrow as default (since employees select for tomorrow)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
   setSelectedDate(getLocalDateString(tomorrow));
    fetchAllReports();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
    if (selectedDate) {
      loadReportForDate(selectedDate);
    }
  }, [selectedDate]);

  const fetchAllReports = async () => {
    try {
      const reportsRef = collection(db, 'reports');
      const snapshot = await getDocs(reportsRef);
      const reports = snapshot.docs.map(doc => ({
        date: doc.id,
        ...doc.data()
      }));
      setAllReports(reports.sort((a, b) => b.date.localeCompare(a.date)));
    } catch (error) {
      console.error('Error fetching reports:', error);
    }
  };

  const loadReportForDate = async (date) => {
    if (!date) {
      setReport(null);
      setMenu(null);
      return;
    }

    try {
      setLoading(true);
      
      // Reset current data while loading
      setReport(null);
      setMenu(null);
      
      // Load report if it exists
      const reportRef = doc(db, 'reports', date);
      const reportSnap = await getDoc(reportRef);

      if (reportSnap.exists()) {
        setReport(reportSnap.data());
      }

      // Try to load menu
      try {
        const menuRef = doc(db, 'menus', date);
        const menuSnap = await getDoc(menuRef);
        if (menuSnap.exists()) {
          setMenu(menuSnap.data());
        }
      } catch (menuError) {
        console.log('No menu found for date', date, menuError);
        // Continue without menu data
      }
    } catch (error) {
      console.error('Error loading report:', error);
      showMessage('error', 'Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  const generateReport = async () => {
    if (!selectedDate) {
      showMessage('error', 'Please select a date');
      return;
    }

    try {
      setLoading(true);
      
      // Initialize counts and participants
      const counts = { breakfast: 0, lunch: 0, snacks: 0 };
      const participants = [];
      let hasSelections = false;

      // Try to fetch meal selections if they exist
      try {
        const selectionsRef = collection(db, 'mealSelections', selectedDate, 'users');
        const snapshot = await getDocs(selectionsRef);
        
        if (!snapshot.empty) {
          hasSelections = true;
          snapshot.forEach(doc => {
             const data = doc.data();
             const breakfastItems = Array.isArray(data.breakfast) ? data.breakfast : [];
             const lunchItems = Array.isArray(data.lunch) ? data.lunch : [];
             const snacksItems = Array.isArray(data.snacks) ? data.snacks : [];

             // Skip documents with no items (e.g. a day cleared in the weekly view)
             if (breakfastItems.length + lunchItems.length + snacksItems.length === 0) return;

             if (breakfastItems.length > 0) counts.breakfast++;
             if (lunchItems.length > 0) counts.lunch++;
             if (snacksItems.length > 0) counts.snacks++;

             participants.push({
               email: data.email || 'Unknown',
               breakfast: breakfastItems,
               lunch: lunchItems,
               snacks: snacksItems
                        });
           });
        }
      } catch (error) {
        console.log('Error fetching meal selections:', error);
        // Continue with empty report
      }

      const reportData = {
        ...counts,
        totalParticipants: participants.length,
        // Add timestamp for when the report was generated
        generatedAt: new Date().toLocaleString('en-CA'),
        participants,
        hasData: hasSelections
      };

      // Save report
      const reportRef = doc(db, 'reports', selectedDate);
      await setDoc(reportRef, reportData);

      setReport(reportData);
      setCurrentPage(1);
      showMessage('success', hasSelections ? 'Report generated successfully!' : 'No meal selections found for this date.');
      fetchAllReports();
    } catch (error) {
      console.error('Error generating report:', error);
      showMessage('error', 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    if (!report) return;

    const csvRows = [];
    csvRows.push(['Email', 'Breakfast', 'Lunch', 'Snacks']);

    // Initialize counters
    let breakfastCount = 0;
    let lunchCount = 0;
    let snacksCount = 0;

    // Add participant rows and count selections
 report.participants?.forEach(p => {
  csvRows.push([
    p.email,
    p.breakfast.length > 0 ? p.breakfast.join('; ') : 'None',
    p.lunch.length > 0 ? p.lunch.join('; ') : 'None',
    p.snacks.length > 0 ? p.snacks.join('; ') : 'None'
  ]);

  // Count selections
  if (p.breakfast.length > 0) breakfastCount++;
  if (p.lunch.length > 0) lunchCount++;
  if (p.snacks.length > 0) snacksCount++;
});

    // Add empty row for separation
    csvRows.push([]);

    // Add summary section
    csvRows.push(['SUMMARY']);
    csvRows.push(['Total employees', report.totalParticipants || 0]);
    csvRows.push(['Breakfast Count', breakfastCount]);
    csvRows.push(['Lunch Count', lunchCount]);
    csvRows.push(['Snacks Count', snacksCount]);
    csvRows.push(['Total Meals', breakfastCount + lunchCount + snacksCount]);

    // Add item-wise order counts
    csvRows.push([]);
    csvRows.push(['ITEM-WISE ORDERS']);
    csvRows.push(['Meal', 'Item', 'Orders']);
    MEAL_SECTIONS.forEach(({ key, label }) => {
      itemCounts[key].forEach(({ name, count }) => {
        csvRows.push([label, `"${name.replace(/"/g, '""')}"`, count]);
      });
    });

    const csvContent = csvRows.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meal-report-${selectedDate}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 5000);
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getTotal = () => {
    if (!report) return 0;
    return report.breakfast + report.lunch + report.snacks;
  };
  // Pagination calculations for participants table
const totalParticipantPages = report?.participants 
  ? Math.ceil(report.participants.length / PARTICIPANTS_PER_PAGE) 
  : 0;

const paginatedParticipants = report?.participants
  ? report.participants.slice(
      (currentPage - 1) * PARTICIPANTS_PER_PAGE,
      currentPage * PARTICIPANTS_PER_PAGE
    )
  : [];

const goToNextPage = () => {
  if (currentPage < totalParticipantPages) setCurrentPage(currentPage + 1);
};

const goToPreviousPage = () => {
  if (currentPage > 1) setCurrentPage(currentPage - 1);
};

  return (
    <div className="reports-dashboard">
      {message.text && (
        <div className={`message ${message.type}`}>
          {message.type === 'success' && <CheckCircle2 size={16} className="inline-icon" />}
          {message.type === 'error' && <AlertTriangle size={16} className="inline-icon" />}
          {message.text}
        </div>
      )}

      <div className="report-controls">
        <div className="date-selector">
          <label><Calendar size={16} className="inline-icon" />Select Date</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
          <span className="selected-date-display">
            {selectedDate && formatDate(selectedDate)}
          </span>
        </div>

        <div className="control-buttons">
          <button
            className="btn btn-primary"
            onClick={generateReport}
            disabled={loading}
          >
            {loading ? 'Generating...' : <><RefreshCw size={16} className="inline-icon" />Generate Report</>}
          </button>
          
          {report && (
            <button
              className="btn btn-secondary"
              onClick={exportToCSV}
            >
              <Download size={16} className="inline-icon" />Export CSV
            </button>
          )}
        </div>
      </div>

      {loading && !report ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading report...</p>
        </div>
      ) : !report ? (
        <div className="no-report">
          <div className="empty-state">
            <span className="empty-icon"><BarChart3 size={56} /></span>
            <h3>No Report Available</h3>
            <p>Generate a report to see meal selection statistics for {formatDate(selectedDate)}</p>
            <p className="small-text">Click "Generate Report" above to create one</p>
          </div>
        </div>
      ) : (
        <>
          <div className="stats-grid">
            <div className="stat-card breakfast">
              <div className="stat-icon"><Coffee size={36} /></div>
              <div className="stat-content">
                <h4>Breakfast</h4>
                <p className="stat-number">{report.breakfast}</p>
                <span className="stat-label">employees</span>
              </div>
            </div>

            <div className="stat-card lunch">
              <div className="stat-icon"><Soup size={36} /></div>
              <div className="stat-content">
                <h4>Lunch</h4>
                <p className="stat-number">{report.lunch}</p>
                <span className="stat-label">employees</span>
              </div>
            </div>

            <div className="stat-card snacks">
              <div className="stat-icon"><Cookie size={36} /></div>
              <div className="stat-content">
                <h4>Snacks</h4>
                <p className="stat-number">{report.snacks}</p>
                <span className="stat-label">employees</span>
              </div>
            </div>

            <div className="stat-card total">
              <div className="stat-icon"><BarChart3 size={36} /></div>
              <div className="stat-content">
                <h4>Total Meals</h4>
                <p className="stat-number">{getTotal()}</p>
                <span className="stat-label">across all categories</span>
              </div>
            </div>
          </div>

          <div className="menu-reference">
            <h3><ClipboardList size={18} className="inline-icon" />Item-wise Orders</h3>
            <div className="menu-items-display">
              {MEAL_SECTIONS.map((meal) => (
                <div className="menu-column" key={meal.key}>
                  <h4><meal.Icon size={16} className="inline-icon" />{meal.label}</h4>
                  <ul>
                    {itemCounts[meal.key].length > 0 ? (
                      itemCounts[meal.key].map(({ name, count }) => (
                        <li className="item-count-row" key={name}>
                          <span>{name}</span>
                          <strong>{count} {count === 1 ? 'order' : 'orders'}</strong>
                        </li>
                      ))
                    ) : (
                      <li>No orders</li>
                    )}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {menu && (
            <div className="menu-reference">
              <h3><ClipboardList size={18} className="inline-icon" />Menu for this day</h3>
              <div className="menu-items-display">
                <div className="menu-column">
                  <h4><Coffee size={16} className="inline-icon" />Breakfast</h4>
                  <ul>
                    {menu.breakfast?.map((item, i) => <li key={i}>{typeof item === 'object' && item !== null ? item.name : item}</li>) || <li>No items</li>}
                  </ul>
                </div>
                <div className="menu-column">
                  <h4><Soup size={16} className="inline-icon" />Lunch</h4>
                  <ul>
                    {menu.lunch?.map((item, i) => <li key={i}>{typeof item === 'object' && item !== null ? item.name : item}</li>) || <li>No items</li>}
                  </ul>
                </div>
                <div className="menu-column">
                  <h4><Cookie size={16} className="inline-icon" />Snacks</h4>
                  <ul>
                    {menu.snacks?.map((item, i) => <li key={i}>{typeof item === 'object' && item !== null ? item.name : item}</li>) || <li>No items</li>}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {report.participants && report.participants.length > 0 && (
            <div className="participants-table">
              <h3><Users size={18} className="inline-icon" />Participant Details ({report.totalParticipants})</h3>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Email</th>
                      <th><Coffee size={14} className="inline-icon" />Breakfast</th>
                      <th><Soup size={14} className="inline-icon" />Lunch</th>
                      <th><Cookie size={14} className="inline-icon" />Snacks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedParticipants.map((p, index) => (
                      <tr key={index}>
                        <td>{(currentPage - 1) * PARTICIPANTS_PER_PAGE + index + 1}</td>
                        <td>{p.email}</td>
                        <td>
                          <span className={`badge ${hasOrdered(p.breakfast) ? 'yes' : 'no'}`}>
                            {hasOrdered(p.breakfast) ? <Check size={14} style={{ verticalAlign: '-0.15em' }} aria-label="Yes" /> : <X size={14} style={{ verticalAlign: '-0.15em' }} aria-label="No" />}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${hasOrdered(p.lunch) ? 'yes' : 'no'}`}>
                            {hasOrdered(p.lunch) ? <Check size={14} style={{ verticalAlign: '-0.15em' }} aria-label="Yes" /> : <X size={14} style={{ verticalAlign: '-0.15em' }} aria-label="No" />}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${hasOrdered(p.snacks) ? 'yes' : 'no'}`}>
                            {hasOrdered(p.snacks) ? <Check size={14} style={{ verticalAlign: '-0.15em' }} aria-label="Yes" /> : <X size={14} style={{ verticalAlign: '-0.15em' }} aria-label="No" />}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalParticipantPages > 1 && (
      <div className="pagination-controls">
        <button
          className="btn btn-secondary btn-sm"
          onClick={goToPreviousPage}
          disabled={currentPage === 1}
        >
          <ChevronLeft size={16} className="inline-icon" />Previous
        </button>
        <span className="pagination-info">
          Page {currentPage} of {totalParticipantPages}
        </span>
        <button
          className="btn btn-secondary btn-sm"
          onClick={goToNextPage}
          disabled={currentPage === totalParticipantPages}
        >
          Next<ChevronRight size={16} className="inline-icon trailing" />
        </button>
      </div>
    )}
              
            </div>
          )}
        </>
      )}

      {/* Recent Reports */}
      {allReports.length > 0 && (
        <div className="recent-reports">
          <h3><History size={18} className="inline-icon" />Recent Reports</h3>
          <div className="reports-list">
            {allReports.slice(0, 5).map(r => (
              <div 
                key={r.date} 
                className="report-card-small"
                onClick={() => setSelectedDate(r.date)}
              >
                <div className="report-date">
                  <strong>{formatDate(r.date)}</strong>
                  {/* <span className="date-code">{r.date}</span> */}
                </div>
                <div className="report-summary">
                  <span title="Breakfast"><Coffee size={14} className="inline-icon" />{r.breakfast}</span>
                  <span title="Lunch"><Soup size={14} className="inline-icon" />{r.lunch}</span>
                  <span title="Snacks"><Cookie size={14} className="inline-icon" />{r.snacks}</span>
                  <span className="total-badge">{r.breakfast + r.lunch + r.snacks} total</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportsDashboard;

