import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Download, Upload, AlertTriangle, CheckCircle } from "lucide-react";
import { partiesApi, type BulkPartyRow, type LotAssignmentRole, type PartyType } from "../../lib/api";

interface Props {
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Template definition
// ---------------------------------------------------------------------------

// Column order matters — must match TEMPLATE_ROWS below
const TEMPLATE_HEADERS = [
  "full_name",         // Required. e.g. "Smith, Jane" or "ABC Holdings Ltd."
  "role",              // Required. See valid values below.
  "lot_unit",          // Unit number matching an existing lot, e.g. "0110"
  "party_type",        // "individual" (default) or "corporation"
  "email",
  "cell_phone",        // Format: 604-555-0100
  "home_phone",
  "work_phone",
  "mailing_address_line1",
  "mailing_city",
  "mailing_province",  // e.g. BC
  "mailing_postal_code",
  "is_property_manager", // true or false (default false)
  "notes",
];

// Valid role values:
//   owner_occupant       — owner who lives in the unit
//   owner_absentee       — owner who does not live in the unit
//   tenant               — tenant / renter
//   emergency_contact    — emergency contact only
//   key_holder           — key holder only
//   agent                — strata agent
//   property_manager_of_record

const TEMPLATE_ROWS = [
  // Owner occupant — lives at the unit, no separate mailing address needed
  ["Smith, Jane",        "owner_occupant",  "0110", "individual", "jane.smith@email.com",  "604-555-0101", "",             "",             "",                    "",          "",   "",        "false", ""],
  // Owner absentee — owns but does not live there; has separate mailing address
  ["Wong, David",        "owner_absentee",  "0210", "individual", "dwong@email.com",       "604-555-0202", "",             "",             "456 Elsewhere Ave",   "Vancouver", "BC", "V6B 2W9", "false", ""],
  // Tenant
  ["Park, Daniel",       "tenant",          "0110", "individual", "dpark@email.com",        "",            "778-555-0303", "",             "",                    "",          "",   "",        "false", "Form K filed"],
  // Corporate owner
  ["Maple Holdings Ltd.","owner_absentee",  "0305", "corporation","admin@mapleholdings.ca", "",            "",             "604-555-0404", "1166 Alberni St 700", "Vancouver", "BC", "V6E 3Z3", "false", ""],
  // Emergency contact (no lot assignment — leave lot_unit and role blank if not assigning)
  ["Lee, Susan",         "emergency_contact","0210","individual", "slee@email.com",         "604-555-0505","",             "",             "",                    "",          "",   "",        "false", ""],
];

const ROLE_VALUES: LotAssignmentRole[] = [
  "owner_occupant", "owner_absentee", "tenant",
  "emergency_contact", "key_holder", "agent", "property_manager_of_record",
];

function downloadTemplate() {
  const lines = [
    TEMPLATE_HEADERS.join(","),
    ...TEMPLATE_ROWS.map((r) =>
      r.map((cell) => (cell.includes(",") ? `"${cell}"` : cell)).join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "party_upload_template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// Minimal CSV parser — handles quoted fields
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const fields: string[] = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        fields.push(field.trim());
        field = "";
      } else {
        field += ch;
      }
    }
    fields.push(field.trim());
    rows.push(fields);
  }
  return rows;
}

function csvToRows(text: string): { rows: BulkPartyRow[]; parseErrors: string[] } {
  const parsed = parseCsv(text);
  if (parsed.length < 2) return { rows: [], parseErrors: ["CSV has no data rows"] };

  const header = parsed[0].map((h) => h.toLowerCase().trim());
  const idx = (name: string) => header.indexOf(name);

  const parseErrors: string[] = [];
  const rows: BulkPartyRow[] = [];

  for (let i = 1; i < parsed.length; i++) {
    const cells = parsed[i];
    const get = (col: string) => cells[idx(col)]?.trim() ?? "";

    const fullName = get("full_name");
    if (!fullName) {
      parseErrors.push(`Row ${i + 1}: missing full_name, skipped`);
      continue;
    }

    const partyType = get("party_type");
    const role = get("role") as LotAssignmentRole | "";

    const row: BulkPartyRow = {
      full_name: fullName,
      party_type: (partyType === "corporation" ? "corporation" : "individual") as PartyType,
      is_property_manager: ["true", "yes", "1"].includes(get("is_property_manager").toLowerCase()),
      mailing_address_line1: get("mailing_address_line1") || undefined,
      mailing_city: get("mailing_city") || undefined,
      mailing_province: get("mailing_province") || undefined,
      mailing_postal_code: get("mailing_postal_code") || undefined,
      email: get("email") || undefined,
      cell_phone: get("cell_phone") || undefined,
      home_phone: get("home_phone") || undefined,
      work_phone: get("work_phone") || undefined,
      notes: get("notes") || undefined,
      lot_unit: get("lot_unit") || undefined,
      role: role && ROLE_VALUES.includes(role) ? role : undefined,
    };
    rows.push(row);
  }
  return { rows, parseErrors };
}

