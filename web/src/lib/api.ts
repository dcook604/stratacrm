/**
 * Typed API client for the Spectrum 4 CRM backend.
 * All calls go to /api/... — proxied to FastAPI in dev, Nginx-proxied in prod.
 *
 * CSRF protection uses the Double Submit Cookie pattern:
 *   1. Server sets a non-HTTP-only cookie 's4_csrf' on login
 *   2. Client reads the cookie and sends it as X-CSRF-Token header
 *   3. Server compares cookie value vs header value
 *
 * This survives hard page reloads because the cookie persists.
 */

function getCsrfFromCookie(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)s4_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function clearCsrfToken() {
  document.cookie = "s4_csrf=; Path=/; Max-Age=0; SameSite=Lax";
}

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const csrfToken = getCsrfFromCookie();
  if (csrfToken && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    headers["X-CSRF-Token"] = csrfToken;
  }

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    credentials: "same-origin",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const json = await res.json();
      detail = json.detail ?? JSON.stringify(json);
    } catch {}
    if (res.status === 401) {
      clearCsrfToken();
      if (detail === `HTTP ${res.status}` || detail === "Not authenticated") {
        detail = "Session expired";
      }
      // Redirect to login when the session expires mid-session
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login?expired=1";
      }
    }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T = void>(path: string) => request<T>("DELETE", path),
};

export default api;

// ---------------------------------------------------------------------------
// Domain types (mirrors backend Pydantic schemas)
// ---------------------------------------------------------------------------

export type UserRole = "admin" | "council_member" | "property_manager" | "auditor";
export type PartyType = "individual" | "corporation";
export type ContactMethodType = "home_phone" | "cell_phone" | "work_phone" | "email";
export type LotAssignmentRole =
  | "owner_occupant" | "owner_absentee" | "tenant"
  | "emergency_contact" | "key_holder" | "agent" | "property_manager_of_record";

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  password_reset_required: boolean;
  last_login_at: string | null;
  created_at: string | null;
}

export interface LoginResponse {
  user: User;
  csrf_token: string;
}

export interface MeResponse {
  user: User;
  csrf_token: string;
}

export interface ContactMethod {
  id: number;
  method_type: ContactMethodType;
  value: string;
  is_primary: boolean;
  verified_at: string | null;
}

export interface LotSummary {
  id: number;
  strata_lot_number: number;
  unit_number: string | null;
}

export interface Assignment {
  id: number;
  lot: LotSummary;
  role: LotAssignmentRole;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  form_k_filed_date: string | null;
}

export interface Party {
  id: number;
  party_type: PartyType;
  full_name: string;
  is_property_manager: boolean;
  parent_party_id: number | null;
  mailing_address_line1: string | null;
  mailing_address_line2: string | null;
  mailing_city: string | null;
  mailing_province: string | null;
  mailing_postal_code: string | null;
  mailing_country: string | null;
  notes: string | null;
  created_at: string;
  contact_methods: ContactMethod[];
  current_assignments: Assignment[];
}

export interface PartyListItem {
  id: number;
  party_type: PartyType;
  full_name: string;
  is_property_manager: boolean;
  primary_email: string | null;
  primary_phone: string | null;
  lot_count: number;
}

export interface PaginatedParties {
  items: PartyListItem[];
  total: number;
  skip: number;
  limit: number;
}

export interface PartyMini {
  id: number;
  full_name: string;
  party_type: PartyType;
}

export interface LotAssignmentDetail {
  id: number;
  party: PartyMini;
  role: LotAssignmentRole;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  form_k_filed_date: string | null;
  notes: string | null;
}

export interface Lot {
  id: number;
  strata_lot_number: number;
  unit_number: string | null;
  square_feet: string | null;
  parking_stalls: string | null;
  storage_lockers: string | null;
  bike_lockers: string | null;
  scooter_lockers: string | null;
  notes: string | null;
  updated_at: string;
  current_assignments: LotAssignmentDetail[];
}

