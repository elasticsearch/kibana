/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Baseline fixtures extracted from the shipped example workflows
 * (automated_triaging.yaml, infosec_demo.yaml). Used as starting points
 * for edit-diversity and long-workflow eval examples.
 *
 * These are public, no-PII versions safe for use in evals.
 */

/**
 * Full automated_triaging.yaml (~15 logical steps across nested foreach).
 * alert trigger, nested foreach, kibana.request, ES search, AI call, host isolation.
 * Source: src/platform/plugins/shared/workflows_management/common/examples/automated_triaging.yaml
 */
export const automatedTriagingYaml = `version: '1'
name: 🔒 AD - Automated Triaging
description: A workflow to automatically process attack discoveries, create cases, analyze with AI, and execute remediation steps
enabled: true
tags:
  - Example
  - Agentic Workflow
  - SOC Agent
triggers:
  - type: alert
steps:
  - name: for_each_discovery
    type: foreach
    foreach: '{{event.alerts}}'
    steps:
      - name: create_case
        type: kibana.createCase
        with:
          owner: securitySolution
          title: '[Attack Discovery] {{foreach.item.attack_discovery.title_with_replacements}}'
          description: |
            ## Attack Summary
            {{foreach.item.attack_discovery.summary_markdown_with_replacements}}
            ## Detailed Analysis
            {{foreach.item.attack_discovery.details_markdown_with_replacements}}
            ## Affected Entities
            {{foreach.item.attack_discovery.entity_summary_markdown_with_replacements}}
            ## Investigation Context
            - **Discovery ID:** {{foreach.item.uuid}}
            - **Detection Time:** {{foreach.item.start}}
            - **Alert Count:** {{foreach.item.attack_discovery.alerts_context_count}}
            - **Risk Score:** {{foreach.item.alert.risk_score}}
            - **Rule:** {{foreach.item.rule.name}}

            ## View Full Discovery

            {{foreach.item.url}}
          tags:
            - '{{foreach.item.attack_discovery.mitre_attack_tactics}}'
          settings:
            syncAlerts: false
          severity: high
          connector:
            id: none
            name: none
            type: .none
            fields: null
      - name: foreach_alert_in_ad
        type: foreach
        foreach: '{{for_each_discovery.item.attack_discovery.alert_ids}}'
        steps:
          - name: get_details
            type: elasticsearch.search
            with:
              index: .alerts-security.alerts-default
              size: 10
              query:
                match:
                  _id: '{{foreach.item}}'
          - name: add_to_case
            type: kibana.request
            with:
              method: POST
              path: /api/cases/{{ steps.create_case.output.id }}/comments
              body:
                type: alert
                alertId: '{{ foreach.item}}'
                index: .alerts-security.alerts-default
                rule:
                  name: '{{ steps.get_details.output.hits.hits._source.kibana.alert.rule.name }}'
                  id: '{{ steps.get_details.output.hits.hits._source.kibana.alert.rule.uuid }}'
                owner: securitySolution
              headers:
                kbn-xsrf: string
                Content-Type: application/json
                Authorization: '{{ consts.secret }}'
      - name: add_analysis_to_case
        type: kibana.request
        with:
          method: POST
          path: /api/cases/{{ steps.create_case.output.id }}/comments
          body:
            type: user
            owner: securitySolution
            comment: '{{ steps.ai_summary.output.data.data | json }}'
          headers:
            kbn-xsrf: string
            Content-Type: application/json
            Authorization: '{{ consts.secret }}'
      - name: get_host_details
        type: console
        with:
          message: getting host details
      - name: ai_summary
        type: kibana.request
        with:
          method: POST
          path: /api/security_ai_assistant/chat/complete
          body:
            isStream: false
            timeout: 10m
            persist: false
            connectorId: '{{ consts.sonnet }}'
            messages:
              - role: user
                content: |
                  Can you generate a one-to-two-sentence summary of the attack above?
                  MAKE SURE TO ONLY OUTPUT THE SUMMARY message.

                   <detected attack>
                       {{ event | json:2 }}
                   </detected attack>
          headers:
            kbn-xsrf: string
            Content-Type: application/json
            Authorization: '{{ consts.secret }}'
      - name: isolate_host
        type: kibana.request
        with:
          method: POST
          path: /api/endpoint/action/isolate
          body:
            endpoint_ids:
              - 345d5ffc-80a8-413c-9a5d-829687e8a5f2
            comment: >-
              Based on my analysis so far, I've isolated the host in question
              pending further investigation and analysis.
            case_ids:
              - '{{ steps.create_case.output.id }}'
          headers:
            kbn-xsrf: string
            Content-Type: application/json
            Authorization: '{{ consts.secret }}'
consts:
  schedule_id: 'REDACTED'
  kibana: 'REDACTED'
  secret: 'REDACTED'
  sonnet: 'REDACTED'
  endpoint_id: 'REDACTED'
  slack_web_hook: 'REDACTED'
`;

