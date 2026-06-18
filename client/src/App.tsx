import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { LeftSidebar } from "@/components/layout/LeftSidebar";
import { ProductProvider } from "@/context/ProductContext";
import InputsView from "@/pages/InputsView";
import AutoChecksView from "@/pages/AutoChecksView";
import DebugView from "@/pages/DebugView";
import RollForwardView from "@/pages/RollForwardView";
import DataView from "@/pages/DataView";
import AssumptionsView from "@/pages/AssumptionsView";
import CalculationEngineView from "@/pages/CalculationEngineView";
import CompareView from "@/pages/CompareView";
import ModuleExplorerView from "@/pages/ModuleExplorerView";
import DataModuleView from "@/pages/DataModuleView";
import AssumptionModuleView from "@/pages/AssumptionModuleView";
import UlpEngineView from "@/pages/UlpEngineView";
import FinancialSummaryView from "@/pages/FinancialSummaryView";
import CodeEditorView from "@/pages/CodeEditorView";

function Router() {
  return (
    <Switch>
      <Route path="/code-editor" component={CodeEditorView} />
      <Route path="/" component={() => <Redirect to="/inputs" />} />
      <Route path="/inputs" component={InputsView} />
      <Route path="/ulp-engine" component={UlpEngineView} />
      <Route path="/auto-checks" component={AutoChecksView} />
      <Route path="/debug" component={DebugView} />
      <Route path="/roll-forward" component={RollForwardView} />
      <Route path="/calculation-engine" component={CalculationEngineView} />
      <Route path="/compare" component={CompareView} />
      <Route path="/module-explorer" component={ModuleExplorerView} />
      <Route path="/data-module" component={DataModuleView} />
      <Route path="/assumption-module" component={AssumptionModuleView} />
      <Route path="/data" component={DataView} />
      <Route path="/assumptions" component={AssumptionsView} />
      <Route path="/financial-summary" component={FinancialSummaryView} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ProductProvider>
          <div className="h-screen flex flex-row bg-background font-sans antialiased text-foreground overflow-hidden">
            <LeftSidebar />
            <div className="flex-1 overflow-auto">
              <Router />
            </div>
            <Toaster />
          </div>
        </ProductProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
