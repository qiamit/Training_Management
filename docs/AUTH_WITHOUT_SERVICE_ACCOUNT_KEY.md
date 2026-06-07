# Service account key blocked? (Org policy)

If Firebase Console shows:

> **Key creation is not allowed on this service account**

your Google Workspace / Cloud organization has disabled downloading JSON keys. That is common and **you do not need a key** for this project.

## Option 1 — Application Default Credentials (use real Firebase project)

Use your **Google user account** (the one that owns the Firebase project) instead of a JSON key.

### Steps (Windows PowerShell)

1. Install [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) if needed (`gcloud --version` should work).

2. Log in and set the project:

```powershell
gcloud auth login
gcloud config set project qi-training-management
npm run auth:adc
```

`npm run auth:adc` runs:

```text
gcloud auth application-default login --project=qi-training-management
```

A browser opens — sign in with the same Google account that has access to Firebase project **qi-training-management**.

3. In `.env.local`, **do not set** `FIREBASE_SERVICE_ACCOUNT_JSON` (leave it empty or remove the line).

4. Start the app:

```powershell
npm run dev
```

### Required IAM (if login still fails)

Your Google user needs roles on project `qi-training-management`, for example:

- **Owner** or **Editor**, or
- **Firebase Admin** + **Cloud Datastore User**

Ask your IT admin to grant these in [Google Cloud IAM](https://console.cloud.google.com/iam-admin/iam?project=qi-training-management).

### Production (App Hosting)

On **Firebase App Hosting**, the Admin SDK uses the platform service identity automatically — **no JSON key** in production either.

---

## Option 2 — Firebase Emulator Suite (fully local, no cloud)

1. In `.env.local` add:

```env
USE_FIREBASE_EMULATORS=true
```

2. Terminal 1 — start emulators:

```powershell
npm run emulators
```

3. Terminal 2 — start Next.js:

```powershell
npm run dev
```

4. Open Emulator UI: http://localhost:4000 — create test users in the Auth emulator.

Emulators do not send real email; use the Emulator UI to verify users.

---

## Option 3 — Ask IT to allow keys (usually not needed)

Only if you must use CI without Workload Identity: ask admin to allow key creation for this project or use [Workload Identity Federation](https://cloud.google.com/iam/docs/workload-identity-federation) instead of JSON keys.

---

## Quick check

After `npm run auth:adc`, verify credentials exist:

```powershell
gcloud auth application-default print-access-token
```

If that prints a token, the app can use Admin SDK without a service account JSON file.
