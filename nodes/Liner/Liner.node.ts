import {
	NodeApiError,
	NodeConnectionTypes,
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
	type INodeType,
	type INodeTypeDescription,
	type JsonObject,
} from 'n8n-workflow';

const LINER_BASE_URL = 'https://platform.liner.com/api/v1';

type LinerEndpoint =
	| '/search/web'
	| '/search/scholar'
	| '/quick-answer'
	| '/ai-search'
	| '/ai-search-pro'
	| '/deep-research'
	| '/deep-research-pro';

type Message = {
	role: 'user' | 'assistant';
	content: string;
};

type RawSseEvent = Record<string, unknown> & {
	type?: string;
	data?: unknown;
	delta?: string;
	message_id?: string;
	message_metadata?: unknown;
};

type SseAggregate = {
	text: string;
	reasoning: string;
	references: unknown[];
	referenceChunks: unknown[];
	tasks: unknown[];
	searchSteps: unknown[];
	metadata?: unknown;
	message_id?: string;
	event_counts: Record<string, number>;
	raw_events?: RawSseEvent[];
};

const searchOperations = ['webSearch', 'scholarSearch'];
const answerOperations = [
	'quickAnswer',
	'aiSearch',
	'aiSearchPro',
	'deepResearch',
	'deepResearchPro',
];

const commonSearchFields: INodeProperties[] = [
	{
		displayName: 'Query',
		name: 'query',
		type: 'string',
		required: true,
		default: '',
		displayOptions: {
			show: {
				resource: ['search'],
				operation: searchOperations,
			},
		},
		description: 'Search query to send to Liner',
	},
	{
		displayName: 'Country Code',
		name: 'countryCode',
		type: 'string',
		default: '',
		placeholder: 'us',
		displayOptions: {
			show: {
				resource: ['search'],
				operation: ['webSearch'],
			},
		},
		description: 'Optional ISO 3166-1 alpha-2 country code for localized web results',
	},
	{
		displayName: 'Language',
		name: 'lang',
		type: 'string',
		default: '',
		placeholder: 'en',
		displayOptions: {
			show: {
				resource: ['search', 'answer'],
				operation: [...searchOperations, ...answerOperations],
			},
		},
		description: 'Optional language code, for example en, ko, or ja',
	},
	{
		displayName: 'Date Range',
		name: 'dateRange',
		type: 'options',
		default: '',
		options: [
			{ name: 'Any Time', value: '' },
			{ name: 'Past Day', value: 'past_day' },
			{ name: 'Past Month', value: 'past_month' },
			{ name: 'Past Week', value: 'past_week' },
			{ name: 'Past Year', value: 'past_year' },
		],
		displayOptions: {
			show: {
				resource: ['search'],
				operation: searchOperations,
			},
		},
		description: 'Optional date filter for search results',
	},
	{
		displayName: 'Max Results',
		name: 'maxResults',
		type: 'number',
		default: 10,
		typeOptions: {
			minValue: 1,
			maxValue: 20,
		},
		displayOptions: {
			show: {
				resource: ['search'],
				operation: searchOperations,
			},
		},
		description: 'Number of search results to return, from 1 to 20',
	},
];

