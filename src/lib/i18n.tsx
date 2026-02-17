import React, { createContext, useContext, useState, useCallback } from "react";

type Language = "en" | "sw";

const translations = {
  en: {
    // Auth
    "auth.login": "Sign In",
    "auth.register": "Sign Up",
    "auth.universityId": "Student/Staff ID",
    "auth.password": "Password",
    "auth.fullName": "Full Name",
    "auth.email": "Email Address",
    "auth.role": "Role",
    "auth.student": "Student",
    "auth.lecturer": "Lecturer",
    "auth.noAccount": "Don't have an account?",
    "auth.hasAccount": "Already have an account?",
    "auth.signingIn": "Signing in...",
    "auth.signingUp": "Signing up...",
    "auth.signupSuccess": "Account created! Check your email to verify.",
    "auth.logout": "Sign Out",
    "auth.forgotPassword": "Forgot password?",
    "auth.resetPassword": "Reset Password",
    "auth.newPassword": "New Password",
    "auth.confirmPassword": "Confirm Password",
    "auth.sendResetLink": "Send Reset Link",
    "auth.sendingResetLink": "Sending...",
    "auth.resetLinkSent": "Password reset link sent! Check your email.",
    "auth.passwordUpdated": "Password updated successfully!",
    "auth.updating": "Updating...",
    "auth.updatePassword": "Update Password",
    "auth.backToLogin": "Back to Sign In",
    "auth.passwordMismatch": "Passwords do not match",
    "auth.gender": "Gender",
    "auth.male": "Male",
    "auth.female": "Female",

    // Nav
    "nav.dashboard": "Dashboard",
    "nav.courses": "Courses",
    "nav.sessions": "Sessions",
    "nav.attendance": "Attendance",
    "nav.reports": "Reports",
    "nav.scanQr": "Scan QR",
    "nav.settings": "Settings",
    "nav.users": "Users",

    // Dashboard
    "dashboard.welcome": "Welcome back",
    "dashboard.activeSessions": "Active Sessions",
    "dashboard.totalStudents": "Total Students",
    "dashboard.totalCourses": "Total Courses",
    "dashboard.attendanceRate": "Attendance Rate",
    "dashboard.recentActivity": "Recent Activity",
    "dashboard.upcomingSessions": "Upcoming Sessions",
    "dashboard.quickActions": "Quick Actions",
    "dashboard.generateQr": "Generate QR Code",
    "dashboard.viewReports": "View Reports",
    "dashboard.manageCourses": "Manage Courses",
    "dashboard.noSessions": "No upcoming sessions",

    // Courses
    "courses.title": "Courses",
    "courses.create": "Create Course",
    "courses.code": "Course Code",
    "courses.name": "Course Name",
    "courses.description": "Description",
    "courses.students": "Students",
    "courses.sessions": "Sessions",
    "courses.enroll": "Enroll Students",
    "courses.empty": "No courses found",
    "courses.enrolled": "Successfully enrolled!",
    "courses.unenrolled": "Successfully unenrolled",
    "courses.joinCourse": "Join Course",
    "courses.unenroll": "Leave",
    "courses.manageStudents": "Manage Students",
    "courses.addStudent": "Add Student",
    "courses.removeStudent": "Remove Student",
    "courses.searchStudent": "Search by name or ID...",
    "courses.studentAdded": "Student added successfully",
    "courses.studentRemoved": "Student removed",

    // Sessions
    "sessions.title": "Sessions",
    "sessions.create": "Create Session",
    "sessions.course": "Course",
    "sessions.date": "Date",
    "sessions.time": "Time",
    "sessions.venue": "Venue",
    "sessions.duration": "Duration (minutes)",
    "sessions.status": "Status",
    "sessions.active": "Active",
    "sessions.scheduled": "Scheduled",
    "sessions.completed": "Completed",
    "sessions.generateQr": "Generate QR",
    "sessions.qrActive": "QR Active",
    "sessions.expired": "Expired",
    "sessions.terminate": "Terminate Session",
    "sessions.terminated": "Session terminated",
    "sessions.extendTime": "Extend Time",
    "sessions.timeExtended": "Time extended",
    "sessions.weeklyView": "Weekly Schedule",
    "sessions.listView": "List View",
    "sessions.monday": "Mon",
    "sessions.tuesday": "Tue",
    "sessions.wednesday": "Wed",
    "sessions.thursday": "Thu",
    "sessions.friday": "Fri",
    "sessions.saturday": "Sat",
    "sessions.sunday": "Sun",

    // QR
    "qr.title": "QR Code",
    "qr.scan": "Scan QR Code",
    "qr.scanning": "Scanning...",
    "qr.timeRemaining": "Time Remaining",
    "qr.expired": "QR Code Expired",
    "qr.success": "Attendance Recorded!",
    "qr.locationError": "You are not within the allowed area",
    "qr.alreadyScanned": "Attendance already recorded",
    "qr.selectDuration": "Select Duration",
    "qr.minutes": "minutes",

    // Attendance
    "attendance.title": "Attendance",
    "attendance.present": "Present",
    "attendance.absent": "Absent",
    "attendance.late": "Late",
    "attendance.history": "Attendance History",
    "attendance.rate": "Attendance Rate",
    "attendance.export": "Export CSV",
    "attendance.noRecords": "No attendance records found",
    "attendance.course": "Course",
    "attendance.session": "Session",
    "attendance.date": "Date",
    "attendance.time": "Time",
    "attendance.status": "Status",
    "attendance.totalSessions": "Total Sessions",
    "attendance.attended": "Attended",
    "attendance.myHistory": "My Attendance History",

    // Reports
    "reports.title": "Reports",
    "reports.byCourse": "By Course",
    "reports.byStudent": "By Student",
    "reports.bySession": "By Session",
    "reports.trend": "Attendance Trend",
    "reports.overview": "Overview",
    "reports.totalSessions": "Total Sessions",
    "reports.totalAttendance": "Total Attendance Records",
    "reports.averageRate": "Average Attendance Rate",
    "reports.courseReport": "Course Report",
    "reports.selectCourse": "Select a course",
    "reports.studentName": "Student Name",
    "reports.universityId": "University ID",
    "reports.sessionsAttended": "Sessions Attended",
    "reports.percentage": "Percentage",
    "reports.noData": "No data available",
    "reports.exportPdf": "Export PDF",
    "reports.exportAll": "Export All Courses PDF",
    "reports.individualReport": "Individual Report",
    "reports.selectStudent": "Select a student",
    "reports.studentReport": "Student Report",
    "reports.gender": "Gender",

    // Admin
    "admin.totalStudents": "Total Students",
    "admin.allGenders": "All Genders",
    "admin.filterByCourse": "Filter by Course",
    "admin.allCourses": "All Courses",
    "admin.studentList": "Student List",
    "admin.enrolledCourses": "Enrolled Courses",
    "admin.importStudents": "Import Students",
    "admin.importCsv": "Import CSV",
    "admin.importSuccess": "Students imported successfully",
    "admin.csvFormat": "CSV format: university_id, full_name, email, gender(M/F)",
    "admin.importingStudents": "Importing...",

    // Settings
    "settings.title": "Settings",
    "settings.profile": "Profile",
    "settings.language": "Language",
    "settings.location": "Location Preferences",
    "settings.appearance": "Appearance",
    "settings.light": "Light",
    "settings.dark": "Dark",
    "settings.system": "System",

    // Common
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.delete": "Delete",
    "common.edit": "Edit",
    "common.search": "Search",
    "common.loading": "Loading...",
    "common.error": "An error occurred",
    "common.success": "Success",
    "common.confirm": "Confirm",
    "common.back": "Back",
    "common.next": "Next",
    "common.actions": "Actions",
  },
  sw: {
    // Auth
    "auth.login": "Ingia",
    "auth.register": "Jisajili",
    "auth.universityId": "Namba ya Mwanafunzi/Mfanyakazi",
    "auth.password": "Neno la Siri",
    "auth.fullName": "Jina Kamili",
    "auth.email": "Barua Pepe",
    "auth.role": "Jukumu",
    "auth.student": "Mwanafunzi",
    "auth.lecturer": "Mhadhiri",
    "auth.noAccount": "Huna akaunti?",
    "auth.hasAccount": "Una akaunti tayari?",
    "auth.signingIn": "Inaingia...",
    "auth.signingUp": "Inasajili...",
    "auth.signupSuccess": "Akaunti imeundwa! Angalia barua pepe yako kuthibitisha.",
    "auth.logout": "Toka",
    "auth.forgotPassword": "Umesahau neno la siri?",
    "auth.resetPassword": "Badilisha Neno la Siri",
    "auth.newPassword": "Neno Jipya la Siri",
    "auth.confirmPassword": "Thibitisha Neno la Siri",
    "auth.sendResetLink": "Tuma Kiungo cha Kubadilisha",
    "auth.sendingResetLink": "Inatuma...",
    "auth.resetLinkSent": "Kiungo cha kubadilisha neno la siri kimetumwa! Angalia barua pepe yako.",
    "auth.passwordUpdated": "Neno la siri limebadilishwa!",
    "auth.updating": "Inabadilisha...",
    "auth.updatePassword": "Badilisha Neno la Siri",
    "auth.backToLogin": "Rudi kwenye Kuingia",
    "auth.passwordMismatch": "Maneno ya siri hayalingani",
    "auth.gender": "Jinsia",
    "auth.male": "Mwanaume",
    "auth.female": "Mwanamke",

    // Nav
    "nav.dashboard": "Dashibodi",
    "nav.courses": "Kozi",
    "nav.sessions": "Vipindi",
    "nav.attendance": "Mahudhurio",
    "nav.reports": "Ripoti",
    "nav.scanQr": "Scan QR",
    "nav.settings": "Mipangilio",
    "nav.users": "Watumiaji",

    // Dashboard
    "dashboard.welcome": "Karibu tena",
    "dashboard.activeSessions": "Vipindi Hai",
    "dashboard.totalStudents": "Wanafunzi Wote",
    "dashboard.totalCourses": "Kozi Zote",
    "dashboard.attendanceRate": "Kiwango cha Mahudhurio",
    "dashboard.recentActivity": "Shughuli za Hivi Karibuni",
    "dashboard.upcomingSessions": "Vipindi Vijavyo",
    "dashboard.quickActions": "Vitendo vya Haraka",
    "dashboard.generateQr": "Tengeneza QR Code",
    "dashboard.viewReports": "Angalia Ripoti",
    "dashboard.manageCourses": "Simamia Kozi",
    "dashboard.noSessions": "Hakuna vipindi vijavyo",

    // Courses
    "courses.title": "Kozi",
    "courses.create": "Unda Kozi",
    "courses.code": "Msimbo wa Kozi",
    "courses.name": "Jina la Kozi",
    "courses.description": "Maelezo",
    "courses.students": "Wanafunzi",
    "courses.sessions": "Vipindi",
    "courses.enroll": "Sajili Wanafunzi",
    "courses.empty": "Hakuna kozi zilizopatikana",
    "courses.enrolled": "Umejisajili kikamilifu!",
    "courses.unenrolled": "Umejitoa kwenye kozi",
    "courses.joinCourse": "Jiunge",
    "courses.unenroll": "Jiondoe",
    "courses.manageStudents": "Simamia Wanafunzi",
    "courses.addStudent": "Ongeza Mwanafunzi",
    "courses.removeStudent": "Ondoa Mwanafunzi",
    "courses.searchStudent": "Tafuta kwa jina au namba...",
    "courses.studentAdded": "Mwanafunzi ameongezwa",
    "courses.studentRemoved": "Mwanafunzi ameondolewa",

    // Sessions
    "sessions.title": "Vipindi",
    "sessions.create": "Unda Kipindi",
    "sessions.course": "Kozi",
    "sessions.date": "Tarehe",
    "sessions.time": "Muda",
    "sessions.venue": "Eneo",
    "sessions.duration": "Muda (dakika)",
    "sessions.status": "Hali",
    "sessions.active": "Hai",
    "sessions.scheduled": "Imepangwa",
    "sessions.completed": "Imekamilika",
    "sessions.generateQr": "Tengeneza QR",
    "sessions.qrActive": "QR Hai",
    "sessions.expired": "Imeisha",
    "sessions.terminate": "Maliza Kipindi",
    "sessions.terminated": "Kipindi kimeisha",
    "sessions.extendTime": "Ongeza Muda",
    "sessions.timeExtended": "Muda umeongezwa",
    "sessions.weeklyView": "Ratiba ya Wiki",
    "sessions.listView": "Orodha",
    "sessions.monday": "Jtt",
    "sessions.tuesday": "Jnn",
    "sessions.wednesday": "Jtn",
    "sessions.thursday": "Alh",
    "sessions.friday": "Ijm",
    "sessions.saturday": "Jms",
    "sessions.sunday": "Jpl",

    // QR
    "qr.title": "QR Code",
    "qr.scan": "Scan QR Code",
    "qr.scanning": "Inascan...",
    "qr.timeRemaining": "Muda Uliobaki",
    "qr.expired": "QR Code Imeisha",
    "qr.success": "Mahudhurio Yamerekodwa!",
    "qr.locationError": "Hauko ndani ya eneo linaloruhusiwa",
    "qr.alreadyScanned": "Mahudhurio tayari yamerekodwa",
    "qr.selectDuration": "Chagua Muda",
    "qr.minutes": "dakika",

    // Attendance
    "attendance.title": "Mahudhurio",
    "attendance.present": "Yupo",
    "attendance.absent": "Hayupo",
    "attendance.late": "Amechelewa",
    "attendance.history": "Historia ya Mahudhurio",
    "attendance.rate": "Kiwango cha Mahudhurio",
    "attendance.export": "Hamisha CSV",
    "attendance.noRecords": "Hakuna rekodi za mahudhurio",
    "attendance.course": "Kozi",
    "attendance.session": "Kipindi",
    "attendance.date": "Tarehe",
    "attendance.time": "Muda",
    "attendance.status": "Hali",
    "attendance.totalSessions": "Vipindi Vyote",
    "attendance.attended": "Umehudhuria",
    "attendance.myHistory": "Historia Yangu ya Mahudhurio",

    // Reports
    "reports.title": "Ripoti",
    "reports.byCourse": "Kwa Kozi",
    "reports.byStudent": "Kwa Mwanafunzi",
    "reports.bySession": "Kwa Kipindi",
    "reports.trend": "Mwenendo wa Mahudhurio",
    "reports.overview": "Muhtasari",
    "reports.totalSessions": "Vipindi Vyote",
    "reports.totalAttendance": "Rekodi Zote za Mahudhurio",
    "reports.averageRate": "Kiwango cha Wastani",
    "reports.courseReport": "Ripoti ya Kozi",
    "reports.selectCourse": "Chagua kozi",
    "reports.studentName": "Jina la Mwanafunzi",
    "reports.universityId": "Namba ya Chuo",
    "reports.sessionsAttended": "Vipindi Alivyohudhuria",
    "reports.percentage": "Asilimia",
    "reports.noData": "Hakuna data",
    "reports.exportPdf": "Hamisha PDF",
    "reports.exportAll": "Hamisha Kozi Zote PDF",
    "reports.individualReport": "Ripoti ya Mtu Mmoja",
    "reports.selectStudent": "Chagua mwanafunzi",
    "reports.studentReport": "Ripoti ya Mwanafunzi",
    "reports.gender": "Jinsia",

    // Admin
    "admin.totalStudents": "Wanafunzi Wote",
    "admin.allGenders": "Jinsia Zote",
    "admin.filterByCourse": "Chuja kwa Kozi",
    "admin.allCourses": "Kozi Zote",
    "admin.studentList": "Orodha ya Wanafunzi",
    "admin.enrolledCourses": "Kozi Zilizosajiliwa",
    "admin.importStudents": "Ingiza Wanafunzi",
    "admin.importCsv": "Ingiza CSV",
    "admin.importSuccess": "Wanafunzi wameingizwa",
    "admin.csvFormat": "Muundo wa CSV: university_id, full_name, email, gender(M/F)",
    "admin.importingStudents": "Inaingiza...",

    // Settings
    "settings.title": "Mipangilio",
    "settings.profile": "Wasifu",
    "settings.language": "Lugha",
    "settings.location": "Mapendeleo ya Eneo",
    "settings.appearance": "Muonekano",
    "settings.light": "Mwangaza",
    "settings.dark": "Giza",
    "settings.system": "Mfumo",

    // Common
    "common.save": "Hifadhi",
    "common.cancel": "Ghairi",
    "common.delete": "Futa",
    "common.edit": "Hariri",
    "common.search": "Tafuta",
    "common.loading": "Inapakia...",
    "common.error": "Hitilafu imetokea",
    "common.success": "Imefanikiwa",
    "common.confirm": "Thibitisha",
    "common.back": "Rudi",
    "common.next": "Endelea",
    "common.actions": "Vitendo",
  },
} as const;

type TranslationKey = keyof typeof translations.en;

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem("app-language");
    return (saved === "sw" ? "sw" : "en") as Language;
  });

  const handleSetLanguage = useCallback((lang: Language) => {
    setLanguage(lang);
    localStorage.setItem("app-language", lang);
  }, []);

  const t = useCallback(
    (key: TranslationKey) => {
      return translations[language][key] || key;
    },
    [language]
  );

  return (
    <I18nContext.Provider value={{ language, setLanguage: handleSetLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used within I18nProvider");
  return context;
}
