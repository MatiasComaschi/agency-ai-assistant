import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format } from 'date-fns';
import { AlertTriangle, AlertCircle, Info, XCircle } from 'lucide-react';
import { useState } from 'react';

interface SystemEvent {
  id: string;
  company_id: string | null;
  event_type: string;
  source: string;
  message: string;
  metadata: Record<string, unknown>;
  created_at: string;
  company?: { name: string };
}

interface SystemEventsProps {
  companyFilter?: string;
}

export function SystemEvents({ companyFilter }: SystemEventsProps) {
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['system-events', companyFilter, typeFilter],
    queryFn: async () => {
      let query = supabase
        .from('system_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (companyFilter && companyFilter !== 'all') {
        query = query.eq('company_id', companyFilter);
      }
      if (typeFilter !== 'all') {
        query = query.eq('event_type', typeFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Fetch company names
      const companyIds = [...new Set(data.filter(e => e.company_id).map(e => e.company_id))];
      const { data: companies } = await supabase
        .from('companies')
        .select('id, name')
        .in('id', companyIds);

      return data.map(event => ({
        ...event,
        company: companies?.find(c => c.id === event.company_id),
      })) as SystemEvent[];
    },
  });

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'error':
      case 'edge_function_error':
        return <XCircle className="h-4 w-4 text-destructive" />;
      case 'call_failure':
      case 'stream_failure':
      case 'dial_failure':
        return <AlertTriangle className="h-4 w-4 text-destructive" />;
      case 'warning':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getEventBadge = (type: string) => {
    const isError = ['error', 'edge_function_error', 'call_failure', 'stream_failure', 'dial_failure'].includes(type);
    return (
      <Badge variant={isError ? 'destructive' : type === 'warning' ? 'secondary' : 'outline'}>
        {type.replace(/_/g, ' ')}
      </Badge>
    );
  };

  const failureCount = events.filter(e => 
    ['call_failure', 'stream_failure', 'dial_failure', 'error'].includes(e.event_type)
  ).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-base">System Events</CardTitle>
            {failureCount > 0 && (
              <Badge variant="destructive">{failureCount} failures</Badge>
            )}
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Event type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Events</SelectItem>
              <SelectItem value="error">Errors</SelectItem>
              <SelectItem value="call_failure">Call Failures</SelectItem>
              <SelectItem value="stream_failure">Stream Failures</SelectItem>
              <SelectItem value="dial_failure">Dial Failures</SelectItem>
              <SelectItem value="edge_function_error">Edge Function Errors</SelectItem>
              <SelectItem value="warning">Warnings</SelectItem>
              <SelectItem value="info">Info</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : events.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No events found</div>
        ) : (
          <div className="max-h-96 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>{getEventIcon(event.event_type)}</TableCell>
                    <TableCell>{getEventBadge(event.event_type)}</TableCell>
                    <TableCell className="font-mono text-xs">{event.source}</TableCell>
                    <TableCell>{event.company?.name || 'System'}</TableCell>
                    <TableCell className="max-w-xs truncate" title={event.message}>
                      {event.message}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {format(new Date(event.created_at), 'MMM d, h:mm:ss a')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
