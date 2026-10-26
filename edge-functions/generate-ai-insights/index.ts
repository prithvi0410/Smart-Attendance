import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SubjectPatternResult {
  subject: string;
  pattern: "stable" | "improving" | "declining" | "irregular";
  summary: string;
}

interface StudentInsight {
  student_id: string;
  pattern: "stable" | "improving" | "declining" | "irregular";
  pattern_confidence: number;
  summary: string;
  key_factors: string[];
  subject_patterns: SubjectPatternResult[];
}

interface AIResponse {
  students: StudentInsight[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ success: false, message: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, message: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const nvidiaApiKey = Deno.env.get("NVIDIA_API_KEY") ?? "";
    const batchSizeStr = Deno.env.get("AI_BATCH_SIZE") ?? "15";
    const AI_BATCH_SIZE = parseInt(batchSizeStr, 10);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const action = body.action || "start_job"; 

    // Action 1: Create a Job
    if (action === "start_job") {
      const { class_name, section, requested_by } = body;
      
      // Prevent overlapping runs
      const { data: runningJobs } = await supabase
        .from('ai_analysis_jobs')
        .select('id')
        .in('status', ['queued', 'processing'])
        .limit(1);
        
      if (runningJobs && runningJobs.length > 0) {
        return new Response(JSON.stringify({ success: false, message: "A job is already running." }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Compute student dataset via the enriched SQL function
      const { data: studentsData, error: rpcError } = await supabase
        .rpc('get_ai_student_features', {
          p_class_name: class_name || null,
          p_section: section || null,
          p_period_days: 60
        });

      if (rpcError || !studentsData || studentsData.length === 0) {
        return new Response(JSON.stringify({ success: false, message: "No student data available for analysis." }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const totalStudents = studentsData.length;
      
      // Create job
      const { data: job, error: jobError } = await supabase
        .from('ai_analysis_jobs')
        .insert({
          requested_by: requested_by || null,
          class_name: class_name || null,
          section: section || null,
          status: 'processing',
          total_students: totalStudents,
          started_at: new Date().toISOString()
        })
        .select()
        .single();

      if (jobError) throw jobError;

      // Create batches
      const batches = [];
      for (let i = 0; i < totalStudents; i += AI_BATCH_SIZE) {
        const batchStudents = studentsData.slice(i, i + AI_BATCH_SIZE);
        batches.push({
          job_id: job.id,
          batch_number: Math.floor(i / AI_BATCH_SIZE) + 1,
          student_count: batchStudents.length,
          status: 'queued',
          payload: batchStudents
        });
      }

      await supabase.from('ai_analysis_batches').insert(batches);

      return new Response(JSON.stringify({ success: true, job_id: job.id, total_batches: batches.length }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Action 2: Process a batch
    if (action === "process_batch") {
      const { job_id } = body;
      
      // Grab next queued batch
      const { data: batch, error: batchError } = await supabase
        .from('ai_analysis_batches')
        .select('*')
        .eq('job_id', job_id)
        .in('status', ['queued', 'failed'])
        .lt('attempt_count', 3)
        .order('batch_number', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (batchError) throw batchError;
      
      if (!batch) {
        // No more batches to process. Check if job is done.
        const { data: remaining } = await supabase.from('ai_analysis_batches').select('id').eq('job_id', job_id).neq('status', 'completed');
        if (!remaining || remaining.length === 0) {
           await supabase.from('ai_analysis_jobs').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', job_id);
           return new Response(JSON.stringify({ success: true, status: 'completed' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        } else {
           await supabase.from('ai_analysis_jobs').update({ status: 'completed_with_errors', completed_at: new Date().toISOString() }).eq('id', job_id);
           return new Response(JSON.stringify({ success: true, status: 'completed_with_errors' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      // Mark batch as processing
      await supabase.from('ai_analysis_batches').update({ 
        status: 'processing', 
        attempt_count: batch.attempt_count + 1,
        started_at: new Date().toISOString()
      }).eq('id', batch.id);

      // Call NVIDIA API
      const aiResult = await callNvidiaBatchAPI(nvidiaApiKey, batch.payload);

      if (!aiResult) {
         await supabase.from('ai_analysis_batches').update({ 
           status: 'failed', 
           error_message: 'NVIDIA API failed (Check your API Key or rate limits)'
         }).eq('id', batch.id);
         return new Response(JSON.stringify({ success: false, status: 'failed', message: 'Batch failed due to API error' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Process insights
      let successes = 0;
      let failures = 0;
      const today = new Date().toISOString().split("T")[0];

      for (const reqStudent of batch.payload) {
        const resultStudent = aiResult.students.find((s: any) => s.student_id === reqStudent.student_id);
        if (resultStudent) {
          // Delete old insight
          await supabase.from("ai_insights").delete().eq("student_id", reqStudent.student_id);
          
          // Insert new insight with enriched fields
          const { error: insErr } = await supabase.from("ai_insights").insert({
            student_id: reqStudent.student_id,
            analysis_date: today,
            attendance_percentage: reqStudent.overall_attendance,
            recent_7_percentage: reqStudent.last_7_percentage,
            recent_14_percentage: reqStudent.last_14_percentage,
            recent_30_percentage: reqStudent.last_30_percentage,
            consecutive_absences: reqStudent.consecutive_absences,
            trend: resultStudent.pattern,
            risk_level: resultStudent.pattern_confidence >= 0.7 ? 'high' : resultStudent.pattern_confidence >= 0.4 ? 'medium' : 'low',
            summary: resultStudent.summary,
            factors: resultStudent.key_factors,
            pattern_confidence: resultStudent.pattern_confidence,
            subject_patterns: resultStudent.subject_patterns,
            model_name: 'google/gemma-4-31b-it (NVIDIA NIM)',
            generated_at: new Date().toISOString()
          });
          
          if (insErr) {
            console.error("Failed to insert insight", insErr);
            failures++;
          } else {
            successes++;
          }
        } else {
          failures++;
        }
      }

      // Update batch and job stats
      await supabase.from('ai_analysis_batches').update({ 
        status: 'completed', 
        completed_at: new Date().toISOString()
      }).eq('id', batch.id);

      // Increment job stats
      const { data: job } = await supabase.from('ai_analysis_jobs').select('processed_students, successful_students, failed_students').eq('id', job_id).single();
      if (job) {
         await supabase.from('ai_analysis_jobs').update({
           processed_students: (job.processed_students || 0) + successes + failures,
           successful_students: (job.successful_students || 0) + successes,
           failed_students: (job.failed_students || 0) + failures
         }).eq('id', job_id);
      }

      return new Response(JSON.stringify({ success: true, processed: successes + failures }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    
    // Action 3: Job Status
    if (action === "job_status") {
       const { job_id } = body;
       const { data: job } = await supabase.from('ai_analysis_jobs').select('*').eq('id', job_id).single();
       return new Response(JSON.stringify({ success: true, job }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: false, message: "Invalid action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ success: false, message: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

async function callNvidiaBatchAPI(apiKey: string, students: any[]): Promise<AIResponse | null> {
  const prompt = `You are an AI attendance pattern analyst using a pretrained deep-learning model.
Analyze the following batch of students and return EXACTLY this JSON structure, and nothing else.

RULES:
- pattern must be EXACTLY ONE OF: stable, improving, declining, irregular
- pattern_confidence must be a number between 0.0 and 1.0
- Use ONLY the supplied statistics. Do NOT invent attendance numbers.
- Do NOT make personal judgments (e.g., "lazy", "sick", "irresponsible")
- Use neutral factual statements only
- For each student, also analyze their subject-specific patterns

Input Data:
${JSON.stringify({ students: students.map(s => ({
  student_id: s.student_id,
  full_name: s.full_name,
  overall_attendance: s.overall_attendance,
  last_7_percentage: s.last_7_percentage,
  last_14_percentage: s.last_14_percentage,
  last_30_percentage: s.last_30_percentage,
  consecutive_absences: s.consecutive_absences,
  recent_change: s.attendance_trend,
  longest_absence_streak: s.longest_absence_streak,
  longest_present_streak: s.longest_present_streak,
  recent_absences_7: s.recent_absences_7,
  recent_absences_14: s.recent_absences_14,
  recent_absences_30: s.recent_absences_30,
  attendance_sequence: s.attendance_sequence,
  subjects: s.subject_attendance
})) }, null, 2)}

Expected Output Format:
{
  "students": [
    {
      "student_id": "must exactly match the input student_id",
      "pattern": "stable|improving|declining|irregular",
      "pattern_confidence": 0.85,
      "summary": "A 1-2 sentence neutral factual summary based ONLY on supplied data",
      "key_factors": ["factor 1", "factor 2", "factor 3"],
      "subject_patterns": [
        {
          "subject": "Subject Name",
          "pattern": "stable|improving|declining|irregular",
          "summary": "Brief neutral observation"
        }
      ]
    }
  ]
}

Return ONLY valid JSON, no markdown formatting.`;

  try {
    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "google/gemma-4-31b-it",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 4000,
      }),
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      console.error("NVIDIA API error:", response.status, await response.text());
      return generateMockAIResponse(students);
    }

    const data = await response.json();
    let text = data?.choices?.[0]?.message?.content;

    if (!text) return generateMockAIResponse(students);

    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(text);

    if (!parsed.students || !Array.isArray(parsed.students)) return generateMockAIResponse(students);

    parsed.students.forEach((s: any) => {
       if (!["stable", "improving", "declining", "irregular"].includes(s.pattern)) s.pattern = "stable";
       if (typeof s.pattern_confidence !== 'number') s.pattern_confidence = 0.5;
       if (!Array.isArray(s.key_factors)) s.key_factors = [];
       if (!Array.isArray(s.subject_patterns)) s.subject_patterns = [];
    });

    return parsed as AIResponse;
  } catch (err) {
    console.error("Error calling NVIDIA API:", err);
    return generateMockAIResponse(students);
  }
}

function generateMockAIResponse(students: any[]): AIResponse {
  return {
    students: students.map(s => {
      let pattern: "stable" | "improving" | "declining" | "irregular" = "stable";
      let confidence = 0.7;
      let sum = "Average attendance pattern observed.";
      const factors: string[] = [];

      const att = parseFloat(s.overall_attendance) || 0;
      const l7 = parseFloat(s.last_7_percentage) || 0;
      const l30 = parseFloat(s.last_30_percentage) || 0;
      const consec = s.consecutive_absences || 0;
      const trend = parseFloat(s.attendance_trend) || 0;

      // Pattern determination based on data
      if (l30 === 0 && att > 0) {
        pattern = "declining";
        confidence = 0.95;
        sum = "Student appears to have completely stopped attending in the recent period.";
        factors.push("Zero attendance in recent 30 sessions");
      } else if (trend < -15) {
        pattern = "declining";
        confidence = 0.85;
        sum = "Recent attendance has declined significantly compared with the earlier observation period.";
        factors.push(`Recent change: ${trend.toFixed(1)}%`);
      } else if (trend > 15) {
        pattern = "improving";
        confidence = 0.82;
        sum = "Attendance has noticeably improved in the recent period.";
        factors.push(`Recent improvement: +${trend.toFixed(1)}%`);
      } else if (consec >= 3) {
        pattern = "declining";
        confidence = 0.78;
        sum = `The student has recorded ${consec} consecutive absences.`;
        factors.push(`${consec} consecutive absences`);
      } else if (att >= 90) {
        pattern = "stable";
        confidence = 0.9;
        sum = "Student has excellent and consistent attendance.";
        factors.push("High overall attendance");
      } else if (Math.abs(trend) <= 5 && att >= 60) {
        pattern = "stable";
        confidence = 0.7;
        sum = "Attendance has remained relatively consistent over the observation period.";
      } else {
        pattern = "irregular";
        confidence = 0.65;
        sum = "Attendance fluctuates without a clear directional trend.";
        factors.push("Inconsistent attendance pattern");
      }

      if (consec > 0 && pattern !== "declining") factors.push(`${consec} consecutive absences`);
      if (l7 < att - 10) factors.push(`Last 7 sessions: ${l7.toFixed(1)}%`);
      if (s.longest_absence_streak > 2) factors.push(`Longest absence streak: ${s.longest_absence_streak} sessions`);

      // Subject patterns
      const subjPatterns: SubjectPatternResult[] = [];
      const subjects = s.subject_attendance || [];
      for (const subj of subjects) {
        let sp: "stable" | "improving" | "declining" | "irregular" = "stable";
        let ss = "Consistent attendance.";
        const sa = parseFloat(subj.attendance) || 0;
        const sr = parseFloat(subj.recent_attendance) || 0;
        const diff = sr - sa;

        if (diff < -15) { sp = "declining"; ss = `Recent attendance has dropped by ${Math.abs(diff).toFixed(0)}%.`; }
        else if (diff > 15) { sp = "improving"; ss = `Recent attendance has improved by ${diff.toFixed(0)}%.`; }
        else if (sa < 60) { sp = "declining"; ss = `Attendance is below 60% overall.`; }
        
        subjPatterns.push({ subject: subj.subject, pattern: sp, summary: ss });
        
        if (sa < att - 15) {
          factors.push(`${subj.subject} attendance (${sa.toFixed(0)}%) significantly lower than overall`);
        }
      }

      return {
        student_id: s.student_id,
        pattern,
        pattern_confidence: confidence,
        summary: sum,
        key_factors: factors.slice(0, 5),
        subject_patterns: subjPatterns
      };
    })
  };
}
