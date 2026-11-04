import { type PaymentStatus as PStatus } from "../../lib/api";

export const STATUS_LABELS: Record<PStatus, string> = {
  pending: "Pending",
  paid: "Paid",
  overdue: "Overdue",
  partially_paid: "Partial",
  cancelled: "Cancelled",
};


export const STATUS_CLASSES: Record<PStatus, string> = {
  pending: "badge badge-blue",
  paid: "badge badge-green",
  overdue: "badge badge-red",
  partially_paid: "badge badge-amber",
  cancelled: "badge badge-slate",
};
