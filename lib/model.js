const day = 86400000;
const categoryWeight = c => /dex|perp|derivative|lending|borrow|credit/i.test(c || '') ? 1.16 : /yield|vault|asset management/i.test(c || '') ? 1.04 : 0.94;
const ageOf = (asOf, listed) => listed && Number.isFinite(Date.parse(listed)) ? Math.max(0, (Date.parse(asOf) - Date.parse(listed)) / day) : 365;
const med = a => { a = [...a].sort((x,y)=>x-y); return a.length ? a.length % 2 ? a[(a.length-1)/2] : (a[a.length/2-1]+a[a.length/2])/2 : 0.22; };
const ratio = p => p.mcap_usd > 0 && p.tvl_usd > 0 ? p.mcap_usd / p.tvl_usd : null;
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
  if (p.chains.length > 1) actions.push(`Compare the available ${chain} deployments and use a second chain only if you have a real reason; avoid moving funds solely to chase a reward. Cost: bridge and destination gas if applicable; time: 15–30 minutes.`);
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
  let ceiling=Infinity;
  const rows=prelim.map((x,i)=>{ const value=Math.min(ceiling,Math.max(1,x.value)); ceiling=value; const p=x.p; return {rank:i+1,slug:p.slug,name:p.name,category:p.category,chains:p.chains,tvl_usd:p.tvl_usd,change_7d:p.change_7d,mcap_usd:p.mcap_usd,listed_at:p.listed_at,gecko_id:p.gecko_id,symbol:p.symbol,token_status:'records no token',implied_value_usd:value,derivation:{method:'same-category median token market-cap / TVL × TVL × capped 7-day growth × capped listing age × category factor',comparable_mcap_tvl:x.comparable_mcap_tvl,growth_factor:x.growth_factor,age_factor:x.age_factor,category_factor:x.category_factor},farm_steps:stepsFor(p)}; });
  return rows;
}
