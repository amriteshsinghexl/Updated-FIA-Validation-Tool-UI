import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileUp, GitCompare, Info, Code, Database } from "lucide-react";
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function CompareView() {
  const [isUploaded, setIsUploaded] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="h-10 w-1 bg-purple-600 rounded-full" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Comparison Tool</h1>
            <p className="text-xs text-muted-foreground mt-1">Compare results from different tools by uploading Excel or CSV files</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-8 flex flex-col items-center justify-center border-dashed border-2 bg-white hover:bg-gray-50 transition-colors cursor-pointer group relative">
          <Upload className="h-12 w-12 text-muted-foreground mb-4 group-hover:text-purple-600 transition-colors" />
          <h3 className="font-semibold text-lg">Source Model Results</h3>
          <p className="text-sm text-muted-foreground mb-4 text-center">Drag and drop or click to upload .xlsx, .xls, or .csv</p>
          <div className="flex flex-col gap-4 w-full max-w-[200px]">
            <Button variant="outline" className="gap-2">
              <FileUp className="h-4 w-4" /> Select File
            </Button>
            <Button variant="secondary" className="gap-2 bg-purple-50 text-purple-700 border-purple-100 hover:bg-purple-100 h-8 text-[10px] uppercase font-bold">
              Compare Macro
            </Button>
          </div>
        </Card>

        <Card className="p-8 flex flex-col items-center justify-center border-dashed border-2 bg-white hover:bg-gray-50 transition-colors cursor-pointer group relative">
          <Upload className="h-12 w-12 text-muted-foreground mb-4 group-hover:text-blue-600 transition-colors" />
          <h3 className="font-semibold text-lg">External Tool Results</h3>
          <p className="text-sm text-muted-foreground mb-4 text-center">Upload the results to compare against internal model</p>
          <div className="flex flex-col gap-4 w-full max-w-[200px]">
            <Button variant="outline" className="gap-2" onClick={() => setIsUploaded(true)}>
              <FileUp className="h-4 w-4" /> Select File
            </Button>
            <Button variant="secondary" className="gap-2 bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100 h-8 text-[10px] uppercase font-bold">
              Compare Macro
            </Button>
          </div>
        </Card>
      </div>

      {isUploaded && (
        <Card className="p-0 overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
          <div className="bg-slate-900 px-4 py-2 flex justify-between items-center">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <GitCompare className="h-3 w-3" /> Comparison Variance Report
            </h4>
            <div className="flex gap-4">
              <span className="text-[10px] text-green-400 font-bold uppercase">Matches: 142</span>
              <span className="text-[10px] text-red-400 font-bold uppercase">Variances: 12</span>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-100/50">
                <TableHead className="text-[10px] font-bold uppercase px-4 h-8">Module/Variable</TableHead>
                <TableHead className="text-[10px] font-bold uppercase px-4 h-8 text-right">Internal Value</TableHead>
                <TableHead className="text-[10px] font-bold uppercase px-4 h-8 text-right">External Value</TableHead>
                <TableHead className="text-[10px] font-bold uppercase px-4 h-8 text-right">Variance</TableHead>
                <TableHead className="text-[10px] font-bold uppercase px-4 h-8 text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                { name: "Total Fund BOP", internal: "1,245,678.90", external: "1,245,678.90", diff: "0.00", status: "Match" },
                { name: "Equity Indexed Int", internal: "12,450.25", external: "12,450.10", diff: "0.15", status: "Warning" },
                { name: "Rider Charge EOP", internal: "5,678.12", external: "5,680.00", diff: "1.88", status: "Variance" },
                { name: "Matured Deposits", internal: "0.00", external: "0.00", diff: "0.00", status: "Match" },
              ].map((row, i) => (
                <TableRow key={i} className="text-[11px] h-8">
                  <TableCell className="font-medium px-4">{row.name}</TableCell>
                  <TableCell className="text-right px-4 font-mono">{row.internal}</TableCell>
                  <TableCell className="text-right px-4 font-mono">{row.external}</TableCell>
                  <TableCell className={`text-right px-4 font-mono ${row.diff !== "0.00" ? "text-red-600" : ""}`}>{row.diff}</TableCell>
                  <TableCell className="text-center px-4">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                      row.status === "Match" ? "bg-green-100 text-green-700" : 
                      row.status === "Warning" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"
                    }`}>
                      {row.status}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
