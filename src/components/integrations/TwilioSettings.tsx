import { useState, useEffect } from 'react';
import { 
  Phone, Copy, Check, AlertTriangle, Clock, PhoneForwarded, Bot, Voicemail, Loader2,
  TestTube2, CheckCircle2, XCircle, Bug, Activity, RefreshCw, Wifi, WifiOff
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type { Company, AIProfile } from '@/types';

interface TwilioConfig {
  record_calls: boolean;
  transcribe_calls: boolean;
  after_hours_action: 'voicemail' | 'forward';
  escalation_action: 'forward';
  debug_mode?: boolean;
}

interface TwilioSettingsProps {
  company: Company;
  onUpdate: () => void;
}

interface WebhookTestResult {
  success: boolean;
  status: 'matched_company' | 'no_match' | 'error' | 'pending';
  message: string;
  twimlResponse?: string;
  testCallSid?: string;
  extractedCallId?: string;
  actionUrls?: string[];
  timestamp: string;
}

// Phone number validation and normalization to E.164 format
const phoneRegex = /^\+[1-9]\d{6,14}$/;

// Normalize phone number to E.164 format
const normalizeToE164 = (phone: string): string => {
  if (!phone) return "";
  
  // Remove all non-digit characters except leading +
  let normalized = phone.replace(/[^\d+]/g, "");
  
  // Ensure it starts with +
  if (!normalized.startsWith("+")) {
    const digits = normalized.replace(/\D/g, "");
    // Assume US number if 10 digits
    if (digits.length === 10) {
      normalized = `+1${digits}`;
    } else if (digits.length === 11 && digits.startsWith("1")) {
      normalized = `+${digits}`;
    } else {
      normalized = `+${digits}`;
    }
  }
  
  return normalized;
};

export default function TwilioSettings({ company, onUpdate }: TwilioSettingsProps) {
  const [twilioNumber, setTwilioNumber] = useState(company.twilio_number || '');
  const [fallbackPhone, setFallbackPhone] = useState(company.fallback_phone || '');
  const [config, setConfig] = useState<TwilioConfig>({
    record_calls: true,
    transcribe_calls: true,
    after_hours_action: 'voicemail',
    escalation_action: 'forward',
    debug_mode: false,
  });
  const [aiProfile, setAiProfile] = useState<AIProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [checkingUnique, setCheckingUnique] = useState(false);
  
  // Webhook testing state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<WebhookTestResult | null>(null);
  const [showTwimlResponse, setShowTwimlResponse] = useState(false);
  
  // Connection status state
  const [connectionStatus, setConnectionStatus] = useState<{
    twilioConnected: boolean;
    numberConfigured: boolean;
    lastChecked: string | null;
  }>({
    twilioConnected: false,
    numberConfigured: false,
    lastChecked: null,
  });
  const [checkingConnection, setCheckingConnection] = useState(false);

  useEffect(() => {
    fetchAIProfile();
    fetchTwilioIntegration();
    checkConnectionStatus();
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
      .select('config_json, status')
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
        debug_mode: configData.debug_mode as boolean ?? false,
      });
    }
  };

  const checkConnectionStatus = async () => {
    setCheckingConnection(true);
    try {
      // Check if Twilio integration exists and is connected
      const { data: integration } = await supabase
        .from('integrations')
        .select('status')
        .eq('company_id', company.id)
        .eq('provider', 'twilio')
        .single();
      
      // Check if twilio_number is set on company
      const { data: companyData } = await supabase
        .from('companies')
        .select('twilio_number')
        .eq('id', company.id)
        .single();
      
      setConnectionStatus({
        twilioConnected: integration?.status === 'connected',
        numberConfigured: !!companyData?.twilio_number,
        lastChecked: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error checking connection status:', error);
    } finally {
      setCheckingConnection(false);
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
      // Normalize phone numbers to E.164 before saving
      const normalizedTwilioNumber = twilioNumber ? normalizeToE164(twilioNumber) : null;
      const normalizedFallbackPhone = fallbackPhone ? normalizeToE164(fallbackPhone) : null;

      // Update company with normalized twilio_number and fallback_phone
      const { error: companyError } = await supabase
        .from('companies')
        .update({
          twilio_number: normalizedTwilioNumber,
          fallback_phone: normalizedFallbackPhone,
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
        debug_mode: config.debug_mode,
      };
      
      if (existing) {
        await supabase
          .from('integrations')
          .update({ 
            config_json: configJson,
            status: normalizedTwilioNumber ? 'connected' : 'disconnected',
          })
          .eq('id', existing.id);
      } else {
        await supabase.from('integrations').insert([{
          company_id: company.id,
          provider: 'twilio',
          status: normalizedTwilioNumber ? 'connected' : 'disconnected',
          config_json: configJson,
        }]);
      }

      toast.success('Twilio settings saved successfully');
      onUpdate();
      checkConnectionStatus();
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

  const testWebhook = async () => {
    if (!twilioNumber) {
      toast.error('Please configure a Twilio number first');
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const normalizedNumber = normalizeToE164(twilioNumber);
      
      // Call the server-to-server test endpoint (avoids CORS issues)
      const { data, error } = await supabase.functions.invoke('twilio-webhook-test', {
        body: {
          companyId: company.id,
          twilioNumber: normalizedNumber,
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to invoke test function');
      }

      const result = data as {
        ok: boolean;
        status: 'matched_company' | 'no_match' | 'error';
        httpStatus?: number;
        twimlText?: string;
        testCallSid?: string;
        extractedCallId?: string;
        actionUrls?: string[];
        error?: string;
        timestamp: string;
      };

      setTestResult({
        success: result.ok,
        status: result.status,
        message: result.ok 
          ? 'Webhook is working! Company matched successfully.'
          : result.status === 'no_match'
            ? 'Webhook responded but company not matched. Check that your Twilio number is saved correctly.'
            : result.error || 'Webhook test failed',
        twimlResponse: result.twimlText,
        testCallSid: result.testCallSid,
        extractedCallId: result.extractedCallId,
        actionUrls: result.actionUrls,
        timestamp: result.timestamp,
      });

      if (result.ok) {
        toast.success('Webhook test passed!');
      } else if (result.status === 'no_match') {
        toast.warning('Webhook responded but company not matched');
      } else {
        toast.error('Webhook test failed');
      }
    } catch (error) {
      console.error('Webhook test error:', error);
      setTestResult({
        success: false,
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        timestamp: new Date().toISOString(),
      });
      toast.error('Failed to test webhook');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Connection Status Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Twilio Connection Status
          </CardTitle>
          <CardDescription>
            Real-time status of your Twilio integration
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {/* Integration Status */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              {connectionStatus.twilioConnected ? (
                <Wifi className="h-5 w-5 text-success" />
              ) : (
                <WifiOff className="h-5 w-5 text-muted-foreground" />
              )}
              <div>
                <p className="font-medium text-sm">Integration</p>
                <p className="text-xs text-muted-foreground">
                  {connectionStatus.twilioConnected ? 'Connected' : 'Not Connected'}
                </p>
              </div>
            </div>

            {/* Number Configured */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              {connectionStatus.numberConfigured ? (
                <CheckCircle2 className="h-5 w-5 text-success" />
              ) : (
                <XCircle className="h-5 w-5 text-muted-foreground" />
              )}
              <div>
                <p className="font-medium text-sm">Phone Number</p>
                <p className="text-xs text-muted-foreground">
                  {connectionStatus.numberConfigured ? 'Configured' : 'Not Set'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between mt-4 pt-4 border-t">
            <p className="text-xs text-muted-foreground">
              {connectionStatus.lastChecked 
                ? `Last checked: ${new Date(connectionStatus.lastChecked).toLocaleTimeString()}`
                : 'Never checked'}
            </p>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={checkConnectionStatus}
              disabled={checkingConnection}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${checkingConnection ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

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

      {/* Webhook Configuration & Testing */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TestTube2 className="h-5 w-5" />
            Webhook Configuration
          </CardTitle>
          <CardDescription>
            Configure and test your Twilio webhook URL
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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

          {/* Test Webhook */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Test Webhook Connection</Label>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={testWebhook}
                disabled={testing || !twilioNumber}
              >
                {testing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <TestTube2 className="h-4 w-4 mr-2" />
                )}
                Test Webhook
              </Button>
            </div>

            {testResult && (
              <div className={`p-4 rounded-lg border ${
                testResult.success 
                  ? 'bg-success-muted border-success/20' 
                  : 'bg-destructive/10 border-destructive/20'
              }`}>
                <div className="flex items-start gap-3">
                  {testResult.success ? (
                    <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className="font-medium text-sm">
                      {testResult.success ? 'Test Passed' : 'Test Failed'}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {testResult.message}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {new Date(testResult.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Show CallSid and extracted call_id */}
                {(testResult.testCallSid || testResult.extractedCallId) && (
                  <div className="mt-3 p-3 rounded bg-muted/50 space-y-2">
                    {testResult.testCallSid && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">Test CallSid:</span>
                        <code className="text-xs font-mono bg-background px-2 py-0.5 rounded">
                          {testResult.testCallSid}
                        </code>
                      </div>
                    )}
                    {testResult.extractedCallId && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">Extracted call_id:</span>
                        <code className="text-xs font-mono bg-background px-2 py-0.5 rounded">
                          {testResult.extractedCallId}
                        </code>
                        {testResult.extractedCallId === 'MISSING_CALLSID' && (
                          <Badge variant="destructive" className="text-xs">Missing</Badge>
                        )}
                      </div>
                    )}
                    {testResult.actionUrls && testResult.actionUrls.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-xs font-medium text-muted-foreground">Action URLs:</span>
                        {testResult.actionUrls.map((url, idx) => (
                          <code key={idx} className="block text-xs font-mono bg-background px-2 py-1 rounded break-all">
                            {url}
                          </code>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {testResult.twimlResponse && (
                  <Collapsible open={showTwimlResponse} onOpenChange={setShowTwimlResponse}>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="mt-3 w-full">
                        {showTwimlResponse ? 'Hide' : 'Show'} TwiML Response
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <ScrollArea className="h-48 mt-2">
                        <pre className="text-xs font-mono p-3 rounded bg-muted whitespace-pre-wrap">
                          {testResult.twimlResponse}
                        </pre>
                      </ScrollArea>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Debug Mode */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bug className="h-5 w-5" />
            Debug Mode
          </CardTitle>
          <CardDescription>
            Enable detailed logging for troubleshooting call issues
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable Call Debug Mode</Label>
              <p className="text-sm text-muted-foreground">
                Store full Twilio payloads and TwiML responses in audit logs
              </p>
            </div>
            <Switch
              checked={config.debug_mode}
              onCheckedChange={(checked) => setConfig({ ...config, debug_mode: checked })}
            />
          </div>

          {config.debug_mode && (
            <div className="p-3 rounded-lg bg-warning-muted border border-warning/20">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-warning-muted-foreground">Debug Mode Active</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Full webhook payloads and TwiML responses will be stored in the audit log. 
                    This may include sensitive caller information. Disable when not troubleshooting.
                  </p>
                </div>
              </div>
            </div>
          )}
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
                No fallback number configured. Escalations and after-hours forwards will go to voicemail instead.
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
