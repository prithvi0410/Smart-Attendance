import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSessions, endSession, cancelSession, startSession, deleteSession } from '../services/sessions';
import { getSubjects } from '../services/subjects';
import { getDevices } from '../services/devices';
import type { AttendanceSession, Subject, Device } from '../types/database';
import { DataTable, type Column } from '../components/common/DataTable';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { formatDate, formatTime } from '../utils/formatters';
import { PlayCircle, Square, XCircle, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const SessionsPage = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isFaculty = profile?.role !== 'admin';

  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedDevice, setSelectedDevice] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [starting, setStarting] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 50;

  const fetchData = async (pageToFetch = currentPage) => {
    try {
      setLoading(true);
      setError(null);
      const [sessionsRes, subjectsData, devicesData] = await Promise.all([
        getSessions({ page: pageToFetch, limit: pageSize, excludeDemo: isFaculty }),
        getSubjects({ excludeDemo: isFaculty }),
        getDevices()
      ]);
      setSessions(sessionsRes.data);
      setTotalCount(sessionsRes.count);
      setSubjects(subjectsData);
      setDevices(devicesData);
      if (subjectsData.length > 0) setSelectedSubject(subjectsData[0].id);
      if (devicesData.length > 0) setSelectedDevice(devicesData[0].id);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(currentPage);
  }, [currentPage]);

  const handleStatusChange = async (id: string, status: 'completed' | 'cancelled') => {
    try {
      if (status === 'completed') {
        await endSession(id);
      } else {
        await cancelSession(id);
      }
      fetchData();
    } catch (err) {
      alert(`Failed to ${status === 'completed' ? 'end' : 'cancel'} session`);
    }
  };

  const handleStartSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubject || !selectedDevice || !selectedClass || !selectedSection) return;
    
    setStarting(true);
    try {
      await startSession(selectedSubject, selectedDevice, selectedClass, selectedSection);
      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to start session');
    } finally {
      setStarting(false);
    }
  };

  const columns: Column<AttendanceSession>[] = [
    { 
      header: 'Date', 
      render: (s) => formatDate(s.session_date) 
    },
    { 
      header: 'Subject', 
      render: (s) => <span className="font-medium text-gray-900">{s.subjects?.code}</span> 
    },
    { 
      header: 'Time', 
      render: (s) => (
        <div className="text-sm">
          <div>{formatTime(s.start_time)}</div>
          {s.end_time && <div className="text-gray-400">to {formatTime(s.end_time)}</div>}
        </div>
      )
    },
    { 
      header: 'Status', 
      render: (s) => {
        let variant: any = 'default';
        if (s.status === 'active') variant = 'success';
        if (s.status === 'completed') variant = 'info';
        if (s.status === 'cancelled') variant = 'danger';
        return <Badge variant={variant}>{s.status}</Badge>;
      } 
    },
    {
      header: 'Actions',
      render: (s) => {
        const canEdit = !isFaculty || s.created_by === profile?.id;
        return (
          <div className="flex items-center space-x-3">
            {canEdit ? (
              <>
                {s.status === 'active' && (
                  <>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleStatusChange(s.id, 'completed'); }}
                      className="text-sm font-medium text-blue-600 hover:text-blue-800 flex items-center"
                    >
                      <Square className="w-4 h-4 mr-1" /> End
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleStatusChange(s.id, 'cancelled'); }}
                      className="text-sm font-medium text-red-600 hover:text-red-800 flex items-center"
                    >
                      <XCircle className="w-4 h-4 mr-1" /> Cancel
                    </button>
                  </>
                )}
                <button 
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (window.confirm('Are you sure you want to delete this session? This will also delete all attendance records for this session.')) {
                      try {
                        await deleteSession(s.id);
                        fetchData();
                      } catch (err: any) {
                        alert(err.message || 'Failed to delete session');
                      }
                    }
                  }}
                  className={`text-gray-400 hover:text-red-600 transition-colors ${s.status === 'active' ? 'ml-2' : ''}`}
                  title="Delete Session"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            ) : (
              <span className="text-xs text-gray-400 italic">Added by other faculty</span>
            )}
          </div>
        );
      }
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Sessions</h1>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          <PlayCircle className="w-5 h-5 mr-2" />
          Start New Session
        </button>
      </div>

      {loading ? (
        <LoadingSpinner size={40} className="mt-12" />
      ) : error ? (
        <ErrorMessage message={error} onRetry={() => fetchData()} />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={sessions}
            keyExtractor={(s) => s.id}
            onRowClick={(s) => navigate(`/sessions/${s.id}`)}
          />
          <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6 rounded-lg shadow-sm">
            <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Showing <span className="font-medium">{Math.min(totalCount, (currentPage - 1) * pageSize + 1)}</span> to <span className="font-medium">{Math.min(currentPage * pageSize, totalCount)}</span> of <span className="font-medium">{totalCount}</span> results
                </p>
              </div>
              <div>
                <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-900 ring-1 ring-inset ring-gray-300 focus:z-20 focus:outline-offset-0">
                    Page {currentPage}
                  </span>
                  <button
                    onClick={() => setCurrentPage(p => p + 1)}
                    disabled={currentPage * pageSize >= totalCount}
                    className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                  >
                    Next
                  </button>
                </nav>
              </div>
            </div>
          </div>
        </>
      )}

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => !starting && setIsModalOpen(false)} 
        title="Start New Session"
      >
        <form onSubmit={handleStartSession} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
            >
              {subjects.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Device</label>
            <select
              value={selectedDevice}
              onChange={(e) => setSelectedDevice(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
            >
              {devices.map(d => (
                <option key={d.id} value={d.id}>{d.device_name} {d.location ? `(${d.location})` : ''}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
              <input
                type="text"
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                required
                placeholder="e.g. CSE"
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
              <input
                type="text"
                value={selectedSection}
                onChange={(e) => setSelectedSection(e.target.value)}
                required
                placeholder="e.g. A"
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
          <div className="flex justify-end pt-4">
            <button 
              type="button"
              onClick={() => setIsModalOpen(false)} 
              disabled={starting}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg mr-2"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={starting}
              className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-70"
            >
              {starting ? 'Starting...' : 'Start Session'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
