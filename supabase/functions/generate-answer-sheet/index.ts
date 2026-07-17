import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Body = {
  programmeId?: string;
  extraInstructions?: string;
  matterAssetIds?: string[];
  questionPaperAssetId?: string;
  documentName?: string;
  documentMode?: string;
  documentType?: string;
};

type AnswerItem = {
  number: number;
  question: string;
  marks: number;
  answer: string;
  markingPoints: string[];
  type?: string;
};

type AnswerSheet = {
  title: string;
  notes: string[];
  totalMarks: number;
  answers: AnswerItem[];
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
            "Only Quality International staff can generate answer sheets.",
        },
        403,
      );
    }

    const body = (await req.json()) as Body;
    const programmeId = body.programmeId?.trim() ?? "";
    if (!programmeId) return json({ error: "programmeId is required" }, 400);

    const { data: programme, error: progError } = await admin
      .from("training_programmes")
      .select("id, title, description, category, duration_hours, delivery_mode")
      .eq("id", programmeId)
      .maybeSingle();
    if (progError || !programme) {
      return json({ error: "Programme not found" }, 404);
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

    let matterQuery = admin
      .from("programme_training_assets")
      .select("*")
      .eq("programme_id", programmeId)
      .eq("category", "matter_files")
      .order("created_at", { ascending: false });

    if (body.matterAssetIds?.length) {
      matterQuery = matterQuery.in("id", body.matterAssetIds);
    }

    const { data: matterAssets } = await matterQuery;
    const assets = matterAssets ?? [];

    const matterSummaries: string[] = [];
    for (const asset of assets.slice(0, 12)) {
      let excerpt = "";
      const name = (asset.file_name || "").toLowerCase();
      const mime = (asset.mime_type || "").toLowerCase();
      const sourceType = asset.source_type || "file";
      if (sourceType === "website" || sourceType === "youtube") {
        matterSummaries.push(
          `Source (${sourceType}): ${asset.file_name}\nURL: ${asset.file_url}`,
        );
        continue;
      }
      const isText =
        sourceType === "text" ||
        mime.startsWith("text/") ||
        name.endsWith(".txt") ||
        name.endsWith(".md") ||
        name.endsWith(".csv");
      if (
        isText &&
        asset.storage_path &&
        !String(asset.storage_path).startsWith("external/")
      ) {
        try {
          const { data: blob, error: dlError } = await admin.storage
            .from("training-assets")
            .download(asset.storage_path);
          if (!dlError && blob) {
            const text = await blob.text();
            excerpt = text.slice(0, 4000);
          }
        } catch {
          // ignore
        }
      }
      matterSummaries.push(
        excerpt
          ? `File: ${asset.file_name}\nContent excerpt:\n${excerpt}`
          : `File: ${asset.file_name} (binary/document — use filename and programme topic as guidance)`,
      );
    }

    // Prefer aligning answers to the selected (or latest) question paper.
    let questionPaperContext = "";
    const selectedPaperId = body.questionPaperAssetId?.trim() || "";
    let papersQuery = admin
      .from("programme_training_assets")
      .select("*")
      .eq("programme_id", programmeId)
      .eq("category", "question_paper")
      .order("created_at", { ascending: false });

    if (selectedPaperId) {
      papersQuery = papersQuery.eq("id", selectedPaperId);
    } else {
      papersQuery = papersQuery.limit(1);
    }

    const { data: papers } = await papersQuery;

    for (const paper of papers ?? []) {
      if (paper.content_json) {
        try {
          const jsonText = JSON.stringify(paper.content_json).slice(0, 12000);
          if (jsonText) {
            questionPaperContext +=
              `Selected question paper (${paper.file_name}) structured JSON:\n${jsonText}\n\n`;
            continue;
          }
        } catch {
          // fall through to HTML extract
        }
      }
      if (
        paper.storage_path &&
        !String(paper.storage_path).startsWith("external/") &&
        String(paper.mime_type || "").includes("html")
      ) {
        try {
          const { data: blob, error: dlError } = await admin.storage
            .from("training-assets")
            .download(paper.storage_path);
          if (!dlError && blob) {
            const html = await blob.text();
            const text = html
              .replace(/<script[\s\S]*?<\/script>/gi, " ")
              .replace(/<style[\s\S]*?<\/style>/gi, " ")
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 8000);
            if (text) {
              questionPaperContext +=
                `Selected question paper (${paper.file_name}):\n${text}\n\n`;
            }
          }
        } catch {
          // ignore
        }
      }
    }

    if (selectedPaperId && !(papers ?? []).length) {
      return json(
        { error: "Selected question paper was not found for this training." },
        400,
      );
    }

    const systemPrompt = [
      settings.ai_system_prompt?.trim() ||
        "You are an expert corporate training examiner and answer-key author.",
      "Create a professional training answer sheet / model answer key.",
      "Return ONLY valid JSON with this shape:",
      '{"title":"...","notes":["For examiner use only"],"totalMarks":50,"answers":[{"number":1,"question":"...","marks":2,"type":"mcq","answer":"...","markingPoints":["..."]}]}',
      "Follow trainer options for language, total marks, question count, difficulty, document name, mode, and type when provided.",
      "If an existing question paper is provided, answer those questions in order.",
      "For MCQ include the correct option clearly. For short/long answers give a complete model answer plus marking points.",
      "Write everything in the requested language.",
      "If a document/sheet name is provided, use it as the answer sheet title.",
    ].join("\n");

    const userPrompt = [
      `Training topic: ${programme.title}`,
      `Category: ${programme.category || "General"}`,
      `Duration hours: ${programme.duration_hours ?? "N/A"}`,
      `Delivery mode: ${programme.delivery_mode || "N/A"}`,
      body.documentName?.trim()
        ? `Answer sheet name: ${body.documentName.trim()}`
        : "",
      body.documentMode?.trim()
        ? `Mode of document: ${body.documentMode.trim()}`
        : "",
      body.documentType?.trim()
        ? `Type of answer sheet: ${body.documentType.trim()}`
        : "",
      `Programme description:\n${programme.description || "N/A"}`,
      body.extraInstructions?.trim()
        ? `Extra instructions from trainer:\n${body.extraInstructions.trim()}`
        : "",
      questionPaperContext
        ? `Existing question paper context (align answers to these questions):\n\n${questionPaperContext}`
        : "No existing question paper found — invent a matching set of questions and full model answers.",
      matterSummaries.length
        ? `Training Matter Files context:\n\n${matterSummaries.join("\n\n---\n\n")}`
        : "No matter files uploaded yet — build from topic and description only.",
    ]
      .filter(Boolean)
      .join("\n\n");

    const sheet = await generateAnswerSheet({
      provider,
      model,
      apiKey,
      systemPrompt,
      userPrompt,
      fallbackTitle:
        body.documentName?.trim() ||
        `${programme.title} — Answer Sheet`,
    });

    if (!sheet.answers.length) {
      return json({ error: "AI returned no answers" }, 502);
    }

    const html = buildAnswerSheetHtml(sheet);
    const bytes = new TextEncoder().encode(html);
    const stamp = new Date().toISOString().slice(0, 10);
    const displayTitle =
      body.documentName?.trim() || programme.title;
    const safeTopic =
      displayTitle.replace(/[^\w.\-()+ ]+/g, "_").slice(0, 60).trim() ||
      "Training";
    const modeTag = (body.documentMode || "PDF").replace(/[^\w]+/g, "");
    const fileName = `AI Answer Sheet - ${safeTopic} - ${modeTag} - ${stamp}.html`;
    const storagePath =
      `${programmeId}/answer_sheet/${Date.now()}-ai-answer-sheet.html`;

    const { error: uploadError } = await admin.storage
      .from("training-assets")
      .upload(storagePath, bytes, {
        contentType: "text/html; charset=utf-8",
        upsert: false,
      });
    if (uploadError) {
      return json({ error: uploadError.message }, 500);
    }

    const { data: pub } = admin.storage
      .from("training-assets")
      .getPublicUrl(storagePath);

    const { data: asset, error: insertError } = await admin
      .from("programme_training_assets")
      .insert({
        programme_id: programmeId,
        category: "answer_sheet",
        source_type: "file",
        file_name: fileName,
        file_url: pub.publicUrl,
        storage_path: storagePath,
        file_size: bytes.byteLength,
        mime_type: "text/html",
        uploaded_by: user.id,
        content_json: {
          ...sheet,
          documentMode: body.documentMode || null,
          documentType: body.documentType || null,
        },
      })
      .select("*")
      .single();

    if (insertError || !asset) {
      return json(
        { error: insertError?.message || "Failed to save answer sheet" },
        500,
      );
    }

    return json({
      ok: true,
      asset,
      answerCount: sheet.answers.length,
      totalMarks: sheet.totalMarks,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return json({ error: message }, 500);
  }
});

