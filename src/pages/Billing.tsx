import { motion } from 'framer-motion';
import { Check, CreditCard } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

const plans = [
  { name: 'Starter', price: '$49/mo', calls: '500 calls', features: ['1 AI Receptionist', 'Basic Analytics', 'Email Support'] },
  { name: 'Professional', price: '$149/mo', calls: '2,000 calls', features: ['3 AI Receptionists', 'Advanced Analytics', 'Priority Support', 'Custom Greetings'], popular: true },
  { name: 'Enterprise', price: 'Custom', calls: 'Unlimited', features: ['Unlimited AI Receptionists', 'White Label', 'Dedicated Account Manager', 'SLA Guarantee'] },
];

export default function Billing() {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold">Billing</h1>
        <p className="text-muted-foreground">Manage your subscription and usage</p>
      </div>

      {/* Usage */}
      <Card>
        <CardHeader>
          <CardTitle>Current Usage</CardTitle>
          <CardDescription>This billing period</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span>Calls Used</span>
              <span className="font-medium">342 / 500</span>
            </div>
            <Progress value={68} className="h-2" />
          </div>
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span>Minutes Used</span>
              <span className="font-medium">1,245 / 2,500</span>
            </div>
            <Progress value={50} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Plans */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plans.map((plan) => (
          <Card key={plan.name} className={plan.popular ? 'border-accent ring-2 ring-accent' : ''}>
            <CardHeader>
              {plan.popular && <span className="text-xs font-semibold text-accent mb-2">MOST POPULAR</span>}
              <CardTitle>{plan.name}</CardTitle>
              <div className="text-2xl font-display font-bold">{plan.price}</div>
              <CardDescription>{plan.calls}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-accent" /> {f}
                  </li>
                ))}
              </ul>
              <Button className={plan.popular ? 'w-full bg-accent hover:bg-accent/90' : 'w-full'} variant={plan.popular ? 'default' : 'outline'}>
                {plan.name === 'Enterprise' ? 'Contact Sales' : 'Upgrade'}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </motion.div>
  );
}
