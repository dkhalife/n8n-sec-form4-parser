import {
	getTableNames,
	buildUpsertSql,
	getCreateTablesSql,
	upsertForm4Filing,
	ensureTables,
} from '../nodes/SecForm4MariadbInserter/mariadbInserter.js';
import type { Form4Filing } from '../nodes/SecForm4Parser/form4Parser.js';
import type { Connection } from 'mysql2/promise';

// ─── Pure function tests ──────────────────────────────────────────────────────

describe('getTableNames', () => {
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

	it('works with empty prefix', () => {
		const names = getTableNames('');
		expect(names.issuers).toBe('issuers');
		expect(names.filings).toBe('filings');
	});

	it('works with custom prefix', () => {
		const names = getTableNames('my_app_');
		expect(names.issuers).toBe('my_app_issuers');
	});
});

describe('buildUpsertSql', () => {
	it('generates INSERT ... ON DUPLICATE KEY UPDATE for mixed columns', () => {
		const sql = buildUpsertSql('test_table', ['id', 'name', 'value'], ['id']);
		expect(sql).toBe(
			'INSERT INTO `test_table` (`id`, `name`, `value`) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `value` = VALUES(`value`)',
		);
	});

	it('generates INSERT IGNORE when all columns are keys', () => {
		const sql = buildUpsertSql('junction', ['a_id', 'b_id'], ['a_id', 'b_id']);
		expect(sql).toBe('INSERT IGNORE INTO `junction` (`a_id`, `b_id`) VALUES (?, ?)');
	});

	it('handles composite primary key with non-key columns', () => {
		const sql = buildUpsertSql(
			'filing_owners',
			['accession_number', 'owner_cik', 'is_director'],
			['accession_number', 'owner_cik'],
		);
		expect(sql).toContain('ON DUPLICATE KEY UPDATE');
		expect(sql).toContain('`is_director` = VALUES(`is_director`)');
		expect(sql).not.toContain('`accession_number` = VALUES');
		expect(sql).not.toContain('`owner_cik` = VALUES');
	});
});

describe('getCreateTablesSql', () => {
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

	it('all statements use InnoDB engine and utf8mb4', () => {
		const statements = getCreateTablesSql(tables);
		for (const sql of statements) {
			expect(sql).toContain('ENGINE=InnoDB');
			expect(sql).toContain('DEFAULT CHARSET=utf8mb4');
		}
	});

	it('uses the provided table prefix', () => {
		const statements = getCreateTablesSql(tables);
		for (const sql of statements) {
			expect(sql).toContain('`t_');
		}
	});

	it('issuers table has correct primary key', () => {
		const statements = getCreateTablesSql(tables);
		const issuerSql = statements[0];
		expect(issuerSql).toContain('`t_issuers`');
		expect(issuerSql).toContain('PRIMARY KEY (`cik`)');
	});

	it('filings table has accession_number as primary key', () => {
		const statements = getCreateTablesSql(tables);
		const filingSql = statements[2];
		expect(filingSql).toContain('`t_filings`');
		expect(filingSql).toContain('PRIMARY KEY (`accession_number`)');
	});

	it('filing_owners table has composite primary key', () => {
		const statements = getCreateTablesSql(tables);
		const foSql = statements[3];
		expect(foSql).toContain('PRIMARY KEY (`accession_number`, `owner_cik`)');
	});

	it('non_derivative_transactions table has composite primary key', () => {
		const statements = getCreateTablesSql(tables);
		const ndtSql = statements[4];
		expect(ndtSql).toContain('PRIMARY KEY (`accession_number`, `id`)');
		expect(ndtSql).toContain('`shares` DECIMAL(20,4)');
		expect(ndtSql).toContain('`price_per_share` DECIMAL(20,4)');
	});

	it('derivative_transactions table includes exercise and underlying fields', () => {
		const statements = getCreateTablesSql(tables);
		const dtSql = statements[5];
		expect(dtSql).toContain('`conversion_or_exercise_price`');
		expect(dtSql).toContain('`exercise_date`');
		expect(dtSql).toContain('`expiration_date`');
		expect(dtSql).toContain('`underlying_security_title`');
		expect(dtSql).toContain('`underlying_security_shares`');
	});
});

// ─── Mock-based integration tests ─────────────────────────────────────────────

