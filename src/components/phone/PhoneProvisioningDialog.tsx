import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Phone, Search, Loader2, Check, AlertCircle } from 'lucide-react';

interface AvailableNumber {
  phoneNumber: string;
  friendlyName: string;
  locality: string;
  region: string;
  capabilities: {
    voice: boolean;
    sms: boolean;
    mms: boolean;
  };
}

interface PhoneProvisioningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  companyName: string;
  onSuccess: () => void;
}

export function PhoneProvisioningDialog({
  open,
  onOpenChange,
  companyId,
  companyName,
  onSuccess,
}: PhoneProvisioningDialogProps) {
  const [areaCode, setAreaCode] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [availableNumbers, setAvailableNumbers] = useState<AvailableNumber[]>([]);
  const [selectedNumber, setSelectedNumber] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const searchNumbers = async () => {
    setIsSearching(true);
    setError(null);
    setAvailableNumbers([]);
    setSelectedNumber(null);

    try {
      const { data, error } = await supabase.functions.invoke('twilio-phone-numbers', {
        body: {
          action: 'search',
          area_code: areaCode || undefined,
          country: 'US',
        },
      });

      if (error) throw error;

      if (data.numbers && data.numbers.length > 0) {
        setAvailableNumbers(data.numbers);
      } else {
        setError('No numbers found for this area code. Try a different one.');
      }
    } catch (err) {
      console.error('Search error:', err);
      setError(err instanceof Error ? err.message : 'Failed to search for numbers');
    } finally {
      setIsSearching(false);
    }
  };

  const provisionNumber = async () => {
    if (!selectedNumber) return;

    setIsProvisioning(true);
    setError(null);

    try {
      const { data, error } = await supabase.functions.invoke('twilio-phone-numbers', {
        body: {
          action: 'provision',
          company_id: companyId,
          phone_number: selectedNumber,
        },
      });

      if (error) throw error;

      toast.success(`Phone number ${data.phoneNumber} provisioned successfully!`);
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      console.error('Provision error:', err);
      setError(err instanceof Error ? err.message : 'Failed to provision number');
      toast.error('Failed to provision phone number');
    } finally {
      setIsProvisioning(false);
    }
  };

  const formatPhoneNumber = (number: string) => {
    // Format +1XXXXXXXXXX to (XXX) XXX-XXXX
    const cleaned = number.replace(/\D/g, '');
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      const area = cleaned.slice(1, 4);
      const first = cleaned.slice(4, 7);
      const last = cleaned.slice(7);
      return `(${area}) ${first}-${last}`;
    }
    return number;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Provision Phone Number
          </DialogTitle>
          <DialogDescription>
            Search for and provision a phone number for <strong>{companyName}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search Section */}
          <div className="space-y-2">
            <Label htmlFor="area-code">Area Code (optional)</Label>
            <div className="flex gap-2">
              <Input
                id="area-code"
                placeholder="e.g., 415, 212, 310"
                value={areaCode}
                onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, '').slice(0, 3))}
                className="w-32"
              />
              <Button onClick={searchNumbers} disabled={isSearching} className="flex-1">
                {isSearching ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Search className="h-4 w-4 mr-2" />
                )}
                Search Available Numbers
              </Button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md text-sm text-destructive">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Available Numbers */}
          {availableNumbers.length > 0 && (
            <div className="space-y-2">
              <Label>Select a Number</Label>
              <div className="max-h-64 overflow-y-auto space-y-2 border rounded-md p-2">
                {availableNumbers.map((num) => (
                  <button
                    key={num.phoneNumber}
                    onClick={() => setSelectedNumber(num.phoneNumber)}
                    className={`w-full p-3 rounded-md border text-left transition-colors ${
                      selectedNumber === num.phoneNumber
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50 hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{formatPhoneNumber(num.phoneNumber)}</div>
                        {(num.locality || num.region) && (
                          <div className="text-sm text-muted-foreground">
                            {[num.locality, num.region].filter(Boolean).join(', ')}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                          {num.capabilities.voice && (
                            <Badge variant="secondary" className="text-xs">Voice</Badge>
                          )}
                          {num.capabilities.sms && (
                            <Badge variant="secondary" className="text-xs">SMS</Badge>
                          )}
                        </div>
                        {selectedNumber === num.phoneNumber && (
                          <Check className="h-5 w-5 text-primary" />
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Provision Button */}
          {selectedNumber && (
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={provisionNumber} disabled={isProvisioning}>
                {isProvisioning ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Phone className="h-4 w-4 mr-2" />
                )}
                Provision {formatPhoneNumber(selectedNumber)}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
