-- Hazri standalone baseline for a fresh, empty Supabase project.
--
-- This file intentionally contains only the current cloud model. Do not run it
-- together with the older legacy migrations in this directory: those files
-- create deprecated tables that are deliberately absent from this baseline.

-- ── Core tables ─────────────────────────────────────────────────────────────

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  default_required_pct numeric(5, 2) not null default 75,
  theme text not null default 'system',
  swipe_to_delete boolean not null default true,
  manual_mode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  code text,
  color text,
  icon text,
  target_pct numeric not null default 75,
  has_theory boolean not null default true,
  has_lab boolean not null default false,
  has_tutorial boolean not null default false,
  default_lab_units integer not null default 1 check (default_lab_units > 0),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint courses_id_user_id_key unique (id, user_id)
);

create table public.course_components (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null,
  kind text not null check (kind in ('theory', 'lab', 'tutorial')),
  required_pct numeric not null default 75,
  initial_attended integer not null default 0 check (initial_attended >= 0),
  initial_conducted integer not null default 0 check (initial_conducted >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_components_course_kind_key unique (course_id, kind),
  constraint course_components_id_user_id_key unique (id, user_id),
  constraint course_components_course_owner_fkey
    foreign key (course_id, user_id)
    references public.courses (id, user_id)
    on delete cascade
);

create table public.schedule_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  component_id uuid not null,
  weekday smallint not null check (weekday between 0 and 6),
  start_minute integer not null check (start_minute between 0 and 1439),
  end_minute integer not null check (end_minute between 1 and 1440 and end_minute > start_minute),
  units integer not null default 1 check (units > 0),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_entries_id_user_id_key unique (id, user_id),
  constraint schedule_entries_component_owner_fkey
    foreign key (component_id, user_id)
    references public.course_components (id, user_id)
    on delete cascade
);

create table public.attendance_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  component_id uuid not null,
  schedule_entry_id uuid,
  date date not null,
  status text not null check (status in ('attended', 'missed', 'cancelled', 'pending', 'extra', 'credit')),
  units integer not null default 1 check (units > 0),
  source text not null default 'manual',
  note text,
  event_type text not null default 'class' check (event_type in ('class', 'credit')),
  credit_counts_as_conducted boolean not null default true,
  start_minute integer check (start_minute is null or start_minute between 0 and 1439),
  end_minute integer check (end_minute is null or end_minute between 1 and 1440),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_events_component_owner_fkey
    foreign key (component_id, user_id)
    references public.course_components (id, user_id)
    on delete cascade,
  constraint attendance_events_schedule_entry_owner_fkey
    foreign key (schedule_entry_id, user_id)
    references public.schedule_entries (id, user_id)
    on delete set null (schedule_entry_id),
  constraint attendance_events_time_range_check
    check (end_minute is null or start_minute is null or end_minute > start_minute)
);

create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint holidays_user_date_key unique (user_id, date)
);

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('suggestion', 'bug', 'testimonial')),
  message text not null,
  created_at timestamptz not null default now()
);

-- ── Query and referential-integrity indexes ─────────────────────────────────

create index courses_user_archived_created_at_idx
  on public.courses (user_id, archived, created_at);

create index course_components_course_owner_idx
  on public.course_components (course_id, user_id);

create index course_components_user_id_idx
  on public.course_components (user_id);

create index schedule_entries_component_owner_idx
  on public.schedule_entries (component_id, user_id);

create index schedule_entries_user_position_idx
  on public.schedule_entries (user_id, position);

create index attendance_events_component_owner_idx
  on public.attendance_events (component_id, user_id);

create index attendance_events_schedule_entry_owner_idx
  on public.attendance_events (schedule_entry_id, user_id)
  where schedule_entry_id is not null;

create index attendance_events_user_date_idx
  on public.attendance_events (user_id, date);

create unique index attendance_events_slot_date_unique_idx
  on public.attendance_events (user_id, schedule_entry_id, date)
  where schedule_entry_id is not null;

