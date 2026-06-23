---
navigation_title: "{{xsoar}}"
type: reference
description: "Use the XSOAR connector to create Cortex XSOAR incidents from Elastic rules and Workflows."
applies_to:
  stack: ga 9.1
  serverless: ga
mapped_pages:
  - https://www.elastic.co/guide/en/kibana/current/xsoar-action-type.html
---

# {{xsoar}} connector and action [xsoar-action-type]

The {{xsoar}} connector uses the [{{xsoar}} REST API](https://cortex-panw.stoplight.io/docs/cortex-xsoar-8/m0qlgh9inh4vk-create-or-update-an-incident) to create Cortex {{xsoar}} incidents from Elastic rules, cases, and Workflows. Use the `xsoar.run` workflow step when a workflow needs to open an incident in {{xsoar}} and optionally associate it with an {{xsoar}} playbook.

## Prepare {{xsoar}} [xsoar-prepare]

Before creating the connector, prepare the following in {{xsoar}}:

* An API key that can create or update incidents.
* For cloud instances, the API key ID, which is the unique serial number for the API key.
* Optional: an {{xsoar}} playbook to associate with incidents created by Elastic. If you want to select playbooks in {{kib}}, the API key must also be able to search playbooks.

## Create connectors in {{kib}} [define-xsoar-ui]

You can create connectors in **{{stack-manage-app}} > {{connectors-ui}}** or as needed when you're creating a rule. For example:

::::{image} ../images/xsoar-connector.png
:alt: {{xsoar}} connector
:screenshot:
::::

### Connector configuration [xsoar-connector-configuration]

{{xsoar}} connectors have the following configuration properties:

Name
:   The name of the connector.

URL
:   The {{xsoar}} instance URL.

API key
:   The {{xsoar}} API key for authentication.

    ::::{note}
    If you do not have an API key, refer to [Create a new API key](https://cortex-panw.stoplight.io/docs/cortex-xsoar-8/t09y7hrb5d14m-create-a-new-api-key) to make one for your {{xsoar}} instance.
    ::::

API key ID
:   The {{xsoar}} API key ID for authentication. This value is mandatory for cloud instance users.

## Test connectors [xsoar-action-configuration]

You can test connectors as you’re creating or editing the connector in {{kib}}. For example:

::::{image} ../images/xsoar-params-test.png
:alt: {{xsoar}} params test
:screenshot:
::::

The {{xsoar}} connector has the following actions:

Get Playbooks
:   Retrieve the {{xsoar}} playbooks visible to the connector. In Workflows, use step type `xsoar.getPlaybooks`.
    - This action does not take parameters.
    - The response contains `playbooks`, an array of objects with `id` and `name`.

Run
:   Create an incident in {{xsoar}}. In Workflows, use step type `xsoar.run`.
    - `name` (required): Incident name.
    - `playbookId` (optional): ID of the {{xsoar}} playbook to associate with the incident. In the {{kib}} UI, this is selected from the **XSOAR playbooks** list.
    - `createInvestigation` (required): If `true`, starts the investigation process after the incident is created. The {{kib}} UI defaults this value to `false`.
    - `severity` (required): Numeric incident severity: `0` for Unknown, `0.5` for Informational, `1` for Low, `2` for Medium, `3` for High, or `4` for Critical.
    - `isRuleSeverity` (optional): If `true` and the action runs from a rule, the incident uses the rule severity. In workflows, set `severity` explicitly.
    - `body` (optional): JSON string with additional {{xsoar}} incident fields to send in the API request. In workflow YAML, use a block scalar (`|`) to pass formatted JSON. For example, use it to set fields such as `details` or `type`.

Dedicated action parameters, such as `name`, `playbookId`, `createInvestigation`, and `severity`, are added to the same {{xsoar}} incident request as the JSON parsed from `body`. If the same field appears in both places, the dedicated action parameter takes precedence.

## Workflow example [xsoar-workflow-example]

Create an {{xsoar}} incident and associate it with a playbook:

```yaml
steps:
  - name: create_xsoar_incident
    type: xsoar.run
    connector-id: <connector-id>
    with:
      name: Suspicious login detected
      playbookId: <xsoar-playbook-id>
      createInvestigation: true
      severity: 2
      body: |
        {
          "details": "Investigate suspicious login activity.",
          "type": "Unclassified"
        }
```

## Connector networking configuration [xsoar-connector-networking-configuration]

Use the [Action configuration settings](/reference/configuration-reference/alerting-settings.md#action-settings) to customize connector networking configurations, such as proxies, certificates, or TLS settings. You can set configurations that apply to all your connectors or use `xpack.actions.customHostSettings` to set per-host configurations.
