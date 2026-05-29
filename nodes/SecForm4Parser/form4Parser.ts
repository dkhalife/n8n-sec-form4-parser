import { XMLParser } from 'fast-xml-parser';
import * as https from 'https';
import * as http from 'http';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface Form4Filing {
	filing: {
		accessionNumber: string;
		periodOfReport: string;
		documentType: string;
		schemaVersion: string;
		notSubjectToSection16: boolean;
		aff10b5One: boolean;
		sourceUrl: string;
		xmlUrl: string;
		indexUrl: string | null;
		issuerCik: string;
		reportingOwnerCiks: string[];
	};
	issuers: Record<string, Issuer>;
	reportingOwners: Record<string, ReportingOwner>;
	nonDerivativeTransactions: NonDerivativeTransaction[];
	derivativeTransactions: DerivativeTransaction[];
	nonDerivativeHoldings: NonDerivativeHolding[];
	derivativeHoldings: DerivativeHolding[];
	footnotes: Record<string, string>;
	signatures: Signature[];
}

export interface Issuer {
	cik: string;
	name: string;
	tradingSymbol: string | null;
	foreignTradingSymbol: string | null;
}

export interface ReportingOwner {
	cik: string;
	name: string;
	address: {
		street1: string | null;
		street2: string | null;
		city: string | null;
		state: string | null;
		zipCode: string | null;
		nonUSAddress: boolean;
		stateDescription: string | null;
	};
	relationship: {
		isDirector: boolean;
		isOfficer: boolean;
		isTenPercentOwner: boolean;
		isOther: boolean;
		officerTitle: string | null;
		otherText: string | null;
	};
}

export interface TransactionAmounts {
	shares: number | null;
	sharesFootnotes: string[];
	pricePerShare: number | null;
	pricePerShareFootnotes: string[];
	acquiredDisposedCode: 'A' | 'D' | null;
	acquiredDisposedCodeFootnotes: string[];
}

export interface PostTransactionAmounts {
	sharesOwnedFollowingTransaction: number | null;
	sharesOwnedFollowingTransactionFootnotes: string[];
	valueOwnedFollowingTransaction: number | null;
	valueOwnedFollowingTransactionFootnotes: string[];
}

export interface OwnershipNature {
	directOrIndirectOwnership: 'D' | 'I' | null;
	directOrIndirectOwnershipFootnotes: string[];
	natureOfOwnership: string | null;
	natureOfOwnershipFootnotes: string[];
}

export interface TransactionCoding {
	formType: string | null;
	transactionCode: string | null;
	equitySwapInvolved: boolean;
	transactionCodingFootnotes: string[];
}

export interface NonDerivativeTransaction {
	id: string;
	issuerCik: string;
	reportingOwnerCiks: string[];
	securityTitle: string | null;
	securityTitleFootnotes: string[];
	transactionDate: string | null;
	transactionDateFootnotes: string[];
	deemedExecutionDate: string | null;
	deemedExecutionDateFootnotes: string[];
	transactionCoding: TransactionCoding | null;
	transactionTimeliness: string | null;
	transactionAmounts: TransactionAmounts;
	postTransactionAmounts: PostTransactionAmounts;
	ownershipNature: OwnershipNature;
}

export interface DerivativeTransaction {
	id: string;
	issuerCik: string;
	reportingOwnerCiks: string[];
	securityTitle: string | null;
	securityTitleFootnotes: string[];
	conversionOrExercisePrice: number | null;
	conversionOrExercisePriceFootnotes: string[];
	transactionDate: string | null;
	transactionDateFootnotes: string[];
	deemedExecutionDate: string | null;
	deemedExecutionDateFootnotes: string[];
	transactionCoding: TransactionCoding | null;
	transactionTimeliness: string | null;
	transactionAmounts: TransactionAmounts;
	exerciseDateOrExpiration: {
		exerciseDate: string | null;
		exerciseDateFootnotes: string[];
		expirationDate: string | null;
		expirationDateFootnotes: string[];
	};
	underlyingSecurity: {
		underlyingSecurityTitle: string | null;
		underlyingSecurityTitleFootnotes: string[];
		underlyingSecurityShares: number | null;
		underlyingSecuritySharesFootnotes: string[];
		underlyingSecurityValue: number | null;
		underlyingSecurityValueFootnotes: string[];
	};
	postTransactionAmounts: PostTransactionAmounts;
	ownershipNature: OwnershipNature;
}

