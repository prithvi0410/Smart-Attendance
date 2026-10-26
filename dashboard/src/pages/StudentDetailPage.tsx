import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getStudent } from '../services/students';
import { getStudentAttendance } from '../services/attendance';
import { getStudentInsights, getStudentSubjectAttendance, triggerAIAnalysis, processAIBatch, getAIJobStatus } from '../services/analytics';
import { supabase } from '../services/supabase';
import type { Student, AttendanceRecord, AIInsight, SubjectAttendance } from '../types/database';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { Badge } from '../components/common/Badge';
import { formatDate, formatTime } from '../utils/formatters';
import { getAttendanceStatus, classesNeededFor75, STATUS_CONFIG, PATTERN_CONFIG } from '../utils/attendancePolicy';
import { ArrowLeft, User, BrainCircuit, Activity, BookOpen, Target, TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export const StudentDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [student, setStudent] = useState<Student | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [insight, setInsight] = useState<AIInsight | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [subjectAttendance, setSubjectAttendance] = useState<SubjectAttendance[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [analyzing, setAnalyzing] = useState(false);
  const [jobStatus, setJobStatus] = useState<any>(null);

  const fetchData = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const [studentData, attendanceData, insightData, summaryDataRes, subjectData] = await Promise.all([
        getStudent(id),
        getStudentAttendance(id),
        getStudentInsights(id),
        supabase.rpc('get_student_attendance_summary', { p_student_id: id }),
        getStudentSubjectAttendance(id)
      ]);
      setStudent(studentData);
      setAttendance(attendanceData);
      setInsight(insightData);
      setSubjectAttendance(subjectData);
      if (summaryDataRes.data && summaryDataRes.data.length > 0) {
        setSummary(summaryDataRes.data[0]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch student details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  const handleRunAnalysis = async () => {
    try {
      setAnalyzing(true);
      const startRes = await triggerAIAnalysis(student?.class_name || undefined, student?.section || undefined);
      if (!startRes.job_id) {
        alert(startRes.message || 'Could not start analysis');
        return;
      }
      const jobId = startRes.job_id;
      
      let isCompleted = false;
      while (!isCompleted) {
         const batchRes = await processAIBatch(jobId);
         if (batchRes.status === 'completed' || batchRes.status === 'completed_with_errors') {
            isCompleted = true;
         }
         const status = await getAIJobStatus(jobId);
         setJobStatus(status);
      }
      
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'Analysis failed.');
    } finally {
      setAnalyzing(false);
      setTimeout(() => setJobStatus(null), 5000);
    }
  };

  if (loading) return <LoadingSpinner size={40} className="mt-20" />;
  if (error) return <ErrorMessage message={error} onRetry={() => window.location.reload()} />;
  if (!student) return <ErrorMessage message="Student not found" />;

  const totalPercentage = summary ? parseFloat(summary.attendance_percentage) : 0;
  const totalEligible = summary ? summary.total_eligible_sessions : 0;
  const presentCount = summary ? summary.present_sessions : 0;
  const overallStatus = getAttendanceStatus(totalPercentage);
  const statusConfig = STATUS_CONFIG[overallStatus];
  const needed = classesNeededFor75(presentCount, totalEligible);

  // Build trend data from last 30 attendance records for the line chart
  const trendChartData = attendance
    .slice(0, 30)
    .reverse()
    .map((r, i) => ({
      idx: i + 1,
      date: formatDate(r.attendance_sessions?.session_date).slice(0, 6),
      value: r.status === 'present' ? 1 : 0,
    }));

  // Running average for trend line
  let runningPresent = 0;
  const trendLine = trendChartData.map((d, i) => {
    runningPresent += d.value;
    return { ...d, avg: Math.round((runningPresent / (i + 1)) * 100) };
  });

  // Parse AI factors safely
  const getFactors = (ins: AIInsight): string[] => {
    try {
      if (!ins.factors) return [];
      return typeof ins.factors === 'string' ? JSON.parse(ins.factors) : ins.factors;
    } catch { return []; }
  };

  // Parse subject patterns safely
  const getSubjectPatterns = (ins: AIInsight) => {
    try {
      if (!ins.subject_patterns) return [];
      return typeof ins.subject_patterns === 'string' ? JSON.parse(ins.subject_patterns) : ins.subject_patterns;
    } catch { return []; }
  };

  return (
    <div className="space-y-6">
      <button 
        onClick={() => navigate('/students')}
        className="flex items-center text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Students
      </button>

      {/* Row 1: Student Info + Overall Attendance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Student Profile Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 lg:col-span-2">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
              <User className="w-8 h-8 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{student.full_name}</h1>
              <p className="text-gray-500">{student.roll_no} • Class {student.class_name} {student.section}</p>
              
              <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 block mb-1">Email</span>
                  <span className="font-medium text-gray-900">{student.email || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-gray-500 block mb-1">RFID UID</span>
                  <span className="font-mono bg-gray-100 px-2 py-1 rounded text-gray-800">
                    {student.rfid_uid || 'Unassigned'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block mb-1">Status</span>
                  <Badge variant={student.is_active ? 'success' : 'danger'}>
                    {student.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Overall Attendance Card */}
        <div className={`bg-white rounded-xl shadow-sm border ${statusConfig.borderColor} p-6 flex flex-col justify-center`}>
          <h3 className="text-sm font-medium text-gray-500 mb-2 uppercase tracking-wide">Overall Attendance</h3>
          <div className="flex items-end gap-3">
            <span className="text-5xl font-bold text-gray-900">{totalPercentage}%</span>
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${statusConfig.bgColor} ${statusConfig.color}`}>
              {statusConfig.label}
            </span>
          </div>
          <p className="text-gray-500 mt-2 text-sm">{presentCount} / {totalEligible} classes attended</p>
          {needed > 0 && (
            <div className="mt-3 flex items-center text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
              <Target className="w-4 h-4 mr-2 flex-shrink-0" />
              Need <span className="font-bold mx-1">{needed}</span> consecutive presents to reach 75%
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Subject-wise Attendance */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-blue-600" />
          Subject-wise Attendance
        </h2>
        {subjectAttendance.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Subject</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Attended</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Attendance</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Need for 75%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {subjectAttendance.map((subj) => {
                  const subjStatus = getAttendanceStatus(parseFloat(String(subj.attendance_percentage)));
                  const subjConfig = STATUS_CONFIG[subjStatus];
                  const subjNeeded = classesNeededFor75(subj.present_sessions, subj.total_eligible_sessions);
                  return (
                    <tr key={subj.subject_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{subj.subject_name}</div>
                        <div className="text-xs text-gray-500">{subj.subject_code}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{subj.present_sessions} / {subj.total_eligible_sessions}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900">{subj.attendance_percentage}%</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${subjConfig.bgColor} ${subjConfig.color}`}>
                          {subjConfig.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {subjNeeded > 0 ? (
                          <span className="text-amber-700 font-medium">{subjNeeded} classes</span>
                        ) : (
                          <span className="text-green-600">✓</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 text-sm text-center py-4">No subject attendance data available.</p>
        )}
      </div>

      {/* Row 3: Attendance Trend + AI Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Attendance Trend Chart */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-purple-600" />
            Attendance Trend
          </h2>
          {trendLine.length > 0 ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendLine} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 11 }} />
                  <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => [`${v}%`, 'Running Avg']} />
                  <Line type="monotone" dataKey="avg" stroke="#8B5CF6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-gray-500 text-sm text-center py-8">Not enough data for trend chart.</p>
          )}
        </div>

        {/* AI Pattern Analysis Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-purple-600" />
              AI Pattern Analysis
            </h2>
            <div className="flex items-center space-x-2">
               {jobStatus && (
                 <span className="text-xs text-gray-500">
                   {jobStatus.status === 'completed' ? 'Done!' : `Analyzing...`}
                 </span>
               )}
               <button 
                 onClick={handleRunAnalysis} 
                 disabled={analyzing}
                 className="text-sm text-purple-600 hover:underline disabled:opacity-50"
               >
                 {analyzing ? 'Running...' : 'Run Analysis'}
               </button>
            </div>
          </div>
          
          {insight ? (
            <div className="space-y-4">
              {/* Pattern */}
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Pattern</span>
                <div className="flex items-center gap-1.5">
                  {insight.trend === 'improving' && <TrendingUp className="w-4 h-4 text-green-500" />}
                  {insight.trend === 'declining' && <TrendingDown className="w-4 h-4 text-red-500" />}
                  {insight.trend === 'stable' && <Minus className="w-4 h-4 text-blue-500" />}
                  {insight.trend === 'irregular' && <AlertTriangle className="w-4 h-4 text-amber-500" />}
                  <span className={`font-semibold uppercase text-sm ${PATTERN_CONFIG[insight.trend || 'stable']?.color || 'text-gray-600'}`}>
                    {insight.trend || 'N/A'}
                  </span>
                </div>
              </div>
              
              {/* Confidence */}
              {insight.pattern_confidence != null && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Confidence</span>
                  <span className="text-sm font-medium text-gray-900">{Math.round(insight.pattern_confidence * 100)}%</span>
                </div>
              )}

              {/* Summary */}
              <div>
                <p className="text-sm font-medium text-gray-900 mb-1">AI Insight</p>
                <p className="text-sm text-gray-600 leading-relaxed">{insight.summary}</p>
              </div>

              {/* Key Factors */}
              {(() => {
                const factors = getFactors(insight);
                if (factors.length === 0) return null;
                return (
                  <div>
                    <p className="text-sm font-medium text-gray-900 mb-1">Key Factors</p>
                    <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                      {factors.map((f, i) => <li key={i}>{f}</li>)}
                    </ul>
                  </div>
                );
              })()}

              {/* Subject Patterns */}
              {(() => {
                const sp = getSubjectPatterns(insight);
                if (sp.length === 0) return null;
                return (
                  <div>
                    <p className="text-sm font-medium text-gray-900 mb-2">Subject Patterns</p>
                    <div className="space-y-2">
                      {sp.map((s: any, i: number) => (
                        <div key={i} className="flex justify-between items-center text-sm bg-gray-50 px-3 py-2 rounded-lg">
                          <span className="text-gray-700">{s.subject}</span>
                          <span className={`font-medium capitalize ${PATTERN_CONFIG[s.pattern]?.color || 'text-gray-600'}`}>
                            {s.pattern}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div className="pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-400">
                  Last analyzed: {formatDate(insight.analysis_date)}
                  {insight.model_name && ` • ${insight.model_name}`}
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <Activity className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No AI analysis available yet.</p>
              <p className="text-xs text-gray-400 mt-1">Click "Run Analysis" to generate insights.</p>
            </div>
          )}
        </div>
      </div>

      {/* Row 4: Recent History */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent History</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-500">
            <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {attendance.slice(0, 15).map((record) => (
                <tr key={record.id}>
                  <td className="px-4 py-3">{formatDate(record.attendance_sessions?.session_date)}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{record.attendance_sessions?.subjects?.name || '-'}</td>
                  <td className="px-4 py-3">{formatTime(record.scanned_at)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={record.status === 'present' ? 'success' : 'danger'}>
                      {record.status}
                    </Badge>
                  </td>
                </tr>
              ))}
              {attendance.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center">No attendance records found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
