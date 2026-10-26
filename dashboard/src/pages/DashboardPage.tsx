import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAttendanceStats, getAttendanceRecords, getAttendanceTrend } from '../services/attendance';
import type { DashboardStats, AttendanceRecord } from '../types/database';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { Users, UserCheck, UserX, Activity, Clock } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { formatTime } from '../utils/formatters';
import { Badge } from '../components/common/Badge';
import { useRealtime } from '../hooks/useRealtime';
import { useAuth } from '../context/AuthContext';

export const DashboardPage = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isFaculty = profile?.role !== 'admin';
  
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentRecords, setRecentRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [trendData, setTrendData] = useState<any[]>([]);

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [statsData, recordsData, trend] = await Promise.all([
        getAttendanceStats(isFaculty),
        getAttendanceRecords({ excludeDemo: isFaculty }),
        getAttendanceTrend(undefined, undefined, isFaculty)
      ]);
      setStats(statsData);
      setRecentRecords(recordsData.slice(0, 10)); // Just keep last 10
      setTrendData(trend);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, [isFaculty]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Listen for realtime attendance records
  useRealtime(useCallback(() => {
    fetchDashboardData();
  }, [fetchDashboardData]));

  if (loading) return <LoadingSpinner size={40} className="mt-20" />;
  if (error) return <ErrorMessage message={error} onRetry={fetchDashboardData} className="mt-6" />;
  if (!stats) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard Overview</h1>
        {stats.activeSession && (
          <button 
            onClick={() => navigate(`/sessions/${stats.activeSession!.id}`)}
            className="mt-4 sm:mt-0 flex items-center text-sm font-medium text-green-700 bg-green-50 px-3 py-1 rounded-full border border-green-200 hover:bg-green-100 transition-colors"
          >
            <span className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse" />
            Active Session: {stats.activeSession.subjects?.code}
          </button>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-lg bg-blue-50">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Total Students</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.totalStudents}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-lg bg-green-50">
              <UserCheck className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Present Today</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.presentToday}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-lg bg-red-50">
              <UserX className="h-6 w-6 text-red-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Absent Today</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.absentToday}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-lg bg-purple-50">
              <Activity className="h-6 w-6 text-purple-600" />
            </div>
            <div className="ml-4 flex-1">
              <p className="text-sm font-medium text-gray-500">Avg Attendance</p>
              <div className="flex items-baseline mt-1">
                <p className="text-2xl font-semibold text-gray-900">{stats.averageAttendance.toFixed(1)}%</p>
                <span className="text-xs font-medium text-gray-500 ml-3 bg-gray-50 px-2 py-1 rounded border border-gray-100">
                  7-day avg: {stats.sevenDayAverage.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend Chart */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">7-Day Trend</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7280' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280' }} />
                <Tooltip 
                  cursor={{ fill: '#F3F4F6' }}
                  contentStyle={{ borderRadius: '0.5rem', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="present" name="Present" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="absent" name="Absent" fill="#EF4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Scans */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Recent Scans</h2>
            <Clock className="w-5 h-5 text-gray-400" />
          </div>
          
          <div className="flex-1 overflow-y-auto pr-2">
            {recentRecords.length > 0 ? (
              <div className="space-y-4">
                {recentRecords.map((record) => (
                  <div key={record.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{record.students?.full_name}</p>
                      <p className="text-xs text-gray-500">{record.students?.roll_no}</p>
                    </div>
                    <div className="text-right">
                      <Badge variant={record.status === 'present' ? 'success' : 'danger'}>
                        {record.status}
                      </Badge>
                      <p className="text-xs text-gray-500 mt-1">{formatTime(record.scanned_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-gray-500">
                No recent scans available
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
