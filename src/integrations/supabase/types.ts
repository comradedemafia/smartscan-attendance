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
      attendance_otp: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          method: string
          otp_code: string
          session_id: string
          used: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          method?: string
          otp_code: string
          session_id: string
          used?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          method?: string
          otp_code?: string
          session_id?: string
          used?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_otp_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          id: string
          latitude: number | null
          longitude: number | null
          scanned_at: string
          session_id: string
          status: string
          user_id: string
        }
        Insert: {
          id?: string
          latitude?: number | null
          longitude?: number | null
          scanned_at?: string
          session_id: string
          status?: string
          user_id: string
        }
        Update: {
          id?: string
          latitude?: number | null
          longitude?: number | null
          scanned_at?: string
          session_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      course_enrollments: {
        Row: {
          course_id: string
          enrolled_at: string
          id: string
          user_id: string
        }
        Insert: {
          course_id: string
          enrolled_at?: string
          id?: string
          user_id: string
        }
        Update: {
          course_id?: string
          enrolled_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_lecturers: {
        Row: {
          assigned_at: string
          assigned_by: string
          course_id: string
          id: string
          lecturer_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by: string
          course_id: string
          id?: string
          lecturer_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string
          course_id?: string
          id?: string
          lecturer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_lecturers_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_lecturers_lecturer_id_fkey"
            columns: ["lecturer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          code: string
          created_at: string
          created_by: string
          department_id: string | null
          description: string | null
          id: string
          is_core: boolean
          level_id: string | null
          name: string
          selection_deadline: string | null
          semester_id: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by: string
          department_id?: string | null
          description?: string | null
          id?: string
          is_core?: boolean
          level_id?: string | null
          name: string
          selection_deadline?: string | null
          semester_id?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          department_id?: string | null
          description?: string | null
          id?: string
          is_core?: boolean
          level_id?: string | null
          name?: string
          selection_deadline?: string | null
          semester_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      excuses: {
        Row: {
          attachment_url: string | null
          created_at: string
          id: string
          reason: string
          reviewed_at: string | null
          reviewed_by: string | null
          session_id: string
          status: string
          user_id: string
        }
        Insert: {
          attachment_url?: string | null
          created_at?: string
          id?: string
          reason: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          session_id: string
          status?: string
          user_id: string
        }
        Update: {
          attachment_url?: string | null
          created_at?: string
          id?: string
          reason?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          session_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "excuses_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      levels: {
        Row: {
          code: string
          created_at: string
          department_id: string
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          department_id: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          department_id?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "levels_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          session_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          session_id?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          session_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          academic_year: string | null
          avatar_url: string | null
          created_at: string
          department_id: string | null
          email: string | null
          full_name: string
          gender: string | null
          id: string
          phone: string | null
          study_year: number | null
          totp_secret: string | null
          university_id: string
          updated_at: string
        }
        Insert: {
          academic_year?: string | null
          avatar_url?: string | null
          created_at?: string
          department_id?: string | null
          email?: string | null
          full_name: string
          gender?: string | null
          id: string
          phone?: string | null
          study_year?: number | null
          totp_secret?: string | null
          university_id: string
          updated_at?: string
        }
        Update: {
          academic_year?: string | null
          avatar_url?: string | null
          created_at?: string
          department_id?: string | null
          email?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          phone?: string | null
          study_year?: number | null
          totp_secret?: string | null
          university_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      semesters: {
        Row: {
          code: string
          created_at: string
          id: string
          level_id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          level_id: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          level_id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "semesters_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          course_id: string
          created_at: string
          created_by: string
          duration_minutes: number
          end_time: string | null
          id: string
          latitude: number | null
          location_radius_meters: number | null
          longitude: number | null
          qr_code_secret: string | null
          qr_expires_at: string | null
          session_date: string
          start_time: string
          status: string
          title: string
          updated_at: string
          venue_name: string | null
        }
        Insert: {
          course_id: string
          created_at?: string
          created_by: string
          duration_minutes?: number
          end_time?: string | null
          id?: string
          latitude?: number | null
          location_radius_meters?: number | null
          longitude?: number | null
          qr_code_secret?: string | null
          qr_expires_at?: string | null
          session_date?: string
          start_time?: string
          status?: string
          title: string
          updated_at?: string
          venue_name?: string | null
        }
        Update: {
          course_id?: string
          created_at?: string
          created_by?: string
          duration_minutes?: number
          end_time?: string | null
          id?: string
          latitude?: number | null
          location_radius_meters?: number | null
          longitude?: number | null
          qr_code_secret?: string | null
          qr_expires_at?: string | null
          session_date?: string
          start_time?: string
          status?: string
          title?: string
          updated_at?: string
          venue_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
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
      get_2fa_stats: {
        Args: never
        Returns: {
          phone_set: number
          total_students: number
          totp_enabled: number
        }[]
      }
      get_department_lecturers: {
        Args: { _department_id: string }
        Returns: {
          course_code: string
          course_id: string
          course_name: string
          full_name: string
          lecturer_id: string
          university_id: string
        }[]
      }
      get_user_role: {
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
      is_enrolled_in_course: {
        Args: { _course_id: string; _user_id: string }
        Returns: boolean
      }
      notify_enrolled_students: {
        Args: {
          _message: string
          _session_id: string
          _title: string
          _type?: string
        }
        Returns: undefined
      }
      notify_users_by_role: {
        Args: {
          _message: string
          _role: Database["public"]["Enums"]["app_role"]
          _title: string
          _type?: string
        }
        Returns: undefined
      }
      search_profiles_for_enrollment: {
        Args: { search_term: string }
        Returns: {
          full_name: string
          id: string
          university_id: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "lecturer" | "student"
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
      app_role: ["admin", "lecturer", "student"],
    },
  },
} as const
