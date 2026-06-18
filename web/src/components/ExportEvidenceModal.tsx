import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Download, FileText, Loader2 } from "lucide-react";
import { lotsApi, downloadIncidentEvidencePdf, type LotListItem } from "../lib/api";
import { lotLabel } from "../lib/utils";

interface Props {
  /** Pre-selected lot — pass when opening from a lot-filtered context. */
  initialLot?: LotListItem | null;
  onClose: () => void;
}

export default function ExportEvidenceModal({ initialLot, onClose }: Props) {
  const [lotSearch, setLotSearch] = useState(
    initialLot ? lotLabel(initialLot) : ""
  );
  const [selectedLot, setSelectedLot] = useState<LotListItem | null>(initialLot ?? null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [category, setCategory] = useState("");
  const [includeNotes, setIncludeNotes] = useState(true);
  const [includeAttachments, setIncludeAttachments] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: lotsData } = useQuery({
    queryKey: ["lots", { search: lotSearch }],
    queryFn: () => lotsApi.list({ limit: 20, search: lotSearch || undefined }),
    enabled: lotSearch.length > 0 && !selectedLot,
  });

  async function handleDownload() {
    if (!selectedLot) return;
    setError(null);
    setLoading(true);
    try {
      await downloadIncidentEvidencePdf({
        lotId: selectedLot.id,
        lotSlNumber: selectedLot.strata_lot_number,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        category: category || undefined,
        includeNotes,
        includeAttachments,
      });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-start sm:justify-center bg-black/50 sm:pt-16">
      <div className="bg-white rounded-t-xl sm:rounded-lg shadow-xl w-full sm:max-w-lg sm:mx-4 flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2.5">
            <FileText className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-semibold">Export Incident Evidence Package</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-5 space-y-4 max-h-[70vh]">
          <p className="text-sm text-slate-500">
            Generates a court-ready PDF with full incident descriptions, notes timeline,
            and embedded photos for the selected lot.
          </p>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</div>
          )}

          {/* Lot selector */}
          <div>
            <label className="label">Strata Lot *</label>
            {selectedLot ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 input bg-slate-50 text-slate-700 flex items-center">
                  <span className="font-medium">{lotLabel(selectedLot)}</span>
                  {selectedLot.owners.length > 0 && (
                    <span className="ml-2 text-xs text-slate-400">— {selectedLot.owners.join(", ")}</span>
                  )}
                </div>
                <button
                  className="btn btn-secondary text-xs py-1.5 px-3 whitespace-nowrap"
                  onClick={() => { setSelectedLot(null); setLotSearch(""); }}
                >
                  Change
                </button>
              </div>
            ) : (
              <>
                <input
                  type="search"
                  className="input"
                  placeholder="Search by SL# or unit…"
                  value={lotSearch}
                  onChange={(e) => setLotSearch(e.target.value)}
                  autoFocus
                />
                {lotsData && lotsData.items.length > 0 && (
                  <div className="mt-1 border border-slate-200 rounded-md divide-y divide-slate-100 max-h-40 overflow-y-auto shadow-sm">
                    {lotsData.items.map((l) => (
                      <button
                        key={l.id}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors"
                        onClick={() => { setSelectedLot(l); setLotSearch(lotLabel(l)); }}
                      >
                        <span className="font-medium">{lotLabel(l)}</span>
                        {l.owners.length > 0 && (
                          <span className="ml-2 text-xs text-slate-400">{l.owners.join(", ")}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">From Date <span className="text-slate-400 font-normal">(optional)</span></label>
              <input
                type="date"
                className="input"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div>
              <label className="label">To Date <span className="text-slate-400 font-normal">(optional)</span></label>
              <input
                type="date"
                className="input"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
          </div>

          {/* Category filter */}
          <div>
            <label className="label">Category Filter <span className="text-slate-400 font-normal">(optional)</span></label>
            <input
              type="text"
              className="input"
              placeholder="e.g. Water Damage — leave blank for all"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </div>

          {/* Options */}
          <div className="space-y-2.5 pt-1">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                className="rounded border-slate-300 w-4 h-4"
                checked={includeNotes}
                onChange={(e) => setIncludeNotes(e.target.checked)}
              />
              <div>
                <span className="text-sm font-medium text-slate-700">Include notes & timeline</span>
                <p className="text-xs text-slate-400">All staff updates and email replies per incident</p>
              </div>
            </label>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                className="rounded border-slate-300 w-4 h-4"
                checked={includeAttachments}
                onChange={(e) => setIncludeAttachments(e.target.checked)}
              />
              <div>
                <span className="text-sm font-medium text-slate-700">Include photo attachments</span>
                <p className="text-xs text-slate-400">Images embedded in the PDF; video files listed by name only</p>
              </div>
            </label>
          </div>

          {/* Legal notice */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5">
            <p className="text-xs text-blue-800">
              The generated PDF includes a certification statement confirming it is an unmodified
              extract from the strata corporation's records. Suitable for BCRT filings, legal
              correspondence, and court submissions.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t flex justify-end gap-3">
          <button onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button
            className="btn btn-primary flex items-center gap-2 disabled:opacity-50"
            disabled={!selectedLot || loading}
            onClick={handleDownload}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating PDF…
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Download Evidence PDF
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
