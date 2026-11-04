import { fmtDate, fmtDatetimeFull } from "./dates";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { LotAssignmentRole, PartyType } from "./api";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// One set of date rules lives in lib/dates.ts; these names are kept for existing imports.
export const formatDate = fmtDate;
export const formatDateTime = fmtDatetimeFull;

/** Display label for a lot. strata_lot_number === 0 is the synthetic Common Area lot. */
export function lotLabel(lot: { strata_lot_number: number; unit_number?: string | null }): string {
  if (lot.strata_lot_number === 0) return "Common Area";
  return `SL${lot.strata_lot_number}${lot.unit_number ? ` Unit ${lot.unit_number}` : ""}`;
}

export const ROLE_LABELS: Record<LotAssignmentRole, string> = {
  owner_occupant: "Owner-Occupant",
  owner_absentee: "Owner (Absentee)",
  tenant: "Tenant",
  emergency_contact: "Emergency Contact",
  key_holder: "Key Holder",
  agent: "Agent",
  property_manager_of_record: "Property Manager",
};

export const PARTY_TYPE_LABELS: Record<PartyType, string> = {
  individual: "Individual",
  corporation: "Corporation",
};

export function roleBadgeClass(role: LotAssignmentRole): string {
  switch (role) {
    case "owner_occupant":
    case "owner_absentee":
      return "badge-blue";
    case "tenant":
      return "badge-green";
    case "property_manager_of_record":
      return "badge-amber";
    default:
      return "badge-slate";
  }
}
