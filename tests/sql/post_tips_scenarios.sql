-- Alice: vieux compte (60 j), a un token actif, 1000 OMERO. Bob: auteur. Carl: vieux mais sans activité. Dan: récent avec activité. Eve: 0x mixte.
insert into auth.users (email, raw_app_meta_data, created_at) values
 ('alicesol@octopus-market.wallet', '{"wallet_address":"AliceSol"}', now()-interval '60 days'),
 ('carl@octopus-market.wallet', '{"wallet_address":"Carl"}', now()-interval '60 days'),
 ('dan@octopus-market.wallet', '{"wallet_address":"Dan"}', now()-interval '5 days'),
 ('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd@octopus-market.wallet', '{"wallet_address":"0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD"}', now()-interval '40 days');
insert into launchpad_tokens (creator_wallet, status) values ('AliceSol','active'), ('Dan','active'), ('Carl','pending');
insert into mutuel_markets (creator_wallet, status) values ('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd','active'), ('Carl','rejected');
insert into octo_transactions (wallet_address, type, amount) values ('AliceSol','task',1000),('Carl','task',1000),('Dan','task',1000),('0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD','task',300);
insert into posts (id, author) values ('11111111-1111-1111-1111-111111111111','Bob'), ('22222222-2222-2222-2222-222222222222','AliceSol');
insert into posts (id, author, hidden) values ('33333333-3333-3333-3333-333333333333','Bob', true);
\set P '\'11111111-1111-1111-1111-111111111111\''
select 'ok tip'          , send_post_tip('AliceSol', :P, 100);
select 'self'            , send_post_tip('AliceSol', '22222222-2222-2222-2222-222222222222', 10);
select 'hidden post'     , send_post_tip('AliceSol', '33333333-3333-3333-3333-333333333333', 10);
select 'no post'         , send_post_tip('AliceSol', '44444444-4444-4444-4444-444444444444', 10);
select 'zero'            , send_post_tip('AliceSol', :P, 0);
select 'neg'             , send_post_tip('AliceSol', :P, -5);
select 'over cap single' , send_post_tip('AliceSol', :P, 501);
select 'no activity carl', send_post_tip('Carl', :P, 10);
select 'too new dan'     , send_post_tip('Dan', :P, 10);
select 'unknown wallet'  , send_post_tip('Ghost', :P, 10);
select 'evm lower ok'    , send_post_tip('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd', :P, 250);
select 'evm balance'     , send_post_tip('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd', :P, 100);
select 'daily cap alice' , send_post_tip('AliceSol', :P, 401);
select 'alice 400 ok'    , send_post_tip('AliceSol', :P, 400);
select 'alice cap reached', send_post_tip('AliceSol', :P, 1);
select 'balances', wallet_address, sum(amount) from octo_transactions group by 2 order by 2;
select 'leaderboard', * from leaderboard_octo order by 1;
select 'stats', post_id, sender, sender_total, post_total, rnk from post_tip_stats(array['11111111-1111-1111-1111-111111111111'::uuid]);
-- insufficient balance: new wallet with activity, old, 5 OMERO
insert into auth.users (email, raw_app_meta_data, created_at) values ('poor@octopus-market.wallet','{"wallet_address":"Poor"}', now()-interval '90 days');
insert into launchpad_tokens (creator_wallet, status) values ('Poor','graduated');
insert into octo_transactions (wallet_address, type, amount) values ('Poor','task',5);
select 'poor 6', send_post_tip('Poor', :P, 6);
select 'poor 5', send_post_tip('Poor', :P, 5);
select 'poor again', send_post_tip('Poor', :P, 1);
-- rate limit: 30 per hour
insert into auth.users (email, raw_app_meta_data, created_at) values ('rich@octopus-market.wallet','{"wallet_address":"Rich"}', now()-interval '90 days');
insert into mutuel_markets (creator_wallet, status) values ('Rich','resolved');
insert into octo_transactions (wallet_address, type, amount) values ('Rich','task',100000);
select count(*) filter (where (send_post_tip('Rich', :P, 1))->>'ok' = 'true') as ok_count from generate_series(1,31);
select 'rich 31st', send_post_tip('Rich', :P, 1);
