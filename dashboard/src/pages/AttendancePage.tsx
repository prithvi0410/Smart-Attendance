import { useState, useEffect } from 'react';
import { getAttendanceRecords } from '../services/attendance';
import type { AttendanceRecord } from '../types/database';
import { DataTable, type Column } from '../components/common/DataTable';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { Badge } from '../components/common/Badge';
import { formatDate, formatTime } from '../utils/formatters';
import { Filter, Search } from 'lucide-react';

import { useAuth } from '../context/AuthContext';

export const AttendancePage = () => {
  const { profile } = useAuth();
  const isFaculty = profile?.role !== 'admin';

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dateFilter, setDateFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchRecords = async () => {
    try {
      setLoading(true);
      setError(null);
      const filters: any = {};
      if (dateFilter) filters.date = dateFilter;
      if (isFaculty) filters.excludeDemo = true;
      
      const data = await getAttendanceRecords(filters);
      setRecords(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch attendance');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, [dateFilter]);

  const filteredRecords = records.filter(r => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.students?.full_name.toLowerCase().includes(q) ||
      r.students?.roll_no.toLowerCase().includes(q) ||
      r.attendance_sessions?.subjects?.name.toLowerCase().includes(q)
    );
  });

  const columns: Column<AttendanceRecord>[] = [
    { 
      header: 'Date', 
      render: (r) => formatDate(r.attendance_sessions?.session_date) 
    },
    { 
      header: 'Student', 
      render: (r) => (
        <div>
          <div className="font-medium text-gray-900">{r.students?.full_name}</div>
          <div className="text-xs text-gray-500">{r.students?.roll_no}</div>
        </div>
      )
    },
    { 
      header: 'Subject', 
      render: (r) => <span className="text-gray-900">{r.attendance_sessions?.subjects?.code}</span> 
    },
    { 
      header: 'Time', 
      render: (r) => formatTime(r.scanned_at) 
    },
    { 
      header: 'Status', 
      render: (r) => (
        <Badge variant={r.status === 'present' ? 'success' : 'danger'}>
          {r.status}
        </Badge>
      ) 
    }
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Attendance Records</h1>

      <div className="flex flex-col sm:flex-row gap-4 bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search student or subject..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-gray-500" />
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none text-gray-700"
          />
        </div>
      </div>

      {loading ? (
        <LoadingSpinner size={40} className="mt-12" />
      ) : error ? (
        <ErrorMessage message={error} onRetry={fetchRecords} />
      ) : (
        <DataTable
          columns={columns}
          data={filteredRecords}
          keyExtractor={(r) => r.id}
        />
      )}
    </div>
  );
};
