import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Clock,
  Phone,
  Bot,
  Check,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import type { BusinessHours, Holiday, CreateCompanyFormData } from '@/types';

const steps = [
  { id: 1, title: 'Company Basics', icon: Building2 },
  { id: 2, title: 'Business Hours', icon: Clock },
  { id: 3, title: 'Contact Routing', icon: Phone },
  { id: 4, title: 'AI Preset', icon: Bot },
];

const industries = [
  'Healthcare',
  'Legal',
  'Real Estate',
  'Automotive',
  'Home Services',
  'Hospitality',
  'Retail',
  'Professional Services',
  'Other',
];

const timezones = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
];

const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

const defaultBusinessHours: BusinessHours = {
  monday: { open: '09:00', close: '17:00', closed: false },
  tuesday: { open: '09:00', close: '17:00', closed: false },
  wednesday: { open: '09:00', close: '17:00', closed: false },
  thursday: { open: '09:00', close: '17:00', closed: false },
  friday: { open: '09:00', close: '17:00', closed: false },
  saturday: { open: '09:00', close: '17:00', closed: true },
  sunday: { open: '09:00', close: '17:00', closed: true },
};

const step1Schema = z.object({
  name: z.string().min(2, 'Company name is required'),
  industry: z.string().min(1, 'Please select an industry'),
  timezone: z.string().min(1, 'Please select a timezone'),
});

