import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Gift, Send, Copy, Trash2, Clock, CheckCircle } from 'lucide-react';

interface TrialInvite {
  id: string;
  email: string;
  company_name: string;
  plan: string;
  trial_days: number;
  token: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

export function TrialInviteSection() {
  const { isAgencyAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [plan, setPlan] = useState('starter');
  const [trialDays, setTrialDays] = useState('14');

  const { data: invites = [], isLoading } = useQuery({
    queryKey: ['trial-invites'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trial_invites')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as TrialInvite[];
    },
    enabled: isAgencyAdmin,
  });

  const sendInvite = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('send-trial-invite', {
        body: {
          email: email.trim().toLowerCase(),
          company_name: companyName.trim(),
          plan,
          trial_days: parseInt(trialDays),
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['trial-invites'] });
      if (data?.emailSent) {
        toast.success('Trial invite sent!');
      } else {
        toast.success('Trial invite created - copy the link to share manually', {
          description: 'Email sending requires a verified domain on Resend',
        });
      }
      setEmail('');
      setCompanyName('');
      setPlan('starter');
      setTrialDays('14');
    },
    onError: (err) => {
      console.error('Error sending trial invite:', err);
      toast.error('Failed to send trial invite');
    },
  });

  const deleteInvite = useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase
        .from('trial_invites')
        .delete()
        .eq('id', inviteId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trial-invites'] });
      toast.success('Invite deleted');
    },
    onError: () => toast.error('Failed to delete invite'),
  });

  const copyInviteLink = (token: string) => {
    const link = `${window.location.origin}/auth?trial=${token}`;
    navigator.clipboard.writeText(link);
    toast.success('Trial invite link copied');
  };

  if (!isAgencyAdmin) return null;

  return (
    <div className="space-y-6">
      {/* Send Trial Invite */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" />
            Send Trial Invite
          </CardTitle>
          <CardDescription>
            Invite a company to try AI Reception with a free trial
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-2">
              <Label htmlFor="trial-email">Email</Label>
              <Input
                id="trial-email"
                type="email"
                placeholder="owner@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="trial-company">Company Name</Label>
              <Input
                id="trial-company"
                placeholder="Acme Corp"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="trial-plan">Plan</Label>
              <Select value={plan} onValueChange={setPlan}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="starter">Starter ($399/mo)</SelectItem>
                  <SelectItem value="pro">Pro ($799/mo)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="trial-days">Trial Days</Label>
              <Select value={trialDays} onValueChange={setTrialDays}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="14">14 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                onClick={() => sendInvite.mutate()}
                disabled={!email.trim() || !companyName.trim() || sendInvite.isPending}
                className="w-full"
              >
                <Send className="h-4 w-4 mr-2" />
                {sendInvite.isPending ? 'Sending...' : 'Send Invite'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Trial Invites */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Recent Trial Invites
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-4 text-muted-foreground">Loading...</div>
          ) : invites.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              No trial invites sent yet
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Trial</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.map((invite) => (
                  <TableRow key={invite.id}>
                    <TableCell className="font-medium">{invite.email}</TableCell>
                    <TableCell>{invite.company_name}</TableCell>
                    <TableCell>
                      <Badge variant={invite.plan === 'pro' ? 'default' : 'secondary'}>
                        {invite.plan === 'pro' ? 'Pro' : 'Starter'}
                      </Badge>
                    </TableCell>
                    <TableCell>{invite.trial_days} days</TableCell>
                    <TableCell>
                      {invite.accepted_at ? (
                        <Badge variant="outline" className="text-primary">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Accepted
                        </Badge>
                      ) : new Date(invite.expires_at) < new Date() ? (
                        <Badge variant="outline" className="text-muted-foreground">
                          Expired
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-accent-foreground">
                          Pending
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {format(new Date(invite.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {!invite.accepted_at && new Date(invite.expires_at) > new Date() && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => copyInviteLink(invite.token)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        )}
                        {!invite.accepted_at && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteInvite.mutate(invite.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
