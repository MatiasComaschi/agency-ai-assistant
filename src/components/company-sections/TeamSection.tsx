import { useState, useEffect } from 'react';
import { Plus, Users, Mail, Trash2, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import type { AppRole } from '@/types';

interface MemberWithProfile {
  id: string;
  user_id: string;
  company_id: string;
  role: AppRole;
  created_at: string;
  email?: string;
  full_name?: string;
}

const roleLabels: Record<AppRole, string> = {
  agency_admin: 'Agency Admin',
  company_owner: 'Owner',
  company_staff: 'Staff',
};

interface TeamSectionProps {
  companyId: string;
}

export default function TeamSection({ companyId }: TeamSectionProps) {
  const { user } = useAuth();
  const [members, setMembers] = useState<MemberWithProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'company_owner' | 'company_staff'>('company_staff');
  const [isInviting, setIsInviting] = useState(false);
  
  // Remove confirmation
  const [removingMember, setRemovingMember] = useState<MemberWithProfile | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  useEffect(() => {
    fetchMembers();
  }, [companyId]);

  const fetchMembers = async () => {
    setIsLoading(true);
    
    // First get memberships
    const { data: memberships, error: memberError } = await supabase
      .from('memberships')
      .select('*')
      .eq('company_id', companyId);
    
    if (memberError) {
      toast.error('Failed to load team members');
      setIsLoading(false);
      return;
    }

    // Then get profiles for each user
    const memberList: MemberWithProfile[] = [];
    for (const membership of memberships || []) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', membership.user_id)
        .single();
      
      memberList.push({
        id: membership.id,
        user_id: membership.user_id,
        company_id: membership.company_id,
        role: membership.role as AppRole,
        created_at: membership.created_at,
        email: profile?.email,
        full_name: profile?.full_name || undefined,
      });
    }

    setMembers(memberList);
    setIsLoading(false);
  };

  const handleInvite = async () => {
    if (!email) {
      toast.error('Please enter an email');
      return;
    }
    
    setIsInviting(true);
    
    // Check if user exists by email
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single();
    
    if (!existingProfile) {
      toast.error('User not found. They need to sign up first.');
      setIsInviting(false);
      return;
    }
    
    // Check if already a member
    const { data: existingMember } = await supabase
      .from('memberships')
      .select('id')
      .eq('company_id', companyId)
      .eq('user_id', existingProfile.id)
      .single();
    
    if (existingMember) {
      toast.error('User is already a team member');
      setIsInviting(false);
      return;
    }
    
    // Create membership
    const { error } = await supabase.from('memberships').insert({
      company_id: companyId,
      user_id: existingProfile.id,
      role: role,
    });
    
    setIsInviting(false);
    if (error) {
      toast.error('Failed to add member');
    } else {
      toast.success(`Added ${email} as ${roleLabels[role]}`);
      setIsOpen(false);
      setEmail('');
      setRole('company_staff');
      fetchMembers();
    }
  };

  const updateRole = async (member: MemberWithProfile, newRole: AppRole) => {
    const { error } = await supabase
      .from('memberships')
      .update({ role: newRole })
      .eq('id', member.id);
    
    if (error) {
      toast.error('Failed to update role');
    } else {
      toast.success(`Updated role to ${roleLabels[newRole]}`);
      fetchMembers();
    }
  };

  const confirmRemove = (member: MemberWithProfile) => {
    if (member.user_id === user?.id) {
      toast.error("You can't remove yourself");
      return;
    }
    setRemovingMember(member);
  };

  const handleRemove = async () => {
    if (!removingMember) return;
    
    setIsRemoving(true);
    const { error } = await supabase
      .from('memberships')
      .delete()
      .eq('id', removingMember.id);
    
    setIsRemoving(false);
    if (error) {
      toast.error('Failed to remove member');
    } else {
      toast.success('Member removed');
      setRemovingMember(null);
      fetchMembers();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-display font-bold">Team</h2>
          <p className="text-muted-foreground">Manage team members and access</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <Button onClick={() => setIsOpen(true)} className="bg-accent hover:bg-accent/90">
            <Plus className="h-4 w-4 mr-2" /> Add Member
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Team Member</DialogTitle>
              <DialogDescription>Add an existing user to this company</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Email Address</Label>
                <Input 
                  type="email" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  placeholder="colleague@example.com" 
                />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as 'company_owner' | 'company_staff')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="company_owner">Owner</SelectItem>
                    <SelectItem value="company_staff">Staff</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleInvite} disabled={isInviting} className="w-full bg-accent hover:bg-accent/90">
                {isInviting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
                Add Member
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" /> Team Members
          </CardTitle>
          <CardDescription>{members.length} member{members.length !== 1 ? 's' : ''}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading...
            </div>
          ) : members.length === 0 ? (
            <div className="p-8 text-center">
              <Users className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
              <p className="text-muted-foreground">No team members yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-4 bg-muted/50 rounded-lg group"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-accent/20 flex items-center justify-center">
                      <span className="text-sm font-medium text-accent">
                        {(member.full_name || member.email || 'U')[0].toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium">{member.full_name || member.email || 'Unknown User'}</p>
                      {member.email && <p className="text-sm text-muted-foreground">{member.email}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Select 
                      value={member.role === 'agency_admin' ? 'company_owner' : member.role} 
                      onValueChange={(v) => updateRole(member, v as AppRole)}
                      disabled={member.role === 'agency_admin'}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="company_owner">Owner</SelectItem>
                        <SelectItem value="company_staff">Staff</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => confirmRemove(member)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      disabled={member.user_id === user?.id}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Remove Confirmation Dialog */}
      <Dialog open={!!removingMember} onOpenChange={() => setRemovingMember(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Team Member</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove <strong>{removingMember?.full_name || removingMember?.email}</strong> from this company?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemovingMember(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRemove} disabled={isRemoving}>
              {isRemoving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
