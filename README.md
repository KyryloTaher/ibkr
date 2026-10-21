# Portfolio Atlas — public IBKR portfolio website (EUR, automatic refresh)

This project makes a **public read-only investment dashboard** from a reporting-only Interactive Brokers **Activity Flex Query**. It automatically pulls an XML report, archives actual end-of-day holdings snapshots, converts your account's USD base values to EUR, and publishes to GitHub Pages.

It is **not** a live quote feed or a trading API. The dashboard also estimates money earned from investing by subtracting external deposits and withdrawals from changes in account NAV. No IBKR login is needed for website visitors. No web server to keep running and no recurring manual XML download.

## What your uploaded example contained

- **313 daily NAV records** (account portfolio value) spanning 2025-10-20 to 2026-10-20.
- **12 open holdings** on 2026-10-20, with share counts, cost basis and FIFO unrealized P&L.
- **342 trades and 130 cash transactions**, including dividends/withholding. The importer retains dividend/withholding cash events and separate deposit/withdrawal flows; individual trades are not exposed or used to invent historical position valuations.
- IBKR *account reporting currency is USD*, not EUR. This site converts USD-denominated reported values with daily ECB reference rates from Frankfurter; it does not relabel USD amounts as EUR.
- **Only one dated per-security holdings snapshot.** There is *not* a true weekly holdings valuation history in the XML. Each automatic run also tries up to six older **date-scoped weekly IBKR Flex requests** using the official date override and archives them **only if** IBKR returns real OpenPosition rows for that requested date; if historical OpenPositions are unavailable from the account, it will collect new snapshots going forward instead. Historical NAV figures are independent of individual historical holdings.

The included `data/state.json` and `public/data.js` are **derived from the real uploaded XML**, but contain **NO account number/name/address, order identifiers, query token, or raw statement**. They DO include public positions, historical account values, portfolio earnings and sanitized amounts/dates of deposits and withdrawals: the user has chosen to make these figures public. Do **not** publish this repo unless you want those finances accessible online.

## Set up your own public website (one-time)

1. Create a **public GitHub repository**, for example `portfolio-atlas`. Upload the **contents** of this project folder to the repository's default branch (`main`). Do not upload the original XML file or any `.env`/token file. A public GitHub repository is openly browsable, including the sanitized financial data.
2. In IBKR Client Portal, open **Performance & Reports → Flex Queries**, locate your `Portfolio Dashboard` Activity Flex Query. Make sure its format is **XML**, with sections **Open Positions (Summary)**, **Net Asset Value (NAV) in Base** (actual `<EquitySummaryInBase>` output), **Cash Transactions** and **Trades**. Your uploaded example already includes these sections. Use a last-365-days (rolling) period. Find the **Flex Query ID** in the query list or details.
3. Under **Flex Web Service Configuration**, enable the web service and generate a **Flex Web Service token**. Treat it as a secret even though it is reporting-only; it can expose your brokerage financial details. Do **not** paste token into this chat, a public GitHub repository, a README, a website, or a screenshot.
4. On GitHub, open the repo **Settings → Secrets and variables → Actions → New repository secret**. Add:
   - `IBKR_FLEX_TOKEN` = token generated in IBKR
   - `IBKR_FLEX_QUERY_ID` = ID of the specific Activity Flex XML query
5. Open **Settings → Pages → Build and deployment → Source: GitHub Actions**.
6. Open **Actions → Refresh public IBKR portfolio → Run workflow** once. The action downloads the latest report, fetches historical USD/EUR conversion rates, stores **sanitized** historical observations in the repo and publishes the website. It will also try to backfill up to six older weekly position dates per day; IBKR may return no historical positions, in which case it never invents them. Then it runs **automatically daily at ~07:23 UTC**, without anyone logging in.
7. The public URL follows `https://YOUR-GITHUB-USERNAME.github.io/YOUR-REPOSITORY/` (GitHub shows the exact URL under Settings → Pages). Anyone with the URL can visit. Because the repo is public, the data should be treated as **public**, not "secret to those with the link".

