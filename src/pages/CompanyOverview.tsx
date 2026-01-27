import { motion } from 'framer-motion';
import { useCompany } from '@/contexts/CompanyContext';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { CompanyHoursEditor } from '@/components/company/CompanyHoursEditor';
import { CompanyStatsCards } from '@/components/company/CompanyStatsCards';
import { TodaysCallsTable } from '@/components/company/TodaysCallsTable';
import { QuickActions } from '@/components/company/QuickActions';
import { useState, useEffect } from 'react';

export default function CompanyOverview() {
  const { currentCompany, isLoading, refetchCompanies } = useCompany();
  const { isAgencyAdmin } = useAuth();
  const [aiEnabled, setAiEnabled] = useState(true);

  // Sync aiEnabled with currentCompany when it loads
  useEffect(() => {
    if (currentCompany) {
      setAiEnabled(currentCompany.ai_enabled);
    }
  }, [currentCompany]);

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
    </motion.div>
  );
}
