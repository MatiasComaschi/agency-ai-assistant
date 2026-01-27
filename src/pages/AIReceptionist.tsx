import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Save, MessageSquare, Bot, Settings, Clock, Loader2, Play, RotateCcw, Globe } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import type { Json } from '@/integrations/supabase/types';
import type { AIProfile, AllowedActions } from '@/types';
import { AISimulator } from '@/components/ai-simulator/AISimulator';

// Supported languages with localized scripts
const LANGUAGES = [
  { code: 'en-US', name: 'English (US)', flag: '🇺🇸' },
  { code: 'es-ES', name: 'Spanish (Spain)', flag: '🇪🇸' },
  { code: 'es-MX', name: 'Spanish (Mexico)', flag: '🇲🇽' },
  { code: 'fr-FR', name: 'French', flag: '🇫🇷' },
  { code: 'de-DE', name: 'German', flag: '🇩🇪' },
  { code: 'pt-BR', name: 'Portuguese (Brazil)', flag: '🇧🇷' },
  { code: 'zh-CN', name: 'Chinese (Mandarin)', flag: '🇨🇳' },
  { code: 'ja-JP', name: 'Japanese', flag: '🇯🇵' },
  { code: 'ko-KR', name: 'Korean', flag: '🇰🇷' },
  { code: 'vi-VN', name: 'Vietnamese', flag: '🇻🇳' },
] as const;

// Localized default scripts
const LOCALIZED_SCRIPTS: Record<string, { greeting: string; disclosure: string; afterHours: string }> = {
  'en-US': {
    greeting: "Hello! Thank you for calling. How may I help you today?",
    disclosure: "Please note that you are speaking with an AI assistant.",
    afterHours: "We are currently closed. Please leave a message and we'll get back to you.",
  },
  'es-ES': {
    greeting: "¡Hola! Gracias por llamar. ¿En qué puedo ayudarle hoy?",
    disclosure: "Por favor, tenga en cuenta que está hablando con un asistente de inteligencia artificial.",
    afterHours: "Actualmente estamos cerrados. Por favor, deje un mensaje y nos pondremos en contacto con usted.",
  },
  'es-MX': {
    greeting: "¡Hola! Gracias por llamar. ¿En qué le puedo ayudar hoy?",
    disclosure: "Por favor, tenga en cuenta que está hablando con un asistente de inteligencia artificial.",
    afterHours: "Estamos cerrados en este momento. Por favor, deje un mensaje y le responderemos pronto.",
  },
  'fr-FR': {
    greeting: "Bonjour ! Merci d'avoir appelé. Comment puis-je vous aider aujourd'hui ?",
    disclosure: "Veuillez noter que vous parlez avec un assistant IA.",
    afterHours: "Nous sommes actuellement fermés. Veuillez laisser un message et nous vous recontacterons.",
  },
  'de-DE': {
    greeting: "Hallo! Vielen Dank für Ihren Anruf. Wie kann ich Ihnen heute helfen?",
    disclosure: "Bitte beachten Sie, dass Sie mit einem KI-Assistenten sprechen.",
    afterHours: "Wir haben derzeit geschlossen. Bitte hinterlassen Sie eine Nachricht und wir melden uns bei Ihnen.",
  },
  'pt-BR': {
    greeting: "Olá! Obrigado por ligar. Como posso ajudá-lo hoje?",
    disclosure: "Por favor, note que você está falando com um assistente de IA.",
    afterHours: "Estamos fechados no momento. Por favor, deixe uma mensagem e retornaremos em breve.",
  },
  'zh-CN': {
    greeting: "您好！感谢您的来电。今天我能为您做些什么？",
    disclosure: "请注意，您正在与AI助手交谈。",
    afterHours: "我们目前已关闭。请留言，我们会尽快回复您。",
  },
  'ja-JP': {
    greeting: "こんにちは！お電話ありがとうございます。本日はどのようなご用件でしょうか？",
    disclosure: "AIアシスタントとお話しいただいていることをご了承ください。",
    afterHours: "現在営業時間外です。メッセージを残していただければ、折り返しご連絡いたします。",
  },
  'ko-KR': {
    greeting: "안녕하세요! 전화 주셔서 감사합니다. 오늘 무엇을 도와드릴까요?",
    disclosure: "AI 어시스턴트와 대화하고 계심을 알려드립니다.",
    afterHours: "현재 영업시간이 아닙니다. 메시지를 남겨주시면 연락드리겠습니다.",
  },
  'vi-VN': {
    greeting: "Xin chào! Cảm ơn bạn đã gọi điện. Hôm nay tôi có thể giúp gì cho bạn?",
    disclosure: "Xin lưu ý rằng bạn đang nói chuyện với trợ lý AI.",
    afterHours: "Chúng tôi hiện đang đóng cửa. Vui lòng để lại tin nhắn và chúng tôi sẽ liên hệ lại với bạn.",
  },
};

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
  const [language, setLanguage] = useState('en-US');
  const [allowedActions, setAllowedActions] = useState<AllowedActions>({
    faq: true,
    booking: true,
    quote: false,
    reschedule: false,
    escalate: true,
  });

  // Simulator state
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);

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
      setLanguage(data.language || 'en-US');
      const actions = data.allowed_actions_json as unknown as AllowedActions;
      if (actions) setAllowedActions(actions);
    }
    setIsLoading(false);
  };

  // Apply localized scripts when language changes
  const applyLanguageDefaults = (langCode: string) => {
    const scripts = LOCALIZED_SCRIPTS[langCode] || LOCALIZED_SCRIPTS['en-US'];
    setGreeting(scripts.greeting);
    setDisclosure(scripts.disclosure);
    setAfterHoursScript(scripts.afterHours);
    setLanguage(langCode);
    toast.success(`Applied ${LANGUAGES.find(l => l.code === langCode)?.name || langCode} defaults`);
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
      language: language,
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
        <div className="flex gap-2 flex-wrap justify-end">
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
          <Button onClick={() => setIsSimulatorOpen(true)} className="bg-accent hover:bg-accent/90">
            <Play className="h-4 w-4 mr-2" /> Test AI
          </Button>
        </div>
      </div>

      {/* Language Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" /> Language</CardTitle>
          <CardDescription>Set the primary language for your AI receptionist</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Select value={language} onValueChange={(val) => setLanguage(val)}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    <span className="flex items-center gap-2">
                      <span>{lang.flag}</span>
                      <span>{lang.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => applyLanguageDefaults(language)}>
              Apply Localized Defaults
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            This sets the language the AI will use to respond. Click "Apply Localized Defaults" to auto-fill greeting, disclosure, and after-hours scripts in the selected language.
          </p>
          <Button onClick={() => handleSave('Language')} disabled={isSaving} className="bg-accent hover:bg-accent/90">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />} Save Language
          </Button>
        </CardContent>
      </Card>

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

      {/* AI Simulator */}
      <AISimulator 
        open={isSimulatorOpen} 
        onOpenChange={setIsSimulatorOpen} 
        company={currentCompany} 
      />
    </motion.div>
  );
}
