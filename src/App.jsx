// src/App.jsx - UPDATED WITH TIMETABLE ROUTE
import React, { useEffect, useState } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { fetchCurrentUser } from './lib/api';
import { useToast } from './context/ToastContext';
import Landing from './pages/Landing';
import ChangePassword from './pages/ChangePassword';
import Layout from './Components/Layout';
import Allotment from './pages/Allotment';
import Venue from './pages/Venue';
import Report from './pages/Report';
import Hall from './pages/StudentArrangement';
import StudentImport from './pages/Student';
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
        const fallback = user.role === 'faculty' ? '/faculty/dashboard' : '/allotment';
        navigate(fallback, { replace: true });
        return;
      }

      setIsChecking(false);
    };

    checkAuth();
  }, [navigate, location.pathname, allowedRoles]);

  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 font-semibold">Loading...</p>
        </div>
      </div>
    );
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
        path="/admin/attendance"
        element={
          <AuthGuard allowedRoles={['admin', 'faculty_incharge']}>
            <Layout><AttendanceReports /></Layout>
          </AuthGuard>
        }
      />

      {/* PROTECTED ROUTES - ACCESSIBLE BY Admin, Faculty Incharge, HoD */}
      <Route
        path="/attendance"
        element={
          <AuthGuard allowedRoles={['admin', 'faculty_incharge', 'hod']}>
            <Layout><StudentAttendance /></Layout>
          </AuthGuard>
        }
      />

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
            <Layout><StudentImport /></Layout>
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