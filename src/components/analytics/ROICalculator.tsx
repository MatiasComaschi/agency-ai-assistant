import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Calculator, DollarSign, TrendingUp, Clock, PiggyBank, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { useCompany } from '@/contexts/CompanyContext';
import { supabase } from '@/integrations/supabase/client';

interface CalculatorInputs {
  avgBookingValue: number;
  receptionistHourlyCost: number;
  hoursPerDay: number;
  missedCallCost: number;
}

interface ROIResults {
  monthlySavings: number;
  annualSavings: number;
  laborSavings: number;
  missedCallRecovery: number;
  additionalRevenue: number;
  roi: number;
}

export function ROICalculator() {
  const { currentCompany } = useCompany();
  const [inputs, setInputs] = useState<CalculatorInputs>({
    avgBookingValue: 150,
    receptionistHourlyCost: 18,
    hoursPerDay: 8,
    missedCallCost: 50,
  });
  const [callStats, setCallStats] = useState({
    totalCalls: 0,
    answeredCalls: 0,
    bookings: 0,
  });
  const [results, setResults] = useState<ROIResults>({
    monthlySavings: 0,
    annualSavings: 0,
    laborSavings: 0,
    missedCallRecovery: 0,
    additionalRevenue: 0,
    roi: 0,
  });

  useEffect(() => {
    if (currentCompany) {
      fetchCallStats();
    }
  }, [currentCompany]);

  useEffect(() => {
    calculateROI();
  }, [inputs, callStats]);

  const fetchCallStats = async () => {
    if (!currentCompany) return;
    
    // Get last 30 days of call data
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: calls } = await supabase
      .from('calls')
      .select('outcome')
      .eq('company_id', currentCompany.id)
      .gte('started_at', thirtyDaysAgo.toISOString());

    const total = calls?.length || 0;
    const answered = calls?.filter(c => 
      c.outcome === 'answered' || c.outcome === 'booked' || c.outcome === 'booking_link_sent'
    ).length || 0;
    const bookings = calls?.filter(c => c.outcome === 'booked').length || 0;

    setCallStats({ totalCalls: total, answeredCalls: answered, bookings });
  };

  const calculateROI = () => {
    const workDaysPerMonth = 22;
    const aiSubscriptionCost = 399; // Starter plan
    
    // Labor savings: What you'd pay a receptionist
    const monthlyReceptionistCost = inputs.receptionistHourlyCost * inputs.hoursPerDay * workDaysPerMonth;
    const laborSavings = monthlyReceptionistCost - aiSubscriptionCost;
    
    // Missed call recovery: AI answers 24/7, recovering after-hours calls
    // Estimate 20% of calls would be missed without AI
    const missedCallsRecovered = Math.round(callStats.totalCalls * 0.2);
    const missedCallRecovery = missedCallsRecovered * inputs.missedCallCost;
    
    // Additional revenue from bookings
    const additionalRevenue = callStats.bookings * inputs.avgBookingValue;
    
    // Total monthly savings
    const monthlySavings = laborSavings + missedCallRecovery + additionalRevenue;
    const annualSavings = monthlySavings * 12;
    
    // ROI percentage
    const roi = aiSubscriptionCost > 0 
      ? ((monthlySavings - aiSubscriptionCost) / aiSubscriptionCost) * 100 
      : 0;

    setResults({
      monthlySavings,
      annualSavings,
      laborSavings,
      missedCallRecovery,
      additionalRevenue,
      roi: Math.max(0, roi),
    });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }} 
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            ROI Calculator
          </CardTitle>
          <CardDescription>
            Estimate your return on investment from AI Receptionist
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Input Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <Label className="flex items-center justify-between">
                  Average Booking Value
                  <span className="font-bold text-primary">{formatCurrency(inputs.avgBookingValue)}</span>
                </Label>
                <Slider
                  value={[inputs.avgBookingValue]}
                  onValueChange={([v]) => setInputs({ ...inputs, avgBookingValue: v })}
                  min={25}
                  max={500}
                  step={25}
                  className="mt-2"
                />
              </div>
              
              <div>
                <Label className="flex items-center justify-between">
                  Receptionist Hourly Cost
                  <span className="font-bold text-primary">{formatCurrency(inputs.receptionistHourlyCost)}/hr</span>
                </Label>
                <Slider
                  value={[inputs.receptionistHourlyCost]}
                  onValueChange={([v]) => setInputs({ ...inputs, receptionistHourlyCost: v })}
                  min={12}
                  max={35}
                  step={1}
                  className="mt-2"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="flex items-center justify-between">
                  Hours Staffed Per Day
                  <span className="font-bold text-primary">{inputs.hoursPerDay} hrs</span>
                </Label>
                <Slider
                  value={[inputs.hoursPerDay]}
                  onValueChange={([v]) => setInputs({ ...inputs, hoursPerDay: v })}
                  min={4}
                  max={12}
                  step={1}
                  className="mt-2"
                />
              </div>
              
              <div>
                <Label className="flex items-center justify-between">
                  Cost of Missed Call
                  <span className="font-bold text-primary">{formatCurrency(inputs.missedCallCost)}</span>
                </Label>
                <Slider
                  value={[inputs.missedCallCost]}
                  onValueChange={([v]) => setInputs({ ...inputs, missedCallCost: v })}
                  min={10}
                  max={200}
                  step={10}
                  className="mt-2"
                />
              </div>
            </div>
          </div>

          {/* Stats from actual data */}
          <div className="bg-muted/50 rounded-lg p-4">
            <p className="text-sm text-muted-foreground mb-2">Based on your last 30 days:</p>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold">{callStats.totalCalls}</div>
                <div className="text-xs text-muted-foreground">Total Calls</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">{callStats.answeredCalls}</div>
                <div className="text-xs text-muted-foreground">Answered</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-accent">{callStats.bookings}</div>
                <div className="text-xs text-muted-foreground">Bookings</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-green-200 bg-green-50/50 dark:bg-green-900/10">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-green-700 dark:text-green-400">
              <PiggyBank className="h-4 w-4" />
              Monthly Savings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-700 dark:text-green-400">
              {formatCurrency(results.monthlySavings)}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              vs. human receptionist
            </p>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-900/10">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
              <DollarSign className="h-4 w-4" />
              Annual Savings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-700 dark:text-blue-400">
              {formatCurrency(results.annualSavings)}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              projected yearly
            </p>
          </CardContent>
        </Card>

        <Card className="border-purple-200 bg-purple-50/50 dark:bg-purple-900/10">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-purple-700 dark:text-purple-400">
              <TrendingUp className="h-4 w-4" />
              ROI
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-700 dark:text-purple-400">
              {results.roi.toFixed(0)}%
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              return on investment
            </p>
          </CardContent>
        </Card>

        <Card className="border-orange-200 bg-orange-50/50 dark:bg-orange-900/10">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
              <Clock className="h-4 w-4" />
              Hours Saved
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-700 dark:text-orange-400">
              {(inputs.hoursPerDay * 22).toFixed(0)}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              per month
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Savings Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span>Labor Cost Savings</span>
              </div>
              <span className="font-medium text-green-600">{formatCurrency(results.laborSavings)}/mo</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>Missed Call Recovery</span>
              </div>
              <span className="font-medium text-green-600">{formatCurrency(results.missedCallRecovery)}/mo</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span>Additional Revenue from Bookings</span>
              </div>
              <span className="font-medium text-green-600">{formatCurrency(results.additionalRevenue)}/mo</span>
            </div>
            <div className="flex justify-between items-center py-2 font-bold">
              <span>Total Monthly Value</span>
              <span className="text-green-600">{formatCurrency(results.monthlySavings)}/mo</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
