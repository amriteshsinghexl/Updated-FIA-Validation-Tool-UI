import React, { useState, useEffect, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  Database,
  Play,
  FileText,
  Bug,
  GitCompare,
  Code,
  ChevronDown,
  Layout,
  Settings,
  Table as TableIcon,
  Calculator,
  ChevronRight,
  CheckCircle2,
  FileSpreadsheet,
  Layers,
  Cpu,
  Download,
  Loader2,
  Info,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ScriptEditorModal } from "@/components/ScriptEditorModal";
import { CodeEditorPanel } from "@/components/CodeEditorPanel";
import { useProduct } from "@/context/ProductContext";

// ---------------------------------------------------------------------------
// ULP Formula API
// ---------------------------------------------------------------------------
const ULP_BASE =
  (import.meta as any).env?.VITE_ULP_API_BASE ?? "http://localhost:8000";

interface FormulaEntry {
  name: string;
  display_name: string;
  formula: string;
  depends_on: string[];
  part: string;
  description: string;
  python_source: string | null;
}

async function fetchFormulaRegistry(): Promise<FormulaEntry[]> {
  const res = await fetch(`${ULP_BASE}/api/v1/outputs/formulas`);
  if (!res.ok) throw new Error("Formula registry unavailable");
  const data = await res.json();
  return data.formulas as FormulaEntry[];
}

async function fetchLatestRun(): Promise<{ run: string; scenario_id: number } | null> {
  try {
    const res = await fetch(`${ULP_BASE}/api/v1/outputs`);
    if (!res.ok) return null;
    const data = await res.json();
    const runs: { run: string; files: string[] }[] = data.runs ?? [];
    if (!runs.length) return null;
    const latest = runs[runs.length - 1];
    const summaryFile = latest.files.find(
      (f: string) => f.startsWith("summary_scen") && f.endsWith(".csv")
    );
    if (!summaryFile) return null;
    const match = summaryFile.match(/scen(\d+)/i);
    return { run: latest.run, scenario_id: match ? parseInt(match[1]) : 1 };
  } catch {
    return null;
  }
}

interface NavGroupProps {
  label: string;
  children: React.ReactNode;
  className?: string;
}

const NavGroup = ({ label, children, className }: NavGroupProps) => (
  <div className={cn("flex flex-col h-full border-r border-border px-2 min-w-max", className)}>
    <div className="flex-1 flex items-center justify-center gap-1 px-1">
      {children}
    </div>
    <div className="text-[10px] uppercase font-bold text-muted-foreground text-center bg-muted/30 -mx-2 py-0.5 mt-1 border-t border-border/50">
      {label}
    </div>
  </div>
);

const NavButton = ({ 
  icon: Icon, 
  label, 
  active, 
  onClick, 
  variant = "ghost",
  href,
  className
}: { 
  icon?: any, 
  label: string, 
  active?: boolean, 
  onClick?: () => void,
  variant?: "ghost" | "default" | "outline" | "secondary",
  href?: string,
  className?: string
}) => {
  const Comp = href ? Link : 'button';
  const props = href ? { href } : { onClick };
  
  return (
    // @ts-ignore
    <Comp {...props} className="no-underline">
      <div 
        className={cn(
          "flex flex-col items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer min-w-[70px]",
          active && "bg-primary/10 text-primary border border-primary/20",
          !active && variant === "default" && "bg-primary text-primary-foreground hover:bg-primary/90",
          className
        )}
      >
        {Icon && <Icon className="h-5 w-5" />}
        <span className="whitespace-nowrap">{label}</span>
      </div>
    </Comp>
  );
};

const VA_DATA_DIR = "C:\\projects\\VA\\data";
const VA_RESULTS_DIR = "C:\\projects\\VA\\results";

function openVAFile(filePath: string) {
  fetch("/api/open-file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filePath }),
  }).catch(console.error);
}

