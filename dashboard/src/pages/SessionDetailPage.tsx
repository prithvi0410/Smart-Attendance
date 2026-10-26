import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSession, endSession } from '../services/sessions';
import { getSessionAttendance } from '../services/attendance';
import { getStudents } from '../services/students';
import type { AttendanceSession, AttendanceRecord, Student } from '../types/database';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { Badge } from '../components/common/Badge';
import { DataTable, type Column } from '../components/common/DataTable';
import { formatDate, formatTime } from '../utils/formatters';
import { useRealtime } from '../hooks/useRealtime';
import { ArrowLeft, Users, CheckCircle, XCircle, Clock } from 'lucide-react';

export const SessionDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<AttendanceSession | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDetails = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const [sessionData, recordsData, studentsRes] = await Promise.all([
        getSession(id),
        getSessionAttendance(id),
        getStudents({ limit: 1000 }) // Load all for this view or filter by class
      ]);
      setSession(sessionData);
      setRecords(recordsData);
      setAllStudents(studentsRes.data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch session details');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  // Realtime subscription for attendance records
  useRealtime(useCallback(() => {
    // Refresh records when a new one comes in
    getSessionAttendance(id!).then(setRecords).catch(console.error);
  }, [id]));

  if (loading) return <LoadingSpinner size={40} className="mt-20" />;
  if (error) return <ErrorMessage message={error} onRetry={fetchDetails} className="mt-6" />;
  if (!session) return <ErrorMessage message="Session not found" className="mt-6" />;

  // Compute Present/Absent lists
  const presentStudentIds = new Set(records.map(r => r.student_id));
  
  // We'll consider a student relevant if they are active, or if they have a record here
  const relevantStudents = allStudents.filter(s => s.is_active || presentStudentIds.has(s.id));
  
  // Build a unified array of attendance for display
  const displayList = relevantStudents.map(student => {
    const record = records.find(r => r.student_id === student.id);
    return {
      student,
      record,
      isPresent: !!record
    };
  }).sort((a, b) => {
    // Sort present students first, then by name
    if (a.isPresent && !b.isPresent) return -1;
    if (!a.isPresent && b.isPresent) return 1;
    return a.student.full_name.localeCompare(b.student.full_name);
  });

  const totalStudents = displayList.length;
  const presentCount = records.length;
  const absentCount = totalStudents - presentCount;

  const handleEndSession = async () => {
    if (confirm("Are you sure you want to end this session?")) {
      try {
        const updated = await endSession(session.id);
        setSession(updated);
      } catch (err) {
        alert("Failed to end session");
      }
    }
  };

  const columns: Column<typeof displayList[0]>[] = [
    { 
      header: 'Roll No', 
      render: (item) => <span className="font-medium text-gray-900">{item.student.roll_no}</span> 
    },
    { 
      header: 'Name', 
      render: (item) => (
        <button 
          onClick={() => navigate(`/students/${item.student.id}`)}
          className="text-blue-600 hover:text-blue-800 font-medium hover:underline text-left"
        >
          {item.student.full_name}
        </button>
      )
    },
    { 
      header: 'Status', 
      render: (item) => (
        <Badge variant={item.isPresent ? 'success' : 'danger'}>
          {item.isPresent ? 'Present' : 'Absent'}
        </Badge>
      ) 
    },
    { 
      header: 'Scan Time', 
      render: (item) => item.record ? <span className="text-gray-500 text-sm">{formatTime(item.record.scanned_at)}</span> : <span className="text-gray-400">-</span>
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center">
        <div className="flex items-center">
          <button 
            onClick={() => navigate('/sessions')}
            className="mr-4 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center">
              {session.subjects?.name} ({session.subjects?.code})
              {session.status === 'active' && (
                <span className="ml-3 flex h-3 w-3 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                </span>
              )}
            </h1>
            <p className="text-gray-500 mt-1 flex items-center text-sm">
              <Clock className="w-4 h-4 mr-1" />
              {formatDate(session.session_date)} • {formatTime(session.start_time)} 
              {session.end_time ? ` to ${formatTime(session.end_time)}` : ' (Ongoing)'}
              <span className="mx-2">•</span>
              Device: {session.devices?.device_name || 'Unknown'}
            </p>
          </div>
        </div>

        <div className="mt-4 sm:mt-0">
          {session.status === 'active' ? (
            <button 
              onClick={handleEndSession}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              End Session
            </button>
          ) : (
            <Badge variant={session.status === 'completed' ? 'info' : 'danger'}>
              {session.status.toUpperCase()}
            </Badge>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex items-center">
          <div className="p-3 rounded-lg bg-blue-50 text-blue-600 mr-4">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Total Class Size</p>
            <p className="text-2xl font-bold text-gray-900">{totalStudents}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex items-center">
          <div className="p-3 rounded-lg bg-green-50 text-green-600 mr-4">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Present</p>
            <p className="text-2xl font-bold text-gray-900">{presentCount}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex items-center">
          <div className="p-3 rounded-lg bg-red-50 text-red-600 mr-4">
            <XCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Absent</p>
            <p className="text-2xl font-bold text-gray-900">{absentCount}</p>
          </div>
        </div>
      </div>

      {/* Attendance List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900">Attendance List</h2>
        </div>
        <DataTable
          columns={columns}
          data={displayList}
          keyExtractor={(item) => item.student.id}
        />
      </div>
    </div>
  );
};
