/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { FieldType } from '../../../../common/types/domain/template/fields';
import type { FieldType as FieldTypeType } from '../../../../common/types/domain/template/fields';

export const fieldTypesArray = Object.keys(FieldType) as FieldTypeType[];

export const exampleTemplateDefinition = `
# name is required
name: Example template
# description is optional
description: A short description of the template
# severity is optional (low, medium, high, critical)
severity: low
# category is optional
category: General
# tags are optional
tags:
  - example
fields:
  - name: start_date
    control: DATE_PICKER
    label: Start date
    type: date
    metadata:
      default: "2024-01-01T00:00:00Z"
      # set to true to include time selection
      # show_time: true
      # 'utc' (default) or 'local' to use the browser's timezone
      # timezone: local     
  - name: summary
    control: INPUT_TEXT
    label: Summary
    type: keyword
    metadata:
      default: Default summary text
  - name: effort
    control: INPUT_NUMBER
    label: Effort estimate
    type: integer
    metadata:
      default: 1
  - name: details
    control: TEXTAREA
    label: Details
    type: keyword
    metadata:
      default: Enter details here...
  # TEXTAREA with markdown: true renders a markdown editor instead of plain text
  - name: instructions
    control: TEXTAREA
    label: Investigation instructions
    type: keyword
    metadata:
      markdown: true
      default: |
        ## Investigation playbook

        Follow these steps when triaging the case:

        1. **Collect evidence** — gather relevant logs and screenshots
        2. **Identify scope** — determine affected systems and users
        3. **Escalate** if severity is *critical* or impact is widespread

        ### Useful links

        - [Incident runbook](https://example.com/runbook)
        - [Escalation matrix](https://example.com/escalation)

        > Remember to update the case status as you progress through each step.
  - name: priority
    control: SELECT_BASIC
    label: Priority
    type: keyword
    metadata:
      default: medium
      options:
        - low
        - medium
        - high
        - urgent
  # display.show_when hides this field unless priority is urgent
  - name: urgency_reason
    control: TEXTAREA
    label: Reason for urgency
    type: keyword
    display:
      show_when:
        field: priority
        operator: eq
        value: urgent
    validation:
      required_when:
        field: priority
        operator: eq
        value: urgent
      pattern:
        regex: "^[A-Z]"
        message: "Must start with a capital letter"
  - name: score
    control: INPUT_NUMBER
    label: Score
    type: integer
    validation:
      required: true
      min: 0
      max: 100
  # resolution_notes must be filled in before the case can be closed
  - name: resolution_notes
    control: TEXTAREA
    label: Resolution notes
    type: keyword
    validation:
      required_on_close: true
  # DATE_PICKER with show_time enabled and local timezone
  # show_when: not_empty — this field appears only when a date is selected above
  - name: scheduled_at
    control: DATE_PICKER
    label: Scheduled date and time
    type: date
    metadata:
      show_time: true
      timezone: local
  # deadline_notes is shown and required only when scheduled_at has been filled in
  - name: deadline_notes
    control: TEXTAREA
    label: Deadline notes
    type: keyword
    display:
      show_when:
        field: scheduled_at
        operator: not_empty
    validation:
      required_when:
        field: scheduled_at
        operator: not_empty
  # kickoff_agenda is shown only when scheduled_at equals a specific ISO datetime value
  - name: kickoff_agenda
    control: TEXTAREA
    label: Kickoff agenda
    type: keyword
    display:
      show_when:
        field: scheduled_at
        operator: eq
        value: "2024-06-01T09:00:00.000Z"
  # RADIO_GROUP: select exactly one option, requires at least 2 options (max 20)
  - name: environment
    control: RADIO_GROUP
    label: Environment
    type: keyword
    metadata:
      options:
        - development
        - staging
        - production
      default: staging
    display:
      show_when:
        combine: all
        rules:
          - field: affected_components
            operator: contains
            value: api
          - field: affected_components
            operator: contains
            value: ui
  # CHECKBOX_GROUP: select 0-N options, optional defaults
  - name: affected_components
    control: CHECKBOX_GROUP
    label: Affected components
    type: keyword
    metadata:
      options:
        - api
        - ui
        - database
        - auth
        - infrastructure
      default:
        - api
  # shown only when "database" is among the selected components
  - name: db_connection
    control: INPUT_TEXT
    label: Database connection string
    type: keyword
    display:
      show_when:
        field: affected_components
        operator: contains
        value: database
    validation:
      required_when:
        field: affected_components
        operator: contains
        value: database
  # shown only when "auth" is among the selected components
  - name: auth_details
    control: TEXTAREA
    label: Auth provider details
    type: keyword
    display:
      show_when:
        field: affected_components
        operator: contains
        value: auth
  # shown only when BOTH "api" and "ui" are selected (compound all condition)
  - name: integration_notes
    control: TEXTAREA
    label: Integration test notes
    type: keyword
    display:
      show_when:
        combine: all
        rules:
          - field: affected_components
            operator: contains
            value: api
          - field: affected_components
            operator: contains
            value: ui
          - field: environment
            operator: eq 
            value: production
  # USER_PICKER lets the user select one or many Kibana users
  # set multiple: false to restrict to a single selection
  # default is an optional list of pre-selected users (uid + name)
  - name: reviewers
    control: USER_PICKER
    label: Reviewers
    type: keyword
    metadata:
      multiple: true
      # default:
      #   - uid: "abc123"
      #     name: "Jane Doe"
  # notes is shown only when at least one reviewer has been selected
  - name: review_notes
    control: TEXTAREA
    label: Review notes
    type: keyword
    display:
      show_when:
        field: reviewers
        operator: not_empty
    validation:
      required_when:
        field: reviewers
        operator: not_empty
`.trimStart();
