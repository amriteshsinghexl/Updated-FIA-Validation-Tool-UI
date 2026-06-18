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
  Menu,
  RotateCcw,
  X,
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

// ---------------------------------------------------------------------------
// Sidebar building blocks
// ---------------------------------------------------------------------------

const SidebarSection = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div className="border-b border-border/50">
    <div className="px-2 pt-2 pb-1 flex flex-col gap-0.5">{children}</div>
    <div className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground px-3 py-0.5 bg-muted/40">
      {label}
    </div>
  </div>
);

const SidebarItem = ({
  icon: Icon,
  label,
  active,
  onClick,
  href,
  className,
}: {
  icon?: any;
  label: string;
  active?: boolean;
  onClick?: () => void;
  href?: string;
  className?: string;
}) => {
  const Comp = href ? Link : "button";
  const props = href ? { href } : { onClick };
  return (
    // @ts-ignore
    <Comp {...props} className="w-full no-underline text-left">
      <div
        className={cn(
          "flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer w-full",
          active && "bg-primary/10 text-primary",
          className
        )}
      >
        {Icon && <Icon className="h-4 w-4 flex-shrink-0" />}
        <span className="truncate">{label}</span>
      </div>
    </Comp>
  );
};

function openProductData(productId: string) {
  fetch(`/api/products/${encodeURIComponent(productId)}/open-data`, {
    method: "POST",
  }).catch(console.error);
}

