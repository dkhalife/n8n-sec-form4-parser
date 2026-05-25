import {
	getTableNames,
	buildUpsertSql,
	getCreateTablesSql,
	upsertForm4Filing,
	ensureTables,
	buildClientOptions,
} from '../nodes/SecForm4PostgresInserter/postgresInserter.js';
import type { Form4Filing } from '../nodes/SecForm4Parser/form4Parser.js';
import type { ClientBase } from 'pg';

// ─── Pure function tests ──────────────────────────────────────────────────────

describe('postgres getTableNames', () => {
	it('returns table names with prefix', () => {
		const names = getTableNames('sec_');
		expect(names.issuers).toBe('sec_issuers');
		expect(names.reportingOwners).toBe('sec_reporting_owners');
		expect(names.filings).toBe('sec_filings');
		expect(names.filingOwners).toBe('sec_filing_owners');
		expect(names.nonDerivativeTransactions).toBe('sec_non_derivative_transactions');
		expect(names.derivativeTransactions).toBe('sec_derivative_transactions');
		expect(names.nonDerivativeHoldings).toBe('sec_non_derivative_holdings');
		expect(names.derivativeHoldings).toBe('sec_derivative_holdings');
		expect(names.footnotes).toBe('sec_footnotes');
		expect(names.signatures).toBe('sec_signatures');
	});
});

describe('postgres buildUpsertSql', () => {
	it('generates INSERT ... ON CONFLICT DO UPDATE for mixed columns', () => {
		const sql = buildUpsertSql('test_table', ['id', 'name', 'value'], ['id']);
		expect(sql).toBe(
			'INSERT INTO "test_table" ("id", "name", "value") VALUES ($1, $2, $3) ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "value" = EXCLUDED."value"',
		);
	});

	it('generates ON CONFLICT DO NOTHING when all columns are keys', () => {
		const sql = buildUpsertSql('junction', ['a_id', 'b_id'], ['a_id', 'b_id']);
		expect(sql).toBe(
			'INSERT INTO "junction" ("a_id", "b_id") VALUES ($1, $2) ON CONFLICT ("a_id", "b_id") DO NOTHING',
		);
	});

	it('handles composite primary key with non-key columns', () => {
		const sql = buildUpsertSql(
			'filing_owners',
			['accession_number', 'owner_cik', 'is_director'],
			['accession_number', 'owner_cik'],
		);
		expect(sql).toContain('ON CONFLICT ("accession_number", "owner_cik")');
		expect(sql).toContain('"is_director" = EXCLUDED."is_director"');
		expect(sql).not.toContain('"accession_number" = EXCLUDED');
		expect(sql).not.toContain('"owner_cik" = EXCLUDED');
	});

	it('uses numbered placeholders', () => {
		const sql = buildUpsertSql('t', ['a', 'b', 'c', 'd'], ['a']);
		expect(sql).toContain('VALUES ($1, $2, $3, $4)');
	});
});

