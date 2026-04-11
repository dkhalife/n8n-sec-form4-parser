# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-04-11

### Added

- New **SEC Form 4 MariaDB Inserter** (`SecForm4MariadbInserter`) n8n node.
  - Takes parsed Form 4 data from the parser node and upserts it into a MySQL/MariaDB database.
  - Creates 10 normalized tables automatically via `CREATE TABLE IF NOT EXISTS`:
    `issuers`, `reporting_owners`, `filings`, `filing_owners`,
    `non_derivative_transactions`, `derivative_transactions`,
    `non_derivative_holdings`, `derivative_holdings`, `footnotes`, `signatures`.
  - Idempotent upserts using `INSERT ... ON DUPLICATE KEY UPDATE` (safe for repeated runs).
  - Transactional writes — all tables updated atomically with rollback on error.
  - Configurable table name prefix (default: `sec_`).
  - Toggle for automatic table creation.
  - `continueOnFail` support for bulk workflow processing.
- New **MySQL / MariaDB** (`mySqlApi`) credential type with connection testing.
- 18-test suite covering SQL generation, transaction flow, and error rollback.

### Dependencies

- Added `mysql2` (`^3.11.0`) for database connectivity.

## [0.1.0] - 2026-04-01

### Added

- Initial release of the **SEC Form 4 Parser** n8n community node.
- Accepts an EDGAR index page URL (`-index.htm`) or a direct Form 4 XML URL.
- Auto-discovers the raw XML document from the index page when a `-index.htm` URL is provided.
- Parses the Form 4 XML using `fast-xml-parser` into a rich, automation-ready JSON object:
  - `filing` — accession number, period, document type, source URLs.
  - `issuers` — keyed by CIK; issuer name, ticker, foreign ticker.
  - `reportingOwners` — keyed by CIK; name, address, director/officer/10%-owner flags.
  - `nonDerivativeTransactions` — common stock buys/sells with shares, price, acquired/disposed code, post-transaction holdings.
  - `derivativeTransactions` — options, warrants, convertibles with exercise price, expiration, underlying security details.
  - `nonDerivativeHoldings` — holdings reported without a transaction.
  - `derivativeHoldings` — derivative holdings reported without a transaction.
  - `footnotes` — keyed by footnote ID (e.g. `F1`).
  - `signatures` — signer name and date.
- All foreign-key references between transactions and entities use CIK for easy downstream joining.
- Configurable `User-Agent` and contact email for SEC EDGAR compliance.
- `continueOnFail` support for bulk workflow processing.
- `usableAsTool` support for AI agent workflows.
- 23-test suite (14 unit + 9 live EDGAR integration tests).
- CI workflow: lint → build → test on every push/PR.
- Publish workflow: npm publish with provenance on version tags.