async function generateAnswerSheet(args: {
  provider: string;
  model: string;
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
  fallbackTitle: string;
}): Promise<AnswerSheet> {
  if (args.provider === "anthropic" || args.provider === "cohere") {
    throw new Error(
      `${args.provider} is not supported for answer sheet generation yet. Use OpenAI, Gemini, DeepSeek, Groq, or Mistral.`,
    );
  }
  const content =
    args.provider === "gemini" || args.provider === "google"
      ? await callGemini(args)
      : await callOpenAICompatible(args);
  return parseAnswerSheet(content, args.fallbackTitle);
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
      temperature: 0.35,
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
        temperature: 0.35,
        responseMimeType: "application/json",
      },
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    const raw =
      data?.error?.message || `Gemini request failed (${res.status})`;
    if (/denied access|PERMISSION_DENIED|API key not valid|leaked/i.test(raw)) {
      throw new Error(
        `${raw} Update a valid Gemini API key in Company Setting → AI Setting (from Google AI Studio).`,
      );
    }
    throw new Error(raw);
  }
  return (
    data?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text || "")
      .join("") ?? ""
  );
}

function parseAnswerSheet(content: string, fallbackTitle: string): AnswerSheet {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI returned invalid JSON");
    parsed = JSON.parse(match[0]);
  }

  const answersRaw = Array.isArray(parsed.answers) ? parsed.answers : [];
  const answers: AnswerItem[] = answersRaw
    .map((a, i) => {
      const row = a as Record<string, unknown>;
      return {
        number: Number(row.number ?? i + 1),
        question: String(row.question ?? "").trim(),
        marks: Number(row.marks ?? 1),
        answer: String(row.answer ?? "").trim(),
        markingPoints: Array.isArray(row.markingPoints)
          ? row.markingPoints.map((p) => String(p).trim()).filter(Boolean)
          : [],
        type: row.type != null ? String(row.type) : undefined,
      };
    })
    .filter((a) => a.question && a.answer);

  const computedMarks = answers.reduce((sum, a) => sum + (a.marks || 0), 0);

  return {
    title: String(parsed.title ?? fallbackTitle).trim() || fallbackTitle,
    notes: Array.isArray(parsed.notes)
      ? parsed.notes.map((n) => String(n).trim()).filter(Boolean)
      : [
        "For examiner / trainer use only.",
        "Award marks based on the marking points listed under each answer.",
      ],
    totalMarks: Number(parsed.totalMarks ?? computedMarks) || computedMarks,
    answers,
  };
}

