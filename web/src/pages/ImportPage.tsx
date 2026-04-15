import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, FileText, CheckCircle2, Clock, XCircle, ChevronRight } from "lucide-react";
import { importApi, type ImportBatch } from "../lib/api";
import { formatDateTime } from "../lib/utils";

const STATUS_ICON: Record<string, React.ReactNode> = {
  reviewing: <Clock className="w-4 h-4 text-amber-500" />,
  completed: <CheckCircle2 className="w-4 h-4 text-green-500" />,
  cancelled: <XCircle className="w-4 h-4 text-slate-400" />,
  pending: <Clock className="w-4 h-4 text-slate-400" />,
};

const STATUS_LABEL: Record<string, string> = {
  reviewing: "In review",
  completed: "Completed",
  cancelled: "Cancelled",
  pending: "Pending",
};

function BatchRow({ batch }: { batch: ImportBatch }) {
  const pct = batch.total_lots > 0
    ? Math.round(((batch.lots_confirmed + batch.lots_skipped) / batch.total_lots) * 100)
    : 0;

  return (
    <Link
      to={`/import/${batch.id}`}
      className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors"
    >
      <FileText className="w-5 h-5 text-slate-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-slate-900 text-sm truncate">{batch.original_filename}</p>
        <p className="text-xs text-slate-500 mt-0.5">{formatDateTime(batch.uploaded_at)}</p>
      </div>
      <div className="text-right shrink-0">
        <div className="flex items-center gap-1.5 justify-end mb-1">
          {STATUS_ICON[batch.status]}
          <span className="text-xs text-slate-600">{STATUS_LABEL[batch.status]}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-24 h-1.5 rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full rounded-full bg-green-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs text-slate-500 w-12 text-right">
            {batch.lots_confirmed + batch.lots_skipped}/{batch.total_lots}
          </span>
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
    </Link>
  );
}

export default function ImportPage() {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const { data: batches, isLoading } = useQuery({
    queryKey: ["import-batches"],
    queryFn: importApi.listBatches,
  });

  const uploadMut = useMutation({
    mutationFn: (file: File) => importApi.upload(file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["import-batches"] });
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are accepted.");
      return;
    }
    uploadMut.mutate(file);
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Owner List Import</h1>
        <p className="text-slate-500 text-sm mt-1">
          Upload the PDF owner list from the management company. Records are staged for review
          before being written to the database.
        </p>
      </div>

      {/* Upload zone */}
      <div
        className={`card p-8 mb-8 flex flex-col items-center justify-center border-2 border-dashed transition-colors cursor-pointer
          ${dragging ? "border-blue-400 bg-blue-50" : "border-slate-300 hover:border-blue-300 hover:bg-slate-50"}
          ${uploadMut.isPending ? "opacity-50 pointer-events-none" : ""}`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        {uploadMut.isPending ? (
          <>
            <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm font-medium text-slate-700">Parsing PDF…</p>
            <p className="text-xs text-slate-500 mt-1">This may take a few seconds</p>
          </>
        ) : (
          <>
            <Upload className="w-10 h-10 text-slate-400 mb-3" />
            <p className="text-sm font-medium text-slate-700">
              Drop the owner list PDF here, or{" "}
              <span className="text-blue-600 underline">browse</span>
            </p>
            <p className="text-xs text-slate-500 mt-1">PDF files only · BCS2611 owner list format</p>
          </>
        )}
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 mb-6 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Previous batches */}
      <div className="card">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-700">Previous Imports</h2>
        </div>
        {isLoading ? (
          <div className="px-6 py-8 text-center text-slate-400 text-sm">Loading…</div>
        ) : !batches?.length ? (
          <div className="px-6 py-8 text-center text-slate-400 text-sm">
            No imports yet. Upload the BCS2611 owner list PDF above to get started.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {batches.map((b) => (
              <li key={b.id}>
                <BatchRow batch={b} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
