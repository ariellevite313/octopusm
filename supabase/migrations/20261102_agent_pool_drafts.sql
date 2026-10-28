-- Brouillons de marchés proposés par une IA (kind create_pool) : l'humain ouvre le lien, relit, paie les frais avec son wallet et crée le marché.
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'agent_intents'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%kind%' loop
    execute format('alter table agent_intents drop constraint %I', c);
  end loop;
end $$;
alter table agent_intents add constraint agent_intents_kind_check check (kind in ('bet_pool', 'buy_token', 'sell_token', 'create_pool'));
alter table agent_intents alter column target_id drop not null;
