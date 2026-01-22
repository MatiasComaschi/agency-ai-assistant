import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Bot, Send, Save, Phone, AlertTriangle, CheckCircle, 
  Loader2, User, PhoneCall, X, MessageSquare, ClipboardList
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type { Company } from '@/types';

interface ExtractedJson {
  caller_name: string;
  caller_phone: string;
  service_requested: string;
  preferred_time: string;
  confidence: 'high' | 'medium' | 'low';
  needs_escalation: boolean;
  escalation_reason: string;
  intent_category: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  extracted_json?: ExtractedJson;
}

interface AISimulatorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: Company;
}

type SimulatorMode = 'faq' | 'booking' | 'quote' | 'complaint';

const modeConfig: Record<SimulatorMode, { label: string; icon: React.ReactNode; description: string }> = {
  faq: { label: 'FAQ', icon: <MessageSquare className="h-4 w-4" />, description: 'General questions' },
  booking: { label: 'Booking', icon: <PhoneCall className="h-4 w-4" />, description: 'Schedule appointments' },
  quote: { label: 'Quote', icon: <ClipboardList className="h-4 w-4" />, description: 'Request pricing' },
  complaint: { label: 'Complaint', icon: <AlertTriangle className="h-4 w-4" />, description: 'Issues & concerns' },
};