export interface LotListItem {
  id: number;
  strata_lot_number: number;
  unit_number: string | null;
  square_feet: string | null;
  owners: string[];
  tenants: string[];
}

export interface PaginatedLots {
  items: LotListItem[];
  total: number;
  skip: number;
  limit: number;
}

export interface DashboardStats {
  lot_count: number;
  party_count: number;
  open_infractions: number;
  open_incidents: number;
  open_issues: number;
  overdue_notice_infractions: {
    id: number;
    lot_number: number | null;
    unit_number: string | null;
    party_name: string | null;
  }[];
  overdue_issues: {
    id: number;
    title: string;
    due_date: string | null;
    priority: string;
    assignee_email: string | null;
  }[];
  recent_audit: {
    id: number;
    actor_email: string | null;
    action: string;
    entity_type: string;
    entity_id: number | null;
    entity_name: string | null;
    occurred_at: string;
  }[];
}

// ---------------------------------------------------------------------------
// API call helpers
// ---------------------------------------------------------------------------

export const authApi = {
  login: (email: string, password: string) =>
    api.post<LoginResponse>("/auth/login", { email, password }),
  logout: () => api.post<{ detail: string }>("/auth/logout"),
  me: () => api.get<MeResponse>("/auth/me"),
  changePassword: (current_password: string, new_password: string) =>
    api.post("/auth/change-password", { current_password, new_password }),
  forgotPassword: (email: string) =>
    api.post<{ message: string }>("/auth/forgot-password", { email }),
  resetPassword: (token: string, new_password: string) =>
    api.post<{ message: string }>("/auth/reset-password", { token, new_password }),
  // Admin user management
  listUsers: () => api.get<{ items: User[]; total: number }>("/auth/users"),
  getUser: (id: number) => api.get<User>(`/auth/users/${id}`),
  createUser: (body: { email: string; full_name: string; role: string; temporary_password: string }) =>
    api.post<User>("/auth/users", body),
  updateUser: (id: number, body: { email?: string; full_name?: string; role?: string; is_active?: boolean }) =>
    api.put<User>(`/auth/users/${id}`, body),
  adminResetPassword: (id: number, new_password: string) =>
    api.post<{ detail: string }>(`/auth/users/${id}/reset-password`, { new_password }),
  adminAssignTempPassword: (id: number, temporary_password: string) =>
    api.post<{ detail: string }>(`/auth/users/${id}/assign-temp-password`, { temporary_password }),
  sendResetEmail: (id: number) =>
    api.post<{ detail: string }>(`/auth/users/${id}/send-reset-email`, {}),
};

export const lotsApi = {
  list: (params: { skip?: number; limit?: number; search?: string }) => {
    const qs = new URLSearchParams();
    if (params.skip != null) qs.set("skip", String(params.skip));
    if (params.limit != null) qs.set("limit", String(params.limit));
    if (params.search) qs.set("search", params.search);
    return api.get<PaginatedLots>(`/lots?${qs}`);
  },
  get: (id: number) => api.get<Lot>(`/lots/${id}`),
  update: (id: number, body: Partial<Lot>) => api.put<Lot>(`/lots/${id}`, body),
  createAssignment: (lotId: number, body: object) =>
    api.post<LotAssignmentDetail>(`/lots/${lotId}/assignments`, body),
  updateAssignment: (lotId: number, assignmentId: number, body: object) =>
    api.put<LotAssignmentDetail>(`/lots/${lotId}/assignments/${assignmentId}`, body),
  deleteAssignment: (lotId: number, assignmentId: number) =>
    api.delete(`/lots/${lotId}/assignments/${assignmentId}`),
};