create index feedback_user_created_at_idx
  on public.feedback (user_id, created_at);

-- ── Timestamp and signup helpers ───────────────────────────────────────────

create function public.hazri_set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create function public.hazri_create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.hazri_set_updated_at() from public, anon, authenticated;
revoke all on function public.hazri_create_profile_for_new_user() from public, anon, authenticated;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.hazri_set_updated_at();

create trigger courses_set_updated_at
before update on public.courses
for each row execute function public.hazri_set_updated_at();

create trigger course_components_set_updated_at
before update on public.course_components
for each row execute function public.hazri_set_updated_at();

create trigger schedule_entries_set_updated_at
before update on public.schedule_entries
for each row execute function public.hazri_set_updated_at();

create trigger attendance_events_set_updated_at
before update on public.attendance_events
for each row execute function public.hazri_set_updated_at();

create trigger holidays_set_updated_at
before update on public.holidays
for each row execute function public.hazri_set_updated_at();

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.hazri_create_profile_for_new_user();

insert into public.profiles (id, display_name)
select
  id,
  coalesce(
    raw_user_meta_data ->> 'display_name',
    raw_user_meta_data ->> 'full_name'
  )
from auth.users
on conflict (id) do nothing;

-- ── Grants and row-level security ──────────────────────────────────────────

grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.courses to authenticated;
grant select, insert, update, delete on table public.course_components to authenticated;
grant select, insert, update, delete on table public.schedule_entries to authenticated;
grant select, insert, update, delete on table public.attendance_events to authenticated;
grant select, insert, update, delete on table public.holidays to authenticated;
grant select, insert, update, delete on table public.feedback to authenticated;

alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.course_components enable row level security;
alter table public.schedule_entries enable row level security;
alter table public.attendance_events enable row level security;
alter table public.holidays enable row level security;
alter table public.feedback enable row level security;

create policy "profiles_select_own"
on public.profiles for select to authenticated
using ((select auth.uid()) = id);

create policy "profiles_insert_own"
on public.profiles for insert to authenticated
with check ((select auth.uid()) = id);

create policy "profiles_update_own"
on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "profiles_delete_own"
on public.profiles for delete to authenticated
using ((select auth.uid()) = id);

create policy "courses_select_own"
on public.courses for select to authenticated
using ((select auth.uid()) = user_id);

create policy "courses_insert_own"
on public.courses for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "courses_update_own"
on public.courses for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "courses_delete_own"
on public.courses for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "course_components_select_own"
on public.course_components for select to authenticated
using ((select auth.uid()) = user_id);

create policy "course_components_insert_own"
on public.course_components for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "course_components_update_own"
on public.course_components for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "course_components_delete_own"
on public.course_components for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "schedule_entries_select_own"
on public.schedule_entries for select to authenticated
using ((select auth.uid()) = user_id);

create policy "schedule_entries_insert_own"
on public.schedule_entries for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "schedule_entries_update_own"
on public.schedule_entries for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "schedule_entries_delete_own"
on public.schedule_entries for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "attendance_events_select_own"
on public.attendance_events for select to authenticated
using ((select auth.uid()) = user_id);

create policy "attendance_events_insert_own"
on public.attendance_events for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "attendance_events_update_own"
on public.attendance_events for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "attendance_events_delete_own"
on public.attendance_events for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "holidays_select_own"
on public.holidays for select to authenticated
using ((select auth.uid()) = user_id);

create policy "holidays_insert_own"
on public.holidays for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "holidays_update_own"
on public.holidays for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "holidays_delete_own"
on public.holidays for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "feedback_select_own"
on public.feedback for select to authenticated
using ((select auth.uid()) = user_id);

create policy "feedback_insert_own"
on public.feedback for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "feedback_update_own"
on public.feedback for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "feedback_delete_own"
on public.feedback for delete to authenticated
using ((select auth.uid()) = user_id);
