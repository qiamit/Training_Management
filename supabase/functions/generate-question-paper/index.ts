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
  documentName?: string;
  documentMode?: string;
  documentType?: string;
};

type Question = {
  number: number;
  text: string;
  marks: number;
  type?: string;
  options?: string[];
};

type Section = {
  name: string;
  questions: Question[];
};

type QuestionPaper = {
  title: string;
  instructions: string[];
  durationMinutes: number;
  totalMarks: number;
  sections: Section[];
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
            "Only Quality International staff can generate question papers.",
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
      if (isText && asset.storage_path && !String(asset.storage_path).startsWith("external/")) {
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

    const systemPrompt = [
      settings.ai_system_prompt?.trim() ||
        "You are an expert corporate training assessment designer.",
      "Create a professional training question paper.",
      "Return ONLY valid JSON with this shape:",
      '{"title":"...","instructions":["..."],"durationMinutes":60,"totalMarks":50,"sections":[{"name":"Section A","questions":[{"number":1,"text":"...","marks":2,"type":"mcq","options":["A","B","C","D"]},{"number":2,"text":"...","marks":3,"type":"clause"},{"number":3,"text":"...","marks":5,"type":"written"}]}]}',
      "Question types: mcq (checkbox options), clause (clause-number write-in), written/short/long (written answer space).",
      "Follow trainer options for exam duration, language, total marks, question count, difficulty, paper type, answer format, document name, mode, and type when provided.",
      "Do NOT include answers. Write the paper in the requested language.",
      "If a document/paper name is provided, use it as the question paper title.",
    ].join("\n");

    const userPrompt = [
      `Training topic: ${programme.title}`,
      `Category: ${programme.category || "General"}`,
      `Duration hours: ${programme.duration_hours ?? "N/A"}`,
      `Delivery mode: ${programme.delivery_mode || "N/A"}`,
      body.documentName?.trim()
        ? `Question paper name: ${body.documentName.trim()}`
        : "",
      body.documentMode?.trim()
        ? `Mode of document: ${body.documentMode.trim()}`
        : "",
      body.documentType?.trim()
        ? `Type of paper: ${body.documentType.trim()}`
        : "",
      `Programme description:\n${programme.description || "N/A"}`,
      body.extraInstructions?.trim()
        ? `Extra instructions from trainer:\n${body.extraInstructions.trim()}`
        : "",
      matterSummaries.length
        ? `Training Matter Files context:\n\n${matterSummaries.join("\n\n---\n\n")}`
        : "No matter files uploaded yet — build from topic and description only.",
    ]
      .filter(Boolean)
      .join("\n\n");

    const paper = await generatePaper({
      provider,
      model,
      apiKey,
      systemPrompt,
      userPrompt,
      fallbackTitle:
        body.documentName?.trim() ||
        `${programme.title} — Question Paper`,
    });

    const questionCount = paper.sections.reduce(
      (sum, s) => sum + (s.questions?.length || 0),
      0,
    );
    if (!questionCount) {
      return json({ error: "AI returned no questions" }, 502);
    }

    const html = buildQuestionPaperHtml(paper);
    const bytes = new TextEncoder().encode(html);
    const stamp = new Date().toISOString().slice(0, 10);
    const displayTitle =
      body.documentName?.trim() || programme.title;
    const safeTopic =
      displayTitle.replace(/[^\w.\-()+ ]+/g, "_").slice(0, 60).trim() ||
      "Training";
    const modeTag = (body.documentMode || "PDF").replace(/[^\w]+/g, "");
    const fileName = `AI Question Paper - ${safeTopic} - ${modeTag} - ${stamp}.html`;
    const storagePath =
      `${programmeId}/question_paper/${Date.now()}-ai-question-paper.html`;

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
        category: "question_paper",
        source_type: "file",
        file_name: fileName,
        file_url: pub.publicUrl,
        storage_path: storagePath,
        file_size: bytes.byteLength,
        mime_type: "text/html",
        uploaded_by: user.id,
        content_json: {
          ...paper,
          documentMode: body.documentMode || null,
          documentType: body.documentType || null,
        },
      })
      .select("*")
      .single();

    if (insertError || !asset) {
      return json(
        { error: insertError?.message || "Failed to save question paper" },
        500,
      );
    }

    return json({ ok: true, asset, questionCount, totalMarks: paper.totalMarks });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return json({ error: message }, 500);
  }
});

