import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllInsights, triggerAIAnalysis, processAIBatch, getAIJobStatus, getClassAttendanceSummary } from '../services/analytics';
import { getMonthlyTrend } from '../services/attendance';
import { getUniqueClasses } from '../services/students';
import type { AIInsight, ClassAttendanceSummary } from '../types/database';
import { DataTable } from '../components/common/DataTable';
import type { Column } from '../components/common/DataTable';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { formatDate } from '../utils/formatters';
import { getAttendanceStatus, STATUS_CONFIG, PATTERN_CONFIG } from '../utils/attendancePolicy';
import { BrainCircuit, TrendingUp, TrendingDown, Minus, AlertTriangle, Users, ShieldCheck, ShieldAlert, ShieldX, BookOpen } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, LineChart, Line, XAxis, YAxis, CartesianGrid, BarChart, Bar } from 'recharts';
import { useAuth } from '../context/AuthContext';

type InsightWithStudent = AIInsight & { students: { full_name: string; roll_no: string; class_name?: string | null } };

export const AnalyticsPage = () => {
  const { profile } = useAuth();
  const isFaculty = profile?.role !== 'admin';
  
  const [insights, setInsights] = useState<InsightWithStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [classSummary, setClassSummary] = useState<ClassAttendanceSummary | null>(null);

  const [selectedClass, setSelectedClass] = useState(isFaculty ? '' : 'All');
  const [availableClasses, setAvailableClasses] = useState<string[]>([]);
  const [trendData, setTrendData] = useState<any[]>([]);

  const navigate = useNavigate();
  const [jobStatus, setJobStatus] = useState<any>(null);

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

  const fetchInsights = async (cls = selectedClass) => {
    if (isFaculty && !cls) {
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      const [data, trend, summary] = await Promise.all([
        getAllInsights(isFaculty),
        getMonthlyTrend(cls !== 'All' ? cls : undefined, undefined, isFaculty),
        getClassAttendanceSummary(cls !== 'All' ? cls : undefined, undefined, isFaculty)
      ]);
      
      let filteredData = data;
      if (cls !== 'All') {
        filteredData = data.filter((d: any) => d.students?.class_name === cls);
      }
      
      setInsights(filteredData);
      setTrendData(trend.filter((t: any) => t.percentage > 0));
      setClassSummary(summary);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch insights');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClasses();
  }, [isFaculty]);

  useEffect(() => {
    fetchInsights(selectedClass);
  }, [selectedClass]);

  const handleRunAnalysis = async () => {
    try {
      setAnalyzing(true);
      
      const startRes = await triggerAIAnalysis(selectedClass !== 'All' ? selectedClass : undefined);
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
      
      await fetchInsights();
    } catch (err: any) {
      alert(err.message || 'Analysis failed. Check your supabase edge function setup.');
    } finally {
      setAnalyzing(false);
      setTimeout(() => setJobStatus(null), 5000);
    }
  };

  const uniqueInsights = insights.reduce<InsightWithStudent[]>((acc, curr) => {
    if (!acc.find(i => i.student_id === curr.student_id)) {
      acc.push(curr);
    }
    return acc;
  }, []);

  const columns: Column<InsightWithStudent>[] = [
    { 
      header: 'Student', 
      render: (i) => (
        <div>
          <div className="font-medium text-blue-600">{i.students?.full_name}</div>
          <div className="text-xs text-gray-500">{i.students?.roll_no}</div>
        </div>
      )
    },
    {
      header: 'Attendance',
      render: (i) => {
        const pct = i.attendance_percentage ?? 0;
        const status = getAttendanceStatus(pct);
        const config = STATUS_CONFIG[status];
        return (
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900">{pct}%</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${config.bgColor} ${config.color}`}>
              {config.label}
            </span>
          </div>
        );
      }
    },
    { 
      header: 'Pattern', 
      render: (i) => {
        const p = i.trend || 'stable';
        const config = PATTERN_CONFIG[p] || PATTERN_CONFIG.stable;
        return (
          <div className="flex items-center text-sm gap-1">
            {p === 'improving' && <TrendingUp className="w-4 h-4 text-green-500" />}
            {p === 'declining' && <TrendingDown className="w-4 h-4 text-red-500" />}
            {p === 'stable' && <Minus className="w-4 h-4 text-blue-400" />}
            {p === 'irregular' && <AlertTriangle className="w-4 h-4 text-amber-500" />}
            <span className={`capitalize font-medium ${config.color}`}>{p}</span>
          </div>
        );
      }
    },
    { 
      header: 'Summary', 
      render: (i) => <span className="text-gray-600 max-w-xs truncate block text-sm">{i.summary}</span> 
    },
    { 
      header: 'Analyzed', 
      render: (i) => <span className="text-xs text-gray-500">{formatDate(i.analysis_date)}</span>
    }
  ];

  const policyDistribution = [
    { name: 'Safe (≥75%)', value: uniqueInsights.filter(i => getAttendanceStatus(i.attendance_percentage ?? 0) === 'safe').length, color: '#10B981' },
    { name: 'At Risk (60-74%)', value: uniqueInsights.filter(i => getAttendanceStatus(i.attendance_percentage ?? 0) === 'at_risk').length, color: '#F59E0B' },
    { name: 'High Risk (<60%)', value: uniqueInsights.filter(i => getAttendanceStatus(i.attendance_percentage ?? 0) === 'high_risk').length, color: '#EF4444' }
  ].filter(item => item.value > 0);

  const patternDistribution = [
    { name: 'Stable', value: uniqueInsights.filter(i => i.trend === 'stable').length, color: '#3B82F6' },
    { name: 'Improving', value: uniqueInsights.filter(i => i.trend === 'improving').length, color: '#10B981' },
    { name: 'Declining', value: uniqueInsights.filter(i => i.trend === 'declining').length, color: '#EF4444' },
    { name: 'Irregular', value: uniqueInsights.filter(i => i.trend === 'irregular').length, color: '#F59E0B' }
  ].filter(item => item.value > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Attendance Analytics</h1>
        
        <div className="flex items-center space-x-4">
          <select 
            value={selectedClass} 
            onChange={(e) => setSelectedClass(e.target.value)} 
            className="border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 outline-none"
          >
            {!isFaculty && <option value="All">All Classes</option>}
            {isFaculty && !selectedClass && <option value="" disabled>Select Class...</option>}
            {availableClasses.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          
          {jobStatus && (
             <div className="text-sm font-medium text-gray-600">
               {jobStatus.status === 'completed' ? (
                 <span className="text-green-600">Analysis completed!</span>
               ) : (
                 <span>
                   Analyzing: {jobStatus.processed_students || 0} / {jobStatus.total_students}
                 </span>
               )}
             </div>
          )}
          
          <button 
            onClick={handleRunAnalysis}
            disabled={analyzing || (isFaculty && !selectedClass)}
            className="flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {analyzing ? (
              <LoadingSpinner size={20} className="p-0 mr-2 text-white" />
            ) : (
              <BrainCircuit className="w-5 h-5 mr-2" />
            )}
            Run AI Analysis
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner size={40} className="mt-12" />
      ) : error ? (
        <ErrorMessage message={error} onRetry={() => fetchInsights()} />
      ) : isFaculty && !selectedClass ? (
        <div className="text-center py-12 bg-white rounded-xl shadow-sm border border-gray-100">
          <p className="text-gray-500">Please select a class from the dropdown to view analytics.</p>
        </div>
      ) : (
        <>
          {classSummary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 rounded-lg"><Users className="w-5 h-5 text-blue-600" /></div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Total Students</p>
                    <p className="text-2xl font-bold text-gray-900">{classSummary.total_students}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-green-100 p-5">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-50 rounded-lg"><ShieldCheck className="w-5 h-5 text-green-600" /></div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Safe (≥75%)</p>
                    <p className="text-2xl font-bold text-green-600">{classSummary.safe_count}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-amber-100 p-5">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-50 rounded-lg"><ShieldAlert className="w-5 h-5 text-amber-600" /></div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">At Risk (60-74%)</p>
                    <p className="text-2xl font-bold text-amber-600">{classSummary.at_risk_count}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-red-100 p-5">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-50 rounded-lg"><ShieldX className="w-5 h-5 text-red-600" /></div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">High Risk (&lt;60%)</p>
                    <p className="text-2xl font-bold text-red-600">{classSummary.high_risk_count}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Attendance Status</h2>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={policyDistribution} cx="50%" cy="50%" innerRadius={55} outerRadius={75} paddingAngle={4} dataKey="value">
                      {policyDistribution.map((entry, idx) => <Cell key={idx} fill={entry.color} />)}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">AI Pattern Distribution</h2>
              <div className="h-56">
                {patternDistribution.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={patternDistribution} cx="50%" cy="50%" innerRadius={55} outerRadius={75} paddingAngle={4} dataKey="value">
                        {patternDistribution.map((entry, idx) => <Cell key={idx} fill={entry.color} />)}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-gray-500">
                    Run AI Analysis to see pattern distribution
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
               <h2 className="text-lg font-semibold text-gray-900 mb-4">30-Day Trend</h2>
               <div className="h-56 flex items-center justify-center">
                 {trendData.length > 0 ? (
                   <ResponsiveContainer width="100%" height="100%">
                     <LineChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                       <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                       <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 10 }} />
                       <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 10 }} domain={[0, 100]} />
                       <Tooltip formatter={(v: any) => [`${v}%`, 'Attendance']} />
                       <Line type="monotone" dataKey="percentage" stroke="#8B5CF6" strokeWidth={2} dot={false} />
                     </LineChart>
                   </ResponsiveContainer>
                 ) : (
                   <div className="text-center">
                     <TrendingUp className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                     <p className="text-gray-500 text-sm">Not enough data for trend analysis.</p>
                   </div>
                 )}
               </div>
            </div>
          </div>

          {classSummary && classSummary.subject_averages && classSummary.subject_averages.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-blue-600" />
                Subject Overview
              </h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={classSummary.subject_averages} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                    <XAxis dataKey="subject_name" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 11 }} />
                    <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => [`${v}%`, 'Avg Attendance']} />
                    <Bar dataKey="average_attendance" fill="#8B5CF6" radius={[4, 4, 0, 0]}>
                      {classSummary.subject_averages.map((entry: any, idx: number) => (
                        <Cell key={idx} fill={entry.average_attendance >= 75 ? '#10B981' : entry.average_attendance >= 60 ? '#F59E0B' : '#EF4444'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {classSummary.subject_averages.map((s: any, i: number) => {
                  const status = getAttendanceStatus(s.average_attendance);
                  const config = STATUS_CONFIG[status];
                  return (
                    <div key={i} className="text-center p-3 bg-gray-50 rounded-lg">
                      <p className="text-sm font-medium text-gray-900">{s.subject_name}</p>
                      <p className={`text-lg font-bold ${config.color}`}>{s.average_attendance}%</p>
                      <p className="text-xs text-gray-500">{s.total_sessions} sessions</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Student-wise Analysis</h2>
            <DataTable
              columns={columns}
              data={uniqueInsights}
              keyExtractor={(i) => i.id}
              onRowClick={(i) => navigate(`/students/${i.student_id}`)}
            />
          </div>
        </>
      )}
    </div>
  );
};
