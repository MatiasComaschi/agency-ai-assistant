import { motion } from 'framer-motion';
import { Settings as SettingsIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

export default function Settings() {
  const { profile } = useAuth();

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-display font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account settings</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Update your personal information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div><Label>Full Name</Label><Input defaultValue={profile?.full_name || ''} /></div>
          <div><Label>Email</Label><Input defaultValue={profile?.email || ''} disabled /></div>
          <Button className="bg-accent hover:bg-accent/90">Save Changes</Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}
