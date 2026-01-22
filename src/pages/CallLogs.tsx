import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Phone, Filter } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Call } from '@/types';

const outcomeColors: Record<string, string> = {
  answered: 'bg-accent text-accent-foreground',
  escalated: 'bg-info text-info-foreground',
  booked: 'bg-accent text-accent-foreground',
  voicemail: 'bg-warning text-warning-foreground',
  abandoned: 'bg-destructive text-destructive-foreground',
};

export default function CallLogs() {
  const { currentCompany } = useCompany();
  const [calls, setCalls] = useState<Call[]>([]);
  const [outcomeFilter, setOutcomeFilter] = useState('all');

  useEffect(() => {
    if (currentCompany) fetchCalls();
  }, [currentCompany, outcomeFilter]);

  const fetchCalls = async () => {
    let query = supabase
      .from('calls')
      .select('*')
      .eq('company_id', currentCompany!.id)
      .order('started_at', { ascending: false });
    
    if (outcomeFilter !== 'all') {
      query = query.eq('outcome', outcomeFilter);
    }
    
    const { data } = await query;
    setCalls((data as unknown as Call[]) || []);
  };

  const formatDuration = (startedAt: string, endedAt: string | null) => {
    if (!endedAt) return '—';
    const start = new Date(startedAt).getTime();
    const end = new Date(endedAt).getTime();
    const seconds = Math.floor((end - start) / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  };

  if (!currentCompany) return <div className="p-8 text-center text-muted-foreground">Please select a company</div>;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold">Call Logs</h1>
        <p className="text-muted-foreground">View and manage call history</p>
      </div>

      <div className="flex gap-4">
        <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
          <SelectTrigger className="w-40"><Filter className="h-4 w-4 mr-2" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Outcomes</SelectItem>
            <SelectItem value="answered">Answered</SelectItem>
            <SelectItem value="escalated">Escalated</SelectItem>
            <SelectItem value="booked">Booked</SelectItem>
            <SelectItem value="voicemail">Voicemail</SelectItem>
            <SelectItem value="abandoned">Abandoned</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {calls.length === 0 ? (
            <div className="p-12 text-center">
              <Phone className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
              <p className="text-muted-foreground">No calls yet</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Caller</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calls.map((call) => (
                  <TableRow key={call.id}>
                    <TableCell className="font-medium">{call.caller_name || 'Unknown'}</TableCell>
                    <TableCell className="text-muted-foreground">{call.caller_number || '—'}</TableCell>
                    <TableCell>
                      {call.outcome && <Badge className={outcomeColors[call.outcome]}>{call.outcome}</Badge>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDuration(call.started_at, call.ended_at)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(call.started_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
