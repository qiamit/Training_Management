import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Body = {
  assetId?: string;
  slideIndex?: number;
  action?: "improve" | "recreate";
  extraInstructions?: string;
};

type Slide = {
  title: string;
  bullets: string[];
  notes?: string;
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
            "Only Quality International staff can improve presentation slides.",
        },
        403,
      );
    }

    const body = (await req.json()) as Body;
    const assetId = body.assetId?.trim() ?? "";
    const action = body.action === "recreate" ? "recreate" : "improve";
    const slideIndex = Number(body.slideIndex);
    if (!assetId) return json({ error: "assetId is required" }, 400);
    if (!Number.isInteger(slideIndex) || slideIndex < 0) {
      return json({ error: "slideIndex is required" }, 400);
    }

    const { data: asset, error: assetErr } = await admin
      .from("programme_training_assets")
      .select("*")
      .eq("id", assetId)
      .maybeSingle();
    if (assetErr || !asset) {
      return json({ error: "Presentation asset not found" }, 404);
    }
    if (asset.category !== "presentation") {
      return json({ error: "Asset is not a presentation" }, 400);
    }

    const { data: programme } = await admin
      .from("training_programmes")
      .select("id, title, description, category")
      .eq("id", asset.programme_id)
      .maybeSingle();

    let topic = programme?.title || "Training Presentation";
    let slides = extractSlidesFromContentJson(asset.content_json);
    if (!slides.length && asset.storage_path) {
      const fromHtml = await loadSlidesFromStorage(admin, asset.storage_path);
      slides = fromHtml.slides;
      if (fromHtml.topic) topic = fromHtml.topic;
    }
    if (!slides.length) {
      return json(
        {
          error:
            "Could not read slides from this presentation. Regenerate the presentation with AI first.",
        },
        400,
      );
    }
    if (slideIndex >= slides.length) {
      return json({ error: "slideIndex out of range" }, 400);
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

    const current = slides[slideIndex];
    const neighbors = slides
      .map((s, i) => ({ i, title: s.title }))
      .filter((x) => x.i !== slideIndex)
      .slice(Math.max(0, slideIndex - 2), slideIndex + 2);

    const systemPrompt = [
      settings.ai_system_prompt?.trim() ||
        "You are an expert corporate training presentation designer.",
      "Return ONLY valid JSON with this shape:",
      '{"slide":{"title":"...","bullets":["..."],"notes":"..."}}',
      action === "recreate"
        ? "Fully recreate this one slide with fresh wording and structure, keeping the same learning objective."
        : "Improve this one slide: clearer title, stronger bullets (3–6), better trainer notes. Keep the same core topic.",
      "Do not return the full deck — only the single improved/recreated slide.",
      "Write in the same language as the current slide.",
    ].join("\n");

    const userPrompt = [
      `Training topic: ${topic}`,
      `Programme category: ${programme?.category || "General"}`,
      `Programme description: ${programme?.description || "N/A"}`,
      `Slide number: ${slideIndex + 1} of ${slides.length}`,
      `Action: ${action}`,
      `Current slide JSON:\n${JSON.stringify(current, null, 2)}`,
      neighbors.length
        ? `Nearby slide titles for continuity:\n${neighbors
            .map((n) => `${n.i + 1}. ${n.title}`)
            .join("\n")}`
        : "",
      body.extraInstructions?.trim()
        ? `Extra instructions from trainer:\n${body.extraInstructions.trim()}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const updatedSlide = await generateOneSlide({
      provider,
      model,
      apiKey,
      systemPrompt,
      userPrompt,
      fallback: current,
    });

    const nextSlides = slides.map((s, i) =>
      i === slideIndex ? updatedSlide : s,
    );
    const html = buildPresentationHtml({ topic, slides: nextSlides });
    const bytes = new TextEncoder().encode(html);
    const storagePath = String(asset.storage_path || "");
    if (!storagePath || storagePath.startsWith("external/")) {
      return json({ error: "Presentation storage path is missing" }, 500);
    }

    const { error: uploadError } = await admin.storage
      .from("training-assets")
      .upload(storagePath, bytes, {
        contentType: "text/html; charset=utf-8",
        upsert: true,
      });
    if (uploadError) {
      return json({ error: uploadError.message }, 500);
    }

    const { data: pub } = admin.storage
      .from("training-assets")
      .getPublicUrl(storagePath);

    const contentJson = { topic, slides: nextSlides };
    const { data: updatedAsset, error: updateErr } = await admin
      .from("programme_training_assets")
      .update({
        content_json: contentJson,
        file_size: bytes.byteLength,
        file_url: pub.publicUrl,
        mime_type: "text/html",
      })
      .eq("id", assetId)
      .select("*")
      .single();

    if (updateErr || !updatedAsset) {
      return json(
        { error: updateErr?.message || "Failed to update presentation" },
        500,
      );
    }

    return json({
      ok: true,
      asset: updatedAsset,
      slideIndex,
      slide: updatedSlide,
      slideCount: nextSlides.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return json({ error: message }, 500);
  }
});

function extractSlidesFromContentJson(contentJson: unknown): Slide[] {
  if (!contentJson || typeof contentJson !== "object") return [];
  const root = contentJson as { slides?: unknown };
  if (!Array.isArray(root.slides)) return [];
  return root.slides
    .map((s) => {
      const row = s as Record<string, unknown>;
      return {
        title: String(row.title ?? "").trim(),
        bullets: Array.isArray(row.bullets)
          ? row.bullets.map((b) => String(b).trim()).filter(Boolean)
          : [],
        notes: row.notes != null ? String(row.notes).trim() : "",
      };
    })
    .filter((s) => s.title);
}

async function loadSlidesFromStorage(
  admin: ReturnType<typeof createClient>,
  storagePath: string,
): Promise<{ topic: string; slides: Slide[] }> {
  try {
    const { data: blob, error } = await admin.storage
      .from("training-assets")
      .download(storagePath);
    if (error || !blob) return { topic: "", slides: [] };
    const html = await blob.text();
    const titleMatch = html.match(/<title>([\s\S]*?)—/);
    const topic = titleMatch
      ? titleMatch[1].replace(/<[^>]+>/g, "").trim()
      : "";
    const match = html.match(/const slides = (\[[\s\S]*?\]);\s*let index/);
    if (!match) return { topic, slides: [] };
    const parsed = JSON.parse(match[1]) as unknown[];
    const slides = parsed
      .map((s) => {
        const row = s as Record<string, unknown>;
        return {
          title: String(row.title ?? "").trim(),
          bullets: Array.isArray(row.bullets)
            ? row.bullets.map((b) => String(b).trim()).filter(Boolean)
            : [],
          notes: row.notes != null ? String(row.notes).trim() : "",
        };
      })
      .filter((s) => s.title);
    return { topic, slides };
  } catch {
    return { topic: "", slides: [] };
  }
}

async function generateOneSlide(args: {
  provider: string;
  model: string;
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
  fallback: Slide;
}): Promise<Slide> {
  if (args.provider === "anthropic" || args.provider === "cohere") {
    throw new Error(
      `${args.provider} is not supported yet. Use OpenAI, Gemini, DeepSeek, Groq, or Mistral.`,
    );
  }
  const content =
    args.provider === "gemini" || args.provider === "google"
      ? await callGemini(args)
      : await callOpenAICompatible(args);
  const slide = parseOneSlide(content);
  if (!slide.title) return args.fallback;
  return slide;
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
      temperature: 0.45,
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
        temperature: 0.45,
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

function parseOneSlide(content: string): Slide {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return { title: "", bullets: [] };
    parsed = JSON.parse(match[0]);
  }
  const slideRaw =
    parsed.slide && typeof parsed.slide === "object"
      ? (parsed.slide as Record<string, unknown>)
      : parsed;
  return {
    title: String(slideRaw.title ?? "").trim(),
    bullets: Array.isArray(slideRaw.bullets)
      ? slideRaw.bullets.map((b) => String(b).trim()).filter(Boolean)
      : [],
    notes: slideRaw.notes != null ? String(slideRaw.notes).trim() : "",
  };
}

function buildPresentationHtml(args: {
  topic: string;
  slides: Slide[];
}): string {
  const slidesJson = JSON.stringify(args.slides);
  const topic = escapeHtml(args.topic);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${topic} — Training Presentation</title>
  <style>
    :root { --bg:#0f172a; --text:#f8fafc; --muted:#94a3b8; --accent:#6366f1; --accent-2:#22d3ee; }
    * { box-sizing: border-box; }
    html, body { margin:0; height:100%; background:var(--bg); color:var(--text); font-family:Segoe UI, system-ui, sans-serif; }
    .shell { display:flex; flex-direction:column; height:100%; }
    .toolbar { display:flex; flex-wrap:wrap; gap:8px; align-items:center; justify-content:space-between; padding:10px 14px; border-bottom:1px solid #334155; }
    .toolbar h1 { margin:0; font-size:14px; font-weight:600; color:var(--muted); }
    .toolbar .actions { display:flex; flex-wrap:wrap; gap:8px; }
    button { border:0; border-radius:8px; padding:8px 12px; font-weight:600; font-size:13px; cursor:pointer; background:#334155; color:white; }
    button.primary { background:var(--accent); }
    button:disabled { opacity:.45; cursor:default; }
    .stage { flex:1; display:grid; place-items:center; padding:24px; }
    .slide { width:min(1100px,100%); aspect-ratio:16/9; background:radial-gradient(circle at top right, rgba(99,102,241,.35), transparent 40%), linear-gradient(145deg,#0b1224,#1e293b 55%,#0f172a); border:1px solid #334155; border-radius:18px; padding:clamp(24px,4vw,48px); box-shadow:0 30px 80px rgba(0,0,0,.35); display:flex; flex-direction:column; justify-content:center; }
    .eyebrow { color:var(--accent-2); font-size:12px; letter-spacing:.14em; text-transform:uppercase; margin-bottom:12px; }
    .slide h2 { margin:0 0 18px; font-size:clamp(28px,4vw,42px); line-height:1.15; }
    .slide ul { margin:0; padding-left:1.2em; display:grid; gap:10px; }
    .slide li { font-size:clamp(16px,2.2vw,22px); line-height:1.35; color:#e2e8f0; }
    .notes { margin-top:18px; color:var(--muted); font-size:13px; }
    .footer { display:flex; justify-content:space-between; align-items:center; padding:10px 14px; border-top:1px solid #334155; color:var(--muted); font-size:12px; }
    @media print { .toolbar { display:none !important; } .shell,.stage { display:block; height:auto; } .slide { page-break-after:always; box-shadow:none; border-radius:0; border:0; width:100%; aspect-ratio:auto; min-height:90vh; } }
  </style>
</head>
<body>
  <div class="shell">
    <div class="toolbar">
      <h1>${topic}</h1>
      <div class="actions">
        <button type="button" id="prevBtn">Previous</button>
        <button type="button" id="nextBtn" class="primary">Next</button>
        <button type="button" id="presentBtn">Present</button>
        <button type="button" id="printBtn">Download / Print</button>
      </div>
    </div>
    <div class="stage"><article class="slide" id="slideView"></article></div>
    <div class="footer"><span id="counter"></span><span>Use arrow keys</span></div>
  </div>
  <script>
    const slides = ${slidesJson};
    let index = 0;
    const slideView = document.getElementById("slideView");
    const counter = document.getElementById("counter");
    const prevBtn = document.getElementById("prevBtn");
    const nextBtn = document.getElementById("nextBtn");
    function escapeHtml(value) {
      return String(value)
        .split("&").join("&amp;")
        .split("<").join("&lt;")
        .split(">").join("&gt;")
        .split('"').join("&quot;");
    }
    function render() {
      const s = slides[index] || { title: "Empty", bullets: [] };
      const bullets = (s.bullets || []).map((b) => "<li>" + escapeHtml(b) + "</li>").join("");
      slideView.innerHTML =
        '<div class="eyebrow">Training Presentation</div>' +
        "<h2>" + escapeHtml(s.title || "") + "</h2>" +
        (bullets ? "<ul>" + bullets + "</ul>" : "") +
        (s.notes ? '<p class="notes">' + escapeHtml(s.notes) + "</p>" : "");
      counter.textContent = "Slide " + (index + 1) + " / " + slides.length;
      prevBtn.disabled = index <= 0;
      nextBtn.disabled = index >= slides.length - 1;
    }
    function go(delta) {
      index = Math.max(0, Math.min(slides.length - 1, index + delta));
      render();
    }
    prevBtn.addEventListener("click", () => go(-1));
    nextBtn.addEventListener("click", () => go(1));
    document.getElementById("presentBtn").addEventListener("click", () => document.documentElement.requestFullscreen?.());
    document.getElementById("printBtn").addEventListener("click", () => window.print());
    document.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "Escape" && document.fullscreenElement) {
        document.exitFullscreen?.();
      }
    });
    render();
  </script>
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