/**
 * 10-step alert-triage extract modeled on infosec_demo.yaml Phase 1.
 * alert trigger, severity gate, ES|QL enrichment per source IP, case creation.
 * Represents a realistic mid-size SOC workflow (~10 top-level and nested steps).
 */
export const infosecAlertTriageYaml = `version: '1'
name: Alert Enrichment Triage
description: Alert-triggered enrichment triage — runs ES|QL enrichment for source IP, creates a case, and posts a summary comment.
enabled: true
tags:
  - security
  - triage
triggers:
  - type: alert
steps:
  - name: severity_gate
    type: if
    condition: 'not event.alerts[0].kibana.alert.severity: low'
    steps:
      - name: enrich_source_ip
        type: if
        condition: 'event.alerts[0].source.ip:*'
        steps:
          - name: ip_okta_summary
            type: elasticsearch.esql.query
            with:
              query: |
                FROM logs-okta*
                | WHERE @timestamp > NOW() - 24h AND source.ip == "{{ event.alerts[0].source.ip }}"
                | STATS event_count = COUNT(*), users = VALUES(user.email), event_actions = VALUES(event.action) BY source.ip
                | LIMIT 1
            on-failure:
              continue: true
              retry:
                max-attempts: 2
                delay: 2s
          - name: ip_aws_summary
            type: elasticsearch.esql.query
            with:
              query: |
                FROM logs-aws*
                | WHERE @timestamp > NOW() - 24h AND source.ip == "{{ event.alerts[0].source.ip }}"
                | STATS event_count = COUNT(*), users = VALUES(user.name), event_actions = VALUES(event.action) BY source.ip
                | LIMIT 1
            on-failure:
              continue: true
              retry:
                max-attempts: 2
                delay: 2s
      - name: create_triage_case
        type: cases.createCase
        with:
          title: 'Alert Triage: {{ event.alerts[0].kibana.alert.rule.name }}'
          description: |
            ## Alert Details
            - **Severity:** {{ event.alerts[0].kibana.alert.severity }}
            - **Source IP:** {{ event.alerts[0].source.ip }}
            - **Rule:** {{ event.alerts[0].kibana.alert.rule.name }}
            ## Okta Context
            {{ steps.ip_okta_summary.output.values | json }}
            ## AWS Context
            {{ steps.ip_aws_summary.output.values | json }}
          severity: medium
          owner: securitySolution
          tags:
            - automated-triage
      - name: add_enrichment_comment
        type: cases.addComment
        with:
          caseId: '{{ steps.create_triage_case.output.case.id }}'
          comment: |
            Enrichment complete. Okta events: {{ steps.ip_okta_summary.output.values | json }}.
            AWS events: {{ steps.ip_aws_summary.output.values | json }}.
      - name: log_completion
        type: console
        with:
          message: 'Triage case created: {{ steps.create_triage_case.output.case.id }}'
`;

