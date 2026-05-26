import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, Info, Code, Database, ChevronRight, Calculator, FileJson } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const modules = [
  {
    name: "Account Value (AV)",
    definition: "The total value of the policyholder's account, including all fund allocations before withdrawals and charges.",
    formula: "AV_t = AV_{t-1} + Premiums - Withdrawals + Interest_Credited - Charges",
    source: "Policy Contract Section 4.1",
    subModules: ["Fund BOP", "Interest Credited", "Partial Withdrawals"]
  },
  {
    name: "GMWB Benefit Base",
    definition: "The guaranteed minimum withdrawal benefit base used to determine the maximum annual withdrawal amount.",
    formula: "BB_t = max(BB_{t-1}, AV_t) [on Step-up dates]",
    source: "Rider Specification LNL_GMWB_V2",
    subModules: ["Step-up Logic", "Ratchet Mechanism"]
  },
  {
    name: "Surrender Charge",
    definition: "Fees applied to withdrawals exceeding the free withdrawal amount during the surrender charge period.",
    formula: "SC = Withdrawal_Amount * SC_Percentage(Duration)",
    source: "Actuarial Memorandum Table A",
    subModules: ["Free Withdrawal Calc", "SC Schedule Lookup"]
  },
  {
    name: "Surrender Benefit",
    definition: "The net amount payable to the policyholder upon full surrender of the contract after adjustments for charges and market value.",
    formula: "Surrender_Benefit = AV - Surrender_Charges + MVA - Rider_Charges",
    source: "Policy Contract Section 5.2",
    subModules: ["Net AV Calc", "MVA Adjustment"]
  },
  {
    name: "Death Benefit",
    definition: "The amount payable to beneficiaries upon the death of the annuitant, often the greater of AV or premiums paid.",
    formula: "DB = max(AV, Total_Premiums_Adjusted)",
    source: "Rider Specification DB_V1",
    subModules: ["Premium Tracking", "DB Ratchet"]
  },
  {
    name: "Maturity Benefit",
    definition: "The benefit payable at the contract's maturity date if the annuitant is still living.",
    formula: "Maturity_Value = AV + Final_Interest_Credit",
    source: "Policy Contract Section 6.0",
    subModules: ["Final AV Calc", "Maturity Processing"]
  }
];

const productModules = [
  {
    name: "LNL_Base",
    title: "LNL_Base",
    runSetup: ['Product Type = OB10', 'Rider Type = "__"'],
    dataModule: "DataView_OB",
    assumptionModule: ['Mortality Module', 'Lapse Module', 'Int. Cred', '...'],
    calcEngine: "Fund Roll Forward Calculations"
  },
  {
    name: "LNL_Base_Indexed",
    title: "LNL_Base_Indexed",
    runSetup: ['Product Type = OB10', 'Rider Type = "__"', 'Index Fund Flag'],
    dataModule: "DataView_OB",
    assumptionModule: ['Mortality Module', 'Lapse Module', 'Int. Cred - Index Crediting', '...'],
    calcEngine: "Fund Roll Forward Calculations"
  },
  {
    name: "LNL_Base_Fixed",
    title: "LNL_Base_Fixed",
    runSetup: ['Product Type = OB10', 'Rider Type = "__"', 'Fixed Fund Flag'],
    dataModule: "DataView_OB",
    assumptionModule: ['Mortality Module', 'Lapse Module', 'Int. Cred - Fixed assets', '...'],
    calcEngine: "Fund Roll Forward Calculations"
  }
];

