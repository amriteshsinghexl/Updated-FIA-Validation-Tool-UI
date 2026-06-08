import React, { createContext, useContext, useState } from "react";

interface ProductContextValue {
  product: string;
  setProduct: (p: string) => void;
}

const ProductContext = createContext<ProductContextValue>({
  product: "",
  setProduct: () => {},
});

export const ProductProvider = ({ children }: { children: React.ReactNode }) => {
  const [product, setProduct] = useState("");
  return (
    <ProductContext.Provider value={{ product, setProduct }}>
      {children}
    </ProductContext.Provider>
  );
};

export const useProduct = () => useContext(ProductContext);
