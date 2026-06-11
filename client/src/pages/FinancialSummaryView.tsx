import React from "react";
import { useProduct } from "@/context/ProductContext";
import CsvSummaryReport from "@/components/products/CsvSummaryReport";
import XlsxResultsViewer from "@/components/products/XlsxResultsViewer";

// Dispatches to the right results view based on the active product's manifest:
// a single CSV summary report or a multi-file XLSX results browser.
export default function FinancialSummaryView() {
  const { product, config, loading } = useProduct();

  if (loading || !config) {
    return <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>;
  }

  const kind = config.results.kind;
  if (kind === "xlsx-tree") return <XlsxResultsViewer productId={product} />;
  if (kind === "csv-summary") return <CsvSummaryReport productId={product} />;
  return (
    <div className="p-8 text-center text-muted-foreground text-sm">
      This product has no results view configured.
    </div>
  );
}
