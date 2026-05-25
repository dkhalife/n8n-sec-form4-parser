import type { ClientBase } from 'pg';
import type { Form4Filing } from '../SecForm4Parser/form4Parser.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PostgresConfig {
	host: string;
	port: number;
	database: string;
	user: string;
	password: string;
	ssl?: 'disable' | 'require';
}

export interface TableNames {
	issuers: string;
	reportingOwners: string;
	filings: string;
	filingOwners: string;
	nonDerivativeTransactions: string;
	derivativeTransactions: string;
	nonDerivativeHoldings: string;
	derivativeHoldings: string;
	footnotes: string;
	signatures: string;
}

export interface UpsertResult {
	accessionNumber: string;
	issuersUpserted: number;
	ownersUpserted: number;
	filingOwnersUpserted: number;
	nonDerivativeTransactions: number;
	derivativeTransactions: number;
	nonDerivativeHoldings: number;
	derivativeHoldings: number;
	footnotes: number;
	signatures: number;
}

// ─── Table name helpers ───────────────────────────────────────────────────────

export function getTableNames(prefix: string): TableNames {
	return {
		issuers: `${prefix}issuers`,
		reportingOwners: `${prefix}reporting_owners`,
		filings: `${prefix}filings`,
		filingOwners: `${prefix}filing_owners`,
		nonDerivativeTransactions: `${prefix}non_derivative_transactions`,
		derivativeTransactions: `${prefix}derivative_transactions`,
		nonDerivativeHoldings: `${prefix}non_derivative_holdings`,
		derivativeHoldings: `${prefix}derivative_holdings`,
		footnotes: `${prefix}footnotes`,
		signatures: `${prefix}signatures`,
	};
}

// ─── SQL generation ───────────────────────────────────────────────────────────

export function buildUpsertSql(
	table: string,
	columns: string[],
	keyColumns: string[],
): string {
	const columnsList = columns.map((c) => `"${c}"`).join(', ');
	const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
	const keyList = keyColumns.map((c) => `"${c}"`).join(', ');
	const nonKeyColumns = columns.filter((c) => !keyColumns.includes(c));

	if (nonKeyColumns.length === 0) {
		return `INSERT INTO "${table}" (${columnsList}) VALUES (${placeholders}) ON CONFLICT (${keyList}) DO NOTHING`;
	}

	const updateClause = nonKeyColumns
		.map((c) => `"${c}" = EXCLUDED."${c}"`)
		.join(', ');

	return `INSERT INTO "${table}" (${columnsList}) VALUES (${placeholders}) ON CONFLICT (${keyList}) DO UPDATE SET ${updateClause}`;
}

