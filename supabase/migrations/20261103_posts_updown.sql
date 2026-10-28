-- Les posts peuvent porter un lien Up/Down (carte avec boutons Up / Down).
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'posts'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%market_kind%' loop
    execute format('alter table posts drop constraint %I', c);
  end loop;
end $$;
alter table posts add constraint posts_market_kind_check check (market_kind in ('pool', 'prediction', 'updown'));
