import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Phone, Filter, Loader2, X, MessageSquare, CheckCircle, ListTodo, Save } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { CompanySelector } from '@/components/company/CompanySelector';
import type { Call, FollowupTask } from '@/types';

const outcomeColors: Record<string, string> = {
  answered: 'bg-accent text-accent-foreground',
  escalated: 'bg-info text-info-foreground',
  booked: 'bg-accent text-accent-foreground',
  voicemail: 'bg-warning text-warning-foreground',
  abandoned: 'bg-destructive text-destructive-foreground',
};

export default function CallLogs() {
  const { currentCompany } = useCompany();
  const [calls, setCalls] = useState<Call[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [outcomeFilter, setOutcomeFilter] = useState('all');
  
  // Detail drawer state
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [internalNote, setInternalNote] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);
  
  // Follow-up task state
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDueAt, setTaskDueAt] = useState('');
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  useEffect(() => {
    if (currentCompany) fetchCalls();
  }, [currentCompany, outcomeFilter]);

  const fetchCalls = async () => {
    setIsLoading(true);
    let query = supabase
      .from('calls')
      .select('*')
      .eq('company_id', currentCompany!.id)
      .order('started_at', { ascending: false });
    
    if (outcomeFilter !== 'all') {
      query = query.eq('outcome', outcomeFilter);
    }
    
    const { data, error } = await query;
    if (error) toast.error('Failed to load calls');
    setCalls((data as unknown as Call[]) || []);
    setIsLoading(false);
  };

  const formatDuration = (startedAt: string, endedAt: string | null) => {
    if (!endedAt) return '—';
    const start = new Date(startedAt).getTime();
    const end = new Date(endedAt).getTime();
    const seconds = Math.floor((end - start) / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  };

  const openCallDetail = (call: Call) => {
    setSelectedCall(call);
    setInternalNote(call.internal_notes || '');
    setTaskTitle('');
    setTaskDueAt('');
  };

  const saveInternalNote = async () => {
    if (!selectedCall) return;
    setIsSavingNote(true);
    
    const { error } = await supabase
      .from('calls')
      .update({ internal_notes: internalNote })
      .eq('id', selectedCall.id);
    
    setIsSavingNote(false);
    if (error) {
      toast.error('Failed to save note');
    } else {
      toast.success('Note saved');
      setSelectedCall({ ...selectedCall, internal_notes: internalNote });
      fetchCalls();
    }
  };

  const updateOutcome = async (outcome: string) => {
    if (!selectedCall) return;
    
    const { error } = await supabase
      .from('calls')
      .update({ outcome })
      .eq('id', selectedCall.id);
    
    if (error) {
      toast.error('Failed to update outcome');
    } else {
      toast.success('Outcome updated');
      setSelectedCall({ ...selectedCall, outcome: outcome as Call['outcome'] });
      fetchCalls();
    }
  };

  const createFollowupTask = async () => {
    if (!selectedCall || !taskTitle) {
      toast.error('Please enter a task title');
      return;
    }
    
    setIsCreatingTask(true);
    const { error } = await supabase.from('followup_tasks').insert({
      company_id: currentCompany!.id,
      call_id: selectedCall.id,
      title: taskTitle,
      due_at: taskDueAt || null,
      status: 'open',
    });
    
    setIsCreatingTask(false);
    if (error) {
      toast.error('Failed to create task');
    } else {
      toast.success('Follow-up task created');
      setTaskTitle('');
      setTaskDueAt('');
    }
  };

  if (!currentCompany) return <div className="p-8 text-center text-muted-foreground">Please select a company</div>;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Company Selector */}
      <CompanySelector />

      <div>
        <h1 className="text-3xl font-display font-bold">Call Logs</h1>
        <p className="text-muted-foreground">View and manage call history</p>
      </div>

      <div className="flex gap-4">
        <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
          <SelectTrigger className="w-40"><Filter className="h-4 w-4 mr-2" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Outcomes</SelectItem>
            <SelectItem value="answered">Answered</SelectItem>
            <SelectItem value="escalated">Escalated</SelectItem>
            <SelectItem value="booked">Booked</SelectItem>
            <SelectItem value="voicemail">Voicemail</SelectItem>
            <SelectItem value="abandoned">Abandoned</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading calls...
            </div>
          ) : calls.length === 0 ? (
            <div className="p-12 text-center">
              <Phone className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
              <p className="text-muted-foreground">No calls yet</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Caller</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calls.map((call) => (
                  <TableRow 
                    key={call.id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => openCallDetail(call)}
                  >
                    <TableCell className="font-medium">{call.caller_name || 'Unknown'}</TableCell>
                    <TableCell className="text-muted-foreground">{call.caller_number || '—'}</TableCell>
                    <TableCell>
                      {call.outcome && <Badge className={outcomeColors[call.outcome]}>{call.outcome}</Badge>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDuration(call.started_at, call.ended_at)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(call.started_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Call Detail Sheet */}
      <Sheet open={!!selectedCall} onOpenChange={() => setSelectedCall(null)}>
        <SheetContent className="w-[500px] sm:max-w-[500px]">
          <SheetHeader>
            <SheetTitle>Call Details</SheetTitle>
            <SheetDescription>
              {selectedCall?.caller_name || 'Unknown'} • {selectedCall?.caller_number || 'No number'}
            </SheetDescription>
          </SheetHeader>
          
          {selectedCall && (
            <ScrollArea className="h-[calc(100vh-120px)] pr-4">
              <div className="space-y-6 mt-6">
                {/* Call Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Date</Label>
                    <p className="font-medium">{new Date(selectedCall.started_at).toLocaleString()}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Duration</Label>
                    <p className="font-medium">{formatDuration(selectedCall.started_at, selectedCall.ended_at)}</p>
                  </div>
                </div>

                <Separator />

                {/* Outcome */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><CheckCircle className="h-4 w-4" /> Mark Outcome</Label>
                  <Select value={selectedCall.outcome || ''} onValueChange={updateOutcome}>
                    <SelectTrigger><SelectValue placeholder="Select outcome" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="answered">Answered</SelectItem>
                      <SelectItem value="escalated">Escalated</SelectItem>
                      <SelectItem value="booked">Booked</SelectItem>
                      <SelectItem value="voicemail">Voicemail</SelectItem>
                      <SelectItem value="abandoned">Abandoned</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                {/* Transcript */}
                {selectedCall.transcript && (
                  <>
                    <div className="space-y-2">
                      <Label>Transcript</Label>
                      <div className="bg-muted/50 rounded-lg p-4 text-sm whitespace-pre-wrap max-h-48 overflow-y-auto">
                        {selectedCall.transcript}
                      </div>
                    </div>
                    <Separator />
                  </>
                )}

                {/* Summary */}
                {selectedCall.summary && (
                  <>
                    <div className="space-y-2">
                      <Label>AI Summary</Label>
                      <p className="text-sm text-muted-foreground">{selectedCall.summary}</p>
                    </div>
                    <Separator />
                  </>
                )}

                {/* Internal Notes */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Internal Notes</Label>
                  <Textarea
                    value={internalNote}
                    onChange={(e) => setInternalNote(e.target.value)}
                    placeholder="Add notes about this call..."
                    rows={3}
                  />
                  <Button onClick={saveInternalNote} disabled={isSavingNote} size="sm">
                    {isSavingNote ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                    Save Note
                  </Button>
                </div>

                <Separator />

                {/* Follow-up Task */}
                <div className="space-y-3">
                  <Label className="flex items-center gap-2"><ListTodo className="h-4 w-4" /> Create Follow-up Task</Label>
                  <Input
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    placeholder="Task title..."
                  />
                  <Input
                    type="datetime-local"
                    value={taskDueAt}
                    onChange={(e) => setTaskDueAt(e.target.value)}
                  />
                  <Button onClick={createFollowupTask} disabled={isCreatingTask} className="w-full bg-accent hover:bg-accent/90">
                    {isCreatingTask ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ListTodo className="h-4 w-4 mr-2" />}
                    Create Task
                  </Button>
                </div>
              </div>
            </ScrollArea>
          )}
        </SheetContent>
      </Sheet>
    </motion.div>
  );
}