async function generatePaper(args: {
  provider: string;
  model: string;
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
  fallbackTitle: string;
}): Promise<QuestionPaper> {
  if (args.provider === "anthropic" || args.provider === "cohere") {
    throw new Error(
      `${args.provider} is not supported for question paper generation yet. Use OpenAI, Gemini, DeepSeek, Groq, or Mistral.`,
    );
  }
  const content =
    args.provider === "gemini" || args.provider === "google"
      ? await callGemini(args)
      : await callOpenAICompatible(args);
  return parsePaper(content, args.fallbackTitle);
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

function parsePaper(content: string, fallbackTitle: string): QuestionPaper {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI returned invalid JSON");
    parsed = JSON.parse(match[0]);
  }

  const sectionsRaw = Array.isArray(parsed.sections) ? parsed.sections : [];
  const sections: Section[] = sectionsRaw.map((s, si) => {
    const row = s as Record<string, unknown>;
    const questionsRaw = Array.isArray(row.questions) ? row.questions : [];
    const questions: Question[] = questionsRaw.map((q, qi) => {
      const qr = q as Record<string, unknown>;
      return {
        number: Number(qr.number ?? qi + 1),
        text: String(qr.text ?? "").trim(),
        marks: Number(qr.marks ?? 1),
        type: qr.type != null ? String(qr.type) : undefined,
        options: Array.isArray(qr.options)
          ? qr.options.map((o) => String(o))
          : undefined,
      };
    }).filter((q) => q.text);

    return {
      name: String(row.name ?? `Section ${si + 1}`).trim(),
      questions,
    };
  }).filter((s) => s.questions.length);

  const computedMarks = sections.reduce(
    (sum, s) => sum + s.questions.reduce((a, q) => a + (q.marks || 0), 0),
    0,
  );

  return {
    title: String(parsed.title ?? fallbackTitle).trim() || fallbackTitle,
    instructions: Array.isArray(parsed.instructions)
      ? parsed.instructions.map((i) => String(i).trim()).filter(Boolean)
      : [
        "Read all questions carefully before answering.",
        "Write answers clearly. Marks are indicated against each question.",
      ],
    durationMinutes: Number(parsed.durationMinutes ?? 60) || 60,
    totalMarks: Number(parsed.totalMarks ?? computedMarks) || computedMarks,
    sections,
  };
}

