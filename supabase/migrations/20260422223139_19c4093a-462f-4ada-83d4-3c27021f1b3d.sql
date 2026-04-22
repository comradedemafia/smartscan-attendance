-- 1. Create semesters table tied to a level
CREATE TABLE IF NOT EXISTS public.semesters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level_id uuid NOT NULL REFERENCES public.levels(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (level_id, code)
);

ALTER TABLE public.semesters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view semesters"
  ON public.semesters FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage semesters"
  ON public.semesters FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_semesters_updated_at
  BEFORE UPDATE ON public.semesters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 2. Add semester_id to courses
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS semester_id uuid REFERENCES public.semesters(id) ON DELETE SET NULL;

-- 3. Fix existing departments: rename "semester 1" -> Community Development (CD)
--    and delete unused "Semester 2"
UPDATE public.departments
SET name = 'Community Development (CD)',
    description = 'Department of Community Development'
WHERE id = '7d893635-00cd-4933-b358-1255aa2c3639';

DELETE FROM public.departments
WHERE id = 'af94bbdb-5761-4d83-8da5-0969adb1ae3b';

-- 4. Create a default Semester 1 under each existing level and backfill courses
DO $$
DECLARE
  lvl RECORD;
  new_sem_id uuid;
BEGIN
  FOR lvl IN SELECT id FROM public.levels LOOP
    INSERT INTO public.semesters (level_id, name, code, sort_order)
    VALUES (lvl.id, 'Semester 1', 'S1', 1)
    ON CONFLICT (level_id, code) DO NOTHING;

    SELECT id INTO new_sem_id FROM public.semesters WHERE level_id = lvl.id AND code = 'S1';

    UPDATE public.courses
    SET semester_id = new_sem_id
    WHERE level_id = lvl.id AND semester_id IS NULL;
  END LOOP;
END $$;