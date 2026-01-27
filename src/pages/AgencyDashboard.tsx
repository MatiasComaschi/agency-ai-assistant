import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Eye,
  Pencil,
  Pause,
  Trash2,
  Building2,
  Play,
  Loader2,
  Settings,
  Phone,
  Bot,
  BotOff,
} from 'lucide-react';
import { DebugIdsDialog } from '@/components/debug/DebugIdsDialog';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Company } from '@/types';

const industries = [
  'All Industries',
  'Healthcare',
  'Legal',
  'Real Estate',
  'Automotive',
  'Home Services',
  'Hospitality',
  'Retail',
  'Professional Services',
];

const timezones = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
];

const statusColors = {
  active: 'bg-accent text-accent-foreground',
  paused: 'bg-warning text-warning-foreground',
  inactive: 'bg-muted text-muted-foreground',
};

export default function AgencyDashboard() {
  const navigate = useNavigate();
  const { isAgencyAdmin } = useAuth();
  const { companies, isLoading, refetchCompanies, setCurrentCompanyId } = useCompany();
  const [searchQuery, setSearchQuery] = useState('');
  const [industryFilter, setIndustryFilter] = useState('All Industries');
  const [statusFilter, setStatusFilter] = useState('all');
  
  // Edit modal state
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [editForm, setEditForm] = useState({ name: '', industry: '', timezone: '' });
  const [isSaving, setIsSaving] = useState(false);
  
  // Delete confirmation state
  const [deletingCompany, setDeletingCompany] = useState<Company | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Filter companies
  const filteredCompanies = companies.filter((company) => {
    const matchesSearch = company.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesIndustry =
      industryFilter === 'All Industries' || company.industry === industryFilter;
    const matchesStatus =
      statusFilter === 'all' || company.status === statusFilter;
    return matchesSearch && matchesIndustry && matchesStatus;
  });

  const handleStatusChange = async (company: Company, newStatus: 'active' | 'paused') => {
    const { error } = await supabase
      .from('companies')
      .update({ status: newStatus })
      .eq('id', company.id);

    if (error) {
      toast.error('Failed to update company status');
    } else {
      toast.success(`Company ${newStatus === 'paused' ? 'paused' : 'activated'}`);
      refetchCompanies();
    }
  };

  const handleAiToggle = async (company: Company) => {
    const newState = !company.ai_enabled;
    const { error } = await supabase
      .from('companies')
      .update({ ai_enabled: newState })
      .eq('id', company.id);

    if (error) {
      toast.error('Failed to toggle AI');
    } else {
      toast.success(newState ? 'AI enabled' : 'AI disabled (calls will forward)');
      refetchCompanies();
    }
  };

  const openEditModal = (company: Company) => {
    setEditingCompany(company);
    setEditForm({
      name: company.name,
      industry: company.industry || '',
      timezone: company.timezone,
    });
  };

  const handleEditSave = async () => {
    if (!editingCompany || !editForm.name) {
      toast.error('Company name is required');
      return;
    }
    
    setIsSaving(true);
    const { error } = await supabase
      .from('companies')
      .update({
        name: editForm.name,
        industry: editForm.industry || null,
        timezone: editForm.timezone,
      })
      .eq('id', editingCompany.id);

    setIsSaving(false);
    if (error) {
      toast.error('Failed to update company');
    } else {
      toast.success('Company updated successfully');
      setEditingCompany(null);
      refetchCompanies();
    }
  };

  const openDeleteConfirm = (company: Company) => {
    setDeletingCompany(company);
    setDeleteConfirmText('');
  };

  const handleDelete = async () => {
    if (!deletingCompany || deleteConfirmText !== deletingCompany.name) {
      toast.error('Please type the company name to confirm');
      return;
    }

    setIsDeleting(true);
    const { error } = await supabase.from('companies').delete().eq('id', deletingCompany.id);

    setIsDeleting(false);
    if (error) {
      toast.error('Failed to delete company');
    } else {
      toast.success('Company deleted');
      setDeletingCompany(null);
      refetchCompanies();
    }
  };

  const handleView = (company: Company) => {
    setCurrentCompanyId(company.id);
    navigate('/company');
  };

  if (!isAgencyAdmin) {
    navigate('/company');
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">
            Agency Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage all your client companies in one place
          </p>
        </div>
        <div className="flex gap-2">
          <DebugIdsDialog />
          <Button
            onClick={() => navigate('/agency/create-company')}
            className="bg-accent hover:bg-accent/90 gap-2"
          >
            <Plus className="h-4 w-4" />
            Create Company
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="stat-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Companies
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-display font-bold">{companies.length}</p>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-display font-bold text-accent">
              {companies.filter((c) => c.status === 'active').length}
            </p>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Paused
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-display font-bold text-warning">
              {companies.filter((c) => c.status === 'paused').length}
            </p>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              This Month's Calls
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-display font-bold">0</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search companies..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={industryFilter} onValueChange={setIndustryFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Industry" />
              </SelectTrigger>
              <SelectContent>
                {industries.map((industry) => (
                  <SelectItem key={industry} value={industry}>
                    {industry}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Companies Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading companies...
            </div>
          ) : filteredCompanies.length === 0 ? (
            <div className="p-12 text-center">
              <Building2 className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {companies.length === 0 ? 'No companies yet' : 'No matching companies'}
              </h3>
              <p className="text-muted-foreground mb-6">
                {companies.length === 0
                  ? 'Create your first company to get started'
                  : 'Try adjusting your search or filters'}
              </p>
              {companies.length === 0 && (
                <Button
                  onClick={() => navigate('/agency/create-company')}
                  className="bg-accent hover:bg-accent/90"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Company
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Timezone</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCompanies.map((company) => (
                  <TableRow key={company.id} className="group">
                    <TableCell>
                      <div className="font-medium">{company.name}</div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {company.industry || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={statusColors[company.status]}
                      >
                        {company.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {company.timezone}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(company.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-popover">
                          <DropdownMenuItem onClick={() => navigate(`/agency/company-settings?id=${company.id}`)}>
                            <Settings className="h-4 w-4 mr-2" />
                            Open Settings
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleView(company)}>
                            <Eye className="h-4 w-4 mr-2" />
                            View Overview
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            setCurrentCompanyId(company.id);
                            navigate('/company?tab=calls');
                          }}>
                            <Phone className="h-4 w-4 mr-2" />
                            View Calls
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleAiToggle(company)}>
                            {company.ai_enabled ? (
                              <>
                                <BotOff className="h-4 w-4 mr-2" />
                                Disable AI (Panic)
                              </>
                            ) : (
                              <>
                                <Bot className="h-4 w-4 mr-2" />
                                Enable AI
                              </>
                            )}
                          </DropdownMenuItem>
                          {company.status === 'active' ? (
                            <DropdownMenuItem
                              onClick={() => handleStatusChange(company, 'paused')}
                            >
                              <Pause className="h-4 w-4 mr-2" />
                              Pause
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => handleStatusChange(company, 'active')}
                            >
                              <Play className="h-4 w-4 mr-2" />
                              Activate
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => openDeleteConfirm(company)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Company Sheet */}
      <Sheet open={!!editingCompany} onOpenChange={() => setEditingCompany(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Edit Company</SheetTitle>
            <SheetDescription>Update company details</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div className="space-y-2">
              <Label>Company Name</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Industry</Label>
              <Select value={editForm.industry} onValueChange={(v) => setEditForm({ ...editForm, industry: v })}>
                <SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger>
                <SelectContent>
                  {industries.filter(i => i !== 'All Industries').map((ind) => (
                    <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Select value={editForm.timezone} onValueChange={(v) => setEditForm({ ...editForm, timezone: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {timezones.map((tz) => (
                    <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleEditSave} disabled={isSaving} className="w-full bg-accent hover:bg-accent/90">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingCompany} onOpenChange={() => setDeletingCompany(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete Company</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete the company and all associated data.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm">
              To confirm, type <strong className="text-foreground">{deletingCompany?.name}</strong> below:
            </p>
            <Input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Type company name to confirm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingCompany(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting || deleteConfirmText !== deletingCompany?.name}
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Delete Company
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
