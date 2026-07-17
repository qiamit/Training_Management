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
  /** improve | recreate a single slide on an existing presentation asset */
  action?: "generate" | "improve" | "recreate";
  assetId?: string;
  slideIndex?: number;
};

type SlideChartPoint = { label: string; value: number };
type SlideCard = { title: string; text: string; icon?: string };
type SlideStep = { title: string; text: string };
type SlideCallout = {
  label?: string;
  text: string;
  tone?: "info" | "warning" | "success" | "tip";
};
type SlideChart = {
  type?: "bar" | "pie" | "donut";
  title?: string;
  unit?: string;
  data: SlideChartPoint[];
};
type SlideVisual = {
  kind?: "icon" | "illustration";
  icon?: string;
  caption?: string;
};

type Slide = {
  title: string;
  subtitle?: string;
  bullets: string[];
  notes?: string;
  layout?:
    | "title"
    | "bullets"
    | "split"
    | "cards"
    | "chart"
    | "steps"
    | "callout"
    | "quote";
  callout?: SlideCallout;
  cards?: SlideCard[];
  steps?: SlideStep[];
  chart?: SlideChart;
  visual?: SlideVisual;
  quote?: { text: string; attribution?: string };
};

const SLIDE_ITEM_SHAPE =
  '{"title":"...","subtitle":"...","layout":"bullets|split|cards|chart|steps|callout|quote|title","bullets":["..."],"notes":"...","callout":{"label":"Info","text":"...","tone":"info|warning|success|tip"},"cards":[{"title":"...","text":"...","icon":"audit|checklist|people|process|shield|chart|lightbulb|document|target|training|quality|lab"}],"steps":[{"title":"...","text":"..."}],"chart":{"type":"bar|pie|donut","title":"...","unit":"%","data":[{"label":"...","value":40}]},"visual":{"kind":"illustration","icon":"audit","caption":"..."},"quote":{"text":"...","attribution":"..."}}';
const SLIDE_JSON_SHAPE = `{"slides":[${SLIDE_ITEM_SHAPE}]}`;

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
        { error: "Only Quality International staff can generate presentations." },
        403,
      );
    }

    const body = (await req.json()) as Body;
    const action =
      body.action === "improve" || body.action === "recreate"
        ? body.action
        : "generate";

    if (action === "improve" || action === "recreate") {
      return await improveExistingSlide({
        admin,
        userId: user.id,
        body,
        action,
      });
    }

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
          // ignore download failures; filename still used
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
        "You are an expert corporate training instructional designer.",
      "Create a clear, professional, visually rich training presentation deck.",
      "Return ONLY valid JSON with this shape:",
      SLIDE_JSON_SHAPE,
      "Follow trainer options for session time, language, slide/page count, style, audience level, document name, mode (PPT/PDF/Word/Excel), and type when provided.",
      "Vary layouts across the deck — do NOT make every slide plain bullets.",
      "Across the deck include a healthy mix of: title/agenda, bullets, info callouts, icon cards, process steps, at least 1–2 chart slides (bar/pie/donut with realistic numeric data), split slides with visual panels, and a summary/next-steps slide.",
      "Use layout field on every slide. Prefer cards/steps/chart/callout/split when content fits.",
      "For images/visuals: use visual.icon from the allowed icon set (no external image URLs).",
      "Chart data must be plausible for the training topic (percentages, counts, findings, readiness scores, etc.).",
      "Bullets should be concise talking points (max 5 per slide when used).",
      "Write all slide text in the requested presentation language.",
      "If a document/presentation name is provided, use it as the deck title theme.",
    ].join("\n");

    const userPrompt = [
      `Training topic: ${programme.title}`,
      `Category: ${programme.category || "General"}`,
      `Duration hours: ${programme.duration_hours ?? "N/A"}`,
      `Delivery mode: ${programme.delivery_mode || "N/A"}`,
      body.documentName?.trim()
        ? `Presentation name: ${body.documentName.trim()}`
        : "",
      body.documentMode?.trim()
        ? `Mode of presentation: ${body.documentMode.trim()}`
        : "",
      body.documentType?.trim()
        ? `Type of presentation: ${body.documentType.trim()}`
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

    const slides = await generateSlides({
      provider,
      model,
      apiKey,
      systemPrompt,
      userPrompt,
    });

    if (!slides.length) {
      return json({ error: "AI returned no slides" }, 502);
    }

    const displayTitle =
      body.documentName?.trim() || programme.title;
    const html = buildPresentationHtml({
      topic: displayTitle,
      slides,
    });
    const bytes = new TextEncoder().encode(html);
    const stamp = new Date().toISOString().slice(0, 10);
    const safeTopic = displayTitle
      .replace(/[^\w.\-()+ ]+/g, "_")
      .slice(0, 60)
      .trim() || "Training";
    const modeTag = (body.documentMode || "PPT").replace(/[^\w]+/g, "");
    const fileName = `AI Presentation - ${safeTopic} - ${modeTag} - ${stamp}.html`;
    const storagePath =
      `${programmeId}/presentation/${Date.now()}-ai-presentation.html`;

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
        category: "presentation",
        source_type: "file",
        file_name: fileName,
        file_url: pub.publicUrl,
        storage_path: storagePath,
        file_size: bytes.byteLength,
        mime_type: "text/html",
        uploaded_by: user.id,
        content_json: {
          topic: displayTitle,
          slides,
          documentMode: body.documentMode || null,
          documentType: body.documentType || null,
        },
      })
      .select("*")
      .single();

    if (insertError || !asset) {
      return json(
        { error: insertError?.message || "Failed to save presentation" },
        500,
      );
    }

    return json({ ok: true, asset, slideCount: slides.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return json({ error: message }, 500);
  }
});

