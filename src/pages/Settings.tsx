import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { AlertTriangle, Phone, Shield, Bell, User, Save, Clock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CompanyHoursEditor } from '@/components/company/CompanyHoursEditor';

interface AISettings {
  ai_enabled: boolean;
  disclosure_required: boolean;
}

export default function Settings() {
  const { profile } = useAuth();
  const { currentCompany, refetchCompanies } = useCompany();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [disclosureRequired, setDisclosureRequired] = useState(true);
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [showPanicConfirm, setShowPanicConfirm] = useState(false);

  useEffect(() => {
    if (currentCompany) {
      fetchSettings();
    }
  }, [currentCompany]);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
    }
  }, [profile]);

  const fetchSettings = async () => {
    if (!currentCompany) return;
    setIsLoading(true);
    try {
      // Fetch company settings
      const { data: company } = await supabase
        .from('companies')
        .select('ai_enabled')
        .eq('id', currentCompany.id)
        .single();

      // Fetch AI profile settings
      const { data: aiProfile } = await supabase
        .from('ai_profiles')
        .select('disclosure_required')
        .eq('company_id', currentCompany.id)
        .single();

      if (company) {
        setAiEnabled(company.ai_enabled !== false);
      }
      if (aiProfile) {
        setDisclosureRequired(aiProfile.disclosure_required !== false);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePanicSwitch = async (enabled: boolean) => {
    if (!currentCompany) return;
    
    if (!enabled && !showPanicConfirm) {
      setShowPanicConfirm(true);
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('companies')
        .update({ ai_enabled: enabled })
        .eq('id', currentCompany.id);

      if (error) throw error;

      setAiEnabled(enabled);
      setShowPanicConfirm(false);
      
      if (!enabled) {
        toast.warning('AI Disabled', {
          description: 'All calls will now be forwarded to your fallback phone number.',
        });
      } else {
        toast.success('AI Enabled', {
          description: 'AI receptionist is now active.',
        });
      }
      refetchCompanies();
    } catch (error) {
      console.error('Error updating AI status:', error);
      toast.error('Failed to update AI status');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDisclosureToggle = async (required: boolean) => {
    if (!currentCompany) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('ai_profiles')
        .update({ disclosure_required: required })
        .eq('company_id', currentCompany.id);

      if (error) throw error;

      setDisclosureRequired(required);
      toast.success('Disclosure setting updated');
    } catch (error) {
      console.error('Error updating disclosure setting:', error);
      toast.error('Failed to update disclosure setting');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!profile) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName })
        .eq('id', profile.id);

      if (error) throw error;

      toast.success('Profile updated');
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-display font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account and company settings</p>
      </div>

      {/* Panic Switch Card */}
      {currentCompany && (
        <Card className={!aiEnabled ? 'border-destructive bg-destructive/5' : ''}>
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className={`h-5 w-5 ${!aiEnabled ? 'text-destructive' : 'text-warning'}`} />
              <CardTitle>AI Panic Switch</CardTitle>
            </div>
            <CardDescription>
              Instantly disable AI for all incoming calls. Calls will be forwarded to your fallback phone.
            </CardDescription>
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
                onCheckedChange={handlePanicSwitch}
                disabled={isSaving || isLoading}
              />
            </div>

            {showPanicConfirm && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="flex items-center justify-between">
                  <span>Are you sure? All calls will be forwarded to fallback phone.</span>
                  <div className="flex gap-2 ml-4">
                    <Button size="sm" variant="outline" onClick={() => setShowPanicConfirm(false)}>
                      Cancel
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handlePanicSwitch(false)}>
                      Disable AI
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {!aiEnabled && currentCompany.fallback_phone && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="h-4 w-4" />
                <span>Calls forwarding to: {currentCompany.fallback_phone}</span>
              </div>
            )}

            {!aiEnabled && !currentCompany.fallback_phone && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  No fallback phone configured! Calls will go to voicemail. Configure a fallback phone in Integrations.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* AI Disclosure Settings */}
      {currentCompany && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <CardTitle>AI Disclosure</CardTitle>
            </div>
            <CardDescription>
              Configure whether callers are informed they're speaking with an AI assistant.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base font-medium">Require AI Disclosure</Label>
                <p className="text-sm text-muted-foreground">
                  {disclosureRequired 
                    ? 'Callers are informed they are speaking with an AI' 
                    : 'No AI disclosure is played to callers'}
                </p>
              </div>
              <Switch
                checked={disclosureRequired}
                onCheckedChange={handleDisclosureToggle}
                disabled={isSaving || isLoading}
              />
            </div>

            {!disclosureRequired && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Warning: Some jurisdictions require AI disclosure. Check your local regulations.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Business Hours */}
      {currentCompany && (
        <CompanyHoursEditor companyId={currentCompany.id} />
      )}

      <Separator />

      {/* Profile Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            <CardTitle>Profile</CardTitle>
          </div>
          <CardDescription>Update your personal information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Enter your full name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={profile?.email || ''} disabled className="bg-muted" />
            <p className="text-xs text-muted-foreground">Email cannot be changed</p>
          </div>
          <Button onClick={handleSaveProfile} disabled={isSaving} className="bg-accent hover:bg-accent/90">
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
        </CardContent>
      </Card>

      {/* Notification Settings Placeholder */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <CardTitle>Notifications</CardTitle>
          </div>
          <CardDescription>Configure how you receive alerts and updates</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base font-medium">Email Notifications</Label>
              <p className="text-sm text-muted-foreground">Receive email alerts for important events</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base font-medium">Usage Alerts</Label>
              <p className="text-sm text-muted-foreground">Get notified when approaching usage limits</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base font-medium">Weekly Summary</Label>
              <p className="text-sm text-muted-foreground">Receive weekly call analytics digest</p>
            </div>
            <Switch />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
