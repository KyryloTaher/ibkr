(function () {
'use strict';
const db=window.PORTFOLIO_DATA || {};
const records=db.performance || [];
const meta=db.performance_meta || {};
const anchor=document.querySelector('.metrics');
if (!anchor) return;
const section=document.createElement('section');
section.className='performance-section';
anchor.insertAdjacentElement('afterend',section);
const euro=n=>Number.isFinite(n)?new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(n):'—';
const sign=n=>'<span class="'+(n<0?'negative':'positive')+'">'+(n>0?'+':'')+euro(n)+'</span>';
const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function key(date, frequency) {
 if (frequency==='Yearly') return date.slice(0,4);
 if (frequency==='Monthly') return date.slice(0,7);
 if (frequency==='Quarterly') return date.slice(0,4)+' Q'+(Math.floor((+date.slice(5,7)-1)/3)+1);
 const d=new Date(date+'T12:00:00Z');
 d.setUTCDate(d.getUTCDate()+3-(d.getUTCDay()+6)%7);
 const y=d.getUTCFullYear(),jan4=new Date(Date.UTC(y,0,4));
 jan4.setUTCDate(jan4.getUTCDate()+3-(jan4.getUTCDay()+6)%7);
 return y+' W'+String(1+Math.round((d-jan4)/604800000)).padStart(2,'0');
}
function periodPoints(frequency) {
 const groups=new Map();
 records.forEach(p=>groups.set(key(p.date,frequency),p));
 let previous={earned_eur:0,net_flows_eur:0};
 return [...groups].map(([label,p])=>{
  const obj={label:label,date:p.date,earned:p.earned_eur,capital:p.capital_eur,
   value:p.value_eur,gain:p.earned_eur-previous.earned_eur,
   flow:p.net_flows_eur-previous.net_flows_eur};
  previous=p;return obj;
 });
}
function sampledRows(rows, frequency) {
 if(!rows.length) return [];
 const buckets=new Map();
 rows.forEach(row=>buckets.set(key(row.date,frequency),row));
 const picked=[...buckets.values()];
 if(picked[0].date!==rows[0].date)picked.unshift(rows[0]);
 return picked;
}
function render() {
 let allPoints = [], yearPoints = [];
 const selected=document.querySelector('[data-period].active');
 const frequency=selected?selected.dataset.period:'Weekly';
 let markup='<article class="panel"><div class="panel-header"><div><h2>Investment earnings — not deposits</h2><p>Cumulative EUR profit and loss, with all-time and trailing-365-day views.</p></div><span class="chip">EUR · '+esc(frequency)+'</span></div>';
 if(!meta.available || records.length<2) {
  markup+='<div class="notice performance-warning">Not enough verified cash-flow history to show reliable earnings: '+esc(meta.reason||'Please run the IBKR synchronization.')+'</div>';
 } else {
  const end=records[records.length-1], begin=records[0], grouped=periodPoints(frequency);
  const cutoff=new Date(Date.parse(end.date+'T12:00:00Z')-364*86400000).toISOString().slice(0,10);
  const yearRows=records.filter(p=>p.date>=cutoff);
  allPoints=sampledRows(records,frequency).map(p=>({date:p.date,value:p.earned_eur}));
  const yearBase=yearRows[0].earned_eur;
  yearPoints=sampledRows(yearRows,frequency).map(p=>({
   date:p.date,value:Math.round((p.earned_eur-yearBase)*100)/100
  }));
  markup+='<div class="performance-stats">'+
   '<div class="performance-stat"><small>EARNED FROM INVESTING</small><strong class="'+(end.earned_eur<0?'negative':'positive')+'">'+(end.earned_eur>0?'+':'')+euro(end.earned_eur)+'</strong><span>Since '+esc(meta.start)+' · including realized and unrealized P&amp;L</span></div>'+
   '<div class="performance-stat"><small>NET DEPOSITS / WITHDRAWALS</small><strong>'+euro(end.net_flows_eur)+'</strong><span>Additional money added (negative = net withdrawn)</span></div>'+
   '<div class="performance-stat"><small>STARTING PORTFOLIO</small><strong>'+euro(begin.value_eur)+'</strong><span>Starting capital at '+esc(meta.start)+'</span></div></div>';
  markup+='<div class="performance-charts">'+
   '<div class="comparison-chart"><h3>All time</h3><p>'+esc(begin.date)+' — '+esc(end.date)+'</p><div class="performance-chart" id="earnings-chart"></div></div>'+
   '<div class="comparison-chart"><h3>Last 365 days</h3><p>'+esc(cutoff)+' — '+esc(end.date)+' · earnings measured from first available day</p><div class="performance-chart" id="earnings-chart-year"></div></div></div>';
  markup+='<div class="performance-table-title"><h3>'+esc(frequency)+' earnings</h3><p>Each row separates market results from deposited or withdrawn cash.</p></div>';
  markup+='<div class="table-scroller"><table><thead><tr><th>Period</th><th>Earned / lost</th><th>Net cash added</th><th>Earned since start</th><th>Ending value</th></tr></thead><tbody>'+
   grouped.slice().reverse().map(p=>'<tr><td><strong>'+esc(p.label)+'</strong><small class="performance-date">'+esc(p.date)+'</small></td><td>'+sign(p.gain)+'</td><td>'+euro(p.flow)+'</td><td>'+sign(p.earned)+'</td><td>'+euro(p.value)+'</td></tr>').join('')+
   '</tbody></table></div>';
  markup+='<p class="performance-note">'+esc(meta.disclaimer||'Returns reflect account changes including FX, dividends and fees.')+' Starting portfolio value is treated as initial capital; results are not lifetime earnings.</p>';
 }
 markup+='<div class="chart-footer"><span>Deposits and withdrawals do not count as investment earnings.</span><span>End-of-day IBKR data</span></div></article>';
 section.innerHTML=markup;
 if (allPoints.length) {
  window.PortfolioChart.render(section.querySelector('#earnings-chart'),allPoints,
   {title:'Investment earnings — all time',yLabel:'Earnings (EUR)',includeZero:true,lineColor:'#268487'});
  window.PortfolioChart.render(section.querySelector('#earnings-chart-year'),yearPoints,
   {title:'Investment earnings — last 365 days',yLabel:'Earnings (EUR)',includeZero:true,lineColor:'#268487'});
 }
}
document.querySelectorAll('[data-period]').forEach(b=>b.addEventListener('click',render));
render();
})();
