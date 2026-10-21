from copy import deepcopy
from src.portfolio_data import ingest, blank_state
from src.refresh import build

SAMPLE=b'''<FlexQueryResponse><FlexStatements><FlexStatement accountId="SENSITIVE" toDate="20261020"><EquitySummaryInBase><EquitySummaryByReportDateInBase currency="USD" reportDate="20261019" total="220" cash="20"/><EquitySummaryByReportDateInBase currency="USD" reportDate="20261020" total="250" cash="50"/></EquitySummaryInBase><OpenPositions><OpenPosition accountId="SENSITIVE" reportDate="20261020" symbol="ABC" description="ABC INC" conid="123" currency="USD" fxRateToBase="1" position="2" positionValue="200" costBasisMoney="180" fifoPnlUnrealized="20" levelOfDetail="SUMMARY"/></OpenPositions><CashTransactions><CashTransaction accountId="SENSITIVE" dateTime="20261020;080000" type="Dividends" transactionID="123456789" symbol="ABC" currency="USD" amount="1.2" fxRateToBase="1"/></CashTransactions></FlexStatement></FlexStatements></FlexQueryResponse>'''

def test_ingestion_and_deduplication():
 s=blank_state(); r=ingest(SAMPLE,s)
 assert r['nav_dates']==2 and r['position_dates']==1
 assert s['holdings']['2026-10-20'][0]['pnl_base']==20
 assert s['nav']['2026-10-19']['total_base']==220
 assert len(s['cashflows'])==1
 ingest(SAMPLE,s)
 assert len(s['cashflows'])==1 and len(s['holdings'])==1

def test_does_not_publish_account_or_transaction_ids(tmp_path):
 s=blank_state();ingest(SAMPLE,s);s['fx_usd_eur']['2026-10-20']=.89
 build(s,tmp_path)
 public=(tmp_path/'data.js').read_text()
 assert 'SENSITIVE' not in public and '123456789' not in public
 assert '"symbol":"ABC"' in public

def test_multi_account_rejected():
 s=blank_state()
 xml=SAMPLE.replace(b'</FlexStatement></FlexStatements>',b'</FlexStatement><FlexStatement accountId="OTHER"></FlexStatement></FlexStatements>')
 try:ingest(xml,s)
 except ValueError as e:assert 'Multiple accounts' in str(e)
 else:assert False
