import { type IncidentStatus } from "../../lib/api";


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const STATUS_LABELS: Record<IncidentStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
  pending_assignment: "Pending Assignment",
};


export const STATUS_COLOURS: Record<IncidentStatus, string> = {
  open: "badge-amber",
  in_progress: "badge-blue",
  resolved: "badge-green",
  closed: "badge-slate",
  pending_assignment: "badge-red",
};


// Select element colour classes per status
export const STATUS_SELECT_CLS: Record<IncidentStatus, string> = {
  open:               "bg-amber-50  text-amber-800  border-amber-300  focus:ring-amber-400",
  in_progress:        "bg-blue-50   text-blue-800   border-blue-300   focus:ring-blue-400",
  resolved:           "bg-green-50  text-green-800  border-green-300  focus:ring-green-400",
  closed:             "bg-slate-100 text-slate-600  border-slate-300  focus:ring-slate-400",
  pending_assignment: "bg-red-50    text-red-800    border-red-300    focus:ring-red-400",
};


export const COMMON_CATEGORIES = [
  "Water Damage", "Elevator", "Parkade", "Common Area Damage",
  "Security", "Fire Safety", "Garbage / Recycling", "Amenity Room",
  "Lobby / Entrance", "Roof / Exterior", "Suite Damage", "Noise",
  "Other (custom)…",
];


export function isCustomCategory(cat: string) {
  return !!cat && !COMMON_CATEGORIES.slice(0, -1).includes(cat);
}
