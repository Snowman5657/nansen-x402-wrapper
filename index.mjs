import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";

// ---------------------------------------------------------------------------
// Nansen x402 wrapper — multi-endpoint, pay-per-call (exact USDC on Base).
// Each POST endpoint returns an x402 v2 402 (exact scheme, canonical USDC on
// Base, payTo = the payout wallet), verifies + settles via the payai
// facilitator, then proxies the caller's JSON body to api.nansen.ai with the
// Nansen API key (apiKey header) and returns Nansen's JSON.
//
// Env:
//   PORT               (Railway sets this automatically)
//   PAY_TO             payout wallet, default 0xC9c104446E3284361Ed2b1607a370E2201bC25B8
//   PRICE_ATOMIC_USDC  price per call in USDC atomic units, default 50000 ($0.05)
//   NANSEN_API_KEY     Nansen API key (apiKey header)
// ---------------------------------------------------------------------------

const PORT = Number(process.env.PORT || 4242);
const PAY_TO = process.env.PAY_TO || "0xC9c104446E3284361Ed2b1607a370E2201bC25B8";
const PRICE_ATOMIC = process.env.PRICE_ATOMIC_USDC || "50000";
const NANSEN_API_KEY = process.env.NANSEN_API_KEY || "";
const NANSEN_BASE = "https://api.nansen.ai";
const FACILITATOR = "https://facilitator.payai.network";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// Example token used in TGM example bodies: USDC on Base.
const USDC_TOKEN = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// ---------------------------------------------------------------------------
// Endpoint catalogue. `required` lists the top-level fields Nansen requires;
// they are checked BEFORE any payment so a caller is never charged for a
// body that would 422 upstream. `exampleBody` is shown in the Bazaar
// extension and in /openapi.json.
// ---------------------------------------------------------------------------
const ENDPOINTS = [
  {
    path: "/token-screener",
    nansen: "/api/v1/token-screener",
    name: "Token Screener",
    description:
      "Nansen token screener — screen tokens across chains with price, volume, netflow and liquidity.",
    tags: ["nansen", "token-screener", "defi"],
    required: ["chains"],
    exampleBody: { chains: ["base"], timeframe: "24h" },
  },
  {
    path: "/tgm/flow-intelligence",
    nansen: "/api/v1/tgm/flow-intelligence",
    name: "TGM Flow Intelligence",
    description:
      "Token God Mode flow intelligence — per-token net flow by cohort (smart traders, whales, top PnL, exchanges, fresh wallets).",
    tags: ["nansen", "tgm", "flow-intelligence"],
    required: ["chain", "token_address"],
    exampleBody: {
      chain: "base",
      token_address: USDC_TOKEN,
      timeframe: "24h",
    },
  },
  {
    path: "/tgm/holders",
    nansen: "/api/v1/tgm/holders",
    name: "TGM Holders",
    description:
      "Token God Mode holders — who holds a token, by label (whale, smart money, exchange, public figure).",
    tags: ["nansen", "tgm", "holders"],
    required: ["chain", "token_address"],
    exampleBody: { chain: "base", token_address: USDC_TOKEN },
  },
  {
    path: "/tgm/dex-trades",
    nansen: "/api/v1/tgm/dex-trades",
    name: "TGM DEX Trades",
    description:
      "Token God Mode DEX trades — individual DEX trades for a token over a date range.",
    tags: ["nansen", "tgm", "dex-trades"],
    required: ["chain", "token_address", "date"],
    exampleBody: {
      chain: "base",
      token_address: USDC_TOKEN,
      date: { from: "2026-11-01T00:00:00Z", to: "2026-11-07T23:59:59Z" },
    },
  },
  {
    path: "/tgm/flows",
    nansen: "/api/v1/tgm/flows",
    name: "TGM Flows",
    description:
      "Token God Mode flows — token flows by holder label over a date range.",
    tags: ["nansen", "tgm", "flows"],
    required: ["chain", "token_address", "date"],
    exampleBody: {
      chain: "base",
      token_address: USDC_TOKEN,
      date: { from: "2026-11-01T00:00:00Z", to: "2026-11-07T23:59:59Z" },
    },
  },
  {
    path: "/profiler/address/current-balance",
    nansen: "/api/v1/profiler/address/current-balance",
    name: "Profiler Address Balance",
    description:
      "Profiler wallet analysis — current balances for an address or entity, with Nansen labels.",
    tags: ["nansen", "profiler", "wallet"],
    required: ["chain"],
    exampleBody: {
      chain: "base",
      address: "0xC9c104446E3284361Ed2b1607a370E2201bC25B8",
    },
  },
  {
    path: "/tgm/historical-dex-trades",
    nansen: "/api/v1/tgm/historical-dex-trades",
    name: "TGM Historical DEX Trades",
    description: "Get historical Token God Mode (TGM) DEX trades",
    tags: ["nansen", "tgm", "historical-dex-trades"],
    required: ["chain", "token_address", "date_range"],
    exampleBody: {"chain": "base", "token_address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "date_range": {"from": "2026-11-01T00:00:00Z", "to": "2026-11-07T23:59:59Z"}},
  },
  {
    path: "/tgm/historical-pnl-leaderboard",
    nansen: "/api/v1/tgm/historical-pnl-leaderboard",
    name: "TGM Historical PnL Leaderboard",
    description: "Get historical Token God Mode (TGM) PnL leaderboard",
    tags: ["nansen", "tgm", "historical-pnl-leaderboard"],
    required: ["chain", "token_address", "date_range"],
    exampleBody: {"chain": "base", "token_address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "date_range": {"from": "2026-11-01T00:00:00Z", "to": "2026-11-07T23:59:59Z"}},
  },
  {
    path: "/tgm/historical-token-flow-summary",
    nansen: "/api/v1/tgm/historical-token-flow-summary",
    name: "TGM Historical Token Flow Summary",
    description: "Get historical Token God Mode (TGM) token flow summary",
    tags: ["nansen", "tgm", "historical-token-flow-summary"],
    required: ["chain", "token_address", "date_range"],
    exampleBody: {"chain": "base", "token_address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "date_range": {"from": "2026-11-01T00:00:00Z", "to": "2026-11-07T23:59:59Z"}},
  },
  {
    path: "/tgm/historical-token-quant-scores",
    nansen: "/api/v1/tgm/historical-token-quant-scores",
    name: "TGM Historical Token Quant Scores",
    description: "Get Historical Token Quant Scores",
    tags: ["nansen", "tgm", "historical-token-quant-scores"],
    required: ["as_of_date", "chain", "token_address"],
    exampleBody: {"as_of_date": "2026-11-07", "chain": "base", "token_address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"},
  },
  {
    path: "/tgm/historical-top-holders",
    nansen: "/api/v1/tgm/historical-top-holders",
    name: "TGM Historical Top Holders",
    description: "Get historical Token God Mode (TGM) top holders",
    tags: ["nansen", "tgm", "historical-top-holders"],
    required: ["chain", "token_address", "as_of_date"],
    exampleBody: {"chain": "base", "token_address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "as_of_date": "2026-11-07"},
  },
  {
    path: "/tgm/historical-who-bought-sold",
    nansen: "/api/v1/tgm/historical-who-bought-sold",
    name: "TGM Historical Who Bought Sold",
    description: "Get historical Token God Mode (TGM) who bought/sold",
    tags: ["nansen", "tgm", "historical-who-bought-sold"],
    required: ["chain", "token_address", "date_range"],
    exampleBody: {"chain": "base", "token_address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "date_range": {"from": "2026-11-01T00:00:00Z", "to": "2026-11-07T23:59:59Z"}},
  },
  {
    path: "/tgm/indicators",
    nansen: "/api/v1/tgm/indicators",
    name: "TGM Indicators",
    description: "Get Nansen Score Indicators",
    tags: ["nansen", "tgm", "indicators"],
    required: ["chain", "token_address"],
    exampleBody: {"chain": "base", "token_address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"},
  },
  {
    path: "/tgm/jup-dca",
    nansen: "/api/v1/tgm/jup-dca",
    name: "TGM Jupiter DCA",
    description: "Get Token God Mode (TGM) Jupiter DCA data",
    tags: ["nansen", "tgm", "jup-dca"],
    required: ["token_address"],
    exampleBody: {"token_address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"},
  },
  {
    path: "/tgm/perp-pnl-leaderboard",
    nansen: "/api/v1/tgm/perp-pnl-leaderboard",
    name: "TGM Perp PnL Leaderboard",
    description: "Get Token God Mode (TGM) perp PnL leaderboard data",
    tags: ["nansen", "tgm", "perp-pnl-leaderboard"],
    required: ["token_symbol", "date"],
    exampleBody: {"token_symbol": "ETH", "date": {"from": "2026-11-01T00:00:00Z", "to": "2026-11-07T23:59:59Z"}},
  },
  {
    path: "/tgm/perp-positions",
    nansen: "/api/v1/tgm/perp-positions",
    name: "TGM Perp Positions",
    description: "Get Token God Mode (TGM) perp positions data",
    tags: ["nansen", "tgm", "perp-positions"],
    required: ["token_symbol"],
    exampleBody: {"token_symbol": "ETH"},
  },
  {
    path: "/tgm/perp-trades",
    nansen: "/api/v1/tgm/perp-trades",
    name: "TGM Perp Trades",
    description: "Get Token God Mode (TGM) perp trades data",
    tags: ["nansen", "tgm", "perp-trades"],
    required: ["token_symbol", "date"],
    exampleBody: {"token_symbol": "ETH", "date": {"from": "2026-11-01T00:00:00Z", "to": "2026-11-07T23:59:59Z"}},
  },
  {
    path: "/tgm/pnl-leaderboard",
    nansen: "/api/v1/tgm/pnl-leaderboard",
    name: "TGM PnL Leaderboard",
    description: "Get Token God Mode (TGM) PnL leaderboard data",
    tags: ["nansen", "tgm", "pnl-leaderboard"],
    required: ["chain", "token_address", "date"],
    exampleBody: {"chain": "base", "token_address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "date": {"from": "2026-11-01T00:00:00Z", "to": "2026-11-07T23:59:59Z"}},
  },
  {
    path: "/tgm/position-intelligence",
    nansen: "/api/v1/tgm/position-intelligence",
    name: "TGM Position Intelligence",
    description: "Get Token God Mode (TGM) position intelligence data",
    tags: ["nansen", "tgm", "position-intelligence"],
    required: ["token_address"],
    exampleBody: {"token_address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"},
  },
  {
    path: "/tgm/token-information",
    nansen: "/api/v1/tgm/token-information",
    name: "TGM Token Information",
    description: "Get Token God Mode (TGM) token information data",
    tags: ["nansen", "tgm", "token-information"],
    required: ["chain", "token_address", "timeframe"],
    exampleBody: {"chain": "base", "token_address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "timeframe": "1h"},
  },
  {
    path: "/tgm/token-ohlcv",
    nansen: "/api/v1/tgm/token-ohlcv",
    name: "TGM Token OHLCV",
    description: "Retrieve token OHLCV candle data",
    tags: ["nansen", "tgm", "token-ohlcv"],
    required: ["chain", "timeframe"],
    exampleBody: {"chain": "base", "timeframe": "1h", "token_address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"},
  },
  {
    path: "/tgm/transfers",
    nansen: "/api/v1/tgm/transfers",
    name: "TGM Transfers",
    description: "Get Token God Mode (TGM) transfers data",
    tags: ["nansen", "tgm", "transfers"],
    required: ["chain", "token_address", "date"],
    exampleBody: {"chain": "base", "token_address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "date": {"from": "2026-11-01T00:00:00Z", "to": "2026-11-07T23:59:59Z"}},
  },
  {
    path: "/tgm/who-bought-sold",
    nansen: "/api/v1/tgm/who-bought-sold",
    name: "TGM Who Bought Sold",
    description: "Get Token God Mode (TGM) who bought/sold data",
    tags: ["nansen", "tgm", "who-bought-sold"],
    required: ["chain", "token_address", "date"],
    exampleBody: {"chain": "base", "token_address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "date": {"from": "2026-11-01T00:00:00Z", "to": "2026-11-07T23:59:59Z"}},
  },
  {
    path: "/profiler/address/counterparties",
    nansen: "/api/v1/profiler/address/counterparties",
    name: "Profiler Address Counterparties",
    description: "Get Address Counterparties Data",
    tags: ["nansen", "profiler", "counterparties"],
    required: ["chain", "date"],
    exampleBody: {"address": "0xC9c104446E3284361Ed2b1607a370E2201bC25B8", "chain": "base", "date": {"from": "2026-11-01T00:00:00Z", "to": "2026-11-07T23:59:59Z"}},
  },
  {
    path: "/profiler/address/counterparties/batch",
    nansen: "/api/v1/profiler/address/counterparties/batch",
    name: "Profiler Address Counterparties Batch",
    description: "Get Address Counterparties Data (Batch)",
    tags: ["nansen", "profiler", "batch"],
    required: ["wallet_addresses", "chain", "date"],
    exampleBody: {"wallet_addresses": ["0xC9c104446E3284361Ed2b1607a370E2201bC25B8"], "chain": "base", "date": {"from": "2026-11-01T00:00:00Z", "to": "2026-11-07T23:59:59Z"}},
  },
  {
    path: "/profiler/address/first-funder",
    nansen: "/api/v1/profiler/address/first-funder",
    name: "Profiler Address First Funder",
    description: "Get Address First Funder Data",
    tags: ["nansen", "profiler", "first-funder"],
    required: ["address"],
    exampleBody: {"address": "0xC9c104446E3284361Ed2b1607a370E2201bC25B8"},
  },
  {
    path: "/profiler/address/historical-balances",
    nansen: "/api/v1/profiler/address/historical-balances",
    name: "Profiler Address Historical Balances",
    description: "Get Address Historical Balances Data",
    tags: ["nansen", "profiler", "historical-balances"],
    required: ["chain", "date"],
    exampleBody: {"address": "0xC9c104446E3284361Ed2b1607a370E2201bC25B8", "chain": "base", "date": {"from": "2026-11-01T00:00:00Z", "to": "2026-11-07T23:59:59Z"}},
  },
  {
    path: "/profiler/address/historical-token-balances",
    nansen: "/api/v1/profiler/address/historical-token-balances",
    name: "Profiler Address Historical Token Balances",
    description: "Get Historical Balances by Address",
    tags: ["nansen", "profiler", "historical-token-balances"],
    required: ["address", "as_of_date", "chain"],
    exampleBody: {"address": "0xC9c104446E3284361Ed2b1607a370E2201bC25B8", "as_of_date": "2026-11-07", "chain": "base"},
  },
  {
    path: "/profiler/address/historical-transactions",
    nansen: "/api/v1/profiler/address/historical-transactions",
    name: "Profiler Address Historical Transactions",
    description: "Get Historical Transactions for an Address",
    tags: ["nansen", "profiler", "historical-transactions"],
    required: ["address", "chain", "as_of_date"],
    exampleBody: {"address": "0xC9c104446E3284361Ed2b1607a370E2201bC25B8", "chain": "base", "as_of_date": "2026-11-07"},
  },
  {
    path: "/profiler/address/labels",
    nansen: "/api/v1/profiler/address/labels",
    name: "Profiler Address Labels",
    description: "Retrieve address label data",
    tags: ["nansen", "profiler", "labels"],
    required: ["address", "chain"],
    exampleBody: {"address": "0xC9c104446E3284361Ed2b1607a370E2201bC25B8", "chain": "base"},
  },
  {
    path: "/profiler/address/pnl",
    nansen: "/api/v1/profiler/address/pnl",
    name: "Profiler Address PnL",
    description: "Retrieve address PnL data",
    tags: ["nansen", "profiler", "pnl"],
    required: ["chain"],
    exampleBody: {"address": "0xC9c104446E3284361Ed2b1607a370E2201bC25B8", "chain": "base"},
  },
  {
    path: "/profiler/address/pnl-summary",
    nansen: "/api/v1/profiler/address/pnl-summary",
    name: "Profiler Address PnL Summary",
    description: "Get Address PnL Summary Data",
    tags: ["nansen", "profiler", "pnl-summary"],
    required: ["chain", "date"],
    exampleBody: {"address": "0xC9c104446E3284361Ed2b1607a370E2201bC25B8", "chain": "base", "date": {"from": "2026-11-01T00:00:00Z", "to": "2026-11-07T23:59:59Z"}},
  },
  {
    path: "/profiler/address/premium-labels",
    nansen: "/api/v1/profiler/address/premium-labels",
    name: "Profiler Address Premium Labels",
    description: "Get Address Premium Labels",
    tags: ["nansen", "profiler", "premium-labels"],
    required: ["address", "chain"],
    exampleBody: {"address": "0xC9c104446E3284361Ed2b1607a370E2201bC25B8", "chain": "base"},
  },
  {
    path: "/profiler/address/related-wallets",
    nansen: "/api/v1/profiler/address/related-wallets",
    name: "Profiler Address Related Wallets",
    description: "Get Address Related Wallets Data",
    tags: ["nansen", "profiler", "related-wallets"],
    required: ["chain"],
    exampleBody: {"address": "0xC9c104446E3284361Ed2b1607a370E2201bC25B8", "chain": "base"},
  },
  {
    path: "/profiler/address/transactions",
    nansen: "/api/v1/profiler/address/transactions",
    name: "Profiler Address Transactions",
    description: "Get Address Transactions Data",
    tags: ["nansen", "profiler", "transactions"],
    required: ["chain", "date"],
    exampleBody: {"address": "0xC9c104446E3284361Ed2b1607a370E2201bC25B8", "chain": "base", "date": {"from": "2026-11-01T00:00:00Z", "to": "2026-11-07T23:59:59Z"}},
  },
  {
    path: "/profiler/dex-trades",
    nansen: "/api/v1/profiler/dex-trades",
    name: "Profiler DEX Trades",
    description: "Get Wallet DEX Trades",
    tags: ["nansen", "profiler", "dex-trades"],
    required: ["address", "chain", "date"],
    exampleBody: {"address": "0xC9c104446E3284361Ed2b1607a370E2201bC25B8", "chain": "base", "date": {"from": "2026-11-01T00:00:00Z", "to": "2026-11-07T23:59:59Z"}},
  },
  {
    path: "/profiler/historical-transaction-lookup",
    nansen: "/api/v1/profiler/historical-transaction-lookup",
    name: "Profiler Historical Transaction Lookup",
    description: "Get Historical (Time-Travel) Transaction Lookup Data",
    tags: ["nansen", "profiler", "historical-transaction-lookup"],
    required: ["chain", "transaction_hash", "as_of_date"],
    exampleBody: {"chain": "base", "transaction_hash": "0xb2a8d372b9effb5d56c2dca4e3c422abcd68f13e4566e0fbc97a9613310bd450", "as_of_date": "2026-11-07"},
  },
  {
    path: "/profiler/perp-pnl-summary",
    nansen: "/api/v1/profiler/perp-pnl-summary",
    name: "Profiler Perp PnL Summary",
    description: "Get Hyperliquid Perp PnL Summary",
    tags: ["nansen", "profiler", "perp-pnl-summary"],
    required: ["address", "date"],
    exampleBody: {"address": "0xC9c104446E3284361Ed2b1607a370E2201bC25B8", "date": {"from": "2026-11-01T00:00:00Z", "to": "2026-11-07T23:59:59Z"}},
  },
  {
    path: "/profiler/perp-positions",
    nansen: "/api/v1/profiler/perp-positions",
    name: "Profiler Perp Positions",
    description: "Get Perpetual Positions Data",
    tags: ["nansen", "profiler", "perp-positions"],
    required: ["address"],
    exampleBody: {"address": "0xC9c104446E3284361Ed2b1607a370E2201bC25B8"},
  },
  {
    path: "/profiler/perp-trades",
    nansen: "/api/v1/profiler/perp-trades",
    name: "Profiler Perp Trades",
    description: "Get Perpetual Trade Data",
    tags: ["nansen", "profiler", "perp-trades"],
    required: ["address", "date"],
    exampleBody: {"address": "0xC9c104446E3284361Ed2b1607a370E2201bC25B8", "date": {"from": "2026-11-01T00:00:00Z", "to": "2026-11-07T23:59:59Z"}},
  },
  {
    path: "/prediction-market/address-summary",
    nansen: "/api/v1/prediction-market/address-summary",
    name: "Prediction Market Address Summary",
    description: "Get Prediction Market Address Summary",
    tags: ["nansen", "prediction-market", "address-summary"],
    required: ["address"],
    exampleBody: {"address": "0xC9c104446E3284361Ed2b1607a370E2201bC25B8"},
  },
  {
    path: "/prediction-market/categories",
    nansen: "/api/v1/prediction-market/categories",
    name: "Prediction Market Categories",
    description: "Get Prediction Market Categories",
    tags: ["nansen", "prediction-market", "categories"],
    required: [],
    exampleBody: {},
  },
  {
    path: "/prediction-market/event-screener",
    nansen: "/api/v1/prediction-market/event-screener",
    name: "Prediction Market Event Screener",
    description: "Get Prediction Market Event Screener",
    tags: ["nansen", "prediction-market", "event-screener"],
    required: [],
    exampleBody: {},
  },
  {
    path: "/prediction-market/market-screener",
    nansen: "/api/v1/prediction-market/market-screener",
    name: "Prediction Market Screener",
    description: "Get Prediction Market Screener",
    tags: ["nansen", "prediction-market", "market-screener"],
    required: [],
    exampleBody: {},
  },
  {
    path: "/prediction-market/ohlcv",
    nansen: "/api/v1/prediction-market/ohlcv",
    name: "Prediction Market OHLCV",
    description: "Get Prediction Market OHLCV Candles",
    tags: ["nansen", "prediction-market", "ohlcv"],
    required: ["market_id"],
    exampleBody: {"market_id": "1"},
  },
  {
    path: "/prediction-market/orderbook",
    nansen: "/api/v1/prediction-market/orderbook",
    name: "Prediction Market Orderbook",
    description: "Get Prediction Market Orderbook",
    tags: ["nansen", "prediction-market", "orderbook"],
    required: ["market_id"],
    exampleBody: {"market_id": "1"},
  },
  {
    path: "/prediction-market/pnl-by-address",
    nansen: "/api/v1/prediction-market/pnl-by-address",
    name: "Prediction Market PnL by Address",
    description: "Get Prediction Market PnL by Address",
    tags: ["nansen", "prediction-market", "pnl-by-address"],
    required: ["address"],
    exampleBody: {"address": "0xC9c104446E3284361Ed2b1607a370E2201bC25B8"},
  },
  {
    path: "/prediction-market/pnl-by-market",
    nansen: "/api/v1/prediction-market/pnl-by-market",
    name: "Prediction Market PnL by Market",
    description: "Get Prediction Market PnL by Market",
    tags: ["nansen", "prediction-market", "pnl-by-market"],
    required: ["market_id"],
    exampleBody: {"market_id": "1"},
  },
  {
    path: "/prediction-market/position-detail",
    nansen: "/api/v1/prediction-market/position-detail",
    name: "Prediction Market Position Detail",
    description: "Get Prediction Market Position Detail",
    tags: ["nansen", "prediction-market", "position-detail"],
    required: ["market_id"],
    exampleBody: {"market_id": "1"},
  },
  {
    path: "/prediction-market/top-holders",
    nansen: "/api/v1/prediction-market/top-holders",
    name: "Prediction Market Top Holders",
    description: "Get Prediction Market Top Holders",
    tags: ["nansen", "prediction-market", "top-holders"],
    required: ["market_id"],
    exampleBody: {"market_id": "1"},
  },
  {
    path: "/prediction-market/trades-by-address",
    nansen: "/api/v1/prediction-market/trades-by-address",
    name: "Prediction Market Trades by Address",
    description: "Get Prediction Market Trades by Address",
    tags: ["nansen", "prediction-market", "trades-by-address"],
    required: ["address"],
    exampleBody: {"address": "0xC9c104446E3284361Ed2b1607a370E2201bC25B8"},
  },
  {
    path: "/prediction-market/trades-by-market",
    nansen: "/api/v1/prediction-market/trades-by-market",
    name: "Prediction Market Trades by Market",
    description: "Get Prediction Market Trades by Market",
    tags: ["nansen", "prediction-market", "trades-by-market"],
    required: ["market_id"],
    exampleBody: {"market_id": "1"},
  },
];

// Public base URL. Railway terminates TLS at its edge; the origin advertised
// in OpenAPI / discovery must be https.
function publicOrigin(c) {
  return new URL(c.req.url).origin.replace(/^http:/, "https:");
}

function priceUsdc() {
  return (Number(PRICE_ATOMIC) / 1e6).toFixed(4).replace(/\.?0+$/, "") || "0";
}

// Infer a JSON Schema property from an example value, so the OpenAPI
// requestBody actually describes the inputs (required fields + types).
// The vAPI console reads `required`/`properties` to populate its input form;
// a bare `{ type: "object" }` made it send an empty body instead.
function inferProp(value) {
  if (Array.isArray(value)) {
    return {
      type: "array",
      items: value.length ? inferProp(value[0]) : {},
      example: value,
    };
  }
  if (value && typeof value === "object") {
    const props = {};
    for (const [k, v] of Object.entries(value)) props[k] = inferProp(v);
    return { type: "object", properties: props, example: value };
  }
  return { type: typeof value, example: value };
}

function requestBodySchema(ep) {
  const props = {};
  for (const [k, v] of Object.entries(ep.exampleBody)) props[k] = inferProp(v);
  return {
    type: "object",
    required: ep.required,
    properties: props,
    additionalProperties: true,
  };
}

function acceptsFor() {
  return {
    scheme: "exact",
    network: "eip155:8453",
    amount: PRICE_ATOMIC,
    asset: USDC_BASE,
    payTo: PAY_TO,
    maxTimeoutSeconds: 120,
    extra: { name: "USD Coin", version: "2" },
  };
}

function makeOffer(c, ep) {
  return {
    x402Version: 2,
    error: "Payment required",
    resource: {
      url: publicOrigin(c) + ep.path,
      description: `${ep.description} Pay per call in USDC on Base.`,
      mimeType: "application/json",
      serviceName: `Nansen ${ep.name} (wrapped)`,
      tags: ep.tags,
    },
    accepts: [acceptsFor()],
    extensions: {
      bazaar: {
        info: {
          input: {
            type: "http",
            method: "POST",
            bodyType: "json",
            body: ep.exampleBody,
          },
          output: { type: "json", example: { data: [] } },
        },
        schema: {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          type: "object",
          properties: {
            input: {
              type: "object",
              properties: {
                type: { type: "string", const: "http" },
                method: { type: "string", enum: ["POST"] },
                bodyType: { type: "string", const: "json" },
                body: {
                  type: "object",
                  properties: Object.fromEntries(
                    ep.required.map((f) => [f, {}]),
                  ),
                  required: ep.required,
                },
              },
              required: ["type", "method", "bodyType", "body"],
            },
          },
        },
      },
    },
  };
}

const app = new Hono();
app.use(
  "*",
  cors({
    origin: "*",
    exposeHeaders: ["PAYMENT-REQUIRED", "PAYMENT-RESPONSE"],
  }),
);

// ---------------------------------------------------------------------------
// Discovery / meta
// ---------------------------------------------------------------------------
app.get("/.well-known/x402", (c) => {
  return c.json({
    version: 1,
    description: `Nansen API (x402 wrapped) — pay-per-call via x402, $${priceUsdc()} per request, USDC on Base. No API key required.`,
    instructions: `All endpoints cost $${priceUsdc()} per request. Send a POST request with a JSON body. Pay $${priceUsdc()} USDC on Base (eip155:8453) via the x402 exact scheme; the payTo wallet is ${PAY_TO}.`,
    paymentProtocols: ["x402"],
    resources: ENDPOINTS.map((ep) => `POST ${ep.path}`),
  });
});

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "nansen-x402-wrapper",
    version: "2.5.0",
    endpoints: ENDPOINTS.map((ep) => ep.path),
    priceAtomicUsdc: PRICE_ATOMIC,
    priceUsdc: priceUsdc(),
    payTo: PAY_TO,
    keyConfigured: Boolean(NANSEN_API_KEY),
  }),
);

app.get("/", (c) =>
  c.json({
    service: "Nansen API (x402 wrapped)",
    endpoints: Object.fromEntries(
      ENDPOINTS.map((ep) => [ `POST ${ep.path}`, `paid, $${priceUsdc()} USDC on Base` ]),
    ),
    docs: { "GET /openapi.json": "OpenAPI", "GET /health": "health" },
    priceUsdcPerCall: priceUsdc(),
  }),
);

app.get("/openapi.json", (c) => {
  const paths = {};
  for (const ep of ENDPOINTS) {
    const offer = makeOffer(c, ep);
    paths[ep.path] = {
      post: {
        "x-payment-info": {
          protocols: ["x402"],
          pricingMode: "fixed",
          price: `$${priceUsdc()}`,
        },
        summary: ep.name,
        description: ep.description,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: requestBodySchema(ep),
              example: ep.exampleBody,
            },
          },
        },
        responses: {
          200: { description: `${ep.name} data` },
          400: { description: "Missing required fields (checked after payment is presented, before settlement)" },
          402: {
            description: "Payment Required",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    x402Version: { type: "integer", example: 2 },
                    error: { type: "string", example: "Payment required" },
                    accepts: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          scheme: { type: "string", example: "exact" },
                          network: { type: "string", example: "eip155:8453" },
                          amount: { type: "string", example: PRICE_ATOMIC },
                          asset: { type: "string", example: USDC_BASE },
                          payTo: { type: "string", example: PAY_TO },
                          maxTimeoutSeconds: { type: "integer", example: 120 },
                        },
                      },
                    },
                  },
                },
                example: offer,
              },
            },
          },
        },
      },
    };
  }
  return c.json({
    openapi: "3.1.0",
    info: { title: "Nansen API (x402 wrapped)", version: "2.5.0" },
    servers: [{ url: publicOrigin(c) }],
    paths,
  });
});

