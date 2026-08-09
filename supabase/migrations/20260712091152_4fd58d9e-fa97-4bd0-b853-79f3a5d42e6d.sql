
-- Courses
CREATE TABLE public.courses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  color TEXT,
  icon TEXT,
  target_pct NUMERIC NOT NULL DEFAULT 75,
  has_theory BOOLEAN NOT NULL DEFAULT true,
  has_lab BOOLEAN NOT NULL DEFAULT false,
  has_tutorial BOOLEAN NOT NULL DEFAULT false,
  default_lab_units INTEGER NOT NULL DEFAULT 1,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses TO authenticated;
GRANT ALL ON public.courses TO service_role;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own courses" ON public.courses FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Course components
CREATE TABLE public.course_components (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('theory','lab','tutorial')),
  required_pct NUMERIC NOT NULL DEFAULT 75,
  initial_attended INTEGER NOT NULL DEFAULT 0,
  initial_conducted INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (course_id, kind)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_components TO authenticated;
GRANT ALL ON public.course_components TO service_role;
ALTER TABLE public.course_components ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own components" ON public.course_components FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Schedule entries
CREATE TABLE public.schedule_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  component_id UUID NOT NULL REFERENCES public.course_components(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_minute INTEGER NOT NULL,
  end_minute INTEGER NOT NULL,
  units INTEGER NOT NULL DEFAULT 1,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX schedule_entries_user_weekday_idx ON public.schedule_entries (user_id, weekday);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_entries TO authenticated;
GRANT ALL ON public.schedule_entries TO service_role;
ALTER TABLE public.schedule_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own schedule" ON public.schedule_entries FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Attendance events
CREATE TABLE public.attendance_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  component_id UUID NOT NULL REFERENCES public.course_components(id) ON DELETE CASCADE,
  schedule_entry_id UUID REFERENCES public.schedule_entries(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('attended','missed','cancelled','extra','credit')),
  units INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'manual',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX attendance_events_user_date_idx ON public.attendance_events (user_id, date);
CREATE INDEX attendance_events_component_idx ON public.attendance_events (component_id);
CREATE UNIQUE INDEX attendance_events_slot_unique
  ON public.attendance_events (user_id, schedule_entry_id, date)
  WHERE schedule_entry_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_events TO authenticated;
GRANT ALL ON public.attendance_events TO service_role;
ALTER TABLE public.attendance_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own events" ON public.attendance_events FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Holidays
CREATE TABLE public.holidays (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  date DATE NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.holidays TO authenticated;
GRANT ALL ON public.holidays TO service_role;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own holidays" ON public.holidays FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- updated_at triggers (reuse existing set_updated_at)
CREATE TRIGGER courses_set_updated_at BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER course_components_set_updated_at BEFORE UPDATE ON public.course_components
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER schedule_entries_set_updated_at BEFORE UPDATE ON public.schedule_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER attendance_events_set_updated_at BEFORE UPDATE ON public.attendance_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER holidays_set_updated_at BEFORE UPDATE ON public.holidays
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
