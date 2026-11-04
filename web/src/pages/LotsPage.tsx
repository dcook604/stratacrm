import { ErrorState } from "../components/ui/States";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import { Search, Eye, Home } from "lucide-react";
import { lotsApi, type LotListItem } from "../lib/api";

import { useListParams } from "../hooks/useListParams";
import SearchInput from "../components/ui/SearchInput";
import Pagination from "../components/ui/Pagination";
import ActiveFilters from "../components/ui/ActiveFilters";
import { SortButton } from "../components/ui/SortHeader";
import { rowNav } from "../lib/rowNav";

const col = createColumnHelper<LotListItem>();

const columns = [
  col.accessor("strata_lot_number", {
    header: "SL#",
    cell: (info) => (
      <span className="font-mono font-medium flex items-center gap-1.5">
        SL{info.getValue()}
        {info.row.original.suspected_airbnb && (
          <span title="Suspected Airbnb">
            <Home className="w-3.5 h-3.5 text-orange-500" />
          </span>
        )}
      </span>
    ),
    size: 90,
  }),
  col.accessor("unit_number", {
    header: "Unit",
    cell: (info) => info.getValue() ?? <span className="text-slate-500">—</span>,
    size: 100,
  }),
  col.accessor("square_feet", {
    header: "Sq Ft",
    cell: (info) => {
      const v = info.getValue();
      return v ? Number(v).toLocaleString() : <span className="text-slate-500">—</span>;
    },
    size: 90,
  }),
  col.display({
    id: "parkingLocker",
    header: "Parking/Locker",
    cell: (info) => {
      const lot = info.row.original;
      const parts = [
        lot.parking_stalls,
        lot.storage_lockers,
        lot.bike_lockers,
        lot.scooter_lockers,
        lot.locker_number,
      ].filter(Boolean);
      if (!parts.length) return <span className="text-slate-500">—</span>;
      return <span className="text-xs">{parts.join(", ")}</span>;
    },
  }),
  col.accessor("owners", {
    header: "Owner(s)",
    cell: (info) => {
      const owners = info.getValue();
      if (!owners.length) return <span className="text-slate-500">Unassigned</span>;
      return owners.join(", ");
    },
  }),
  col.accessor("tenants", {
    header: "Tenant(s)",
    cell: (info) => {
      const tenants = info.getValue();
      if (!tenants.length) return <span className="text-slate-500">—</span>;
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

const SORT_KEYS: Record<string, string> = { strata_lot_number: "lot", unit_number: "unit", square_feet: "sqft" };

export default function LotsPage() {
  const navigate = useNavigate();
  const { values, page, setPage, update, clearAll } = useListParams({ q: "", sort: "lot:asc", size: "50" });
  const search = values.q;
  const sort = values.sort;
  const pageSize = Number(values.size) || 50;


  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["lots", { page, search, sort, pageSize }],
    queryFn: () =>
      lotsApi.list({ skip: page * pageSize, limit: pageSize, search: search || undefined, sort }),
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
          <h1 className="page-title">Lots</h1>
          <p className="text-slate-500 text-sm mt-1">
            {data ? `${data.total} lots total` : "Loading…"}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 mb-4">
        <SearchInput
          value={search}
          onChange={(v) => update({ q: v })}
          placeholder="Search by unit, SL#, parking stall, or locker…"
          className="flex-1 max-w-full sm:max-w-sm"
        />
        <ActiveFilters
          chips={search ? [{ label: `Search: “${search}”`, onRemove: () => update({ q: "" }) }] : []}
          onClearAll={clearAll}
        />
      </div>

      <div className="card overflow-hidden -mx-4 sm:mx-0">
        {error ? (
          <div className="px-6 py-8"><ErrorState message="Failed to load lots." onRetry={() => refetch()} /></div>
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
                        {SORT_KEYS[header.column.id] ? (
                          <SortButton
                            label={String(header.column.columnDef.header)}
                            sortKey={SORT_KEYS[header.column.id]}
                            sort={sort}
                            onSort={(v) => update({ sort: v })}
                          />
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
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
                      <tr
                        key={row.id}
                        className="hover:bg-slate-50 transition-colors cursor-pointer"
                        {...rowNav(navigate, `/lots/${row.original.id}`)}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id} className="px-4 py-3 text-slate-700">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))}
                {!isLoading && !data?.items.length && (
                  <tr>
                    <td colSpan={columns.length} className="px-4 py-10 text-center text-slate-500">
                      <div className="flex flex-col items-center gap-2">
                        <Search className="w-8 h-8 text-slate-300" />
                        <p className="text-slate-500 font-medium">No lots found.</p>
                        <p className="text-slate-500 text-xs">
                          {search ? <>No matches for “{search}”. <button className="underline" onClick={clearAll}>Clear search</button></> : "Try adjusting your search."}
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
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
