-- StrengthofLife client portal: initial schema and access policies.
-- Apply only to the dedicated Supabase project for this portal.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    email text not null unique,
    display_name text not null default '',
    role text not null default 'client' check (role in ('trainer', 'client')),
    status text not null default 'active' check (status in ('invited', 'active')),
    created_at timestamptz not null default now()
);

create table public.categories (
    id text primary key check (id ~ '^[a-z0-9-]+$'),
    name text not null,
    sort_order integer not null default 0,
    created_at timestamptz not null default now()
);

create table public.guides (
    id uuid primary key default gen_random_uuid(),
    category_id text not null references public.categories (id) on update cascade,
    title text not null,
    description text not null default '',
    media_path text,
    media_kind text not null default 'video' check (media_kind in ('video', 'image', 'document')),
    duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
    is_published boolean not null default true,
    sort_order integer not null default 0,
    created_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.assignments (
    id uuid primary key default gen_random_uuid(),
    client_id uuid not null references public.profiles (id) on delete cascade,
    guide_id uuid not null references public.guides (id) on delete cascade,
    assigned_by uuid not null default auth.uid() references public.profiles (id) on delete restrict,
    coach_note text not null default '',
    created_at timestamptz not null default now(),
    unique (client_id, guide_id)
);

create index assignments_client_id_idx on public.assignments (client_id);
create index assignments_guide_id_idx on public.assignments (guide_id);
create index guides_category_id_idx on public.guides (category_id);
create index guides_media_path_idx on public.guides (media_path) where media_path is not null;

-- This helper is owned by the migration owner and reads profiles without
-- recursing through the profiles SELECT policy. Clients cannot edit role.
create or replace function private.is_trainer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.profiles p
        where p.id = (select auth.uid())
          and p.role = 'trainer'
    );
$$;
revoke all on function private.is_trainer() from public, anon;
grant execute on function private.is_trainer() to authenticated;

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles (id, email, display_name, role, status)
    values (
        new.id,
        coalesce(new.email, ''),
        coalesce(new.raw_user_meta_data ->> 'display_name', ''),
        case when new.raw_app_meta_data ->> 'role' = 'trainer' then 'trainer' else 'client' end,
        case when new.email_confirmed_at is null then 'invited' else 'active' end
    )
    on conflict (id) do update
      set email = excluded.email,
          status = excluded.status,
          display_name = case when excluded.display_name <> '' then excluded.display_name else public.profiles.display_name end;
    return new;
end;
$$;
revoke all on function private.handle_new_auth_user() from public, anon, authenticated;

create trigger on_auth_user_created_portal_profile
    after insert or update of email_confirmed_at on auth.users
    for each row execute function private.handle_new_auth_user();

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.guides enable row level security;
alter table public.assignments enable row level security;

revoke all on public.profiles, public.categories, public.guides, public.assignments from anon;
revoke all on public.profiles, public.categories, public.guides, public.assignments from authenticated;

grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.guides to authenticated;
grant select, insert, update, delete on public.assignments to authenticated;

create policy "profiles are visible to owner and trainer"
    on public.profiles for select to authenticated
    using (id = (select auth.uid()) or (select private.is_trainer()));

create policy "categories are visible to signed-in users"
    on public.categories for select to authenticated
    using (true);
create policy "trainer manages categories"
    on public.categories for all to authenticated
    using ((select private.is_trainer()))
    with check ((select private.is_trainer()));

create policy "trainer or assigned clients can read published guides"
    on public.guides for select to authenticated
    using (
        (select private.is_trainer())
        or (
            is_published
            and exists (
                select 1 from public.assignments a
                where a.guide_id = guides.id
                  and a.client_id = (select auth.uid())
            )
        )
    );
create policy "trainer manages guides"
    on public.guides for all to authenticated
    using ((select private.is_trainer()))
    with check ((select private.is_trainer()));

create policy "clients see their assignments and trainer sees all"
    on public.assignments for select to authenticated
    using (client_id = (select auth.uid()) or (select private.is_trainer()));
create policy "trainer creates assignments for clients"
    on public.assignments for insert to authenticated
    with check (
        (select private.is_trainer())
        and assigned_by = (select auth.uid())
        and exists (
            select 1 from public.profiles p
            where p.id = client_id and p.role = 'client'
        )
    );
create policy "trainer updates assignments"
    on public.assignments for update to authenticated
    using ((select private.is_trainer()))
    with check ((select private.is_trainer()) and assigned_by = (select auth.uid()));
create policy "trainer deletes assignments"
    on public.assignments for delete to authenticated
    using ((select private.is_trainer()));

insert into public.categories (id, name, sort_order) values
    ('beh', 'Beh', 1),
    ('plavanie', 'Plávanie', 2),
    ('cyklistika', 'Cyklistika', 3),
    ('silovy', 'Silový tréning', 4),
    ('mobilita', 'Mobilita a strečing', 5),
    ('regeneracia', 'Regenerácia', 6)
on conflict (id) do update set name = excluded.name, sort_order = excluded.sort_order;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'training-media',
    'training-media',
    false,
    104857600,
    array['video/mp4', 'video/webm', 'image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

create policy "trainer uploads training media"
    on storage.objects for insert to authenticated
    with check (bucket_id = 'training-media' and (select private.is_trainer()));

create policy "trainer and assigned clients read training media"
    on storage.objects for select to authenticated
    using (
        bucket_id = 'training-media'
        and (
            (select private.is_trainer())
            or exists (
                select 1
                from public.guides g
                join public.assignments a on a.guide_id = g.id
                where g.media_path = storage.objects.name
                  and g.is_published
                  and a.client_id = (select auth.uid())
            )
        )
    );

create policy "trainer updates training media"
    on storage.objects for update to authenticated
    using (bucket_id = 'training-media' and (select private.is_trainer()))
    with check (bucket_id = 'training-media' and (select private.is_trainer()));

create policy "trainer deletes training media"
    on storage.objects for delete to authenticated
    using (bucket_id = 'training-media' and (select private.is_trainer()));
