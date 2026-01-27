import { useNavigate } from 'react-router-dom';
import { Clock, BookOpen, Briefcase, Phone, Power, PowerOff, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useState } from 'react';

interface QuickActionsProps {
  companyId: string;
  aiEnabled: boolean;
  onAiToggle: () => void;
}

export function QuickActions({ companyId, aiEnabled, onAiToggle }: QuickActionsProps) {
  const navigate = useNavigate();
  const [isToggling, setIsToggling] = useState(false);

  const handleAiToggle = async () => {
    setIsToggling(true);
    const { error } = await supabase
      .from('companies')
      .update({ ai_enabled: !aiEnabled })
      .eq('id', companyId);

    if (error) {
      toast.error('Failed to toggle AI');
    } else {
      toast.success(aiEnabled ? 'AI disabled - calls forwarding to fallback' : 'AI enabled');
      onAiToggle();
    }
    setIsToggling(false);
  };

  const actions = [
    { label: 'Edit Hours', icon: Clock, onClick: () => navigate('/settings') },
    { label: 'Edit FAQs', icon: BookOpen, onClick: () => navigate('/knowledge-base') },
    { label: 'Edit Services', icon: Briefcase, onClick: () => navigate('/services') },
    { label: "Today's Calls", icon: Phone, onClick: () => navigate('/call-logs') },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Quick Actions</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button
            key={action.label}
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={action.onClick}
          >
            <action.icon className="h-4 w-4" />
            {action.label}
          </Button>
        ))}
        <Button
          variant={aiEnabled ? 'destructive' : 'default'}
          size="sm"
          className="gap-2"
          onClick={handleAiToggle}
          disabled={isToggling}
        >
          {isToggling ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : aiEnabled ? (
            <PowerOff className="h-4 w-4" />
          ) : (
            <Power className="h-4 w-4" />
          )}
          {aiEnabled ? 'Disable AI' : 'Enable AI'}
        </Button>
      </CardContent>
    </Card>
  );
}
