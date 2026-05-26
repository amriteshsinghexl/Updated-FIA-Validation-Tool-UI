import React, { useState } from "react";
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
import { Download, FileText } from "lucide-react";
import { useLocation } from "wouter";

const FinancialCell = ({ value, isNegative = false }: { value: string, isNegative?: boolean }) => (
  <span className={`font-mono text-xs ${isNegative ? 'text-red-600' : 'text-gray-700'}`}>
    {isNegative ? `(${value})` : value}
  </span>
);

export default function RollForwardView() {
  const [company, setCompany] = useState("all");
  const [module, setModule] = useState("all");
  const [period, setPeriod] = useState("all");
  const [, setLocation] = useLocation();

  const handleVariableClick = (variable: string) => {
    setLocation(`/debug?variable=${encodeURIComponent(variable)}`);
  };

  const data = [
    { bop: "9/30/2025", eop: "10/7/2025", fundBop: "782,243", fundMe: "782,243", totalFund: "782,242", partialWd: "2,322", electivePw: "2,322", nonElective: "2,322", fundAtEopBeforeGmwb: "789,921", fundAtEop: "789,921" },
    { bop: "10/7/2025", eop: "11/7/2025", fundBop: "789,921", fundMe: "789,921", totalFund: "789,921", partialWd: "2,315", electivePw: "2,315", nonElective: "2,315", fundAtEopBeforeGmwb: "778,606", fundAtEop: "778,606" },
    { bop: "11/7/2025", eop: "12/7/2025", fundBop: "778,606", fundMe: "778,606", totalFund: "778,606", partialWd: "2,308", electivePw: "2,308", nonElective: "2,308", fundAtEopBeforeGmwb: "776,298", fundAtEop: "776,298" },
    { bop: "12/7/2025", eop: "1/7/2026", fundBop: "776,298", fundMe: "776,298", totalFund: "776,298", partialWd: "2,301", electivePw: "2,301", nonElective: "2,301", fundAtEopBeforeGmwb: "773,996", fundAtEop: "773,996" },
    { bop: "1/7/2026", eop: "2/7/2026", fundBop: "773,996", fundMe: "773,996", equityIndexed: "44,430", totalFund: "818,426", partialWd: "2,426", electivePw: "2,426", nonElective: "2,426", fundAtEopBeforeGmwb: "816,000", fundAtEop: "816,000", matured: "818,426" },
    { bop: "2/7/2026", eop: "3/7/2026", fundBop: "816,000", fundMe: "816,000", totalFund: "816,000", partialWd: "2,419", electivePw: "2,419", nonElective: "2,419", fundAtEopBeforeGmwb: "813,581", fundAtEop: "813,581" },
    { bop: "3/7/2026", eop: "4/7/2026", fundBop: "813,581", fundMe: "813,581", totalFund: "813,581", partialWd: "2,412", electivePw: "2,412", nonElective: "2,412", fundAtEopBeforeGmwb: "811,169", fundAtEop: "811,169" },
    { bop: "4/7/2026", eop: "5/7/2026", fundBop: "811,169", fundMe: "811,169", totalFund: "811,169", partialWd: "2,405", electivePw: "2,405", nonElective: "2,405", fundAtEopBeforeGmwb: "808,764", fundAtEop: "808,764" },
    { bop: "5/7/2026", eop: "6/7/2026", fundBop: "808,764", fundMe: "808,764", totalFund: "808,764", partialWd: "2,398", electivePw: "2,398", nonElective: "2,398", fundAtEopBeforeGmwb: "806,367", fundAtEop: "806,367" },
    { bop: "6/7/2026", eop: "7/7/2026", fundBop: "806,367", fundMe: "806,367", totalFund: "806,367", partialWd: "2,391", electivePw: "2,391", nonElective: "2,391", fundAtEopBeforeGmwb: "803,976", fundAtEop: "803,976" },
    { bop: "7/7/2026", eop: "8/7/2026", fundBop: "803,976", fundMe: "803,976", totalFund: "803,976", partialWd: "2,383", electivePw: "2,383", nonElective: "2,383", fundAtEopBeforeGmwb: "801,592", fundAtEop: "801,592" },
    { bop: "8/7/2026", eop: "9/7/2026", fundBop: "801,592", fundMe: "801,592", totalFund: "801,592", partialWd: "2,376", electivePw: "2,376", nonElective: "2,376", fundAtEopBeforeGmwb: "799,216", fundAtEop: "799,216" },
  ];

  const TableHeaderCell = ({ children, variable }: { children: React.ReactNode, variable: string }) => (
    <TableHead 
      className="text-[10px] font-bold uppercase text-muted-foreground border-r border-border text-center px-2 py-3 leading-tight cursor-pointer hover:bg-accent transition-colors"
      onClick={() => handleVariableClick(variable)}
    >
      {children}
    </TableHead>
  );

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 space-y-6 animate-in fade-in duration-500">
      
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="h-10 w-1 bg-blue-600 rounded-full" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Roll Forward Analysis</h1>
          </div>
        </div>
        <div className="flex gap-4 items-center">
          <div className="flex gap-2 items-center">
            <span className="text-[10px] font-bold text-muted-foreground uppercase">Company</span>
            <Select value={company} onValueChange={setCompany}>
              <SelectTrigger className="w-[140px] h-8 text-xs bg-white border-border">
                <SelectValue placeholder="Select Company" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Companies</SelectItem>
                <SelectItem value="alpha">Alpha</SelectItem>
                <SelectItem value="beta">Beta</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 items-center">
            <span className="text-[10px] font-bold text-muted-foreground uppercase">Module</span>
            <Select value={module} onValueChange={setModule}>
              <SelectTrigger className="w-[140px] h-8 text-xs bg-white border-border">
                <SelectValue placeholder="Select Module" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Modules</SelectItem>
                <SelectItem value="va">Variable Annuity</SelectItem>
                <SelectItem value="life">Universal Life</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 items-center">
            <span className="text-[10px] font-bold text-muted-foreground uppercase">Period</span>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[140px] h-8 text-xs bg-white border-border">
                <SelectValue placeholder="Select Period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Periods</SelectItem>
                <SelectItem value="2025">2025 FY</SelectItem>
                <SelectItem value="2026">2026 FY</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button variant="outline" size="sm" className="h-8">
            <Download className="mr-2 h-3.5 w-3.5" /> Export
          </Button>
        </div>
      </div>

      <Card className="shadow-sm border-border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50 hover:bg-gray-50">
                <TableHeaderCell variable="BOP Date">BOP Date</TableHeaderCell>
                <TableHeaderCell variable="EOP Date">EOP Date</TableHeaderCell>
                <TableHeaderCell variable="Fund BOP">Fund BOP</TableHeaderCell>
                <TableHeaderCell variable="Fund Int Credited BOP to CME">Fund Int Credited BOP to CME</TableHeaderCell>
                <TableHeaderCell variable="Fund at Calendar ME">Fund at Calendar ME</TableHeaderCell>
                <TableHeaderCell variable="Fund Int Credited CME to EOP">Fund Int Credited CME to EOP</TableHeaderCell>
                <TableHeaderCell variable="Equity Indexed Interest Credited">Equity Indexed Interest Credited</TableHeaderCell>
                <TableHeaderCell variable="Total Fund after Crediting and before PW">Total Fund after Crediting and before PW</TableHeaderCell>
                <TableHeaderCell variable="Partial Withdrawals">Partial Withdrawals</TableHeaderCell>
                <TableHeaderCell variable="Elective PW">Elective PW</TableHeaderCell>
                <TableHeaderCell variable="Non-Elect PW after AV goes to 0">Non-Elect PW after AV goes to 0</TableHeaderCell>
                <TableHeaderCell variable="PW from Indexed Funds">PW from Indexed Funds</TableHeaderCell>
                <TableHeaderCell variable="PW from Fixed Funds">PW from Fixed Funds</TableHeaderCell>
                <TableHeaderCell variable="SC on Withdrawal">SC on Withdrawal</TableHeaderCell>
                <TableHeaderCell variable="MVA on Withdrawal">MVA on Withdrawal</TableHeaderCell>
                <TableHeaderCell variable="Fund at EOP before GMWB Charge">Fund at EOP before GMWB Charge</TableHeaderCell>
                <TableHeaderCell variable="Rider Charge EOP">Rider Charge EOP</TableHeaderCell>
                <TableHeaderCell variable="Rider Charges from Indexed Funds">Rider Charges from Indexed Funds</TableHeaderCell>
                <TableHeaderCell variable="Rider Charges from Fixed Funds">Rider Charges from Fixed Funds</TableHeaderCell>
                <TableHeaderCell variable="Fund at EOP">Fund at EOP</TableHeaderCell>
                <TableHeaderCell variable="Matured Deposits">Matured Deposits</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row, i) => (
                <TableRow key={i} className="hover:bg-accent/50 transition-colors group">
                  <TableCell className="text-[11px] py-2 border-r border-border text-center">{row.bop}</TableCell>
                  <TableCell className="text-[11px] py-2 border-r border-border text-center">{row.eop}</TableCell>
                  <TableCell className="py-2 border-r border-border text-center"><FinancialCell value={`$ ${row.fundBop}`} /></TableCell>
                  <TableCell className="py-2 border-r border-border text-center text-[11px] text-muted-foreground">$ —</TableCell>
                  <TableCell className="py-2 border-r border-border text-center"><FinancialCell value={`$ ${row.fundMe}`} /></TableCell>
                  <TableCell className="py-2 border-r border-border text-center text-[11px] text-muted-foreground">$ —</TableCell>
                  <TableCell className="py-2 border-r border-border text-center">
                    {row.equityIndexed ? <FinancialCell value={`$ ${row.equityIndexed}`} /> : <span className="text-[11px] text-muted-foreground">$ —</span>}
                  </TableCell>
                  <TableCell className="py-2 border-r border-border text-center"><FinancialCell value={`$ ${row.totalFund}`} /></TableCell>
                  <TableCell className="py-2 border-r border-border text-center"><FinancialCell value={`$ ${row.partialWd}`} /></TableCell>
                  <TableCell className="py-2 border-r border-border text-center"><FinancialCell value={`$ ${row.electivePw}`} /></TableCell>
                  <TableCell className="py-2 border-r border-border text-center"><FinancialCell value={`$ ${row.nonElective}`} /></TableCell>
                  <TableCell className="py-2 border-r border-border text-center"><FinancialCell value={`$ ${row.electivePw}`} /></TableCell>
                  <TableCell className="py-2 border-r border-border text-center text-[11px] text-muted-foreground">$ —</TableCell>
                  <TableCell className="py-2 border-r border-border text-center text-[11px] text-muted-foreground">$ —</TableCell>
                  <TableCell className="py-2 border-r border-border text-center text-[11px] text-muted-foreground">$ —</TableCell>
                  <TableCell className="py-2 border-r border-border text-center"><FinancialCell value={`$ ${row.fundAtEopBeforeGmwb}`} /></TableCell>
                  <TableCell className="py-2 border-r border-border text-center text-[11px] text-muted-foreground">$ —</TableCell>
                  <TableCell className="py-2 border-r border-border text-center text-[11px] text-muted-foreground">$ —</TableCell>
                  <TableCell className="py-2 border-r border-border text-center text-[11px] text-muted-foreground">$ —</TableCell>
                  <TableCell className="py-2 border-r border-border text-center"><FinancialCell value={`$ ${row.fundAtEop}`} /></TableCell>
                  <TableCell className="py-2 text-center">
                    {row.matured ? <FinancialCell value={`$ ${row.matured}`} /> : <span className="text-[11px] text-muted-foreground">$ —</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
      
      <div className="flex justify-between items-center text-[10px] text-muted-foreground font-bold uppercase tracking-widest px-2">
        <span>* All values in USD | Source: Model Projection 2.4.1</span>
        <span>Rows: {data.length}</span>
      </div>

    </div>
  );
}
