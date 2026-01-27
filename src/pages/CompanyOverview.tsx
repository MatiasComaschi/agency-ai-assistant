import { motion } from 'framer-motion';
import { useCompany } from '@/contexts/CompanyContext';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CompanyHoursEditor } from '@/components/company/CompanyHoursEditor';
import { CompanyStatsCards } from '@/components/company/CompanyStatsCards';
import { TodaysCallsTable } from '@/components/company/TodaysCallsTable';
import { QuickActions } from '@/components/company/QuickActions';
import { OnboardingChecklist } from '@/components/onboarding/OnboardingChecklist';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

// Import section components
import AIReceptionistSection from '@/components/company-sections/AIReceptionistSection';
import KnowledgeBaseSection from '@/components/company-sections/KnowledgeBaseSection';
import ServicesSection from '@/components/company-sections/ServicesSection';
import StaffSection from '@/components/company-sections/StaffSection';
import AppointmentsSection from '@/components/company-sections/AppointmentsSection';
import CallsSection from '@/components/company-sections/CallsSection';
import TeamSection from '@/components/company-sections/TeamSection';
import { UsersSection } from '@/components/company-sections/UsersSection';

export default function CompanyOverview() {
  const { currentCompany, isLoading, refetchCompanies } = useCompany();
  const { isAgencyAdmin } = useAuth();
  const [aiEnabled, setAiEnabled] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Get initial tab from URL or default to 'overview'
  const initialTab = searchParams.get('tab') || 'overview';
  const [activeTab, setActiveTab] = useState(initialTab);

  // Sync aiEnabled with currentCompany when it loads
  useEffect(() => {
    if (currentCompany) {
      setAiEnabled(currentCompany.ai_enabled);
    }
  }, [currentCompany]);

  // Update URL when tab changes
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (value === 'overview') {
      searchParams.delete('tab');
    } else {
      searchParams.set('tab', value);
    }
    setSearchParams(searchParams, { replace: true });
  };

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading...</div>;
  }

  if (!currentCompany) {
    return (
      <div className="p-12 text-center">
        <h2 className="text-xl font-semibold mb-2">No company selected</h2>
        <p className="text-muted-foreground mb-4">Please select a company from the dropdown above</p>
      </div>
    );
  }

  const handleAiToggle = () => {
    setAiEnabled(!aiEnabled);
    refetchCompanies();
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">{currentCompany.name}</h1>
          <p className="text-muted-foreground">
            {currentCompany.industry} • {currentCompany.timezone}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={currentCompany.status === 'active' ? 'default' : 'secondary'}>
            {currentCompany.status}
          </Badge>
          {!aiEnabled && (
            <Badge variant="destructive">AI Disabled</Badge>
          )}
        </div>
      </div>

      {/* Tabbed Navigation */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-5 lg:grid-cols-9 h-auto gap-1 bg-muted p-1">
          <TabsTrigger value="overview" className="text-xs sm:text-sm">Overview</TabsTrigger>
          <TabsTrigger value="ai" className="text-xs sm:text-sm">AI Profile</TabsTrigger>
          <TabsTrigger value="kb" className="text-xs sm:text-sm">Knowledge</TabsTrigger>
          <TabsTrigger value="services" className="text-xs sm:text-sm">Services</TabsTrigger>
          <TabsTrigger value="staff" className="text-xs sm:text-sm">Staff</TabsTrigger>
          <TabsTrigger value="appointments" className="text-xs sm:text-sm">Appts</TabsTrigger>
          <TabsTrigger value="calls" className="text-xs sm:text-sm">Calls</TabsTrigger>
          <TabsTrigger value="team" className="text-xs sm:text-sm">Team</TabsTrigger>
          <TabsTrigger value="users" className="text-xs sm:text-sm">Users</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6 mt-6">
          {/* Onboarding Checklist - shows for new companies */}
          <OnboardingChecklist companyId={currentCompany.id} />
          
          {/* Stats - Company-scoped, operational only */}
          <CompanyStatsCards companyId={currentCompany.id} />

          {/* Quick Actions */}
          <QuickActions 
            companyId={currentCompany.id} 
            aiEnabled={aiEnabled}
            onAiToggle={handleAiToggle}
          />

          {/* Two-column layout for hours and calls */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Working Hours */}
            <CompanyHoursEditor companyId={currentCompany.id} />

            {/* Today's Calls Table */}
            <TodaysCallsTable companyId={currentCompany.id} />
          </div>
        </TabsContent>

        {/* AI Receptionist Tab */}
        <TabsContent value="ai" className="mt-6">
          <AIReceptionistSection company={currentCompany} />
        </TabsContent>

        {/* Knowledge Base Tab */}
        <TabsContent value="kb" className="mt-6">
          <KnowledgeBaseSection companyId={currentCompany.id} />
        </TabsContent>

        {/* Services Tab */}
        <TabsContent value="services" className="mt-6">
          <ServicesSection companyId={currentCompany.id} />
        </TabsContent>

        {/* Staff Tab */}
        <TabsContent value="staff" className="mt-6">
          <StaffSection companyId={currentCompany.id} />
        </TabsContent>

        {/* Appointments Tab */}
        <TabsContent value="appointments" className="mt-6">
          <AppointmentsSection companyId={currentCompany.id} />
        </TabsContent>

        {/* Calls Tab */}
        <TabsContent value="calls" className="mt-6">
          <CallsSection companyId={currentCompany.id} />
        </TabsContent>

        {/* Team Tab */}
        <TabsContent value="team" className="mt-6">
          <TeamSection companyId={currentCompany.id} />
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users" className="mt-6">
          <UsersSection />
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
