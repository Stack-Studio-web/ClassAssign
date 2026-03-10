import React, { useRef, useState } from 'react';
import { useReactToPrint } from 'react-to-print';
import LogoKSI from "../assets/logo KSI.png";
import LogoKCT from "../assets/logo.png";

// Academic year options: start year so display is "YYYY-(YYYY+1)"
const currentYear = new Date().getFullYear();
const AY_OPTIONS = Array.from({ length: 6 }, (_, i) => currentYear - 2 + i);

const FacultySchedule = ({ plans, onClose }) => {
  const printRef = useRef();

  // Header controls
  const [semester, setSemester] = useState('EVEN');
  const [category, setCategory] = useState('CAT 1');
  const [ayStartYear, setAyStartYear] = useState(currentYear);
  const [departmentLine, setDepartmentLine] = useState('DEPARTMENT OF CSE, IT, AIDS, MCA');
  const [programmeLine1, setProgrammeLine1] = useState('BE CSE - B.Tech IT - B.Tech AI&DS');
  const [programmeLine2, setProgrammeLine2] = useState('M.Tech DS - M.E CSE (Cyber Security)');

  // Logo selection (shared with /Hall via localStorage)
  const getInitialLogoType = () => {
    if (typeof window === 'undefined') return 'KSI';
    return window.localStorage.getItem('kctLogoType') || 'KSI';
  };
  const [logoType, setLogoType] = useState(getInitialLogoType);

  const handleLogoChange = (e) => {
    const value = e.target.value;
    setLogoType(value);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('kctLogoType', value);
    }
  };

  const currentLogo = logoType === 'KCT' ? LogoKCT : LogoKSI;

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: "Faculty_Invigilation_Schedule",
  });

  // Group by date
  const groupedByDate = {};
  
  plans.forEach((plan) => {
    const dateKey = new Date(plan.examDate).toLocaleDateString('en-GB');
    
    if (!groupedByDate[dateKey]) {
      groupedByDate[dateKey] = [];
    }
    
    const venuesUsed = plan.venuesUsed || [];
    venuesUsed.forEach((venue) => {
      const venueName = venue.venueName || venue.venue_name || venue.venuename || '';
      const facultyName =
        venue.facultyName ||
        venue.facultyname ||
        venue.faculty_name ||
        "Not Assigned";
      const facultyDesignation =
        venue.facultyDesignation ||
        venue.facultydesignation ||
        venue.faculty_department ||
        venue.facultydepartment ||
        "";
      groupedByDate[dateKey].push({
        date: plan.examDate,
        session: plan.examSession,
        startTime: plan.examStartTime,
        endTime: plan.examEndTime,
        roomNo: venueName,
        facultyName,
        facultyDesignation,
        examType: plan.examType,
        courses: plan.selectedCourses
      });
    });
  });

  // Sort dates
  const sortedDates = Object.keys(groupedByDate).sort((a, b) => {
    const dateA = a.split('/').reverse().join('-');
    const dateB = b.split('/').reverse().join('-');
    return new Date(dateA) - new Date(dateB);
  });

  return (
    <div style={{ 
      position: 'fixed', 
      top: 0, 
      left: 0, 
      right: 0, 
      bottom: 0, 
      backgroundColor: 'rgba(0,0,0,0.5)', 
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '20px',
        borderRadius: '8px',
        maxWidth: '95vw',
        maxHeight: '95vh',
        overflow: 'auto',
        position: 'relative'
      }}>
        <div style={{ marginBottom: '20px', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }} className="print:hidden">
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontWeight: 500 }}>Semester:</span>
            <select
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #ccc', minWidth: '100px' }}
            >
              <option value="ODD">Odd Sem</option>
              <option value="EVEN">Even Sem</option>
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontWeight: 500 }}>Logo:</span>
            <select
              value={logoType}
              onChange={handleLogoChange}
              style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #ccc', minWidth: '120px' }}
            >
              <option value="KSI">KSI</option>
              <option value="KCT">KCT</option>
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', flexGrow: 1, minWidth: '220px' }}>
            <span style={{ fontWeight: 500 }}>Department:</span>
            <input
              type="text"
              value={departmentLine}
              onChange={(e) => setDepartmentLine(e.target.value)}
              style={{ flex: 1, padding: '6px 10px', borderRadius: '4px', border: '1px solid #ccc' }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', flexGrow: 1, minWidth: '220px' }}>
            <span style={{ fontWeight: 500 }}>Program 1:</span>
            <input
              type="text"
              value={programmeLine1}
              onChange={(e) => setProgrammeLine1(e.target.value)}
              style={{ flex: 1, padding: '6px 10px', borderRadius: '4px', border: '1px solid #ccc' }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', flexGrow: 1, minWidth: '220px' }}>
            <span style={{ fontWeight: 500 }}>Program 2:</span>
            <input
              type="text"
              value={programmeLine2}
              onChange={(e) => setProgrammeLine2(e.target.value)}
              style={{ flex: 1, padding: '6px 10px', borderRadius: '4px', border: '1px solid #ccc' }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontWeight: 500 }}>Category:</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #ccc', minWidth: '100px' }}
            >
              <option value="CAT 1">CAT 1</option>
              <option value="CAT 2">CAT 2</option>
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontWeight: 500 }}>AY:</span>
            <select
              value={ayStartYear}
              onChange={(e) => setAyStartYear(Number(e.target.value))}
              style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #ccc', minWidth: '120px' }}
            >
              {AY_OPTIONS.map((y) => (
                <option key={y} value={y}>AY {y}-{y + 1}</option>
              ))}
            </select>
          </label>
          <button
            onClick={handlePrint}
            style={{
              padding: '10px 20px',
              background: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            🖨️ Print Schedule
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              background: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            Close
          </button>
        </div>

        <div ref={printRef}>
          <style>{`
            @media print {
              @page { 
                size: A4; 
                margin: 15mm; 
              }
            }
          `}</style>

          {/* First Page - Header and Logo */}
          <div className="page-break">
            <div style={{ 
              textAlign: 'center', 
              marginBottom: '50px', 
              paddingBottom: '20px' 
            }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center', 
                marginBottom: '20px' 
              }}>
                <img 
                  src={currentLogo} 
                  alt="KSI Logo" 
                  style={{ 
                    width: '200px', 
                    height: 'auto', 
                    maxHeight: '120px' 
                  }} 
                />
              </div>
              
              <h1 style={{ 
                margin: '15px 0', 
                fontSize: '20pt', 
                fontWeight: 'bold' 
              }}>
                Kumaraguru College of Technology
              </h1>
                          <h3 style={{ 
                margin: '10px 0', 
                fontSize: '14pt', 
                fontWeight: 'bold' ,
                fontFamily: 'serif'
              }}>
                OFFICE OF THE CONTROLLER OF EXAMINATION
              </h3>
              <h2 style={{ 
                margin: '10px 0', 
                fontSize: '14pt', 
                fontWeight: 'bold' 
              }}>
                {departmentLine}
              </h2>
  
              <h4 style={{ 
                margin: '10px 0', 
                fontSize: '12pt', 
                fontWeight: 'normal' 
              }}>
                {programmeLine1}
              </h4>
              <h4 style={{ 
                margin: '6px 0', 
                fontSize: '12pt', 
                fontWeight: 'normal' 
              }}>
                {programmeLine2}
              </h4>
              <h4 style={{ 
                margin: '10px 0', 
                fontSize: '12pt', 
                fontWeight: 'normal' 
              }}>
                AY {ayStartYear}-{ayStartYear + 1} - {semester} SEM ({category})
              </h4>
              <h4 style={{ 
                margin: '10px 0', 
                fontSize: '12pt', 
                fontWeight: 'normal' 
              }}>
                Invigilation Schedule
              </h4>
            </div>

           
          </div>

          {/* Subsequent Pages - Date Tables */}
          {sortedDates.map((dateKey, index) => {
            const entries = groupedByDate[dateKey];
            
            // Sort by session and room
            entries.sort((a, b) => {
              if (a.session !== b.session) return a.session.localeCompare(b.session);
              return a.roomNo.localeCompare(b.roomNo);
            });

            const sessionEntry = entries[0];
            const sessionTime = `${sessionEntry.startTime} - ${sessionEntry.endTime}`;

            return (
              <div key={dateKey} style={{ marginBottom: '30px' }}>
                {/* Date Header */}
                <div style={{ 
                  fontWeight: 'bold', 
                  marginBottom: '5px', 
                  fontSize: '11pt',
                  display: 'flex',
                  justifyContent: 'space-between'
                }}>
                  <span>Date: {dateKey}</span>
                  <span style={{ marginLeft: 'auto' }}>
                    {sessionEntry.session === 'FN' ? 'FN:' : 'AN:'} {sessionTime}
                  </span>
                </div>

                {/* Table */}
                <table style={{ 
                  width: '100%', 
                  borderCollapse: 'collapse', 
                  marginBottom: '20px'
                }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f0f0f0' }}>
                      <th style={{ 
                        border: '1px solid black', 
                        padding: '6px', 
                        textAlign: 'center', 
                        width: '60px',
                        fontSize: '11pt',
                        fontWeight: 'bold'
                      }}>
                        S. No.
                      </th>
                      <th style={{ 
                        border: '1px solid black', 
                        padding: '6px', 
                        textAlign: 'center', 
                        width: '140px',
                        fontSize: '11pt',
                        fontWeight: 'bold'
                      }}>
                        Date & Session
                      </th>
                      <th style={{ 
                        border: '1px solid black', 
                        padding: '6px', 
                        textAlign: 'center', 
                        width: '100px',
                        fontSize: '11pt',
                        fontWeight: 'bold'
                      }}>
                        Room No.
                      </th>
                      <th style={{ 
                        border: '1px solid black', 
                        padding: '6px', 
                        textAlign: 'center',
                        fontSize: '11pt',
                        fontWeight: 'bold'
                      }}>
                        Name of the Faculty with Designation
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry, idx) => (
                      <tr key={idx}>
                        <td style={{ 
                          border: '1px solid black', 
                          padding: '6px', 
                          textAlign: 'center',
                          fontSize: '11pt'
                        }}>
                          {idx + 1}
                        </td>
                        <td style={{ 
                          border: '1px solid black', 
                          padding: '6px', 
                          textAlign: 'center',
                          fontSize: '11pt'
                        }}>
                          {dateKey} - {entry.session}
                        </td>
                        <td style={{ 
                          border: '1px solid black', 
                          padding: '6px', 
                          textAlign: 'center',
                          fontSize: '11pt'
                        }}>
                          {entry.roomNo}
                        </td>
                        <td style={{ 
                          border: '1px solid black', 
                          padding: '6px', 
                          textAlign: 'left',
                          fontSize: '11pt'
                        }}>
                          {entry.facultyName} {entry.facultyDesignation ? `(${entry.facultyDesignation})` : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default FacultySchedule;