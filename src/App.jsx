// src/App.jsx - UPDATED WITH TIMETABLE ROUTE
import React, { useEffect, useState } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { fetchCurrentUser } from './lib/api';
import { useToast } from './context/ToastContext';
import Landing from './pages/Landing';
import ChangePassword from './pages/ChangePassword';
import Layout from './Components/Layout';
import Allotment from './pages/Allotment';
import Venue from './pages/Venue';
import Report from './pages/Report';
import CompletedReports from './pages/CompletedReports';
import Hall from './pages/StudentArrangement';
import StudentBrowser from './pages/StudentBrowser';
import MentorImportPage from './pages/MentorImport';
import MentorListPage from './pages/MentorList';
import MentorMappingPage from './pages/MentorMapping';
import AcademicManagementPage from './pages/AcademicManagement';
import BatchManagementPage from './pages/BatchManagement';
import StudentManagementPage from './pages/StudentManagement';
import Faculty from './pages/Faculty';
import UserManagement from './pages/UserManagement';
import Logs from './pages/Logs'; 
import Timetable from './pages/Timetable'; // ✅ NEW
import { StudentAttendance } from './Components/StudentAttendance';
import IneligibleStudentsView from './pages/IneligibleStudentsView';
import FacultyLogin from './pages/FacultyLogin';
import FacultyDashboard from './pages/FacultyDashboard';
import FacultyAttendance from './pages/FacultyAttendance';
import AttendanceReports from './pages/AttendanceReports';
import ActiveAttendance from './pages/ActiveAttendance';
import CompletedAttendance from './pages/CompletedAttendance';
import NotificationManagement from './pages/NotificationManagement';
import FacultyTransferRequests from './pages/FacultyTransferRequests';
import Loader from './Components/Loader';
import MentorLogin from './pages/mentor-portal/MentorLogin';
import MentorAccessDenied from './pages/mentor-portal/MentorAccessDenied';
import MentorLayout, { MentorGuard } from './Components/mentor-portal/MentorLayout';
import MentorDashboard from './pages/mentor-portal/MentorDashboard';
import MentorStudents from './pages/mentor-portal/MentorStudents';
import MentorPlaceholder from './pages/mentor-portal/MentorPlaceholder';
import MentorChangePassword from './pages/mentor-portal/MentorChangePassword';

/* ===============================
    AUTH GUARD COMPONENT
    Updated to handle specific allowed roles
=============================== */
const AuthGuard = ({ children, allowedRoles = [] }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const user = await fetchCurrentUser();

      if (!user) {
        navigate('/login', { replace: true });
        return;
      }

      if (user.mustChangePassword && location.pathname !== '/change-password') {
        navigate('/change-password', { replace: true });
        return;
      }

      if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
        toast.error(
          `${user.role} does not have permission to view this page.`,
          'Access denied'
        );
        const fallback = user.role === 'faculty'
          ? '/faculty/dashboard'
          : user.role === 'hod'
            ? '/student/browser'
            : '/allotment';
        navigate(fallback, { replace: true });
        return;
      }

      setIsChecking(false);
    };

    checkAuth();
  }, [navigate, location.pathname, allowedRoles]);

  if (isChecking) {
    return <Loader fullPage message="Loading..." size="xl" />;
  }
  
  return children;
};

