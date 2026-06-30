---
navigation_title: "Known issues"
---

# Kibana known issues

For Elastic {{observability}} known issues, refer to [Elastic Observability known issues](docs-content://release-notes/elastic-observability/known-issues.md).

For Elastic Security known issues, refer to [Elastic Security known issues](docs-content://release-notes/elastic-security/known-issues.md).

::::{dropdown} Upgrading to versions 9.4.0-9.4.2 on deployments with many rules might cause {{kib}} instability

Applies to: {{stack}} 9.4.0-9.4.2

**Details**

Deployments with a large number of active rules (for example, thousands of rules) and multiple {{kib}} nodes might experience {{kib}} process crashes after upgrading to 9.4.0-9.4.2. Affected deployments exhibit high memory usage that causes the OS to terminate {{kib}} processes.

**Workaround**

Upgrade to {{stack}} 9.4.3+.

**Resolved**

This issue is resolved in {{stack}} 9.4.3+.
::::

::::{dropdown} Canvas workpad autoplay stops after the first page

Applies to: {{stack}} 9.3.6, 8.19.17

**Details**

When autoplay is enabled for a Canvas workpad, the presentation stops advancing after the first page instead of cycling through all pages.

**Workaround**

Navigate between pages manually, or upgrade to a release that includes the fix.

**Resolved**

This issue is resolved in {{stack}} 9.3.7 and 8.19.18.

::::

::::{dropdown} Fleet bulk agent actions can affect agents in other spaces

Applies to: {{stack}} 9.1.x, 9.2.0–9.2.7, 9.3.0–9.3.2

**Details**

A KQL operator precedence issue in Fleet's bulk action code causes the namespace filter to be ignored when a user-supplied kuery is also present. When issuing a bulk agent action (unenroll, reassign, upgrade, or rollback) with "Select everything on all pages" in the UI, or using the bulk actions API with a `kuery` parameter, agents in other {{kib}} spaces can be unintentionally affected.

**Workaround**

When performing bulk agent actions across all pages, select agents individually or in smaller batches using explicit filtering within a single space rather than relying on "Select everything on all pages" with a kuery.

**Resolved**

This issue is resolved in {{stack}} 9.2.8, 9.3.3, 9.4.0. Version 9.1 is end of life — upgrade to {{stack}} 9.2.8+ or 9.3.3+.

::::

::::{dropdown} Upgrading to 9.3.x fails when a rule action contains oversized content

Applies to: {{stack}} 9.3.0, 9.3.1, 9.3.2, 9.3.3, 9.3.4

**Details**

Upgrading from 9.2.x to 9.3.x can fail if any rule (Stack, Observability, or Security) has a connector action whose parameter values are larger than 32,766 bytes. Common examples include email message bodies or HTML templates, large webhook payloads, or Slack messages built from verbose templates.

During the upgrade, {{kib}} migrates rule saved objects to a new internal mapping. Any oversized action parameter value causes the migration to abort with an error similar to:

````
Flattened field [alert.actions.params] contains one immense field whose keyed encoding is longer than the allowed max length of 32766 bytes
````

**Workaround**

Upgrade to 9.3.5 or 9.4.2.

If the upgrade to 9.3.0, 9.3.1, 9.3.2, 9.3.3, 9.3.4 failed with this error, identify rules that use connectors with large content (particularly email, webhook, and Slack connectors) and shorten the action parameter values, such as message bodies or HTML templates. Then retry the upgrade.

**Resolved**

This issue is resolved in {{stack}} 9.3.5 and 9.4.2.

::::

::::{dropdown} Stack alerts remain active instead of transitioning to recovered

Applies to: {{stack}} 9.2.7, 9.2.8, 9.3.2, 9.3.3

**Details**

Some Stack alerts send recovery notifications (for example, Slack, email, or webhook) but remain `active` in {{kib}} instead of transitioning to `recovered`.

**Action**

Manually untrack stale alerts or upgrade to {{stack}} 9.3.4 or 9.4.0.

**Resolved**

This issue is resolved in {{stack}} 9.3.4 and 9.4.0.

::::


::::{dropdown} Dashboards with controls might fail to open

Applies to: {{stack}} 9.4.0

**Details**

Some existing dashboards are failing to load when a pinned control has `"title": null` in the saved object. This manifests as an error like `Invalid response. [pinned_panels.0.config.title]: expected value of type [string] but got [null].` error on the dashboard app.

**Action**

If you have existing dashboards with controls, do not upgrade to {{stack}} 9.4.0. Upgrade to {{stack}} 9.4.1 instead.

If you already upgraded to {{stack}} 9.4.0 and dashboards fail to open with this error, contact Elastic Support for remediation guidance.

**Resolved**

This issue is resolved in {{stack}} 9.4.1.

::::

::::{dropdown} The connection between agentless integrations and {{fleet-server}} is broken
:applies_to: ess: ga

Applies to: {{stack}} <9.1.6

**Details**

When agentless integrations are deployed in {{fleet}} in an {{ech}} deployment, the connection between the agentless integrations and {{fleet-server}} can be broken if the default {{fleet-server}} host URL is modified or if a different host URL is set as the default.

**Resolved**

This issue is resolved in {{stack}} 9.1.6.

::::

::::{dropdown} Alerts aren't generated for rules with alert flapping off and an alert delay higher than 1

Applies to: {{stack}} 9.0.0-9.2.0

**Details**

Alerts aren't generated for rules that have **Alert flapping detection** turned off and the alert delay set to a value higher than 1.

**Workaround**

Set the alert delay value to 1 or turn on **Alert flapping detection**.

::::

::::{dropdown} Reports created in non-default Kibana spaces aren't shown in the Reporting UI

Applies to: {{stack}} 9.1.0, 9.1.1

**Details**

After creating a report in a non-default {{kib}} space, the document exists in the `.kibana-reporting` index but isn't shown in the Reporting UI.

::::

::::{dropdown} Issues with rules occur when xpack.alerting.rules.run.alerts.max is set to a value greater than 5000

Applies to: {{stack}} 9.0.3, 9.0.4, 9.1.0

**Details**

If you've set `xpack.alerting.rules.run.alerts.max` to a value greater than `5000`, you will encounter `Result window is too large` error messages when a maintenance window is active.

**Action**

To mitigate the issue, set `xpack.alerting.rules.run.alerts.max` to a value equal to or less than `5000`.

**Resolved**

This issue is resolved in {{stack}} 9.1.0 and 9.1.2.

::::

::::{dropdown} PDF and PNG reports time out and fail with an invalid header error if server.protocol is set to http2

Applies to: {{stack}} 9.0.0

**Details**

Starting in  9.0.0, the default value of `server.protocol` is `http2`. PDF and PNG reports will fail when this setting is used in this release.

**Action**

To temporarily resolve the issue, set `server.protocol` to `http1`. 

**Resolved**

This issue is resolved in {{stack}} 9.0.0, 9.0.4, 9.1.0.

::::

::::{dropdown} Dashboard Copy link doesn't work when sharing from a space other than the default space

Applies to: {{stack}} 9.0.3

**Details**

When attempting to share a dashboard from a space that isn't the default space, the **Copy link** action never completes.

**Action**

To avoid this error, don't upgrade {{kib}} to {{stack}} 9.0.3 or upgrade {{kib}} to {{stack}} 9.0.4 when available.

**Resolved**

This issue is resolved in {{stack}} 9.0.4.

::::

::::{dropdown} Upgrading Kibana from 8.18.x to 9.0.2 fails due to a configuration conflict in the kibana.yml file

Applies to: {{stack}} 9.0.2

**Details**

Upgrading {{kib}} from version 8.18.x to 9.0.2 fails due to a configuration conflict if `xpack.alerting.cancelAlertsOnRuleTimeout` is set to `false` in the `kibana.yml` file. {{kib}} fails to boot and shows a fatal error message in the {{kib}} logs that's similar to the following:

````
FATAL Error: Rule type "transform_health" cannot have both cancelAlertsOnRuleTimeout set to false and autoRecoverAlerts set to true.
````

This failure occurs when the `xpack.alerting.cancelAlertsOnRuleTimeout` setting is set to `false`, which is incompatible with the default configuration of an internal setting (`autoRecoverAlerts`) in 9.0.2.


**Action**

To temporarily resolve the issue and allow the upgrade to proceed, follow these steps:

1. Remove the `xpack.alerting.cancelAlertsOnRuleTimeout: false` setting from the `kibana.yml` file.
2. Restart {{kib}} to apply the changes.

**Resolved**

This was resolved in {{stack}} 9.0.3.

::::

::::{dropdown} Errors in rule executions occur when maintenance windows have filters

Applies to: {{stack}} 9.0.0, 9.0.1, 9.0.2

**Details**
Errors occur when rules run during an active maintenance window that has filters and a matching rule category. 

**Workaround**
Remove any filters added to the active maintenance window.

**Resolved**

This was resolved in {{stack}} 9.0.3.

::::

::::{dropdown} Issue with follower indices during upgrade
:name: ua-follower-indices

Applies to: {{stack}} 9.0.0

**Details**

In Upgrade Assistant, follower indices may be identified to be reindexed. However, this is not a valid migration path and will result in an error. Instead, the recommendation is to mark as read-only and unfollow the leader index. Cross-cluster replication on that index will not be possible.

Find additional information in the [upgrade documentation](docs-content://deploy-manage/upgrade/prepare-to-upgrade.md#upgrade-ccr-data-streams).

::::

::::{dropdown} Unexpected deprecation warnings for APM indices during upgrade
:name: known-issue-apm-upgrade-on-ech

Applies to: {{stack}} 9.0.0

**Details**

When upgrading an {{ech}} deployment to {{stack}} 9.0.0, you may see deprecation warnings for APM indices, even if you are not using APM.

If your deployment ever ran on {{stack}} 7.x, these APM indices have been created automatically at that time, even if you didn't use APM. In this case, these indices exist and are empty.

**Action**

To proceed with the upgrade to 9.0.0, you must resolve all deprecation notices for indices beginning with the name `apm-7` by selecting **Mark as read-only** for each of them.

::::

::::{dropdown} Upgrade Assistant - Rollup jobs need to be stopped before rollup indices are reindexed
:name: known-issue-211850

Applies to: {{stack}} 9.0.0

**Details**

Rollup indices, like all indices, created in 7.x or earlier need to be reindexed in preparation for migration to 9.0. However, in addition to the normal reindex process the rollup job also needs to be accounted for.

**Action**

Stop the rollup job before reindexing begins otherwise there may be a gap in rollup data. You can restart the job can after reindexing is complete.

This needs to be performed manually until addressed in the upgrade assistant code.

View [#211850](https://github.com/elastic/kibana/issues/211850).

::::
