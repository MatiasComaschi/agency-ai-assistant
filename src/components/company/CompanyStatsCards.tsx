import { useState, useEffect } from 'react';
import { Phone, PhoneForwarded, PhoneMissed, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { startOfDay, endOfDay } from 'date-fns';

interface CompanyStatsCardsProps {
  companyId: string;
}

interface Stats {
  callsToday: number;
  escalationsToday: number;
  missedToday: number;
  bookingsToday: number;
}

export function CompanyStatsCards({ companyId }: CompanyStatsCardsProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, [companyId]);

  const fetchStats = async () => {
    setIsLoading(true);
    const now = new Date();
    const todayStart = startOfDay(now).toISOString();
    const todayEnd = endOfDay(now).toISOString();

    // Fetch today's calls for this company
    const { data: calls, error } = await supabase
      .from('calls')
      .select('outcome')
      .eq('company_id', companyId)
      .gte('started_at', todayStart)
      .lte('started_at', todayEnd);

    if (error) {
      setIsLoading(false);
      return;
    }

    const callsArray = calls || [];
    setStats({
      callsToday: callsArray.length,
      escalationsToday: callsArray.filter(c => c.outcome === 'escalated').length,
      missedToday: callsArray.filter(c => c.outcome === 'missed' || c.outcome === 'voicemail').length,
      bookingsToday: callsArray.filter(c => c.outcome === 'booked').length,
    });
    setIsLoading(false);
  };

  const statCards = [
    { label: 'Calls Today', value: stats?.callsToday ?? 0, icon: Phone, color: 'text-primary' },
    { label: 'Escalations', value: stats?.escalationsToday ?? 0, icon: PhoneForwarded, color: 'text-destructive' },
    { label: 'Missed/Voicemail', value: stats?.missedToday ?? 0, icon: PhoneMissed, color: 'text-warning' },
    { label: 'Bookings', value: stats?.bookingsToday ?? 0, icon: Calendar, color: 'text-accent' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {statCards.map((stat) => (
        <Card key={stat.label}>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
            <stat.icon className={`h-4 w-4 ${stat.color}`} />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-2xl font-display font-bold">{stat.value}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