/**
 * 7-step ES-focused extract: index backfill pipeline with ES|QL validation.
 * scheduled trigger, ES|QL, ES bulk, index management, conditional.
 */
export const infosecIndexBackfillYaml = `version: '1'
name: Security Index Backfill Pipeline
description: Scheduled pipeline that runs ES|QL to identify stale records, backfills missing fields, and validates the result.
enabled: true
tags:
  - security
  - data-management
triggers:
  - type: schedule
    with:
      interval: 1h
steps:
  - name: find_incomplete_records
    type: elasticsearch.esql.query
    with:
      query: |
        FROM .alerts-security.alerts-default
        | WHERE @timestamp > NOW() - 1h AND kibana.alert.workflow_status == "open"
        | WHERE NOT QSTR("kibana.alert.enrichments:*")
        | KEEP _id, kibana.alert.rule.name, kibana.alert.severity, @timestamp
        | LIMIT 100
  - name: check_has_records
    type: if
    condition: '\${{ steps.find_incomplete_records.output.values != empty }}'
    steps:
      - name: backfill_enrichments
        type: elasticsearch.bulk
        with:
          index: .alerts-security.alerts-default
          operations: '{{ steps.find_incomplete_records.output.values | map: "{ \"update\": { \"_id\": \"" + item[0] + "\" } }\n{ \"doc\": { \"kibana.alert.enrichments\": { \"backfilled\": true, \"timestamp\": \"{{ \"now\" | date: \"%Y-%m-%dT%H:%M:%SZ\" }}\" } } }" | join: "\n" }}'
      - name: validate_backfill
        type: elasticsearch.esql.query
        with:
          query: |
            FROM .alerts-security.alerts-default
            | WHERE @timestamp > NOW() - 1h AND kibana.alert.enrichments.backfilled == true
            | STATS backfilled_count = COUNT(*) BY kibana.alert.enrichments.backfilled
            | LIMIT 1
      - name: log_backfill_result
        type: console
        with:
          message: 'Backfilled {{ steps.validate_backfill.output.values | first | first }} records'
  - name: log_no_records
    type: if
    condition: '\${{ steps.find_incomplete_records.output.values == empty }}'
    steps:
      - name: log_nothing_to_do
        type: console
        with:
          message: No incomplete records found in the last hour
`;

/**
 * 5-step alert → ES|QL enrichment → Slack notification workflow.
 * Minimal but realistic: alert trigger, ES|QL, conditional, Slack connector, console log.
 */
export const infosecSlackEnrichmentYaml = `version: '1'
name: Alert Slack Enrichment Notifier
description: Fires on alert, enriches with ES|QL context, posts to Slack if high severity.
enabled: true
tags:
  - security
  - notifications
triggers:
  - type: alert
steps:
  - name: enrich_alert
    type: elasticsearch.esql.query
    with:
      query: |
        FROM logs-*
        | WHERE @timestamp > NOW() - 1h AND source.ip == "{{ event.alerts[0].source.ip }}"
        | STATS event_count = COUNT(*), actions = VALUES(event.action) BY source.ip
        | LIMIT 1
    on-failure:
      continue: true
  - name: notify_if_high_severity
    type: if
    condition: 'event.alerts[0].kibana.alert.severity: high OR event.alerts[0].kibana.alert.severity: critical'
    steps:
      - name: post_to_slack
        type: slack
        connector-id: my-slack-connector
        with:
          message: |
            :rotating_light: *High Severity Alert*
            *Rule:* {{ event.alerts[0].kibana.alert.rule.name }}
            *Severity:* {{ event.alerts[0].kibana.alert.severity }}
            *Source IP:* {{ event.alerts[0].source.ip }}
            *Recent events from IP:* {{ steps.enrich_alert.output.values | json }}
  - name: log_done
    type: console
    with:
      message: 'Notification flow complete for alert {{ event.alerts[0]._id }}'
`;