export interface NonDerivativeHolding {
	id: string;
	issuerCik: string;
	reportingOwnerCiks: string[];
	securityTitle: string | null;
	securityTitleFootnotes: string[];
	postTransactionAmounts: PostTransactionAmounts;
	ownershipNature: OwnershipNature;
}

export interface DerivativeHolding {
	id: string;
	issuerCik: string;
	reportingOwnerCiks: string[];
	securityTitle: string | null;
	securityTitleFootnotes: string[];
	conversionOrExercisePrice: number | null;
	conversionOrExercisePriceFootnotes: string[];
	exerciseDateOrExpiration: {
		exerciseDate: string | null;
		exerciseDateFootnotes: string[];
		expirationDate: string | null;
		expirationDateFootnotes: string[];
	};
	underlyingSecurity: {
		underlyingSecurityTitle: string | null;
		underlyingSecurityTitleFootnotes: string[];
		underlyingSecurityShares: number | null;
		underlyingSecuritySharesFootnotes: string[];
		underlyingSecurityValue: number | null;
		underlyingSecurityValueFootnotes: string[];
	};
	postTransactionAmounts: PostTransactionAmounts;
	ownershipNature: OwnershipNature;
}

export interface Signature {
	signatureName: string;
	signatureDate: string;
}

// ─── HTTP Helper ──────────────────────────────────────────────────────────────

export function fetchUrl(url: string, headers: Record<string, string>): Promise<string> {
	return new Promise((resolve, reject) => {
		const lib = url.startsWith('https') ? https : http;
		const options = { headers };
		const req = lib.get(url, options, (res) => {
			// Follow redirects
			if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
				resolve(fetchUrl(res.headers.location, headers));
				return;
			}
			if (res.statusCode && res.statusCode >= 400) {
				reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
				return;
			}
			const chunks: Buffer[] = [];
			res.on('data', (chunk: Buffer) => chunks.push(chunk));
			res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
			res.on('error', reject);
		});
		req.on('error', reject);
	});
}

// ─── XML Helpers ──────────────────────────────────────────────────────────────

interface XmlField {
	value?: unknown;
	footnoteId?: XmlFootnoteId | XmlFootnoteId[];
}

interface XmlFootnoteId {
	'@_id'?: string;
}

function extractValue(field: unknown): { value: unknown; footnotes: string[] } {
	if (field === undefined || field === null) return { value: null, footnotes: [] };
	const f = field as XmlField;
	const footnotes: string[] = [];
	if (f.footnoteId) {
		const ids = Array.isArray(f.footnoteId) ? f.footnoteId : [f.footnoteId];
		for (const fn of ids) {
			if (fn['@_id']) footnotes.push(fn['@_id']);
		}
	}
	return { value: f.value ?? null, footnotes };
}

function toStr(v: unknown): string | null {
	if (v === null || v === undefined) return null;
	const s = String(v).trim();
	return s === '' ? null : s;
}

// Strip timezone offsets from date strings (e.g. "2026-05-22-05:00" → "2026-05-22")
function toDateStr(v: unknown): string | null {
	const s = toStr(v);
	if (!s) return null;
	const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
	return m ? m[1] : s;
}

function normalizeCik(v: unknown): string {
	const s = toStr(v);
	if (!s) return '';
	// Pad CIK to 10 digits with leading zeros
	return s.replace(/^0+/, '').padStart(10, '0');
}

function toNum(v: unknown): number | null {
	if (v === null || v === undefined) return null;
	const n = Number(v);
	return isNaN(n) ? null : n;
}

function toBool(v: unknown): boolean {
	if (typeof v === 'boolean') return v;
	if (v === 1 || v === '1' || v === 'true') return true;
	return false;
}

function extractStr(field: unknown): { value: string | null; footnotes: string[] } {
	const { value, footnotes } = extractValue(field);
	return { value: toStr(value), footnotes };
}

function extractDateStr(field: unknown): { value: string | null; footnotes: string[] } {
	const { value, footnotes } = extractValue(field);
	return { value: toDateStr(value), footnotes };
}

function extractNum(field: unknown): { value: number | null; footnotes: string[] } {
	const { value, footnotes } = extractValue(field);
	return { value: toNum(value), footnotes };
}

