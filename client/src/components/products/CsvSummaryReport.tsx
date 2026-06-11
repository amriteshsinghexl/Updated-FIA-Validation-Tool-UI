import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, ChevronLeft, ChevronRight, Download } from "lucide-react";

// Generic CSV "financial summary" report, scoped to a product.
// Reads /api/products/:productId/results/summary → { metrics?, summary? }.

interface ParsedCsv { headers: string[]; rows: string[][]; }
interface FinancialSummaryData { metrics?: ParsedCsv; summary?: ParsedCsv; }

// Friendly labels for known UL columns; unknown columns fall through unchanged.
const COLUMN_LABELS: Record<string, string> = {
  t: "Period", no_pols_if: "Policies IF", no_pols_ifsm: "Policies IF (SM)",
  no_deaths: "Deaths", no_surrs: "Surrenders", no_mats: "Maturities",
  prem_inc_if: "Prem Income", basic_prem_if: "Basic Prem", topup_prem_if: "Top-Up Prem",
  op_init_exp_if: "Init Expense", op_ren_exp_if: "Ren Expense", invt_exp_if: "Invest Expense",
  comm_if: "Commission", ovrd_if: "Override", death_outgo: "Death Outgo",
  surr_outgo: "Surr Outgo", mat_outgo: "Mat Outgo", cog_term_adj: "COG Term Adj",
  unit_res_bgn: "Unit Res (BOP)", unit_res_end: "Unit Res (EOP)", unit_inc: "Unit Income",
  non_unit_inc: "Non-Unit Income", cf_before_zv: "CF Before ZV", zeroising_res_if: "Zeroising Res",
  cf_after_zv: "CF After ZV", op_tax: "Op Tax", cf_after_tax: "CF After Tax",
  tot_res_if: "Total Reserve", solv_cap_req: "SCR", scr_inv_inc: "SCR Inv Income",
  scr_inc_tax: "SCR Inc Tax", cf_after_scr: "CF After SCR", pv_cf_after_scr: "PV CF After SCR",
  pv_prem_inc: "PV Prem Income",
};

const PAGE_SIZE = 100;

function fmtNum(val: string): string {
  const n = parseFloat(val);
  if (isNaN(n)) return val;
  if (n === 0) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n / 1_000_000);
}

function downloadCsv(summary: ParsedCsv, metrics: ParsedCsv | undefined, productId: string): void {
  const sections: string[] = [];
  if (metrics && metrics.headers.length > 0) {
    sections.push("Scenario Metrics");
    sections.push(metrics.headers.join(","));
    metrics.rows.forEach((r) => sections.push(r.join(",")));
    sections.push("");
  }
  sections.push("Projection Output (values in millions)");
  sections.push(summary.headers.map((h) => COLUMN_LABELS[h] ?? h).join(","));
  summary.rows.forEach((row) => sections.push(row.map((cell, ci) => (ci === 0 ? cell : fmtNum(cell))).join(",")));
  const blob = new Blob([sections.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `financial_summary_${productId}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CsvSummaryReport({ productId }: { productId: string }) {
  const [page, setPage] = useState(0);

  const { data, isLoading, error } = useQuery<FinancialSummaryData>({
    queryKey: [`/api/products/${encodeURIComponent(productId)}/results/summary`, productId],
    queryFn: async () => {
      const res = await fetch(`/api/products/${encodeURIComponent(productId)}/results/summary`);
      if (!res.ok) throw new Error("Failed to load summary");
      return res.json();
    },
  });

  if (isLoading) return <div className="p-8 text-center text-muted-foreground text-sm">Loading financial summary...</div>;
  if (error || !data) return <div className="p-8 text-center text-red-500 text-sm">Failed to load financial summary data.</div>;

  const { metrics, summary } = data;
  const kpis = metrics && metrics.headers.length > 0 && metrics.rows.length > 0
    ? metrics.headers.map((h, i) => ({ label: h, value: metrics.rows[0][i] ?? "—" }))
    : [];
  const totalPages = summary ? Math.ceil(summary.rows.length / PAGE_SIZE) : 0;
  const pagedRows = summary ? summary.rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) : [];

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-3">
        <FileText className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold">Financial Summary</h1>
          <p className="text-xs text-muted-foreground">{productId} results &mdash; monetary values in millions (÷ 1,000,000)</p>
        </div>
      </div>

      {kpis.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          {kpis.map(({ label, value }) => (
            <Card key={label}>
              <CardContent className="p-3">
                <p className="text-[10px] uppercase font-bold text-muted-foreground leading-tight mb-1 truncate" title={label}>{label}</p>
                <p className="text-sm font-semibold font-mono truncate" title={value}>{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {summary && summary.headers.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Projection Output</h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">{summary.rows.length.toLocaleString()} periods</span>
              <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => downloadCsv(summary, metrics, productId)}>
                <Download className="h-3.5 w-3.5" /> Download CSV
              </Button>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}><ChevronLeft className="h-4 w-4" /></Button>
                <span>{page + 1} / {totalPages}</span>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          </div>

          <div className="border rounded-md overflow-auto max-h-[calc(100vh-260px)]">
            <table className="text-xs border-collapse min-w-full">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-900 text-white">
                  {summary.headers.map((h) => (
                    <th key={h} className="border border-slate-700 px-3 py-2 font-semibold whitespace-nowrap first:text-center text-right">{COLUMN_LABELS[h] ?? h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((row, ri) => (
                  <tr key={ri} className={ri % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                    {row.map((cell, ci) => {
                      const isFirst = ci === 0;
                      const num = parseFloat(cell);
                      const isNeg = !isNaN(num) && num < 0;
                      return (
                        <td key={ci} className={`border border-border px-3 py-1.5 font-mono whitespace-nowrap ${isFirst ? "text-center font-bold text-muted-foreground" : isNeg ? "text-right text-red-600" : "text-right"}`}>
                          {isFirst ? cell : fmtNum(cell)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="p-8 text-center text-muted-foreground text-sm">No summary results found. Run the model first.</div>
      )}
    </div>
  );
}
