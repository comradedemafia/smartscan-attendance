

# 🎓 QR Code Attendance Management System

## Overview
A university attendance management system using time-limited QR codes and GPS location verification. Supports English and Swahili languages.

---

## 👥 User Roles

### Lecturer / Admin
- Create and manage courses/sessions
- Generate time-limited QR codes (15, 30, or 45 minutes)
- Set GPS location boundaries for each session
- View attendance reports and analytics
- Export attendance data

### Student
- Scan QR codes to mark attendance
- View personal attendance history
- See upcoming sessions

---

## 🔐 Authentication
- Login with **Student/Staff ID + password**
- Role-based access (admin, lecturer, student) stored securely in a separate roles table
- Registration with university ID validation

---

## 📱 Core Features

### 1. QR Code Generation (Lecturer)
- Dynamic QR codes that refresh periodically within the session
- Configurable duration: 15, 30, or 45 minutes
- Auto-expiration after selected time
- QR displayed on a large, scannable screen view

### 2. QR Code Scanning (Student)
- Camera-based QR scanner in the browser
- GPS location check before accepting attendance
- Duplicate attendance prevention (one scan per student per session)
- Clear success/failure feedback

### 3. Location Verification
- Lecturer sets a GPS coordinate + radius for the venue
- Student's location is validated against this boundary
- Clear error message if student is outside the allowed area

### 4. Dashboard
- **Lecturer Dashboard**: Active sessions, quick QR generation, recent attendance stats
- **Student Dashboard**: Today's sessions, attendance history, attendance percentage
- **Admin Dashboard**: System overview, all courses, all lecturers, system analytics

### 5. Course & Session Management
- Create courses with name, code, and schedule
- Create sessions linked to courses with date, time, and venue
- Assign students to courses

### 6. Attendance Reports
- Per-session attendance list
- Per-student attendance summary across courses
- Per-course attendance trends (charts)
- Export to CSV

### 7. Language Toggle 🌍
- Full English and Swahili interface
- Toggle switch in the navigation bar
- All labels, messages, and notifications translated

---

## 🗄️ Backend (Lovable Cloud / Supabase)
- **Database**: Users, roles, courses, sessions, attendance records, locations
- **Authentication**: Student/Staff ID + password via Supabase Auth
- **Edge Functions**: QR code generation/validation, location verification
- **Row-Level Security**: Students see only their data, lecturers see their courses

---

## 📊 Pages

1. **Login / Register** — Staff/Student ID + password
2. **Student Dashboard** — Upcoming sessions, scan QR, attendance history
3. **Lecturer Dashboard** — Active sessions, generate QR, attendance overview
4. **Admin Dashboard** — System-wide stats, manage users and courses
5. **QR Scanner Page** — Camera view with location check
6. **QR Display Page** — Large QR code with countdown timer
7. **Course Management** — CRUD for courses and enrolled students
8. **Attendance Reports** — Filterable tables and charts
9. **Settings** — Profile, language toggle, location preferences

