import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, Search, UserPlus, Trash2, Loader2, AlertTriangle, Crown } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

interface AdminUser {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  created_at: string;
}

export default function AdminSettings() {
  const navigate = useNavigate();
  const { isAgencyAdmin, user } = useAuth();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchEmail, setSearchEmail] = useState('');
  const [isGranting, setIsGranting] = useState(false);
  const [isGrantDialogOpen, setIsGrantDialogOpen] = useState(false);
  const [revoking, setRevoking] = useState<AdminUser | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  useEffect(() => {
    if (!isAgencyAdmin) {
      navigate('/');
      return;
    }
    fetchAdmins();
  }, [isAgencyAdmin, navigate]);

  const fetchAdmins = async () => {
    setIsLoading(true);

    // Get all agency_admin roles from user_roles
    const { data: roles, error: rolesError } = await supabase
      .from('user_roles')
      .select('id, user_id, created_at')
      .eq('role', 'agency_admin');

    if (rolesError) {
      toast.error('Failed to load admin users');
      setIsLoading(false);
      return;
    }

    // Fetch profile info for each admin
    const adminList: AdminUser[] = [];
    for (const role of roles || []) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', role.user_id)
        .single();

      if (profile) {
        adminList.push({
          id: role.id,
          user_id: role.user_id,
          email: profile.email,
          full_name: profile.full_name,
          created_at: role.created_at,
        });
      }
    }

    setAdmins(adminList);
    setIsLoading(false);
  };

  const handleGrant = async () => {
    if (!searchEmail.trim()) {
      toast.error('Please enter an email address');
      return;
    }

    setIsGranting(true);

    // Find user by email
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .eq('email', searchEmail.trim().toLowerCase())
      .single();

    if (profileError || !profile) {
      toast.error('User not found. They must sign up first.');
      setIsGranting(false);
      return;
    }

    // Check if already an admin
    const existingAdmin = admins.find((a) => a.user_id === profile.id);
    if (existingAdmin) {
      toast.error('User is already an agency admin');
      setIsGranting(false);
      return;
    }

    // Grant agency_admin role in user_roles
    const { error: insertError } = await supabase.from('user_roles').insert({
      user_id: profile.id,
      role: 'agency_admin',
    });

    setIsGranting(false);

    if (insertError) {
      toast.error('Failed to grant admin role');
      console.error(insertError);
    } else {
      toast.success(`Granted agency admin to ${profile.email}`);
      setSearchEmail('');
      setIsGrantDialogOpen(false);
      fetchAdmins();
    }
  };

  const handleRevoke = async () => {
    if (!revoking) return;

    // Prevent revoking own admin role
    if (revoking.user_id === user?.id) {
      toast.error("You cannot revoke your own admin role");
      setRevoking(null);
      return;
    }

    // Prevent revoking last admin
    if (admins.length <= 1) {
      toast.error("Cannot revoke the last agency admin");
      setRevoking(null);
      return;
    }

    setIsRevoking(true);

    const { error } = await supabase.from('user_roles').delete().eq('id', revoking.id);

    setIsRevoking(false);

    if (error) {
      toast.error('Failed to revoke admin role');
    } else {
      toast.success(`Revoked admin role from ${revoking.email}`);
      setRevoking(null);
      fetchAdmins();
    }
  };

  if (!isAgencyAdmin) {
    return null;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-display font-bold flex items-center gap-2">
            <Shield className="h-8 w-8 text-accent" />
            Admin Settings
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage global agency admin access
          </p>
        </div>
        <Dialog open={isGrantDialogOpen} onOpenChange={setIsGrantDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-accent hover:bg-accent/90">
              <UserPlus className="h-4 w-4 mr-2" />
              Grant Admin
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Grant Agency Admin Role</DialogTitle>
              <DialogDescription>
                Grant global agency admin privileges to an existing user. They will have full access to all companies.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="email">User Email</Label>
                <div className="flex gap-2">
                  <Input
                    id="email"
                    type="email"
                    placeholder="user@example.com"
                    value={searchEmail}
                    onChange={(e) => setSearchEmail(e.target.value)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  The user must already have an account in the system.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsGrantDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleGrant} disabled={isGranting} className="bg-accent hover:bg-accent/90">
                {isGranting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Shield className="h-4 w-4 mr-2" />}
                Grant Admin
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Warning Card */}
      <Card className="border-warning/50 bg-warning/5">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-foreground">Security Notice</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Agency admins have global access to all companies, data, and settings. Only grant this role to trusted team members. 
                This role is stored separately from company memberships and cannot be accidentally removed by deleting companies.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Admin List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5" />
            Agency Administrators
          </CardTitle>
          <CardDescription>
            {admins.length} user{admins.length !== 1 ? 's' : ''} with global admin access
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading administrators...
            </div>
          ) : admins.length === 0 ? (
            <div className="text-center py-8">
              <Shield className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
              <p className="text-muted-foreground">No agency admins configured</p>
              <p className="text-sm text-muted-foreground mt-1">Add an admin to get started</p>
            </div>
          ) : (
            <div className="space-y-3">
              {admins.map((admin) => (
                <div
                  key={admin.id}
                  className="flex items-center justify-between p-4 bg-muted/50 rounded-lg group"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-accent/20 flex items-center justify-center">
                      <span className="text-sm font-medium text-accent">
                        {(admin.full_name || admin.email)[0].toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{admin.full_name || admin.email}</p>
                        {admin.user_id === user?.id && (
                          <Badge variant="secondary" className="text-xs">You</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{admin.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className="bg-accent text-accent-foreground">Agency Admin</Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setRevoking(admin)}
                      disabled={admin.user_id === user?.id || admins.length <= 1}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      title={
                        admin.user_id === user?.id
                          ? "You can't revoke your own role"
                          : admins.length <= 1
                          ? "Can't remove the last admin"
                          : 'Revoke admin role'
                      }
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

      {/* Revoke Confirmation */}
      <AlertDialog open={!!revoking} onOpenChange={() => setRevoking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Revoke Admin Access</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke agency admin access from{' '}
              <strong>{revoking?.full_name || revoking?.email}</strong>? They will lose access to all companies and admin features.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevoke}
              disabled={isRevoking}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isRevoking ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Revoke Access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
