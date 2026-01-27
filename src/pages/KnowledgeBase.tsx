import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Search, Pencil, Trash2, BookOpen, Download, Loader2 } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { CompanySelector } from '@/components/company/CompanySelector';
import { BulkKBImport } from '@/components/knowledge-base/BulkKBImport';
import type { KnowledgeBaseItem } from '@/types';

export default function KnowledgeBase() {
  const { currentCompany } = useCompany();
  const [items, setItems] = useState<KnowledgeBaseItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newItem, setNewItem] = useState({ type: 'faq', title: '', answer: '', question: '' });
  const [isSaving, setIsSaving] = useState(false);
  
  // Edit state
  const [editingItem, setEditingItem] = useState<KnowledgeBaseItem | null>(null);
  const [editForm, setEditForm] = useState({ type: 'faq', title: '', answer: '', question: '' });

  useEffect(() => {
    if (currentCompany) fetchItems();
  }, [currentCompany]);

  const fetchItems = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('knowledge_base_items')
      .select('*')
      .eq('company_id', currentCompany!.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    
    if (error) toast.error('Failed to load knowledge base');
    setItems((data as unknown as KnowledgeBaseItem[]) || []);
    setIsLoading(false);
  };

  const handleAdd = async () => {
    if (!newItem.title || !newItem.answer) {
      toast.error('Please fill in all required fields');
      return;
    }
    setIsSaving(true);
    const { error } = await supabase.from('knowledge_base_items').insert({
      company_id: currentCompany!.id,
      type: newItem.type,
      title: newItem.title,
      answer: newItem.answer,
      question: newItem.question || null,
    });
    setIsSaving(false);
    if (error) toast.error('Failed to add item');
    else {
      toast.success('Item added successfully');
      setIsAddOpen(false);
      setNewItem({ type: 'faq', title: '', answer: '', question: '' });
      fetchItems();
    }
  };

  const openEdit = (item: KnowledgeBaseItem) => {
    setEditingItem(item);
    setEditForm({
      type: item.type,
      title: item.title,
      answer: item.answer,
      question: item.question || '',
    });
  };

  const handleEdit = async () => {
    if (!editingItem || !editForm.title || !editForm.answer) {
      toast.error('Please fill in all required fields');
      return;
    }
    setIsSaving(true);
    const { error } = await supabase
      .from('knowledge_base_items')
      .update({
        type: editForm.type,
        title: editForm.title,
        answer: editForm.answer,
        question: editForm.question || null,
      })
      .eq('id', editingItem.id);
    
    setIsSaving(false);
    if (error) toast.error('Failed to update item');
    else {
      toast.success('Item updated successfully');
      setEditingItem(null);
      fetchItems();
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('knowledge_base_items').delete().eq('id', id);
    if (error) toast.error('Failed to delete item');
    else {
      toast.success('Item deleted');
      fetchItems();
    }
  };

  // CSV Export
  const handleExport = () => {
    const headers = ['type', 'title', 'question', 'answer', 'tags'];
    const csvContent = [
      headers.join(','),
      ...items.map(item => [
        item.type,
        `"${item.title.replace(/"/g, '""')}"`,
        `"${(item.question || '').replace(/"/g, '""')}"`,
        `"${item.answer.replace(/"/g, '""')}"`,
        `"${(item.tags || []).join(';')}"`,
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `knowledge-base-${currentCompany?.name || 'export'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Knowledge base exported');
  };

  const filtered = items.filter((i) => i.title.toLowerCase().includes(search.toLowerCase()));

  if (!currentCompany) return <div className="p-8 text-center text-muted-foreground">Please select a company</div>;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Company Selector */}
      <CompanySelector />

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-display font-bold">Knowledge Base</h1>
          <p className="text-muted-foreground">FAQs, services, pricing, and policies</p>
        </div>
        <div className="flex gap-2">
          <BulkKBImport onImportComplete={fetchItems} />
          <Button variant="outline" onClick={handleExport} disabled={items.length === 0}>
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
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
                <div><Label>Title *</Label><Input value={newItem.title} onChange={(e) => setNewItem({ ...newItem, title: e.target.value })} /></div>
                {newItem.type === 'faq' && (
                  <div><Label>Question</Label><Input value={newItem.question} onChange={(e) => setNewItem({ ...newItem, question: e.target.value })} /></div>
                )}
                <div><Label>Answer / Content *</Label><Textarea value={newItem.answer} onChange={(e) => setNewItem({ ...newItem, answer: e.target.value })} rows={4} /></div>
                <Button onClick={handleAdd} disabled={isSaving} className="w-full bg-accent hover:bg-accent/90">
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Add Item
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading...
        </div>
      ) : filtered.length === 0 ? (
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
                  <Button variant="ghost" size="icon" onClick={() => openEdit(item)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Sheet */}
      <Sheet open={!!editingItem} onOpenChange={() => setEditingItem(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Edit Item</SheetTitle>
            <SheetDescription>Update knowledge base item</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div><Label>Type</Label>
              <Select value={editForm.type} onValueChange={(v) => setEditForm({ ...editForm, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="faq">FAQ</SelectItem>
                  <SelectItem value="services">Services</SelectItem>
                  <SelectItem value="pricing">Pricing</SelectItem>
                  <SelectItem value="policies">Policies</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Title *</Label><Input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} /></div>
            {editForm.type === 'faq' && (
              <div><Label>Question</Label><Input value={editForm.question} onChange={(e) => setEditForm({ ...editForm, question: e.target.value })} /></div>
            )}
            <div><Label>Answer / Content *</Label><Textarea value={editForm.answer} onChange={(e) => setEditForm({ ...editForm, answer: e.target.value })} rows={4} /></div>
            <Button onClick={handleEdit} disabled={isSaving} className="w-full bg-accent hover:bg-accent/90">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </motion.div>
  );
}
