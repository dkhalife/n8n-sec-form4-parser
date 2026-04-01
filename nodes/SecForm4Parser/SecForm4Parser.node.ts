import {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

import { fetchAndParseForm4 } from './form4Parser';

export class SecForm4Parser implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'SEC Form 4 Parser',
		name: 'secForm4Parser',
		icon: 'file:secForm4Parser.svg',
		group: ['transform'],
		version: 1,
		subtitle: 'Parse SEC Form 4 insider-trading filing',
		description: 'Fetches and parses an SEC Form 4 filing from EDGAR',
		defaults: {
			name: 'SEC Form 4 Parser',
		},
		inputs: ['main'],
		outputs: ['main'],
		usableAsTool: true,
		properties: [
			{
				displayName: 'URL',
				name: 'url',
				type: 'string',
				required: true,
				default: '',
				placeholder:
					'https://www.sec.gov/Archives/edgar/data/.../0001104659-26-038038-index.htm',
				description:
					'URL of the SEC Form 4 index page (ending in -index.htm) or direct XML URL',
			},
			{
				displayName: 'User-Agent App Name',
				name: 'userAgent',
				type: 'string',
				default: 'n8n-sec-form4-parser/1.0',
				description:
					'Application name/version for the User-Agent header sent to EDGAR (SEC policy requires identification)',
			},
			{
				displayName: 'Contact Email',
				name: 'email',
				type: 'string',
				default: '',
				placeholder: 'contact@example.com',
				description:
					'Email address appended to User-Agent header for SEC EDGAR compliance (e.g. "User-Agent: myapp/1.0 (contact@example.com)")',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const url = this.getNodeParameter('url', i) as string;
				const userAgentBase = this.getNodeParameter('userAgent', i) as string;
				const email = this.getNodeParameter('email', i) as string;

				if (!url) {
					throw new NodeOperationError(this.getNode(), 'URL is required', { itemIndex: i });
				}

				const userAgent = email
					? `${userAgentBase} (${email})`
					: `${userAgentBase} (contact@example.com)`;

				const filing = await fetchAndParseForm4(url, userAgent);

				returnData.push({
					json: JSON.parse(JSON.stringify(filing)) as IDataObject,
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
				if (error instanceof NodeOperationError) throw error;
				throw new NodeOperationError(
					this.getNode(),
					error instanceof Error ? error.message : String(error),
					{ itemIndex: i },
				);
			}
		}

		return [returnData];
	}
}
