/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ChatPromptTemplate } from '@langchain/core/prompts';

export const EXTRACT_COLUMNS_ESQL_QUERY_TEMPLATE =
  ChatPromptTemplate.fromTemplate(`You are a helpful ES|QL (Elasticsearch Query Language) expert agent.
 Your task to find the column names in the given ES|QL Query. You need to follow below guidelines

- You will be provided with a ES|QL query below.
- Try to find the columns that will be returned by the query and their types.
- The "type" field must use valid Elasticsearch field types: keyword, text, long, integer, short, byte, double, float, half_float, scaled_float, unsigned_long, date, boolean, ip, geo_point, geo_shape, version.
- Do NOT use generic types like "number" or "string". Use the specific Elasticsearch types instead (e.g. "long" or "double" for numeric fields, "keyword" for string fields).
- You must respond only with a valid json object inside a \`\`\`json code block in schema {{"columns":[{{"name":"name", "type":"type"}}]}}.
- When returning the columns array, make sure the aggregation (count, sum, min, max, avg) is the first item in the array.

<context>

<esql_query>
{esql_query}
</esql_query>

</context>
`);
