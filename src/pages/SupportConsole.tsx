import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  Phone, 
  AlertTriangle, 
  Clock, 
  TrendingUp,
  Pause,
  Play,
  Filter,
  Search,
  ChevronDown,
  Building2,
  Copy,
  PhoneOff,
  Ticket
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { format, startOfDay, endOfDay } from 'date-fns';
import { TicketList } from '@/components/support/TicketList';
import { SystemEvents } from '@/components/support/SystemEvents';
import { SystemStatus } from '@/components/support/SystemStatus';
import { VerificationHarness } from '@/components/debug/VerificationHarness';
import type { Call, Company } from '@/types';

interface CallWithCompany extends Call {
  company?: Company & { ai_enabled?: boolean };
  duration_seconds?: number;
  sentiment?: string;
}

interface CompanyWithAI extends Omit<Company, 'ai_enabled'> {
  ai_enabled: boolean;
}

export default function SupportConsole() {
  const { isAgencyAdmin } = useAuth();
  const navigate = useNavigate();
  
  const [calls, setCalls] = useState<CallWithCompany[]>([]);
  const [companies, setCompanies] = useState<CompanyWithAI[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCompany, setFilterCompany] = useState<string>('all');
  const [expandedCall, setExpandedCall] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('calls');

  useEffect(() => {
    if (!isAgencyAdmin) {
      navigate('/company');
      return;
    }
    fetchData();
  }, [isAgencyAdmin, navigate]);

  const fetchData = async () => {
    setIsLoading(true);
    
    // Fetch companies with ai_enabled
    const { data: companiesData } = await supabase
      .from('companies')
      .select('*')
      .order('name');
    
    if (companiesData) {
      setCompanies(companiesData as unknown as CompanyWithAI[]);
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

  // Toggle AI enabled (panic switch)
  const toggleAIEnabled = async (company: CompanyWithAI) => {
    const newEnabled = company.ai_enabled === false ? true : false;
    
    const { error } = await supabase
      .from('companies')
      .update({ ai_enabled: newEnabled })
      .eq('id', company.id);

    if (error) {
      toast.error('Failed to toggle AI');
    } else {
      toast.success(newEnabled 
        ? `AI enabled for ${company.name}` 
        : `AI disabled for ${company.name} - calls will forward`
      );
      fetchData();
    }
  };

  const copyCallId = (callId: string) => {
    navigator.clipboard.writeText(callId);
    toast.success('Call ID copied');
  };

  const filteredCalls = calls.filter((call) => {
    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      const matchesSearch = 
        call.id.toLowerCase().includes(searchLower) ||
        call.caller_name?.toLowerCase().includes(searchLower) ||
        call.caller_number?.includes(search) ||
        call.summary?.toLowerCase().includes(searchLower) ||
        call.company?.name.toLowerCase().includes(searchLower);
      if (!matchesSearch) return false;
    }

    // Company filter
    if (filterCompany !== 'all' && call.company_id !== filterCompany) return false;

    return true;
  });

  // Calculate metrics
  const today = new Date();
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);
  
  const callsToday = calls.filter(c => {
    const callDate = new Date(c.started_at);
    return callDate >= todayStart && callDate <= todayEnd;
  }).length;

  const escalatedCount = calls.filter(c => c.outcome === 'escalated').length;
  const escalatedToday = calls.filter(c => {
    const callDate = new Date(c.started_at);
    return c.outcome === 'escalated' && callDate >= todayStart && callDate <= todayEnd;
  }).length;

  const failureCount = calls.filter(c => 
    c.outcome === 'escalated' || c.sentiment === 'negative'
  ).length;

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
          Monitor calls, manage tickets, and track system health
        </p>
      </motion.div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-5">
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
            <CardTitle className="text-sm font-medium">Calls Today</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{callsToday}</div>
            <p className="text-xs text-muted-foreground">Since midnight</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Escalations</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{escalatedCount}</div>
            <p className="text-xs text-muted-foreground">{escalatedToday} today</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Failures</CardTitle>
            <PhoneOff className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{failureCount}</div>
            <p className="text-xs text-muted-foreground">Needs attention</p>
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
                <div className="flex items-center gap-3">
                  {/* AI Toggle (Panic Switch) */}
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">AI</span>
                    <Switch
                      checked={company.ai_enabled !== false}
                      onCheckedChange={() => toggleAIEnabled(company)}
                      className="scale-75"
                    />
                  </div>
                  <Badge variant={company.status === 'active' ? 'default' : 'secondary'}>
                    {company.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="calls" className="flex items-center gap-2">
            <Phone className="h-4 w-4" />
            Calls
          </TabsTrigger>
          <TabsTrigger value="tickets" className="flex items-center gap-2">
            <Ticket className="h-4 w-4" />
            Tickets
          </TabsTrigger>
          <TabsTrigger value="events" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            System Events
          </TabsTrigger>
          <TabsTrigger value="status" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            System Status
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calls" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search calls by ID, caller, or company..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
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
                      <TableHead>Call ID</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Caller</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Outcome</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8">
                          Loading...
                        </TableCell>
                      </TableRow>
                    ) : filteredCalls.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
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
                                <div className="flex items-center gap-1">
                                  <code className="text-xs bg-muted px-1 py-0.5 rounded">
                                    {call.id.slice(0, 8)}...
                                  </code>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      copyCallId(call.id);
                                    }}
                                  >
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                </div>
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
                            </TableRow>
                            <CollapsibleContent asChild>
                              <TableRow className="bg-muted/30">
                                <TableCell colSpan={7} className="p-4">
                                  <div className="space-y-3">
                                    <div className="flex items-center gap-4 text-sm">
                                      <span className="text-muted-foreground">Full ID:</span>
                                      <code className="bg-muted px-2 py-1 rounded text-xs">{call.id}</code>
                                    </div>
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
        </TabsContent>

        <TabsContent value="tickets">
          <TicketList companyFilter={filterCompany} />
        </TabsContent>

        <TabsContent value="events">
          <SystemEvents companyFilter={filterCompany} />
        </TabsContent>

        <TabsContent value="status" className="space-y-6">
          <SystemStatus />
          <VerificationHarness />
        </TabsContent>
      </Tabs>
    </div>
  );
}
