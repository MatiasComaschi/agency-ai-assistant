import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  FileText, 
  Plus, 
  Edit2, 
  Trash2, 
  Copy, 
  Factory,
  Stethoscope,
  Scale,
  Wrench,
  UtensilsCrossed,
  Home,
  Building2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { TemplateBuilder } from '@/components/templates/TemplateBuilder';
import { ApplyTemplateDialog } from '@/components/templates/ApplyTemplateDialog';
import type { IndustryTemplate } from '@/types/templates';
import type { Json } from '@/integrations/supabase/types';
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

const industryIcons: Record<string, typeof Factory> = {
  'Healthcare': Stethoscope,
  'Legal Services': Scale,
  'Home Services': Wrench,
  'Food & Hospitality': UtensilsCrossed,
  'Real Estate': Home,
  'default': Building2,
};

export default function IndustryTemplates() {
  const { isAgencyAdmin } = useAuth();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<IndustryTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<IndustryTemplate | null>(null);
  const [applyingTemplate, setApplyingTemplate] = useState<IndustryTemplate | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<IndustryTemplate | null>(null);

  useEffect(() => {
    if (!isAgencyAdmin) {
      navigate('/company');
      return;
    }
    fetchTemplates();
  }, [isAgencyAdmin, navigate]);

  const fetchTemplates = async () => {
    const { data, error } = await supabase
      .from('industry_templates')
      .select('*')
      .order('industry', { ascending: true });

    if (error) {
      toast.error('Failed to load templates');
      console.error(error);
    } else {
      setTemplates(data as unknown as IndustryTemplate[]);
    }
    setIsLoading(false);
  };

  const handleDelete = async () => {
    if (!deletingTemplate) return;
    
    const { error } = await supabase
      .from('industry_templates')
      .delete()
      .eq('id', deletingTemplate.id);

    if (error) {
      toast.error('Failed to delete template');
    } else {
      toast.success('Template deleted');
      fetchTemplates();
    }
    setDeletingTemplate(null);
  };

  const handleDuplicate = async (template: IndustryTemplate) => {
    const { error } = await supabase
      .from('industry_templates')
      .insert([{
        name: `${template.name} (Copy)`,
        industry: template.industry,
        description: template.description,
        system_prompt: template.system_prompt,
        greeting_script: template.greeting_script,
        disclosure_script: template.disclosure_script,
        after_hours_script: template.after_hours_script,
        tone: template.tone,
        language: template.language,
        voice_id: template.voice_id,
        allowed_actions_json: template.allowed_actions_json as unknown as Json,
        escalation_rules_json: template.escalation_rules_json as unknown as Json,
        kb_items_json: template.kb_items_json as unknown as Json,
        is_default: false,
      }]);
    if (error) {
      toast.error('Failed to duplicate template');
    } else {
      toast.success('Template duplicated');
      fetchTemplates();
    }
  };

  const getIndustryIcon = (industry: string) => {
    const Icon = industryIcons[industry] || industryIcons.default;
    return Icon;
  };

  if (showBuilder || editingTemplate) {
    return (
      <TemplateBuilder
        template={editingTemplate}
        onSave={() => {
          setShowBuilder(false);
          setEditingTemplate(null);
          fetchTemplates();
        }}
        onCancel={() => {
          setShowBuilder(false);
          setEditingTemplate(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">
            Industry Templates
          </h1>
          <p className="text-muted-foreground mt-1">
            Create and manage reusable AI receptionist configurations
          </p>
        </div>
        <Button onClick={() => setShowBuilder(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Template
        </Button>
      </motion.div>

      {/* Templates Grid */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-6 bg-muted rounded w-3/4" />
                <div className="h-4 bg-muted rounded w-1/2 mt-2" />
              </CardHeader>
              <CardContent>
                <div className="h-20 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : templates.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No templates yet</h3>
            <p className="text-muted-foreground text-center mt-1 max-w-sm">
              Create industry-specific templates to quickly configure new companies
            </p>
            <Button className="mt-4" onClick={() => setShowBuilder(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create First Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => {
            const Icon = getIndustryIcon(template.industry);
            const kbCount = template.kb_items_json?.length || 0;

            return (
              <motion.div
                key={template.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                <Card className="h-full hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{template.name}</CardTitle>
                          <CardDescription>{template.industry}</CardDescription>
                        </div>
                      </div>
                      {template.is_default && (
                        <Badge variant="secondary">Default</Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {template.description || 'No description'}
                    </p>

                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">
                        {template.tone || 'professional'} tone
                      </Badge>
                      <Badge variant="outline">
                        {kbCount} KB items
                      </Badge>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="default"
                        size="sm"
                        className="flex-1"
                        onClick={() => setApplyingTemplate(template)}
                      >
                        Apply to Company
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setEditingTemplate(template)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleDuplicate(template)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      {!template.is_default && (
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setDeletingTemplate(template)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Apply Template Dialog */}
      {applyingTemplate && (
        <ApplyTemplateDialog
          template={applyingTemplate}
          onClose={() => setApplyingTemplate(null)}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingTemplate} onOpenChange={() => setDeletingTemplate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingTemplate?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
