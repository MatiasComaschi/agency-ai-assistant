import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';
import type { Company } from '@/types';

interface CompanyContextType {
  companies: Company[];
  currentCompany: Company | null;
  setCurrentCompanyId: (id: string | null) => void;
  isLoading: boolean;
  refetchCompanies: () => Promise<void>;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

function parseCompany(data: Record<string, unknown>): Company {
  return {
    id: data.id as string,
    name: data.name as string,
    industry: data.industry as string | null,
    timezone: data.timezone as string,
    status: data.status as 'active' | 'paused' | 'inactive',
    primary_phone: data.primary_phone as string | null,
    fallback_phone: data.fallback_phone as string | null,
    booking_link: data.booking_link as string | null,
    twilio_number: data.twilio_number as string | null,
    created_at: data.created_at as string,
    updated_at: data.updated_at as string,
  };
}

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const { user, isAgencyAdmin } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [currentCompanyId, setCurrentCompanyId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const currentCompany = companies.find(c => c.id === currentCompanyId) || null;

  const fetchCompanies = async () => {
    if (!user) {
      setCompanies([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      let query = supabase.from('companies').select('*');
      
      // Agency admins see all companies
      // Non-admins see companies they're members of
      if (!isAgencyAdmin) {
        const { data: memberships } = await supabase
          .from('memberships')
          .select('company_id')
          .eq('user_id', user.id);
        
        const companyIds = memberships?.map(m => m.company_id) || [];
        if (companyIds.length === 0) {
          setCompanies([]);
          setIsLoading(false);
          return;
        }
        query = query.in('id', companyIds);
      }

      const { data, error } = await query.order('name');

      if (error) throw error;

      const parsedCompanies = (data || []).map(parseCompany);
      setCompanies(parsedCompanies);

      // Auto-select first company if none selected
      if (!currentCompanyId && parsedCompanies.length > 0) {
        setCurrentCompanyId(parsedCompanies[0].id);
      }
    } catch (error) {
      console.error('Error fetching companies:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, [user, isAgencyAdmin]);

  return (
    <CompanyContext.Provider
      value={{
        companies,
        currentCompany,
        setCurrentCompanyId,
        isLoading,
        refetchCompanies: fetchCompanies,
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const context = useContext(CompanyContext);
  if (context === undefined) {
    throw new Error('useCompany must be used within a CompanyProvider');
  }
  return context;
}