GitHub scheduling is best effort and can be delayed or skipped. Public-repository cron workflows can be disabled after 60 days of inactivity; this workflow commits successful updates, but **check Actions if the dashboard appears stale**. IBKR Flex tokens expire: generate a replacement and update the repository secret when required. If IBKR or FX fetch fails, the workflow stops before publishing new (possibly inaccurate) data; the previous website stays live.

## Run locally / seed another report (optional)

```sh
pip install -r requirements.txt
# Offline preview using the included sanitized seed, NO credentials required:
python -m src.refresh --skip-fx
# Open public/index.html in a browser.

# Seed using your own original XML, without adding it to Git:
python -m src.refresh --xml /path/to/report.xml

# Sync through API (token stays in your own shell):
IBKR_FLEX_TOKEN='...' IBKR_FLEX_QUERY_ID='...' python -m src.refresh --sync
```

The project ships with an initial conversion rate **1 EUR = 1.1215 USD on 2026-10-20** (ECB reference rate) so you can preview the latest holdings in EUR offline. Once the automatic FX synchronization runs, historical dates use their own dated rates; if exchange rates are missing, earnings are withheld instead of presenting inaccurate figures. See [ECB USD reference rate data](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/eurofxref-graph-usd.en.html) and [Frankfurter API](https://frankfurter.dev/v1/).

## What financial metrics mean

- **Invested (cost):** current open positions' cost basis. Not the amount of money you've contributed since account inception.
- **Market value:** present market value of those open positions on the *statement date*.
- **Allocation %:** each asset's market value / total market value of open securities; excludes cash. A separate **% of NAV** column divides by total account NAV including cash.
- **Unrealized P&L:** IBKR FIFO unrealized P&L translated to EUR at the valuation date. It excludes historical realized P&L, commissions on closed trades, dividend returns, deposits and withdrawals, and actual FX gains/losses of trading in EUR.
- **Historical NAV graph:** daily account value, sampled at the final report date in the selected calendar period. Changes in NAV are **not** investment returns when deposits or withdrawals occurred.
- **Investment earnings in EUR:** change in converted account NAV minus net external deposits (or plus withdrawals). Includes the combined effects of gains, losses, dividends, fees and FX over the covered history. The first historical NAV is treated as starting capital; earnings are not lifetime realized gains or an official time-weighted return percentage.
- **Weekly, monthly, quarterly and yearly earnings:** calculated as differences between cumulative earnings at genuine period-end NAV dates. A separate table column shows the net deposits or withdrawals during the same periods. The app refuses to show earnings when cash-transaction coverage or currency conversion history is incomplete.
- **FX conversion:** IBKR reports the account's base NAV in USD. USD→EUR is from ECB reference rates via Frankfurter (last available working-day rate, within 7 days); for non-USD stocks the statement's own `fxRateToBase` conversion is used before conversion to EUR. Indicative values might differ from brokers' statement conversions and tax rules.
- **Current:** latest available end-of-day report, not live intraday stock prices.
- **History:** actual snapshot dates; per-security historical valuations cannot be produced retroactively from daily account-level NAV alone. The site automatically requests a limited number of old dated weekly reports per run and accepts historic position snapshots only if the IBKR response actually contains matching dated positions. Otherwise it accumulates holdings snapshots going forward.

## Security / privacy

- The browser's HTML/JS/JSON only contain non-identifying public metrics, never any API endpoint calls with credentials. The GitHub Actions job uses secrets on the runner and the read-only Flex API.
- The original XML contains a real account number; it is **excluded** from the project and all public data. Code ignores account IDs, addresses, order IDs and personally identifying report metadata.
- Public financial numbers and positions may still reveal sensitive information about your finances; visitors can view, copy, index and distribute data. The `noindex` header is merely advisory to search engines, not access control.
- If you require only "anyone with link", rather than a truly public repository, use a private hosted application with a separate secure backend instead of GitHub Pages.

## Official API documentation

- [Generate IBKR Flex report](https://www.interactivebrokers.com/docs/web-api/flex-web-service/using-flex-web-service/generate-the-report)
- [Get IBKR Flex statement](https://www.interactivebrokers.com/docs/web-api/api-reference/get-statement)
- [GitHub Pages automated deployments](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

## Tests

```sh
pip install pytest
python -m pytest -q
```
