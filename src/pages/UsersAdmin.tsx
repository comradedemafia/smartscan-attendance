import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Search, UserCheck, UserX } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export default function UsersAdmin() {
  const { t } = useI18n();
  const { role } = useAuth();
  const [search, setSearch] = useState("");
  const [filterGender, setFilterGender] = useState<string>("all");
  const [filterCourse, setFilterCourse] = useState<string>("all");

  // Get all profiles
  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, university_id, email, gender")
        .order("full_name");
      if (error) throw error;
      return data;
    },
    enabled: role === "admin",
  });

  // Get all roles
  const { data: roles = [] } = useQuery({
    queryKey: ["admin-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role");
      if (error) throw error;
      return data;
    },
    enabled: role === "admin",
  });

  // Get courses
  const { data: courses = [] } = useQuery({
    queryKey: ["admin-courses-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("id, name, code");
      if (error) throw error;
      return data;
    },
    enabled: role === "admin",
  });

  // Get all enrollments
  const { data: enrollments = [] } = useQuery({
    queryKey: ["admin-enrollments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("course_enrollments").select("user_id, course_id");
      if (error) throw error;
      return data;
    },
    enabled: role === "admin",
  });

  const roleMap = Object.fromEntries(roles.map((r) => [r.user_id, r.role]));
  const enrollmentsByCourse: Record<string, Set<string>> = {};
  enrollments.forEach((e) => {
    if (!enrollmentsByCourse[e.course_id]) enrollmentsByCourse[e.course_id] = new Set();
    enrollmentsByCourse[e.course_id].add(e.user_id);
  });

  // Only show students
  const students = profiles.filter((p) => roleMap[p.id] === "student");

  const filtered = students.filter((p) => {
    const q = search.toLowerCase();
    const matchSearch = !search || p.full_name.toLowerCase().includes(q) || p.university_id.toLowerCase().includes(q);
    const matchGender = filterGender === "all" || p.gender === filterGender;
    const matchCourse = filterCourse === "all" || enrollmentsByCourse[filterCourse]?.has(p.id);
    return matchSearch && matchGender && matchCourse;
  });

  const maleCount = filtered.filter((p) => p.gender === "M").length;
  const femaleCount = filtered.filter((p) => p.gender === "F").length;

  if (role !== "admin") {
    return <p className="text-muted-foreground">{t("reports.noData")}</p>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight font-['Space_Grotesk']">{t("nav.users")}</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <Users className="h-6 w-6 mx-auto mb-2 text-primary" />
            <p className="text-2xl font-bold">{filtered.length}</p>
            <p className="text-xs text-muted-foreground">{t("admin.totalStudents")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <UserCheck className="h-6 w-6 mx-auto mb-2 text-primary" />
            <p className="text-2xl font-bold">{maleCount}</p>
            <p className="text-xs text-muted-foreground">{t("auth.male")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <UserX className="h-6 w-6 mx-auto mb-2 text-primary" />
            <p className="text-2xl font-bold">{femaleCount}</p>
            <p className="text-xs text-muted-foreground">{t("auth.female")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <Users className="h-6 w-6 mx-auto mb-2 text-primary" />
            <p className="text-2xl font-bold">{courses.length}</p>
            <p className="text-xs text-muted-foreground">{t("dashboard.totalCourses")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder={t("common.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterGender} onValueChange={setFilterGender}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder={t("auth.gender")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("admin.allGenders")}</SelectItem>
            <SelectItem value="M">{t("auth.male")}</SelectItem>
            <SelectItem value="F">{t("auth.female")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterCourse} onValueChange={setFilterCourse}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder={t("admin.filterByCourse")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("admin.allCourses")}</SelectItem>
            {courses.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t("admin.studentList")} ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">{t("common.loading")}</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">{t("reports.noData")}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>{t("reports.studentName")}</TableHead>
                    <TableHead>{t("reports.universityId")}</TableHead>
                    <TableHead>{t("auth.email")}</TableHead>
                    <TableHead>{t("auth.gender")}</TableHead>
                    <TableHead>{t("admin.enrolledCourses")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p, i) => {
                    const studentCourses = courses.filter((c) => enrollmentsByCourse[c.id]?.has(p.id));
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium">{p.full_name}</TableCell>
                        <TableCell>{p.university_id}</TableCell>
                        <TableCell className="text-muted-foreground">{p.email || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={p.gender === "M" ? "default" : p.gender === "F" ? "secondary" : "outline"}>
                            {p.gender === "M" ? t("auth.male") : p.gender === "F" ? t("auth.female") : "—"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {studentCourses.length === 0 ? (
                              <span className="text-muted-foreground text-xs">—</span>
                            ) : (
                              studentCourses.map((c) => (
                                <Badge key={c.id} variant="outline" className="text-xs">{c.code}</Badge>
                              ))
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
