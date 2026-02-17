
# Mpango wa Kuboresha Mfumo wa QR Attendance

## Muhtasari
Mabadiliko matatu makubwa: (1) Mwalimu aweze kuongeza/kuondoa wanafunzi kwenye kozi zake, (2) Kipengele cha kubadilisha muonekano (Dark/Light/System), (3) Ripoti ya kila somo yenye uwezo wa ku-export PDF.

---

## 1. Teacher Dashboard - Kusimamia Wanafunzi

Mwalimu (lecturer) ataweza kuona wanafunzi waliosajiliwa kwenye kozi yake na kuwaongeza au kuwaondoa moja kwa moja.

### Mabadiliko:
- **Ukurasa mpya `src/pages/CourseStudents.tsx`**: Ukurasa unaonyesha orodha ya wanafunzi waliosajiliwa kwenye kozi fulani, na uwezo wa:
  - Kuongeza mwanafunzi kwa kutafuta jina/university ID
  - Kuondoa mwanafunzi kutoka kwenye kozi
- **Route mpya** `/courses/:courseId/students` ndani ya `App.tsx`
- **Kiungo kwenye kadi ya kozi** (`Courses.tsx`): Mwalimu ataona button ya "Manage Students" kwenye kila kozi yake
- **Tafsiri mpya** kwenye `i18n.tsx` kwa maneno kama "Add Student", "Remove Student", nk.

### RLS:
- Sera za sasa za `course_enrollments` zinaruhusu lecturer kuongeza na kuondoa wanafunzi kwenye kozi zake - hakuna mabadiliko ya database yanayohitajika.

---

## 2. Kipengele cha Appearance (Dark / Light / System)

Mfumo tayari una CSS variables za `.dark` mode. Tunahitaji kuongeza theme switcher.

### Mabadiliko:
- **`src/lib/theme.tsx`** (faili mpya): ThemeProvider na `useTheme` hook inayosimamia hali ya theme (dark/light/system) kupitia localStorage na class ya `<html>`
- **`src/App.tsx`**: Kuongeza `ThemeProvider` kuzunguka app
- **`src/pages/SettingsPage.tsx`**: Kuongeza sehemu ya "Appearance" na vitufe vitatu (Light, Dark, System)
- **`src/components/AppLayout.tsx`**: Kuongeza theme toggle kwenye sidebar (ikoni ya jua/mwezi)
- **Tafsiri mpya** kwenye `i18n.tsx`: "settings.appearance", "settings.light", "settings.dark", "settings.system"

---

## 3. Ripoti kwa Kila Somo na Export PDF

Kuboresha ukurasa wa Reports ili uweze ku-export ripoti kama PDF.

### Mabadiliko:
- **`src/pages/Reports.tsx`**: Kuongeza button ya "Export PDF" inayotumia browser `window.print()` au maktaba ya `jspdf` + `html2canvas`
  - Njia rahisi: Kutumia `window.print()` na CSS ya `@media print` - haina haja ya maktaba mpya
  - Ripoti itajumuisha: Jina la kozi, takwimu za jumla, chati ya mwenendo, na jedwali la wanafunzi
- **Tafsiri mpya**: "reports.exportPdf", "reports.printReport"
- **CSS ya print** kwenye `index.css`: Kuficha sidebar na header wakati wa print

---

## Maelezo ya Kiufundi

### Faili zitakazohariri:
1. `src/lib/i18n.tsx` - Tafsiri mpya (EN + SW)
2. `src/lib/theme.tsx` - Faili mpya ya ThemeProvider
3. `src/App.tsx` - Kuongeza ThemeProvider
4. `src/pages/SettingsPage.tsx` - Appearance section
5. `src/components/AppLayout.tsx` - Theme toggle kwenye sidebar
6. `src/pages/Courses.tsx` - Button ya "Manage Students" kwa lecturer
7. `src/pages/CourseStudents.tsx` - Ukurasa mpya wa kusimamia wanafunzi
8. `src/pages/Reports.tsx` - Export PDF button
9. `src/index.css` - Print styles

### Mpangilio wa utekelezaji:
1. Kwanza: Theme system (theme.tsx, App.tsx, SettingsPage, AppLayout)
2. Pili: Teacher student management (CourseStudents.tsx, Courses.tsx, App.tsx route)
3. Tatu: PDF export (Reports.tsx, index.css print styles)
