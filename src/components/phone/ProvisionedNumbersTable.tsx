import { useState, useEffect } from 'react';
import { Phone, Loader2, Trash2, ExternalLink, Building2, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface ProvisionedNumber {
  companyId: string;
  companyName: string;
  twilioNumber: string;
  status: string;
  createdAt: string;
}

export function ProvisionedNumbersTable() {
  const [numbers, setNumbers] = useState<ProvisionedNumber[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [releasingNumber, setReleasingNumber] = useState<string | null>(null);
  const [confirmRelease, setConfirmRelease] = useState<ProvisionedNumber | null>(null);

  useEffect(() => {
    fetchProvisionedNumbers();
  }, []);

  const fetchProvisionedNumbers = async () => {
    setIsLoading(true);
    try {
      // Fetch all companies with provisioned Twilio numbers
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, twilio_number, status, created_at')
        .not('twilio_number', 'is', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const provisionedNumbers: ProvisionedNumber[] = (data || []).map((company) => ({
        companyId: company.id,
        companyName: company.name,
        twilioNumber: company.twilio_number!,
        status: company.status,
        createdAt: company.created_at,
      }));

      setNumbers(provisionedNumbers);
    } catch (error) {
      console.error('Error fetching provisioned numbers:', error);
      toast.error('Failed to load provisioned numbers');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReleaseNumber = async (number: ProvisionedNumber) => {
    setReleasingNumber(number.companyId);
    try {
      const { error } = await supabase.functions.invoke('twilio-phone-numbers', {
        body: {
          action: 'release',
          company_id: number.companyId,
        },
      });

      if (error) throw error;

      toast.success(`Released ${number.twilioNumber} from ${number.companyName}`);
      fetchProvisionedNumbers();
    } catch (err) {
      console.error('Release error:', err);
      toast.error('Failed to release phone number');
    } finally {
      setReleasingNumber(null);
      setConfirmRelease(null);
    }
  };

  const totalNumbers = numbers.length;
  const activeNumbers = numbers.filter((n) => n.status === 'active').length;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>Provisioned Phone Numbers</CardTitle>
                <CardDescription>
                  All Twilio numbers assigned to companies across the platform
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="secondary">
                {totalNumbers} Total
              </Badge>
              <Badge variant="outline" className="bg-success-muted text-success-muted-foreground">
                {activeNumbers} Active
              </Badge>
              <Button variant="outline" size="icon" onClick={fetchProvisionedNumbers} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : numbers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Phone className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No phone numbers have been provisioned yet</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phone Number</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Provisioned</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {numbers.map((number) => (
                  <TableRow key={number.companyId}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-accent" />
                        <span className="font-mono font-medium">{number.twilioNumber}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span>{number.companyName}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={number.status === 'active' ? 'default' : 'secondary'}
                      >
                        {number.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDistanceToNow(new Date(number.createdAt), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setConfirmRelease(number)}
                        disabled={releasingNumber === number.companyId}
                      >
                        {releasingNumber === number.companyId ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Confirm Release Dialog */}
      <AlertDialog open={!!confirmRelease} onOpenChange={() => setConfirmRelease(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Release Phone Number?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to release{' '}
              <span className="font-mono font-semibold">{confirmRelease?.twilioNumber}</span> from{' '}
              <span className="font-semibold">{confirmRelease?.companyName}</span>?
              <br />
              <br />
              This action cannot be undone. The number will be returned to Twilio and may be
              reassigned to another customer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmRelease && handleReleaseNumber(confirmRelease)}
            >
              Release Number
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
