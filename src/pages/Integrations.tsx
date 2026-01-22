import { motion } from 'framer-motion';
import { Phone, Calendar, Mail, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const integrations = [
  { name: 'Twilio', description: 'Connect your phone numbers', icon: Phone, connected: false },
  { name: 'Calendly', description: 'Sync your booking calendar', icon: Calendar, connected: false },
  { name: 'Google Calendar', description: 'Connect Google Calendar', icon: Calendar, connected: false },
  { name: 'Email', description: 'Send email notifications', icon: Mail, connected: false },
];

export default function Integrations() {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold">Integrations</h1>
        <p className="text-muted-foreground">Connect your favorite tools</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {integrations.map((int) => (
          <Card key={int.name}>
            <CardHeader className="flex flex-row items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center">
                <int.icon className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-lg">{int.name}</CardTitle>
                <CardDescription>{int.description}</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full gap-2">
                <ExternalLink className="h-4 w-4" /> Connect
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </motion.div>
  );
}
