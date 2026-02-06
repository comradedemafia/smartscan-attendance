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

    // Reports
    "reports.title": "Reports",
    "reports.byCourse": "By Course",
    "reports.byStudent": "By Student",
    "reports.bySession": "By Session",
    "reports.trend": "Attendance Trend",

    // Settings
    "settings.title": "Settings",
    "settings.profile": "Profile",
    "settings.language": "Language",
    "settings.location": "Location Preferences",

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

    // Reports
    "reports.title": "Ripoti",
    "reports.byCourse": "Kwa Kozi",
    "reports.byStudent": "Kwa Mwanafunzi",
    "reports.bySession": "Kwa Kipindi",
    "reports.trend": "Mwenendo wa Mahudhurio",

    // Settings
    "settings.title": "Mipangilio",
    "settings.profile": "Wasifu",
    "settings.language": "Lugha",
    "settings.location": "Mapendeleo ya Eneo",

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
