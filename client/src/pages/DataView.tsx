import React from "react";
import { Button } from "@/components/ui/button";
import { Database, ExternalLink } from "lucide-react";
import { useProduct } from "@/context/ProductContext";
import PolicyDataManager from "@/components/products/PolicyDataManager";

// Dispatches based on the active product's data config: an in-app file manager
// ("list") or a button that opens an external data file via the OS ("external").
export default function DataView() {
  const { product, config, loading } = useProduct();

  if (loading || !config) {
    return <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>;
  }

  if (config.data.kind === "list") {
    return <PolicyDataManager productId={product} title={`${config.label} Data`} />;
  }

  if (config.data.kind === "external") {
    const openExternal = () =>
      fetch(`/api/products/${encodeURIComponent(product)}/open-data`, { method: "POST" }).catch(console.error);
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-center">
        <Database className="h-10 w-10 text-muted-foreground opacity-40" />
        <div>
          <h1 className="text-lg font-semibold">{config.label} Data</h1>
          <p className="text-sm text-muted-foreground mt-1">
            This product's data lives in an external file:&nbsp;
            <code className="text-xs">{config.data.file ?? config.data.dir}</code>
          </p>
        </div>
        <Button onClick={openExternal} className="gap-2">
          <ExternalLink className="h-4 w-4" /> Open in default app
        </Button>
      </div>
    );
  }

  return <div className="p-8 text-center text-muted-foreground text-sm">This product has no data view configured.</div>;
}
