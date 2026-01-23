import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  History, 
  Filter, 
  Search, 
  User,
  Building2,
  FileText,
  Settings,
  Phone,
  Bot,
  Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import type { Audit, Company, Profile } from '@/types';

interface AuditWithDetails extends Audit {
  actor_profile?: Profile;
  company?: Company;
}

const entityIcons: Record<string, typeof FileText> = {
  company: Building2,
  ai_profile: Bot,
  knowledge_base: FileText,
  call: Phone,
  user: User,
  settings: Settings,
  default: FileText,
};

const actionColors: Record<string, string> = {
  create: 'bg-green-500/10 text-green-600',
  update: 'bg-blue-500/10 text-blue-600',
  delete: 'bg-red-500/10 text-red-600',
  default: 'bg-gray-500/10 text-gray-600',
};

export default function AuditLog() {
  const { isAgencyAdmin, user } = useAuth();
  const { companies, currentCompany } = useCompany();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [audits, setAudits] = useState<AuditWithDetails[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCompany, setFilterCompany] = useState<string>(
    searchParams.get('company') || (isAgencyAdmin ? 'all' : currentCompany?.id || '')
  );
  const [filterAction, setFilterAction] = useState<string>('all');
  const [filterEntity, setFilterEntity] = useState<string>('all');

  useEffect(() => {
    fetchData();
  }, [filterCompany, user]);

  const fetchData = async () => {
    setIsLoading(true);

    // Fetch profiles for actor names
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('*');
    
    if (profilesData) {
      setProfiles(profilesData as unknown as Profile[]);
    }

    // Build query
    let query = supabase
      .from('audits')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    if (filterCompany !== 'all') {
      query = query.eq('company_id', filterCompany);
    }

    const { data, error } = await query;

    if (error) {
      console.error(error);
      toast.error('Failed to load audit logs');
    } else if (data) {
      // Enrich with profile and company data
      const enrichedAudits = data.map((audit) => ({
        ...audit,
        actor_profile: profilesData?.find((p) => p.id === audit.actor_user_id),
        company: companies.find((c) => c.id === audit.company_id),
      })) as unknown as AuditWithDetails[];
      setAudits(enrichedAudits);
    }

    setIsLoading(false);
  };

  const filteredAudits = audits.filter((audit) => {
    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      const matchesSearch = 
        audit.action.toLowerCase().includes(searchLower) ||
        audit.entity_type.toLowerCase().includes(searchLower) ||
        audit.actor_profile?.full_name?.toLowerCase().includes(searchLower) ||
        audit.actor_profile?.email.toLowerCase().includes(searchLower) ||
        audit.company?.name.toLowerCase().includes(searchLower);
      if (!matchesSearch) return false;
    }

    // Action filter
    if (filterAction !== 'all' && audit.action !== filterAction) return false;

    // Entity filter
    if (filterEntity !== 'all' && audit.entity_type !== filterEntity) return false;

    return true;
  });

  const uniqueActions = [...new Set(audits.map(a => a.action))];
  const uniqueEntities = [...new Set(audits.map(a => a.entity_type))];

  const getIcon = (entityType: string) => {
    return entityIcons[entityType] || entityIcons.default;
  };

  const getActionColor = (action: string) => {
    if (action.includes('create') || action.includes('add')) return actionColors.create;
    if (action.includes('update') || action.includes('edit')) return actionColors.update;
    if (action.includes('delete') || action.includes('remove')) return actionColors.delete;
    return actionColors.default;
  };

  const formatMetadata = (metadata: Record<string, unknown>) => {
    if (!metadata || Object.keys(metadata).length === 0) return null;
    
    return Object.entries(metadata)
      .filter(([key]) => !key.startsWith('_'))
      .slice(0, 3)
      .map(([key, value]) => (
        <span key={key} className="text-xs">
          <span className="text-muted-foreground">{key}:</span>{' '}
          {typeof value === 'object' ? JSON.stringify(value) : String(value)}
        </span>
      ));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl font-display font-bold text-foreground">
          Audit Log
        </h1>
        <p className="text-muted-foreground mt-1">
          Track all changes and actions across your companies
        </p>
      </motion.div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Events</CardTitle>
            <History className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{audits.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Today</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {audits.filter(a => 
                new Date(a.created_at).toDateString() === new Date().toDateString()
              ).length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Unique Users</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(audits.map(a => a.actor_user_id)).size}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Companies</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(audits.map(a => a.company_id)).size}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search audit logs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        
        {isAgencyAdmin && (
          <Select value={filterCompany} onValueChange={setFilterCompany}>
            <SelectTrigger className="w-48">
              <Building2 className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Company" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Companies</SelectItem>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={filterAction} onValueChange={setFilterAction}>
          <SelectTrigger className="w-40">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            {uniqueActions.map((action) => (
              <SelectItem key={action} value={action}>{action}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterEntity} onValueChange={setFilterEntity}>
          <SelectTrigger className="w-40">
            <FileText className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Entity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Entities</SelectItem>
            {uniqueEntities.map((entity) => (
              <SelectItem key={entity} value={entity}>{entity}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Audit Table */}
      <Card>
        <CardContent className="p-0">
          <div className="rounded-md border overflow-auto max-h-[600px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : filteredAudits.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No audit logs found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAudits.map((audit) => {
                    const Icon = getIcon(audit.entity_type);
                    return (
                      <TableRow key={audit.id}>
                        <TableCell className="whitespace-nowrap">
                          <div>
                            <p className="font-medium text-sm">
                              {format(new Date(audit.created_at), 'MMM d, yyyy')}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(audit.created_at), 'h:mm:ss a')}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                              <User className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">
                                {audit.actor_profile?.full_name || 'Unknown'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {audit.actor_profile?.email}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">
                              {audit.company?.name || 'Unknown'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={getActionColor(audit.action)}>
                            {audit.action}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">{audit.entity_type}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            {audit.entity_id && (
                              <span className="text-xs text-muted-foreground font-mono">
                                {audit.entity_id.slice(0, 8)}...
                              </span>
                            )}
                            {formatMetadata(audit.metadata)}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