export default function BulkAddPartyModal({ onClose }: Props) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<BulkPartyRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [result, setResult] = useState<{ created: number; errors: { row: number; name: string; error: string }[] } | null>(null);

  const mut = useMutation({
    mutationFn: () => partiesApi.bulkCreate(rows),
    onSuccess: (data) => {
      setResult(data);
      qc.invalidateQueries({ queryKey: ["parties"] });
      qc.invalidateQueries({ queryKey: ["lots"] });
    },
  });

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { rows: parsed, parseErrors: errs } = csvToRows(text);
      setRows(parsed);
      setParseErrors(errs);
    };
    reader.readAsText(file);
  }

  const canSubmit = rows.length > 0 && !mut.isPending && !result;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">Bulk Upload Parties</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Step 1 — template */}
          <div className="flex items-start gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-800">Step 1 — Download the template</p>
              <p className="text-xs text-slate-500 mt-0.5">
                One party per row. Key columns: <strong>full_name</strong>, <strong>role</strong>{" "}
                (owner_occupant / owner_absentee / tenant / emergency_contact / key_holder),{" "}
                <strong>lot_unit</strong> (e.g. 0110). The template includes sample rows for
                owners, tenants, and corporate owners. Delete the sample rows before uploading.
              </p>
            </div>
            <button
              type="button"
              onClick={downloadTemplate}
              className="btn-secondary flex items-center gap-2 shrink-0"
            >
              <Download className="w-4 h-4" /> Template
            </button>
          </div>

          {/* Step 2 — upload */}
          <div>
            <p className="text-sm font-medium text-slate-800 mb-2">Step 2 — Upload your CSV</p>
            <div
              className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              {fileName ? (
                <p className="text-sm font-medium text-slate-700">{fileName}</p>
              ) : (
                <p className="text-sm text-slate-500">Click to select a CSV file</p>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleFile}
              />
            </div>
          </div>

          {/* Parse errors */}
          {parseErrors.length > 0 && (
            <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 space-y-1">
              {parseErrors.map((e, i) => (
                <p key={i} className="text-xs text-amber-800 flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{e}
                </p>
              ))}
            </div>
          )}

          {/* Preview table */}
          {rows.length > 0 && !result && (
            <div>
              <p className="text-sm font-medium text-slate-800 mb-2">
                Preview — {rows.length} {rows.length === 1 ? "party" : "parties"} ready to import
              </p>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-56">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        {["Name", "Type", "Email", "Phone", "Unit", "Role"].map((h) => (
                          <th key={h} className="px-3 py-2 text-left font-semibold text-slate-600 whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map((r, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-3 py-1.5 font-medium text-slate-900 whitespace-nowrap">{r.full_name}</td>
                          <td className="px-3 py-1.5 text-slate-500 capitalize">{r.party_type ?? "individual"}</td>
                          <td className="px-3 py-1.5 text-slate-500">{r.email ?? "—"}</td>
                          <td className="px-3 py-1.5 text-slate-500">{r.cell_phone ?? r.home_phone ?? r.work_phone ?? "—"}</td>
                          <td className="px-3 py-1.5 text-slate-500">{r.lot_unit ?? "—"}</td>
                          <td className="px-3 py-1.5 text-slate-500">{r.role ? r.role.replace(/_/g, " ") : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                <CheckCircle className="w-5 h-5 shrink-0" />
                <p className="text-sm font-medium">
                  {result.created} {result.created === 1 ? "party" : "parties"} created successfully
                </p>
              </div>
              {result.errors.length > 0 && (
                <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 space-y-1">
                  <p className="text-xs font-semibold text-amber-800 mb-1">Warnings ({result.errors.length})</p>
                  {result.errors.map((e, i) => (
                    <p key={i} className="text-xs text-amber-700 flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      Row {e.row} ({e.name}): {e.error}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {mut.isError && (
            <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {(mut.error as Error).message}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">
            {result ? "Close" : "Cancel"}
          </button>
          {!result && (
            <button
              onClick={() => mut.mutate()}
              disabled={!canSubmit}
              className="btn-primary flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              {mut.isPending ? "Uploading…" : `Upload ${rows.length > 0 ? rows.length : ""} Parties`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
