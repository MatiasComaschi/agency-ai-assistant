import { useState, useEffect } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Company } from '@/types';
import type { IndustryTemplate } from '@/types/templates';

interface ApplyTemplateDialogProps {
  template: IndustryTemplate;
  onClose: () => void;
}

export function ApplyTemplateDialog({ template, onClose }: ApplyTemplateDialogProps) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [options, setOptions] = useState({
    applyAIProfile: true,
    applyKnowledgeBase: true,
    replaceExistingKB: false,
  });

  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .order('name');

    if (!error && data) {
      setCompanies(data as unknown as Company[]);
    }
  };

  const handleApply = async () => {
    if (!selectedCompanyId) {
      toast.error('Please select a company');
      return;
    }

    setIsLoading(true);

    try {
      // Apply AI Profile settings
      if (options.applyAIProfile) {
        const { error: aiError } = await supabase
          .from('ai_profiles')
          .upsert({
            company_id: selectedCompanyId,
            system_prompt: template.system_prompt,
            greeting_script: template.greeting_script,
            disclosure_script: template.disclosure_script,
            after_hours_script: template.after_hours_script,
            tone: template.tone,
            language: template.language,
            voice_id: template.voice_id,
            allowed_actions_json: template.allowed_actions_json,
            escalation_rules_json: template.escalation_rules_json,
          }, { onConflict: 'company_id' });

        if (aiError) throw aiError;
      }

      // Apply Knowledge Base items
      if (options.applyKnowledgeBase && template.kb_items_json?.length) {
        // Optionally clear existing KB
        if (options.replaceExistingKB) {
          await supabase
            .from('knowledge_base_items')
            .delete()
            .eq('company_id', selectedCompanyId);
        }

        const kbItems = template.kb_items_json.map((item) => ({
          company_id: selectedCompanyId,
          type: item.type,
          title: item.title,
          question: item.question || null,
          answer: item.answer,
          is_active: true,
          tags: [],
        }));

        const { error: kbError } = await supabase
          .from('knowledge_base_items')
          .insert(kbItems);

        if (kbError) throw kbError;
      }

      // Update company industry if not set
      await supabase
        .from('companies')
        .update({ industry: template.industry })
        .eq('id', selectedCompanyId)
        .is('industry', null);

      toast.success('Template applied successfully');
      onClose();
    } catch (error) {
      console.error(error);
      toast.error('Failed to apply template');
    } finally {
      setIsLoading(false);
    }
  };

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Apply Template: {template.name}</DialogTitle>
          <DialogDescription>
            Apply this {template.industry} template configuration to a company
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Select Company</Label>
            <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a company..." />
              </SelectTrigger>
              <SelectContent>
                {companies.map((company) => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label>Options</Label>
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="applyAI"
                checked={options.applyAIProfile}
                onCheckedChange={(checked) =>
                  setOptions((prev) => ({ ...prev, applyAIProfile: checked as boolean }))
                }
              />
              <label htmlFor="applyAI" className="text-sm">
                Apply AI profile (prompts, scripts, tone, rules)
              </label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="applyKB"
                checked={options.applyKnowledgeBase}
                onCheckedChange={(checked) =>
                  setOptions((prev) => ({ ...prev, applyKnowledgeBase: checked as boolean }))
                }
              />
              <label htmlFor="applyKB" className="text-sm">
                Apply knowledge base items ({template.kb_items_json?.length || 0} items)
              </label>
            </div>

            {options.applyKnowledgeBase && (
              <div className="flex items-center space-x-2 ml-6">
                <Checkbox
                  id="replaceKB"
                  checked={options.replaceExistingKB}
                  onCheckedChange={(checked) =>
                    setOptions((prev) => ({ ...prev, replaceExistingKB: checked as boolean }))
                  }
                />
                <label htmlFor="replaceKB" className="text-sm text-muted-foreground">
                  Replace existing KB (otherwise merge)
                </label>
              </div>
            )}
          </div>

          {selectedCompany && (
            <div className="p-3 bg-muted rounded-lg text-sm">
              <p className="font-medium">{selectedCompany.name}</p>
              <p className="text-muted-foreground">
                {selectedCompany.industry || 'No industry set'} • {selectedCompany.status}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={isLoading || !selectedCompanyId}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Check className="h-4 w-4 mr-2" />
            )}
            Apply Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
