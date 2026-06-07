/**
 * Grant super_admin custom claims to a Firebase Auth user by email.
 * Usage: node scripts/grant-super-admin.mjs qicoding1@gmail.com
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
if (!projectId) {
  console.error("Missing NEXT_PUBLIC_FIREBASE_PROJECT_ID in .env.local");
  process.exit(1);
}

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
if (serviceAccountJson) {
  const credentials = JSON.parse(serviceAccountJson);
  initializeApp({
    credential: cert({
      projectId: credentials.project_id,
      clientEmail: credentials.client_email,
      privateKey: credentials.private_key.replace(/\\n/g, "\n"),
    }),
    projectId,
  });
} else {
  initializeApp({
    credential: applicationDefault(),
    projectId,
  });
}

const email = (process.argv[2] ?? "qicoding1@gmail.com").trim().toLowerCase();

async function main() {
  const auth = getAuth();
  const user = await auth.getUserByEmail(email);

  await auth.setCustomUserClaims(user.uid, {
    role: "super_admin",
    approval_status: "approved",
  });

  const db = getFirestore();
  const orgSnap = await db
    .collection("organizations")
    .where("name", "==", "Quality International")
    .limit(1)
    .get();

  let orgId;
  if (orgSnap.empty) {
    orgId = db.collection("organizations").doc().id;
    await db.collection("organizations").doc(orgId).set({
      name: "Quality International",
      iso_accreditations: [],
      created_at: FieldValue.serverTimestamp(),
    });
  } else {
    orgId = orgSnap.docs[0].id;
  }

  await db.collection("users").doc(user.uid).set(
    {
      auth_user_id: user.uid,
      org_id: orgId,
      full_name: user.displayName || null,
      role: "super_admin",
      is_active: true,
    },
    { merge: true },
  );

  console.log(`Granted super_admin to ${email} (uid: ${user.uid})`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
