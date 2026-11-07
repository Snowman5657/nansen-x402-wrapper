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
];

// Public base URL. Railway terminates TLS at its edge; the origin advertised
// in OpenAPI / discovery must be https.
function publicOrigin(c) {
  return new URL(c.req.url).origin.replace(/^http:/, "https:");
}

function priceUsdc() {
  return (Number(PRICE_ATOMIC) / 1e6).toFixed(4);
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
    x402Version: 1,
    resources: ENDPOINTS.map((ep) => {
      const offer = makeOffer(c, ep);
      return {
        url: publicOrigin(c) + ep.path,
        description: offer.resource.description,
        mimeType: "application/json",
        accepts: [
          {
            scheme: "exact",
            network: "eip155:8453",
            maxAmountRequired: PRICE_ATOMIC,
            asset: USDC_BASE,
            payTo: PAY_TO,
            maxTimeoutSeconds: 120,
            extra: { name: "USD Coin", version: "2" },
          },
        ],
      };
    }),
  });
});

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "nansen-x402-wrapper",
    version: "2.2.0",
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
          x402Version: 2,
          accepts: offer.accepts,
        },
        summary: ep.name,
        description: ep.description,
        requestBody: {
          content: {
            "application/json": {
              schema: { type: "object" },
              example: ep.exampleBody,
            },
          },
        },
        responses: {
          200: { description: `${ep.name} data` },
          400: { description: "Missing required fields (checked before payment)" },
          402: {
            description: "Payment required",
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
    openapi: "3.0.3",
    info: { title: "Nansen API (x402 wrapped)", version: "2.2.0" },
    servers: [{ url: publicOrigin(c) }],
    paths,
  });
});

// ---------------------------------------------------------------------------
// Paid proxy. One handler per endpoint; required fields are validated BEFORE
// payment so a caller is never charged for a body that would 422 upstream.
// ---------------------------------------------------------------------------
async function handlePaid(c, ep) {
  // Parse + validate the body first (no charge for a bad body).
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

  const offer = makeOffer(c, ep);
  const encoded = c.req.header("PAYMENT-SIGNATURE");
  if (!encoded) {
    return c.json(offer, 402, {
      // btoa() only handles Latin1; the offer contains UTF-8 (em-dashes),
      // so encode via Buffer instead.
      "PAYMENT-REQUIRED": Buffer.from(JSON.stringify(offer), "utf-8").toString("base64"),
    });
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

serve({ fetch: app.fetch, port: PORT });
console.log(`nansen-x402-wrapper v2 listening on ${PORT}`);
console.log(`endpoints: ${ENDPOINTS.map((e) => e.path).join(", ")}`);