export const partiesApi = {
  list: (params: { skip?: number; limit?: number; search?: string }) => {
    const qs = new URLSearchParams();
    if (params.skip != null) qs.set("skip", String(params.skip));
    if (params.limit != null) qs.set("limit", String(params.limit));
    if (params.search) qs.set("search", params.search);
    return api.get<PaginatedParties>(`/parties?${qs}`);
  },
  get: (id: number) => api.get<Party>(`/parties/${id}`),
  create: (body: object) => api.post<Party>("/parties", body),
  update: (id: number, body: object) => api.put<Party>(`/parties/${id}`, body),
  delete: (id: number) => api.delete(`/parties/${id}`),
  addContactMethod: (partyId: number, body: object) =>
    api.post<ContactMethod>(`/parties/${partyId}/contact-methods`, body),
  deleteContactMethod: (partyId: number, cmId: number) =>
    api.delete(`/parties/${partyId}/contact-methods/${cmId}`),
  bulkCreate: (rows: BulkPartyRow[]) =>
    api.post<BulkPartyResult>("/parties/bulk", rows),
};

export interface BulkPartyRow {
  full_name: string;
  party_type?: PartyType;
  is_property_manager?: boolean;
  mailing_address_line1?: string;
  mailing_city?: string;
  mailing_province?: string;
  mailing_postal_code?: string;
  email?: string;
  cell_phone?: string;
  home_phone?: string;
  work_phone?: string;
  notes?: string;
  lot_unit?: string;
  role?: LotAssignmentRole;
}

export interface BulkPartyResult {
  created: number;
  errors: { row: number; name: string; error: string }[];
}

export const dashboardApi = {
  stats: () => api.get<DashboardStats>("/dashboard/stats"),
};

// ---------------------------------------------------------------------------
// Bylaw types
// ---------------------------------------------------------------------------

export type BylawCategory =
  | "noise" | "pets" | "parking" | "common_property" | "rental"
  | "alterations" | "move_in_out" | "smoking" | "nuisance" | "other";

export interface FineSchedule {
  id: number;
  bylaw_id: number;
  occurrence_number: number;
  fine_amount: string;
  continuing_contravention_amount: string | null;
  max_per_week: string | null;
}

export interface BylawListItem {
  id: number;
  bylaw_number: string;
  section: string | null;
  title: string;
  category: BylawCategory;
  active_from: string;
  is_superseded: boolean;
}

export interface Bylaw {
  id: number;
  bylaw_number: string;
  section: string | null;
  title: string;
  full_text: string;
  category: BylawCategory;
  active_from: string;
  superseded_by: number | null;
  fine_schedules: FineSchedule[];
}

// ---------------------------------------------------------------------------
// Infraction types
// ---------------------------------------------------------------------------

export type InfractionStatus =
  | "open" | "notice_sent" | "response_received"
  | "hearing_scheduled" | "fined" | "dismissed" | "appealed";

export type InfractionEventType =
  | "complaint_received" | "notice_sent" | "response_received"
  | "hearing_held" | "decision_made" | "fine_levied" | "payment_received" | "dismissed";

export type DeliveryMethod = "email" | "registered_mail" | "posted";

export interface BylawMini {
  id: number;
  bylaw_number: string;
  section: string | null;
  title: string;
  category: BylawCategory;
}

export interface FineScheduleMini {
  id: number;
  occurrence_number: number;
  fine_amount: string;
  continuing_contravention_amount: string | null;
  max_per_week: string | null;
}

export interface InfractionEvent {
  id: number;
  infraction_id: number;
  event_type: InfractionEventType;
  occurred_at: string;
  actor_email: string | null;
  notes: string | null;
  document_id: number | null;
}

export interface InfractionNotice {
  id: number;
  infraction_id: number;
  document_id: number | null;
  delivery_method: DeliveryMethod;
  delivered_at: string | null;
  created_at: string;
  pdf_url: string | null;
}

export interface InfractionListItem {
  id: number;
  lot: { id: number; strata_lot_number: number; unit_number: string | null };
  primary_party: { id: number; full_name: string };
  bylaw: BylawMini;
  status: InfractionStatus;
  complaint_received_date: string;
  assessed_fine_amount: string | null;
  occurrence_number: number;
  created_at: string;
}

