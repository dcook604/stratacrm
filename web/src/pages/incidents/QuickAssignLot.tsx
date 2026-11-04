import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { lotLabel } from "../../lib/utils";
import { incidentsApi, lotsApi, type Incident } from "../../lib/api";




// ---------------------------------------------------------------------------
// Expandable incident row
// ---------------------------------------------------------------------------

export function QuickAssignLot({ incident }: { incident: Incident }) {
  const qc = useQueryClient();
  const [lotSearch, setLotSearch] = useState(incident.raw_unit_hint ?? "");
  const [selectedLotId, setSelectedLotId] = useState("");

  const { data: lotsData } = useQuery({
    queryKey: ["lots", { search: lotSearch }],
    queryFn: () => lotsApi.list({ limit: 20, search: lotSearch || undefined }),
    enabled: lotSearch.length > 0,
  });

  const assignMutation = useMutation({
    mutationFn: () => incidentsApi.update(incident.id, { lot_id: Number(selectedLotId), status: "open" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incidents"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
      <p className="text-xs font-semibold text-amber-800">
        Unit not matched — assign manually
        {incident.raw_unit_hint && (
          <span className="ml-1 font-normal text-amber-700">
            (email mentioned: <span className="font-mono">{incident.raw_unit_hint}</span>)
          </span>
        )}
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="search"
          placeholder="Search lot…"
          className="input text-xs py-1 w-32"
          value={lotSearch}
          onChange={(e) => { setLotSearch(e.target.value); setSelectedLotId(""); }}
          onClick={(e) => e.stopPropagation()}
        />
        <select
          className="input text-xs py-1 flex-1 min-w-[160px]"
          value={selectedLotId}
          onChange={(e) => setSelectedLotId(e.target.value)}
          onClick={(e) => e.stopPropagation()}
        >
          <option value="">— select lot —</option>
          {lotsData?.items.map((l) => (
            <option key={l.id} value={l.id}>
              {lotLabel(l)}
            </option>
          ))}
        </select>
        <button
          onClick={(e) => { e.stopPropagation(); assignMutation.mutate(); }}
          disabled={!selectedLotId || assignMutation.isPending}
          className="btn btn-primary text-xs py-1 px-3 disabled:opacity-40"
        >
          {assignMutation.isPending ? "Assigning…" : "Assign & Open"}
        </button>
      </div>
    </div>
  );
}
