import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type CreateOrgBody = {
  organizationName?: string;
  industry?: string;
  employeeCount?: string;
  city?: string;
  state?: string;
  country?: string;
  address?: string;
  pinCode?: string;
  gstNumber?: string;
  contactPersonName?: string;
  contactEmail?: string;
  contactPhone?: string;
  adminFullName?: string;
  adminEmail?: string;
  adminPassword?: string;
  adminDesignation?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
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
        { error: "Only Quality International staff can create organizations." },
        403,
      );
    }

    const body = (await req.json()) as CreateOrgBody;
    const organizationName = body.organizationName?.trim() ?? "";
    const adminEmail = body.adminEmail?.trim().toLowerCase() ?? "";
    const adminPassword = body.adminPassword ?? "";
    const adminFullName = body.adminFullName?.trim() ?? "";

    if (!organizationName) {
      return json({ error: "Organization name is required." }, 400);
    }
    if (!adminEmail || !adminPassword) {
      return json({ error: "Admin User ID (email) and password are required." }, 400);
    }
    if (adminPassword.length < 8) {
      return json({ error: "Password must be at least 8 characters." }, 400);
    }
    if (!adminFullName) {
      return json({ error: "Admin full name is required." }, 400);
    }

    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: {
          portal: "organization",
          full_name: adminFullName,
          organization_name: organizationName,
          industry: body.industry?.trim() ?? "",
          employee_count: body.employeeCount?.trim() ?? "",
          city: body.city?.trim() ?? "",
          country: body.country?.trim() ?? "",
          state: body.state?.trim() ?? "",
          address: body.address?.trim() ?? "",
          pin_code: body.pinCode?.trim() ?? "",
          gst_number: body.gstNumber?.trim() ?? "",
          mobile: body.contactPhone?.trim() ?? "",
          designation: body.adminDesignation?.trim() ?? "",
        },
      });

    if (createError || !created.user) {
      return json(
        { error: createError?.message ?? "Failed to create admin user." },
        400,
      );
    }

    const { data: newProfile } = await admin
      .from("profiles")
      .select("org_id")
      .eq("id", created.user.id)
      .maybeSingle();

    if (newProfile?.org_id) {
      await admin
        .from("organizations")
        .update({
          gst_number: body.gstNumber?.trim() || null,
          address: body.address?.trim() || null,
          pin_code: body.pinCode?.trim() || null,
          state: body.state?.trim() || null,
          contact_email:
            body.contactEmail?.trim() || adminEmail,
          contact_phone: body.contactPhone?.trim() || null,
          contact_person_name:
            body.contactPersonName?.trim() || adminFullName,
        })
        .eq("id", newProfile.org_id);
    }

    return json({
      ok: true,
      orgId: newProfile?.org_id ?? null,
      userId: created.user.id,
      adminEmail,
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
