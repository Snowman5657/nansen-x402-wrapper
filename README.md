# Nansen API — x402 wrapper (Railway)

Nansen API wrapped in **x402 v2 pay-per-call**: every POST endpoint returns a
402 (`exact` scheme, canonical USDC on Base, payTo = your payout wallet),
verifies + settles via the payai facilitator, then proxies the caller's JSON
body to `api.nansen.ai` with your Nansen API key and returns Nansen's JSON.

**Price: $0.05 per call** (flat, all endpoints). **PayTo:**
`0xC9c104446E3284361Ed2b1607a370E2201bC25B8` (Base USDC).

## Endpoints (all POST, all paid $0.05)

| Route | Nansen upstream | Required body fields | Example body |
|---|---|---|---|
| `/token-screener` | `/api/v1/token-screener` | `chains` | `{"chains":["base"],"timeframe":"24h"}` |
| `/tgm/flow-intelligence` | `/api/v1/tgm/flow-intelligence` | `chain`, `token_address` | `{"chain":"base","token_address":"0x8335…2913","timeframe":"24h"}` |
| `/tgm/holders` | `/api/v1/tgm/holders` | `chain`, `token_address` | `{"chain":"base","token_address":"0x8335…2913"}` |
| `/tgm/dex-trades` | `/api/v1/tgm/dex-trades` | `chain`, `token_address`, `date` | `{"chain":"base","token_address":"0x8335…2913","date":{"from":"2026-11-01T00:00:00Z","to":"2026-11-07T23:59:59Z"}}` |
| `/tgm/flows` | `/api/v1/tgm/flows` | `chain`, `token_address`, `date` | same date shape as above |
| `/profiler/address/current-balance` | `/api/v1/profiler/address/current-balance` | `chain` | `{"chain":"base","address":"0x…"}` |
| `/tgm/historical-dex-trades` | `/api/v1/tgm/historical-dex-trades` | `chain`, `token_address`, `date_range` | `{"chain":"base","token_address":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","date_range":{"from":"2026-11-…` |
| `/tgm/historical-pnl-leaderboard` | `/api/v1/tgm/historical-pnl-leaderboard` | `chain`, `token_address`, `date_range` | `{"chain":"base","token_address":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","date_range":{"from":"2026-11-…` |
| `/tgm/historical-token-flow-summary` | `/api/v1/tgm/historical-token-flow-summary` | `chain`, `token_address`, `date_range` | `{"chain":"base","token_address":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","date_range":{"from":"2026-11-…` |
| `/tgm/historical-token-quant-scores` | `/api/v1/tgm/historical-token-quant-scores` | `as_of_date`, `chain`, `token_address` | `{"as_of_date":"2026-11-07","chain":"base","token_address":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"}` |
| `/tgm/historical-top-holders` | `/api/v1/tgm/historical-top-holders` | `chain`, `token_address`, `as_of_date` | `{"chain":"base","token_address":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","as_of_date":"2026-11-07"}` |
| `/tgm/historical-who-bought-sold` | `/api/v1/tgm/historical-who-bought-sold` | `chain`, `token_address`, `date_range` | `{"chain":"base","token_address":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","date_range":{"from":"2026-11-…` |
| `/tgm/indicators` | `/api/v1/tgm/indicators` | `chain`, `token_address` | `{"chain":"base","token_address":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"}` |
| `/tgm/jup-dca` | `/api/v1/tgm/jup-dca` | `token_address` | `{"token_address":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"}` |
| `/tgm/perp-pnl-leaderboard` | `/api/v1/tgm/perp-pnl-leaderboard` | `token_symbol`, `date` | `{"token_symbol":"ETH","date":{"from":"2026-11-01T00:00:00Z","to":"2026-11-07T23:59:59Z"}}` |
| `/tgm/perp-positions` | `/api/v1/tgm/perp-positions` | `token_symbol` | `{"token_symbol":"ETH"}` |
| `/tgm/perp-trades` | `/api/v1/tgm/perp-trades` | `token_symbol`, `date` | `{"token_symbol":"ETH","date":{"from":"2026-11-01T00:00:00Z","to":"2026-11-07T23:59:59Z"}}` |
| `/tgm/pnl-leaderboard` | `/api/v1/tgm/pnl-leaderboard` | `chain`, `token_address`, `date` | `{"chain":"base","token_address":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","date":{"from":"2026-11-01T00:…` |
| `/tgm/position-intelligence` | `/api/v1/tgm/position-intelligence` | `token_address` | `{"token_address":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"}` |
| `/tgm/token-information` | `/api/v1/tgm/token-information` | `chain`, `token_address`, `timeframe` | `{"chain":"base","token_address":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","timeframe":"1h"}` |
| `/tgm/token-ohlcv` | `/api/v1/tgm/token-ohlcv` | `chain`, `timeframe` | `{"chain":"base","timeframe":"1h","token_address":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"}` |
| `/tgm/transfers` | `/api/v1/tgm/transfers` | `chain`, `token_address`, `date` | `{"chain":"base","token_address":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","date":{"from":"2026-11-01T00:…` |
| `/tgm/who-bought-sold` | `/api/v1/tgm/who-bought-sold` | `chain`, `token_address`, `date` | `{"chain":"base","token_address":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","date":{"from":"2026-11-01T00:…` |
| `/profiler/address/counterparties` | `/api/v1/profiler/address/counterparties` | `chain`, `date` | `{"address":"0xC9c104446E3284361Ed2b1607a370E2201bC25B8","chain":"base","date":{"from":"2026-11-01T00:00:00Z…` |
| `/profiler/address/counterparties/batch` | `/api/v1/profiler/address/counterparties/batch` | `wallet_addresses`, `chain`, `date` | `{"wallet_addresses":["0xC9c104446E3284361Ed2b1607a370E2201bC25B8"],"chain":"base","date":{"from":"2026-11-0…` |
| `/profiler/address/first-funder` | `/api/v1/profiler/address/first-funder` | `address` | `{"address":"0xC9c104446E3284361Ed2b1607a370E2201bC25B8"}` |
| `/profiler/address/historical-balances` | `/api/v1/profiler/address/historical-balances` | `chain`, `date` | `{"address":"0xC9c104446E3284361Ed2b1607a370E2201bC25B8","chain":"base","date":{"from":"2026-11-01T00:00:00Z…` |
| `/profiler/address/historical-token-balances` | `/api/v1/profiler/address/historical-token-balances` | `address`, `as_of_date`, `chain` | `{"address":"0xC9c104446E3284361Ed2b1607a370E2201bC25B8","as_of_date":"2026-11-07","chain":"base"}` |
| `/profiler/address/historical-transactions` | `/api/v1/profiler/address/historical-transactions` | `address`, `chain`, `as_of_date` | `{"address":"0xC9c104446E3284361Ed2b1607a370E2201bC25B8","chain":"base","as_of_date":"2026-11-07"}` |
| `/profiler/address/labels` | `/api/v1/profiler/address/labels` | `address`, `chain` | `{"address":"0xC9c104446E3284361Ed2b1607a370E2201bC25B8","chain":"base"}` |
| `/profiler/address/pnl` | `/api/v1/profiler/address/pnl` | `chain` | `{"address":"0xC9c104446E3284361Ed2b1607a370E2201bC25B8","chain":"base"}` |
| `/profiler/address/pnl-summary` | `/api/v1/profiler/address/pnl-summary` | `chain`, `date` | `{"address":"0xC9c104446E3284361Ed2b1607a370E2201bC25B8","chain":"base","date":{"from":"2026-11-01T00:00:00Z…` |
| `/profiler/address/premium-labels` | `/api/v1/profiler/address/premium-labels` | `address`, `chain` | `{"address":"0xC9c104446E3284361Ed2b1607a370E2201bC25B8","chain":"base"}` |
| `/profiler/address/related-wallets` | `/api/v1/profiler/address/related-wallets` | `chain` | `{"address":"0xC9c104446E3284361Ed2b1607a370E2201bC25B8","chain":"base"}` |
| `/profiler/address/transactions` | `/api/v1/profiler/address/transactions` | `chain`, `date` | `{"address":"0xC9c104446E3284361Ed2b1607a370E2201bC25B8","chain":"base","date":{"from":"2026-11-01T00:00:00Z…` |
| `/profiler/dex-trades` | `/api/v1/profiler/dex-trades` | `address`, `chain`, `date` | `{"address":"0xC9c104446E3284361Ed2b1607a370E2201bC25B8","chain":"base","date":{"from":"2026-11-01T00:00:00Z…` |
| `/profiler/historical-transaction-lookup` | `/api/v1/profiler/historical-transaction-lookup` | `chain`, `transaction_hash`, `as_of_date` | `{"chain":"base","transaction_hash":"0xb2a8d372b9effb5d56c2dca4e3c422abcd68f13e4566e0fbc97a9613310bd450","as…` |
| `/profiler/perp-pnl-summary` | `/api/v1/profiler/perp-pnl-summary` | `address`, `date` | `{"address":"0xC9c104446E3284361Ed2b1607a370E2201bC25B8","date":{"from":"2026-11-01T00:00:00Z","to":"2026-11…` |
| `/profiler/perp-positions` | `/api/v1/profiler/perp-positions` | `address` | `{"address":"0xC9c104446E3284361Ed2b1607a370E2201bC25B8"}` |
| `/profiler/perp-trades` | `/api/v1/profiler/perp-trades` | `address`, `date` | `{"address":"0xC9c104446E3284361Ed2b1607a370E2201bC25B8","date":{"from":"2026-11-01T00:00:00Z","to":"2026-11…` |
| `/prediction-market/address-summary` | `/api/v1/prediction-market/address-summary` | `address` | `{"address":"0xC9c104446E3284361Ed2b1607a370E2201bC25B8"}` |
| `/prediction-market/categories` | `/api/v1/prediction-market/categories` | — | `{}` |
| `/prediction-market/event-screener` | `/api/v1/prediction-market/event-screener` | — | `{}` |
| `/prediction-market/market-screener` | `/api/v1/prediction-market/market-screener` | — | `{}` |
| `/prediction-market/ohlcv` | `/api/v1/prediction-market/ohlcv` | `market_id` | `{"market_id":"1"}` |
| `/prediction-market/orderbook` | `/api/v1/prediction-market/orderbook` | `market_id` | `{"market_id":"1"}` |
| `/prediction-market/pnl-by-address` | `/api/v1/prediction-market/pnl-by-address` | `address` | `{"address":"0xC9c104446E3284361Ed2b1607a370E2201bC25B8"}` |
| `/prediction-market/pnl-by-market` | `/api/v1/prediction-market/pnl-by-market` | `market_id` | `{"market_id":"1"}` |
| `/prediction-market/position-detail` | `/api/v1/prediction-market/position-detail` | `market_id` | `{"market_id":"1"}` |
| `/prediction-market/top-holders` | `/api/v1/prediction-market/top-holders` | `market_id` | `{"market_id":"1"}` |
| `/prediction-market/trades-by-address` | `/api/v1/prediction-market/trades-by-address` | `address` | `{"address":"0xC9c104446E3284361Ed2b1607a370E2201bC25B8"}` |
| `/prediction-market/trades-by-market` | `/api/v1/prediction-market/trades-by-market` | `market_id` | `{"market_id":"1"}` |

