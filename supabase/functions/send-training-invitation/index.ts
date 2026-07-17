import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

type Body = {
  sessionId?: string;
  trainingRequestId?: string;
  participantIds?: string[];
  programmeTitle?: string;
  meetingPlatform?: string;
  meetingLink?: string;
  meetingPassword?: string;
  startsAt?: string;
  trainerName?: string;
  emailSubject?: string;
  emailHtmlTemplate?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    const requestedHeaders = req.headers.get("Access-Control-Request-Headers");
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders,
        ...(requestedHeaders
          ? { "Access-Control-Allow-Headers": requestedHeaders }
          : {}),
      },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail =
      Deno.env.get("INVITE_FROM_EMAIL") || "onboarding@resend.dev";
    const whatsappToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
    const whatsappPhoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");

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

    const allowed = ["super_admin", "trainer", "employee"];
    if (
      !profile ||
      profile.approval_status !== "approved" ||
      profile.is_active !== true ||
      !allowed.includes(profile.role)
    ) {
      return json({ error: "Forbidden" }, 403);
    }

    const body = (await req.json()) as Body;
    const participantIds = body.participantIds ?? [];
    if (!participantIds.length) {
      return json({ error: "No participants selected." }, 400);
    }

    const { data: people } = await admin
      .from("profiles")
      .select("id, full_name, email, mobile")
      .in("id", participantIds);

    const platformLabel = platformName(body.meetingPlatform || "other");
    const when = body.startsAt
      ? new Date(body.startsAt).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      })
      : "TBD";
    const title = body.programmeTitle || "Training Session";
    const link = body.meetingLink?.trim() || "";
    const password = body.meetingPassword?.trim() || "";
    const trainer = body.trainerName || "Trainer";

    let emailsSent = 0;
    let whatsappSent = 0;
    let appNotificationsCreated = 0;
    const failures: string[] = [];
    const whatsappLinks: string[] = [];

    const notificationRows = (people ?? []).map((person) => ({
      user_id: person.id,
      title: `Training Invitation: ${title}`,
      body: buildPlainText({
        name: person.full_name || "Trainee",
        title,
        when,
        platformLabel,
        trainer,
        link,
        password,
      }),
      link: link || null,
      kind: "training_invitation",
      metadata: {
        session_id: body.sessionId ?? null,
        training_request_id: body.trainingRequestId ?? null,
        programme_title: title,
        meeting_platform: body.meetingPlatform ?? null,
        meeting_password: password || null,
        starts_at: body.startsAt ?? null,
      },
    }));

    if (notificationRows.length) {
      const { error: notifError, data: inserted } = await admin
        .from("app_notifications")
        .insert(notificationRows)
        .select("id");
      if (notifError) {
        failures.push(`App notifications: ${notifError.message}`);
      } else {
        appNotificationsCreated = inserted?.length ?? notificationRows.length;
      }
    }

    for (const person of people ?? []) {
      const plain = buildPlainText({
        name: person.full_name || "Trainee",
        title,
        when,
        platformLabel,
        trainer,
        link,
        password,
      });

      if (resendKey) {
        if (!person.email) {
          failures.push(`${person.full_name || person.id}: missing email`);
        } else {
          const personName = person.full_name || "Trainee";
          const html = body.emailHtmlTemplate?.trim()
            ? body.emailHtmlTemplate.replaceAll("{{name}}", personName)
            : buildEmailHtml({
              name: personName,
              title,
              when,
              platformLabel,
              trainer,
              link,
              password,
            });
          const subject = body.emailSubject?.trim() ||
            `Training Invitation: ${title}`;
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${resendKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: fromEmail,
              to: [person.email],
              subject,
              html,
            }),
          });
          if (!res.ok) {
            const errText = await res.text();
            failures.push(`${person.email}: ${errText.slice(0, 120)}`);
          } else {
            emailsSent += 1;
          }
        }
      }

      const mobileDigits = normalizeMobile(person.mobile);
      if (mobileDigits) {
        const waLink = `https://wa.me/${mobileDigits}?text=${
          encodeURIComponent(plain)
        }`;
        whatsappLinks.push(waLink);

        if (whatsappToken && whatsappPhoneId) {
          const waRes = await fetch(
            `https://graph.facebook.com/v19.0/${whatsappPhoneId}/messages`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${whatsappToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                messaging_product: "whatsapp",
                to: mobileDigits,
                type: "text",
                text: { body: plain.slice(0, 4000) },
              }),
            },
          );
          if (!waRes.ok) {
            const errText = await waRes.text();
            failures.push(
              `WhatsApp ${mobileDigits}: ${errText.slice(0, 120)}`,
            );
          } else {
            whatsappSent += 1;
          }
        }
      } else {
        failures.push(
          `${person.full_name || person.id}: missing mobile for WhatsApp`,
        );
      }
    }

    return json({
      ok: true,
      emailsSent,
      whatsappSent,
      appNotificationsCreated,
      emailConfigured: Boolean(resendKey),
      whatsappConfigured: Boolean(whatsappToken && whatsappPhoneId),
      whatsappLinks,
      failures,
      participantCount: participantIds.length,
    });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      500,
    );
  }
});

function platformName(value: string) {
  switch (value) {
    case "zoom":
      return "Zoom Meeting";
    case "google_meet":
      return "Google Meet";
    case "webex":
      return "Webex";
    case "teams":
      return "Microsoft Teams";
    default:
      return "Online Meeting";
  }
}

function buildPlainText(args: {
  name: string;
  title: string;
  when: string;
  platformLabel: string;
  trainer: string;
  link: string;
  password?: string;
}) {
  return [
    `Hello ${args.name},`,
    "",
    "You are invited to the following training:",
    `Programme: ${args.title}`,
    `Date & time: ${args.when}`,
    `Platform: ${args.platformLabel}`,
    `Trainer: ${args.trainer}`,
    args.link ? `Join meeting: ${args.link}` : "",
    args.password ? `Meeting password: ${args.password}` : "",
    "",
    "This training is also available in your portal under Assigned Trainings.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function buildEmailHtml(args: {
  name: string;
  title: string;
  when: string;
  platformLabel: string;
  trainer: string;
  link: string;
  password?: string;
}) {
  const password = args.password?.trim() || "";
  return `
    <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#0f172a">
      <h2 style="margin:0 0 12px">Training Invitation</h2>
      <p>Hello ${escapeHtml(args.name)},</p>
      <p>You are invited to the following training:</p>
      <ul>
        <li><strong>Programme:</strong> ${escapeHtml(args.title)}</li>
        <li><strong>Date &amp; time:</strong> ${escapeHtml(args.when)}</li>
        <li><strong>Platform:</strong> ${escapeHtml(args.platformLabel)}</li>
        <li><strong>Trainer:</strong> ${escapeHtml(args.trainer)}</li>
        ${
    password
      ? `<li><strong>Meeting password:</strong> ${escapeHtml(password)}</li>`
      : ""
  }
      </ul>
      ${
    args.link
      ? `<p><a href="${
        escapeHtml(args.link)
      }" style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 14px;border-radius:8px;text-decoration:none;font-weight:600">Join Meeting</a></p><p style="font-size:12px;color:#64748b">Or open: ${
        escapeHtml(args.link)
      }</p>`
      : ""
  }
      <p style="margin-top:18px;font-size:13px;color:#64748b">
        This training is also available in your portal under <strong>Assigned Trainings</strong>.
      </p>
    </div>
  `;
}

function normalizeMobile(mobile: string | null | undefined) {
  if (!mobile) return "";
  let digits = mobile.replace(/\D/g, "");
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.length < 10) return "";
  return digits;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
