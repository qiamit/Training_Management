# Quality International Training Platform

Next.js App Router training management platform backed by **Firebase** (Authentication, Firestore, Storage, App Hosting).

## Stack

- [Next.js](https://nextjs.org) 16 (App Router)
- [Firebase Authentication](https://firebase.google.com/docs/auth) (email/password, custom claims for roles)
- [Cloud Firestore](https://firebase.google.com/docs/firestore) (organizations, user profiles)
- [Cloud Storage](https://firebase.google.com/docs/storage) (certificates, org assets)
- [Firebase App Hosting](https://firebase.google.com/docs/app-hosting) (production deploy)

## Local setup

1. Copy environment variables:

```bash
cp .env.example .env.local
```

2. **Admin SDK for local dev** (login sessions, approvals, Firestore):

   - **If you can download a service account JSON:** set `FIREBASE_SERVICE_ACCOUNT_JSON` in `.env.local`.
   - **If key creation is blocked by org policy** (common): leave that variable empty and run:
     ```bash
     npm run auth:adc
     ```
     Sign in with your Google account that has access to the Firebase project. See [docs/AUTH_WITHOUT_SERVICE_ACCOUNT_KEY.md](docs/AUTH_WITHOUT_SERVICE_ACCOUNT_KEY.md).

3. Enable **Email/Password** sign-in in Firebase Authentication.

4. Install and run:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## GitHub & deploy

Remote repository: [qiamit/Training_Management](https://github.com/qiamit/Training_Management.git)

```bash
npx firebase-tools@latest login
npx firebase-tools@latest use qi-training-management
npx firebase-tools@latest deploy
```

Connect App Hosting to the GitHub repo in the Firebase console for push-to-deploy CI/CD.

## Roles

After sign-in, the app reads `role` and `approval_status` from Firebase Auth **custom claims**:

| Portal | Allowed roles |
|--------|----------------|
| Quality International | `super_admin` |
| Organization | `tenant_admin`, `quality_manager` |
| Individual | `individual`, `employee`, `trainee` |

Quality International signups require super-admin approval via **User Approvals**. Organization and Individual portals are auto-approved on signup.

## Firebase CLI

```bash
npx firebase-tools@latest --version
npx firebase-tools@latest emulators:start   # optional local emulators
```
