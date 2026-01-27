import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Search, Clock } from 'lucide-react';
import { format, addDays, parseISO } from 'date-fns';

interface Service {
  id: string;
  name: string;
  duration_minutes: number;
}

interface Staff {
  id: string;
  name: string;
}

interface AvailabilitySlot {
  start_datetime: string;
  end_datetime: string;
  staff_id?: string;
  staff_name?: string;
}

interface AvailabilityTesterProps {
  companyId: string;
  services: Service[];
  staff: Staff[];
}

export function AvailabilityTester({ companyId, services, staff }: AvailabilityTesterProps) {
  const { toast } = useToast();
  const [serviceId, setServiceId] = useState('');
  const [staffId, setStaffId] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(
    addDays(new Date(), 7).toISOString().split('T')[0]
  );
  const [isLoading, setIsLoading] = useState(false);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const searchAvailability = async () => {
    if (!serviceId) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Please select a service.',
      });
      return;
    }

    setIsLoading(true);
    setHasSearched(true);
    try {
      const { data, error } = await supabase.functions.invoke('compute-availability', {
        body: {
          company_id: companyId,
          service_id: serviceId,
          staff_id: staffId || undefined,
          start_range: `${startDate}T00:00:00`,
          end_range: `${endDate}T23:59:59`,
        },
      });

      if (error) throw error;

      // Map staff names to slots
      const slotsWithNames = (data.slots || []).map((slot: AvailabilitySlot) => {
        const staffMember = staff.find((s) => s.id === slot.staff_id);
        return {
          ...slot,
          staff_name: staffMember?.name || 'Any',
        };
      });

      setSlots(slotsWithNames);

      if (slotsWithNames.length === 0) {
        toast({
          title: 'No Availability',
          description: 'No available slots found for the selected criteria.',
        });
      }
    } catch (error) {
      console.error('Error fetching availability:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to compute availability. The edge function may not be deployed yet.',
      });
      setSlots([]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5" />
          Availability Tester
        </CardTitle>
        <CardDescription>
          Test the compute-availability edge function to find open slots.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label>Service *</Label>
            <Select value={serviceId} onValueChange={setServiceId}>
              <SelectTrigger>
                <SelectValue placeholder="Select service" />
              </SelectTrigger>
              <SelectContent>
                {services.map((service) => (
                  <SelectItem key={service.id} value={service.id}>
                    {service.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Staff (optional)</Label>
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger>
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Any</SelectItem>
                {staff.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>From</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>To</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        <Button onClick={searchAvailability} disabled={isLoading}>
          {isLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Search className="h-4 w-4 mr-2" />
          )}
          Find Availability
        </Button>

        {hasSearched && (
          <div className="mt-4">
            {slots.length === 0 ? (
              <p className="text-sm text-muted-foreground">No available slots found.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-medium">{slots.length} slot(s) found:</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                  {slots.slice(0, 20).map((slot, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 p-2 rounded border bg-muted/30 text-sm"
                    >
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">
                          {format(parseISO(slot.start_datetime), 'MMM d, h:mm a')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {slot.staff_name}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                {slots.length > 20 && (
                  <p className="text-xs text-muted-foreground">
                    Showing first 20 of {slots.length} slots.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