async function improveExistingSlide(args: {
  admin: ReturnType<typeof createClient>;
  userId: string;
  body: Body;
  action: "improve" | "recreate";
}): Promise<Response> {
  const { admin, body, action } = args;
  const assetId = body.assetId?.trim() ?? "";
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
    const fromHtml = await loadSlidesFromStorage(
      admin,
      String(asset.storage_path),
    );
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
    `{"slide":${SLIDE_ITEM_SHAPE}}`,
    action === "recreate"
      ? "Fully recreate this one slide with a richer visual layout (cards, chart, callout, steps, or split+visual) while keeping the same learning objective."
      : "Improve this one slide: clearer title, stronger content, and enrich with callout/cards/chart/visual when useful. Keep the same core topic.",
    "Prefer a visually useful layout over plain bullets when content supports it.",
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

  const oneSlideJson = await generateSlideJson({
    provider,
    model,
    apiKey,
    systemPrompt,
    userPrompt,
  });
  const updatedSlide = parseOneSlide(oneSlideJson) || current;
  if (!updatedSlide.title) {
    return json({ error: "AI returned an empty slide" }, 502);
  }

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

  const { data: updatedAsset, error: updateErr } = await admin
    .from("programme_training_assets")
    .update({
      content_json: { topic, slides: nextSlides },
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
}

function normalizeSlide(raw: unknown): Slide | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const title = String(row.title ?? "").trim();
  if (!title) return null;

  const bullets = Array.isArray(row.bullets)
    ? row.bullets.map((b) => String(b).trim()).filter(Boolean)
    : [];

  const cards = Array.isArray(row.cards)
    ? row.cards
        .map((c) => {
          const card = c as Record<string, unknown>;
          return {
            title: String(card.title ?? "").trim(),
            text: String(card.text ?? "").trim(),
            icon: card.icon != null ? String(card.icon).trim() : undefined,
          };
        })
        .filter((c) => c.title || c.text)
    : undefined;

  const steps = Array.isArray(row.steps)
    ? row.steps
        .map((s) => {
          const step = s as Record<string, unknown>;
          return {
            title: String(step.title ?? "").trim(),
            text: String(step.text ?? "").trim(),
          };
        })
        .filter((s) => s.title || s.text)
    : undefined;

  let chart: SlideChart | undefined;
  if (row.chart && typeof row.chart === "object") {
    const ch = row.chart as Record<string, unknown>;
    const data = Array.isArray(ch.data)
      ? ch.data
          .map((d) => {
            const point = d as Record<string, unknown>;
            return {
              label: String(point.label ?? "").trim(),
              value: Number(point.value ?? 0),
            };
          })
          .filter((d) => d.label && Number.isFinite(d.value))
      : [];
    if (data.length) {
      chart = {
        type:
          ch.type === "pie" || ch.type === "donut" || ch.type === "bar"
            ? ch.type
            : "bar",
        title: ch.title != null ? String(ch.title).trim() : undefined,
        unit: ch.unit != null ? String(ch.unit).trim() : undefined,
        data,
      };
    }
  }

  let callout: SlideCallout | undefined;
  if (row.callout && typeof row.callout === "object") {
    const c = row.callout as Record<string, unknown>;
    const text = String(c.text ?? "").trim();
    if (text) {
      callout = {
        text,
        label: c.label != null ? String(c.label).trim() : undefined,
        tone:
          c.tone === "warning" ||
          c.tone === "success" ||
          c.tone === "tip" ||
          c.tone === "info"
            ? c.tone
            : "info",
      };
    }
  }

  let visual: SlideVisual | undefined;
  if (row.visual && typeof row.visual === "object") {
    const v = row.visual as Record<string, unknown>;
    visual = {
      kind: v.kind === "illustration" ? "illustration" : "icon",
      icon: v.icon != null ? String(v.icon).trim() : "lightbulb",
      caption: v.caption != null ? String(v.caption).trim() : undefined,
    };
  }

  let quote: Slide["quote"];
  if (row.quote && typeof row.quote === "object") {
    const q = row.quote as Record<string, unknown>;
    const text = String(q.text ?? "").trim();
    if (text) {
      quote = {
        text,
        attribution:
          q.attribution != null ? String(q.attribution).trim() : undefined,
      };
    }
  }

  const layoutRaw = String(row.layout ?? "").trim().toLowerCase();
  const layout: Slide["layout"] =
    layoutRaw === "title" ||
    layoutRaw === "bullets" ||
    layoutRaw === "split" ||
    layoutRaw === "cards" ||
    layoutRaw === "chart" ||
    layoutRaw === "steps" ||
    layoutRaw === "callout" ||
    layoutRaw === "quote"
      ? layoutRaw
      : chart
        ? "chart"
        : cards?.length
          ? "cards"
          : steps?.length
            ? "steps"
            : callout
              ? "callout"
              : quote
                ? "quote"
                : visual && bullets.length
                  ? "split"
                  : bullets.length
                    ? "bullets"
                    : "title";

  return {
    title,
    subtitle: row.subtitle != null ? String(row.subtitle).trim() : "",
    bullets,
    notes: row.notes != null ? String(row.notes).trim() : "",
    layout,
    callout,
    cards,
    steps,
    chart,
    visual,
    quote,
  };
}

function extractSlidesFromContentJson(contentJson: unknown): Slide[] {
  if (!contentJson || typeof contentJson !== "object") return [];
  const root = contentJson as { slides?: unknown };
  if (!Array.isArray(root.slides)) return [];
  return root.slides
    .map(normalizeSlide)
    .filter((s): s is Slide => !!s);
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
      .map(normalizeSlide)
      .filter((s): s is Slide => !!s);
    return { topic, slides };
  } catch {
    return { topic: "", slides: [] };
  }
}

