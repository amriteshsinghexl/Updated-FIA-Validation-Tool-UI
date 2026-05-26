import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  ChevronRight, 
  ChevronDown, 
  Search,
  Maximize2,
  Check,
  X,
  Plus
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

const SidebarSection = ({ title, items, side }: { title: string, items: string[], side: 'left' | 'right' }) => (
  <div className="flex flex-col border border-border bg-white rounded-sm overflow-hidden mb-4 shadow-sm">
    <div className="p-1.5 border-b border-border bg-gray-50 flex items-center justify-between">
      <h3 className="text-[10px] font-bold text-gray-900 uppercase tracking-tight underline decoration-1 underline-offset-2">{title}</h3>
    </div>
    <div className="max-h-[150px] overflow-y-auto">
      {items.map((item, i) => (
        <div key={i} className="px-2 py-1 text-[11px] text-blue-700 hover:bg-blue-50 cursor-pointer font-medium border-b border-border last:border-0 transition-colors">
          {item}
        </div>
      ))}
      {items.length === 0 && <div className="px-2 py-1 text-[11px] text-gray-400 italic">...</div>}
    </div>
  </div>
);

const FinancialCell = ({ value, isNegative = false }: { value: string, isNegative?: boolean }) => (
  <span className={`font-mono text-[11px] ${isNegative ? 'text-red-600' : 'text-gray-700'}`}>
    {isNegative ? `(${value})` : value}
  </span>
);

