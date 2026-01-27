import { useState, useEffect } from 'react';
import { useCompany } from '@/contexts/CompanyContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Pencil, Trash2, Users, Clock, Calendar, Settings2 } from 'lucide-react';
import { StaffHoursEditor } from '@/components/staff/StaffHoursEditor';
import { StaffTimeOffManager } from '@/components/staff/StaffTimeOffManager';

interface Staff {
  id: string;
  company_id: string;
  name: string;
  role: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface Service {
  id: string;
  name: string;
}

interface StaffFormData {
  name: string;
  role: string;
  is_active: boolean;
}

const defaultFormData: StaffFormData = {
  name: '',
  role: '',
  is_active: true,
};

export default function StaffPage() {
  const { currentCompany } = useCompany();
  const { toast } = useToast();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [serviceStaffMap, setServiceStaffMap] = useState<Record<string, string[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [deletingStaff, setDeletingStaff] = useState<Staff | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
  const [formData, setFormData] = useState<StaffFormData>(defaultFormData);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [detailTab, setDetailTab] = useState<'hours' | 'timeoff' | 'services'>('hours');

  useEffect(() => {
    if (currentCompany?.id) {
      fetchData();
    }
  }, [currentCompany?.id]);

  const fetchData = async () => {
    if (!currentCompany?.id) return;
    
    setIsLoading(true);
    try {
      // Fetch staff
      const { data: staffData, error: staffError } = await supabase
        .from('staff')
        .select('*')
        .eq('company_id', currentCompany.id)
        .order('name');

      if (staffError) throw staffError;

      // Fetch services
      const { data: servicesData, error: servicesError } = await supabase
        .from('services')
        .select('id, name')
        .eq('company_id', currentCompany.id)
        .eq('is_active', true)
        .order('name');

      if (servicesError) throw servicesError;

      // Fetch service-staff mappings
      const { data: mappingData, error: mappingError } = await supabase
        .from('service_staff')
        .select('service_id, staff_id');

      if (mappingError) throw mappingError;

      // Build mapping: staff_id -> service_ids[]
      const map: Record<string, string[]> = {};
      (mappingData || []).forEach((m) => {
        if (!map[m.staff_id]) map[m.staff_id] = [];
        map[m.staff_id].push(m.service_id);
      });

      setStaff((staffData || []) as Staff[]);
      setServices((servicesData || []) as Service[]);
      setServiceStaffMap(map);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load staff data.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const openCreateDialog = () => {
    setEditingStaff(null);
    setFormData(defaultFormData);
    setDialogOpen(true);
  };

  const openEditDialog = (member: Staff) => {
    setEditingStaff(member);
    setFormData({
      name: member.name,
      role: member.role || '',
      is_active: member.is_active,
    });
    setDialogOpen(true);
  };

  const openDeleteDialog = (member: Staff) => {
    setDeletingStaff(member);
    setDeleteDialogOpen(true);
  };

  const openDetailSheet = (member: Staff) => {
    setSelectedStaff(member);
    setSelectedServices(serviceStaffMap[member.id] || []);
    setDetailTab('hours');
    setDetailSheetOpen(true);
  };

  const handleSave = async () => {
    if (!currentCompany?.id) return;
    if (!formData.name.trim()) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Staff name is required.',
      });
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        company_id: currentCompany.id,
        name: formData.name.trim(),
        role: formData.role.trim() || null,
        is_active: formData.is_active,
      };

      if (editingStaff) {
        const { error } = await supabase
          .from('staff')
          .update(payload)
          .eq('id', editingStaff.id);

        if (error) throw error;

        toast({ title: 'Updated', description: 'Staff member updated successfully.' });
      } else {
        const { error } = await supabase
          .from('staff')
          .insert(payload);

        if (error) throw error;

        toast({ title: 'Created', description: 'Staff member created successfully.' });
      }

      setDialogOpen(false);
      await fetchData();
    } catch (error) {
      console.error('Error saving staff:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to save staff member.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingStaff) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('staff')
        .delete()
        .eq('id', deletingStaff.id);

      if (error) throw error;

      toast({ title: 'Deleted', description: 'Staff member deleted successfully.' });
      setDeleteDialogOpen(false);
      setDeletingStaff(null);
      await fetchData();
    } catch (error) {
      console.error('Error deleting staff:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to delete staff member.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleActive = async (member: Staff) => {
    try {
      const { error } = await supabase
        .from('staff')
        .update({ is_active: !member.is_active })
        .eq('id', member.id);

      if (error) throw error;

      toast({
        title: member.is_active ? 'Deactivated' : 'Activated',
        description: `Staff member ${member.is_active ? 'deactivated' : 'activated'} successfully.`,
      });
      await fetchData();
    } catch (error) {
      console.error('Error toggling staff:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to update staff member.',
      });
    }
  };

  const saveServiceAssignments = async () => {
    if (!selectedStaff) return;

    setIsSaving(true);
    try {
      // Delete all existing mappings for this staff
      const { error: deleteError } = await supabase
        .from('service_staff')
        .delete()
        .eq('staff_id', selectedStaff.id);

      if (deleteError) throw deleteError;

      // Insert new mappings
      if (selectedServices.length > 0) {
        const mappings = selectedServices.map((serviceId) => ({
          service_id: serviceId,
          staff_id: selectedStaff.id,
        }));

        const { error: insertError } = await supabase
          .from('service_staff')
          .insert(mappings);

        if (insertError) throw insertError;
      }

      toast({ title: 'Saved', description: 'Service assignments updated.' });
      await fetchData();
    } catch (error) {
      console.error('Error saving service assignments:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to save service assignments.',
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
      {/* Dev Debug Readout */}
      {process.env.NODE_ENV === 'development' && (
        <div className="text-xs font-mono bg-muted/50 px-3 py-1 rounded border border-dashed border-muted-foreground/30 text-muted-foreground">
          Current company: <span className="text-foreground font-semibold">{currentCompany.id}</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Staff</h1>
          <p className="text-muted-foreground mt-1">
            Manage team members, their working hours, and service assignments.
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Add Staff
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Staff Members</CardTitle>
          <CardDescription>
            {staff.length} staff member{staff.length !== 1 ? 's' : ''} configured
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : staff.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <Users className="h-10 w-10 mb-2 opacity-50" />
              <p>No staff yet. Add your first team member to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Services</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staff.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">{member.name}</TableCell>
                    <TableCell>{member.role || '—'}</TableCell>
                    <TableCell>
                      {(serviceStaffMap[member.id] || []).length} service
                      {(serviceStaffMap[member.id] || []).length !== 1 ? 's' : ''}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={member.is_active}
                        onCheckedChange={() => toggleActive(member)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openDetailSheet(member)}
                          title="Hours & Services"
                        >
                          <Settings2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(member)}
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openDeleteDialog(member)}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingStaff ? 'Edit Staff Member' : 'Add Staff Member'}
            </DialogTitle>
            <DialogDescription>
              {editingStaff
                ? 'Update the staff member details below.'
                : 'Enter the details for your new team member.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., John Smith"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Input
                id="role"
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                placeholder="e.g., Senior Stylist, Technician"
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
              <Label htmlFor="is_active">Active</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingStaff ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Staff Member?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingStaff?.name}"? This will also remove their
              working hours and service assignments. Existing appointments will remain.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isSaving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Staff Detail Sheet */}
      <Sheet open={detailSheetOpen} onOpenChange={setDetailSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selectedStaff?.name}</SheetTitle>
            <SheetDescription>
              Manage working hours, time off, and assigned services.
            </SheetDescription>
          </SheetHeader>

          {selectedStaff && (
            <div className="mt-6 space-y-6">
              {/* Tab-like buttons */}
              <div className="flex gap-2 border-b pb-2">
                <Button
                  variant={detailTab === 'hours' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setDetailTab('hours')}
                >
                  <Clock className="h-4 w-4 mr-1" />
                  Hours
                </Button>
                <Button
                  variant={detailTab === 'timeoff' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setDetailTab('timeoff')}
                >
                  <Calendar className="h-4 w-4 mr-1" />
                  Time Off
                </Button>
                <Button
                  variant={detailTab === 'services' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setDetailTab('services')}
                >
                  <Settings2 className="h-4 w-4 mr-1" />
                  Services
                </Button>
              </div>

              {detailTab === 'hours' && (
                <StaffHoursEditor staffId={selectedStaff.id} />
              )}

              {detailTab === 'timeoff' && (
                <StaffTimeOffManager staffId={selectedStaff.id} />
              )}

              {detailTab === 'services' && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Select which services this staff member can perform.
                  </p>
                  
                  {services.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No services configured. Create services first.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {services.map((service) => (
                        <div key={service.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`service-${service.id}`}
                            checked={selectedServices.includes(service.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedServices([...selectedServices, service.id]);
                              } else {
                                setSelectedServices(selectedServices.filter((id) => id !== service.id));
                              }
                            }}
                          />
                          <Label htmlFor={`service-${service.id}`}>{service.name}</Label>
                        </div>
                      ))}
                    </div>
                  )}

                  <Button onClick={saveServiceAssignments} disabled={isSaving}>
                    {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Save Assignments
                  </Button>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
