import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import { Search, Plus, Upload, ChevronLeft, ChevronRight, Eye, Building, User } from "lucide-react";
import { partiesApi, type PartyListItem } from "../lib/api";
import AddPartyModal from "../components/parties/AddPartyModal";
import BulkAddPartyModal from "../components/parties/BulkAddPartyModal";

const col = createColumnHelper<PartyListItem>();

const columns = [
  col.accessor("party_type", {
    header: "Type",
    cell: (info) =>
      info.getValue() === "corporation" ? (
        <Building className="w-4 h-4 text-slate-500" aria-label="Corporation" />
      ) : (
        <User className="w-4 h-4 text-slate-400" aria-label="Individual" />
      ),
    size: 50,
  }),
  col.accessor("full_name", {
    header: "Name",
    cell: (info) => (
      <span className="font-medium text-slate-900">{info.getValue()}</span>
    ),
  }),
  col.accessor("primary_email", {
    header: "Email",
    cell: (info) =>
      info.getValue() ? (
        <a href={`mailto:${info.getValue()}`} className="text-blue-600 hover:underline text-sm">
          {info.getValue()}
        </a>
      ) : (
        <span className="text-slate-400">—</span>
      ),
  }),
  col.accessor("primary_phone", {
    header: "Phone",
    cell: (info) => info.getValue() ?? <span className="text-slate-400">—</span>,
    size: 140,
  }),
  col.accessor("lot_count", {
    header: "Lots",
    cell: (info) => {
      const n = info.getValue();
      return n > 0 ? (
        <span className="badge-blue">{n}</span>
      ) : (
        <span className="text-slate-400">—</span>
      );
    },
    size: 70,
  }),
  col.accessor("is_property_manager", {
    header: "PM",
    cell: (info) =>
      info.getValue() ? (
        <span className="badge-amber">Prop Mgr</span>
      ) : null,
    size: 90,
  }),
  col.accessor("id", {
    header: "",
    id: "actions",
    cell: (info) => (
      <Link
        to={`/parties/${info.getValue()}`}
        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm font-medium"
      >
        <Eye className="w-3.5 h-3.5" />
        View
      </Link>
    ),
    size: 70,
  }),
];

const PAGE_SIZE = 50;

export default function PartiesPage() {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Debounced search: auto-search 300ms after user stops typing
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (searchInput !== search) {
        setSearch(searchInput);
        setPage(0);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchInput]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, isLoading, error } = useQuery({
    queryKey: ["parties", page, search],
    queryFn: () =>
      partiesApi.list({ skip: page * PAGE_SIZE, limit: PAGE_SIZE, search: search || undefined }),
    placeholderData: (prev) => prev,
  });

  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    rowCount: data?.total ?? 0,
  });

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 md:mb-6 gap-2">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">Parties</h1>
          <p className="text-slate-500 text-sm mt-1">
            {data ? `${data.total} parties` : "Loading…"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowBulk(true)} className="btn-secondary flex items-center gap-2 text-xs sm:text-sm px-3 py-1.5 sm:px-4 sm:py-2">
            <Upload className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Bulk Upload</span><span className="sm:hidden">Bulk</span>
          </button>
          <button onClick={() => setShowAdd(true)} className="btn-primary text-xs sm:text-sm px-3 py-1.5 sm:px-4 sm:py-2">
            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Add Party</span><span className="sm:hidden">Add</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1 max-w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="input pl-9"
          />
        </div>
        {search && (
          <button
            type="button"
            onClick={() => { setSearch(""); setSearchInput(""); setPage(0); }}
            className="btn-secondary"
          >
            Clear
          </button>
        )}
      </div>

      <div className="card overflow-hidden -mx-4 sm:mx-0">
        {error ? (
          <div className="px-6 py-8 text-center text-red-600 text-sm">Failed to load parties.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {hg.headers.map((header) => (
                      <th
                        key={header.id}
                        className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider"
                        style={{ width: header.getSize() }}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        {columns.map((_, j) => (
                          <td key={j} className="px-4 py-3">
                            <div className="h-4 bg-slate-100 rounded w-3/4" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : table.getRowModel().rows.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id} className="px-4 py-3 text-slate-700">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))}
                {!isLoading && !data?.items.length && (
                  <tr>
                    <td colSpan={columns.length} className="px-4 py-10 text-center text-slate-400">
                      <div className="flex flex-col items-center gap-2">
                        <User className="w-8 h-8 text-slate-300" />
                        <p className="text-slate-500 font-medium">No parties found.</p>
                        <p className="text-slate-400 text-xs">Add a party using the button above.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {(data?.total ?? 0) > PAGE_SIZE && (
          <div className="px-4 py-3 border-t border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between text-sm gap-2">
            <span className="text-slate-500">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, data?.total ?? 0)} of{" "}
              {data?.total}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => p - 1)}
                disabled={page === 0}
                className="btn-secondary px-2 py-1.5"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 text-slate-600">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages - 1}
                className="btn-secondary px-2 py-1.5"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {showAdd && <AddPartyModal onClose={() => setShowAdd(false)} />}
      {showBulk && <BulkAddPartyModal onClose={() => setShowBulk(false)} />}
    </div>
  );
}