export function getCreateTablesSql(t: TableNames): string[] {
	return [
		`CREATE TABLE IF NOT EXISTS "${t.issuers}" (
  "cik" VARCHAR(20) NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "trading_symbol" VARCHAR(20) DEFAULT NULL,
  "foreign_trading_symbol" VARCHAR(20) DEFAULT NULL,
  PRIMARY KEY ("cik")
)`,

		`CREATE TABLE IF NOT EXISTS "${t.reportingOwners}" (
  "cik" VARCHAR(20) NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "street1" VARCHAR(255) DEFAULT NULL,
  "street2" VARCHAR(255) DEFAULT NULL,
  "city" VARCHAR(100) DEFAULT NULL,
  "state" VARCHAR(50) DEFAULT NULL,
  "zip_code" VARCHAR(20) DEFAULT NULL,
  "non_us_address" BOOLEAN DEFAULT FALSE,
  "state_description" VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY ("cik")
)`,

		`CREATE TABLE IF NOT EXISTS "${t.filings}" (
  "accession_number" VARCHAR(30) NOT NULL,
  "period_of_report" DATE DEFAULT NULL,
  "document_type" VARCHAR(10) DEFAULT NULL,
  "schema_version" VARCHAR(20) DEFAULT NULL,
  "not_subject_to_section16" BOOLEAN DEFAULT FALSE,
  "aff10b5_one" BOOLEAN DEFAULT FALSE,
  "source_url" TEXT DEFAULT NULL,
  "xml_url" TEXT DEFAULT NULL,
  "index_url" TEXT DEFAULT NULL,
  "issuer_cik" VARCHAR(20) DEFAULT NULL,
  PRIMARY KEY ("accession_number")
)`,

		`CREATE TABLE IF NOT EXISTS "${t.filingOwners}" (
  "accession_number" VARCHAR(30) NOT NULL,
  "owner_cik" VARCHAR(20) NOT NULL,
  "is_director" BOOLEAN DEFAULT FALSE,
  "is_officer" BOOLEAN DEFAULT FALSE,
  "is_ten_percent_owner" BOOLEAN DEFAULT FALSE,
  "is_other" BOOLEAN DEFAULT FALSE,
  "officer_title" VARCHAR(255) DEFAULT NULL,
  "other_text" VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY ("accession_number", "owner_cik")
)`,

		`CREATE TABLE IF NOT EXISTS "${t.nonDerivativeTransactions}" (
  "accession_number" VARCHAR(30) NOT NULL,
  "id" VARCHAR(20) NOT NULL,
  "issuer_cik" VARCHAR(20) DEFAULT NULL,
  "security_title" VARCHAR(255) DEFAULT NULL,
  "transaction_date" DATE DEFAULT NULL,
  "deemed_execution_date" DATE DEFAULT NULL,
  "transaction_form_type" VARCHAR(10) DEFAULT NULL,
  "transaction_code" VARCHAR(10) DEFAULT NULL,
  "equity_swap_involved" BOOLEAN DEFAULT FALSE,
  "transaction_timeliness" VARCHAR(50) DEFAULT NULL,
  "shares" NUMERIC(20,4) DEFAULT NULL,
  "price_per_share" NUMERIC(20,4) DEFAULT NULL,
  "acquired_disposed_code" CHAR(1) DEFAULT NULL,
  "shares_owned_following" NUMERIC(20,4) DEFAULT NULL,
  "value_owned_following" NUMERIC(20,4) DEFAULT NULL,
  "direct_or_indirect_ownership" CHAR(1) DEFAULT NULL,
  "nature_of_ownership" VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY ("accession_number", "id")
)`,

		`CREATE TABLE IF NOT EXISTS "${t.derivativeTransactions}" (
  "accession_number" VARCHAR(30) NOT NULL,
  "id" VARCHAR(20) NOT NULL,
  "issuer_cik" VARCHAR(20) DEFAULT NULL,
  "security_title" VARCHAR(255) DEFAULT NULL,
  "conversion_or_exercise_price" NUMERIC(20,4) DEFAULT NULL,
  "transaction_date" DATE DEFAULT NULL,
  "deemed_execution_date" DATE DEFAULT NULL,
  "transaction_form_type" VARCHAR(10) DEFAULT NULL,
  "transaction_code" VARCHAR(10) DEFAULT NULL,
  "equity_swap_involved" BOOLEAN DEFAULT FALSE,
  "transaction_timeliness" VARCHAR(50) DEFAULT NULL,
  "shares" NUMERIC(20,4) DEFAULT NULL,
  "price_per_share" NUMERIC(20,4) DEFAULT NULL,
  "acquired_disposed_code" CHAR(1) DEFAULT NULL,
  "exercise_date" DATE DEFAULT NULL,
  "expiration_date" DATE DEFAULT NULL,
  "underlying_security_title" VARCHAR(255) DEFAULT NULL,
  "underlying_security_shares" NUMERIC(20,4) DEFAULT NULL,
  "underlying_security_value" NUMERIC(20,4) DEFAULT NULL,
  "shares_owned_following" NUMERIC(20,4) DEFAULT NULL,
  "value_owned_following" NUMERIC(20,4) DEFAULT NULL,
  "direct_or_indirect_ownership" CHAR(1) DEFAULT NULL,
  "nature_of_ownership" VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY ("accession_number", "id")
)`,

		`CREATE TABLE IF NOT EXISTS "${t.nonDerivativeHoldings}" (
  "accession_number" VARCHAR(30) NOT NULL,
  "id" VARCHAR(20) NOT NULL,
  "issuer_cik" VARCHAR(20) DEFAULT NULL,
  "security_title" VARCHAR(255) DEFAULT NULL,
  "shares_owned_following" NUMERIC(20,4) DEFAULT NULL,
  "value_owned_following" NUMERIC(20,4) DEFAULT NULL,
  "direct_or_indirect_ownership" CHAR(1) DEFAULT NULL,
  "nature_of_ownership" VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY ("accession_number", "id")
)`,

		`CREATE TABLE IF NOT EXISTS "${t.derivativeHoldings}" (
  "accession_number" VARCHAR(30) NOT NULL,
  "id" VARCHAR(20) NOT NULL,
  "issuer_cik" VARCHAR(20) DEFAULT NULL,
  "security_title" VARCHAR(255) DEFAULT NULL,
  "conversion_or_exercise_price" NUMERIC(20,4) DEFAULT NULL,
  "exercise_date" DATE DEFAULT NULL,
  "expiration_date" DATE DEFAULT NULL,
  "underlying_security_title" VARCHAR(255) DEFAULT NULL,
  "underlying_security_shares" NUMERIC(20,4) DEFAULT NULL,
  "underlying_security_value" NUMERIC(20,4) DEFAULT NULL,
  "shares_owned_following" NUMERIC(20,4) DEFAULT NULL,
  "value_owned_following" NUMERIC(20,4) DEFAULT NULL,
  "direct_or_indirect_ownership" CHAR(1) DEFAULT NULL,
  "nature_of_ownership" VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY ("accession_number", "id")
)`,

		`CREATE TABLE IF NOT EXISTS "${t.footnotes}" (
  "accession_number" VARCHAR(30) NOT NULL,
  "footnote_id" VARCHAR(10) NOT NULL,
  "footnote_text" TEXT DEFAULT NULL,
  PRIMARY KEY ("accession_number", "footnote_id")
)`,

		`CREATE TABLE IF NOT EXISTS "${t.signatures}" (
  "accession_number" VARCHAR(30) NOT NULL,
  "signature_name" VARCHAR(255) NOT NULL,
  "signature_date" VARCHAR(20) DEFAULT NULL,
  PRIMARY KEY ("accession_number", "signature_name")
)`,
	];
}