const answerFields: INodeProperties[] = [
	{
		displayName: 'Input',
		name: 'inputMode',
		type: 'options',
		default: 'question',
		options: [
			{
				name: 'Question',
				value: 'question',
			},
			{
				name: 'Messages JSON',
				value: 'messagesJson',
			},
		],
		displayOptions: {
			show: {
				resource: ['answer'],
				operation: answerOperations,
			},
		},
		description: 'Whether to provide a single user question or a full Liner messages array',
	},
	{
		displayName: 'Question',
		name: 'question',
		type: 'string',
		required: true,
		default: '',
		typeOptions: {
			rows: 4,
		},
		displayOptions: {
			show: {
				resource: ['answer'],
				operation: answerOperations,
				inputMode: ['question'],
			},
		},
		description: 'Question to send as the final user message',
	},
	{
		displayName: 'Messages JSON',
		name: 'messagesJson',
		type: 'json',
		default: '[{"role":"user","content":"What is retrieval augmented generation?"}]',
		displayOptions: {
			show: {
				resource: ['answer'],
				operation: answerOperations,
				inputMode: ['messagesJson'],
			},
		},
		description:
			'Conversation history as an array of messages with role and content fields. The final message must use role user.',
	},
	{
		displayName: 'Model',
		name: 'model',
		type: 'string',
		default: '',
		displayOptions: {
			show: {
				resource: ['answer'],
				operation: ['aiSearch', 'aiSearchPro'],
			},
		},
		description: "Optional model identifier. Leave empty to use Liner's default model.",
	},
	{
		displayName: 'Search Mode',
		name: 'mode',
		type: 'options',
		default: 'general',
		options: [
			{
				name: 'General',
				value: 'general',
			},
			{
				name: 'Scholar',
				value: 'scholar',
			},
		],
		displayOptions: {
			show: {
				resource: ['answer'],
				operation: ['aiSearch', 'aiSearchPro'],
			},
		},
		description: 'Whether AI Search should use general web search or scholar search',
	},
	{
		displayName: 'Include Raw Events',
		name: 'includeEvents',
		type: 'boolean',
		default: false,
		displayOptions: {
			show: {
				resource: ['answer'],
				operation: answerOperations,
			},
		},
		description: 'Whether to include raw Server-Sent Event envelopes in the output',
	},
];

const commonOptionalFields: INodeProperties[] = [
	{
		displayName: 'Request ID',
		name: 'requestId',
		type: 'string',
		default: '',
		displayOptions: {
			show: {
				resource: ['search', 'answer'],
				operation: [...searchOperations, ...answerOperations],
			},
		},
		description: 'Optional client-supplied ID echoed by Liner',
	},
];

export class Liner implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Liner',
		name: 'liner',
		icon: { light: 'file:liner.svg', dark: 'file:liner.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Search the web and generate source-backed answers with Liner',
		defaults: {
			name: 'Liner',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'linerApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Answer',
						value: 'answer',
					},
					{
						name: 'Search',
						value: 'search',
					},
				],
				default: 'answer',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['search'],
					},
				},
				options: [
					{
						name: 'Scholar Search',
						value: 'scholarSearch',
						action: 'Search scholarly articles',
						description: 'Return structured scholarly search results',
					},
					{
						name: 'Web Search',
						value: 'webSearch',
						action: 'Search the web',
						description: 'Return structured web search results',
					},
				],
				default: 'webSearch',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['answer'],
					},
				},
				options: [
					{
						name: 'AI Search',
						value: 'aiSearch',
						action: 'Run AI search',
						description: 'Generate a grounded answer with sources',
					},
					{
						name: 'AI Search Pro',
						value: 'aiSearchPro',
						action: 'Run AI search pro',
						description: 'Generate a grounded answer with deeper search coverage',
					},
					{
						name: 'Deep Research',
						value: 'deepResearch',
						action: 'Run deep research',
						description: 'Generate a long-form research report',
					},
					{
						name: 'Deep Research Pro',
						value: 'deepResearchPro',
						action: 'Run deep research pro',
						description: 'Generate a long-form research report with deeper coverage',
					},
					{
						name: 'Quick Answer',
						value: 'quickAnswer',
						action: 'Get a quick answer',
						description: 'Generate a fast source-backed answer',
					},
				],
				default: 'aiSearch',
			},
			...commonSearchFields,
			...answerFields,
			...commonOptionalFields,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const resource = this.getNodeParameter('resource', itemIndex) as string;
				const operation = this.getNodeParameter('operation', itemIndex) as string;

				const responseData =
					resource === 'search'
						? await executeSearchOperation(this, itemIndex, operation)
						: await executeAnswerOperation(this, itemIndex, operation);

				returnData.push({
					json: toJsonObject(responseData),
					pairedItem: { item: itemIndex },
				});
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: getErrorMessage(error),
						},
						pairedItem: { item: itemIndex },
					});
					continue;
				}

				throw new NodeOperationError(this.getNode(), getErrorMessage(error), { itemIndex });
			}
		}

		return [returnData];
	}
}

