"""Read-only, account-identifier-free IBKR Flex report extraction for public portfolio site."""
from __future__ import annotations
from datetime import datetime
from hashlib import sha256
from defusedxml import ElementTree as ET


def n(x, default=None):
    if x in (None, '', '--', 'N/A'):
        return default
    return float(x.replace(',', ''))


def day(x):
    if not x: return None
    x = x.split(';')[0][:10]
    if len(x) == 8 and x.isdigit():
        return f'{x[:4]}-{x[4:6]}-{x[6:8]}'
    return x


def blank_state():
    return dict(schema=2, base_currency=None, nav={}, holdings={}, cashflows={}, external_flows={}, cashflow_coverage=[], fx_usd_eur={}, last_import=None)


def ingest(xml_bytes: bytes, state: dict):
    """Merge report data by *true* report date; no account numbers or raw XML persisted.

    Report must describe exactly one account. Multi-account reports are rejected to avoid
    accidental mixing of different bases or holdings.
    """
    root = ET.fromstring(xml_bytes)
    statements = root.findall('.//FlexStatement')
    if not statements:
        raise ValueError('No FlexStatement rows found. Export an Activity Flex Query in XML.')
    accs = {s.get('accountId') for s in statements if s.get('accountId')}
    if len(accs) > 1:
        raise ValueError('Multiple accounts in one report: configure the Flex Query for a single account.')
    nav_count=hold_count=0
    for statement in statements:
        for el in statement.findall('./EquitySummaryInBase/EquitySummaryByReportDateInBase') + statement.findall('./NetAssetValue/NetAssetValueInBase'):
            a = el.attrib; d=day(a.get('reportDate'))
            base = a.get('currency') or a.get('currencyPrimary')
            if base:
                if state['base_currency'] and state['base_currency'] != base:
                    raise ValueError('Account base currency changed: cannot mix NAV values.')
                state['base_currency']=base
            if not d or n(a.get('total')) is None: continue
            state['nav'][d] = dict(total_base=n(a['total']), cash_base=n(a.get('cash')))
            nav_count+=1
        positions = statement.findall('./OpenPositions/OpenPosition')
        rows={}
        for el in positions:
            a=el.attrib
            if (a.get('levelOfDetail') or '').lower() == 'lot': continue
            d=day(a.get('reportDate')) or day(statement.get('toDate'))
            if not d: continue
            base=state['base_currency']
            if not base: raise ValueError('NAV / account base currency is missing from the report.')
            ccy=a.get('currency') or base
            fx=n(a.get('fxRateToBase'))
            if fx is None:
                if ccy!=base: raise ValueError(f'Missing FX-to-base for {a.get("symbol","instrument")}')
                fx=1.0
            value=n(a.get('positionValue'))
            if value is None:
                qty=n(a.get('position'),0)
                price=n(a.get('markPrice'))
                if price is None: continue
                value=qty*price*n(a.get('multiplier'),1)
            cost=n(a.get('costBasisMoney'))
            pnl=n(a.get('fifoPnlUnrealized'))
            if pnl is None and cost is not None: pnl=value-cost
            # No account IDs, order IDs, lot info or tax identifiers in public data.
            ident = a.get('conid') or a.get('symbol')
            record=dict(symbol=a.get('symbol') or 'Unknown', name=a.get('description') or a.get('symbol') or 'Unknown',
                        asset_class=a.get('assetCategory') or 'OTHER', currency=ccy,
                        quantity=n(a.get('position'),0), value_base=round(value*fx,8),
                        cost_base=round(cost*fx,8) if cost is not None else None,
                        pnl_base=round(pnl*fx,8) if pnl is not None else None)
            rows.setdefault(d,{})[ident]=record
        for d, recs in rows.items():
            state['holdings'][d]=sorted(recs.values(),key=lambda r:-r['value_base'])
            hold_count+=len(recs)
        # Record statement coverage to avoid fabricating performance from missing cash history.
        if statement.find('./CashTransactions') is not None:
            start, end = day(statement.get('fromDate')), day(statement.get('toDate'))
            if start and end and start <= end:
                spans=state.setdefault('cashflow_coverage',[])
                if [start,end] not in spans: spans.append([start,end])
        for el in statement.findall('./CashTransactions/CashTransaction'):
            a=el.attrib
            kind=a.get('type') or 'Other'
            if kind not in ('Dividends','Payment In Lieu Of Dividends','Withholding Tax','Deposits/Withdrawals'): continue
            d=day(a.get('reportDate') or a.get('dateTime'))
            if not d:continue
            amount=n(a.get('amount'))
            fx=n(a.get('fxRateToBase'))
            if amount is None or fx is None: continue
            # Hash does not carry personal fields to the published data.
            fingerprint='|'.join([a.get('transactionID',''),d,kind,a.get('symbol',''),a.get('amount',''),a.get('currency','')])
            key=sha256(fingerprint.encode()).hexdigest()[:20]
            if kind == 'Deposits/Withdrawals':
                state.setdefault('external_flows',{})[key]=dict(
                    date=d, currency=a.get('currency') or 'USD',
                    amount_currency=round(amount,8), amount_base=round(amount*fx,8))
            else:
                state['cashflows'][key]=dict(date=d, kind=kind, symbol=a.get('symbol') or '', amount_base=round(amount*fx,8))
    if state.get('base_currency') != 'USD':
        raise ValueError('This edition converts USD-base reports to EUR; received a different account base currency.')
    if not state['nav'] and not state['holdings']:
        raise ValueError('No NAV or open positions found in report.')
    state['last_import']=datetime.now().astimezone().isoformat(timespec='seconds')
    return dict(nav_rows=nav_count, holding_rows=hold_count, position_dates=len(state['holdings']), nav_dates=len(state['nav']))