async function generateSlideJson(args: {
  provider: string;
  model: string;
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
}): Promise<string> {
  if (args.provider === "anthropic" || args.provider === "cohere") {
    throw new Error(
      `${args.provider} is not supported yet. Use OpenAI, Gemini, DeepSeek, Groq, or Mistral.`,
    );
  }
  if (isGeminiProvider(args.provider)) {
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
      throw new Error(
        data?.error?.message || `Gemini request failed (${res.status})`,
      );
    }
    return (
      data?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text || "")
        .join("") ?? ""
    );
  }

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

function parseOneSlide(content: string): Slide | null {
  if (!content.trim()) return null;
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    parsed = JSON.parse(match[0]);
  }
  const slideRaw =
    parsed.slide && typeof parsed.slide === "object"
      ? (parsed.slide as Record<string, unknown>)
      : parsed;
  return normalizeSlide(slideRaw);
}

function isGeminiProvider(provider: string) {
  return provider === "gemini" || provider === "google";
}

/** OpenAI-compatible chat completions endpoints by provider */
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
    case "openai":
    case "azure_openai":
    case "other":
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
    // DeepSeek chat models (V3/V4 Flash aliases → official id)
    return "deepseek-chat";
  }
  return trimmed || "gpt-4o-mini";
}

async function generateSlides(args: {
  provider: string;
  model: string;
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
}): Promise<Slide[]> {
  if (args.provider === "anthropic" || args.provider === "cohere") {
    throw new Error(
      `${args.provider} is not supported for presentation generation yet. Use OpenAI, Gemini, DeepSeek, Groq, or Mistral.`,
    );
  }
  if (isGeminiProvider(args.provider)) {
    return generateWithGemini(args);
  }
  return generateWithOpenAICompatible(args);
}

async function generateWithOpenAICompatible(args: {
  provider: string;
  model: string;
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
}): Promise<Slide[]> {
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
      temperature: 0.4,
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
  const content = data?.choices?.[0]?.message?.content;
  return parseSlides(content);
}

