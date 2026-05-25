# n8n-nodes-sec-form4-parser

An [n8n](https://n8n.io) community node that fetches and parses **SEC Form 4** (Statement of Changes in Beneficial Ownership) filings from [EDGAR](https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=4&dateb=&owner=include&count=40), returning a rich, automation-ready JSON object.

[![CI](https://github.com/dkhalife/n8n-sec-form4-parser/actions/workflows/ci.yml/badge.svg)](https://github.com/dkhalife/n8n-sec-form4-parser/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/n8n-nodes-sec-form4-parser.svg)](https://www.npmjs.com/package/n8n-nodes-sec-form4-parser)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE.md)

---

## What is SEC Form 4?

Form 4 is filed with the U.S. Securities and Exchange Commission whenever a company **insider** (director, officer, or 10%+ shareholder) buys or sells shares. It is a primary data source for insider-trading analysis and is publicly available on [EDGAR](https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=4).

---

## Node: SEC Form 4 Parser

### Inputs

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| **URL** | ✅ | — | EDGAR index page URL (ending in `-index.htm`) **or** direct XML URL for the Form 4 filing |
| **User-Agent App Name** | — | `n8n-sec-form4-parser/1.0` | App name/version sent in the `User-Agent` header. SEC EDGAR requires all automated requests to identify themselves. |
| **Contact Email** | — | `bot@example.com` | Email appended to `User-Agent` per [SEC EDGAR access rules](https://www.sec.gov/os/accessing-edgar-data). Format sent: `<app>/<version> (<email>)` |

**Example URL (index page):**
```
https://www.sec.gov/Archives/edgar/data/1527541/000110465926038038/0001104659-26-038038-index.htm
```

**Example URL (direct XML):**
```
https://www.sec.gov/Archives/edgar/data/1352851/000110465926038038/tm2610808-1_4seq1.xml
```

---

### Output JSON structure

The node outputs a single JSON object per input item. All entities use **CIK as the primary key** so downstream nodes can join data without string-matching names.

```jsonc
{
  // ── Filing metadata ──────────────────────────────────────────────────────────
  "filing": {
    "accessionNumber": "0001104659-26-038038",
    "periodOfReport": "2026-03-27",
    "documentType": "4",
    "schemaVersion": "X0609",
    "notSubjectToSection16": false,
    "aff10b5One": false,
    "sourceUrl": "https://www.sec.gov/Archives/edgar/data/.../0001104659-26-038038-index.htm",
    "xmlUrl":    "https://www.sec.gov/Archives/edgar/data/.../tm2610808-1_4seq1.xml",
    "indexUrl":  "https://www.sec.gov/Archives/edgar/data/.../0001104659-26-038038-index.htm",
    "issuerCik": "0001527541",                                   // FK → issuers
    "reportingOwnerCiks": ["0001352851", "0001353085", "..."]    // FK → reportingOwners
  },

  // ── Issuers — keyed by CIK ───────────────────────────────────────────────────
  "issuers": {
    "0001527541": {
      "cik": "0001527541",
      "name": "Wheeler Real Estate Investment Trust, Inc.",
      "tradingSymbol": "WHLR",
      "foreignTradingSymbol": null
    }
  },

  // ── Reporting owners — keyed by CIK ─────────────────────────────────────────
  "reportingOwners": {
    "0001352851": {
      "cik": "0001352851",
      "name": "Magnetar Financial LLC",
      "address": {
        "street1": "1603 ORRINGTON AVENUE",
        "street2": "13TH FLOOR",
        "city": "EVANSTON",
        "state": "IL",
        "zipCode": "60201",
        "nonUSAddress": false,
        "stateDescription": null
      },
      "relationship": {
        "isDirector": false,
        "isOfficer": false,
        "isTenPercentOwner": true,
        "isOther": false,
        "officerTitle": null,
        "otherText": null
      }
    }
    // … additional owners
  },

  // ── Non-derivative transactions (e.g. common stock buys/sells) ───────────────
  "nonDerivativeTransactions": [
    {
      "id": "ndt-0",
      "issuerCik": "0001527541",          // FK → issuers
      "reportingOwnerCiks": ["0001352851", "..."],  // FK → reportingOwners
      "securityTitle": "Common Stock",
      "securityTitleFootnotes": [],
      "transactionDate": "2026-03-27",
      "transactionDateFootnotes": [],
      "deemedExecutionDate": null,
      "deemedExecutionDateFootnotes": [],
      "transactionCoding": {
        "formType": "4",
        "transactionCode": "S",           // S=sale, P=purchase, A=award, etc.
        "equitySwapInvolved": false,
        "transactionCodingFootnotes": []
      },
      "transactionTimeliness": null,
      "transactionAmounts": {
        "shares": 3685,
        "sharesFootnotes": [],
        "pricePerShare": 1.0374,
        "pricePerShareFootnotes": ["F4"],
        "acquiredDisposedCode": "D",      // A=acquired, D=disposed
        "acquiredDisposedCodeFootnotes": []
      },
      "postTransactionAmounts": {
        "sharesOwnedFollowingTransaction": 159550,
        "sharesOwnedFollowingTransactionFootnotes": [],
        "valueOwnedFollowingTransaction": null,
        "valueOwnedFollowingTransactionFootnotes": []
      },
      "ownershipNature": {
        "directOrIndirectOwnership": "I",  // D=direct, I=indirect
        "directOrIndirectOwnershipFootnotes": [],
        "natureOfOwnership": "See Footnotes",
        "natureOfOwnershipFootnotes": ["F1", "F2", "F3"]
      }
    }
  ],

  // ── Derivative transactions (options, warrants, convertibles, etc.) ──────────
  "derivativeTransactions": [
    {
      "id": "dt-0",
      "issuerCik": "0001527541",
      "reportingOwnerCiks": ["..."],
      "securityTitle": "...",
      "conversionOrExercisePrice": 5.00,
      "transactionDate": "2026-01-15",
      "transactionCoding": { "transactionCode": "A", "equitySwapInvolved": false, "...": "..." },
      "transactionAmounts": { "shares": 1000, "pricePerShare": null, "acquiredDisposedCode": "A", "...": "..." },
      "exerciseDateOrExpiration": {
        "exerciseDate": null,
        "expirationDate": "2031-01-15"
      },
      "underlyingSecurity": {
        "underlyingSecurityTitle": "Common Stock",
        "underlyingSecurityShares": 1000,
        "underlyingSecurityValue": null
      },
      "postTransactionAmounts": { "sharesOwnedFollowingTransaction": 1000, "...": "..." },
      "ownershipNature": { "directOrIndirectOwnership": "D", "...": "..." }
    }
  ],

  // ── Holdings (non-derivative and derivative) — same shapes as transactions ───
  "nonDerivativeHoldings": [],
  "derivativeHoldings": [],

  // ── Footnotes — keyed by footnote ID ─────────────────────────────────────────
  "footnotes": {
    "F1": "Magnetar Financial LLC serves as investment manager to …",
    "F4": "The price reported in Column 4 is a weighted average price …"
  },

  // ── Signatures ───────────────────────────────────────────────────────────────
  "signatures": [
    {
      "signatureName": "/s/ Hayley A. Stein, Attorney-in-Fact for David J. Snyderman …",
      "signatureDate": "2026-03-31"
    }
  ]
}
```

> **Transaction codes** (field `transactionCode`): `P` purchase · `S` sale · `A` award/grant · `D` disposition to company · `F` tax withholding · `G` gift · `M` option exercise · `C` conversion · `W` will/inheritance · `X` option expiry · `Z` trust · `J` other

---

## Node: SEC Form 4 MariaDB Inserter

Persists parsed Form 4 filings into MariaDB / MySQL. Pipe the output of **SEC Form 4 Parser** directly into this node.

- **Credentials:** `MySQL / MariaDB` (host, port `3306`, database, user, password)
- **Parameters:**
  - **Table Prefix** (default `sec_`) — prefix applied to all 10 tables (e.g. `sec_filings`, `sec_issuers`, …)
  - **Create Tables If Missing** (default `true`) — auto-creates the schema on first run
- **Upsert semantics:** uses `INSERT ... ON DUPLICATE KEY UPDATE`. Re-running on the same filing is idempotent.

## Node: SEC Form 4 PostgreSQL Inserter

Persists parsed Form 4 filings into PostgreSQL. Same shape as the MariaDB inserter — pick whichever matches your database.

- **Credentials:** `PostgreSQL` (host, port `5432`, database, user, password, SSL: `disable` / `allow` / `require`)
- **Parameters:**
  - **Table Prefix** (default `sec_`) — prefix applied to all 10 tables
  - **Create Tables If Missing** (default `true`) — auto-creates the schema on first run
- **Upsert semantics:** uses `INSERT ... ON CONFLICT (...) DO UPDATE`. Re-running on the same filing is idempotent.

Both inserters produce the same 10-table schema (`issuers`, `reporting_owners`, `filings`, `filing_owners`, `non_derivative_transactions`, `derivative_transactions`, `non_derivative_holdings`, `derivative_holdings`, `footnotes`, `signatures`) and return per-item upsert counts.

---

## Installation

### In n8n (Community Nodes)

1. Open **Settings → Community Nodes** in your n8n instance.
2. Enter `n8n-nodes-sec-form4-parser` and click **Install**.
3. The **SEC Form 4 Parser** node will appear in the node panel under **Finance**.

### Manually (self-hosted)

```bash
cd ~/.n8n
npm install n8n-nodes-sec-form4-parser
```

Then restart n8n.

---

## SEC EDGAR Access Policy

EDGAR requires all automated clients to include a descriptive `User-Agent` header. Set the **Contact Email** parameter to your email address so requests are compliant:

```
User-Agent: n8n-sec-form4-parser/1.0 (bot@example.com)
```

See the [SEC EDGAR access policy](https://www.sec.gov/os/accessing-edgar-data) for details.

---

## Development

### Prerequisites

- Node.js v22+
- npm

### Setup

```bash
git clone https://github.com/dkhalife/n8n-sec-form4-parser.git
cd n8n-sec-form4-parser
npm install
```

### Available scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start n8n with the node loaded and hot-reload |
| `npm run build` | Compile TypeScript → `dist/` |
| `npm run lint` | Check for lint errors |
| `npm run lint:fix` | Auto-fix lint errors |
| `npm test` | Run unit + EDGAR integration tests |
| `npm run release` | Bump version, tag, and push (triggers npm publish) |

### Running tests

```bash
npm test
```

Tests hit the **live EDGAR API** using the filing at:
```
https://www.sec.gov/Archives/edgar/data/1527541/000110465926038038/0001104659-26-038038-index.htm
```

The suite includes 14 unit tests and 9 integration tests (23 total). Tests are skipped gracefully if EDGAR is unreachable.

---

## CI / CD

| Workflow | Trigger | Steps |
|----------|---------|-------|
| **CI** (`.github/workflows/ci.yml`) | Push / PR to `main` | lint → build → test |
| **Publish** (`.github/workflows/publish.yml`) | Version tag push (e.g. `0.2.0`) | build → publish to npm with provenance |

Publishing uses GitHub OIDC trusted publishing — no long-lived npm tokens required. The `prod` environment in GitHub must be linked to npm's trusted publisher settings for this package.

---

## Contributing

Issues and pull requests are welcome at <https://github.com/dkhalife/n8n-sec-form4-parser>.

---

## License

[MIT](LICENSE.md)