export default function DebugView() {
  const [activeTabs, setActiveTabs] = useState([{ id: 'main', title: 'Equity Indexed Interest Credited' }]);
  const [activeTabId, setActiveTabId] = useState('main');

  const addTab = (title: string) => {
    const id = title.toLowerCase().replace(/\s+/g, '-');
    if (!activeTabs.find(t => t.id === id)) {
      setActiveTabs([...activeTabs, { id, title }]);
    }
    setActiveTabId(id);
  };

  const removeTab = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (id === 'main') return;
    const newTabs = activeTabs.filter(t => t.id !== id);
    setActiveTabs(newTabs);
    if (activeTabId === id) setActiveTabId(newTabs[newTabs.length - 1].id);
  };

  const data = [
    { bop: "9/30/2025", eop: "10/7/2025", main: "—", c1: "—", c2: "—", c3: "—", c4: "—", c5: "—", c6: "—", c7: "—", c8: "—" },
    { bop: "10/7/2025", eop: "11/7/2025", main: "—", c1: "—", c2: "—", c3: "—", c4: "—", c5: "—", c6: "—", c7: "—", c8: "—" },
    { bop: "11/7/2025", eop: "12/7/2025", main: "—", c1: "—", c2: "—", c3: "—", c4: "—", c5: "—", c6: "—", c7: "—", c8: "—" },
    { bop: "12/7/2025", eop: "1/7/2026", main: "—", c1: "—", c2: "—", c3: "—", c4: "—", c5: "—", c6: "—", c7: "—", c8: "—" },
    { bop: "1/7/2026", eop: "2/7/2026", main: "44,430", c1: "23,447", c2: "8,163", c3: "12,820", c4: "—", c5: "—", c6: "—", c7: "—", c8: "—" },
    { bop: "2/7/2026", eop: "3/7/2026", main: "—", c1: "—", c2: "—", c3: "—", c4: "—", c5: "—", c6: "—", c7: "—", c8: "—" },
    { bop: "3/7/2026", eop: "4/7/2026", main: "—", c1: "—", c2: "—", c3: "—", c4: "—", c5: "—", c6: "—", c7: "—", c8: "—" },
  ];

  const formula = [
    { text: "Equity Idx Int Crd_1", color: "text-red-600" },
    { text: " + ", color: "text-gray-900" },
    { text: "Equity Idx Int Crd_2", color: "text-red-600" },
    { text: " + ", color: "text-gray-900" },
    { text: "Equity Idx Int Crd_3", color: "text-red-600" },
    { text: " + ", color: "text-gray-900" },
    { text: "Equity Idx Int Crd_4", color: "text-red-600" },
    { text: " + ", color: "text-gray-900" },
    { text: "Equity Idx Int Crd_5", color: "text-red-600" },
    { text: " + ", color: "text-gray-900" },
    { text: "Equity Idx Int Crd_6", color: "text-red-600" },
    { text: " + ", color: "text-gray-900" },
    { text: "Equity Idx Int Crd_7", color: "text-red-600" },
    { text: " + ", color: "text-gray-900" },
    { text: "Equity Idx Int Crd_8", color: "text-red-600" },
  ];

  return (
    <div className="min-h-screen bg-gray-50/50 p-4 animate-in fade-in duration-500 overflow-x-hidden">
      <div className="grid grid-cols-12 gap-4">
        
        {/* Left Sidebars */}
        <div className="col-span-2 space-y-4">
          <div className="flex flex-col border border-border bg-white rounded-sm overflow-hidden shadow-sm">
            <div className="p-1.5 border-b border-border bg-gray-50">
              <h3 className="text-[10px] font-bold text-gray-900 uppercase tracking-tight underline decoration-1 underline-offset-2">Debug Settings</h3>
            </div>
            <div className="p-2 space-y-2">
              <div className="flex items-center gap-2">
                <input type="checkbox" id="debug-policy" defaultChecked className="h-3 w-3" />
                <label htmlFor="debug-policy" className="text-[11px] text-gray-700">Debug individual policy</label>
              </div>
              <div className="flex items-center gap-2 bg-yellow-50 p-1 border border-yellow-200 rounded-sm">
                <span className="text-[10px] text-gray-500 uppercase font-bold">Policy #</span>
                <span className="text-[11px] text-blue-700 font-mono font-bold italic">XXXXX1234</span>
              </div>
            </div>
          </div>

          <SidebarSection 
            title="Modules - Uses" 
            items={['LNL_Base_IndexedFunds', 'Data View OB', 'Int_Cred_XYZ']} 
            side="left"
          />
          <SidebarSection 
            title="Sub-Modules - Uses" 
            items={['LNL_Base_IndexedFunds', 'Data View OB', 'Int_Cred_XYZ']} 
            side="left"
          />
          <SidebarSection 
            title="Variables - Uses" 
            items={[
              'Equity Idx Int Crd_1', 'Equity Idx Int Crd_2', 'Equity Idx Int Crd_3', 
              'Equity Idx Int Crd_4', 'Equity Idx Int Crd_5', 'Equity Idx Int Crd_6', 
              'Equity Idx Int Crd_7', 'Equity Idx Int Crd_8'
            ]} 
            side="left"
          />
        </div>

        {/* Main Content */}
        <div className="col-span-8 space-y-4">
          
          {/* Policy Characteristics Bar */}
          <Card className="bg-[#001529] text-white rounded-sm shadow-md overflow-x-auto">
            <div className="p-1.5 text-center text-[10px] font-bold uppercase tracking-widest border-b border-white/10">
              Policy Characteristics
            </div>
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="h-8 text-[9px] text-white font-bold text-center border-r border-white/10 px-1 uppercase leading-tight">PolicyID</TableHead>
                  <TableHead className="h-8 text-[9px] text-white font-bold text-center border-r border-white/10 px-1 uppercase leading-tight">IssAge</TableHead>
                  <TableHead className="h-8 text-[9px] text-white font-bold text-center border-r border-white/10 px-1 uppercase leading-tight">IssMonth</TableHead>
                  <TableHead className="h-8 text-[9px] text-white font-bold text-center border-r border-white/10 px-1 uppercase leading-tight">IssYear</TableHead>
                  <TableHead className="h-8 text-[9px] text-white font-bold text-center border-r border-white/10 px-1 uppercase leading-tight">IssDay</TableHead>
                  <TableHead className="h-8 text-[9px] text-white font-bold text-center border-r border-white/10 px-1 uppercase leading-tight">SOF186_Acc</TableHead>
                  <TableHead className="h-8 text-[9px] text-white font-bold text-center border-r border-white/10 px-1 uppercase leading-tight">Accumulate</TableHead>
                  <TableHead className="h-8 text-[9px] text-white font-bold text-center border-r border-white/10 px-1 uppercase leading-tight">CurrentGuai</TableHead>
                  <TableHead className="h-8 text-[9px] text-white font-bold text-center border-r border-white/10 px-1 uppercase leading-tight">US_Version</TableHead>
                  <TableHead className="h-8 text-[9px] text-white font-bold text-center border-r border-white/10 px-1 uppercase leading-tight">UF_CurrParl</TableHead>
                  <TableHead className="h-8 text-[9px] text-white font-bold text-center border-r border-white/10 px-1 uppercase leading-tight">UF_CurrSpr</TableHead>
                  <TableHead className="h-8 text-[9px] text-white font-bold text-center border-r border-white/10 px-1 uppercase leading-tight">UF_CurrCap</TableHead>
                  <TableHead className="h-8 text-[9px] text-white font-bold text-center border-r border-white/10 px-1 uppercase leading-tight">UF_GuarPar</TableHead>
                  <TableHead className="h-8 text-[9px] text-white font-bold text-center border-r border-white/10 px-1 uppercase leading-tight">UF_GuarSpr</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="border-white/10 hover:bg-white/5">
                  <TableCell className="h-8 text-[10px] text-center p-1 font-mono">65</TableCell>
                  <TableCell className="h-8 text-[10px] text-center p-1 font-mono">2</TableCell>
                  <TableCell className="h-8 text-[10px] text-center p-1 font-mono">2025</TableCell>
                  <TableCell className="h-8 text-[10px] text-center p-1 font-mono">6</TableCell>
                  <TableCell className="h-8 text-[10px] text-center p-1 font-mono">99</TableCell>
                  <TableCell className="h-8 text-[10px] text-center p-1 font-mono">783242.8</TableCell>
                  <TableCell className="h-8 text-[10px] text-center p-1 font-mono">69856.1.58</TableCell>
                  <TableCell className="h-8 text-[10px] text-center p-1 font-mono">783749.14</TableCell>
                  <TableCell className="h-8 text-[10px] text-center p-1 font-mono">F1318</TableCell>
                  <TableCell className="h-8 text-[10px] text-center p-1 font-mono">0.0975</TableCell>
                  <TableCell className="h-8 text-[10px] text-center p-1 font-mono">0</TableCell>
                  <TableCell className="h-8 text-[10px] text-center p-1 font-mono">0.0975</TableCell>
                  <TableCell className="h-8 text-[10px] text-center p-1 font-mono">0.01</TableCell>
                  <TableCell className="h-8 text-[10px] text-center p-1 font-mono">0</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Card>

          <div className="p-1 text-center text-[10px] font-bold text-blue-700 uppercase tracking-widest border border-blue-200 bg-blue-50 rounded-sm italic">
            *********** Select individual Scenario or Set of Scenario ***********
          </div>

          <div className="space-y-1">
            <div className="bg-[#001529] text-white p-1 text-center text-[10px] font-bold uppercase rounded-sm border border-white/10">
              Calc_IndexedFunds
            </div>
            <div className="bg-[#001529] text-white p-1 text-center text-[11px] font-bold uppercase rounded-sm border border-white/10">
              Equity Indexed Interest Credited
            </div>
          </div>

          {/* Formula Bar Section */}
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-gray-500 uppercase italic px-1 underline underline-offset-2">Formula bar</div>
            <div className="bg-gray-100 border border-border rounded-sm p-3 font-mono text-xs shadow-inner min-h-[60px]">
              <span className="text-gray-900 font-bold">=</span>
              {formula.map((part, i) => (
                <span 
                  key={i} 
                  className={`${part.color} ${part.color === 'text-red-600' ? 'hover:underline cursor-pointer font-bold' : ''}`}
                  onClick={() => part.color === 'text-red-600' && addTab(part.text)}
                >
                  {part.text}
                </span>
              ))}
            </div>
          </div>

          {/* Main Table View */}
          <div className="mt-4">
            <Tabs value={activeTabId} onValueChange={setActiveTabId} className="w-full">
              <TabsList className="h-8 bg-transparent p-0 gap-1 justify-start overflow-x-auto w-full border-b border-border rounded-none">
                {activeTabs.map((tab) => (
                  <TabsTrigger 
                    key={tab.id} 
                    value={tab.id}
                    className="h-8 px-4 text-[11px] font-bold uppercase tracking-tight rounded-t-sm border border-border border-b-0 data-[state=active]:bg-[#001529] data-[state=active]:text-white transition-colors flex items-center gap-2"
                  >
                    {tab.title}
                    {tab.id !== 'main' && (
                      <X className="h-3 w-3 hover:text-red-400" onClick={(e) => removeTab(e, tab.id)} />
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
              
              <TabsContent value={activeTabId} className="mt-0 outline-none">
                <Card className="rounded-none rounded-b-sm border-t-0 border-border overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-[#001529] hover:bg-[#001529] border-white/10">
                          <TableHead className="h-12 text-[10px] font-bold uppercase text-white border-r border-white/10 text-center px-2">BOP Date</TableHead>
                          <TableHead className="h-12 text-[10px] font-bold uppercase text-white border-r border-white/10 text-center px-2">EOP Date</TableHead>
                          <TableHead className="h-12 text-[10px] font-bold uppercase text-white border-r border-white/10 text-center px-2 leading-tight">Equity Indexed Interest Credited</TableHead>
                          <TableHead className="h-12 text-[10px] font-bold uppercase text-white border-r border-white/10 text-center px-2 leading-tight">Equity Idx Int Crd_1</TableHead>
                          <TableHead className="h-12 text-[10px] font-bold uppercase text-white border-r border-white/10 text-center px-2 leading-tight">Equity Idx Int Crd_2</TableHead>
                          <TableHead className="h-12 text-[10px] font-bold uppercase text-white border-r border-white/10 text-center px-2 leading-tight">Equity Idx Int Crd_3</TableHead>
                          <TableHead className="h-12 text-[10px] font-bold uppercase text-white border-r border-white/10 text-center px-2 leading-tight">Equity Idx Int Crd_4</TableHead>
                          <TableHead className="h-12 text-[10px] font-bold uppercase text-white border-r border-white/10 text-center px-2 leading-tight">Equity Idx Int Crd_5</TableHead>
                          <TableHead className="h-12 text-[10px] font-bold uppercase text-white border-r border-white/10 text-center px-2 leading-tight">Equity Idx Int Crd_6</TableHead>
                          <TableHead className="h-12 text-[10px] font-bold uppercase text-white border-r border-white/10 text-center px-2 leading-tight">Equity Idx Int Crd_7</TableHead>
                          <TableHead className="h-12 text-[10px] font-bold uppercase text-white text-center px-2 leading-tight">Equity Idx Int Crd_8</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.map((row, i) => (
                          <TableRow key={i} className="border-border hover:bg-blue-50/50 transition-colors group h-7">
                            <TableCell className="text-[10px] py-0 border-r border-border text-center font-medium">{row.bop}</TableCell>
                            <TableCell className="text-[10px] py-0 border-r border-border text-center font-medium">{row.eop}</TableCell>
                            <TableCell className="py-0 border-r border-border text-center"><FinancialCell value={`$ ${row.main}`} /></TableCell>
                            <TableCell className="py-0 border-r border-border text-center"><FinancialCell value={`$ ${row.c1}`} /></TableCell>
                            <TableCell className="py-0 border-r border-border text-center"><FinancialCell value={`$ ${row.c2}`} /></TableCell>
                            <TableCell className="py-0 border-r border-border text-center"><FinancialCell value={`$ ${row.c3}`} /></TableCell>
                            <TableCell className="py-0 border-r border-border text-center text-gray-400">$ —</TableCell>
                            <TableCell className="py-0 border-r border-border text-center text-gray-400">$ —</TableCell>
                            <TableCell className="py-0 border-r border-border text-center text-gray-400">$ —</TableCell>
                            <TableCell className="py-0 border-r border-border text-center text-gray-400">$ —</TableCell>
                            <TableCell className="py-0 text-center text-gray-400">$ —</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Right Sidebars */}
        <div className="col-span-2 space-y-4">
          <SidebarSection 
            title="Modules - Used by" 
            items={['LNL_Base']} 
            side="right"
          />
          <SidebarSection 
            title="Sub-Modules - Used by" 
            items={['Rec on illustration']} 
            side="right"
          />
          <SidebarSection 
            title="Variables - Used by" 
            items={['Equity Idx Int Crd_1', 'Equity Idx Int Crd_2', 'Equity Idx Int Crd_3']} 
            side="right"
          />
        </div>

      </div>
    </div>
  );
}
