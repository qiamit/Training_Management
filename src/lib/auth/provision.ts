import { createAdminClient } from "@/utils/supabase/admin";

type ProvisionRole =
  | "super_admin"
  | "tenant_admin"
  | "quality_manager"
  | "individual"
  | "employee"
  | "trainee";

type ProvisionPortal = "quality-international" | "organization" | "individual";

export type ExtendedProfile = {
  designation?: string;
  mobile?: string;
  organizationName?: string;
  industry?: string;
  employeeCount?: string;
  city?: string;
  country?: string;
  occupation?: string;
  qualification?: string;
  dateOfBirth?: string;
};

async function getOrCreateOrganizationId({
  portal,
  email,
  organizationName,
}: {
  portal: ProvisionPortal;
  email: string;
  organizationName?: string;
}) {
  const admin = createAdminClient();
  const normalizedEmail = email.toLowerCase().trim();
  const domain = normalizedEmail.includes("@")
    ? normalizedEmail.split("@")[1]
    : "organization.local";

  const resolvedName =
    portal === "quality-international"
      ? "Quality International"
      : portal === "individual"
        ? "Independent Learners"
        : (organizationName?.trim() || `Organization - ${domain}`);

  const { data: existingOrganizations, error: fetchError } = await admin
    .from("organizations")
    .select("id")
    .eq("name", resolvedName)
    .limit(1);

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  const existingOrgId = existingOrganizations?.[0]?.id as string | undefined;
  if (existingOrgId) {
    return existingOrgId;
  }

  const { data: insertedOrganization, error: insertError } = await admin
    .from("organizations")
    .insert({
      name: resolvedName,
      iso_accreditations: [],
    })
    .select("id")
    .single();

  if (insertError || !insertedOrganization?.id) {
    throw new Error(insertError?.message ?? "Unable to create organization.");
  }

  return insertedOrganization.id as string;
}

export async function upsertPublicUserProfile({
  authUserId,
  email,
  fullName,
  role,
  portal,
  profile,
}: {
  authUserId: string;
  email: string;
  fullName?: string;
  role: ProvisionRole;
  portal: ProvisionPortal;
  profile?: ExtendedProfile;
}) {
  const admin = createAdminClient();
  const orgId = await getOrCreateOrganizationId({
    portal,
    email,
    organizationName: profile?.organizationName,
  });

  // Best-effort upsert: include extended profile columns when present, but
  // gracefully fall back to the minimum-required columns if the schema does
  // not yet have these fields. Keeps signup robust during phased rollout.
  const baseRow = {
    auth_user_id: authUserId,
    org_id: orgId,
    full_name: fullName?.trim() || null,
    role,
    is_active: true,
  } as const;

  const extendedRow = {
    ...baseRow,
    designation: profile?.designation || null,
    mobile: profile?.mobile || null,
    city: profile?.city || null,
    country: profile?.country || null,
    occupation: profile?.occupation || null,
    qualification: profile?.qualification || null,
    date_of_birth: profile?.dateOfBirth || null,
  } as const;

  const { error: extendedError } = await admin
    .from("users")
    .upsert(extendedRow, { onConflict: "auth_user_id" });

  if (!extendedError) {
    return;
  }

  const { error } = await admin
    .from("users")
    .upsert(baseRow, { onConflict: "auth_user_id" });

  if (error) {
    throw new Error(error.message);
  }
}
