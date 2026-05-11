import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Play, FileText, Loader2, AlertTriangle, Clock, X } from "lucide-react";
import { shareApi, type SharedDoc } from "../lib/api";
import { fmtDatetime } from "../lib/dates";

// ---------------------------------------------------------------------------
// Lightbox for shared media
// ---------------------------------------------------------------------------

function MediaLightbox({
  docs,
  startIdx,
  onClose,
}: {
  docs: SharedDoc[];
  startIdx: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(startIdx);
  const doc = docs[idx];
  const isImage = doc.mime_type?.startsWith("image/");
  const isVideo = doc.mime_type?.startsWith("video/");

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4"
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 text-white/70 hover:text-white"
        onClick={onClose}
      >
        <X className="w-6 h-6" />
      </button>

      <div
        className="max-w-4xl w-full max-h-[80vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {isImage && (
          <img
            src={doc.media_url}
            alt={doc.caption ?? doc.original_filename ?? ""}
            className="max-h-[80vh] max-w-full object-contain rounded-lg"
          />
        )}
        {isVideo && (
          <video
            src={doc.media_url}
            controls
            autoPlay
            className="max-h-[80vh] max-w-full rounded-lg bg-black"
          />
        )}
      </div>

      {doc.caption && (
        <p className="mt-3 text-white/80 text-sm text-center max-w-xl">{doc.caption}</p>
      )}

      {docs.length > 1 && (
        <div className="flex gap-3 mt-4">
          <button
            disabled={idx === 0}
            onClick={(e) => { e.stopPropagation(); setIdx((i) => i - 1); }}
            className="px-4 py-1.5 text-sm rounded bg-white/10 hover:bg-white/20 text-white disabled:opacity-30"
          >
            ← Prev
          </button>
          <span className="text-white/50 text-sm self-center">{idx + 1} / {docs.length}</span>
          <button
            disabled={idx === docs.length - 1}
            onClick={(e) => { e.stopPropagation(); setIdx((i) => i + 1); }}
            className="px-4 py-1.5 text-sm rounded bg-white/10 hover:bg-white/20 text-white disabled:opacity-30"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ShareIncidentPage() {
  const { token } = useParams<{ token: string }>();
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["share-incident", token],
    queryFn: () => shareApi.getIncident(token!),
    enabled: !!token,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-xl shadow p-8 text-center space-y-3">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
          <h1 className="font-semibold text-slate-900">Link Unavailable</h1>
          <p className="text-slate-500 text-sm">
            {error instanceof Error ? error.message : "This share link is invalid or has expired."}
          </p>
        </div>
      </div>
    );
  }

  const location = data.lot
    ? `SL${data.lot.strata_lot_number}${data.lot.unit_number ? ` Unit ${data.lot.unit_number}` : ""}`
    : data.common_area_description ?? "Common area";

  const statusLabel = data.status.replace("_", " ");
  const statusColour =
    data.status === "open" ? "bg-amber-100 text-amber-700"
    : data.status === "in_progress" ? "bg-blue-100 text-blue-700"
    : data.status === "resolved" ? "bg-green-100 text-green-700"
    : "bg-slate-100 text-slate-600";

  const visibleMedia = data.media.filter((d) => !d.is_processing);
  const processingCount = data.media.filter((d) => d.is_processing).length;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-slate-900 px-6 py-5">
        <p className="text-slate-400 text-xs uppercase tracking-widest mb-1">Spectrum 4 · Strata Plan BCS2611</p>
        <h1 className="text-white text-xl font-bold">Incident Report</h1>
        <p className="text-slate-400 text-sm mt-0.5">{data.reference}</p>
      </div>

      <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6">
        {/* Details card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900 text-sm">Details</h2>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusColour}`}>
              {statusLabel}
            </span>
          </div>
          <div className="px-5 py-4 grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Date</p>
              <p className="text-slate-800 font-medium">{fmtDatetime(data.incident_date)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Location</p>
              <p className="text-slate-800 font-medium">{location}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Category</p>
              <p className="text-slate-800 font-medium capitalize">{data.category.replace(/_/g, " ")}</p>
            </div>
            {data.reported_by && (
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Reported by</p>
                <p className="text-slate-800 font-medium">{data.reported_by}</p>
              </div>
            )}
          </div>
          <div className="px-5 pb-5">
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1.5">Description</p>
            <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">{data.description}</p>
          </div>
          {data.resolution && (
            <div className="px-5 pb-5 border-t border-slate-100 pt-4">
              <p className="text-xs text-green-600 uppercase tracking-wide mb-1.5 font-semibold">Resolution</p>
              <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">{data.resolution}</p>
            </div>
          )}
        </div>

        {/* Media */}
        {(visibleMedia.length > 0 || processingCount > 0) && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900 text-sm">
                Media Attachments ({visibleMedia.length})
              </h2>
            </div>
            <div className="p-4">
              {processingCount > 0 && (
                <p className="text-xs text-slate-400 mb-3 flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {processingCount} file{processingCount > 1 ? "s" : ""} still processing…
                </p>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {visibleMedia.map((doc, i) => {
                  const isImage = doc.mime_type?.startsWith("image/");
                  const isVideo = doc.mime_type?.startsWith("video/");
                  return (
                    <div
                      key={doc.id}
                      className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-50 cursor-pointer group"
                      onClick={() => setLightboxIdx(i)}
                    >
                      {isImage && (
                        <img
                          src={doc.thumbnail_url}
                          alt={doc.caption ?? doc.original_filename ?? ""}
                          className="w-full h-32 object-contain bg-slate-100 group-hover:opacity-90 transition-opacity"
                          loading="lazy"
                        />
                      )}
                      {isVideo && (
                        <div className="w-full h-32 bg-slate-800 flex items-center justify-center relative">
                          <video
                            src={doc.media_url}
                            className="w-full h-32 object-cover"
                            preload="metadata"
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/20 transition-colors">
                            <Play className="w-8 h-8 text-white drop-shadow" fill="white" />
                          </div>
                        </div>
                      )}
                      {!isImage && !isVideo && (
                        <div className="w-full h-32 flex items-center justify-center">
                          <FileText className="w-8 h-8 text-slate-400" />
                        </div>
                      )}
                      {doc.caption && (
                        <div className="px-2 py-1.5">
                          <p className="text-xs text-slate-600 line-clamp-2">{doc.caption}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Expiry notice */}
        <div className="flex items-center gap-2 text-xs text-slate-400 justify-center">
          <Clock className="w-3.5 h-3.5" />
          <span>This link expires in {data.share_expires_days} days and is for authorised recipients only.</span>
        </div>
      </div>

      {lightboxIdx !== null && (
        <MediaLightbox
          docs={visibleMedia}
          startIdx={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}
    </div>
  );
}