function buildAnswerSheetHtml(sheet: AnswerSheet): string {
  const title = escapeHtml(sheet.title);
  const notes = sheet.notes
    .map((n) => `<li>${escapeHtml(n)}</li>`)
    .join("");
  const answersHtml = sheet.answers
    .map((a) => {
      const points = a.markingPoints
        .map((p) => `<li>${escapeHtml(p)}</li>`)
        .join("");
      return `<div class="item">
  <div class="q-head">
    <strong>Q${a.number}.</strong>
    <span class="marks">[${a.marks} mark${a.marks === 1 ? "" : "s"}]</span>
  </div>
  <p class="question"><span class="label">Question:</span> ${escapeHtml(a.question)}</p>
  <div class="answer">
    <p class="label">Model answer</p>
    <p>${escapeHtml(a.answer)}</p>
  </div>
  ${
    points
      ? `<div class="points"><p class="label">Marking points</p><ul>${points}</ul></div>`
      : ""
  }
</div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    :root { --ink:#0f172a; --muted:#64748b; --line:#cbd5e1; --accent:#059669; --soft:#ecfdf5; }
    * { box-sizing: border-box; }
    body {
      margin: 0; color: var(--ink);
      font-family: "Segoe UI", Georgia, serif; background: #f8fafc;
    }
    .page {
      max-width: 880px; margin: 0 auto; padding: 28px 24px 48px;
      background: white; min-height: 100vh;
    }
    .toolbar {
      display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 16px;
    }
    button {
      border: 0; border-radius: 8px; padding: 8px 12px; font-weight: 600;
      font-size: 13px; cursor: pointer; background: var(--accent); color: white;
      font-family: "Segoe UI", sans-serif;
    }
    header {
      text-align: center; border-bottom: 2px solid var(--ink); padding-bottom: 16px; margin-bottom: 18px;
    }
    header h1 { margin: 0 0 8px; font-size: 26px; }
    .badge {
      display: inline-block; margin-top: 6px; padding: 4px 10px; border-radius: 999px;
      background: var(--soft); color: #047857; font-size: 12px; font-weight: 700;
      font-family: "Segoe UI", sans-serif; letter-spacing: .04em; text-transform: uppercase;
    }
    .meta {
      display: flex; justify-content: center; gap: 24px; flex-wrap: wrap;
      color: var(--muted); font-size: 14px; font-family: "Segoe UI", sans-serif; margin-top: 10px;
    }
    .notes {
      border: 1px solid var(--line); border-radius: 10px; padding: 12px 16px; margin-bottom: 22px;
      background: #fffbeb;
    }
    .notes h3 { margin: 0 0 8px; font-size: 14px; font-family: "Segoe UI", sans-serif; }
    .notes ol { margin: 0; padding-left: 1.2em; }
    .notes li { margin: 4px 0; font-size: 14px; }
    .item { margin-bottom: 22px; padding-bottom: 16px; border-bottom: 1px dashed var(--line); }
    .q-head { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
    .marks { color: var(--muted); font-size: 13px; font-family: "Segoe UI", sans-serif; }
    .label { font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); font-family: "Segoe UI", sans-serif; }
    .question { margin: 0 0 10px; line-height: 1.45; }
    .answer {
      border-left: 4px solid var(--accent); background: var(--soft);
      border-radius: 0 10px 10px 0; padding: 10px 14px; margin-bottom: 8px;
    }
    .answer p { margin: 4px 0 0; line-height: 1.5; }
    .points ul { margin: 6px 0 0; padding-left: 1.2em; }
    .points li { margin: 4px 0; line-height: 1.4; }
    @media print {
      body { background: white; }
      .toolbar { display: none !important; }
      .page { padding: 0; max-width: none; }
      .item { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="toolbar">
      <button type="button" onclick="window.print()">Download / Print</button>
    </div>
    <header>
      <h1>${title}</h1>
      <div class="badge">Answer Key</div>
      <div class="meta">
        <span>Total Marks: ${sheet.totalMarks}</span>
        <span>Answers: ${sheet.answers.length}</span>
      </div>
    </header>
    <div class="notes">
      <h3>Examiner notes</h3>
      <ol>${notes}</ol>
    </div>
    ${answersHtml}
  </div>
</body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
