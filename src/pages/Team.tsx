import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Users, Mail, Trash2 } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';

export default function Team() {
  const { currentCompany } = useCompany();
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('company_staff');

  const handleInvite = () => {
    if (!email) { toast.error('Please enter an email'); return; }
    toast.success(`Invitation sent to ${email}`);
    setIsOpen(false);
    setEmail('');
  };

  if (!currentCompany) return <div className="p-8 text-center text-muted-foreground">Please select a company</div>;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-display font-bold">Team</h1>
          <p className="text-muted-foreground">Manage team members for {currentCompany.name}</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="bg-accent hover:bg-accent/90"><Plus className="h-4 w-4 mr-2" /> Invite Member</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Invite Team Member</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="colleague@example.com" /></div>
              <div><Label>Role</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="company_owner">Owner</SelectItem>
                    <SelectItem value="company_staff">Staff</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleInvite} className="w-full bg-accent hover:bg-accent/90"><Mail className="h-4 w-4 mr-2" /> Send Invitation</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-12 text-center">
          <Users className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
          <p className="text-muted-foreground">No team members yet. Invite your first one!</p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
