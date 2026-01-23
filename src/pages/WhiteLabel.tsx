import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { Palette, Image, Type, Globe, Save, Eye } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useCompany } from '@/contexts/CompanyContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface WhiteLabelSettings {
  id?: string;
  company_id: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  assistant_name: string;
  custom_domain: string | null;
  is_enabled: boolean;
}

export default function WhiteLabel() {
  const { currentCompany } = useCompany();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [settings, setSettings] = useState<WhiteLabelSettings>({
    company_id: '',
    logo_url: null,
    primary_color: '#8B5CF6',
    secondary_color: '#0EA5E9',
    assistant_name: 'AI Assistant',
    custom_domain: null,
    is_enabled: false,
  });

  useEffect(() => {
    if (currentCompany) {
      fetchSettings();
    }
  }, [currentCompany]);

  const fetchSettings = async () => {
    if (!currentCompany) return;
    setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from('white_label_settings')
        .select('*')
        .eq('company_id', currentCompany.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setSettings(data as WhiteLabelSettings);
      } else {
        setSettings(prev => ({ ...prev, company_id: currentCompany.id }));
      }
    } catch (error) {
      console.error('Error fetching white-label settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!currentCompany) return;
    setIsSaving(true);

    try {
      if (settings.id) {
        const { error } = await supabase
          .from('white_label_settings')
          .update({
            logo_url: settings.logo_url,
            primary_color: settings.primary_color,
            secondary_color: settings.secondary_color,
            assistant_name: settings.assistant_name,
            custom_domain: settings.custom_domain,
            is_enabled: settings.is_enabled,
          })
          .eq('id', settings.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('white_label_settings')
          .insert({
            company_id: currentCompany.id,
            logo_url: settings.logo_url,
            primary_color: settings.primary_color,
            secondary_color: settings.secondary_color,
            assistant_name: settings.assistant_name,
            custom_domain: settings.custom_domain,
            is_enabled: settings.is_enabled,
          })
          .select()
          .single();

        if (error) throw error;
        setSettings(data as WhiteLabelSettings);
      }

      toast.success('White-label settings saved');
    } catch (error) {
      console.error('Error saving white-label settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // For now, just use a data URL - in production, upload to storage
    const reader = new FileReader();
    reader.onloadend = () => {
      setSettings(prev => ({ ...prev, logo_url: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  if (!currentCompany) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Select a company to configure white-label settings</p>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">White Label Settings</h1>
          <p className="text-muted-foreground">Customize branding for your company</p>
        </div>
        <Button onClick={handleSave} disabled={isSaving} className="bg-accent hover:bg-accent/90">
          <Save className="h-4 w-4 mr-2" />
          Save Changes
        </Button>
      </div>

      {/* Enable Toggle */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>White Label Mode</CardTitle>
              <CardDescription>Enable custom branding for this company</CardDescription>
            </div>
            <Switch
              checked={settings.is_enabled}
              onCheckedChange={(checked) => setSettings(prev => ({ ...prev, is_enabled: checked }))}
            />
          </div>
        </CardHeader>
      </Card>

      <div className={`space-y-6 ${!settings.is_enabled ? 'opacity-50 pointer-events-none' : ''}`}>
        {/* Logo */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Image className="h-5 w-5 text-primary" />
              <CardTitle>Logo</CardTitle>
            </div>
            <CardDescription>Upload your company logo</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-6">
              <div className="w-32 h-32 border-2 border-dashed rounded-lg flex items-center justify-center bg-muted/50 overflow-hidden">
                {settings.logo_url ? (
                  <img src={settings.logo_url} alt="Logo" className="max-w-full max-h-full object-contain" />
                ) : (
                  <Image className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="space-y-2">
                <Input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="max-w-xs"
                />
                <p className="text-xs text-muted-foreground">
                  Recommended: 512x512px, PNG or SVG
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="logo_url">Or enter logo URL</Label>
              <Input
                id="logo_url"
                value={settings.logo_url || ''}
                onChange={(e) => setSettings(prev => ({ ...prev, logo_url: e.target.value }))}
                placeholder="https://example.com/logo.png"
              />
            </div>
          </CardContent>
        </Card>

        {/* Colors */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Palette className="h-5 w-5 text-primary" />
              <CardTitle>Brand Colors</CardTitle>
            </div>
            <CardDescription>Customize the color scheme</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="primary_color">Primary Color</Label>
                <div className="flex gap-3">
                  <div 
                    className="w-12 h-10 rounded-md border cursor-pointer"
                    style={{ backgroundColor: settings.primary_color }}
                  >
                    <input
                      type="color"
                      value={settings.primary_color}
                      onChange={(e) => setSettings(prev => ({ ...prev, primary_color: e.target.value }))}
                      className="w-full h-full opacity-0 cursor-pointer"
                    />
                  </div>
                  <Input
                    id="primary_color"
                    value={settings.primary_color}
                    onChange={(e) => setSettings(prev => ({ ...prev, primary_color: e.target.value }))}
                    className="flex-1"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="secondary_color">Secondary Color</Label>
                <div className="flex gap-3">
                  <div 
                    className="w-12 h-10 rounded-md border cursor-pointer"
                    style={{ backgroundColor: settings.secondary_color }}
                  >
                    <input
                      type="color"
                      value={settings.secondary_color}
                      onChange={(e) => setSettings(prev => ({ ...prev, secondary_color: e.target.value }))}
                      className="w-full h-full opacity-0 cursor-pointer"
                    />
                  </div>
                  <Input
                    id="secondary_color"
                    value={settings.secondary_color}
                    onChange={(e) => setSettings(prev => ({ ...prev, secondary_color: e.target.value }))}
                    className="flex-1"
                  />
                </div>
              </div>
            </div>

            {/* Color Preview */}
            <div className="p-4 rounded-lg border mt-4">
              <p className="text-sm text-muted-foreground mb-3">Preview</p>
              <div className="flex gap-3">
                <Button style={{ backgroundColor: settings.primary_color }}>
                  Primary Button
                </Button>
                <Button variant="outline" style={{ borderColor: settings.secondary_color, color: settings.secondary_color }}>
                  Secondary Button
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Assistant Name */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Type className="h-5 w-5 text-primary" />
              <CardTitle>Assistant Name</CardTitle>
            </div>
            <CardDescription>Customize how the AI introduces itself</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="assistant_name">Name</Label>
              <Input
                id="assistant_name"
                value={settings.assistant_name}
                onChange={(e) => setSettings(prev => ({ ...prev, assistant_name: e.target.value }))}
                placeholder="AI Assistant"
              />
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm italic">
                "Hello! This is {settings.assistant_name} from {currentCompany.name}. How may I help you today?"
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Custom Domain */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              <CardTitle>Custom Domain</CardTitle>
            </div>
            <CardDescription>Use your own domain for the customer portal</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="custom_domain">Domain</Label>
              <Input
                id="custom_domain"
                value={settings.custom_domain || ''}
                onChange={(e) => setSettings(prev => ({ ...prev, custom_domain: e.target.value }))}
                placeholder="portal.yourdomain.com"
              />
            </div>
            <div className="bg-muted/50 p-4 rounded-lg space-y-2">
              <p className="text-sm font-medium">DNS Configuration Required</p>
              <p className="text-xs text-muted-foreground">
                Add a CNAME record pointing to: <code className="bg-muted px-1 py-0.5 rounded">custom.aiphone.app</code>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Preview Button */}
      {settings.is_enabled && (
        <Card className="bg-gradient-to-r from-primary/10 to-accent/10 border-primary/20">
          <CardContent className="py-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Preview White Label</h3>
                <p className="text-sm text-muted-foreground">See how your branding looks to customers</p>
              </div>
              <Button variant="outline">
                <Eye className="h-4 w-4 mr-2" />
                Open Preview
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}
