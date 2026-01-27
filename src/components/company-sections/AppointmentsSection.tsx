import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, CalendarCheck, Trash2 } from 'lucide-react';
import { format } from 'date-fns';

interface Appointment {
  id: string;
  company_id: string;
  customer_name: string;
  customer_phone: string;
  service_id: string;
  staff_id: string | null;
  start_datetime: string;
  end_datetime: string;
  status: string;
  notes: string | null;
  source: string;
  created_at: string;
}

interface Service {
  id: string;
  name: string;
  duration_minutes: number;
}

interface Staff {
  id: string;
  name: string;
}

interface AppointmentsSectionProps {
  companyId: string;
}

export default function AppointmentsSection({ companyId }: AppointmentsSectionProps) {
  const { toast } = useToast();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [formData, setFormData] = useState({
    customer_name: '',
    customer_phone: '',
    service_id: '',
    staff_id: '',
    start_datetime: '',
    notes: '',
  });

  useEffect(() => {
    fetchData();
  }, [companyId]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [apptRes, servRes, staffRes] = await Promise.all([
        supabase
          .from('appointments')
          .select('*')
          .eq('company_id', companyId)
          .order('start_datetime', { ascending: false }),
        supabase
          .from('services')
          .select('id, name, duration_minutes')
          .eq('company_id', companyId)
          .eq('is_active', true),
        supabase
          .from('staff')
          .select('id, name')
          .eq('company_id', companyId)
          .eq('is_active', true),
      ]);

      if (apptRes.error) throw apptRes.error;
      if (servRes.error) throw servRes.error;
      if (staffRes.error) throw staffRes.error;

      setAppointments((apptRes.data || []) as Appointment[]);
      setServices((servRes.data || []) as Service[]);
      setStaff((staffRes.data || []) as Staff[]);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load appointments.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const openCreateDialog = () => {
    setFormData({
      customer_name: '',
      customer_phone: '',
      service_id: '',
      staff_id: '',
      start_datetime: '',
      notes: '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.customer_name || !formData.customer_phone || !formData.service_id || !formData.start_datetime) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Please fill in all required fields.',
      });
      return;
    }

    setIsSaving(true);
    try {
      const service = services.find((s) => s.id === formData.service_id);
      const startDate = new Date(formData.start_datetime);
      const endDate = new Date(startDate.getTime() + (service?.duration_minutes || 30) * 60000);

      const { error } = await supabase.from('appointments').insert({
        company_id: companyId,
        customer_name: formData.customer_name,
        customer_phone: formData.customer_phone,
        service_id: formData.service_id,
        staff_id: formData.staff_id || null,
        start_datetime: startDate.toISOString(),
        end_datetime: endDate.toISOString(),
        notes: formData.notes || null,
        source: 'manual',
        status: 'confirmed',
      });

      if (error) throw error;

      toast({ title: 'Created', description: 'Appointment created successfully.' });
      setDialogOpen(false);
      await fetchData();
    } catch (error) {
      console.error('Error saving appointment:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to create appointment.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('appointments').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Deleted', description: 'Appointment deleted.' });
      await fetchData();
    } catch (error) {
      console.error('Error deleting appointment:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to delete appointment.',
      });
    }
  };

  const getServiceName = (id: string) => services.find((s) => s.id === id)?.name || '—';
  const getStaffName = (id: string | null) => (id ? staff.find((s) => s.id === id)?.name : null) || '—';

  const statusColors: Record<string, string> = {
    confirmed: 'bg-accent text-accent-foreground',
    pending: 'bg-warning text-warning-foreground',
    cancelled: 'bg-destructive text-destructive-foreground',
    completed: 'bg-muted text-muted-foreground',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold">Appointments</h2>
          <p className="text-muted-foreground">Manage upcoming and past bookings</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          New Appointment
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Appointments</CardTitle>
          <CardDescription>
            {appointments.length} appointment{appointments.length !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : appointments.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <CalendarCheck className="h-10 w-10 mb-2 opacity-50" />
              <p>No appointments yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Staff</TableHead>
                  <TableHead>Date/Time</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {appointments.map((appt) => (
                  <TableRow key={appt.id}>
                    <TableCell>
                      <div className="font-medium">{appt.customer_name}</div>
                      <div className="text-xs text-muted-foreground">{appt.customer_phone}</div>
                    </TableCell>
                    <TableCell>{getServiceName(appt.service_id)}</TableCell>
                    <TableCell>{getStaffName(appt.staff_id)}</TableCell>
                    <TableCell>{format(new Date(appt.start_datetime), 'MMM d, yyyy h:mm a')}</TableCell>
                    <TableCell>
                      <Badge className={statusColors[appt.status] || 'bg-muted'}>{appt.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(appt.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Appointment</DialogTitle>
            <DialogDescription>Create a new appointment for a customer.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Customer Name *</Label>
                <Input
                  value={formData.customer_name}
                  onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Phone *</Label>
                <Input
                  value={formData.customer_phone}
                  onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Service *</Label>
                <Select value={formData.service_id} onValueChange={(v) => setFormData({ ...formData, service_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select service" /></SelectTrigger>
                  <SelectContent>
                    {services.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Staff</Label>
                <Select value={formData.staff_id} onValueChange={(v) => setFormData({ ...formData, staff_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Any available" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Any available</SelectItem>
                    {staff.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Date & Time *</Label>
              <Input
                type="datetime-local"
                value={formData.start_datetime}
                onChange={(e) => setFormData({ ...formData, start_datetime: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Optional notes..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
