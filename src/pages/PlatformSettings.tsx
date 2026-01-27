import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, RotateCcw, Shield, AlertTriangle } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const DEFAULT_CORE_PROMPT = `You are an AI receptionist. Your role is strictly business-focused: answer questions about the company's services, handle booking requests, and provide information from the knowledge base.

RULES:
1) Never discuss topics outside the business scope - politely redirect off-topic conversations.
2) Never invent or hallucinate prices, services, or availability - only use information from the knowledge base.
3) Never confirm a booking until the backend system confirms success.
4) Always be professional, concise, and helpful.`;

interface PlatformSettings {
  id: number;
  core_prompt: string;
  core_prompt_version: string;
  updated_at: string;
}

export default function PlatformSettings() {
  const { isAgencyAdmin, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [corePrompt, setCorePrompt] = useState('');
  const [promptVersion, setPromptVersion] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('platform_settings')
        .select('*')
        .eq('id', 1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        // Cast data to our interface since types may not be updated yet
        const typedData = data as unknown as PlatformSettings;
        setSettings(typedData);
        setCorePrompt(typedData.core_prompt);
        setPromptVersion(typedData.core_prompt_version);
      } else {
        // Initialize with defaults
        setCorePrompt(DEFAULT_CORE_PROMPT);
        setPromptVersion('1.0.0');
      }
    } catch (error) {
      console.error('Error fetching platform settings:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load platform settings.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('platform_settings')
        .upsert({
          id: 1,
          core_prompt: corePrompt,
          core_prompt_version: promptVersion,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      toast({
        title: 'Saved',
        description: 'Platform settings updated successfully.',
      });
      
      // Refresh data
      await fetchSettings();
    } catch (error) {
      console.error('Error saving platform settings:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to save platform settings.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('platform_settings')
        .upsert({
          id: 1,
          core_prompt: DEFAULT_CORE_PROMPT,
          core_prompt_version: '1.0.0',
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      setCorePrompt(DEFAULT_CORE_PROMPT);
      setPromptVersion('1.0.0');

      toast({
        title: 'Reset',
        description: 'Core prompt reset to default.',
      });
      
      await fetchSettings();
    } catch (error) {
      console.error('Error resetting platform settings:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to reset platform settings.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Redirect non-admins
  if (!authLoading && !isAgencyAdmin) {
    return <Navigate to="/agency" replace />;
  }

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasChanges = settings 
    ? (corePrompt !== settings.core_prompt || promptVersion !== settings.core_prompt_version)
    : (corePrompt !== DEFAULT_CORE_PROMPT || promptVersion !== '1.0.0');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Platform Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure global settings that apply to all companies. Dev access only.
        </p>
      </div>

      <Card className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <CardTitle className="text-amber-800 dark:text-amber-300">Developer-Only Access</CardTitle>
          </div>
          <CardDescription>
            Changes here affect ALL companies. The Core Prompt is prepended to every company's AI profile
            and cannot be edited by company users.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Core Prompt</CardTitle>
          <CardDescription>
            This prompt is always prepended to every company's system prompt. Use it to enforce
            global rules like business-only scope, no hallucination, and booking confirmation requirements.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="version">Version</Label>
            <Input
              id="version"
              value={promptVersion}
              onChange={(e) => setPromptVersion(e.target.value)}
              placeholder="e.g., 1.0.0"
              className="max-w-xs"
            />
            {settings && (
              <p className="text-xs text-muted-foreground">
                Last updated: {new Date(settings.updated_at).toLocaleString()}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="corePrompt">Core Prompt Content</Label>
            <Textarea
              id="corePrompt"
              value={corePrompt}
              onChange={(e) => setCorePrompt(e.target.value)}
              placeholder="Enter the core prompt..."
              className="min-h-[300px] font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {corePrompt.length} characters
            </p>
          </div>

          <div className="flex items-center gap-3 pt-4">
            <Button 
              onClick={handleSave} 
              disabled={isSaving || !hasChanges}
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Changes
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={isSaving}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset to Default
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    Reset Core Prompt?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This will replace the current core prompt with the default version.
                    All companies will be affected on their next call.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleReset}>
                    Reset to Default
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {hasChanges && (
              <span className="text-sm text-amber-600 dark:text-amber-400">
                Unsaved changes
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
