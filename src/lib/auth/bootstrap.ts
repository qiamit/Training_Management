/** Emails that receive super_admin on Quality International login (comma-separated). */
export function getBootstrapSuperAdminEmails(): string[] {
  const raw =
    process.env.BOOTSTRAP_SUPER_ADMIN_EMAILS ?? "qicoding1@gmail.com";
  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isBootstrapSuperAdminEmail(email: string) {
  return getBootstrapSuperAdminEmails().includes(email.trim().toLowerCase());
}
