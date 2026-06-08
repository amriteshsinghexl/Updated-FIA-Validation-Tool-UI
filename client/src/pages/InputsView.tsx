import React, { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Upload, CheckCircle2, Settings2, Calendar, Hash, Layers, Play, Terminal, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useProduct } from "@/context/ProductContext";


type RunStatus = "idle" | "running" | "completed" | "failed";

export default function InputsView() {
  const { product, setProduct } = useProduct();

  const [runType, setRunType] = useState("portfolio");
  const [scenarioId, setScenarioId] = useState("");
  const [valuationDate, setValuationDate] = useState("Q12025");
  const [projectionMonths, setProjectionMonths] = useState("120");
  const [analysisMode, setAnalysisMode] = useState("summary");
  const [products, setProducts] = useState<{ id: string; label: string }[]>([]);

  const isVA = product === "VA";

  // Set sensible projection-month default when product changes
  useEffect(() => {
    setProjectionMonths(isVA ? "480" : "120");
  }, [isVA]);

  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [logLines, setLogLines] = useState<string[]>([]);
  const [exitCode, setExitCode] = useState<number | null>(null);

  const logEndRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  // Auto-scroll log panel to bottom as new lines arrive
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logLines]);

  // Load product list from API
  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((data) => {
        setProducts(data.products ?? []);
        if (!product && data.products?.length > 0) setProduct(data.products[0].id);
      })
      .catch(console.error);
  }, []);

  // Cleanup SSE on unmount
  useEffect(() => () => esRef.current?.close(), []);

  const handleRunCalculation = async () => {
    if (runType === "single" && !scenarioId.trim()) {
      alert(`Please enter a ${isVA ? "Policy ID" : "Scenario ID"}`);
      return;
    }
    if (!product) {
      alert("Please select a product");
      return;
    }

    // Reset previous run
    esRef.current?.close();
    setLogLines([]);
    setExitCode(null);
    setRunStatus("running");

    try {
      const body = {
        product,
        runType,
        scenarioId: runType === "single" ? scenarioId : undefined,
        mode: analysisMode === "debug" ? "per_policy" : "summary",
        months: isVA ? projectionMonths : undefined,
      };

      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        setLogLines([`Error: ${err.error ?? "Failed to start run"}`]);
        setRunStatus("failed");
        return;
      }

      const { runId } = await res.json();
      const es = new EventSource(`/api/run/${runId}/stream`);
      esRef.current = es;

      es.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.done) {
          setExitCode(msg.exitCode);
          setRunStatus(msg.exitCode === 0 ? "completed" : "failed");
          es.close();
        } else if (msg.line !== undefined) {
          setLogLines((prev) => [...prev, msg.line]);
        }
      };

      es.onerror = () => {
        setLogLines((prev) => [...prev, "[connection closed]"]);
        setRunStatus("failed");
        es.close();
      };
    } catch (err) {
      setLogLines([`Error: ${err instanceof Error ? err.message : String(err)}`]);
      setRunStatus("failed");
    }
  };

  const handleClear = () => {
    esRef.current?.close();
    setLogLines([]);
    setExitCode(null);
    setRunStatus("idle");
  };

  const statusBanner = () => {
    if (runStatus === "completed")
      return (
        <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border-b border-green-200">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <span className="text-xs font-semibold text-green-700">
            Completed — exit code {exitCode}
          </span>
        </div>
      );
    if (runStatus === "failed")
      return (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border-b border-red-200">
          <XCircle className="h-4 w-4 text-red-600" />
          <span className="text-xs font-semibold text-red-700">
            Failed — exit code {exitCode ?? "—"}
          </span>
        </div>
      );
    if (runStatus === "running")
      return (
        <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border-b border-blue-200">
          <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-xs font-semibold text-blue-700">Running…</span>
        </div>
      );
    return null;
  };

  const terminalLabel = isVA
    ? `VA/run.py${runType === "single" && scenarioId ? ` --policy-id ${scenarioId}` : ""}${projectionMonths ? ` --months ${projectionMonths}` : ""}`
    : `${product}/run_model.py${runType === "single" ? ` --scenario-id ${scenarioId}` : ""}`;

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 animate-in fade-in duration-500">
      <div className="max-w-[1600px] mx-auto space-y-6">
        <Tabs defaultValue="setup" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="setup">Run Setup Inputs</TabsTrigger>
            <TabsTrigger value="files">File Management</TabsTrigger>
          </TabsList>

          <TabsContent value="setup" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

              {/* ── Configuration Panel ── */}
              <div className="lg:col-span-4 space-y-6">
                <Card className="p-6 shadow-sm border-border bg-white space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Settings2 className="h-5 w-5 text-blue-600" />
                    <h3 className="font-semibold text-gray-900">Run Configuration</h3>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-bold uppercase text-gray-500">Valuation Date</Label>
                    <Select value={valuationDate} onValueChange={setValuationDate}>
                      <SelectTrigger className="h-10 text-sm">
                        <Calendar className="mr-2 h-4 w-4 text-gray-400" />
                        <SelectValue placeholder="Select Date" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Q12025">Q1 2025</SelectItem>
                        <SelectItem value="Q22025">Q2 2025</SelectItem>
                        <SelectItem value="Q32025">Q3 2025</SelectItem>
                        <SelectItem value="Q42025">Q4 2025</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {isVA && (
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-bold uppercase text-gray-500">Projection Months</Label>
                      <div className="flex items-center gap-2">
                        <Hash className="h-4 w-4 text-gray-400" />
                        <Input
                          type="number"
                          min="0"
                          max="1080"
                          value={projectionMonths}
                          onChange={(e) => setProjectionMonths(e.target.value)}
                          className="h-10 text-sm"
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-bold uppercase text-gray-500">Product</Label>
                    <Select value={product} onValueChange={setProduct}>
                      <SelectTrigger className="h-10 text-sm">
                        <SelectValue placeholder="Select Product" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Run Type — shown for all products */}
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-bold uppercase text-gray-500">Run Type</Label>
                    <Select value={runType} onValueChange={setRunType}>
                      <SelectTrigger className="h-10 text-sm">
                        <SelectValue placeholder="Select Run Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="portfolio">
                          {isVA ? "All Policies" : "Portfolio (all scenarios)"}
                        </SelectItem>
                        <SelectItem value="single">
                          {isVA ? "Single Policy" : "Single Scenario"}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {runType === "single" && (
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-bold uppercase text-gray-500">
                        {isVA ? "Policy ID" : "Scenario ID"}
                      </Label>
                      <Input
                        type={isVA ? "text" : "number"}
                        min={isVA ? undefined : "1"}
                        placeholder={isVA ? "e.g. 842612365" : "e.g. 1"}
                        value={scenarioId}
                        onChange={(e) => setScenarioId(e.target.value)}
                        className="h-10 text-sm"
                      />
                    </div>
                  )}

                  {/* Analysis Mode — shown for all products */}
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-bold uppercase text-gray-500">Analysis Mode</Label>
                    <Select value={analysisMode} onValueChange={setAnalysisMode}>
                      <SelectTrigger className="h-10 text-sm">
                        <SelectValue placeholder="Select Mode" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="summary">Summary</SelectItem>
                        <SelectItem value="debug">Debug (per-policy)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    onClick={handleRunCalculation}
                    disabled={runStatus === "running"}
                    className="w-full h-10 mt-4 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Play className="mr-2 h-4 w-4" />
                    {runStatus === "running"
                      ? "Running…"
                      : isVA
                      ? "Run VA Model"
                      : runType === "portfolio"
                      ? "Run Portfolio"
                      : "Run Single Scenario"}
                  </Button>
                </Card>
              </div>

              {/* ── Output / Log Panel ── */}
              <div className="lg:col-span-8">
                {runStatus === "idle" ? (
                  <div className="p-12 border-2 border-dashed border-gray-200 rounded-lg text-center">
                    <Layers className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-slate-500 text-sm">
                      Select a product and run type, then click Run to start the model.
                    </p>
                  </div>
                ) : (
                  <Card className="shadow-sm border-border bg-white overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gray-900">
                      <div className="flex items-center gap-2">
                        <Terminal className="h-4 w-4 text-gray-400" />
                        <span className="text-xs font-mono text-gray-300">
                          {terminalLabel}
                        </span>
                      </div>
                      <button
                        onClick={handleClear}
                        className="text-gray-500 hover:text-gray-300 transition-colors"
                        title="Clear"
                      >
                        <XCircle className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Status banner */}
                    {statusBanner()}

                    {/* Log output */}
                    <div className="bg-gray-950 h-[420px] overflow-y-auto p-4 font-mono text-xs leading-5">
                      {logLines.length === 0 && runStatus === "running" && (
                        <span className="text-gray-500">Starting process…</span>
                      )}
                      {logLines.map((line, i) => (
                        <div
                          key={i}
                          className={cn(
                            "whitespace-pre-wrap break-all",
                            line.startsWith("[stderr]") || line.startsWith("[error]")
                              ? "text-red-400"
                              : line.startsWith("=")
                              ? "text-yellow-300 font-bold"
                              : "text-green-300"
                          )}
                        >
                          {line}
                        </div>
                      ))}
                      <div ref={logEndRef} />
                    </div>

                    {/* Line count footer */}
                    <div className="px-4 py-2 border-t border-border bg-gray-900 text-right">
                      <span className="text-[10px] text-gray-500 font-mono">
                        {logLines.length} lines
                      </span>
                    </div>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="files">
            <Card className="shadow-sm border-border bg-white p-6">
              <div className="text-center py-12">
                <Upload className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900">Detailed File Management</h3>
                <p className="text-sm text-gray-500">All input files are managed here.</p>
              </div>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-between px-12 relative max-w-2xl mx-auto pt-8">
          <div className="absolute top-1/2 left-0 w-full h-0.5 bg-gray-200 -z-10" />
          {[1, 2, 3, 4, 5, 6, 7].map((step) => (
            <div
              key={step}
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all",
                step === 1 ? "bg-black text-white border-black" : "bg-white text-gray-400 border-gray-300"
              )}
            >
              {step}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