async function generateWithGemini(args: {
  model: string;
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
}): Promise<Slide[]> {
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
        temperature: 0.4,
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
  const content = data?.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p.text || "")
    .join("") ?? "";
  return parseSlides(content);
}

function parseSlides(content: unknown): Slide[] {
  if (typeof content !== "string" || !content.trim()) return [];
  let parsed: { slides?: unknown };
  try {
    parsed = JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return [];
    parsed = JSON.parse(match[0]);
  }
  if (!Array.isArray(parsed.slides)) return [];
  return parsed.slides
    .map(normalizeSlide)
    .filter((s): s is Slide => !!s);
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
    :root { --bg:#07111f; --text:#f8fafc; --muted:#94a3b8; --accent:#6366f1; --accent-2:#22d3ee; --card:rgba(255,255,255,.06); --line:rgba(255,255,255,.12); }
    * { box-sizing: border-box; }
    html, body { margin:0; height:100%; background:var(--bg); color:var(--text); font-family:Segoe UI, system-ui, sans-serif; }
    .shell { display:flex; flex-direction:column; height:100%; }
    .toolbar { display:flex; flex-wrap:wrap; gap:8px; align-items:center; justify-content:space-between; padding:10px 14px; border-bottom:1px solid #1e293b; background:#0b1324; }
    .toolbar h1 { margin:0; font-size:14px; font-weight:600; color:var(--muted); }
    .toolbar .actions { display:flex; flex-wrap:wrap; gap:8px; }
    button { border:0; border-radius:8px; padding:8px 12px; font-weight:600; font-size:13px; cursor:pointer; background:#334155; color:white; }
    button.primary { background:var(--accent); }
    button:disabled { opacity:.45; cursor:default; }
    .stage { flex:1; display:grid; place-items:center; padding:18px; background:radial-gradient(circle at top right, rgba(56,189,248,.12), transparent 35%), radial-gradient(circle at bottom left, rgba(99,102,241,.16), transparent 40%), #07111f; }
    .slide { width:min(1100px,100%); aspect-ratio:16/9; background:linear-gradient(145deg,#0b1224,#1e293b 55%,#0f172a); border:1px solid #334155; border-radius:18px; padding:clamp(18px,3vw,36px); box-shadow:0 30px 80px rgba(0,0,0,.35); display:flex; flex-direction:column; overflow:auto; position:relative; }
    .eyebrow { color:var(--accent-2); font-size:11px; letter-spacing:.14em; text-transform:uppercase; margin-bottom:8px; font-weight:700; }
    .slide h2 { margin:0; font-size:clamp(22px,3.2vw,36px); line-height:1.15; }
    .subtitle { margin:8px 0 0; color:#cbd5e1; font-size:clamp(13px,1.5vw,16px); }
    .grid { display:grid; gap:14px; margin-top:16px; flex:1; }
    .grid.split { grid-template-columns:1.1fr .9fr; }
    @media (max-width:900px){ .grid.split { grid-template-columns:1fr; } }
    .bullets { margin:0; padding:0; list-style:none; display:grid; gap:8px; }
    .bullets li { display:flex; gap:10px; background:var(--card); border:1px solid var(--line); border-radius:12px; padding:10px 12px; font-size:clamp(13px,1.6vw,17px); line-height:1.35; color:#e2e8f0; }
    .dot { width:7px; height:7px; border-radius:999px; background:var(--accent-2); margin-top:7px; flex:0 0 auto; }
    .callout { border-radius:14px; border:1px solid rgba(56,189,248,.35); background:rgba(56,189,248,.1); padding:12px 14px; font-size:14px; }
    .callout.warn { border-color:rgba(251,191,36,.4); background:rgba(251,191,36,.1); }
    .callout.ok { border-color:rgba(52,211,153,.4); background:rgba(52,211,153,.1); }
    .callout.tip { border-color:rgba(167,139,250,.4); background:rgba(167,139,250,.1); }
    .callout .lbl { font-size:10px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; opacity:.85; margin-bottom:4px; }
    .cards { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
    .card { border:1px solid var(--line); border-radius:14px; background:linear-gradient(145deg,rgba(255,255,255,.1),rgba(255,255,255,.03)); padding:12px; }
    .card .ico { width:32px; height:32px; border-radius:10px; display:grid; place-items:center; background:rgba(34,211,238,.15); margin-bottom:8px; font-size:16px; }
    .card h3 { margin:0 0 4px; font-size:14px; }
    .card p { margin:0; font-size:12px; color:#cbd5e1; line-height:1.4; }
    .steps { display:grid; gap:8px; }
    .step { display:flex; gap:12px; border:1px solid var(--line); border-radius:14px; background:var(--card); padding:10px 12px; }
    .num { width:28px; height:28px; border-radius:999px; display:grid; place-items:center; background:rgba(99,102,241,.35); font-size:12px; font-weight:800; flex:0 0 auto; }
    .step h3 { margin:0; font-size:14px; }
    .step p { margin:2px 0 0; font-size:12px; color:#cbd5e1; }
    .panel { border:1px solid var(--line); border-radius:16px; background:rgba(255,255,255,.05); padding:14px; }
    .panel h4 { margin:0 0 10px; font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:#a5f3fc; }
    .bars { display:flex; align-items:flex-end; gap:10px; height:150px; }
    .bar-col { flex:1; min-width:0; display:flex; flex-direction:column; align-items:center; gap:6px; height:100%; justify-content:flex-end; }
    .bar { width:100%; border-radius:8px 8px 4px 4px; min-height:8px; }
    .bar-col span { font-size:10px; color:#cbd5e1; text-align:center; width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .legend { display:grid; gap:6px; margin-top:8px; font-size:12px; }
    .legend div { display:flex; gap:8px; align-items:center; }
    .swatch { width:10px; height:10px; border-radius:999px; }
    .visual { min-height:160px; border:1px dashed rgba(34,211,238,.35); border-radius:16px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; background:radial-gradient(circle at center, rgba(34,211,238,.12), transparent 60%); padding:16px; }
    .visual .big { width:72px; height:72px; border-radius:22px; display:grid; place-items:center; background:rgba(255,255,255,.1); font-size:34px; margin-bottom:10px; }
    .quote { border:1px solid var(--line); border-radius:16px; background:var(--card); padding:16px 18px; }
    .quote p { margin:0; font-size:clamp(15px,2vw,20px); font-style:italic; line-height:1.45; }
    .quote footer { margin-top:10px; font-size:12px; color:#a5f3fc; font-weight:700; }
    .notes { margin-top:14px; color:var(--muted); font-size:12px; border-top:1px solid var(--line); padding-top:10px; }
    .footer { display:flex; justify-content:space-between; align-items:center; padding:10px 14px; border-top:1px solid #1e293b; color:var(--muted); font-size:12px; background:#0b1324; }
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
    const COLORS = ["#38bdf8","#818cf8","#34d399","#fbbf24","#fb7185","#a78bfa","#2dd4bf","#f472b6"];
    const ICONS = { audit:"🔎", checklist:"✅", people:"👥", process:"⚙️", shield:"🛡️", chart:"📊", lightbulb:"💡", document:"📄", target:"🎯", warning:"⚠️", training:"🎓", quality:"⭐", lab:"🧪", clock:"⏱️" };
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
    function iconGlyph(name) {
      return ICONS[String(name || "lightbulb").toLowerCase()] || "📌";
    }
    function renderBars(chart) {
      const max = Math.max.apply(null, chart.data.map(function(d){ return d.value; }).concat([1]));
      const cols = chart.data.map(function(d, i) {
        const h = Math.max(8, Math.round((d.value / max) * 100));
        return '<div class="bar-col"><span>' + escapeHtml(String(d.value)) + '</span><div class="bar" style="height:' + h + '%;background:linear-gradient(180deg,' + COLORS[i % COLORS.length] + ',' + COLORS[i % COLORS.length] + '99)"></div><span>' + escapeHtml(d.label) + '</span></div>';
      }).join("");
      return '<div class="panel"><h4>' + escapeHtml(chart.title || "Chart") + (chart.unit ? " (" + escapeHtml(chart.unit) + ")" : "") + '</h4><div class="bars">' + cols + '</div></div>';
    }
    function renderPie(chart) {
      const total = chart.data.reduce(function(sum, d){ return sum + Math.max(0, d.value); }, 0) || 1;
      let angle = -90;
      const slices = chart.data.map(function(d, i) {
        const sweep = (Math.max(0, d.value) / total) * 360;
        const start = angle; angle += sweep;
        const large = sweep > 180 ? 1 : 0;
        const r = 42;
        const startRad = start * Math.PI / 180;
        const endRad = (start + sweep) * Math.PI / 180;
        const x1 = 50 + r * Math.cos(startRad);
        const y1 = 50 + r * Math.sin(startRad);
        const x2 = 50 + r * Math.cos(endRad);
        const y2 = 50 + r * Math.sin(endRad);
        const path = "M50 50 L " + x1 + " " + y1 + " A " + r + " " + r + " 0 " + large + " 1 " + x2 + " " + y2 + " Z";
        return { path: path, color: COLORS[i % COLORS.length], label: d.label, value: d.value };
      });
      const paths = slices.map(function(s){ return '<path d="' + s.path + '" fill="' + s.color + '" opacity="0.92"></path>'; }).join("");
      const donut = chart.type === "donut" ? '<circle cx="50" cy="50" r="22" fill="#0b1224"></circle>' : "";
      const legend = slices.map(function(s){ return '<div><span class="swatch" style="background:' + s.color + '"></span><span style="flex:1">' + escapeHtml(s.label) + '</span><strong>' + escapeHtml(String(s.value)) + '</strong></div>'; }).join("");
      return '<div class="panel"><h4>' + escapeHtml(chart.title || "Chart") + '</h4><div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap"><svg viewBox="0 0 100 100" width="150" height="150">' + paths + donut + '</svg><div class="legend" style="flex:1;min-width:140px">' + legend + '</div></div></div>';
    }
    function render() {
      const s = slides[index] || { title: "Empty", bullets: [] };
      const layout = s.layout || "bullets";
      const bullets = (s.bullets || []).map(function(b){ return '<li><span class="dot"></span><span>' + escapeHtml(b) + '</span></li>'; }).join("");
      let left = "";
      if (bullets && layout !== "cards" && layout !== "steps" && layout !== "quote") {
        left += '<ul class="bullets">' + bullets + '</ul>';
      }
      if (s.callout && s.callout.text) {
        const tone = s.callout.tone === "warning" ? "warn" : s.callout.tone === "success" ? "ok" : s.callout.tone === "tip" ? "tip" : "";
        left += '<div class="callout ' + tone + '"><div class="lbl">' + escapeHtml(s.callout.label || "Info") + '</div>' + escapeHtml(s.callout.text) + '</div>';
      }
      if (s.quote && s.quote.text) {
        left += '<div class="quote"><p>“' + escapeHtml(s.quote.text) + '”</p>' + (s.quote.attribution ? '<footer>— ' + escapeHtml(s.quote.attribution) + '</footer>' : '') + '</div>';
      }
      if (s.cards && s.cards.length) {
        left += '<div class="cards">' + s.cards.map(function(c){
          return '<div class="card"><div class="ico">' + iconGlyph(c.icon) + '</div><h3>' + escapeHtml(c.title || "") + '</h3><p>' + escapeHtml(c.text || "") + '</p></div>';
        }).join("") + '</div>';
      }
      if (s.steps && s.steps.length) {
        left += '<div class="steps">' + s.steps.map(function(st, i){
          return '<div class="step"><div class="num">' + (i + 1) + '</div><div><h3>' + escapeHtml(st.title || "") + '</h3>' + (st.text ? '<p>' + escapeHtml(st.text) + '</p>' : '') + '</div></div>';
        }).join("") + '</div>';
      }
      let right = "";
      if (s.chart && s.chart.data && s.chart.data.length) {
        right += (s.chart.type === "pie" || s.chart.type === "donut") ? renderPie(s.chart) : renderBars(s.chart);
      }
      if (s.visual) {
        right += '<div class="visual"><div class="big">' + iconGlyph(s.visual.icon) + '</div><strong>' + escapeHtml(s.visual.caption || "Visual focus") + '</strong><div style="margin-top:4px;font-size:11px;color:#94a3b8">Illustration panel</div></div>';
      }
      const useSplit = layout === "split" || (layout === "chart" && left && right) || (right && left);
      slideView.innerHTML =
        '<div class="eyebrow">Training Presentation</div>' +
        "<h2>" + escapeHtml(s.title || "") + "</h2>" +
        (s.subtitle ? '<p class="subtitle">' + escapeHtml(s.subtitle) + '</p>' : '') +
        '<div class="grid' + (useSplit ? ' split' : '') + '">' +
          (left ? '<div>' + left + '</div>' : '') +
          (right ? '<div>' + right + '</div>' : (!left ? '<div></div>' : '')) +
        '</div>' +
        (s.notes ? '<p class="notes"><strong>Trainer note:</strong> ' + escapeHtml(s.notes) + '</p>' : '');
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
