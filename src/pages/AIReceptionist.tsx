import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Save, MessageSquare, Bot, Settings, Clock, Loader2, Play, RotateCcw, Send, X } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import type { Json } from '@/integrations/supabase/types';
import type { AIProfile, AllowedActions } from '@/types';

// Industry templates
const templates: Record<string, { greeting: string; disclosure: string; systemPrompt: string }> = {
  salon: {
    greeting: "Hello! Thank you for calling [Salon Name]. I'm here to help you with appointments, services, and pricing. How may I assist you today?",
    disclosure: "Just so you know, you're speaking with our AI assistant. I can help with most questions, but I can always connect you with a team member if needed.",
    systemPrompt: "You are a friendly and stylish receptionist for a hair salon. Be warm, use beauty-related language when appropriate. Help with booking appointments, explaining services (haircuts, coloring, styling, treatments), and providing pricing information. Always sound professional but approachable.",
  },
  plumber: {
    greeting: "Hi there! Thanks for calling [Plumbing Company]. Whether you have an emergency or need to schedule service, I'm here to help. What can I do for you?",
    disclosure: "You're chatting with our AI assistant. I can help with scheduling, estimates, and general questions. For emergencies, I can get you connected right away.",
    systemPrompt: "You are a helpful receptionist for a plumbing company. Be professional, empathetic about water/plumbing emergencies, and efficient. Help callers describe their issues, schedule appointments, and provide general pricing estimates. Prioritize emergency calls.",
  },
  hvac: {
    greeting: "Hello! You've reached [HVAC Company]. Whether your AC is out or you need routine maintenance, I'm here to assist. How can I help you today?",
    disclosure: "I'm an AI assistant helping with calls. I can schedule service, answer questions, or connect you with a technician for urgent issues.",
    systemPrompt: "You are a knowledgeable receptionist for an HVAC company. Understand heating and cooling systems terminology. Help customers describe their issues, schedule maintenance or repair appointments, and provide basic troubleshooting tips when appropriate. Prioritize emergency heating/cooling failures.",
  },
};

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

  // Simulator state
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'ai'; content: string }>>([]);
  const [userInput, setUserInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);

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
    
    const actionsAsJson = JSON.parse(JSON.stringify(allowedActions)) as Json;
    
    const updateData = {
      greeting_script: greeting,
      disclosure_script: disclosure,
      system_prompt: systemPrompt,
      after_hours_script: afterHoursScript,
      allowed_actions_json: actionsAsJson,
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

  const applyTemplate = (templateKey: string) => {
    const template = templates[templateKey];
    if (template) {
      setGreeting(template.greeting.replace('[Salon Name]', currentCompany.name).replace('[Plumbing Company]', currentCompany.name).replace('[HVAC Company]', currentCompany.name));
      setDisclosure(template.disclosure);
      setSystemPrompt(template.systemPrompt);
      toast.success(`Applied ${templateKey.charAt(0).toUpperCase() + templateKey.slice(1)} template`);
    }
  };

  // Simulator functions
  const openSimulator = () => {
    setChatMessages([{ role: 'ai', content: greeting || 'Hello! How can I help you today?' }]);
    setIsSimulatorOpen(true);
  };

  const sendMessage = async () => {
    if (!userInput.trim()) return;
    
    const newMessages = [...chatMessages, { role: 'user' as const, content: userInput }];
    setChatMessages(newMessages);
    setUserInput('');
    setIsThinking(true);

    // Simulate AI response (in a real implementation, this would call an AI endpoint)
    setTimeout(() => {
      const responses = [
        "I'd be happy to help you with that! Let me check our availability.",
        "Of course! We have several options that might work for you.",
        "I understand. Let me see what I can do to assist you with that request.",
        "That's a great question! Based on our services, I would recommend...",
        "I can definitely help schedule that for you. What day works best?",
      ];
      const aiResponse = responses[Math.floor(Math.random() * responses.length)];
      setChatMessages([...newMessages, { role: 'ai', content: aiResponse }]);
      setIsThinking(false);
    }, 1000 + Math.random() * 1000);
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center text-muted-foreground flex items-center justify-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading AI settings...
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-display font-bold">AI Receptionist</h1>
          <p className="text-muted-foreground">Configure how your AI handles calls for {currentCompany.name}</p>
        </div>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <RotateCcw className="h-4 w-4 mr-2" /> Reset to Template
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => applyTemplate('salon')}>🏪 Salon / Spa</DropdownMenuItem>
              <DropdownMenuItem onClick={() => applyTemplate('plumber')}>🔧 Plumber</DropdownMenuItem>
              <DropdownMenuItem onClick={() => applyTemplate('hvac')}>❄️ HVAC</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={openSimulator} className="bg-accent hover:bg-accent/90">
            <Play className="h-4 w-4 mr-2" /> Test AI
          </Button>
        </div>
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

      {/* AI Simulator Dialog */}
      <Dialog open={isSimulatorOpen} onOpenChange={setIsSimulatorOpen}>
        <DialogContent className="max-w-md h-[600px] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" /> AI Simulator
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-4">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    msg.role === 'user' 
                      ? 'bg-accent text-accent-foreground' 
                      : 'bg-muted'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {isThinking && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg px-4 py-2 flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Thinking...
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
          <div className="flex gap-2 pt-4 border-t">
            <Input
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="Type a message..."
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            />
            <Button onClick={sendMessage} disabled={isThinking} size="icon">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
