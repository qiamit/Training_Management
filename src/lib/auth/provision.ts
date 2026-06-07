import {
  getOrCreateOrganizationId,
  upsertUserProfile,
  type UserProfileDoc,
} from "@/lib/firebase/db";

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
  const orgId = await getOrCreateOrganizationId({
    portal,
    email,
    organizationName: profile?.organizationName,
  });

  const row: Omit<UserProfileDoc, "auth_user_id"> = {
    org_id: orgId,
    full_name: fullName?.trim() || null,
    role,
    is_active: true,
    designation: profile?.designation || null,
    mobile: profile?.mobile || null,
    city: profile?.city || null,
    country: profile?.country || null,
    occupation: profile?.occupation || null,
    qualification: profile?.qualification || null,
    date_of_birth: profile?.dateOfBirth || null,
  };

  await upsertUserProfile(authUserId, row);
}
