// src/pages/Logs.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  ClockIcon, 
  UserIcon, 
  DocumentTextIcon,
  FunnelIcon,
  ArrowPathIcon,
  MagnifyingGlassIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline';

const Logs = () => {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [uniqueActions, setUniqueActions] = useState([]);

  // Pagination
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const logsPerPage = 50;

  // Filters
  const [filters, setFilters] = useState({
    action: '',
    entityType: '',
    userId: '',
    startDate: '',
    endDate: ''
  });

  // Expanded log details
  const [expandedLog, setExpandedLog] = useState(null);

  const API_BASE = 'http://localhost:5000/api';

  const getAuthHeaders = () => {
    const token = sessionStorage.getItem('authToken');
    return { Authorization: `Bearer ${token}` };
  };

  // Fetch logs
  const fetchLogs = async (page = 0) => {
    try {
      setLoading(true);
      const offset = page * logsPerPage;
      
      const response = await axios.get(
        `${API_BASE}/audit-logs?limit=${logsPerPage}&offset=${offset}`,
        { headers: getAuthHeaders() }
      );

      setLogs(response.data.logs);
      setHasMore(response.data.pagination.hasMore);
      setCurrentPage(page);
      
      // Extract unique actions from the logs
      const actions = [...new Set(response.data.logs.map(log => log.action))].sort();
      setUniqueActions(actions);
    } catch (err) {
      console.error('Error fetching logs:', err);
      setError('Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  // Fetch statistics
  const fetchStats = async () => {
    try {
      const response = await axios.get(
        `${API_BASE}/audit-logs/stats`,
        { headers: getAuthHeaders() }
      );
      setStats(response.data);
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  // Search with filters
  const handleSearch = async () => {
    try {
      setLoading(true);
      
      // Format dates to YYYY-MM-DD format for the API
      const formattedFilters = {
        ...filters,
        limit: logsPerPage
      };
      
      // Only include date filters if they are set
      if (filters.startDate) {
        formattedFilters.startDate = filters.startDate;
      }
      if (filters.endDate) {
        formattedFilters.endDate = filters.endDate;
      }

      const response = await axios.post(
        `${API_BASE}/audit-logs/search`,
        formattedFilters,
        { headers: getAuthHeaders() }
      );

      setLogs(response.data);
      setHasMore(false); // Search results don't support pagination
      setCurrentPage(0);
      
      // Update unique actions from search results
      const actions = [...new Set(response.data.map(log => log.action))].sort();
      setUniqueActions(actions);
    } catch (err) {
      console.error('Error searching logs:', err);
      setError('Failed to search logs');
    } finally {
      setLoading(false);
    }
  };

  // Reset filters
  const handleResetFilters = () => {
    setFilters({
      action: '',
      entityType: '',
      userId: '',
      startDate: '',
      endDate: ''
    });
    fetchLogs(0);
  };

  // Format date
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // Get action badge color
  const getActionColor = (action) => {
    const colorMap = {
      'CREATE': 'bg-green-100 text-green-800',
      'UPDATE': 'bg-blue-100 text-blue-800',
      'DELETE': 'bg-red-100 text-red-800',
      'LOGIN': 'bg-purple-100 text-purple-800',
      'LOGOUT': 'bg-gray-100 text-gray-800',
      'IMPORT': 'bg-yellow-100 text-yellow-800',
      'EXPORT': 'bg-indigo-100 text-indigo-800',
      'CREATE_FACULTY': 'bg-teal-100 text-teal-800',
      'DELETE_SEATING_PLAN': 'bg-orange-100 text-orange-800',
      'CREATE_SEATING_PLAN': 'bg-cyan-100 text-cyan-800',
      'DELETE_VENUE': 'bg-pink-100 text-pink-800'
    };
    return colorMap[action] || 'bg-gray-100 text-gray-800';
  };

  // Get entity type badge color
  const getEntityColor = (entityType) => {
    const colorMap = {
      'USER': 'bg-purple-100 text-purple-800',
      'SEATING_PLAN': 'bg-blue-100 text-blue-800',
      'SeatingPlan': 'bg-blue-100 text-blue-800',
      'VENUE': 'bg-green-100 text-green-800',
      'Venue': 'bg-green-100 text-green-800',
      'STUDENT': 'bg-yellow-100 text-yellow-800',
      'FACULTY': 'bg-indigo-100 text-indigo-800',
      'Faculty': 'bg-indigo-100 text-indigo-800',
      'EXAM': 'bg-red-100 text-red-800'
    };
    return colorMap[entityType] || 'bg-gray-100 text-gray-800';
  };

  useEffect(() => {
    fetchLogs(0);
    fetchStats();
  }, []);

  if (loading && logs.length === 0) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading audit logs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Audit Logs</h1>
          <p className="text-gray-600 mt-1">System activity and change tracking</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowStats(!showStats)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 font-semibold shadow-md transition flex items-center gap-2"
          >
            <ChartBarIcon className="h-5 w-5" />
            {showStats ? 'Hide' : 'Show'} Statistics
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-semibold shadow-md transition flex items-center gap-2"
          >
            <FunnelIcon className="h-5 w-5" />
            Filters
          </button>
          <button
            onClick={() => fetchLogs(currentPage)}
            className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 font-semibold shadow-md transition flex items-center gap-2"
          >
            <ArrowPathIcon className="h-5 w-5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Statistics Panel */}
      {showStats && stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow">
            <p className="text-gray-600 text-sm">Total Logs</p>
            <p className="text-3xl font-bold text-gray-800">{stats.totalLogs}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <p className="text-gray-600 text-sm">Most Common Action</p>
            <p className="text-lg font-bold text-blue-600">
              {stats.actionStats[0]?.action || 'N/A'}
            </p>
            <p className="text-sm text-gray-500">{stats.actionStats[0]?.count || 0} times</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <p className="text-gray-600 text-sm">Most Active Entity</p>
            <p className="text-lg font-bold text-green-600">
              {stats.entityStats[0]?.entity_type || 'N/A'}
            </p>
            <p className="text-sm text-gray-500">{stats.entityStats[0]?.count || 0} changes</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <p className="text-gray-600 text-sm">Most Active User</p>
            <p className="text-lg font-bold text-purple-600">
              {stats.topUsers[0]?.username || 'N/A'}
            </p>
            <p className="text-sm text-gray-500">{stats.topUsers[0]?.action_count || 0} actions</p>
          </div>
        </div>
      )}

      {/* Filter Panel */}
      {showFilters && (
        <div className="bg-white p-6 rounded-lg shadow-md mb-6">
          <h3 className="text-lg font-semibold mb-4">Filter Logs</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Action Type</label>
              <select
                value={filters.action}
                onChange={(e) => setFilters({...filters, action: e.target.value})}
                className="w-full p-2 border rounded-lg"
              >
                <option value="">All Actions</option>
                {uniqueActions.map((action) => (
                  <option key={action} value={action}>
                    {action.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Entity Type</label>
              <select
                value={filters.entityType}
                onChange={(e) => setFilters({...filters, entityType: e.target.value})}
                className="w-full p-2 border rounded-lg"
              >
                <option value="">All Entities</option>
                <option value="USER">User</option>
                <option value="SEATING_PLAN">Seating Plan</option>
                <option value="SeatingPlan">Seating Plan</option>
                <option value="VENUE">Venue</option>
                <option value="Venue">Venue</option>
                <option value="STUDENT">Student</option>
                <option value="FACULTY">Faculty</option>
                <option value="Faculty">Faculty</option>
                <option value="EXAM">Exam</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Start Date</label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({...filters, startDate: e.target.value})}
                className="w-full p-2 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">End Date</label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({...filters, endDate: e.target.value})}
                className="w-full p-2 border rounded-lg"
              />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleSearch}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-semibold flex items-center gap-2"
            >
              <MagnifyingGlassIcon className="h-5 w-5" />
              Search
            </button>
            <button
              onClick={handleResetFilters}
              className="bg-gray-200 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-300 font-semibold"
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-100 text-red-700 p-4 rounded-lg mb-4">
          {error}
        </div>
      )}

      {/* Logs Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-100 border-b-2 border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Time</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">User</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Action</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Entity</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">View</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {logs.length > 0 ? (
                logs.map((log) => (
                  <React.Fragment key={log.id}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          <ClockIcon className="h-4 w-4 text-gray-400" />
                          {formatDate(log.created_at)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <UserIcon className="h-4 w-4 text-gray-400" />
                          <div>
                            <p className="text-sm font-semibold">{log.username || 'Unknown'}</p>
                            <p className="text-xs text-gray-500">{log.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getActionColor(log.action)}`}>
                          {log.action.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getEntityColor(log.entity_type)}`}>
                            {log.entity_type}
                          </span>
                          {log.entity_id && (
                            <p className="text-xs text-gray-500 mt-1">ID: {log.entity_id}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                          className="text-blue-600 hover:text-blue-800 font-semibold"
                        >
                          <DocumentTextIcon className="h-5 w-5 mx-auto" />
                        </button>
                      </td>
                    </tr>
                    {expandedLog === log.id && (
                      <tr>
                        <td colSpan="5" className="px-4 py-4 bg-gray-50">
                          <div className="space-y-3">
                            <div>
                              <p className="text-sm font-semibold text-gray-700">Request Details:</p>
                              <pre className="mt-2 p-3 bg-white rounded border text-xs overflow-x-auto">
                                {JSON.stringify(log.changes.body, null, 2)}
                              </pre>
                            </div>
                            {log.changes.response && (
                              <div>
                                <p className="text-sm font-semibold text-gray-700">Response:</p>
                                <pre className="mt-2 p-3 bg-white rounded border text-xs overflow-x-auto">
                                  {JSON.stringify(log.changes.response, null, 2)}
                                </pre>
                              </div>
                            )}
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <p className="font-semibold text-gray-700">IP Address:</p>
                                <p className="text-gray-600">{log.ip_address || 'N/A'}</p>
                              </div>
                              <div>
                                <p className="font-semibold text-gray-700">User Agent:</p>
                                <p className="text-gray-600 truncate">{log.user_agent || 'N/A'}</p>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="px-4 py-8 text-center text-gray-500">
                    No audit logs found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center mt-6">
        <button
          onClick={() => fetchLogs(currentPage - 1)}
          disabled={currentPage === 0}
          className="bg-white border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
        >
          Previous
        </button>
        <span className="text-gray-600">
          Page {currentPage + 1}
        </span>
        <button
          onClick={() => fetchLogs(currentPage + 1)}
          disabled={!hasMore}
          className="bg-white border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
        >
          Next
        </button>
      </div>
    </div>
  );
};

export default Logs;