export interface InfractionDetail {
  id: number;
  lot: { id: number; strata_lot_number: number; unit_number: string | null };
  primary_party: { id: number; full_name: string };
  bylaw: BylawMini;
  applicable_fine: FineScheduleMini | null;
  status: InfractionStatus;
  complaint_received_date: string;
  description: string;
  assessed_fine_amount: string | null;
  occurrence_number: number;
  events: InfractionEvent[];
  notices: InfractionNotice[];
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------

export interface BylawBulkItem {
  bylaw_number: string;
  section?: string | null;
  title: string;
  full_text: string;
  category: BylawCategory;
  active_from: string;
  supersede_bylaw_number?: string | null;
}

export interface BylawBulkRequest {
  bylaws: BylawBulkItem[];
  supersede_all_existing?: boolean;
}

export interface BylawBulkResult {
  created: number;
  superseded: number;
  errors: { index: number; bylaw_number: string; error: string }[];
}

export const bylawsApi = {
  list: (params?: { category?: BylawCategory; active_only?: boolean; search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.category) qs.set("category", params.category);
    if (params?.active_only != null) qs.set("active_only", String(params.active_only));
    if (params?.search) qs.set("search", params.search);
    return api.get<BylawListItem[]>(`/bylaws?${qs}`);
  },
  get: (id: number) => api.get<Bylaw>(`/bylaws/${id}`),
  create: (body: object) => api.post<Bylaw>("/bylaws", body),
  update: (id: number, body: object) => api.put<Bylaw>(`/bylaws/${id}`, body),
  upsertFineSchedule: (bylawId: number, body: object) =>
    api.post<FineSchedule>(`/bylaws/${bylawId}/fine-schedules`, body),
  deleteFineSchedule: (bylawId: number, scheduleId: number) =>
    api.delete(`/bylaws/${bylawId}/fine-schedules/${scheduleId}`),
  bulk: (body: BylawBulkRequest) => api.post<BylawBulkResult>("/bylaws/bulk", body),
};

export const infractionsApi = {
  list: (params?: {
    status?: InfractionStatus;
    lot_id?: number;
    bylaw_id?: number;
    open_only?: boolean;
    skip?: number;
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.lot_id != null) qs.set("lot_id", String(params.lot_id));
    if (params?.bylaw_id != null) qs.set("bylaw_id", String(params.bylaw_id));
    if (params?.open_only) qs.set("open_only", "true");
    if (params?.skip != null) qs.set("skip", String(params.skip));
    if (params?.limit != null) qs.set("limit", String(params.limit));
    return api.get<InfractionListItem[]>(`/infractions?${qs}`);
  },
  get: (id: number) => api.get<InfractionDetail>(`/infractions/${id}`),
  create: (body: object) => api.post<InfractionDetail>("/infractions", body),
  update: (id: number, body: object) => api.patch<InfractionDetail>(`/infractions/${id}`, body),
  addEvent: (id: number, body: { event_type: InfractionEventType; notes?: string; occurred_at?: string }) =>
    api.post<InfractionEvent>(`/infractions/${id}/events`, body),
  generateNotice: (id: number, body: { delivery_method: DeliveryMethod; send_email?: boolean }) =>
    api.post<InfractionNotice>(`/infractions/${id}/notices`, body),
};

// ---------------------------------------------------------------------------
// Incident types
// ---------------------------------------------------------------------------

export type IncidentStatus = "open" | "in_progress" | "resolved" | "closed";

export interface IncidentLot {
  id: number;
  strata_lot_number: number;
  unit_number: string | null;
}

export interface Incident {
  id: number;
  reference: string;
  incident_date: string;
  lot: IncidentLot | null;
  common_area_description: string | null;
  category: string;
  description: string;
  reported_by: string | null;
  status: IncidentStatus;
  resolution: string | null;
  created_at: string;
  updated_at: string;
}

export const incidentsApi = {
  list: (params?: {
    status?: IncidentStatus;
    lot_id?: number;
    category?: string;
    open_only?: boolean;
    skip?: number;
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.lot_id != null) qs.set("lot_id", String(params.lot_id));
    if (params?.category) qs.set("category", params.category);
    if (params?.open_only) qs.set("open_only", "true");
    if (params?.skip != null) qs.set("skip", String(params.skip));
    if (params?.limit != null) qs.set("limit", String(params.limit));
    return api.get<Incident[]>(`/incidents?${qs}`);
  },
  get: (id: number) => api.get<Incident>(`/incidents/${id}`),
  create: (body: object) => api.post<Incident>("/incidents", body),
  update: (id: number, body: object) => api.patch<Incident>(`/incidents/${id}`, body),
  delete: (id: number) => api.delete(`/incidents/${id}`),
  sendEmail: (id: number, body: { to: string; message?: string }) =>
    api.post<void>(`/incidents/${id}/send-email`, body),
};

// ---------------------------------------------------------------------------
// Public share types
// ---------------------------------------------------------------------------

export interface SharedDoc {
  id: number;
  original_filename: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  caption: string | null;
  tags: string | null;
  is_processing: boolean;
  media_url: string;
  thumbnail_url: string;
}

export interface SharedIncident {
  id: number;
  reference: string;
  incident_date: string;
  category: string;
  description: string;
  reported_by: string | null;
  status: string;
  resolution: string | null;
  lot: { strata_lot_number: number; unit_number: string | null } | null;
  common_area_description: string | null;
  media: SharedDoc[];
  share_expires_days: number;
}

export const shareApi = {
  getIncident: (token: string) =>
    fetch(`/api/share/incident/${token}`).then(async (r) => {
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.detail ?? "Link is invalid or has expired.");
      }
      return r.json() as Promise<SharedIncident>;
    }),
};

