import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Upload, FileType, CheckCircle2, AlertCircle, Settings2, Calendar, Hash, Layers, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

const FileRow = ({ 
  label, 
  systemName, 
  status 
}: { 
  label: string, 
  systemName?: string, 
  status: "ok" | "error" | "pending" 
}) => (
  <div className="grid grid-cols-12 gap-4 items-center py-4 border-b border-border last:border-0 hover:bg-gray-50/50 px-4 transition-colors">
    <div className="col-span-4">
      <div className="font-medium text-sm text-gray-900">{label}</div>
    </div>
    <div className="col-span-2">
      <select className="w-full h-8 text-xs border border-gray-300 rounded bg-white px-2">
        <option>Yes</option>
        <option>No</option>
      </select>
    </div>
    <div className="col-span-4">
      {systemName && (
        <div className="flex items-center gap-2 overflow-hidden">
          <FileType className="h-4 w-4 text-blue-500 flex-shrink-0" />
          <div className="text-sm font-mono text-gray-700 truncate">{systemName}</div>
        </div>
      )}
    </div>
    <div className="col-span-2 flex justify-end">
      {status === "ok" && <CheckCircle2 className="h-5 w-5 text-green-500" />}
      {status === "error" && <AlertCircle className="h-5 w-5 text-red-500" />}
      {status === "pending" && <div className="h-2 w-2 rounded-full bg-gray-300" />}
    </div>
  </div>
);

export default function InputsView() {
  const [runType, setRunType] = useState("portfolio");
  const [policyId, setPolicyId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [calculationResult, setCalculationResult] = useState<any>(null);
  const [valuationDate, setValuationDate] = useState("Q12025");
  const [projectionMonths, setProjectionMonths] = useState("120");
  const [product, setProduct] = useState("va");
  const [analysisMode, setAnalysisMode] = useState("summary");

  const handleRunCalculation = async () => {
    if (runType === "single" && !policyId.trim()) {
      alert("Please enter a Policy ID");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/calculate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          runType,
          policyId: runType === "single" ? policyId : null,
          valuationDate,
          projectionMonths: parseInt(projectionMonths),
          product,
          analysisMode,
        }),
      });

      if (!response.ok) {
        throw new Error("Calculation failed");
      }

      const result = await response.json();
      setCalculationResult(result);
    } catch (error) {
      console.error("Error running calculation:", error);
      alert("Error running calculation. Please check the console.");
    } finally {
      setIsLoading(false);
    }
  };

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
              {/* Configuration Panel */}
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

                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-bold uppercase text-gray-500">Projection Months</Label>
                      <div className="flex items-center gap-2">
                        <Hash className="h-4 w-4 text-gray-400" />
                        <Input type="number" min="0" max="120" value={projectionMonths} onChange={(e) => setProjectionMonths(e.target.value)} className="h-10 text-sm" />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-bold uppercase text-gray-500">Product</Label>
                      <Select value={product} onValueChange={setProduct}>
                        <SelectTrigger className="h-10 text-sm">
                          <SelectValue placeholder="Select Product" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="va">VA (Variable Annuity)</SelectItem>
                          <SelectItem value="fia">FIA (Fixed Indexed Annuity)</SelectItem>
                          <SelectItem value="fixed">Fixed Annuity</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-bold uppercase text-gray-500">Run Type</Label>
                      <Select value={runType} onValueChange={setRunType}>
                        <SelectTrigger className="h-10 text-sm">
                          <SelectValue placeholder="Select Run Type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="single">Single Policy</SelectItem>
                          <SelectItem value="portfolio">Portfolio</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {runType === "single" && (
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-bold uppercase text-gray-500">Policy ID</Label>
                        <Input 
                          type="text" 
                          placeholder="Enter Policy ID"
                          value={policyId}
                          onChange={(e) => setPolicyId(e.target.value)}
                          className="h-10 text-sm"
                        />
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-bold uppercase text-gray-500">Analysis Mode</Label>
                      <Select value={analysisMode} onValueChange={setAnalysisMode}>
                        <SelectTrigger className="h-10 text-sm">
                          <SelectValue placeholder="Select Mode" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="summary">Summary</SelectItem>
                          <SelectItem value="debug">Debug</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Button 
                      onClick={handleRunCalculation}
                      disabled={isLoading}
                      className="w-full h-10 mt-4 bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <Play className="mr-2 h-4 w-4" />
                      {isLoading ? "Running Calculation..." : "Run Calculation"}
                    </Button>
                </Card>
              </div>

              {/* Input Mapping Panel */}
              <div className="lg:col-span-8 space-y-6">
                {calculationResult ? (
                  <Card className="p-6 bg-green-50 border-green-200">
                    <div className="flex items-start gap-3 mb-4">
                      <CheckCircle2 className="h-6 w-6 text-green-600 flex-shrink-0 mt-1" />
                      <div>
                        <h3 className="font-semibold text-green-900">Calculation Complete</h3>
                        <p className="text-sm text-green-700 mt-1">Results displayed below</p>
                      </div>
                    </div>
                    <div className="bg-white rounded p-4 overflow-auto max-h-96">
                      <pre className="text-xs text-gray-700 font-mono">
                        {JSON.stringify(calculationResult, null, 2)}
                      </pre>
                    </div>
                  </Card>
                ) : (
                  <div className="p-12 border-2 border-dashed border-gray-200 rounded-lg text-center">
                    <Layers className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-slate-500 text-sm">Upload specific inforce or assumption files in their respective tabs</p>
                  </div>
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
            <div key={step} className={cn("w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all", step === 1 ? "bg-black text-white border-black" : "bg-white text-gray-400 border-gray-300")}>
              {step}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
