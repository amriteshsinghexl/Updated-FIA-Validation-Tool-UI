import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Download, Calculator, Play, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const FinancialCell = ({ value, isHeader = false }: { value: string | number, isHeader?: boolean }) => (
  <span className={`font-mono text-[10px] ${isHeader ? "font-bold text-slate-900" : "text-slate-700"}`}>
    {typeof value === 'number' ? 
      new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) : 
      value}
  </span>
);

// Mock simulation engine - replicating a "converted script" logic
const runProjection = (product: string, rider: string) => {
  const years = 20;
  const rows = [];
  
  let av = 100000; // Initial Account Value
  let benefitBase = 100000;
  let gmwbBalance = 100000;
  const growthRate = product === 'abc13' ? 0.05 : 0.04;
  const riderFee = rider === 'lnl_gmwb' ? 0.0125 : (rider === 'lnl_i4l' ? 0.015 : 0.005);
  const withdrawalRate = 0.05;

  for (let t = 1; t <= years; t++) {
    const bopDate = `12/31/${2024 + t - 1}`;
    const eopDate = `12/31/${2024 + t}`;
    
    const fundBop = av;
    const interest = fundBop * growthRate;
    const fundAfterInt = fundBop + interest;
    
    let withdrawal = 0;
    if (t > 5) {
       withdrawal = fundBop * withdrawalRate;
    }

    const sc = t <= 7 ? withdrawal * (0.07 - (t-1)*0.01) : 0; // Surrender Charge schedule
    
    const avBeforeCharge = fundAfterInt - withdrawal - sc;
    const charge = avBeforeCharge * riderFee;
    const avFinal = Math.max(0, avBeforeCharge - charge);

    // GMWB Logic
    if (rider === 'lnl_gmwb') {
      if (avFinal > benefitBase) {
        benefitBase = avFinal; // Step-up
      }
    }

    rows.push({
      year: t,
      bopDate,
      eopDate,
      fundBop,
      interest,
      fundAfterInt,
      withdrawal,
      sc,
      charge,
      avFinal,
      benefitBase
    });

    av = avFinal;
    if (av <= 0) break;
  }
  return rows;
};

export default function CalculationEngineView() {
  const [riderType, setRiderType] = useState("lnl_gmwb");
  const [product, setProduct] = useState("abc12");
  const [projectionData, setProjectionData] = useState<any[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);

  useEffect(() => {
    handleRun();
  }, []);

  const handleRun = () => {
    setIsCalculating(true);
    // Simulate calculation delay
    setTimeout(() => {
      const data = runProjection(product, riderType);
      setProjectionData(data);
      setIsCalculating(false);
    }, 600);
  };

  const columns = [
    "Year",
    "BOP Date",
    "EOP Date",
    "Fund BOP",
    "Interest Credited",
    "Fund After Int",
    "Withdrawals",
    "Surrender Charge",
    "Rider Charge",
    "Fund EOP",
    "Benefit Base (GMWB)"
  ];

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="h-10 w-1 bg-blue-600 rounded-full" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Calculation Engine</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Actuarial projection model • Monthly steps converted to annual view</p>
          </div>
        </div>
        <div className="flex gap-4 items-center">
          <div className="flex gap-2 items-center bg-white p-1.5 rounded-md border border-border shadow-sm">
            <span className="text-[10px] font-bold text-muted-foreground uppercase px-2">Inputs:</span>
            <Select value={riderType} onValueChange={setRiderType}>
              <SelectTrigger className="w-[140px] h-7 text-xs border-0 bg-transparent focus:ring-0">
                <SelectValue placeholder="Select Rider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lnl_base">LNL_Base (No Rider)</SelectItem>
                <SelectItem value="lnl_gmwb">LNL_GMWB (Step-up)</SelectItem>
                <SelectItem value="lnl_i4l">LNL_i4L (Income)</SelectItem>
              </SelectContent>
            </Select>
            <div className="w-px h-4 bg-gray-200 mx-1" />
            <Select value={product} onValueChange={setProduct}>
              <SelectTrigger className="w-[100px] h-7 text-xs border-0 bg-transparent focus:ring-0">
                <SelectValue placeholder="Select Product" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="abc12">ABC12 (4% Growth)</SelectItem>
                <SelectItem value="abc13">ABC13 (5% Growth)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button 
            size="sm" 
            className="h-9 bg-blue-600 hover:bg-blue-700 text-white shadow-sm gap-2"
            onClick={handleRun}
            disabled={isCalculating}
          >
            {isCalculating ? <RotateCcw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 fill-current" />}
            {isCalculating ? "Running..." : "Run Projection"}
          </Button>

          <Button variant="outline" size="sm" className="h-9">
            <Download className="mr-2 h-3.5 w-3.5" /> Export
          </Button>
        </div>
      </div>

      <Card className="shadow-sm border-border overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <Table className="border-collapse">
            <TableHeader>
              <TableRow className="bg-slate-50 hover:bg-slate-50 border-b border-slate-200">
                {columns.map((col, i) => (
                  <TableHead key={i} className="text-[10px] font-black uppercase text-slate-500 border-r border-slate-100 text-right px-4 py-3 whitespace-nowrap first:text-left first:pl-6">
                    {col}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {projectionData.map((row, i) => (
                <TableRow key={i} className="hover:bg-blue-50/50 transition-colors border-b border-slate-100 last:border-0 group">
                  <TableCell className="py-2 px-4 border-r border-slate-100 text-left pl-6 font-medium text-slate-900 text-[11px] group-hover:text-blue-700">
                    {row.year}
                  </TableCell>
                  <TableCell className="py-2 px-4 border-r border-slate-100 text-right"><FinancialCell value={row.bopDate} /></TableCell>
                  <TableCell className="py-2 px-4 border-r border-slate-100 text-right"><FinancialCell value={row.eopDate} /></TableCell>
                  <TableCell className="py-2 px-4 border-r border-slate-100 text-right"><FinancialCell value={row.fundBop} /></TableCell>
                  <TableCell className="py-2 px-4 border-r border-slate-100 text-right text-green-600"><FinancialCell value={row.interest} /></TableCell>
                  <TableCell className="py-2 px-4 border-r border-slate-100 text-right"><FinancialCell value={row.fundAfterInt} /></TableCell>
                  <TableCell className="py-2 px-4 border-r border-slate-100 text-right text-red-500"><FinancialCell value={row.withdrawal} /></TableCell>
                  <TableCell className="py-2 px-4 border-r border-slate-100 text-right text-red-400"><FinancialCell value={row.sc} /></TableCell>
                  <TableCell className="py-2 px-4 border-r border-slate-100 text-right text-amber-600"><FinancialCell value={row.charge} /></TableCell>
                  <TableCell className="py-2 px-4 border-r border-slate-100 text-right font-bold bg-slate-50/50"><FinancialCell value={row.avFinal} /></TableCell>
                  <TableCell className="py-2 px-4 border-r border-slate-100 text-right text-indigo-600 font-medium"><FinancialCell value={row.benefitBase} /></TableCell>
                </TableRow>
              ))}
              {projectionData.length === 0 && (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center text-xs text-muted-foreground">
                    Click "Run Projection" to calculate values
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
      
      <div className="flex justify-between items-center text-[10px] text-muted-foreground font-bold uppercase tracking-widest px-2">
        <div className="flex gap-4">
          <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-500" /> Positive Cash Flow</span>
          <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-500" /> Negative Cash Flow</span>
        </div>
        <span>Projection Horizon: {projectionData.length} Years | Base: STAT</span>
      </div>
    </div>
  );
}
