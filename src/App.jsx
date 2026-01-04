import React, { useEffect, useState } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import DashBoard from './pages/DashBoard';
import Landing from './pages/Landing'; // Login Page
import Layout from './Components/Layout'; // Contains Sidebar
import Allotment from './pages/Allotment';
import Venue from './pages/Venue';
import Report from './pages/Report';
import Hall from './pages/StudentArrangement';
import StudentImport from './pages/Student';
import Faculty  from './pages/Faculty'; 

// --- NEW AuthGuard Component ---
// Enforces that a valid token exists in sessionStorage before rendering the route.
const AuthGuard = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
   
    const token = sessionStorage.getItem('authToken');

    if (!token) {
      
      navigate('/login', { replace: true });
    }
    setIsChecking(false);
  }, [navigate, location.pathname]);

  if (isChecking) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }
  
 
  return children;
};
function App() {
  return (
    <Routes>
      
      {/* 1. AUTH ROUTES (NO GUARD REQUIRED) */}
      <Route path="/" element={<Landing />} />      
      <Route path="/login" element={<Landing />} />
      <Route path="/api/auth/microsoft/callback" element={<Landing />} /> {/* For handling the redirect */}

      {/* 2. PROTECTED ROUTES (WRAPPED BY AuthGuard) */}
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

    </Routes>
  );
}

export default App;