function createMockConnection(): Connection {
	const executedQueries: { sql: string; params?: unknown[] }[] = [];
	const mockConn = {
		execute: jest.fn(async (sql: string, params?: unknown[]) => {
			executedQueries.push({ sql, params });
			return [[], []];
		}),
		beginTransaction: jest.fn(async () => {}),
		commit: jest.fn(async () => {}),
		rollback: jest.fn(async () => {}),
		end: jest.fn(async () => {}),
		_queries: executedQueries,
	};
	return mockConn as unknown as Connection;
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

describe('ensureTables', () => {
	it('executes all CREATE TABLE statements', async () => {
		const conn = createMockConnection();
		const tables = getTableNames('sec_');
		await ensureTables(conn, tables);
		expect(conn.execute).toHaveBeenCalledTimes(10);
	});
});

describe('upsertForm4Filing', () => {
	it('returns correct result counts for a minimal filing', async () => {
		const conn = createMockConnection();
		const tables = getTableNames('sec_');
		const filing = createMinimalFiling();

		const result = await upsertForm4Filing(conn, filing, tables);

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

	it('begins and commits a transaction', async () => {
		const conn = createMockConnection();
		const tables = getTableNames('sec_');
		const filing = createMinimalFiling();

		await upsertForm4Filing(conn, filing, tables);

		expect(conn.beginTransaction).toHaveBeenCalledTimes(1);
		expect(conn.commit).toHaveBeenCalledTimes(1);
		expect(conn.rollback).not.toHaveBeenCalled();
	});

	it('rolls back on error', async () => {
		const conn = createMockConnection();
		let callCount = 0;
		(conn.execute as jest.Mock).mockImplementation(async () => {
			callCount++;
			// Fail on the 4th execute (filing_owners insert)
			if (callCount === 4) throw new Error('DB error');
			return [[], []];
		});

		const tables = getTableNames('sec_');
		const filing = createMinimalFiling();

		await expect(upsertForm4Filing(conn, filing, tables)).rejects.toThrow('DB error');
		expect(conn.rollback).toHaveBeenCalledTimes(1);
		expect(conn.commit).not.toHaveBeenCalled();
	});

	it('passes correct issuer parameters', async () => {
		const conn = createMockConnection();
		const tables = getTableNames('sec_');
		const filing = createMinimalFiling();

		await upsertForm4Filing(conn, filing, tables);

		// First execute after beginTransaction is issuer upsert
		const issuerCall = (conn.execute as jest.Mock).mock.calls[0];
		expect(issuerCall[0]).toContain('`sec_issuers`');
		expect(issuerCall[1]).toEqual([
			'0001527541',
			'TEST ISSUER INC',
			'TSTI',
			null,
		]);
	});

	it('passes correct transaction parameters', async () => {
		const conn = createMockConnection();
		const tables = getTableNames('sec_');
		const filing = createMinimalFiling();

		await upsertForm4Filing(conn, filing, tables);

		// Find the non-derivative transaction execute call
		const calls = (conn.execute as jest.Mock).mock.calls;
		const ndtCall = calls.find(
			(c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('`sec_non_derivative_transactions`'),
		);
		expect(ndtCall).toBeDefined();
		const params = ndtCall![1] as unknown[];
		expect(params[0]).toBe('0001104659-26-038038'); // accession_number
		expect(params[1]).toBe('ndt-0'); // id
		expect(params[2]).toBe('0001527541'); // issuer_cik
		expect(params[3]).toBe('Common Stock'); // security_title
		expect(params[4]).toBe('2026-03-27'); // transaction_date
		expect(params[10]).toBe(1000); // shares
		expect(params[11]).toBe(15.5); // price_per_share
		expect(params[12]).toBe('D'); // acquired_disposed_code
	});

	it('handles filing with no transactions or holdings', async () => {
		const conn = createMockConnection();
		const tables = getTableNames('sec_');
		const filing = createMinimalFiling();
		filing.nonDerivativeTransactions = [];
		filing.footnotes = {};
		filing.signatures = [];

		const result = await upsertForm4Filing(conn, filing, tables);

		expect(result.nonDerivativeTransactions).toBe(0);
		expect(result.footnotes).toBe(0);
		expect(result.signatures).toBe(0);
	});
});
