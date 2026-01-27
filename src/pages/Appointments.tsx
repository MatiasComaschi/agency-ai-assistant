import { useState, useEffect } from 'react';
import { useCompany } from '@/contexts/CompanyContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, CalendarCheck, XCircle, Search } from 'lucide-react';
import { format, parseISO, addMinutes } from 'date-fns';
import { AvailabilityTester } from '@/components/appointments/AvailabilityTester';
import { CompanySelector } from '@/components/company/CompanySelector';

interface Appointment {
  id: string;
  company_id: string;
  staff_id: string | null;
  service_id: string;
  start_datetime: string;
  end_datetime: string;
  customer_name: string;
  customer_phone: string;
  source: 'phone' | 'web';
  external_event_id: string | null;
  status: 'confirmed' | 'canceled';
  notes: string | null;
  created_at: string;
  service?: { name: string; duration_minutes: number };
  staff?: { name: string };
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

interface AppointmentFormData {
  service_id: string;
  staff_id: string;
  date: string;
  time: string;
  customer_name: string;
  customer_phone: string;
}

const defaultFormData: AppointmentFormData = {
  service_id: '',
  staff_id: '',
  date: '',
  time: '',
  customer_name: '',
  customer_phone: '',
};

export default function Appointments() {
  const { currentCompany } = useCompany();
  const { toast } = useToast();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelingAppointment, setCancelingAppointment] = useState<Appointment | null>(null);
  const [formData, setFormData] = useState<AppointmentFormData>(defaultFormData);
  const [showAvailabilityTester, setShowAvailabilityTester] = useState(false);

  useEffect(() => {
    if (currentCompany?.id) {
      fetchData();
    }
  }, [currentCompany?.id]);