async function executeSearchOperation(
	executeFunctions: IExecuteFunctions,
	itemIndex: number,
	operation: string,
) {
	const endpoint = operation === 'scholarSearch' ? '/search/scholar' : '/search/web';
	const body = compactObject({
		query: executeFunctions.getNodeParameter('query', itemIndex) as string,
		country_code:
			operation === 'webSearch'
				? (executeFunctions.getNodeParameter('countryCode', itemIndex) as string)
				: undefined,
		lang: executeFunctions.getNodeParameter('lang', itemIndex) as string,
		date_range: executeFunctions.getNodeParameter('dateRange', itemIndex) as string,
		max_results: executeFunctions.getNodeParameter('maxResults', itemIndex) as number,
		request_id: executeFunctions.getNodeParameter('requestId', itemIndex) as string,
	});

	return await callLinerApi(executeFunctions, endpoint, body, true);
}

async function executeAnswerOperation(
	executeFunctions: IExecuteFunctions,
	itemIndex: number,
	operation: string,
) {
	const endpoint = getAnswerEndpoint(operation, executeFunctions, itemIndex);
	const body = compactObject({
		messages: buildMessages(executeFunctions, itemIndex),
		lang: executeFunctions.getNodeParameter('lang', itemIndex) as string,
		request_id: executeFunctions.getNodeParameter('requestId', itemIndex) as string,
		...(operation === 'aiSearch' || operation === 'aiSearchPro'
			? {
					model: executeFunctions.getNodeParameter('model', itemIndex) as string,
					mode: executeFunctions.getNodeParameter('mode', itemIndex) as string,
				}
			: {}),
	});
	const includeEvents = executeFunctions.getNodeParameter('includeEvents', itemIndex) as boolean;
	const response = await callLinerApi(executeFunctions, endpoint, body, false);

	return parseSseResponse(response, endpoint, includeEvents, executeFunctions, itemIndex);
}

async function callLinerApi(
	executeFunctions: IExecuteFunctions,
	endpoint: LinerEndpoint,
	body: IDataObject,
	json: boolean,
) {
	try {
		return await executeFunctions.helpers.httpRequestWithAuthentication.call(
			executeFunctions,
			'linerApi',
			{
				method: 'POST',
				url: `${LINER_BASE_URL}${endpoint}`,
				headers: {
					Accept: json ? 'application/json' : 'text/event-stream',
					'Content-Type': 'application/json',
				},
				body,
				json,
			},
		);
	} catch (error) {
		throw new NodeApiError(executeFunctions.getNode(), error as JsonObject);
	}
}

function getAnswerEndpoint(
	operation: string,
	executeFunctions: IExecuteFunctions,
	itemIndex: number,
): LinerEndpoint {
	switch (operation) {
		case 'quickAnswer':
			return '/quick-answer';
		case 'aiSearch':
			return '/ai-search';
		case 'aiSearchPro':
			return '/ai-search-pro';
		case 'deepResearch':
			return '/deep-research';
		case 'deepResearchPro':
			return '/deep-research-pro';
		default:
			throw new NodeOperationError(
				executeFunctions.getNode(),
				`Unsupported Liner operation: ${operation}`,
				{ itemIndex },
			);
	}
}

