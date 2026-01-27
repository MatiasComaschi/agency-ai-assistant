import { useCompany } from '@/contexts/CompanyContext';
import { Building2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

export function CompanySelector() {
  const { companies, currentCompany, setCurrentCompanyId, isLoading } = useCompany();

  if (isLoading) {
    return (
      <div className="h-10 w-64 bg-muted animate-pulse rounded-md" />
    );
  }

  if (companies.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 mb-6">
      <Building2 className="h-4 w-4 text-muted-foreground" />
      <Select
        value={currentCompany?.id || ''}
        onValueChange={(value) => setCurrentCompanyId(value)}
      >
        <SelectTrigger className="w-64 bg-background">
          <SelectValue placeholder="Select company" />
        </SelectTrigger>
        <SelectContent>
          {companies.map((company) => (
            <SelectItem key={company.id} value={company.id}>
              <div className="flex items-center justify-between gap-2 w-full">
                <span>{company.name}</span>
                <Badge
                  variant={company.status === 'active' ? 'default' : 'secondary'}
                  className="text-xs"
                >
                  {company.status}
                </Badge>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
