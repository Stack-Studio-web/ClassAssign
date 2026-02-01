import React, { useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import Logo from "../assets/Logo KSI.png";

const FacultySchedule = ({ plans, onClose }) => {
  const printRef = useRef();

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
      groupedByDate[dateKey].push({
        date: plan.examDate,
        session: plan.examSession,
        startTime: plan.examStartTime,
        endTime: plan.examEndTime,
        roomNo: venue.venueName,
        facultyName: venue.facultyName || "Not Assigned",
        facultyDesignation: venue.facultyDesignation || "",
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
        <div style={{ marginBottom: '20px', display: 'flex', gap: '10px' }} className="print:hidden">
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
                  src={Logo} 
                  alt="KSI Logo" 
                  style={{ 
                    width: '120px', 
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
                DEPARTMENT OF CSE, IT, AIDS, MCA
              </h2>
  
              <h4 style={{ 
                margin: '10px 0', 
                fontSize: '12pt', 
                fontWeight: 'normal' 
              }}>
                AY 2025-2026 - EVEN SEM CAT 1
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