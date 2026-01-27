import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, CheckCircle, XCircle, AlertCircle, Server, Phone, Calendar } from 'lucide-react';
import { format } from 'date-fns';

interface StatusCheck {
  name: string;
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  message: string;
  lastChecked: Date;
}

export function SystemStatus() {
  const [isChecking, setIsChecking] = useState(false);

  const { data: statusChecks = [], refetch } = useQuery({
    queryKey: ['system-status'],
    queryFn: async (): Promise<StatusCheck[]> => {
      const checks: StatusCheck[] = [];
      const now = new Date();

      // Check Supabase connection
      try {
        const { error } = await supabase.from('companies').select('id').limit(1);
        checks.push({
          name: 'Database',
          status: error ? 'down' : 'healthy',
          message: error ? error.message : 'Connected',
          lastChecked: now,
        });
      } catch {
        checks.push({
          name: 'Database',
          status: 'down',
          message: 'Connection failed',
          lastChecked: now,
        });
      }

      // Check Twilio integrations
      try {
        const { data: integrations, error } = await supabase
          .from('integrations')
          .select('status, company_id')
          .eq('provider', 'twilio');
        
        if (error) throw error;
        
        const connectedCount = integrations?.filter(i => i.status === 'connected').length || 0;
        const totalCount = integrations?.length || 0;
        
        checks.push({
          name: 'Twilio Integrations',
          status: connectedCount === totalCount && totalCount > 0 ? 'healthy' : 
                  connectedCount > 0 ? 'degraded' : 'unknown',
          message: `${connectedCount}/${totalCount} connected`,
          lastChecked: now,
        });
      } catch {
        checks.push({
          name: 'Twilio Integrations',
          status: 'unknown',
          message: 'Unable to check',
          lastChecked: now,
        });
      }

      // Check Calendar connections
      try {
        const { data: calendars, error } = await supabase
          .from('calendar_connections')
          .select('status, company_id');
        
        if (error) throw error;
        
        const connectedCount = calendars?.filter(c => c.status === 'connected').length || 0;
        const totalCount = calendars?.length || 0;
        
        checks.push({
          name: 'Calendar Connections',
          status: connectedCount === totalCount && totalCount > 0 ? 'healthy' : 
                  connectedCount > 0 ? 'degraded' : 'unknown',
          message: `${connectedCount}/${totalCount} connected`,
          lastChecked: now,
        });
      } catch {
        checks.push({
          name: 'Calendar Connections',
          status: 'unknown',
          message: 'Unable to check',
          lastChecked: now,
        });
      }

      // Check for recent failures
      try {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { data: recentFailures, error } = await supabase
          .from('system_events')
          .select('id')
          .in('event_type', ['call_failure', 'stream_failure', 'dial_failure', 'error'])
          .gte('created_at', oneHourAgo);
        
        if (error) throw error;
        
        const failureCount = recentFailures?.length || 0;
        
        checks.push({
          name: 'Call System',
          status: failureCount === 0 ? 'healthy' : failureCount < 5 ? 'degraded' : 'down',
          message: failureCount === 0 ? 'No recent failures' : `${failureCount} failures in last hour`,
          lastChecked: now,
        });
      } catch {
        checks.push({
          name: 'Call System',
          status: 'unknown',
          message: 'Unable to check',
          lastChecked: now,
        });
      }

      return checks;
    },
    refetchInterval: 60000, // Refresh every minute
  });

  const handleRefresh = async () => {
    setIsChecking(true);
    await refetch();
    setIsChecking(false);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'degraded':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      case 'down':
        return <XCircle className="h-5 w-5 text-destructive" />;
      default:
        return <AlertCircle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'healthy':
        return <Badge className="bg-green-500">Healthy</Badge>;
      case 'degraded':
        return <Badge className="bg-yellow-500">Degraded</Badge>;
      case 'down':
        return <Badge variant="destructive">Down</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const getServiceIcon = (name: string) => {
    if (name.includes('Database') || name.includes('Call')) return <Server className="h-4 w-4" />;
    if (name.includes('Twilio')) return <Phone className="h-4 w-4" />;
    if (name.includes('Calendar')) return <Calendar className="h-4 w-4" />;
    return <Server className="h-4 w-4" />;
  };

  const overallStatus = statusChecks.some(c => c.status === 'down') ? 'down' :
                        statusChecks.some(c => c.status === 'degraded') ? 'degraded' :
                        statusChecks.every(c => c.status === 'healthy') ? 'healthy' : 'unknown';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-base">System Status</CardTitle>
            {getStatusBadge(overallStatus)}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isChecking}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${isChecking ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {statusChecks.map((check) => (
            <div
              key={check.name}
              className="flex items-center justify-between p-3 border rounded-lg"
            >
              <div className="flex items-center gap-3">
                {getStatusIcon(check.status)}
                <div>
                  <div className="flex items-center gap-2">
                    {getServiceIcon(check.name)}
                    <span className="font-medium">{check.name}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{check.message}</p>
                </div>
              </div>
              <div className="text-right">
                {getStatusBadge(check.status)}
                <p className="text-xs text-muted-foreground mt-1">
                  {format(check.lastChecked, 'h:mm:ss a')}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
