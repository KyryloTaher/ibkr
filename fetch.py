"""IBKR Flex read-only download. Tokens must be supplied as environment secrets."""
import time
import requests
from defusedxml import ElementTree as ET

HOST='https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService'

class ReportError(RuntimeError): pass


def get_report(token, query_id, from_date=None, to_date=None):
    if not token or not query_id: raise ReportError('Missing IBKR_FLEX_TOKEN or IBKR_FLEX_QUERY_ID secret.')
    if (from_date is None) != (to_date is None): raise ReportError('Both historical range dates are required.')
    params={'t':token,'q':query_id,'v':'3'}
    if from_date is not None: params.update(fd=from_date.replace('-',''),td=to_date.replace('-',''))
    s=requests.Session()
    s.headers.update({'User-Agent':'Java/1.8','Accept':'application/xml'})
    try:
        # Do not print URLs or request exceptions; URL query params contain credentials.
        try:
            r=s.get(HOST+'/SendRequest',params=params,timeout=55)
            r.raise_for_status()
            root=ET.fromstring(r.content)
        except Exception:
            raise ReportError('IBKR SendRequest failed. Check token, Query ID and availability.') from None
        if root.findtext('Status')!='Success':
            code=root.findtext('ErrorCode') or '?'
            raise ReportError(f'IBKR report generation error code {code}. No data was published.')
        reference=root.findtext('ReferenceCode')
        if not reference: raise ReportError('IBKR gave no report reference code.')
        for i in range(12):
            time.sleep(3 if i<5 else 6)
            try:
                r=s.get(HOST+'/GetStatement',params={'t':token,'q':reference,'v':'3'},timeout=80)
                r.raise_for_status()
                root=ET.fromstring(r.content)
            except Exception:
                if i==11: raise ReportError('IBKR GetStatement failed. Nothing published.') from None
                continue
            if root.tag=='FlexQueryResponse' or root.find('.//FlexStatement') is not None:
                return r.content
            if root.findtext('Status')=='Fail':
                code=root.findtext('ErrorCode') or '?'
                if code in ('1019','1001','1004','1005','1006','1007','1008','1009','1018','1021'):
                    continue
                raise ReportError(f'IBKR report retrieval error code {code}. No data published.')
        raise ReportError('IBKR report did not become ready within polling window.')
    finally:s.close()
