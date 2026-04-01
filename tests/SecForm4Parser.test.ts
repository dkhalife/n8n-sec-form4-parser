import * as https from 'https';
import * as http from 'http';
import {
	fetchAndParseForm4,
	findXmlUrlFromIndex,
	formatAccessionNumber,
	extractAccessionFromUrl,
	parseForm4Xml,
} from '../nodes/SecForm4Parser/form4Parser';

const INDEX_URL =
	'https://www.sec.gov/Archives/edgar/data/1527541/000110465926038038/0001104659-26-038038-index.htm';

const USER_AGENT = 'n8n-sec-form4-parser/1.0 (test@example.com)';

// Helper: fetch a URL using built-in https/http
function fetchRaw(url: string, headers: Record<string, string>): Promise<string> {
	return new Promise((resolve, reject) => {
		const lib = url.startsWith('https') ? https : http;
		const req = lib.get(url, { headers }, (res) => {
			if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
				resolve(fetchRaw(res.headers.location, headers));
				return;
			}
			const chunks: Buffer[] = [];
			res.on('data', (c: Buffer) => chunks.push(c));
			res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
			res.on('error', reject);
		});
		req.on('error', reject);
	});
}

// ─── Unit tests (no network) ──────────────────────────────────────────────────

describe('formatAccessionNumber', () => {
	it('formats 18-digit raw accession number', () => {
		expect(formatAccessionNumber('000110465926038038')).toBe('0001104659-26-038038');
	});

	it('leaves already-formatted number unchanged', () => {
		expect(formatAccessionNumber('0001104659-26-038038')).toBe('0001104659-26-038038');
	});
});

describe('extractAccessionFromUrl', () => {
	it('extracts and formats accession number from index URL', () => {
		expect(extractAccessionFromUrl(INDEX_URL)).toBe('0001104659-26-038038');
	});

	it('extracts accession from XML URL', () => {
		const xmlUrl =
			'https://www.sec.gov/Archives/edgar/data/1527541/000110465926038038/tm2610808-1_4seq1.xml';
		expect(extractAccessionFromUrl(xmlUrl)).toBe('0001104659-26-038038');
	});
});

describe('findXmlUrlFromIndex', () => {
	it('finds an XML link in mock HTML', () => {
		const html = `
      <table>
        <tr><td><a href="/Archives/edgar/data/1352851/000110465926038038/tm2610808-1_4seq1.xml">tm2610808-1_4seq1.xml</a></td></tr>
      </table>
    `;
		const result = findXmlUrlFromIndex(html, 'https://www.sec.gov/test');
		expect(result).toBe(
			'https://www.sec.gov/Archives/edgar/data/1352851/000110465926038038/tm2610808-1_4seq1.xml',
		);
	});

	it('ignores XSL viewer links', () => {
		const html = `
      <a href="/Archives/edgar/data/123/000123/viewer.xsl.xml">viewer</a>
      <a href="/Archives/edgar/data/123/000123/real_form4.xml">form4</a>
    `;
		const result = findXmlUrlFromIndex(html, 'https://www.sec.gov');
		expect(result).toBe('https://www.sec.gov/Archives/edgar/data/123/000123/real_form4.xml');
	});

	it('returns null when no XML link found', () => {
		const html = '<a href="/some/other/file.htm">file</a>';
		const result = findXmlUrlFromIndex(html, 'https://www.sec.gov');
		expect(result).toBeNull();
	});
});

