import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, Calendar } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface TimeOff {
  id: string;
  staff_id: string;
  start_datetime: string;
  end_datetime: string;
  reason: string | null;
  created_at: string;
}

interface TimeOffFormData {
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  reason: string;
}

const defaultFormData: TimeOffFormData = {
  start_date: '',
  start_time: '09:00',
  end_date: '',
  end_time: '17:00',
  reason: '',
};

interface StaffTimeOffManagerProps {
  staffId: string;
}

export function StaffTimeOffManager({ staffId }: StaffTimeOffManagerProps) {
  const { toast } = useToast();
  const [timeOffs, setTimeOffs] = useState<TimeOff[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState<TimeOffFormData>(defaultFormData);

  useEffect(() => {
    fetchTimeOffs();
  }, [staffId]);

  const fetchTimeOffs = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('staff_time_off')
        .select('*')
        .eq('staff_id', staffId)
        .order('start_datetime', { ascending: true });

      if (error) throw error;
      setTimeOffs((data || []) as TimeOff[]);
    } catch (error) {
      console.error('Error fetching time off:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load time off.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const openDialog = () => {
    const today = new Date().toISOString().split('T')[0];
    setFormData({
      ...defaultFormData,
      start_date: today,
      end_date: today,
    });
    setDialogOpen(true);
  };

  const handleCreate = async () => {
    if (!formData.start_date || !formData.end_date) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Start and end dates are required.',
      });
      return;
    }

    setIsSaving(true);
    try {
      const startDatetime = `${formData.start_date}T${formData.start_time}:00`;
      const endDatetime = `${formData.end_date}T${formData.end_time}:00`;

      const { error } = await supabase
        .from('staff_time_off')
        .insert({
          staff_id: staffId,
          start_datetime: startDatetime,
          end_datetime: endDatetime,
          reason: formData.reason.trim() || null,
        });

      if (error) throw error;

      toast({ title: 'Created', description: 'Time off added.' });
      setDialogOpen(false);
      await fetchTimeOffs();
    } catch (error) {
      console.error('Error creating time off:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to add time off.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('staff_time_off')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({ title: 'Deleted', description: 'Time off removed.' });
      await fetchTimeOffs();
    } catch (error) {
      console.error('Error deleting time off:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to delete time off.',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Schedule time off periods (vacation, sick days, etc.)
        </p>
        <Button size="sm" onClick={openDialog}>
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>

      {timeOffs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Calendar className="h-8 w-8 mb-2 opacity-50" />
          <p className="text-sm">No time off scheduled.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {timeOffs.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between p-3 rounded border bg-muted/30"
            >
              <div>
                <p className="text-sm font-medium">
                  {format(parseISO(item.start_datetime), 'MMM d, yyyy h:mm a')} –{' '}
                  {format(parseISO(item.end_datetime), 'MMM d, yyyy h:mm a')}
                </p>
                {item.reason && (
                  <p className="text-xs text-muted-foreground">{item.reason}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDelete(item.id)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Time Off</DialogTitle>
            <DialogDescription>
              Schedule a time off period for this staff member.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Start Time</Label>
                <Input
                  type="time"
                  value={formData.start_time}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>End Time</Label>
                <Input
                  type="time"
                  value={formData.end_time}
                  onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Textarea
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                placeholder="e.g., Vacation, Sick leave..."
                className="min-h-[60px]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Time Off
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
