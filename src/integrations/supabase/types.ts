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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      attendance_events: {
        Row: {
          component_id: string
          created_at: string
          credit_counts_as_conducted: boolean
          date: string
          end_minute: number | null
          event_type: string
          id: string
          note: string | null
          schedule_entry_id: string | null
          source: string
          start_minute: number | null
          status: string
          units: number
          updated_at: string
          user_id: string
        }
        Insert: {
          component_id: string
          created_at?: string
          credit_counts_as_conducted?: boolean
          date: string
          end_minute?: number | null
          event_type?: string
          id?: string
          note?: string | null
          schedule_entry_id?: string | null
          source?: string
          start_minute?: number | null
          status: string
          units?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          component_id?: string
          created_at?: string
          credit_counts_as_conducted?: boolean
          date?: string
          end_minute?: number | null
          event_type?: string
          id?: string
          note?: string | null
          schedule_entry_id?: string | null
          source?: string
          start_minute?: number | null
          status?: string
          units?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_events_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "course_components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_events_schedule_entry_id_fkey"
            columns: ["schedule_entry_id"]
            isOneToOne: false
            referencedRelation: "schedule_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_logs: {
        Row: {
          created_at: string
          date: string
          id: string
          kind: string
          slot_id: string | null
          source: string
          status: string
          subject_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          kind?: string
          slot_id?: string | null
          source?: string
          status: string
          subject_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          kind?: string
          slot_id?: string | null
          source?: string
          status?: string
          subject_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_logs_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "routine_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_logs_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      course_components: {
        Row: {
          course_id: string
          created_at: string
          id: string
          initial_attended: number
          initial_conducted: number
          kind: string
          required_pct: number
          updated_at: string
          user_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          initial_attended?: number
          initial_conducted?: number
          kind: string
          required_pct?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          initial_attended?: number
          initial_conducted?: number
          kind?: string
          required_pct?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_components_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          archived: boolean
          code: string | null
          color: string | null
          created_at: string
          default_lab_units: number
          has_lab: boolean
          has_theory: boolean
          has_tutorial: boolean
          icon: string | null
          id: string
          name: string
          target_pct: number
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          code?: string | null
          color?: string | null
          created_at?: string
          default_lab_units?: number
          has_lab?: boolean
          has_theory?: boolean
          has_tutorial?: boolean
          icon?: string | null
          id?: string
          name: string
          target_pct?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          code?: string | null
          color?: string | null
          created_at?: string
          default_lab_units?: number
          has_lab?: boolean
          has_theory?: boolean
          has_tutorial?: boolean
          icon?: string | null
          id?: string
          name?: string
          target_pct?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      feedback: {
        Row: {
          created_at: string
          id: string
          kind: string
          message: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          message: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          message?: string
          user_id?: string
        }
        Relationships: []
      }
      holidays: {
        Row: {
          created_at: string
          date: string
          id: string
          label: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          label?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          label?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          default_required_pct: number
          display_name: string | null
          id: string
          manual_mode: boolean
          swipe_to_delete: boolean
          theme: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          default_required_pct?: number
          display_name?: string | null
          id: string
          manual_mode?: boolean
          swipe_to_delete?: boolean
          theme?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          default_required_pct?: number
          display_name?: string | null
          id?: string
          manual_mode?: boolean
          swipe_to_delete?: boolean
          theme?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_tasks: {
        Row: {
          created_at: string
          done: boolean
          id: string
          position: number
          project_id: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          done?: boolean
          id?: string
          position?: number
          project_id: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          done?: boolean
          id?: string
          position?: number
          project_id?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          deadline: string | null
          description: string | null
          id: string
          name: string
          reference_url: string | null
          subject_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deadline?: string | null
          description?: string | null
          id?: string
          name: string
          reference_url?: string | null
          subject_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deadline?: string | null
          description?: string | null
          id?: string
          name?: string
          reference_url?: string | null
          subject_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      routine_slots: {
        Row: {
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          kind: string
          room: string | null
          start_time: string
          subject_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          kind?: string
          room?: string | null
          start_time: string
          subject_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          kind?: string
          room?: string | null
          start_time?: string
          subject_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "routine_slots_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_entries: {
        Row: {
          component_id: string
          created_at: string
          end_minute: number
          id: string
          position: number
          start_minute: number
          units: number
          updated_at: string
          user_id: string
          weekday: number
        }
        Insert: {
          component_id: string
          created_at?: string
          end_minute: number
          id?: string
          position?: number
          start_minute: number
          units?: number
          updated_at?: string
          user_id: string
          weekday: number
        }
        Update: {
          component_id?: string
          created_at?: string
          end_minute?: number
          id?: string
          position?: number
          start_minute?: number
          units?: number
          updated_at?: string
          user_id?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "schedule_entries_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "course_components"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          archived: boolean
          color: string
          created_at: string
          has_lab: boolean
          icon: string | null
          id: string
          initial_attended: number
          initial_missed: number
          lab_initial_attended: number
          lab_initial_missed: number
          lab_required_pct: number | null
          manual_mode: boolean | null
          name: string
          reminder_enabled: boolean
          required_pct: number
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          color?: string
          created_at?: string
          has_lab?: boolean
          icon?: string | null
          id?: string
          initial_attended?: number
          initial_missed?: number
          lab_initial_attended?: number
          lab_initial_missed?: number
          lab_required_pct?: number | null
          manual_mode?: boolean | null
          name: string
          reminder_enabled?: boolean
          required_pct?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          color?: string
          created_at?: string
          has_lab?: boolean
          icon?: string | null
          id?: string
          initial_attended?: number
          initial_missed?: number
          lab_initial_attended?: number
          lab_initial_missed?: number
          lab_required_pct?: number | null
          manual_mode?: boolean | null
          name?: string
          reminder_enabled?: boolean
          required_pct?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      todos: {
        Row: {
          category: string
          created_at: string
          done: boolean
          done_at: string | null
          due_at: string | null
          id: string
          priority: string
          recurrence: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          done?: boolean
          done_at?: string | null
          due_at?: string | null
          id?: string
          priority?: string
          recurrence?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          done?: boolean
          done_at?: string | null
          due_at?: string | null
          id?: string
          priority?: string
          recurrence?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
