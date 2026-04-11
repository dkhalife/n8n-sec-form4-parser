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

import mysql from 'mysql2/promise';
import {
	ensureTables,
	getTableNames,
	upsertForm4Filing,
	type MariaDbConfig,
} from './mariadbInserter';
import type { Form4Filing } from '../SecForm4Parser/form4Parser';

export class SecForm4MariadbInserter implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'SEC Form 4 MariaDB Inserter',
		name: 'secForm4MariadbInserter',
		icon: 'file:secForm4MariadbInserter.svg',
		group: ['output'],
		version: 1,
		subtitle: 'Upsert SEC Form 4 data into MariaDB',
		description:
			'Inserts or updates parsed SEC Form 4 filing data into MariaDB/MySQL tables',
		defaults: {
			name: 'SEC Form 4 MariaDB Inserter',
		},
		inputs: ['main'],
		outputs: ['main'],
		usableAsTool: true,
		credentials: [
			{
				// eslint-disable-next-line @n8n/community-nodes/no-credential-reuse
				name: 'mySqlApi',
				required: true,
				testedBy: 'mySqlConnectionTest',
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
			async mySqlConnectionTest(
				this: ICredentialTestFunctions,
				credential: ICredentialsDecrypted,
			): Promise<INodeCredentialTestResult> {
				const config: MariaDbConfig = {
					host: (credential.data?.host as string) ?? 'localhost',
					port: (credential.data?.port as number) ?? 3306,
					database: (credential.data?.database as string) ?? '',
					user: (credential.data?.user as string) ?? '',
					password: (credential.data?.password as string) ?? '',
				};
				try {
					const connection = await mysql.createConnection(config);
					await connection.ping();
					await connection.end();
					return { status: 'OK', message: 'Connection successful' };
				} catch (error) {
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

		const credentials = await this.getCredentials('mySqlApi');
		const config: MariaDbConfig = {
			host: credentials.host as string,
			port: credentials.port as number,
			database: credentials.database as string,
			user: credentials.user as string,
			password: credentials.password as string,
		};

		const connection = await mysql.createConnection(config);

		try {
			const tablePrefix = this.getNodeParameter('tablePrefix', 0) as string;
			const createTables = this.getNodeParameter('createTables', 0) as boolean;
			const tableNames = getTableNames(tablePrefix);

			if (createTables) {
				await ensureTables(connection, tableNames);
			}

			for (let i = 0; i < items.length; i++) {
				try {
					const filing = items[i].json as unknown as Form4Filing;
					const result = await upsertForm4Filing(connection, filing, tableNames);
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
			await connection.end();
		}

		return [returnData];
	}
}
