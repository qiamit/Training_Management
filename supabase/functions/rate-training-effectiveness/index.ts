import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type TraineeIn = {
  evaluationId: string;
  traineeName: string;
  status: string;
  score: number | null;
  maxScore: number | null;
  passed: boolean | null;
  evaluatorNotes: string | null;
  questionFeedback?: string[];
};

type Body = {
  programmeTitle?: string;
  trainees?: TraineeIn[];
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
        {
          error:
            "Only Quality International staff can run AI effectiveness rating.",
        },
        403,
      );
    }

    const body = (await req.json()) as Body;
    const programmeTitle = String(body.programmeTitle ?? "Training").trim();
    const trainees = Array.isArray(body.trainees) ? body.trainees : [];
    if (trainees.length === 0) {
      return json({ error: "trainees are required" }, 400);
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

    const packed = trainees.map((t) => {
      const pct =
        t.score != null && t.maxScore != null && t.maxScore > 0
          ? Math.round((t.score / t.maxScore) * 1000) / 10
          : null;
      return {
        evaluationId: t.evaluationId,
        traineeName: t.traineeName,
        status: t.status,
        score: t.score,
        maxScore: t.maxScore,
        percent: pct,
        passed: t.passed,
        evaluatorNotes: t.evaluatorNotes,
        questionFeedback: t.questionFeedback ?? [],
      };
    });

    const systemPrompt = [
      settings.ai_system_prompt?.trim() ||
        "You are a quality training effectiveness assessor for Quality International.",
      "Rate training effectiveness for each trainee based on their evaluation results.",
      "Return ONLY valid JSON with this shape:",
      JSON.stringify({
        ratings: [
          {
            evaluationId: "uuid",
            rating: "effective",
            notes: "2-3 sentence justification",
          },
        ],
      }),
      "rating MUST be exactly one of: effective | partial | not_effective",
      "Guidance:",
      "- effective: typically passed with strong score (~80%+) or clear competence evidence",
      "- partial: mixed/moderate results (~50-79%) or passed with weak gaps",
      "- not_effective: failed, very low score (<50%), or incomplete/no meaningful evaluation",
      "- If status is not evaluated yet, prefer not_effective or partial and explain missing evaluation",
      "- Notes must be specific to that trainee's score/result and be professional English",
      "- Include one rating object for EVERY trainee evaluationId provided",
    ].join("\n");

    const userPrompt = [
      `Programme: ${programmeTitle}`,
      `Trainees JSON:`,
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
      ratings?: Array<{
        evaluationId?: string;
        rating?: string;
        notes?: string;
      }>;
    } = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("AI returned invalid JSON");
      parsed = JSON.parse(match[0]);
    }

    const allowed = new Set(["effective", "partial", "not_effective"]);
    const byId = new Map(
      (parsed.ratings ?? []).map((r) => [String(r.evaluationId ?? ""), r]),
    );

    const ratings = trainees.map((t) => {
      const item = byId.get(t.evaluationId);
      let rating = String(item?.rating ?? "").toLowerCase().trim();
      if (!allowed.has(rating)) {
        // Heuristic fallback if AI omitted/mislabelled
        if (t.status !== "evaluated") rating = "partial";
        else if (t.passed === false) rating = "not_effective";
        else if (
          t.score != null &&
          t.maxScore != null &&
          t.maxScore > 0 &&
          t.score / t.maxScore >= 0.8
        ) {
          rating = "effective";
        } else if (
          t.score != null &&
          t.maxScore != null &&
          t.maxScore > 0 &&
          t.score / t.maxScore >= 0.5
        ) {
          rating = "partial";
        } else rating = "not_effective";
      }
      const notes =
        String(item?.notes ?? "").trim() ||
        buildFallbackNotes(t, rating as "effective" | "partial" | "not_effective");
      return {
        evaluationId: t.evaluationId,
        rating: rating as "effective" | "partial" | "not_effective",
        notes,
      };
    });

    return json({ ok: true, ratings });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return json({ error: message }, 500);
  }
});

function buildFallbackNotes(
  t: TraineeIn,
  rating: "effective" | "partial" | "not_effective",
): string {
  const scorePart =
    t.score != null && t.maxScore != null
      ? `Score ${t.score}/${t.maxScore}.`
      : "Score not available.";
  const resultPart =
    t.passed == null ? "" : t.passed ? " Result: Passed." : " Result: Failed.";
  if (rating === "effective") {
    return `${scorePart}${resultPart} Evaluation indicates strong training effectiveness.`;
  }
  if (rating === "partial") {
    return `${scorePart}${resultPart} Evaluation indicates partial training effectiveness; further reinforcement recommended.`;
  }
  return `${scorePart}${resultPart} Evaluation indicates limited training effectiveness; re-training or coaching may be needed.`;
}

async function generateJson(args: {
  provider: string;
  model: string;
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
}): Promise<string> {
  if (args.provider === "anthropic" || args.provider === "cohere") {
    throw new Error(
      `${args.provider} is not supported for AI effectiveness yet. Use OpenAI, Gemini, DeepSeek, Groq, or Mistral.`,
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
      temperature: 0.3,
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
        temperature: 0.3,
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
