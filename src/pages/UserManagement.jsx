// src/pages/UserManagement.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  PencilIcon, 
  KeyIcon, 
  CheckCircleIcon, 
  XCircleIcon, 
  TrashIcon 
} from '@heroicons/react/24/outline';

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  
  // Form state
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    role_id: 2, // Default to COE
    department: ''
  });

  const API_BASE = 'http://localhost:5000/api';

  // Fetch data on mount
  useEffect(() => {
    fetchUsers();
    fetchRoles();
    fetchStats();
  }, []);

  const getAuthHeaders = () => {
    const token = sessionStorage.getItem('authToken');
    return { Authorization: `Bearer ${token}` };
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE}/users`, {
        headers: getAuthHeaders()
      });
      setUsers(response.data);
    } catch (err) {
      setError('Failed to fetch users');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      const response = await axios.get(`${API_BASE}/users/roles`);
      setRoles(response.data);
    } catch (err) {
      console.error('Failed to fetch roles:', err);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await axios.get(`${API_BASE}/users/stats`, {
        headers: getAuthHeaders()
      });
      setStats(response.data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    try {
      await axios.post(
        `${API_BASE}/users`,
        formData,
        { headers: getAuthHeaders() }
      );
      
      alert('User created successfully!');
      setShowAddModal(false);
      setFormData({ username: '', email: '', password: '', role_id: 2, department: '' });
      fetchUsers();
      fetchStats();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create user');
    }
  };

  const handleEditUser = async (e) => {
    e.preventDefault();
    try {
      await axios.put(
        `${API_BASE}/users/${editingUser.id}`,
        {
          username: formData.username,
          email: formData.email,
          department: formData.department,
          role_id: formData.role_id
        },
        { headers: getAuthHeaders() }
      );
      
      alert('User updated successfully!');
      setShowEditModal(false);
      setEditingUser(null);
      fetchUsers();
      fetchStats();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update user');
    }
  };

  const openEditModal = (user) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      email: user.email,
      department: user.department || '',
      role_id: user.role_id,
      password: '' // Don't populate password
    });
    setShowEditModal(true);
  };

  const handleResetPassword = async (userId) => {
    const newPassword = prompt('Enter new password (min 6 characters):');
    
    if (!newPassword) return;
    
    if (newPassword.length < 6) {
      alert('Password must be at least 6 characters');
      return;
    }

    try {
      await axios.put(
        `${API_BASE}/users/${userId}/password`,
        { password: newPassword },
        { headers: getAuthHeaders() }
      );
      
      alert('Password reset successfully!');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to reset password');
    }
  };

  const handleToggleActive = async (userId, isActive) => {
    try {
      const endpoint = isActive ? 'deactivate' : 'activate';
      
      await axios.put(
        `${API_BASE}/users/${userId}/${endpoint}`,
        {},
        { headers: getAuthHeaders() }
      );
      
      alert(`User ${isActive ? 'deactivated' : 'activated'} successfully!`);
      fetchUsers();
      fetchStats();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update user status');
    }
  };

  const handleDeleteUser = async (userId, userEmail) => {
    if (!window.confirm(`Are you sure you want to delete user: ${userEmail}?`)) return;

    try {
      await axios.delete(
        `${API_BASE}/users/${userId}`,
        { headers: getAuthHeaders() }
      );
      
      alert('User deleted successfully!');
      fetchUsers();
      fetchStats();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete user');
    }
  };

  const getRoleBadgeColor = (roleName) => {
    switch (roleName) {
      case 'admin':
        return 'bg-purple-100 text-purple-800';
      case 'coe':
        return 'bg-blue-100 text-blue-800';
      case 'faculty_incharge':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatRoleName = (roleName) => {
    if (roleName === 'faculty_incharge') return 'Faculty Incharge';
    return roleName.toUpperCase();
  };

  if (loading) return (
    <div className="p-6 flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading users...</p>
      </div>
    </div>
  );

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">User Management</h1>
          <p className="text-gray-600 mt-1">Manage COE and Faculty Incharge users</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-semibold shadow-md transition"
        >
          + Add New User
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow">
            <p className="text-gray-600 text-sm">Total Users</p>
            <p className="text-3xl font-bold text-gray-800">{stats.total}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <p className="text-gray-600 text-sm">Active</p>
            <p className="text-3xl font-bold text-green-600">{stats.active}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <p className="text-gray-600 text-sm">COE Users</p>
            <p className="text-3xl font-bold text-blue-600">{stats.byRole.coe}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <p className="text-gray-600 text-sm">Faculty Incharge</p>
            <p className="text-3xl font-bold text-green-600">{stats.byRole.faculty_incharge}</p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-100 text-red-700 p-4 rounded-lg mb-4">
          {error}
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-100 border-b-2 border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Username</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Email</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Department</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Role</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Microsoft SSO</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user.id} className={`hover:bg-gray-50 ${!user.is_active ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3 text-sm">{user.id}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-800">{user.username}</div>
                    <div className="text-xs text-gray-500">
                      {user.created_by_username && `Created by: ${user.created_by_username}`}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm">{user.email}</td>
                  <td className="px-4 py-3 text-sm">{user.department || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getRoleBadgeColor(user.role_name)}`}>
                      {formatRoleName(user.role_name)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {user.microsoft_id ? (
                      <span className="text-green-600 font-bold text-lg">✓</span>
                    ) : (
                      <span className="text-gray-300 text-lg">✗</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        user.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-center items-center">
                      {/* Edit Button */}
                      <button
                        onClick={() => openEditModal(user)}
                        className="p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                        title="Edit User"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>

                      {/* Reset Password Button */}
                      <button
                        onClick={() => handleResetPassword(user.id)}
                        className="p-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                        title="Reset Password"
                      >
                        <KeyIcon className="h-4 w-4" />
                      </button>

                      {/* Activate/Deactivate Button */}
                      <button
                        onClick={() => handleToggleActive(user.id, user.is_active)}
                        className={`p-2 rounded-lg transition-colors ${
                          user.is_active
                            ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                            : 'bg-green-500 text-white hover:bg-green-600'
                        }`}
                        title={user.is_active ? 'Deactivate User' : 'Activate User'}
                      >
                        {user.is_active ? (
                          <XCircleIcon className="h-4 w-4" />
                        ) : (
                          <CheckCircleIcon className="h-4 w-4" />
                        )}
                      </button>

                      {/* Delete Button - Only for non-admin users */}
                      {user.role_name !== 'admin' && (
                        <button
                          onClick={() => handleDeleteUser(user.id, user.email)}
                          className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                          title="Delete User"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-4 text-gray-800">Add New User</h2>
            <form onSubmit={handleAddUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">Username *</label>
                <input
                  type="text"
                  required
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="john.doe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">Email (KCT Email) *</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="user@kct.ac.in"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">Password *</label>
                <input
                  type="password"
                  required
                  minLength="6"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Min 6 characters"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">Department</label>
                <input
                  type="text"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., CSE, ECE, MECH"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">Role *</label>
                <select
                  value={formData.role_id}
                  onChange={(e) => setFormData({ ...formData, role_id: parseInt(e.target.value) })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {formatRoleName(role.name)}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">Admin users cannot be created via UI</p>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition"
                >
                  Create User
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-400 transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && editingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-4 text-gray-800">Edit User</h2>
            <form onSubmit={handleEditUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">Username *</label>
                <input
                  type="text"
                  required
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">Email *</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">Department</label>
                <input
                  type="text"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">Role *</label>
                <select
                  value={formData.role_id}
                  onChange={(e) => setFormData({ ...formData, role_id: parseInt(e.target.value) })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {formatRoleName(role.name)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition"
                >
                  Update User
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingUser(null);
                  }}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-400 transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;