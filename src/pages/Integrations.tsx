import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Phone, Calendar, CreditCard, Scissors, Clock, Check, X, RefreshCw, Loader2, ExternalLink, Zap } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCompany } from '@/contexts/CompanyContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

import type { Json } from '@/integrations/supabase/types';

interface Integration {
  id: string;
  company_id: string;
  provider: string;
  status: string;
  config_json: Json;
  connected_at: string | null;
  last_sync_at: string | null;
}

interface ProviderConfig {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  color: string;
  fields: { key: string; label: string; placeholder: string; type?: string }[];
}

const providers: ProviderConfig[] = [
  {
    id: 'twilio',
    name: 'Twilio',
    description: 'Connect phone numbers for voice calls',
    icon: Phone,
    color: 'bg-red-500/10 text-red-600',
    fields: [
      { key: 'account_sid', label: 'Account SID', placeholder: 'ACxxxxxxxxxx' },
      { key: 'auth_token', label: 'Auth Token', placeholder: 'Your auth token', type: 'password' },
    ],
  },
  {
    id: 'calendly',
    name: 'Calendly',
    description: 'Sync your booking calendar',
    icon: Calendar,
    color: 'bg-blue-500/10 text-blue-600',
    fields: [
      { key: 'api_key', label: 'API Key', placeholder: 'Your Calendly API key', type: 'password' },
    ],
  },
  {
    id: 'square',
    name: 'Square Appointments',
    description: 'Manage appointments via Square',
    icon: Clock,
    color: 'bg-green-500/10 text-green-600',
    fields: [
      { key: 'access_token', label: 'Access Token', placeholder: 'Your Square access token', type: 'password' },
    ],
  },
  {
    id: 'fresha',
    name: 'Fresha',
    description: 'Beauty & wellness booking',
    icon: Scissors,
    color: 'bg-pink-500/10 text-pink-600',
    fields: [
      { key: 'api_key', label: 'API Key', placeholder: 'Your Fresha API key', type: 'password' },
      { key: 'partner_id', label: 'Partner ID', placeholder: 'Your partner ID' },
    ],
  },
  {
    id: 'google_calendar',
    name: 'Google Calendar',
    description: 'Connect Google Calendar',
    icon: Calendar,
    color: 'bg-yellow-500/10 text-yellow-600',
    fields: [
      { key: 'client_id', label: 'Client ID', placeholder: 'OAuth Client ID' },
      { key: 'client_secret', label: 'Client Secret', placeholder: 'OAuth Client Secret', type: 'password' },
    ],
  },
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Accept payments and invoices',
    icon: CreditCard,
    color: 'bg-purple-500/10 text-purple-600',
    fields: [
      { key: 'secret_key', label: 'Secret Key', placeholder: 'sk_live_xxxx or sk_test_xxxx', type: 'password' },
    ],
  },
];

