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
| `/smart-money/netflow` | `/api/v1/smart-money/netflow` | `chains` | `{"chains":["base"]}` |
| `/smart-money/dex-trades` | `/api/v1/smart-money/dex-trades` | `chains` | `{"chains":["base"]}` |
| `/smart-money/holdings` | `/api/v1/smart-money/holdings` | `chains` | `{"chains":["base"]}` |
| `/tgm/flow-intelligence` | `/api/v1/tgm/flow-intelligence` | `chain`, `token_address` | `{"chain":"base","token_address":"0x8335…2913","timeframe":"24h"}` |
| `/tgm/holders` | `/api/v1/tgm/holders` | `chain`, `token_address` | `{"chain":"base","token_address":"0x8335…2913"}` |
| `/tgm/dex-trades` | `/api/v1/tgm/dex-trades` | `chain`, `token_address`, `date` | `{"chain":"base","token_address":"0x8335…2913","date":{"from":"2026-11-01T00:00:00Z","to":"2026-11-07T23:59:59Z"}}` |
| `/tgm/flows` | `/api/v1/tgm/flows` | `chain`, `token_address`, `date` | same date shape as above |
| `/profiler/address/current-balance` | `/api/v1/profiler/address/current-balance` | `chain` | `{"chain":"base","address":"0x…"}` |

Meta routes (free): `GET /` (endpoint list), `GET /health`, `GET /openapi.json`,
`GET /.well-known/x402` (all 9 resources, x402 v1 discovery).

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
not open for redistribution"). Reselling the `/smart-money/*` routes through
a public paid API risks your Nansen API key being revoked. The token
screener / TGM / profiler routes do not carry that same explicit prohibition.
If you list this publicly, consider disabling the Smart Money routes or
confirming the terms on your Nansen plan first.
