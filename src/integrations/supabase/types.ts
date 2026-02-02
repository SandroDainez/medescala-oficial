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
      absences: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          document_url: string | null
          end_date: string
          id: string
          notes: string | null
          reason: string | null
          start_date: string
          status: string
          tenant_id: string
          type: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          document_url?: string | null
          end_date: string
          id?: string
          notes?: string | null
          reason?: string | null
          start_date: string
          status?: string
          tenant_id: string
          type: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          document_url?: string | null
          end_date?: string
          id?: string
          notes?: string | null
          reason?: string | null
          start_date?: string
          status?: string
          tenant_id?: string
          type?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "absences_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "absences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "absences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_sync_events: {
        Row: {
          assignment_id: string | null
          created_at: string | null
          id: string
          last_synced_at: string | null
          native_event_id: string
          platform: string
          shift_hash: string | null
          shift_id: string
          tenant_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          assignment_id?: string | null
          created_at?: string | null
          id?: string
          last_synced_at?: string | null
          native_event_id: string
          platform: string
          shift_hash?: string | null
          shift_id: string
          tenant_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          assignment_id?: string | null
          created_at?: string | null
          id?: string
          last_synced_at?: string | null
          native_event_id?: string
          platform?: string
          shift_hash?: string | null
          shift_id?: string
          tenant_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_sync_events_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "shift_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_sync_events_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_sync_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_sync_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conflict_resolutions: {
        Row: {
          conflict_date: string
          conflict_details: Json | null
          created_at: string
          id: string
          justification: string | null
          kept_assignment_id: string | null
          kept_sector_name: string | null
          kept_shift_time: string | null
          plantonista_id: string
          plantonista_name: string
          removed_assignment_id: string | null
          removed_sector_name: string | null
          removed_shift_time: string | null
          resolution_type: string
          resolved_at: string
          resolved_by: string | null
          tenant_id: string
        }
        Insert: {
          conflict_date: string
          conflict_details?: Json | null
          created_at?: string
          id?: string
          justification?: string | null
          kept_assignment_id?: string | null
          kept_sector_name?: string | null
          kept_shift_time?: string | null
          plantonista_id: string
          plantonista_name: string
          removed_assignment_id?: string | null
          removed_sector_name?: string | null
          removed_shift_time?: string | null
          resolution_type: string
          resolved_at?: string
          resolved_by?: string | null
          tenant_id: string
        }
        Update: {
          conflict_date?: string
          conflict_details?: Json | null
          created_at?: string
          id?: string
          justification?: string | null
          kept_assignment_id?: string | null
          kept_sector_name?: string | null
          kept_shift_time?: string | null
          plantonista_id?: string
          plantonista_name?: string
          removed_assignment_id?: string | null
          removed_sector_name?: string | null
          removed_shift_time?: string | null
          resolution_type?: string
          resolved_at?: string
          resolved_by?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conflict_resolutions_plantonista_id_fkey"
            columns: ["plantonista_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conflict_resolutions_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conflict_resolutions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gps_access_grants: {
        Row: {
          created_at: string
          expires_at: string | null
          granted_at: string
          granted_by: string | null
          id: string
          notes: string | null
          reason: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          notes?: string | null
          reason: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          notes?: string | null
          reason?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gps_access_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gps_access_grants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gps_access_grants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gps_access_logs: {
        Row: {
          accessed_at: string
          admin_user_id: string
          assignment_id: string
          id: string
          ip_address: string | null
          target_user_id: string
          tenant_id: string
          user_agent: string | null
        }
        Insert: {
          accessed_at?: string
          admin_user_id: string
          assignment_id: string
          id?: string
          ip_address?: string | null
          target_user_id: string
          tenant_id: string
          user_agent?: string | null
        }
        Update: {
          accessed_at?: string
          admin_user_id?: string
          assignment_id?: string
          id?: string
          ip_address?: string | null
          target_user_id?: string
          tenant_id?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      login_cpf_rate_limits: {
        Row: {
          attempts: number
          first_attempt_at: string
          key: string
          last_attempt_at: string
        }
        Insert: {
          attempts?: number
          first_attempt_at?: string
          key: string
          last_attempt_at?: string
        }
        Update: {
          attempts?: number
          first_attempt_at?: string
          key?: string
          last_attempt_at?: string
        }
        Relationships: []
      }
      memberships: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          read_at: string | null
          shift_assignment_id: string | null
          tenant_id: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          read_at?: string | null
          shift_assignment_id?: string | null
          tenant_id: string
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          read_at?: string | null
          shift_assignment_id?: string | null
          tenant_id?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_shift_assignment_id_fkey"
            columns: ["shift_assignment_id"]
            isOneToOne: false
            referencedRelation: "shift_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_access_permissions: {
        Row: {
          expires_at: string | null
          granted_at: string
          granted_by: string | null
          id: string
          notes: string | null
          reason: string | null
          tenant_id: string
          user_id: string
        }
        Insert: {
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          notes?: string | null
          reason?: string | null
          tenant_id: string
          user_id: string
        }
        Update: {
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          notes?: string | null
          reason?: string | null
          tenant_id?: string
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string | null
          id: string
          month: number
          notes: string | null
          status: string
          tenant_id: string
          total_hours: number
          total_shifts: number
          total_value: number
          updated_at: string
          updated_by: string | null
          user_id: string
          year: number
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          month: number
          notes?: string | null
          status?: string
          tenant_id: string
          total_hours?: number
          total_shifts?: number
          total_value?: number
          updated_at?: string
          updated_by?: string | null
          user_id: string
          year: number
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          month?: number
          notes?: string | null
          status?: string
          tenant_id?: string
          total_hours?: number
          total_shifts?: number
          total_value?: number
          updated_at?: string
          updated_by?: string | null
          user_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pii_access_permissions: {
        Row: {
          expires_at: string | null
          granted_at: string
          granted_by: string | null
          id: string
          notes: string | null
          reason: string | null
          tenant_id: string
          user_id: string
        }
        Insert: {
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          notes?: string | null
          reason?: string | null
          tenant_id: string
          user_id: string
        }
        Update: {
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          notes?: string | null
          reason?: string | null
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pii_access_permissions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pii_access_permissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pii_access_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pii_audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: string | null
          new_data: Json | null
          old_data: Json | null
          record_id: string
          table_name: string
          tenant_id: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id: string
          table_name: string
          tenant_id?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string
          table_name?: string
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          active: boolean
          created_at: string
          features: Json | null
          id: string
          max_users: number
          min_users: number
          name: string
          price_monthly: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          features?: Json | null
          id?: string
          max_users: number
          min_users?: number
          name: string
          price_monthly?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          features?: Json | null
          id?: string
          max_users?: number
          min_users?: number
          name?: string
          price_monthly?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          must_change_password: boolean
          name: string | null
          profile_type: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          must_change_password?: boolean
          name?: string | null
          profile_type?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          must_change_password?: boolean
          name?: string | null
          profile_type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles_private: {
        Row: {
          address_enc: string | null
          bank_account_enc: string | null
          bank_agency_enc: string | null
          bank_name_enc: string | null
          cpf_enc: string | null
          created_at: string
          crm_enc: string | null
          phone_enc: string | null
          pix_key_enc: string | null
          rqe_enc: string | null
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address_enc?: string | null
          bank_account_enc?: string | null
          bank_agency_enc?: string | null
          bank_name_enc?: string | null
          cpf_enc?: string | null
          created_at?: string
          crm_enc?: string | null
          phone_enc?: string | null
          pix_key_enc?: string | null
          rqe_enc?: string | null
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address_enc?: string | null
          bank_account_enc?: string | null
          bank_agency_enc?: string | null
          bank_name_enc?: string | null
          cpf_enc?: string | null
          created_at?: string
          crm_enc?: string | null
          phone_enc?: string | null
          pix_key_enc?: string | null
          rqe_enc?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_private_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_device_tokens: {
        Row: {
          app_version: string | null
          created_at: string | null
          device_model: string | null
          device_token: string
          id: string
          is_active: boolean | null
          onesignal_player_id: string | null
          os_version: string | null
          platform: string
          tenant_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string | null
          device_model?: string | null
          device_token: string
          id?: string
          is_active?: boolean | null
          onesignal_player_id?: string | null
          os_version?: string | null
          platform: string
          tenant_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          app_version?: string | null
          created_at?: string | null
          device_model?: string | null
          device_token?: string
          id?: string
          is_active?: boolean | null
          onesignal_player_id?: string | null
          os_version?: string | null
          platform?: string
          tenant_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_device_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_device_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_notification_queue: {
        Row: {
          created_at: string | null
          data: Json | null
          error_message: string | null
          id: string
          message: string
          notification_type: string
          scheduled_for: string
          sent_at: string | null
          shift_id: string | null
          status: string | null
          tenant_id: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          data?: Json | null
          error_message?: string | null
          id?: string
          message: string
          notification_type: string
          scheduled_for: string
          sent_at?: string | null
          shift_id?: string | null
          status?: string | null
          tenant_id: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          data?: Json | null
          error_message?: string | null
          id?: string
          message?: string
          notification_type?: string
          scheduled_for?: string
          sent_at?: string | null
          shift_id?: string | null
          status?: string | null
          tenant_id?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_notification_queue_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_notification_queue_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_notification_queue_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_finalizations: {
        Row: {
          created_at: string
          finalized_at: string
          finalized_by: string
          id: string
          month: number
          notes: string | null
          sector_id: string | null
          tenant_id: string
          year: number
        }
        Insert: {
          created_at?: string
          finalized_at?: string
          finalized_by: string
          id?: string
          month: number
          notes?: string | null
          sector_id?: string | null
          tenant_id: string
          year: number
        }
        Update: {
          created_at?: string
          finalized_at?: string
          finalized_by?: string
          id?: string
          month?: number
          notes?: string | null
          sector_id?: string | null
          tenant_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "schedule_finalizations_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_movements: {
        Row: {
          created_at: string
          destination_assignment_id: string | null
          destination_sector_id: string | null
          destination_sector_name: string | null
          destination_shift_date: string | null
          destination_shift_time: string | null
          id: string
          month: number
          movement_type: string
          performed_at: string
          performed_by: string
          reason: string | null
          source_assignment_id: string | null
          source_sector_id: string | null
          source_sector_name: string | null
          source_shift_date: string | null
          source_shift_time: string | null
          tenant_id: string
          user_id: string
          user_name: string
          year: number
        }
        Insert: {
          created_at?: string
          destination_assignment_id?: string | null
          destination_sector_id?: string | null
          destination_sector_name?: string | null
          destination_shift_date?: string | null
          destination_shift_time?: string | null
          id?: string
          month: number
          movement_type: string
          performed_at?: string
          performed_by: string
          reason?: string | null
          source_assignment_id?: string | null
          source_sector_id?: string | null
          source_sector_name?: string | null
          source_shift_date?: string | null
          source_shift_time?: string | null
          tenant_id: string
          user_id: string
          user_name: string
          year: number
        }
        Update: {
          created_at?: string
          destination_assignment_id?: string | null
          destination_sector_id?: string | null
          destination_sector_name?: string | null
          destination_shift_date?: string | null
          destination_shift_time?: string | null
          id?: string
          month?: number
          movement_type?: string
          performed_at?: string
          performed_by?: string
          reason?: string | null
          source_assignment_id?: string | null
          source_sector_id?: string | null
          source_sector_name?: string | null
          source_shift_date?: string | null
          source_shift_time?: string | null
          tenant_id?: string
          user_id?: string
          user_name?: string
          year?: number
        }
        Relationships: []
      }
      sector_expenses: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          expense_name: string
          expense_type: string
          id: string
          month: number
          notes: string | null
          sector_id: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
          year: number
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          expense_name: string
          expense_type: string
          id?: string
          month: number
          notes?: string | null
          sector_id: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          year: number
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          expense_name?: string
          expense_type?: string
          id?: string
          month?: number
          notes?: string | null
          sector_id?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          year?: number
        }
        Relationships: []
      }
      sector_memberships: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          sector_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          sector_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          sector_id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sector_memberships_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sector_memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sector_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sector_revenues: {
        Row: {
          created_at: string
          created_by: string | null
          fixed_revenue: number
          id: string
          month: number
          notes: string | null
          sector_id: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
          variable_revenue: number
          year: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          fixed_revenue?: number
          id?: string
          month: number
          notes?: string | null
          sector_id: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          variable_revenue?: number
          year: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          fixed_revenue?: number
          id?: string
          month?: number
          notes?: string | null
          sector_id?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          variable_revenue?: number
          year?: number
        }
        Relationships: []
      }
      sectors: {
        Row: {
          active: boolean
          allowed_checkin_radius_meters: number | null
          checkin_enabled: boolean
          checkin_tolerance_minutes: number
          color: string | null
          created_at: string
          created_by: string | null
          default_day_value: number | null
          default_night_value: number | null
          description: string | null
          id: string
          name: string
          reference_latitude: number | null
          reference_longitude: number | null
          require_gps_checkin: boolean
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          allowed_checkin_radius_meters?: number | null
          checkin_enabled?: boolean
          checkin_tolerance_minutes?: number
          color?: string | null
          created_at?: string
          created_by?: string | null
          default_day_value?: number | null
          default_night_value?: number | null
          description?: string | null
          id?: string
          name: string
          reference_latitude?: number | null
          reference_longitude?: number | null
          require_gps_checkin?: boolean
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          allowed_checkin_radius_meters?: number | null
          checkin_enabled?: boolean
          checkin_tolerance_minutes?: number
          color?: string | null
          created_at?: string
          created_by?: string | null
          default_day_value?: number | null
          default_night_value?: number | null
          description?: string | null
          id?: string
          name?: string
          reference_latitude?: number | null
          reference_longitude?: number | null
          require_gps_checkin?: boolean
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sectors_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_assignment_locations: {
        Row: {
          assignment_id: string
          checkin_latitude: number | null
          checkin_longitude: number | null
          checkout_latitude: number | null
          checkout_longitude: number | null
          created_at: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assignment_id: string
          checkin_latitude?: number | null
          checkin_longitude?: number | null
          checkout_latitude?: number | null
          checkout_longitude?: number | null
          created_at?: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assignment_id?: string
          checkin_latitude?: number | null
          checkin_longitude?: number | null
          checkout_latitude?: number | null
          checkout_longitude?: number | null
          created_at?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_assignment_locations_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: true
            referencedRelation: "shift_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_assignment_locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_assignment_locations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_assignments: {
        Row: {
          assigned_value: number | null
          checkin_at: string | null
          checkout_at: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          shift_id: string
          status: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          assigned_value?: number | null
          checkin_at?: string | null
          checkout_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          shift_id: string
          status?: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          assigned_value?: number | null
          checkin_at?: string | null
          checkout_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          shift_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_assignments_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_assignments_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_entries: {
        Row: {
          created_at: string
          data: string
          escala_id: string | null
          id: string
          plantonista_id: string
          setor_id: string
          source_assignment_id: string | null
          source_shift_id: string | null
          status_valor: Database["public"]["Enums"]["value_status"]
          tenant_id: string
          updated_at: string
          valor: number | null
        }
        Insert: {
          created_at?: string
          data: string
          escala_id?: string | null
          id?: string
          plantonista_id: string
          setor_id: string
          source_assignment_id?: string | null
          source_shift_id?: string | null
          status_valor?: Database["public"]["Enums"]["value_status"]
          tenant_id: string
          updated_at?: string
          valor?: number | null
        }
        Update: {
          created_at?: string
          data?: string
          escala_id?: string | null
          id?: string
          plantonista_id?: string
          setor_id?: string
          source_assignment_id?: string | null
          source_shift_id?: string | null
          status_valor?: Database["public"]["Enums"]["value_status"]
          tenant_id?: string
          updated_at?: string
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_entries_plantonista_id_fkey"
            columns: ["plantonista_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_entries_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_entries_source_assignment_id_fkey"
            columns: ["source_assignment_id"]
            isOneToOne: false
            referencedRelation: "shift_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_entries_source_shift_id_fkey"
            columns: ["source_shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_offers: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          message: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          shift_id: string
          status: string
          tenant_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          message?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shift_id: string
          status?: string
          tenant_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          message?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shift_id?: string
          status?: string
          tenant_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_offers_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_offers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_offers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          base_value: number | null
          created_at: string
          created_by: string | null
          end_time: string
          hospital: string
          id: string
          location: string | null
          notes: string | null
          sector_id: string | null
          shift_date: string
          start_time: string
          tenant_id: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          base_value?: number | null
          created_at?: string
          created_by?: string | null
          end_time: string
          hospital: string
          id?: string
          location?: string | null
          notes?: string | null
          sector_id?: string | null
          shift_date: string
          start_time: string
          tenant_id: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          base_value?: number | null
          created_at?: string
          created_by?: string | null
          end_time?: string
          hospital?: string
          id?: string
          location?: string | null
          notes?: string | null
          sector_id?: string | null
          shift_date?: string
          start_time?: string
          tenant_id?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shifts_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      super_admins: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      swap_requests: {
        Row: {
          admin_notes: string | null
          created_at: string
          created_by: string | null
          id: string
          origin_assignment_id: string
          reason: string | null
          requester_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["swap_status"]
          target_user_id: string | null
          tenant_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          origin_assignment_id: string
          reason?: string | null
          requester_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["swap_status"]
          target_user_id?: string | null
          tenant_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          origin_assignment_id?: string
          reason?: string | null
          requester_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["swap_status"]
          target_user_id?: string | null
          tenant_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "swap_requests_origin_assignment_id_fkey"
            columns: ["origin_assignment_id"]
            isOneToOne: false
            referencedRelation: "shift_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swap_requests_requester_id_profiles_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swap_requests_target_user_id_profiles_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swap_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          setting_key: string
          setting_value: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          setting_key: string
          setting_value: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      tenants: {
        Row: {
          billing_status: string
          created_at: string
          created_by: string | null
          current_users_count: number
          id: string
          is_unlimited: boolean
          logo_url: string | null
          max_shifts_per_month: number
          max_users: number
          name: string
          plan: Database["public"]["Enums"]["tenant_plan"]
          plan_id: string
          slug: string
          trial_ends_at: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          billing_status?: string
          created_at?: string
          created_by?: string | null
          current_users_count?: number
          id?: string
          is_unlimited?: boolean
          logo_url?: string | null
          max_shifts_per_month?: number
          max_users?: number
          name: string
          plan?: Database["public"]["Enums"]["tenant_plan"]
          plan_id: string
          slug: string
          trial_ends_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          billing_status?: string
          created_at?: string
          created_by?: string | null
          current_users_count?: number
          id?: string
          is_unlimited?: boolean
          logo_url?: string | null
          max_shifts_per_month?: number
          max_users?: number
          name?: string
          plan?: Database["public"]["Enums"]["tenant_plan"]
          plan_id?: string
          slug?: string
          trial_ends_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenants_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notification_preferences: {
        Row: {
          calendar_id: string | null
          calendar_sync_enabled: boolean | null
          created_at: string | null
          push_enabled: boolean | null
          reminder_24h_enabled: boolean | null
          reminder_2h_enabled: boolean | null
          shift_start_enabled: boolean | null
          swap_notifications_enabled: boolean | null
          tenant_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          calendar_id?: string | null
          calendar_sync_enabled?: boolean | null
          created_at?: string | null
          push_enabled?: boolean | null
          reminder_24h_enabled?: boolean | null
          reminder_2h_enabled?: boolean | null
          shift_start_enabled?: boolean | null
          swap_notifications_enabled?: boolean | null
          tenant_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          calendar_id?: string | null
          calendar_sync_enabled?: boolean | null
          created_at?: string | null
          push_enabled?: boolean | null
          reminder_24h_enabled?: boolean | null
          reminder_2h_enabled?: boolean | null
          shift_start_enabled?: boolean | null
          swap_notifications_enabled?: boolean | null
          tenant_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notification_preferences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
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
          role?: Database["public"]["Enums"]["app_role"]
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
      user_sector_values: {
        Row: {
          created_at: string
          created_by: string | null
          day_value: number | null
          id: string
          month: number | null
          night_value: number | null
          sector_id: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
          user_id: string
          year: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          day_value?: number | null
          id?: string
          month?: number | null
          night_value?: number | null
          sector_id: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
          year?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          day_value?: number | null
          id?: string
          month?: number | null
          night_value?: number | null
          sector_id?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_sector_values_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_sector_values_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_sector_values_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_trial_end_date: { Args: never; Returns: string }
      can_access_payment: {
        Args: { _payment_tenant_id: string; _payment_user_id: string }
        Returns: boolean
      }
      can_add_user_to_tenant: { Args: { _tenant_id: string }; Returns: boolean }
      can_admin_access_profile: {
        Args: { _profile_id: string }
        Returns: boolean
      }
      can_view_profile: { Args: { _profile_id: string }; Returns: boolean }
      can_view_shift: {
        Args: { _shift_id: string; _tenant_id: string }
        Returns: boolean
      }
      check_tenant_shift_limit: {
        Args: { _tenant_id: string }
        Returns: boolean
      }
      check_tenant_user_limit: {
        Args: { _tenant_id: string }
        Returns: boolean
      }
      cleanup_old_notifications: { Args: never; Returns: number }
      create_tenant_with_admin: {
        Args: { _name: string; _slug: string }
        Returns: string
      }
      decide_swap_request: {
        Args: { _decision: string; _swap_request_id: string }
        Returns: boolean
      }
      get_all_tenants_admin: {
        Args: never
        Returns: {
          billing_status: string
          created_at: string
          current_users_count: number
          id: string
          is_unlimited: boolean
          max_users: number
          name: string
          plan_name: string
          slug: string
          trial_ends_at: string
        }[]
      }
      get_assignment_location_with_audit: {
        Args: { _assignment_id: string; _tenant_id: string }
        Returns: {
          assignment_id: string
          checkin_latitude: number
          checkin_longitude: number
          checkout_latitude: number
          checkout_longitude: number
          created_at: string
          tenant_id: string
          updated_at: string
          user_id: string
        }[]
      }
      get_gabs_tenant_id: { Args: never; Returns: string }
      get_profile_private_with_audit: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: {
          address_enc: string
          bank_account_enc: string
          bank_agency_enc: string
          bank_name_enc: string
          cpf_enc: string
          crm_enc: string
          phone_enc: string
          pix_key_enc: string
          rqe_enc: string
          tenant_id: string
          user_id: string
        }[]
      }
      get_shift_assignments_range: {
        Args: { _end: string; _start: string; _tenant_id: string }
        Returns: {
          assigned_value: number
          id: string
          name: string
          shift_id: string
          status: string
          user_id: string
        }[]
      }
      get_shift_assignments_without_gps: {
        Args: { _tenant_id: string }
        Returns: {
          assigned_value: number
          checkin_at: string
          checkout_at: string
          created_at: string
          created_by: string
          id: string
          notes: string
          shift_id: string
          status: string
          tenant_id: string
          updated_at: string
          updated_by: string
          user_id: string
        }[]
      }
      get_shift_offers_pending_range: {
        Args: { _end: string; _start: string; _tenant_id: string }
        Returns: {
          id: string
          message: string
          name: string
          shift_id: string
          status: string
          user_id: string
        }[]
      }
      get_shift_roster: {
        Args: { _end: string; _start: string; _tenant_id: string }
        Returns: {
          name: string
          shift_id: string
          status: string
          user_id: string
        }[]
      }
      get_shift_tenant_id: { Args: { _shift_id: string }; Returns: string }
      get_taken_shift_ids: {
        Args: { _start: string; _tenant_id: string }
        Returns: {
          shift_id: string
        }[]
      }
      get_tenant_access_status: {
        Args: { _tenant_id: string }
        Returns: {
          days_remaining: number
          is_unlimited: boolean
          status: string
          trial_ends_at: string
        }[]
      }
      get_tenant_member_names: {
        Args: { _tenant_id: string }
        Returns: {
          name: string
          user_id: string
        }[]
      }
      get_tenant_plan_info: {
        Args: { _tenant_id: string }
        Returns: {
          current_month_shifts: number
          current_users: number
          max_shifts_per_month: number
          max_users: number
          plan: Database["public"]["Enums"]["tenant_plan"]
        }[]
      }
      get_tenant_subscription: {
        Args: { _tenant_id: string }
        Returns: {
          billing_status: string
          current_users: number
          features: Json
          max_users: number
          plan_name: string
          price_monthly: number
          trial_ends_at: string
        }[]
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_user_tenants: {
        Args: { _user_id: string }
        Returns: {
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          tenant_name: string
        }[]
      }
      has_gabs_bypass: { Args: { _user_id?: string }; Returns: boolean }
      has_gps_access:
        | { Args: { _tenant_id: string }; Returns: boolean }
        | { Args: { _tenant_id: string; _user_id: string }; Returns: boolean }
      has_payment_access:
        | { Args: { _tenant_id: string }; Returns: boolean }
        | { Args: { _tenant_id: string; _user_id: string }; Returns: boolean }
      has_pii_access:
        | { Args: { _tenant_id: string }; Returns: boolean }
        | { Args: { _tenant_id: string; _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_assigned_to_shift: {
        Args: { _shift_id: string; _user_id?: string }
        Returns: boolean
      }
      is_sector_member_of_shift: {
        Args: { _shift_id: string; _user_id?: string }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id?: string }; Returns: boolean }
      is_tenant_access_active: {
        Args: { _tenant_id: string }
        Returns: boolean
      }
      is_tenant_admin: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      is_tenant_member: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      update_tenant_access: {
        Args: {
          _billing_status?: string
          _is_unlimited?: boolean
          _tenant_id: string
          _trial_ends_at?: string
        }
        Returns: boolean
      }
      user_has_active_membership: {
        Args: { _user_id: string }
        Returns: boolean
      }
      verify_schedule_reopen_password: {
        Args: { _password: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      swap_status: "pending" | "approved" | "rejected" | "cancelled"
      tenant_plan: "free" | "pro" | "premium"
      value_status: "COM_VALOR" | "SEM_VALOR"
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
      app_role: ["admin", "user"],
      swap_status: ["pending", "approved", "rejected", "cancelled"],
      tenant_plan: ["free", "pro", "premium"],
      value_status: ["COM_VALOR", "SEM_VALOR"],
    },
  },
} as const
