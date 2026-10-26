import { useState, useEffect } from 'react';
import { Plus, Search, Edit, Wifi, Trash2 } from 'lucide-react';
import { DataTable } from '../components/common/DataTable';
import type { Column } from '../components/common/DataTable';
import { Badge } from '../components/common/Badge';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { Modal } from '../components/common/Modal';
import { getStudents, createStudent, updateStudent, deleteStudent, getUniqueClasses } from '../services/students';
import { getDevices, setDeviceMode } from '../services/devices';
import type { Student, Device } from '../types/database';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';

export const StudentsPage = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  
  // Faculty users must select a class (no 'All'). Admin can select 'All'.
  const isFaculty = profile?.role !== 'admin';
  const [selectedClass, setSelectedClass] = useState(isFaculty ? '' : 'All');
  const [availableClasses, setAvailableClasses] = useState<string[]>([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  const [activeDevice, setActiveDevice] = useState<Device | null>(null);

  const [formData, setFormData] = useState({
    roll_no: '',
    full_name: '',
    rfid_uid: '',
    class_name: '',
    section: '',
    email: ''
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 50;

  const loadClasses = async () => {
    try {
      let classes = await getUniqueClasses(isFaculty);
      if (isFaculty) {
        classes = classes.filter(c => c !== 'DEMO_CLASS');
        // If they haven't selected a class yet and there are classes, pick the first one
        if (!selectedClass && classes.length > 0) {
          setSelectedClass(classes[0]);
        }
      }
      setAvailableClasses(classes);
    } catch (e) {
      console.error("Failed to load classes", e);
    }
  };

  const fetchStudents = async (pageToFetch = currentPage, search = searchQuery, cls = selectedClass) => {
    // If faculty and no class is selected yet, don't fetch (wait for class load)
    if (isFaculty && !cls) {
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      const res = await getStudents({ 
        page: pageToFetch, 
        limit: pageSize,
        search: search || undefined,
        className: cls,
        excludeDemo: isFaculty
      });
      
      setStudents(res.data);
      setTotalCount(res.count);
      
      const devs = await getDevices();
      if (devs.length > 0) setActiveDevice(devs[0]);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch students');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClasses();
  }, [isFaculty]);

  useEffect(() => {
    fetchStudents(currentPage, searchQuery, selectedClass);
  }, [currentPage, selectedClass]);

  useEffect(() => {
    if (!activeDevice || !isModalOpen) return;

    const channel = supabase.channel(`devices_register_${activeDevice.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'devices', filter: `id=eq.${activeDevice.id}` }, (payload) => {
        const dev = payload.new as Device;
        if (dev.last_register_uid) {
          setFormData(prev => ({ ...prev, rfid_uid: dev.last_register_uid || '' }));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeDevice, isModalOpen]);

  const handleOpenModal = async (student?: Student) => {
    if (student) {
      setEditingStudent(student);
      setFormData({
        roll_no: student.roll_no,
        full_name: student.full_name,
        rfid_uid: student.rfid_uid,
        class_name: student.class_name || '',
        section: student.section || '',
        email: student.email || ''
      });
    } else {
      setEditingStudent(null);
      setFormData({ roll_no: '', full_name: '', rfid_uid: '', class_name: isFaculty ? selectedClass : '', section: '', email: '' });
    }
    
    if (activeDevice) {
      try {
        await setDeviceMode(activeDevice.id, 'registration');
      } catch (e) {
        console.error("Failed to set device mode to registration", e);
      }
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = async () => {
    if (isSaving) return;
    setIsModalOpen(false);
    
    if (activeDevice) {
      try {
        await setDeviceMode(activeDevice.id, 'attendance');
      } catch (e) {
        console.error("Failed to reset device mode to attendance", e);
      }
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload = {
        ...formData,
        rfid_uid: formData.rfid_uid.toUpperCase().replace(/\s/g, ''),
        is_active: true
      };
      
      if (editingStudent) {
        await updateStudent(editingStudent.id, payload);
      } else {
        await createStudent(payload);
      }
      await handleCloseModal();
      fetchStudents();
      loadClasses(); // Reload classes just in case they added a new one
    } catch (err: any) {
      alert(err.message || 'Failed to save student');
    } finally {
      setIsSaving(false);
    }
  };

  const columns: Column<Student>[] = [
    { header: 'Roll No', render: (s) => <span className="font-medium text-gray-900">{s.roll_no}</span> },
    { header: 'Name', render: (s) => (
        <button onClick={() => navigate(`/students/${s.id}`)} className="text-blue-600 hover:text-blue-800 font-medium hover:underline text-left">
          {s.full_name}
        </button>
      )
    },
    { header: 'RFID UID', render: (s) => <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">{s.rfid_uid}</span> },
    { header: 'Class', render: (s) => <span>{s.class_name} {s.section && `- ${s.section}`}</span> },
    { header: 'Status', render: (s) => (
        <Badge variant={s.is_active ? 'success' : 'danger'}>
          {s.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ) 
    },
    { header: 'Actions', render: (s) => {
        const canEdit = !isFaculty || s.created_by === profile?.id;
        return (
          <div className="flex items-center space-x-3">
            {canEdit ? (
              <>
                <button onClick={() => handleOpenModal(s)} className="text-gray-400 hover:text-blue-600 transition-colors" title="Edit">
                  <Edit className="w-4 h-4" />
                </button>
                <button 
                  onClick={async () => {
                    if (window.confirm(`Are you sure you want to delete ${s.full_name}? This will also delete their attendance records.`)) {
                      try {
                        await deleteStudent(s.id);
                        fetchStudents();
                      } catch (e: any) {
                        alert(e.message || 'Failed to delete student');
                      }
                    }
                  }} 
                  className="text-gray-400 hover:text-red-600 transition-colors" 
                  title="Delete"
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

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
    fetchStudents(1, e.target.value, selectedClass);
  };

  const handleClassChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedClass(e.target.value);
    setCurrentPage(1);
    // useEffect will trigger fetchStudents automatically
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Students</h1>
        <button 
          onClick={() => handleOpenModal()}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Student
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input type="text" placeholder="Search by name, roll no, or RFID..." value={searchQuery} onChange={handleSearchChange} className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
        </div>
        <select value={selectedClass} onChange={handleClassChange} className="border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none min-w-[150px]">
          {!isFaculty && <option value="All">All Classes</option>}
          {isFaculty && !selectedClass && <option value="" disabled>Select Class...</option>}
          {availableClasses.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {loading ? (
        <LoadingSpinner size={40} className="mt-12" />
      ) : error ? (
        <ErrorMessage message={error} onRetry={() => fetchStudents()} />
      ) : students.length === 0 && isFaculty && !selectedClass ? (
        <div className="text-center py-12 bg-white rounded-xl shadow-sm border border-gray-100">
          <p className="text-gray-500">Please select a class from the dropdown to view students.</p>
        </div>
      ) : (
        <>
          <DataTable columns={columns} data={students} keyExtractor={(s) => s.id} />
          
          <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6 rounded-lg shadow-sm mt-4">
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

      <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={editingStudent ? "Edit Student" : "Add Student"}>
        <form onSubmit={handleSave} className="space-y-4">
          
          {activeDevice && (
            <div className="bg-blue-50 border border-blue-200 text-blue-800 p-3 rounded-lg flex items-center justify-between text-sm">
              <div className="flex items-center">
                <Wifi className="w-4 h-4 mr-2 animate-pulse" />
                <span>ESP32 is ready. Scan a card to auto-fill the UID!</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <input type="text" required value={formData.full_name} onChange={e => setFormData({...formData, full_name: e.target.value})} className="w-full border border-gray-300 rounded-lg px-4 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Roll No</label>
              <input type="text" required value={formData.roll_no} onChange={e => setFormData({...formData, roll_no: e.target.value})} className="w-full border border-gray-300 rounded-lg px-4 py-2" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">RFID UID</label>
              <input type="text" required value={formData.rfid_uid} onChange={e => setFormData({...formData, rfid_uid: e.target.value})} className="w-full border border-gray-300 rounded-lg px-4 py-2 uppercase font-mono" placeholder="e.g. 62FC765C" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
              <input type="text" required value={formData.class_name} onChange={e => setFormData({...formData, class_name: e.target.value})} className="w-full border border-gray-300 rounded-lg px-4 py-2" placeholder="e.g. CS" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
              <input type="text" required value={formData.section} onChange={e => setFormData({...formData, section: e.target.value})} className="w-full border border-gray-300 rounded-lg px-4 py-2" placeholder="e.g. A" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full border border-gray-300 rounded-lg px-4 py-2" />
            </div>
          </div>
          <div className="flex justify-end pt-4">
            <button type="button" onClick={handleCloseModal} disabled={isSaving} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg mr-2">Cancel</button>
            <button type="submit" disabled={isSaving} className="px-4 py-2 bg-blue-600 text-white rounded-lg">{isSaving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