export const TopRibbon = () => {
  const [location, setLocation] = useLocation();
  const [modelType, setModelType] = useState("STAT");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showScriptEditor, setShowScriptEditor] = useState(false);
  const [showCodeEditor, setShowCodeEditor] = useState(false);
  const { product } = useProduct();
  const isVA = product === "VA";

  // Formula Extraction state
  const [formulaEntries, setFormulaEntries] = useState<FormulaEntry[]>([]);
  const [formulaLoading, setFormulaLoading] = useState(false);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [showFormulaDialog, setShowFormulaDialog] = useState(false);
  const [activeFormula, setActiveFormula] = useState<FormulaEntry | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Load formulas from ULP backend on mount
  useEffect(() => {
    setFormulaLoading(true);
    fetchFormulaRegistry()
      .then(setFormulaEntries)
      .catch(() => setFormulaEntries([]))
      .finally(() => setFormulaLoading(false));
  }, []);

  const formulaFields = formulaEntries.length
    ? formulaEntries.map((e) => e.name)
    : [];

  const toggleAll = () => {
    if (selectedFields.length === formulaFields.length) {
      setSelectedFields([]);
    } else {
      setSelectedFields([...formulaFields]);
    }
  };

  const toggleField = (field: string) => {
    setSelectedFields((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]
    );
  };

  const handleShowFormula = (name: string) => {
    const entry = formulaEntries.find((e) => e.name === name) ?? null;
    setActiveFormula(entry);
    setShowFormulaDialog(true);
  };

  const handleExportExcel = useCallback(async () => {
    setExporting(true);
    setExportError(null);
    try {
      const latest = await fetchLatestRun();
      if (!latest) {
        setExportError("No completed ULP run found. Run the model first.");
        return;
      }
      let url = `${ULP_BASE}/api/v1/outputs/${encodeURIComponent(latest.run)}/excel/${latest.scenario_id}`;
      if (selectedFields.length > 0) {
        url += `?fields=${encodeURIComponent(selectedFields.join(","))}`;
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const blob = await res.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `ulp_${latest.run}_scen${latest.scenario_id}_formulas.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err: any) {
      setExportError(err.message ?? "Export failed");
    } finally {
      setExporting(false);
    }
  }, [selectedFields]);

  const handleRunModel = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setLocation("/data");
    }, 1500);
  };

  const handleReset = () => {
    setLocation("/inputs");
  };

  // Group formula entries by part
  const formulasByPart = formulaEntries.reduce<Record<string, FormulaEntry[]>>(
    (acc, e) => {
      (acc[e.part] = acc[e.part] ?? []).push(e);
      return acc;
    },
    {}
  );

  return (
    <>
    <div className="w-full bg-card border-b border-border shadow-sm flex items-stretch h-24 overflow-x-auto" onClick={() => setShowScriptEditor(false)}>
      {/* Model Type */}
      <NavGroup label="Model Type">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="default" className="bg-[#1e40af] hover:bg-[#1e3a8a] text-white font-bold h-10 px-6 shadow-md rounded-sm gap-2">
              {modelType} <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => setModelType("STAT")}>STAT</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setModelType("FAS")}>FAS</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setModelType("MRB")}>MRB</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </NavGroup>

      {/* Run */}
      <NavGroup label="Run">
        <div className="flex gap-2">
          <div className="flex flex-col gap-1">
            <Link href="/inputs">
              <Button variant="default" size="sm" className="w-full justify-start h-7 text-xs bg-blue-600 hover:bg-blue-700">
                <Settings className="mr-2 h-3.5 w-3.5" />
                Run Setup
              </Button>
            </Link>
            <Button variant="outline" size="sm" className="w-full justify-start h-7 text-xs" onClick={handleReset}>
              Reset
            </Button>
          </div>
          
          <div className="flex items-center">
            <Button 
              variant="default" 
              className={cn(
                "h-15 w-15 flex flex-col items-center justify-center text-white shadow-lg transition-all",
                isProcessing ? "bg-orange-500 hover:bg-orange-600 animate-pulse" : "bg-green-600 hover:bg-green-700"
              )}
              onClick={handleRunModel}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <div className="h-6 w-6 border-2 border-white/30 border-t-white rounded-full animate-spin mb-1" />
                  <span className="text-[10px] font-bold uppercase">Wait</span>
                </>
              ) : (
                <>
                  <Play className="h-6 w-6 mb-1" />
                  <span className="text-[10px] font-bold uppercase">Run</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </NavGroup>

      {/* Inputs View */}
      <NavGroup label="Input Views">
        <div className="flex gap-2">
          {isVA ? (
            <>
              <NavButton
                icon={Database}
                label="Data View"
                onClick={() => openVAFile(`${VA_DATA_DIR}\\Input_PolicyDataRaw.xlsx`)}
              />
              <NavButton
                icon={TableIcon}
                label="Assumptions"
                active={location === "/va-assumptions"}
                href="/va-assumptions"
              />
            </>
          ) : (
            <>
              <NavButton icon={Database} label="Data View" active={location === "/data"} href="/data" />
              <NavButton icon={TableIcon} label="Assumptions" active={location === "/assumptions"} href="/assumptions" />
            </>
          )}
        </div>
      </NavGroup>

      {/* Results Reports */}
      <NavGroup label="Results Reports">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-10 px-4 text-xs font-semibold gap-2 border-border">
              <FileText className="h-4 w-4" /> Reports <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem className="text-xs py-2" onClick={() => setLocation(isVA ? "/va-financial-summary" : "/financial-summary")}>Financial Summary</DropdownMenuItem>
            <DropdownMenuItem className="text-xs py-2">Audit Report</DropdownMenuItem>
            <DropdownMenuItem className="text-xs py-2">Validation Report</DropdownMenuItem>
            <DropdownMenuSeparator />
            <Popover>
              <PopoverTrigger asChild>
                <div className="flex items-center justify-between w-full px-2 py-2 text-xs hover:bg-accent cursor-pointer rounded-sm">
                  <span className="flex items-center gap-2">
                    <FileSpreadsheet className="h-3.5 w-3.5 text-indigo-500" />
                    Formula Extraction
                  </span>
                  <ChevronRight className="h-3 w-3 opacity-50" />
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-2" side="right" align="start">
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase px-2 py-1 border-b flex items-center justify-between">
                    <span>ULP Output Variables</span>
                    {formulaLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                  </p>

                  {/* Select All */}
                  <div className="flex items-center space-x-2 p-2 hover:bg-accent rounded-sm cursor-pointer border-b border-dashed border-gray-200">
                    <Checkbox
                      id="select-all"
                      checked={formulaFields.length > 0 && selectedFields.length === formulaFields.length}
                      onCheckedChange={toggleAll}
                    />
                    <Label htmlFor="select-all" className="text-xs font-bold cursor-pointer flex-1">
                      Select All ({formulaFields.length})
                    </Label>
                  </div>

                  <ScrollArea className="h-64">
                    {formulaEntries.length === 0 && !formulaLoading && (
                      <p className="text-[10px] text-muted-foreground px-2 py-3">
                        ULP backend not reachable. Start the backend and refresh.
                      </p>
                    )}
                    {Object.entries(formulasByPart).map(([part, entries]) => (
                      <div key={part}>
                        <p className="text-[9px] font-bold uppercase text-muted-foreground px-2 pt-2 pb-0.5">
                          {part}
                        </p>
                        {entries.map((entry) => (
                          <div
                            key={entry.name}
                            className="flex items-center space-x-2 px-2 py-1 hover:bg-accent rounded-sm cursor-pointer group"
                          >
                            <Checkbox
                              id={`fe-${entry.name}`}
                              checked={selectedFields.includes(entry.name)}
                              onCheckedChange={() => toggleField(entry.name)}
                            />
                            <Label
                              htmlFor={`fe-${entry.name}`}
                              className="text-[10px] cursor-pointer flex-1 leading-tight"
                            >
                              {entry.display_name}
                            </Label>
                            <button
                              title="View formula"
                              onClick={(e) => { e.stopPropagation(); handleShowFormula(entry.name); }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Info className="h-3 w-3 text-indigo-400 hover:text-indigo-600" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ))}
                  </ScrollArea>

                  {exportError && (
                    <p className="text-[10px] text-red-500 px-2">{exportError}</p>
                  )}

                  <Button
                    size="sm"
                    className="w-full mt-1 h-7 text-[10px] uppercase font-bold bg-indigo-600 hover:bg-indigo-700 gap-1"
                    onClick={handleExportExcel}
                    disabled={exporting}
                  >
                    {exporting ? (
                      <><Loader2 className="h-3 w-3 animate-spin" /> Generating…</>
                    ) : (
                      <><Download className="h-3 w-3" /> Export to Excel ({selectedFields.length})</>
                    )}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            {/* Formula detail dialog */}
            <Dialog open={showFormulaDialog} onOpenChange={setShowFormulaDialog}>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4 text-indigo-500" />
                    {activeFormula?.display_name ?? "Formula"}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    {activeFormula?.part}
                  </DialogDescription>
                </DialogHeader>
                {activeFormula && (
                  <div className="space-y-4 text-sm">
                    <div>
                      <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Formula</p>
                      <pre className="bg-muted rounded p-3 text-xs font-mono whitespace-pre-wrap break-words">
                        {activeFormula.formula}
                      </pre>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Depends On</p>
                      <div className="flex flex-wrap gap-1">
                        {activeFormula.depends_on.length ? activeFormula.depends_on.map((d) => (
                          <Badge key={d} variant="secondary" className="text-[10px] font-mono">{d}</Badge>
                        )) : <span className="text-xs text-muted-foreground">Inputs / parameters only</span>}
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Description</p>
                      <p className="text-xs leading-relaxed">{activeFormula.description}</p>
                    </div>
                    {activeFormula.python_source && (
                      <div>
                        <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">
                          Python Source (AST-extracted)
                        </p>
                        <pre className="bg-muted rounded p-3 text-[10px] font-mono whitespace-pre-wrap break-words max-h-48 overflow-auto">
                          {activeFormula.python_source}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </DropdownMenuContent>
        </DropdownMenu>
      </NavGroup>

      {/* Output */}
      <NavGroup label="Output">
        <NavButton icon={Layout} label="Roll-Forward" active={location === "/roll-forward"} href="/roll-forward" />
      </NavGroup>

      {/* Debug View */}
      <NavGroup label="Debug view">
        <NavButton icon={Bug} label="Debug Mode" active={location === "/debug"} href="/debug" />
      </NavGroup>

      {/* Calculation Engine */}
      <NavGroup label="Calc Engine">
        <NavButton icon={Calculator} label="Calculations" active={location === "/calculation-engine"} href="/calculation-engine" />
      </NavGroup>

      {/* Quality Assurance */}
      <NavGroup label="Quality Assurance">
        <div className="flex gap-2">
          <NavButton 
            icon={GitCompare} 
            label="Compare" 
            active={location === "/compare"}
            href="/compare"
          />
          <NavButton 
            icon={CheckCircle2} 
            label="Automatic Checks" 
            active={location === "/auto-checks"}
            href="/auto-checks"
          />
        </div>
      </NavGroup>

      {/* ULP Engine */}
      <NavGroup label="ULP Engine">
        <NavButton
          icon={Cpu}
          label="ULP Engine"
          active={location === "/ulp-engine"}
          href="/ulp-engine"
          className="h-12 w-28 bg-green-50/50 border-green-100 hover:bg-green-100/50"
        />
      </NavGroup>

      <div className="flex-1" />

      {/* Module Explorer */}
      <NavGroup label="Governance" className="border-l border-border pl-4">
        <div className="flex gap-2">
          <NavButton 
            icon={Layers} 
            label="Module Explorer" 
            active={location === "/module-explorer"}
            href="/module-explorer"
            className="h-12 w-28 bg-indigo-50/50 border-indigo-100 hover:bg-indigo-100/50"
          />
          <NavButton 
            icon={Database} 
            label="Data Module" 
            active={location === "/data-module"}
            href="/data-module"
            className="h-12 w-28 bg-blue-50/50 border-blue-100 hover:bg-blue-100/50"
          />
          <NavButton 
            icon={TableIcon} 
            label="Assumption Module" 
            active={location === "/assumption-module"}
            href="/assumption-module"
            className="h-12 w-32 bg-amber-50/50 border-amber-100 hover:bg-amber-100/50"
          />
        </div>
      </NavGroup>

      {/* Developer View */}
      <NavGroup label="Developer View">
        <div onClick={(e) => e.stopPropagation()}>
          <NavButton icon={Code} label="View Code" variant="default" onClick={() => setShowCodeEditor(true)} />
        </div>
      </NavGroup>

    </div>
    <ScriptEditorModal open={showScriptEditor} onOpenChange={setShowScriptEditor} />
    <CodeEditorPanel open={showCodeEditor} onClose={() => setShowCodeEditor(false)} />
    </>
  );
};
