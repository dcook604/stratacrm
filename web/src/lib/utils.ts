import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { LotAssignmentRole, PartyType } from "./api";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-CA", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
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