// ---------------------------------------------------------------------------
// LeftSidebar
// ---------------------------------------------------------------------------
export const LeftSidebar = () => {
  const [location, setLocation] = useLocation();
  const [isPinned, setIsPinned] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const isOpen = isPinned || isHovering;

  const [modelType, setModelType] = useState("STAT");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showScriptEditor, setShowScriptEditor] = useState(false);
  const [showCodeEditor, setShowCodeEditor] = useState(false);
  const { product, config } = useProduct();
  const dataIsExternal = config?.data.kind === "external";

  const [formulaEntries, setFormulaEntries] = useState<FormulaEntry[]>([]);
  const [formulaLoading, setFormulaLoading] = useState(false);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [showFormulaDialog, setShowFormulaDialog] = useState(false);
  const [activeFormula, setActiveFormula] = useState<FormulaEntry | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

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
    if (selectedFields.length === formulaFields.length) setSelectedFields([]);
    else setSelectedFields([...formulaFields]);
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
      if (selectedFields.length > 0)
        url += `?fields=${encodeURIComponent(selectedFields.join(","))}`;
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

  const handleReset = () => setLocation("/inputs");

  const formulasByPart = formulaEntries.reduce<Record<string, FormulaEntry[]>>(
    (acc, e) => {
      (acc[e.part] = acc[e.part] ?? []).push(e);
      return acc;
    },
    {}
  );

  return (
    <>
      <div
        className={cn(
          "flex-shrink-0 h-screen flex bg-card border-r border-border shadow-sm overflow-hidden z-20",
          "transition-[width] duration-200 ease-in-out",
          isOpen ? "w-56" : "w-11"
        )}
        onMouseLeave={() => setIsHovering(false)}
      >
        {/* Toggle icon strip — always visible */}
        <div className="w-11 flex-shrink-0 flex flex-col items-center pt-2.5 gap-1">
          <button
            onClick={() => setIsPinned(!isPinned)}
            onMouseEnter={() => setIsHovering(true)}
            className={cn(
              "p-2 rounded-md transition-colors hover:bg-accent cursor-pointer",
              isPinned && "bg-primary/10 text-primary"
            )}
            title={isPinned ? "Unpin sidebar" : "Open sidebar"}
          >
            {isPinned ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </div>

        {/* Sidebar content — visible when open */}
        <div
          className={cn(
            "flex-1 overflow-y-auto overflow-x-hidden transition-opacity duration-150",
            isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
        >
          {/* MODEL TYPE */}
          <SidebarSection label="Model Type">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="default"
                  className="bg-[#1e40af] hover:bg-[#1e3a8a] text-white font-bold h-8 w-full text-xs shadow-sm rounded-sm gap-2 justify-between px-3"
                >
                  {modelType} <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => setModelType("STAT")}>STAT</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setModelType("FAS")}>FAS</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setModelType("MRB")}>MRB</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarSection>

          {/* RUN */}
          <SidebarSection label="Run">
            <SidebarItem icon={Settings} label="Run Setup" href="/inputs" active={location === "/inputs"} />
            <SidebarItem icon={RotateCcw} label="Reset" onClick={handleReset} />
            <button
              className={cn(
                "w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-xs font-bold transition-all mt-0.5",
                isProcessing
                  ? "bg-orange-500 text-white animate-pulse cursor-not-allowed"
                  : "bg-green-600 hover:bg-green-700 text-white cursor-pointer"
              )}
              onClick={handleRunModel}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin flex-shrink-0" />
                  <span>Running…</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 flex-shrink-0" />
                  <span>Run Model</span>
                </>
              )}
            </button>
          </SidebarSection>

          {/* INPUT VIEWS */}
          <SidebarSection label="Input Views">
            {dataIsExternal ? (
              <SidebarItem icon={Database} label="Data View" onClick={() => openProductData(product)} />
            ) : (
              <SidebarItem icon={Database} label="Data View" active={location === "/data"} href="/data" />
            )}
            <SidebarItem icon={TableIcon} label="Assumptions" active={location === "/assumptions"} href="/assumptions" />
          </SidebarSection>

          {/* RESULTS REPORTS */}
          <SidebarSection label="Results Reports">
            <SidebarItem icon={FileText} label="Financial Summary" active={location === "/financial-summary"} href="/financial-summary" />
            <SidebarItem icon={FileText} label="Audit Report" />
            <SidebarItem icon={FileText} label="Validation Report" />
            <Popover>
              <PopoverTrigger asChild>
                <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors hover:bg-accent cursor-pointer w-full">
                  <FileSpreadsheet className="h-4 w-4 flex-shrink-0 text-indigo-500" />
                  <span className="flex-1 truncate">Formula Extraction</span>
                  <ChevronRight className="h-3 w-3 opacity-50 flex-shrink-0" />
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-2" side="right" align="start">
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase px-2 py-1 border-b flex items-center justify-between">
                    <span>ULP Output Variables</span>
                    {formulaLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                  </p>
                  <div className="flex items-center space-x-2 p-2 hover:bg-accent rounded-sm cursor-pointer border-b border-dashed border-gray-200">
                    <Checkbox
                      id="select-all-sb"
                      checked={formulaFields.length > 0 && selectedFields.length === formulaFields.length}
                      onCheckedChange={toggleAll}
                    />
                    <Label htmlFor="select-all-sb" className="text-xs font-bold cursor-pointer flex-1">
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
                        <p className="text-[9px] font-bold uppercase text-muted-foreground px-2 pt-2 pb-0.5">{part}</p>
                        {entries.map((entry) => (
                          <div key={entry.name} className="flex items-center space-x-2 px-2 py-1 hover:bg-accent rounded-sm cursor-pointer group">
                            <Checkbox
                              id={`fe-sb-${entry.name}`}
                              checked={selectedFields.includes(entry.name)}
                              onCheckedChange={() => toggleField(entry.name)}
                            />
                            <Label htmlFor={`fe-sb-${entry.name}`} className="text-[10px] cursor-pointer flex-1 leading-tight">
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
                  {exportError && <p className="text-[10px] text-red-500 px-2">{exportError}</p>}
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
          </SidebarSection>

          {/* OUTPUT */}
          <SidebarSection label="Output">
            <SidebarItem icon={Layout} label="Roll-Forward" active={location === "/roll-forward"} href="/roll-forward" />
          </SidebarSection>

          {/* DEBUG VIEW */}
          <SidebarSection label="Debug View">
            <SidebarItem icon={Bug} label="Debug Mode" active={location === "/debug"} href="/debug" />
          </SidebarSection>

          {/* CALC ENGINE */}
          <SidebarSection label="Calc Engine">
            <SidebarItem icon={Calculator} label="Calculations" active={location === "/calculation-engine"} href="/calculation-engine" />
          </SidebarSection>

          {/* QUALITY ASSURANCE */}
          <SidebarSection label="Quality Assurance">
            <SidebarItem icon={GitCompare} label="Compare" active={location === "/compare"} href="/compare" />
            <SidebarItem icon={CheckCircle2} label="Auto Checks" active={location === "/auto-checks"} href="/auto-checks" />
          </SidebarSection>

          {/* ULP ENGINE */}
          <SidebarSection label="ULP Engine">
            <SidebarItem
              icon={Cpu}
              label="ULP Engine"
              active={location === "/ulp-engine"}
              href="/ulp-engine"
              className="bg-green-50/50 border border-green-100 hover:bg-green-100/50"
            />
          </SidebarSection>

          {/* GOVERNANCE */}
          <SidebarSection label="Governance">
            <SidebarItem icon={Layers} label="Module Explorer" active={location === "/module-explorer"} href="/module-explorer" />
            <SidebarItem icon={Database} label="Data Module" active={location === "/data-module"} href="/data-module" />
            <SidebarItem icon={TableIcon} label="Assumption Module" active={location === "/assumption-module"} href="/assumption-module" />
          </SidebarSection>

          {/* DEVELOPER VIEW */}
          <SidebarSection label="Developer View">
            <SidebarItem icon={Code} label="View Code" onClick={() => setShowCodeEditor(true)} />
          </SidebarSection>
        </div>
      </div>

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
                  {activeFormula.depends_on.length ? (
                    activeFormula.depends_on.map((d) => (
                      <Badge key={d} variant="secondary" className="text-[10px] font-mono">{d}</Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">Inputs / parameters only</span>
                  )}
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

      <ScriptEditorModal open={showScriptEditor} onOpenChange={setShowScriptEditor} />
      <CodeEditorPanel open={showCodeEditor} onClose={() => setShowCodeEditor(false)} />
    </>
  );
};
