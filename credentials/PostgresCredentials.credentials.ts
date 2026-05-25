import { ICredentialType, INodeProperties } from 'n8n-workflow';

// eslint-disable-next-line @n8n/community-nodes/credential-test-required
export class PostgresCredentials implements ICredentialType {
	name = 'postgres';
	displayName = 'PostgreSQL';
	documentationUrl = 'https://www.postgresql.org/docs/current/libpq-connect.html';
	icon = 'file:postgres.svg' as const;
	testedBy = 'postgresConnectionTest';
	properties: INodeProperties[] = [
		{
			displayName: 'Host',
			name: 'host',
			type: 'string',
			default: 'localhost',
		},
		{
			displayName: 'Port',
			name: 'port',
			type: 'number',
			default: 5432,
		},
		{
			displayName: 'Database',
			name: 'database',
			type: 'string',
			default: '',
			required: true,
		},
		{
			displayName: 'User',
			name: 'user',
			type: 'string',
			default: '',
			required: true,
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
		},
		{
			displayName: 'SSL',
			name: 'ssl',
			type: 'options',
			options: [
				{ name: 'Disable', value: 'disable' },
				{ name: 'Require', value: 'require' },
			],
			default: 'disable',
			description:
				'Whether to use SSL/TLS when connecting to PostgreSQL. "Require" enables TLS and skips certificate validation.',
		},
	];
}