// ---------------------------------------------------------------------------
// Issue types
// ---------------------------------------------------------------------------

export type IssueStatus = "open" | "in_progress" | "resolved" | "closed";
export type IssuePriority = "low" | "medium" | "high" | "urgent";

export interface IssueUser {
  id: number;
  email: string;
  full_name: string;
}

export interface IssueLot {
  id: number;
  strata_lot_number: number;
  unit_number: string | null;
}

export interface IssueIncident {
  id: number;
  category: string;
  incident_date: string;
}

export interface Issue {
  id: number;
  title: string;
  description: string | null;
  assignee: IssueUser | null;
  due_date: string | null;
  priority: IssuePriority;
  status: IssueStatus;
  related_lot: IssueLot | null;
  related_incident: IssueIncident | null;
  source: string;
  reporter_email: string | null;
  reporter_name: string | null;
  created_at: string;
  updated_at: string;
}

export const issuesApi = {
  list: (params?: {
    status?: IssueStatus;
    priority?: IssuePriority;
    assignee_id?: number;
    open_only?: boolean;
    overdue_only?: boolean;
    skip?: number;
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.priority) qs.set("priority", params.priority);
    if (params?.assignee_id != null) qs.set("assignee_id", String(params.assignee_id));
    if (params?.open_only) qs.set("open_only", "true");
    if (params?.overdue_only) qs.set("overdue_only", "true");
    if (params?.skip != null) qs.set("skip", String(params.skip));
    if (params?.limit != null) qs.set("limit", String(params.limit));
    return api.get<Issue[]>(`/issues?${qs}`);
  },
  get: (id: number) => api.get<Issue>(`/issues/${id}`),
  create: (body: object) => api.post<Issue>("/issues", body),
  update: (id: number, body: object) => api.patch<Issue>(`/issues/${id}`, body),
  delete: (id: number) => api.delete(`/issues/${id}`),
};

// ---------------------------------------------------------------------------
// Document types
// ---------------------------------------------------------------------------

export interface Document {
  id: number;
  original_filename: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  linked_entity_type: string | null;
  linked_entity_id: number | null;
  uploaded_at: string;
  download_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  tags: string | null;
  is_processing: boolean;
}

