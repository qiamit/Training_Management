/** Platform brand — Quality International Compliance & Training Pvt. Ltd. */

export const BRAND = {
  /** Full legal company name */
  legalName:
    "Quality International Compliance & Training Private Limited",
  /** Compact UI label (nav, lockups) */
  shortName: "Quality International",
  /** Abbreviation for marks / favicon text */
  initials: "QI",
  /** Trading / domain brand */
  tradingAs: "QICTPL",
  tagline: "Compliance & Training",
  website: "https://www.qictpl.com",
  websiteLabel: "www.qictpl.com",
  email: "qictpl@qictpl.com",
  phones: ["9041063388", "9711217494"] as const,
  phoneDisplay: "9041063388 · 9711217494",
  /** Office map pin (lat, lng) */
  location: {
    lat: 21.38454752589363,
    lng: 81.66181150966041,
  },
  addressLines: [
    "Plot No 7A, Avinash Logistic Park, SKS Road",
    "Siltara Industrial Area, Phase - II",
    "Raipur, Chhattisgarh 493221, India",
  ] as const,
  addressDisplay:
    "Plot No 7A, Avinash Logistic Park, SKS Road, Siltara Industrial Area, Phase - II, Raipur, Chhattisgarh 493221, India",
  footerLine:
    "Committed to quality excellence in training and competence.",
} as const;

export function brandMapsUrl() {
  const { lat, lng } = BRAND.location;
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export function brandPhoneTel(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("91") ? `+${digits}` : `+91${digits}`;
}
