import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { 
  Database, 
  Play, 
  FileText, 
  Bug, 
  GitCompare, 
  Eye, 
  Code,
  ChevronDown,
  Layout,
  Settings,
  Table as TableIcon,
  Calculator,
  Search,
  ChevronRight,
  CheckCircle2,
  FileSpreadsheet,
  Layers
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface NavGroupProps {
  label: string;
  children: React.ReactNode;
  className?: string;
}

const NavGroup = ({ label, children, className }: NavGroupProps) => (
  <div className={cn("flex flex-col h-full border-r border-border px-2 min-w-max", className)}>
    <div className="flex-1 flex items-center justify-center gap-1 px-1">
      {children}
    </div>
    <div className="text-[10px] uppercase font-bold text-muted-foreground text-center bg-muted/30 -mx-2 py-0.5 mt-1 border-t border-border/50">
      {label}
    </div>
  </div>
);

const NavButton = ({ 
  icon: Icon, 
  label, 
  active, 
  onClick, 
  variant = "ghost",
  href,
  className
}: { 
  icon?: any, 
  label: string, 
  active?: boolean, 
  onClick?: () => void,
  variant?: "ghost" | "default" | "outline" | "secondary",
  href?: string,
  className?: string
}) => {
  const Comp = href ? Link : 'button';
  const props = href ? { href } : { onClick };
  
  return (
    // @ts-ignore
    <Comp {...props} className="no-underline">
      <div 
        className={cn(
          "flex flex-col items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer min-w-[70px]",
          active && "bg-primary/10 text-primary border border-primary/20",
          !active && variant === "default" && "bg-primary text-primary-foreground hover:bg-primary/90",
          className
        )}
      >
        {Icon && <Icon className="h-5 w-5" />}
        <span className="whitespace-nowrap">{label}</span>
      </div>
    </Comp>
  );
};

export const TopRibbon = () => {
  const [location, setLocation] = useLocation();
  const [modelType, setModelType] = useState("STAT");
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Formula Extraction State
  const formulaFields = ["Account Value", "Benefit Base", "Surrender Charge", "Withdrawal Amount", "Rider Fees"];
  const [selectedFields, setSelectedFields] = useState<string[]>([]);

  const toggleAll = () => {
    if (selectedFields.length === formulaFields.length) {
      setSelectedFields([]);
    } else {
      setSelectedFields([...formulaFields]);
    }
  };

  const toggleField = (field: string) => {
    if (selectedFields.includes(field)) {
      setSelectedFields(selectedFields.filter(f => f !== field));
    } else {
      setSelectedFields([...selectedFields, field]);
    }
  };

  const handleRunModel = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setLocation("/data");
    }, 1500);
  };

  const handleReset = () => {
    setLocation("/inputs");
  };

  return (
    <div className="w-full bg-card border-b border-border shadow-sm flex items-stretch h-24 overflow-x-auto">
      {/* Model Type */}
      <NavGroup label="Model Type">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="default" className="bg-[#1e40af] hover:bg-[#1e3a8a] text-white font-bold h-10 px-6 shadow-md rounded-sm gap-2">
              {modelType} <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => setModelType("STAT")}>STAT</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setModelType("FAS")}>FAS</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setModelType("MRB")}>MRB</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </NavGroup>

      {/* Run */}
      <NavGroup label="Run">
        <div className="flex gap-2">
          <div className="flex flex-col gap-1">
            <Link href="/inputs">
              <Button variant="default" size="sm" className="w-full justify-start h-7 text-xs bg-blue-600 hover:bg-blue-700">
                <Settings className="mr-2 h-3.5 w-3.5" />
                Run Setup
              </Button>
            </Link>
            <Button variant="outline" size="sm" className="w-full justify-start h-7 text-xs" onClick={handleReset}>
              Reset
            </Button>
          </div>
          
          <div className="flex items-center">
            <Button 
              variant="default" 
              className={cn(
                "h-15 w-15 flex flex-col items-center justify-center text-white shadow-lg transition-all",
                isProcessing ? "bg-orange-500 hover:bg-orange-600 animate-pulse" : "bg-green-600 hover:bg-green-700"
              )}
              onClick={handleRunModel}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <div className="h-6 w-6 border-2 border-white/30 border-t-white rounded-full animate-spin mb-1" />
                  <span className="text-[10px] font-bold uppercase">Wait</span>
                </>
              ) : (
                <>
                  <Play className="h-6 w-6 mb-1" />
                  <span className="text-[10px] font-bold uppercase">Run</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </NavGroup>

      {/* Inputs View */}
      <NavGroup label="Input Views">
        <div className="flex gap-2">
          <NavButton icon={Database} label="Data View" active={location === "/data"} href="/data" />
          <NavButton icon={TableIcon} label="Assumptions" active={location === "/assumptions"} href="/assumptions" />
        </div>
      </NavGroup>

      {/* Results Reports */}
      <NavGroup label="Results Reports">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-10 px-4 text-xs font-semibold gap-2 border-border">
              <FileText className="h-4 w-4" /> Reports <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem className="text-xs py-2">Financial Summary</DropdownMenuItem>
            <DropdownMenuItem className="text-xs py-2">Audit Report</DropdownMenuItem>
            <DropdownMenuItem className="text-xs py-2">Validation Report</DropdownMenuItem>
            <DropdownMenuSeparator />
            <Popover>
              <PopoverTrigger asChild>
                <div className="flex items-center justify-between w-full px-2 py-2 text-xs hover:bg-accent cursor-pointer rounded-sm">
                  <span className="flex items-center gap-2">
                    <FileSpreadsheet className="h-3.5 w-3.5 text-indigo-500" />
                    Formula Extraction
                  </span>
                  <ChevronRight className="h-3 w-3 opacity-50" />
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2" side="right" align="start">
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase px-2 py-1 border-b">Select Fields</p>
                  
                  {/* Select All Option */}
                  <div className="flex items-center space-x-2 p-2 hover:bg-accent rounded-sm cursor-pointer border-b border-dashed border-gray-200">
                    <Checkbox 
                      id="select-all" 
                      checked={selectedFields.length === formulaFields.length && formulaFields.length > 0}
                      onCheckedChange={toggleAll}
                    />
                    <Label htmlFor="select-all" className="text-xs font-bold cursor-pointer flex-1">Select All</Label>
                  </div>

                  {formulaFields.map((field) => (
                    <div key={field} className="flex items-center space-x-2 p-2 hover:bg-accent rounded-sm cursor-pointer">
                      <Checkbox 
                        id={field} 
                        checked={selectedFields.includes(field)}
                        onCheckedChange={() => toggleField(field)}
                      />
                      <Label htmlFor={field} className="text-xs cursor-pointer flex-1">{field}</Label>
                    </div>
                  ))}
                  <Button size="sm" className="w-full mt-2 h-7 text-[10px] uppercase font-bold bg-indigo-600 hover:bg-indigo-700">
                    Export Selected ({selectedFields.length})
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </DropdownMenuContent>
        </DropdownMenu>
      </NavGroup>

      {/* Output */}
      <NavGroup label="Output">
        <NavButton icon={Layout} label="Roll-Forward" active={location === "/roll-forward"} href="/roll-forward" />
      </NavGroup>

      {/* Debug View */}
      <NavGroup label="Debug view">
        <NavButton icon={Bug} label="Debug Mode" active={location === "/debug"} href="/debug" />
      </NavGroup>

      {/* Calculation Engine */}
      <NavGroup label="Calc Engine">
        <NavButton icon={Calculator} label="Calculations" active={location === "/calculation-engine"} href="/calculation-engine" />
      </NavGroup>

      {/* Quality Assurance */}
      <NavGroup label="Quality Assurance">
        <div className="flex gap-2">
          <NavButton 
            icon={GitCompare} 
            label="Compare" 
            active={location === "/compare"}
            href="/compare"
          />
          <NavButton 
            icon={CheckCircle2} 
            label="Automatic Checks" 
            active={location === "/auto-checks"}
            href="/auto-checks"
          />
        </div>
      </NavGroup>

      <div className="flex-1" />

      {/* Module Explorer */}
      <NavGroup label="Governance" className="border-l border-border pl-4">
        <div className="flex gap-2">
          <NavButton 
            icon={Layers} 
            label="Module Explorer" 
            active={location === "/module-explorer"}
            href="/module-explorer"
            className="h-12 w-28 bg-indigo-50/50 border-indigo-100 hover:bg-indigo-100/50"
          />
          <NavButton 
            icon={Database} 
            label="Data Module" 
            active={location === "/data-module"}
            href="/data-module"
            className="h-12 w-28 bg-blue-50/50 border-blue-100 hover:bg-blue-100/50"
          />
          <NavButton 
            icon={TableIcon} 
            label="Assumption Module" 
            active={location === "/assumption-module"}
            href="/assumption-module"
            className="h-12 w-32 bg-amber-50/50 border-amber-100 hover:bg-amber-100/50"
          />
        </div>
      </NavGroup>

      {/* Developer View */}
      <NavGroup label="Developer View">
        <NavButton icon={Code} label="View Code" variant="default" />
      </NavGroup>
    </div>
  );
};
