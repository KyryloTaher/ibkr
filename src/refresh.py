"""Merge actual NAV/holdings snapshots and ECB-derived historical FX into public site."""
from __future__ import annotations
import argparse, json, os, sys, time
from datetime import date, timedelta
from pathlib import Path
import requests
from .portfolio_data import blank_state, ingest
from .fetch import get_report, ReportError
from .performance import series
from .backfill import backfill_inception


def fx_refresh(state, timeout=45):
    all_dates=set(state['nav'])|set(state['holdings'])|{v['date'] for v in state['cashflows'].values()}|{v['date'] for v in state.get('external_flows',{}).values()}
    missing=sorted(d for d in all_dates if d not in state['fx_usd_eur'])
    if not missing: return 0
    start=(date.fromisoformat(missing[0])-timedelta(days=8)).isoformat()
    end=max(date.today().isoformat(),missing[-1])
    try:
        r=requests.get(f'https://api.frankfurter.dev/v1/{start}..{end}',params={'base':'USD','symbols':'EUR'},timeout=timeout)
        r.raise_for_status(); data=r.json(); rates=data.get('rates',{})
        if not rates:raise ValueError('Empty FX dataset')
        added=0
        for d, curr in rates.items():
            if 'EUR' not in curr: continue
            state['fx_usd_eur'][d]=float(curr['EUR']); added+=1
        return added
    except Exception:
        raise RuntimeError('FX rate download failed; declined to publish an inaccurate conversion.') from None


def backfill_weekly(state, token, query_id, limit=6):
    """Try to retrieve past dated OpenPositions via API date override.

    Never infer positions from trades or NAV; only store a report explicitly dated
    on the requested historical NAV business date. IBKR may not support prior
    OpenPositions for a given Flex query; these requests are best effort.
    """
    existing=set(state['holdings'])
    nav_week={}
    for d in sorted(state['nav']):
        dt=date.fromisoformat(d)
        if dt.weekday()<5: nav_week[(dt.isocalendar().year,dt.isocalendar().week)]=d
    checked=set(state.setdefault('backfill_checked',[]))
    candidates=[d for d in reversed(list(nav_week.values())) if d not in existing and d not in checked]
    added=0
    for d in candidates[:limit]:
        try:
            xml=get_report(token,query_id,d,d)
            tmp=blank_state()
            ingest(xml,tmp)
            if d in tmp['holdings']:
                state['holdings'][d]=tmp['holdings'][d]
                added+=1
                print('Backfilled holdings snapshot:',d)
            else:
                print('IBKR did not provide dated open positions for',d,'; no values invented.')
        except (ReportError,ValueError):
            print('Historical position request unavailable for',d,'(will retry later; no values invented).')
            time.sleep(7)
            continue
        checked.add(d)
        time.sleep(7)  # below IBKR SendRequest 10/minute pace
    state['backfill_checked']=sorted(checked)
    return added


def build(state, public):
    public=Path(public);public.mkdir(parents=True,exist_ok=True)
    # All output is a deliberately narrow allow-list; financial values are public by user request.
    cleaned={k:state[k] for k in ('schema','base_currency','nav','holdings','cashflows','fx_usd_eur','last_import')}
    if state.get('inception_date'): cleaned['inception_date']=state['inception_date']
    if state.get('chart_start_date'): cleaned['chart_start_date']=state['chart_start_date']
    cleaned['performance'],cleaned['performance_meta']=series(state)
    js=json.dumps(cleaned,ensure_ascii=True,separators=(',',':')).replace('<','\\u003c').replace('>','\\u003e')
    (public/'data.js').write_text('window.PORTFOLIO_DATA='+js+';\n',encoding='utf-8')


def main(argv=None):
    ap=argparse.ArgumentParser();ap.add_argument('--state',default='data/state.json');ap.add_argument('--public',default='public')
    ap.add_argument('--xml',help='Optional initial local XML import; NEVER commit the XML')
    ap.add_argument('--sync',action='store_true',help='Fetch IBKR Flex using env secrets')
    ap.add_argument('--skip-fx',action='store_true',help='Offline preview: no network FX fetching')
    ap.add_argument('--backfill-weeks',type=int,default=0,help='Try up to N old weekly position-date reports, only retaining verified dates')
    ap.add_argument('--inception',help='Backfill missing NAV and external flows from YYYY-MM-DD, only if needed')
    args=ap.parse_args(argv)
    path=Path(args.state)
    state=json.loads(path.read_text()) if path.exists() else blank_state()
    if args.xml: result=ingest(Path(args.xml).read_bytes(),state);print('Imported',result)
    if args.sync:
        try: report=get_report(os.getenv('IBKR_FLEX_TOKEN'),os.getenv('IBKR_FLEX_QUERY_ID'))
        except ReportError as exc: raise SystemExit(str(exc))
        print('Imported from IBKR:',ingest(report,state))
        if args.backfill_weeks>0:
            print('New verified historical position snapshots:',backfill_weekly(state,os.getenv('IBKR_FLEX_TOKEN'),os.getenv('IBKR_FLEX_QUERY_ID'),min(args.backfill_weeks,8)))
    if args.inception:
        print('Historical inception backfill:',backfill_inception(state,os.getenv('IBKR_FLEX_TOKEN'),os.getenv('IBKR_FLEX_QUERY_ID'),args.inception))
    if not args.skip_fx:
        print('New daily EUR FX rates:',fx_refresh(state))
    if args.sync or args.xml or args.inception or not path.exists():
        path.parent.mkdir(parents=True,exist_ok=True)
        path.write_text(json.dumps(state,indent=2,sort_keys=True,ensure_ascii=True)+'\n',encoding='utf-8')
    build(state,args.public)
    print(f"Built {args.public}/data.js: {len(state['holdings'])} holdings snapshot dates, {len(state['nav'])} NAV dates.")

if __name__=='__main__': main()
