import {
  FieldValue,
  type Timestamp,
} from "firebase-admin/firestore";

import { getAdminDb } from "./admin";

export type OrganizationDoc = {
  name: string;
  iso_accreditations: string[];
  created_at?: Timestamp | string | null;
};

export type UserProfileDoc = {
  auth_user_id: string;
  org_id: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
  designation?: string | null;
  mobile?: string | null;
  city?: string | null;
  country?: string | null;
  occupation?: string | null;
  qualification?: string | null;
  date_of_birth?: string | null;
};

export type UserSignupMetaDoc = {
  full_name?: string;
  requested_portal?: string;
  designation?: string;
  mobile?: string;
  organization_name?: string;
  industry?: string;
  employee_count?: string;
  city?: string;
  country?: string;
  occupation?: string;
  qualification?: string;
  date_of_birth?: string;
};

const orgs = () => getAdminDb().collection("organizations");
const users = () => getAdminDb().collection("users");
const signupMeta = () => getAdminDb().collection("user_signup_meta");

export async function findOrganizationByName(name: string) {
  const snap = await orgs().where("name", "==", name).limit(1).get();
  if (snap.empty) {
    return null;
  }
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() } as OrganizationDoc & { id: string };
}

export async function createOrganization(data: {
  name: string;
  iso_accreditations?: string[];
}) {
  const ref = orgs().doc();
  await ref.set({
    name: data.name,
    iso_accreditations: data.iso_accreditations ?? [],
    created_at: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

export async function getOrCreateOrganizationId({
  portal,
  email,
  organizationName,
}: {
  portal: "quality-international" | "organization" | "individual";
  email: string;
  organizationName?: string;
}) {
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

  const existing = await findOrganizationByName(resolvedName);
  if (existing) {
    return existing.id;
  }

  return createOrganization({
    name: resolvedName,
    iso_accreditations: [],
  });
}

export async function upsertUserProfile(
  authUserId: string,
  row: Omit<UserProfileDoc, "auth_user_id">,
) {
  await users()
    .doc(authUserId)
    .set(
      {
        auth_user_id: authUserId,
        ...row,
      },
      { merge: true },
    );
}

export async function getUserProfileByAuthId(authUserId: string) {
  const doc = await users().doc(authUserId).get();
  if (!doc.exists) {
    return null;
  }
  return doc.data() as UserProfileDoc;
}

export async function getOrganizationById(orgId: string) {
  const doc = await orgs().doc(orgId).get();
  if (!doc.exists) {
    return null;
  }
  return { id: doc.id, ...(doc.data() as OrganizationDoc) };
}

export async function listOrganizations() {
  const snap = await orgs().orderBy("name").get();
  return snap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as OrganizationDoc),
  }));
}

export async function countUsersByOrgIds(orgIds: string[]) {
  const counts: Record<string, number> = {};
  if (orgIds.length === 0) {
    return counts;
  }

  const snap = await users().where("org_id", "in", orgIds.slice(0, 30)).get();
  for (const doc of snap.docs) {
    const orgId = String(doc.data().org_id ?? "");
    if (!orgId) continue;
    counts[orgId] = (counts[orgId] ?? 0) + 1;
  }
  return counts;
}

export async function countOrganizationsExcluding(name: string) {
  const snap = await orgs().get();
  return snap.docs.filter((d) => d.data().name !== name).length;
}

export async function countUsersByRoles(roles: string[]) {
  const snap = await users().get();
  return snap.docs.filter((d) => roles.includes(String(d.data().role ?? "")))
    .length;
}

export async function listUsersByOrgId(orgId: string) {
  const snap = await users().where("org_id", "==", orgId).get();
  return snap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as UserProfileDoc),
  }));
}

export async function listUsersByRoles(roles: string[]) {
  const snap = await users().get();
  return snap.docs
    .filter((d) => roles.includes(String(d.data().role ?? "")))
    .map((doc) => ({
      id: doc.id,
      ...(doc.data() as UserProfileDoc),
    }));
}

export async function saveSignupMeta(
  authUserId: string,
  meta: UserSignupMetaDoc,
) {
  await signupMeta().doc(authUserId).set(meta, { merge: true });
}

export async function getUserProfileMeta(
  authUserId: string,
): Promise<Record<string, string | undefined>> {
  const doc = await signupMeta().doc(authUserId).get();
  if (!doc.exists) {
    return {};
  }
  const data = doc.data() as UserSignupMetaDoc;
  return {
    full_name: data.full_name,
    requested_portal: data.requested_portal,
    designation: data.designation,
    mobile: data.mobile,
    organization_name: data.organization_name,
    industry: data.industry,
    employee_count: data.employee_count,
    city: data.city,
    country: data.country,
    occupation: data.occupation,
    qualification: data.qualification,
    date_of_birth: data.date_of_birth,
  };
}

export async function getSignupMeta(authUserId: string) {
  const doc = await signupMeta().doc(authUserId).get();
  return doc.exists ? (doc.data() as UserSignupMetaDoc) : null;
}
