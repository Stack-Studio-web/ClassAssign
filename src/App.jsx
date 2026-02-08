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
import UserManagement from './pages/UserManagement'; // ✅ NEW
import { StudentAttendance } from './Components/StudentAttendance';

/* ===============================
    AUTH GUARD COMPONENT
=============================== */
const AuthGuard = ({ children, requireAdmin = false }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkAuth = () => {
      const token = sessionStorage.getItem('authToken');
      const userStr = sessionStorage.getItem('user');

      // Check if token exists
      if (!token) {
        navigate('/login', { replace: true });
        return;
      }

      // Check if admin access is required
      if (requireAdmin) {
        if (!userStr) {
          navigate('/login', { replace: true });
          return;
        }

        try {
          const user = JSON.parse(userStr);
          
          if (user.role !== 'admin') {
            alert('Access denied: Admin privileges required');
            navigate('/allotment', { replace: true });
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
  }, [navigate, location.pathname, requireAdmin]);

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
      {/* ================================
          PUBLIC ROUTES (NO AUTH REQUIRED)
      ================================ */}
      <Route path="/" element={<Landing />} />      
      <Route path="/login" element={<Landing />} />
      <Route path="/api/auth/microsoft/callback" element={<Landing />} />

      {/* ================================
          PROTECTED ROUTES (AUTH REQUIRED)
      ================================ */}
      <Route
        path="/dashboard"
        element={
          <AuthGuard>
            <Layout>
              <DashBoard />
            </Layout>
          </AuthGuard>
        }
      />

      <Route
        path="/allotment"
        element={
          <AuthGuard>
            <Layout>
              <Allotment />
            </Layout>
          </AuthGuard>
        }
      />

      <Route
        path="/attendance"
        element={
          <AuthGuard>
            <Layout>
              <StudentAttendance />
            </Layout>
          </AuthGuard>
        }
      />

      <Route
        path="/venue"
        element={
          <AuthGuard>
            <Layout>
              <Venue />
            </Layout>
          </AuthGuard>
        }
      />

      <Route
        path="/faculty"
        element={
          <AuthGuard>
            <Layout>
              <Faculty />
            </Layout>
          </AuthGuard>
        }
      />

      <Route
        path="/report"
        element={
          <AuthGuard>
            <Layout>
              <Report />
            </Layout>
          </AuthGuard>
        }
      />

      <Route
        path="/Hall"
        element={
          <AuthGuard>
            <Layout>
              <Hall />
            </Layout>
          </AuthGuard>
        }
      />

      <Route
        path="/Student"
        element={
          <AuthGuard>
            <Layout>
              <StudentImport />
            </Layout>
          </AuthGuard>
        }
      />

      {/* ================================
          ADMIN-ONLY ROUTES
      ================================ */}
      <Route
        path="/users"
        element={
          <AuthGuard requireAdmin={true}>
            <Layout>
              <UserManagement />
            </Layout>
          </AuthGuard>
        }
      />

      {/* ================================
          404 FALLBACK
      ================================ */}
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