---
name: Module type and selection deadline
description: Modules tagged Core (auto-enroll) or Optional (student picks before deadline)
type: feature
---
Each module (course) has `is_core` (boolean, default true) and `selection_deadline` (timestamptz, nullable).

- **Core modules**: students of matching department/level are auto-enrolled via `auto_enroll_department_students` trigger (fires on INSERT, and on UPDATE when is_core flips to true). Students cannot self-unenroll from core modules (RLS blocks).
- **Optional modules**: students self-enroll/unenroll via My Modules page. RLS policies "Students can self-enroll/unenroll in optional modules before deadline" enforce that `selection_deadline IS NULL OR > now()`. After deadline passes, UI shows lock badge and DB rejects changes.
- Admin/Lecturer create form has Module Type select + datetime-local Selection Deadline input (only shown for optional).
- Course cards show Star/Core badge or Optional badge, plus deadline countdown or "Selection closed" lock.