  const fetchData = async () => {
    if (!currentCompany?.id) return;

    setIsLoading(true);
    try {
      // Fetch appointments with service and staff info
      const { data: appointmentsData, error: appointmentsError } = await supabase
        .from('appointments')
        .select(`
          *,
          service:services(name, duration_minutes),
          staff:staff(name)
        `)
        .eq('company_id', currentCompany.id)
        .order('start_datetime', { ascending: false });

      if (appointmentsError) throw appointmentsError;

      // Fetch services
      const { data: servicesData, error: servicesError } = await supabase
        .from('services')
        .select('id, name, duration_minutes')
        .eq('company_id', currentCompany.id)
        .eq('is_active', true)
        .order('name');

      if (servicesError) throw servicesError;

      // Fetch staff
      const { data: staffData, error: staffError } = await supabase
        .from('staff')
        .select('id, name')
        .eq('company_id', currentCompany.id)
        .eq('is_active', true)
        .order('name');

      if (staffError) throw staffError;

      setAppointments((appointmentsData || []) as Appointment[]);
      setServices((servicesData || []) as Service[]);
      setStaff((staffData || []) as Staff[]);
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
    const today = new Date().toISOString().split('T')[0];
    setFormData({
      ...defaultFormData,
      date: today,
      time: '09:00',
    });
    setDialogOpen(true);
  };

  const openCancelDialog = (appointment: Appointment) => {
    setCancelingAppointment(appointment);
    setCancelDialogOpen(true);
  };

  const handleCreate = async () => {
    if (!currentCompany?.id) return;

    if (!formData.service_id || !formData.date || !formData.time || !formData.customer_name || !formData.customer_phone) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Please fill in all required fields.',
      });
      return;
    }

    setIsSaving(true);
    try {
      const selectedService = services.find((s) => s.id === formData.service_id);
      const duration = selectedService?.duration_minutes || 30;

      const startDatetime = `${formData.date}T${formData.time}:00`;
      const endDatetime = format(
        addMinutes(parseISO(startDatetime), duration),
        "yyyy-MM-dd'T'HH:mm:ss"
      );

      const { error } = await supabase.from('appointments').insert({
        company_id: currentCompany.id,
        service_id: formData.service_id,
        staff_id: formData.staff_id || null,
        start_datetime: startDatetime,
        end_datetime: endDatetime,
        customer_name: formData.customer_name.trim(),
        customer_phone: formData.customer_phone.trim(),
        source: 'web',
        status: 'confirmed',
      });

      if (error) throw error;

      toast({ title: 'Created', description: 'Appointment created successfully.' });
      setDialogOpen(false);
      await fetchData();
    } catch (error) {
      console.error('Error creating appointment:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to create appointment.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = async () => {
    if (!cancelingAppointment) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ status: 'canceled' })
        .eq('id', cancelingAppointment.id);

      if (error) throw error;

      toast({ title: 'Canceled', description: 'Appointment canceled successfully.' });
      setCancelDialogOpen(false);
      setCancelingAppointment(null);
      await fetchData();
    } catch (error) {
      console.error('Error canceling appointment:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to cancel appointment.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!currentCompany) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Please select a company first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Company Selector */}
      <CompanySelector />

      {/* Dev Debug Readout */}
      {process.env.NODE_ENV === 'development' && (
        <div className="text-xs font-mono bg-muted/50 px-3 py-1 rounded border border-dashed border-muted-foreground/30 text-muted-foreground">
          Current company: <span className="text-foreground font-semibold">{currentCompany.id}</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Appointments</h1>
          <p className="text-muted-foreground mt-1">
            View and manage all scheduled appointments.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowAvailabilityTester(!showAvailabilityTester)}>
            <Search className="h-4 w-4 mr-2" />
            {showAvailabilityTester ? 'Hide' : 'Find'} Availability
          </Button>
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />
            New Appointment
          </Button>
        </div>
      </div>

      {showAvailabilityTester && (
        <AvailabilityTester
          companyId={currentCompany.id}
          services={services}
          staff={staff}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Appointments</CardTitle>
          <CardDescription>
            {appointments.filter((a) => a.status === 'confirmed').length} confirmed appointment
            {appointments.filter((a) => a.status === 'confirmed').length !== 1 ? 's' : ''}
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
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Staff</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {appointments.map((appointment) => (
                  <TableRow key={appointment.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">
                          {format(parseISO(appointment.start_datetime), 'MMM d, yyyy')}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {format(parseISO(appointment.start_datetime), 'h:mm a')} –{' '}
                          {format(parseISO(appointment.end_datetime), 'h:mm a')}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>{appointment.service?.name || '—'}</TableCell>
                    <TableCell>{appointment.staff?.name || 'Any'}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{appointment.customer_name}</p>
                        <p className="text-sm text-muted-foreground">{appointment.customer_phone}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={appointment.status === 'confirmed' ? 'default' : 'secondary'}
                      >
                        {appointment.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {appointment.status === 'confirmed' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openCancelDialog(appointment)}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Cancel
                        </Button>
                      )}
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
            <DialogDescription>
              Schedule a new appointment for a customer.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Service *</Label>
              <Select
                value={formData.service_id}
                onValueChange={(value) => setFormData({ ...formData, service_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a service" />
                </SelectTrigger>
                <SelectContent>
                  {services.map((service) => (
                    <SelectItem key={service.id} value={service.id}>
                      {service.name} ({service.duration_minutes} min)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Staff (optional)</Label>
              <Select
                value={formData.staff_id}
                onValueChange={(value) => setFormData({ ...formData, staff_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any available" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any available</SelectItem>
                  {staff.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Time *</Label>
                <Input
                  type="time"
                  value={formData.time}
                  onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Customer Name *</Label>
              <Input
                value={formData.customer_name}
                onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                placeholder="John Smith"
              />
            </div>

            <div className="space-y-2">
              <Label>Customer Phone *</Label>
              <Input
                value={formData.customer_phone}
                onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                placeholder="+1 555 123 4567"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Appointment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Confirmation */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Appointment?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel the appointment for{' '}
              {cancelingAppointment?.customer_name} on{' '}
              {cancelingAppointment && format(parseISO(cancelingAppointment.start_datetime), 'MMM d, yyyy')}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Keep Appointment</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={isSaving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Cancel Appointment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
