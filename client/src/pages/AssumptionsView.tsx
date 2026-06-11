import React from "react";
import { useProduct } from "@/context/ProductContext";
import CsvAssumptionsManager from "@/components/products/CsvAssumptionsManager";
import XlsxAssumptionsEditor from "@/components/products/XlsxAssumptionsEditor";

// Dispatches to the right assumptions editor based on the active product's
// manifest: a multi-sheet XLSX editor or a CSV/text parameter-table manager.
export default function AssumptionsView() {
  const { product, config, loading } = useProduct();

  if (loading || !config) {
    return <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>;
  }

  const kind = config.assumptions.kind;
  const workbookName = config.assumptions.file?.split(/[/\\]/).pop();

  if (kind === "xlsx-sheets") {
    return (
      <XlsxAssumptionsEditor
        productId={product}
        title={`${config.label} Assumptions`}
        workbookName={workbookName}
      />
    );
  }
  if (kind === "csv-files") {
    return <CsvAssumptionsManager productId={product} title={`${config.label} Parameter Tables`} />;
  }
  return (
    <div className="p-8 text-center text-muted-foreground text-sm">
      This product has no assumptions configured.
    </div>
  );
}
