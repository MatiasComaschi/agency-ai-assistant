import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Phone,
  Bot,
  BookOpen,
  CheckCircle2,
  Circle,
  ChevronRight,
  PhoneCall,
  MessageSquare,
  Sparkles,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  isComplete: boolean;
  action: () => void;
  actionLabel: string;
}

interface OnboardingChecklistProps {
  companyId: string;
  onDismiss?: () => void;
}

export function OnboardingChecklist({ companyId, onDismiss }: OnboardingChecklistProps) {
  const navigate = useNavigate();
  const { currentCompany } = useCompany();
  const [checklistState, setChecklistState] = useState({
    hasPhone: false,
    hasAiProfile: false,
    hasKnowledgeBase: false,
    hasServices: false,
    hasTested: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);

  useEffect(() => {
    if (companyId) {
      checkOnboardingStatus();
    }
  }, [companyId]);

  const checkOnboardingStatus = async () => {
    setIsLoading(true);
    try {
      // Check phone number
      const { data: company } = await supabase
        .from('companies')
        .select('twilio_number')
        .eq('id', companyId)
        .single();

      // Check AI profile has custom content
      const { data: aiProfile } = await supabase
        .from('ai_profiles')
        .select('greeting_script, system_prompt')
        .eq('company_id', companyId)
        .single();

      // Check knowledge base items
      const { count: kbCount } = await supabase
        .from('knowledge_base_items')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('is_active', true);

      // Check services
      const { count: servicesCount } = await supabase
        .from('services')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('is_active', true);

      // Check if AI has been tested (look for any test calls or simulator usage)
      const { count: callsCount } = await supabase
        .from('calls')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId);

      setChecklistState({
        hasPhone: !!company?.twilio_number,
        hasAiProfile: !!(aiProfile?.greeting_script && aiProfile.greeting_script !== 'Hello! Thank you for calling. How may I help you today?'),
        hasKnowledgeBase: (kbCount || 0) >= 3,
        hasServices: (servicesCount || 0) >= 1,
        hasTested: (callsCount || 0) >= 1,
      });
    } catch (error) {
      console.error('Error checking onboarding status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const checklistItems: ChecklistItem[] = [
    {
      id: 'phone',
      title: 'Provision Phone Number',
      description: 'Get a dedicated Twilio number for AI calls',
      icon: PhoneCall,
      isComplete: checklistState.hasPhone,
      action: () => navigate(`/company-settings?id=${companyId}`),
      actionLabel: 'Set Up Phone',
    },
    {
      id: 'ai-profile',
      title: 'Customize AI Profile',
      description: 'Set greeting, tone, and personality',
      icon: Bot,
      isComplete: checklistState.hasAiProfile,
      action: () => navigate(`/company?tab=ai`),
      actionLabel: 'Edit Profile',
    },
    {
      id: 'knowledge-base',
      title: 'Add Knowledge Base',
      description: 'Add at least 3 FAQs for the AI',
      icon: BookOpen,
      isComplete: checklistState.hasKnowledgeBase,
      action: () => navigate(`/company?tab=knowledge`),
      actionLabel: 'Add FAQs',
    },
    {
      id: 'services',
      title: 'Configure Services',
      description: 'Add bookable services with durations',
      icon: Sparkles,
      isComplete: checklistState.hasServices,
      action: () => navigate(`/company?tab=services`),
      actionLabel: 'Add Services',
    },
    {
      id: 'test',
      title: 'Test Your AI',
      description: 'Make a test call or use the simulator',
      icon: MessageSquare,
      isComplete: checklistState.hasTested,
      action: () => navigate('/ai-receptionist'),
      actionLabel: 'Test AI',
    },
  ];

  const completedCount = checklistItems.filter((item) => item.isComplete).length;
  const progressPercent = (completedCount / checklistItems.length) * 100;
  const isComplete = completedCount === checklistItems.length;

  if (isLoading) {
    return (
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="py-6">
          <div className="animate-pulse flex items-center gap-4">
            <div className="h-10 w-10 bg-muted rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-muted rounded w-1/3" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Don't show if complete and dismissed
  if (isComplete && onDismiss) {
    return null;
  }

  if (isMinimized) {
    return (
      <Card 
        className="border-primary/20 cursor-pointer hover:border-primary/40 transition-colors"
        onClick={() => setIsMinimized(false)}
      >
        <CardContent className="py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Setup Progress</p>
                <p className="text-xs text-muted-foreground">{completedCount}/{checklistItems.length} completed</p>
              </div>
            </div>
            <Progress value={progressPercent} className="w-24 h-2" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">
                {isComplete ? '🎉 Setup Complete!' : 'Get Started Checklist'}
              </CardTitle>
              <CardDescription>
                {isComplete
                  ? `${currentCompany?.name || 'Company'} is ready to go live`
                  : `${completedCount} of ${checklistItems.length} steps completed`}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setIsMinimized(true)} className="h-8 w-8">
              <ChevronRight className="h-4 w-4" />
            </Button>
            {onDismiss && (
              <Button variant="ghost" size="icon" onClick={onDismiss} className="h-8 w-8">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        <Progress value={progressPercent} className="mt-3 h-2" />
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="space-y-2">
          <AnimatePresence>
            {checklistItems.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                  item.isComplete 
                    ? 'bg-accent/10' 
                    : 'bg-muted/50 hover:bg-muted'
                }`}
              >
                <div className="flex items-center gap-3">
                  {item.isComplete ? (
                    <CheckCircle2 className="h-5 w-5 text-accent shrink-0" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
                  )}
                  <div>
                    <p className={`text-sm font-medium ${item.isComplete ? 'text-muted-foreground line-through' : ''}`}>
                      {item.title}
                    </p>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </div>
                </div>
                {!item.isComplete && (
                  <Button size="sm" variant="outline" onClick={item.action} className="shrink-0">
                    {item.actionLabel}
                    <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                )}
                {item.isComplete && (
                  <Badge variant="secondary" className="bg-accent/20 text-accent">
                    Done
                  </Badge>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {isComplete && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-4 bg-accent/10 rounded-lg border border-accent/20"
          >
            <div className="flex items-center gap-3">
              <Phone className="h-5 w-5 text-accent" />
              <div className="flex-1">
                <p className="text-sm font-medium">Ready for Live Calls</p>
                <p className="text-xs text-muted-foreground">
                  Your AI receptionist is configured and ready to handle incoming calls.
                </p>
              </div>
              {onDismiss && (
                <Button size="sm" onClick={onDismiss}>
                  Dismiss
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}
