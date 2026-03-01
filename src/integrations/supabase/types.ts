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
      admin_permissions: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_enabled: boolean
          label: string
          permission_key: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_enabled?: boolean
          label: string
          permission_key: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_enabled?: boolean
          label?: string
          permission_key?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          end_time: string | null
          event_date: string
          event_time: string | null
          id: string
          location: string | null
          mail_id: string | null
          participant_ids: string[] | null
          participants: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          end_time?: string | null
          event_date: string
          event_time?: string | null
          id?: string
          location?: string | null
          mail_id?: string | null
          participant_ids?: string[] | null
          participants?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          end_time?: string | null
          event_date?: string
          event_time?: string | null
          id?: string
          location?: string | null
          mail_id?: string | null
          participant_ids?: string[] | null
          participants?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_mail_id_fkey"
            columns: ["mail_id"]
            isOneToOne: false
            referencedRelation: "mails"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_fields: {
        Row: {
          created_at: string | null
          display_order: number
          field_label: string
          field_name: string
          field_options: Json | null
          field_type: string
          id: string
          is_active: boolean
          is_required: boolean
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_order?: number
          field_label: string
          field_name: string
          field_options?: Json | null
          field_type?: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_order?: number
          field_label?: string
          field_name?: string
          field_options?: Json | null
          field_type?: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          updated_at?: string | null
        }
        Relationships: []
      }
      mail_assignments: {
        Row: {
          assigned_by: string
          assigned_to: string
          completed_at: string | null
          created_at: string | null
          id: string
          instructions: string | null
          mail_id: string
          status: string
          step_number: number
        }
        Insert: {
          assigned_by: string
          assigned_to: string
          completed_at?: string | null
          created_at?: string | null
          id?: string
          instructions?: string | null
          mail_id: string
          status?: string
          step_number: number
        }
        Update: {
          assigned_by?: string
          assigned_to?: string
          completed_at?: string | null
          created_at?: string | null
          id?: string
          instructions?: string | null
          mail_id?: string
          status?: string
          step_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "mail_assignments_mail_id_fkey"
            columns: ["mail_id"]
            isOneToOne: false
            referencedRelation: "mails"
            referencedColumns: ["id"]
          },
        ]
      }
      mail_processing_history: {
        Row: {
          action: string
          agent_id: string
          created_at: string | null
          id: string
          mail_id: string
          notes: string | null
        }
        Insert: {
          action: string
          agent_id: string
          created_at?: string | null
          id?: string
          mail_id: string
          notes?: string | null
        }
        Update: {
          action?: string
          agent_id?: string
          created_at?: string | null
          id?: string
          mail_id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mail_processing_history_mail_id_fkey"
            columns: ["mail_id"]
            isOneToOne: false
            referencedRelation: "mails"
            referencedColumns: ["id"]
          },
        ]
      }
      mails: {
        Row: {
          addressed_to: string | null
          ai_draft: string | null
          assigned_agent_id: string | null
          attachment_url: string | null
          comments: string | null
          created_at: string | null
          current_step: number | null
          deadline_at: string | null
          deposit_time: string | null
          description: string | null
          document_summary: string | null
          id: string
          is_read: boolean | null
          mail_type: string | null
          mail_type_other: string | null
          priority: Database["public"]["Enums"]["mail_priority"]
          qr_code_data: string
          reception_date: string | null
          reference_number: string
          registered_by: string
          sender_address: string | null
          sender_city: string | null
          sender_country: string | null
          sender_email: string | null
          sender_name: string
          sender_organization: string | null
          sender_phone: string | null
          status: Database["public"]["Enums"]["mail_status"]
          subject: string
          updated_at: string | null
          workflow_completed_at: string | null
          workflow_started_at: string | null
        }
        Insert: {
          addressed_to?: string | null
          ai_draft?: string | null
          assigned_agent_id?: string | null
          attachment_url?: string | null
          comments?: string | null
          created_at?: string | null
          current_step?: number | null
          deadline_at?: string | null
          deposit_time?: string | null
          description?: string | null
          document_summary?: string | null
          id?: string
          is_read?: boolean | null
          mail_type?: string | null
          mail_type_other?: string | null
          priority?: Database["public"]["Enums"]["mail_priority"]
          qr_code_data: string
          reception_date?: string | null
          reference_number: string
          registered_by: string
          sender_address?: string | null
          sender_city?: string | null
          sender_country?: string | null
          sender_email?: string | null
          sender_name: string
          sender_organization?: string | null
          sender_phone?: string | null
          status?: Database["public"]["Enums"]["mail_status"]
          subject: string
          updated_at?: string | null
          workflow_completed_at?: string | null
          workflow_started_at?: string | null
        }
        Update: {
          addressed_to?: string | null
          ai_draft?: string | null
          assigned_agent_id?: string | null
          attachment_url?: string | null
          comments?: string | null
          created_at?: string | null
          current_step?: number | null
          deadline_at?: string | null
          deposit_time?: string | null
          description?: string | null
          document_summary?: string | null
          id?: string
          is_read?: boolean | null
          mail_type?: string | null
          mail_type_other?: string | null
          priority?: Database["public"]["Enums"]["mail_priority"]
          qr_code_data?: string
          reception_date?: string | null
          reference_number?: string
          registered_by?: string
          sender_address?: string | null
          sender_city?: string | null
          sender_country?: string | null
          sender_email?: string | null
          sender_name?: string
          sender_organization?: string | null
          sender_phone?: string | null
          status?: Database["public"]["Enums"]["mail_status"]
          subject?: string
          updated_at?: string | null
          workflow_completed_at?: string | null
          workflow_started_at?: string | null
        }
        Relationships: []
      }
      missions: {
        Row: {
          assigned_to: string
          budget_estimate: number | null
          created_at: string | null
          created_by: string
          description: string | null
          destination: string | null
          end_date: string | null
          id: string
          notes: string | null
          start_date: string
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_to: string
          budget_estimate?: number | null
          created_at?: string | null
          created_by: string
          description?: string | null
          destination?: string | null
          end_date?: string | null
          id?: string
          notes?: string | null
          start_date: string
          status?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string
          budget_estimate?: number | null
          created_at?: string | null
          created_by?: string
          description?: string | null
          destination?: string | null
          end_date?: string | null
          id?: string
          notes?: string | null
          start_date?: string
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean | null
          mail_id: string | null
          message: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          mail_id?: string | null
          message: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          mail_id?: string | null
          message?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_mail_id_fkey"
            columns: ["mail_id"]
            isOneToOne: false
            referencedRelation: "mails"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string
          first_login: boolean | null
          full_name: string
          id: string
          password_changed_at: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email: string
          first_login?: boolean | null
          full_name?: string
          id: string
          password_changed_at?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          first_login?: boolean | null
          full_name?: string
          id?: string
          password_changed_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      sla_config: {
        Row: {
          created_at: string | null
          default_hours: number
          description: string | null
          id: string
          step_name: string
          step_number: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          default_hours?: number
          description?: string | null
          id?: string
          step_name: string
          step_number: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          default_hours?: number
          description?: string | null
          id?: string
          step_name?: string
          step_number?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workflow_steps: {
        Row: {
          conditions: Json | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          step_order: number
          updated_at: string | null
        }
        Insert: {
          conditions?: Json | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          step_order: number
          updated_at?: string | null
        }
        Update: {
          conditions?: Json | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          step_order?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      workflow_transitions: {
        Row: {
          action: string
          created_at: string | null
          from_step: number | null
          id: string
          mail_id: string
          notes: string | null
          performed_by: string
          to_step: number
        }
        Insert: {
          action: string
          created_at?: string | null
          from_step?: number | null
          id?: string
          mail_id: string
          notes?: string | null
          performed_by: string
          to_step: number
        }
        Update: {
          action?: string
          created_at?: string | null
          from_step?: number | null
          id?: string
          mail_id?: string
          notes?: string | null
          performed_by?: string
          to_step?: number
        }
        Relationships: [
          {
            foreignKeyName: "workflow_transitions_mail_id_fkey"
            columns: ["mail_id"]
            isOneToOne: false
            referencedRelation: "mails"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_app_role: { Args: { new_role: string }; Returns: undefined }
      get_enum_values: {
        Args: never
        Returns: {
          value: string
        }[]
      }
      get_my_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "superadmin"
        | "admin"
        | "supervisor"
        | "agent"
        | "ministre"
        | "dircab"
        | "dircaba"
        | "conseiller_juridique"
        | "secretariat"
        | "conseiller"
        | "reception"
      mail_priority: "low" | "normal" | "high" | "urgent"
      mail_status: "pending" | "in_progress" | "processed" | "archived"
      mail_type:
        | "standard"
        | "invitation"
        | "note_technique"
        | "accusé_reception"
      workflow_action:
        | "approve"
        | "reject"
        | "reassign"
        | "escalate"
        | "complete"
        | "archive"
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
      app_role: [
        "superadmin",
        "admin",
        "supervisor",
        "agent",
        "ministre",
        "dircab",
        "dircaba",
        "conseiller_juridique",
        "secretariat",
        "conseiller",
        "reception",
      ],
      mail_priority: ["low", "normal", "high", "urgent"],
      mail_status: ["pending", "in_progress", "processed", "archived"],
      mail_type: [
        "standard",
        "invitation",
        "note_technique",
        "accusé_reception",
      ],
      workflow_action: [
        "approve",
        "reject",
        "reassign",
        "escalate",
        "complete",
        "archive",
      ],
    },
  },
} as const
