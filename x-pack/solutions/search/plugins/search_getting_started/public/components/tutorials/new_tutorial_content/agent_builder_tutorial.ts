/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  TutorialDefinition,
  TutorialStep,
  CleanupItem,
} from '../../../hooks/use_tutorial_content';
import { sampleAgentBuilderData } from './sample_data_sets';

const agentBuilderTutorialSteps: TutorialStep[] = [
  {
    id: 'create_sample_data',
    type: 'apiCall',
    header: '## Step 1: Create an index with mappings',
    description:
      'Create an index with book data that agents and tools will work with throughout this tutorial.',
    apiSnippet: `PUT /kibana_sample_data_agents
{
  "mappings": {
    "properties": {
      "name": { "type": "text" },
      "author": { "type": "text" },
      "release_date": { "type": "date" },
      "page_count": { "type": "integer" }
    }
  }
}`,
    valuesToInsert: [],
    valuesToSave: {
      index_name: 'index',
    },
    explanation:
      'The index `{{index_name}}` was created with mappings for name, author, release_date, and page_count. This will be the data source for our agent tools.',
  },
  {
    id: 'bulk_index',
    type: 'ingestData',
    header: '## Step 2: Index sample books',
    description:
      'Add books to `{{index_name}}` using the bulk API so the agent has data to query. Each document has the following shape:',
    apiSnippet: `POST /{{index_name}}/_bulk
{
  "name": "Snow Crash",
  "author": "Neal Stephenson",
  "release_date": "1992-06-01",
  "page_count": 470
}`,
    valuesToInsert: ['index_name'],
    valuesToSave: {
      bulk_items: 'items.length',
    },
    explanation:
      '{{bulk_items}} books were indexed into `{{index_name}}`. The agent can now use tools to search and analyze this data.',
  },
  {
    id: 'chat_default_agent',
    type: 'apiCall',
    header: '## Step 3: Chat with the default agent',
    description:
      'Send a message to the default agent using the converse API. The agent uses its built-in tools to query `{{index_name}}` and respond with information about the data.',
    apiSnippet: `POST kbn://api/agent_builder/converse
{
  "input": "What books are in the {{index_name}} index?"
}`,
    valuesToInsert: ['index_name'],
    valuesToSave: {
      default_conversation_id: 'conversation_id',
      default_input_tokens: 'model_usage.input_tokens',
      default_output_tokens: 'model_usage.output_tokens',
      default_llm_calls: 'model_usage.llm_calls',
    },
    explanation:
      'The default agent responded using its built-in tools. A conversation was created with ID `{{default_conversation_id}}`. The agent made **{{default_llm_calls}} LLM calls** and consumed **{{default_input_tokens}} input tokens** and **{{default_output_tokens}} output tokens**. Keep these numbers in mind — we will compare them later with a custom agent that uses optimized tools.',
  },
  {
    id: 'list_tools',
    type: 'apiCall',
    header: '## Step 4: List available tools',
    description:
      'View all available tools, including the built-in platform tools. Tools are reusable functions that agents call to perform specific tasks like searching indices and generating queries.',
    apiSnippet: `GET kbn://api/agent_builder/tools`,
    valuesToInsert: [],
    valuesToSave: {},
    explanation:
      'The response lists all available tools. Built-in tools handle common operations like index search, ES|QL generation, and document retrieval. You can also create custom tools tailored to your specific use cases.',
  },
  {
    id: 'create_custom_tool',
    type: 'apiCall',
    header: '## Step 5: Create a custom ES|QL tool',
    description:
      'Create a custom tool that runs a specific ES|QL query against `{{index_name}}`. Custom tools let you predefine queries so agents can execute them efficiently without reasoning through the full query from scratch.',
    apiSnippet: `POST kbn://api/agent_builder/tools
{
  "id": "example-books-esql-tool",
  "type": "esql",
  "description": "An ES|QL query tool for finding the longest books published before a certain year",
  "configuration": {
    "query": "FROM {{index_name}} | WHERE DATE_EXTRACT(\\"year\\", release_date) < ?maxYear | SORT page_count DESC | LIMIT ?limit",
    "params": {
      "maxYear": {
        "type": "integer",
        "description": "Maximum year to filter books (exclusive)"
      },
      "limit": {
        "type": "integer",
        "description": "Maximum number of results to return"
      }
    }
  }
}`,
    valuesToInsert: ['index_name'],
    valuesToSave: {
      tool_id: 'id',
    },
    explanation:
      'Custom tool `{{tool_id}}` was created. It accepts `maxYear` and `limit` parameters, making it reusable for different queries against the same index. The ES|QL query uses `?paramName` syntax for parameterized values.',
  },
  {
    id: 'run_custom_tool',
    type: 'apiCall',
    header: '## Step 6: Run the custom tool',
    description:
      'Execute the `{{tool_id}}` tool directly with parameters to find the 2 longest books published before 1960.',
    apiSnippet: `POST kbn://api/agent_builder/tools/_execute
{
  "tool_id": "{{tool_id}}",
  "tool_params": {
    "maxYear": 1960,
    "limit": 2
  }
}`,
    valuesToInsert: ['tool_id'],
    valuesToSave: {},
    explanation:
      'The tool returned results in `tabular_data` format showing the query output. Running tools directly is useful for testing before assigning them to an agent.',
  },
  {
    id: 'create_agent',
    type: 'apiCall',
    header: '## Step 7: Create a custom agent',
    description:
      'Create an agent that combines instructions with a curated set of tools. This agent is scoped to the `{{index_name}}` index and uses both the custom tool and built-in platform tools.',
    apiSnippet: `POST kbn://api/agent_builder/agents
{
  "id": "books-search-agent",
  "name": "Books Search Helper",
  "description": "Search and analyze the sample books collection.",
  "labels": ["books", "sample-data", "search"],
  "avatar_color": "#BFDBFF",
  "avatar_symbol": "books",
  "configuration": {
    "instructions": "You are a helpful agent that assists users in searching and analyzing book data from the {{index_name}} index. Help users find books by author, title, or analyze reading patterns.",
    "tools": [
      {
        "tool_ids": [
          "{{tool_id}}",
          "platform.core.search",
          "platform.core.list_indices",
          "platform.core.get_index_mapping",
          "platform.core.get_document_by_id"
        ]
      }
    ]
  }
}`,
    valuesToInsert: ['index_name', 'tool_id'],
    valuesToSave: {
      agent_id: 'id',
    },
    explanation:
      'Agent `{{agent_id}}` was created with the custom `{{tool_id}}` tool and selected platform tools. By scoping an agent to specific tools, you control what it can do and reduce token consumption.',
  },
  {
    id: 'chat_custom_agent',
    type: 'apiCall',
    header: '## Step 8: Chat with the custom agent',
    description:
      'Send a question to `{{agent_id}}` and observe how it uses the custom tool to answer efficiently. Compare the token usage here with the default agent in Step 3.',
    apiSnippet: `POST kbn://api/agent_builder/converse
{
  "input": "Can you find the longest book published before 1960?",
  "agent_id": "{{agent_id}}"
}`,
    valuesToInsert: ['agent_id'],
    valuesToSave: {
      custom_conversation_id: 'conversation_id',
      custom_input_tokens: 'model_usage.input_tokens',
      custom_output_tokens: 'model_usage.output_tokens',
      custom_llm_calls: 'model_usage.llm_calls',
    },
    explanation:
      'The custom agent answered using conversation `{{custom_conversation_id}}`. It used **{{custom_input_tokens}} input tokens** and **{{custom_output_tokens}} output tokens** across **{{custom_llm_calls}} LLM calls**, compared to **{{default_input_tokens}} input tokens** and **{{default_output_tokens}} output tokens** across **{{default_llm_calls}} LLM calls** for the default agent in Step 3. Custom tools optimized for specific use cases significantly reduce token consumption and improve accuracy.',
  },
];