export const documentsApi = {
  list: (entityType: string, entityId: number) =>
    api.get<Document[]>(`/documents?entity_type=${entityType}&entity_id=${entityId}`),
  upload: (
    entityType: string,
    entityId: number,
    file: File,
    caption?: string,
    tags?: string,
    onProgress?: (pct: number) => void,
  ): Promise<Document> => {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append("file", file);
      form.append("entity_type", entityType);
      form.append("entity_id", String(entityId));
      if (caption) form.append("caption", caption);
      if (tags) form.append("tags", tags);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/documents");
      xhr.withCredentials = true;
      const csrf = getCsrfFromCookie();
      if (csrf) xhr.setRequestHeader("X-CSRF-Token", csrf);

      if (onProgress) {
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        });
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          const detail = JSON.parse(xhr.responseText || "{}").detail;
          reject(new Error(detail ?? `Upload failed: HTTP ${xhr.status}`));
        }
      };
      xhr.onerror = () => reject(new Error("Upload failed: network error"));
      xhr.send(form);
    });
  },
  delete: (id: number) => api.delete(`/documents/${id}`),
};

// ---------------------------------------------------------------------------
// Sync API
// ---------------------------------------------------------------------------

export interface ListmonkSyncResult {
  synced: number;
  skipped: number;
  list_id?: number;
  list_name?: string;
  message: string;
}

export const syncApi = {
  listmonk: () => api.post<ListmonkSyncResult>("/sync/listmonk"),
};

// ---------------------------------------------------------------------------
// Audit log types
// ---------------------------------------------------------------------------

export interface AuditLogEntry {
  id: number;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: number | null;
  entity_name: string | null;
  changes: Record<string, unknown> | null;
  occurred_at: string | null;
  ip_address: string | null;
}

export interface AuditLogResponse {
  items: AuditLogEntry[];
  total: number;
  skip: number;
  limit: number;
}

export const auditLogApi = {
  list: (params?: { skip?: number; limit?: number; action?: string; entity_type?: string }) => {
    const qs = new URLSearchParams();
    if (params?.skip != null) qs.set("skip", String(params.skip));
    if (params?.limit != null) qs.set("limit", String(params.limit));
    if (params?.action) qs.set("action", params.action);
    if (params?.entity_type) qs.set("entity_type", params.entity_type);
    return api.get<AuditLogResponse>(`/audit-log?${qs}`);
  },
};

// ---------------------------------------------------------------------------
// Email ingest types
// ---------------------------------------------------------------------------

export interface EmailIngestConfig {
  enabled: boolean;
  ai_provider: "anthropic" | "deepseek";
  has_anthropic_key: boolean;
  has_deepseek_key: boolean;
  gmail_poll_label: string;
  gmail_poll_interval_minutes: number;
  gmail_connected_email: string | null;
  last_polled_at: string | null;
  last_poll_stats: { created: number; skipped: number; errors: number } | null;
  has_gmail_credentials: boolean;
  has_gmail_token: boolean;
}

export interface EmailIngestConfigUpdate {
  enabled?: boolean;
  ai_provider?: "anthropic" | "deepseek";
  anthropic_api_key?: string;
  deepseek_api_key?: string;
  gmail_poll_label?: string;
  gmail_poll_interval_minutes?: number;
  gmail_credentials_json?: string;
}

export const emailIngestApi = {
  getConfig: () => api.get<EmailIngestConfig>("/email-ingest/config"),
  updateConfig: (body: EmailIngestConfigUpdate) =>
    api.patch<EmailIngestConfig>("/email-ingest/config", body),
  disconnectGmail: () => api.delete("/email-ingest/config/gmail"),
  startOAuth: () => api.get<{ auth_url: string }>("/email-ingest/oauth/start"),
  triggerPoll: () => api.post<{ status: string }>("/email-ingest/poll"),
};


