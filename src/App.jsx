// src/App.jsx
import React, { useEffect, useState } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import DashBoard from './pages/DashBoard';
import Landing from './pages/Landing';
import Layout from './Components/Layout';
import Allotment from './pages/Allotment';
import Venue from './pages/Venue';
import Report from './pages/Report';
import Hall from './pages/StudentArrangement';
import StudentImport from './pages/Student';
import Faculty from './pages/Faculty'; 
import UserManagement from './pages/UserManagement';
import Logs from './pages/Logs'; 
import { StudentAttendance } from './Components/StudentAttendance';
import IneligibleStudentsView from './pages/IneligibleStudentsView';

/* ===============================
    AUTH GUARD COMPONENT
    Updated to handle specific allowed roles
=============================== */
const AuthGuard = ({ children, allowedRoles = [] }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkAuth = () => {
      const token = sessionStorage.getItem('authToken');
      const userStr = sessionStorage.getItem('user');

      // 1. Check if token exists
      if (!token) {
        navigate('/login', { replace: true });
        return;
      }

      // 2. Check Role permissions if allowedRoles are specified
      if (allowedRoles.length > 0) {
        if (!userStr) {
          navigate('/login', { replace: true });
          return;
        }

        try {
          const user = JSON.parse(userStr);
          
          // Check if current user's role is in the allowed list
          if (!allowedRoles.includes(user.role)) {
            alert(`Access denied: ${user.role} role does not have permission to view this page.`);
            
            // Redirect based on role if they hit a restricted page
            if (user.role === 'coe') {
              navigate('/dashboard', { replace: true });
            } else {
              navigate('/allotment', { replace: true });
            }
            return;
          }
        } catch (err) {
          console.error('Failed to parse user data:', err);
          navigate('/login', { replace: true });
          return;
        }
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
      <Route path="/api/auth/microsoft/callback" element={<Landing />} />

      {/* PROTECTED ROUTES - ACCESSIBLE BY ALL ROLES (Admin, Faculty, CEO) */}
      <Route
        path="/dashboard"
        element={
          <AuthGuard allowedRoles={['admin', 'faculty_incharge', 'coe']}>
            <Layout><DashBoard /></Layout>
          </AuthGuard>
        }
      />

      <Route
        path="/attendance"
        element={
          <AuthGuard allowedRoles={['admin', 'faculty_incharge', 'coe']}>
            <Layout><StudentAttendance /></Layout>
          </AuthGuard>
        }
      />

      <Route
        path="/venue"
        element={
          <AuthGuard allowedRoles={['admin', 'faculty_incharge', 'coe']}>
            <Layout><Venue /></Layout>
          </AuthGuard>
        }
      />

      <Route
        path="/faculty"
        element={
          <AuthGuard allowedRoles={['admin', 'faculty_incharge', 'coe']}>
            <Layout><Faculty /></Layout>
          </AuthGuard>
        }
      />

      <Route
        path="/report"
        element={
          <AuthGuard allowedRoles={['admin', 'faculty_incharge', 'coe']}>
            <Layout><Report /></Layout>
          </AuthGuard>
        }
      />

      <Route
        path="/Hall"
        element={
          <AuthGuard allowedRoles={['admin', 'faculty_incharge', 'coe']}>
            <Layout><Hall /></Layout>
          </AuthGuard>
        }
      />

      <Route
        path="/Student"
        element={
          <AuthGuard allowedRoles={['admin', 'faculty_incharge','coe']}>
            <Layout><StudentImport /></Layout>
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
          CEO is NOT allowed here
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
          ADMIN-ONLY ROUTES (User Management & Audit Logs)
      ====================================================== */}
      <Route
        path="/users"
        element={
          <AuthGuard allowedRoles={['admin']}>
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