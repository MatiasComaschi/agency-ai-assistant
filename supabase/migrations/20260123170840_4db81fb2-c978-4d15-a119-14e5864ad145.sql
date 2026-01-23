-- Create industry_templates table for storing reusable templates
CREATE TABLE public.industry_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  industry TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL DEFAULT 'You are a friendly and professional receptionist.',
  greeting_script TEXT DEFAULT 'Hello! Thank you for calling. How may I help you today?',
  disclosure_script TEXT DEFAULT 'Please note that you are speaking with an AI assistant.',
  after_hours_script TEXT DEFAULT 'We are currently closed. Please leave a message.',
  tone TEXT DEFAULT 'professional',
  language TEXT DEFAULT 'en-US',
  voice_id TEXT DEFAULT 'female',
  allowed_actions_json JSONB DEFAULT '{"faq": true, "quote": false, "booking": true, "escalate": true, "reschedule": false}'::jsonb,
  escalation_rules_json JSONB DEFAULT '{"escalateOnRequest": true, "escalateOnComplaint": true, "escalateAfterMinutes": 5}'::jsonb,
  kb_items_json JSONB DEFAULT '[]'::jsonb,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.industry_templates ENABLE ROW LEVEL SECURITY;

-- Only agency admins can manage templates
CREATE POLICY "Agency admins can manage templates"
ON public.industry_templates
FOR ALL
USING (is_agency_admin(auth.uid()));

-- Anyone authenticated can view templates (for applying)
CREATE POLICY "Authenticated users can view templates"
ON public.industry_templates
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Create trigger for updated_at
CREATE TRIGGER update_industry_templates_updated_at
BEFORE UPDATE ON public.industry_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add sentiment column to calls for risk filtering
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS sentiment TEXT DEFAULT NULL;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS duration_seconds INTEGER DEFAULT NULL;

-- Insert default industry templates
INSERT INTO public.industry_templates (name, industry, description, system_prompt, kb_items_json, is_default) VALUES
(
  'Medical Practice',
  'Healthcare',
  'Template for medical offices, clinics, and healthcare providers',
  'You are a professional medical office receptionist. Be empathetic, HIPAA-conscious, and never provide medical advice. Focus on scheduling, general inquiries, and directing urgent matters appropriately.',
  '[{"type": "faq", "title": "Appointment Scheduling", "answer": "We offer appointments Monday through Friday. Same-day appointments may be available for urgent matters."}, {"type": "policies", "title": "Cancellation Policy", "answer": "Please provide 24 hours notice for cancellations to avoid a fee."}, {"type": "faq", "title": "Insurance", "answer": "We accept most major insurance plans. Please have your insurance card ready when you call."}]'::jsonb,
  true
),
(
  'Legal Office',
  'Legal Services',
  'Template for law firms and legal practices',
  'You are a professional legal office receptionist. Be formal, maintain confidentiality, and never provide legal advice. Focus on scheduling consultations and taking messages.',
  '[{"type": "faq", "title": "Consultations", "answer": "Initial consultations can be scheduled by phone. Please have details of your matter ready."}, {"type": "policies", "title": "Confidentiality", "answer": "All communications with our office are treated as confidential."}, {"type": "services", "title": "Practice Areas", "answer": "We handle various legal matters. A brief consultation will help determine if we can assist you."}]'::jsonb,
  true
),
(
  'Home Services',
  'Home Services',
  'Template for plumbers, electricians, HVAC, and contractors',
  'You are a friendly home services dispatcher. Be helpful, gather service details, and schedule appointments efficiently. Collect address and problem description.',
  '[{"type": "faq", "title": "Service Areas", "answer": "We serve the local metropolitan area and surrounding suburbs."}, {"type": "pricing", "title": "Service Calls", "answer": "Service call fees vary. An estimate will be provided before work begins."}, {"type": "faq", "title": "Emergency Service", "answer": "We offer 24/7 emergency service for urgent situations."}]'::jsonb,
  true
),
(
  'Restaurant',
  'Food & Hospitality',
  'Template for restaurants and food service businesses',
  'You are a warm and welcoming restaurant host. Help with reservations, provide menu information, and handle takeout orders. Be enthusiastic about the dining experience.',
  '[{"type": "faq", "title": "Reservations", "answer": "We accept reservations for parties of all sizes. Walk-ins are also welcome based on availability."}, {"type": "faq", "title": "Hours", "answer": "Please check our website for current hours as they may vary."}, {"type": "services", "title": "Private Events", "answer": "We offer private dining and catering services for special events."}]'::jsonb,
  true
),
(
  'Real Estate',
  'Real Estate',
  'Template for real estate agencies and property management',
  'You are a professional real estate office assistant. Help with property inquiries, schedule viewings, and connect callers with agents. Be knowledgeable about the local market.',
  '[{"type": "faq", "title": "Property Viewings", "answer": "We can schedule property viewings at your convenience with one of our agents."}, {"type": "services", "title": "Services", "answer": "We handle buying, selling, and property management services."}, {"type": "faq", "title": "Market Info", "answer": "Our agents can provide current market analysis and property valuations."}]'::jsonb,
  true
);