// ---------------------------------------------------------------------------
// Paid proxy. One handler per endpoint. The 402 quote comes FIRST for any
// unpaid request (even an empty body): the vAPI console's unpaid price check
// sends {} and needs a 402, not a 400. Required fields are validated only
// once a payment is presented, and BEFORE verify/settle, so a caller is
// never charged for a body that would 422 upstream (settlement happens
// only in the settle step, after validation).
// ---------------------------------------------------------------------------
async function handlePaid(c, ep) {
  const offer = makeOffer(c, ep);
  const encoded = c.req.header("PAYMENT-SIGNATURE");
  if (!encoded) {
    return c.json(offer, 402, {
      // btoa() only handles Latin1; the offer contains UTF-8 (em-dashes),
      // so encode via Buffer instead.
      "PAYMENT-REQUIRED": Buffer.from(JSON.stringify(offer), "utf-8").toString("base64"),
    });
  }

  // A payment was presented: parse + validate the body before verify/settle.
  let reqBody = {};
  try {
    reqBody = await c.req.json();
  } catch {
    return c.json({ error: "Request body must be valid JSON" }, 400);
  }
  const missing = ep.required.filter(
    (f) => reqBody[f] === undefined || reqBody[f] === null || reqBody[f] === "",
  );
  if (missing.length) {
    return c.json(
      {
        error: `Missing required field(s): ${missing.join(", ")}`,
        required: ep.required,
        example: ep.exampleBody,
      },
      400,
    );
  }

  let payment;
  try {
    payment = JSON.parse(Buffer.from(encoded, "base64").toString("utf-8"));
  } catch {
    return c.json({ error: "Invalid payment" }, 400);
  }

  const x402Body = {
    x402Version: 2,
    paymentPayload: payment,
    paymentRequirements: offer.accepts[0],
  };
  const headers = { "content-type": "application/json" };

  let verify, verified = {};
  try {
    verify = await fetch(`${FACILITATOR}/verify`, {
      method: "POST",
      headers,
      body: JSON.stringify(x402Body),
    });
    verified = await verify.json().catch(() => ({}));
  } catch (e) {
    console.error("verify fetch error:", e.message);
    return c.json({ error: "Payment verification failed" }, 402);
  }
  console.error(
    "verify:",
    verify.status,
    JSON.stringify(verified).slice(0, 500),
  );
  if (!verify.ok || !verified.isValid)
    return c.json({ error: "Payment verification failed" }, 402);

  let settle, settlement = {};
  try {
    settle = await fetch(`${FACILITATOR}/settle`, {
      method: "POST",
      headers,
      body: JSON.stringify(x402Body),
    });
    settlement = await settle.json().catch(() => ({}));
  } catch (e) {
    console.error("settle fetch error:", e.message);
    return c.json({ error: "Payment settlement failed" }, 502);
  }
  console.error(
    "settle:",
    settle.status,
    JSON.stringify(settlement).slice(0, 500),
  );
  if (!settle.ok || !settlement.success)
    return c.json({ error: "Payment settlement failed" }, 502);

  if (!NANSEN_API_KEY)
    return c.json({ error: "Upstream not configured" }, 503);

  const upstream = await fetch(`${NANSEN_BASE}${ep.nansen}`, {
    method: "POST",
    headers: { "content-type": "application/json", apiKey: NANSEN_API_KEY },
    body: JSON.stringify(reqBody),
  });
  const data = await upstream.json().catch(() => ({}));
  return c.json(data, upstream.status, {
    "PAYMENT-RESPONSE": Buffer.from(JSON.stringify(settlement), "utf-8").toString("base64"),
  });
}

for (const ep of ENDPOINTS) {
  app.post(ep.path, (c) => handlePaid(c, ep));
}

// POST / is an alias for the token screener (the default paid endpoint),
// so the API origin itself answers 402 instead of 404.
const tokenScreener = ENDPOINTS.find((ep) => ep.path === "/token-screener");
app.post("/", (c) => handlePaid(c, tokenScreener));

serve({ fetch: app.fetch, port: PORT });
console.log(`nansen-x402-wrapper v2 listening on ${PORT}`);
console.log(`endpoints: ${ENDPOINTS.map((e) => e.path).join(", ")}`);
