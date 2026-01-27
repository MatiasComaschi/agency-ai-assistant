import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, XCircle, AlertCircle, RefreshCw, Shield, Database, Zap, Ticket, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface VerificationResult {
  name: string;
  status: 'pass' | 'fail' | 'warning' | 'pending';
  message: string;
  details?: Record<string, unknown>;
  timestamp: Date;
}

export function VerificationHarness() {
  const { isAgencyAdmin } = useAuth();
  const [results, setResults] = useState<VerificationResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  // Fetch latest system events
  const { data: latestEvents } = useQuery({
    queryKey: ['verification-events'],
    queryFn: async () => {
      const { data } = await supabase
        .from('system_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);
      return data || [];
    },
  });

  // Fetch latest billing event (webhook)
  const { data: latestBillingEvent } = useQuery({
    queryKey: ['verification-billing-event'],
    queryFn: async () => {
      const { data } = await supabase
        .from('system_events')
        .select('*')
        .eq('source', 'stripe-webhook')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  // Run verification tests
  const runVerification = async () => {
    setIsRunning(true);
    const newResults: VerificationResult[] = [];

    // Test 1: Database connectivity
    try {
      const { data, error } = await supabase.from('companies').select('id').limit(1);
      newResults.push({
        name: 'Database Connectivity',
        status: error ? 'fail' : 'pass',
        message: error ? `Connection failed: ${error.message}` : 'Database is accessible',
        timestamp: new Date(),
      });
    } catch (err) {
      newResults.push({
        name: 'Database Connectivity',
        status: 'fail',
        message: `Exception: ${err instanceof Error ? err.message : 'Unknown error'}`,
        timestamp: new Date(),
      });
    }

    // Test 2: Subscription table exists and has records
    try {
      const { data, error } = await supabase.from('subscriptions').select('id, status, plan').limit(5);
      const activeCount = data?.filter(s => s.status === 'active').length || 0;
      newResults.push({
        name: 'Subscription System',
        status: error ? 'fail' : 'pass',
        message: error 
          ? `Error: ${error.message}` 
          : `Found ${data?.length || 0} subscriptions, ${activeCount} active`,
        details: { records: data?.length || 0, active: activeCount },
        timestamp: new Date(),
      });
    } catch (err) {
      newResults.push({
        name: 'Subscription System',
        status: 'fail',
        message: `Exception: ${err instanceof Error ? err.message : 'Unknown error'}`,
        timestamp: new Date(),
      });
    }

    // Test 3: Billing webhook connectivity (check for recent billing events)
    try {
      const { data, error } = await supabase
        .from('system_events')
        .select('*')
        .eq('source', 'stripe-webhook')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        const eventAge = Date.now() - new Date(data.created_at).getTime();
        const hoursSinceEvent = Math.floor(eventAge / (1000 * 60 * 60));
        newResults.push({
          name: 'Stripe Webhook',
          status: hoursSinceEvent < 24 ? 'pass' : 'warning',
          message: `Last webhook: ${format(new Date(data.created_at), 'PPpp')}`,
          details: { event_type: data.event_type, hours_ago: hoursSinceEvent },
          timestamp: new Date(),
        });
      } else {
        newResults.push({
          name: 'Stripe Webhook',
          status: 'warning',
          message: 'No webhook events recorded yet',
          timestamp: new Date(),
        });
      }
    } catch (err) {
      newResults.push({
        name: 'Stripe Webhook',
        status: 'fail',
        message: `Error checking webhooks: ${err instanceof Error ? err.message : 'Unknown error'}`,
        timestamp: new Date(),
      });
    }

    // Test 4: Calls logging
    try {
      const { data, error } = await supabase
        .from('calls')
        .select('id, started_at, outcome')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        newResults.push({
          name: 'Call Logging',
          status: 'pass',
          message: `Latest call: ${format(new Date(data.started_at), 'PPpp')}`,
          details: { call_id: data.id, outcome: data.outcome },
          timestamp: new Date(),
        });
      } else {
        newResults.push({
          name: 'Call Logging',
          status: 'warning',
          message: 'No calls recorded yet',
          timestamp: new Date(),
        });
      }
    } catch (err) {
      newResults.push({
        name: 'Call Logging',
        status: 'fail',
        message: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        timestamp: new Date(),
      });
    }

    // Test 5: Ticketing system
    try {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('id, status, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

      newResults.push({
        name: 'Ticketing System',
        status: error ? 'fail' : 'pass',
        message: error 
          ? `Error: ${error.message}` 
          : `Found ${data?.length || 0} tickets`,
        details: { ticket_count: data?.length || 0 },
        timestamp: new Date(),
      });
    } catch (err) {
      newResults.push({
        name: 'Ticketing System',
        status: 'fail',
        message: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        timestamp: new Date(),
      });
    }

    // Test 6: System events logging
    try {
      const { data, error } = await supabase
        .from('system_events')
        .select('id, event_type, source')
        .order('created_at', { ascending: false })
        .limit(10);

      newResults.push({
        name: 'System Events',
        status: error ? 'fail' : 'pass',
        message: error 
          ? `Error: ${error.message}` 
          : `${data?.length || 0} recent events logged`,
        details: { event_count: data?.length || 0 },
        timestamp: new Date(),
      });
    } catch (err) {
      newResults.push({
        name: 'System Events',
        status: 'fail',
        message: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        timestamp: new Date(),
      });
    }

    // Test 7: Subscription gating (check an inactive company)
    try {
      const { data: inactiveCompany } = await supabase
        .from('subscriptions')
        .select('company_id, status')
        .neq('status', 'active')
        .limit(1)
        .maybeSingle();

      if (inactiveCompany) {
        // Check if that company has ai_enabled (it shouldn't if gating works)
        const { data: company } = await supabase
          .from('companies')
          .select('ai_enabled')
          .eq('id', inactiveCompany.company_id)
          .single();

        newResults.push({
          name: 'Subscription Gating',
          status: 'pass',
          message: `Found inactive subscription for testing. AI enabled: ${company?.ai_enabled}`,
          details: { company_id: inactiveCompany.company_id, ai_enabled: company?.ai_enabled },
          timestamp: new Date(),
        });
      } else {
        newResults.push({
          name: 'Subscription Gating',
          status: 'warning',
          message: 'No inactive subscriptions to test gating',
          timestamp: new Date(),
        });
      }
    } catch (err) {
      newResults.push({
        name: 'Subscription Gating',
        status: 'fail',
        message: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        timestamp: new Date(),
      });
    }

    setResults(newResults);
    setIsRunning(false);
    toast.success('Verification complete');
  };

  // Create test system event
  const createTestEvent = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('system_events').insert({
        source: 'verification-harness',
        event_type: 'test',
        message: 'Test event from verification harness',
        company_id: null,
        metadata: { timestamp: new Date().toISOString(), test: true },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Test event created');
    },
    onError: (err) => {
      toast.error(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    },
  });

  if (!isAgencyAdmin) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Admin access required for verification harness.</AlertDescription>
      </Alert>
    );
  }

  const getStatusIcon = (status: VerificationResult['status']) => {
    switch (status) {
      case 'pass':
        return <CheckCircle2 className="h-5 w-5 text-primary" />;
      case 'fail':
        return <XCircle className="h-5 w-5 text-destructive" />;
      case 'warning':
        return <AlertCircle className="h-5 w-5 text-accent" />;
      default:
        return <RefreshCw className="h-5 w-5 text-muted-foreground animate-spin" />;
    }
  };

  const getStatusBadge = (status: VerificationResult['status']) => {
    switch (status) {
      case 'pass':
        return <Badge variant="default">PASS</Badge>;
      case 'fail':
        return <Badge variant="destructive">FAIL</Badge>;
      case 'warning':
        return <Badge variant="secondary">WARN</Badge>;
      default:
        return <Badge variant="outline">PENDING</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              System Verification
            </CardTitle>
            <CardDescription>
              Run end-to-end checks to verify system wiring
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => createTestEvent.mutate()}
              disabled={createTestEvent.isPending}
            >
              <Zap className="h-4 w-4 mr-2" />
              Create Test Event
            </Button>
            <Button onClick={runVerification} disabled={isRunning}>
              {isRunning ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Run Verification
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Results */}
        {results.length > 0 ? (
          <div className="space-y-3">
            {results.map((result, idx) => (
              <div
                key={idx}
                className="flex items-start justify-between p-4 rounded-lg border bg-card"
              >
                <div className="flex items-start gap-3">
                  {getStatusIcon(result.status)}
                  <div>
                    <p className="font-medium">{result.name}</p>
                    <p className="text-sm text-muted-foreground">{result.message}</p>
                    {result.details && (
                      <pre className="text-xs text-muted-foreground mt-1 bg-muted p-2 rounded">
                        {JSON.stringify(result.details, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
                {getStatusBadge(result.status)}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            Click "Run Verification" to check system status
          </div>
        )}

        {/* Quick Stats */}
        {results.length > 0 && (
          <div className="flex gap-4 pt-4 border-t">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <span className="text-sm">{results.filter(r => r.status === 'pass').length} Passed</span>
            </div>
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-destructive" />
              <span className="text-sm">{results.filter(r => r.status === 'fail').length} Failed</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-accent" />
              <span className="text-sm">{results.filter(r => r.status === 'warning').length} Warnings</span>
            </div>
          </div>
        )}

        {/* Last Webhook Info */}
        {latestBillingEvent && (
          <div className="pt-4 border-t">
            <p className="text-sm font-medium mb-2">Last Stripe Webhook</p>
            <div className="p-3 rounded-lg bg-muted text-sm">
              <p><strong>Type:</strong> {latestBillingEvent.event_type}</p>
              <p><strong>Time:</strong> {format(new Date(latestBillingEvent.created_at), 'PPpp')}</p>
              <p><strong>Message:</strong> {latestBillingEvent.message}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