export function AISimulator({ open, onOpenChange, company }: AISimulatorProps) {
  const [mode, setMode] = useState<SimulatorMode>('faq');
  const [callerName, setCallerName] = useState('');
  const [callerPhone, setCallerPhone] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [latestExtracted, setLatestExtracted] = useState<ExtractedJson | null>(null);
  const [followupNote, setFollowupNote] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const resetSimulator = () => {
    setMessages([]);
    setLatestExtracted(null);
    setUserInput('');
    setFollowupNote('');
  };

  const handleModeChange = (newMode: string) => {
    setMode(newMode as SimulatorMode);
    resetSimulator();
  };

  const sendMessage = async () => {
    if (!userInput.trim() || isLoading) return;

    const newUserMessage: ChatMessage = { role: 'user', content: userInput };
    setMessages(prev => [...prev, newUserMessage]);
    setUserInput('');
    setIsLoading(true);

    try {
      const conversationHistory = messages.map(m => ({
        role: m.role,
        content: m.content
      }));

      const response = await supabase.functions.invoke('ai-simulator', {
        body: {
          companyId: company.id,
          mode,
          callerName,
          callerPhone,
          userMessage: userInput,
          conversationHistory
        }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to get AI response');
      }

      const data = response.data;
      
      if (data.error) {
        throw new Error(data.error);
      }

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data.response,
        extracted_json: data.extracted_json
      };

      setMessages(prev => [...prev, assistantMessage]);
      setLatestExtracted(data.extracted_json);

    } catch (error) {
      console.error('AI Simulator error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to get AI response');
    } finally {
      setIsLoading(false);
    }
  };

  const saveAsCallLog = async () => {
    if (!latestExtracted) {
      toast.error('No conversation data to save');
      return;
    }

    try {
      const transcript = messages.map(m => `${m.role === 'user' ? 'Caller' : 'AI'}: ${m.content}`).join('\n\n');
      
      const { error } = await supabase.from('calls').insert([{
        company_id: company.id,
        caller_name: latestExtracted.caller_name || callerName,
        caller_number: latestExtracted.caller_phone || callerPhone,
        started_at: new Date().toISOString(),
        ended_at: new Date().toISOString(),
        outcome: latestExtracted.needs_escalation ? 'escalated' : 'answered',
        transcript,
        summary: `${mode.toUpperCase()} simulation - ${latestExtracted.service_requested || 'General inquiry'}`,
        extracted_json: JSON.parse(JSON.stringify(latestExtracted)) as Json,
        internal_notes: '[Simulated Call]'
      }]);

      if (error) throw error;
      toast.success('Call log saved successfully');
    } catch (error) {
      console.error('Error saving call log:', error);
      toast.error('Failed to save call log');
    }
  };

  const createFollowupTask = async () => {
    if (!latestExtracted) {
      toast.error('No conversation data to create task from');
      return;
    }

    try {
      const { error } = await supabase.from('followup_tasks').insert([{
        company_id: company.id,
        title: `Follow up: ${latestExtracted.caller_name || callerName || 'Unknown caller'} - ${latestExtracted.service_requested || mode}`,
        status: 'open',
        notes: followupNote || `From simulated call. Reason: ${latestExtracted.escalation_reason || 'General follow-up'}`
      }]);

      if (error) throw error;
      toast.success('Follow-up task created');
      setFollowupNote('');
    } catch (error) {
      console.error('Error creating task:', error);
      toast.error('Failed to create follow-up task');
    }
  };

  const markAsEscalated = async () => {
    if (!latestExtracted) {
      toast.error('No conversation data');
      return;
    }

    // Save as escalated call
    try {
      const transcript = messages.map(m => `${m.role === 'user' ? 'Caller' : 'AI'}: ${m.content}`).join('\n\n');
      
      const { error } = await supabase.from('calls').insert([{
        company_id: company.id,
        caller_name: latestExtracted.caller_name || callerName,
        caller_number: latestExtracted.caller_phone || callerPhone,
        started_at: new Date().toISOString(),
        ended_at: new Date().toISOString(),
        outcome: 'escalated',
        transcript,
        summary: `ESCALATED: ${latestExtracted.escalation_reason || 'Manual escalation from simulation'}`,
        extracted_json: JSON.parse(JSON.stringify(latestExtracted)) as Json,
        internal_notes: '[Simulated Call - Escalated]'
      }]);

      if (error) throw error;
      toast.success('Marked as escalated and saved');
    } catch (error) {
      console.error('Error marking escalated:', error);
      toast.error('Failed to mark as escalated');
    }
  };

  const getConfidenceBadge = (confidence: string) => {
    switch (confidence) {
      case 'high':
        return <Badge variant="outline" className="bg-accent/20 text-accent border-accent/30"><CheckCircle className="h-3 w-3 mr-1" /> High</Badge>;
      case 'medium':
        return <Badge variant="outline" className="bg-muted text-muted-foreground border-border">Medium</Badge>;
      case 'low':
        return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" /> Low</Badge>;
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-accent" />
            AI Simulator - {company.name}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Left: Chat Panel */}
          <div className="flex-1 flex flex-col border-r">
            {/* Mode Selector */}
            <Tabs value={mode} onValueChange={handleModeChange} className="px-4 pt-4">
              <TabsList className="grid grid-cols-4 w-full">
                {Object.entries(modeConfig).map(([key, config]) => (
                  <TabsTrigger key={key} value={key} className="flex items-center gap-1 text-xs">
                    {config.icon}
                    {config.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {/* Caller Info */}
            <div className="px-4 py-3 border-b bg-muted/30 grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Caller Name</Label>
                <Input
                  value={callerName}
                  onChange={(e) => setCallerName(e.target.value)}
                  placeholder="John Doe"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Phone Number</Label>
                <Input
                  value={callerPhone}
                  onChange={(e) => setCallerPhone(e.target.value)}
                  placeholder="+1 (555) 123-4567"
                  className="h-8 text-sm"
                />
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 px-4 py-4" ref={scrollRef}>
              <div className="space-y-4">
                {messages.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <Bot className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">Start a simulated conversation</p>
                    <p className="text-xs mt-1">Mode: {modeConfig[mode].description}</p>
                  </div>
                )}
                {messages.map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[85%] rounded-lg px-4 py-2 ${
                      msg.role === 'user'
                        ? 'bg-accent text-accent-foreground'
                        : 'bg-muted'
                    }`}>
                      <div className="flex items-center gap-2 mb-1">
                        {msg.role === 'user' ? (
                          <User className="h-3 w-3" />
                        ) : (
                          <Bot className="h-3 w-3" />
                        )}
                        <span className="text-xs font-medium">
                          {msg.role === 'user' ? 'Caller' : 'AI Receptionist'}
                        </span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </motion.div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-lg px-4 py-2 flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Thinking...</span>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Input */}
            <div className="p-4 border-t flex gap-2">
              <Input
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder="Type a message as the caller..."
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                disabled={isLoading}
              />
              <Button onClick={sendMessage} disabled={isLoading || !userInput.trim()} size="icon">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Right: Extracted Data & Actions */}
          <div className="w-80 flex flex-col bg-muted/20">
            <div className="p-4 border-b">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <ClipboardList className="h-4 w-4" />
                Extracted Information
              </h3>
            </div>

            <ScrollArea className="flex-1 p-4">
              {latestExtracted ? (
                <div className="space-y-4">
                  <Card>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Confidence</span>
                        {getConfidenceBadge(latestExtracted.confidence)}
                      </div>

                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Name:</span>
                          <span className="font-medium">{latestExtracted.caller_name || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Phone:</span>
                          <span className="font-medium">{latestExtracted.caller_phone || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Service:</span>
                          <span className="font-medium">{latestExtracted.service_requested || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Preferred Time:</span>
                          <span className="font-medium">{latestExtracted.preferred_time || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Intent:</span>
                          <Badge variant="outline">{latestExtracted.intent_category}</Badge>
                        </div>
                      </div>

                      {latestExtracted.needs_escalation && (
                        <div className="mt-3 p-3 bg-destructive/10 rounded-lg border border-destructive/20">
                          <div className="flex items-center gap-2 text-destructive text-sm font-medium">
                            <AlertTriangle className="h-4 w-4" />
                            Escalation Recommended
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {latestExtracted.escalation_reason || 'Low confidence or out of scope'}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Follow-up Note */}
                  <div className="space-y-2">
                    <Label className="text-xs">Follow-up Note (optional)</Label>
                    <Textarea
                      value={followupNote}
                      onChange={(e) => setFollowupNote(e.target.value)}
                      placeholder="Add notes for the follow-up task..."
                      className="h-20 text-sm"
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="space-y-2">
                    <Button onClick={saveAsCallLog} className="w-full" variant="outline" size="sm">
                      <Save className="h-4 w-4 mr-2" />
                      Save as Call Log
                    </Button>
                    <Button onClick={createFollowupTask} className="w-full" variant="outline" size="sm">
                      <ClipboardList className="h-4 w-4 mr-2" />
                      Create Follow-up Task
                    </Button>
                    <Button 
                      onClick={markAsEscalated} 
                      variant="destructive" 
                      size="sm"
                      className="w-full"
                    >
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      Mark as Escalated
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No data extracted yet</p>
                  <p className="text-xs mt-1">Start a conversation to see extracted info</p>
                </div>
              )}
            </ScrollArea>

            {/* Reset Button */}
            <div className="p-4 border-t">
              <Button onClick={resetSimulator} variant="ghost" className="w-full" size="sm">
                <X className="h-4 w-4 mr-2" />
                Reset Conversation
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
