import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Save, MessageSquare, Bot, Settings, Clock, Loader2 } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import type { AIProfile, AllowedActions, EscalationRules } from '@/types';

export default function AIReceptionist() {
  const { currentCompany } = useCompany();
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [aiProfile, setAiProfile] = useState<AIProfile | null>(null);

  // Form state
  const [greeting, setGreeting] = useState('');
  const [disclosure, setDisclosure] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [afterHoursScript, setAfterHoursScript] = useState('');
  const [allowedActions, setAllowedActions] = useState<AllowedActions>({
    faq: true,
    booking: true,
    quote: false,
    reschedule: false,
    escalate: true,
  });

  useEffect(() => {
    if (currentCompany) {
      fetchAIProfile();
    }
  }, [currentCompany]);

  const fetchAIProfile = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('ai_profiles')
      .select('*')
      .eq('company_id', currentCompany!.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching AI profile:', error);
    }

    if (data) {
      setAiProfile(data as unknown as AIProfile);
      setGreeting(data.greeting_script || '');
      setDisclosure(data.disclosure_script || '');
      setSystemPrompt(data.system_prompt || '');
      setAfterHoursScript(data.after_hours_script || '');
      const actions = data.allowed_actions_json as unknown as AllowedActions;
      if (actions) setAllowedActions(actions);
    }
    setIsLoading(false);
  };

  if (!currentCompany) {
    return <div className="p-8 text-center text-muted-foreground">Please select a company</div>;
  }

  const handleSave = async (section: string) => {
    setIsSaving(true);
    
    const updateData = {
      greeting_script: greeting,
      disclosure_script: disclosure,
      system_prompt: systemPrompt,
      after_hours_script: afterHoursScript,
      allowed_actions_json: allowedActions as unknown as Record<string, unknown>,
    };

    let error;
    if (aiProfile) {
      const result = await supabase
        .from('ai_profiles')
        .update(updateData)
        .eq('id', aiProfile.id);
      error = result.error;
    } else {
      const result = await supabase
        .from('ai_profiles')
        .insert([{ ...updateData, company_id: currentCompany.id }]);
      error = result.error;
    }

    setIsSaving(false);
    if (error) {
      toast.error('Failed to save changes');
    } else {
      toast.success(`${section} saved successfully`);
      fetchAIProfile();
    }
  };

  const toggleAction = (key: keyof AllowedActions) => {
    setAllowedActions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading AI settings...</div>;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold">AI Receptionist</h1>
        <p className="text-muted-foreground">Configure how your AI handles calls for {currentCompany.name}</p>
      </div>

      {/* Greeting & Disclosure */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5" /> Greeting & Disclosure</CardTitle>
          <CardDescription>Customize the opening message callers hear</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Greeting Script</Label>
            <Textarea value={greeting} onChange={(e) => setGreeting(e.target.value)} rows={3} placeholder="Hello! Thank you for calling..." />
          </div>
          <div className="space-y-2">
            <Label>AI Disclosure</Label>
            <Textarea value={disclosure} onChange={(e) => setDisclosure(e.target.value)} rows={2} placeholder="Please note you are speaking with an AI..." />
          </div>
          <Button onClick={() => handleSave('Greeting')} disabled={isSaving} className="bg-accent hover:bg-accent/90">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />} Save
          </Button>
        </CardContent>
      </Card>

      {/* Persona Prompt */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bot className="h-5 w-5" /> Persona Prompt</CardTitle>
          <CardDescription>Define how the AI should behave and respond</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={5} placeholder="You are a friendly and professional receptionist..." />
          <Button onClick={() => handleSave('Persona')} disabled={isSaving} className="bg-accent hover:bg-accent/90">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />} Save
          </Button>
        </CardContent>
      </Card>

      {/* Allowed Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5" /> Allowed Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { key: 'faq' as const, label: 'Answer FAQs' },
            { key: 'booking' as const, label: 'Book Appointments' },
            { key: 'quote' as const, label: 'Quote Intake' },
            { key: 'reschedule' as const, label: 'Reschedule' },
            { key: 'escalate' as const, label: 'Escalate to Human' },
          ].map((action) => (
            <div key={action.key} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <span className="font-medium">{action.label}</span>
              <Switch checked={allowedActions[action.key]} onCheckedChange={() => toggleAction(action.key)} />
            </div>
          ))}
          <Button onClick={() => handleSave('Actions')} disabled={isSaving} className="bg-accent hover:bg-accent/90">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />} Save Actions
          </Button>
        </CardContent>
      </Card>

      {/* After Hours */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" /> After-Hours Behavior</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea 
            value={afterHoursScript} 
            onChange={(e) => setAfterHoursScript(e.target.value)} 
            rows={2} 
            placeholder="We are currently closed..." 
          />
          <Button onClick={() => handleSave('After Hours')} disabled={isSaving} className="bg-accent hover:bg-accent/90">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />} Save
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}
