import { useState, useEffect } from 'react';
import { Clock, Loader2, Save } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CompanyHour {
  id: string;
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_closed: boolean;
}

interface CompanyHoursEditorProps {
  companyId: string;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hour = Math.floor(i / 2);
  const minute = i % 2 === 0 ? '00' : '30';
  const h24 = `${hour.toString().padStart(2, '0')}:${minute}`;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return { value: h24, label: `${h12}:${minute} ${ampm}` };
});

export function CompanyHoursEditor({ companyId }: CompanyHoursEditorProps) {
  const [hours, setHours] = useState<CompanyHour[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    fetchHours();
  }, [companyId]);

  const fetchHours = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('company_hours')
      .select('*')
      .eq('company_id', companyId)
      .order('day_of_week');

    if (error) {
      toast.error('Failed to load business hours');
      setIsLoading(false);
      return;
    }

    // If no hours exist, create defaults
    if (!data || data.length === 0) {
      const defaults = DAYS.map((_, i) => ({
        id: `temp-${i}`,
        day_of_week: i,
        open_time: '09:00',
        close_time: '17:00',
        is_closed: i === 0 || i === 6, // Closed on weekends
      }));
      setHours(defaults);
    } else {
      setHours(data);
    }
    setIsLoading(false);
    setHasChanges(false);
  };

  const updateHour = (dayIndex: number, field: keyof CompanyHour, value: string | boolean) => {
    setHours(prev => prev.map(h => 
      h.day_of_week === dayIndex ? { ...h, [field]: value } : h
    ));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    
    // Delete existing hours and insert new ones
    const { error: deleteError } = await supabase
      .from('company_hours')
      .delete()
      .eq('company_id', companyId);

    if (deleteError) {
      toast.error('Failed to save business hours');
      setIsSaving(false);
      return;
    }

    const { error: insertError } = await supabase
      .from('company_hours')
      .insert(hours.map(h => ({
        company_id: companyId,
        day_of_week: h.day_of_week,
        open_time: h.open_time,
        close_time: h.close_time,
        is_closed: h.is_closed,
      })));

    if (insertError) {
      toast.error('Failed to save business hours');
    } else {
      toast.success('Business hours saved');
      setHasChanges(false);
      fetchHours(); // Refresh to get real IDs
    }
    setIsSaving(false);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          <CardTitle>Business Hours</CardTitle>
        </div>
        <CardDescription>Set when your business is open for calls</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {DAYS.map((day, index) => {
          const hourData = hours.find(h => h.day_of_week === index);
          if (!hourData) return null;
          
          return (
            <div key={day} className="flex items-center gap-4 py-2 border-b border-border/50 last:border-0">
              <div className="w-24 font-medium text-sm">{day}</div>
              <Switch
                checked={!hourData.is_closed}
                onCheckedChange={(checked) => updateHour(index, 'is_closed', !checked)}
              />
              {!hourData.is_closed ? (
                <div className="flex items-center gap-2 flex-1">
                  <Select
                    value={hourData.open_time}
                    onValueChange={(v) => updateHour(index, 'open_time', v)}
                  >
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIME_OPTIONS.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-muted-foreground">to</span>
                  <Select
                    value={hourData.close_time}
                    onValueChange={(v) => updateHour(index, 'close_time', v)}
                  >
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIME_OPTIONS.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Closed</span>
              )}
            </div>
          );
        })}
        
        {hasChanges && (
          <Button onClick={handleSave} disabled={isSaving} className="w-full mt-4">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save Hours
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
