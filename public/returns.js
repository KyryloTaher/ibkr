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
function plot(points, dual) {
 if(!points.length) return '<div class="empty">No data to chart</div>';
 const w=650,h=245,l=68,r=15,t=14,b=33,iw=w-l-r,ih=h-t-b;
 const values=dual?points.flatMap(x=>[x.value,x.capital]):points.map(x=>x.earned);
 let low=Math.min(...values), high=Math.max(...values);
 if(!dual){low=Math.min(low,0);high=Math.max(high,0);}
 const pad=Math.max((high-low)*0.12,1);
 low-=pad;high+=pad;
 const x=i=>l+(points.length<2?iw/2:i*iw/(points.length-1));
 const y=v=>t+(high-v)*ih/(high-low);
 const line=name=>points.map((p,i)=>(i?'L':'M')+x(i).toFixed(2)+' '+y(p[name]).toFixed(2)).join(' ');
 let s='<svg viewBox="0 0 '+w+' '+h+'" role="img" aria-label="'+(dual?'Portfolio compared with deposited capital':'Cumulative investment earnings')+'">';
 for(let k=0;k<=3;k++){
  const v=low+(high-low)*k/3,yy=y(v);
  s+='<line x1="'+l+'" x2="'+(w-r)+'" y1="'+yy+'" y2="'+yy+'" stroke="#edf1f3" stroke-dasharray="4 4"/>';
  s+='<text x="'+(l-7)+'" y="'+(yy+4)+'" fill="#8494a2" font-size="10" text-anchor="end">'+esc(euro(v))+'</text>';
 }
 if(dual){
  s+='<path d="'+line('capital')+'" fill="none" stroke="#9daebb" stroke-dasharray="6 5" stroke-width="2.5"/>';
  s+='<path d="'+line('value')+'" fill="none" stroke="#287e98" stroke-width="3"/>';
 }else{
  s+='<line x1="'+l+'" x2="'+(w-r)+'" y1="'+y(0)+'" y2="'+y(0)+'" stroke="#a9b5be"/>';
  s+='<path d="'+line('earned')+'" fill="none" stroke="#268487" stroke-width="3"/>';
 }
 [0,Math.floor((points.length-1)/2),points.length-1].filter((p,i,a)=>a.indexOf(p)===i).forEach(i=>{
  s+='<text x="'+x(i)+'" y="'+(h-7)+'" fill="#8494a2" font-size="10" text-anchor="middle">'+esc(points[i].date)+'</text>';
 });
 points.forEach((p,i)=>{
  if(points.length>32 && i%Math.ceil(points.length/28)!==0 && i!==points.length-1)return;
  const v=dual?p.value:p.earned;
  s+='<circle cx="'+x(i)+'" cy="'+y(v)+'" r="3" fill="#287e98"><title>'+esc(p.date)+': '+esc(euro(v))+(dual?' | Net capital: '+esc(euro(p.capital)):'')+'</title></circle>';
 });
 return s+'</svg>';
}
function render() {
 const selected=document.querySelector('[data-period].active');
 const frequency=selected?selected.dataset.period:'Weekly';
 let markup='<article class="panel"><div class="panel-header"><div><h2>Investment earnings — not deposits</h2><p>Portfolio profit and loss after removing money added or withdrawn.</p></div><span class="chip">EUR · '+esc(frequency)+'</span></div>';
 if(!meta.available || records.length<2) {
  markup+='<div class="notice performance-warning">Not enough verified cash-flow history to show reliable earnings: '+esc(meta.reason||'Please run the IBKR synchronization.')+'</div>';
 } else {
  const end=records[records.length-1], begin=records[0], grouped=periodPoints(frequency);
  markup+='<div class="performance-stats">'+
   '<div class="performance-stat"><small>EARNED FROM INVESTING</small><strong class="'+(end.earned_eur<0?'negative':'positive')+'">'+(end.earned_eur>0?'+':' :'')+euro(end.earned_eur)+'</strong><span>Since '+esc(meta.start)+' · including realized and unrealized P&amp;L</span></div>'+
   '<div class="performance-stat"><small>NET DEPOSITS / WITHDRAWALS</small><strong>'+euro(end.net_flows_eur)+'</strong><span>Additional money added (negative = net withdrawn)</span></div>'+
   '<div class="performance-stat"><small>STARTING PORTFOLIO</small><strong>'+euro(begin.value_eur)+'</strong><span>Starting capital at '+esc(meta.start)+'</span></div></div>';
  markup+='<div class="performance-charts">'+
   '<div><h3>Cumulative investment earnings</h3><p>Actual account gains and losses, excluding savings</p><div class="performance-chart">'+plot(grouped,false)+'</div></div></div>';
  markup+='<div class="performance-table-title"><h3>'+esc(frequency)+' earnings</h3><p>Each row separates market results from deposited or withdrawn cash.</p></div>';
  markup+='<div class="table-scroller"><table><thead><tr><th>Period</th><th>Earned / lost</th><th>Net cash added</th><th>Earned since start</th><th>Ending value</th></tr></thead><tbody>'+
   grouped.slice().reverse().map(p=>'<tr><td><strong>'+esc(p.label)+'</strong><small class="performance-date">'+esc(p.date)+'</small></td><td>'+sign(p.gain)+'</td><td>'+euro(p.flow)+'</td><td>'+sign(p.earned)+'</td><td>'+euro(p.value)+'</td></tr>').join('')+
   '</tbody></table></div>';
  markup+='<p class="performance-note">'+esc(meta.disclaimer||'Returns reflect account changes including FX, dividends and fees.')+' Starting portfolio value is treated as initial capital; results are not lifetime earnings.</p>';
 }
 markup+='<div class="chart-footer"><span>Deposits and withdrawals do not count as investment earnings.</span><span>End-of-day IBKR data</span></div></article>';
 section.innerHTML=markup;
}
document.querySelectorAll('[data-period]').forEach(b=>b.addEventListener('click',render));
render();
})();
