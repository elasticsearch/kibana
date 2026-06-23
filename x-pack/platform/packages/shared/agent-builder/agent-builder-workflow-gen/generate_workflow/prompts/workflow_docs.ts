/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// picked the good parts from https://github.com/elastic/workflows/tree/main/docs

export const getWorkflowBaseDocumentation = (): string => {
  return `# Elastic workflow - base concepts

## What Are Workflows?

Elastic Workflows are **declarative automation pipelines** that define automation as code. Instead of writing procedural scripts, you describe:

- **What** you want to accomplish (actions)
- **When** it should run (triggers)
- **With what** data (inputs, constants)
- **How** to handle failures (error handling)

## Triggers

Triggers define how and when a workflow starts.

### Manual Trigger

The default trigger type. Workflow runs when explicitly invoked.

\`\`\`yaml
triggers:
  - type: manual
\`\`\`

**Defining inputs:** A manual trigger declares the runtime inputs the caller
provides when launching the workflow. Any input a step references with
\`{{ inputs.<name> }}\` MUST be declared here. Inputs are defined with **JSON
Schema**, directly under the trigger:

\`\`\`yaml
triggers:
  - type: manual
    inputs:
      properties:
        request_id:
          type: string
          description: The ID of the request to accept
        priority:
          type: string
          enum: [low, medium, high]
          default: medium
          description: Request priority
      required:
        - request_id
\`\`\`

- \`properties\` maps each input name to a JSON Schema definition. Common keywords:
  \`type\`, \`description\`, \`default\`, \`enum\`, \`format\`, \`pattern\`,
  \`minimum\`/\`maximum\`, \`minLength\`/\`maxLength\`, and nested \`object\`/\`array\`.
- \`required\` lists the input names that must be provided.
- Reference inputs in steps with \`{{ inputs.<name> }}\` (e.g. \`{{ inputs.request_id }}\`).

IMPORTANT: inputs are declared **under the \`manual\` trigger** — there is NO
top-level \`inputs:\` field.

**Use cases:**
- On-demand investigations
- Ad-hoc enrichment
- Testing and development

### Scheduled Trigger

Runs on a recurring schedule using rrule (recurrence rule) expressions.

\`\`\`yaml
triggers:
  - type: scheduled
    with:
      every: "6h"  # Every 6 hours
\`\`\`

**Common schedules:**

| Cron | Description |
|------|-------------|
| \`* * * * *\` | Every minute |
| \`*/5 * * * *\` | Every 5 minutes |
| \`0 * * * *\` | Every hour |
| \`0 0 * * *\` | Daily at midnight |
| \`0 9 * * 1\` | Weekly on Monday at 9 AM |
| \`0 0 1 * *\` | Monthly on the 1st |

**Use cases:**
- Periodic threat hunting
- Scheduled report generation
- Regular data cleanup

### Alert Trigger

Executes automatically when a security alert is triggered by a detection rule.

\`\`\`yaml
triggers:
  - type: alert
    with:
      rule_name: "Critical Security Alert"
\`\`\`

**Use cases:**
- Alert-driven response
- External system integration
- Real-time event handling

### Multiple Triggers

A single workflow can have multiple triggers:

\`\`\`yaml
triggers:
  - type: manual
  - type: scheduled
    with:
      every: "1d"  # Daily
  - type: alert
    with:
      rule_name: "Emergency Alert"
\`\`\`

## Data Flow

### A Complete Example

Note how every \`{{ inputs.* }}\` reference has a matching declaration under the
\`manual\` trigger, and each step's output is accessible to subsequent steps:

\`\`\`yaml
name: Fetch and log user
triggers:
  - type: manual
    inputs:
      properties:
        user_id:
          type: string
          description: The ID of the user to fetch
      required:
        - user_id
consts:
  api: "https://api.example.com"
steps:
  - name: fetch_user
    type: http
    with:
      url: "{{ consts.api }}/users/{{ inputs.user_id }}"

  - name: log_user
    type: console
    with:
      message: |
        User: {{ steps.fetch_user.output.data.name }}
        Email: {{ steps.fetch_user.output.data.email }}
        Role: {{ steps.fetch_user.output.data.role }}
\`\`\`

## Variables and Templates

### Template Syntax

Use double curly braces for variable substitution:

\`\`\`yaml
"{{ variable.path }}"
\`\`\`

### Variable Contexts

| Context | Description | Example |
|---------|-------------|---------|
| \`consts\` | Workflow constants | \`{{ consts.api_key }}\` |
| \`inputs\` | Runtime inputs | \`{{ inputs.target_ip }}\` |
| \`steps\` | Step outputs | \`{{ steps.search.output.hits }}\` |
| \`foreach\` | Loop context | \`{{ foreach.item }}\` |
| \`env\` | Environment | \`{{ env.HOME }}\` |
| \`now\` | Current timestamp | \`{{ now }}\` |

### String Operations

\`\`\`yaml
# Concatenation
url: "{{ consts.base }}/{{ inputs.path }}"

# Multi-line (YAML block scalar)
message: |
  Alert Summary:
  - IP: {{ inputs.ip }}
  - Severity: {{ inputs.severity }}
  - Time: {{ now }}
\`\`\`

### Liquid Templating

Workflows use **Liquid** as the templating language. Liquid provides powerful filters and control flow for dynamic content.

### Filters

Apply transformations to values using the pipe (\`|\`) operator:

\`\`\`yaml
# Chain multiple filters
message: "{{ inputs.name | strip | upcase }}"

# With arguments
short_desc: "{{ description | truncate: 50 }}"
\`\`\`

#### String Filters

| Filter | Description | Example |
|--------|-------------|---------|
| \`upcase\` / \`downcase\` | Change case | \`{{ "Hello" \\| downcase }}\` → \`hello\` |
| \`capitalize\` | Capitalize first letter | \`{{ "hello" \\| capitalize }}\` → \`Hello\` |
| \`strip\` | Remove whitespace | \`{{ "  text  " \\| strip }}\` → \`text\` |
| \`truncate\` | Shorten string | \`{{ text \\| truncate: 20 }}\` → \`"This is a long..."\` |
| \`truncatewords\` | Limit word count | \`{{ text \\| truncatewords: 5 }}\` |
| \`replace\` | Replace substring | \`{{ "hello" \\| replace: "l", "L" }}\` → \`heLLo\` |
| \`remove\` | Remove substring | \`{{ "hello" \\| remove: "l" }}\` → \`heo\` |
| \`split\` | String to array | \`{{ "a,b,c" \\| split: "," }}\` → \`["a","b","c"]\` |
| \`append\` / \`prepend\` | Add to string | \`{{ "world" \\| prepend: "hello " }}\` |
| \`slice\` | Extract substring | \`{{ "hello" \\| slice: 0, 3 }}\` → \`hel\` |
| \`strip_html\` | Remove HTML tags | \`{{ "<b>text</b>" \\| strip_html }}\` → \`text\` |

#### Array Filters

| Filter | Description | Example |
|--------|-------------|---------|
| \`size\` | Get length | \`{{ items \\| size }}\` → \`5\` |
| \`first\` / \`last\` | Get first/last item | \`{{ items \\| first }}\` |
| \`join\` | Array to string | \`{{ tags \\| join: ", " }}\` → \`"a, b, c"\` |
| \`map\` | Extract property | \`{{ users \\| map: "name" }}\` → \`["Alice", "Bob"]\` |
| \`where\` | Filter by property | \`{{ items \\| where: "status", "active" }}\` |
| \`where_exp\` | Filter by expression | \`{{ items \\| where_exp: "item.price > 100" }}\` |
| \`find\` | Find first match | \`{{ items \\| find: "id", "123" }}\` |
| \`find_exp\` | Find by expression | \`{{ items \\| find_exp: "item.score > 90" }}\` |
| \`sort\` | Sort array | \`{{ items \\| sort: "name" }}\` |
| \`sort_natural\` | Case-insensitive sort | \`{{ items \\| sort_natural }}\` |
| \`reverse\` | Reverse order | \`{{ items \\| reverse }}\` |
| \`uniq\` | Remove duplicates | \`{{ items \\| uniq }}\` |
| \`compact\` | Remove nulls | \`{{ items \\| compact }}\` |
| \`concat\` | Merge arrays | \`{{ arr1 \\| concat: arr2 }}\` |
| \`push\` / \`unshift\` | Add to array | \`{{ items \\| push: "new" }}\` |
| \`pop\` / \`shift\` | Remove from array | \`{{ items \\| pop }}\` |
| \`reject\` | Remove matching | \`{{ items \\| reject: "type", "spam" }}\` |
| \`reject_exp\` | Remove by expression | \`{{ items \\| reject_exp: "item.score < 10" }}\` |
| \`has\` | Check for property | \`{{ items \\| has: "status", "active" }}\` → \`true\` |
| \`has_exp\` | Check by expression | \`{{ items \\| has_exp: "item.price > 100" }}\` |
| \`group_by\` | Group by property | \`{{ items \\| group_by: "category" }}\` |

#### Math Filters

| Filter | Description | Example |
|--------|-------------|---------|
| \`plus\` / \`minus\` | Add/subtract | \`{{ 5 \\| plus: 3 }}\` → \`8\` |
| \`times\` / \`divided_by\` | Multiply/divide | \`{{ 10 \\| divided_by: 2 }}\` → \`5\` |
| \`modulo\` | Remainder | \`{{ 5 \\| modulo: 3 }}\` → \`2\` |
| \`abs\` | Absolute value | \`{{ -5 \\| abs }}\` → \`5\` |
| \`ceil\` / \`floor\` | Round up/down | \`{{ 4.3 \\| ceil }}\` → \`5\` |
| \`round\` | Round | \`{{ 4.5 \\| round }}\` → \`5\` |
| \`at_least\` / \`at_most\` | Clamp value | \`{{ 3 \\| at_least: 5 }}\` → \`5\` |

#### Date Filters

| Filter | Description | Example |
|--------|-------------|---------|
| \`date\` | Format date | \`{{ "now" \\| date: "%Y-%m-%d" }}\` → \`2024-01-15\` |
| \`date_to_string\` | Human-readable date | \`{{ date \\| date_to_string }}\` |
| \`date_to_rfc822\` | RFC822 format | \`{{ date \\| date_to_rfc822 }}\` |
| \`date_to_xmlschema\` | ISO 8601 format | \`{{ date \\| date_to_xmlschema }}\` |

**Common date format codes:**

| Code | Description | Example |
|------|-------------|---------|
| \`%Y\` | 4-digit year | \`2024\` |
| \`%m\` | Month (01-12) | \`01\` |
| \`%d\` | Day (01-31) | \`15\` |
| \`%H\` | Hour (00-23) | \`14\` |
| \`%M\` | Minute (00-59) | \`30\` |
| \`%S\` | Second (00-59) | \`45\` |

#### Encoding Filters

| Filter | Description | Example |
|--------|-------------|---------|
| \`json\` | Object to JSON string | \`{{ object \\| json }}\` |
| \`json_parse\` | JSON string to object | \`{{ json_string \\| json_parse }}\` |
| \`url_encode\` / \`url_decode\` | URL encoding | \`{{ "hello world" \\| url_encode }}\` → \`hello%20world\` |
| \`base64_encode\` / \`base64_decode\` | Base64 | \`{{ "text" \\| base64_encode }}\` |
| \`xml_escape\` | Escape XML chars | \`{{ "<tag>" \\| xml_escape }}\` → \`&lt;tag&gt;\` |
| \`cgi_escape\` / \`uri_escape\` | CGI/URI encoding | \`{{ text \\| uri_escape }}\` |

#### Utility Filters

| Filter | Description | Example |
|--------|-------------|---------|
| \`default\` | Fallback value | \`{{ name \\| default: "Unknown" }}\` |
| \`slugify\` | URL-safe string | \`{{ "Hello World!" \\| slugify }}\` → \`hello-world\` |
| \`normalize_whitespace\` | Clean whitespace | \`{{ "  too   much  " \\| normalize_whitespace }}\` |
| \`number_of_words\` | Count words | \`{{ "hello world" \\| number_of_words }}\` → \`2\` |

### Control Flow Tags

#### Conditionals

\`\`\`yaml
message: |
  {%- if steps.check.output.risk_score > 70 -%}
  🚨 HIGH RISK: Immediate action required
  {%- elsif steps.check.output.risk_score > 40 -%}
  ⚠️ MEDIUM RISK: Investigation recommended
  {%- else -%}
  ✅ LOW RISK: No action needed
  {%- endif -%}
\`\`\`

#### Unless (Negative Conditional)

\`\`\`yaml
message: |
  {%- unless user.banned -%}
  Welcome, {{ user.name }}!
  {%- endunless -%}
\`\`\`

#### Case/When (Switch Statement)

\`\`\`yaml
message: |
  {%- case event.severity -%}
    {%- when "critical" -%}
    🔴 CRITICAL: Escalate immediately
    {%- when "high" -%}
    🟠 HIGH: Investigate within 1 hour
    {%- when "medium" -%}
    🟡 MEDIUM: Review within 24 hours
    {%- else -%}
    🟢 LOW: Monitor and review
  {%- endcase -%}
\`\`\`

#### For Loops

\`\`\`yaml
message: |
  Alerts found:
  {%- for alert in event.alerts -%}
  - {{ alert.rule.name }} ({{ alert.severity }})
  {%- endfor -%}
\`\`\`

**Loop variables:**

| Variable | Description |
|----------|-------------|
| \`forloop.index\` | Current iteration (1-based) |
| \`forloop.index0\` | Current iteration (0-based) |
| \`forloop.first\` | Is first iteration? |
| \`forloop.last\` | Is last iteration? |
| \`forloop.length\` | Total iterations |

#### Variable Assignment

\`\`\`yaml
message: |
  {%- assign severity = event.alerts[0].severity -%}
  {%- assign count = event.alerts | size -%}
  Found {{ count }} alerts, highest severity: {{ severity }}
\`\`\`

#### Capture (Build Strings)

\`\`\`yaml
message: |
  {%- capture summary -%}
  Alert: {{ event.rule.name }}
  Host: {{ event.host.name }}
  User: {{ event.user.name | default: "unknown" }}
  {%- endcapture -%}
  {{ summary }}
\`\`\`

### Whitespace Control

Use \`-\` to trim whitespace:

\`\`\`yaml
# Without whitespace control (adds newlines)
{% if condition %}
  content
{% endif %}

# With whitespace control (clean output)
{%- if condition -%}
content
{%- endif -%}
\`\`\`

### Liquid Block Syntax

For complex logic, use the \`liquid\` tag to write multiple statements:

\`\`\`yaml
message: |
  {%- liquid
    assign high_alerts = event.alerts | where_exp: "item.severity == 'high'"
    assign high_count = high_alerts | size

    if high_count > 0
      echo "⚠️ " | append: high_count | append: " high severity alerts"
    else
      echo "✅ No high severity alerts"
    endif
  -%}
\`\`\`

### Practical Examples

#### Build a Formatted Report

\`\`\`yaml
message: |
  {%- assign total = steps.search.output.hits.total.value -%}
  {%- assign results = steps.search.output.hits.hits -%}

  === Search Results ({{ total }} found) ===

  {%- for hit in results -%}
  {{ forloop.index }}. {{ hit._source.name }}
     Score: {{ hit._score | round: 2 }}
     Category: {{ hit._source.category | default: "Uncategorized" }}
  {% endfor -%}

  {%- if total == 0 -%}
  No results matched your query.
  {%- endif -%}
\`\`\`

#### Dynamic URL Construction

\`\`\`yaml
url: |
  {%- assign base = consts.api_url -%}
  {%- assign query = inputs.search_term | url_encode -%}
  {%- assign limit = inputs.limit | default: 100 -%}
  {{ base }}/search?q={{ query }}&limit={{ limit }}
\`\`\`

#### Conditional API Parameters

\`\`\`yaml
body:
  query: "{{ inputs.query }}"
  filters: |
    {%- liquid
      assign filters = ""
      if inputs.start_date
        assign filters = filters | append: "date>=" | append: inputs.start_date
      endif
      if inputs.severity
        if filters != ""
          assign filters = filters | append: " AND "
        endif
        assign filters = filters | append: "severity:" | append: inputs.severity
      endif
      echo filters
    -%}
\`\`\`

## Error Handling

### Default Behavior

By default, if a step fails, the workflow stops.

### Retry Configuration

Automatically retry failed steps:

\`\`\`yaml
- name: api_call
  type: http
  with:
    url: "{{ consts.flaky_api }}"
  on-failure:
    retry:
      max-attempts: 3    # Try up to 3 times
      delay: 5s          # Wait 5 seconds between attempts
\`\`\`

### Continue on Failure

Allow workflow to proceed even if a step fails:

\`\`\`yaml
- name: optional_enrichment
  type: http
  with:
    url: "{{ consts.enrichment_api }}"
  on-failure:
    continue: true  # Proceed to next step even if this fails
\`\`\`

### Checking Step Status

After a step with \`continue: true\`, check if it succeeded:

\`\`\`yaml
- name: enrichment
  type: http
  with:
    url: "{{ consts.api }}"
  on-failure:
    continue: true

- name: check_enrichment
  type: if
  condition: 'steps.enrichment.status: "success"'
  steps:
    - name: use_enrichment
      type: console
      with:
        message: "Enrichment data: {{ steps.enrichment.output.data }}"
  else:
    - name: fallback
      type: console
      with:
        message: "Enrichment unavailable, using defaults"
\`\`\`

## Best Practices

### 1. Use Descriptive Names

\`\`\`yaml
# ❌ Bad
- name: step1
  type: http

# ✅ Good
- name: lookup_ip_reputation
  type: http
\`\`\`

### 2. Document with Comments

\`\`\`yaml
# =============================================================================
# Workflow: Alert Triage
# Purpose: Automatically triage and enrich security alerts
# Author: Security Team
# =============================================================================

name: Alert Triage

# CONSTANTS - Update these for your environment
consts:
  virustotal_api_key: "YOUR_KEY"  # Get from VirusTotal dashboard
\`\`\`

### 3. Use Constants for Configuration

\`\`\`yaml
# ❌ Bad - Hardcoded values scattered throughout
steps:
  - name: call_api
    type: http
    with:
      url: "https://api.virustotal.com/v3/files"
      headers:
        x-apikey: "abc123"

# ✅ Good - Centralized configuration
consts:
  virustotal_url: "https://api.virustotal.com/v3"
  virustotal_key: "abc123"

steps:
  - name: call_api
    type: http
    with:
      url: "{{ consts.virustotal_url }}/files"
      headers:
        x-apikey: "{{ consts.virustotal_key }}"
\`\`\`

### 4. Handle Errors Gracefully

\`\`\`yaml
# Add retries for external API calls
- name: external_api
  type: http
  with:
    url: "{{ consts.api_url }}"
  on-failure:
    retry:
      max-attempts: 3
      delay: 2s
    continue: true  # Don't fail entire workflow

# Check if previous step succeeded
- name: check_result
  type: if
  condition: 'steps.external_api.status: "success"'
  steps:
    - name: use_result
      type: console
      with:
        message: "Got result: {{ steps.external_api.output.data }}"
\`\`\`

### 5. Limit Foreach Scope

\`\`\`yaml
# ❌ Bad - Processing unlimited items
- name: process_all
  type: foreach
  with:
    items: "{{ steps.search.output.hits.hits }}"

# ✅ Good - Limit search results
- name: search
  type: elasticsearch.search
  with:
    index: "alerts-*"
    size: 100  # Reasonable limit
\`\`\`

### 6. Use Meaningful Inputs

Declare inputs under the manual trigger with clear descriptions and sensible defaults:

\`\`\`yaml
triggers:
  - type: manual
    inputs:
      properties:
        target_ip:
          type: string
          description: "The IP address to investigate for threats"
        severity_threshold:
          type: number
          description: "Minimum severity level (1-10) to trigger alerts"
          default: 7
      required:
        - target_ip
\`\`\`


`;
};
