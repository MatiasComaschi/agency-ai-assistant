export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ai_profiles: {
        Row: {
          after_hours_script: string | null
          allowed_actions_json: Json | null
          company_id: string
          disclosure_required: boolean
          disclosure_script: string | null
          escalation_rules_json: Json | null
          greeting_script: string | null
          id: string
          language: string | null
          system_prompt: string | null
          tone: string | null
          updated_at: string
          voice_id: string | null
        }
        Insert: {
          after_hours_script?: string | null
          allowed_actions_json?: Json | null
          company_id: string
          disclosure_required?: boolean
          disclosure_script?: string | null
          escalation_rules_json?: Json | null
          greeting_script?: string | null
          id?: string
          language?: string | null
          system_prompt?: string | null
          tone?: string | null
          updated_at?: string
          voice_id?: string | null
        }
        Update: {
          after_hours_script?: string | null
          allowed_actions_json?: Json | null
          company_id?: string
          disclosure_required?: boolean
          disclosure_script?: string | null
          escalation_rules_json?: Json | null
          greeting_script?: string | null
          id?: string
          language?: string | null
          system_prompt?: string | null
          tone?: string | null
          updated_at?: string
          voice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          company_id: string
          created_at: string
          customer_name: string
          customer_phone: string
          end_datetime: string
          external_event_id: string | null
          id: string
          notes: string | null
          service_id: string
          source: string
          staff_id: string | null
          start_datetime: string
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          customer_name: string
          customer_phone: string
          end_datetime: string
          external_event_id?: string | null
          id?: string
          notes?: string | null
          service_id: string
          source?: string
          staff_id?: string | null
          start_datetime: string
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          customer_name?: string
          customer_phone?: string
          end_datetime?: string
          external_event_id?: string | null
          id?: string
          notes?: string | null
          service_id?: string
          source?: string
          staff_id?: string | null
          start_datetime?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      audits: {
        Row: {
          action: string
          actor_user_id: string
          company_id: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
        }
        Insert: {
          action: string
          actor_user_id: string
          company_id: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
        }
        Update: {
          action?: string
          actor_user_id?: string
          company_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "audits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_connections: {
        Row: {
          company_id: string
          config_json: Json | null
          connected_at: string | null
          created_at: string
          id: string
          last_sync_at: string | null
          provider: string
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          config_json?: Json | null
          connected_at?: string | null
          created_at?: string
          id?: string
          last_sync_at?: string | null
          provider: string
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          config_json?: Json | null
          connected_at?: string | null
          created_at?: string
          id?: string
          last_sync_at?: string | null
          provider?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_connections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          caller_name: string | null
          caller_number: string | null
          company_id: string
          cost_cents: number | null
          duration_seconds: number | null
          ended_at: string | null
          extracted_json: Json | null
          id: string
          internal_notes: string | null
          outcome: string | null
          recording_url: string | null
          sentiment: string | null
          started_at: string
          summary: string | null
          transcript: string | null
        }
        Insert: {
          caller_name?: string | null
          caller_number?: string | null
          company_id: string
          cost_cents?: number | null
          duration_seconds?: number | null
          ended_at?: string | null
          extracted_json?: Json | null
          id?: string
          internal_notes?: string | null
          outcome?: string | null
          recording_url?: string | null
          sentiment?: string | null
          started_at?: string
          summary?: string | null
          transcript?: string | null
        }
        Update: {
          caller_name?: string | null
          caller_number?: string | null
          company_id?: string
          cost_cents?: number | null
          duration_seconds?: number | null
          ended_at?: string | null
          extracted_json?: Json | null
          id?: string
          internal_notes?: string | null
          outcome?: string | null
          recording_url?: string | null
          sentiment?: string | null
          started_at?: string
          summary?: string | null
          transcript?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calls_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          ai_enabled: boolean
          booking_link: string | null
          created_at: string
          fallback_phone: string | null
          id: string
          industry: string | null
          name: string
          primary_phone: string | null
          status: string
          timezone: string
          twilio_number: string | null
          updated_at: string
        }
        Insert: {
          ai_enabled?: boolean
          booking_link?: string | null
          created_at?: string
          fallback_phone?: string | null
          id?: string
          industry?: string | null
          name: string
          primary_phone?: string | null
          status?: string
          timezone?: string
          twilio_number?: string | null
          updated_at?: string
        }
        Update: {
          ai_enabled?: boolean
          booking_link?: string | null
          created_at?: string
          fallback_phone?: string | null
          id?: string
          industry?: string | null
          name?: string
          primary_phone?: string | null
          status?: string
          timezone?: string
          twilio_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      company_holidays: {
        Row: {
          company_id: string
          date: string
          id: string
          is_closed: boolean
          note: string | null
        }
        Insert: {
          company_id: string
          date: string
          id?: string
          is_closed?: boolean
          note?: string | null
        }
        Update: {
          company_id?: string
          date?: string
          id?: string
          is_closed?: boolean
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_holidays_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_hours: {
        Row: {
          close_time: string
          company_id: string
          day_of_week: number
          id: string
          is_closed: boolean
          open_time: string
        }
        Insert: {
          close_time?: string
          company_id: string
          day_of_week: number
          id?: string
          is_closed?: boolean
          open_time?: string
        }
        Update: {
          close_time?: string
          company_id?: string
          day_of_week?: number
          id?: string
          is_closed?: boolean
          open_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_hours_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_invites: {
        Row: {
          accepted_at: string | null
          company_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          company_id: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          role?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          company_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_invites_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      followup_tasks: {
        Row: {
          assigned_to: string | null
          call_id: string | null
          company_id: string
          created_at: string
          due_at: string | null
          id: string
          notes: string | null
          status: string
          title: string
        }
        Insert: {
          assigned_to?: string | null
          call_id?: string | null
          company_id: string
          created_at?: string
          due_at?: string | null
          id?: string
          notes?: string | null
          status?: string
          title: string
        }
        Update: {
          assigned_to?: string | null
          call_id?: string | null
          company_id?: string
          created_at?: string
          due_at?: string | null
          id?: string
          notes?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "followup_tasks_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      industry_templates: {
        Row: {
          after_hours_script: string | null
          allowed_actions_json: Json | null
          created_at: string
          description: string | null
          disclosure_script: string | null
          escalation_rules_json: Json | null
          greeting_script: string | null
          id: string
          industry: string
          is_default: boolean | null
          kb_items_json: Json | null
          language: string | null
          name: string
          system_prompt: string
          tone: string | null
          updated_at: string
          voice_id: string | null
        }
        Insert: {
          after_hours_script?: string | null
          allowed_actions_json?: Json | null
          created_at?: string
          description?: string | null
          disclosure_script?: string | null
          escalation_rules_json?: Json | null
          greeting_script?: string | null
          id?: string
          industry: string
          is_default?: boolean | null
          kb_items_json?: Json | null
          language?: string | null
          name: string
          system_prompt?: string
          tone?: string | null
          updated_at?: string
          voice_id?: string | null
        }
        Update: {
          after_hours_script?: string | null
          allowed_actions_json?: Json | null
          created_at?: string
          description?: string | null
          disclosure_script?: string | null
          escalation_rules_json?: Json | null
          greeting_script?: string | null
          id?: string
          industry?: string
          is_default?: boolean | null
          kb_items_json?: Json | null
          language?: string | null
          name?: string
          system_prompt?: string
          tone?: string | null
          updated_at?: string
          voice_id?: string | null
        }
        Relationships: []
      }
      integrations: {
        Row: {
          company_id: string
          config_json: Json | null
          connected_at: string | null
          created_at: string
          id: string
          last_sync_at: string | null
          provider: string
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          config_json?: Json | null
          connected_at?: string | null
          created_at?: string
          id?: string
          last_sync_at?: string | null
          provider: string
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          config_json?: Json | null
          connected_at?: string | null
          created_at?: string
          id?: string
          last_sync_at?: string | null
          provider?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_base_items: {
        Row: {
          answer: string
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          question: string | null
          tags: string[] | null
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          answer: string
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          question?: string | null
          tags?: string[] | null
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          answer?: string
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          question?: string | null
          tags?: string[] | null
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_base_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          company_id: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          core_prompt: string
          core_prompt_version: string
          id: number
          updated_at: string
        }
        Insert: {
          core_prompt?: string
          core_prompt_version?: string
          id?: number
          updated_at?: string
        }
        Update: {
          core_prompt?: string
          core_prompt_version?: string
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          identifier: string
          request_count: number
          window_start: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          identifier: string
          request_count?: number
          window_start?: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          identifier?: string
          request_count?: number
          window_start?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          code: string
          company_id: string
          converted_at: string | null
          created_at: string
          id: string
          referred_company_id: string | null
          reward_cents: number | null
          status: string
        }
        Insert: {
          code: string
          company_id: string
          converted_at?: string | null
          created_at?: string
          id?: string
          referred_company_id?: string | null
          reward_cents?: number | null
          status?: string
        }
        Update: {
          code?: string
          company_id?: string
          converted_at?: string | null
          created_at?: string
          id?: string
          referred_company_id?: string | null
          reward_cents?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referred_company_id_fkey"
            columns: ["referred_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      service_staff: {
        Row: {
          service_id: string
          staff_id: string
        }
        Insert: {
          service_id: string
          staff_id: string
        }
        Update: {
          service_id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_staff_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_staff_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          duration_minutes: number
          id: string
          is_active: boolean
          name: string
          price: number | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          name: string
          price?: number | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          name?: string
          price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          role: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          role?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_hours: {
        Row: {
          day_of_week: number
          end_time: string
          id: string
          staff_id: string
          start_time: string
        }
        Insert: {
          day_of_week: number
          end_time?: string
          id?: string
          staff_id: string
          start_time?: string
        }
        Update: {
          day_of_week?: number
          end_time?: string
          id?: string
          staff_id?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_hours_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_time_off: {
        Row: {
          created_at: string
          end_datetime: string
          id: string
          reason: string | null
          staff_id: string
          start_datetime: string
        }
        Insert: {
          created_at?: string
          end_datetime: string
          id?: string
          reason?: string | null
          staff_id: string
          start_datetime: string
        }
        Update: {
          created_at?: string
          end_datetime?: string
          id?: string
          reason?: string | null
          staff_id?: string
          start_datetime?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_time_off_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          calls_limit: number
          company_id: string
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          minutes_limit: number
          plan: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          calls_limit?: number
          company_id: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          minutes_limit?: number
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          calls_limit?: number
          company_id?: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          minutes_limit?: number
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          id: string
          priority: string
          reporter_user_id: string
          resolved_at: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          priority?: string
          reporter_user_id: string
          resolved_at?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          priority?: string
          reporter_user_id?: string
          resolved_at?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      system_events: {
        Row: {
          company_id: string | null
          created_at: string
          event_type: string
          id: string
          message: string
          metadata: Json | null
          source: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          message: string
          metadata?: Json | null
          source: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          message?: string
          metadata?: Json | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      testimonials: {
        Row: {
          approved_at: string | null
          author_name: string
          author_title: string | null
          company_id: string
          content: string
          id: string
          is_approved: boolean
          is_public: boolean
          rating: number | null
          submitted_at: string
        }
        Insert: {
          approved_at?: string | null
          author_name: string
          author_title?: string | null
          company_id: string
          content: string
          id?: string
          is_approved?: boolean
          is_public?: boolean
          rating?: number | null
          submitted_at?: string
        }
        Update: {
          approved_at?: string | null
          author_name?: string
          author_title?: string | null
          company_id?: string
          content?: string
          id?: string
          is_approved?: boolean
          is_public?: boolean
          rating?: number | null
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "testimonials_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          ticket_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          ticket_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      usage: {
        Row: {
          calls_count: number
          company_id: string
          created_at: string
          id: string
          minutes_count: number
          month: string
          overage_cents: number
          updated_at: string
        }
        Insert: {
          calls_count?: number
          company_id: string
          created_at?: string
          id?: string
          minutes_count?: number
          month: string
          overage_cents?: number
          updated_at?: string
        }
        Update: {
          calls_count?: number
          company_id?: string
          created_at?: string
          id?: string
          minutes_count?: number
          month?: string
          overage_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webhook_metrics: {
        Row: {
          company_id: string
          created_at: string
          endpoint: string
          error_message: string | null
          id: string
          latency_ms: number
          success: boolean
        }
        Insert: {
          company_id: string
          created_at?: string
          endpoint: string
          error_message?: string | null
          id?: string
          latency_ms?: number
          success?: boolean
        }
        Update: {
          company_id?: string
          created_at?: string
          endpoint?: string
          error_message?: string | null
          id?: string
          latency_ms?: number
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "webhook_metrics_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      white_label_settings: {
        Row: {
          assistant_name: string | null
          company_id: string
          created_at: string
          custom_domain: string | null
          id: string
          is_enabled: boolean
          logo_url: string | null
          primary_color: string | null
          secondary_color: string | null
          updated_at: string
        }
        Insert: {
          assistant_name?: string | null
          company_id: string
          created_at?: string
          custom_domain?: string | null
          id?: string
          is_enabled?: boolean
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          updated_at?: string
        }
        Update: {
          assistant_name?: string | null
          company_id?: string
          created_at?: string
          custom_domain?: string | null
          id?: string
          is_enabled?: boolean
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "white_label_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_referral_code: { Args: never; Returns: string }
      get_user_role_in_company: {
        Args: { _company_id: string; _user_id: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_agency_admin: { Args: { _user_id: string }; Returns: boolean }
      is_company_member: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      is_member_of_company: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "agency_admin" | "company_owner" | "company_staff"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["agency_admin", "company_owner", "company_staff"],
    },
  },
} as const
