# n8n-nodes-liner

This is an n8n community node for [Liner](https://liner.com/developers). It lets you use Liner's Search, Quick Answer, AI Search, and Deep Research APIs in n8n workflows.

Liner provides source-backed AI search APIs for applications that need fresh web context, academic retrieval, cited answers, and long-form research reports.

[n8n](https://n8n.io/) is a workflow automation platform.

## Installation

Follow the [n8n community node installation guide](https://docs.n8n.io/integrations/community-nodes/installation/).

For self-hosted n8n, install the package from npm once published:

```bash
npm install n8n-nodes-liner
```

## Operations

### Search

- Web Search: Calls `/search/web` and returns structured web results.
- Scholar Search: Calls `/search/scholar` and returns structured scholarly results.

Search parameters include:

- Query
- Country code for Web Search
- Language
- Date range
- Max results
- Request ID

### Answer

- Quick Answer: Calls `/quick-answer` for a fast answer with sources.
- AI Search: Calls `/ai-search` for a grounded answer with richer source metadata.
- AI Search Pro: Calls `/ai-search-pro` for deeper search coverage.
- Deep Research: Calls `/deep-research` for a long-form research report.
- Deep Research Pro: Calls `/deep-research-pro` for deeper long-form research.

Answer and research operations accept either a single question or a full `messages` JSON array. Streaming Server-Sent Events are aggregated into JSON output with:

- `text`
- `reasoning`
- `references`
- `referenceChunks`
- `tasks`
- `searchSteps`
- `metadata`
- `message_id`
- `event_counts`
- `raw_events`, when enabled

## Credentials

You need a Liner API key.

1. Go to the [Liner API platform](https://liner.com/developers).
2. Create an API key from the API Keys page.
3. In n8n, create a new **Liner API** credential.
4. Paste the API key into the **API Key** field.

The credential sends your key as the `x-api-key` header. The node calls Liner API endpoints at `https://platform.liner.com/api/v1`.

## Usage

Use **Search** when you want raw results for your own RAG or summarization workflow. Use **Answer** when you want Liner to generate a source-backed answer or research report.

Example AI Search input:

```json
{
  "messages": [
    {
      "role": "user",
      "content": "Summarize today's semiconductor export control news."
    }
  ],
  "lang": "en",
  "mode": "general"
}
```

The node is marked `usableAsTool`, so it can also be connected to n8n AI Agent workflows.

## Compatibility

This package was scaffolded with `@n8n/node-cli` and is intended for current n8n releases that support verified community nodes.

## Development

```bash
npm install
npm run lint
npm run build
```

Run a local n8n instance with this node loaded:

```bash
npm run dev
```

## Publishing

The repository includes `.github/workflows/publish.yml` for npm publishing with GitHub Actions provenance. n8n requires provenance publishing for verified community node submissions.

Before publishing, configure npm Trusted Publishing for this repository or add an `NPM_TOKEN` Actions secret.

## Resources

- [Liner Developers](https://liner.com/developers)
- [Liner Quick Start](https://liner.com/developers/docs/quick-start)
- [Liner Search API](https://liner.com/developers/docs/search-api)
- [Liner AI Search API](https://liner.com/developers/docs/ai-search-api)
- [Liner Deep Research API](https://liner.com/developers/docs/deep-research-api)
- [Liner Quick Answer API](https://liner.com/developers/docs/quick-answer-api)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)

## Version History

### 0.1.0

Initial community node with Search, Quick Answer, AI Search, AI Search Pro, Deep Research, and Deep Research Pro operations.
