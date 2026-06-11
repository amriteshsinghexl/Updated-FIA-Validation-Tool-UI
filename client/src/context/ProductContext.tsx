import React, { createContext, useContext, useEffect, useState } from "react";

// Mirror of the normalized manifest the server returns from /api/products.
// The UI drives every product-specific behaviour off this config instead of
// hardcoding `product === "VA"` checks, so a new product needs no UI changes.
export interface ProductConfig {
  id: string;
  label: string;
  run: {
    script: string;
    singleFlag: string | null;
    outputFlag: string | null;
    deviceFlag: string | null;
    modeFlag: string | null;
    monthsFlag: string | null;
    fixedArgs: [string, string][];
  };
  data: { kind: "list" | "external" | "none"; dir: string; file: string | null };
  assumptions: { kind: "csv-files" | "xlsx-sheets" | "none"; dir: string | null; file: string | null };
  results: { kind: "csv-summary" | "xlsx-tree" | "none"; dir: string; files: string[] };
  ui: {
    months: boolean;
    monthsDefault: number;
    idLabel: string;
    idType: "number" | "text";
    idPlaceholder: string;
    runTypeLabels: { portfolio: string; single: string };
    runButton: string | null;
  };
}

interface ProductContextValue {
  product: string;                 // active product id
  setProduct: (p: string) => void;
  products: ProductConfig[];       // all discovered products
  config: ProductConfig | null;    // manifest of the active product
  loading: boolean;
}

const ProductContext = createContext<ProductContextValue>({
  product: "",
  setProduct: () => {},
  products: [],
  config: null,
  loading: true,
});

export const ProductProvider = ({ children }: { children: React.ReactNode }) => {
  const [product, setProduct] = useState("");
  const [products, setProducts] = useState<ProductConfig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((data) => {
        const configs: ProductConfig[] = data.configs ?? [];
        setProducts(configs);
        setProduct((cur) => cur || configs[0]?.id || "");
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const config = products.find((p) => p.id === product) ?? null;

  return (
    <ProductContext.Provider value={{ product, setProduct, products, config, loading }}>
      {children}
    </ProductContext.Provider>
  );
};

export const useProduct = () => useContext(ProductContext);