function buildMessages(executeFunctions: IExecuteFunctions, itemIndex: number): Message[] {
	const inputMode = executeFunctions.getNodeParameter('inputMode', itemIndex) as string;
	if (inputMode === 'question') {
		const question = executeFunctions.getNodeParameter('question', itemIndex) as string;
		if (!question.trim()) {
			throw new NodeOperationError(executeFunctions.getNode(), 'Question must not be empty', {
				itemIndex,
			});
		}
		return [{ role: 'user', content: question }];
	}

	const rawMessages = executeFunctions.getNodeParameter('messagesJson', itemIndex) as unknown;
	const parsed =
		typeof rawMessages === 'string'
			? parseJson(rawMessages, executeFunctions, itemIndex, 'Messages JSON is invalid')
			: rawMessages;
	if (!Array.isArray(parsed)) {
		throw new NodeOperationError(
			executeFunctions.getNode(),
			'Messages JSON must be an array of objects',
			{ itemIndex },
		);
	}

	const messages = parsed.map((message, index) =>
		parseMessage(message, index, executeFunctions, itemIndex),
	);
	const finalMessage = messages[messages.length - 1];
	if (!finalMessage || finalMessage.role !== 'user') {
		throw new NodeOperationError(
			executeFunctions.getNode(),
			'The final message in Messages JSON must use role "user"',
			{ itemIndex },
		);
	}

	return messages;
}

function parseMessage(
	message: unknown,
	index: number,
	executeFunctions: IExecuteFunctions,
	itemIndex: number,
): Message {
	if (!message || typeof message !== 'object') {
		throw new NodeOperationError(
			executeFunctions.getNode(),
			`Message at index ${index} must be an object`,
			{ itemIndex },
		);
	}

	const candidate = message as Record<string, unknown>;
	const role = candidate.role;
	const content = candidate.content;
	if (role !== 'user' && role !== 'assistant') {
		throw new NodeOperationError(
			executeFunctions.getNode(),
			`Message at index ${index} must have role "user" or "assistant"`,
			{ itemIndex },
		);
	}
	if (typeof content !== 'string' || !content.trim()) {
		throw new NodeOperationError(
			executeFunctions.getNode(),
			`Message at index ${index} must have non-empty string content`,
			{ itemIndex },
		);
	}

	return { role, content };
}

function parseSseResponse(
	response: unknown,
	endpoint: LinerEndpoint,
	includeEvents: boolean,
	executeFunctions: IExecuteFunctions,
	itemIndex: number,
) {
	if (response && typeof response === 'object' && !Buffer.isBuffer(response)) {
		return response;
	}

	const text = Buffer.isBuffer(response) ? response.toString('utf8') : String(response ?? '');
	if (!text.trim()) {
		throw new NodeApiError(
			executeFunctions.getNode(),
			{ message: `Liner ${endpoint} returned an empty response` },
			{ itemIndex },
		);
	}
	if (looksLikeJson(text)) {
		return parseJson(text, executeFunctions, itemIndex, `Could not parse Liner ${endpoint} JSON`);
	}

	const state = createSseState(includeEvents);
	const lines = text.split(/\r?\n/);
	for (const line of lines) {
		if (processSseLine(line, state, endpoint, executeFunctions, itemIndex)) {
			break;
		}
	}

	return state;
}

function createSseState(includeEvents: boolean): SseAggregate {
	return {
		text: '',
		reasoning: '',
		references: [],
		referenceChunks: [],
		tasks: [],
		searchSteps: [],
		event_counts: {},
		...(includeEvents ? { raw_events: [] } : {}),
	};
}

function processSseLine(
	line: string,
	state: SseAggregate,
	endpoint: LinerEndpoint,
	executeFunctions: IExecuteFunctions,
	itemIndex: number,
) {
	const trimmed = line.trim();
	if (!trimmed || trimmed.startsWith('event:')) {
		return false;
	}
	if (!trimmed.startsWith('data:')) {
		return false;
	}

	const payload = trimmed.slice('data:'.length).trim();
	if (!payload) {
		return false;
	}
	if (payload === '[DONE]') {
		return true;
	}

	const event = parseJson(
		payload,
		executeFunctions,
		itemIndex,
		`Could not parse Liner ${endpoint} stream event`,
	) as RawSseEvent;
	collectSseEvent(event, state, endpoint, executeFunctions, itemIndex);
	return false;
}

