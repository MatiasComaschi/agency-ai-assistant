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
import AIReceptionist from "@/pages/AIReceptionist";
import KnowledgeBase from "@/pages/KnowledgeBase";
import CallLogs from "@/pages/CallLogs";
import Team from "@/pages/Team";
import Integrations from "@/pages/Integrations";
import Billing from "@/pages/Billing";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/NotFound";
import IndustryTemplates from "@/pages/IndustryTemplates";
import BulkImport from "@/pages/BulkImport";
import SupportConsole from "@/pages/SupportConsole";
import AuditLog from "@/pages/AuditLog";
import Monitoring from "@/pages/Monitoring";
import ROIReport from "@/pages/ROIReport";
import Referrals from "@/pages/Referrals";
import Testimonials from "@/pages/Testimonials";
import WhiteLabel from "@/pages/WhiteLabel";
import AdminSettings from "@/pages/AdminSettings";

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
              <Route path="agency/templates" element={<IndustryTemplates />} />
              <Route path="agency/bulk-import" element={<BulkImport />} />
              <Route path="agency/support" element={<SupportConsole />} />
              <Route path="agency/audit-log" element={<AuditLog />} />
              <Route path="agency/admin-settings" element={<AdminSettings />} />
              <Route path="company" element={<CompanyOverview />} />
              <Route path="ai-receptionist" element={<AIReceptionist />} />
              <Route path="knowledge-base" element={<KnowledgeBase />} />
              <Route path="calls" element={<CallLogs />} />
              <Route path="team" element={<Team />} />
              <Route path="integrations" element={<Integrations />} />
              <Route path="billing" element={<Billing />} />
              <Route path="monitoring" element={<Monitoring />} />
              <Route path="roi-report" element={<ROIReport />} />
              <Route path="referrals" element={<Referrals />} />
              <Route path="testimonials" element={<Testimonials />} />
              <Route path="white-label" element={<WhiteLabel />} />
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
