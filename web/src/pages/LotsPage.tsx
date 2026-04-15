import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import { Search, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { lotsApi, type LotListItem } from "../lib/api";

const col = createColumnHelper<LotListItem>();

const columns = [
  col.accessor("strata_lot_number", {
    header: "SL#",
    cell: (info) => <span className="font-mono font-medium">SL{info.getValue()}</span>,
    size: 80,
  }),
  col.accessor("unit_number", {
    header: "Unit",
    cell: (info) => info.getValue() ?? <span className="text-slate-400">—</span>,
    size: 100,
  }),
  col.accessor("square_feet", {
    header: "Sq Ft",
    cell: (info) => {
      const v = info.getValue();
      return v ? Number(v).toLocaleString() : <span className="text-slate-400">—</span>;
    },
    size: 90,
  }),
  col.accessor("owners", {
    header: "Owner(s)",
    cell: (info) => {
      const owners = info.getValue();
      if (!owners.length) return <span className="text-slate-400">Unassigned</span>;
      return owners.join(", ");
    },
  }),
  col.accessor("tenants", {
    header: "Tenant(s)",
    cell: (info) => {
      const tenants = info.getValue();
      if (!tenants.length) return <span className="text-slate-400">—</span>;
      return tenants.join(", ");
    },
  }),
  col.accessor("id", {
    header: "",
    id: "actions",
    cell: (info) => (
      <Link
        to={`/lots/${info.getValue()}`}
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

export default function LotsPage() {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["lots", page, search],
    queryFn: () =>
      lotsApi.list({ skip: page * PAGE_SIZE, limit: PAGE_SIZE, search: search || undefined }),
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

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(0);
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Lots</h1>
          <p className="text-slate-500 text-sm mt-1">
            {data ? `${data.total} lots total` : "Loading…"}
          </p>
        </div>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by unit or SL#…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="input pl-9"
          />
        </div>
        <button type="submit" className="btn-primary">Search</button>
        {search && (
          <button
            type="button"
            onClick={() => { setSearch(""); setSearchInput(""); setPage(0); }}
            className="btn-secondary"
          >
            Clear
          </button>
        )}
      </form>

      {/* Table */}
      <div className="card overflow-hidden">
        {error ? (
          <div className="px-6 py-8 text-center text-red-600 text-sm">Failed to load lots.</div>
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
                  ? Array.from({ length: 10 }).map((_, i) => (
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
                      No lots found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {(data?.total ?? 0) > PAGE_SIZE && (
          <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between text-sm">
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
    </div>
  );
}
