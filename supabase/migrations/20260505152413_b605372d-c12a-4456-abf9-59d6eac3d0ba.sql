
-- Trigger-only functions: revoke from everyone except trigger context
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_enrollment_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_enroll_department_students() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_session_venue() FROM PUBLIC, anon, authenticated;

-- Admin/server helpers: revoke from anon, keep for authenticated (callers checked inside / by RLS)
REVOKE EXECUTE ON FUNCTION public.notify_users_by_role(app_role, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.notify_enrolled_students(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.search_profiles_for_enrollment(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_department_lecturers(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_2fa_stats() FROM PUBLIC, anon;

-- RLS helpers + login lookup must remain callable by anon and authenticated
-- (has_role, is_enrolled_in_course, get_user_role, email_for_login_id) — leave permissions intact.
