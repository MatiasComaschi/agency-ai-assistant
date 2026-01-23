import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  Phone, 
  AlertTriangle, 
  Clock, 
  TrendingDown,
  Pause,
  Play,
  Filter,
  Search,
  ChevronDown,
  Building2,
  User,
  MessageSquare
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import type { Call, Company } from '@/types';

interface CallWithCompany extends Call {
  company?: Company;
  duration_seconds?: number;
  sentiment?: string;
}

export default function SupportConsole() {
  const { isAgencyAdmin } = useAuth();
  const navigate = useNavigate();
  
  const [calls, setCalls] = useState<CallWithCompany[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRisk, setFilterRisk] = useState<'all' | 'high'>('all');
  const [filterCompany, setFilterCompany] = useState<string>('all');
  const [expandedCall, setExpandedCall] = useState<string | null>(null);

  useEffect(() => {
    if (!isAgencyAdmin) {
      navigate('/company');
      return;
    }
    fetchData();
  }, [isAgencyAdmin, navigate]);

  const fetchData = async () => {
    setIsLoading(true);
    
    // Fetch companies
    const { data: companiesData } = await supabase
      .from('companies')
      .select('*')
      .order('name');
    
    if (companiesData) {
      setCompanies(companiesData as unknown as Company[]);
    }

    // Fetch all calls with company info
    const { data: callsData, error } = await supabase
      .from('calls')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error(error);
      toast.error('Failed to load calls');
    } else if (callsData) {
      // Map company data to calls
      const callsWithCompany = callsData.map((call) => ({
        ...call,
        company: companiesData?.find((c) => c.id === call.company_id),
      })) as unknown as CallWithCompany[];
      setCalls(callsWithCompany);
    }

    setIsLoading(false);
  };

  const toggleCompanyStatus = async (company: Company) => {
    const newStatus = company.status === 'active' ? 'paused' : 'active';
    
    const { error } = await supabase
      .from('companies')
      .update({ status: newStatus })
      .eq('id', company.id);

    if (error) {
      toast.error('Failed to update status');
    } else {
      toast.success(`${company.name} is now ${newStatus}`);
      fetchData();
    }
  };

  const isHighRisk = (call: CallWithCompany): boolean => {
    const isEscalated = call.outcome === 'escalated';
    const isNegativeSentiment = (call as CallWithCompany & { sentiment?: string }).sentiment === 'negative';
    const isLongCall = (call.duration_seconds || 0) > 300; // 5+ minutes
    return isEscalated || isNegativeSentiment || isLongCall;
  };

  const filteredCalls = calls.filter((call) => {
    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      const matchesSearch = 
        call.caller_name?.toLowerCase().includes(searchLower) ||
        call.caller_number?.includes(search) ||
        call.summary?.toLowerCase().includes(searchLower) ||
        call.company?.name.toLowerCase().includes(searchLower);
      if (!matchesSearch) return false;
    }

    // Risk filter
    if (filterRisk === 'high' && !isHighRisk(call)) return false;

    // Company filter
    if (filterCompany !== 'all' && call.company_id !== filterCompany) return false;

    return true;
  });

  const highRiskCount = calls.filter(isHighRisk).length;
  const escalatedCount = calls.filter(c => c.outcome === 'escalated').length;
  const avgDuration = calls.length > 0 
    ? Math.round(calls.reduce((acc, c) => acc + (c.duration_seconds || 0), 0) / calls.length)
    : 0;

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl font-display font-bold text-foreground">
          Support Console
        </h1>
        <p className="text-muted-foreground mt-1">
          Monitor all calls and manage company AI status
        </p>
      </motion.div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Calls</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{calls.length}</div>
            <p className="text-xs text-muted-foreground">Last 200 calls</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">High Risk</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{highRiskCount}</div>
            <p className="text-xs text-muted-foreground">Needs attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Escalated</CardTitle>
            <TrendingDown className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{escalatedCount}</div>
            <p className="text-xs text-muted-foreground">Transferred to human</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDuration(avgDuration)}</div>
            <p className="text-xs text-muted-foreground">Per call</p>
          </CardContent>
        </Card>
      </div>

      {/* Company Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Company Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {companies.slice(0, 6).map((company) => (
              <div
                key={company.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-sm truncate max-w-32">
                    {company.name}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={company.status === 'active' ? 'default' : 'secondary'}>
                    {company.status}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleCompanyStatus(company)}
                  >
                    {company.status === 'active' ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search calls..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterRisk} onValueChange={(v) => setFilterRisk(v as 'all' | 'high')}>
          <SelectTrigger className="w-40">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Risk level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Calls</SelectItem>
            <SelectItem value="high">High Risk Only</SelectItem>
          </SelectContent>
        </Select>
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
      </div>

      {/* Calls Table */}
      <Card>
        <CardContent className="p-0">
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Caller</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : filteredCalls.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No calls found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCalls.map((call) => (
                    <Collapsible
                      key={call.id}
                      open={expandedCall === call.id}
                      onOpenChange={(open) => setExpandedCall(open ? call.id : null)}
                      asChild
                    >
                      <>
                        <TableRow className="cursor-pointer hover:bg-muted/50">
                          <TableCell>
                            <CollapsibleTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-6 w-6">
                                <ChevronDown 
                                  className={`h-4 w-4 transition-transform ${
                                    expandedCall === call.id ? 'rotate-180' : ''
                                  }`} 
                                />
                              </Button>
                            </CollapsibleTrigger>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">
                                {call.company?.name || 'Unknown'}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{call.caller_name || 'Unknown'}</p>
                              <p className="text-xs text-muted-foreground">{call.caller_number}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            {format(new Date(call.started_at), 'MMM d, h:mm a')}
                          </TableCell>
                          <TableCell>{formatDuration(call.duration_seconds)}</TableCell>
                          <TableCell>
                            <Badge 
                              variant={
                                call.outcome === 'escalated' ? 'destructive' :
                                call.outcome === 'booked' ? 'default' :
                                'secondary'
                              }
                            >
                              {call.outcome || 'unknown'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {isHighRisk(call) && (
                              <Badge variant="destructive">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                High
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleCompanyStatus(call.company!)}
                              disabled={!call.company}
                            >
                              {call.company?.status === 'active' ? (
                                <><Pause className="h-4 w-4 mr-1" /> Pause</>
                              ) : (
                                <><Play className="h-4 w-4 mr-1" /> Resume</>
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                        <CollapsibleContent asChild>
                          <TableRow className="bg-muted/30">
                            <TableCell colSpan={8} className="p-4">
                              <div className="space-y-3">
                                {call.summary && (
                                  <div>
                                    <p className="text-sm font-medium mb-1">Summary</p>
                                    <p className="text-sm text-muted-foreground">{call.summary}</p>
                                  </div>
                                )}
                                {call.transcript && (
                                  <div>
                                    <p className="text-sm font-medium mb-1">Transcript</p>
                                    <p className="text-sm text-muted-foreground whitespace-pre-wrap max-h-40 overflow-auto">
                                      {call.transcript}
                                    </p>
                                  </div>
                                )}
                                {call.internal_notes && (
                                  <div>
                                    <p className="text-sm font-medium mb-1">Notes</p>
                                    <p className="text-sm text-muted-foreground">{call.internal_notes}</p>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        </CollapsibleContent>
                      </>
                    </Collapsible>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
