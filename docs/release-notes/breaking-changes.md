---
navigation_title: "Breaking changes"
mapped_pages:
  - https://www.elastic.co/guide/en/kibana/current/breaking-changes-summary.html
---

# Kibana breaking changes [kibana-breaking-changes]
Breaking changes can impact your Elastic applications, potentially disrupting normal operations. Before you upgrade, carefully review the Kibana breaking changes and take the necessary steps to mitigate any issues.

If you are migrating from a version prior to version 9.0, you must first upgrade to the last 8.x version available. To learn how to upgrade, check out [Upgrade](docs-content://deploy-manage/upgrade.md).

% ## Next version [kibana-X.X.X-breaking-changes]

% Use the following template to add entries to this document.

% TEMPLATE START
% $$$kibana-PR_NUMBER$$$
% ::::{dropdown} Title of breaking change 
% Description of the breaking change.
% **Impact**<br> Impact of the breaking change.
% **Action**<br> Steps for mitigating impact.
% View [PR #](PR link).
% ::::
% TEMPLATE END

% 1. Copy and edit the template in the right area section of this file. Most recent entries should be at the top of the section. 
% 2. Edit the anchor ID ($$$kibana-PR_NUMBER$$$) of the template with the correct PR number to give the entry a unique URL. 
% 3. Don't hardcode the link to the new entry. Instead, make it available through the doc link service files:
%   - {kib-repo}blob/{branch}/src/platform/packages/shared/kbn-doc-links/src/get_doc_links.ts
%   - {kib-repo}blob/{branch}/src/platform/packages/shared/kbn-doc-links/src/types.ts
% 
% The entry in the main links file should look like this:
% 
% id: `${KIBANA_DOCS}breaking-changes.html#kibana-PR_NUMBER`
% 
% 4. You can then call the link from any Kibana code. For example: `href: docLinks.links.upgradeAssistant.id`
% Check https://docs.elastic.dev/docs/kibana-doc-links (internal) for more details about the Doc links service.

% BREAKING CHANGES
% Paste in breaking-changes.md

## 9.6.0 [kibana-9.6.0-breaking-changes]

$$$kibana-287882$$$
::::{dropdown} Osquery live queries no longer accept caller-supplied SQL from `runSavedQueries`-only callers
**Details**<br> This is a breaking change on Elastic Cloud Serverless (Security Complete) as soon as it ships there, and on every Elastic Stack release that receives this fix. `POST /api/osquery/live_queries` now derives the dispatched SQL from the referenced saved query or pack. A caller who holds only the osquery `runSavedQueries` privilege (and not `writeLiveQueries`) cannot run ad-hoc SQL. An unresolvable `saved_query_id` / `pack_id`, a `queries` array without a `pack_id`, or a `query` / `ecs_mapping` that does not match the stored object returns HTTP 403 Forbidden. A pack may include `queries` copied from the pack (the rule-action form does this); those are ignored at dispatch and the pack saved object is the source of truth. A matching `query` is accepted for compatibility with the Kibana UI (which still posts the selected saved query's SQL) but does not change what is dispatched: the stored object is the source of truth, and `{{parameter}}` substitution is applied server-side when alert context is present. Callers who hold `writeLiveQueries` are unchanged.

The same authorization rules apply when attaching an osquery response action to a detection rule (create, update, patch, import, and bulk duplicate), but the HTTP status the denial is reported with differs per endpoint. Rule create, update, and patch return a top-level `403`. Rule import returns `200` with the denial reported per rule in `errors[].error.status_code`. Bulk duplicate returns `500` with the denial reported per rule in `attributes.errors[].status_code`. Clients that only inspect the top-level status can therefore mistake an import denial for success, or a bulk-duplicate denial for a server fault; check the per-rule entries for these two operations. Rule-run dispatch also uses stored content, so SQL persisted on the action cannot override the referenced saved query. If a rule's referenced saved query or pack has since been deleted, renamed, or moved to another space, the rule run records an error on the osquery action instead of dispatching anything; the failure is visible in the alert's **Osquery Results** tab.

**Impact**<br> API clients that posted `{ saved_query_id, query }` with SQL that differed from the saved object, or an unresolvable `saved_query_id` / `pack_id`, are now denied. On `POST /api/osquery/live_queries` and on rule create, update, and patch this is a top-level `403`; on rule import and bulk duplicate see the per-rule status codes described above.

Two cases return HTTP 400 Bad Request rather than 403. A `runSavedQueries`-only caller who runs a saved query — or a pack whose queries contain `{{parameter}}` placeholders — without alert context is rejected, because there is nothing to substitute and the literal placeholder is not dispatched to the agent. A `saved_query_id` that resolves to nothing on a request that requires stored content is likewise a 400.

Kibana UI flows that run a saved query or pack from **Osquery → Live queries** and from the alert flyout continue to work.

**Known limitation**<br> A `runSavedQueries`-only user running a parameterized saved query from the alert flyout can receive a spurious `403`. The browser substitutes `{{parameter}}` values from the alert row it renders, while the server re-substitutes from the alert document it authorizes against; when the two documents disagree on a referenced field — for example a field present in one and absent from the other, or a multi-value field — the two strings differ and authorization denies the request. This fails closed and is not a privilege escalation. Users who hold `writeLiveQueries` are unaffected. Re-running the same saved query from **Osquery → Live queries** without alert context is a workaround. Tracked in [#289296](https://github.com/elastic/kibana/issues/289296).

**Action**<br> For `runSavedQueries`-only callers, send a resolvable `saved_query_id` (the saved query's public id) or `pack_id` (saved-object id). The saved-object uuid is accepted for `saved_query_id` as a compatibility alias. You may omit `query`, or send SQL that matches the stored object. `queries` is only valid together with `pack_id`. To run arbitrary SQL, grant `writeLiveQueries`.

View [PR #287882](https://github.com/elastic/kibana/pull/287882).
::::

$$$kibana-285645$$$
::::{dropdown} Workflow execution detail routes now require the `read` privilege in addition to `readExecution`
**Details**<br> The following Workflows API routes previously accepted callers holding only the `workflowsManagement:readExecution` privilege (the **Read Workflow Execution** sub-feature privilege, `workflow_execution_read`). Execution documents include a YAML snapshot of the workflow definition, so those callers could retrieve a workflow definition without holding the `workflowsManagement:read` privilege (**Read**, `workflow_read`). Reading execution data now requires both privileges. This applies to every execution read route, including the list and search routes:

- `GET /api/workflows/executions/{executionId}`
- `GET /api/workflows/executions/{executionId}/step/{stepExecutionId}`
- `GET /api/workflows/executions/{executionId}/logs`
- `GET /api/workflows/executions/{executionId}/children`
- `GET /api/workflows/workflow/{workflowId}/executions`
- `GET /api/workflows/workflow/{workflowId}/executions/steps`
- `GET /api/workflows/workflow/executions`

**Impact**<br> API callers or custom Kibana roles that grant `workflow_execution_read` without `workflow_read` receive HTTP 403 on the routes listed above.

**Action**<br> In any role that customizes Workflows sub-feature privileges, add **Read** (`workflow_read`) under **Analytics → Workflows → Workflows Actions** alongside **Read Workflow Execution** (`workflow_execution_read`). Roles that grant `All` or `Read` on **Analytics → Workflows** already include both privileges and need no change.

View [#285645]({{kib-pull}}285645).
::::

## 9.5.2 [kibana-9.5.2-breaking-changes]

$$$kibana-283150$$$
::::{dropdown} Update HTTPS proxy TLS settings if the email connector fails after upgrade
**Details**<br> {{kib}} now ships nodemailer 9, which validates the proxy server's TLS certificate when the email connector sends mail through an HTTPS proxy. Earlier versions skipped that check, so a proxy with a self-signed, expired, or hostname-mismatched certificate now causes sending to fail. Hosted and cloud SMTP with public certificate authorities is unaffected.

**Impact**<br> Self-managed deployments that route email through an HTTPS proxy with a certificate that isn't trusted by default can no longer send email until TLS verification is updated.

**Action**<br> Trust the proxy certificate, or set `xpack.actions.ssl.proxyVerificationMode: none` to restore the previous behavior. Note that `certificate` behaves the same as `full` on the proxy connection: a custom CA or relaxed hostname check does not apply there.

View [#283150]({{kib-pull}}283150).
::::

## 9.5.1 [kibana-9.5.1-breaking-changes]

$$$kibana-282404$$$
::::{dropdown} Reject additional_datastreams_permissions values that don't match the datastream grammar
**Details**<br> {{fleet}} package policy validation for `additional_datastreams_permissions` previously used a regex that didn't enforce its documented `<type>-<suffix>` datastream prefix grammar (for example `logs-nginx-*`). A value only needed to start with `logs`, contain `metrics`, `traces`, or `synthetics`, or end with `profiles-...` to pass.

**Impact**<br> Package policy requests that set `additional_datastreams_permissions` to a value that doesn't match the `<type>-<suffix>` grammar — such as a dashless value or one starting with a wildcard, for example `logs*` — are now rejected.

**Action**<br> Update any `additional_datastreams_permissions` values to the `<type>-<suffix>` form, for example `logs-nginx-*`.

View [#282404]({{kib-pull}}282404).
::::

## 9.5.0 [kibana-9.5.0-breaking-changes]

$$$kibana-274792$$$
::::{dropdown} Update Dashboards and Visualizations API requests to use short-hand duration units
**Details**<br> The `duration` format used in visualization configuration now uses short-hand unit values aligned with {{esql}} conventions for its `from` and `to` options. This affects the `api/visualizations` and `api/dashboards` APIs for both by-value and by-reference panels.

**Impact**<br> API requests that configure duration formats with previous verbose unit names, such as `milliseconds`, `minutes`, `humanize`, or `asMilliseconds`, are rejected.

**Action**<br> Update the duration `from` and `to` values in visualization and dashboard panel API payloads to the short-hand units, such as `ms`, `min`, `auto`, or `auto-approximate`.

View [#274792]({{kib-pull}}274792).
::::

$$$kibana-268951$$$
::::{dropdown} Update clients for the new Dashboards API search schema and page size limit
**Details**<br> The response envelope for the Dashboards API search endpoint changes from `{ dashboards, page, total }` to `{ data, meta }`. The pagination fields (`page`, `per_page`, and `total`) move under `meta`. The endpoint also enforces a maximum `per_page` of 1,000.

**Impact**<br> Clients that read `dashboards`, `page`, or `total` at the top level no longer receive those fields. Requests with `per_page` above 1,000 are rejected.

**Action**<br> Update Dashboards API search clients to read results from `data` and pagination from `meta`, and keep `per_page` at or below 1,000.

View [#268951]({{kib-pull}}268951).
::::

$$$kibana-272894$$$
::::{dropdown} Update clients for the dedicated Managed integrations API response model
**Details**<br> `POST /api/fleet/managed_integrations` (previously `POST /api/fleet/agentless_policies`) now returns a dedicated `ManagedIntegration` response model instead of the internal `PackagePolicy` shape. The `format` query parameter is removed. The request body no longer accepts `description`, `var_group_selections`, `additional_datastreams_permissions`, or `condition`.

**Impact**<br> External API clients that read `PackagePolicy` fields such as `policy_ids`, `revision`, `supports_agentless`, `secret_references`, `output_id`, `fleet_server_host_id`, or `enabled` from the response receive a different payload. Requests that include removed body fields or the `format` query parameter fail validation.

**Action**<br> Update integrations to consume the `ManagedIntegration` fields (`id`, `name`, `namespace`, `package`, `inputs`, `vars`, `global_data_tags`, `cloud_connector`, and timestamps). Remove the `format` query parameter and dropped request body fields from create calls.

View [#272894]({{kib-pull}}272894).
::::

$$$kibana-268942$$$
::::{dropdown} Grant `cluster:monitor` to access the full `GET /api/status` payload
**Details**<br> `GET /api/status` now requires the {{es}} `cluster:monitor` privilege to return the full payload, including host info, build details, core and plugin status, and metrics. Authenticated callers without `monitor`, and callers when the privilege check fails, receive `{ "status": { "overall": { "level": "<level>" } } }`. Unauthenticated Kubernetes liveness and readiness probes are unchanged. The `/status` UI shows an informational prompt for users without `monitor` when the bypass is turned off.

**Impact**<br> Monitoring scripts or automation that call `/api/status` with credentials lacking `cluster:monitor` receive a redacted response instead of build, host, and plugin details. The `/status` page shows limited information for those users.

**Action**<br> Grant `cluster:monitor` to monitoring users and roles that need the full status payload. While updating roles, set `status.statusPageBypassMonitorPrivilege: true` to preserve the previous authenticated behavior.

View [#268942]({{kib-pull}}268942).
::::

$$$kibana-267517$$$
::::{dropdown} Update external plugins that use field formatter HTML output
**Details**<br> {{kib}} 9.5 removes HTML string output from field formatters, including the `'html'` content type and related conversion utilities. Field formatters now return plain text or React elements. This change does not affect formatted values in the {{kib}} UI.

**Impact**<br> External plugins that request `'html'` output or consume HTML strings from field formatters must be updated for {{kib}} 9.5.

**Action**<br> When updating your external plugin, replace HTML formatting calls with `convertToText()` or `convertToReact()`. For `@kbn/discover-utils`, use `formatFieldValueText` or `formatFieldValueReact`.

View [#267517]({{kib-pull}}267517).
::::

$$$kibana-280959$$$
::::{dropdown} Managed integrations can no longer be created, updated, upgraded, or copied through the package policy and agent policy APIs
**Details**<br> Creating, updating, upgrading, or copying managed integrations (formerly agentless) through the {{fleet}} package policy (`/api/fleet/package_policies`) and agent policy (`/api/fleet/agent_policies`) APIs is no longer supported. These operations are served exclusively by the Managed integrations API (`/api/fleet/managed_integrations`). This affects Elastic Cloud Hosted deployments and Elastic Cloud Serverless projects where managed integrations are enabled. Self-managed deployments are not affected.

**Impact**<br> Requests that create, update, upgrade, or copy managed integrations through the package policy or agent policy APIs now fail with a `400` error. Existing managed integrations are not affected: they keep running and are upgraded and reconciled automatically, with no action required. Only clients that call the package policy or agent policy APIs directly for these write operations need to change.

**Action**<br> Use the Managed integrations API (`/api/fleet/managed_integrations`) to create, update, upgrade, or copy managed integrations, and update any automation that relied on the package policy or agent policy APIs for these operations.

View [#280959]({{kib-pull}}280959).
::::

## 9.4.0 [kibana-9.4.0-breaking-changes]

$$$kibana-255122-9.4.0$$$
::::{dropdown} The `_source` field mode is now saved to the template index settings
**Details**<br> The index and component template forms in **Index Management** previously saved the `_source` field mode (`stored` and `synthetic`) in the `mappings._source.mode` setting. This path is deprecated and has no effect in {{es}}. The form now uses the correct `settings.index.mapping.source.mode` setting. Other `_source` options (`enabled`, `includes`, and `excludes`) remain in mappings.

**Impact**<br> When you edit a template in the UI, any existing `mappings._source.mode` setting is automatically moved to the index settings and removed from mappings.

**Action**<br> The migration happens automatically when you edit a template in the **Index Management** UI. If you manage templates outside the UI (via API or configuration files), update them to use `settings.index.mapping.source.mode` instead of `mappings._source.mode`.

View [#255122]({{kib-pull}}255122).
::::


$$$kibana-249855$$$
::::{dropdown} {{esql}} tool parameter types simplified in Agent Builder API
**Details**<br> The Agent Builder {{esql}} tool API now uses simplified parameter types aligned with {{esql}}'s actual capabilities instead of Elasticsearch field types. The supported `configuration.params[*].type` values are now: `string`, `integer`, `float`, `boolean`, and `date`. Previously accepted types (`text`, `keyword`, `long`, `double`, `object`, `nested`) are no longer valid for new API requests. Additionally, `defaultValue` is now restricted to `string | number | boolean` and requires `optional: true` to be set.

**Impact**<br> API calls to `POST /api/agent_builder/tools` or `PUT /api/agent_builder/tools/{id}` that use legacy parameter types will be rejected with a 400 error. Existing tools stored with legacy types are automatically migrated on read: `text`/`keyword`/`object`/`nested` become `string`, `long` becomes `integer`, and `double` becomes `float`. Legacy `object`/`nested` default values are JSON-stringified.

**Action**<br> Update any integrations that create or update {{esql}} tools via the API to use the new type values:
- Use `string` instead of `text`, `keyword`, `object`, or `nested`
- Use `integer` instead of `long`
- Use `float` instead of `double`
- Ensure `defaultValue` is only provided when `optional: true`

View [#249855]({{kib-pull}}249855).
::::

## 9.3.2 [kibana-9.3.2-breaking-changes]
$$$kibana-255122$$$
::::{dropdown} The `_source` field mode is now saved to the template index settings

**Details**<br> The index and component template forms in **Index Management** previously saved the `_source` field mode (`stored` and `synthetic`) in the `mappings._source.mode` setting. This path is deprecated and has no effect in {{es}}. The form now uses the correct `settings.index.mapping.source.mode` setting. When you edit a template in the UI, any existing `mappings._source.mode` setting is automatically moved to the index settings and removed from mappings. Other `_source` options (`enabled`, `includes`, and `excludes`) remain in mappings.

View [#255122]({{kib-pull}}255122).
::::

## 9.3.0 [kibana-9.3.0-breaking-changes]

There are no breaking changes in this version.

## 9.2.0 [kibana-9.2.0-breaking-changes]
$$$kibana-230067$$$
::::{dropdown} Improved advanced settings management APIs privilege checks 
**Details**<br> Roles with explicit `read` access to advanced settings but `all` access to `SavedObjectManagement` can no longer update settings using the internal advanced settings API. This update enforces explicit privileges instead of relying on saved object security checks.
View [#230067]({{kib-pull}}230067).
::::

## 9.1.0 [kibana-9.1.0-breaking-changes]
$$$kibana-213916$$$
::::{dropdown} Change to variable syntax in {{esql}} queries

**Details**<br> Fields and functions variables are now described with `??` in {{esql}} queries. For value variables, you can continue to use `?`. 

View [#213916]({{kib-pull}}213916).
::::

$$$kibana-216558$$$
::::{dropdown} API keys are used for authenticating report generation requests

**Details**<br> In 9.1.0, report generation requests are authenticated by API keys instead of session cookies. There are several key differences between the authentication methods. API keys capture your role privileges, whereas session cookie are based on your user credentials. API keys are also longer-lived, compared to session cookies, which have a shorter lifespan.


If you have a cross-cluster search environment and want to generate reports from remote clusters, you must have the appropriate cluster and index privileges on the remote cluster and local cluster. For example, if requests are authenticated with an API key, the API key requires certain privileges on the local cluster that contains the local index, in addition to the remote. For more information and examples, refer to [Configure roles and users for remote clusters](docs-content://deploy-manage/remote-clusters/remote-clusters-cert.md#remote-clusters-privileges-cert).

View [#216558]({{kib-pull}}216558).
::::

## 9.0.0 [kibana-900-breaking-changes]
$$$kibana-193792$$$
:::{dropdown} Access to {{kib}}'s internal APIs is blocked
Access to internal Kibana HTTP APIs is restricted from version 9.0.0. This is to ensure that HTTP API integrations with Kibana avoid unexpected breaking changes.

**Impact**<br> Any HTTP API calls to internal Kibana endpoints will fail with a 400 status code starting from version 9.0.0.

**Action**<br> **Do not integrate with internal HTTP APIs**. They may change or be removed without notice, and lead to unexpected behaviors. If you would like some capability to be exposed over an HTTP API, [create an issue](https://github.com/elastic/kibana/issues/new/choose). We would love to discuss your use case.

View [#193792](https://github.com/elastic/kibana/pull/193792).
::::



**Alerts and cases**

$$$kibana-203148$$$
::::{dropdown} Removed deprecated Alerting endpoints
* `POST /api/alerts/alert/{id?}` has been replaced by `POST /api/alerting/rule/{id?}`
* `GET /api/alerts/alert/{{id}}` has been replaced by `GET /api/alerting/rule/{{id}}`
* `PUT /api/alerts/alert/{{id}}` has been replaced by `PUT /api/alerting/rule/rule/{{id}}`
* `DELETE: /api/alerts/alert/{{id}}` has been replaced by `DELETE /api/alerting/rule/{{id}}`
* `POST /api/alerts/alert/{{id}}/_disable` has been replaced by `POST /api/alerting/rule/{{id}}/_disable`
* `POST /api/alerts/alert/{{id}}/_enable` has been replaced by `POST /api/alerting/rule/{{id}}/_enable`
* `GET /api/alerts/_find` has been replaced by `GET /api/alerting/rules/_find`
* `GET /api/alerts/_health` has been replaced by `GET /api/alerting/rule/_health`
* `GET /api/alerts/list_alert_types` has been replaced by `GET /api/alerting/rule_types`
* `POST /api/alerts/alert/{{alert_id}}/alert_instance/{{alert_instance_id}}/_mute` has been replaced by `POST /api/alerting/rule/{{rule_id}}/alert/{{alert_id}}/_mute`
* `POST /api/alerts/alert/{{alert_id}}/alert_instance/{{alert_instance_id}}/_unmute` has been replaced by `POST /api/alerting/rule/{{rule_id}}/alert/{{alert_id}}/_unmute`
* `POST /api/alerts/alert/{{id}}/_mute_all` has been replaced by `POST /api/alerting/rule/{{id}}/_mute_all`
* `POST /api/alerts/alert/{{id}}/_unmute_all` has been replaced by `POST /api/alerting/rule/{{id}}/_unmute_all`
* `POST /api/alerts/alert/{{id}}/_update_api_key` has been replaced by `POST /api/alerting/rule/{{id}}/_update_api_key`
* `GET /api/alerts/{{id}}/_instance_summary` has been deprecated without replacement. Will be removed in v9.0.0
* `GET /api/alerts/{{id}}/state` has been deprecated without replacement. Will be removed in v9.0.0

**Impact**<br> Deprecated endpoints will fail with a 404 status code starting from version 9.0.0.

**Action**<br> Remove references to `GET /api/alerts/{{id}}/_instance_summary` endpoint. Remove references to `GET /api/alerts/{{id}}/state` endpoint. Replace references to endpoints listed as deprecated by it’s replacement. See `Details` section. The updated APIs can be found in [https://www.elastic.co/docs/api/doc/kibana/group/endpoint-alerting](https://www.elastic.co/docs/api/doc/kibana/group/endpoint-alerting).
::::

$$$kibana-198435$$$
::::{dropdown} Removed deprecated Alerting settings
:name: breaking-198435

**Details**

The following deprecated configuration settings were removed:

- `xpack.actions.customHostSettings.ssl.rejectUnauthorized`
- `xpack.actions.whitelistedHosts`
- `xpack.actions.rejectUnauthorized`
- `xpack.actions.proxyRejectUnauthorizedCertificates`
- `xpack.alerts.healthCheck`
- `xpack.alerts.invalidateApiKeysTask.interval`
- `xpack.alerts.invalidateApiKeysTask.removalDelay`
- `xpack.alerting.defaultRuleTaskTimeout`

View [#198435]({{kib-pull}}198435).
::::

$$$kibana-208208$$$

$$$kibana-208086$$$

$$$kibana-207926$$$
::::{dropdown} Removed deprecated Cases endpoints
:name: deprecation-208208

**Details**

The following Cases APIs were removed:

- Get case status
- Get user actions
- Get all comments

* `GET /api/cases/status` is deleted with no replacement
* `GET /api/cases/{{case_id}}/comments` is replaced by `GET /api/cases/{{case_id}}/comments/_find`, released in v7.13
* `GET /api/cases/<case_id>/user_actions` is replaced by `GET /api/cases/<case_id>/user_actions/_find`, released in v8.7
* `includeComments` parameter in `GET /api/cases/{{case_id}}` is deprecated. Use `GET /api/cases/{{case_id}}/comments/_find` instead, released in v7.13

**Impact**<br> Using these endpoints will fail with a 404 status code starting from version 9.0.0.

**Action**<br> Remove references to the `GET /api/cases/status` endpoint. Replace references to other endpoints with the replacements listed in the breaking change details.

View [#208208]({{kib-pull}}208208), [#208086]({{kib-pull}}208086), and [#207926]({{kib-pull}}207926).
::::

$$$kibana-197421$$$

$$$kibana-201313$$$
::::{dropdown} Removed ephemeral tasks from task manager, action, and alerting plugins.
:name: breaking-201313

**Details**

Ephemeral tasks are now removed. The following settings will no longer have any effect and are now deprecated:

- `xpack.task_manager.ephemeral_tasks.enabled`
- `xpack.task_manager.ephemeral_tasks.request_capacity`
- `xpack.alerting.maxEphemeralActionsPerAlert`

No action is required on the user's end.

View [#201313]({{kib-pull}}201313) and [#197421]({{kib-pull}}197421).
::::

**Discover and dashboards**

$$$kibana-203927$$$
::::{dropdown} Search sessions disabled by default
:name: breaking-203927

**Details**<br> Starting from version 9.0.0, search sessions are disabled by default. To view, manage, and restore search sessions, the feature needs to be explicitly re-enabled.

**Impact**<br> Search sessions will be disabled unless they are explicitly enabled in config.yml.

**Action**<br> If you would like to continue using, managing, and restoring search sessions in 9.0, you’ll need to re-enable the feature in your kibana.yml configuration file. If not, no action is necessary.

To re-enable search sessions, add the following in your config.yml:

```
data.search.sessions.enabled: true
```

View [#203927](https://github.com/elastic/kibana/pull/203927).
::::

$$$kibana-202863$$$
::::{dropdown} Saved query privileges have been reworked
:name: breaking-202863

**Details**

Saved query privileges have been reworked to rely solely on a single global `savedQueryManagement` privilege, and eliminate app-specific overrides (e.g. implicit access with `all` privilege for Discover, Dashboard, Maps, and Visualize apps). This change simplifies the security model and ensures consistency in the saved query management UI across Kibana, but results in different handling of saved query privileges for new user roles, and minor breaking changes to the existing management UX.

**Impact**

The `savedQueryManagement` feature privilege now globally controls access to saved query management for all new user roles. Regardless of privileges for Discover, Dashboard, Maps, or Visualize, new user roles follow this behaviour:

- If `savedQueryManagement` is `none`, the user cannot see or access the saved query management UI or APIs.
- If `savedQueryManagement` is `read`, the user can load queries from the UI and access read APIs, but cannot save queries from the UI or make changes to queries through APIs.
- If `savedQueryManagement` is `all`, the user can both load and save queries from the UI and through APIs.

**Action**

Existing user roles that were previously implicitly granted access to saved queries through the dashboard, discover, visualize, or maps feature privileges will retain that access to prevent breaking changes. While no action is required for existing roles, it’s still advisable to audit relevant roles and re-save them to migrate to the latest privileges model. For new roles, ensure that the savedQueryManagement privilege is set as needed.

View [#202863](https://github.com/elastic/kibana/pull/202863).
::::

$$$kibana-202679$$$
::::{dropdown} Removed `discover:searchFieldsFromSource` setting
:name: breaking-202679

The `discover:searchFieldsFromSource` advanced setting has been removed.

**Details**

Users can no longer configure Discover to load fields from `_source`. This is an internal optimization and should have little impact on users. View [#202679](https://github.com/elastic/kibana/pull/202679).
::::

$$$kibana-201254$$$
::::{dropdown} Removed the legacy table in Discover
:name: breaking-201254

**Details**

It's no longer possible to use the legacy documents table in Discover. To that effect, the `doc_table:legacy` and `truncate:maxHeight` deprecated advanced settings have been removed. View [#201254]({{kib-pull}}201254).

**Impact**

This is primarily a UX change and should have little impact on Discover users.
::::

$$$kibana-202250$$$
::::{dropdown} Scripted field creation has been disabled in the Data Views management page
:name: breaking-202250

**Details**

The ability to create new scripted fields has been removed from the *Data Views* management page in 9.0. Existing scripted fields can still be edited or deleted, and the creation UI can be accessed by navigating directly to `/app/management/kibana/dataViews/dataView/{dataViewId}/create-field`, but we recommend migrating to runtime fields or ES|QL queries instead to prepare for removal.

**Impact**

It will no longer be possible to create new scripted fields directly from the *Data Views* management page.

**Action**

Migrate to runtime fields or ES|QL instead of creating new scripted fields. Existing scripted fields can still be edited or deleted.
::::

$$$kibana-162389$$$
::::{dropdown} Removed `visualization:colorMapping` advanced setting
:name: kibana-deprecation-197802

**Details**

The `visualization:colorMapping` advanced setting for TSVB and Visualize charts has been removed. You can switch to Lens charts, which offer a more advanced, per-chart color mapping feature with enhanced configuration options. View [#162389](https://github.com/elastic/kibana/pull/162389).
::::

**Elasticsearch solution**

$$$kibana-212031$$$
::::{dropdown} Removed Behavioral Analytics
:name: breaking-212031

**Details**

The Behavioral Analytics feature is removed from the Kibana interface in 9.0 and its associated [APIs are deprecated](https://www.elastic.co/docs/release-notes/elasticsearch/deprecations#elasticsearch-900-deprecations).

View [#212031]({{kib-pull}}212031).
::::


**Elastic Observability solution**

$$$kibana-202278$$$
::::{dropdown} Profiling now defaults to 19Hz sampling frequency
:name: breaking-202278

**Details**

View [#202278]({{kib-pull}}202278).
::::

$$$kibana-203996$$$
::::{dropdown} Disabled log stream and settings pages
:name: deprecation-203996

**Details**

Logs Stream and the logs settings page in Observability are removed. Use the Discover application, which now offers a contextual experience for logs, to explore your logs. The logs stream panel in dashboards is removed, use Discover sessions instead.

View [#203996]({{kib-pull}}203996).
::::

$$$kibana-203685$$$
::::{dropdown} Removed Logs explorer
:name: deprecation-203685

**Details**

Logs explorer has been removed. Instead, you can use Discover, that was improved to provide an optimal logs exploration experience. View [#203685]({{kib-pull}}203685).
::::

**Elastic Security solution**

For the Elastic Security 9.0.0 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

**Data ingestion and Fleet**

$$$kibana-198799$$$
::::{dropdown} Removed deprecated settings API endpoints in Fleet
:name: breaking-198799

**Details**

- `GET/DELETE/POST enrollment-api-keys`: removed in favor of `GET/DELETE/POST enrollment_api_keys`
- Removed `list` property from `GET enrollment_api_keys` response in favor of `items`
- `GET/POST /settings`: `fleet_server_hosts` was removed from the response and body

View [#198799]({{kib-pull}}198799).
::::

$$$kibana-198313$$$
::::{dropdown} Removed deprecated Fleet APIs for agents endpoints
:name: breaking-198313

**Details**

Removed API endpoints:

- `POST /service-tokens` in favor of `POST /service_tokens`
- `GET /agent-status` in favor `GET /agent_status`
- `PUT /agents/:agentid/reassign` in favor of `POST /agents/:agentid/reassign`

Removed deprecated parameters or responses:

- Removed `total` from `GET /agent_status` response
- Removed `list` from `GET /agents` response

View [#198313]({{kib-pull}}198313).
::::

$$$kibana-198434$$$
::::{dropdown} Removed deprecated `epm` Fleet APIs
:name: breaking-198434

**Details**

- Removed `GET/POST/DELETE /epm/packages/:pkgkey` APIs in favor of `GET/POST/DELETE /epm/packages/:pkgName/:pkgVersion`
- Removed `experimental` query parameter in `GET /epm/packages` and `GET /epm/categories`
- Removed `response` in response in `* /epm/packages*` and `GET /epm/categories`
- Removed `savedObject` in `/epm/packages` response in favor of `installationInfo`

View [#198434]({{kib-pull}}198434).
::::

$$$kibana-199226$$$
::::{dropdown} Removed deprecated `topics` property for kafka output in favor of the `topic` property
:name: breaking-199226

**Details**

Removed deprecated property `topics` from output APIs in response and requests (`(GET|POST|PUT) /api/fleet/outputs`) in favor of the `topic` property. View [#199226]({{kib-pull}}199226).
::::

$$$kibana-196887$$$
::::{dropdown} Limit pagination size to 100 when retrieving full policy or `withAgentCount` in Fleet
:name: breaking-196887

**Details**

In addition to the new pagination limit size of 100, retrieving agent policies without agent count is now the new default behavior, and a new query parameter `withAgentCount` was added to retrieve the agent count.

View [#196887]({{kib-pull}}196887).
::::

**Reporting**

$$$kibana-200834$$$
:::{dropdown} Reporting uses Kibana feature privileges only to control access to reporting features
In 8.x, the default access control model was based on a built-in role called `reporting_user`, which granted access to reporting features. Since 7.13, the preferred model for controlling access to reporting features has been Kibana feature privileges, enabled by setting `xpack.reporting.roles.enabled: false` in `kibana.yml`.

In 9.0.0, the `xpack.reporting.roles.*` settings will be ignored.

**Impact**<br> The built-in `reporting_user` role is no longer deprecated and provides access to reporting features using Kibana feature privileges. This means that users that do not have privileges to use reporting will not see reporting features in the Kibana UI.

**Action**<br> Use Kibana feature privileges to control access to reporting features.

* The `reporting_user` role is still supported, but gives full access to all reporting features. We recommend creating custom roles with minimal privileges in **Stack Management > Roles**.
* The `xpack.reporting.roles.allow` setting is no longer supported. If you have a `xpack.reporting.roles.allow` value in your `kibana.yml`, you should remove this setting and assign privileges to reporting features using Kibana feature privileges.

View [#200834](https://github.com/elastic/kibana/pull/200834).
::::

$$$kibana-199033$$$
::::{dropdown} Removed the "Download CSV" export type functionality
:name: breaking-199033

**Details**

The functionality that allowed to download a CSV export from a dashboard's saved search panel without creating a report has been removed. To export CSV data from a dashboard panel, you may use the action menu of a saved search panel in a dashboard to generate a CSV report, and download the report from a toast popup when the report has finished generating. 

View [#199033]({{kib-pull}}199033).
::::

**Kibana management**

$$$kibana-214051$$$
:::{dropdown} Upgrade Assistant's reindexing and batch reindexing APIs are now internal

Upgrade Assistant public APIs for reindexing and batch reindexing have been made internal. You should instead use Elasticsearch’s native reindexing APIs for programmatic reindexing.

View [#214051]({{kib-pull}}214051).
:::

**Kibana security**

$$$kibana-199656$$$
:::{dropdown} Removed v1 Security endpoints
All `v1` Kibana security HTTP endpoints have been removed.

`GET /api/security/v1/logout` has been replaced by `GET /api/security/logout` `GET /api/security/v1/oidc/implicit` has been replaced by `GET /api/security/oidc/implicit` `GET /api/security/v1/oidc` has been replaced by GET `/api/security/oidc/callback` `POST /api/security/v1/oidc` has been replaced by POST `/api/security/oidc/initiate_login` `POST /api/security/v1/saml` has been replaced by POST `/api/security/saml/callback` `GET /api/security/v1/me` has been removed with no replacement.

**Impact**<br> Any HTTP API calls to the `v1` Kibana security endpoints will fail with a 404 status code starting from version 9.0.0. Third party OIDC and SAML identity providers configured with `v1` endpoints will no longer work.

**Action**<br> Update any OIDC and SAML identity providers to reference the corresponding replacement endpoint listed above. Remove references to the `/api/security/v1/me` endpoint from any automations, applications, tooling, and scripts.

View [#199656](https://github.com/elastic/kibana/pull/199656).
::::

$$$kibana-213123$$$
::::{dropdown} Removed default `--openssl-legacy-provider`
:name: breaking-213123

**Details**

Legacy OpenSSL algorithms have been disabled by default. Further information on which algorithms can be found at https://docs.openssl.org/3.0/man7/OSSL_PROVIDER-legacy. These can be re-enabled by adding `--openssl-legacy-provider` to $KBN_PATH_CONF/node.options. View [#213123]({{kib-pull}}213123).
::::

$$$kibana-203856$$$
::::{dropdown} Removed `TLSv1.1` from the default set of supported protocols
:name: deprecation-203856

**Details**

View [#203856]({{kib-pull}}203856).
::::
