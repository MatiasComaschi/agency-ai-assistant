import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Clock,
  Phone,
  Bot,
  Calendar,
  MessageSquare,
  ArrowLeft,
  Save,
  Loader2,
  Globe,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CompanyHoursEditor } from '@/components/company/CompanyHoursEditor';

const timezones = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
];

interface CompanyData {
  id: string;
  name: string;
  timezone: string;
  primary_phone: string | null;
  fallback_phone: string | null;
  twilio_number: string | null;
  booking_link: string | null;
  ai_enabled: boolean;
}

interface AIProfileData {
  greeting_script: string | null;
  disclosure_script: string | null;
  disclosure_required: boolean;
}

export default function CompanySettings() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const companyId = searchParams.get('id');
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [company, setCompany] = useState<CompanyData | null>(null);
  const [aiProfile, setAiProfile] = useState<AIProfileData | null>(null);
  
  // Form state
  const [timezone, setTimezone] = useState('America/New_York');
  const [primaryPhone, setPrimaryPhone] = useState('');
  const [fallbackPhone, setFallbackPhone] = useState('');
  const [twilioNumber, setTwilioNumber] = useState('');
  const [bookingLink, setBookingLink] = useState('');
  const [aiEnabled, setAiEnabled] = useState(true);
  const [greetingScript, setGreetingScript] = useState('');
  const [disclosureScript, setDisclosureScript] = useState('');
  const [disclosureRequired, setDisclosureRequired] = useState(true);

  useEffect(() => {
    if (companyId) {
      fetchData();
    }
  }, [companyId]);

  const fetchData = async () => {
    if (!companyId) return;
    
    setIsLoading(true);
    try {
      // Fetch company
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('id, name, timezone, primary_phone, fallback_phone, twilio_number, booking_link, ai_enabled')
        .eq('id', companyId)
        .single();

      if (companyError) throw companyError;
      
      // Fetch AI profile
      const { data: aiData, error: aiError } = await supabase
        .from('ai_profiles')
        .select('greeting_script, disclosure_script, disclosure_required')
        .eq('company_id', companyId)
        .single();

      if (companyData) {
        setCompany(companyData);
        setTimezone(companyData.timezone);
        setPrimaryPhone(companyData.primary_phone || '');
        setFallbackPhone(companyData.fallback_phone || '');
        setTwilioNumber(companyData.twilio_number || '');
        setBookingLink(companyData.booking_link || '');
        setAiEnabled(companyData.ai_enabled);
      }

      if (aiData) {
        setAiProfile(aiData);
        setGreetingScript(aiData.greeting_script || '');
        setDisclosureScript(aiData.disclosure_script || '');
        setDisclosureRequired(aiData.disclosure_required);
      }
    } catch (error) {
      console.error('Error fetching company:', error);
      toast.error('Failed to load company settings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!companyId) return;
    
    setIsSaving(true);
    try {
      // Update company
      const { error: companyError } = await supabase
        .from('companies')
        .update({
          timezone,
          primary_phone: primaryPhone || null,
          fallback_phone: fallbackPhone || null,
          twilio_number: twilioNumber || null,
          booking_link: bookingLink || null,
          ai_enabled: aiEnabled,
        })
        .eq('id', companyId);

      if (companyError) throw companyError;

      // Update AI profile
      const { error: aiError } = await supabase
        .from('ai_profiles')
        .update({
          greeting_script: greetingScript || null,
          disclosure_script: disclosureScript || null,
          disclosure_required: disclosureRequired,
        })
        .eq('company_id', companyId);

      if (aiError) throw aiError;

      toast.success('Settings saved successfully');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  if (!companyId) {
    return (
      <div className="p-12 text-center">
        <p className="text-muted-foreground">No company specified</p>
        <Button onClick={() => navigate('/agency')} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/agency')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-display font-bold">{company?.name} Settings</h1>
          <p className="text-muted-foreground">Configure company settings and AI behavior</p>
        </div>
        <Button onClick={handleSave} disabled={isSaving} className="bg-accent hover:bg-accent/90">
          {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save Changes
        </Button>
      </div>

      {/* Working Hours */}
      <CompanyHoursEditor companyId={companyId} />

      {/* Phone Numbers */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-primary" />
            <CardTitle>Phone Numbers</CardTitle>
          </div>
          <CardDescription>Configure phone numbers for calls and routing</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="twilioNumber">AI Phone Number (Twilio)</Label>
              <Input
                id="twilioNumber"
                value={twilioNumber}
                onChange={(e) => setTwilioNumber(e.target.value)}
                placeholder="+1 555 123 4567"
              />
              <p className="text-xs text-muted-foreground">The number callers dial to reach the AI</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="primaryPhone">Primary Business Phone</Label>
              <Input
                id="primaryPhone"
                value={primaryPhone}
                onChange={(e) => setPrimaryPhone(e.target.value)}
                placeholder="+1 555 123 4567"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="fallbackPhone">Transfer / Fallback Phone</Label>
            <Input
              id="fallbackPhone"
              value={fallbackPhone}
              onChange={(e) => setFallbackPhone(e.target.value)}
              placeholder="+1 555 123 4567"
            />
            <p className="text-xs text-muted-foreground">Calls are transferred here when escalated or AI is disabled</p>
          </div>
        </CardContent>
      </Card>

      {/* AI Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <CardTitle>AI Settings</CardTitle>
          </div>
          <CardDescription>Configure AI behavior and enable/disable the receptionist</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base font-medium">AI Receptionist</Label>
              <p className="text-sm text-muted-foreground">
                {aiEnabled ? 'AI is handling incoming calls' : 'AI is disabled - calls forwarded to fallback'}
              </p>
            </div>
            <Switch
              checked={aiEnabled}
              onCheckedChange={setAiEnabled}
            />
          </div>
          
          <Separator />
          
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base font-medium">AI Disclosure Required</Label>
              <p className="text-sm text-muted-foreground">
                Inform callers they are speaking with an AI
              </p>
            </div>
            <Switch
              checked={disclosureRequired}
              onCheckedChange={setDisclosureRequired}
            />
          </div>
        </CardContent>
      </Card>

      {/* Greeting & Disclosure Scripts */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            <CardTitle>Greeting & Disclosure</CardTitle>
          </div>
          <CardDescription>Customize what the AI says to callers</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="greetingScript">Greeting Script</Label>
            <Textarea
              id="greetingScript"
              value={greetingScript}
              onChange={(e) => setGreetingScript(e.target.value)}
              placeholder="Hello! Thank you for calling. How may I help you today?"
              rows={3}
            />
            <p className="text-xs text-muted-foreground">What the AI says when answering the phone</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="disclosureScript">Disclosure Script</Label>
            <Textarea
              id="disclosureScript"
              value={disclosureScript}
              onChange={(e) => setDisclosureScript(e.target.value)}
              placeholder="Please note that you are speaking with an AI assistant."
              rows={2}
            />
            <p className="text-xs text-muted-foreground">Played if disclosure is required</p>
          </div>
        </CardContent>
      </Card>

      {/* Calendar Connection */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            <CardTitle>Calendar & Booking</CardTitle>
          </div>
          <CardDescription>Configure booking link and calendar integration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bookingLink">Booking Link (Calendly, Cal.com, etc.)</Label>
            <Input
              id="bookingLink"
              value={bookingLink}
              onChange={(e) => setBookingLink(e.target.value)}
              placeholder="https://calendly.com/your-company"
            />
            <p className="text-xs text-muted-foreground">External booking page for customers</p>
          </div>
        </CardContent>
      </Card>

      {/* Timezone */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            <CardTitle>Timezone</CardTitle>
          </div>
          <CardDescription>Set the company's operating timezone</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label>Timezone</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {timezones.map((tz) => (
                  <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
