import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { Download, FileText, TrendingUp, Phone, Calendar, DollarSign } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCompany } from '@/contexts/CompanyContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, subWeeks, startOfWeek, endOfWeek } from 'date-fns';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from 'recharts';

interface WeeklyData {
  week: string;
  calls: number;
  bookingLinksSent: number;
  confirmedBookings: number;
  revenue: number;
}

interface ROIMetrics {
  totalCalls: number;
  answeredCalls: number;
  bookingLinksSent: number;
  confirmedBookings: number;
  estimatedRevenue: number;
  avgRevenuePerCall: number;
  answerRate: number;
}

export default function ROIReport() {
  const { currentCompany } = useCompany();
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState('4weeks');
  const [metrics, setMetrics] = useState<ROIMetrics>({
    totalCalls: 0,
    answeredCalls: 0,
    bookingLinksSent: 0,
    confirmedBookings: 0,
    estimatedRevenue: 0,
    avgRevenuePerCall: 0,
    answerRate: 0,
  });
  const [weeklyData, setWeeklyData] = useState<WeeklyData[]>([]);

  useEffect(() => {
    if (currentCompany) {
      fetchROIData();
    }
  }, [currentCompany, dateRange]);

  const getDateRangeWeeks = () => {
    switch (dateRange) {
      case '4weeks': return 4;
      case '8weeks': return 8;
      case '12weeks': return 12;
      default: return 4;
    }
  };

  const fetchROIData = async () => {
    if (!currentCompany) return;
    setIsLoading(true);

    try {
      const weeks = getDateRangeWeeks();
      const startDate = startOfWeek(subWeeks(new Date(), weeks));

      const { data: calls, error } = await supabase
        .from('calls')
        .select('*')
        .eq('company_id', currentCompany.id)
        .gte('started_at', startDate.toISOString())
        .order('started_at', { ascending: true });

      if (error) throw error;

      // Calculate metrics
      const totalCalls = calls?.length || 0;
      const answeredCalls = calls?.filter(c => 
        c.outcome === 'answered' || c.outcome === 'booked' || c.outcome === 'booking_link_sent'
      ).length || 0;
      
      // Booking link sent = potential lead (SMS sent with booking link)
      const bookingLinksSent = calls?.filter(c => c.outcome === 'booking_link_sent').length || 0;
      
      // Confirmed bookings = verified booking (future: webhook from calendar/CRM)
      const confirmedBookings = calls?.filter(c => c.outcome === 'booked').length || 0;
      
      // Estimate revenue: $150 avg per CONFIRMED booking only
      const avgBookingValue = 150;
      const estimatedRevenue = confirmedBookings * avgBookingValue;
      const avgRevenuePerCall = totalCalls > 0 ? estimatedRevenue / totalCalls : 0;
      const answerRate = totalCalls > 0 ? (answeredCalls / totalCalls) * 100 : 0;

      setMetrics({
        totalCalls,
        answeredCalls,
        bookingLinksSent,
        confirmedBookings,
        estimatedRevenue,
        avgRevenuePerCall,
        answerRate,
      });

      // Group by week
      const weeklyMap = new Map<string, WeeklyData>();
      
      for (let i = 0; i < weeks; i++) {
        const weekStart = startOfWeek(subWeeks(new Date(), weeks - 1 - i));
        const weekKey = format(weekStart, 'MMM d');
        weeklyMap.set(weekKey, { week: weekKey, calls: 0, bookingLinksSent: 0, confirmedBookings: 0, revenue: 0 });
      }

      calls?.forEach(call => {
        const weekStart = startOfWeek(new Date(call.started_at));
        const weekKey = format(weekStart, 'MMM d');
        const existing = weeklyMap.get(weekKey);
        if (existing) {
          existing.calls++;
          if (call.outcome === 'booking_link_sent') {
            existing.bookingLinksSent++;
          }
          if (call.outcome === 'booked') {
            existing.confirmedBookings++;
            existing.revenue += avgBookingValue;
          }
        }
      });

      setWeeklyData(Array.from(weeklyMap.values()));
    } catch (error) {
      console.error('Error fetching ROI data:', error);
      toast.error('Failed to load ROI data');
    } finally {
      setIsLoading(false);
    }
  };

  const exportCSV = () => {
    const headers = ['Week', 'Total Calls', 'Booking Links Sent', 'Confirmed Bookings', 'Estimated Revenue'];
    const rows = weeklyData.map(w => [w.week, w.calls, w.bookingLinksSent, w.confirmedBookings, `$${w.revenue}`]);
    
    const summaryRows = [
      [],
      ['Summary'],
      ['Total Calls', metrics.totalCalls],
      ['Answered Calls', metrics.answeredCalls],
      ['Answer Rate', `${metrics.answerRate.toFixed(1)}%`],
      ['Booking Links Sent', metrics.bookingLinksSent],
      ['Confirmed Bookings', metrics.confirmedBookings],
      ['Estimated Revenue', `$${metrics.estimatedRevenue.toLocaleString()}`],
      ['Avg Revenue/Call', `$${metrics.avgRevenuePerCall.toFixed(2)}`],
    ];

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(',')),
      ...summaryRows.map(r => r.join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `roi-report-${currentCompany?.name}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported successfully');
  };

  const exportPDF = () => {
    // Create a printable HTML document
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>ROI Report - ${currentCompany?.name}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; }
          h1 { color: #1a1a1a; border-bottom: 2px solid #8B5CF6; padding-bottom: 10px; }
          .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin: 30px 0; }
          .metric { background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; }
          .metric-value { font-size: 28px; font-weight: bold; color: #8B5CF6; }
          .metric-label { color: #666; margin-top: 5px; }
          table { width: 100%; border-collapse: collapse; margin-top: 30px; }
          th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
          th { background: #8B5CF6; color: white; }
          tr:nth-child(even) { background: #f8f9fa; }
          .footer { margin-top: 40px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <h1>ROI Report: ${currentCompany?.name}</h1>
        <p>Generated: ${format(new Date(), 'MMMM d, yyyy')}</p>
        <p>Period: Last ${getDateRangeWeeks()} weeks</p>
        
        <div class="metrics">
          <div class="metric">
            <div class="metric-value">${metrics.totalCalls}</div>
            <div class="metric-label">Total Calls</div>
          </div>
          <div class="metric">
            <div class="metric-value">${metrics.bookingLinksSent}</div>
            <div class="metric-label">Booking Links Sent</div>
          </div>
          <div class="metric">
            <div class="metric-value">${metrics.confirmedBookings}</div>
            <div class="metric-label">Confirmed Bookings</div>
          </div>
          <div class="metric">
            <div class="metric-value">$${metrics.estimatedRevenue.toLocaleString()}</div>
            <div class="metric-label">Estimated Revenue</div>
          </div>
          <div class="metric">
            <div class="metric-value">${metrics.answerRate.toFixed(1)}%</div>
            <div class="metric-label">Answer Rate</div>
          </div>
          <div class="metric">
            <div class="metric-value">${metrics.answeredCalls}</div>
            <div class="metric-label">Answered Calls</div>
          </div>
          <div class="metric">
            <div class="metric-value">$${metrics.avgRevenuePerCall.toFixed(2)}</div>
            <div class="metric-label">Avg Revenue/Call</div>
          </div>
        </div>

        <h2>Weekly Breakdown</h2>
        <table>
          <thead>
            <tr>
              <th>Week</th>
              <th>Calls</th>
              <th>Links Sent</th>
              <th>Confirmed</th>
              <th>Revenue</th>
            </tr>
          </thead>
          <tbody>
            ${weeklyData.map(w => `
              <tr>
                <td>${w.week}</td>
                <td>${w.calls}</td>
                <td>${w.bookingLinksSent}</td>
                <td>${w.confirmedBookings}</td>
                <td>$${w.revenue}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="footer">
          <p>This report is automatically generated based on call data and estimated booking values.</p>
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.print();
    }
    toast.success('PDF ready for printing');
  };

  if (!currentCompany) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Select a company to view ROI report</p>
      </div>
    );
  }

  const chartConfig = {
    calls: { label: 'Calls', color: 'hsl(var(--primary))' },
    bookingLinksSent: { label: 'Links Sent', color: 'hsl(var(--warning))' },
    confirmedBookings: { label: 'Confirmed', color: 'hsl(var(--accent))' },
    revenue: { label: 'Revenue', color: 'hsl(142 76% 36%)' },
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">ROI Report</h1>
          <p className="text-muted-foreground">Track your return on investment from AI receptionist</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="4weeks">Last 4 weeks</SelectItem>
              <SelectItem value="8weeks">Last 8 weeks</SelectItem>
              <SelectItem value="12weeks">Last 12 weeks</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportCSV}>
            <FileText className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button onClick={exportPDF} className="bg-accent hover:bg-accent/90">
            <Download className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Phone className="h-4 w-4" />
              Total Calls
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{metrics.totalCalls}</div>
            <p className="text-sm text-muted-foreground">
              {metrics.answerRate.toFixed(1)}% answer rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Booking Links Sent
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-warning">{metrics.bookingLinksSent}</div>
            <p className="text-sm text-muted-foreground">
              Potential leads
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Confirmed Bookings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-accent">{metrics.confirmedBookings}</div>
            <p className="text-sm text-muted-foreground">
              {metrics.bookingLinksSent > 0 
                ? `${((metrics.confirmedBookings / metrics.bookingLinksSent) * 100).toFixed(1)}% conversion`
                : '0% conversion'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Estimated Revenue
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              ${metrics.estimatedRevenue.toLocaleString()}
            </div>
            <p className="text-sm text-muted-foreground">
              Based on $150/booking avg
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Avg Revenue/Call
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">${metrics.avgRevenuePerCall.toFixed(2)}</div>
            <p className="text-sm text-muted-foreground">
              Per incoming call
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Weekly Call Volume</CardTitle>
            <CardDescription>Calls, booking links, and confirmed bookings</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px]">
              <BarChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="week" className="text-xs" />
                <YAxis className="text-xs" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend />
                <Bar dataKey="calls" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="bookingLinksSent" fill="hsl(var(--warning))" radius={[4, 4, 0, 0]} name="Links Sent" />
                <Bar dataKey="confirmedBookings" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} name="Confirmed" />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Revenue Trend</CardTitle>
            <CardDescription>Estimated revenue by week</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px]">
              <LineChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="week" className="text-xs" />
                <YAxis className="text-xs" tickFormatter={(value) => `$${value}`} />
                <ChartTooltip 
                  content={<ChartTooltipContent />}
                  formatter={(value) => [`$${value}`, 'Revenue']}
                />
                <Line 
                  type="monotone" 
                  dataKey="revenue" 
                  stroke="hsl(142 76% 36%)" 
                  strokeWidth={2}
                  dot={{ fill: 'hsl(142 76% 36%)' }}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