describe('parseForm4Xml with minimal XML', () => {
	const minimalXml = `<?xml version="1.0"?>
<ownershipDocument>
  <schemaVersion>X0609</schemaVersion>
  <documentType>4</documentType>
  <periodOfReport>2026-03-27</periodOfReport>
  <notSubjectToSection16>0</notSubjectToSection16>
  <aff10b5One>0</aff10b5One>
  <issuer>
    <issuerCik>0001527541</issuerCik>
    <issuerName>TEST ISSUER INC</issuerName>
    <issuerTradingSymbol>TSTI</issuerTradingSymbol>
  </issuer>
  <reportingOwner>
    <reportingOwnerId>
      <rptOwnerCik>0000012345</rptOwnerCik>
      <rptOwnerName>JOHN DOE</rptOwnerName>
    </reportingOwnerId>
    <reportingOwnerAddress>
      <rptOwnerStreet1>123 MAIN ST</rptOwnerStreet1>
      <rptOwnerCity>ANYTOWN</rptOwnerCity>
      <rptOwnerState>VA</rptOwnerState>
      <rptOwnerZipCode>12345</rptOwnerZipCode>
    </reportingOwnerAddress>
    <reportingOwnerRelationship>
      <isDirector>1</isDirector>
      <isOfficer>0</isOfficer>
      <isTenPercentOwner>0</isTenPercentOwner>
      <isOther>0</isOther>
    </reportingOwnerRelationship>
  </reportingOwner>
  <nonDerivativeTable>
    <nonDerivativeTransaction>
      <securityTitle><value>Common Stock</value></securityTitle>
      <transactionDate><value>2026-03-27</value></transactionDate>
      <transactionCoding>
        <transactionFormType>4</transactionFormType>
        <transactionCode>S</transactionCode>
        <equitySwapInvolved>0</equitySwapInvolved>
      </transactionCoding>
      <transactionAmounts>
        <transactionShares><value>1000</value></transactionShares>
        <transactionPricePerShare><value>15.50</value></transactionPricePerShare>
        <transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode>
      </transactionAmounts>
      <postTransactionAmounts>
        <sharesOwnedFollowingTransaction><value>50000</value></sharesOwnedFollowingTransaction>
      </postTransactionAmounts>
      <ownershipNature>
        <directOrIndirectOwnership><value>D</value></directOrIndirectOwnership>
      </ownershipNature>
    </nonDerivativeTransaction>
  </nonDerivativeTable>
  <footnotes>
    <footnote id="F1">This is footnote 1.</footnote>
  </footnotes>
  <ownerSignature>
    <signatureName>JOHN DOE</signatureName>
    <signatureDate>03/30/2026</signatureDate>
  </ownerSignature>
</ownershipDocument>`;

	const sourceUrl = 'https://www.sec.gov/test-index.htm';
	const xmlUrl = 'https://www.sec.gov/Archives/edgar/data/1527541/000110465926038038/form4.xml';

	it('parses issuer correctly', () => {
		const result = parseForm4Xml(minimalXml, sourceUrl, xmlUrl, sourceUrl);
		expect(result.issuers['0001527541']).toBeDefined();
		expect(result.issuers['0001527541'].name).toBe('TEST ISSUER INC');
		expect(result.issuers['0001527541'].tradingSymbol).toBe('TSTI');
	});

	it('parses reporting owner correctly', () => {
		const result = parseForm4Xml(minimalXml, sourceUrl, xmlUrl, sourceUrl);
		const owner = result.reportingOwners['0000012345'];
		expect(owner).toBeDefined();
		expect(owner.name).toBe('JOHN DOE');
		expect(owner.relationship.isDirector).toBe(true);
		expect(owner.relationship.isOfficer).toBe(false);
		expect(owner.address.state).toBe('VA');
	});

	it('parses non-derivative transaction', () => {
		const result = parseForm4Xml(minimalXml, sourceUrl, xmlUrl, sourceUrl);
		expect(result.nonDerivativeTransactions).toHaveLength(1);
		const tx = result.nonDerivativeTransactions[0];
		expect(tx.id).toBe('ndt-0');
		expect(tx.securityTitle).toBe('Common Stock');
		expect(tx.transactionDate).toBe('2026-03-27');
		expect(tx.transactionAmounts.shares).toBe(1000);
		expect(tx.transactionAmounts.pricePerShare).toBe(15.5);
		expect(tx.transactionAmounts.acquiredDisposedCode).toBe('D');
		expect(tx.postTransactionAmounts.sharesOwnedFollowingTransaction).toBe(50000);
		expect(tx.ownershipNature.directOrIndirectOwnership).toBe('D');
	});

	it('parses footnotes', () => {
		const result = parseForm4Xml(minimalXml, sourceUrl, xmlUrl, sourceUrl);
		expect(result.footnotes['F1']).toBe('This is footnote 1.');
	});

	it('parses signatures', () => {
		const result = parseForm4Xml(minimalXml, sourceUrl, xmlUrl, sourceUrl);
		expect(result.signatures).toHaveLength(1);
		expect(result.signatures[0].signatureName).toBe('JOHN DOE');
		expect(result.signatures[0].signatureDate).toBe('03/30/2026');
	});

	it('sets filing metadata', () => {
		const result = parseForm4Xml(minimalXml, sourceUrl, xmlUrl, sourceUrl);
		expect(result.filing.documentType).toBe('4');
		expect(result.filing.schemaVersion).toBe('X0609');
		expect(result.filing.periodOfReport).toBe('2026-03-27');
		expect(result.filing.notSubjectToSection16).toBe(false);
		expect(result.filing.issuerCik).toBe('0001527541');
		expect(result.filing.reportingOwnerCiks).toContain('0000012345');
	});
});