export default function CreateCompany() {
  const navigate = useNavigate();
  const { refetchCompanies, setCurrentCompanyId } = useCompany();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Form state
  const [formData, setFormData] = useState<CreateCompanyFormData>({
    name: '',
    industry: '',
    timezone: 'America/New_York',
    business_hours: defaultBusinessHours,
    holidays: [],
    primary_phone: '',
    fallback_phone: '',
    booking_link: '',
    ai_tone: 'professional',
    ai_voice: 'female',
    ai_language: 'en-US',
  });

  const updateField = <K extends keyof CreateCompanyFormData>(
    key: K,
    value: CreateCompanyFormData[K]
  ) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const updateBusinessHours = (
    day: keyof BusinessHours,
    field: 'open' | 'close' | 'closed',
    value: string | boolean
  ) => {
    setFormData((prev) => ({
      ...prev,
      business_hours: {
        ...prev.business_hours,
        [day]: {
          ...prev.business_hours[day],
          [field]: value,
        },
      },
    }));
  };

  const addHoliday = () => {
    setFormData((prev) => ({
      ...prev,
      holidays: [...prev.holidays, { date: '', name: '' }],
    }));
  };

  const updateHoliday = (index: number, field: 'date' | 'name', value: string) => {
    setFormData((prev) => ({
      ...prev,
      holidays: prev.holidays.map((h, i) =>
        i === index ? { ...h, [field]: value } : h
      ),
    }));
  };

  const removeHoliday = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      holidays: prev.holidays.filter((_, i) => i !== index),
    }));
  };

  const validateStep = (step: number): boolean => {
    setErrors({});

    if (step === 1) {
      const result = step1Schema.safeParse({
        name: formData.name,
        industry: formData.industry,
        timezone: formData.timezone,
      });
      if (!result.success) {
        const fieldErrors: Record<string, string> = {};
        result.error.errors.forEach((err) => {
          if (err.path[0]) {
            fieldErrors[String(err.path[0])] = err.message;
          }
        });
        setErrors(fieldErrors);
        return false;
      }
    }

    return true;
  };

  const nextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, 4));
    }
  };

  const prevStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
    if (!validateStep(currentStep)) return;

    setIsSubmitting(true);

    try {
      const insertData = {
        name: formData.name,
        industry: formData.industry,
        timezone: formData.timezone,
        business_hours: formData.business_hours as unknown as Record<string, unknown>,
        holidays: formData.holidays.filter((h) => h.date && h.name) as unknown as Record<string, unknown>[],
        primary_phone: formData.primary_phone || null,
        fallback_phone: formData.fallback_phone || null,
        booking_link: formData.booking_link || null,
        ai_tone: formData.ai_tone,
        ai_voice: formData.ai_voice,
        ai_language: formData.ai_language,
      };

      const { data, error } = await supabase
        .from('companies')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;

      toast.success('Company created successfully!');
      await refetchCompanies();
      setCurrentCompanyId(data.id);
      navigate('/company');
    } catch (error) {
      console.error('Error creating company:', error);
      toast.error('Failed to create company. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-3xl mx-auto"
    >
      {/* Header */}
      <div className="mb-8">
        <Button
          variant="ghost"
          onClick={() => navigate('/agency')}
          className="mb-4 -ml-2"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
        <h1 className="text-3xl font-display font-bold text-foreground">
          Create New Company
        </h1>
        <p className="text-muted-foreground mt-1">
          Set up a new client company in just a few steps
        </p>
      </div>

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div
                className={`flex items-center justify-center h-10 w-10 rounded-full border-2 transition-colors ${
                  currentStep > step.id
                    ? 'bg-accent border-accent text-accent-foreground'
                    : currentStep === step.id
                    ? 'border-accent text-accent'
                    : 'border-border text-muted-foreground'
                }`}
              >
                {currentStep > step.id ? (
                  <Check className="h-5 w-5" />
                ) : (
                  <step.icon className="h-5 w-5" />
                )}
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`h-0.5 w-16 md:w-24 mx-2 transition-colors ${
                    currentStep > step.id ? 'bg-accent' : 'bg-border'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2">
          {steps.map((step) => (
            <span
              key={step.id}
              className={`text-xs font-medium ${
                currentStep >= step.id ? 'text-foreground' : 'text-muted-foreground'
              }`}
            >
              {step.title}
            </span>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <Card>
        <AnimatePresence mode="wait">
          {currentStep === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <CardHeader>
                <CardTitle>Company Basics</CardTitle>
                <CardDescription>
                  Enter the basic information about your client's company
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Company Name *</Label>
                  <Input
                    id="name"
                    placeholder="Acme Dental Clinic"
                    value={formData.name}
                    onChange={(e) => updateField('name', e.target.value)}
                  />
                  {errors.name && (
                    <p className="text-sm text-destructive">{errors.name}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="industry">Industry *</Label>
                  <Select
                    value={formData.industry}
                    onValueChange={(value) => updateField('industry', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select industry" />
                    </SelectTrigger>
                    <SelectContent>
                      {industries.map((ind) => (
                        <SelectItem key={ind} value={ind}>
                          {ind}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.industry && (
                    <p className="text-sm text-destructive">{errors.industry}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone *</Label>
                  <Select
                    value={formData.timezone}
                    onValueChange={(value) => updateField('timezone', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select timezone" />
                    </SelectTrigger>
                    <SelectContent>
                      {timezones.map((tz) => (
                        <SelectItem key={tz} value={tz}>
                          {tz.replace('_', ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.timezone && (
                    <p className="text-sm text-destructive">{errors.timezone}</p>
                  )}
                </div>
              </CardContent>
            </motion.div>
          )}

          {currentStep === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <CardHeader>
                <CardTitle>Business Hours</CardTitle>
                <CardDescription>
                  Set the weekly schedule and any holidays
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  {days.map((day) => (
                    <div
                      key={day}
                      className="flex items-center justify-between gap-4 p-3 bg-muted/50 rounded-lg"
                    >
                      <div className="flex items-center gap-3 min-w-[120px]">
                        <Switch
                          checked={!formData.business_hours[day].closed}
                          onCheckedChange={(checked) =>
                            updateBusinessHours(day, 'closed', !checked)
                          }
                        />
                        <span className="font-medium capitalize">{day}</span>
                      </div>
                      {!formData.business_hours[day].closed && (
                        <div className="flex items-center gap-2">
                          <Input
                            type="time"
                            value={formData.business_hours[day].open}
                            onChange={(e) =>
                              updateBusinessHours(day, 'open', e.target.value)
                            }
                            className="w-32"
                          />
                          <span className="text-muted-foreground">to</span>
                          <Input
                            type="time"
                            value={formData.business_hours[day].close}
                            onChange={(e) =>
                              updateBusinessHours(day, 'close', e.target.value)
                            }
                            className="w-32"
                          />
                        </div>
                      )}
                      {formData.business_hours[day].closed && (
                        <span className="text-muted-foreground">Closed</span>
                      )}
                    </div>
                  ))}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Holidays</Label>
                    <Button variant="outline" size="sm" onClick={addHoliday}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add Holiday
                    </Button>
                  </div>
                  {formData.holidays.map((holiday, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        type="date"
                        value={holiday.date}
                        onChange={(e) => updateHoliday(index, 'date', e.target.value)}
                        className="w-40"
                      />
                      <Input
                        placeholder="Holiday name"
                        value={holiday.name}
                        onChange={(e) => updateHoliday(index, 'name', e.target.value)}
                        className="flex-1"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeHoliday(index)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </motion.div>
          )}

          {currentStep === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <CardHeader>
                <CardTitle>Contact Routing</CardTitle>
                <CardDescription>
                  Configure how calls should be routed and escalated
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="primary_phone">Primary Phone Number</Label>
                  <Input
                    id="primary_phone"
                    type="tel"
                    placeholder="+1 (555) 123-4567"
                    value={formData.primary_phone}
                    onChange={(e) => updateField('primary_phone', e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    The main number for escalations
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fallback_phone">Fallback Phone Number</Label>
                  <Input
                    id="fallback_phone"
                    type="tel"
                    placeholder="+1 (555) 987-6543"
                    value={formData.fallback_phone}
                    onChange={(e) => updateField('fallback_phone', e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Used when primary is unavailable
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="booking_link">Booking Link</Label>
                  <Input
                    id="booking_link"
                    type="url"
                    placeholder="https://calendly.com/your-company"
                    value={formData.booking_link}
                    onChange={(e) => updateField('booking_link', e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Link to your online booking system
                  </p>
                </div>
              </CardContent>
            </motion.div>
          )}

          {currentStep === 4 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <CardHeader>
                <CardTitle>AI Receptionist Preset</CardTitle>
                <CardDescription>
                  Configure the personality and voice of your AI receptionist
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="ai_tone">Conversation Tone</Label>
                  <Select
                    value={formData.ai_tone}
                    onValueChange={(value) => updateField('ai_tone', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="professional">Professional</SelectItem>
                      <SelectItem value="friendly">Friendly</SelectItem>
                      <SelectItem value="casual">Casual</SelectItem>
                      <SelectItem value="formal">Formal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ai_voice">Voice</Label>
                  <Select
                    value={formData.ai_voice}
                    onValueChange={(value) => updateField('ai_voice', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="male">Male</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ai_language">Language</Label>
                  <Select
                    value={formData.ai_language}
                    onValueChange={(value) => updateField('ai_language', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en-US">English (US)</SelectItem>
                      <SelectItem value="en-GB">English (UK)</SelectItem>
                      <SelectItem value="es-ES">Spanish</SelectItem>
                      <SelectItem value="fr-FR">French</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="mt-6 p-4 bg-muted/50 rounded-lg">
                  <h4 className="font-medium mb-2">Preview</h4>
                  <p className="text-sm text-muted-foreground italic">
                    "Hello! Thank you for calling {formData.name || '[Company Name]'}. How may I
                    help you today?"
                  </p>
                </div>
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Navigation Buttons */}
        <div className="flex justify-between p-6 pt-0">
          <Button
            variant="outline"
            onClick={prevStep}
            disabled={currentStep === 1}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Previous
          </Button>
          {currentStep < 4 ? (
            <Button onClick={nextStep} className="bg-accent hover:bg-accent/90">
              Next
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="bg-accent hover:bg-accent/90"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              Create Company
            </Button>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
