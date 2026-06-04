import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class LinerApi implements ICredentialType {
	name = 'linerApi';

	displayName = 'Liner API';

	icon = 'file:liner.svg' as const;

	documentationUrl = 'https://github.com/mjkang-estrella/n8n-nodes-liner#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'x-api-key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.liner.com/v1',
			url: '/health',
			method: 'GET',
		},
	};
}
