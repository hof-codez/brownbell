-- 043-trade-live-values.sql
-- Values now move live. Every vote that changes a rating also changes the published
-- rating, and bumps the settings version so apps know to reload. The old weekly voting
-- window no longer holds anything back (tc_publish still exists but changes nothing visible).

create or replace function tc_live_publish() returns trigger
language plpgsql as $$
begin
    new.published_rating := new.rating;
    return new;
end $$;

drop trigger if exists tc_assets_live_publish on tc_assets;
create trigger tc_assets_live_publish
    before update of rating on tc_assets
    for each row execute function tc_live_publish();

create or replace function tc_bump_version() returns trigger
language plpgsql as $$
begin
    update tc_settings set version = version + 1, published_at = now() where id = 1;
    return null;
end $$;

drop trigger if exists tc_assets_bump_version on tc_assets;
create trigger tc_assets_bump_version
    after update of rating on tc_assets
    for each statement execute function tc_bump_version();

-- catch up: show what the votes have built so far
update tc_assets set published_rating = rating where published_rating <> rating;

revoke all on function tc_live_publish() from public, anon, authenticated;
revoke all on function tc_bump_version() from public, anon, authenticated;
