import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Save, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { IndustryTemplate, KBTemplateItem } from '@/types/templates';
import type { Json } from '@/integrations/supabase/types';

interface TemplateBuilderProps {
  template: IndustryTemplate | null;
  onSave: () => void;
  onCancel: () => void;
}

const industries = [
  'Healthcare',
  'Legal Services',
  'Home Services',
  'Food & Hospitality',
  'Real Estate',
  'Financial Services',
  'Education',
  'Retail',
  'Technology',
  'Other',
];

const tones = [
  { value: 'professional', label: 'Professional' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'formal', label: 'Formal' },
  { value: 'casual', label: 'Casual' },
  { value: 'empathetic', label: 'Empathetic' },
];

const voices = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
];

const kbTypes = ['faq', 'services', 'pricing', 'policies'] as const;

export function TemplateBuilder({ template, onSave, onCancel }: TemplateBuilderProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: template?.name || '',
    industry: template?.industry || '',
    description: template?.description || '',
    system_prompt: template?.system_prompt || 'You are a friendly and professional receptionist.',
    greeting_script: template?.greeting_script || 'Hello! Thank you for calling. How may I help you today?',
    disclosure_script: template?.disclosure_script || 'Please note that you are speaking with an AI assistant.',
    after_hours_script: template?.after_hours_script || 'We are currently closed. Please leave a message.',
    tone: template?.tone || 'professional',
    language: template?.language || 'en-US',
    voice_id: template?.voice_id || 'female',
    allowed_actions: template?.allowed_actions_json || {
      faq: true,
      booking: true,
      quote: false,
      reschedule: false,
      escalate: true,
    },
    escalation_rules: template?.escalation_rules_json || {
      escalateOnRequest: true,
      escalateOnComplaint: true,
      escalateAfterMinutes: 5,
    },
    kb_items: (template?.kb_items_json || []) as KBTemplateItem[],
  });

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.industry) {
      toast.error('Please fill in name and industry');
      return;
    }

    setIsSaving(true);

    const payload = {
      name: formData.name,
      industry: formData.industry,
      description: formData.description,
      system_prompt: formData.system_prompt,
      greeting_script: formData.greeting_script,
      disclosure_script: formData.disclosure_script,
      after_hours_script: formData.after_hours_script,
      tone: formData.tone,
      language: formData.language,
      voice_id: formData.voice_id,
      allowed_actions_json: formData.allowed_actions as unknown as Json,
      escalation_rules_json: formData.escalation_rules as unknown as Json,
      kb_items_json: formData.kb_items as unknown as Json,
    };

    const { error } = template
      ? await supabase.from('industry_templates').update(payload).eq('id', template.id)
      : await supabase.from('industry_templates').insert([payload]);

    if (error) {
      toast.error('Failed to save template');
      console.error(error);
    } else {
      toast.success(template ? 'Template updated' : 'Template created');
      onSave();
    }
    setIsSaving(false);
  };

  const addKBItem = () => {
    setFormData((prev) => ({
      ...prev,
      kb_items: [...prev.kb_items, { type: 'faq', title: '', answer: '' }],
    }));
  };

  const updateKBItem = (index: number, field: keyof KBTemplateItem, value: string) => {
    setFormData((prev) => ({
      ...prev,
      kb_items: prev.kb_items.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      ),
    }));
  };

  const removeKBItem = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      kb_items: prev.kb_items.filter((_, i) => i !== index),
    }));
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onCancel}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">
              {template ? 'Edit Template' : 'New Template'}
            </h1>
            <p className="text-muted-foreground mt-1">
              Configure AI receptionist settings for this industry
            </p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? 'Saving...' : 'Save Template'}
        </Button>
      </div>

      <Tabs defaultValue="basics" className="space-y-4">
        <TabsList>
          <TabsTrigger value="basics">Basics</TabsTrigger>
          <TabsTrigger value="scripts">Scripts</TabsTrigger>
          <TabsTrigger value="actions">Actions & Rules</TabsTrigger>
          <TabsTrigger value="knowledge">Knowledge Base</TabsTrigger>
        </TabsList>

        {/* Basics Tab */}
        <TabsContent value="basics">
          <Card>
            <CardHeader>
              <CardTitle>Template Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Template Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Medical Practice Standard"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="industry">Industry *</Label>
                  <Select
                    value={formData.industry}
                    onValueChange={(v) => setFormData((prev) => ({ ...prev, industry: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select industry" />
                    </SelectTrigger>
                    <SelectContent>
                      {industries.map((ind) => (
                        <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe when to use this template"
                  rows={2}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Tone</Label>
                  <Select
                    value={formData.tone}
                    onValueChange={(v) => setFormData((prev) => ({ ...prev, tone: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {tones.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Voice</Label>
                  <Select
                    value={formData.voice_id}
                    onValueChange={(v) => setFormData((prev) => ({ ...prev, voice_id: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {voices.map((v) => (
                        <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Language</Label>
                  <Select
                    value={formData.language}
                    onValueChange={(v) => setFormData((prev) => ({ ...prev, language: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en-US">English (US)</SelectItem>
                      <SelectItem value="en-GB">English (UK)</SelectItem>
                      <SelectItem value="es-ES">Spanish</SelectItem>
                      <SelectItem value="fr-FR">French</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Scripts Tab */}
        <TabsContent value="scripts">
          <Card>
            <CardHeader>
              <CardTitle>AI Scripts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="system_prompt">System Prompt</Label>
                <Textarea
                  id="system_prompt"
                  value={formData.system_prompt}
                  onChange={(e) => setFormData((prev) => ({ ...prev, system_prompt: e.target.value }))}
                  rows={4}
                  placeholder="Define the AI's personality and behavior..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="greeting">Greeting Script</Label>
                <Textarea
                  id="greeting"
                  value={formData.greeting_script}
                  onChange={(e) => setFormData((prev) => ({ ...prev, greeting_script: e.target.value }))}
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="disclosure">AI Disclosure Script</Label>
                <Textarea
                  id="disclosure"
                  value={formData.disclosure_script}
                  onChange={(e) => setFormData((prev) => ({ ...prev, disclosure_script: e.target.value }))}
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="after_hours">After Hours Script</Label>
                <Textarea
                  id="after_hours"
                  value={formData.after_hours_script}
                  onChange={(e) => setFormData((prev) => ({ ...prev, after_hours_script: e.target.value }))}
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Actions & Rules Tab */}
        <TabsContent value="actions">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Allowed Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {Object.entries(formData.allowed_actions).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between">
                    <Label className="capitalize">{key.replace('_', ' ')}</Label>
                    <Switch
                      checked={value}
                      onCheckedChange={(checked) =>
                        setFormData((prev) => ({
                          ...prev,
                          allowed_actions: { ...prev.allowed_actions, [key]: checked },
                        }))
                      }
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Escalation Rules</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Escalate on Request</Label>
                  <Switch
                    checked={formData.escalation_rules.escalateOnRequest}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({
                        ...prev,
                        escalation_rules: { ...prev.escalation_rules, escalateOnRequest: checked },
                      }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Escalate on Complaint</Label>
                  <Switch
                    checked={formData.escalation_rules.escalateOnComplaint}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({
                        ...prev,
                        escalation_rules: { ...prev.escalation_rules, escalateOnComplaint: checked },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Escalate After (minutes)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    value={formData.escalation_rules.escalateAfterMinutes}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        escalation_rules: {
                          ...prev.escalation_rules,
                          escalateAfterMinutes: parseInt(e.target.value) || 5,
                        },
                      }))
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Knowledge Base Tab */}
        <TabsContent value="knowledge">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Knowledge Base Items</CardTitle>
              <Button size="sm" onClick={addKBItem}>
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {formData.kb_items.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No knowledge base items. Add FAQ, services, pricing, or policies.
                </p>
              ) : (
                formData.kb_items.map((item, index) => (
                  <div key={index} className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <Select
                        value={item.type}
                        onValueChange={(v) => updateKBItem(index, 'type', v as KBTemplateItem['type'])}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {kbTypes.map((t) => (
                            <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="icon" onClick={() => removeKBItem(index)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    <Input
                      placeholder="Title"
                      value={item.title}
                      onChange={(e) => updateKBItem(index, 'title', e.target.value)}
                    />
                    <Textarea
                      placeholder="Answer / Content"
                      value={item.answer}
                      onChange={(e) => updateKBItem(index, 'answer', e.target.value)}
                      rows={2}
                    />
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
