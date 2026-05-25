import {
	ICredentialTestFunctions,
	ICredentialsDecrypted,
	IDataObject,
	IExecuteFunctions,
	INodeCredentialTestResult,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

import { Client } from 'pg';
import {
	buildClientOptions,
	ensureTables,
	getTableNames,
	upsertForm4Filing,
	type PostgresConfig,
} from './postgresInserter';
import type { Form4Filing } from '../SecForm4Parser/form4Parser';

export class SecForm4PostgresInserter implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'SEC Form 4 PostgreSQL Inserter',
		name: 'secForm4PostgresInserter',
		icon: 'file:secForm4PostgresInserter.svg',
		group: ['output'],
		version: 1,
		subtitle: 'Upsert SEC Form 4 data into PostgreSQL',
		description:
			'Inserts or updates parsed SEC Form 4 filing data into PostgreSQL tables',
		defaults: {
			name: 'SEC Form 4 PostgreSQL Inserter',
		},
		inputs: ['main'],
		outputs: ['main'],
		usableAsTool: true,
		credentials: [
			{
				// eslint-disable-next-line @n8n/community-nodes/no-credential-reuse
				name: 'postgres',
				required: true,
				testedBy: 'postgresConnectionTest',
			},
		],
		properties: [
			{
				displayName: 'Table Prefix',
				name: 'tablePrefix',
				type: 'string',
				default: 'sec_',
				description: 'Prefix for all created table names (e.g. "sec_" → sec_filings)',
			},
			{
				displayName: 'Create Tables If Missing',
				name: 'createTables',
				type: 'boolean',
				default: true,
				description:
					'Whether to automatically create the database tables on first run',
			},
		],
	};

	methods = {
		credentialTest: {
			async postgresConnectionTest(
				this: ICredentialTestFunctions,
				credential: ICredentialsDecrypted,
			): Promise<INodeCredentialTestResult> {
				const config: PostgresConfig = {
					host: (credential.data?.host as string) ?? 'localhost',
					port: (credential.data?.port as number) ?? 5432,
					database: (credential.data?.database as string) ?? '',
					user: (credential.data?.user as string) ?? '',
					password: (credential.data?.password as string) ?? '',
					ssl: (credential.data?.ssl as 'disable' | 'allow' | 'require') ?? 'disable',
				};
				const client = new Client(buildClientOptions(config));
				try {
					await client.connect();
					await client.query('SELECT 1');
					await client.end();
					return { status: 'OK', message: 'Connection successful' };
				} catch (error) {
					try {
						await client.end();
					} catch {
						// ignore
					}
					return {
						status: 'Error',
						message: error instanceof Error ? error.message : String(error),
					};
				}
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const credentials = await this.getCredentials('postgres');
		const config: PostgresConfig = {
			host: credentials.host as string,
			port: credentials.port as number,
			database: credentials.database as string,
			user: credentials.user as string,
			password: credentials.password as string,
			ssl: (credentials.ssl as 'disable' | 'allow' | 'require') ?? 'disable',
		};

		const client = new Client(buildClientOptions(config));
		await client.connect();

		try {
			const tablePrefix = this.getNodeParameter('tablePrefix', 0) as string;
			const createTables = this.getNodeParameter('createTables', 0) as boolean;
			const tableNames = getTableNames(tablePrefix);

			if (createTables) {
				await ensureTables(client, tableNames);
			}

			for (let i = 0; i < items.length; i++) {
				try {
					const filing = items[i].json as unknown as Form4Filing;
					const result = await upsertForm4Filing(client, filing, tableNames);
					returnData.push({
						json: result as unknown as IDataObject,
						pairedItem: { item: i },
					});
				} catch (error) {
					if (this.continueOnFail()) {
						returnData.push({
							json: {
								error: error instanceof Error ? error.message : String(error),
							},
							pairedItem: { item: i },
						});
						continue;
					}
					throw new NodeOperationError(
						this.getNode(),
						error instanceof Error ? error.message : String(error),
						{ itemIndex: i },
					);
				}
			}
		} finally {
			await client.end();
		}

		return [returnData];
	}
}
