import { ICredentialType, INodeProperties } from 'n8n-workflow';

// eslint-disable-next-line @n8n/community-nodes/credential-test-required
export class MySqlCredentials implements ICredentialType {
	name = 'mySqlApi';
	displayName = 'MySQL / MariaDB';
	documentationUrl = 'https://mariadb.com/kb/en/connecting-to-mariadb/';
	icon = 'file:mariadb.svg' as const;
	testedBy = 'mySqlConnectionTest';
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
			default: 3306,
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
	];
}