// Helper component for Product Module Tables
const ProductModuleTable = ({ 
  title, 
  runSetup, 
  dataModule, 
  assumptionModule, 
  calcEngine 
}: { 
  title: string, 
  runSetup: string[], 
  dataModule: string, 
  assumptionModule: string[], 
  calcEngine: string 
}) => {
  const maxRows = Math.max(runSetup.length, 1, assumptionModule.length, 1);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 rounded-full bg-blue-500" />
        <h3 className="font-bold text-gray-800">{title}</h3>
      </div>
      <div className="rounded-md border border-slate-200 overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-900 hover:bg-slate-900">
              <TableHead className="text-white font-bold h-9 text-xs border-r border-slate-700 text-center w-1/4">RunSetup</TableHead>
              <TableHead className="text-white font-bold h-9 text-xs border-r border-slate-700 text-center w-1/4">Data Module</TableHead>
              <TableHead className="text-white font-bold h-9 text-xs border-r border-slate-700 text-center w-1/4">Assumption Module</TableHead>
              <TableHead className="text-white font-bold h-9 text-xs text-center w-1/4">Calculation Engine</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: maxRows }).map((_, i) => (
              <TableRow key={i} className="hover:bg-transparent even:bg-slate-50/50">
                <TableCell className="border-r border-slate-200 p-2 pl-4 h-8 text-xs align-middle font-medium text-slate-700">
                  {runSetup[i] || ""}
                </TableCell>
                <TableCell className="border-r border-slate-200 p-2 pl-4 h-8 text-xs align-middle text-slate-700">
                  {i === 0 ? dataModule : ""}
                </TableCell>
                <TableCell className="border-r border-slate-200 p-2 pl-4 h-8 text-xs align-middle text-slate-700">
                  {assumptionModule[i] || ""}
                </TableCell>
                <TableCell className="p-2 pl-4 h-8 text-xs align-middle text-slate-700">
                  {i === 0 ? calcEngine : ""}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default function ModuleExplorerView() {
  const [selectedModule, setSelectedModule] = useState(modules[0]);
  const [selectedProduct, setSelectedProduct] = useState(productModules[0]);
  const [search, setSearch] = useState("");

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="h-10 w-1 bg-indigo-600 rounded-full" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Module Explorer</h1>
            <p className="text-xs text-muted-foreground mt-1">Definitions, formulas, and modular calculation logic</p>
          </div>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search modules..." 
            className="pl-9 h-9 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <Accordion type="multiple" defaultValue={[]} className="space-y-4">
        <AccordionItem value="cashflow" className="border border-border bg-white rounded-lg shadow-sm px-4">
          <AccordionTrigger className="hover:no-underline py-4">
            <div className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-indigo-600" />
              <span className="font-bold text-lg text-gray-900">Cashflow Modules</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-2 pb-6">
            <div className="grid grid-cols-12 gap-6">
              {/* Sidebar */}
              <div className="col-span-3 space-y-2">
                {modules.map((m, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedModule(m)}
                    className={`w-full text-left p-3 rounded-lg border transition-all flex items-center justify-between group ${
                      selectedModule.name === m.name 
                      ? "bg-indigo-600 border-indigo-600 text-white shadow-md" 
                      : "bg-white border-border text-gray-700 hover:border-indigo-300"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Database className={`h-4 w-4 ${selectedModule.name === m.name ? "text-indigo-100" : "text-indigo-600"}`} />
                      <span className="text-xs font-bold uppercase tracking-tight">{m.name}</span>
                    </div>
                    <ChevronRight className={`h-4 w-4 transition-transform ${selectedModule.name === m.name ? "translate-x-1" : "text-gray-300"}`} />
                  </button>
                ))}
              </div>

              {/* Content */}
              <div className="col-span-9">
                <Tabs defaultValue="definition" className="w-full">
                  <TabsList className="bg-white border border-border h-10 p-1 mb-4 shadow-sm">
                    <TabsTrigger value="definition" className="text-xs font-bold uppercase data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700">
                      <Info className="h-3.5 w-3.5 mr-2" /> Definition
                    </TabsTrigger>
                    <TabsTrigger value="calculation" className="text-xs font-bold uppercase data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700">
                      <Calculator className="h-3.5 w-3.5 mr-2" /> Calculation Details
                    </TabsTrigger>
                    <TabsTrigger value="formula" className="text-xs font-bold uppercase data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700">
                      <Code className="h-3.5 w-3.5 mr-2" /> Formula
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="definition" className="mt-0">
                    <Card className="p-6 space-y-6">
                      <div>
                        <h3 className="text-lg font-bold text-gray-900 mb-2">{selectedModule.name}</h3>
                        <p className="text-sm text-gray-600 leading-relaxed">{selectedModule.definition}</p>
                      </div>
                      <div className="pt-4 border-t border-border">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-2">Documentation Source</span>
                        <Badge variant="outline" className="text-indigo-600 bg-indigo-50 border-indigo-100">
                          <FileJson className="h-3 w-3 mr-1.5" /> {selectedModule.source}
                        </Badge>
                      </div>
                    </Card>
                  </TabsContent>

                  <TabsContent value="calculation" className="mt-0">
                    <Card className="p-6">
                      <h3 className="text-lg font-bold text-gray-900 mb-4">Modular Breakdown</h3>
                      <div className="space-y-4">
                        {selectedModule.subModules.map((sub, i) => (
                          <div key={i} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-border hover:border-indigo-200 transition-colors cursor-pointer group">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded bg-white border border-border flex items-center justify-center font-bold text-xs text-indigo-600 shadow-sm">
                                {i + 1}
                              </div>
                              <div>
                                <p className="text-sm font-bold text-gray-800">{sub}</p>
                                <p className="text-[10px] text-muted-foreground uppercase">Sub-module component</p>
                              </div>
                            </div>
                            <Button variant="ghost" size="sm" className="text-indigo-600 group-hover:bg-indigo-50">
                              View Sub-calculation <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </TabsContent>

                  <TabsContent value="formula" className="mt-0">
                    <Card className="p-6">
                      <h3 className="text-lg font-bold text-gray-900 mb-4">Mathematical Model</h3>
                      <div className="bg-slate-900 rounded-lg p-6 font-mono text-sm text-indigo-300 border border-slate-800 shadow-inner">
                        {selectedModule.formula}
                      </div>
                      <div className="mt-6 flex items-start gap-3 p-4 bg-amber-50 border border-amber-100 rounded-lg">
                        <Info className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-800 leading-relaxed">
                          This formula is used to calculate the periodic value for the {selectedModule.name} module across all product types. Variable values are sourced from the input files and rider-specific parameters.
                        </p>
                      </div>
                    </Card>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="product" className="border border-border bg-white rounded-lg shadow-sm px-4">
          <AccordionTrigger className="hover:no-underline py-4">
             <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-blue-600" />
              <span className="font-bold text-lg text-gray-900">Product Modules</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-2 pb-6">
            <div className="grid grid-cols-12 gap-6">
              {/* Sidebar */}
              <div className="col-span-3 space-y-2">
                {productModules.map((pm, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedProduct(pm)}
                    className={`w-full text-left p-3 rounded-lg border transition-all flex items-center justify-between group ${
                      selectedProduct.name === pm.name 
                      ? "bg-blue-600 border-blue-600 text-white shadow-md" 
                      : "bg-white border-border text-gray-700 hover:border-blue-300"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Database className={`h-4 w-4 ${selectedProduct.name === pm.name ? "text-blue-100" : "text-blue-600"}`} />
                      <span className="text-xs font-bold uppercase tracking-tight">{pm.name}</span>
                    </div>
                    <ChevronRight className={`h-4 w-4 transition-transform ${selectedProduct.name === pm.name ? "translate-x-1" : "text-gray-300"}`} />
                  </button>
                ))}
              </div>

              {/* Content */}
              <div className="col-span-9">
                <ProductModuleTable 
                  title={selectedProduct.title}
                  runSetup={selectedProduct.runSetup}
                  dataModule={selectedProduct.dataModule}
                  assumptionModule={selectedProduct.assumptionModule}
                  calcEngine={selectedProduct.calcEngine}
                />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
