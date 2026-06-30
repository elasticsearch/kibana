/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// Template data for ESQL command documentation
// The generate_esql_command_docs.ts script will convert this to TSX with React components

export const processingCommandsIntro = {
  labelKey: 'languageDocumentation.documentationESQL.processingCommands',
  labelDefaultMessage: 'Processing commands',
  descriptionKey: 'languageDocumentation.documentationESQL.processingCommandsDescription',
  descriptionDefaultMessage: `Processing commands change an input table by adding, removing, or changing rows and columns. ES|QL supports the following processing commands.`,
};

export const processingCommandsItems = [
  {
    name: 'change_point',
    labelDefaultMessage: 'CHANGE_POINT',
    descriptionDefaultMessage: `### CHANGE POINT
\`CHANGE POINT\`detects spikes, dips, and change points in a metric.

The command adds columns to the table with the change point type and p-value, that indicates how extreme the change point is (lower values indicate greater changes).

The possible change point types are:

* \`dip\`: a significant dip occurs at this change point
* \`distribution_change\`: the overall distribution of the values has changed significantly
* \`spike\`: a significant spike occurs at this point
* \`step_change\`: the change indicates a statistically significant step up or down in value distribution
* \`trend_change\`: there is an overall trend change occurring at this point

Note that there must be at least 22 values for change point detection. Fewer than 1,000 is preferred.

**Syntax**

\`\`\` esql
CHANGE_POINT value [ON key] [AS type_name, pvalue_name]
\`\`\`

**Parameters**

* \`value\`: The column with the metric in which you want to detect a change point.
* \`key\`: The column with the key to order the values by. If not specified, @timestamp is used.
* \`type_name\`: The name of the output column with the change point type. If not specified, type is used.
* \`pvalue_name\`: The name of the output column with the p-value that indicates how extreme the change point is. If not specified, pvalue is used.

**Example**

The following example shows the detection of a step change:

\`\`\` esql
ROW key=[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25]
| MV_EXPAND key
| EVAL value = CASE(key<13, 0, 42)
| CHANGE_POINT value ON key
| WHERE type IS NOT NULL
\`\`\`

| key:integer | value:integer | type:keyword | pvalue:double |
|-------------|---------------|--------------|---------------|
| 13          | 42            | step_change  | 0.0           |

`,
    descriptionOptions: {
      ignoreTag: true,
      description:
        'Text is in markdown. Do not translate function names, special characters, or field names like sum(bytes)',
    },
    openLinksInNewTab: true,
    preview: true,
  },
  {
    name: 'completion',
    labelDefaultMessage: 'COMPLETION',
    descriptionDefaultMessage: `### COMPLETION

The \`COMPLETION\` processing command uses a machine learning model to generate text completions based on the provided prompt. The command works with any LLM deployed to the [Elasticsearch inference API](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-inference-put) and can be chained with other ES|QL commands for further processing.

**Syntax**

\`\`\` esql
COMPLETION [column =] prompt WITH '{ "inference_id" : "my_inference_endpoint" }'
\`\`\`

**Parameters**

* \`column\`: (Optional) The name of the output column that will contain the completion results. If not specified, the results will be stored in a column named \`completion\`. If the specified column already exists, it will be overwritten with the new completion results.
* \`prompt\`: The input text or expression that will be used as the prompt for the completion. This can be a string literal or a reference to a column containing text.
* \`my_inference_endpoint\`: The ID of the inference endpoint to use for text completion. The inference endpoint must be configured with the \`completion\` task type.

**Best practices**

Every row processed by the COMPLETION command generates a separate API call to the LLM endpoint.

Be careful to test with small datasets first before running on production data or in automated workflows, to avoid unexpected costs.

1. **Start with dry runs**: Validate your query logic and row counts by running without \`COMPLETION\` initially. Use \`| STATS count = COUNT(*)\` to check result size.
2. **Filter first**: Use \`WHERE\` clauses to limit rows before applying \`COMPLETION\`.
3. **Test with \`LIMIT\`**: Always start with a low \`LIMIT\` and gradually increase.
4. **Monitor usage**: Track your LLM API consumption and costs.

**Examples**

The following is a basic example with an inline prompt:

\`\`\` esql
ROW question = "What is Elasticsearch?"
| COMPLETION answer = question WITH '{ "inference_id" : "my_inference_endpoint" }'
| KEEP question, answer
\`\`\`

| question:keyword | answer:keyword |
|------------------|----------------|
| What is Elasticsearch? | A distributed search and analytics engine |

This example uses a prompt constructed from multiple columns to generate a summary:

\`\`\` esql
FROM movies
| SORT rating DESC
| LIMIT 10
| EVAL prompt = CONCAT(
   "Summarize this movie using the following information: \\\\n",
   "Title: ", title, "\\\\n",
   "Synopsis: ", synopsis, "\\\\n",
   "Actors: ", MV_CONCAT(actors, ", "), "\\\\n",
  )
| COMPLETION summary = prompt WITH '{ "inference_id" : "my_inference_endpoint" }'
| KEEP title, summary, rating
\`\`\`

| title:keyword | summary:keyword | rating:double |
|---------------|-----------------|---------------|
| The Shawshank Redemption | A tale of hope and redemption in prison. | 9.3 |
| The Godfather | A mafia family's rise and fall. | 9.2 |
| The Dark Knight | Batman battles the Joker in Gotham. | 9.0 |
| Pulp Fiction | Interconnected crime stories with dark humor. | 8.9 |
| Fight Club | A man starts an underground fight club. | 8.8 |
| Inception | A thief steals secrets through dreams. | 8.8 |
| The Matrix | A hacker discovers reality is a simulation. | 8.7 |
| Parasite | Class conflict between two families. | 8.6 |
| Interstellar | A team explores space to save humanity. | 8.6 |
| The Prestige | Rival magicians engage in dangerous competition. | 8.5 |

`,
    descriptionOptions: {
      ignoreTag: true,
      description:
        'Text is in markdown. Do not translate function names, special characters, or field names like COMPLETION, prompt, inference_id',
    },
    openLinksInNewTab: true,
    preview: true,
  },
  {
    name: 'dissect',
    labelDefaultMessage: 'DISSECT',
    descriptionDefaultMessage: `### DISSECT
\`DISSECT\` enables you to extract structured data out of a string. \`DISSECT\` matches the string against a delimiter-based pattern, and extracts the specified keys as columns.

Refer to the [dissect processor documentation](https://www.elastic.co/guide/en/elasticsearch/reference/current/dissect-processor.html) for the syntax of dissect patterns.

\`\`\` esql
ROW a = "1953-01-23T12:15:00Z - some text - 127.0.0.1"
| DISSECT a "%'\\{Y\\}-%\\{M\\}-%\\{D\\}T%\\{h\\}:%\\{m\\}:%\\{s\\}Z - %\\{msg\\} - %\\{ip\\}'"
\`\`\`            `,
    descriptionOptions: {
      ignoreTag: true,
      description:
        'Text is in markdown. Do not translate function names, special characters, or field names like sum(bytes)',
    },
    openLinksInNewTab: true,
  },
  {
    name: 'drop',
    labelDefaultMessage: 'DROP',
    descriptionDefaultMessage: `### DROP
Use \`DROP\` to remove columns from a table:

\`\`\` esql
FROM employees
| DROP height
\`\`\`

Rather than specify each column by name, you can use wildcards to drop all columns with a name that matches a pattern:

\`\`\` esql
FROM employees
| DROP height*
\`\`\`
            `,
    descriptionOptions: {
      description:
        'Text is in markdown. Do not translate function names, special characters, or field names like sum(bytes)',
    },
  },
  {
    name: 'enrich',
    labelDefaultMessage: 'ENRICH',
    descriptionDefaultMessage: `### ENRICH
You can use \`ENRICH\` to add data from your existing indices to incoming records. It's similar to [ingest enrich](https://www.elastic.co/guide/en/elasticsearch/reference/current/ingest-enriching-data.html), but it works at query time.

\`\`\` esql
ROW language_code = "1"
| ENRICH languages_policy
\`\`\`

\`ENRICH\` requires an [enrich policy](https://www.elastic.co/guide/en/elasticsearch/reference/current/ingest-enriching-data.html#enrich-policy) to be executed. The enrich policy defines a match field (a key field) and a set of enrich fields.

\`ENRICH\` will look for records in the [enrich index](https://www.elastic.co/guide/en/elasticsearch/reference/current/ingest-enriching-data.html#enrich-index) based on the match field value. The matching key in the input dataset can be defined using \`ON <field-name>\`; if it's not specified, the match will be performed on a field with the same name as the match field defined in the enrich policy.

\`\`\` esql
ROW a = "1"
| ENRICH languages_policy ON a
\`\`\`

You can specify which attributes (between those defined as enrich fields in the policy) have to be added to the result, using \`WITH <field1>, <field2>...\` syntax.

\`\`\` esql
ROW a = "1"
| ENRICH languages_policy ON a WITH language_name
\`\`\`

Attributes can also be renamed using \`WITH new_name=<field1>\`

\`\`\` esql
ROW a = "1"
| ENRICH languages_policy ON a WITH name = language_name
\`\`\`

By default (if no \`WITH\` is defined), \`ENRICH\` will add all the enrich fields defined in the enrich policy to the result.

In case of name collisions, the newly created fields will override the existing fields.
            `,
    descriptionOptions: {
      ignoreTag: true,
      description:
        'Text is in markdown. Do not translate function names, special characters, or field names like sum(bytes)',
    },
    openLinksInNewTab: true,
  },
  {
    name: 'eval',
    labelDefaultMessage: 'EVAL',
    descriptionDefaultMessage: `### EVAL
\`EVAL\` enables you to add new columns:

\`\`\` esql
FROM employees
| KEEP first_name, last_name, height
| EVAL height_feet = height * 3.281, height_cm = height * 100
\`\`\`

If the specified column already exists, the existing column will be dropped, and the new column will be appended to the table:

\`\`\` esql
FROM employees
| KEEP first_name, last_name, height
| EVAL height = height * 3.281
\`\`\`

#### Functions
\`EVAL\` supports various functions for calculating values. Refer to Functions for more information.
            `,
    descriptionOptions: {
      description:
        'Text is in markdown. Do not translate function names, special characters, or field names like sum(bytes)',
    },
  },
  {
    name: 'fork',
    labelDefaultMessage: 'FORK',
    descriptionDefaultMessage: `### FORK
\`FORK\` creates multiple execution branches to operate on the same input data and combines the results in a single output table.

\`\`\` esql
FORK ( <processing_commands> ) ( <processing_commands> ) ... ( <processing_commands> )
\`\`\`

**Description**

The \`FORK\` processing command creates multiple execution branches to operate
on the same input data and combines the results in a single output table. A discriminator column (\`_fork\`) is added to identify which branch each row came from.

**Branch identification:**
- The \`_fork\` column identifies each branch with values like \`fork1\`, \`fork2\`, \`fork3\`, etc.
- Values correspond to the order in which branches are defined
- \`fork1\` always indicates the first branch

**Column handling:**
- \`FORK\` branches can output different columns
- Columns with the same name must have the same data type across all branches
- Missing columns are filled with \`null\` values

**Row ordering:**
- \`FORK\` preserves row order within each branch
- Rows from different branches may be interleaved
- Use \`SORT _fork\` to group results by branch

NOTE:
\`FORK\` branches default to \`LIMIT 1000\` if no \`LIMIT\` is provided.

**Limitations**

- \`FORK\` supports at most 8 execution branches.
- Using remote cluster references and \`FORK\` is not supported.
- Using more than one \`FORK\` command in a query is not supported.

**Examples**

In the following example, each \`FORK\` branch returns one row.
Notice how \`FORK\` adds a \`_fork\` column that indicates which row the branch originates from:

\`\`\` esql
FROM employees
| FORK ( WHERE emp_no == 10001 )
       ( WHERE emp_no == 10002 )
| KEEP emp_no, _fork
| SORT emp_no
\`\`\`

| emp_no:integer | _fork:keyword |
| --- | --- |
| 10001 | fork1 |
| 10002 | fork2 |

The next example, returns total number of rows that match the query along with
the top five rows sorted by score.

\`\`\`esql
FROM books METADATA _score
| WHERE author:"Faulkner"
| EVAL score = round(_score, 2)
| FORK (SORT score DESC, author | LIMIT 5 | KEEP author, score)
       (STATS total = COUNT(*))
| SORT _fork, score DESC, author
\`\`\`

| author:text | score:double | _fork:keyword | total:long |
| --- | --- | --- | --- |
| William Faulkner | 2.39 | fork1 | null |
| William Faulkner | 2.39 | fork1 | null |
| Colleen Faulkner | 1.59 | fork1 | null |
| Danny Faulkner | 1.59 | fork1 | null |
| Keith Faulkner | 1.59 | fork1 | null |
| null | null | fork2 | 18 |
            `,
    descriptionOptions: {
      description:
        'Text is in markdown. Do not translate function names, special characters, or field names like sum(bytes)',
      ignoreTag: true,
    },
    openLinksInNewTab: true,
  },
  {
    name: 'fuse',
    labelDefaultMessage: 'FUSE',
    descriptionDefaultMessage: `### FUSE

The \`FUSE\` [processing command](https://www.elastic.co/docs/reference/query-languages/esql/commands/processing-commands) merges rows from multiple result sets and assigns new relevance scores. \`FUSE\` is for search use cases. Learn more about [how search works in ES|QL](https://www.elastic.co/docs/solutions/search/esql-for-search#how-search-works-in-esql).

Together with \`FORK\`, \`FUSE\` enables [hybrid search](https://www.elastic.co/docs/reference/query-languages/esql/esql-search-tutorial#perform-hybrid-search) to combine and score results from multiple queries.

\`FUSE\` works by:

1. Merging rows with matching \`<key_columns>\` values
2. Assigning new relevance scores using the specified \`<fuse_method>\` algorithm and the values from the \`<group_column>\` and \`<score_column>\`
#### Syntax

Use default parameters:

\`\`\` esql
FUSE
\`\`\`

Specify custom parameters:

\`\`\` esql
FUSE <fuse_method> SCORE BY <score_column> GROUP BY <group_column> KEY BY <key_columns> WITH <options>
\`\`\`

#### Parameters

\`fuse_method\`
:   Defaults to \`RRF\`. Can be one of \`RRF\` (for [Reciprocal Rank Fusion](https://cormack.uwaterloo.ca/cormacksigir09-rrf.pdf)) or \`LINEAR\` (for linear combination of scores). Designates which method to use to assign new relevance scores.

\`score_column\`
:   Defaults to \`_score\`. Designates which column to use to retrieve the relevance scores of the input row and where to output the new relevance scores of the merged rows.

\`group_column\`
:   Defaults to \`_fork\`. Designates which column represents the result set.

\`key_columns\`
:   Defaults to \`_id, _index\`. Rows with matching values for these columns are merged.

\`options\`
:   Options for the \`fuse_method\`.

\`rank_constant\`
:   Defaults to \`60\`. Represents the \`rank_constant\` used in the RRF formula.

\`weights\`
:   Defaults to \'\{\}\' (empty object). Allows you to set different weights based on \`group_column\` values.

\`normalizer\`
:   Defaults to \`none\`. Can be one of \`none\` or \`minmax\`. Specifies which score normalization method to apply.

#### Examples

- Use RRF to merge two ranked result sets.

\`\`\` esql
FROM books METADATA _id, _index, _score
| FORK (WHERE title:"Shakespeare" | SORT _score DESC)
       (WHERE semantic_title:"Shakespeare" | SORT _score DESC)
| FUSE
\`\`\`

Refer to the [reference documentation](https://www.elastic.co/docs/reference/query-languages/esql/commands/fuse) for more information, including additional examples and limitations.
            `,
    descriptionOptions: {
      description:
        'Text is in markdown. Do not translate function names, special characters, or field names like sum(bytes)',
      ignoreTag: true,
    },
    openLinksInNewTab: true,
  },
  {
    name: 'grok',
    labelDefaultMessage: 'GROK',
    descriptionDefaultMessage: `### GROK
\`GROK\` enables you to extract structured data out of a string. \`GROK\` matches the string against patterns, based on regular expressions, and extracts the specified patterns as columns.

Refer to the [grok processor documentation](https://www.elastic.co/guide/en/elasticsearch/reference/current/grok-processor.html) for the syntax of grok patterns.

\`\`\` esql
ROW a = "12 15.5 15.6 true"
| GROK a "%'\\{NUMBER:b:int\\} %\\{NUMBER:c:float\\} %\\{NUMBER:d:double\\} %\\{WORD:e:boolean\\}'"
\`\`\`
            `,
    descriptionOptions: {
      description:
        'Text is in markdown. Do not translate function names, special characters, or field names like sum(bytes)',
    },
    openLinksInNewTab: true,
  },
  {
    name: 'inline_stats',
    labelDefaultMessage: 'INLINE STATS',
    descriptionDefaultMessage: `### INLINE STATS
\`INLINE STATS\` groups rows according to a common value
and calculates one or more aggregated values over the grouped rows. The results
are appended as new columns to the input rows.

The command is identical to [\`STATS\`](https://www.elastic.co/docs/reference/query-languages/esql/commands/stats-by) except that it preserves all the columns from the input table.

\`\`\` esql
INLINE STATS [column1 =] expression1 [WHERE boolean_expression1][,
      ...,
      [columnN =] expressionN [WHERE boolean_expressionN]]
      [BY [grouping_name1 =] grouping_expression1[,
          ...,
          [grouping_nameN = ] grouping_expressionN]]
\`\`\`

**Parameters**

\`columnX\`
:   The name by which the aggregated value is returned. If omitted, the name is
    equal to the corresponding expression (\`expressionX\`).
    If multiple columns have the same name, all but the rightmost column with this
    name will be ignored.

\`expressionX\`
:   An expression that computes an aggregated value.

\`grouping_expressionX\`
:   An expression that outputs the values to group by.
    If its name coincides with one of the existing or computed columns, that column will be overridden by this one.

\`boolean_expressionX\`
:   The condition that determines which rows are included when evaluating \`expressionX\`.

NOTE: Individual \`null\` values are skipped when computing aggregations.

**Description**

The \`INLINE STATS\` processing command groups rows according to a common value
(also known as the grouping key), specified after \`BY\`, and calculates one or more
aggregated values over the grouped rows. The output table contains the same
number of rows as the input table. The command only adds new columns or overrides
existing columns with the same name as the result.

If column names overlap, existing column values may be overridden and column order
may change. The new columns are added/moved so that they appear in the order
they are defined in the \`INLINE STATS\` command.

For the calculation of each aggregated value, the rows in a group can be filtered with
\`WHERE\`. If \`BY\` is omitted the aggregations are applied over the entire dataset.

Refer to the [documentation](https://www.elastic.co/docs/reference/query-languages/esql/commands/inlinestats-by) for the list of supported aggregation and grouping functions.

**Limitations**

- The [\`CATEGORIZE\`](/reference/query-languages/esql/functions-operators/grouping-functions.md#esql-categorize) grouping function is not currently supported.
- \`INLINE STATS\` cannot yet have an unbounded [\`SORT\`](/reference/query-languages/esql/commands/sort.md) before it.
You must either move the SORT after it, or add a [\`LIMIT\`](/reference/query-languages/esql/commands/limit.md) before the [\`SORT\`](/reference/query-languages/esql/commands/sort.md).

**Examples**

The following example shows how to calculate a statistic on one column and group
by the values of another column.

NOTE:
The \`languages\` column moves to the last position in the output table because it is
a column overridden by the \`INLINE STATS\` command (it's the grouping key) and it is the last column defined by it.

\`\`\`esql
FROM employees
| KEEP emp_no, languages, salary
| INLINE STATS max_salary = MAX(salary) BY languages
\`\`\`

| emp_no:integer | salary:integer | max_salary:integer | languages:integer |
| --- | --- | --- | --- |
| 10001 | 57305 | 73578 | 2 |
| 10002 | 56371 | 66817 | 5 |
| 10003 | 61805 | 74572 | 4 |
| 10004 | 36174 | 66817 | 5 |
| 10005 | 63528 | 73717 | 1 |

The following example shows how to calculate an aggregation over the entire dataset
by omitting \`BY\`. The order of the existing columns is preserved and a new column
with the calculated maximum salary value is added as the last column:

\`\`\`esql
FROM employees
| KEEP emp_no, languages, salary
| INLINE STATS max_salary = MAX(salary)
\`\`\`

| emp_no:integer | languages:integer | salary:integer | max_salary:integer |
| --- | --- | --- | --- |
| 10001 | 2 | 57305 | 74999 |
| 10002 | 5 | 56371 | 74999 |
| 10003 | 4 | 61805 | 74999 |
| 10004 | 5 | 36174 | 74999 |
| 10005 | 1 | 63528 | 74999 |

The following example shows how to calculate multiple aggregations with multiple grouping keys:

\`\`\`esql
FROM employees
| WHERE still_hired
| KEEP emp_no, languages, salary, hire_date
| EVAL tenure = DATE_DIFF("year", hire_date, "2025-09-18T00:00:00")
| DROP hire_date
| INLINE STATS avg_salary = AVG(salary), count = count(*) BY languages, tenure
\`\`\`

| emp_no:integer | salary:integer | avg_salary:double | count:long | languages:integer | tenure:integer |
| --- | --- | --- | --- | --- | --- |
| 10001 | 57305 | 51130.5 | 2 | 2 | 39 |
| 10002 | 56371 | 40180.0 | 3 | 5 | 39 |
| 10004 | 36174 | 30749.0 | 2 | 5 | 38 |
| 10005 | 63528 | 63528.0 | 1 | 1 | 36 |
| 10007 | 74572 | 58644.0 | 2 | 4 | 36 |

The following example shows how to filter which rows are used for each aggregation, using the \`WHERE\ clause:

\`\`\`esql
FROM employees
| KEEP emp_no, salary
| INLINE STATS avg_lt_50 = ROUND(AVG(salary)) WHERE salary < 50000,
               avg_lt_60 = ROUND(AVG(salary)) WHERE salary >=50000 AND salary < 60000,
               avg_gt_60 = ROUND(AVG(salary)) WHERE salary >= 60000
\`\`\`

| emp_no:integer | salary:integer | avg_lt_50:double | avg_lt_60:double | avg_gt_60:double |
| --- | --- | --- | --- | --- |
| 10001 | 57305 | 38292.0 | 54221.0 | 67286.0 |
| 10002 | 56371 | 38292.0 | 54221.0 | 67286.0 |
| 10003 | 61805 | 38292.0 | 54221.0 | 67286.0 |
| 10004 | 36174 | 38292.0 | 54221.0 | 67286.0 |
| 10005 | 63528 | 38292.0 | 54221.0 | 67286.0 |
            `,
    descriptionOptions: {
      description:
        'Text is in markdown. Do not translate function names, special characters, or field names like sum(bytes)',
      ignoreTag: true,
    },
    openLinksInNewTab: true,
    preview: true,
  },
  {
    name: 'keep',
    labelDefaultMessage: 'KEEP',
    descriptionDefaultMessage: `### KEEP
The \`KEEP\` command enables you to specify what columns are returned and the order in which they are returned.

To limit the columns that are returned, use a comma-separated list of column names. The columns are returned in the specified order:

\`\`\` esql
FROM employees
| KEEP first_name, last_name, height
\`\`\`

Rather than specify each column by name, you can use wildcards to return all columns with a name that matches a pattern:

\`\`\` esql
FROM employees
| KEEP h*
\`\`\`

The asterisk wildcard (\`*\`) by itself translates to all columns that do not match the other arguments. This query will first return all columns with a name that starts with an h, followed by all other columns:

\`\`\` esql
FROM employees
| KEEP h*, *
\`\`\`
            `,
    descriptionOptions: {
      description:
        'Text is in markdown. Do not translate function names, special characters, or field names like sum(bytes)',
    },
  },
  {
    name: 'limit',
    labelDefaultMessage: 'LIMIT',
    descriptionDefaultMessage: `### LIMIT
The \`LIMIT\` processing command enables you to limit the number of rows:

\`\`\` esql
FROM employees
| LIMIT 5
\`\`\`
            `,
    descriptionOptions: {
      description:
        'Text is in markdown. Do not translate function names, special characters, or field names like sum(bytes)',
    },
  },
  {
    name: 'lookup',
    labelDefaultMessage: 'LOOKUP JOIN',
    descriptionDefaultMessage: `### LOOKUP JOIN
You can use \`LOOKUP JOIN\` to add data from an existing index to incoming rows. While this is similar to \`ENRICH\`, it does not require an enrich policy to be executed beforehand. Additionally, if multiple matching documents are found in the lookup index, they will generate multiple output rows.

\`\`\` esql
ROW language_code = 1
| LOOKUP JOIN languages ON language_code
\`\`\`

An index that is used in \`LOOKUP JOIN\` needs to be in lookup mode. This [index mode](https://www.elastic.co/docs/reference/elasticsearch/index-settings/index-modules#_static_index_settings) needs to be set when the index is created.

\`\`\` esql
PUT languages
'{
  "settings": {
    "index":{
      "mode":"lookup"
    }
  }
}'
\`\`\`

The join key field must have a compatible type and match the name of the field in the lookup index to find matching documents. You can use \`RENAME\` or \`EVAL\` to rename columns as needed.

\`\`\` esql
FROM employees
| EVAL language_code = languages
| LOOKUP JOIN languages ON language_code
\`\`\`

In case of name collisions, the fields from the lookup index will override the existing fields.
            `,
    descriptionOptions: {
      ignoreTag: true,
      description:
        'Text is in markdown. Do not translate function names, special characters, or field names like sum(bytes)',
    },
    openLinksInNewTab: true,
    preview: false,
  },
  {
    name: 'mv_expand',
    labelDefaultMessage: 'MV_EXPAND',
    descriptionDefaultMessage: `### MV_EXPAND
The \`MV_EXPAND\` processing command expands multivalued fields into one row per value, duplicating other fields:
\`\`\` esql
ROW a=[1,2,3], b="b", j=["a","b"]
| MV_EXPAND a
\`\`\`
            `,
    descriptionOptions: {
      description:
        'Text is in markdown. Do not translate function names, special characters, or field names like sum(bytes)',
    },
    preview: true,
  },
  {
    name: 'rename',
    labelDefaultMessage: 'RENAME',
    descriptionDefaultMessage: `### RENAME
Use \`RENAME\` to rename a column using the following syntax:

\`\`\` esql
RENAME <old-name> AS <new-name>
\`\`\`

For example:

\`\`\` esql
FROM employees
| KEEP first_name, last_name, still_hired
| RENAME still_hired AS employed
\`\`\`

If a column with the new name already exists, it will be replaced by the new column.

Multiple columns can be renamed with a single \`RENAME\` command:

\`\`\` esql
FROM employees
| KEEP first_name, last_name
| RENAME first_name AS fn, last_name AS ln
\`\`\`
            `,
    descriptionOptions: {
      ignoreTag: true,
      description:
        'Text is in markdown. Do not translate function names, special characters, or field names like sum(bytes)',
    },
  },
  {
    name: 'rerank',
    labelDefaultMessage: 'RERANK',
    descriptionDefaultMessage: `### RERANK
\`RERANK\` uses an inference model to compute a new relevance score
for an initial set of documents, directly within your ES|QL queries.

\`\`\` esql
RERANK [column =] query ON field [, field, ...] [WITH '{ "inference_id" : "my_inference_endpoint" }']
\`\`\`

**Usage**

Typically, you first use a \`WHERE\` clause with a function like \`MATCH\` to
retrieve an initial set of documents. This set is often sorted by \`_score\` and
reduced to the top results (for example, 100) using \`LIMIT\`. The \`RERANK\`
command then processes this smaller, refined subset, which is a good balance
between performance and accuracy.

**Parameters**

\`column\`
:   (Optional) The name of the output column containing the reranked scores.
If not specified, the results will be stored in a column named \`_score\`.
If the specified column already exists, it will be overwritten with the new
results.

\`query\`
:   The query text used to rerank the documents. This is typically the same
query used in the initial search.

\`field\`
:   One or more fields to use for reranking. These fields should contain the
text that the reranking model will evaluate.

\`my_inference_endpoint\`
:   The ID of the inference endpoint to use for the task.
The inference endpoint must be configured with the \`rerank\` task type.

**Requirements**

To use this command, you must deploy your reranking model in Elasticsearch as
an [inference endpoint](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-inference-put)
with the
task type \`rerank\`.

#### Handling timeouts

\`RERANK\` commands may time out when processing large datasets or complex
queries. The default timeout is 10 minutes, but you can increase this limit if
necessary. Refer to [the documentation](https://www.elastic.co/docs/reference/query-languages/esql/commands/rerank#handling-timeouts) for more details.

**Examples**

Rerank search results using a simple query and a single field:

\`\`\`esql
FROM books METADATA _score
| WHERE MATCH(description, "hobbit")
| SORT _score DESC
| LIMIT 100
| RERANK "hobbit" ON description WITH '{ "inference_id" : "test_reranker" }'
| LIMIT 3
| KEEP title, _score
\`\`\`

| title:text | _score:double |
| --- | --- |
| Poems from the Hobbit | 0.0015673980815336108 |
| A Tolkien Compass: Including J. R. R. Tolkien's Guide to the Names in The Lord of the Rings | 0.007936508394777775 |
| Return of the King Being the Third Part of The Lord of the Rings | 9.960159659385681E-4 |

Rerank search results using a query and multiple fields, and store the new score
in a column named \`rerank_score\`:

\`\`\`esql
FROM books METADATA _score
| WHERE MATCH(description, "hobbit") OR MATCH(author, "Tolkien")
| SORT _score DESC
| LIMIT 100
| RERANK rerank_score = "hobbit" ON description, author WITH '{ "inference_id" : "test_reranker" }'
| SORT rerank_score
| LIMIT 3
| KEEP title, _score, rerank_score
\`\`\`

| title:text | _score:double | rerank_score:double |
| --- | --- | --- |
| Return of the Shadow | 2.8181066513061523 | 5.740527994930744E-4 |
| Return of the King Being the Third Part of The Lord of the Rings | 3.6248698234558105 | 9.000900317914784E-4 |
| The Lays of Beleriand | 1.3002015352249146 | 9.36329597607255E-4 |

Combine the original score with the reranked score:

\`\`\`esql
FROM books METADATA _score
| WHERE MATCH(description, "hobbit") OR MATCH(author, "Tolkien")
| SORT _score DESC
| LIMIT 100
| RERANK rerank_score = "hobbit" ON description, author WITH '{ "inference_id" : "test_reranker" }'
| EVAL original_score = _score, _score = rerank_score + original_score
| SORT _score
| LIMIT 3
| KEEP title, original_score, rerank_score, _score
\`\`\`

| title:text | _score:double | rerank_score:double | rerank_score:double |
| --- | --- | --- | --- |
| Poems from the Hobbit | 4.012462615966797 | 0.001396648003719747 | 0.001396648003719747 |
| The Lord of the Rings - Boxed Set | 3.768855094909668 | 0.0010020040208473802 | 0.001396648003719747 |
| Return of the King Being the Third Part of The Lord of the Rings | 3.6248698234558105 | 9.000900317914784E-4 | 0.001396648003719747 |
            `,
    descriptionOptions: {
      description:
        'Text is in markdown. Do not translate function names, special characters, or field names like sum(bytes)',
      ignoreTag: true,
    },
    openLinksInNewTab: true,
    preview: false,
  },
  {
    name: 'sample',
    labelDefaultMessage: 'SAMPLE',
    descriptionDefaultMessage: `### SAMPLE
The \`SAMPLE\` command samples a fraction of the table rows.

**Syntax**

\`\`\` esql
SAMPLE probability
\`\`\`

**Parameters**

* \`probability\`: The probability that a row is included in the sample. The value must be between 0 and 1, exclusive.

**Example**

The following example shows the detection of a step change:

\`\`\` esql
FROM employees
| KEEP emp_no
| SAMPLE 0.05
\`\`\`

| emp_no:integer |
|----------------|
| 10018          |
| 10024          |
| 10062          |
| 10081          |

`,
    descriptionOptions: {
      ignoreTag: true,
      description:
        'Text is in markdown. Do not translate function names, special characters, or field names like sum(bytes)',
    },
    openLinksInNewTab: true,
    preview: true,
  },
  {
    name: 'sort',
    labelDefaultMessage: 'SORT',
    descriptionDefaultMessage: `### SORT
Use the \`SORT\` command to sort rows on one or more fields:

\`\`\` esql
FROM employees
| KEEP first_name, last_name, height
| SORT height
\`\`\`

The default sort order is ascending. Set an explicit sort order using \`ASC\` or \`DESC\`:

\`\`\` esql
FROM employees
| KEEP first_name, last_name, height
| SORT height DESC
\`\`\`

If two rows have the same sort key, the original order will be preserved. You can provide additional sort expressions to act as tie breakers:

\`\`\` esql
FROM employees
| KEEP first_name, last_name, height
| SORT height DESC, first_name ASC
\`\`\`

#### \`null\` values
By default, \`null\` values are treated as being larger than any other value. With an ascending sort order, \`null\` values are sorted last, and with a descending sort order, \`null\` values are sorted first. You can change that by providing \`NULLS FIRST\` or \`NULLS LAST\`:

\`\`\` esql
FROM employees
| KEEP first_name, last_name, height
| SORT first_name ASC NULLS FIRST
\`\`\`
            `,
    descriptionOptions: {
      description:
        'Text is in markdown. Do not translate function names, special characters, or field names like sum(bytes)',
    },
  },
  {
    name: 'stats',
    labelDefaultMessage: 'STATS ... BY',
    descriptionDefaultMessage: `### STATS ... BY
Use \`STATS ... BY\` to group rows according to a common value and calculate one or more aggregated values over the grouped rows.

**Examples**:

\`\`\` esql
FROM employees
| STATS count = COUNT(emp_no) BY languages
| SORT languages
\`\`\`

If \`BY\` is omitted, the output table contains exactly one row with the aggregations applied over the entire dataset:

\`\`\` esql
FROM employees
| STATS avg_lang = AVG(languages)
\`\`\`

It's possible to calculate multiple values:

\`\`\` esql
FROM employees
| STATS avg_lang = AVG(languages), max_lang = MAX(languages)
\`\`\`

It's also possible to group by multiple values (only supported for long and keyword family fields):

\`\`\` esql
FROM employees
| EVAL hired = DATE_FORMAT(hire_date, "YYYY")
| STATS avg_salary = AVG(salary) BY hired, languages.long
| EVAL avg_salary = ROUND(avg_salary)
| SORT hired, languages.long
\`\`\`

Refer to **Aggregation functions** for a list of functions that can be used with \`STATS ... BY\`.

Both the aggregating functions and the grouping expressions accept other functions. This is useful for using \`STATS...BY\` on multivalue columns. For example, to calculate the average salary change, you can use \`MV_AVG\` to first average the multiple values per employee, and use the result with the \`AVG\` function:

\`\`\` esql
FROM employees
| STATS avg_salary_change = AVG(MV_AVG(salary_change))
\`\`\`

An example of grouping by an expression is grouping employees on the first letter of their last name:

\`\`\` esql
FROM employees
| STATS my_count = COUNT() BY LEFT(last_name, 1)
| SORT \`LEFT(last_name, 1)\`
\`\`\`

Specifying the output column name is optional. If not specified, the new column name is equal to the expression. The following query returns a column named \`AVG(salary)\`:

\`\`\` esql
FROM employees
| STATS AVG(salary)
\`\`\`

Because this name contains special characters, it needs to be quoted with backticks (\`) when using it in subsequent commands:

\`\`\` esql
FROM employees
| STATS AVG(salary)
| EVAL avg_salary_rounded = ROUND(\`AVG(salary)\`)
\`\`\`

**Note**: \`STATS\` without any groups is much faster than adding a group.

**Note**: Grouping on a single expression is currently much more optimized than grouping on many expressions.
            `,
    descriptionOptions: {
      description:
        'Text is in markdown. Do not translate function names, special characters, or field names like sum(bytes)',
    },
  },
  {
    name: 'where',
    labelDefaultMessage: 'WHERE',
    descriptionDefaultMessage: `### WHERE
Use \`WHERE\` to produce a table that contains all the rows from the input table for which the provided condition evaluates to \`true\`:

\`\`\` esql
FROM employees
| KEEP first_name, last_name, still_hired
| WHERE still_hired == true
\`\`\`

#### Operators

Refer to **Operators** for an overview of the supported operators.

#### Functions
\`WHERE\` supports various functions for calculating values. Refer to **Functions** for more information.
            `,
    descriptionOptions: {
      description:
        'Text is in markdown. Do not translate function names, special characters, or field names like sum(bytes)',
    },
  },
];
