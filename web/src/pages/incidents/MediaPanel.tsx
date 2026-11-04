import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Upload, Trash2, Tag, Edit3 } from "lucide-react";
import { documentsApi, type Document } from "../../lib/api";
import { useToast } from "../../lib/toast";
import ImageEditor from "../../components/ImageEditor";
import Lightbox from "../../components/Lightbox";



// ---------------------------------------------------------------------------
// Media attachment panel
// ---------------------------------------------------------------------------

export function MediaPanel({ incidentId }: { incidentId: number }) {
  const qc = useQueryClient();
  const { addToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [showForm, setShowForm] = useState(false);
  const [caption, setCaption] = useState("");
  const [tags, setTags] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  // Image editor state
  const [editingFile, setEditingFile] = useState<File | null>(null);
  const [editingUrl, setEditingUrl] = useState<string | null>(null);

  // Lightbox state
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const { data: docs } = useQuery({
    queryKey: ["documents", "incident", incidentId],
    queryFn: () => documentsApi.list("incident", incidentId),
    // Poll while any video is still being transcoded
    refetchInterval: (query) =>
      query.state.data?.some((d) => d.is_processing) ? 3000 : false,
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => documentsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents", "incident", incidentId] });
      setConfirmDelete(null);
      addToast("success", "Attachment removed.");
    },
    onError: (e: Error) => addToast("error", e.message),
  });

  async function uploadFile(file: File, cap?: string, t?: string) {
    setUploading(true);
    setUploadPct(0);
    try {
      await documentsApi.upload("incident", incidentId, file, cap || undefined, t || undefined, setUploadPct);
      qc.invalidateQueries({ queryKey: ["documents", "incident", incidentId] });
      addToast("success", "Media uploaded.");
    } catch (e) {
      addToast("error", (e as Error).message);
    } finally {
      setUploading(false);
      setUploadPct(0);
    }
  }

  // Handle raw file selection — open editor for images, upload directly for video/other
  function handleFileSelected(file: File) {
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setEditingFile(file);
      setEditingUrl(url);
    } else {
      uploadFile(file, caption || undefined, tags || undefined);
      setCaption("");
      setTags("");
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // Called when the image editor confirms an edited blob
  const handleEditorConfirm = useCallback(
    async (blob: Blob) => {
      const name = editingFile?.name ?? "edited.jpg";
      const file = new File([blob], name, { type: "image/jpeg" });
      await uploadFile(file, caption || undefined, tags || undefined);
      // Clean up
      if (editingUrl) URL.revokeObjectURL(editingUrl);
      setEditingFile(null);
      setEditingUrl(null);
      setCaption("");
      setTags("");
      setShowForm(false);
      if (fileRef.current) fileRef.current.value = "";
    },
    [editingFile, editingUrl, caption, tags, uploadFile],
  );

  function handleEditorCancel() {
    if (editingUrl) URL.revokeObjectURL(editingUrl);
    setEditingFile(null);
    setEditingUrl(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function isImage(doc: Document) {
    return doc.mime_type?.startsWith("image/") ?? false;
  }
  function isVideo(doc: Document) {
    return doc.mime_type?.startsWith("video/") ?? false;
  }

  const images = docs?.filter(isImage) ?? [];
  const lightboxDoc = lightboxIdx !== null ? images[lightboxIdx] : null;

  // Re-upload a re-edited existing image
  const [reEditDoc, setReEditDoc] = useState<Document | null>(null);
  const [reEditUrl, setReEditUrl] = useState<string | null>(null);

  async function startReEdit(doc: Document) {
    // Fetch the full-resolution image for editing
    try {
      const res = await fetch(doc.download_url, { credentials: "same-origin" });
      const blob = await res.blob();
      setReEditDoc(doc);
      setReEditUrl(URL.createObjectURL(blob));
    } catch {
      addToast("error", "Could not load image for editing.");
    }
  }

  async function handleReEditConfirm(blob: Blob) {
    if (!reEditDoc) return;
    const file = new File([blob], reEditDoc.original_filename ?? "edited.jpg", { type: "image/jpeg" });
    await uploadFile(file, reEditDoc.caption ?? undefined, reEditDoc.tags ?? undefined);
    if (reEditUrl) URL.revokeObjectURL(reEditUrl);
    setReEditDoc(null);
    setReEditUrl(null);
  }

  function handleReEditCancel() {
    if (reEditUrl) URL.revokeObjectURL(reEditUrl);
    setReEditDoc(null);
    setReEditUrl(null);
  }

  return (
    <div className="mt-4 border-t border-slate-200 pt-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Media Attachments {docs && docs.length > 0 && `(${docs.length})`}
        </h4>
        <button
          className="btn btn-secondary text-xs py-1 px-2 flex items-center gap-1"
          onClick={() => setShowForm((f) => !f)}
        >
          <Upload className="w-3.5 h-3.5" />
          Add Photo / Video
        </button>
      </div>

      {showForm && !editingFile && !reEditDoc && (
        <div className="mb-4 bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
          <div>
            <label className="label text-xs">File (image or video — images max 100 MB, videos up to 2 GB)</label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              className="block w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelected(file);
              }}
            />
          </div>
          <div>
            <label className="label text-xs">Caption <span className="text-slate-500 font-normal">(optional)</span></label>
            <input
              type="text"
              className="input text-sm"
              placeholder="Describe what's shown…"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
          </div>
          <div>
            <label className="label text-xs flex items-center gap-1">
              <Tag className="w-3 h-3" /> Tags <span className="text-slate-500 font-normal">(comma-separated, optional)</span>
            </label>
            <input
              type="text"
              className="input text-sm"
              placeholder="e.g. water, hallway, p2"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </div>
          {uploading && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-blue-600">
                {uploadPct < 100 ? (
                  <>
                    <span>Uploading…</span>
                    <span>{uploadPct}%</span>
                  </>
                ) : (
                  <span className="animate-pulse">Processing video… this may take a minute</span>
                )}
              </div>
              <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-1.5 rounded-full transition-all duration-150 ${uploadPct < 100 ? "bg-blue-500" : "bg-amber-500 animate-pulse"}`}
                  style={{ width: `${uploadPct}%` }}
                />
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              className="btn btn-secondary text-xs py-1"
              onClick={() => { setShowForm(false); setCaption(""); setTags(""); }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Image editor modal for new uploads */}
      {editingUrl && editingFile && (
        <div className="mb-4 bg-slate-50 border border-slate-200 rounded-lg p-4">
          <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
            Edit Image
          </h5>
          <ImageEditor
            src={editingUrl}
            onConfirm={handleEditorConfirm}
            onCancel={handleEditorCancel}
          />
        </div>
      )}

      {/* Image editor for re-editing existing images */}
      {reEditUrl && reEditDoc && (
        <div className="mb-4 bg-slate-50 border border-slate-200 rounded-lg p-4">
          <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
            Re-edit Image
          </h5>
          <ImageEditor
            src={reEditUrl}
            onConfirm={handleReEditConfirm}
            onCancel={handleReEditCancel}
          />
        </div>
      )}

      {docs && docs.length === 0 && !showForm && (
        <p className="text-xs text-slate-500 italic">No media attached yet.</p>
      )}

      {docs && docs.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {docs.map((doc) => (
            <div key={doc.id} className="relative group rounded-lg overflow-hidden border border-slate-200 bg-surface">
              {isImage(doc) && (
                <>
                  <img
                    src={doc.thumbnail_url ?? doc.download_url}
                    alt={doc.caption ?? doc.original_filename ?? ""}
                    className="w-full h-32 object-contain bg-slate-100 cursor-pointer hover:opacity-90 transition-opacity"
                    loading="lazy"
                    onClick={() => {
                      const imgIdx = images.findIndex((d) => d.id === doc.id);
                      if (imgIdx !== -1) setLightboxIdx(imgIdx);
                    }}
                  />
                  {/* Re-edit button (top-left) */}
                  <button
                    onClick={(e) => { e.stopPropagation(); startReEdit(doc); }}
                    className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity bg-surface rounded p-0.5 shadow text-slate-500 hover:text-blue-600"
                    title="Re-edit image"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
              {isVideo(doc) && !doc.is_processing && (
                <video
                  src={doc.download_url}
                  controls
                  className="w-full h-32 object-cover bg-black"
                  preload="metadata"
                />
              )}
              {doc.is_processing && (
                <div className="w-full h-32 bg-slate-100 flex flex-col items-center justify-center gap-1.5 text-slate-500">
                  <div className="w-6 h-6 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
                  <span className="text-[11px] font-medium">Processing…</span>
                </div>
              )}
              {!isImage(doc) && !isVideo(doc) && (
                <a
                  href={doc.download_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center h-32 bg-slate-50 text-slate-500"
                >
                  <FileText className="w-8 h-8" />
                </a>
              )}

              {/* Caption + tags */}
              <div className="px-2 py-1.5 space-y-0.5">
                {doc.caption && (
                  <p className="text-xs text-slate-700 leading-tight line-clamp-2">{doc.caption}</p>
                )}
                {doc.tags && (
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {doc.tags.split(",").map((t) => t.trim()).filter(Boolean).map((t) => (
                      <span key={t} className="inline-block text-[10px] bg-blue-50 text-blue-700 rounded px-1.5 py-0.5">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Delete button */}
              <div className="absolute top-1 right-1">
                {confirmDelete === doc.id ? (
                  <div className="flex gap-1 bg-surface rounded shadow-md p-1">
                    <button
                      className="text-[10px] text-red-600 font-semibold hover:underline"
                      onClick={() => deleteMut.mutate(doc.id)}
                      disabled={deleteMut.isPending}
                    >
                      Delete
                    </button>
                    <button
                      className="text-[10px] text-slate-500 hover:underline"
                      onClick={() => setConfirmDelete(null)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(doc.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity bg-surface rounded p-0.5 shadow text-slate-500 hover:text-red-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightboxDoc && lightboxIdx !== null && (
        <Lightbox
          src={lightboxDoc.download_url}
          caption={lightboxDoc.caption}
          onClose={() => setLightboxIdx(null)}
          onPrev={
            lightboxIdx > 0
              ? () => setLightboxIdx((i) => (i !== null ? i - 1 : null))
              : undefined
          }
          onNext={
            lightboxIdx < images.length - 1
              ? () => setLightboxIdx((i) => (i !== null ? i + 1 : null))
              : undefined
          }
          onDelete={() => deleteMut.mutate(lightboxDoc.id)}
          hasPrev={lightboxIdx > 0}
          hasNext={lightboxIdx < images.length - 1}
        />
      )}
    </div>
  );
}
