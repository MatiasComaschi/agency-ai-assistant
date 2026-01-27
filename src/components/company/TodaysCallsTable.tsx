import { useState, useEffect } from 'react';
import { Phone, Loader2, PhoneForwarded, Calendar, MessageSquare, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfDay, endOfDay } from 'date-fns';

interface Call {
  id: string;
  caller_number: string | null;
  caller_name: string | null;
  started_at: string;
  outcome: string | null;
  duration_seconds: number | null;
}

interface TodaysCallsTableProps {
  companyId: string;
}

const outcomeConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
  answered: { label: 'Answered', variant: 'default', icon: <Phone className="h-3 w-3" /> },
  escalated: { label: 'Escalated', variant: 'destructive', icon: <PhoneForwarded className="h-3 w-3" /> },
  booked: { label: 'Booked', variant: 'secondary', icon: <Calendar className="h-3 w-3" /> },
  voicemail: { label: 'Voicemail', variant: 'outline', icon: <MessageSquare className="h-3 w-3" /> },
  missed: { label: 'Missed', variant: 'destructive', icon: <AlertTriangle className="h-3 w-3" /> },
};

export function TodaysCallsTable({ companyId }: TodaysCallsTableProps) {
  const [calls, setCalls] = useState<Call[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchTodaysCalls();
  }, [companyId]);

  const fetchTodaysCalls = async () => {
    setIsLoading(true);
    const now = new Date();
    const todayStart = startOfDay(now).toISOString();
    const todayEnd = endOfDay(now).toISOString();

    const { data, error } = await supabase
      .from('calls')
      .select('id, caller_number, caller_name, started_at, outcome, duration_seconds')
      .eq('company_id', companyId)
      .gte('started_at', todayStart)
      .lte('started_at', todayEnd)
      .order('started_at', { ascending: false });

    if (!error && data) {
      setCalls(data);
    }
    setIsLoading(false);
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getOutcomeDisplay = (outcome: string | null) => {
    const config = outcomeConfig[outcome || ''] || { label: outcome || 'Unknown', variant: 'outline' as const, icon: null };
    return (
      <Badge variant={config.variant} className="gap-1">
        {config.icon}
        {config.label}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Phone className="h-5 w-5 text-primary" />
          <CardTitle>Today's Calls</CardTitle>
        </div>
        <CardDescription>{calls.length} call{calls.length !== 1 ? 's' : ''} today</CardDescription>
      </CardHeader>
      <CardContent>
        {calls.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No calls yet today</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Call ID</TableHead>
                <TableHead>Caller</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Outcome</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {calls.map((call) => (
                <TableRow key={call.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {call.id.slice(0, 8)}
                  </TableCell>
                  <TableCell>
                    <div>
                      {call.caller_name && <div className="font-medium text-sm">{call.caller_name}</div>}
                      <div className="text-sm text-muted-foreground">{call.caller_number || 'Unknown'}</div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {format(new Date(call.started_at), 'h:mm a')}
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatDuration(call.duration_seconds)}
                  </TableCell>
                  <TableCell>
                    {getOutcomeDisplay(call.outcome)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
