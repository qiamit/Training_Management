import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Body = {
  traineeName?: string;
  programmeTitle?: string;
  whenLabel?: string;
  platformLabel?: string;
  trainerName?: string;
  meetingLink?: string;
  meetingPassword?: string;
  tone?: string;
  messageType?: string;
  language?: string;
  length?: string;
  extraInstructions?: string;
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
        { error: "Only Quality International staff can draft invitation emails." },
        403,
      );
    }

    const body = (await req.json()) as Body;
    const programmeTitle = body.programmeTitle?.trim() || "Training Programme";
    const traineeName = body.traineeName?.trim() || "Trainee";
    const whenLabel = body.whenLabel?.trim() || "TBD";
    const platformLabel = body.platformLabel?.trim() || "Online Meeting";
    const trainerName = body.trainerName?.trim() || "Trainer";
    const meetingLink = body.meetingLink?.trim() || "";
    const meetingPassword = body.meetingPassword?.trim() || "";
    const tone = body.tone?.trim() || "professional";
    const messageType = body.messageType?.trim() || "invitation";
    const language = body.language?.trim() || "english";
    const length = body.length?.trim() || "medium";
    const extraInstructions = body.extraInstructions?.trim() || "";

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

    const systemPrompt = [
      settings.ai_system_prompt?.trim() ||
        "You are an expert corporate training communication writer.",
      "Write a training invitation email for Quality International.",
      "Return ONLY valid JSON with this shape:",
      '{"subject":"...","htmlBody":"<p>...</p>"}',
      "htmlBody must be clean HTML fragments only (p, ul, li, strong, a, br). No markdown. No full HTML document.",
      "Include a clear Join Meeting CTA when a meeting link is provided.",
      "Use {{name}} exactly once as the trainee greeting placeholder (e.g. Hello {{name}},).",
      "Do not invent fake dates, links, or trainer names — use the provided facts.",
    ].join("\n");

    const userPrompt = [
      `Tone: ${tone}`,
      `Message type: ${messageType}`,
      `Language: ${language}`,
      `Length: ${length}`,
      `Sample trainee name (for preview context): ${traineeName}`,
      `Programme: ${programmeTitle}`,
      `Date & time: ${whenLabel}`,
      `Platform: ${platformLabel}`,
      `Trainer: ${trainerName}`,
      meetingLink
        ? `Meeting link: ${meetingLink}`
        : "Meeting link: not provided yet",
      meetingPassword
        ? `Meeting password/passcode: ${meetingPassword}`
        : "Meeting password: not required / not provided",
      "Mention that the training is also available in the learner portal under Assigned Trainings.",
      extraInstructions ? `Extra instructions:\n${extraInstructions}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const raw = await generateJson({
      provider,
      model,
      apiKey,
      systemPrompt,
      userPrompt,
    });

    let parsed: { subject?: string; htmlBody?: string } = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("AI returned invalid JSON");
      parsed = JSON.parse(match[0]);
    }

    let subject = String(parsed.subject ?? "").trim();
    let htmlBody = String(parsed.htmlBody ?? "").trim();
    if (!subject) subject = `Training Invitation: ${programmeTitle}`;
    if (!htmlBody) throw new Error("AI returned empty email body");
    if (!htmlBody.includes("{{name}}")) {
      htmlBody = `<p>Hello {{name}},</p>${htmlBody}`;
    }

    const previewHtml = htmlBody.replaceAll("{{name}}", traineeName);

    return json({
      ok: true,
      subject,
      htmlBody,
      previewHtml,
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
      `${args.provider} is not supported for invitation drafting yet. Use OpenAI, Gemini, DeepSeek, Groq, or Mistral.`,
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
      temperature: 0.55,
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
        temperature: 0.55,
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
