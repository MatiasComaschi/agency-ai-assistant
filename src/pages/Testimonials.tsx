import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { Star, MessageSquare, Check, X, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useCompany } from '@/contexts/CompanyContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface Testimonial {
  id: string;
  company_id: string;
  author_name: string;
  author_title: string | null;
  content: string;
  rating: number | null;
  is_public: boolean;
  is_approved: boolean;
  submitted_at: string;
  approved_at: string | null;
}

export default function Testimonials() {
  const { currentCompany } = useCompany();
  const { isAgencyAdmin } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [newTestimonial, setNewTestimonial] = useState({
    author_name: '',
    author_title: '',
    content: '',
    rating: 5,
  });

  useEffect(() => {
    if (currentCompany) {
      fetchTestimonials();
    }
  }, [currentCompany]);

  const fetchTestimonials = async () => {
    if (!currentCompany) return;
    setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from('testimonials')
        .select('*')
        .eq('company_id', currentCompany.id)
        .order('submitted_at', { ascending: false });

      if (error) throw error;
      setTestimonials((data || []) as Testimonial[]);
    } catch (error) {
      console.error('Error fetching testimonials:', error);
      toast.error('Failed to load testimonials');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!currentCompany) return;
    if (!newTestimonial.author_name || !newTestimonial.content) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      const { error } = await supabase
        .from('testimonials')
        .insert({
          company_id: currentCompany.id,
          author_name: newTestimonial.author_name,
          author_title: newTestimonial.author_title || null,
          content: newTestimonial.content,
          rating: newTestimonial.rating,
        });

      if (error) throw error;

      toast.success('Testimonial submitted for review');
      setIsSubmitOpen(false);
      setNewTestimonial({ author_name: '', author_title: '', content: '', rating: 5 });
      fetchTestimonials();
    } catch (error) {
      console.error('Error submitting testimonial:', error);
      toast.error('Failed to submit testimonial');
    }
  };

  const handleApprove = async (id: string, approved: boolean) => {
    try {
      const { error } = await supabase
        .from('testimonials')
        .update({ 
          is_approved: approved,
          approved_at: approved ? new Date().toISOString() : null,
        })
        .eq('id', id);

      if (error) throw error;

      toast.success(approved ? 'Testimonial approved' : 'Testimonial rejected');
      fetchTestimonials();
    } catch (error) {
      console.error('Error updating testimonial:', error);
      toast.error('Failed to update testimonial');
    }
  };

  const handleTogglePublic = async (id: string, isPublic: boolean) => {
    try {
      const { error } = await supabase
        .from('testimonials')
        .update({ is_public: isPublic })
        .eq('id', id);

      if (error) throw error;

      toast.success(isPublic ? 'Testimonial made public' : 'Testimonial made private');
      fetchTestimonials();
    } catch (error) {
      console.error('Error updating testimonial:', error);
      toast.error('Failed to update testimonial');
    }
  };

  const renderStars = (rating: number | null) => {
    if (!rating) return null;
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-4 w-4 ${star <= rating ? 'text-yellow-500 fill-yellow-500' : 'text-muted'}`}
          />
        ))}
      </div>
    );
  };

  if (!currentCompany) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Select a company to view testimonials</p>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Testimonials</h1>
          <p className="text-muted-foreground">Collect and manage customer testimonials</p>
        </div>
        <Dialog open={isSubmitOpen} onOpenChange={setIsSubmitOpen}>
          <DialogTrigger asChild>
            <Button className="bg-accent hover:bg-accent/90">
              <MessageSquare className="h-4 w-4 mr-2" />
              Add Testimonial
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Submit Testimonial</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="author_name">Name *</Label>
                <Input
                  id="author_name"
                  value={newTestimonial.author_name}
                  onChange={(e) => setNewTestimonial(prev => ({ ...prev, author_name: e.target.value }))}
                  placeholder="John Smith"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="author_title">Title/Role</Label>
                <Input
                  id="author_title"
                  value={newTestimonial.author_title}
                  onChange={(e) => setNewTestimonial(prev => ({ ...prev, author_title: e.target.value }))}
                  placeholder="Business Owner"
                />
              </div>
              <div className="space-y-2">
                <Label>Rating</Label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setNewTestimonial(prev => ({ ...prev, rating: star }))}
                      className="p-1 hover:scale-110 transition-transform"
                    >
                      <Star
                        className={`h-6 w-6 ${star <= newTestimonial.rating ? 'text-yellow-500 fill-yellow-500' : 'text-muted'}`}
                      />
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="content">Testimonial *</Label>
                <Textarea
                  id="content"
                  value={newTestimonial.content}
                  onChange={(e) => setNewTestimonial(prev => ({ ...prev, content: e.target.value }))}
                  placeholder="Share your experience with our AI receptionist..."
                  rows={4}
                />
              </div>
              <Button onClick={handleSubmit} className="w-full bg-accent hover:bg-accent/90">
                Submit Testimonial
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Submitted</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{testimonials.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Approved</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {testimonials.filter(t => t.is_approved).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Public</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">
              {testimonials.filter(t => t.is_public && t.is_approved).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Testimonials List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {testimonials.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="py-12 text-center text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No testimonials yet. Invite customers to share their experience!</p>
            </CardContent>
          </Card>
        ) : (
          testimonials.map((testimonial) => (
            <Card key={testimonial.id} className={!testimonial.is_approved ? 'opacity-75' : ''}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{testimonial.author_name}</CardTitle>
                    {testimonial.author_title && (
                      <CardDescription>{testimonial.author_title}</CardDescription>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {testimonial.is_approved ? (
                      <Badge className="bg-green-500">Approved</Badge>
                    ) : (
                      <Badge variant="outline">Pending</Badge>
                    )}
                    {testimonial.is_public && testimonial.is_approved && (
                      <Badge variant="secondary">Public</Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {renderStars(testimonial.rating)}
                <p className="text-muted-foreground italic">"{testimonial.content}"</p>
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(testimonial.submitted_at), 'MMM d, yyyy')}
                  </span>
                  {isAgencyAdmin && (
                    <div className="flex gap-2">
                      {!testimonial.is_approved && (
                        <>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleApprove(testimonial.id, true)}
                          >
                            <Check className="h-3 w-3 mr-1" />
                            Approve
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => handleApprove(testimonial.id, false)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                      {testimonial.is_approved && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleTogglePublic(testimonial.id, !testimonial.is_public)}
                        >
                          {testimonial.is_public ? (
                            <>
                              <EyeOff className="h-3 w-3 mr-1" />
                              Make Private
                            </>
                          ) : (
                            <>
                              <Eye className="h-3 w-3 mr-1" />
                              Make Public
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Embed Code */}
      <Card>
        <CardHeader>
          <CardTitle>Embed Testimonials</CardTitle>
          <CardDescription>
            Add public testimonials to your website
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-muted p-4 rounded-lg font-mono text-sm overflow-x-auto">
            {`<iframe src="${window.location.origin}/embed/testimonials/${currentCompany.id}" 
  width="100%" 
  height="400" 
  frameborder="0">
</iframe>`}
          </div>
          <Button 
            variant="outline" 
            className="mt-3"
            onClick={() => {
              navigator.clipboard.writeText(
                `<iframe src="${window.location.origin}/embed/testimonials/${currentCompany.id}" width="100%" height="400" frameborder="0"></iframe>`
              );
              toast.success('Embed code copied!');
            }}
          >
            Copy Embed Code
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}
