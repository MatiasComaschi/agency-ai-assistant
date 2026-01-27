import { useState, useEffect } from 'react';
import { Mic, Loader2, Phone, Clock, Calendar, ChevronDown, ChevronUp, Building2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { CallRecordingPlayer } from './CallRecordingPlayer';

interface CallWithRecording {
  id: string;
  company_id: string;
  company_name: string;
  caller_number: string | null;
  caller_name: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  recording_url: string | null;
  outcome: string | null;
  summary: string | null;
}

interface CallRecordingsTableProps {
  companyId?: string; // Optional - if provided, filter to single company
}

export function CallRecordingsTable({ companyId }: CallRecordingsTableProps) {
  const [calls, setCalls] = useState<CallWithRecording[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedCallId, setExpandedCallId] = useState<string | null>(null);

  useEffect(() => {
    fetchCallsWithRecordings();
  }, [companyId]);

  const fetchCallsWithRecordings = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('calls')
        .select(`
          id,
          company_id,
          caller_number,
          caller_name,
          started_at,
          ended_at,
          duration_seconds,
          recording_url,
          outcome,
          summary,
          companies!inner(name)
        `)
        .not('recording_url', 'is', null)
        .order('started_at', { ascending: false })
        .limit(50);

      if (companyId) {
        query = query.eq('company_id', companyId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const callsWithRecordings: CallWithRecording[] = (data || []).map((call: any) => ({
        id: call.id,
        company_id: call.company_id,
        company_name: call.companies?.name || 'Unknown',
        caller_number: call.caller_number,
        caller_name: call.caller_name,
        started_at: call.started_at,
        ended_at: call.ended_at,
        duration_seconds: call.duration_seconds,
        recording_url: call.recording_url,
        outcome: call.outcome,
        summary: call.summary,
      }));

      setCalls(callsWithRecordings);
    } catch (error) {
      console.error('Error fetching call recordings:', error);
      toast.error('Failed to load call recordings');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getOutcomeBadge = (outcome: string | null) => {
    if (!outcome) return <Badge variant="outline">Unknown</Badge>;
    
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
      completed: { variant: 'default', label: 'Completed' },
      booked: { variant: 'default', label: 'Booked' },
      booking_link_sent: { variant: 'secondary', label: 'Link Sent' },
      escalated: { variant: 'destructive', label: 'Escalated' },
      voicemail: { variant: 'secondary', label: 'Voicemail' },
      missed: { variant: 'destructive', label: 'Missed' },
    };

    const config = variants[outcome] || { variant: 'outline', label: outcome };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const toggleExpanded = (callId: string) => {
    setExpandedCallId(expandedCallId === callId ? null : callId);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Mic className="h-5 w-5 text-primary" />
          <div>
            <CardTitle>Call Recordings</CardTitle>
            <CardDescription>
              Listen to and download call recordings
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : calls.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Mic className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No call recordings available</p>
            <p className="text-sm mt-1">Recordings will appear here once calls are completed</p>
          </div>
        ) : (
          <div className="space-y-2">
            {calls.map((call) => (
              <Collapsible
                key={call.id}
                open={expandedCallId === call.id}
                onOpenChange={() => toggleExpanded(call.id)}
              >
                <div className="border rounded-lg overflow-hidden">
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Phone className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {call.caller_name || call.caller_number || 'Unknown Caller'}
                            </span>
                            {getOutcomeBadge(call.outcome)}
                          </div>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            {!companyId && (
                              <span className="flex items-center gap-1">
                                <Building2 className="h-3 w-3" />
                                {call.company_name}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(call.started_at), 'MMM d, yyyy h:mm a')}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDuration(call.duration_seconds)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon">
                        {expandedCallId === call.id ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-4 pb-4 space-y-4 border-t bg-muted/20">
                      <div className="pt-4">
                        <CallRecordingPlayer
                          recordingUrl={call.recording_url}
                          durationSeconds={call.duration_seconds}
                          callId={call.id}
                        />
                      </div>
                      {call.summary && (
                        <div className="space-y-1">
                          <h4 className="text-sm font-medium">Summary</h4>
                          <p className="text-sm text-muted-foreground">{call.summary}</p>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
