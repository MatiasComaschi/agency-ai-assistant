import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Activity, 
  AlertCircle, 
  Clock, 
  DollarSign, 
  PhoneForwarded, 
  TrendingUp, 
  RefreshCw,
  Calendar
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCompany } from '@/contexts/CompanyContext';
import { supabase } from '@/integrations/supabase/client';

interface MetricsSummary {
  totalCalls: number;
  errorCount: number;
  errorRate: number;
  avgLatencyMs: number;
  escalationCount: number;
  escalationRate: number;
  totalCostCents: number;
  avgCostPerCall: number;
}

interface WebhookMetric {
  endpoint: string;
  success: boolean;
  latency_ms: number;
  error_message: string | null;
  created_at: string;
}

interface CallMetric {
  outcome: string | null;
  cost_cents: number | null;
  duration_seconds: number | null;
  started_at: string;
}

export default function Monitoring() {
  const { currentCompany } = useCompany();
  const [isLoading, setIsLoading] = useState(false);
  const [timeRange, setTimeRange] = useState('7d');
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [recentErrors, setRecentErrors] = useState<WebhookMetric[]>([]);
  const [callsByOutcome, setCallsByOutcome] = useState<Record<string, number>>({});

  useEffect(() => {
    if (currentCompany) {
      fetchMetrics();
    }
  }, [currentCompany, timeRange]);

  const getDateRange = () => {
    const end = new Date();
    const start = new Date();
    switch (timeRange) {
      case '24h':
        start.setHours(start.getHours() - 24);
        break;
      case '7d':
        start.setDate(start.getDate() - 7);
        break;
      case '30d':
        start.setDate(start.getDate() - 30);
        break;
      default:
        start.setDate(start.getDate() - 7);
    }
    return { start, end };
  };

  const fetchMetrics = async () => {
    if (!currentCompany) return;
    setIsLoading(true);
    try {
      const { start, end } = getDateRange();

      // Fetch webhook metrics
      const { data: webhookData } = await supabase
        .from('webhook_metrics')
        .select('endpoint, success, latency_ms, error_message, created_at')
        .eq('company_id', currentCompany.id)
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .order('created_at', { ascending: false });

      // Fetch call metrics
      const { data: callsData } = await supabase
        .from('calls')
        .select('outcome, cost_cents, duration_seconds, started_at')
        .eq('company_id', currentCompany.id)
        .gte('started_at', start.toISOString())
        .lte('started_at', end.toISOString());

      const webhookMetrics = (webhookData || []) as WebhookMetric[];
      const calls = (callsData || []) as CallMetric[];

      // Calculate metrics
      const totalCalls = calls.length;
      const errorCount = webhookMetrics.filter(m => !m.success).length;
      const totalMetrics = webhookMetrics.length || 1;
      const errorRate = (errorCount / totalMetrics) * 100;
      
      const avgLatencyMs = webhookMetrics.length
        ? webhookMetrics.reduce((sum, m) => sum + (m.latency_ms || 0), 0) / webhookMetrics.length
        : 0;

      const escalationCount = calls.filter(c => c.outcome === 'escalated').length;
      const escalationRate = totalCalls > 0 ? (escalationCount / totalCalls) * 100 : 0;

      const totalCostCents = calls.reduce((sum, c) => sum + (c.cost_cents || 0), 0);
      const avgCostPerCall = totalCalls > 0 ? totalCostCents / totalCalls : 0;

      setMetrics({
        totalCalls,
        errorCount,
        errorRate: Math.round(errorRate * 100) / 100,
        avgLatencyMs: Math.round(avgLatencyMs),
        escalationCount,
        escalationRate: Math.round(escalationRate * 100) / 100,
        totalCostCents,
        avgCostPerCall: Math.round(avgCostPerCall * 100) / 100,
      });

      // Recent errors
      setRecentErrors(webhookMetrics.filter(m => !m.success).slice(0, 10));

      // Calls by outcome
      const outcomeMap: Record<string, number> = {};
      calls.forEach(c => {
        const outcome = c.outcome || 'unknown';
        outcomeMap[outcome] = (outcomeMap[outcome] || 0) + 1;
      });
      setCallsByOutcome(outcomeMap);

    } catch (error) {
      console.error('Error fetching metrics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!currentCompany) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Select a company to view monitoring</p>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Monitoring</h1>
          <p className="text-muted-foreground">Webhook metrics, errors, and performance</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[140px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24 Hours</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchMetrics} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Calls</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.totalCalls || 0}</div>
            <p className="text-xs text-muted-foreground">In selected period</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
            <AlertCircle className={`h-4 w-4 ${(metrics?.errorRate || 0) > 5 ? 'text-destructive' : 'text-muted-foreground'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${(metrics?.errorRate || 0) > 5 ? 'text-destructive' : ''}`}>
              {metrics?.errorRate || 0}%
            </div>
            <p className="text-xs text-muted-foreground">{metrics?.errorCount || 0} webhook errors</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg Latency</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${(metrics?.avgLatencyMs || 0) > 1000 ? 'text-warning' : ''}`}>
              {metrics?.avgLatencyMs || 0}ms
            </div>
            <p className="text-xs text-muted-foreground">Webhook response time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Escalation Rate</CardTitle>
            <PhoneForwarded className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.escalationRate || 0}%</div>
            <p className="text-xs text-muted-foreground">{metrics?.escalationCount || 0} escalated calls</p>
          </CardContent>
        </Card>
      </div>

      {/* Cost Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              <CardTitle>Cost Summary</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Total Cost</span>
              <span className="text-2xl font-bold">${((metrics?.totalCostCents || 0) / 100).toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Avg per Call</span>
              <span className="font-medium">${((metrics?.avgCostPerCall || 0) / 100).toFixed(2)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <CardTitle>Call Outcomes</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(callsByOutcome).map(([outcome, count]) => (
                <div key={outcome} className="flex justify-between items-center">
                  <span className="text-sm capitalize">{outcome.replace('_', ' ')}</span>
                  <span className="font-medium">{count}</span>
                </div>
              ))}
              {Object.keys(callsByOutcome).length === 0 && (
                <p className="text-sm text-muted-foreground">No calls in this period</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Errors */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <CardTitle>Recent Errors</CardTitle>
          </div>
          <CardDescription>Last 10 webhook errors in selected period</CardDescription>
        </CardHeader>
        <CardContent>
          {recentErrors.length > 0 ? (
            <div className="space-y-3">
              {recentErrors.map((error, i) => (
                <div key={i} className="border rounded-lg p-3 space-y-1">
                  <div className="flex justify-between items-start">
                    <code className="text-sm font-medium">{error.endpoint}</code>
                    <span className="text-xs text-muted-foreground">
                      {new Date(error.created_at).toLocaleString()}
                    </span>
                  </div>
                  {error.error_message && (
                    <p className="text-sm text-destructive">{error.error_message}</p>
                  )}
                  <p className="text-xs text-muted-foreground">Latency: {error.latency_ms}ms</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No errors in this period 🎉</p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
