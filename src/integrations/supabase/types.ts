export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_users: {
        Row: {
          created_at: string | null
          display_name: string | null
          id: string
          role: string
          status: string
        }
        Insert: {
          created_at?: string | null
          display_name?: string | null
          id: string
          role?: string
          status?: string
        }
        Update: {
          created_at?: string | null
          display_name?: string | null
          id?: string
          role?: string
          status?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          active_loans: number | null
          address: string | null
          balance: number | null
          calle: string | null
          created_at: string | null
          document: string | null
          document_type: string | null
          email: string | null
          first_name: string | null
          gps_lat: number | null
          gps_lng: number | null
          id: string
          last_loan_at: string | null
          last_name: string | null
          last_payment_at: string | null
          late_loans: number | null
          monthly_income: number | null
          municipio: string | null
          name: string
          nickname: string | null
          notes: string | null
          numero: string | null
          occupation: string | null
          paid_loans: number | null
          phone: string | null
          phone_alt: string | null
          photo: string | null
          provincia: string | null
          references: Json | null
          referencia: string | null
          sector: string | null
          sex: string | null
          status: string | null
          total_borrowed: number | null
          total_interest: number | null
          total_loans: number | null
          total_paid: number | null
          trust_level: string | null
          trust_score: number | null
          user_id: string
          whatsapp: string | null
          workplace: string | null
        }
        Insert: {
          active_loans?: number | null
          address?: string | null
          balance?: number | null
          calle?: string | null
          created_at?: string | null
          document?: string | null
          document_type?: string | null
          email?: string | null
          first_name?: string | null
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          last_loan_at?: string | null
          last_name?: string | null
          last_payment_at?: string | null
          late_loans?: number | null
          monthly_income?: number | null
          municipio?: string | null
          name: string
          nickname?: string | null
          notes?: string | null
          numero?: string | null
          occupation?: string | null
          paid_loans?: number | null
          phone?: string | null
          phone_alt?: string | null
          photo?: string | null
          provincia?: string | null
          references?: Json | null
          referencia?: string | null
          sector?: string | null
          sex?: string | null
          status?: string | null
          total_borrowed?: number | null
          total_interest?: number | null
          total_loans?: number | null
          total_paid?: number | null
          trust_level?: string | null
          trust_score?: number | null
          user_id: string
          whatsapp?: string | null
          workplace?: string | null
        }
        Update: {
          active_loans?: number | null
          address?: string | null
          balance?: number | null
          calle?: string | null
          created_at?: string | null
          document?: string | null
          document_type?: string | null
          email?: string | null
          first_name?: string | null
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          last_loan_at?: string | null
          last_name?: string | null
          last_payment_at?: string | null
          late_loans?: number | null
          monthly_income?: number | null
          municipio?: string | null
          name?: string
          nickname?: string | null
          notes?: string | null
          numero?: string | null
          occupation?: string | null
          paid_loans?: number | null
          phone?: string | null
          phone_alt?: string | null
          photo?: string | null
          provincia?: string | null
          references?: Json | null
          referencia?: string | null
          sector?: string | null
          sex?: string | null
          status?: string | null
          total_borrowed?: number | null
          total_interest?: number | null
          total_loans?: number | null
          total_paid?: number | null
          trust_level?: string | null
          trust_score?: number | null
          user_id?: string
          whatsapp?: string | null
          workplace?: string | null
        }
        Relationships: []
      }
      documents: {
        Row: {
          client_id: string
          created_at: string | null
          id: string
          loan_id: string | null
          mime_type: string | null
          name: string
          notes: string | null
          path: string
          size: number | null
          type: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string | null
          id?: string
          loan_id?: string | null
          mime_type?: string | null
          name: string
          notes?: string | null
          path: string
          size?: number | null
          type: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string | null
          id?: string
          loan_id?: string | null
          mime_type?: string | null
          name?: string
          notes?: string | null
          path?: string
          size?: number | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      email_messages: {
        Row: {
          attempts: number
          created_at: string | null
          dedupe_key: string | null
          entity_id: string | null
          entity_type: string | null
          event_type: string
          html_body: string
          id: string
          last_error: string | null
          max_attempts: number
          next_retry_at: string | null
          recipient_email: string
          recipient_name: string | null
          recipient_type: string
          recipient_user_id: string | null
          sent_at: string | null
          status: string
          subject: string
          template_key: string
        }
        Insert: {
          attempts?: number
          created_at?: string | null
          dedupe_key?: string | null
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          html_body: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          recipient_email: string
          recipient_name?: string | null
          recipient_type: string
          recipient_user_id?: string | null
          sent_at?: string | null
          status?: string
          subject: string
          template_key: string
        }
        Update: {
          attempts?: number
          created_at?: string | null
          dedupe_key?: string | null
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          html_body?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          recipient_email?: string
          recipient_name?: string | null
          recipient_type?: string
          recipient_user_id?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          template_key?: string
        }
        Relationships: []
      }
      installments: {
        Row: {
          amount: number
          balance: number
          capital: number
          client_id: string
          due_date: string
          id: string
          interest: number
          late_amount: number | null
          late_days: number | null
          loan_id: string
          number: number
          paid_amount: number | null
          paid_at: string | null
          paid_late_amount: number | null
          status: string | null
        }
        Insert: {
          amount: number
          balance: number
          capital: number
          client_id: string
          due_date: string
          id?: string
          interest: number
          late_amount?: number | null
          late_days?: number | null
          loan_id: string
          number: number
          paid_amount?: number | null
          paid_at?: string | null
          paid_late_amount?: number | null
          status?: string | null
        }
        Update: {
          amount?: number
          balance?: number
          capital?: number
          client_id?: string
          due_date?: string
          id?: string
          interest?: number
          late_amount?: number | null
          late_days?: number | null
          loan_id?: string
          number?: number
          paid_amount?: number | null
          paid_at?: string | null
          paid_late_amount?: number | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "installments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          amortization_type: string | null
          amount: number
          cancelled_at: string | null
          client_id: string
          created_at: string | null
          deleted_at: string | null
          deleted_reason: string | null
          end_date: string | null
          first_payment_date: string
          frequency: string
          guarantee: string | null
          id: string
          installment_amount: number
          installments: number
          interest_rate: number
          interest_type: string
          late_days: number | null
          late_interest_rate: number | null
          loan_id: string
          notes: string | null
          open_ended: boolean | null
          paid_amount: number | null
          paid_at: string | null
          paid_installments: number | null
          payment_day: number | null
          prepaid_balance: number | null
          progress: number | null
          remaining_amount: number | null
          start_date: string
          status: string | null
          total_amount: number
          total_interest: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amortization_type?: string | null
          amount: number
          cancelled_at?: string | null
          client_id: string
          created_at?: string | null
          deleted_at?: string | null
          deleted_reason?: string | null
          end_date?: string | null
          first_payment_date: string
          frequency: string
          guarantee?: string | null
          id?: string
          installment_amount: number
          installments: number
          interest_rate: number
          interest_type: string
          late_days?: number | null
          late_interest_rate?: number | null
          loan_id: string
          notes?: string | null
          open_ended?: boolean | null
          paid_amount?: number | null
          paid_at?: string | null
          paid_installments?: number | null
          payment_day?: number | null
          prepaid_balance?: number | null
          progress?: number | null
          remaining_amount?: number | null
          start_date: string
          status?: string | null
          total_amount: number
          total_interest: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amortization_type?: string | null
          amount?: number
          cancelled_at?: string | null
          client_id?: string
          created_at?: string | null
          deleted_at?: string | null
          deleted_reason?: string | null
          end_date?: string | null
          first_payment_date?: string
          frequency?: string
          guarantee?: string | null
          id?: string
          installment_amount?: number
          installments?: number
          interest_rate?: number
          interest_type?: string
          late_days?: number | null
          late_interest_rate?: number | null
          loan_id?: string
          notes?: string | null
          open_ended?: boolean | null
          paid_amount?: number | null
          paid_at?: string | null
          paid_installments?: number | null
          payment_day?: number | null
          prepaid_balance?: number | null
          progress?: number | null
          remaining_amount?: number | null
          start_date?: string
          status?: string | null
          total_amount?: number
          total_interest?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          capital_amount: number | null
          client_id: string
          created_at: string | null
          id: string
          installment_id: string | null
          interest_amount: number | null
          late_amount: number | null
          loan_id: string | null
          method: string | null
          notes: string | null
          payment_date: string
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          status: string | null
          type: string | null
          user_id: string
        }
        Insert: {
          amount: number
          capital_amount?: number | null
          client_id: string
          created_at?: string | null
          id?: string
          installment_id?: string | null
          interest_amount?: number | null
          late_amount?: number | null
          loan_id?: string | null
          method?: string | null
          notes?: string | null
          payment_date: string
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string | null
          type?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          capital_amount?: number | null
          client_id?: string
          created_at?: string | null
          id?: string
          installment_id?: string | null
          interest_amount?: number | null
          late_amount?: number | null
          loan_id?: string | null
          method?: string | null
          notes?: string | null
          payment_date?: string
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string | null
          type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "installments"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          created_at: string | null
          id: string
          name: string
          notes: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          notes?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          notes?: string | null
          user_id?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          billing_cycle: string
          created_at: string | null
          currency: string
          description: string | null
          features: Json | null
          id: string
          is_active: boolean
          max_clients: number | null
          name: string
          price: number
        }
        Insert: {
          billing_cycle?: string
          created_at?: string | null
          currency?: string
          description?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean
          max_clients?: number | null
          name: string
          price?: number
        }
        Update: {
          billing_cycle?: string
          created_at?: string | null
          currency?: string
          description?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean
          max_clients?: number | null
          name?: string
          price?: number
        }
        Relationships: []
      }
      platform_config: {
        Row: {
          account_name: string | null
          account_number: string | null
          bank_name: string | null
          id: string
          payment_phone: string | null
          updated_at: string | null
        }
        Insert: {
          account_name?: string | null
          account_number?: string | null
          bank_name?: string | null
          id?: string
          payment_phone?: string | null
          updated_at?: string | null
        }
        Update: {
          account_name?: string | null
          account_number?: string | null
          bank_name?: string | null
          id?: string
          payment_phone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      settings: {
        Row: {
          account_name: string | null
          account_number: string | null
          bank_name: string | null
          business_address: string | null
          business_email: string | null
          business_name: string | null
          business_phone: string | null
          country: string | null
          currency: string | null
          default_frequency: string | null
          default_installments: number | null
          grace_days: number | null
          id: string
          language: string | null
          late_interest_rate: number | null
          loan_id_prefix: string | null
          notify_upcoming_days: number | null
          onboarding_completed: boolean | null
          personal_email: string | null
          personal_name: string | null
          personal_phone: string | null
          timezone: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_name?: string | null
          account_number?: string | null
          bank_name?: string | null
          business_address?: string | null
          business_email?: string | null
          business_name?: string | null
          business_phone?: string | null
          country?: string | null
          currency?: string | null
          default_frequency?: string | null
          default_installments?: number | null
          grace_days?: number | null
          id?: string
          language?: string | null
          late_interest_rate?: number | null
          loan_id_prefix?: string | null
          notify_upcoming_days?: number | null
          onboarding_completed?: boolean | null
          personal_email?: string | null
          personal_name?: string | null
          personal_phone?: string | null
          timezone?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_name?: string | null
          account_number?: string | null
          bank_name?: string | null
          business_address?: string | null
          business_email?: string | null
          business_name?: string | null
          business_phone?: string | null
          country?: string | null
          currency?: string | null
          default_frequency?: string | null
          default_installments?: number | null
          grace_days?: number | null
          id?: string
          language?: string | null
          late_interest_rate?: number | null
          loan_id_prefix?: string | null
          notify_upcoming_days?: number | null
          onboarding_completed?: boolean | null
          personal_email?: string | null
          personal_name?: string | null
          personal_phone?: string | null
          timezone?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      smtp_config: {
        Row: {
          enabled: boolean
          from_email: string
          from_name: string
          host: string
          id: string
          pass: string
          port: number
          secure: boolean
          updated_at: string | null
          username: string
        }
        Insert: {
          enabled?: boolean
          from_email?: string
          from_name?: string
          host?: string
          id?: string
          pass?: string
          port?: number
          secure?: boolean
          updated_at?: string | null
          username?: string
        }
        Update: {
          enabled?: boolean
          from_email?: string
          from_name?: string
          host?: string
          id?: string
          pass?: string
          port?: number
          secure?: boolean
          updated_at?: string | null
          username?: string
        }
        Relationships: []
      }
      subscription_payments: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          method: string
          notes: string | null
          payment_date: string
          status: string
          subscription_id: string
          target_plan_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          method?: string
          notes?: string | null
          payment_date?: string
          status?: string
          subscription_id: string
          target_plan_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          method?: string
          notes?: string | null
          payment_date?: string
          status?: string
          subscription_id?: string
          target_plan_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_payments_target_plan_id_fkey"
            columns: ["target_plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string | null
          ends_at: string | null
          id: string
          plan_id: string
          starts_at: string
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          ends_at?: string | null
          id?: string
          plan_id: string
          starts_at?: string
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          ends_at?: string | null
          id?: string
          plan_id?: string
          starts_at?: string
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          attachments: Json | null
          body: string
          created_at: string | null
          id: string
          is_staff: boolean
          ticket_id: string
          user_id: string
        }
        Insert: {
          attachments?: Json | null
          body: string
          created_at?: string | null
          id?: string
          is_staff?: boolean
          ticket_id: string
          user_id: string
        }
        Update: {
          attachments?: Json | null
          body?: string
          created_at?: string | null
          id?: string
          is_staff?: boolean
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          attachments: Json | null
          body: string
          closed_at: string | null
          created_at: string | null
          id: string
          priority: string
          status: string
          subject: string
          type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          attachments?: Json | null
          body: string
          closed_at?: string | null
          created_at?: string | null
          id?: string
          priority?: string
          status?: string
          subject: string
          type?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          attachments?: Json | null
          body?: string
          closed_at?: string | null
          created_at?: string | null
          id?: string
          priority?: string
          status?: string
          subject?: string
          type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_list_users: { Args: Record<PropertyKey, never>; Returns: Json }
      admin_usage_by_user: { Args: Record<PropertyKey, never>; Returns: Json }
      admin_usage_stats: {
        Args: {
          p_from_month: string | null
        }
        Returns: Json
      }
      calc_late_amount: {
        Args: {
          p_amount: number
          p_late_days: number
          p_rate: number
        }
        Returns: Json
      }
      calc_late_days: {
        Args: {
          p_due: string
          p_grace: number
        }
        Returns: Json
      }
      dashboard_summary: {
        Args: {
          p_user_id?: string | null
        }
        Returns: Json
      }
      loan_balances: {
        Args: {
          p_user_id?: string | null
        }
        Returns: Json
      }
      reports_cartera: {
        Args: {
          p_user_id?: string | null
          p_as_of?: string | null
        }
        Returns: Json
      }
      get_loan_stats: {
        Args: {
          p_from_date: string | null
          p_to_date: string | null
          p_user_id: string
        }
        Returns: Json
      }
      is_admin: { Args: Record<PropertyKey, never>; Returns: Json }
      process_cascade_payment: {
        Args: {
          p_amount: number
          p_grace_days: number | null
          p_include_mora: boolean
          p_late_interest_rate: number
          p_loan_id: string
          p_method: string
          p_notes: string
          p_payment_date: string
          p_user_id: string
        }
        Returns: Json
      }
      process_installment_payment: {
        Args: {
          p_amount: number
          p_grace_days: number | null
          p_include_mora: boolean
          p_installment_id: string
          p_late_interest_rate: number
          p_loan_id: string
          p_method: string
          p_notes: string
          p_payment_date: string
          p_user_id: string
        }
        Returns: Json
      }
      reconcile_money: {
        Args: {
          p_user_id: string | null
        }
        Returns: Json
      }
      restore_user_backup: {
        Args: {
          p_clients: Json | null
          p_documents: Json | null
          p_installments: Json | null
          p_loans: Json | null
          p_payments: Json | null
          p_settings: Json | null
          p_user_id: string
        }
        Returns: Json
      }
      save_loan: {
        Args: {
          p_amortization_type: string
          p_amount: number
          p_client_id: string
          p_end_date: string | null
          p_first_payment_date: string
          p_frequency: string
          p_installment_amount: number
          p_installments: number
          p_interest_rate: number
          p_late_interest_rate: number
          p_loan_id: string | null
          p_notes: string
          p_open_ended: boolean
          p_payment_day: number | null
          p_remaining_amount: number
          p_schedule?: Json
          p_start_date: string
          p_total_amount: number
          p_total_interest: number
          p_visible_id: string | null
        }
        Returns: Json
      }
      today_rd: { Args: Record<PropertyKey, never>; Returns: Json }
      update_all_loan_statuses: { Args: Record<PropertyKey, never>; Returns: Json }
      update_client_stats: {
        Args: {
          p_client_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type Tables = {
  [K in keyof Database["public"]["Tables"]]: Database["public"]["Tables"][K]["Row"];
};

export type TablesInsert = {
  [K in keyof Database["public"]["Tables"]]: Database["public"]["Tables"][K]["Insert"];
};

export type TablesUpdate = {
  [K in keyof Database["public"]["Tables"]]: Database["public"]["Tables"][K]["Update"];
};

export type Enums = Database["public"]["Enums"];

export type Constants = Record<string, never>;
