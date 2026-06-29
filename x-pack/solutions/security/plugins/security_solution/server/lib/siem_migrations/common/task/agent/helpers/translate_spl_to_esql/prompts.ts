/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ChatPromptTemplate } from '@langchain/core/prompts';
import { ECS_CATEGORIZATION_REFERENCE } from '../../../util/ecs_category_doc/ecs_categorization_reference';

export const TASK_DESCRIPTION = {
  migrate_rule: `Your task is to migrate a "detection rule" SPL search from Splunk to an Elasticsearch ES|QL query.`,
  migrate_dashboard: `Your task is to migrate a "dashboard" SPL search from Splunk to an Elasticsearch ES|QL query.`,
};

export const ESQL_SYNTAX_TRANSLATION_PROMPT =
  ChatPromptTemplate.fromTemplate(`You are a helpful cybersecurity (SIEM) expert agent. {task_description}
Your goal is to translate the SPL query syntax into an equivalent Elastic Search Query Language (ES|QL) query.
{field_mapping_instructions}
Also you'll need to write a summary at the end in markdown language.

Here are some context for you to reference for your task, read it carefully as you will get questions about it later:
<context>
<splunk_query>
{splunk_query}
</splunk_query>
<index_knowledge_base>
The following is the index knowledge base containing mappings, sample documents and any extra knowledge for the target index. This can be used to ensure correct field names and sometimes values that are used when generating the query.
\`\`\`json
{index_knowledge_base}
\`\`\`
</index_knowledge_base>
<placeholders_syntax>
If you encounter any placeholders for macros or lookups in the SPL query, leave them as-is in the ES|QL query output. They are markers that need to be preserved.
They are wrapped in brackets ("[]") and always start with "macro:" or "lookup:". Mention all placeholders you left in the final summary.
Examples of macros and lookups placeholders:
- [macro:someMacroName(3)]
- [macro:another_macro]
- [lookup:someLookup_name]
</placeholders_syntax>
<splunk_form_tokens>
IMPORTANT: Splunk form tokens (variables wrapped in dollar signs like $building_filter$, $user_filter$, $time_range.earliest$) are NOT supported in ES|QL.
These are dynamic filter tokens from Splunk forms/dashboards. We currently do not support tokens in the $...$ format or the ?parameter format.
You MUST handle them as follows:
- Remove ALL conditions that reference "$token$" variables (e.g., WHERE field="$token$" OR "$token$"="*" must be removed entirely)
- Do NOT translate $token$ patterns into ES|QL — not as "$token$" strings, not as ?parameter placeholders, not in any other form
- The resulting ES|QL query MUST NOT contain any $...$ or ?... token references
- Mention the removed tokens in the translation summary
</splunk_form_tokens>
<lookup_syntax>
If in an SPL query you identify a lookup call, it should be translated the following way:
\`\`\`spl
... | lookup users uid OUTPUTNEW username, department
\`\`\`

In the above example it uses the following syntax:
lookup 'index_name' 'field_to_match' OUTPUTNEW 'field1', 'field2'

However in the ES|QL query, some of the information is removed and should be used in the following way:
\`\`\`esql
... | LOOKUP JOIN 'index_name' ON 'field_to_match'
\`\`\`
We do not define OUTPUTNEW or which fields is returned, only the index name and the field to match.

Mention all translated lookups in the final summary.
</lookup_syntax>
<ecs_categorization>
${ECS_CATEGORIZATION_REFERENCE}
</ecs_categorization>
</context>

Go through each step and part of the splunk_query while following the below guide to produce the resulting ES|QL query:
- Analyze all the information about the related splunk query and try to determine the intent of the query, in order to translate into an equivalent ES|QL query.
{field_mapping_steps}
- However, DO use the ecs_categorization reference above to add appropriate ECS categorization fields (event.category, event.type, and event.outcome) as WHERE clauses in the ES|QL query, based on the intent of the rule. Only use the allowed values defined in the reference. If no categorization fits, leave these fields out.
- Always remember to translate any lookup list using the lookup_syntax above

<guidelines>
- Analyze the SPL query and identify the key components.
{field_mapping_guidelines}
- Always start the resulting ES|QL query with "FROM {index_pattern}". We will set the correct index pattern later on, so do not mention anything about index patterns in the summary. DO NOT make up any other index pattern
- Always remember to leave placeholders matching the ones defined in the placeholders_syntax context as they are, don't replace or drop them. Others can be dropped for the sake of a valid query.
- Always remember to remove any Splunk form tokens ($...$) and never use ?parameter placeholders in the resulting ES|QL query as described in the splunk_form_tokens context above.
- Always remember to translate any lookup (that are not inside a placeholder) using the lookup_syntax rules above.
</guidelines>

<output_format>
- First, the ES|QL query inside an \`\`\`esql code block.
- At the end, the summary of the translation process followed in markdown, starting with "## Translation Summary".
  - Inside SPL language code blocks, Please add a line break before each pipe (|) character in the query.
  - Make sure the Markdown is formatted correctly and the values properly escaped.
- Don't add any other information or explanation before or after these two outputs.
- Always use the provided index pattern {index_pattern} in the output, do not use a different index pattern. This is very important.
</output_format>

<example_output>
\`\`\`esql
FROM {index_pattern}
| STATS count = COUNT(*) BY event.dataset, service.type
| LIMIT 100
\`\`\`
## Translation Summary
- The original SPL query was analyzed and the intent was determined.
- The resulting ES|QL query was constructed by following the guidelines.

## Translation Summary

Detailed summary of translations should be included here with following areas covered.
Use <guidelines> as checklist to make sure that all mentioned points have been covered.

### What was Translated

- The original SPL query was analyzed and the intent was determined.
- Explain here in detail which parts of the Natural Language query were successfully translated into ESQL, and how. If there are any specific ESQL commands or syntax that were used to achieve the translation, explain that as well.

### What could not be Translated

- Explain here in detail which parts of the Natural Language query could not be translated into ESQL, and why. If there are any specific limitations or challenges that prevented the translation, explain that as well.

### Recommendations

- Include any recommendations that user can follow to improve the query coverage.

</example_output>
`);
