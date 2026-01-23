import { useState, useEffect } from 'react';
import { Phone, Copy, Check, AlertTriangle, Clock, PhoneForwarded, Bot, Voicemail, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type { Company, AIProfile } from '@/types';

interface TwilioConfig {
  record_calls: boolean;
  transcribe_calls: boolean;
  after_hours_action: 'voicemail' | 'forward';
  escalation_action: 'forward';
}

interface TwilioSettingsProps {
  company: Company;
  onUpdate: () => void;
}

// Phone number validation regex for E.164 format
const phoneRegex = /^\+[1-9]\d{1,14}$/;

export default function TwilioSettings({ company, onUpdate }: TwilioSettingsProps) {
  const [twilioNumber, setTwilioNumber] = useState(company.twilio_number || '');
  const [fallbackPhone, setFallbackPhone] = useState(company.fallback_phone || '');
  const [config, setConfig] = useState<TwilioConfig>({
    record_calls: true,
    transcribe_calls: true,
    after_hours_action: 'voicemail',
    escalation_action: 'forward',
  });
  const [aiProfile, setAiProfile] = useState<AIProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [checkingUnique, setCheckingUnique] = useState(false);

  useEffect(() => {
    fetchAIProfile();
    fetchTwilioIntegration();
  }, [company.id]);

  const fetchAIProfile = async () => {
    const { data } = await supabase
      .from('ai_profiles')
      .select('*')
      .eq('company_id', company.id)
      .single();
    
    if (data) {
      setAiProfile(data as unknown as AIProfile);
    }
  };

  const fetchTwilioIntegration = async () => {
    const { data } = await supabase
      .from('integrations')
      .select('config_json')
      .eq('company_id', company.id)
      .eq('provider', 'twilio')
      .single();
    
    if (data?.config_json && typeof data.config_json === 'object') {
      const configData = data.config_json as Record<string, unknown>;
      setConfig({
        record_calls: configData.record_calls as boolean ?? true,
        transcribe_calls: configData.transcribe_calls as boolean ?? true,
        after_hours_action: (configData.after_hours_action as 'voicemail' | 'forward') || 'voicemail',
        escalation_action: 'forward',
      });
    }
  };

  const validatePhoneNumber = (phone: string): boolean => {
    if (!phone) return true; // Allow empty
    return phoneRegex.test(phone);
  };

  const checkTwilioNumberUnique = async (number: string): Promise<boolean> => {
    if (!number) return true;
    
    const { data, error } = await supabase
      .from('companies')
      .select('id')
      .eq('twilio_number', number)
      .neq('id', company.id);
    
    if (error) {
      console.error('Error checking uniqueness:', error);
      return false;
    }
    
    return !data || data.length === 0;
  };

  const validateFields = async (): Promise<boolean> => {
    const errors: Record<string, string> = {};
    
    if (twilioNumber && !validatePhoneNumber(twilioNumber)) {
      errors.twilioNumber = 'Must be in E.164 format (e.g., +14155551234)';
    }
    
    if (fallbackPhone && !validatePhoneNumber(fallbackPhone)) {
      errors.fallbackPhone = 'Must be in E.164 format (e.g., +14155551234)';
    }

    if (twilioNumber) {
      setCheckingUnique(true);
      const isUnique = await checkTwilioNumberUnique(twilioNumber);
      setCheckingUnique(false);
      
      if (!isUnique) {
        errors.twilioNumber = 'This Twilio number is already assigned to another company';
      }
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    const isValid = await validateFields();
    if (!isValid) {
      toast.error('Please fix validation errors before saving');
      return;
    }

    setSaving(true);

    try {
      // Update company with twilio_number and fallback_phone
      const { error: companyError } = await supabase
        .from('companies')
        .update({
          twilio_number: twilioNumber || null,
          fallback_phone: fallbackPhone || null,
        })
        .eq('id', company.id);

      if (companyError) throw companyError;

      // Update or create integration config
      const { data: existing } = await supabase
        .from('integrations')
        .select('id')
        .eq('company_id', company.id)
        .eq('provider', 'twilio')
        .single();

      const configJson: Json = {
        record_calls: config.record_calls,
        transcribe_calls: config.transcribe_calls,
        after_hours_action: config.after_hours_action,
        escalation_action: config.escalation_action,
      };
      
      if (existing) {
        await supabase
          .from('integrations')
          .update({ config_json: configJson })
          .eq('id', existing.id);
      } else {
        await supabase.from('integrations').insert([{
          company_id: company.id,
          provider: 'twilio',
          status: 'disconnected',
          config_json: configJson,
        }]);
      }

      toast.success('Twilio settings saved successfully');
      onUpdate();
    } catch (err) {
      console.error('Error saving settings:', err);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const generateWebhookUrl = () => {
    const baseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co';
    return `${baseUrl}/functions/v1/twilio-voice-inbound`;
  };

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(generateWebhookUrl());
    setCopied(true);
    toast.success('Webhook URL copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Phone Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Phone Configuration
          </CardTitle>
          <CardDescription>
            Configure your Twilio phone number and call routing settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Twilio Number */}
          <div className="space-y-2">
            <Label htmlFor="twilio_number">Twilio Phone Number</Label>
            <Input
              id="twilio_number"
              placeholder="+14155551234"
              value={twilioNumber}
              onChange={(e) => setTwilioNumber(e.target.value)}
              className={validationErrors.twilioNumber ? 'border-destructive' : ''}
            />
            {validationErrors.twilioNumber && (
              <p className="text-sm text-destructive">{validationErrors.twilioNumber}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Must be in E.164 format. This number will be unique to your company.
            </p>
          </div>

          {/* Fallback Phone */}
          <div className="space-y-2">
            <Label htmlFor="fallback_phone">Fallback Phone Number</Label>
            <Input
              id="fallback_phone"
              placeholder="+14155559999"
              value={fallbackPhone}
              onChange={(e) => setFallbackPhone(e.target.value)}
              className={validationErrors.fallbackPhone ? 'border-destructive' : ''}
            />
            {validationErrors.fallbackPhone && (
              <p className="text-sm text-destructive">{validationErrors.fallbackPhone}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Calls will be forwarded here during escalation or after-hours (if configured)
            </p>
          </div>

          {/* Webhook URL */}
          <div className="space-y-2">
            <Label>Webhook URL</Label>
            <div className="flex gap-2">
              <Input
                value={generateWebhookUrl()}
                readOnly
                className="font-mono text-sm bg-muted"
              />
              <Button variant="outline" size="icon" onClick={copyWebhookUrl}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Configure this URL in your Twilio console for incoming calls
            </p>
          </div>

          <Separator />

          {/* Call Recording Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Record Calls</Label>
              <p className="text-sm text-muted-foreground">
                Store call recordings for quality assurance
              </p>
            </div>
            <Switch
              checked={config.record_calls}
              onCheckedChange={(checked) => setConfig({ ...config, record_calls: checked })}
            />
          </div>

          {/* Transcription Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Transcribe Calls</Label>
              <p className="text-sm text-muted-foreground">
                Automatically generate text transcripts
              </p>
            </div>
            <Switch
              checked={config.transcribe_calls}
              onCheckedChange={(checked) => setConfig({ ...config, transcribe_calls: checked })}
            />
          </div>

          <Separator />

          {/* After Hours Action */}
          <div className="space-y-3">
            <Label>After Hours Behavior</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setConfig({ ...config, after_hours_action: 'voicemail' })}
                className={`p-4 rounded-lg border-2 text-left transition-colors ${
                  config.after_hours_action === 'voicemail'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground'
                }`}
              >
                <Voicemail className="h-5 w-5 mb-2" />
                <p className="font-medium">Play Script + Voicemail</p>
                <p className="text-xs text-muted-foreground">
                  Play after-hours message and take a voicemail
                </p>
              </button>
              <button
                type="button"
                onClick={() => setConfig({ ...config, after_hours_action: 'forward' })}
                className={`p-4 rounded-lg border-2 text-left transition-colors ${
                  config.after_hours_action === 'forward'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground'
                }`}
              >
                <PhoneForwarded className="h-5 w-5 mb-2" />
                <p className="font-medium">Forward to Fallback</p>
                <p className="text-xs text-muted-foreground">
                  Forward calls directly to fallback number
                </p>
              </button>
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving || checkingUnique} className="w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save Settings
          </Button>
        </CardContent>
      </Card>

      {/* Call Routing Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PhoneForwarded className="h-5 w-5" />
            Call Routing Preview
          </CardTitle>
          <CardDescription>
            Visual overview of how calls will be handled
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* During Business Hours */}
          <div className="flex items-start gap-4 p-4 rounded-lg bg-success-muted border border-success/20">
            <div className="h-10 w-10 rounded-full bg-success/20 flex items-center justify-center shrink-0">
              <Clock className="h-5 w-5 text-success" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <p className="font-medium">During Business Hours</p>
                <Badge variant="outline" className="bg-success-muted text-success-muted-foreground border-success/20">
                  Active
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Bot className="h-4 w-4" />
                <span>AI Receptionist handles all calls</span>
              </div>
              {aiProfile && (
                <div className="mt-2 p-2 rounded bg-muted text-xs font-mono line-clamp-2">
                  "{aiProfile.greeting_script || 'Hello! Thank you for calling...'}"
                </div>
              )}
            </div>
          </div>

          {/* After Hours */}
          <div className="flex items-start gap-4 p-4 rounded-lg bg-warning-muted border border-warning/20">
            <div className="h-10 w-10 rounded-full bg-warning/20 flex items-center justify-center shrink-0">
              <Clock className="h-5 w-5 text-warning" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <p className="font-medium">After Hours</p>
                <Badge variant="outline" className="bg-warning-muted text-warning-muted-foreground border-warning/20">
                  {config.after_hours_action === 'voicemail' ? 'Voicemail' : 'Forward'}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {config.after_hours_action === 'voicemail' ? (
                  <>
                    <Voicemail className="h-4 w-4" />
                    <span>Play after-hours script → Take voicemail</span>
                  </>
                ) : (
                  <>
                    <PhoneForwarded className="h-4 w-4" />
                    <span>Forward to {fallbackPhone || 'fallback number'}</span>
                  </>
                )}
              </div>
              {config.after_hours_action === 'voicemail' && aiProfile && (
                <div className="mt-2 p-2 rounded bg-muted text-xs font-mono line-clamp-2">
                  "{aiProfile.after_hours_script || 'We are currently closed...'}"
                </div>
              )}
            </div>
          </div>

          {/* Escalation */}
          <div className="flex items-start gap-4 p-4 rounded-lg bg-danger-muted border border-danger/20">
            <div className="h-10 w-10 rounded-full bg-danger/20 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5 text-danger" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <p className="font-medium">Escalation Required</p>
                <Badge variant="outline" className="bg-danger-muted text-danger-muted-foreground border-danger/20">
                  Forward
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <PhoneForwarded className="h-4 w-4" />
                <span>Forward to {fallbackPhone || '(set fallback number)'}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Triggered when caller requests human, AI confidence is low, or complaint detected
              </p>
            </div>
          </div>

          {!fallbackPhone && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-warning-muted border border-warning/20 text-sm">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
              <span className="text-warning-muted-foreground">
                Set a fallback phone number to enable call forwarding for escalations
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
