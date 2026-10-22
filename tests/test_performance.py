from src.portfolio_data import blank_state, ingest
from src.performance import series

def test_deposit_and_withdrawal_are_not_profit():
    s=blank_state()
    s['nav']={'2026-10-19':{'total_base':100},'2026-10-20':{'total_base':160},'2026-10-21':{'total_base':147}}
    s['fx_usd_eur']={d:1 for d in s['nav']}
    s['cashflow_coverage']=[['2026-10-20','2026-10-21']]
    s['external_flows']={'a':{'date':'2026-10-20','currency':'USD','amount_base':50},
                         'b':{'date':'2026-10-21','currency':'USD','amount_base':-20}}
    rows,meta=series(s)
    assert meta['available']
    assert [r['earned_eur'] for r in rows]==[0,10,17]
    assert rows[-1]['net_flows_eur']==30
    assert rows[-1]['capital_eur']==130

def test_missing_cashflow_coverage_refuses_to_fabricate_returns():
    s=blank_state()
    s['nav']={'2026-10-20':{'total_base':100},'2026-10-21':{'total_base':200}}
    s['fx_usd_eur']={'2026-10-20':1,'2026-10-21':1}
    rows,meta=series(s)
    assert rows==[] and not meta['available']

def test_eur_deposit_on_non_reporting_day():
    s=blank_state()
    s['nav']={'2026-10-16':{'total_base':100},'2026-10-19':{'total_base':160}}
    s['fx_usd_eur']={'2026-10-16':.8,'2026-10-19':.8}
    s['cashflow_coverage']=[['2026-10-17','2026-10-19']]
    s['external_flows']={'a':{'date':'2026-10-17','currency':'EUR','amount_currency':30,'amount_base':38}}
    rows,meta=series(s)
    assert meta['available'] and rows[-1]['earned_eur']==18

def test_cash_transactions_include_external_flows_without_double_counting():
    xml=b'''<FlexQueryResponse><FlexStatements><FlexStatement accountId="SENSITIVE" fromDate="20261019" toDate="20261020"><EquitySummaryInBase><EquitySummaryByReportDateInBase currency="USD" reportDate="20261018" total="100"/><EquitySummaryByReportDateInBase currency="USD" reportDate="20261020" total="170"/></EquitySummaryInBase><CashTransactions><CashTransaction reportDate="20261019" type="Deposits/Withdrawals" transactionID="SECRET1" currency="EUR" amount="50" fxRateToBase="1.2"/><CashTransaction reportDate="20261020" type="Dividends" transactionID="SECRET2" currency="USD" amount="2" fxRateToBase="1"/></CashTransactions></FlexStatement></FlexStatements></FlexQueryResponse>'''
    state=blank_state();ingest(xml,state);ingest(xml,state)
    assert len(state['external_flows'])==1 and len(state['cashflows'])==1
    assert state['cashflow_coverage']==[['2026-10-19','2026-10-20']]


def test_first_funding_date_excludes_pre_inception_zero_nav():
    s=blank_state()
    s['inception_date']='2024-11-04'
    s['nav']={'2024-11-01':{'total_base':0},
              '2024-11-04':{'total_base':100},
              '2024-11-05':{'total_base':120}}
    s['fx_usd_eur']={'2024-11-01':1,'2024-11-04':1,'2024-11-05':1}
    s['cashflow_coverage']=[['2024-11-04','2024-11-05']]
    s['external_flows']={'initial':{'date':'2024-11-04','currency':'EUR',
                                   'amount_currency':100,'amount_base':100}}
    rows,meta=series(s)
    assert meta['available']
    assert meta['start']=='2024-11-04'
    assert rows[0]['value_eur']==100
    assert rows[0]['earned_eur']==0
    assert rows[-1]['earned_eur']==20



def test_zero_balance_chart_start_and_first_funding_deposit():
    s=blank_state()
    s['inception_date']='2024-11-04'  # first funded date remains unchanged
    s['chart_start_date']='2024-11-01'
    s['nav']={'2024-11-01':{'total_base':0},
              '2024-11-04':{'total_base':100},
              '2024-11-05':{'total_base':120}}
    s['fx_usd_eur']={'2024-11-01':1,'2024-11-04':1,'2024-11-05':1}
    s['cashflow_coverage']=[['2024-11-04','2024-11-05']]
    s['external_flows']={'initial':{'date':'2024-11-04','currency':'EUR',
                                    'amount_currency':100,'amount_base':100}}
    rows,meta=series(s)
    assert meta['available']
    assert meta['start']=='2024-11-01'
    assert [r['date'] for r in rows]==['2024-11-01','2024-11-04','2024-11-05']
    assert rows[0]['value_eur']==0
    assert rows[0]['earned_eur']==0
    assert rows[1]['net_flows_eur']==100
    assert rows[1]['earned_eur']==0
    assert rows[-1]['earned_eur']==20


def test_zero_balance_start_still_rejects_unverified_weekday_cashflow_gap():
    s=blank_state()
    s['chart_start_date']='2024-10-30'
    s['nav']={'2024-10-30':{'total_base':0},
              '2024-11-05':{'total_base':120}}
    s['fx_usd_eur']={'2024-10-30':1,'2024-11-05':1}
    s['cashflow_coverage']=[['2024-11-04','2024-11-05']]
    result, meta=series(s)
    assert result==[] and not meta['available']
