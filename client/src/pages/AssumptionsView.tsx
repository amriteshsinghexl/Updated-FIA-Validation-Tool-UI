import React from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, TrendingUp, ShieldAlert, Layers, Upload, FileType, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

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

const DropZone = ({ label, active = false }: { label: string, active?: boolean }) => (
  <div className={cn(
    "h-32 border-2 border-dashed rounded-lg flex flex-col items-center justify-center p-4 text-center transition-colors cursor-pointer group",
    active ? "border-blue-500 bg-blue-50/50" : "border-gray-300 hover:border-blue-400 hover:bg-gray-50"
  )}>
    <div className={cn(
      "h-8 w-8 rounded-full flex items-center justify-center mb-2 transition-colors",
      active ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-400 group-hover:bg-blue-50 group-hover:text-blue-500"
    )}>
      <Upload className="h-4 w-4" />
    </div>
    <p className="text-xs font-medium text-gray-900">{label}</p>
    <p className="text-[10px] text-muted-foreground mt-0.5">Drag and drop files here</p>
  </div>
);

const AssumptionsView = () => {
  const [location, setLocation] = useLocation();
  const liabilityAssumptions = [
    { parameter: "Mortality Rate", value: "2024 VBT Table", source: "Liability Input", category: "Demographic" },
    { parameter: "Lapse Rate", value: "Dynamic - 5% Base", source: "Liability Input", category: "Behavioral" },
    { parameter: "Expense Load", value: "1.2% of AUM", source: "Liability Input", category: "Financial" },
  ];

  const assetAssumptions = [
    { parameter: "Reinvestment Yield", value: "4.5% Fixed Income", source: "Asset Input", category: "Yield" },
    { parameter: "Default Risk", value: "12bps per annum", source: "Asset Input", category: "Credit" },
    { parameter: "Spread Curve", value: "UST + 150bps", source: "Asset Input", category: "Market" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Model Assumptions</h1>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => setLocation("/assumption-module")}
          className="gap-2 bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 shadow-sm font-bold"
        >
          <Layers className="h-4 w-4" /> Assumption Module Macro
        </Button>
      </div>

      {/* Drag and Drop Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-4">
          <DropZone label="Liability input files" active />
          <Card className="shadow-sm border-border bg-white overflow-hidden">
            <div className="bg-gray-50/50 px-4 py-2 border-b border-border">
              <h3 className="text-xs font-bold uppercase text-gray-500">Liability Mapping</h3>
            </div>
            <div className="divide-y divide-border">
              <FileRow label="Base Mortality (NY)" systemName="2025_BaseMort_NY" status="ok" />
            </div>
          </Card>
        </div>
        <div className="space-y-4">
          <DropZone label="Asset input files" />
          <Card className="shadow-sm border-border bg-white overflow-hidden">
            <div className="bg-gray-50/50 px-4 py-2 border-b border-border">
              <h3 className="text-xs font-bold uppercase text-gray-500">Asset Mapping</h3>
            </div>
            <div className="divide-y divide-border">
              <FileRow label="Yield Curve Scenarios" systemName="12M25_YC_50scenario" status="ok" />
            </div>
          </Card>
        </div>
      </div>

      <Tabs defaultValue="liability" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="liability">Liability Assumptions</TabsTrigger>
          <TabsTrigger value="asset">Asset Assumptions</TabsTrigger>
        </TabsList>

        <TabsContent value="liability" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-blue-600" />
              <CardTitle>Liability Side Parameters</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader className="bg-slate-900">
                  <TableRow>
                    <TableHead className="text-white">Parameter</TableHead>
                    <TableHead className="text-white">Value/Basis</TableHead>
                    <TableHead className="text-white">Category</TableHead>
                    <TableHead className="text-white">Source File</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {liabilityAssumptions.map((item) => (
                    <TableRow key={item.parameter} className="hover:bg-slate-50">
                      <TableCell className="font-medium">{item.parameter}</TableCell>
                      <TableCell>{item.value}</TableCell>
                      <TableCell>{item.category}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{item.source}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="asset" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              <CardTitle>Asset Side Parameters</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader className="bg-slate-900">
                  <TableRow>
                    <TableHead className="text-white">Parameter</TableHead>
                    <TableHead className="text-white">Value/Basis</TableHead>
                    <TableHead className="text-white">Category</TableHead>
                    <TableHead className="text-white">Source File</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assetAssumptions.map((item) => (
                    <TableRow key={item.parameter} className="hover:bg-slate-50">
                      <TableCell className="font-medium">{item.parameter}</TableCell>
                      <TableCell>{item.value}</TableCell>
                      <TableCell>{item.category}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{item.source}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AssumptionsView;
