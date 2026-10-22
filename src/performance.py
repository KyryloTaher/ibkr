"""Portfolio net investment earnings measured in EUR from real dated IBKR NAV and external flows."""
from __future__ import annotations
from datetime import date, timedelta

def eur_rate(rates, d):
    day=date.fromisoformat(d)
    for lag in range(8):
        r=rates.get((day-timedelta(days=lag)).isoformat())
        if r is not None and float(r)>0: return float(r)
    return None

def coverage_ok(state, first, last):
    spans=[]
    for a,b in state.get('cashflow_coverage',[]):
        if a and b and a<=b: spans.append((date.fromisoformat(a),date.fromisoformat(b)))
    spans.sort()
    cursor=date.fromisoformat(first)+timedelta(days=1)
    through=date.fromisoformat(last)
    for a,b in spans:
        if a>cursor: break
        if b>=cursor: cursor=b+timedelta(days=1)
        if cursor>through: return True
    return cursor>through

def series(state):
    inception=state.get('inception_date')
    dates=sorted(d for d in state.get('nav',{}) if inception is None or d>=inception)
    empty=lambda reason: ([],{'available':False,'reason':reason})
    if len(dates)<2: return empty('Need at least two dated IBKR NAV records.')
    start,end=dates[0],dates[-1]
    if not state.get('cashflow_coverage') or not coverage_ok(state,start,end):
        return empty('Cash transaction history does not cover the complete NAV period. Refresh the full IBKR Flex report.')
    rates=state.get('fx_usd_eur',{})
    nav={}
    for d in dates:
        r=eur_rate(rates,d)
        if r is None: return empty('Historical USD/EUR reference rates are incomplete. Re-run automatic synchronization.')
        nav[d]=round(state['nav'][d]['total_base']*r,6)
    flows={}
    for record in state.get('external_flows',{}).values():
        d=record['date']
        if d<start or d>end: continue
        if record.get('currency')=='EUR':
            amount=record['amount_currency']
        else:
            r=eur_rate(rates,d)
            if r is None: return empty('Historical exchange rates for deposited or withdrawn funds are incomplete.')
            amount=record['amount_base']*r
        flows[d]=flows.get(d,0)+amount
    base=nav[start]
    cumulative=0.0
    result=[]
    ordered_flows=sorted((d,v) for d,v in flows.items() if d>start)
    index=0
    for d in dates:
        while index<len(ordered_flows) and ordered_flows[index][0]<=d:
            cumulative+=ordered_flows[index][1]
            index+=1
        earning=nav[d]-base-cumulative
        result.append({'date':d,'value_eur':round(nav[d],2),
                       'capital_eur':round(base+cumulative,2),
                       'earned_eur':round(earning,2),
                       'net_flows_eur':round(cumulative,2)})
    return result, {'available':True,'start':start,'end':end,
                    'method':'EUR NAV change minus dated external deposits/withdrawals; FX movements included',
                    'starting_nav_eur':round(base,2),
                    'disclaimer':'Approximate in EUR: NAV uses ECB reference FX, some flows use IBKR transaction FX. Not a time-weighted return.'}
