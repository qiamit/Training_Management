import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

type CreateTrainerBody = {
  fullName?: string;
  email?: string;
  password?: string;
  mobile?: string;
  designation?: string;
  qualification?: string;
  education?: string;
  experience?: string;
  skills?: string;
  photoUrl?: string;
  city?: string;
  state?: string;
  country?: string;
  pinCode?: string;
  address?: string;
  staffRole?: "trainer" | "employee";
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
    if (!authHeader) {
      return json({ error: "Missing authorization" }, 401);
    }

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
    if (userError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

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
        { error: "Only Quality International staff can create trainers." },
        403,
      );
    }

    const body = (await req.json()) as CreateTrainerBody;
    const fullName = body.fullName?.trim() ?? "";
    const email = body.email?.trim().toLowerCase() ?? "";
    const password = body.password ?? "";
    const staffRole =
      body.staffRole === "employee" ? "employee" : "trainer";
    const defaultDesignation =
      staffRole === "employee" ? "QI Staff" : "Trainer";

    if (!fullName) {
      return json({ error: "Full name is required." }, 400);
    }
    if (!email || !password) {
      return json({ error: "User ID (email) and password are required." }, 400);
    }
    if (password.length < 8) {
      return json({ error: "Password must be at least 8 characters." }, 400);
    }

    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          portal: "quality-international",
          full_name: fullName,
          mobile: body.mobile?.trim() ?? "",
          designation: body.designation?.trim() || defaultDesignation,
          qualification: body.qualification?.trim() ?? "",
          education: body.education?.trim() ?? "",
          experience: body.experience?.trim() ?? "",
          skills: body.skills?.trim() ?? "",
          photo_url: body.photoUrl?.trim() ?? "",
          city: body.city?.trim() ?? "",
          state: body.state?.trim() ?? "",
          country: body.country?.trim() ?? "",
          pin_code: body.pinCode?.trim() ?? "",
          address: body.address?.trim() ?? "",
          staff_role: staffRole,
        },
      });

    if (createError || !created.user) {
      return json(
        {
          error:
            createError?.message ??
            `Failed to create ${staffRole === "employee" ? "QI staff" : "trainer"} user.`,
        },
        400,
      );
    }

    const { data: platformOrg } = await admin
      .from("organizations")
      .select("id")
      .eq("type", "platform")
      .limit(1)
      .maybeSingle();

    const { error: updateError } = await admin
      .from("profiles")
      .update({
        full_name: fullName,
        role: staffRole,
        approval_status: "approved",
        is_active: true,
        org_id: platformOrg?.id ?? null,
        mobile: body.mobile?.trim() || null,
        designation: body.designation?.trim() || defaultDesignation,
        qualification: body.qualification?.trim() || null,
        education: body.education?.trim() || null,
        experience: body.experience?.trim() || null,
        skills: body.skills?.trim() || null,
        photo_url: body.photoUrl?.trim() || null,
        city: body.city?.trim() || null,
        state: body.state?.trim() || null,
        country: body.country?.trim() || null,
        pin_code: body.pinCode?.trim() || null,
        address: body.address?.trim() || null,
        email,
      })
      .eq("id", created.user.id);

    if (updateError) {
      return json({ error: updateError.message }, 500);
    }

    return json({
      ok: true,
      userId: created.user.id,
      email,
      role: staffRole,
    });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      500,
    );
  }
});

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
