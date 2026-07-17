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
  action?: "delete" | "updatePassword";
  userId?: string;
  password?: string;
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
        { error: "Only Quality International staff can manage trainers." },
        403,
      );
    }

    const body = (await req.json()) as Body;
    const userId = body.userId?.trim() ?? "";
    const action = body.action === "updatePassword" ? "updatePassword" : "delete";

    if (!userId) {
      return json({ error: "User ID is required." }, 400);
    }

    if (userId === user.id) {
      return json({ error: "You cannot manage your own account here." }, 400);
    }

    const { data: target } = await admin
      .from("profiles")
      .select("id, role")
      .eq("id", userId)
      .maybeSingle();

    if (!target || !["trainer", "employee"].includes(target.role)) {
      return json({ error: "Trainer / QI Staff profile not found." }, 404);
    }

    if (action === "updatePassword") {
      const password = body.password ?? "";
      if (password.length < 8) {
        return json({ error: "Password must be at least 8 characters." }, 400);
      }
      const { error: updateError } = await admin.auth.admin.updateUserById(
        userId,
        { password },
      );
      if (updateError) {
        return json({ error: updateError.message }, 400);
      }
      return json({ ok: true });
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      return json({ error: deleteError.message }, 400);
    }

    return json({ ok: true });
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
