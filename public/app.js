(function(){
'use strict';
const db=window.PORTFOLIO_DATA||{nav:{},holdings:{},fx_usd_eur:{},cashflows:{}};
const $=(id)=>document.getElementById(id);
const sorted=(xs)=>xs.slice().sort();
const snapDates=sorted(Object.keys(db.holdings||{}));
const navDates=sorted(Object.keys(db.nav||{}).filter(d=>d>=(db.chart_start_date||db.inception_date||'0000-01-01')));
const fxDates=sorted(Object.keys(db.fx_usd_eur||{}));
const eur=(n)=>Number.isFinite(n)?new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(n):'—';
const fixed=(n,p=2)=>Number.isFinite(n)?new Intl.NumberFormat('en-IE',{maximumFractionDigits:p}).format(n):'—';
const text=(id,v)=>{$(id).textContent=v;};
const esc=(x)=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let period='Weekly',selected=snapDates.at(-1);
function rate(d){if(!d)return NaN;for(let i=fxDates.length-1;i>=0;i--){let s=fxDates[i];if(s>d)continue;let diff=(Date.parse(d+'T12:00:00Z')-Date.parse(s+'T12:00:00Z'))/86400000;return diff<=7?Number(db.fx_usd_eur[s]):NaN;}return NaN;}
function amount(d,v){if(v===null||v===undefined)return NaN;let r=rate(d);return Number.isFinite(r)?Number(v)*r:NaN;}
function bucket(d){if(period==='Yearly')return d.slice(0,4);if(period==='Monthly')return d.slice(0,7);if(period==='Quarterly')return d.slice(0,4)+' Q'+(Math.floor((Number(d.slice(5,7))-1)/3)+1);let dt=new Date(d+'T12:00:00Z');let day=dt.getUTCDay();dt.setUTCDate(dt.getUTCDate()+(5-day+7)%7);return dt.toISOString().slice(0,10);}
function sampleDates(dates){let m=new Map();dates.forEach(d=>m.set(bucket(d),d));return [...m.values()];}
function historyDates(dates){const sampled=sampleDates(dates);if(dates.length && sampled[0]!==dates[0])sampled.unshift(dates[0]);return sampled;}
function renderHistory(){
const available=navDates.filter(d=>Number.isFinite(amount(d,db.nav[d].total_base)));
const latest=available.at(-1);
const cutoff=latest?new Date(Date.parse(latest+'T12:00:00Z')-364*86400000).toISOString().slice(0,10):null;
const yearDates=available.filter(d=>d>=cutoff);
const allPoints=historyDates(available).map(d=>({date:d,value:amount(d,db.nav[d].total_base)}));
const yearPoints=historyDates(yearDates).map(d=>({date:d,value:amount(d,db.nav[d].total_base)}));
window.PortfolioChart.render($('nav-chart'),allPoints,{title:'Portfolio value — all time',yLabel:'Portfolio value (EUR)'});
window.PortfolioChart.render($('nav-chart-year'),yearPoints,{title:'Portfolio value — last 365 days',yLabel:'Portfolio value (EUR)'});
text('nav-all-range',available.length?available[0]+' — '+latest:'No data');
text('nav-year-range',latest?cutoff+' — '+latest:'No data');
text('history-count',`${allPoints.length} all-time points · ${yearPoints.length} last-year points · ${navDates.length} recorded NAV dates`);
text('nav-period',period);
const missing=navDates.length-available.length;
const msg=$('fx-notice');msg.hidden=!(missing>0);
if(missing>0)msg.textContent='FX conversion for some historical NAV dates is not yet complete. Automatic synchronization downloads ECB rates to fill in those dates.';
}
function render(){const latest=navDates.at(-1);text('last-date',latest||'—');text('last-sync',`Positions: ${snapDates.at(-1)||'not available'} · End-of-day`);
renderHistory();const options=sampleDates(snapDates);$('snapshot').innerHTML='';options.forEach(d=>{let op=document.createElement('option');op.value=d;op.textContent=d;$('snapshot').appendChild(op);});if(!options.includes(selected))selected=options.at(-1);$('snapshot').value=selected||'';
const rows=(db.holdings[selected]||[]).slice().sort((a,b)=>b.value_base-a.value_base);
const invest=rows.reduce((s,r)=>s+r.value_base,0),cost=rows.reduce((s,r)=>s+(r.cost_base||0),0),pnl=rows.reduce((s,r)=>s+(r.pnl_base||0),0),fx=rate(selected);
const nav=db.nav[selected]&&Number(db.nav[selected].total_base);const navEuro=nav!==undefined?amount(selected,nav):NaN;
text('nav-value',eur(navEuro));text('hold-value',eur(amount(selected,invest)));text('cost-value',eur(amount(selected,cost)));text('pnl-value',eur(amount(selected,pnl)));text('pnl-pct',`${fixed(100*pnl/cost)}% of current open-position cost`);$('pnl-value').className='metric-value '+(pnl<0?'negative':'positive');text('hold-count',`${rows.length} investments as of ${selected||'—'}`);text('count-label',`${rows.length} holdings`);
const alloc=$('allocation');alloc.replaceChildren();if(!rows.length){alloc.innerHTML='<div class="empty">No dated open-position snapshots available.</div>';}else{let arr=rows.slice(0,8),remainder=rows.slice(8).reduce((s,r)=>s+r.value_base,0);if(remainder)arr.push({symbol:'Other',value_base:remainder});arr.forEach(r=>{const pct=invest?100*r.value_base/invest:0;const el=document.createElement('div');el.className='bar-row';el.innerHTML=`<div class="bar-line"><strong>${esc(r.symbol)}</strong><span>${fixed(pct,1)}%</span></div><div class="bar-bg"><div class="bar-fill" style="width:${Math.max(0,Math.min(100,pct))}%"></div></div>`;alloc.appendChild(el);});}
const tbody=$('holdings-table');tbody.replaceChildren();rows.forEach(r=>{const tr=document.createElement('tr');const share=invest?100*r.value_base/invest:NaN;const pctNav=nav?100*r.value_base/nav:NaN;const profit=amount(selected,r.pnl_base);tr.innerHTML=`<td><div class="ticker"><span class="ticker-icon">${esc(r.symbol.slice(0,4))}</span><div><strong>${esc(r.symbol)}</strong><small title="${esc(r.name)}">${esc(r.name)}</small></div></div></td><td class="cell-muted">${fixed(r.quantity,5)}</td><td>${eur(amount(selected,r.cost_base))}</td><td><strong>${eur(amount(selected,r.value_base))}</strong></td><td>${fixed(share,2)}%</td><td>${fixed(pctNav,2)}%</td><td class="${profit<0?'negative':'positive'}">${eur(profit)}</td>`;tbody.appendChild(tr);});
const dated=snapDates.length;text('holdings-history-info',dated===1?'The uploaded Flex XML has 1 holdings date. Each scheduled IBKR sync archives the next actual holdings snapshot; weekly, monthly, quarterly and yearly breakdowns populate automatically.':`${dated} dated holdings snapshots are archived. The selector only offers actual recorded snapshots — missing dates are never fabricated.`);
}
document.querySelectorAll('[data-period]').forEach(btn=>btn.addEventListener('click',()=>{period=btn.dataset.period;document.querySelectorAll('[data-period]').forEach(x=>x.classList.toggle('active',x===btn));selected=sampleDates(snapDates).at(-1);render();}));
$('snapshot').addEventListener('change',e=>{selected=e.target.value;render();});
$('csv-export').addEventListener('click',()=>{const rows=db.holdings[selected]||[],nav=db.nav[selected]?.total_base||0,total=rows.reduce((s,x)=>s+x.value_base,0);const header=['Date','Ticker','Name','Quantity','Cost EUR','Market value EUR','Weight %','% of NAV','Unrealized P&L EUR'];let lines=[header,...rows.map(r=>[selected,r.symbol,r.name,r.quantity,amount(selected,r.cost_base),amount(selected,r.value_base),total?100*r.value_base/total:null,nav?100*r.value_base/nav:null,amount(selected,r.pnl_base)])];const csv=lines.map(r=>r.map(x=>'"'+String(x??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));let a=document.createElement('a');a.href=url;a.download=`portfolio-${selected}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);});
render();
})();
