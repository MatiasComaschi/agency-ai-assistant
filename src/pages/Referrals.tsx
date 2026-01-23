import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { Gift, Copy, Users, DollarSign, CheckCircle, Clock, Share2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCompany } from '@/contexts/CompanyContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface Referral {
  id: string;
  code: string;
  status: 'pending' | 'converted' | 'expired';
  reward_cents: number;
  created_at: string;
  converted_at: string | null;
  referred_company_id: string | null;
}

export default function Referrals() {
  const { currentCompany } = useCompany();
  const [isLoading, setIsLoading] = useState(true);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [myCode, setMyCode] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalReferrals: 0,
    converted: 0,
    totalEarned: 0,
  });

  useEffect(() => {
    if (currentCompany) {
      fetchReferrals();
    }
  }, [currentCompany]);

  const fetchReferrals = async () => {
    if (!currentCompany) return;
    setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from('referrals')
        .select('*')
        .eq('company_id', currentCompany.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const typedData = (data || []) as Referral[];
      setReferrals(typedData);

      // Find or create main referral code
      const mainCode = typedData.find(r => !r.referred_company_id);
      if (mainCode) {
        setMyCode(mainCode.code);
      } else {
        // Generate new code
        await generateReferralCode();
      }

      // Calculate stats
      const converted = typedData.filter(r => r.status === 'converted').length;
      const totalEarned = typedData.reduce((sum, r) => sum + (r.reward_cents || 0), 0);
      
      setStats({
        totalReferrals: typedData.filter(r => r.referred_company_id).length,
        converted,
        totalEarned,
      });
    } catch (error) {
      console.error('Error fetching referrals:', error);
      toast.error('Failed to load referrals');
    } finally {
      setIsLoading(false);
    }
  };

  const generateReferralCode = async () => {
    if (!currentCompany) return;

    try {
      // Generate a unique code
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let code = '';
      for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }

      const { data, error } = await supabase
        .from('referrals')
        .insert({
          company_id: currentCompany.id,
          code,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;

      setMyCode(data.code);
      toast.success('Referral code generated!');
    } catch (error) {
      console.error('Error generating referral code:', error);
      toast.error('Failed to generate referral code');
    }
  };

  const copyCode = () => {
    if (myCode) {
      navigator.clipboard.writeText(myCode);
      toast.success('Referral code copied to clipboard!');
    }
  };

  const copyReferralLink = () => {
    if (myCode) {
      const link = `${window.location.origin}/signup?ref=${myCode}`;
      navigator.clipboard.writeText(link);
      toast.success('Referral link copied to clipboard!');
    }
  };

  const shareReferral = async () => {
    if (!myCode) return;

    const shareData = {
      title: 'Join our AI Receptionist Platform',
      text: `Use my referral code ${myCode} to get started with AI-powered call handling!`,
      url: `${window.location.origin}/signup?ref=${myCode}`,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (error) {
        // User cancelled share
      }
    } else {
      copyReferralLink();
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'converted':
        return <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />Converted</Badge>;
      case 'expired':
        return <Badge variant="secondary">Expired</Badge>;
      default:
        return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    }
  };

  if (!currentCompany) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Select a company to view referrals</p>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold">Referral Program</h1>
        <p className="text-muted-foreground">Earn rewards by referring new customers</p>
      </div>

      {/* Referral Code Card */}
      <Card className="bg-gradient-to-r from-primary/10 to-accent/10 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" />
            Your Referral Code
          </CardTitle>
          <CardDescription>
            Share this code with potential customers. Earn $50 for each successful referral!
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="text-3xl font-mono font-bold tracking-wider bg-background px-6 py-3 rounded-lg border-2 border-dashed border-primary/30">
                {myCode || '--------'}
              </div>
              <Button variant="outline" size="icon" onClick={copyCode} disabled={!myCode}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={copyReferralLink} disabled={!myCode}>
                Copy Link
              </Button>
              <Button onClick={shareReferral} disabled={!myCode} className="bg-accent hover:bg-accent/90">
                <Share2 className="h-4 w-4 mr-2" />
                Share
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Total Referrals
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalReferrals}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Converted
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{stats.converted}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Total Earned
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">
              ${(stats.totalEarned / 100).toFixed(2)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Referral History */}
      <Card>
        <CardHeader>
          <CardTitle>Referral History</CardTitle>
          <CardDescription>Track your referrals and earnings</CardDescription>
        </CardHeader>
        <CardContent>
          {referrals.filter(r => r.referred_company_id).length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Gift className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No referrals yet. Share your code to start earning!</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reward</TableHead>
                  <TableHead>Converted Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {referrals
                  .filter(r => r.referred_company_id)
                  .map((referral) => (
                    <TableRow key={referral.id}>
                      <TableCell>{format(new Date(referral.created_at), 'MMM d, yyyy')}</TableCell>
                      <TableCell>{getStatusBadge(referral.status)}</TableCell>
                      <TableCell>
                        {referral.reward_cents > 0 
                          ? `$${(referral.reward_cents / 100).toFixed(2)}`
                          : '-'
                        }
                      </TableCell>
                      <TableCell>
                        {referral.converted_at 
                          ? format(new Date(referral.converted_at), 'MMM d, yyyy')
                          : '-'
                        }
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* How it Works */}
      <Card>
        <CardHeader>
          <CardTitle>How it Works</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-xl font-bold text-primary">1</span>
              </div>
              <h3 className="font-semibold mb-1">Share Your Code</h3>
              <p className="text-sm text-muted-foreground">
                Send your unique referral code to friends and colleagues
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-xl font-bold text-primary">2</span>
              </div>
              <h3 className="font-semibold mb-1">They Sign Up</h3>
              <p className="text-sm text-muted-foreground">
                When they create an account using your code
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-xl font-bold text-primary">3</span>
              </div>
              <h3 className="font-semibold mb-1">Earn Rewards</h3>
              <p className="text-sm text-muted-foreground">
                Get $50 credit when they become a paying customer
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
