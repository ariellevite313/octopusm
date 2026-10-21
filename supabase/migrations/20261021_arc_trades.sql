-- Trades Arc (BondingCurveArcV2) mémorisés : le graphique ne relit plus toute la blockchain à chaque affichage.
create table if not exists arc_trades (
  curve      text not null,
  tx_hash    text not null,
  log_index  int  not null,
  block      bigint not null,
  ts         bigint not null,           -- secondes UNIX (horodatage réel du bloc, interpolé dans une tranche)
  is_buy     boolean not null,
  trader     text not null,
  usdc_amt   double precision not null,
  token_amt  double precision not null,
  price      double precision not null,
  primary key (curve, tx_hash, log_index)
);
create index if not exists idx_arc_trades_curve_ts on arc_trades (curve, ts);

create table if not exists arc_trades_state (
  curve      text primary key,
  last_block bigint not null,
  updated_at timestamptz not null default now()
);

alter table arc_trades       enable row level security;
alter table arc_trades_state enable row level security;
