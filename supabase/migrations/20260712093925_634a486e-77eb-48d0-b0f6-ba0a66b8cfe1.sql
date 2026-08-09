
ALTER TABLE public.attendance_events
  DROP CONSTRAINT IF EXISTS attendance_events_status_check;

ALTER TABLE public.attendance_events
  ADD CONSTRAINT attendance_events_status_check
    CHECK (status IN ('attended','missed','cancelled','pending','extra','credit'));

ALTER TABLE public.attendance_events
  ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'class'
    CHECK (event_type IN ('class','credit')),
  ADD COLUMN IF NOT EXISTS credit_counts_as_conducted BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS start_minute INTEGER,
  ADD COLUMN IF NOT EXISTS end_minute INTEGER;
