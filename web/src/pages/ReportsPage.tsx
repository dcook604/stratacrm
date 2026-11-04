import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import { FileText, Building2 } from "lucide-react";
import { reportsApi, type LotReportSummary } from "../lib/api";

import { useListParams } from "../hooks/useListParams";
import SearchInput from "../components/ui/SearchInput";
import Pagination from "../components/ui/Pagination";
import { rowNav } from "../lib/rowNav";

const col = createColumnHelper<LotReportSummary>();

const columns = [
  col.accessor("strata_lot_number", {
    header: "Lot",
    cell: (info) => (
      <Link to={`/reports/${info.row.original.id}`} className="font-mono font-medium text-blue-600 hover:text-blue-800">
        SL{info.getValue()}
      </Link>
    ),
    size: 80,
  }),
  col.accessor("unit_number", {
    header: "Unit",
    cell: (info) => info.getValue() ?? <span className="text-slate-500">—</span>,
    size: 80,
  }),
  col.accessor("owners", {
    header: "Owner(s)",
    cell: (info) => {
      const v = info.getValue();
      if (!v.length) return <span className="text-slate-500">—</span>;
      return <span className="text-xs">{v.join(", ")}</span>;
    },
  }),
  col.accessor("tenants", {
    header: "Tenant(s)",
    cell: (info) => {
      const v = info.getValue();
      if (!v.length) return <span className="text-slate-500">—</span>;
      return <span className="text-xs">{v.join(", ")}</span>;
    },
  }),
  col.accessor("open_infractions", {
    header: "Open Infr.",
    cell: (info) => {
      const v = info.getValue();
      return v > 0
        ? <span className="font-semibold text-red-600">{v}</span>
        : <span className="text-slate-500">{v}</span>;
    },
    size: 85,
  }),
  col.accessor("total_infractions", {
    header: "Total Infr.",
    cell: (info) => info.getValue(),
    size: 85,
  }),
  col.accessor("open_incidents", {
    header: "Open Incid.",
    cell: (info) => {
      const v = info.getValue();
      return v > 0
        ? <span className="font-semibold text-amber-600">{v}</span>
        : <span className="text-slate-500">{v}</span>;
    },
    size: 85,
  }),
  col.accessor("total_incidents", {
    header: "Total Incid.",
    cell: (info) => info.getValue(),
    size: 85,
  }),
  col.accessor("open_issues", {
    header: "Open Issues",
    cell: (info) => {
      const v = info.getValue();
      return v > 0
        ? <span className="font-semibold text-orange-600">{v}</span>
        : <span className="text-slate-500">{v}</span>;
    },
    size: 85,
  }),
  col.accessor("total_issues", {
    header: "Total Issues",
    cell: (info) => info.getValue(),
    size: 85,
  }),
  col.accessor("id", {
    header: "",
    id: "actions",
    cell: (info) => (
      <div className="flex items-center gap-2">
        <Link
          to={`/reports/${info.getValue()}`}
          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm font-medium"
        >
          <FileText className="w-3.5 h-3.5" />
          Report
        </Link>
        <a
          href={reportsApi.pdfUrl(info.getValue())}
          className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-700 text-sm"
          title="Download PDF"
        >
          <FileText className="w-3.5 h-3.5" />
          PDF
        </a>
      </div>
    ),
    size: 120,
  }),
];

export default function ReportsPage() {
  const navigate = useNavigate();
  const { values, page, setPage, update } = useListParams({ q: "", size: "50" });
  const search = values.q;
  const pageSize = Number(values.size) || 50;

  const { data, isLoading, error } = useQuery({
    queryKey: ["reports", { page, search, pageSize }],
    queryFn: () =>
      reportsApi.list({ skip: page * pageSize, limit: pageSize, search: search || undefined }),
    placeholderData: (prev) => prev,
  });

  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    rowCount: data?.total ?? 0,
  });


  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 md:mb-6 gap-2">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Building2 className="w-6 h-6 text-blue-600" />
            Lot Reports
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {data ? `${data.total} lots` : "Loading…"} — Infractions, incidents, and issues summary by lot
          </p>
        </div>
      </div>

      <div className="mb-4">
        <SearchInput
          value={search}
          onChange={(v) => update({ q: v })}
          placeholder="Search by unit or SL#…"
          className="max-w-full sm:max-w-sm"
        />
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-slate-200 bg-slate-50">
                  {hg.headers.map((h) => (
                    <th
                      key={h.id}
                      className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-3 py-3"
                      style={{ width: h.getSize() !== 150 ? h.getSize() : undefined }}
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={columns.length} className="px-3 py-12">
                    <div className="flex justify-center">
                      <div className="animate-pulse space-y-3 w-full max-w-md">
                        {Array.from({ length: 8 }).map((_, i) => (
                          <div key={i} className="h-4 bg-slate-200 rounded w-full" />
                        ))}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={columns.length} className="px-3 py-12 text-center text-red-500">
                    Failed to load reports.
                  </td>
                </tr>
              ) : table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-3 py-12 text-center text-slate-500">
                    {search ? "No lots match your search." : "No lots found."}
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer"
                    {...rowNav(navigate, `/reports/${row.original.id}`)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-2.5 text-sm text-slate-700">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          page={page}
          pageSize={pageSize}
          total={data?.total ?? 0}
          onPage={setPage}
          onPageSize={(n) => update({ size: String(n) })}
        />
      </div>
    </div>
  );
}
