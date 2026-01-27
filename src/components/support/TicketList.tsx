import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { MessageSquare, Clock, AlertTriangle, CheckCircle, Search } from 'lucide-react';

interface Ticket {
  id: string;
  company_id: string;
  reporter_user_id: string;
  title: string;
  description: string | null;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  company?: { name: string };
  reporter?: { email: string; full_name: string | null };
}

interface TicketComment {
  id: string;
  ticket_id: string;
  user_id: string;
  content: string;
  created_at: string;
  user?: { email: string; full_name: string | null };
}

interface TicketListProps {
  companyFilter?: string;
}

export function TicketList({ companyFilter }: TicketListProps) {
  const queryClient = useQueryClient();
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [newComment, setNewComment] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['support-tickets', companyFilter, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('support_tickets')
        .select('*')
        .order('created_at', { ascending: false });

      if (companyFilter && companyFilter !== 'all') {
        query = query.eq('company_id', companyFilter);
      }
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Fetch company names
      const companyIds = [...new Set(data.map(t => t.company_id))];
      const { data: companies } = await supabase
        .from('companies')
        .select('id, name')
        .in('id', companyIds);

      // Fetch reporter profiles
      const reporterIds = [...new Set(data.map(t => t.reporter_user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', reporterIds);

      return data.map(ticket => ({
        ...ticket,
        company: companies?.find(c => c.id === ticket.company_id),
        reporter: profiles?.find(p => p.id === ticket.reporter_user_id),
      })) as Ticket[];
    },
  });

  const { data: comments = [] } = useQuery({
    queryKey: ['ticket-comments', selectedTicket?.id],
    queryFn: async () => {
      if (!selectedTicket) return [];
      const { data, error } = await supabase
        .from('ticket_comments')
        .select('*')
        .eq('ticket_id', selectedTicket.id)
        .order('created_at', { ascending: true });
      if (error) throw error;

      const userIds = [...new Set(data.map(c => c.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', userIds);

      return data.map(comment => ({
        ...comment,
        user: profiles?.find(p => p.id === comment.user_id),
      })) as TicketComment[];
    },
    enabled: !!selectedTicket,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ ticketId, status }: { ticketId: string; status: string }) => {
      const updates: Record<string, unknown> = { status };
      if (status === 'resolved') {
        updates.resolved_at = new Date().toISOString();
      }
      const { error } = await supabase
        .from('support_tickets')
        .update(updates)
        .eq('id', ticketId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
      toast.success('Ticket status updated');
    },
    onError: () => toast.error('Failed to update status'),
  });

  const addComment = useMutation({
    mutationFn: async () => {
      if (!selectedTicket || !newComment.trim()) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase.from('ticket_comments').insert({
        ticket_id: selectedTicket.id,
        user_id: user.id,
        content: newComment.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket-comments'] });
      setNewComment('');
      toast.success('Comment added');
    },
    onError: () => toast.error('Failed to add comment'),
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'destructive';
      case 'in_progress': return 'default';
      case 'resolved': return 'secondary';
      case 'closed': return 'outline';
      default: return 'secondary';
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'urgent': return <AlertTriangle className="h-4 w-4 text-destructive" />;
      case 'high': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default: return null;
    }
  };

  const filteredTickets = tickets.filter(ticket =>
    ticket.title.toLowerCase().includes(search.toLowerCase()) ||
    ticket.company?.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Support Tickets</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search tickets..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 w-48"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : filteredTickets.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No tickets found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Reporter</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTickets.map((ticket) => (
                  <TableRow key={ticket.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getPriorityIcon(ticket.priority)}
                        <span className="font-medium">{ticket.title}</span>
                      </div>
                    </TableCell>
                    <TableCell>{ticket.company?.name || 'Unknown'}</TableCell>
                    <TableCell>
                      {ticket.reporter?.full_name || ticket.reporter?.email || 'Unknown'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={ticket.priority === 'urgent' ? 'destructive' : 'secondary'}>
                        {ticket.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusColor(ticket.status)}>
                        {ticket.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>{format(new Date(ticket.created_at), 'MMM d, h:mm a')}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedTicket(ticket)}
                      >
                        <MessageSquare className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedTicket} onOpenChange={() => setSelectedTicket(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {getPriorityIcon(selectedTicket?.priority || 'medium')}
              {selectedTicket?.title}
            </DialogTitle>
          </DialogHeader>

          {selectedTicket && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>Company: {selectedTicket.company?.name}</span>
                <span>Reporter: {selectedTicket.reporter?.full_name || selectedTicket.reporter?.email}</span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {format(new Date(selectedTicket.created_at), 'MMM d, yyyy h:mm a')}
                </span>
              </div>

              {selectedTicket.description && (
                <div className="bg-muted p-3 rounded-lg">
                  <p className="text-sm">{selectedTicket.description}</p>
                </div>
              )}

              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Status:</span>
                <Select
                  value={selectedTicket.status}
                  onValueChange={(status) => {
                    updateStatus.mutate({ ticketId: selectedTicket.id, status });
                    setSelectedTicket({ ...selectedTicket, status: status as Ticket['status'] });
                  }}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
                {selectedTicket.resolved_at && (
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    Resolved {format(new Date(selectedTicket.resolved_at), 'MMM d')}
                  </span>
                )}
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">Comments</h4>
                <div className="space-y-3 max-h-48 overflow-y-auto mb-3">
                  {comments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No comments yet</p>
                  ) : (
                    comments.map((comment) => (
                      <div key={comment.id} className="bg-muted/50 p-2 rounded">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">
                            {comment.user?.full_name || comment.user?.email}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(comment.created_at), 'MMM d, h:mm a')}
                          </span>
                        </div>
                        <p className="text-sm">{comment.content}</p>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Add a comment..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    className="min-h-[60px]"
                  />
                  <Button
                    onClick={() => addComment.mutate()}
                    disabled={!newComment.trim() || addComment.isPending}
                  >
                    Send
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
