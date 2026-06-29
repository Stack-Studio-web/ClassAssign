import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Logo from "../assets/logo.png";
import api, { fetchCurrentUser } from '../lib/api';

function Landing() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [flashMessage, setFlashMessage] = useState(''); 
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const ssoSuccess = searchParams.get('sso_success');
        const errorMsg = searchParams.get('error');

        if (errorMsg) {
            setError(decodeURIComponent(errorMsg));
        }

        if (ssoSuccess === 'true') {
            completeSsoLogin();
        }
    }, [searchParams]);

    const completeSsoLogin = async () => {
        try {
            const user = await fetchCurrentUser();
            if (!user) {
                setError('Failed to complete login');
                return;
            }
            setFlashMessage('Successfully logged in! Redirecting...');
            setTimeout(() => {
                if (user.mustChangePassword) {
                    navigate('/change-password', { replace: true });
                } else if (user.role === 'faculty') {
                    navigate('/faculty/dashboard', { replace: true });
                } else if (user.role === 'hod') {
                    navigate('/users', { replace: true });
                } else {
                    navigate('/allotment', { replace: true });
                }
            }, 800);
        } catch {
            setError('Failed to complete login');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setFlashMessage(''); 
        setLoading(true);

        try {
            const { data } = await api.post('/auth/login', { email, password });

            if (data.success) {
                sessionStorage.setItem('user', JSON.stringify(data.user));
                
                if (data.mustChangePassword) {
                    setFlashMessage('Please set a new password to continue...');
                    setTimeout(() => navigate('/change-password', { replace: true }), 800);
                } else {
                    setFlashMessage('Successfully logged in! Redirecting...');
                    setTimeout(() => navigate(data.redirectTo || '/allotment'), 1500);
                }
            } else {
                setError(data.message || 'Login failed. Please check your credentials.');
            }
        } catch (err) {
            console.error('Login error:', err);
            setError(err.response?.data?.message || 'Could not connect to the server. Please try again later.');
        } finally {
            if (!flashMessage) setLoading(false);
        }
    };

    const handleMicrosoftLogin = async () => {
        setError('');
        setFlashMessage('Redirecting to Microsoft...');
        try {
            const { data } = await api.get('/auth/microsoft/login');
            if (data.authUrl) {
                window.location.href = data.authUrl;
            } else {
                setFlashMessage('');
                setError(data.message || 'Could not initiate Microsoft login.');
            }
        } catch (err) {
            setFlashMessage('');
            setError('Error connecting to authentication service.');
        }
    };

    return (
      <div className="min-h-screen bg-gray-100 flex flex-col justify-between">
        <nav className="bg-white shadow-md px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={Logo} alt="KCT Logo" className="h-12 w-auto" />
          </div>
          <div className="flex-1 text-center">
            <p className="text-sm font-poppins font-semibold">
              KUMARAGURU COLLEGE OF TECHNOLOGY (AUTONOMOUS)
            </p>
            <p className="italic text-xs text-slate-700">
              Accredited by NAAC with 'A++' Grade <br />
              Approved by AICTE - New Delhi, Affiliated to Anna University, Chennai - 600 025
            </p>
          </div>
        </nav>

        <div
          className="flex flex-col lg:flex-row flex-grow bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: "url('https://admissions.kct.ac.in/images/dome-new.png')" }}
        >
          <div className="lg:w-1/2"></div>
          
          <div className="lg:w-1/2 p-6 flex items-center justify-center">
            <div className="bg-white/30 backdrop-blur-md p-6 rounded-lg shadow-lg w-full max-w-sm">
              <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">Login</h2>
              
              <form className="space-y-4" onSubmit={handleSubmit}>
                {error && (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative text-sm" role="alert"> 
                      {error} 
                    </div>
                )}
                {flashMessage && (
                    <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative text-sm font-semibold" role="status"> 
                      {flashMessage} 
                    </div>
                )}
                
                <input
                  type="email" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email" 
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/70" 
                  required
                />
                
                <input
                  type="password" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password" 
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/70" 
                  required
                />
                
                <button 
                  type="submit" 
                  disabled={loading || !!flashMessage} 
                  className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition disabled:bg-blue-400 font-semibold"
                >
                  {loading || !!flashMessage ? 'Verifying...' : 'Login'}
                </button>
                
                <div className="flex items-center pt-2">
                  <div className="flex-grow border-t border-gray-300"></div>
                  <span className="flex-shrink mx-4 text-gray-800 text-sm font-medium">OR</span>
                  <div className="flex-grow border-t border-gray-300"></div>
                </div>
                
                <button 
                  type="button" 
                  onClick={handleMicrosoftLogin} 
                  className="w-full flex items-center justify-center gap-3 bg-white text-gray-800 py-2 rounded-lg border border-gray-300 hover:bg-gray-100 transition shadow-sm font-semibold text-sm"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path fill="#F25022" d="M11 2.25H2.25V11H11V2.25Z"/>
                    <path fill="#7FBA00" d="M21.75 2.25H13V11H21.75V2.25Z"/>
                    <path fill="#00A4EF" d="M11 13H2.25V21.75H11V13Z"/>
                    <path fill="#FFB900" d="M21.75 13H13V21.75H21.75V13Z"/>
                  </svg>
                  Login with Microsoft
                </button>
              </form>

              <div className="mt-4 text-center text-xs text-gray-600">
                <p>Only authorized KCT users can login</p>
              </div>
            </div>
          </div>
        </div>

        <footer className="bg-gray-900 text-white text-center py-4 text-sm">
          <p className="max-w-3xl mx-auto px-4">
            Pursues excellence in providing training to develop a sense of professional responsibility,
            social and cultural awareness and set students on the path to leadership.
          </p>
          <p className="mt-2 text-xs">© All Rights Reserved. <a href="https://kct.ac.in" className="underline">KCT</a></p>
        </footer>
      </div>
    );
}

export default Landing;