/* ===============================
    MAIN APP COMPONENT
=============================== */
function App() {
  return (
    <Routes>
      {/* PUBLIC ROUTES */}
      <Route path="/" element={<Landing />} />      
      <Route path="/login" element={<Landing />} />
      <Route path="/attendance/login" element={<FacultyLogin />} />
      <Route path="/mentor-portal/login" element={<MentorLogin />} />
      <Route path="/mentor-portal/access-denied" element={<MentorAccessDenied />} />
      <Route
        path="/mentor-portal/change-password"
        element={
          <MentorGuard allowPasswordChange>
            <MentorChangePassword />
          </MentorGuard>
        }
      />
      <Route path="/api/auth/microsoft/callback" element={<Landing />} />

      <Route
        path="/change-password"
        element={
          <AuthGuard>
            <ChangePassword />
          </AuthGuard>
        }
      />

      {/* FACULTY ATTENDANCE PORTAL */}
      <Route
        path="/faculty/dashboard"
        element={
          <AuthGuard allowedRoles={['faculty']}>
            <FacultyDashboard />
          </AuthGuard>
        }
      />

      <Route
        path="/faculty/attendance/:assignmentUuid"
        element={
          <AuthGuard allowedRoles={['faculty']}>
            <FacultyAttendance />
          </AuthGuard>
        }
      />

      <Route
        path="/admin/notifications"
        element={
          <AuthGuard allowedRoles={['admin', 'faculty_incharge']}>
            <Layout><NotificationManagement /></Layout>
          </AuthGuard>
        }
      />

      <Route
        path="/admin/attendance/transfers"
        element={
          <AuthGuard allowedRoles={['admin', 'faculty_incharge', 'hod']}>
            <Layout><FacultyTransferRequests /></Layout>
          </AuthGuard>
        }
      />

      <Route
        path="/admin/attendance"
        element={
          <AuthGuard allowedRoles={['admin', 'faculty_incharge']}>
            <Navigate to="/attendance" replace />
          </AuthGuard>
        }
      />

      <Route
        path="/admin/attendance/reports"
        element={
          <AuthGuard allowedRoles={['admin', 'faculty_incharge']}>
            <Layout><AttendanceReports /></Layout>
          </AuthGuard>
        }
      />

      <Route
        path="/attendance"
        element={
          <AuthGuard allowedRoles={['admin', 'faculty_incharge', 'hod', 'faculty']}>
            <Layout><ActiveAttendance /></Layout>
          </AuthGuard>
        }
      />

      <Route
        path="/attendance/completed"
        element={
          <AuthGuard allowedRoles={['admin', 'faculty_incharge', 'hod', 'faculty']}>
            <Layout><CompletedAttendance /></Layout>
          </AuthGuard>
        }
      />

      <Route
        path="/attendance/sheets"
        element={
          <AuthGuard allowedRoles={['admin', 'faculty_incharge', 'hod']}>
            <Layout><StudentAttendance /></Layout>
          </AuthGuard>
        }
      />

      {/* MENTOR SELF-SERVICE PORTAL */}
      <Route
        path="/mentor-portal"
        element={
          <MentorGuard>
            <MentorLayout />
          </MentorGuard>
        }
      >
        <Route index element={<Navigate to="/mentor-portal/dashboard" replace />} />
        <Route path="dashboard" element={<MentorDashboard />} />
        <Route path="students" element={<MentorStudents />} />
        <Route
          path="retest-applications"
          element={
            <MentorPlaceholder
              title="Retest Applications"
              description="Review and manage student retest applications. This module will be available in a future release."
            />
          }
        />
        <Route
          path="notifications"
          element={
            <MentorPlaceholder
              title="Notifications"
              description="Stay updated on retest submissions, approvals, and student activity."
            />
          }
        />
        <Route
          path="export-reports"
          element={
            <MentorPlaceholder
              title="Export Reports"
              description="Download attendance and retest reports for your assigned students."
            />
          }
        />
        <Route
          path="profile"
          element={
            <MentorPlaceholder
              title="Profile"
              description="View and update your mentor profile settings."
            />
          }
        />
      </Route>

      <Route
        path="/venue"
        element={
          <AuthGuard allowedRoles={['admin', 'faculty_incharge']}>
            <Layout><Venue /></Layout>
          </AuthGuard>
        }
      />

      <Route
        path="/faculty"
        element={
          <AuthGuard allowedRoles={['admin', 'faculty_incharge']}>
            <Layout><Faculty /></Layout>
          </AuthGuard>
        }
      />

      <Route
        path="/report"
        element={
          <AuthGuard allowedRoles={['admin', 'faculty_incharge', 'hod']}>
            <Layout><Report /></Layout>
          </AuthGuard>
        }
      />

      <Route
        path="/report/completed"
        element={
          <AuthGuard allowedRoles={['admin', 'faculty_incharge', 'hod']}>
            <Layout><CompletedReports /></Layout>
          </AuthGuard>
        }
      />

      <Route path="/hall" element={<AuthGuard allowedRoles={['admin', 'faculty_incharge', 'hod']}><Layout><Hall /></Layout></AuthGuard>} />
      <Route
        path="/Hall"
        element={
          <AuthGuard allowedRoles={['admin', 'faculty_incharge', 'hod']}>
            <Layout><Hall /></Layout>
          </AuthGuard>
        }
      />

      <Route
        path="/student"
        element={
          <AuthGuard allowedRoles={['admin', 'faculty_incharge']}>
            <Navigate to="/student/manage" replace />
          </AuthGuard>
        }
      />

      <Route
        path="/student/academic"
        element={
          <AuthGuard allowedRoles={['admin', 'faculty_incharge']}>
            <Layout><AcademicManagementPage /></Layout>
          </AuthGuard>
        }
      />

      <Route
        path="/student/manage"
        element={
          <AuthGuard allowedRoles={['admin', 'faculty_incharge']}>
            <Layout><StudentManagementPage /></Layout>
          </AuthGuard>
        }
      />

      <Route
        path="/student/batches"
        element={
          <AuthGuard allowedRoles={['admin', 'faculty_incharge']}>
            <Layout><BatchManagementPage /></Layout>
          </AuthGuard>
        }
      />

      <Route
        path="/mentor"
        element={
          <AuthGuard allowedRoles={['admin', 'faculty_incharge']}>
            <Navigate to="/mentor/import" replace />
          </AuthGuard>
        }
      />

      <Route
        path="/mentor/import"
        element={
          <AuthGuard allowedRoles={['admin', 'faculty_incharge']}>
            <Layout><MentorImportPage /></Layout>
          </AuthGuard>
        }
      />

      <Route
        path="/mentor/list"
        element={
          <AuthGuard allowedRoles={['admin', 'faculty_incharge']}>
            <Layout><MentorListPage /></Layout>
          </AuthGuard>
        }
      />

      <Route
        path="/mentor/mapping"
        element={
          <AuthGuard allowedRoles={['admin', 'faculty_incharge']}>
            <Layout><MentorMappingPage /></Layout>
          </AuthGuard>
        }
      />

      <Route
        path="/student/browser"
        element={
          <AuthGuard allowedRoles={['admin', 'faculty_incharge', 'hod']}>
            <Layout><StudentBrowser /></Layout>
          </AuthGuard>
        }
      />

      {/* Legacy redirects */}
      <Route
        path="/student/import"
        element={
          <AuthGuard allowedRoles={['admin', 'faculty_incharge']}>
            <Navigate to="/student/manage" replace />
          </AuthGuard>
        }
      />

      <Route
        path="/student/academic-years"
        element={
          <AuthGuard allowedRoles={['admin', 'faculty_incharge']}>
            <Navigate to="/student/academic" replace />
          </AuthGuard>
        }
      />

      {/* ✅ NEW: TIMETABLE ROUTE - ALL ROLES */}
      <Route
        path="/timetable"
        element={
          <AuthGuard allowedRoles={['admin', 'faculty_incharge', 'hod']}>
            <Layout><Timetable /></Layout>
          </AuthGuard>
        }
      />

      <Route
        path="/ineligibility/view"
        element={
          <AuthGuard allowedRoles={['admin', 'faculty_incharge']}>
            <Layout><IneligibleStudentsView /></Layout>
          </AuthGuard>
        }
      />

      {/* ======================================================
          RESTRICTED ROUTES - ALLOTMENT (Admin & Faculty Only)
      ====================================================== */}
      <Route
        path="/allotment"
        element={
          <AuthGuard allowedRoles={['admin', 'faculty_incharge']}>
            <Layout><Allotment /></Layout>
          </AuthGuard>
        }
      />

      {/* ======================================================
          ADMIN & HoD: User Management. ADMIN-ONLY: Audit Logs
      ====================================================== */}
      <Route
        path="/users"
        element={
          <AuthGuard allowedRoles={['admin', 'hod']}>
            <Layout><UserManagement /></Layout>
          </AuthGuard>
        }
      />

      <Route
        path="/logs"
        element={
          <AuthGuard allowedRoles={['admin']}>
            <Layout><Logs /></Layout>
          </AuthGuard>
        }
      />

      {/* 404 FALLBACK */}
      <Route 
        path="*" 
        element={
          <div className="min-h-screen flex items-center justify-center bg-gray-100">
            <div className="text-center">
              <h1 className="text-6xl font-bold text-gray-800">404</h1>
              <p className="text-xl text-gray-600 mt-4">Page not found</p>
              <a 
                href="/login" 
                className="mt-6 inline-block bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
              >
                Go to Login
              </a>
            </div>
          </div>
        } 
      />
    </Routes>
  );
}

export default App;