describe('postgres getCreateTablesSql', () => {
	const tables = getTableNames('t_');

	it('returns 10 CREATE TABLE statements', () => {
		const statements = getCreateTablesSql(tables);
		expect(statements).toHaveLength(10);
	});

	it('all statements start with CREATE TABLE IF NOT EXISTS', () => {
		const statements = getCreateTablesSql(tables);
		for (const sql of statements) {
			expect(sql).toMatch(/^CREATE TABLE IF NOT EXISTS/);
		}
	});

	it('does not include MySQL-only clauses', () => {
		const statements = getCreateTablesSql(tables);
		for (const sql of statements) {
			expect(sql).not.toContain('ENGINE=InnoDB');
			expect(sql).not.toContain('utf8mb4');
			expect(sql).not.toContain('TINYINT');
			expect(sql).not.toMatch(/`/);
		}
	});

	it('uses BOOLEAN and NUMERIC types', () => {
		const statements = getCreateTablesSql(tables);
		const allSql = statements.join('\n');
		expect(allSql).toContain('BOOLEAN');
		expect(allSql).toContain('NUMERIC(20,4)');
	});

	it('uses the provided table prefix', () => {
		const statements = getCreateTablesSql(tables);
		for (const sql of statements) {
			expect(sql).toContain('"t_');
		}
	});

	it('issuers table has correct primary key', () => {
		const statements = getCreateTablesSql(tables);
		const issuerSql = statements[0];
		expect(issuerSql).toContain('"t_issuers"');
		expect(issuerSql).toContain('PRIMARY KEY ("cik")');
	});

	it('filing_owners table has composite primary key', () => {
		const statements = getCreateTablesSql(tables);
		const foSql = statements[3];
		expect(foSql).toContain('PRIMARY KEY ("accession_number", "owner_cik")');
	});
});

describe('buildClientOptions', () => {
	it('omits ssl when disabled', () => {
		const opts = buildClientOptions({
			host: 'h',
			port: 5432,
			database: 'd',
			user: 'u',
			password: 'p',
			ssl: 'disable',
		});
		expect(opts.ssl).toBeUndefined();
	});

	it('sets ssl when required', () => {
		const opts = buildClientOptions({
			host: 'h',
			port: 5432,
			database: 'd',
			user: 'u',
			password: 'p',
			ssl: 'require',
		});
		expect(opts.ssl).toEqual({ rejectUnauthorized: false });
	});

	it('defaults to no ssl when undefined', () => {
		const opts = buildClientOptions({
			host: 'h',
			port: 5432,
			database: 'd',
			user: 'u',
			password: 'p',
		});
		expect(opts.ssl).toBeUndefined();
	});
});

// ─── Mock-based integration tests ─────────────────────────────────────────────

function createMockClient(): ClientBase {
	const executedQueries: { sql: string; params?: unknown[] }[] = [];
	const mockClient = {
		query: jest.fn(async (sql: string, params?: unknown[]) => {
			executedQueries.push({ sql, params });
			return { rows: [], rowCount: 0 };
		}),
		_queries: executedQueries,
	};
	return mockClient as unknown as ClientBase;
}

function createMinimalFiling(): Form4Filing {
	return {
		filing: {
			accessionNumber: '0001104659-26-038038',
			periodOfReport: '2026-03-27',
			documentType: '4',
			schemaVersion: 'X0609',
			notSubjectToSection16: false,
			aff10b5One: false,
			sourceUrl: 'https://www.sec.gov/test-index.htm',
			xmlUrl: 'https://www.sec.gov/test.xml',
			indexUrl: 'https://www.sec.gov/test-index.htm',
			issuerCik: '0001527541',
			reportingOwnerCiks: ['0000012345'],
		},
		issuers: {
			'0001527541': {
				cik: '0001527541',
				name: 'TEST ISSUER INC',
				tradingSymbol: 'TSTI',
				foreignTradingSymbol: null,
			},
		},
		reportingOwners: {
			'0000012345': {
				cik: '0000012345',
				name: 'JOHN DOE',
				address: {
					street1: '123 MAIN ST',
					street2: null,
					city: 'ANYTOWN',
					state: 'VA',
					zipCode: '12345',
					nonUSAddress: false,
					stateDescription: null,
				},
				relationship: {
					isDirector: true,
					isOfficer: false,
					isTenPercentOwner: false,
					isOther: false,
					officerTitle: null,
					otherText: null,
				},
			},
		},
		nonDerivativeTransactions: [
			{
				id: 'ndt-0',
				issuerCik: '0001527541',
				reportingOwnerCiks: ['0000012345'],
				securityTitle: 'Common Stock',
				securityTitleFootnotes: [],
				transactionDate: '2026-03-27',
				transactionDateFootnotes: [],
				deemedExecutionDate: null,
				deemedExecutionDateFootnotes: [],
				transactionCoding: {
					formType: '4',
					transactionCode: 'S',
					equitySwapInvolved: false,
					transactionCodingFootnotes: [],
				},
				transactionTimeliness: null,
				transactionAmounts: {
					shares: 1000,
					sharesFootnotes: [],
					pricePerShare: 15.5,
					pricePerShareFootnotes: [],
					acquiredDisposedCode: 'D',
					acquiredDisposedCodeFootnotes: [],
				},
				postTransactionAmounts: {
					sharesOwnedFollowingTransaction: 50000,
					sharesOwnedFollowingTransactionFootnotes: [],
					valueOwnedFollowingTransaction: null,
					valueOwnedFollowingTransactionFootnotes: [],
				},
				ownershipNature: {
					directOrIndirectOwnership: 'D',
					directOrIndirectOwnershipFootnotes: [],
					natureOfOwnership: null,
					natureOfOwnershipFootnotes: [],
				},
			},
		],
		derivativeTransactions: [],
		nonDerivativeHoldings: [],
		derivativeHoldings: [],
		footnotes: { F1: 'This is footnote 1.' },
		signatures: [
			{
				signatureName: 'JOHN DOE',
				signatureDate: '03/30/2026',
			},
		],
	};
}

describe('postgres ensureTables', () => {
	it('executes all CREATE TABLE statements', async () => {
		const client = createMockClient();
		const tables = getTableNames('sec_');
		await ensureTables(client, tables);
		expect(client.query).toHaveBeenCalledTimes(10);
	});
});

describe('postgres upsertForm4Filing', () => {
	it('returns correct result counts for a minimal filing', async () => {
		const client = createMockClient();
		const tables = getTableNames('sec_');
		const filing = createMinimalFiling();

		const result = await upsertForm4Filing(client, filing, tables);

		expect(result.accessionNumber).toBe('0001104659-26-038038');
		expect(result.issuersUpserted).toBe(1);
		expect(result.ownersUpserted).toBe(1);
		expect(result.filingOwnersUpserted).toBe(1);
		expect(result.nonDerivativeTransactions).toBe(1);
		expect(result.derivativeTransactions).toBe(0);
		expect(result.nonDerivativeHoldings).toBe(0);
		expect(result.derivativeHoldings).toBe(0);
		expect(result.footnotes).toBe(1);
		expect(result.signatures).toBe(1);
	});

	it('issues BEGIN and COMMIT', async () => {
		const client = createMockClient();
		const tables = getTableNames('sec_');
		const filing = createMinimalFiling();

		await upsertForm4Filing(client, filing, tables);

		const calls = (client.query as jest.Mock).mock.calls.map((c) => c[0]);
		expect(calls[0]).toBe('BEGIN');
		expect(calls[calls.length - 1]).toBe('COMMIT');
		expect(calls).not.toContain('ROLLBACK');
	});

	it('issues ROLLBACK on error', async () => {
		const client = createMockClient();
		let callCount = 0;
		(client.query as jest.Mock).mockImplementation(async () => {
			callCount++;
			// Fail on the 5th query (BEGIN + issuer + owner + filing + filing_owner = 5th)
			if (callCount === 5) throw new Error('DB error');
			return { rows: [], rowCount: 0 };
		});

		const tables = getTableNames('sec_');
		const filing = createMinimalFiling();

		await expect(upsertForm4Filing(client, filing, tables)).rejects.toThrow(
			'DB error',
		);
		const calls = (client.query as jest.Mock).mock.calls.map((c) => c[0]);
		expect(calls).toContain('ROLLBACK');
		expect(calls).not.toContain('COMMIT');
	});

	it('passes correct issuer parameters', async () => {
		const client = createMockClient();
		const tables = getTableNames('sec_');
		const filing = createMinimalFiling();

		await upsertForm4Filing(client, filing, tables);

		// Second query (after BEGIN) is issuer upsert
		const issuerCall = (client.query as jest.Mock).mock.calls[1];
		expect(issuerCall[0]).toContain('"sec_issuers"');
		expect(issuerCall[1]).toEqual([
			'0001527541',
			'TEST ISSUER INC',
			'TSTI',
			null,
		]);
	});

	it('uses BOOLEAN values for boolean fields', async () => {
		const client = createMockClient();
		const tables = getTableNames('sec_');
		const filing = createMinimalFiling();

		await upsertForm4Filing(client, filing, tables);

		// Find filing_owners call (has is_director boolean)
		const calls = (client.query as jest.Mock).mock.calls;
		const foCall = calls.find(
			(c: unknown[]) =>
				typeof c[0] === 'string' &&
				(c[0] as string).includes('"sec_filing_owners"'),
		);
		expect(foCall).toBeDefined();
		const params = foCall![1] as unknown[];
		expect(params[2]).toBe(true); // is_director (boolean, not 1)
		expect(params[3]).toBe(false); // is_officer (boolean, not 0)
	});

	it('handles filing with no transactions or holdings', async () => {
		const client = createMockClient();
		const tables = getTableNames('sec_');
		const filing = createMinimalFiling();
		filing.nonDerivativeTransactions = [];
		filing.footnotes = {};
		filing.signatures = [];

		const result = await upsertForm4Filing(client, filing, tables);

		expect(result.nonDerivativeTransactions).toBe(0);
		expect(result.footnotes).toBe(0);
		expect(result.signatures).toBe(0);
	});
});