function extractADCode(field: unknown): { value: 'A' | 'D' | null; footnotes: string[] } {
	const { value, footnotes } = extractValue(field);
	const s = toStr(value);
	if (s === 'A' || s === 'D') return { value: s, footnotes };
	return { value: null, footnotes };
}

function extractDICode(field: unknown): { value: 'D' | 'I' | null; footnotes: string[] } {
	const { value, footnotes } = extractValue(field);
	const s = toStr(value);
	if (s === 'D' || s === 'I') return { value: s, footnotes };
	return { value: null, footnotes };
}

// ─── Accession Number Helpers ─────────────────────────────────────────────────

export function formatAccessionNumber(raw: string): string {
	// "000110465926038038" → "0001104659-26-038038"
	const digits = raw.replace(/-/g, '');
	if (digits.length === 18) {
		return `${digits.slice(0, 10)}-${digits.slice(10, 12)}-${digits.slice(12)}`;
	}
	return raw;
}

export function extractAccessionFromUrl(url: string): string {
	// Match the 18-digit accession number in the URL path
	const match = url.match(/\/(\d{18})\//);
	if (match) return formatAccessionNumber(match[1]);
	// Also try dashed format
	const dashMatch = url.match(/\/(\d{10}-\d{2}-\d{6})/);
	if (dashMatch) return dashMatch[1];
	return '';
}

// ─── Index Page Parsing ───────────────────────────────────────────────────────

export function findXmlUrlFromIndex(html: string, baseUrl: string): string | null {
	// Look for href pointing to /Archives/edgar/data/.../something.xml (not xsl)
	const re = /href="(\/Archives\/edgar\/data\/[^"]+\.xml)"/gi;
	let match: RegExpExecArray | null;
	while ((match = re.exec(html)) !== null) {
		const href = match[1];
		if (!href.toLowerCase().includes('xsl')) {
			const base = new URL(baseUrl);
			return `${base.protocol}//${base.host}${href}`;
		}
	}
	return null;
}

// ─── Transactional Parsers ────────────────────────────────────────────────────

interface XmlTransactionCoding {
	transactionFormType?: unknown;
	transactionCode?: unknown;
	equitySwapInvolved?: unknown;
	footnoteId?: XmlFootnoteId | XmlFootnoteId[];
}

function parseTransactionCoding(tc: unknown): TransactionCoding | null {
	if (!tc) return null;
	const c = tc as XmlTransactionCoding;
	const footnotes: string[] = [];
	if (c.footnoteId) {
		const ids = Array.isArray(c.footnoteId) ? c.footnoteId : [c.footnoteId];
		for (const fn of ids) {
			const f = fn as XmlFootnoteId;
			if (f['@_id']) footnotes.push(f['@_id']);
		}
	}
	return {
		formType: toStr(c.transactionFormType),
		transactionCode: toStr(c.transactionCode),
		equitySwapInvolved: toBool(c.equitySwapInvolved),
		transactionCodingFootnotes: footnotes,
	};
}

interface XmlTransactionAmounts {
	transactionShares?: unknown;
	transactionPricePerShare?: unknown;
	transactionAcquiredDisposedCode?: unknown;
}

function parseTransactionAmounts(ta: unknown): TransactionAmounts {
	if (!ta) {
		return {
			shares: null, sharesFootnotes: [],
			pricePerShare: null, pricePerShareFootnotes: [],
			acquiredDisposedCode: null, acquiredDisposedCodeFootnotes: [],
		};
	}
	const t = ta as XmlTransactionAmounts;
	const shares = extractNum(t.transactionShares);
	const price = extractNum(t.transactionPricePerShare);
	const adc = extractADCode(t.transactionAcquiredDisposedCode);
	return {
		shares: shares.value,
		sharesFootnotes: shares.footnotes,
		pricePerShare: price.value,
		pricePerShareFootnotes: price.footnotes,
		acquiredDisposedCode: adc.value,
		acquiredDisposedCodeFootnotes: adc.footnotes,
	};
}

interface XmlPostTransactionAmounts {
	sharesOwnedFollowingTransaction?: unknown;
	valueOwnedFollowingTransaction?: unknown;
}

