import React from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Database, FileSpreadsheet, FileText, Download, Upload, FileType, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

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

const DataView = () => {
  const [location, setLocation] = useLocation();
  const inforceFiles = [
    { name: "Inforce_Life_2025Q4.csv", size: "124 MB", records: "1.2M", type: "Liability" },
    { name: "Inforce_Annuity_2025Q4.csv", size: "85 MB", records: "450k", type: "Liability" },
    { name: "Asset_Positions_202512.xlsx", size: "12 MB", records: "15k", type: "Asset" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Data Inputs</h1>
        <div className="flex gap-3">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setLocation("/data-module")}
            className="gap-2 bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 shadow-sm font-bold"
          >
            <Database className="h-4 w-4" /> Data Module Macro
          </Button>
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" /> Export All
          </Button>
        </div>
      </div>

      {/* Drag and Drop Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <DropZone label="Inforce files" active />
        <div className="md:col-span-2 space-y-4">
          <Card className="shadow-sm border-border bg-white overflow-hidden">
            <div className="bg-gray-50/50 px-4 py-2 border-b border-border flex justify-between items-center">
              <h3 className="text-xs font-bold uppercase text-gray-500">Product Mapping</h3>
            </div>
            <div className="divide-y divide-border">
              <FileRow label="FIA Product Files" systemName="FIA_XX_XX_12M2025" status="ok" />
              <FileRow label="VA Product Files" systemName="VA_XX_XX_12M2025" status="error" />
            </div>
          </Card>
          <div className="bg-slate-50 border rounded-lg p-4 flex items-center justify-center text-slate-400 text-sm italic h-16">
            Upload new inforce data to refresh model inputs
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Files</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">12</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Records</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">1,665,000</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Size</CardTitle>
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">221 MB</div>
          </CardContent>
        </Card>
      </div>

      <Card shadow-sm border-border bg-white>
        <CardHeader>
          <CardTitle className="text-lg font-bold">Current Data Characteristics</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader className="bg-slate-900">
              <TableRow>
                <TableHead className="text-white">File Name</TableHead>
                <TableHead className="text-white">Type</TableHead>
                <TableHead className="text-white">Records</TableHead>
                <TableHead className="text-white">Size</TableHead>
                <TableHead className="text-right text-white">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inforceFiles.map((file) => (
                <TableRow key={file.name} className="hover:bg-slate-50">
                  <TableCell className="font-medium">{file.name}</TableCell>
                  <TableCell>{file.type}</TableCell>
                  <TableCell>{file.records}</TableCell>
                  <TableCell>{file.size}</TableCell>
                  <TableCell className="text-right">
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                      Validated
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default DataView;
