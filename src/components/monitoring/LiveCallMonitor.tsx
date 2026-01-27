import { useState, useEffect, useCallback } from 'react';
import { Phone, PhoneOff, Clock, User, Building2, Activity, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';

interface ActiveCall {
  id: string;
  company_id: string;
  company_name: string;
  caller_number: string | null;
  caller_name: string | null;
  started_at: string;
  outcome: string | null;
  duration_seconds: number | null;
}

interface LiveCallMonitorProps {
  companyId?: string; // Optional - if provided, filter to single company
}

export function LiveCallMonitor({ companyId }: LiveCallMonitorProps) {
  const [activeCalls, setActiveCalls] = useState<ActiveCall[]>([]);
  const [recentCalls, setRecentCalls] = useState<ActiveCall[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  const fetchActiveCalls = useCallback(async () => {
    try {
      // Fetch calls that started in the last 30 minutes and don't have an end time
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      
      let query = supabase
        .from('calls')
        .select(`
          id,
          company_id,
          caller_number,
          caller_name,
          started_at,
          outcome,
          ended_at,
          duration_seconds,
          companies!inner(name)
        `)
        .gte('started_at', thirtyMinutesAgo)
        .order('started_at', { ascending: false });

      if (companyId) {
        query = query.eq('company_id', companyId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const calls = (data || []).map((call: any) => ({
        id: call.id,
        company_id: call.company_id,
        company_name: call.companies?.name || 'Unknown',
        caller_number: call.caller_number,
        caller_name: call.caller_name,
        started_at: call.started_at,
        outcome: call.outcome,
        duration_seconds: call.duration_seconds,
      }));

      // Active calls have no outcome yet
      setActiveCalls(calls.filter((c) => !c.outcome));
      // Recent completed calls
      setRecentCalls(calls.filter((c) => !!c.outcome).slice(0, 5));
    } catch (error) {
      console.error('Error fetching calls:', error);
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchActiveCalls();

    // Subscribe to real-time changes
    const channel = supabase
      .channel('live-calls')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'calls',
          ...(companyId && { filter: `company_id=eq.${companyId}` }),
        },
        (payload) => {
          console.log('Call update:', payload);
          // Refetch on any change
          fetchActiveCalls();
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    // Refresh every 10 seconds as a fallback
    const interval = setInterval(fetchActiveCalls, 10000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [companyId, fetchActiveCalls]);

  const getOutcomeBadge = (outcome: string | null) => {
    if (!outcome) return <Badge variant="outline">In Progress</Badge>;
    
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

  const formatDuration = (startedAt: string, durationSeconds: number | null) => {
    if (durationSeconds) {
      const mins = Math.floor(durationSeconds / 60);
      const secs = durationSeconds % 60;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    // Calculate live duration
    const start = new Date(startedAt).getTime();
    const now = Date.now();
    const elapsed = Math.floor((now - start) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <div>
              <CardTitle>Live Call Monitor</CardTitle>
              <CardDescription>Real-time call activity across the platform</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`}
            />
            <span className="text-xs text-muted-foreground">
              {isConnected ? 'Live' : 'Connecting...'}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Active Calls */}
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Phone className="h-4 w-4 text-green-500" />
                Active Calls ({activeCalls.length})
              </h3>
              <AnimatePresence mode="popLayout">
                {activeCalls.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center py-6 text-muted-foreground border rounded-lg border-dashed"
                  >
                    <PhoneOff className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No active calls right now</p>
                  </motion.div>
                ) : (
                  <div className="space-y-2">
                    {activeCalls.map((call) => (
                      <motion.div
                        key={call.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="flex items-center justify-between p-3 rounded-lg border border-green-500/30 bg-green-500/5"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-green-500/20 flex items-center justify-center">
                            <Phone className="h-5 w-5 text-green-600 animate-pulse" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">
                                {call.caller_name || call.caller_number || 'Unknown Caller'}
                              </span>
                              {getOutcomeBadge(call.outcome)}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Building2 className="h-3 w-3" />
                              <span>{call.company_name}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center gap-1 text-lg font-mono font-semibold text-green-600">
                            <Clock className="h-4 w-4" />
                            <LiveDuration startedAt={call.started_at} />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Started {formatDistanceToNow(new Date(call.started_at), { addSuffix: true })}
                          </p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </AnimatePresence>
            </div>

            {/* Recent Calls */}
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Recent Calls
              </h3>
              {recentCalls.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No recent calls</p>
              ) : (
                <div className="space-y-2">
                  {recentCalls.map((call) => (
                    <div
                      key={call.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                          <User className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                              {call.caller_name || call.caller_number || 'Unknown'}
                            </span>
                            {getOutcomeBadge(call.outcome)}
                          </div>
                          <p className="text-xs text-muted-foreground">{call.company_name}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-mono">
                          {formatDuration(call.started_at, call.duration_seconds)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(call.started_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Component for live updating duration
function LiveDuration({ startedAt }: { startedAt: string }) {
  const [duration, setDuration] = useState('0:00');

  useEffect(() => {
    const updateDuration = () => {
      const start = new Date(startedAt).getTime();
      const now = Date.now();
      const elapsed = Math.floor((now - start) / 1000);
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      setDuration(`${mins}:${secs.toString().padStart(2, '0')}`);
    };

    updateDuration();
    const interval = setInterval(updateDuration, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  return <span>{duration}</span>;
}