// ─── Database operations ──────────────────────────────────────────────────────

export async function ensureTables(
	client: ClientBase,
	tables: TableNames,
): Promise<void> {
	const statements = getCreateTablesSql(tables);
	for (const sql of statements) {
		await client.query(sql);
	}
}

function dateOrNull(val: unknown): string | null {
	if (typeof val === 'string' && val.length > 0) return val;
	return null;
}

function boolVal(val: unknown): boolean {
	return Boolean(val);
}

export async function upsertForm4Filing(
	client: ClientBase,
	filing: Form4Filing,
	tables: TableNames,
): Promise<UpsertResult> {
	const result: UpsertResult = {
		accessionNumber: filing.filing.accessionNumber,
		issuersUpserted: 0,
		ownersUpserted: 0,
		filingOwnersUpserted: 0,
		nonDerivativeTransactions: 0,
		derivativeTransactions: 0,
		nonDerivativeHoldings: 0,
		derivativeHoldings: 0,
		footnotes: 0,
		signatures: 0,
	};

	await client.query('BEGIN');
	try {
		// 1. Upsert issuers
		const issuerSql = buildUpsertSql(
			tables.issuers,
			['cik', 'name', 'trading_symbol', 'foreign_trading_symbol'],
			['cik'],
		);
		for (const issuer of Object.values(filing.issuers)) {
			await client.query(issuerSql, [
				issuer.cik,
				issuer.name,
				issuer.tradingSymbol,
				issuer.foreignTradingSymbol,
			]);
			result.issuersUpserted++;
		}

		// 2. Upsert reporting owners
		const ownerSql = buildUpsertSql(
			tables.reportingOwners,
			[
				'cik',
				'name',
				'street1',
				'street2',
				'city',
				'state',
				'zip_code',
				'non_us_address',
				'state_description',
			],
			['cik'],
		);
		for (const owner of Object.values(filing.reportingOwners)) {
			await client.query(ownerSql, [
				owner.cik,
				owner.name,
				owner.address.street1,
				owner.address.street2,
				owner.address.city,
				owner.address.state,
				owner.address.zipCode,
				boolVal(owner.address.nonUSAddress),
				owner.address.stateDescription,
			]);
			result.ownersUpserted++;
		}

		// 3. Upsert filing
		const filingSql = buildUpsertSql(
			tables.filings,
			[
				'accession_number',
				'period_of_report',
				'document_type',
				'schema_version',
				'not_subject_to_section16',
				'aff10b5_one',
				'source_url',
				'xml_url',
				'index_url',
				'issuer_cik',
			],
			['accession_number'],
		);
		await client.query(filingSql, [
			filing.filing.accessionNumber,
			dateOrNull(filing.filing.periodOfReport),
			filing.filing.documentType,
			filing.filing.schemaVersion,
			boolVal(filing.filing.notSubjectToSection16),
			boolVal(filing.filing.aff10b5One),
			filing.filing.sourceUrl,
			filing.filing.xmlUrl,
			filing.filing.indexUrl,
			filing.filing.issuerCik,
		]);

		// 4. Upsert filing-owner relationships
		const filingOwnerSql = buildUpsertSql(
			tables.filingOwners,
			[
				'accession_number',
				'owner_cik',
				'is_director',
				'is_officer',
				'is_ten_percent_owner',
				'is_other',
				'officer_title',
				'other_text',
			],
			['accession_number', 'owner_cik'],
		);
		for (const ownerCik of filing.filing.reportingOwnerCiks) {
			const owner = filing.reportingOwners[ownerCik];
			if (!owner) continue;
			await client.query(filingOwnerSql, [
				filing.filing.accessionNumber,
				ownerCik,
				boolVal(owner.relationship.isDirector),
				boolVal(owner.relationship.isOfficer),
				boolVal(owner.relationship.isTenPercentOwner),
				boolVal(owner.relationship.isOther),
				owner.relationship.officerTitle,
				owner.relationship.otherText,
			]);
			result.filingOwnersUpserted++;
		}

		// 5. Upsert non-derivative transactions
		const ndtSql = buildUpsertSql(
			tables.nonDerivativeTransactions,
			[
				'accession_number',
				'id',
				'issuer_cik',
				'security_title',
				'transaction_date',
				'deemed_execution_date',
				'transaction_form_type',
				'transaction_code',
				'equity_swap_involved',
				'transaction_timeliness',
				'shares',
				'price_per_share',
				'acquired_disposed_code',
				'shares_owned_following',
				'value_owned_following',
				'direct_or_indirect_ownership',
				'nature_of_ownership',
			],
			['accession_number', 'id'],
		);
		for (const tx of filing.nonDerivativeTransactions) {
			await client.query(ndtSql, [
				filing.filing.accessionNumber,
				tx.id,
				tx.issuerCik,
				tx.securityTitle,
				dateOrNull(tx.transactionDate),
				dateOrNull(tx.deemedExecutionDate),
				tx.transactionCoding?.formType ?? null,
				tx.transactionCoding?.transactionCode ?? null,
				boolVal(tx.transactionCoding?.equitySwapInvolved),
				tx.transactionTimeliness,
				tx.transactionAmounts.shares,
				tx.transactionAmounts.pricePerShare,
				tx.transactionAmounts.acquiredDisposedCode,
				tx.postTransactionAmounts.sharesOwnedFollowingTransaction,
				tx.postTransactionAmounts.valueOwnedFollowingTransaction,
				tx.ownershipNature.directOrIndirectOwnership,
				tx.ownershipNature.natureOfOwnership,
			]);
			result.nonDerivativeTransactions++;
		}

		// 6. Upsert derivative transactions
		const dtSql = buildUpsertSql(
			tables.derivativeTransactions,
			[
				'accession_number',
				'id',
				'issuer_cik',
				'security_title',
				'conversion_or_exercise_price',
				'transaction_date',
				'deemed_execution_date',
				'transaction_form_type',
				'transaction_code',
				'equity_swap_involved',
				'transaction_timeliness',
				'shares',
				'price_per_share',
				'acquired_disposed_code',
				'exercise_date',
				'expiration_date',
				'underlying_security_title',
				'underlying_security_shares',
				'underlying_security_value',
				'shares_owned_following',
				'value_owned_following',
				'direct_or_indirect_ownership',
				'nature_of_ownership',
			],
			['accession_number', 'id'],
		);
		for (const tx of filing.derivativeTransactions) {
			await client.query(dtSql, [
				filing.filing.accessionNumber,
				tx.id,
				tx.issuerCik,
				tx.securityTitle,
				tx.conversionOrExercisePrice,
				dateOrNull(tx.transactionDate),
				dateOrNull(tx.deemedExecutionDate),
				tx.transactionCoding?.formType ?? null,
				tx.transactionCoding?.transactionCode ?? null,
				boolVal(tx.transactionCoding?.equitySwapInvolved),
				tx.transactionTimeliness,
				tx.transactionAmounts.shares,
				tx.transactionAmounts.pricePerShare,
				tx.transactionAmounts.acquiredDisposedCode,
				dateOrNull(tx.exerciseDateOrExpiration.exerciseDate),
				dateOrNull(tx.exerciseDateOrExpiration.expirationDate),
				tx.underlyingSecurity.underlyingSecurityTitle,
				tx.underlyingSecurity.underlyingSecurityShares,
				tx.underlyingSecurity.underlyingSecurityValue,
				tx.postTransactionAmounts.sharesOwnedFollowingTransaction,
				tx.postTransactionAmounts.valueOwnedFollowingTransaction,
				tx.ownershipNature.directOrIndirectOwnership,
				tx.ownershipNature.natureOfOwnership,
			]);
			result.derivativeTransactions++;
		}

		// 7. Upsert non-derivative holdings
		const ndhSql = buildUpsertSql(
			tables.nonDerivativeHoldings,
			[
				'accession_number',
				'id',
				'issuer_cik',
				'security_title',
				'shares_owned_following',
				'value_owned_following',
				'direct_or_indirect_ownership',
				'nature_of_ownership',
			],
			['accession_number', 'id'],
		);
		for (const h of filing.nonDerivativeHoldings) {
			await client.query(ndhSql, [
				filing.filing.accessionNumber,
				h.id,
				h.issuerCik,
				h.securityTitle,
				h.postTransactionAmounts.sharesOwnedFollowingTransaction,
				h.postTransactionAmounts.valueOwnedFollowingTransaction,
				h.ownershipNature.directOrIndirectOwnership,
				h.ownershipNature.natureOfOwnership,
			]);
			result.nonDerivativeHoldings++;
		}

		// 8. Upsert derivative holdings
		const dhSql = buildUpsertSql(
			tables.derivativeHoldings,
			[
				'accession_number',
				'id',
				'issuer_cik',
				'security_title',
				'conversion_or_exercise_price',
				'exercise_date',
				'expiration_date',
				'underlying_security_title',
				'underlying_security_shares',
				'underlying_security_value',
				'shares_owned_following',
				'value_owned_following',
				'direct_or_indirect_ownership',
				'nature_of_ownership',
			],
			['accession_number', 'id'],
		);
		for (const h of filing.derivativeHoldings) {
			await client.query(dhSql, [
				filing.filing.accessionNumber,
				h.id,
				h.issuerCik,
				h.securityTitle,
				h.conversionOrExercisePrice,
				dateOrNull(h.exerciseDateOrExpiration.exerciseDate),
				dateOrNull(h.exerciseDateOrExpiration.expirationDate),
				h.underlyingSecurity.underlyingSecurityTitle,
				h.underlyingSecurity.underlyingSecurityShares,
				h.underlyingSecurity.underlyingSecurityValue,
				h.postTransactionAmounts.sharesOwnedFollowingTransaction,
				h.postTransactionAmounts.valueOwnedFollowingTransaction,
				h.ownershipNature.directOrIndirectOwnership,
				h.ownershipNature.natureOfOwnership,
			]);
			result.derivativeHoldings++;
		}

		// 9. Upsert footnotes
		const footnoteSql = buildUpsertSql(
			tables.footnotes,
			['accession_number', 'footnote_id', 'footnote_text'],
			['accession_number', 'footnote_id'],
		);
		for (const [id, text] of Object.entries(filing.footnotes)) {
			await client.query(footnoteSql, [
				filing.filing.accessionNumber,
				id,
				text,
			]);
			result.footnotes++;
		}

		// 10. Upsert signatures
		const signatureSql = buildUpsertSql(
			tables.signatures,
			['accession_number', 'signature_name', 'signature_date'],
			['accession_number', 'signature_name'],
		);
		for (const sig of filing.signatures) {
			await client.query(signatureSql, [
				filing.filing.accessionNumber,
				sig.signatureName,
				sig.signatureDate,
			]);
			result.signatures++;
		}

		await client.query('COMMIT');
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	}

	return result;
}

// ─── Connection helpers ───────────────────────────────────────────────────────

export function buildClientOptions(config: PostgresConfig): {
	host: string;
	port: number;
	database: string;
	user: string;
	password: string;
	ssl?: { rejectUnauthorized: boolean };
} {
	const opts: {
		host: string;
		port: number;
		database: string;
		user: string;
		password: string;
		ssl?: { rejectUnauthorized: boolean };
	} = {
		host: config.host,
		port: config.port,
		database: config.database,
		user: config.user,
		password: config.password,
	};

	if (config.ssl === 'require') {
		opts.ssl = { rejectUnauthorized: false };
	}

	return opts;
}
