import { useState, useEffect } from 'react';
import { getSubjects, createSubject, updateSubject, deleteSubject } from '../services/subjects';
import { getUniqueClasses } from '../services/students';
import type { Subject } from '../types/database';
import { DataTable, type Column } from '../components/common/DataTable';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const SubjectsPage = () => {
  const { profile } = useAuth();
  const isFaculty = profile?.role !== 'admin';

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedClass, setSelectedClass] = useState(isFaculty ? '' : 'All');
  const [availableClasses, setAvailableClasses] = useState<string[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({ name: '', code: '', class_name: '', section: '' });

  const loadClasses = async () => {
    try {
      let classes = await getUniqueClasses(isFaculty);
      if (isFaculty) {
        classes = classes.filter(c => c !== 'DEMO_CLASS');
        if (!selectedClass && classes.length > 0) {
          setSelectedClass(classes[0]);
        }
      }
      setAvailableClasses(classes);
    } catch (e) {
      console.error("Failed to load classes", e);
    }
  };

  const fetchSubjects = async (cls = selectedClass) => {
    if (isFaculty && !cls) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await getSubjects({ className: cls, excludeDemo: isFaculty });
      setSubjects(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch subjects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClasses();
  }, [isFaculty]);

  useEffect(() => {
    fetchSubjects(selectedClass);
  }, [selectedClass]);

  const handleOpenModal = (subject?: Subject) => {
    if (subject) {
      setEditingSubject(subject);
      setFormData({ 
        name: subject.name, 
        code: subject.code || '',
        class_name: subject.class_name || '',
        section: subject.section || ''
      });
    } else {
      setEditingSubject(null);
      setFormData({ name: '', code: '', class_name: isFaculty ? selectedClass : '', section: '' });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (editingSubject) {
        await updateSubject(editingSubject.id, { ...formData, is_active: true });
      } else {
        await createSubject({ ...formData, is_active: true });
      }
      setIsModalOpen(false);
      fetchSubjects();
      loadClasses();
    } catch (err: any) {
      alert(err.message || 'Failed to save subject');
    } finally {
      setIsSaving(false);
    }
  };

  const columns: Column<Subject>[] = [
    { 
      header: 'Code', 
      render: (s) => <span className="font-mono text-sm">{s.code}</span> 
    },
    { 
      header: 'Name', 
      render: (s) => <span className="font-medium text-gray-900">{s.name}</span> 
    },
    { 
      header: 'Class', 
      render: (s) => <span>{s.class_name} {s.section && `- ${s.section}`}</span> 
    },
    { 
      header: 'Status', 
      render: (s) => (
        <Badge variant={s.is_active ? 'success' : 'danger'}>
          {s.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ) 
    },
    {
      header: 'Actions',
      render: (s) => {
        const canEdit = !isFaculty || s.created_by === profile?.id;
        return (
          <div className="flex items-center space-x-3">
            {canEdit ? (
              <>
                <button 
                  onClick={() => handleOpenModal(s)}
                  className="text-gray-400 hover:text-blue-600 transition-colors"
                  title="Edit"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button 
                  onClick={async () => {
                    if (window.confirm(`Are you sure you want to delete ${s.name}? This will also delete all sessions and attendance records for this subject.`)) {
                      try {
                        await deleteSubject(s.id);
                        fetchSubjects();
                      } catch (e: any) {
                        alert(e.message || 'Failed to delete subject');
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Subjects</h1>
        <button 
          onClick={() => handleOpenModal()}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Subject
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <select 
          value={selectedClass} 
          onChange={(e) => setSelectedClass(e.target.value)} 
          className="border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none min-w-[200px]"
        >
          {!isFaculty && <option value="All">All Classes</option>}
          {isFaculty && !selectedClass && <option value="" disabled>Select Class...</option>}
          {availableClasses.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {loading ? (
        <LoadingSpinner size={40} className="mt-12" />
      ) : error ? (
        <ErrorMessage message={error} onRetry={() => fetchSubjects(selectedClass)} />
      ) : subjects.length === 0 && isFaculty && !selectedClass ? (
        <div className="text-center py-12 bg-white rounded-xl shadow-sm border border-gray-100">
          <p className="text-gray-500">Please select a class from the dropdown to view subjects.</p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={subjects}
          keyExtractor={(s) => s.id}
        />
      )}

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => !isSaving && setIsModalOpen(false)} 
        title={editingSubject ? "Edit Subject" : "Add Subject"}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject Name</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="e.g. Computer Networks"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject Code</label>
            <input
              type="text"
              required
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="e.g. CS501"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
              <input 
                type="text" 
                value={formData.class_name} 
                onChange={e => setFormData({...formData, class_name: e.target.value})} 
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none" 
                placeholder="e.g. CS" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
              <input 
                type="text" 
                value={formData.section} 
                onChange={e => setFormData({...formData, section: e.target.value})} 
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none" 
                placeholder="e.g. A" 
              />
            </div>
          </div>
          <div className="flex justify-end pt-4">
            <button 
              type="button"
              onClick={() => setIsModalOpen(false)} 
              disabled={isSaving}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg mr-2"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={isSaving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-70"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
