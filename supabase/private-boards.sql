begin;

-- Apply this file before deploying the versioned board.js client.
-- Existing rooms are preserved and receive an opaque revision token.
create table if not exists public.private_boards (
    room_id text primary key,
    ciphertext text not null,
    iv text not null,
    salt text not null,
    revision uuid not null default gen_random_uuid(),
    updated_at timestamptz not null default now(),
    expires_at timestamptz not null,
    constraint private_boards_room_id_format check (room_id ~ '^[0-9a-f]{64}$'),
    -- 20,000 UTF-16 characters can expand to 160,056 base64 characters after JSON/AES-GCM.
    constraint private_boards_ciphertext_length check (char_length(ciphertext) between 16 and 200000),
    constraint private_boards_iv_length check (char_length(iv) between 12 and 64),
    constraint private_boards_salt_length check (char_length(salt) between 16 and 64)
);

alter table public.private_boards
    add column if not exists revision uuid not null default gen_random_uuid();
alter table public.private_boards drop constraint if exists private_boards_ciphertext_length;
alter table public.private_boards add constraint private_boards_ciphertext_length
    check (char_length(ciphertext) between 16 and 200000);
alter table public.private_boards enable row level security;
revoke all on table public.private_boards from public, anon, authenticated;

-- Keep legacy readers usable while old pages finish their session.
create or replace function public.read_private_board(p_room_id text)
returns table (ciphertext text, iv text, salt text, updated_at timestamptz, expires_at timestamptz)
language sql stable security definer set search_path = ''
as $$
    select b.ciphertext, b.iv, b.salt, b.updated_at, b.expires_at
    from public.private_boards b
    where b.room_id = p_room_id and p_room_id ~ '^[0-9a-f]{64}$' and b.expires_at > now()
    limit 1;
$$;

create or replace function public.read_private_board_versioned(p_room_id text)
returns table (ciphertext text, iv text, salt text, updated_at timestamptz, expires_at timestamptz, revision uuid)
language sql stable security definer set search_path = ''
as $$
    select b.ciphertext, b.iv, b.salt, b.updated_at, b.expires_at, b.revision
    from public.private_boards b
    where b.room_id = p_room_id and p_room_id ~ '^[0-9a-f]{64}$' and b.expires_at > now()
    limit 1;
$$;

-- Retain the legacy signature, but block unconditional writes from old clients.
-- They display their existing copy/retry recovery controls until refreshed.
create or replace function public.save_private_board(
    p_room_id text, p_ciphertext text, p_iv text, p_salt text, p_ttl_days integer default 30
)
returns timestamptz
language plpgsql security definer set search_path = ''
as $$
begin
    raise exception 'Refresh the page to use versioned saves' using errcode = '0A000';
end;
$$;

create or replace function public.save_private_board_if_current(
    p_room_id text,
    p_ciphertext text,
    p_iv text,
    p_salt text,
    p_expected_revision uuid,
    p_ttl_days integer default 30
)
returns table (revision uuid, expires_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
    v_revision uuid := gen_random_uuid();
    v_expires_at timestamptz := now() + make_interval(days => p_ttl_days);
begin
    if p_room_id is null or p_room_id !~ '^[0-9a-f]{64}$' then
        raise exception 'Invalid room id';
    end if;
    if p_ttl_days is null or p_ttl_days not in (1, 7, 30) then
        raise exception 'Invalid expiry';
    end if;
    if p_ciphertext is null or char_length(p_ciphertext) not between 16 and 200000
        or p_iv is null or char_length(p_iv) not between 12 and 64
        or p_salt is null or char_length(p_salt) not between 16 and 64 then
        raise exception 'Invalid encrypted payload';
    end if;

    -- UUID revisions also protect against stale sessions when an expired PIN is reused.
    delete from public.private_boards where private_boards.expires_at <= now();
    if p_expected_revision is null then
        insert into public.private_boards (room_id, ciphertext, iv, salt, revision, updated_at, expires_at)
        values (p_room_id, p_ciphertext, p_iv, p_salt, v_revision, now(), v_expires_at)
        on conflict (room_id) do nothing;
    else
        -- PostgreSQL rechecks this predicate after waiting for a concurrent writer.
        update public.private_boards b
        set ciphertext = p_ciphertext, iv = p_iv, salt = p_salt,
            revision = v_revision, updated_at = now(), expires_at = v_expires_at
        where b.room_id = p_room_id and b.revision = p_expected_revision and b.expires_at > now();
    end if;
    if not found then
        raise exception 'private_board_conflict' using errcode = '40001';
    end if;
    return query select v_revision, v_expires_at;
end;
$$;

revoke all on function public.read_private_board(text) from public;
revoke all on function public.read_private_board_versioned(text) from public;
revoke all on function public.save_private_board(text, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.save_private_board_if_current(text, text, text, text, uuid, integer) from public;
grant execute on function public.read_private_board(text) to anon, authenticated;
grant execute on function public.read_private_board_versioned(text) to anon, authenticated;
grant execute on function public.save_private_board_if_current(text, text, text, text, uuid, integer) to anon, authenticated;

commit;
