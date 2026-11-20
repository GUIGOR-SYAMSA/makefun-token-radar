const day = 86400000;
const categoryWeight = c => /dex|perp|derivative|lending|borrow|credit/i.test(c || '') ? 1.16 : /yield|vault|asset management/i.test(c || '') ? 1.04 : 0.94;
const ageOf = (asOf, listed) => listed && Number.isFinite(Date.parse(listed)) ? Math.max(0, (Date.parse(asOf) - Date.parse(listed)) / day) : 365;
const med = a => { a = [...a].sort((x,y)=>x-y); return a.length ? a.length % 2 ? a[(a.length-1)/2] : (a[a.length/2-1]+a[a.length/2])/2 : 0.22; };
const ratio = p => p.mcap_usd > 0 && p.tvl_usd > 0 ? p.mcap_usd / p.tvl_usd : null;
const tvlTier = tvl => {
  if (tvl >= 1e9) return {label:'>$1B', multiplier:1.08};
  if (tvl >= 1e8) return {label:'$100M-$1B', multiplier:1.04};
  if (tvl >= 5e7) return {label:'$50M-$100M', multiplier:1.0};
  return {label:'<$50M', multiplier:0.96};
}; // tvlTier
const stabilityFactor = c => {
  const swing = Math.abs(c || 0);
  if (swing <= 5) return 1.05;
  if (swing <= 15) return 1.0;
  if (swing <= 30) return 0.94;
  if (swing <= 60) return 0.86;
  return 0.76;
}; // stabilityFactor
const chainBonus = chains => {
  const distinct = new Set((chains || []).map(c => String(c).toLowerCase().trim())).size;
  if (distinct <= 1) return 0;
  if (distinct === 2) return 0.03;
  if (distinct === 3) return 0.06;
  return 0.09;
}; // chainBonus
const categoryMomentum = c => {
  const k = (c || '').toLowerCase();
  if (/dex|perp|derivative|exchange/.test(k)) return 1.05;
  if (/bridge|liquid staking|restaking/.test(k)) return 1.04;
  if (/lend|borrow|credit/.test(k)) return 1.03;
  if (/yield|vault|asset management/.test(k)) return 1.02;
  return 1.0;
}; // categoryMomentum
const riskBand = x => {
  const s = x.stability_factor, t = x.tvl_tier.multiplier;
  if (s >= 1.0 && t >= 1.04) return 'low';
  if (s >= 0.94 && t >= 1.0) return 'moderate';
  if (s >= 0.86) return 'elevated';
  return 'high';
}; // riskBand
const derivationNote = x => {
  const tvl = x.p.tvl_usd, m = x.comparable_mcap_tvl, g = x.growth_factor, a = x.age_factor, c = x.category_factor;
  return `TVL $${tvl} × median mcap/TVL ${m} × growth ${g} × age ${a} × category ${c} × stability ${x.stability_factor} × tier ${x.tvl_tier.label} × chains +${x.chain_bonus}`;
}; // derivationNote
const stepsFor = p => {
  const cat = (p.category || 'protocol').toLowerCase(), chain = p.chains.length ? p.chains.slice(0,3).join(', ') : 'the listed chain';
  const actions = /dex|perp|derivative|exchange/i.test(cat) ? [
    `Check the ${p.name} app and its supported ${chain} markets; connect a wallet and verify the domain from the protocol's own public materials. Cost: gas only, usually $0.05–$3; time: 5–10 minutes.`,
    `If suitable, make a small spot swap or open and close a low-risk position on ${chain}; review fees and liquidation terms first. Cost: gas plus the quoted trading fee; time: 10–20 minutes.`,
    `Return later to make a second independent trade only if the market remains useful to you; save transaction links and note the total fee. Cost: gas and trading fees; time: 5–15 minutes.`
  ] : /lend|borrow|credit/i.test(cat) ? [
    `Review the ${p.name} markets on ${chain}, including collateral factors and liquidation thresholds, before connecting. Cost: $0; time: 5–10 minutes.`,
    `If the terms fit your risk limits, supply a small amount of an accepted asset and confirm the receipt or position in the app. Cost: gas and any displayed supply fee; time: 10–15 minutes.`,
    `Check the position after a day, then repay or withdraw when appropriate; retain enough native asset for both transactions. Cost: two network fees; time: 5–10 minutes.`
  ] : [
    `Inspect the ${p.name} app and supported ${chain} networks; confirm current actions and fees before connecting a wallet. Cost: $0; time: 5–10 minutes.`,
    `Use one small, reversible core action offered by the protocol, such as a deposit, transfer or vault interaction, if its risks suit you. Cost: gas plus any shown fee; time: 10–20 minutes.`,
    `Revisit after several days to check the position, then withdraw or continue only on its merits. The snapshot records no token; it does not establish an airdrop or farm program. Cost: gas; time: 5–10 minutes.`
  ];
  if (/yield|vault|asset management/i.test(cat)) actions.splice(0, actions.length,
    `Check the ${p.name} vault app on ${chain}; read the strategy description, fee schedule and withdrawal terms before connecting a wallet. Cost: $0; time: 5–10 minutes.`,
    `If the terms fit your risk limits, deposit a small amount into the vault and confirm the position and receipt in the app. Cost: gas plus any shown deposit fee; time: 10–20 minutes.`,
    `Revisit after a week to compare the position with the stated strategy, then withdraw or continue only on its merits; the snapshot records no token and no official farm program. Cost: gas; time: 5–10 minutes.`
  ); // yield vault branch
  if (p.chains.length > 1) actions.push(`Compare the available ${chain} deployments and use a second chain only if you have a real reason; avoid moving funds solely to chase a reward. Cost: bridge and destination gas if applicable; time: 15–30 minutes.`);
  if (p.chains.length > 2) actions.push(`For a third chain, use only the protocol's own documented bridge route; verify the destination address and expected arrival before sending anything. Cost: bridge fee plus destination gas; time: 20–40 minutes.`);
  if (p.mcap_usd == null && p.gecko_id == null && p.symbol == null) actions.push(`Find the protocol's public governance forum or community calls and read recent proposals before taking part; the snapshot records no token, so there is no token vote to join. Cost: $0; time: 10–20 minutes.`);
  return actions.map((step, i) => i === 0 && p.mcap_usd == null && p.gecko_id == null && p.symbol == null ? `${step} The snapshot records no token.` : step);
};
export function buildBoard(snapshot) {
  const idx = new Map(snapshot.protocols.map(p=>[p.slug,p]));
  const ratios = new Map();
  for (const p of snapshot.protocols) if (p.mcap_usd > 0 && p.tvl_usd > 0) { const k=(p.category||'Other').toLowerCase(); if(!ratios.has(k)) ratios.set(k,[]); ratios.get(k).push(ratio(p)); }
  const categoryMedian = new Map([...ratios].map(([k,v])=>[k,med(v)]));
  const watch = new Set(snapshot.watchlist);
  const pre = snapshot.protocols.filter(p=>p.mcap_usd == null && p.gecko_id == null && p.symbol == null);
  const eligible = pre.sort((a,b)=>score(b)-score(a)||a.slug.localeCompare(b.slug)).slice(0,110);
  for(const slug of watch) { const p=idx.get(slug); if(p && !eligible.includes(p)) eligible.push(p); }
  function score(p){ const g=Math.max(-50,Math.min(100,p.change_7d||0)); const age=Math.min(1460,ageOf(snapshot.as_of,p.listed_at)); return Math.log1p(p.tvl_usd)*1.2 + g*.012 + Math.log1p(age)*.32 + Math.log(categoryWeight(p.category)) + Math.log1p(p.chains.length)*.09; }
  const prelim = eligible.map(p=>{ const g=Math.max(-50,Math.min(100,p.change_7d||0)); const age=Math.min(1460,ageOf(snapshot.as_of,p.listed_at)); const gm=1+g/100*.35; const am=.72+age/1460*.28; const cm=categoryWeight(p.category); const tvlMultiple=categoryMedian.get((p.category||'Other').toLowerCase()) ?? .22; return {p,score:score(p),value:Math.round(p.tvl_usd*tvlMultiple*gm*am*cm),growth_factor:gm,age_factor:am,category_factor:cm,comparable_mcap_tvl:tvlMultiple}; }).sort((a,b)=>b.score-a.score||a.p.slug.localeCompare(b.p.slug));
  prelim.forEach(x => { x.stability_factor = stabilityFactor(x.p.change_7d); x.tvl_tier = tvlTier(x.p.tvl_usd); });
  prelim.forEach(x => { x.chain_bonus = chainBonus(x.p.chains); x.category_momentum = categoryMomentum(x.p.category); }); // enrich prelim
  let ceiling=Infinity;
  const rows=prelim.map((x,i)=>{ const value=Math.min(ceiling,Math.max(1,x.value)); ceiling=value; const p=x.p; return {rank:i+1,slug:p.slug,name:p.name,category:p.category,chains:p.chains,tvl_usd:p.tvl_usd,change_7d:p.change_7d,mcap_usd:p.mcap_usd,listed_at:p.listed_at,gecko_id:p.gecko_id,symbol:p.symbol,token_status:'records no token',implied_value_usd:value,derivation:{method:'same-category median token market-cap / TVL × TVL × capped 7-day growth × capped listing age × category factor',comparable_mcap_tvl:x.comparable_mcap_tvl,growth_factor:x.growth_factor,age_factor:x.age_factor,category_factor:x.category_factor},farm_steps:stepsFor(p)}; });
  rows.forEach((r, i) => { const x = prelim[i]; r.stability_factor = x.stability_factor; r.tvl_tier = x.tvl_tier.label; r.chain_bonus = x.chain_bonus; r.category_momentum = x.category_momentum; });
  rows.forEach((r, i) => { r.derivation_note = derivationNote(prelim[i]); r.risk_band = riskBand(prelim[i]); }); // enrich rows
  return rows;
}