function parsePostTransactionAmounts(pta: unknown): PostTransactionAmounts {
	if (!pta) {
		return {
			sharesOwnedFollowingTransaction: null, sharesOwnedFollowingTransactionFootnotes: [],
			valueOwnedFollowingTransaction: null, valueOwnedFollowingTransactionFootnotes: [],
		};
	}
	const p = pta as XmlPostTransactionAmounts;
	const shares = extractNum(p.sharesOwnedFollowingTransaction);
	const value = extractNum(p.valueOwnedFollowingTransaction);
	return {
		sharesOwnedFollowingTransaction: shares.value,
		sharesOwnedFollowingTransactionFootnotes: shares.footnotes,
		valueOwnedFollowingTransaction: value.value,
		valueOwnedFollowingTransactionFootnotes: value.footnotes,
	};
}

interface XmlOwnershipNature {
	directOrIndirectOwnership?: unknown;
	natureOfOwnership?: unknown;
}

function parseOwnershipNature(on: unknown): OwnershipNature {
	if (!on) {
		return {
			directOrIndirectOwnership: null, directOrIndirectOwnershipFootnotes: [],
			natureOfOwnership: null, natureOfOwnershipFootnotes: [],
		};
	}
	const o = on as XmlOwnershipNature;
	const di = extractDICode(o.directOrIndirectOwnership);
	const nature = extractStr(o.natureOfOwnership);
	return {
		directOrIndirectOwnership: di.value,
		directOrIndirectOwnershipFootnotes: di.footnotes,
		natureOfOwnership: nature.value,
		natureOfOwnershipFootnotes: nature.footnotes,
	};
}

interface XmlNonDerivativeTransaction {
	securityTitle?: unknown;
	transactionDate?: unknown;
	deemedExecutionDate?: unknown;
	transactionCoding?: unknown;
	transactionTimeliness?: unknown;
	transactionAmounts?: unknown;
	postTransactionAmounts?: unknown;
	ownershipNature?: unknown;
}

interface XmlDerivativeTransaction {
	securityTitle?: unknown;
	conversionOrExercisePrice?: unknown;
	transactionDate?: unknown;
	deemedExecutionDate?: unknown;
	transactionCoding?: unknown;
	transactionTimeliness?: unknown;
	transactionAmounts?: unknown;
	exerciseDate?: unknown;
	expirationDate?: unknown;
	underlyingSecurityTitle?: unknown;
	underlyingSecurityShares?: unknown;
	underlyingSecurityValue?: unknown;
	postTransactionAmounts?: unknown;
	ownershipNature?: unknown;
}

interface XmlNonDerivativeHolding {
	securityTitle?: unknown;
	postTransactionAmounts?: unknown;
	ownershipNature?: unknown;
}

interface XmlDerivativeHolding {
	securityTitle?: unknown;
	conversionOrExercisePrice?: unknown;
	exerciseDate?: unknown;
	expirationDate?: unknown;
	underlyingSecurityTitle?: unknown;
	underlyingSecurityShares?: unknown;
	underlyingSecurityValue?: unknown;
	postTransactionAmounts?: unknown;
	ownershipNature?: unknown;
}

// ─── Main Parser ──────────────────────────────────────────────────────────────

interface XmlReportingOwnerAddress {
	rptOwnerStreet1?: unknown;
	rptOwnerStreet2?: unknown;
	rptOwnerCity?: unknown;
	rptOwnerState?: unknown;
	rptOwnerZipCode?: unknown;
	rptOwnerStateDescription?: unknown;
	rptOwnerForeignStateDescription?: unknown;
}

interface XmlReportingOwnerRelationship {
	isDirector?: unknown;
	isOfficer?: unknown;
	isTenPercentOwner?: unknown;
	isOther?: unknown;
	officerTitle?: unknown;
	otherText?: unknown;
}

interface XmlReportingOwner {
	reportingOwnerId?: {
		rptOwnerCik?: unknown;
		rptOwnerName?: unknown;
	};
	reportingOwnerAddress?: XmlReportingOwnerAddress;
	reportingOwnerRelationship?: XmlReportingOwnerRelationship;
}

interface XmlIssuer {
	issuerCik?: unknown;
	issuerName?: unknown;
	issuerTradingSymbol?: unknown;
}

interface XmlFootnote {
	'@_id'?: string;
	'#text'?: string;
}

interface XmlOwnerSignature {
	signatureName?: unknown;
	signatureDate?: unknown;
}

