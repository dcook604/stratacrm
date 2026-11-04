import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, Mail, MessageSquare, Send } from "lucide-react";
import { fmtDatetime } from "../../lib/dates";
import { incidentsApi, type EntityNote } from "../../lib/api";
import { useToast } from "../../lib/toast";



// ---------------------------------------------------------------------------
// Notes / timeline panel
// ---------------------------------------------------------------------------

export function NotesPanel({ incidentId }: { incidentId: number }) {
  const qc = useQueryClient();
  const { addToast } = useToast();
  const [text, setText] = useState("");

  const { data: notes } = useQuery<EntityNote[]>({
    queryKey: ["incident-notes", incidentId],
    queryFn: () => incidentsApi.listNotes(incidentId),
  });

  const addMut = useMutation({
    mutationFn: () => incidentsApi.addNote(incidentId, text.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incident-notes", incidentId] });
      setText("");
    },
    onError: (e: Error) => addToast("error", e.message),
  });

  const delMut = useMutation({
    mutationFn: (noteId: number) => incidentsApi.deleteNote(incidentId, noteId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["incident-notes", incidentId] }),
    onError: (e: Error) => addToast("error", e.message),
  });

  return (
    <div className="mt-4 border-t border-slate-200 pt-4">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
        <MessageSquare className="w-3.5 h-3.5" />
        Updates {notes && notes.length > 0 && `(${notes.length})`}
      </h4>

      {notes && notes.length > 0 && (
        <div className="space-y-2 mb-3">
          {notes.map((note) => (
            <div key={note.id} className={`rounded-lg px-3 py-2.5 text-sm border ${note.source === "email" ? "bg-purple-50 border-purple-100" : "bg-surface border-slate-200"}`}>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                {note.source === "email" && (
                  <span className="inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                    <Mail className="w-3 h-3" />Email
                  </span>
                )}
                <span className="text-xs text-slate-500 font-medium">
                  {note.author_name || note.author_email || "Unknown"}
                </span>
                <span className="text-xs text-slate-500">{fmtDatetime(note.created_at)}</span>
                <button
                  className="ml-auto text-slate-300 hover:text-red-500 transition-colors"
                  title="Delete note"
                  disabled={delMut.isPending}
                  onClick={() => delMut.mutate(note.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-slate-700 whitespace-pre-wrap text-xs leading-relaxed">{note.content}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 items-end">
        <textarea
          className="input text-sm flex-1 min-h-[60px] resize-y"
          placeholder="Add an update or note…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim()) {
              e.preventDefault();
              addMut.mutate();
            }
          }}
        />
        <button
          className="btn btn-primary text-xs py-2 px-3 flex items-center gap-1.5 self-end"
          disabled={!text.trim() || addMut.isPending}
          onClick={() => addMut.mutate()}
        >
          <Send className="w-3.5 h-3.5" />
          {addMut.isPending ? "Saving…" : "Add"}
        </button>
      </div>
    </div>
  );
}
