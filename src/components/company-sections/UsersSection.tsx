import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import { UserPlus, Mail, Copy, Trash2, Users } from 'lucide-react';

interface Member {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  profile?: { email: string; full_name: string | null };
}

interface Invite {
  id: string;
  email: string;
  role: string;
  token: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

export function UsersSection() {
  const { currentCompany } = useCompany();
  const { isAgencyAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('company_staff');

  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ['company-members', currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany) return [];
      const { data, error } = await supabase
        .from('memberships')
        .select('*')
        .eq('company_id', currentCompany.id);
      if (error) throw error;

      const userIds = data.map(m => m.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', userIds);

      return data.map(member => ({
        ...member,
        profile: profiles?.find(p => p.id === member.user_id),
      })) as Member[];
    },
    enabled: !!currentCompany,
  });

  const { data: invites = [], isLoading: invitesLoading } = useQuery({
    queryKey: ['company-invites', currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany) return [];
      const { data, error } = await supabase
        .from('company_invites')
        .select('*')
        .eq('company_id', currentCompany.id)
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Invite[];
    },
    enabled: !!currentCompany,
  });

  const createInvite = useMutation({
    mutationFn: async () => {
      if (!currentCompany) throw new Error('No company selected');
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Create invite record
      const { data: invite, error } = await supabase.from('company_invites').insert({
        company_id: currentCompany.id,
        email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
        invited_by: user.id,
      }).select('id').single();
      
      if (error) throw error;

      // Send invite email via edge function
      try {
        const { data, error: emailError } = await supabase.functions.invoke('send-invite', {
          body: { invite_id: invite.id }
        });
        if (emailError) {
          console.warn('Failed to send invite email:', emailError);
          return { emailSent: false, reason: 'error' };
        }
        if (data?.skipped || data?.success === false) {
          return { emailSent: false, reason: data?.error || 'Email not configured' };
        }
        return { emailSent: true };
      } catch (emailErr) {
        console.warn('Email send failed, but invite was created:', emailErr);
        return { emailSent: false, reason: 'error' };
      }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['company-invites'] });
      if (result?.emailSent) {
        toast.success('Invite created and email sent');
      } else {
        toast.success('Invite created - copy the link to share it manually', {
          description: 'Email sending requires a verified domain on Resend'
        });
      }
      setInviteOpen(false);
      setInviteEmail('');
      setInviteRole('company_staff');
    },
    onError: (err) => {
      console.error('Create invite error:', err);
      toast.error('Failed to create invite');
    },
  });

  const deleteInvite = useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase
        .from('company_invites')
        .delete()
        .eq('id', inviteId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-invites'] });
      toast.success('Invite deleted');
    },
    onError: () => toast.error('Failed to delete invite'),
  });

  const removeMember = useMutation({
    mutationFn: async (membershipId: string) => {
      const { error } = await supabase
        .from('memberships')
        .delete()
        .eq('id', membershipId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-members'] });
      toast.success('Member removed');
    },
    onError: () => toast.error('Failed to remove member'),
  });

  const copyInviteLink = (token: string) => {
    const link = `${window.location.origin}/auth?invite=${token}`;
    navigator.clipboard.writeText(link);
    toast.success('Invite link copied to clipboard');
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'company_owner':
        return <Badge>Owner</Badge>;
      case 'company_staff':
        return <Badge variant="secondary">Staff</Badge>;
      default:
        return <Badge variant="outline">{role}</Badge>;
    }
  };

  if (!currentCompany) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Select a company to manage users
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Members */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-5 w-5" />
              Team Members
            </CardTitle>
            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Invite User
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Invite User to {currentCompany.name}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="user@example.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">Role</Label>
                    <Select value={inviteRole} onValueChange={setInviteRole}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="company_staff">Staff</SelectItem>
                        <SelectItem value="company_owner">Owner</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={() => createInvite.mutate()}
                    disabled={!inviteEmail.trim() || createInvite.isPending}
                    className="w-full"
                  >
                    {createInvite.isPending ? 'Creating...' : 'Create Invite'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {membersLoading ? (
            <div className="text-center py-4 text-muted-foreground">Loading...</div>
          ) : members.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">No members yet</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  {isAgencyAdmin && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">
                          {member.profile?.full_name || 'Unnamed User'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {member.profile?.email}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>{getRoleBadge(member.role)}</TableCell>
                    <TableCell>
                      {format(new Date(member.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    {isAgencyAdmin && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeMember.mutate(member.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pending Invites */}
      {invites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Pending Invites
            </CardTitle>
          </CardHeader>
          <CardContent>
            {invitesLoading ? (
              <div className="text-center py-4 text-muted-foreground">Loading...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invites.map((invite) => (
                    <TableRow key={invite.id}>
                      <TableCell>{invite.email}</TableCell>
                      <TableCell>{getRoleBadge(invite.role)}</TableCell>
                      <TableCell>
                        {format(new Date(invite.expires_at), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => copyInviteLink(invite.token)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteInvite.mutate(invite.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