interface XmlOwnershipDocument {
	schemaVersion?: unknown;
	documentType?: unknown;
	periodOfReport?: unknown;
	notSubjectToSection16?: unknown;
	aff10b5One?: unknown;
	issuer?: XmlIssuer;
	reportingOwner?: XmlReportingOwner[];
	nonDerivativeTable?: {
		nonDerivativeTransaction?: XmlNonDerivativeTransaction[];
		nonDerivativeHolding?: XmlNonDerivativeHolding[];
	};
	derivativeTable?: {
		derivativeTransaction?: XmlDerivativeTransaction[];
		derivativeHolding?: XmlDerivativeHolding[];
	};
	footnotes?: {
		footnote?: XmlFootnote[];
	};
	ownerSignature?: XmlOwnerSignature[];
}

interface XmlRoot {
	ownershipDocument?: XmlOwnershipDocument;
}

export function parseForm4Xml(
	xmlText: string,
	sourceUrl: string,
	xmlUrl: string,
	indexUrl: string | null,
): Form4Filing {
	const parser = new XMLParser({
		ignoreAttributes: false,
		attributeNamePrefix: '@_',
		isArray: (name) =>
			[
				'reportingOwner',
				'nonDerivativeTransaction',
				'derivativeTransaction',
				'nonDerivativeHolding',
				'derivativeHolding',
				'footnote',
				'ownerSignature',
				'footnoteId',
			].includes(name),
		allowBooleanAttributes: true,
	});

	const root = parser.parse(xmlText) as XmlRoot;
	const doc = root.ownershipDocument;
	if (!doc) throw new Error('Invalid Form 4 XML: missing ownershipDocument element');

	// ── Issuer ────────────────────────────────────────────────────────────────
	const issuerXml = doc.issuer ?? {};
	const issuerCik = normalizeCik(issuerXml.issuerCik);
	const issuer: Issuer = {
		cik: issuerCik,
		name: toStr(issuerXml.issuerName) ?? '',
		tradingSymbol: toStr(issuerXml.issuerTradingSymbol),
		foreignTradingSymbol: null,
	};
	const issuers: Record<string, Issuer> = { [issuerCik]: issuer };

	// ── Reporting Owners ──────────────────────────────────────────────────────
	const reportingOwners: Record<string, ReportingOwner> = {};
	const reportingOwnerCiks: string[] = [];
	for (const ro of doc.reportingOwner ?? []) {
		const id = ro.reportingOwnerId ?? {};
		const cik = normalizeCik(id.rptOwnerCik);
		const addr = ro.reportingOwnerAddress ?? {};
		const rel = ro.reportingOwnerRelationship ?? {};

		// Check if it's a non-US address
		const nonUSAddress =
			toStr(addr.rptOwnerForeignStateDescription) !== null ||
			(toStr(addr.rptOwnerState) === null && toStr(addr.rptOwnerCity) !== null);

		const owner: ReportingOwner = {
			cik,
			name: toStr(id.rptOwnerName) ?? '',
			address: {
				street1: toStr(addr.rptOwnerStreet1),
				street2: toStr(addr.rptOwnerStreet2),
				city: toStr(addr.rptOwnerCity),
				state: toStr(addr.rptOwnerState),
				zipCode: toStr(addr.rptOwnerZipCode),
				nonUSAddress,
				stateDescription:
					toStr(addr.rptOwnerStateDescription) ??
					toStr(addr.rptOwnerForeignStateDescription),
			},
			relationship: {
				isDirector: toBool(rel.isDirector),
				isOfficer: toBool(rel.isOfficer),
				isTenPercentOwner: toBool(rel.isTenPercentOwner),
				isOther: toBool(rel.isOther),
				officerTitle: toStr(rel.officerTitle),
				otherText: toStr(rel.otherText),
			},
		};
		reportingOwners[cik] = owner;
		reportingOwnerCiks.push(cik);
	}

	// ── Non-Derivative Transactions ───────────────────────────────────────────
	const nonDerivativeTransactions: NonDerivativeTransaction[] = [];
	for (const [i, tx] of (doc.nonDerivativeTable?.nonDerivativeTransaction ?? []).entries()) {
		const t = tx as XmlNonDerivativeTransaction;
		const secTitle = extractStr(t.securityTitle);
		const txDate = extractDateStr(t.transactionDate);
		const deemedDate = extractDateStr(t.deemedExecutionDate);
		const timeli = extractStr(t.transactionTimeliness);
		nonDerivativeTransactions.push({
			id: `ndt-${i}`,
			issuerCik,
			reportingOwnerCiks: [...reportingOwnerCiks],
			securityTitle: secTitle.value,
			securityTitleFootnotes: secTitle.footnotes,
			transactionDate: txDate.value,
			transactionDateFootnotes: txDate.footnotes,
			deemedExecutionDate: deemedDate.value,
			deemedExecutionDateFootnotes: deemedDate.footnotes,
			transactionCoding: parseTransactionCoding(t.transactionCoding),
			transactionTimeliness: timeli.value,
			transactionAmounts: parseTransactionAmounts(t.transactionAmounts),
			postTransactionAmounts: parsePostTransactionAmounts(t.postTransactionAmounts),
			ownershipNature: parseOwnershipNature(t.ownershipNature),
		});
	}

	// ── Derivative Transactions ───────────────────────────────────────────────
	const derivativeTransactions: DerivativeTransaction[] = [];
	for (const [i, tx] of (doc.derivativeTable?.derivativeTransaction ?? []).entries()) {
		const t = tx as XmlDerivativeTransaction;
		const secTitle = extractStr(t.securityTitle);
		const convPrice = extractNum(t.conversionOrExercisePrice);
		const txDate = extractDateStr(t.transactionDate);
		const deemedDate = extractDateStr(t.deemedExecutionDate);
		const timeli = extractStr(t.transactionTimeliness);
		const exerciseDate = extractDateStr(t.exerciseDate);
		const expirationDate = extractDateStr(t.expirationDate);
		const ulTitle = extractStr(t.underlyingSecurityTitle);
		const ulShares = extractNum(t.underlyingSecurityShares);
		const ulValue = extractNum(t.underlyingSecurityValue);
		derivativeTransactions.push({
			id: `dt-${i}`,
			issuerCik,
			reportingOwnerCiks: [...reportingOwnerCiks],
			securityTitle: secTitle.value,
			securityTitleFootnotes: secTitle.footnotes,
			conversionOrExercisePrice: convPrice.value,
			conversionOrExercisePriceFootnotes: convPrice.footnotes,
			transactionDate: txDate.value,
			transactionDateFootnotes: txDate.footnotes,
			deemedExecutionDate: deemedDate.value,
			deemedExecutionDateFootnotes: deemedDate.footnotes,
			transactionCoding: parseTransactionCoding(t.transactionCoding),
			transactionTimeliness: timeli.value,
			transactionAmounts: parseTransactionAmounts(t.transactionAmounts),
			exerciseDateOrExpiration: {
				exerciseDate: exerciseDate.value,
				exerciseDateFootnotes: exerciseDate.footnotes,
				expirationDate: expirationDate.value,
				expirationDateFootnotes: expirationDate.footnotes,
			},
			underlyingSecurity: {
				underlyingSecurityTitle: ulTitle.value,
				underlyingSecurityTitleFootnotes: ulTitle.footnotes,
				underlyingSecurityShares: ulShares.value,
				underlyingSecuritySharesFootnotes: ulShares.footnotes,
				underlyingSecurityValue: ulValue.value,
				underlyingSecurityValueFootnotes: ulValue.footnotes,
			},
			postTransactionAmounts: parsePostTransactionAmounts(t.postTransactionAmounts),
			ownershipNature: parseOwnershipNature(t.ownershipNature),
		});
	}

	// ── Non-Derivative Holdings ───────────────────────────────────────────────
	const nonDerivativeHoldings: NonDerivativeHolding[] = [];
	for (const [i, hx] of (doc.nonDerivativeTable?.nonDerivativeHolding ?? []).entries()) {
		const h = hx as XmlNonDerivativeHolding;
		const secTitle = extractStr(h.securityTitle);
		nonDerivativeHoldings.push({
			id: `ndh-${i}`,
			issuerCik,
			reportingOwnerCiks: [...reportingOwnerCiks],
			securityTitle: secTitle.value,
			securityTitleFootnotes: secTitle.footnotes,
			postTransactionAmounts: parsePostTransactionAmounts(h.postTransactionAmounts),
			ownershipNature: parseOwnershipNature(h.ownershipNature),
		});
	}

	// ── Derivative Holdings ───────────────────────────────────────────────────
	const derivativeHoldings: DerivativeHolding[] = [];
	for (const [i, hx] of (doc.derivativeTable?.derivativeHolding ?? []).entries()) {
		const h = hx as XmlDerivativeHolding;
		const secTitle = extractStr(h.securityTitle);
		const convPrice = extractNum(h.conversionOrExercisePrice);
		const exerciseDate = extractDateStr(h.exerciseDate);
		const expirationDate = extractDateStr(h.expirationDate);
		const ulTitle = extractStr(h.underlyingSecurityTitle);
		const ulShares = extractNum(h.underlyingSecurityShares);
		const ulValue = extractNum(h.underlyingSecurityValue);
		derivativeHoldings.push({
			id: `dh-${i}`,
			issuerCik,
			reportingOwnerCiks: [...reportingOwnerCiks],
			securityTitle: secTitle.value,
			securityTitleFootnotes: secTitle.footnotes,
			conversionOrExercisePrice: convPrice.value,
			conversionOrExercisePriceFootnotes: convPrice.footnotes,
			exerciseDateOrExpiration: {
				exerciseDate: exerciseDate.value,
				exerciseDateFootnotes: exerciseDate.footnotes,
				expirationDate: expirationDate.value,
				expirationDateFootnotes: expirationDate.footnotes,
			},
			underlyingSecurity: {
				underlyingSecurityTitle: ulTitle.value,
				underlyingSecurityTitleFootnotes: ulTitle.footnotes,
				underlyingSecurityShares: ulShares.value,
				underlyingSecuritySharesFootnotes: ulShares.footnotes,
				underlyingSecurityValue: ulValue.value,
				underlyingSecurityValueFootnotes: ulValue.footnotes,
			},
			postTransactionAmounts: parsePostTransactionAmounts(h.postTransactionAmounts),
			ownershipNature: parseOwnershipNature(h.ownershipNature),
		});
	}

	// ── Footnotes ─────────────────────────────────────────────────────────────
	const footnotes: Record<string, string> = {};
	for (const fn of doc.footnotes?.footnote ?? []) {
		if (fn['@_id']) {
			footnotes[fn['@_id']] = toStr(fn['#text']) ?? '';
		}
	}

	// ── Signatures ────────────────────────────────────────────────────────────
	const signatures: Signature[] = [];
	for (const sig of doc.ownerSignature ?? []) {
		signatures.push({
			signatureName: toStr(sig.signatureName) ?? '',
			signatureDate: toDateStr(sig.signatureDate) ?? '',
		});
	}

	// ── Filing metadata ───────────────────────────────────────────────────────
	const accessionNumber = extractAccessionFromUrl(xmlUrl);

	return {
		filing: {
			accessionNumber,
			periodOfReport: toDateStr(doc.periodOfReport) ?? '',
			documentType: toStr(doc.documentType) ?? '',
			schemaVersion: toStr(doc.schemaVersion) ?? '',
			notSubjectToSection16: toBool(doc.notSubjectToSection16),
			aff10b5One: toBool(doc.aff10b5One),
			sourceUrl,
			xmlUrl,
			indexUrl,
			issuerCik,
			reportingOwnerCiks,
		},
		issuers,
		reportingOwners,
		nonDerivativeTransactions,
		derivativeTransactions,
		nonDerivativeHoldings,
		derivativeHoldings,
		footnotes,
		signatures,
	};
}

// ─── High-Level Fetch + Parse ─────────────────────────────────────────────────

export async function fetchAndParseForm4(
	url: string,
	userAgent: string,
): Promise<Form4Filing> {
	const headers = { 'User-Agent': userAgent, Accept: 'text/html,application/xml,*/*' };

	let xmlUrl: string;
	let indexUrl: string | null = null;

	const isXml = url.toLowerCase().endsWith('.xml');

	if (isXml) {
		xmlUrl = url;
	} else {
		// Treat as index page
		indexUrl = url;
		const indexHtml = await fetchUrl(url, headers);
		const found = findXmlUrlFromIndex(indexHtml, url);
		if (!found) throw new Error(`Could not find XML document link in index page: ${url}`);
		xmlUrl = found;
	}

	const xmlText = await fetchUrl(xmlUrl, headers);
	return parseForm4Xml(xmlText, url, xmlUrl, indexUrl);
}