export default function Integrations() {
  const { currentCompany } = useCompany();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ProviderConfig | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (currentCompany) {
      fetchIntegrations();
    }
  }, [currentCompany]);

  const fetchIntegrations = async () => {
    if (!currentCompany) return;
    
    setLoading(true);
    const { data, error } = await supabase
      .from('integrations')
      .select('*')
      .eq('company_id', currentCompany.id);

    if (error) {
      console.error('Error fetching integrations:', error);
      toast.error('Failed to load integrations');
    } else {
      setIntegrations(data || []);
    }
    setLoading(false);
  };

  const getIntegrationStatus = (providerId: string) => {
    return integrations.find(i => i.provider === providerId);
  };

  const openConnectDialog = (provider: ProviderConfig) => {
    setSelectedProvider(provider);
    setCredentials({});
    setConnectDialogOpen(true);
  };

  const handleConnect = async () => {
    if (!selectedProvider || !currentCompany) return;

    // Validate all fields are filled
    const missingFields = selectedProvider.fields.filter(f => !credentials[f.key]);
    if (missingFields.length > 0) {
      toast.error(`Please fill in: ${missingFields.map(f => f.label).join(', ')}`);
      return;
    }

    setActionLoading('connect');

    try {
      const { data, error } = await supabase.functions.invoke('integrations', {
        body: {
          action: 'connect',
          company_id: currentCompany.id,
          provider: selectedProvider.id,
          credentials,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(data.message || 'Connected successfully');
      setConnectDialogOpen(false);
      fetchIntegrations();
    } catch (err) {
      console.error('Connect error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to connect');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDisconnect = async (provider: ProviderConfig) => {
    if (!currentCompany) return;

    setActionLoading(`disconnect-${provider.id}`);

    try {
      const { data, error } = await supabase.functions.invoke('integrations', {
        body: {
          action: 'disconnect',
          company_id: currentCompany.id,
          provider: provider.id,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(data.message || 'Disconnected successfully');
      fetchIntegrations();
    } catch (err) {
      console.error('Disconnect error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to disconnect');
    } finally {
      setActionLoading(null);
    }
  };

  const handleTest = async (provider: ProviderConfig) => {
    if (!currentCompany) return;

    setActionLoading(`test-${provider.id}`);

    try {
      const { data, error } = await supabase.functions.invoke('integrations', {
        body: {
          action: 'test',
          company_id: currentCompany.id,
          provider: provider.id,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(data.message || 'Connection verified');
      fetchIntegrations();
    } catch (err) {
      console.error('Test error:', err);
      toast.error(err instanceof Error ? err.message : 'Connection test failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSync = async (provider: ProviderConfig) => {
    if (!currentCompany) return;

    setActionLoading(`sync-${provider.id}`);

    try {
      const { data, error } = await supabase.functions.invoke('integrations', {
        body: {
          action: 'sync',
          company_id: currentCompany.id,
          provider: provider.id,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(data.message || 'Synced successfully');
      fetchIntegrations();
    } catch (err) {
      console.error('Sync error:', err);
      toast.error(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setActionLoading(null);
    }
  };

  if (!currentCompany) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold">Integrations</h1>
          <p className="text-muted-foreground">Connect your favorite tools</p>
        </div>
        <Card className="p-12 text-center">
          <Zap className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Select a company to manage integrations</p>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold">Integrations</h1>
        <p className="text-muted-foreground">Connect your favorite tools for {currentCompany.name}</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {providers.map((provider) => {
            const integration = getIntegrationStatus(provider.id);
            const isConnected = integration?.status === 'connected';
            const Icon = provider.icon;

            return (
              <Card key={provider.id} className="relative overflow-hidden">
                <CardHeader className="flex flex-row items-start gap-4 pb-3">
                  <div className={`h-12 w-12 rounded-lg ${provider.color} flex items-center justify-center shrink-0`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg">{provider.name}</CardTitle>
                      {isConnected ? (
                        <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-200">
                          <Check className="h-3 w-3 mr-1" />
                          Connected
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          <X className="h-3 w-3 mr-1" />
                          Disconnected
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="mt-1">{provider.description}</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {isConnected && integration && (
                    <div className="text-xs text-muted-foreground space-y-1">
                      {integration.connected_at && (
                        <p>Connected {formatDistanceToNow(new Date(integration.connected_at), { addSuffix: true })}</p>
                      )}
                      {integration.last_sync_at && (
                        <p>Last sync {formatDistanceToNow(new Date(integration.last_sync_at), { addSuffix: true })}</p>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {isConnected ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleTest(provider)}
                          disabled={actionLoading === `test-${provider.id}`}
                        >
                          {actionLoading === `test-${provider.id}` ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4 mr-1" />
                          )}
                          Test
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSync(provider)}
                          disabled={actionLoading === `sync-${provider.id}`}
                        >
                          {actionLoading === `sync-${provider.id}` ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4 mr-1" />
                          )}
                          Sync
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDisconnect(provider)}
                          disabled={actionLoading === `disconnect-${provider.id}`}
                        >
                          {actionLoading === `disconnect-${provider.id}` ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            'Disconnect'
                          )}
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        className="w-full gap-2"
                        onClick={() => openConnectDialog(provider)}
                      >
                        <ExternalLink className="h-4 w-4" /> Connect
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Connect Dialog */}
      <Dialog open={connectDialogOpen} onOpenChange={setConnectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedProvider && (
                <>
                  <selectedProvider.icon className="h-5 w-5" />
                  Connect {selectedProvider.name}
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              Enter your credentials to connect. These will be stored securely server-side.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {selectedProvider?.fields.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={field.key}>{field.label}</Label>
                <Input
                  id={field.key}
                  type={field.type || 'text'}
                  placeholder={field.placeholder}
                  value={credentials[field.key] || ''}
                  onChange={(e) => setCredentials({ ...credentials, [field.key]: e.target.value })}
                />
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConnectDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConnect} disabled={actionLoading === 'connect'}>
              {actionLoading === 'connect' ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
