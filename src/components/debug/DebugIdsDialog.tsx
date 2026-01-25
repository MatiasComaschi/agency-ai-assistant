import { useState, useEffect } from 'react';
import { Copy, Check, Bug } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface CompanyRow {
  id: string;
  name: string;
  industry: string | null;
  status: string;
  created_at: string;
}

export function DebugIdsDialog() {
  const { currentCompany } = useCompany();
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchCompanies();
    }
  }, [isOpen]);

  const fetchCompanies = async () => {
    const { data, error } = await supabase
      .from('companies')
      .select('id, name, industry, status, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching companies:', error);
      toast.error('Failed to fetch companies');
      return;
    }

    setCompanies(data || []);
  };

  const copyToClipboard = async (id: string) => {
    await navigator.clipboard.writeText(id);
    setCopiedId(id);
    toast.success('ID copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Bug className="h-4 w-4" />
          Debug IDs
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bug className="h-5 w-5" />
            Debug: Company IDs
          </DialogTitle>
          <DialogDescription>
            Temporary debug tool - shows all company UUIDs for testing
          </DialogDescription>
        </DialogHeader>

        {/* Current Company */}
        {currentCompany && (
          <div className="p-4 rounded-lg bg-accent/10 border border-accent/20 space-y-2">
            <div className="text-sm font-medium text-muted-foreground">
              Currently Selected Company
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-lg">{currentCompany.name}</div>
                <code className="text-sm text-muted-foreground font-mono">
                  {currentCompany.id}
                </code>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => copyToClipboard(currentCompany.id)}
                className="gap-2"
              >
                {copiedId === currentCompany.id ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                Copy ID
              </Button>
            </div>
          </div>
        )}

        {/* All Companies Table */}
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-24">ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map((company) => (
                <TableRow key={company.id}>
                  <TableCell className="font-medium">{company.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {company.industry || '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{company.status}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(company.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(company.id)}
                      className="gap-1 h-8 px-2"
                    >
                      {copiedId === company.id ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      <span className="text-xs font-mono">
                        {company.id.slice(0, 8)}...
                      </span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {companies.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No companies found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
