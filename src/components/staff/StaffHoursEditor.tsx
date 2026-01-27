import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save } from 'lucide-react';

interface StaffHour {
  id: string;
  staff_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

interface DaySchedule {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_working: boolean;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const defaultSchedule: DaySchedule[] = DAYS.map((_, i) => ({
  day_of_week: i,
  start_time: '09:00',
  end_time: '17:00',
  is_working: i >= 1 && i <= 5, // Mon-Fri default
}));

interface StaffHoursEditorProps {
  staffId: string;
}

export function StaffHoursEditor({ staffId }: StaffHoursEditorProps) {
  const { toast } = useToast();
  const [schedule, setSchedule] = useState<DaySchedule[]>(defaultSchedule);
  const [existingHours, setExistingHours] = useState<StaffHour[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchHours();
  }, [staffId]);

  const fetchHours = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('staff_hours')
        .select('*')
        .eq('staff_id', staffId);

      if (error) throw error;

      const hours = (data || []) as StaffHour[];
      setExistingHours(hours);

      // Merge with defaults
      const merged = defaultSchedule.map((day) => {
        const existing = hours.find((h) => h.day_of_week === day.day_of_week);
        if (existing) {
          return {
            day_of_week: day.day_of_week,
            start_time: existing.start_time,
            end_time: existing.end_time,
            is_working: true,
          };
        }
        return { ...day, is_working: false };
      });

      setSchedule(merged);
    } catch (error) {
      console.error('Error fetching staff hours:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load working hours.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Delete all existing hours for this staff
      const { error: deleteError } = await supabase
        .from('staff_hours')
        .delete()
        .eq('staff_id', staffId);

      if (deleteError) throw deleteError;

      // Insert new hours for working days
      const workingDays = schedule.filter((d) => d.is_working);
      if (workingDays.length > 0) {
        const rows = workingDays.map((d) => ({
          staff_id: staffId,
          day_of_week: d.day_of_week,
          start_time: d.start_time,
          end_time: d.end_time,
        }));

        const { error: insertError } = await supabase
          .from('staff_hours')
          .insert(rows);

        if (insertError) throw insertError;
      }

      toast({ title: 'Saved', description: 'Working hours updated.' });
      await fetchHours();
    } catch (error) {
      console.error('Error saving staff hours:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to save working hours.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const updateDay = (dayIndex: number, updates: Partial<DaySchedule>) => {
    setSchedule((prev) =>
      prev.map((d) => (d.day_of_week === dayIndex ? { ...d, ...updates } : d))
    );
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
      <p className="text-sm text-muted-foreground">
        Set the weekly working hours for this staff member.
      </p>

      <div className="space-y-3">
        {schedule.map((day) => (
          <div
            key={day.day_of_week}
            className="flex items-center gap-3 p-2 rounded border bg-muted/30"
          >
            <div className="w-24 flex items-center gap-2">
              <Switch
                checked={day.is_working}
                onCheckedChange={(checked) =>
                  updateDay(day.day_of_week, { is_working: checked })
                }
              />
              <Label className="text-sm font-medium">{DAYS[day.day_of_week].slice(0, 3)}</Label>
            </div>

            {day.is_working ? (
              <div className="flex items-center gap-2 flex-1">
                <Input
                  type="time"
                  value={day.start_time}
                  onChange={(e) => updateDay(day.day_of_week, { start_time: e.target.value })}
                  className="w-28"
                />
                <span className="text-muted-foreground">to</span>
                <Input
                  type="time"
                  value={day.end_time}
                  onChange={(e) => updateDay(day.day_of_week, { end_time: e.target.value })}
                  className="w-28"
                />
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">Off</span>
            )}
          </div>
        ))}
      </div>

      <Button onClick={handleSave} disabled={isSaving}>
        {isSaving ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Save className="h-4 w-4 mr-2" />
        )}
        Save Hours
      </Button>
    </div>
  );
}
