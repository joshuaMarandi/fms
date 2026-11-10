/** Company identity used in the app shell and on every document (exports and printouts). */
export type CompanyBrand = {
  id: string;
  name: string;
  /** /api/company-logo/<id>?v=<version>, or null when the company has no logo. */
  logoUrl: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  taxNumber: string | null;
  website: string | null;
};

export const SYSTEM_NAME = "Fleet Management System";

export function brandLines(b: CompanyBrand | null): string[] {
  if (!b) return [];
  const place = [b.address, b.city, b.country].filter(Boolean).join(", ");
  const contact = [b.phone, b.email, b.website].filter(Boolean).join("  |  ");
  return [place, contact, b.taxNumber ? `TIN ${b.taxNumber}` : ""].filter(Boolean);
}

export function logoUrlFor(companyId: string, version: number | null | undefined) {
  return version ? `/api/company-logo/${companyId}?v=${version}` : null;
}
