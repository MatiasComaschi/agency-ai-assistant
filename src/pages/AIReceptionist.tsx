import { useState } from 'react';
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

export default function AIReceptionist() {
  const { currentCompany, refetchCompanies } = useCompany();
  const [isSaving, setIsSaving] = useState(false);
  const [greeting, setGreeting] = useState(currentCompany?.ai_greeting || '');
  const [disclosure, setDisclosure] = useState(currentCompany?.ai_disclosure || '');
  const [personaPrompt, setPersonaPrompt] = useState(currentCompany?.ai_persona_prompt || '');

  if (!currentCompany) {
    return <div className="p-8 text-center text-muted-foreground">Please select a company</div>;
  }

  const handleSave = async (section: string) => {
    setIsSaving(true);
    const { error } = await supabase
      .from('companies')
      .update({ ai_greeting: greeting, ai_disclosure: disclosure, ai_persona_prompt: personaPrompt })
      .eq('id', currentCompany.id);

    setIsSaving(false);
    if (error) {
      toast.error('Failed to save changes');
    } else {
      toast.success(`${section} saved successfully`);
      refetchCompanies();
    }
  };

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
          <Textarea value={personaPrompt} onChange={(e) => setPersonaPrompt(e.target.value)} rows={5} placeholder="You are a friendly and professional receptionist..." />
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
            { key: 'ai_allow_faq', label: 'Answer FAQs', value: currentCompany.ai_allow_faq },
            { key: 'ai_allow_booking', label: 'Book Appointments', value: currentCompany.ai_allow_booking },
            { key: 'ai_allow_quote', label: 'Quote Intake', value: currentCompany.ai_allow_quote },
            { key: 'ai_allow_reschedule', label: 'Reschedule', value: currentCompany.ai_allow_reschedule },
            { key: 'ai_allow_escalate', label: 'Escalate to Human', value: currentCompany.ai_allow_escalate },
          ].map((action) => (
            <div key={action.key} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <span className="font-medium">{action.label}</span>
              <Switch checked={action.value} />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* After Hours */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" /> After-Hours Behavior</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select defaultValue={currentCompany.after_hours_behavior}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="voicemail">Take Voicemail</SelectItem>
              <SelectItem value="message">Play Message</SelectItem>
              <SelectItem value="forward">Forward Call</SelectItem>
            </SelectContent>
          </Select>
          <Textarea defaultValue={currentCompany.after_hours_message} rows={2} placeholder="We are currently closed..." />
        </CardContent>
      </Card>
    </motion.div>
  );
}
