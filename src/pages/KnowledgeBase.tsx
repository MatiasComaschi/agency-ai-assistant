import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Search, Pencil, Trash2, BookOpen } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import type { KnowledgeBaseItem } from '@/types';

export default function KnowledgeBase() {
  const { currentCompany } = useCompany();
  const [items, setItems] = useState<KnowledgeBaseItem[]>([]);
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [newItem, setNewItem] = useState({ type: 'faq', title: '', answer: '', question: '' });

  useEffect(() => {
    if (currentCompany) fetchItems();
  }, [currentCompany]);

  const fetchItems = async () => {
    const { data } = await supabase
      .from('knowledge_base_items')
      .select('*')
      .eq('company_id', currentCompany!.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    setItems((data as unknown as KnowledgeBaseItem[]) || []);
  };

  const handleAdd = async () => {
    if (!newItem.title || !newItem.answer) {
      toast.error('Please fill in all required fields');
      return;
    }
    const { error } = await supabase.from('knowledge_base_items').insert({
      company_id: currentCompany!.id,
      type: newItem.type,
      title: newItem.title,
      answer: newItem.answer,
      question: newItem.question || null,
    });
    if (error) toast.error('Failed to add item');
    else {
      toast.success('Item added');
      setIsOpen(false);
      setNewItem({ type: 'faq', title: '', answer: '', question: '' });
      fetchItems();
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('knowledge_base_items').delete().eq('id', id);
    if (error) toast.error('Failed to delete');
    else {
      toast.success('Item deleted');
      fetchItems();
    }
  };

  const filtered = items.filter((i) => i.title.toLowerCase().includes(search.toLowerCase()));

  if (!currentCompany) return <div className="p-8 text-center text-muted-foreground">Please select a company</div>;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-display font-bold">Knowledge Base</h1>
          <p className="text-muted-foreground">FAQs, services, pricing, and policies</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="bg-accent hover:bg-accent/90"><Plus className="h-4 w-4 mr-2" /> Add Item</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Knowledge Base Item</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Type</Label>
                <Select value={newItem.type} onValueChange={(v) => setNewItem({ ...newItem, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="faq">FAQ</SelectItem>
                    <SelectItem value="services">Services</SelectItem>
                    <SelectItem value="pricing">Pricing</SelectItem>
                    <SelectItem value="policies">Policies</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Title</Label><Input value={newItem.title} onChange={(e) => setNewItem({ ...newItem, title: e.target.value })} /></div>
              {newItem.type === 'faq' && (
                <div><Label>Question</Label><Input value={newItem.question} onChange={(e) => setNewItem({ ...newItem, question: e.target.value })} /></div>
              )}
              <div><Label>Answer / Content</Label><Textarea value={newItem.answer} onChange={(e) => setNewItem({ ...newItem, answer: e.target.value })} rows={4} /></div>
              <Button onClick={handleAdd} className="w-full bg-accent hover:bg-accent/90">Add Item</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="p-12 text-center">
          <BookOpen className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
          <p className="text-muted-foreground">No items yet. Add your first one!</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <Card key={item.id} className="group">
              <CardContent className="p-4 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="secondary">{item.type}</Badge>
                    <span className="font-medium">{item.title}</span>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">{item.answer}</p>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon"><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </motion.div>
  );
}
