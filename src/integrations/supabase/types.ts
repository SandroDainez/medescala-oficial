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
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
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
          address: string | null
          bank_account: string | null
          bank_agency: string | null
          bank_name: string | null
          cpf: string | null
          created_at: string
          crm: string | null
          id: string
          name: string | null
          phone: string | null
          pix_key: string | null
          profile_type: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          bank_account?: string | null
          bank_agency?: string | null
          bank_name?: string | null
          cpf?: string | null
          created_at?: string
          crm?: string | null
          id: string
          name?: string | null
          phone?: string | null
          pix_key?: string | null
          profile_type?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          bank_account?: string | null
          bank_agency?: string | null
          bank_name?: string | null
          cpf?: string | null
          created_at?: string
          crm?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          pix_key?: string | null
          profile_type?: string | null
          updated_at?: string
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
      sectors: {
        Row: {
          active: boolean
          color: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
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
      shift_assignments: {
        Row: {
          assigned_value: number
          checkin_at: string | null
          checkout_at: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          shift_id: string
          status: string
          tenant_id: string | null
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          assigned_value?: number
          checkin_at?: string | null
          checkout_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          shift_id: string
          status?: string
          tenant_id?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          assigned_value?: number
          checkin_at?: string | null
          checkout_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          shift_id?: string
          status?: string
          tenant_id?: string | null
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
      shifts: {
        Row: {
          base_value: number
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
          tenant_id: string | null
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          base_value?: number
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
          tenant_id?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          base_value?: number
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
          tenant_id?: string | null
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
      tenants: {
        Row: {
          billing_status: string
          created_at: string
          created_by: string | null
          current_users_count: number
          id: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_add_user_to_tenant: { Args: { _tenant_id: string }; Returns: boolean }
      check_tenant_shift_limit: {
        Args: { _tenant_id: string }
        Returns: boolean
      }
      check_tenant_user_limit: {
        Args: { _tenant_id: string }
        Returns: boolean
      }
      create_tenant_with_admin: {
        Args: { _name: string; _slug: string }
        Returns: string
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
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
    }
    Enums: {
      app_role: "admin" | "user"
      swap_status: "pending" | "approved" | "rejected" | "cancelled"
      tenant_plan: "free" | "pro" | "premium"
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
    },
  },
} as const
