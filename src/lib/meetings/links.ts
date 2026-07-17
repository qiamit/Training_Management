/** Helpers for Zoom / Meet / Webex / Teams meeting links. */

export function externalMeetingHref(
  raw: string | null | undefined,
): string | null {
  const value = raw?.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return value;
  // Reject clearly invalid stubs like "htttp//" or random text without a domain.
  if (!/^[a-z0-9.-]+\.[a-z]{2,}([/:].*)?$/i.test(value)) return null;
  return `https://${value}`;
}

export function meetingPlatformLabel(value: string | null | undefined) {
  switch (value) {
    case "zoom":
      return "Zoom Meeting";
    case "google_meet":
      return "Google Meet";
    case "webex":
      return "Webex";
    case "teams":
      return "Microsoft Teams";
    case "other":
      return "Online Meeting";
    default:
      return value || "—";
  }
}