Meta routes (free): `GET /` (endpoint list), `GET /health`, `GET /openapi.json`,
`GET /.well-known/x402` (all 52 resources, x402 v1 discovery).

**Validation:** required fields are checked *before* payment — a body missing
them returns HTTP 400 and is never charged.

## Example (unpaid → 402)

```bash
curl -X POST https://<your-railway-domain>/token-screener \
  -H 'content-type: application/json' \
  -d '{"chains":["base"],"timeframe":"24h"}'
# → HTTP 402, JSON offer + PAYMENT-REQUIRED header (base64 offer)
```

Pay with any x402 v2 client (e.g. `vapi pay <url> --method POST --network
eip155:8453 --expected-pay-to 0xC9c104446E3284361Ed2b1607a370E2201bC25B8
--max 0.05`) and retry with the `PAYMENT-SIGNATURE` header; the response
carries a `PAYMENT-RESPONSE` header.

## Env vars (Railway → Variables)

| Var | Value |
|---|---|
| `NANSEN_API_KEY` | your Nansen API key (secret) |
| `PAY_TO` | `0xC9c104446E3284361Ed2b1607a370E2201bC25B8` |
| `PRICE_ATOMIC_USDC` | `50000` ($0.05) |

`PORT` is set automatically by Railway. `npm start` runs `node index.mjs`.

## Deploy to Railway (CLI, non-interactive)

```bash
npm i -g @railway/cli
export RAILWAY_TOKEN=<account token from https://railway.com/account/tokens>
# create project via GraphQL API (railway init/link need a TTY), then:
railway up --ci --service <service> --environment production
railway variables set NANSEN_API_KEY="<key>" PAY_TO=0xC9c1…25B8 PRICE_ATOMIC_USDC=50000
railway domain   # get the public https URL
```

## ⚠️ Redistribution note (read before listing publicly)

Nansen's docs state that **Smart Money endpoints are prohibited from
redistribution** ("prohibited endpoints (eg. smart money endpoints) that are
not open for redistribution"). The `/smart-money/*` routes were therefore
removed in v2.1.0 and are not served by this wrapper. The remaining token
screener / TGM / profiler routes do not carry that same explicit prohibition.
