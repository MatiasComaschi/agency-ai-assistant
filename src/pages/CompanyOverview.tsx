import { motion } from 'framer-motion';
import { Phone, Bot, AlertTriangle, Calendar, DollarSign, MessageSquare, Pencil, Plus, PhoneCall } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

const stats = [
  { label: 'Calls Today', value: '24', icon: Phone, change: '+12%' },
  { label: 'AI Answered', value: '21', icon: Bot, change: '+8%' },
  { label: 'Escalations', value: '3', icon: AlertTriangle, change: '-5%' },
  { label: 'Bookings', value: '8', icon: Calendar, change: '+15%' },
  { label: 'Revenue Captured', value: '$2,400', icon: DollarSign, change: '+22%' },
];

export default function CompanyOverview() {
  const { currentCompany, isLoading } = useCompany();
  const navigate = useNavigate();

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading...</div>;
  }

  if (!currentCompany) {
    return (
      <div className="p-12 text-center">
        <h2 className="text-xl font-semibold mb-2">No company selected</h2>
        <p className="text-muted-foreground mb-4">Please select a company from the dropdown above</p>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold">{currentCompany.name}</h1>
        <p className="text-muted-foreground">{currentCompany.industry} • {currentCompany.timezone}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="stat-card">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-display font-bold">{stat.value}</p>
              <p className="text-xs text-accent">{stat.change} from yesterday</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="outline" className="gap-2">
            <PhoneCall className="h-4 w-4" /> Test AI
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => navigate('/ai-receptionist')}>
            <Pencil className="h-4 w-4" /> Edit Greeting
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => navigate('/knowledge-base')}>
            <Plus className="h-4 w-4" /> Add FAQ
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => navigate('/integrations')}>
            <MessageSquare className="h-4 w-4" /> Connect Phone
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}
