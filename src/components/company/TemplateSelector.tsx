import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Check, FileText } from 'lucide-react';

interface Template {
  id: string;
  name: string;
  industry: string;
  description: string | null;
  is_default: boolean | null;
}

interface TemplateSelectorProps {
  selectedTemplateId: string | null;
  onSelect: (templateId: string | null) => void;
}

export function TemplateSelector({ selectedTemplateId, onSelect }: TemplateSelectorProps) {
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['industry-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('industry_templates')
        .select('id, name, industry, description, is_default')
        .order('industry');
      if (error) throw error;
      return data as Template[];
    },
  });

  if (isLoading) {
    return (
      <div className="text-center py-4 text-muted-foreground">Loading templates...</div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground">
        No templates available. You can create one later.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Select a template to pre-configure AI settings and knowledge base
        </p>
        {selectedTemplateId && (
          <Button variant="ghost" size="sm" onClick={() => onSelect(null)}>
            Clear Selection
          </Button>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {templates.map((template) => (
          <Card
            key={template.id}
            className={`cursor-pointer transition-all hover:border-primary ${
              selectedTemplateId === template.id ? 'border-primary ring-2 ring-primary/20' : ''
            }`}
            onClick={() => onSelect(template.id)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  {template.name}
                </CardTitle>
                {selectedTemplateId === template.id && (
                  <Check className="h-5 w-5 text-primary" />
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="secondary">{template.industry}</Badge>
                {template.is_default && (
                  <Badge variant="outline">Default</Badge>
                )}
              </div>
              {template.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {template.description}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