const agentBuilderTutorialCleanup: CleanupItem[] = [
  {
    label: 'Conversation: {{default_conversation_id}}',
    apiSnippet: 'DELETE kbn://api/agent_builder/conversations/{{default_conversation_id}}',
  },
  {
    label: 'Conversation: {{custom_conversation_id}}',
    apiSnippet: 'DELETE kbn://api/agent_builder/conversations/{{custom_conversation_id}}',
  },
  {
    label: 'Agent: books-search-agent',
    apiSnippet: 'DELETE kbn://api/agent_builder/agents/books-search-agent',
  },
  {
    label: 'Tool: example-books-esql-tool',
    apiSnippet: 'DELETE kbn://api/agent_builder/tools/example-books-esql-tool',
  },
  {
    label: 'Index: kibana_sample_data_agents',
    apiSnippet: 'DELETE /kibana_sample_data_agents',
  },
];

export const agentBuilderTutorial: TutorialDefinition = {
  slug: 'agent-builder',
  title: 'Agent Builder',
  description:
    'Build AI agents with the Elastic Agent Builder APIs — create custom tools, assemble agents, and chat with them.',
  globalVariables: {
    index_name: 'kibana_sample_data_agents',
  },
  sampleData: sampleAgentBuilderData,
  summary: {
    text: 'You created sample data, chatted with the default agent, built a custom ES|QL tool with parameters, assembled a custom agent with curated tools, and saw how purpose-built tools reduce token usage and improve accuracy.',
    links: [
      {
        label: 'Agent Builder API reference',
        href: 'https://www.elastic.co/docs/api/doc/kibana/group/endpoint-agent-builder',
      },
      {
        label: 'Learn more about Agent Builder',
        href: 'https://www.elastic.co/docs/explore-analyze/ai-features/elastic-agent-builder',
      },
      {
        label: 'Agent Builder MCP server',
        href: 'https://www.elastic.co/docs/explore-analyze/ai-features/agent-builder/mcp-server',
      },
      {
        label: 'A2A protocol for agent interoperability',
        href: 'https://www.elastic.co/docs/api/doc/kibana/operation/operation-get-agent-builder-a2a-agent-json',
      },
    ],
  },
  steps: agentBuilderTutorialSteps,
  cleanup: agentBuilderTutorialCleanup,
};