// ─── Integration tests (real EDGAR network calls) ─────────────────────────────

describe('fetchAndParseForm4 integration (EDGAR)', () => {
	let filing: Awaited<ReturnType<typeof fetchAndParseForm4>>;

	beforeAll(async () => {
		// Verify EDGAR is reachable before running integration tests
		try {
			await fetchRaw('https://www.sec.gov', { 'User-Agent': USER_AGENT });
		} catch {
			// EDGAR not reachable — integration tests will be skipped (filing remains null)
			return;
		}
		filing = await fetchAndParseForm4(INDEX_URL, USER_AGENT);
	});

	it('returns a defined filing', () => {
		if (!filing) return;
		expect(filing).toBeDefined();
		expect(filing.filing).toBeDefined();
	});

	it('filing metadata is correct', () => {
		if (!filing) return;
		expect(filing.filing.sourceUrl).toBe(INDEX_URL);
		expect(filing.filing.indexUrl).toBe(INDEX_URL);
		expect(filing.filing.xmlUrl).toMatch(/\.xml$/);
		expect(filing.filing.documentType).toBe('4');
		expect(filing.filing.accessionNumber).toBe('0001104659-26-038038');
	});

	it('issuer is Wheeler Real Estate Investment Trust (CIK 0001527541)', () => {
		if (!filing) return;
		const issuerCik = filing.filing.issuerCik;
		const issuer = filing.issuers[issuerCik];
		expect(issuer).toBeDefined();
		// CIK should be 0001527541
		expect(issuerCik).toBe('0001527541');
		// Name should include "Wheeler" or "WHEELER"
		expect(issuer.name.toUpperCase()).toContain('WHEELER');
	});

	it('reporting owners are present and keyed by CIK', () => {
		if (!filing) return;
		expect(Object.keys(filing.reportingOwners).length).toBeGreaterThan(0);
		for (const cik of filing.filing.reportingOwnerCiks) {
			expect(filing.reportingOwners[cik]).toBeDefined();
			expect(filing.reportingOwners[cik].cik).toBe(cik);
		}
	});

	it('each reporting owner has required fields', () => {
		if (!filing) return;
		for (const owner of Object.values(filing.reportingOwners)) {
			expect(typeof owner.name).toBe('string');
			expect(typeof owner.relationship.isDirector).toBe('boolean');
			expect(typeof owner.relationship.isOfficer).toBe('boolean');
			expect(typeof owner.relationship.isTenPercentOwner).toBe('boolean');
		}
	});

	it('non-derivative transactions are parsed with correct structure', () => {
		if (!filing) return;
		for (const [i, tx] of filing.nonDerivativeTransactions.entries()) {
			expect(tx.id).toBe(`ndt-${i}`);
			expect(tx.issuerCik).toBe(filing.filing.issuerCik);
			expect(Array.isArray(tx.reportingOwnerCiks)).toBe(true);
			expect(Array.isArray(tx.securityTitleFootnotes)).toBe(true);
			expect(Array.isArray(tx.transactionAmounts.sharesFootnotes)).toBe(true);
		}
	});

	it('derivative transactions have correct structure', () => {
		if (!filing) return;
		for (const [i, tx] of filing.derivativeTransactions.entries()) {
			expect(tx.id).toBe(`dt-${i}`);
			expect(tx.issuerCik).toBe(filing.filing.issuerCik);
		}
	});

	it('footnotes are extracted and keyed by ID', () => {
		if (!filing) return;
		for (const [key, val] of Object.entries(filing.footnotes)) {
			expect(key).toMatch(/^F\d+$/);
			expect(typeof val).toBe('string');
		}
	});

	it('transaction counts are non-negative integers', () => {
		if (!filing) return;
		expect(filing.nonDerivativeTransactions.length).toBeGreaterThanOrEqual(0);
		expect(filing.derivativeTransactions.length).toBeGreaterThanOrEqual(0);
		expect(filing.nonDerivativeHoldings.length).toBeGreaterThanOrEqual(0);
		expect(filing.derivativeHoldings.length).toBeGreaterThanOrEqual(0);
	});

	it('signatures have name and date', () => {
		if (!filing) return;
		for (const sig of filing.signatures) {
			expect(typeof sig.signatureName).toBe('string');
			expect(typeof sig.signatureDate).toBe('string');
		}
	});
});
