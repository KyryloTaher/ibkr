from src.backfill import missing_ranges, backfill_inception


def test_one_historical_range_to_first_existing_nav():
    assert missing_ranges('2024-11-04', '2025-10-20') == [
        ('2024-11-04', '2025-10-20')
    ]


def test_windows_respect_ibkr_365_day_limit_and_are_contiguous():
    from datetime import date, timedelta
    windows=missing_ranges('2022-01-01','2025-10-20')
    assert windows[0][0]=='2022-01-01'
    assert windows[-1][1]=='2025-10-20'
    for start,end in windows:
        assert (date.fromisoformat(end)-date.fromisoformat(start)).days < 365
    for (_,end),(start,_) in zip(windows,windows[1:]):
        assert date.fromisoformat(start)==date.fromisoformat(end)+timedelta(days=1)


def test_archive_backfill_skips_when_inception_already_covered():
    state={'nav':{'2024-11-04':{'total_base':0},'2025-10-20':{'total_base':200}}}
    result=backfill_inception(state,None,None,'2024-11-04')
    assert result['status']=='already archived'
    assert result['requests']==0


def test_historical_report_extends_nav_and_cash_flows_without_erasure(monkeypatch):
    from src import backfill
    sample=b'''<FlexQueryResponse><FlexStatements><FlexStatement accountId="EXAMPLE" fromDate="20241104" toDate="20251020"><EquitySummaryInBase><EquitySummaryByReportDateInBase currency="USD" reportDate="20241104" total="100"/><EquitySummaryByReportDateInBase currency="USD" reportDate="20251020" total="250"/></EquitySummaryInBase><CashTransactions><CashTransaction type="Deposits/Withdrawals" dateTime="20241105;100000" currency="EUR" amount="50" fxRateToBase="1.1" transactionID="1"/></CashTransactions></FlexStatement></FlexStatements></FlexQueryResponse>'''
    calls=[]
    def fake_get(token,query,start,end):
        calls.append((start,end))
        return sample
    monkeypatch.setattr(backfill,'get_report',fake_get)
    state={'schema':2,'nav':{'2025-10-20':{'total_base':250},'2026-10-20':{'total_base':350}},
           'holdings':{},'cashflows':{},'external_flows':{},'cashflow_coverage':[],
           'fx_usd_eur':{},'base_currency':'USD','last_import':None}
    result=backfill_inception(state,'secret','123','2024-11-04')
    assert calls == [('2024-11-04','2025-10-20')]
    assert result['earliest_nav']=='2024-11-04'
    assert state['nav']['2026-10-20']['total_base']==350
    assert len(state['external_flows'])==1
    assert state['cashflow_coverage']==[['2024-11-04','2025-10-20']]
