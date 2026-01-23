import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  Upload, 
  FileSpreadsheet, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Download,
  Loader2,
  Mail
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useEffect } from 'react';

interface ImportRow {
  company_name: string;
  industry?: string;
  timezone?: string;
  primary_phone?: string;
  owner_email?: string;
  owner_name?: string;
  status: 'pending' | 'success' | 'error';
  error?: string;
}

export default function BulkImport() {
  const { isAgencyAdmin, user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sendInvites, setSendInvites] = useState(true);
  const [importComplete, setImportComplete] = useState(false);

  useEffect(() => {
    if (!isAgencyAdmin) {
      navigate('/company');
    }
  }, [isAgencyAdmin, navigate]);

  const downloadTemplate = () => {
    const csvContent = `company_name,industry,timezone,primary_phone,owner_email,owner_name
"Acme Dental",Healthcare,America/New_York,+15551234567,owner@acmedental.com,Dr. Smith
"Smith Law Firm",Legal Services,America/Chicago,+15559876543,john@smithlaw.com,John Smith
"Quick Plumbing",Home Services,America/Los_Angeles,+15555555555,mike@quickplumb.com,Mike Johnson`;

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'company_import_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const parseCSV = (text: string): ImportRow[] => {
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, '').toLowerCase().replace(/ /g, '_'));
    
    return lines.slice(1).map(line => {
      const values: string[] = [];
      let current = '';
      let inQuotes = false;
      
      for (const char of line) {
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());

      const row: Record<string, string> = {};
      headers.forEach((header, i) => {
        row[header] = values[i]?.replace(/"/g, '') || '';
      });

      return {
        company_name: row.company_name || '',
        industry: row.industry,
        timezone: row.timezone || 'America/New_York',
        primary_phone: row.primary_phone,
        owner_email: row.owner_email,
        owner_name: row.owner_name,
        status: 'pending' as const,
      };
    }).filter(row => row.company_name);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.csv')) {
      toast.error('Please upload a CSV file');
      return;
    }

    setFile(selectedFile);
    setImportComplete(false);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parsed = parseCSV(text);
      setRows(parsed);
    };
    reader.readAsText(selectedFile);
  };

  const runImport = async () => {
    if (rows.length === 0) return;

    setIsImporting(true);
    setProgress(0);

    const updatedRows = [...rows];

    for (let i = 0; i < rows.length; i++) {
      const row = updatedRows[i];
      
      try {
        // Create company
        const { data: company, error: companyError } = await supabase
          .from('companies')
          .insert({
            name: row.company_name,
            industry: row.industry || null,
            timezone: row.timezone || 'America/New_York',
            primary_phone: row.primary_phone || null,
            status: 'active',
          })
          .select()
          .single();

        if (companyError) throw companyError;

        // Create membership for the current user (agency admin)
        await supabase.from('memberships').insert({
          company_id: company.id,
          user_id: user?.id,
          role: 'agency_admin',
        });

        // Create default AI profile
        await supabase.from('ai_profiles').insert({
          company_id: company.id,
        });

        // Create default subscription
        await supabase.from('subscriptions').insert({
          company_id: company.id,
          plan: 'starter',
          status: 'inactive',
        });

        // Send invite email if owner email provided
        if (sendInvites && row.owner_email) {
          await supabase.functions.invoke('bulk-import-invite', {
            body: {
              email: row.owner_email,
              name: row.owner_name || '',
              company_id: company.id,
              company_name: row.company_name,
            },
          });
        }

        updatedRows[i] = { ...row, status: 'success' };
      } catch (error: unknown) {
        console.error('Import error:', error);
        updatedRows[i] = { 
          ...row, 
          status: 'error', 
          error: error instanceof Error ? error.message : 'Failed to create' 
        };
      }

      setRows([...updatedRows]);
      setProgress(((i + 1) / rows.length) * 100);
    }

    setIsImporting(false);
    setImportComplete(true);

    const successCount = updatedRows.filter(r => r.status === 'success').length;
    const errorCount = updatedRows.filter(r => r.status === 'error').length;

    if (errorCount === 0) {
      toast.success(`Successfully imported ${successCount} companies`);
    } else {
      toast.warning(`Imported ${successCount} companies, ${errorCount} failed`);
    }
  };

  const successCount = rows.filter(r => r.status === 'success').length;
  const errorCount = rows.filter(r => r.status === 'error').length;
  const pendingCount = rows.filter(r => r.status === 'pending').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl font-display font-bold text-foreground">
          Bulk Import Companies
        </h1>
        <p className="text-muted-foreground mt-1">
          Upload a CSV file to create multiple companies at once
        </p>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Upload Section */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Upload CSV</CardTitle>
            <CardDescription>
              Download the template and fill in company details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outline" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-2" />
              Download Template
            </Button>

            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
              />
              {file ? (
                <div className="flex items-center justify-center gap-2">
                  <FileSpreadsheet className="h-8 w-8 text-primary" />
                  <div className="text-left">
                    <p className="font-medium">{file.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {rows.length} companies found
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">
                    Click to upload or drag and drop
                  </p>
                  <p className="text-sm text-muted-foreground">CSV files only</p>
                </>
              )}
            </div>

            {rows.length > 0 && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch
                    id="sendInvites"
                    checked={sendInvites}
                    onCheckedChange={setSendInvites}
                  />
                  <Label htmlFor="sendInvites" className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Send invite emails to owners
                  </Label>
                </div>
                <Button 
                  onClick={runImport} 
                  disabled={isImporting || importComplete}
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : importComplete ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Complete
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Start Import
                    </>
                  )}
                </Button>
              </div>
            )}

            {isImporting && (
              <div className="space-y-2">
                <Progress value={progress} />
                <p className="text-sm text-muted-foreground text-center">
                  Processing {Math.round(progress)}%
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Import Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Total</span>
              <Badge variant="secondary">{rows.length}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Success
              </span>
              <Badge variant="outline" className="text-green-600">{successCount}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-destructive" />
                Failed
              </span>
              <Badge variant="outline" className="text-destructive">{errorCount}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                Pending
              </span>
              <Badge variant="outline">{pendingCount}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Preview Table */}
      {rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-auto max-h-96">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Company Name</TableHead>
                    <TableHead>Industry</TableHead>
                    <TableHead>Timezone</TableHead>
                    <TableHead>Owner Email</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        {row.status === 'success' && (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        )}
                        {row.status === 'error' && (
                          <XCircle className="h-4 w-4 text-destructive" />
                        )}
                        {row.status === 'pending' && (
                          <div className="h-4 w-4 rounded-full border-2 border-muted" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{row.company_name}</TableCell>
                      <TableCell>{row.industry || '-'}</TableCell>
                      <TableCell>{row.timezone}</TableCell>
                      <TableCell>{row.owner_email || '-'}</TableCell>
                      <TableCell className="text-destructive text-sm">
                        {row.error || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