function collectSseEvent(
	event: RawSseEvent,
	state: SseAggregate,
	endpoint: LinerEndpoint,
	executeFunctions: IExecuteFunctions,
	itemIndex: number,
) {
	const eventType = event.type ?? 'unknown';
	state.event_counts[eventType] = (state.event_counts[eventType] ?? 0) + 1;
	state.raw_events?.push(event);

	if (eventType === 'data-error') {
		throw new NodeApiError(
			executeFunctions.getNode(),
			{ message: `Liner ${endpoint} stream error: ${extractErrorMessage(event)}` },
			{ itemIndex },
		);
	}

	switch (eventType) {
		case 'start':
			if (typeof event.message_id === 'string') {
				state.message_id = event.message_id;
			}
			if (event.message_metadata !== undefined) {
				state.metadata = event.message_metadata;
			}
			break;
		case 'data-metadata':
			state.metadata = getEventData(event) ?? event;
			break;
		case 'text-delta':
			if (typeof event.delta === 'string') {
				state.text += event.delta;
			}
			break;
		case 'reasoning-delta':
			if (typeof event.delta === 'string') {
				state.reasoning += event.delta;
			}
			break;
		case 'data-search-references':
			appendArray(state.references, getNestedArray(event, 'references'));
			break;
		case 'data-search-chunks':
			appendArray(state.referenceChunks, getNestedArray(event, 'referenceChunks'));
			break;
		case 'data-search-tasks':
			state.tasks = mergeTasks(state.tasks, getNestedArray(event, 'tasks'));
			break;
		case 'data-search-step':
			state.searchSteps.push(getEventData(event) ?? event);
			break;
	}
}

function getEventData(event: RawSseEvent) {
	if (event.data !== null && typeof event.data === 'object' && event.data !== undefined) {
		return event.data as Record<string, unknown>;
	}
	return undefined;
}

function getNestedArray(event: RawSseEvent, field: string) {
	const data = getEventData(event);
	const value = data?.[field];
	return Array.isArray(value) ? value : [];
}

function appendArray(target: unknown[], items: unknown[]) {
	target.push(...items);
}

function mergeTasks(existing: unknown[], updates: unknown[]) {
	if (updates.length === 0) {
		return existing;
	}

	const byId = new Map<string, unknown>();
	const withoutIds: unknown[] = [];
	for (const task of existing) {
		const id = getTaskId(task);
		if (id) {
			byId.set(id, task);
		} else {
			withoutIds.push(task);
		}
	}
	for (const task of updates) {
		const id = getTaskId(task);
		if (id) {
			byId.set(id, task);
		} else {
			withoutIds.push(task);
		}
	}

	return [...withoutIds, ...byId.values()];
}

function getTaskId(task: unknown) {
	if (task !== null && typeof task === 'object' && 'id' in task) {
		const value = (task as { id?: unknown }).id;
		return typeof value === 'string' ? value : undefined;
	}
	return undefined;
}

function compactObject(input: Record<string, unknown>): IDataObject {
	const output: IDataObject = {};
	for (const [key, value] of Object.entries(input)) {
		if (value === undefined || value === null || value === '') {
			continue;
		}
		output[key] = value as IDataObject[string];
	}
	return output;
}

function toJsonObject(value: unknown): IDataObject {
	if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
		return value as IDataObject;
	}
	return { data: value } as IDataObject;
}

function parseJson(
	text: string,
	executeFunctions: IExecuteFunctions,
	itemIndex: number,
	message: string,
): unknown {
	try {
		return JSON.parse(text);
	} catch (error) {
		throw new NodeOperationError(
			executeFunctions.getNode(),
			`${message}: ${getErrorMessage(error)}`,
			{ itemIndex },
		);
	}
}

function looksLikeJson(text: string) {
	const trimmed = text.trim();
	return trimmed.startsWith('{') || trimmed.startsWith('[');
}

function extractErrorMessage(value: unknown) {
	if (value && typeof value === 'object') {
		if ('message' in value && typeof value.message === 'string') {
			return value.message;
		}
		if ('error' in value) {
			const error = value.error;
			if (typeof error === 'string') {
				return error;
			}
			if (error && typeof error === 'object' && 'message' in error) {
				const message = error.message;
				if (typeof message === 'string') {
					return message;
				}
			}
		}
	}
	return JSON.stringify(value);
}

function getErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}
