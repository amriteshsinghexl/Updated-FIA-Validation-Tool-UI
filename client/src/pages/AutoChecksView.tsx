import React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Database, 
  Search, 
  ArrowRight, 
  AlertTriangle, 
  CheckCircle2,
  ChevronRight
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "wouter";

const StatusBadge = ({ status, value }: { status: "ok" | "warn" | "error", value: string }) => {
  if (status === "ok") {
    return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1"><CheckCircle2 className="w-3 h-3" /> {value}</Badge>;
  }
  if (status === "warn") {
    return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 gap-1"><AlertTriangle className="w-3 h-3" /> {value}</Badge>;
  }
  return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 gap-1"><AlertTriangle className="w-3 h-3" /> {value}</Badge>;
};

const ValidationRow = ({ 
  label, 
  tolerance, 
  result, 
  status 
}: { 
  label: string, 
  tolerance: string, 
  result: string, 
  status: "ok" | "warn" | "error" 
}) => (
  <TableRow className="hover:bg-muted/50">
    <TableCell className="font-medium">
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
        {label}
      </div>
    </TableCell>
    <TableCell>{tolerance}</TableCell>
    <TableCell>
      <StatusBadge status={status} value={result} />
    </TableCell>
    <TableCell>
      <Button variant="ghost" size="sm" className="h-6 text-xs text-blue-600 hover:text-blue-800">
        Investigate
      </Button>
    </TableCell>
  </TableRow>
);

export default function AutoChecksView() {
  return (
    <div className="min-h-screen bg-gray-50/50 p-6 space-y-6 animate-in fade-in duration-500">
      
      {/* Sidebar Layout */}
      <div className="grid grid-cols-12 gap-6">
        
        {/* Left Status Bar (Blue Strip in Screenshot) */}
        <div className="hidden lg:block col-span-1 bg-blue-600 rounded-lg text-white p-4 text-center writing-mode-vertical">
          <div className="h-full flex flex-col items-center justify-center gap-8">
            <span className="text-xl font-bold tracking-widest rotate-180 uppercase" style={{ writingMode: 'vertical-rl' }}>
              Auto Checks
            </span>
            <div className="w-px h-20 bg-blue-400/50" />
            <div className="flex flex-col gap-4">
              <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
              <div className="w-2 h-2 rounded-full bg-white/50" />
              <div className="w-2 h-2 rounded-full bg-white/50" />
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="col-span-12 lg:col-span-11 space-y-6">
          
          {/* Summary Header */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-6 bg-blue-50/50 border-blue-100 shadow-sm">
              <div className="grid grid-cols-[120px_1fr] gap-4 text-sm">
                <div className="font-semibold text-gray-500">Prior Step:</div>
                <div className="font-medium text-gray-900">Baseline model results</div>
                
                <div className="font-semibold text-gray-500">Current Step:</div>
                <div className="font-medium text-gray-900">Test model results</div>
                
                <div className="font-semibold text-gray-500">AXIS results:</div>
                <div className="font-medium text-gray-900">Input AXIS report files</div>
                
                <div className="font-semibold text-gray-500">Comparison:</div>
                <div className="font-medium text-gray-900">NPV / Particular period in question / Overall projection</div>
              </div>
            </Card>

            <div className="flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-gray-200 rounded-lg bg-white">
              <Database className="w-12 h-12 text-gray-300 mb-2" />
              <h3 className="font-semibold text-gray-900">Overall Projection Comparison</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                This will require additional detailed run and will potentially increase run time
              </p>
              <Button variant="outline" size="sm" className="mt-4">
                Run Full Projection
              </Button>
            </div>
          </div>

          {/* Validation Tables */}
          <Card className="shadow-sm border-border overflow-hidden">
            <div className="p-4 border-b border-border bg-gray-50/50">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Search className="w-4 h-4" /> Validation Results
              </h3>
            </div>
            
            <div className="p-6 space-y-8">
              
              {/* Module Validation */}
              <div>
                <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Module Validation</h4>
                <div className="rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
                        <TableHead>Module Name</TableHead>
                        <TableHead>Tolerance</TableHead>
                        <TableHead>Direction/Movement</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <ValidationRow label="Reserves_Stat" tolerance="< 5%" result="+2.1%" status="ok" />
                      <ValidationRow label="Cashflow_Proj" tolerance="< 5%" result="+8.4%" status="warn" />
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Sub-Module Validation */}
              <div>
                <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Sub-Module Validation</h4>
                <div className="rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
                        <TableHead>Sub-Module Name</TableHead>
                        <TableHead>Tolerance</TableHead>
                        <TableHead>Direction/Movement</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <ValidationRow label="Mortality_Base" tolerance="< 5%" result="+0.1%" status="ok" />
                      <ValidationRow label="Lapse_Shock" tolerance="< 5%" result="-12.3%" status="error" />
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Variable Validation */}
              <div>
                <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Variable Validation</h4>
                <div className="rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
                        <TableHead>Variable Name</TableHead>
                        <TableHead>Tolerance</TableHead>
                        <TableHead>Direction/Movement</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <ValidationRow label="q_x" tolerance="< 1%" result="0.0%" status="ok" />
                      <ValidationRow label="expense_alloc" tolerance="< 5%" result="+4.2%" status="ok" />
                    </TableBody>
                  </Table>
                </div>
              </div>

            </div>
          </Card>

          <div className="flex justify-end gap-3">
            <Button variant="outline">Back</Button>
            <Link href="/debug">
              <Button className="bg-blue-600 hover:bg-blue-700">
                Proceed to Debug <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
          </div>

        </div>
      </div>
    </div>
  );
}
