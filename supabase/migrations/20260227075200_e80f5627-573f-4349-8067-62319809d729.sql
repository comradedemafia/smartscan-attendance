
-- Create levels table
CREATE TABLE public.levels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.levels ENABLE ROW LEVEL SECURITY;

-- Anyone can view levels
CREATE POLICY "Anyone can view levels" ON public.levels FOR SELECT USING (true);

-- Admins can manage levels
CREATE POLICY "Admins can manage levels" ON public.levels FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Add level_id to courses
ALTER TABLE public.courses ADD COLUMN level_id UUID REFERENCES public.levels(id) ON DELETE SET NULL;

-- Add updated_at trigger for levels
CREATE TRIGGER update_levels_updated_at
BEFORE UPDATE ON public.levels
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();

-- Insert the 3 levels for every existing department
INSERT INTO public.levels (department_id, name, code, sort_order)
SELECT d.id, 'Basic Technician Certificate (NTA LEVEL 4)', 'BTCCD', 1
FROM public.departments d
UNION ALL
SELECT d.id, 'Technician Certificate (NTA LEVEL 5)', 'TCCD', 2
FROM public.departments d
UNION ALL
SELECT d.id, 'Ordinary Diploma (NTA LEVEL 6)', 'ODCD', 3
FROM public.departments d;
