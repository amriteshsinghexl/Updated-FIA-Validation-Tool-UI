import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { ChevronRight, ChevronDown, Database, Table as TableIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const DataRow = ({ label, expanded: defaultExpanded = false }: { label: string, expanded?: boolean }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  
  return (
    <div className="border-b border-border last:border-0">
      <div 
        className={cn(
          "flex items-center gap-2 p-2 hover:bg-slate-50 cursor-pointer transition-colors",
          expanded && "bg-slate-50/50"
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-6 h-6 flex items-center justify-center bg-slate-200 rounded text-[10px] font-bold text-slate-700">
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </div>
        <span className="text-xs font-bold text-slate-800 uppercase tracking-tight">{label}</span>
      </div>
      
      {expanded && (
        <div className="p-4 bg-white overflow-x-auto border-t border-slate-100">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-50 border-y border-slate-200">
                {Array.from({ length: 15 }).map((_, i) => (
                  <th key={i} className="text-[9px] font-bold uppercase text-slate-500 px-3 py-2 text-left whitespace-nowrap border-r border-slate-200">
                    Field_{i + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="hover:bg-blue-50/30 transition-colors">
                {Array.from({ length: 15 }).map((_, i) => (
                  <td key={i} className="px-3 py-2 text-[10px] font-mono text-slate-600 border-r border-slate-200 whitespace-nowrap">
                    {(Math.random() * 1000).toFixed(2)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default function DataModuleView() {
  return (
    <div className="min-h-screen bg-gray-50/50 p-6 space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <div className="h-10 w-1 bg-blue-600 rounded-full" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Data Module</h1>
          <p className="text-xs text-muted-foreground mt-1">Segregated data input groups with record-level exploration</p>
        </div>
      </div>

      <Card className="border-border shadow-sm overflow-hidden bg-white">
        <div className="bg-slate-900 px-4 py-2 flex items-center justify-between">
          <span className="text-[10px] font-bold text-white uppercase tracking-widest flex items-center gap-2">
            <Database className="h-3 w-3" /> Input Group Explorer
          </span>
          <span className="text-[10px] text-blue-400 font-bold uppercase">Total Records: 4,250</span>
        </div>
        <div className="flex flex-col">
          <DataRow label="Data View_ND" expanded={true} />
          <DataRow label="Data View_OB" />
          <DataRow label="Data View_OC" />
          <DataRow label="Data View_OP" />
          <DataRow label="Data View_PI" />
        </div>
      </Card>
    </div>
  );
}
