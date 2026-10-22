"""One-time historical NAV + external cash-flow import using dated IBKR Flex reports."""
from __future__ import annotations

from datetime import date, timedelta
from .fetch import get_report
from .portfolio_data import blank_state, ingest


def missing_ranges(inception: str, earliest_existing: str):
    """Consecutive inclusive request windows, no more than 365 days each."""
    first = date.fromisoformat(inception)
    last = date.fromisoformat(earliest_existing)
    if first > last:
        return []
    ranges = []
    cursor = first
    while cursor <= last:
        end = min(cursor + timedelta(days=364), last)
        ranges.append((cursor.isoformat(), end.isoformat()))
        cursor = end + timedelta(days=1)
    return ranges


def backfill_inception(state: dict, token: str, query_id: str, inception: str):
    """Merge historical values without replacing the existing archive.

    The oldest existing NAV date is included in the request because the current
    report's transaction coverage may begin one day *after* that NAV observation.
    """
    requested = date.fromisoformat(inception)
    nav = state.get('nav', {})
    if not nav:
        raise ValueError('Cannot backfill without an existing dated NAV archive.')
    previous_earliest = min(nav)
    if date.fromisoformat(previous_earliest) <= requested:
        return {'status': 'already archived', 'earliest_nav': previous_earliest, 'requests': 0}

    windows = missing_ranges(inception, previous_earliest)
    imported = 0
    for start, end in windows:
        # Never log the token or report body: it contains personal brokerage details.
        report = get_report(token, query_id, start, end)
        preview = blank_state()
        ingest(report, preview)
        valid_nav = [d for d in preview['nav'] if start <= d <= end]
        if not valid_nav:
            raise ValueError(
                'IBKR returned no dated NAV within the historical request '
                f'{start} through {end}. Date override may be unavailable for this query.'
            )
        # Ingest also extracts deposits/withdrawals; apply only verified report data.
        ingest(report, state)
        imported += len(valid_nav)
        print(f'Historical statement {start} through {end}: '
              f'{len(valid_nav)} NAV dates, {len(preview["external_flows"])} external cash flows.')

    earliest = min(state['nav'])
    if earliest >= previous_earliest:
        raise ValueError('Backfill did not extend the dated NAV history.')
    return {'status': 'extended', 'earliest_nav': earliest, 'requests': len(windows),
            'historical_nav_records_returned': imported}
