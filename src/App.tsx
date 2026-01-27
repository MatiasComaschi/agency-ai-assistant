import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import Auth from "@/pages/Auth";
import AgencyDashboard from "@/pages/AgencyDashboard";
import CreateCompany from "@/pages/CreateCompany";
import CompanyOverview from "@/pages/CompanyOverview";
import CompanySettings from "@/pages/CompanySettings";
import Integrations from "@/pages/Integrations";
import Billing from "@/pages/Billing";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/NotFound";
import IndustryTemplates from "@/pages/IndustryTemplates";
import BulkImport from "@/pages/BulkImport";
import SupportConsole from "@/pages/SupportConsole";
import PlatformSettings from "@/pages/PlatformSettings";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/" element={<AppLayout />}>
              <Route index element={<Navigate to="/agency" replace />} />
              <Route path="agency" element={<AgencyDashboard />} />
              <Route path="agency/create-company" element={<CreateCompany />} />
              <Route path="agency/company-settings" element={<CompanySettings />} />
              <Route path="agency/templates" element={<IndustryTemplates />} />
              <Route path="agency/bulk-import" element={<BulkImport />} />
              <Route path="agency/support" element={<SupportConsole />} />
              <Route path="agency/platform" element={<PlatformSettings />} />
              <Route path="company" element={<CompanyOverview />} />
              
              {/* Legacy routes - redirect to Company Overview with tab */}
              <Route path="ai-receptionist" element={<Navigate to="/company?tab=ai" replace />} />
              <Route path="knowledge-base" element={<Navigate to="/company?tab=kb" replace />} />
              <Route path="services" element={<Navigate to="/company?tab=services" replace />} />
              <Route path="staff" element={<Navigate to="/company?tab=staff" replace />} />
              <Route path="appointments" element={<Navigate to="/company?tab=appointments" replace />} />
              <Route path="calls" element={<Navigate to="/company?tab=calls" replace />} />
              <Route path="team" element={<Navigate to="/company?tab=team" replace />} />
              
              {/* Keep standalone pages */}
              <Route path="integrations" element={<Integrations />} />
              <Route path="billing" element={<Billing />} />
              <Route path="settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