function buildQuestionPaperHtml(paper: QuestionPaper): string {
  const title = escapeHtml(paper.title);
  const instructions = paper.instructions
    .map((i) => `<li>${escapeHtml(i)}</li>`)
    .join("");
  const sectionsHtml = paper.sections
    .map((section) => {
      const qs = section.questions
        .map((q) => {
          const kind = normalizeQuestionKind(q);
          let answerArea = "";
          if (kind === "mcq") {
            const options = (q.options || []).map(
              (o, idx) =>
                `<label class="opt"><input type="checkbox" disabled /> <span>${String.fromCharCode(65 + idx)}. ${escapeHtml(o)}</span></label>`,
            );
            answerArea = options.length
              ? `<div class="answer-area opts">${options.join("")}</div>`
              : `<div class="answer-area opts"><label class="opt"><input type="checkbox" disabled /> <span>A. ________</span></label><label class="opt"><input type="checkbox" disabled /> <span>B. ________</span></label><label class="opt"><input type="checkbox" disabled /> <span>C. ________</span></label><label class="opt"><input type="checkbox" disabled /> <span>D. ________</span></label></div>`;
          } else if (kind === "clause") {
            answerArea = `<div class="answer-area clause">
  <label>Clause No. / Reference</label>
  <div class="clause-box">________________________________</div>
</div>`;
          } else {
            const lines = q.marks >= 5 ? 5 : q.marks >= 3 ? 4 : 3;
            const lineHtml = Array.from({ length: lines })
              .map(() => `<div class="write-line"></div>`)
              .join("");
            answerArea = `<div class="answer-area written">
  <label>Answer</label>
  ${lineHtml}
</div>`;
          }
          return `<div class="q">
  <div class="q-head">
    <strong>Q${q.number}.</strong>
    <span class="marks">[${q.marks} mark${q.marks === 1 ? "" : "s"}]</span>
  </div>
  <p>${escapeHtml(q.text)}</p>
  ${answerArea}
</div>`;
        })
        .join("");
      return `<section class="sec">
  <h2>${escapeHtml(section.name)}</h2>
  ${qs}
</section>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    :root { --ink:#0f172a; --muted:#64748b; --line:#cbd5e1; --accent:#4f46e5; }
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
    .meta {
      display: flex; justify-content: center; gap: 24px; flex-wrap: wrap;
      color: var(--muted); font-size: 14px; font-family: "Segoe UI", sans-serif;
    }
    .instructions {
      border: 1px solid var(--line); border-radius: 10px; padding: 12px 16px; margin-bottom: 22px;
      background: #f8fafc;
    }
    .instructions h3 { margin: 0 0 8px; font-size: 14px; font-family: "Segoe UI", sans-serif; }
    .instructions ol { margin: 0; padding-left: 1.2em; }
    .instructions li { margin: 4px 0; font-size: 14px; }
    .sec { margin-bottom: 28px; }
    .sec h2 {
      margin: 0 0 14px; font-size: 18px; border-left: 4px solid var(--accent);
      padding-left: 10px;
    }
    .q { margin-bottom: 18px; padding-bottom: 14px; border-bottom: 1px dashed var(--line); }
    .q-head { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
    .q p { margin: 0; line-height: 1.45; }
    .marks { color: var(--muted); font-size: 13px; font-family: "Segoe UI", sans-serif; }
    .answer-area { margin-top: 10px; font-family: "Segoe UI", sans-serif; }
    .answer-area label { display: block; font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 6px; text-transform: uppercase; letter-spacing: .04em; }
    .opts { display: grid; gap: 8px; }
    .opt { display: flex; align-items: flex-start; gap: 8px; font-size: 14px; line-height: 1.4; }
    .opt input { margin-top: 3px; }
    .clause-box {
      border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px;
      min-height: 44px; background: #fff; letter-spacing: .08em;
    }
    .write-line {
      border-bottom: 1px solid var(--line); height: 28px; margin-top: 4px;
    }
    @media print {
      body { background: white; }
      .toolbar { display: none !important; }
      .page { padding: 0; max-width: none; }
      .q { break-inside: avoid; }
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
      <div class="meta">
        <span>Duration: ${paper.durationMinutes} minutes</span>
        <span>Total Marks: ${paper.totalMarks}</span>
      </div>
    </header>
    <div class="instructions">
      <h3>Instructions</h3>
      <ol>${instructions}</ol>
    </div>
    ${sectionsHtml}
  </div>
</body>
</html>`;
}

function normalizeQuestionKind(q: Question): "mcq" | "clause" | "written" {
  const type = String(q.type || "").toLowerCase();
  if (
    type === "mcq" ||
    type === "checkbox" ||
    type === "option" ||
    (q.options?.length ?? 0) >= 2
  ) {
    return "mcq";
  }
  if (type === "clause" || type.includes("clause")) {
    return "clause";
  }
  return "written";
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
