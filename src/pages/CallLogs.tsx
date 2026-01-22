import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Phone, Filter } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { CallLog } from '@/types';

const outcomeColors: Record<string, string> = {
  answered: 'bg-accent text-accent-foreground',
  missed: 'bg-destructive text-destructive-foreground',
  voicemail: 'bg-warning text-warning-foreground',
  escalated: 'bg-info text-info-foreground',
};

export default function CallLogs() {
  const { currentCompany } = useCompany();
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [outcomeFilter, setOutcomeFilter] = useState('all');

  useEffect(() => {
    if (currentCompany) fetchCalls();
  }, [currentCompany, outcomeFilter]);

  const fetchCalls = async () => {
    let query = supabase.from('call_logs').select('*').eq('company_id', currentCompany!.id).order('created_at', { ascending: false });
    if (outcomeFilter !== 'all') query = query.eq('outcome', outcomeFilter);
    const { data } = await query;
    setCalls((data as CallLog[]) || []);
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
            <SelectItem value="missed">Missed</SelectItem>
            <SelectItem value="voicemail">Voicemail</SelectItem>
            <SelectItem value="escalated">Escalated</SelectItem>
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
                    <TableCell className="text-muted-foreground">{call.caller_phone || '—'}</TableCell>
                    <TableCell>
                      {call.outcome && <Badge className={outcomeColors[call.outcome]}>{call.outcome}</Badge>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{Math.floor(call.duration_seconds / 60)}:{String(call.duration_seconds % 60).padStart(2, '0')}</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(call.created_at).toLocaleString()}</TableCell>
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
