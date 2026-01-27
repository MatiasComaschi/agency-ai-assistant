import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileText, Sparkles, AlertCircle, Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { toast } from 'sonner';

interface ParsedItem {
  type: string;
  title: string;
  question?: string;
  answer: string;
  isValid: boolean;
  error?: string;
}

interface ColumnMapping {
  type: string;
  title: string;
  question: string;
  answer: string;
}

export function BulkKBImport({ onImportComplete }: { onImportComplete: () => void }) {
  const { currentCompany } = useCompany();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'csv' | 'ai'>('csv');
  const [isProcessing, setIsProcessing] = useState(false);
  
  // CSV Import State
  const [rawData, setRawData] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({
    type: '',
    title: '',
    question: '',
    answer: '',
  });
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  
  // AI Generation State
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiGeneratedItems, setAiGeneratedItems] = useState<ParsedItem[]>([]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        toast.error('CSV must have headers and at least one data row');
        return;
      }

      // Parse headers
      const parsedHeaders = parseCSVLine(lines[0]);
      setHeaders(parsedHeaders);

      // Parse rows
      const rows = lines.slice(1).map(line => {
        const values = parseCSVLine(line);
        const row: Record<string, string> = {};
        parsedHeaders.forEach((h, i) => {
          row[h] = values[i] || '';
        });
        return row;
      });

      setRawData(rows);
      
      // Auto-detect column mapping
      setColumnMapping({
        type: parsedHeaders.find(h => h.toLowerCase().includes('type')) || '',
        title: parsedHeaders.find(h => h.toLowerCase().includes('title') || h.toLowerCase().includes('name')) || '',
        question: parsedHeaders.find(h => h.toLowerCase().includes('question')) || '',
        answer: parsedHeaders.find(h => 
          h.toLowerCase().includes('answer') || 
          h.toLowerCase().includes('content') || 
          h.toLowerCase().includes('response')
        ) || '',
      });

      setIsOpen(true);
    };
    reader.readAsText(file);
    
    // Reset file input
    if (e.target) e.target.value = '';
  };

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    
    return result;
  };

  const applyMapping = () => {
    if (!columnMapping.title || !columnMapping.answer) {
      toast.error('Please map Title and Answer columns');
      return;
    }

    const items: ParsedItem[] = rawData.map((row) => {
      const title = row[columnMapping.title]?.trim() || '';
      const answer = row[columnMapping.answer]?.trim() || '';
      const type = (row[columnMapping.type]?.trim() || 'faq').toLowerCase();
      const question = row[columnMapping.question]?.trim() || '';

      const isValid = !!title && !!answer;
      const error = !title ? 'Missing title' : !answer ? 'Missing answer' : undefined;

      return {
        type: ['faq', 'services', 'pricing', 'policies'].includes(type) ? type : 'faq',
        title,
        question: question || undefined,
        answer,
        isValid,
        error,
      };
    });

    setParsedItems(items);
  };

  const handleAIGenerate = async () => {
    if (!aiPrompt.trim()) {
      toast.error('Please enter some content to generate FAQs from');
      return;
    }

    setIsProcessing(true);
    
    try {
      // Call the AI gateway to generate FAQs
      const { data, error } = await supabase.functions.invoke('ai-simulator', {
        body: {
          mode: 'faq_generation',
          prompt: `Based on the following content, generate 5-10 FAQ items for a business knowledge base. 
Return the response as a JSON array with objects containing: type (always "faq"), title (short summary), question (the FAQ question), answer (the comprehensive answer).

Content:
${aiPrompt}

Respond ONLY with valid JSON array, no other text.`,
        },
      });

      if (error) throw error;

      // Parse the AI response
      const response = data?.response || data;
      let items: ParsedItem[] = [];
      
      try {
        // Try to extract JSON from the response
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          items = parsed.map((item: Record<string, string>) => ({
            type: 'faq',
            title: item.title || '',
            question: item.question || '',
            answer: item.answer || '',
            isValid: !!(item.title && item.answer),
            error: undefined,
          }));
        }
      } catch {
        // If parsing fails, show a manual entry option
        toast.error('AI response could not be parsed. Try with simpler content.');
        return;
      }

      setAiGeneratedItems(items);
      toast.success(`Generated ${items.length} FAQ items`);
    } catch (error) {
      console.error('AI generation error:', error);
      toast.error('Failed to generate FAQs. Try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImport = async (items: ParsedItem[]) => {
    if (!currentCompany) return;
    
    const validItems = items.filter(i => i.isValid);
    if (validItems.length === 0) {
      toast.error('No valid items to import');
      return;
    }

    setIsProcessing(true);

    try {
      const insertData = validItems.map(item => ({
        company_id: currentCompany.id,
        type: item.type,
        title: item.title,
        question: item.question || null,
        answer: item.answer,
        is_active: true,
      }));

      const { error } = await supabase.from('knowledge_base_items').insert(insertData);

      if (error) throw error;

      toast.success(`Imported ${validItems.length} items successfully`);
      setIsOpen(false);
      resetState();
      onImportComplete();
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Failed to import items');
    } finally {
      setIsProcessing(false);
    }
  };

  const resetState = () => {
    setRawData([]);
    setHeaders([]);
    setColumnMapping({ type: '', title: '', question: '', answer: '' });
    setParsedItems([]);
    setAiPrompt('');
    setAiGeneratedItems([]);
    setActiveTab('csv');
  };

  const removeItem = (index: number, source: 'csv' | 'ai') => {
    if (source === 'csv') {
      setParsedItems(items => items.filter((_, i) => i !== index));
    } else {
      setAiGeneratedItems(items => items.filter((_, i) => i !== index));
    }
  };

  const validCSVCount = parsedItems.filter(i => i.isValid).length;
  const validAICount = aiGeneratedItems.filter(i => i.isValid).length;

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleFileUpload}
        className="hidden"
      />

      <div className="flex gap-2">
        <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
          <Upload className="h-4 w-4 mr-2" />
          Import CSV
        </Button>
        <Button variant="outline" onClick={() => { setIsOpen(true); setActiveTab('ai'); }}>
          <Sparkles className="h-4 w-4 mr-2" />
          AI Generate
        </Button>
      </div>

      <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetState(); }}>
        <DialogContent className="max-w-3xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>Bulk Import Knowledge Base</DialogTitle>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'csv' | 'ai')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="csv" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                CSV Import
              </TabsTrigger>
              <TabsTrigger value="ai" className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                AI Generate
              </TabsTrigger>
            </TabsList>

            <TabsContent value="csv" className="space-y-4 mt-4">
              {rawData.length === 0 ? (
                <Card>
                  <CardContent className="pt-6 text-center">
                    <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground mb-4">
                      Upload a CSV file with your FAQ data
                    </p>
                    <Button onClick={() => fileInputRef.current?.click()}>
                      Choose File
                    </Button>
                    <p className="text-xs text-muted-foreground mt-4">
                      Expected columns: title, answer (required), type, question (optional)
                    </p>
                  </CardContent>
                </Card>
              ) : parsedItems.length === 0 ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Found {rawData.length} rows. Map your CSV columns:
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    {(['title', 'answer', 'type', 'question'] as const).map((field) => (
                      <div key={field} className="space-y-2">
                        <Label className="capitalize">
                          {field} {field === 'title' || field === 'answer' ? '*' : ''}
                        </Label>
                        <Select
                          value={columnMapping[field]}
                          onValueChange={(v) => setColumnMapping({ ...columnMapping, [field]: v })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select column" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">-- Skip --</SelectItem>
                            {headers.map((col) => (
                              <SelectItem key={col} value={col}>{col}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                  <Button onClick={applyMapping} className="w-full">
                    Preview Import
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm">
                      <span className="font-medium">{validCSVCount}</span> valid items ready to import
                    </p>
                    <Button variant="ghost" size="sm" onClick={() => setParsedItems([])}>
                      Re-map columns
                    </Button>
                  </div>
                  <ScrollArea className="h-[300px] border rounded-lg">
                    <div className="p-4 space-y-2">
                      {parsedItems.map((item, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: -10 }}
                          className={`p-3 rounded-lg border flex items-start justify-between ${
                            item.isValid ? 'bg-muted/50' : 'bg-destructive/10 border-destructive/30'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant={item.isValid ? 'secondary' : 'destructive'} className="text-xs">
                                {item.type}
                              </Badge>
                              {item.isValid ? (
                                <Check className="h-4 w-4 text-green-600" />
                              ) : (
                                <AlertCircle className="h-4 w-4 text-destructive" />
                              )}
                            </div>
                            <p className="font-medium truncate">{item.title || '(no title)'}</p>
                            <p className="text-sm text-muted-foreground truncate">{item.answer || '(no answer)'}</p>
                            {item.error && (
                              <p className="text-xs text-destructive mt-1">{item.error}</p>
                            )}
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => removeItem(i, 'csv')}>
                            <X className="h-4 w-4" />
                          </Button>
                        </motion.div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </TabsContent>

            <TabsContent value="ai" className="space-y-4 mt-4">
              {aiGeneratedItems.length === 0 ? (
                <div className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-primary" />
                        AI-Assisted FAQ Generation
                      </CardTitle>
                      <CardDescription>
                        Paste content from your website, documents, or describe your business to generate FAQs
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Textarea
                        placeholder="Paste your business description, website content, or list of services here. The AI will generate relevant FAQs based on this content..."
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        rows={8}
                        className="resize-none"
                      />
                    </CardContent>
                  </Card>
                  <Button 
                    onClick={handleAIGenerate} 
                    disabled={isProcessing || !aiPrompt.trim()}
                    className="w-full"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Generating FAQs...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        Generate FAQs
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm">
                      <span className="font-medium">{validAICount}</span> items generated
                    </p>
                    <Button variant="ghost" size="sm" onClick={() => setAiGeneratedItems([])}>
                      Generate new
                    </Button>
                  </div>
                  <ScrollArea className="h-[300px] border rounded-lg">
                    <div className="p-4 space-y-2">
                      <AnimatePresence>
                        {aiGeneratedItems.map((item, i) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            className="p-3 rounded-lg border bg-muted/50 flex items-start justify-between"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="secondary" className="text-xs">{item.type}</Badge>
                                <Check className="h-4 w-4 text-green-600" />
                              </div>
                              <p className="font-medium">{item.title}</p>
                              {item.question && (
                                <p className="text-sm text-muted-foreground italic">Q: {item.question}</p>
                              )}
                              <p className="text-sm text-muted-foreground line-clamp-2">{item.answer}</p>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => removeItem(i, 'ai')}>
                              <X className="h-4 w-4" />
                            </Button>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </ScrollArea>
                </div>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            {activeTab === 'csv' && parsedItems.length > 0 && (
              <Button 
                onClick={() => handleImport(parsedItems)} 
                disabled={isProcessing || validCSVCount === 0}
              >
                {isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Import {validCSVCount} Items
              </Button>
            )}
            {activeTab === 'ai' && aiGeneratedItems.length > 0 && (
              <Button 
                onClick={() => handleImport(aiGeneratedItems)} 
                disabled={isProcessing || validAICount === 0}
              >
                {isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Import {validAICount} Items
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
