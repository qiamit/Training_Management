import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type QuestionIn = {
  id: string;
  text: string;
  marks: number;
  type: "mcq" | "text";
  options?: string[];
  correctOptionIndex?: number;
};

type AnswerIn = {
  questionId: string;
  selectedOption?: number;
  textAnswer?: string;
};

type Body = {
  programmeTitle?: string;
  questions?: QuestionIn[];
  answers?: AnswerIn[];
  passPercent?: number;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: "Server misconfigured" }, 500);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: profile } = await admin
      .from("profiles")
      .select("role, approval_status, is_active")
      .eq("id", user.id)
      .maybeSingle();

    const allowedRoles = ["super_admin", "trainer", "employee"];
    if (
      !profile ||
      profile.approval_status !== "approved" ||
      profile.is_active !== true ||
      !allowedRoles.includes(profile.role)
    ) {
      return json(
        { error: "Only Quality International staff can run AI evaluation." },
        403,
      );
    }

    const body = (await req.json()) as Body;
    const questions = Array.isArray(body.questions) ? body.questions : [];
    const answers = Array.isArray(body.answers) ? body.answers : [];
    const programmeTitle = String(body.programmeTitle ?? "Training").trim();
    const passPercent = Number(body.passPercent ?? 60);

    if (questions.length === 0) {
      return json({ error: "questions are required" }, 400);
    }

    const { data: platformOrg } = await admin
      .from("organizations")
      .select("id")
      .eq("type", "platform")
      .limit(1)
      .maybeSingle();
    if (!platformOrg?.id) {
      return json({ error: "Platform organization not found" }, 500);
    }

    const { data: settings } = await admin
      .from("company_settings")
      .select(
        "ai_enabled, ai_provider, ai_model, ai_api_key, ai_system_prompt",
      )
      .eq("org_id", platformOrg.id)
      .maybeSingle();

    const { data: activeProvider } = await admin
      .from("company_ai_providers")
      .select("provider, model_name, api_key")
      .eq("org_id", platformOrg.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!settings?.ai_enabled) {
      return json(
        {
          error:
            "AI is disabled. Enable it in Company Setting → AI Setting.",
        },
        400,
      );
    }

    const provider = String(
      activeProvider?.provider || settings.ai_provider || "openai",
    )
      .toLowerCase()
      .trim();
    const model = String(
      activeProvider?.model_name || settings.ai_model || "gpt-4o-mini",
    ).trim();
    const apiKey = String(
      activeProvider?.api_key || settings.ai_api_key || "",
    ).trim();
    if (!apiKey) {
      return json(
        {
          error:
            "AI API key is missing. Set an active provider in Company Setting → AI Setting.",
        },
        400,
      );
    }

    const answerById = new Map(answers.map((a) => [a.questionId, a]));
    const packed = questions.map((q, idx) => {
      const a = answerById.get(q.id);
      const traineeAnswer =
        q.type === "mcq" && a?.selectedOption != null && q.options
          ? `Option ${a.selectedOption + 1}: ${q.options[a.selectedOption] ?? ""}`
          : a?.textAnswer?.trim() || "(no answer)";
      const correct =
        q.type === "mcq" &&
        q.correctOptionIndex != null &&
        q.options?.[q.correctOptionIndex] != null
          ? `Correct option ${q.correctOptionIndex + 1}: ${q.options[q.correctOptionIndex]}`
          : "No fixed correct answer provided — mark fairly on accuracy & completeness.";
      return {
        index: idx + 1,
        questionId: q.id,
        marks: q.marks,
        type: q.type,
        question: q.text,
        traineeAnswer,
        markingGuide: correct,
      };
    });

    const systemPrompt = [
      settings.ai_system_prompt?.trim() ||
        "You are an expert training assessor for Quality International.",
      "Evaluate each trainee answer fairly and consistently.",
      "Return ONLY valid JSON with this shape:",
      JSON.stringify({
        questionEvaluations: [
          {
            questionId: "string",
            awardedMarks: 0,
            feedback: "short feedback",
            isCorrect: true,
          },
        ],
        totalScore: 0,
        passed: true,
        summaryNotes: "overall notes",
      }),
      "Rules:",
      "- awardedMarks must be between 0 and the question max marks (inclusive).",
      "- For MCQ with a known correct option, award full marks if correct else 0 (unless partial credit is clearly justified).",
      "- For text answers, award proportional marks for accuracy, completeness, and clarity.",
      "- totalScore must equal the sum of awardedMarks.",
      `- passed should be true when totalScore >= ${passPercent}% of total max marks.`,
      "- Keep feedback concise (1-2 sentences per question).",
    ].join("\n");

    const userPrompt = [
      `Programme: ${programmeTitle}`,
      `Pass threshold: ${passPercent}%`,
      `Questions & answers JSON:`,
      JSON.stringify(packed),
    ].join("\n");

    const raw = await generateJson({
      provider,
      model,
      apiKey,
      systemPrompt,
      userPrompt,
    });

    let parsed: {
      questionEvaluations?: Array<{
        questionId?: string;
        awardedMarks?: number;
        feedback?: string;
        isCorrect?: boolean;
      }>;
      totalScore?: number;
      passed?: boolean;
      summaryNotes?: string;
    } = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("AI returned invalid JSON");
      parsed = JSON.parse(match[0]);
    }

    const qById = new Map(questions.map((q) => [q.id, q]));
    const questionEvaluations = (parsed.questionEvaluations ?? [])
      .map((item) => {
        const qid = String(item.questionId ?? "");
        const q = qById.get(qid);
        if (!q) return null;
        const max = Number(q.marks) || 0;
        let awarded = Number(item.awardedMarks);
        if (Number.isNaN(awarded)) awarded = 0;
        awarded = Math.max(0, Math.min(max, awarded));
        return {
          questionId: qid,
          awardedMarks: awarded,
          feedback: String(item.feedback ?? "").trim() || undefined,
          isCorrect:
            typeof item.isCorrect === "boolean" ? item.isCorrect : null,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));

    // Ensure every question has an entry
    for (const q of questions) {
      if (!questionEvaluations.some((e) => e.questionId === q.id)) {
        questionEvaluations.push({
          questionId: q.id,
          awardedMarks: 0,
          feedback: "Not scored by AI — please review.",
          isCorrect: null,
        });
      }
    }

    const totalScore = questionEvaluations.reduce(
      (sum, e) => sum + e.awardedMarks,
      0,
    );
    const maxScore = questions.reduce((sum, q) => sum + (Number(q.marks) || 0), 0);
    const passed =
      typeof parsed.passed === "boolean"
        ? parsed.passed
        : maxScore > 0
          ? (totalScore / maxScore) * 100 >= passPercent
          : false;

    return json({
      ok: true,
      questionEvaluations,
      totalScore,
      maxScore,
      passed,
      summaryNotes: String(parsed.summaryNotes ?? "").trim(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return json({ error: message }, 500);
  }
});

async function generateJson(args: {
  provider: string;
  model: string;
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
}): Promise<string> {
  if (args.provider === "anthropic" || args.provider === "cohere") {
    throw new Error(
      `${args.provider} is not supported for AI evaluation yet. Use OpenAI, Gemini, DeepSeek, Groq, or Mistral.`,
    );
  }
  if (args.provider === "gemini" || args.provider === "google") {
    return callGemini(args);
  }
  return callOpenAICompatible(args);
}

function chatCompletionsEndpoint(provider: string): string {
  switch (provider) {
    case "deepseek":
      return "https://api.deepseek.com/chat/completions";
    case "groq":
      return "https://api.groq.com/openai/v1/chat/completions";
    case "mistral":
      return "https://api.mistral.ai/v1/chat/completions";
    case "perplexity":
      return "https://api.perplexity.ai/chat/completions";
    case "openrouter":
      return "https://openrouter.ai/api/v1/chat/completions";
    case "together":
    case "together_ai":
      return "https://api.together.xyz/v1/chat/completions";
    default:
      return "https://api.openai.com/v1/chat/completions";
  }
}

function normalizeChatModel(provider: string, model: string): string {
  const trimmed = model.trim();
  if (provider === "deepseek") {
    const lower = trimmed.toLowerCase();
    if (lower.includes("reasoner") || lower.includes("r1")) {
      return "deepseek-reasoner";
    }
    return "deepseek-chat";
  }
  return trimmed || "gpt-4o-mini";
}

async function callOpenAICompatible(args: {
  provider: string;
  model: string;
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
}): Promise<string> {
  const endpoint = chatCompletionsEndpoint(args.provider);
  const model = normalizeChatModel(args.provider, args.model);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: args.systemPrompt },
        { role: "user", content: args.userPrompt },
      ],
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    const raw =
      data?.error?.message ||
      `${args.provider} request failed (${res.status})`;
    throw new Error(
      `${raw} (provider: ${args.provider}, model: ${model}, endpoint: ${endpoint})`,
    );
  }
  return String(data?.choices?.[0]?.message?.content || "");
}

async function callGemini(args: {
  model: string;
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
}): Promise<string> {
  const model = args.model || "gemini-2.0-flash";
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${args.apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: args.systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: args.userPrompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    const raw =
      data?.error?.message || `Gemini request failed (${res.status})`;
    throw new Error(raw);
  }
  return (
    data?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text || "")
      .join("") ?? ""
  );
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
