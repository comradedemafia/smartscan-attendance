export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
          face_gender: string | null
          face_match_distance: number | null
          face_verified: boolean
          gender_match: boolean | null
          id: string
          latitude: number | null
          longitude: number | null
          scanned_at: string
          selfie_path: string | null
          session_id: string
          status: string
          user_id: string
        }
        Insert: {
          face_gender?: string | null
          face_match_distance?: number | null
          face_verified?: boolean
          gender_match?: boolean | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          scanned_at?: string
          selfie_path?: string | null
          session_id: string
          status?: string
          user_id: string
        }
        Update: {
          face_gender?: string | null
          face_match_distance?: number | null
          face_verified?: boolean
          gender_match?: boolean | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          scanned_at?: string
          selfie_path?: string | null
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
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          new_data: Json | null
          old_data: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
        }
        Relationships: []
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
      deadline_reminders_sent: {
        Row: {
          course_id: string
          id: string
          sent_at: string
          threshold: string
          user_id: string
        }
        Insert: {
          course_id: string
          id?: string
          sent_at?: string
          threshold: string
          user_id: string
        }
        Update: {
          course_id?: string
          id?: string
          sent_at?: string
          threshold?: string
          user_id?: string
        }
        Relationships: []
      }
      departments: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      enrollment_audit_log: {
        Row: {
          action: string
          course_id: string
          created_at: string
          deadline_status: string | null
          id: string
          module_type: string
          performed_by: string | null
          reason: string | null
          selection_deadline: string | null
          user_id: string
        }
        Insert: {
          action: string
          course_id: string
          created_at?: string
          deadline_status?: string | null
          id?: string
          module_type: string
          performed_by?: string | null
          reason?: string | null
          selection_deadline?: string | null
          user_id: string
        }
        Update: {
          action?: string
          course_id?: string
          created_at?: string
          deadline_status?: string | null
          id?: string
          module_type?: string
          performed_by?: string | null
          reason?: string | null
          selection_deadline?: string | null
          user_id?: string
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
      otp_replay_guard: {
        Row: {
          counter: number
          created_at: string
          id: string
          session_id: string
          user_id: string
        }
        Insert: {
          counter: number
          created_at?: string
          id?: string
          session_id: string
          user_id: string
        }
        Update: {
          counter?: number
          created_at?: string
          id?: string
          session_id?: string
          user_id?: string
        }
        Relationships: []
      }
      otp_verification_log: {
        Row: {
          created_at: string
          failure_reason: string | null
          id: string
          ip_address: string | null
          matched_offset: number | null
          session_id: string | null
          success: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          matched_offset?: number | null
          session_id?: string | null
          success: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          matched_offset?: number | null
          session_id?: string | null
          success?: boolean
          user_id?: string
        }
        Relationships: []
      }
      course_code_aliases: {
        Row: {
          created_at: string
          created_by: string | null
          course_id: string
          external_code: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          course_id: string
          external_code: string
          id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          course_id?: string
          external_code?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_code_aliases_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_code_aliases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          academic_year: string | null
          admission_number: string | null
          avatar_url: string | null
          created_at: string
          department_id: string | null
          email: string | null
          full_name: string
          gender: string | null
          id: string
          must_change_password: boolean
          phone: string | null
          programme: string | null
          study_year: number | null
          university_id: string
          updated_at: string
        }
        Insert: {
          academic_year?: string | null
          admission_number?: string | null
          avatar_url?: string | null
          created_at?: string
          department_id?: string | null
          email?: string | null
          full_name: string
          gender?: string | null
          id: string
          must_change_password?: boolean
          phone?: string | null
          programme?: string | null
          study_year?: number | null
          university_id: string
          updated_at?: string
        }
        Update: {
          academic_year?: string | null
          admission_number?: string | null
          avatar_url?: string | null
          created_at?: string
          department_id?: string | null
          email?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          must_change_password?: boolean
          phone?: string | null
          programme?: string | null
          study_year?: number | null
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
      student_registry: {
        Row: {
          academic_year: string | null
          admission_number: string | null
          created_at: string
          department_id: string | null
          department_raw: string | null
          email: string | null
          email_is_synthetic: boolean
          full_name: string
          gender: string | null
          id: string
          last_synced_at: string | null
          phone: string | null
          profile_id: string | null
          programme: string | null
          provisioned_at: string | null
          semester: string | null
          source: string
          status: string
          study_year: number | null
          university_id: string
          updated_at: string
        }
        Insert: {
          academic_year?: string | null
          admission_number?: string | null
          created_at?: string
          department_id?: string | null
          department_raw?: string | null
          email?: string | null
          email_is_synthetic?: boolean
          full_name: string
          gender?: string | null
          id?: string
          last_synced_at?: string | null
          phone?: string | null
          profile_id?: string | null
          programme?: string | null
          provisioned_at?: string | null
          semester?: string | null
          source?: string
          status?: string
          study_year?: number | null
          university_id: string
          updated_at?: string
        }
        Update: {
          academic_year?: string | null
          admission_number?: string | null
          created_at?: string
          department_id?: string | null
          department_raw?: string | null
          email?: string | null
          email_is_synthetic?: boolean
          full_name?: string
          gender?: string | null
          id?: string
          last_synced_at?: string | null
          phone?: string | null
          profile_id?: string | null
          programme?: string | null
          provisioned_at?: string | null
          semester?: string | null
          source?: string
          status?: string
          study_year?: number | null
          university_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_registry_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_registry_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_registry_enrollments: {
        Row: {
          academic_year: string | null
          course_id: string | null
          created_at: string
          external_code: string
          id: string
          mapping_status: string
          registry_id: string
          semester: string | null
          updated_at: string
        }
        Insert: {
          academic_year?: string | null
          course_id?: string | null
          created_at?: string
          external_code: string
          id?: string
          mapping_status?: string
          registry_id: string
          semester?: string | null
          updated_at?: string
        }
        Update: {
          academic_year?: string | null
          course_id?: string | null
          created_at?: string
          external_code?: string
          id?: string
          mapping_status?: string
          registry_id?: string
          semester?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_registry_enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_registry_enrollments_registry_id_fkey"
            columns: ["registry_id"]
            isOneToOne: false
            referencedRelation: "student_registry"
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
      user_totp_secrets: {
        Row: {
          created_at: string
          pending_secret: string | null
          secret: string | null
          updated_at: string
          user_id: string
          verified: boolean
        }
        Insert: {
          created_at?: string
          pending_secret?: string | null
          secret?: string | null
          updated_at?: string
          user_id: string
          verified?: boolean
        }
        Update: {
          created_at?: string
          pending_secret?: string | null
          secret?: string | null
          updated_at?: string
          user_id?: string
          verified?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      v_profiles_missing_registry: {
        Row: {
          created_at: string
          department_id: string | null
          email: string | null
          full_name: string
          gender: string | null
          id: string
          programme: string | null
          university_id: string
        }
        Relationships: []
      }
      v_student_registry_reconciliation: {
        Row: {
          admission_number: string | null
          profile_department_id: string | null
          profile_gender: string | null
          profile_id: string | null
          profile_name: string | null
          profile_programme: string | null
          provisioned_at: string | null
          registry_department_id: string | null
          registry_gender: string | null
          registry_id: string
          registry_name: string
          registry_programme: string | null
          status: string
          university_id: string
        }
        Relationships: []
      }
    }
    Functions: {
      apply_course_code_aliases: { Args: never; Returns: number }
      email_for_login_id: { Args: { _login_id: string }; Returns: string }
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
