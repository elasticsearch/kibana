---
navigation_title: "Kibana"
mapped_pages:
  - https://www.elastic.co/guide/en/kibana/current/release-notes.html
  - https://www.elastic.co/guide/en/kibana/current/whats-new.html
---

# Kibana release notes [kibana-release-notes]

Review the changes, fixes, and more in each version of Kibana.

To check for security updates, go to [Security announcements for the Elastic stack](https://discuss.elastic.co/c/announcements/security-announcements/31).

% Release notes include only features, enhancements, and fixes. Add breaking changes, deprecations, and known issues to the applicable release notes sections.

% ## version.next [kibana-X.X.X-release-notes]

% ### Features and enhancements [kibana-X.X.X-features-enhancements]
% *

% ### Fixes [kibana-X.X.X-fixes]
% *

% FEATURES, ENHANCEMENTS, FIXES
% Paste in index.md

## 9.4.2 [kibana-9.4.2-release-notes]

:::{important}
The 9.4.2 release contains fixes for potential security vulnerabilities. Check our [security advisory](https://discuss.elastic.co/c/announcements/security-announcements/31) for more details.
:::

### Features and enhancements [kibana-9.4.2-features-enhancements]

**Search**:
* Improves the **Add inference endpoint** and **Edit inference endpoint** flyouts with clearer titles, a footer **Save** button, task type descriptions in the selector, always-visible endpoint ID and API reference fields, and inline validation for required fields [#262143]({{kib-pull}}262143).

### Fixes [kibana-9.4.2-fixes]

**Alerting and cases**:
* Fixes an issue that caused rules with large action parameter payloads to fail when saving or executing [#269467]({{kib-pull}}269467).
* Fixes case workflow templates resolving from the wrong owner [#268719]({{kib-pull}}268719).
* Fixes phrase search in the **All Cases** view [#266827]({{kib-pull}}266827).

**Connectivity**:
* Fixes the email connector to reject malformed email addresses (for example, local parts or domain labels with leading or trailing hyphens) that mail servers would reject, preventing unnecessary SMTP connection attempts [#268496]({{kib-pull}}268496).
* Fixes HTTP connector TLS options when connecting through proxies [#269898]({{kib-pull}}269898).
* Fixes client-side navigation in the content connectors UI to honor `server.basePath` and space URL prefixes, preventing 404s on connector detail tabs and after creation [#269571]({{kib-pull}}269571).

**Dashboards and Visualizations**:
* Fixes the links panel transform to remove an unsupported `enhancements` property [#270230]({{kib-pull}}270230).
* Fixes the Lens API so XY charts with legends at the top or bottom return the correct configuration [#268729]({{kib-pull}}268729).
* Fixes the Lens Visualization API rejecting `rank_by` with `operation: "count"` on terms buckets when no `field` is specified, so **Count** can rank by all documents without a field [#268620]({{kib-pull}}268620).
* Fixes the Visualization API to correctly show default datatable colored badges [#268425]({{kib-pull}}268425).
* Fixes gauge chart `min`, `max`, and `goal` configuration to reject unsupported reference-based metric operations (`moving_average`, `differences`, `cumulative_sum`, `counter_rate`) that require a date histogram [#268168]({{kib-pull}}268168).

**Data ingestion and Fleet**:
* Parses top-level `elasticsearch` fields in integration packages on upgrade or reinstall [#269080]({{kib-pull}}269080).
* Fixes the agent enrollment **Confirm incoming data** step timing out for integrations that ingest backdated data by checking `event.ingested` instead of `@timestamp` [#268224]({{kib-pull}}268224).

**Discover**:
* Preserves the expanded document selection after refresh when comparing documents in Discover [#268328]({{kib-pull}}268328).

**{{esql}} editor**:
* Allows `null` in `CASE()` expressions combined with other types [#269051]({{kib-pull}}269051).

**Elastic Observability solution**:
For the Elastic Observability 9.4.2 release information, refer to [Elastic Observability Solution Release Notes](docs-content://release-notes/elastic-observability/index.md).

**Elastic Security solution**:
For the Elastic Security 9.4.2 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

**Management**:
* Fixes missing modal and popover labels for screen readers across Stack Management UIs [#269652]({{kib-pull}}269652).

**Machine Learning**:
* Fixes File upload not disabling data view creation when the user lacks data view creation capabilities [#268167]({{kib-pull}}268167).

**Workflows**:
* Makes the `with` block optional in workflow YAML for connector steps that have no required parameters [#269047]({{kib-pull}}269047).

## 9.4.1 [kibana-9.4.1-release-notes]

### Fixes [kibana-9.4.1-fixes]

**Alerting**:
* Fixes empty rule type fields, such as `kibana.alert.reason`, on active alert documents when a delayed alert graduates to active during a flapping hold without an executor report. [#266012]({{kib-pull}}266012)

**Dashboards and Visualizations**:
* Fixes a critical validation failure that occurred when dashboard controls had `null` titles. Control titles are now converted to `undefined` during transforms, allowing validation to pass [#268220]({{kib-pull}}268220).
* Fixes a regression where the dashboard remained locked in an open-flyout state after closing the {{esql}} control edit flyout when editing an existing query-based control [#267605]({{kib-pull}}267605).

**Elastic Security solution**:
For the Elastic Security 9.4.1 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

## 9.4.0 [kibana-9.4.0-release-notes]

:::{important} - New recommended {{kib}} instance minimum size of 2 GB

We now recommend that your {{kib}} instances have at least 2 GB of memory, especially when using Platinum or Enterprise {{kib}} features, and for production workloads.

New {{ech}} deployments now default to 2 GB of RAM for each {{kib}} instance. 
:::

### Features and enhancements [kibana-9.4.0-features-enhancements]

**Alerting**:
* Makes `maximumCasesToOpen` a runtime property [#259255]({{kib-pull}}259255).
* Adds an auto-push case option to the case connector [#249251]({{kib-pull}}249251).
* Exposes the `maximumCasesToOpen` parameter in the case action connection [#247990]({{kib-pull}}247990).
* Adds additional workflow steps [#256922]({{kib-pull}}256922).
* Alert deletion is now generally available [#247465]({{kib-pull}}247465).

**Elastic Agent Builder**:
* Updates Test tool flyout to support datetime picker [#249549]({{kib-pull}}249549).
* Simplifies the {{esql}} test tool parameter types [#249855]({{kib-pull}}249855).
* Exposes `configuration_overrides` in `agent_builder/converse` API [#249256]({{kib-pull}}249256).
* Adds support for array parameter types in {{esql}} tools [#250386]({{kib-pull}}250386).
* Migrates the flyout to a sidebar [#252918]({{kib-pull}}252918).
* Adds server-side support for user-created skills in Agent Builder [#252493]({{kib-pull}}252493).
* Adds agent and tools RBAC sub features [#254464]({{kib-pull}}254464).
* Agent Builder's default agent is no longer read-only and can now be customized per Kibana space [#256333]({{kib-pull}}256333).
* Adds user-created skills to Agent Builder [#252221]({{kib-pull}}252221).
* Allows Agent Builder to detect outdated attachments and lets users refresh them into the next message [#257658]({{kib-pull}}257658).
* Allows {{esql}} generation to search index patterns [#253492]({{kib-pull}}253492).
* Allows agents to run one or more workflows before each execution, enabling prompt modifications or conditional abort [#252452]({{kib-pull}}252452).
* Adds audit logging for agent and tool create, update, and delete actions [#252143]({{kib-pull}}252143).

**Connectivity**:
* Adds support for the `region` parameter to the Bedrock Connector [#252956]({{kib-pull}}252956).
* Adds a Jina Reader data source connector [#247527]({{kib-pull}}247527).
* Adds a Jira Cloud data source connector [#251345]({{kib-pull}}251345).
* Adds a SharePoint Online data source connector [#251544]({{kib-pull}}251544).
* Adds a ServiceNow data source connector [#252430]({{kib-pull}}252430).
* Adds a Microsoft Teams data source connector [#252465]({{kib-pull}}252465).
* Adds a Tavily data source connector [#252717]({{kib-pull}}252717).
* Adds a Google Calendar data source connector [#252740]({{kib-pull}}252740).
* Adds a Slack data source connector [#252972]({{kib-pull}}252972).
* Adds an Amazon S3 data source connector [#253753]({{kib-pull}}253753).
* Adds a Salesforce data source connector [#254303]({{kib-pull}}254303).
* Adds a Zendesk data source connector [#254739]({{kib-pull}}254739).
* Adds a Firecrawl data source connector [#255004]({{kib-pull}}255004).
* Adds a 1Password data source connector [#255076]({{kib-pull}}255076).
* Adds a PagerDuty data source connector [#255154]({{kib-pull}}255154).
* Adds a Zoom data source connector [#255174]({{kib-pull}}255174).
* Adds a Figma data source connector [#255322]({{kib-pull}}255322).
* Adds a Gmail data source connector [#255565]({{kib-pull}}255565).
* Adds an AWS Lambda data source connector [#256150]({{kib-pull}}256150).
* Adds a Confluence Cloud data source connector [#256508]({{kib-pull}}256508).
* Adds a Google Cloud Storage data source connector [#257374]({{kib-pull}}257374).
* Adds a SharePoint Server data source connector [#258014]({{kib-pull}}258014).
* Adds a GitHub data source connector [#258169]({{kib-pull}}258169).
* Adds an Azure Blob Storage data source connector [#259439]({{kib-pull}}259439).
* Adds a GCP Cloud Functions data source connector [#261277]({{kib-pull}}261277).
* Adds an AbuseIPDB data source connector [#245421]({{kib-pull}}245421).
* Adds an AlienVault OTX data source connector [#245421]({{kib-pull}}245421).
* Adds a GreyNoise data source connector [#245421]({{kib-pull}}245421).
* Adds a Shodan data source connector [#245421]({{kib-pull}}245421).
* Adds a URLVoid data source connector [#245421]({{kib-pull}}245421).
* Adds a VirusTotal data source connector [#245421]({{kib-pull}}245421).

**Dashboards and Visualizations**:
% main features
* A new Dashboard skill is now available in Agent Builder. This skill allows you to create and update dashboards through natural language [chat](docs-content://explore-analyze/ai-features/agent-builder/chat.md), using the chat UI in {{product.kibana}}, the [Chat API](docs-content://explore-analyze/ai-features/agent-builder/kibana-api.md), or the [MCP server](docs-content://explore-analyze/ai-features/agent-builder/mcp-server.md). Describe what you want to visualize and the agent builds a dashboard with [{{esql}}](docs-content://explore-analyze/query-filter/languages/esql-kibana.md)-powered visualizations. [#261530]({{kib-pull}}261530).
* New API endpoints are now available in technical preview to manage your dashboards and visualization library. The Dashboards API gives you full read and write access to dashboards, including their panels, controls, sections, and display options. The Visualizations API lets you create and manage visualizations as standalone saved objects in the {{product.kibana}} Visualizations library. [#256302]({{kib-pull}}256302).
* Adds the ability to show and export Dashboard API JSON in a flyout [#255382]({{kib-pull}}255382).

% controls
* Controls are now available as a panel type, allowing them to be freely placed anywhere in your dashboards [#245588]({{kib-pull}}245588).
* Makes **Contains** the default search technique for options list controls [#250992]({{kib-pull}}250992).
* Allows IP fields to be searched using CIDR notation in controls [#250875]({{kib-pull}}250875).

% sections
* Extends the selectable area for dragging, collapsing and expanding sections to their entire header [#258502]({{kib-pull}}258502).
* Allows dragging of opened collapsible sections [#257191]({{kib-pull}}257191).
* Enforces panel limits on dashboards: up to 100 top-level items (panels, unpinned controls, and sections combined), up to 100 panels per section, and up to 100 pinned controls [#256102]({{kib-pull}}256102).

% dashboard usability
* Makes the filter pills section collapsible [#255887]({{kib-pull}}255887).
* Adds a grid size gauge while resizing panels [#255363]({{kib-pull}}255363).
* Adds a borderless option to panel settings [#255021]({{kib-pull}}255021).
* Adds library support for markdown panels [#248779]({{kib-pull}}248779).
* Allows panels to be dragged while they're in focus for editing [#251327]({{kib-pull}}251327).
* Redesigns the panel titles [#251720]({{kib-pull}}251720).
* Refreshes the Dashboards app menu [#246153]({{kib-pull}}246153).

% discover sessions in dashboards
* Adds a **Discover session** panel option to dashboards [#256293]({{kib-pull}}256293).
* Editing an unlinked Discover session panel in a dashboard now saves changes back to that panel [#250438]({{kib-pull}}250438).
* Filtering a field value in a Discover {{esql}} session embedded in a dashboard now creates a DSL filter, consistent with how filtering works elsewhere [#249357]({{kib-pull}}249357).
* Adds a tab selector to Discover session panels in Dashboards, with improved warning messages when a tab or data view can't be retrieved [#252311]({{kib-pull}}252311).

% esql + viz
* Adds {{esql}} support to Vega visualizations [#247186]({{kib-pull}}247186).
* Enables {{esql}} multi-terms charts in Lens [#244743]({{kib-pull}}244743).
* Allows filtering from legend actions when possible for {{esql}} visualizations [#248789]({{kib-pull}}248789).
* Suggests line charts for timeseries {{esql}} queries (TS / PromQL) in Lens [#252661]({{kib-pull}}252661).
* Retrieves variable types from the {{esql}} query response [#254436]({{kib-pull}}254436).
* Enables dashboard and URL drilldown for {{esql}} charts [#253223]({{kib-pull}}253223).

% chart options and improvements
* Defaults the visualization type to line chart when the x-axis contains a timestamp, instead of a bar chart [#253930]({{kib-pull}}253930).
* Adds a new optimized color palette for line charts [#253437]({{kib-pull}}253437).
* Adds a **Badge** color option for table values in Lens, allowing cell values to be displayed as colored badges instead of text or background coloring [#257408]({{kib-pull}}257408).
* Adds a new list legend layout for horizontal legends (top and bottom), offering a more space-efficient alternative to the grid layout. This is now the default for XY charts [#257092]({{kib-pull}}257092).
* Adds sort order options for heatmap visualization axes [#244696]({{kib-pull}}244696).
* Adds a middle position option for the primary metric styling settings of metric charts [#260902]({{kib-pull}}260902).
* Improves tick labels for time-based X axes in {{esql}} heatmap visualizations [#259218]({{kib-pull}}259218).
* Improves datatable visualization performance for large datasets in Lens [#256234]({{kib-pull}}256234).
* Enables fixed-width number formatting in Lens visualizations for cleaner alignment [#251576]({{kib-pull}}251576).
* Introduces a Severity color palette in Lens color mapping [#250198]({{kib-pull}}250198).
* Improves the badge colors for metric trend indicators in Lens [#256255]({{kib-pull}}256255).
* Legend actions in Lens XY and Partition charts now only appear on hover [#255616]({{kib-pull}}255616).
* Removes the font-weight configuration option from Lens Metric chart titles, defaulting to medium weight [#254941]({{kib-pull}}254941).
* Updates axis title and label colors in Lens and dashboard charts to be less visually prominent [#254587]({{kib-pull}}254587).
* Displays row numbers by default in Lens data tables [#247834]({{kib-pull}}247834).

**Data ingestion and Fleet**:
* Allows remote {{es}} outputs and service tokens in Serverless [#262101]({{kib-pull}}262101).
* Renames Cloud Connector to Federated Identity in the UX [#261353]({{kib-pull}}261353).
* Adds support for monitoring OpenTelemetry (OTel) collectors in {{fleet}} in technical preview. You can now add OTel collector agents using the **Add** > **Collector (OpAMP)** button in the Fleet UI [#260654]({{kib-pull}}260654).
* Introduces support for version-specific policies in {{fleet}} when integrations specify agent version requirements, ensuring agents receive only configurations compatible with their version [#258796]({{kib-pull}}258796).
* Shows UI warnings for integrations with upcoming deprecations [#257937]({{kib-pull}}257937).
* Resolves and merges templates listed in `template_paths` [#257730]({{kib-pull}}257730).
* Adds permission verifier background tasks [#257516]({{kib-pull}}257516).
* Installs package dependencies automatically [#256700]({{kib-pull}}256700).
* Requests user review when auto-upgrading packages with deprecations [#255273]({{kib-pull}}255273).
* Adds an out-of-the-box alerting rule template to freshly installed integrations for monitoring idle data streams [#254730]({{kib-pull}}254730).
* Displays warnings for deprecated integration features [#253923]({{kib-pull}}253923).
* Shows warnings in the UI when an integration is deprecated [#251860]({{kib-pull}}251860).
* Allows {{fleet}} to install integration-managed SLO templates for creating new SLOs [#250369]({{kib-pull}}250369).
* Migrates input configurations when the `migrate_from` field is specified in the package manifest [#242934]({{kib-pull}}242934).
* Updates the maximum supported package specification version to 3.6 [#261362]({{kib-pull}}261362).
* Adds a new **Alerting** tab to the integrations UI for viewing and managing alerting-related assets [#253948]({{kib-pull}}253948).
* Allows integration rollback when only some integration policies are upgraded [#253646]({{kib-pull}}253646).
* Ensures the time series index mode is not enabled for input packages with non-metrics data streams [#251205]({{kib-pull}}251205).
* Adds authentication fields to {{agent}} binary download sources managed by {{fleet}} for connecting to self-hosted artifact registries [#250557]({{kib-pull}}250557).
* Improves memory usage during {{fleet}} setup by deferring package reinstalls to async tasks [#248235]({{kib-pull}}248235).

**Discover**:
% esql mode
* Redesigns the {{esql}} editor footer in Discover: removes the row limit and timestamp indicators, and adds query run statistics [#244284]({{kib-pull}}244284).
* Adds a fields browser to the {{esql}} editor in Discover [#252749]({{kib-pull}}252749).
* Adds a layout toggle to show or hide the data table in Discover, with the state persisted in the URL [#259083]({{kib-pull}}259083).
* Adds a grouped view in Discover for {{esql}} queries that use `STATS ... BY` with a single grouping field. A new toolbar selector lets you pivot by that field or switch back to the standard table view. [#220119]({{kib-pull}}220119).
* Converts DSL filters to {{esql}} when possible when switching to {{esql}} mode [#259260]({{kib-pull}}259260).
* Persists the query mode ({{esql}} or classic) to local storage so that the next sessions open with the last mode used [#250388]({{kib-pull}}250388).
* Shows Streams field descriptions in the {{esql}} editor and field sidebar [#260582]({{kib-pull}}260582).

% metrics
* Filters from the top-level {{esql}} WHERE clause now propagate into per-metric charts in the Discover metrics grid [#249103]({{kib-pull}}249103).
* Adds support for visualizing `tdigest` and `exponential_histogram` histogram metrics in the Discover metrics grid [#249269]({{kib-pull}}249269).
* Hides the data table by default when the metrics-specific Discover experience is triggered [#260607]({{kib-pull}}260607).

% tabs and sessions
* Adds the ability to restore recently closed tab groups [#253365]({{kib-pull}}253365).
* Hovering over an entry in the recently closed tabs menu now shows a preview of what the tab contained [#246973]({{kib-pull}}246973).
* Moves the inspector menu item to the tab menu [#258767]({{kib-pull}}258767).
* The chart interval is now saved with Discover sessions and restored when reopening them [#246426]({{kib-pull}}246426).
* Adds notifications for background search completion [#249857]({{kib-pull}}249857).
* Adds a **Save Discover table to dashboard** option [#259626]({{kib-pull}}259626).

% general
* Adds default table columns for indexes and views with a small number of fields [#255292]({{kib-pull}}255292).

% doc viewer
* The doc viewer flyout now stays open when switching between Discover tabs and remembers which tab (such as **Table** or **JSON**) was active in each [#246612]({{kib-pull}}246612).

**{{esql}} editor**:
% new commands and language features
* Adds PromQL support in {{kib}} through {{esql}} [#249854]({{kib-pull}}249854).
* Adds support for the `USER_AGENT` command [#261314]({{kib-pull}}261314).
* Adds support for the `MMR` command [#257208]({{kib-pull}}257208).
* Adds autocomplete and validation support for the `approximate` setting in the {{esql}} editor [#248946]({{kib-pull}}248946).
* Adds support for KQL syntax to the quick search option [#247224]({{kib-pull}}247224).
* Adds autocomplete to the KQL function [#249510]({{kib-pull}}249510).
* Adds support for unmapped fields [#248606]({{kib-pull}}248606).
* Adds support for timezone handling [#247917]({{kib-pull}}247917).

% GA commands
* Makes the `FORK` command generally available [#261904]({{kib-pull}}261904).
* Makes the `RERANK` command generally available [#252242]({{kib-pull}}252242).

% editor UI and experience
* Redesigns the {{esql}} editor interface [#251223]({{kib-pull}}251223).
* Adds a data source browser to the {{esql}} editor [#251897]({{kib-pull}}251897).
* Adds support for {{esql}} views to the editor [#261907]({{kib-pull}}261907).
* Adds {{esql}} query statistics to the editor [#251029]({{kib-pull}}251029).
* Improves {{esql}} editor autocomplete for full-text search functions: `MATCH_PHRASE`'s second argument now only suggests literal values, and FTS functions are excluded from `EVAL` suggestions except inside `SCORE()` [#247003]({{kib-pull}}247003).
* Improves line commenting in the {{esql}} editor to match standard IDE conventions [#254851]({{kib-pull}}254851).
* Improves query pretty printing [#257440]({{kib-pull}}257440).
* Adds an {{esql}} indentation shortcut to the editor [#247234]({{kib-pull}}247234).
* Simplifies the **Run** and **Cancel** button states in the {{esql}} editor [#254121]({{kib-pull}}254121).
* Highlights multiple word occurrences in search results [#258764]({{kib-pull}}258764).


**Elastic Observability solution**:
For the Elastic Observability 9.4.0 release information, refer to [Elastic Observability Solution Release Notes](docs-content://release-notes/elastic-observability/index.md).

**Elastic Security solution**:
For the Elastic Security 9.4.0 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

**Kibana platform**:
* In container deployments, automatically sets the Node.js heap size to 60% of available memory, up to a maximum of 4096 MB, when no heap size is explicitly configured [#246073]({{kib-pull}}246073).
* Adds a feedback button to {{kib}}'s header [#225074]({{kib-pull}}225074).
* Remembers the pagination state when navigating back from an edit on the **Users** page, instead of always returning to page 1 and resetting the search [#261152]({{kib-pull}}261152).
* Distinguishes between session idle timeouts and session lifespan timeouts [#252779]({{kib-pull}}252779).
* Improves Index Management index list load performance on large clusters with many indices [#246276]({{kib-pull}}246276).
* Adds a **Query Activity** page under Stack Management for viewing and canceling long-running queries [#253216]({{kib-pull}}253216).

**Machine Learning**:
* Updates Security ML jobs to use entity analytics fields for host and user fields [#255339]({{kib-pull}}255339).
* Adds a link to manage anomaly detection jobs in the Machine Learning left navigation [#260605]({{kib-pull}}260605).
* Anomaly detection now automatically closes the job when stopping a datafeed [#259603]({{kib-pull}}259603).
* Adds aria labels to anomaly detection job wizard combo boxes [#258509]({{kib-pull}}258509).
* Updates the `v3_rare_process_by_host_windows` bucket span to two hours [#255855]({{kib-pull}}255855).
* Changes the rare process by host Windows job bucket span from 15m to 4h [#255385]({{kib-pull}}255385).
* Adds a new single APM Correlations endpoint for latency and failed transactions [#254607]({{kib-pull}}254607).
* Adds Gemini 2.5 Flash Lite, Claude 4.5 Haiku, and Claude 4.6 Sonnet preconfigured connectors [#253109]({{kib-pull}}253109).
* Adds a dynamic default connector in GenAI settings [#252861]({{kib-pull}}252861).
* Adds a zoom in button to the date picker [#252252]({{kib-pull}}252252).
* Adds Anthropic Claude Opus 4.6 preconfigured connector [#252177]({{kib-pull}}252177).
* Uses the `location` field to correctly set provider config in AI/Inference Connector creation [#250838]({{kib-pull}}250838).
* Adds the proxy URL setting for product documentation artifact [#250771]({{kib-pull}}250771).
* Adds new preconfigured connectors [#249379]({{kib-pull}}249379).
* Moves the results view buttons closer to the job selection controls in Anomaly Detection [#249261]({{kib-pull}}249261).
* Adds missing {{esql}} commands and functions documentation for inference tasks [#249089]({{kib-pull}}249089).
* Enhances model memory estimation for supplied configurations in anomaly detection [#248479]({{kib-pull}}248479).
* Adds the `timeout` parameter to InferenceChatModel [#248326]({{kib-pull}}248326).
* Adds time window buttons to the date picker [#248142]({{kib-pull}}248142).
* Adds a button to synchronize saved objects in trained models [#247691]({{kib-pull}}247691).
* Refreshes the Overview page [#247573]({{kib-pull}}247573).
* Marks 429 errors as user errors in Inference/AI Connector [#246640]({{kib-pull}}246640).
* Opens matching pattern docs in a new Discover tab [#245695]({{kib-pull}}245695).

**Search**:
* Adds warnings to the **Feature Settings** page for models that are invalid [#262262]({{kib-pull}}262262).
* Deprecates search indices in favor of index management [#260210]({{kib-pull}}260210).
* Adds a **Models** page for inference management [#259374]({{kib-pull}}259374).
* Adds a **Model Settings** UI for inference endpoint assignments [#258871]({{kib-pull}}258871).
* Sets Jina v5 as the default inference endpoint for `semantic_text` fields when it's available [#257464]({{kib-pull}}257464).
* Adds an AI assistant-led onboarding option to the Elasticsearch getting started page [#255192]({{kib-pull}}255192).
* Automatically creates AI connectors for Elastic Inference Service chat completion endpoints when they are added [#254826]({{kib-pull}}254826).
* Adds sorting capabilities to the Inference Endpoints table, allowing users to sort by Endpoint, Service, Type, or Model using a dropdown or by clicking column headers [#252189]({{kib-pull}}252189).
* Adds a summary stats bar to the Inference Endpoints page displaying counts for Services, Models, Types, and Endpoints [#251558]({{kib-pull}}251558).
* Adds a copy-to-clipboard button for inference endpoint names in the Inference Endpoints management page [#251494]({{kib-pull}}251494).
* Improves the External Inference page by hiding the Elasticsearch service provider from the **Add Inference Endpoint** flyout, since Elasticsearch endpoints are managed internally [#261851]({{kib-pull}}261851).
* Adds a model detail flyout with endpoint management [#260307]({{kib-pull}}260307).
* Reduces search latency by switching to long-polling when HTTP/2 multiplexing is available, eliminating unnecessary wait times [#256564]({{kib-pull}}256564).
* Improves the Inference Endpoints management page by adding a view to group by service [#254296]({{kib-pull}}254296).
* Improves the Inference Endpoints management page by adding a view to group by models, making this the default view [#252984]({{kib-pull}}252984).
* Consolidates Type, Preconfigured, and Tech Preview badges under the endpoint name and removes the dedicated Type column in the inference endpoints table [#252621]({{kib-pull}}252621).
* Improves AI connector setup by auto-populating the model field with recommended defaults [#250506]({{kib-pull}}250506).
* Improves the inference endpoints page by adding a Model column and enabling search by model name [#249779]({{kib-pull}}249779).
* Adds descriptions to the `semantic_text` field inference endpoint select [#249265]({{kib-pull}}249265).
* Fixes layout instability in the inference endpoint selector when endpoint names are long [#247417]({{kib-pull}}247417).
* Displays the API key tab if the user has permission, and hides it for users without API key management permissions [#246979]({{kib-pull}}246979).
* Updates the Search homepage design [#246777]({{kib-pull}}246777).

**Workflows**:
* Adds import and export features for workflows [#257976]({{kib-pull}}257976).
* Adds the `workflows.executionFailed` trigger so you can run workflows when another workflow fails. Use it to send notifications (for example, Slack), run cleanup, or trigger retries [#257633]({{kib-pull}}257633).
* Adds a server-side workflow validation endpoint [#254502]({{kib-pull}}254502).
* Makes the manual run API public [#253010]({{kib-pull}}253010).
* Whitelists Streams APIs as Kibana workflow steps [#252068]({{kib-pull}}252068).
* Adds the `entries` Liquid filter for iterating over object keys [#259249]({{kib-pull}}259249).
* Adds cases workflow steps [#253119]({{kib-pull}}253119),[#256922]({{kib-pull}}256922).

### Fixes [kibana-9.4.0-fixes]

**Alerting**:
* Fixes an issue where Stack alerts sent recovery notifications but remained `active` in {{kib}} instead of transitioning to `recovered` [#261012]({{kib-pull}}261012).
* Fixes stale `uiamApiKey` leaking through object spread in rule updates [#263887]({{kib-pull}}263887).
* Fixes OpenAPI alerting rule params schemas missing accepted keys for burn-rate windows and Elasticsearch query `sourceFields` [#263634]({{kib-pull}}263634).
* Fixes an index template update failing due to system-managed fields [#262534]({{kib-pull}}262534).
* Adds the `application/x-zip-compressed` MIME type as an accepted value for cases file attachment [#262414]({{kib-pull}}262414).
* Fixes alert recovery targeting the wrong document when multiple lifecycles exist for the same instance ID [#261012]({{kib-pull}}261012).
* Fixes `cloneRule` leaking source rule API keys to cloned rules [#260549]({{kib-pull}}260549).
* Fixes `incremental_id` drift issues [#258789]({{kib-pull}}258789).
* Fixes Webhook Connector `accessTokenUrl` validation [#258290]({{kib-pull}}258290).
* Fixes additional fields not being included [#257625]({{kib-pull}}257625).
* Fixes a discrepancy between tracked alerts and alerts in task state [#257235]({{kib-pull}}257235).
* Fixes a problem generating a report with multi-page Canvas workpads [#255022]({{kib-pull}}255022).
* Fixes a blank page appearing at the end of PDF exports when using the **Print format** option with an even number of dashboard visualizations [#254957]({{kib-pull}}254957).
* Fixes an error not being caught from `scheduleUnusedUrlsCleanupTask()` [#254574]({{kib-pull}}254574).
* Fixes a bug with PagerDuty where setting the **Custom details** field causes rules to fail [#253683]({{kib-pull}}253683).
* Improves error handling within the content stream code for multiple reporting attempts [#252982]({{kib-pull}}252982).
* Fixes rule execution failing due to null execution UUIDs [#252618]({{kib-pull}}252618).
* Improves handling of `204` responses [#251090]({{kib-pull}}251090).
* Fixes timestamp override for {{esql}} CSV scheduled reports with relative time ranges [#248169]({{kib-pull}}248169).
* Fixes **Failed to check if maintenance windows are active** error [#261048]({{kib-pull}}261048).
* Updates `total_event` in the Elasticsearch document when attaching an event [#247996]({{kib-pull}}247996).
* Encodes the search term in the cases page [#247992]({{kib-pull}}247992).
* Adds max character validation to the email connector params and config [#246453]({{kib-pull}}246453).
* Fixes the wrong time zone being applied when a CSV report has a local date comparison [#244405]({{kib-pull}}244405).

**Connectivity**:
* Fixes `defaultModel` not being injected for the **Other** OpenAI provider on run and test sub-actions [#260747]({{kib-pull}}260747).
* Fixes MCP connectors ignoring the proxy and SSL configuration from the actions plugin [#255813]({{kib-pull}}255813).
* Adds the datasource name to the namespace to allow creating multiple sources of the same type [#249123]({{kib-pull}}249123).

**Dashboards and Visualizations**:
* Fixes an issue that could prevent a dashboard from showing its latest saved state [#262695]({{kib-pull}}262695).
* Prevents a false positive warning about unsaved changes when sharing a dashboard while in View Mode [#261051]({{kib-pull}}261051).
* Fixes regressions for space-relative links and same-window target [#260782]({{kib-pull}}260782).
* Improves {{esql}} suggestions logic in Lens [#258475]({{kib-pull}}258475).
* Adjusts scroll behavior when dropping a panel to a new position [#258445]({{kib-pull}}258445).
* Fixes screen reader announcements when entering full screen mode on a dashboard [#258230]({{kib-pull}}258230).
* Fixes an issue with logic for detecting unsaved changes for dashboards in non-default spaces [#257762]({{kib-pull}}257762).
* Fixes an issue where visualizations stayed focused after closing the variables editor flyout [#257263]({{kib-pull}}257263).
* Fixes **Add from library** adding incorrect embeddable state [#257261]({{kib-pull}}257261).
* Fixes dashboard panels getting stuck in infinite loading state after an error instead of showing error messages [#257188]({{kib-pull}}257188).
* Fixes an issue where editing a library visualization would correctly save changes but visually show its previous saved state in dashboards referencing that visualization until the page was refreshed [#256984]({{kib-pull}}256984).
* Stops adding a default title when creating {{esql}} charts in Lens [#256475]({{kib-pull}}256475).
* Fixes the pinned state for variable ({{esql}}) and range slider controls [#256035]({{kib-pull}}256035).
* Fixes `timeFilter`'s `quick` mode in Maps stored state, that could prevent maps from loading [#255178]({{kib-pull}}255178).
* Fixes an issue where saving a dashboard included access control features when a user profile, which is required for access control, was not available [#255065]({{kib-pull}}255065).
* Fixes an issue occurring when saving a map containing filters [#253537]({{kib-pull}}253537).
* Fixes configuration panel scrolling in the Lens editor when the content exceeds available height [#253247]({{kib-pull}}253247).
* Changes dashboard background color to white [#253068]({{kib-pull}}253068).
* Changes the default height of link panels to 2 rows [#252707]({{kib-pull}}252707).
* Fixes the library annotation group not syncing across panels after an update in Lens [#252640]({{kib-pull}}252640).
* Fixes KQL character escaping when a query is generated from the Top values column (breakdown) in Lens [#250925]({{kib-pull}}250925).
* Fixes an issue where PDF/PNG reports are cut off at the end when a dashboard has a markdown panel [#249644]({{kib-pull}}249644).
* Limits variable suggestions to variables within scope [#248365]({{kib-pull}}248365).
* Re-fetches control options when the timerange changes [#248068]({{kib-pull}}248068).
* Fixes link color contrast in Lens data tables [#247721]({{kib-pull}}247721).
* Removes `| LIMIT 10` from the {{esql}} panel in dashboards when creating a visualization in Lens [#247427]({{kib-pull}}247427).
* Fixes compound filters showing unsaved changes on dashboard load [#247309]({{kib-pull}}247309).
* Increases default top values from 3 or 5 to 9 categories in Lens [#247015]({{kib-pull}}247015).
* Fixes the handling of a quote as a dead key [#246773]({{kib-pull}}246773).
* Fixes an issue where embeddables cannot load when no references are provided [#257779]({{kib-pull}}257779).
* Fixes `runtime_mappings` being ignored or overridden in Vega visualization data requests [#253560]({{kib-pull}}253560).
* Changes the Gauge chart default color palette to the status palette [#246734]({{kib-pull}}246734).

**Data ingestion and Fleet**:
* Fixes package policy count filters: uses `NOT latest_revision:false` instead of `latest_revision:true` [#263717]({{kib-pull}}263717).
* Disables the output selector for managed policies in the package policy edit form [#263494]({{kib-pull}}263494).
* Fixes permissions for spanevents stored in logs data streams [#263415]({{kib-pull}}263415).
* Handles compressed responses from {{es}} [#262394]({{kib-pull}}262394).
* Fixes the table sorting announcement for accessibility [#262226]({{kib-pull}}262226).
* Fixes the learn more focus for accessibility [#261902]({{kib-pull}}261902).
* Fixes **Define as JSON** announcement for accessibility [#261896]({{kib-pull}}261896).
* Fixes the pipelines table row index announcement for accessibility [#261369]({{kib-pull}}261369).
* Includes `input_output` in inference processor [#260517]({{kib-pull}}260517).
* Fixes the selected log level when there is a policy override [#259425]({{kib-pull}}259425).
* Avoids icon announcement duplication for accessibility [#259185]({{kib-pull}}259185).
* Fixes processors accessibility announcements [#259096]({{kib-pull}}259096).
* Adds version-specific policies telemetry [#259031]({{kib-pull}}259031).
* Fixes space-awareness for Fleet bulk agent actions (unenroll, upgrade, reassign to policy) [#258582]({{kib-pull}}258582).
* Fixes an auto upgrade bug when upgrading agents in other policies interfered with the calculation [#258387]({{kib-pull}}258387).
* Validates generated OpenAPI output [#258267]({{kib-pull}}258267).
* Fixes package policy creation failing with a `data_stream.type` validation error for input-only integrations that use dynamic signal types, such as OpenTelemetry collector packages [#258143]({{kib-pull}}258143).
* Improves error handling in debug API [#258115]({{kib-pull}}258115).
* Fixes the unenroll task and adds an FTR test [#255726]({{kib-pull}}255726).
* Fixes the incorrect installation of assets [#254923]({{kib-pull}}254923).
* Filters out unenrolled agents in the cleanup policy revisions task [#254899]({{kib-pull}}254899).
* Fixes an issue where an agent rolled back after an upgrade could not be upgraded again in the Fleet UI [#253850]({{kib-pull}}253850).
* Fixes a TypeError when an integration has no SVG icons [#251308]({{kib-pull}}251308).
* Adds back support for generating a CSV report of Fleet agent data in serverless environments [#247185]({{kib-pull}}247185).

**Discover**:
* Fixes the date picker showing empty when switching from KQL to {{esql}} [#261175]({{kib-pull}}261175).
* Fixes a tab URL state leak when leaving Discover [#262929]({{kib-pull}}262929).
* Resets the time field when the updated index pattern does not have it [#262001]({{kib-pull}}262001).
* Resets the default profile state when transitioning between tab modes [#255226]({{kib-pull}}255226).
* Makes matches cells expandable for long field filter matches [#255093]({{kib-pull}}255093).
* Fixes URL, Badge, Color, and other field formatters incorrectly rendering fields with missing or null values [#251892]({{kib-pull}}251892).
* Fixes filtering out null values from the Discover histogram legend in {{esql}} mode [#249302]({{kib-pull}}249302).
* Fixes **Search entire time range** for date nanos [#248495]({{kib-pull}}248495).
* Prevents doc viewer flyout tabs from unnecessarily re-mounting on query refresh [#248203]({{kib-pull}}248203).
* Fixes dropdown menus staying open when switching tabs [#247836]({{kib-pull}}247836).
* Makes static-lookup formatter work with aggregated boolean fields [#249311]({{kib-pull}}249311).
* Adds a check to ensure {{esql}} is valid before matching the Metrics profile [#248917]({{kib-pull}}248917).
* Prevents losing draft queries when switching tabs [#247968]({{kib-pull}}247968).
* Fixes an issue where quickly opened tabs could not complete loading [#246941]({{kib-pull}}246941).
* Fixes the default app state handling when detecting unsaved changes [#246664]({{kib-pull}}246664).

**{{esql}} editor**:
* Fixes {{esql}} multi-value filtering with `STATS` [#260998]({{kib-pull}}260998).
* Fixes `STATS` generated columns with inline `WHERE` [#260196]({{kib-pull}}260196).
* When no local indices are available, the {{esql}} query suggestion now correctly considers remote indices [#257340]({{kib-pull}}257340).
* Fixes {{esql}} variable controls not displaying server-side errors in the editor [#263020]({{kib-pull}}263020).
* Fixes autocomplete fetches piling up without cancellation when typing rapidly in the {{esql}} editor [#255664]({{kib-pull}}255664).
* Fixes incorrect validation of the `TS` (time series) command [#253635]({{kib-pull}}253635).
* Fixes some `GROK` patterns not being recognized, which caused columns to appear as unknown [#246871]({{kib-pull}}246871).
* Aborts in-flight long-running queries for {{esql}} controls [#254487]({{kib-pull}}254487).
* Fixes incorrect KQL bar results for some indices [#254119]({{kib-pull}}254119).

**Elastic Observability solution**:
For the Elastic Observability 9.4.0 release information, refer to [Elastic Observability Solution Release Notes](docs-content://release-notes/elastic-observability/index.md).

**Elastic Security solution**:
For the Elastic Security 9.4.0 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

**Kibana platform**:
* Sets `auto_expand_replicas` to fix yellow health on single-node Elasticsearch clusters [#263096]({{kib-pull}}263096).
* Allows space color to be cleared, falling back to default [#261826]({{kib-pull}}261826).
* Fixes the data stream and indices duplication for accessibility [#261786]({{kib-pull}}261786).
* Fixes an incorrect announcement for accessibility [#261603]({{kib-pull}}261603).
* Announces policy button with distinguishable names for accessibility [#261313]({{kib-pull}}261313).
* Prevents duplicate **Leave without saving?** modal on solution view cancel [#260958]({{kib-pull}}260958).
* Fixes inactive component template row focus and badge accessibility labels [#260719]({{kib-pull}}260719).
* Fetches the last available version [#259798]({{kib-pull}}259798).
* Fixes the Stack Monitoring shard legend not showing node placement [#257854]({{kib-pull}}257854).
* Fixes Stack Monitoring Elasticsearch nodes CPU usage sorting [#257852]({{kib-pull}}257852).
* Fixes an issue where the Kibana JSON logger could print a JSON object with a large number of numbered keys [#256233]({{kib-pull}}256233).
* Resolves an issue with the spaces list displaying **No spaces match** text on load [#255654]({{kib-pull}}255654).
* Adds `waitFor` for the privilege button [#255094]({{kib-pull}}255094).
* Fixes the embeddable console auto-closing on chrome/overlay clicks [#253382]({{kib-pull}}253382).
* Fixes a problem loading the doc count in index management when viewing larger page sizes with long index names [#252422]({{kib-pull}}252422).
* Fixes share feature rounding [#251073]({{kib-pull}}251073).
* Handles paging through more than 10,000 API keys [#250826]({{kib-pull}}250826).
* Fixes Stack Monitoring Recent Log Entries timestamps to respect Kibana's time zone setting (`dateFormat:tz`) [#249016]({{kib-pull}}249016).
* Fixes an issue with share modal where all time ranges were being shared as absolute [#248804]({{kib-pull}}248804).
* Fixes `createAuditEvents` always returning failure as outcome [#247152]({{kib-pull}}247152).
* Fixes the monitoring breadcrumbs for the solution view [#249751]({{kib-pull}}249751).

**Machine Learning**:
* Ensures the single metric chart shows anomaly actions correctly in Anomaly Explorer [#263925]({{kib-pull}}263925).
* Formats `time_of_day` / `time_of_week` values in anomaly detection alerting rule notifications and results preview [#261034]({{kib-pull}}261034).
* Fixes the anomaly swim lane embeddable refresh in Anomaly Detection [#259962]({{kib-pull}}259962).
* Fixes a jobs list console error in Data frame analytics [#258591]({{kib-pull}}258591).
* Disables start and update deployment actions for Rerank models in trained models [#257400]({{kib-pull}}257400).
* Fixes the field statistics saved search not updating when the dashboard changes filter [#257241]({{kib-pull}}257241).
* Fixes the update of the job rules flyout in Anomaly Detection Single Metric Viewer [#257196]({{kib-pull}}257196).
* Fixes screen reader announcements for flyouts [#256409]({{kib-pull}}256409).
* Improves Smart Grouping performance and re-enables it in Log rate analysis [#253704]({{kib-pull}}253704).
* Fixes headings in Log rate and pattern analysis and Change point detection for accessibility [#253266]({{kib-pull}}253266).
* Fixes the today and this week filters for Log Rate and Pattern Analysis embeddables [#252925]({{kib-pull}}252925).
* Fixes the file size limit check in file upload [#251515]({{kib-pull}}251515).
* Fixes occasional file preview corruption in file upload [#250532]({{kib-pull}}250532).
* Fixes word break in Anomaly Detection page titles [#250058]({{kib-pull}}250058).
* Passes abort signal to Elasticsearch in file upload [#249623]({{kib-pull}}249623).
* Updates the Packetbeat DNS tunneling datafeed to include runtime mappings [#249317]({{kib-pull}}249317).
* Fixes counter metric fields being missing in the Anomaly detection dropdown [#248187]({{kib-pull}}248187).
* Fixes broken Data Visualizer and AIOps navigation breadcrumbs and sidebar in solutions [#248167]({{kib-pull}}248167).
* Disables {{esql}} field stats for TS command [#247641]({{kib-pull}}247641).
* Fixes the display of the map view for small screen sizes in Data Visualizer [#247615]({{kib-pull}}247615).
* Fixes an anomaly chart empty query bug [#246841]({{kib-pull}}246841).
* Fixes deanonymization offset drift and adds regression coverage [#256112]({{kib-pull}}256112).
* Improves anonymization error messages when the NER model is not available [#247696]({{kib-pull}}247696).
* Adds a refusal field to assistant conversations [#243423]({{kib-pull}}243423).

**Management**:
* Fixes the code box stale announcement for accessibility [#261921]({{kib-pull}}261921).
* Announces data streams stats toggle change for accessibility [#261911]({{kib-pull}}261911).
* Shows all `source_index` entries when `source_index` is an array [#261875]({{kib-pull}}261875).
* Avoids search template announcement duplication for accessibility [#261585]({{kib-pull}}261585).
* Fixes the data streams table row index announcement for accessibility [#261366]({{kib-pull}}261366).
* Avoids duplications on icon announcement in **Edit policy** for accessibility [#261324]({{kib-pull}}261324).
* Fixes policy list actions tooltip screen reader duplication for accessibility [#261322]({{kib-pull}}261322).
* Fixes copy buttons announcement duplications for accessibility [#261311]({{kib-pull}}261311).
* Fixes the gray color announcement in the Transform list for accessibility [#261307]({{kib-pull}}261307).
* Announces an invalid field for accessibility [#260673]({{kib-pull}}260673).
* Introduces polling for the summary extension [#260447]({{kib-pull}}260447).
* Returns **Create Transform** focus to button [#258095]({{kib-pull}}258095).
* Enhances screen reader notifications for bulk actions in Index Management tables [#257089]({{kib-pull}}257089).
* Fixes the incorrect announcement options [#256948]({{kib-pull}}256948).
* Improves the name announcement in the index mode modal [#256392]({{kib-pull}}256392).
* Displays ILM name and link when `prefer_ilm` is set. Index management's data view list now shows the current configuration in the **Retention** column [#254609]({{kib-pull}}254609).
* Fixes a bug when adding to an index template [#249168]({{kib-pull}}249168).
* Fixes an indented body highlighting regression in **Dev Tools Console** [#257539]({{kib-pull}}257539).
* Fixes Console autocomplete to insert `{}`/`[]` snippets instead of quoted braces when selecting suggestions in request bodies [#256286]({{kib-pull}}256286).
* Fixes syntax highlighting for strings with unicode characters in **Dev Tools Console** [#255649]({{kib-pull}}255649).
* Fixes an issue in **Dev Tools Console** where closing nested braces broke syntax highlighting for subsequent elements [#255426]({{kib-pull}}255426).
* Fixes autocomplete not working in embedded console [#253306]({{kib-pull}}253306).
* Prevents cloned managed ILM policies from being marked as managed [#248586]({{kib-pull}}248586).

**Search**:
* Fixes the save confirmation message not appearing after saving changes on the **Feature Settings** page [#263768]({{kib-pull}}263768).
* Fixes the query rules UI rejecting case variants as duplicate values [#259506]({{kib-pull}}259506).
* Fixes the query ruleset save deleting filtered-out rules [#259503]({{kib-pull}}259503).
* Fixes the **Convert to lookup index** action being permanently disabled on the index list view in stateful deployments [#259449]({{kib-pull}}259449).
* Removes the `exact_fuzzy` option from the Query Rules UI [#258278]({{kib-pull}}258278).
* Prevents **Add field** from overwriting existing mappings [#256728]({{kib-pull}}256728).
* Fixes {{esql}} tool crash with optional null parameters [#256588]({{kib-pull}}256588).
* Fixes incompatible inference endpoints being selectable in the semantic text field [#256586]({{kib-pull}}256586).
* Fixes Search Playground routes to limit the maximum size of arrays [#255881]({{kib-pull}}255881).
* Fixes the focus behavior when there are errors in the connector flyout form [#255770]({{kib-pull}}255770).
* Fixes the homepage throwing errors when the license level is below Enterprise [#251484]({{kib-pull}}251484).
* Reduces background polling on the Index Details page to avoid unnecessary API requests [#251446]({{kib-pull}}251446).
* Fixes links being visible on Search homepage when user doesn't have access [#251437]({{kib-pull}}251437).
* Fixes AI Connector form fields incorrectly resetting to default values when users clear them using backspace [#251095]({{kib-pull}}251095).
* Fixes the agents count not updating on the homepage [#248657]({{kib-pull}}248657).
* Fixes an issue when running Elasticsearch with a Basic license, where users could encounter errors when updating index mappings. Mapping updates now work as expected while advanced semantic text features continue to require the appropriate license [#248462]({{kib-pull}}248462).
* Fixes OpenAI connector header add flow so the newly added header Key input receives focus for accessibility [#248204]({{kib-pull}}248204).
* Disables **API keys** button on Elasticsearch homepage when logged in user has insufficient permissions [#248072]({{kib-pull}}248072).
* Fixes **Show API key** button aria-label not updating to **Hide API key** when toggled for accessibility [#247982]({{kib-pull}}247982).
* Fixes the token count display showing "NaN" in Search Playground [#246589]({{kib-pull}}246589).

**Elastic Agent Builder**:
* Fixes an EIS OpenAI GPT-OSS 120B reasoning error [#248943]({{kib-pull}}248943).
* Fixes the server-side search in the user prompts API [#250882]({{kib-pull}}250882).
* Fixes Agent Builder index search support for special text fields `match_only_text` and `pattern_text` [#252082]({{kib-pull}}252082).
* Propagates connector API errors [#252372]({{kib-pull}}252372).
* Fixes a UI bug with the workflow tool type [#252563]({{kib-pull}}252563).
* Fixes workflow tools: choice parameters accepted invalid inputs [#259282]({{kib-pull}}259282).
* Adds RBAC checks to new Agentic pages [#261895]({{kib-pull}}261895).
* Fixes a bug with resetting of agent id [#263044]({{kib-pull}}263044).
* Upgrades hono and @hono/node-server dependency [#263794]({{kib-pull}}263794).
* Renders an inline attachment loading skeleton during streaming [#264408]({{kib-pull}}264408).
* Fixes an issue where index search tools would skip non-searchable fields, causing incomplete search results [#257993]({{kib-pull}}257993).
* Adds attachment origin to Converse API — accepts optional `origin` on attachments for by-reference flows, and rejects attachments with neither `data` nor `origin` [#259043]({{kib-pull}}259043).
* Fixes a bug in the `platform.core.search` tool and `index_search` tool type where nested fields were ignored when searching for matching documents [#255914]({{kib-pull}}255914).
* Fixes {{esql}} test tool failing when the numerical value is zero [#251901]({{kib-pull}}251901).
* Fixes a bug where Agent Builder Index Search tools would fail on aliases that contained `semantic_text` fields [#247877]({{kib-pull}}247877).

**Workflows**:
* Fixes connector step icons falling back to plugs in workflow list [#263880]({{kib-pull}}263880).
* Adds input text sanitization [#259262]({{kib-pull}}259262).
* Validates HTTP connector URL against `allowedHosts` at execution time [#258080]({{kib-pull}}258080).
* Uses correct URL in `viewInAppUrl` and fixes `??` bug in redirect [#257910]({{kib-pull}}257910).
* Fixes false validation errors for item/index in `data.map` steps [#257703]({{kib-pull}}257703).
* Fixes an accessibility issue in the table with zoom [#257097]({{kib-pull}}257097).
* Adds support for native YAML arrays for foreach step [#256298]({{kib-pull}}256298).
* Fixes false Liquid validation errors from YAML comments [#256237]({{kib-pull}}256237).
* Adds a generate API key server-side implementation [#256083]({{kib-pull}}256083).
* Fixes liquidjs validation for variables used before assignment [#255337]({{kib-pull}}255337).
* Fixes glitchy **Attributes** rendering [#255173]({{kib-pull}}255173).
* Propagates inference errors [#254815]({{kib-pull}}254815).
* Adds server-side validation for workflow inputs before execution [#254546]({{kib-pull}}254546).
* Fixes execution tree clipping when the foreach step has many iterations [#253576]({{kib-pull}}253576).
* Fixes the scrollbars color in Safari when the macOS appearance setting is the opposite of the selected Kibana Color Mode [#253484]({{kib-pull}}253484).
* Fixes false validation errors for template-local variables in Liquid templates [#253405]({{kib-pull}}253405).
* Adds datemath support to KQL evaluator [#252840]({{kib-pull}}252840).
* Fixes the create new tool page when switching types [#252811]({{kib-pull}}252811).
* Prevents table sorting when toggling the workflow enable state [#252724]({{kib-pull}}252724).
* Strips system-managed date fields from ingest pipelines before PUT [#252579]({{kib-pull}}252579).

## 9.3.6 [kibana-9.3.6-release-notes]

### Fixes [kibana-9.3.6-fixes]

**Alerting**:
* Fixes the **Stack Alerts** page fetching alerts twice on initial load by deferring table rendering until filter controls have finished initializing [#271441]({{kib-pull}}271441).

**Connectivity**:
* Removes the **Content Connectors** page from the menu for users who didn't have the appropriate role privileges [#271709]({{kib-pull}}271709).

**Dashboards and Visualizations**:
* Fixes a stale closure in the Canvas autoplay timer that could advance to the wrong slide when slides were added or removed while autoplay was running [#268398]({{kib-pull}}268398).

**Data ingestion and Fleet**:
* Improves `POST /api/fleet/setup` performance for deployments with a large number of configured outputs by replacing a full-output decrypt scan with targeted, non-decrypting queries for only the default outputs [#273848]({{kib-pull}}273848).
* Optimizes `GET /api/fleet/agent_policies` (with `withAgentCount=true`) to compute agent counts in a single bucketed aggregation instead of multiple queries per policy, significantly reducing response time for deployments with many agent policies [#272429]({{kib-pull}}272429).
* Fixes integration package reinstalls and upgrades performed from a space different from the original installation space incorrectly bucketing {{kib}} asset references, causing the **Assets** tab to display raw UUIDs instead of asset titles [#271800]({{kib-pull}}271800).
* Fixes variable leakage and duplication between policy templates in input packages that define multiple policy templates [#273364]({{kib-pull}}273364).
* Fixes security rule names not displaying in the integration **Assets** accordion when the rule object has no `title` field [#272089]({{kib-pull}}272089).
* Fixes the agent logging level dropdown on the **Settings** tab not updating after **Reset to policy** is applied, so the displayed level now stays in sync with Fleet-polled agent metadata [#271964]({{kib-pull}}271964).

**Discover**:
* Fixes the {{esql}} document summary column incorrectly counting `null` and `undefined` field values against the `discover:maxDocFieldsDisplayed` limit, which caused fields with real values to be hidden behind an "and X more fields" label [#273610]({{kib-pull}}273610).
* Fixes the **Extend** action icon in the **Background searches** row actions menu being invisible in dark mode by rendering it as an inline SVG that inherits the surrounding icon color [#272754]({{kib-pull}}272754).
* Fixes slow KQL parsing caused by long runs of whitespace by improving keyword-adjacent whitespace handling in the KQL grammar [#266512]({{kib-pull}}266512).

**Elastic Observability solution**:
For the Elastic Observability 9.3.6 release information, refer to [Elastic Observability Solution Release Notes](docs-content://release-notes/elastic-observability/index.md).

**Elastic Security solution**:
For the Elastic Security 9.3.6 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

**Kibana platform**:
* Adds `notifications.connectors.default.email` to the list of supported Docker environment variables [#272761]({{kib-pull}}272761).

## 9.3.5 [kibana-9.3.5-release-notes]

:::{important}
The 9.3.5 release contains fixes for potential security vulnerabilities. Check our [security advisory](https://discuss.elastic.co/c/announcements/security-announcements/31) for more details.
:::

### Fixes [kibana-9.3.5-fixes]

**Alerting and cases**:
* Fixes {{stack}} rule upgrades failing when rule action `params` values exceed Elasticsearch field size limits by adding `ignore_above: 4096` to the `actions.params` mapping [#269467]({{kib-pull}}269467).
* Fixes alert index template updates failing when auto-increasing `total_fields.limit` because system-managed read-only fields were included in the update request [#262534]({{kib-pull}}262534).
* Fixes phrase search in the **All Cases** view so quoted queries match exact phrases and unquoted queries match individual terms [#266827]({{kib-pull}}266827).

**Connectivity**:
* Fixes the email connector to reject malformed email addresses (for example, addresses with leading or trailing hyphens in the local part or domain labels) that mail servers would reject, preventing unnecessary SMTP connection attempts. Existing connectors saved with invalid addresses will fail validation after upgrade and must be updated [#268496]({{kib-pull}}268496).

**Dashboards and Visualizations**:
* Fixes a regression where the dashboard remained locked in an open-flyout state after closing the control edit flyout when editing an existing query-based variable control [#267605]({{kib-pull}}267605).

**Data ingestion and Fleet**:
* Fixes agent policy background tasks failing with a `parse_exception` by sorting agent policies on `updated_at` instead of the non-existent `created_at` field [#267285]({{kib-pull}}267285).
* Fixes a race condition during async integration knowledge base installation that could clear `installed_es` asset references for input packages and leave the **Assets** tab blank [#266841]({{kib-pull}}266841).
* Uses password fields instead of cleartext inputs for multi-value secret variables in integration policy forms [#266823]({{kib-pull}}266823).

**Discover**:
* Fixes an issue in Discover's {{esql}} mode so the expanded document flyout correctly stays on the same result after a refresh when `METADATA _index, _id` is available, and shows the original document without pagination when that result is no longer in the refreshed set [#268328]({{kib-pull}}268328).
* Ensures CSV exports from Discover use the absolute time range for the current session so exported data matches what you see on screen [#255005]({{kib-pull}}255005).

**Elastic Observability solution**:
For the Elastic Observability 9.3.5 release information, refer to [Elastic Observability Solution Release Notes](docs-content://release-notes/elastic-observability/index.md).

**Elastic Security solution**:
For the Elastic Security 9.3.5 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

**Kibana platform**:
* Fixes date conversion in the file sharing service [#265131]({{kib-pull}}265131).

**Machine Learning**:
* Fixes Anomaly Detection chart markers in the Single Metric Viewer so sparse data points with a single value in the chart time range remain visible without hovering [#263632]({{kib-pull}}263632).

**Management**:
* Fixes the **IP Location** processor in **Ingest pipelines** saving the wrong `database_file` and showing duplicate selections when a local database filename matches a managed database label [#265740]({{kib-pull}}265740).
* Adds accessible names to modals and popovers across Stack Management pages to improve screen reader support [#269652]({{kib-pull}}269652).
* Fixes client-side navigation in the content connectors UI to honor `server.basePath` and {{kib}} space prefixes, resolving 404 errors on connector detail tabs and the post-creation **Manage connector** action [#269571]({{kib-pull}}269571).
* Prevents each keystroke in the **Advanced Settings** search bar from adding a browser history entry, so the back button navigates away from the page in one step [#266278]({{kib-pull}}266278).

**Search**:
* Fixes query rules API routes to limit the maximum size of arrays accepted in request data [#265495]({{kib-pull}}265495).
* Fixes the Search Applications document explorer rendering HTML markup from field `.snippet` values [#265319]({{kib-pull}}265319).

## 9.3.4 [kibana-9.3.4-release-notes]

### Features and enhancements [kibana-9.3.4-features-enhancements]

**Elastic Observability solution**:
For the Elastic Observability 9.3.4 release information, refer to [Elastic Observability Release Notes](docs-content://release-notes/elastic-observability/index.md).

**Elastic Security solution**:
For the Elastic Security 9.3.4 release information, refer to [Elastic Security Release Notes](docs-content://release-notes/elastic-security/index.md).

**Kibana platform**:
* Remembers the pagination state when navigating back from an edit on the **Users** page, instead of always returning to page 1 and resetting the search [#261152]({{kib-pull}}261152).

### Fixes [kibana-9.3.4-fixes]

**Alerting**:
* Fixes an issue where Stack alerts sent recovery notifications but remained `active` in {{kib}} instead of transitioning to `recovered` [#261012]({{kib-pull}}261012).
* Adds the `application/x-zip-compressed` MIME type as an accepted value for case file attachments [#262414]({{kib-pull}}262414).
* Fixes the "Failed to check if maintenance windows are active" error [#261048]({{kib-pull}}261048).

**Data ingestion and Fleet**:
* Fixes YAML file downloads being truncated at the first `#` character by properly URL-encoding the content [#264083]({{kib-pull}}264083).
* Fixes package policy count filters to correctly identify non-latest revisions [#263717]({{kib-pull}}263717).
* Only auto-installs content packages that are newer than the installed version [#262509]({{kib-pull}}262509).
* Fixes Fleet Server diagnostic bundles failing to download when `elasticsearch.compression` is enabled [#262394]({{kib-pull}}262394).
* Fixes missing sort-state announcements for screen readers in the **Ingest pipelines** list [#262226]({{kib-pull}}262226).
* Fixes focus management for the **Learn more** link [#261902]({{kib-pull}}261902).
* Fixes screen reader announcements for the **Define as JSON** toggle [#261896]({{kib-pull}}261896).
* Fixes screen readers announcing duplicate row indices in the **Ingest pipelines** list [#261369]({{kib-pull}}261369).
* Fixes the inference processor form to accept the `input_output` configuration shape [#260517]({{kib-pull}}260517).
* Fixes screen readers announcing icon labels twice in the **Ingest pipelines** list [#259185]({{kib-pull}}259185).
* Fixes screen readers incorrectly combining button announcements on the **Create Pipeline** page [#261603]({{kib-pull}}261603).

**Data management**:
* Fixes stale screen reader announcements in code boxes [#261921]({{kib-pull}}261921).
* Fixes the transforms detail summary to show all `source_index` entries when `source_index` is an array [#261875]({{kib-pull}}261875).
* Fixes screen readers announcing search template options twice [#261585]({{kib-pull}}261585).
* Fixes screen readers announcing duplicate row indices on the data streams table [#261366]({{kib-pull}}261366).
* Fixes screen readers announcing icon labels twice in the **Edit policy** flyout [#261324]({{kib-pull}}261324).
* Fixes screen readers announcing policy actions tooltip text twice in the index lifecycle policies list [#261322]({{kib-pull}}261322).
* Fixes screen readers announcing copy button labels twice [#261311]({{kib-pull}}261311).
* Fixes screen readers announcing grey color badge text twice in the transforms list [#261307]({{kib-pull}}261307).
* Fixes screen readers not announcing invalid field validation errors [#260673]({{kib-pull}}260673).

**Discover**:
* Resets the time field when the updated index pattern does not include it [#262001]({{kib-pull}}262001).
* Fixes {{esql}} multi-value filtering with `STATS` [#260998]({{kib-pull}}260998).

**Kibana platform**:
* Adjusts the **API Key** flyout width [#263858]({{kib-pull}}263858).
* Allows space colors to be cleared, falling back to the default [#261826]({{kib-pull}}261826).
* Fixes screen readers announcing data stream and index options twice in the **Create policy** and **Restore snapshot** selectable lists [#261786]({{kib-pull}}261786).
* Fixes policy buttons to have distinguishable names for screen readers [#261313]({{kib-pull}}261313).

**Machine Learning**:
* Fixes the single metric chart in Anomaly Explorer not showing anomaly actions correctly [#263925]({{kib-pull}}263925).
* Updates the `hono` and `@hono/node-server` dependencies [#263794]({{kib-pull}}263794).
* Fixes execution tree clipping when `foreach` has many iterations [#253576]({{kib-pull}}253576).

## 9.3.3 [kibana-9.3.3-release-notes]

% ::::{NOTE}
% ::::

### Fixes [kibana-9.3.3-fixes]

**Alerting**:
* Fixes Webhook Connector `accessTokenUrl` validation [#258290]({{kib-pull}}258290).

**Dashboards and Visualizations**:
* Adjusts scrolling when you drag and drop a dashboard panel to avoid jumping [#258445]({{kib-pull}}258445).
* Fixes Canvas library embeddables failing to load when `savedObjectId` is present without saved object references [#257779]({{kib-pull}}257779).
* Fixes a race condition in the dashboard backup service and removes unnecessary error toasts [#257762]({{kib-pull}}257762).
* Fixes **Add from library** in Canvas creating incorrect embeddable state [#257261]({{kib-pull}}257261).
* Fixes Lens panels appearing to revert after inline edits until you refresh the page, even though changes are saved [#256984]({{kib-pull}}256984).

**Data ingestion and Fleet**:
* Improves screen reader announcements and focus when moving processors in the ingest pipeline editor [#259096]({{kib-pull}}259096).
* Fixes Fleet bulk agent actions (unenroll, upgrade, reassign to policy) not respecting the current space when selection uses a kuery filter [#258582]({{kib-pull}}258582).
* Fixes automatic agent upgrades stopping early with “target percentage already reached” because agents upgrading in other policies are also counted [#258387]({{kib-pull}}258387).

**Data management**:
* Restores keyboard focus to the **Create a transform** button on the **Transforms** page [#258095]({{kib-pull}}258095).
* Enhances screen reader notifications for bulk actions in Index Management tables, providing live announcements when the bulk actions menu becomes visible or hidden [#257089]({{kib-pull}}257089).

**Elastic Observability solution**:
For the Elastic Observability 9.3.3 release information, refer to [Elastic Observability Solution Release Notes](docs-content://release-notes/elastic-observability/index.md).

**Elastic Security solution**:
For the Elastic Security 9.3.3 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

**Elasticsearch solution**:
* Fixes the query rules UI rejecting case variants as duplicate values [#259506]({{kib-pull}}259506).
* Fixes only passing filtered rules to the API and deleting rules not matching the filter in the Query Rule Set editor [#259503]({{kib-pull}}259503).
* Prevents creating incompatible inference endpoints when adding a `semantic_text` field in the Index Management mappings editor [#256586]({{kib-pull}}256586).

**Machine Learning**:
* Fixes the anomaly swim lane dashboard panel not refreshing [#259962]({{kib-pull}}259962).
* Fixes a console error when opening the data frame analytics jobs list [#258591]({{kib-pull}}258591).
* Adds aria labels to job wizard combo boxes [#258509]({{kib-pull}}258509).

## 9.3.2 [kibana-9.3.2-release-notes]

:::{important}
The 9.3.2 release contains fixes for potential security vulnerabilities. Check our [security advisory](https://discuss.elastic.co/c/announcements/security-announcements/31) for more details.
:::

### Features and enhancements [kibana-9.3.2-features-enhancements]

**Elastic Security solution**:
For the Elastic Security 9.3.2 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

**Connectivity**:
* Adds Gemini 2.5 Flash Lite, Claude 4.5 Haiku, and Claude 4.6 Sonnet models to preconfigured connectors [#253109]({{kib-pull}}253109).

### Fixes [kibana-9.3.2-fixes]

**Elastic Agent Builder**:
* Fixes a bug in the `platform.core.search` tool and `index_search` tool type where nested fields were ignored when searching for matching documents [#255914]({{kib-pull}}255914).
* Fixes MCP connectors ignoring the proxy and SSL configuration from the actions plugin (`xpack.actions` configuration property) [#255813]({{kib-pull}}255813).

**Alerting**:
* Fixes a problem generating a report with multi-page Canvas workpads [#255022]({{kib-pull}}255022).
* Fixes a blank page appearing at the end of PDF exports when using the **Print format** option with an even number of dashboard visualizations [#254957]({{kib-pull}}254957).
* Improves handling of `204` responses [#251090]({{kib-pull}}251090).

**Dashboards and Visualizations**:
* Fixes an issue where embedded panels in Canvas workpads could lose their saved object references, causing panels to fail to load [#252191]({{kib-pull}}252191).
* Fixes the **Add from library** action adding incorrect embeddable state [#257261]({{kib-pull}}257261).
* Fixes Lens transforms [#257224]({{kib-pull}}257224).
* Fixes an issue where dashboard panels could get stuck in an infinite loading state after an error instead of showing error messages [#257188]({{kib-pull}}257188).
* Fixes Maps failing to load when the stored time filter contained a `quick` mode value [#255178]({{kib-pull}}255178).

**Data ingestion and Fleet**:
* Fixes the unenroll task and adds an FTR test [#255726]({{kib-pull}}255726).
* Fixes the incorrect installation of assets [#254923]({{kib-pull}}254923).

**Discover**:
* Fixes glitchy rendering in the **Attributes** tab [#255173]({{kib-pull}}255173).

**Elastic Observability solution**:
For the Elastic Observability 9.3.2 release information, refer to [Elastic Observability Solution Release Notes](docs-content://release-notes/elastic-observability/index.md).

**Elastic Security solution**:
For the Elastic Security 9.3.2 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

**Kibana platform**:
* Fixes the spaces list displaying **No spaces match** text on load [#255654]({{kib-pull}}255654).
* Fixes the embeddable console auto-closing on chrome or overlay clicks [#253382]({{kib-pull}}253382).
* Fixes an issue where the Kibana JSON logger could produce JSON objects with a large number of numbered keys [#256233]({{kib-pull}}256233).

**Kibana security**:
* Adds `waitFor` for the privilege button [#255094]({{kib-pull}}255094).
* Fixes an issue where saving a dashboard included access control features when a user profile was not available [#255065]({{kib-pull}}255065).

**Machine Learning**:
* Fixes screen reader announcements for flyouts [#256409]({{kib-pull}}256409).

**Management**:
* Improves name announcement in the index mode modal [#256392]({{kib-pull}}256392).
* Fixes an issue in **Dev Tools Console** where syntax highlighting broke when queries contained accented or non-ASCII characters [#255649]({{kib-pull}}255649).
* Fixes an issue in **Dev Tools Console** where closing nested braces broke syntax highlighting for subsequent elements [#255426]({{kib-pull}}255426).

**Search**:
* Changes the **Run in Console** button type [#256455]({{kib-pull}}256455).
* Fixes Search Playground routes to limit the maximum size of arrays [#255881]({{kib-pull}}255881).
* Fixes focus behavior when there are errors in the connector flyout form [#255770]({{kib-pull}}255770).
* Adds server-side API key generation [#256083]({{kib-pull}}256083).

## 9.3.1 [kibana-9.3.1-release-notes]

:::{important}
The 9.3.1 release contains fixes for potential security vulnerabilities. Check our [security advisory](https://discuss.elastic.co/c/announcements/security-announcements/31) for more details.
:::

### Features and enhancements [kibana-9.3.1-features-enhancements]

**Data ingestion and Fleet**:
* Allows integration rollback even if all package policies are not on an upgraded version [#253646]({{kib-pull}}253646).

**Elastic Security solution**:
For the Elastic Security 9.3.1 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

**Machine Learning**:
* Adds a dynamic default connector to GenAI settings [#252861]({{kib-pull}}252861).
* Adds missing ES|QL commands and functions documentation for inference tasks [#249089]({{kib-pull}}249089).

### Fixes [kibana-9.3.1-fixes]

**Alerting and cases**:
* Fixes a bug with PagerDuty where setting the **Custom details** field causes rules to fail [#253683]({{kib-pull}}253683).
* Adds external reference IDs to the attached documents check when a case is selected [#253107]({{kib-pull}}253107).
* Fixes rule execution failing due to null execution UUIDs [#252618]({{kib-pull}}252618).
* Improves handling of 204 responses [#251090]({{kib-pull}}251090).

**Connectivity**:
* Fixes AI Connector form fields incorrectly resetting to default values when cleared with backspace [#251095]({{kib-pull}}251095).
* Updates connector description terminology to reference "pre-configured AI connectors" [#250649]({{kib-pull}}250649).

**Dashboards and Visualizations**:
* Fixes layer editor scrolling in the full Lens editor [#253247]({{kib-pull}}253247).
* Fixes `runtime_mappings` being ignored or overridden in Vega specs when defined in `data[].url.body` [#253560]({{kib-pull}}253560).

**Data ingestion and Fleet**:
* Fixes an issue where an agent rolled back after an upgrade could not be upgraded again in Fleet UI [#253850]({{kib-pull}}253850).

**Discover**:
* Fixes the handling of missing values [#251892]({{kib-pull}}251892).

**Elastic Observability solution**:
For the Elastic Observability 9.3.1 release information, refer to [Elastic Observability Solution Release Notes](docs-content://release-notes/elastic-observability/index.md).

**Elastic Security solution**:
For the Elastic Security 9.3.1 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

**Kibana platform**:
* Strips system-managed date fields from ingest pipelines before PUT requests [#252579]({{kib-pull}}252579).
* Fixes Stack Monitoring breadcrumb when in solution view [#249751]({{kib-pull}}249751).

**Machine Learning**:
* Fixes "today" and "this week" filters for Log Rate and Pattern Analysis embeddables [#252925]({{kib-pull}}252925).
* Fixes word break in Anomaly Detection page titles [#250058]({{kib-pull}}250058).

**Management**:
* Fixes autocomplete not working in embedded console [#253306]({{kib-pull}}253306).
* Fixes an issue loading the doc count in index management when viewing larger page sizes with long index names [#252422]({{kib-pull}}252422).
* Fixes a validation error for AI pipeline suggestions with empty grok patterns [#251113]({{kib-pull}}251113).

**Search**:
* Fixes the homepage throwing errors when the license level is below Enterprise [#251484]({{kib-pull}}251484).
* Reduces background polling on the Index Details page to avoid unnecessary API requests [#251446]({{kib-pull}}251446).
* Fixes links being visible on Search homepage when the user doesn't have access [#251437]({{kib-pull}}251437).

**Workflows**:
* Adds datemath support to the KQL evaluator [#252840]({{kib-pull}}252840).

## 9.3.0 [kibana-9.3.0-release-notes]

% ::::{NOTE}
% ::::


### Features and enhancements [kibana-9.3.0-features-enhancements]

**Elastic Agent Builder**:

* [Elastic Agent Builder](docs-content://explore-analyze/ai-features/elastic-agent-builder.md) is now generally available. It is enabled by default in Elasticsearch solution environments, and you can opt in to **Agent Builder** and its **AI Agent** chat experience in Observability and Security solution environments. Learn how to [get started](docs-content://explore-analyze/ai-features/agent-builder/get-started.md).

**Alerting**:

* Supports searching for report schedules by title and creator [#243841]({{kib-pull}}243841).
* Provides fields for specifying cc and bcc recipients, the subject line, and the message for scheduled report email notifications [#242922]({{kib-pull}}242922).
* Enables incremental human-readable case IDs [#238555]({{kib-pull}}238555).
* Adds option to delete report schedules [#238197]({{kib-pull}}238197).
* Alert cleanup is now generally available [#247465]({{kib-pull}}247465).
* Adds search to the new **Attachments** tab in cases [#246265]({{kib-pull}}246265).
* Adds support for searching rules by their actions' params using the API [#246123]({{kib-pull}}246123).
* Scheduled reports are now generally available [#245882]({{kib-pull}}245882).
* The Slack connector can now be configured to send messages to any channel using channel names [#245423]({{kib-pull}}245423).
* Improves search on the case management page [#245321]({{kib-pull}}245321).
* Adds option to enable disabled report schedules [#244202]({{kib-pull}}244202).
* Disable flapping per rule - schema only changes [#243855]({{kib-pull}}243855).
* Centralizes tabs for different attachement types under the new **Attachments** tab in cases [#243708]({{kib-pull}}243708).
* Adds a date time picker to the cases management page to help you find cases that were created during a specific time range [#243409]({{kib-pull}}243409).
* Adds option to edit report schedules [#241928]({{kib-pull}}241928).
* Improves UI for specifying additional fields for IBM Resilient action [#238869]({{kib-pull}}238869).
* Makes Agent ID the default observables type [#238533]({{kib-pull}}238533).
* Adds `kibana.alert.index_pattern` to all Stack alerts. This change doesn't affect detection alerts [#239450]({{kib-pull}}239450).

**Connectivity**:
* Elastic will regularly be adding new AI models from 9.3 onwards which will appear as pre-configured AI connectors in  {{kib}}. Refer to [the Elastic Inference Service page](docs-content://explore-analyze/elastic-inference/eis.md) for more details.
* Adds Groq to the list of available providers for the Inference/AI Connector and for Inference endpoint creation [#244962]({{kib-pull}}244962).
* Introduces a Brave Search connector [#245329]({{kib-pull}}245329).
* The webhook connector now supports the following HTTP request methods: POST(default), PUT, PATCH, GET, and DELETE [#238072]({{kib-pull}}238072).
* Adds new preconfigured connectors and updates existing ones [#242791]({{kib-pull}}242791).
* Adds a new temperature parameter to AI Connector and to OpenAI, Bedrock, and Gemini connectors [#239806]({{kib-pull}}239806).
* Adds support for headers in the OpenAI integration [#238710]({{kib-pull}}238710).

**Dashboards and Visualizations**:
* Dashboards now support ownership and "write_restricted" mode. You can now keep dashboards publicly editable or in a write-restricted state until they are ready to be published, giving you more control over who can edit your dashboards, regardless of broader space permissions [#224552]({{kib-pull}}224552).
* Adds support for chaining variable controls. You can now set up variable controls to depend on the values selected for another variable control [#242909]({{kib-pull}}242909).
* Adds basic filtering support for interactions with {{esql}} charts [#243439]({{kib-pull}}243439).
* Removes the **Supporting visualization** section heading from the Primary Metric editor. All configuration options remain fully accessible in the same location under **Appearance** [#245979]({{kib-pull}}245979).
* Reorganizes and renames color settings in the Primary Metric dimension editor. For numeric metrics, the "Color by value" and "Color mapping"/"Color" settings are now located under the "Background chart" field. The settings have been renamed as follows: "Color by value" is now "Color mode", and "Color mapping" is now "Dynamic color mapping" [#243608]({{kib-pull}}243608).
* In **dashboard visualization in-line editing** and **Lens workspace**, the 'Appearance', 'Titles and text', 'Axis', and 'Legend' settings have been moved from a popover into a dedicated flyout panel [#240804]({{kib-pull}}240804).
* Moves the Lens visualization toolbar from the workspace section to the configuration panel [#239879]({{kib-pull}}239879)
* Moves the **Save as** and **Reset** options under the top nav **Save** button when the dashboard is in edit mode [#237211]({{kib-pull}}237211).
* The Lens configuration panel has been redesigned to display layers as tabs instead of vertically stacked panels. Layer actions (clone, remove, save) are now accessible through a menu in each tab, improving the editing experience when working with multiple data layers, annotations, and reference lines [#235372]({{kib-pull}}235372).

**Data ingestion and Fleet**:
* Enables integration knowledge generation by default and adds a UI setting that allows you to opt out of the integration knowledge indexing [#245080]({{kib-pull}}245080).
* Enables rolling back integrations to the previously installed version [#240761]({{kib-pull}}240761).
* Adds capability for rolling back a recent upgrade of a Fleet-managed Elastic Agent using Fleet UI or API [#247398]({{kib-pull}}247398), [#249416]({{kib-pull}}249416).
* Adds functionality for removing root privilege from Fleet-managed agents if applicable [#237790]({{kib-pull}}237790).
* Adds **Advanced Internal YAML Settings** field to the agent policy settings UI [#245819]({{kib-pull}}245819).
* Redesigns the Actions menu in Fleet, placing commonly used actions at the top level and organizing other actions into nested menus by use case [#245174]({{kib-pull}}245174).
* Auto-migrates component templates to use `type@lifecycle` ILM policies during Fleet setup [#243333]({{kib-pull}}243333).
* Adds a cleanup task that removes excess policy revisions from the `.fleet-policies` index [#242612]({{kib-pull}}242612).
* Uses `type@lifecycle` ILM policies for new package installations [#241992]({{kib-pull}}241992).
* Adds the `xpack.fleet.experimentalFeatures` config setting [#238840]({{kib-pull}}238840).
* Adds a **Show agentless resources** toggle on the Fleet > Settings page for debugging and diagnostics [#237528]({{kib-pull}}237528).
* Adds Fleet Server host authentication settings for Elastic Agent > Fleet Server SSL support [#236959]({{kib-pull}}236959).
* Persists the state of filters in the agent list table while navigating within a session [#228875]({{kib-pull}}228875).

**Discover**:
* Discover now shows partial results after a search gets canceled [#242346]({{kib-pull}}242346).
* Background search is now enabled by default in all environments [#242105]({{kib-pull}}242105).
* Adds a “Copy as Markdown” option for selected results [#245545]({{kib-pull}}245545).
* Optimizes performance by avoiding redundant requests when breakdown or chart interval changes [#245523]({{kib-pull}}245523).
* Shows multi-fields in the document viewer by default in {{esql}} mode [#245890]({{kib-pull}}245890).
* Adds support for filtering multivalue fields by interacting with the results table in {{esql}} mode [#245554]({{kib-pull}}245554).
* Improves the lookup index editor interface available in {{esql}} mode [#244480]({{kib-pull}}244480).
* Improves the file upload section of the lookup index editor interface [#244550]({{kib-pull}}244550).
* Saving an {{esql}} query's visualization to a dashboard now brings any related controls along with it [#237070]({{kib-pull}}237070).
* Updates the icon in the document viewer to add or remove a field in the main documents table [#246024]({{kib-pull}}246024).


**{{esql}} editor**:
* Adds a **Quick search** functionality that helps you turn free-text inputs into {{esql}} WHERE clauses [#242123]({{kib-pull}}242123).
* Adds support for multi-value variables using MV_CONTAINS functions [#239266]({{kib-pull}}239266).
* Adds inline suggestions to {{esql}} queries  [#235162]({{kib-pull}}235162).
* Allows selecting field data type in the lookup index editor interface of the {{esql}} editor [#241637]({{kib-pull}}241637).
* Adds support for expressions in functions [#236343]({{kib-pull}}236343).
* Improves computed suggestions for expressions [#246421]({{kib-pull}}246421).
* Renders string-only suggestions for Like and RLike operators [#244903]({{kib-pull}}244903).
* Improves validation and autocomplete suggestions for the CASE function [#244280]({{kib-pull}}244280).
* Adds context-aware suggestion ordering with categorization [#243312]({{kib-pull}}243312).
* Suggests adding curly braces after the `WITH` keyword for RERANK and COMPLETION commands [#243047]({{kib-pull}}243047).
* Adds support for new exponential_histogram {{es}} field type [#242748]({{kib-pull}}242748).
* Wraps the fork subcommands inside a`parens` node [#242369]({{kib-pull}}242369).
* Improves the quality of context-based suggestions [#241081]({{kib-pull}}241081).
* Adds autocomplete suggestions for expressions in LOOKUP JOIN commands [#240735]({{kib-pull}}240735).
* Applies the breakdown field before applying time bucketing in STATS BY commands to preserve consistent sorting across buckets in {{esql}} queries [#239685]({{kib-pull}}239685).


**Elastic Observability solution**:
For the Elastic Observability 9.3.0 release information, refer to [Elastic Observability Solution Release Notes](docs-content://release-notes/elastic-observability/index.md).

**Elastic Security solution**:
For the Elastic Security 9.3.0 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

**Kibana platform**:
* Adds buttons to the time picker component to quickly shift the selected time range backward and forward, and adds timezone information to the time picker popover [#243020]({{kib-pull}}243020).
* Adds cross-tab syncing for recently used time ranges [#242467]({{kib-pull}}242467).
* The `defaultRoute` advanced setting now controls the target of the Elastic logo link for spaces using a solution view [#241571]({{kib-pull}}241571).
* The name of the deployment now appears in the navigation breadcrumb on {{ech}} [#238078]({{kib-pull}}238078).
* Enforces the `object_src 'none'` directive in Kibana's Content Security Policy and introduces a new `csp.object_src` configuration option to control its behavior
* Containers now set the default Node.js heap to 75% of available memory up to a maximum of 4096 Mb.  Previously, this was set to 50% [#246073]({{kib-pull}}246073).
* Linux now supports the `populate_file_data` advanced option which enables `entropy` and `header_bytes` fields in file events [#246197]({{kib-pull}}246197).
* Adds the ability to cancel file uploads [#241297]({{kib-pull}}241297).

**Kibana security**:
* The **API keys** management page now defaults to showing personal API keys only [#245261]({{kib-pull}}245261).
* Adds a warning when deleting API keys currently used by alerting rules [#243353]({{kib-pull}}243353).
* Adds the ability to specify the origin(s) of authentication providers that appear to users logging in to {{kib}} [#239993]({{kib-pull}}239993).
* Enhances the error message to include detailed information about why a role is considered as malformed [#239098]({{kib-pull}}239098).
* Removes the `AI Assistants Settings` privilege [#239144]({{kib-pull}}239144).

**Machine Learning**:
* Adds an optional `timeout` parameter to the Inference chat model [#248326]({{kib-pull}}248326).
* Adds Security {{ml}} modules for GCP Audit and Azure Activity Logs [#236849]({{kib-pull}}236849).
* Removes median line length anomaly detection categorization check [#243827]({{kib-pull}}243827).
* Adds custom header support to inference endpoints creation UI [#242187]({{kib-pull}}242187).
* Improves the layout for custom inference endpoint UI [#241779]({{kib-pull}}241779).
* Adds an action to create an anomaly detection alerting rule [#241274]({{kib-pull}}241274).
* Makes the {{ml}} update space APIs public [#241109]({{kib-pull}}241109).
* Improves display of long fields values in top values list [#241006]({{kib-pull}}241006).
* Adds the ability to narrow down the list of anomalies that the Anomaly detection rule looks for [#240100]({{kib-pull}}240100).
* Adds feedback button to the Anomaly Explorer and Single Metric Viewer [#239883]({{kib-pull}}239883).

**Search**:
* When creating a new Elasticsearch solution project, you will now land on the **Elasticsearch home page** by default instead of the **Create index** page to get immediate access to relevant tutorials and educational content [#237612]({{kib-pull}}237612).
* Adds a new getting started page within the Elasticsearch solution which offers hands-on feature tutorials. This page defaults as the initial destination for users creating a new Elasticsearch solution project [#245311]({{kib-pull}}245311).
* Adds a clear confirmation when an element has been successfully copied using one of the available **Copy** buttons on the Elasticsearch solution home page [#246090]({{kib-pull}}246090).
* Adds callouts and guided tours to Kibana's Elasticsearch solution UI on {{ech}} and Serverless to provide better introductions to Elastic Inference Service endpoints. You can dismiss callouts and tours, which will not reappear after dismissal [#244626]({{kib-pull}}244626).
* Improves the Console UI to make key actions more intuitive. The **Play** button is now more prominent, a new **Copy to language** button provides quick access to export the selected command in your preferred coding language, and the context menu has been updated to allow you to set a default language preference [#242487]({{kib-pull}}242487).

**Workflows**:
* Elastic Workflows is now available in technical preview. Build YAML-based workflows to automate actions across {{es}},{{kib}}, external systems, and AI. Workflows support manual, scheduled, and alert-based triggers, conditional logic, and integrations with existing connectors and Agent Builder. You must turn on the feature to get started. Refer to [Set up workflows](docs-content://explore-analyze/workflows/setup.md) for more details.

### Fixes [kibana-9.3.0-fixes]

**Alerting**:
* Fixes `cases.total_event` not showing the number of events attached to a case [#247996]({{kib-pull}}247996).
* Encodes terms searched on cases management page [#247992]({{kib-pull}}247992).
* Adds max character validation to the email connector params and config [#246453]({{kib-pull}}246453).
* Fixes an issue that caused the Security alerts table to not update columns correctly when switching view mode [#245253]({{kib-pull}}245253).
* Adds `alert.consecutiveMatches` to action context [#244997]({{kib-pull}}244997).
* Fixes case submissions becoming stale [#244543]({{kib-pull}}244543).
* Allows spaces in file paths for case observables [#244350]({{kib-pull}}244350).
* Catches connector errors without interrupting the case creation flow [#244188]({{kib-pull}}244188).
* Improves error messages for IBM connector [#244012]({{kib-pull}}244012).
* Verifies the alert exists before muting [#242847]({{kib-pull}}242847).
* Fixes auto-extraction in event bulk actions [#242325]({{kib-pull}}242325).
* Fixes Alerts table pagination being stuck on rule details page [#242275]({{kib-pull}}242275).
* Use real dimensions when taking a screenshot of {kib} layout [#242127]({{kib-pull}}242127).
* Only takes tag changes into account when connector supports them [#241944]({{kib-pull}}241944).
* Improves cases management table loading to prevent flashing [#240155]({{kib-pull}}240155).
* Fixes missing announcements in case forms to improve accessiblity [#240132]({{kib-pull}}240132).
* Adds manual focus to buttons for case actions to improve accessiblity [#239504]({{kib-pull}}239504).
* Removes `autoFocus` to preserve proper focus when modal closed [#239366]({{kib-pull}}239366).
* Fixes observables not being added to cases when auto-extract is turned on [#239000]({{kib-pull}}239000).
* Updates `nodemailer` to to 7.0.9 [#238816]({{kib-pull}}238816).
* Adds Jira's `otherFields` JSON editor to case creation flow [#238435]({{kib-pull}}238435).
* Isolates the configuration parameters for the Tines connector to the server side [#236863]({{kib-pull}}236863).
* Enables auto-extraction by default and adds user actions for case observable actions [#236524]({{kib-pull}}236524).
* Separates sync alert and auto-extract updates in case activity [#236519]({{kib-pull}}236519).
* Fixes the alert history chart background color in dark mode [#246017]({{kib-pull}}246017).
* Fixes infinite loop issue in investigation guide editor [#240472]({{kib-pull}}240472).
* Fixes missing fields when using combined filters with the `ignoreFilterIfFieldNotInIndex` advanced setting enabled [#238945]({{kib-pull}}238945).


**Connectivity**:
* Ensures that the "maximum tokens" parameter is passed as expected by the service for the Anthropic connector [#241188]({{kib-pull}}241188).
* Removes the default fallback region for the Bedrock connector [#241157]({{kib-pull}}241157).
* Ensures all authentication fields show up correctly for the AI Connector [#240913]({{kib-pull}}240913).

**Dashboards and Visualizations**:
* Cleans filters as they’re updated from Unified Search, adds extra cleanup for compound filters by removing undefined properties, and fixes unsaved badges appearing when dashboards with compound filters are loaded [#247309]({{kib-pull}}247309).
* Uses `Number.MAX_VALUE` instead of `Infinity` for the default maximum height of a panel [#243572]({{kib-pull}}243572).
* Fixes an issue where saving a dashboard after switching a Dashboard Link to an External Link caused the save function to throw an error [#243134]({{kib-pull}}243134).
* Fixes the silence warnings by silencing error notifications in Discover and Dashboards and changing the built-in URL restore error to a `console.warn` [#242788]({{kib-pull}}242788).
* Fixes a regression with print mode in Dashboard [#242780]({{kib-pull}}242780).
* Fixes an issue with sync colors and sync tooltips being turned on by default for new dashboards. Now, those options are turned off by default for new dashboards [#242442]({{kib-pull}}242442).
* Fixes an error with deselecting a "(blank)" option from an options list [#242036]({{kib-pull}}242036).
* Fixes layout issues for Markdown embeddables in small dashboard panels using CSS container queries. When a markdown panel is shorter than 120px, the UI now adapts to a compact layout that maximizes usable space [#240806]({{kib-pull}}240806).
* Labels in the **Create index** flow now render with the default **Use vector tiles** scaling as soon as label styling is applied (or after save), without requiring a scaling toggle [#240728]({{kib-pull}}240728).
* Fixes an issue where users could not reset unsaved changes after enabling time restore and changing dashboard time range [#239992]({{kib-pull}}239992).
* Fixes search session restoration issue [#239822]({{kib-pull}}239822).
* Fixes an error in the Options list control when selecting a "(blank)" value [#239791]({{kib-pull}}239791).
* Fixes an issue in the `LensConfigBuilder` that treated all dataview references the same, causing the UI to throw an error attempting to find an ad-hoc dataview that does not exist as a `SavedObject` [#239431]({{kib-pull}}239431).
* Fixes an issue in the Lens Table that broke **click to filter** on table rows when any column is used as a formula [#239222]({{kib-pull}}239222).
* Fixes metric color assignment when the breakdown and maximum options are defined in Lens [#238901]({{kib-pull}}238901).
* Fixes an issue where ad-hoc data views were not providing suggestions in the global search bar [#238731]({{kib-pull}}238731).
* Fixes an error in the **Visualize Listing** page in which an error in the visualization could cause the entire page to error. This improves the error handling to make it easier to identify which visualization is causing the problem in order to address it [#238355]({{kib-pull}}238355).
* Fixes an issue where dashboards cannot be saved when a filter pill has a combined filter using OR or AND operations [#237477]({{kib-pull}}237477).
* Fixes an issue where panels in sections are not displayed when opening the dashboard from a shared link [#237382]({{kib-pull}}237382).
* Prevents a double fetch when panels would fetch data while controls were building filters and then fetch data again once controls filters are available [#237169]({{kib-pull}}237169).
* Fixes color contrast for links in Lens [#247721]({{kib-pull}}247721).


**Data ingestion and Fleet**:
* Uses long expiration for agent auto-upgrade actions and scheduled upgrades [#243443]({{kib-pull}}243443).
* Fixes auto-upgrade logic to retry upgrade action if agents are stuck in **Updating** state [#243326]({{kib-pull}}243326).
* Adds retry behavior for `/api/fleet/agents` when transient issues with {{es}} are encountered [#243105]({{kib-pull}}243105).
* Fixes Docker image in the Kubernetes manifest in the Add agent instructions [#242691]({{kib-pull}}242691).
* Fixes an issue where some package icons were not loaded correctly [#242406]({{kib-pull}}242406).
* Shows warnings on sync integrations UI when referencing other entities [#241623]({{kib-pull}}241623).
* Adds the proxy SSL options to download sources if a proxy is selected [#241115]({{kib-pull}}241115).
* Omits system properties when synchronizing ingest pipelines [#241096]({{kib-pull}}241096).
* Fixes `template_path` asset selection for some integration packages [#240750]({{kib-pull}}240750).
* Allows Fleet setup retries on start in all environments [#240342]({{kib-pull}}240342).
* Fixes an issue where the uniqueness of agent policy names was not consistently enforced across spaces when name or space changes occurred [#239631]({{kib-pull}}239631).
* Fixes `ignore_above` mapping for `flattened` fields [#238890]({{kib-pull}}238890).
* Fixes a "package not found" error when skipping cloud onboarding for a prerelease package [#238629]({{kib-pull}}238629).
* Fixes an issue where new package global variables were not included and stale variable references were not removed on integration policy upgrade [#238542]({{kib-pull}}238542).
* Fixes an error that occurred when deleting orphaned integration policies [#237875]({{kib-pull}}237875).
* Enables storing secrets in Fleet Server host config if Fleet Server is running at a minimum supported version [#237464]({{kib-pull}}237464).
* Fixes MSI commands for installing Elastic Agent and Fleet Server [#236994]({{kib-pull}}236994).

**Discover**:
* Fixes an issue with the "Search entire time range" option that could exclude some results if the time field was set to date nanos [#248495]({{kib-pull}}248495).
* Fixes an issue where document viewer tabs were unnecessarily re-mounting on every refresh, leading to degraded performance [#248203]({{kib-pull}}248203).
* Fixes an issue causing query drafts to be lost when switching between tabs without running the query first in {{esql}} mode [#247968]({{kib-pull}}247968).
* Fixes an issue with {{esql}} tabs not loading properly [#246941]({{kib-pull}}246941).
* Fixes an issue in Discover where default app state could trigger unsaved changes in saved Discover sessions, such as default columns applied through the `defaultColumns` advanced setting [#246664]({{kib-pull}}246664).
* Fixes an issue with Discover tabs that occurs when navigating to a different tab while the previous tab is still initializing [#245752]({{kib-pull}}245752).
* Fixes truncation for longer text in the Discover table [#241440]({{kib-pull}}241440).

**{{esql}} editor**:
* Displays the available options when editing an existing variable control [#239315]({{kib-pull}}239315).
* Fixes unrecognized GROK patterns [#246871]({{kib-pull}}246871).
* Fixes KEEP behavior in {{esql}} when a query initially returns no results [#239063]({{kib-pull}}239063).
* Adds FORK with KEEP/STATS in the transformational commands [#240011]({{kib-pull}}240011).
* Fixes the autocomplete of timeseries sources after a comma [#241402]({{kib-pull}}241402).

**Elastic Observability solution**:

For the Elastic Observability 9.3.0 release information, refer to [Elastic Observability Solution Release Notes](docs-content://release-notes/elastic-observability/index.md).

**Elastic Security solution**:

For the Elastic Security 9.3.0 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

**Kibana platform**:
* Fixes the serialization of `meta.error` in JSON layouts. If it is an `Error` instance, only `message`, `name`, and `stack` are included. Other fields are no longer returned in the logs [#244364]({{kib-pull}}244364).
* Fixes an issue in the component template creation flow where a new component template with `@custom` suffix in its name would lead to updating mappings of all unrelated data streams and cause a popup to appear asking to roll over conflicting ones [#237952]({{kib-pull}}237952).
* Fixes privilege requirements when reindexing indices through the upgrade assistant. Previously, the "superuser" role was required. Now, "cluster: manage" and "all" privileges for the relevant indices are sufficient [#237055]({{kib-pull}}237055).
* Fixes a case where the upgrade assistant would incorrectly warn about a node breaching the low watermark despite the max headroom setting [#243906]({{kib-pull}}243906).
* Fixes `createAuditEvents` always returning failure as outcome [#247152]({{kib-pull}}247152).
* Fixes "now" and mixed format date handling in the **Share** menu [#245539]({{kib-pull}}245539).
* Fixes favicon CSS specifity [#243351]({{kib-pull}}243351).
* Reduces re-renders on resize and items changes [#239888]({{kib-pull}}239888).
* Fixes an issue with the files management flyout crashing [#237588]({{kib-pull}}237588).
* Fixes infinite loading of roles on the **Edit space** page [#242954]({{kib-pull}}242954).
* Reflects the value selected for the `AI Assistants Visibility` GenAI setting when opening AI Assistant from the header [#239555]({{kib-pull}}239555).
* Fixes ECS-incompatible logs values [#245706]({{kib-pull}}245706).
* Fixes an issue where clients authorized to a partial list of saved object types would circumvent the Saved Objects Repository's allowed types and could list hidden saved object types [#244967]({{kib-pull}}244967).

**Kibana security**:
* Fixes an issue where fields were not case-sensitive in {{kib}}'s user interface for creating and updating roles, though fields are case-sensitive in {{es}} [#246069]({{kib-pull}}246069).
* Fixes an issue preventing IDP-initiated login with multiple OIDC providers [#243869]({{kib-pull}}243869).
* Introduces a separate error for empty login attempts with SAML and OIDC providers [#237611]({{kib-pull}}237611).

**Machine Learning**:
* Disables field statistics when using the {{esql}} `TS` command in Data Visualizer [#247641]({{kib-pull}}247641).
* Fixes display of Data Visualizer's map view for small screen sizes [#247615]({{kib-pull}}247615).
* Fixes anomaly chart empty query issue [#246841]({{kib-pull}}246841).
* Fixes creating new anomaly detection jobs from Discover sessions with no data view [#246410]({{kib-pull}}246410).
* Ensures Anomaly detection result chart tooltips are always shown correctly [#246077]({{kib-pull}}246077).
* Prevents clearing cell selections after hiding the alert's table popover in Anomaly explorer [#244183]({{kib-pull}}244183).
* Optimizes and enables text field analysis in contextual insights for log rate analysis [#244109]({{kib-pull}}244109).
* Ensures deleted text in the inference connector, AI connector, and inference endpoint creation forms is not sent as an empty string [#244059]({{kib-pull}}244059).
* Fixes wizard for data view with runtime fields for data frame analytics [#242557]({{kib-pull}}242557).
* Fixes import and improves validation for Anomaly detection and Data frame analytics jobs [#242263]({{kib-pull}}242263).
* Ensures max tokens parameter is passed as expected during Anthropic endpoint creation [#241212]({{kib-pull}}241212).
* Fixes index names causing incompatible cluster errors when product docs are installed for multiple inference IDs [#240506]({{kib-pull}}240506).
* Ensures inference endpoints UI list loads when provider is custom [#240189]({{kib-pull}}240189).
* Fixes layout of fields in {{ml}} overview and notifications pages [#239113]({{kib-pull}}239113).
* Adds unique accessible labels for **Show top field values** buttons [#237972]({{kib-pull}}237972).
* Fixes tool calling unavailable tools [#237174]({{kib-pull}}237174).
* Improves trained models list performance [#237072]({{kib-pull}}237072).
* Fixes partition field settings errors in the single metric viewer dashboard panel [#237046]({{kib-pull}}237046).
* Prevents URL-like strings from being displayed as links in alerts [#226849]({{kib-pull}}226849).
* Improves anonymization error messages when NER model is unavailable [#247696]({{kib-pull}}247696).
* Adds a table caption for empty top categories in the logs category table [#246041]({{kib-pull}}246041).
* Fixes broken Data Visualizer and AI Operations navigation breadcrumbs and sidebar in solutions [#248167]({{kib-pull}}248167).
* Fixes counter metric fields missing in anomaly detection dropdown [#153021]({{kib-pull}}153021).


**Search**:
* Fixes an issue when running Elasticsearch with a Basic license, where you could encounter errors when updating index mappings, even when adding non-ML field types. Mapping updates now work as expected, while advanced semantic text features continue to require the appropriate license [#248462]({{kib-pull}}248462).
* Disables 'API keys' button on the Elasticsearch home page when logged in with insufficient permissions [#248072]({{kib-pull}}248072).
* Fixes the token count display showing "NaN" in Search Playground by preserving message annotations across the AI SDK v5 stream [#246589]({{kib-pull}}246589).
* Fixes an issue with the API creation flyout size [#244072]({{kib-pull}}244072).
* Fixes a case of keyboard focus getting trapped in pages using document preview [#243791]({{kib-pull}}243791).
* Makes `elser-2-elastic` (ELSER in EIS) the default inference endpoint for adding semantic text fields. Refactors the `SelectInferenceId` component for clarity and stability, resolving a console warning and improving popover and flyout state handling [#242436]({{kib-pull}}242436).
* Fixes Agents & Playground icons in the solution side navigation to render correctly when using dark mode [#240475]({{kib-pull}}240475).
* Fixes visual issues in the data preview metadata popup when ID is too long. Adds a tooltip and copy button to improve user experience [#239768]({{kib-pull}}239768).
* Fixes an issue in RAG Playground where invalid fields displayed red styling but no error messages. Error text now appears to help you identify and correct form issues [#238284]({{kib-pull}}238284).
* Fixes an accessibility issue where resetting changes or removing all terms in the Synonyms panel was not announced by screen readers. VoiceOver users on Safari will now hear updates when terms are reset [#237877]({{kib-pull}}237877).
* The Index management mappings editor now syncs model deployment status correctly. This fixes a case where users couldn't save `semantic_text` fields during deployment without forcing [#237812]({{kib-pull}}237812).
* Fixes an issue where the retriever query copied from the "Search your data" JavaScript tutorial fails with a `parsing_exception` when passed through the query parameter in the Node.js Elasticsearch client. Retriever queries must be passed through the body parameter to ensure they are serialized correctly [#237654]({{kib-pull}}237654).
* Adds refusal field to AI Assistant conversations [#243423]({{kib-pull}}243423).
* Turns off custom suggestions on the embedded console [#241516]({{kib-pull}}241516).
* Fixes an issue where form fields were resetting automatically when editing ingest pipeline settings [#237509]({{kib-pull}}237509).

## 9.2.8 [kibana-9.2.8-release-notes]

% ::::{NOTE}
% ::::

### Fixes [kibana-9.2.8-fixes]

**Alerting**:
* Fixes Webhook Connector `accessTokenUrl` validation [#258290]({{kib-pull}}258290).

**Dashboards and Visualizations**:
* Adjusts scrolling when you drag and drop a dashboard panel to avoid jumping [#258445]({{kib-pull}}258445).
* Fixes Canvas library embeddables failing to load when `savedObjectId` was present without saved object references [#257779]({{kib-pull}}257779).
* Fixes a race condition in the dashboard backup service and removes unnecessary error toasts [#257762]({{kib-pull}}257762).
* Fixes **Add from library** in Canvas creating incorrect embeddable state [#257261]({{kib-pull}}257261).
* Fixes Lens panels appearing to revert after inline edits until you refresh the page, even though changes were saved [#256984]({{kib-pull}}256984).

**Data ingestion and Fleet**:
* Ensures the log level from the assigned policy is used when an agent configuration doesn't mention one [#259425]({{kib-pull}}259425).
* Improves screen reader announcements and focus when moving processors in the ingest pipeline editor [#259096]({{kib-pull}}259096).
* Fixes Fleet bulk agent actions (unenroll, upgrade, reassign to policy) not respecting the current space when selection uses a kuery filter [#258582]({{kib-pull}}258582).
* Fixes automatic agent upgrades stopping early with “target percentage already reached” because agents upgrading in other policies were also counted [#258387]({{kib-pull}}258387).

**Data management**:
* Restores keyboard focus to the **Create a transform** button on the **Transforms** page [#258095]({{kib-pull}}258095).

**Elastic Observability solution**:
For the Elastic Observability 9.2.8 release information, refer to [Elastic Observability Solution Release Notes](docs-content://release-notes/elastic-observability/index.md).

**Elastic Security solution**:
For the Elastic Security 9.2.8 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

**Elasticsearch solution**:
* Fixes the query rules UI rejecting case variants as duplicate values [#259506]({{kib-pull}}259506).
* Prevents only passing filtered rules to the API and deleting rules not matching the filter in the Query Rule Set editor [#259503]({{kib-pull}}259503).

**Machine Learning**:
* Fixes the anomaly swim lane dashboard panel not refreshing [#259962]({{kib-pull}}259962).

## 9.2.7 [kibana-9.2.7-release-notes]

:::{important}
The 9.2.7 release contains fixes for potential security vulnerabilities. Check our [security advisory](https://discuss.elastic.co/c/announcements/security-announcements/31) for more details.
:::

### Features and enhancements [kibana-9.2.7-features-enhancements]

**Elastic Security solution**:
For the Elastic Security 9.2.7 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

### Fixes [kibana-9.2.7-fixes]

**Alerting**:
* Fixes a blank page appearing at the end of PDF exports when using the **Print format** option with an even number of dashboard visualizations [#254957]({{kib-pull}}254957).
* Improves handling of `204` responses [#251090]({{kib-pull}}251090).

**Dashboards and Visualizations**:
* Fixes an issue where embedded panels in Canvas workpads could lose their saved object references, causing panels to fail to load [#252191]({{kib-pull}}252191).
* Fixes an issue where dashboard panels could get stuck in an infinite loading state after an error instead of showing error messages [#257188]({{kib-pull}}257188).

**Data ingestion and Fleet**:
* Fixes the unenroll task and adds an FTR test [#255726]({{kib-pull}}255726).
* Fixes the incorrect installation of assets [#254923]({{kib-pull}}254923).

**Elastic Observability solution**:
For the Elastic Observability 9.2.7 release information, refer to [Elastic Observability Solution Release Notes](docs-content://release-notes/elastic-observability/index.md).

**Elastic Security solution**:
For the Elastic Security 9.2.7 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

**Kibana platform**:
* Fixes the spaces list displaying **No spaces match** text on load [#255654]({{kib-pull}}255654).
* Fixes an issue where the Kibana JSON logger could produce JSON objects with a large number of numbered keys [#256233]({{kib-pull}}256233).

**Kibana security**:
* Adds `waitFor` for the privilege button [#255094]({{kib-pull}}255094).

**Management**:
* Improves name announcement in the index mode modal [#256392]({{kib-pull}}256392).
* Fixes an issue in **Dev Tools Console** where syntax highlighting broke when queries contained accented or non-ASCII characters [#255649]({{kib-pull}}255649).
* Fixes an issue in **Dev Tools Console** where closing nested braces broke syntax highlighting for subsequent elements [#255426]({{kib-pull}}255426).

**Search**:
* Fixes Search Playground routes to limit the maximum size of arrays [#255881]({{kib-pull}}255881).
* Adds server-side API key generation [#256083]({{kib-pull}}256083).
* Fixes glitchy rendering in the **Attributes** tab [#255173]({{kib-pull}}255173).
* Fixes EQL sequence document merging to treat dot and nested notation the same [#254830]({{kib-pull}}254830).

## 9.2.6 [kibana-9.2.6-release-notes]

:::{important}
The 9.2.6 release contains fixes for potential security vulnerabilities. Check our [security advisory](https://discuss.elastic.co/c/announcements/security-announcements/31) for more details.
:::

### Features and enhancements [kibana-9.2.6-features-enhancements]

**Elastic Security solution**:
For the Elastic Security 9.2.6 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).


### Fixes [kibana-9.2.6-fixes]

**Alerting and cases**:
* Fixes rule execution failing due to null execution UUIDs [#252618]({{kib-pull}}252618).

**Dashboards and Visualizations**:
* Fixes `runtime_mappings` being ignored or overridden in Vega specs when defined in `data[].url.body` [#253560]({{kib-pull}}253560).

**Discover**:
* Fixes the handling of missing values [#251892]({{kib-pull}}251892).

**Elastic Observability solution**:
For the Elastic Observability 9.2.6 release information, refer to [Elastic Observability Solution Release Notes](docs-content://release-notes/elastic-observability/index.md).

**Elastic Security solution**:
For the Elastic Security 9.2.6 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

**Kibana platform**:
* Strips system-managed date fields from ingest pipelines before PUT requests [#252579]({{kib-pull}}252579).

**Search**:
* Reduces background polling on the Index Details page to avoid unnecessary API requests [#251446]({{kib-pull}}251446).

## 9.2.5 [kibana-9.2.5-release-notes]

### Fixes [kibana-9.2.5-fixes]

**Alerting**:
* Fixes timestamp override for {{esql}} CSV scheduled reports with relative time ranges [#248169]({{kib-pull}}248169).

**Dashboards and Visualizations**:
* Fixes an issue with dashboard PDF/PNG reports being cut off at the end when the dashboard has a markdown panel [#249644]({{kib-pull}}249644).

**Discover**:
* Fixes an issue with the "Search entire time range" option that could exclude some results if the time field was set to date nanos [#248495]({{kib-pull}}248495).
* Fixes an issue where document viewer tabs were unnecessarily re-mounting on every refresh, leading to degraded performance [#248203]({{kib-pull}}248203).
* Fixes an issue causing query drafts to be lost when switching between tabs without running the query first in {{esql}} mode [#247968]({{kib-pull}}247968).

**Elastic Observability solution**:
For the Elastic Observability 9.2.5 release information, refer to [Elastic Observability Solution Release Notes](docs-content://release-notes/elastic-observability/index.md).

**Elastic Security solution**:
For the Elastic Security 9.2.5 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

**Kibana platform**:
* Fixes an issue with the Share menu where all time ranges were being shared as absolute [#248804]({{kib-pull}}248804).
* Fixes an issue with certain properties causing failures when adding a policy to an index template [#249168]({{kib-pull}}249168).
* Fixes an issue with duplicated managed ILM policies still appearing as managed [#248586]({{kib-pull}}248586).
* Fixes Stack Monitoring Recent Log Entries' timestamps to respect Kibana's time zone setting (`dateFormat:tz`) [#249016]({{kib-pull}}249016).
* Fixes the breadcrumb when navigating to the Stack Monitoring page while using a solution view [#249751]({{kib-pull}}249751).

**Machine Learning**:
* Fixes occasional file preview corruption during file uploads [#250532]({{kib-pull}}250532).
* Updates Packetbeat DNS tunneling datafeed to include runtime mappings [#249317]({{kib-pull}}249317).

## 9.2.4 [kibana-9.2.4-release-notes]

### Features and enhancements [kibana-9.2.4-features-enhancements]

**Elastic Security solution**:
For the Elastic Security 9.2.4 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

### Fixes [kibana-9.2.4-fixes]

**Alerting and cases**:
* Adds maximum character validation to the email connector params and configuration [#246453]({{kib-pull}}246453).
* Adds encoding to search terms in the **Cases** page to prevent decoding errors [#247992]({{kib-pull}}247992).
* Updates total events in {{es}} document when attaching an event to a case [#247996]({{kib-pull}}247996).

**Dashboards and Visualizations**:
* Fixes compound filters showing unsaved changes on dashboard load [#247309]({{kib-pull}}247309).

**Discover**:
* Fixes the default app state handling when detecting unsaved changes [#246664]({{kib-pull}}246664).
* Fixes an issue with {{esql}} tabs not loading properly [#246941]({{kib-pull}}246941).

**Elastic Observability solution**:
For the Elastic Observability 9.2.4 release information, refer to [Elastic Observability Solution Release Notes](docs-content://release-notes/elastic-observability/index.md).

**Elastic Security solution**:
For the Elastic Security 9.2.4 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

**Kibana platform**:
* Fixes `createAuditEvents` always returning failure as the outcome [#247152]({{kib-pull}}247152).

**Kibana security**:
* Adds case sensitivity to the index privileges fields on the **Edit roles** page [#246069]({{kib-pull}}246069).

**Machine Learning**:
* Disables field statistics for ES|QL with TS command [#247641]({{kib-pull}}247641).
* Fixes the display of map view in Data Visualizer for small screen sizes [#247615]({{kib-pull}}247615).
* Fixes an issue with queries getting malformed in anomaly charts, which was preventing the charts from rendering [#246841]({{kib-pull}}246841).

**Platform**:
* Unifies the flow for clients partially and fully authorized to saved objects, and applies the intersection of allowed and authorized lists [#244967]({{kib-pull}}244967).

**Search**:
* Fixes an issue where users running {{es}} with basic licenses would encounter errors when updating index mappings. Now, the Machine Learning saved object check will only run if saving semantic text mapping [#248462]({{kib-pull}}248462).

## 9.2.3 [kibana-9.2.3-release-notes]

% ::::{NOTE}
% ::::


### Features and enhancements [kibana-9.2.3-features-enhancements]

**Data ingestion and Fleet**:
* Adds the background task `FleetPolicyRevisionsCleanupTask` which removes excess policy revisions from the `.fleet-policies` index [#242612]({{kib-pull}}242612).

**Kibana platform**:
* The **API keys** management page now defaults to showing personal API keys only [#245261]({{kib-pull}}245261).
* Adds a warning when deleting API keys currently used by alerting rules [#243353]({{kib-pull}}243353).


### Fixes [kibana-9.2.3-fixes]

**Alerting**:
* Fixes an issue that caused the Security alerts table to not update columns correctly when switching view modes [#245253]({{kib-pull}}245253).
* Adds `consecutiveMatches` to action context [#244997]({{kib-pull}}244997).

**Discover**:
* Fixes an issue with Discover tabs that occurs when navigating to a different tab while the previous tab is still initializing [#245752]({{kib-pull}}245752).
* Fixes Discover's trace waterfall behavior with duplicate spans [#244984]({{kib-pull}}244984).

**Elastic Observability solution**:
For the Elastic Observability 9.2.3 release information, refer to [Elastic Observability Solution Release Notes](docs-content://release-notes/elastic-observability/index.md).

**Elastic Security solution**:
For the Elastic Security 9.2.3 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

**Kibana platform**:
* Fixes "now" and mixed-format date handling in the **Share** menu [#245539]({{kib-pull}}245539).
* Fixes an issue with authentication when multiple OIDC providers are configured [#243869]({{kib-pull}}243869).
* Fixes an ECS incompatibility with the `kibana_started.elasticsearch.waitTime` value in logs [#245706]({{kib-pull}}245706).
* Fixes the serialization of `meta.error` in JSON layouts. If it is an `Error` instance, only `message`, `name`, and `stack` are included. Other fields are no longer returned in the logs [#244364]({{kib-pull}}244364).
* Fixes JVM metric conflicts with explicit cast [#244151]({{kib-pull}}244151).


## 9.2.2 [kibana-9.2.2-release-notes]

% ::::{NOTE}
% ::::


### Features and enhancements [kibana-9.2.2-features-enhancements]

**Elastic Observability solution**:
For the Elastic Observability 9.2.2 release information, refer to [Elastic Observability Solution Release Notes](docs-content://release-notes/elastic-observability/index.md).

**Elastic Security solution**:
For the Elastic Security 9.2.2 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).


### Fixes [kibana-9.2.2-fixes]

**Alerting and cases**:
* Captures connector errors without interrupting the case creation flow. Issues with connectors can be resolved on the case details page [#244188]({{kib-pull}}244188).
* Improves error message for {{ibm-r}} connector failing to create an incident [#244012]({{kib-pull}}244012).
* Fixes auto-extraction of observables when alerts are added to a case using the bulk actions menu [#242325]({{kib-pull}}242325).
* Fixes pagination for the **Alerts** table, which was getting stuck on rule details pages [#242275]({{kib-pull}}242275).

**Dashboards and Visualizations**:
* Uses `max_value` instead of `infinity` for the default maximum height of a panel [#243572]({{kib-pull}}243572).
* Fixes issue with saving dashboards after changing the dashboard link to an external link [#243134]({{kib-pull}}243134).
* Fixes error that occurs when you deselect the **(blank)** option from the filter controls menu [#242036]({{kib-pull}}242036).

**Data ingestion and Fleet**:
* Uses long expiration for upgrading agents [#243443]({{kib-pull}}243443).
* Fixes retrying agents stuck in auto-upgrade logic [#243326]({{kib-pull}}243326).
* Adds retry behavior for `/api/fleet/agents` when transient issues with {{es}} are encountered [#243105]({{kib-pull}}243105).
* Fixes Docker image in the **Add agent** Kubernetes manifest [#242691]({{kib-pull}}242691).

**Discover**:
* Fixes truncation for longer text in the Discover table [#241440]({{kib-pull}}241440).

**Elastic Observability solution**:
For the Elastic Observability 9.2.2 release information, refer to [Elastic Observability Solution Release Notes](docs-content://release-notes/elastic-observability/index.md).

**Elastic Security solution**:
For the Elastic Security 9.2.2 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

**Kibana platform**:
* Fixes the production build favicon's CSS specificity [#243351]({{kib-pull}}243351).
* Fixes an issue on the **Index management** page where screen reader text was different from visible text [#243802]({{kib-pull}}243802).
* Fixes an issue with keyboard focus getting trapped on pages using document preview [#243791]({{kib-pull}}243791).

**Machine Learning**:
* Ensures deleted text in AI connector or Inference endpoint forms is not sent as empty strings [#244059]({{kib-pull}}244059).
* Fixes data views showing runtime fields twice [#242557]({{kib-pull}}242557).
* Fixes import and improves validation for Anomaly Detection and Data Frame Analytics jobs [#242263]({{kib-pull}}242263).

**Search**:
* Turns off custom suggestions on embedded console [#241516]({{kib-pull}}241516).

## 9.2.1 [kibana-9.2.1-release-notes]

% ::::{NOTE}
% ::::


### Features and enhancements [kibana-9.2.1-features-enhancements]

**{{product.kibana}} platform**:
* The `defaultRoute` advanced setting now controls the target of the Elastic logo link for spaces using a solution view [#241571]({{kib-pull}}241571).
* Enforces the `object_src 'none'` directive in {{product.kibana}}'s Content Security Policy and introduces a new `csp.object_src` configuration option to control its behavior [#241029]({{kib-pull}}241029).

**Machine Learning**:
* Improves layout wrapping in the **Overview** and **Notifications** tabs on the {{product.machine-learning}} Overview page [#239113]({{kib-pull}}239113).


### Fixes [kibana-9.2.1-fixes]

**Alerting**:
* Fixes missing accessibility announcements in Cases [#240132]({{kib-pull}}240132).

**Dashboards and visualizations**:
* Fixes an issue where references were being lost in Links, Maps, and legacy Visualize panels when updating a dashboard [#241893]({{kib-pull}}241893).
* Fixes layout issues for markdown content in small panels [#240806]({{kib-pull}}240806).

**Data ingestion and Fleet**:
* Shows warnings in the integrations synchronization UI when referencing other entities [#241623]({{kib-pull}}241623).
* Adds proxy SSL options to download sources [#241115]({{kib-pull}}241115).
* Omits system properties when syncing ingest pipelines [#241096]({{kib-pull}}241096).
* Fixes Fleet policy name uniqueness not being consistently enforced across spaces when name or space changes occur [#239631]({{kib-pull}}239631).

**{{esql}} editor**:
* Fixes the autocomplete suggestion of time series sources in `TS` commands after a comma [#241402]({{kib-pull}}241402).

**{{product.observability}} solution**:
For the {{product.observability}} 9.2.1 release information, refer to [{{product.observability}} Solution Release Notes](docs-content://release-notes/elastic-observability/index.md).

**{{product.security}} solution**:
For the {{product.security}} 9.2.1 release information, refer to [{{product.security}} Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

**{{product.kibana}} platform**:
* Ensures all authentication fields show up correctly when setting up an AI connector [#240913]({{kib-pull}}240913).

**Search**:
* Fixes an issue with Agents and Playground icons not rendering correctly in the {{product.elasticsearch}} solution side navigation when using dark mode [#240475]({{kib-pull}}240475).

## 9.2.0 [kibana-9.2.0-release-notes]

### Features and enhancements [kibana-9.2.0-features-enhancements]

**Navigation and general interface**:
* Enhanced navigation menu for spaces that use a solution view. The new navigation experience provides more workspace for your data with an improved collapsed mode, hover menus, and responsiveness.
* New Data Management menu. For easier access to data-related management tasks, you can now find Fleet, Index Management, Integrations, and Ingest Pipelines in a dedicated menu next to the Stack Management menu that previously hosted these pages.
* {{kib}} is now available in German in Beta. To get started, set the locale in your {{kib}} settings as follows: `i18n.locale: de-DE`. If you find any issues, please raise them on [Github](https://github.com/elastic/kibana/issues) [#236903]({{kib-pull}}236903).
* Adds a table list view mode to the space selection screen for a more scalable design when a user has access to many spaces [#229046]({{kib-pull}}229046).

**Alerting**:
* Enables incremental human-readable case IDs [#238555]({{kib-pull}}238555).
* Create case analytics indexes per solution per space [#234125]({{kib-pull}}234125).
* Shows thumbnail image of attached case file [#226004]({{kib-pull}}226004).
* Adds a new Jira Service Management connector [#235408]({{kib-pull}}235408).
* Adds `xpack.actions.email.recipient_allowlist` alert action setting, which lets you specify a list of allowed email recipient patterns (`to`, `cc`, or `bcc`) that can be used with email connectors [#220058]({{kib-pull}}220058).
* Adds support for OAuth 2.0 authentication to the Webhook connector [#218442]({{kib-pull}}218442).
* Allows you to specify additional fields for the IBM Resilient connector [#236144]({{kib-pull}}236144).
* Maintenance windows are now generally available [#233870]({{kib-pull}}233870).
* Adds support for encrypted headers in the Webhook connector [#233695]({{kib-pull}}233695).
* Automatically copies source data into the alerts-as-data documents for other {{es}} query rule types [#230010]({{kib-pull}}230010).
* You can now add filters to maintenance windows based on alert fields from all solutions, without needing to select a category first [#227888]({{kib-pull}}227888).

**Dashboards and Visualizations**:
* Adds the ability to configure index settings when importing geospatial files in Maps [#232308]({{kib-pull}}232308).
* Adds a new inline Markdown editor to edit your text without leaving the dashboard. [#229191]({{kib-pull}}229191).
* Updates the toolbar popover for Metric charts, which is now called **Appearance**, with reorganized settings into clearer sections and new Primary position, Primary alignment, Secondary alignment, and Font weight settings [#233992]({{kib-pull}}233992).
* Improves ES|QL suggestions logic when an {{esql}} visualization query changes [#231767]({{kib-pull}}231767).
* Adds a new **Add** menu to the toolbar that lets you populate your dashboard with visualizations, panels, sections, and controls. This menu replaces and combines the various buttons that previously allowed you to perform these actions [#230324]({{kib-pull}}230324).
* Improves perceived performance of dashboard flyouts [#226052]({{kib-pull}}226052).
* Adds the ability to **Select all** to Options list controls [#221010]({{kib-pull}}221010).

**Data ingestion and Fleet**:
* Adds a toggle on the {{es}} output configuration page that grants agents permission to write to the `logs` and `logs.*` data streams [#233374]({{kib-pull}}233374).
* Completes OTel configuration pipelines with an exporter [#233090]({{kib-pull}}233090).
* Enables feature to auto-install content packages when data is ingested for datasets that match the datasets defined in the packages' `discovery` fields [#232668]({{kib-pull}}232668).
* Adds a new `MIGRATE` action type for migrating agents to a different cluster [#239556]({{kib-pull}}239556).
* Adds the `MIGRATE` action to the `SIGNED_ACTIONS` set [#228566]({{kib-pull}}228566).
* Adds a **Show agentless resources** toggle on the Fleet > Settings page to allow for troubleshooting and diagnostics [#237528]({{kib-pull}}237528).
* Updates the maximum supported version of package spec to 3.5 [#235942]({{kib-pull}}235942).
* Enables the installation of `alerting_rule_template` {{kib}} assets from packages; also enables a background task for reporting agent status changes in {{fleet}} [#235842]({{kib-pull}}235842).
* Adds a filter on the Integrations page to show only agentless integrations [#235686]({{kib-pull}}235686).
* Adds support for a new `url` variable type in {{fleet}} packages which provides better input validation of URLs in configurations [#231062]({{kib-pull}}231062).
* Adds support for a new `duration` variable type in {{fleet}} packages which provides better input validation of duration strings in configurations [#231027]({{kib-pull}}231027).
* Renders the accordion for sample events on the integration overview page as collapsed by default [#228799]({{kib-pull}}228799).
* Hides metrics data streams and packages on Logs Essentials projects [#227842]({{kib-pull}}227842).
* Adds a package rollback API [#226754]({{kib-pull}}226754).
* Adds support for the `keep` option in the Remove processor in ingest pipelines [#225638]({{kib-pull}}225638).
* Adds the **Add / remove tags** action on the agent details page [#225433]({{kib-pull}}225433).

**Discover**:
* You can now manage multiple data explorations simultaneously in Discover using tabs. Navigate between them seamlessly, duplicate them to build on previous queries, and save them into a single Discover session to retrieve your queries, filters, and configurations untouched at a later time [#235150]({{kib-pull}}235150).
* You can now send long-running queries to the background. When a query runs in the background, you can perform other queries and tasks, then open it later from a new Background searches flyout to view cached results. This feature is in technical preview and disabled by default in this release. Check [this page](docs-content://explore-analyze/discover/background-search.md) for instructions [#236818]({{kib-pull}}236818).
* Improves Discover’s {{esql}} LOOKUP JOIN experience with an index editor flyout supporting inline editing, and CSV import [#232686]({{kib-pull}}232686).
* You can now add variable controls to your {{esql}} queries in Discover just like for your {{esql}} visualizations in Dashboards [#229598]({{kib-pull}}229598).
* Adds related errors count and failure badge when exploring traces in Discover [#227413]({{kib-pull}}227413).
* Shows logs related to the current document when exploring traces in Discover [#232784]({{kib-pull}}232784).
* Adds a warning when navigating away from Discover with unsaved changes [#225252]({{kib-pull}}225252).
* Adds the ability to view the currently active profiles, such as the detected solution and data source contexts, which determine Discover's context-aware experiences [#222999]({{kib-pull}}222999).
* Appends the casting only when necessary in Discover's {{esql}} mode filtering [#234748]({{kib-pull}}234748).
* Removes the default limit of `10` added to the query base query when switching to {{esql}} mode in Discover [#234349]({{kib-pull}}234349).

**{{esql}} editor**:
* Extends the {{esql}} query history size to 50 KB, which represents between 200 to 300 queries instead of 20 [#232955]({{kib-pull}}232955).
* Adds support for lookup indices from remote clusters [#232907]({{kib-pull}}232907).
* The {{esql}} autocomplete feature has been extended so that fields from the selected lookup index are suggested when using the `LOOKUP JOIN` command. The same enhancement was applied to column suggestions when using the `ENRICH` command [#233221]({{kib-pull}}233221).
* Improves function validation [#230139]({{kib-pull}}230139).
* Adds support for expressions in the STATS command [#229513]({{kib-pull}}229513).
* Enhances GROK semantics extraction with Onigurama regex patterns [#229409]({{kib-pull}}229409).
* Adds a **Prettify** button that formats queries to make them more readable [#228159]({{kib-pull}}228159).
* Displays function license requirements in the in-product {{esql}} help reference [#229961]({{kib-pull}}229961).

**Elastic Observability solution**:
For the Elastic Observability 9.2.0 release information, refer to [Elastic Observability Solution Release Notes](docs-content://release-notes/elastic-observability/index.md).

**Elastic Security solution**:
For the Elastic Security 9.2.0 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

**Machine Learning**:
* Sets the default retention period for results from the logs anomaly detection configurations to 120 days [#231080]({{kib-pull}}231080).
* Redesigns the file upload UX and adds the ability to upload multiple files and existing indices [#232923]({{kib-pull}}232923).
* Adds a **GenAI Settings** page to **Stack Management** that lets you manage AI feature access for your deployment [#227289]({{kib-pull}}227289), [#233727]({{kib-pull}}233727).
* Introduces a new connector in technical preview, the AI Connector, which provides a single interface for connecting to a range of large language model providers [#235166]({{kib-pull}}235166), [#236951]({{kib-pull}}236951), [#228116]({{kib-pull}}228116).
* Inference endpoints UI: Adds tech preview for e5 preconfig endpoint [#234811]({{kib-pull}}234811).
* Inference endpoints UI: Adds tech preview for rerank preconfig endpoint [#235222]({{kib-pull}}235222).
* Improves the layout for custom URLs list in the data frame analytics form [#232575]({{kib-pull}}232575).
* AI Connector/Inference endpoints creation UI: Adds icon for AI21 labs and Llama Stack [#232098]({{kib-pull}}232098).
* Ensures ELSER and E5 product docs are appropriately updated when Kibana is upgraded [#231884]({{kib-pull}}231884).
* Improves layout for custom URLs when creating a {{ml}} job [#231751]({{kib-pull}}231751).
* Adds a check to validate whether your newly uploaded index is searchable [#231614]({{kib-pull}}231614).
* Displays document count chart for ES|QL categorize queries [#231459]({{kib-pull}}231459).
* UX enhancements for editing fields in the AI Connector flyout [#231037]({{kib-pull}}231037).

**Kibana platform and management**:
* Data views managed by Elastic are now clearly identified in the UI. You can no longer edit them and instead have to duplicate them to apply any changes while preserving the original data view [#223451]({{kib-pull}}223451).
* Adds an option to convert an index to a lookup index [#233998]({{kib-pull}}233998).
* The Console introduction tour is now disabled by default. You can manually start the tour at any time from the Help popover [#227978]({{kib-pull}}227978).
* Improves the rate-limiter UX [#227678]({{kib-pull}}227678).

**Elasticsearch solution**:
* [Agent Builder](docs-content://solutions/search/elastic-agent-builder.md) is now available in technical preview. Build custom agents and tools to explore your Elastic data using natural language, in real time or programmatically using MCP, A2A, or REST APIs. You must [enable the feature](docs-content://solutions/search/agent-builder/get-started.md#enable-agent-builder) to get started.
* Adds the ability to save Playgrounds within a space [#229511]({{kib-pull}}229511).
* Improves code examples in the Synonyms interface [#235944]({{kib-pull}}235944).


### Fixes [kibana-9.2.0-fixes]

**Alerting**:
* Fetches the tracked alerts without depending on the task state [#235253]({{kib-pull}}235253).
* Fixes an issue that prevented the query field from properly loading in the rule request if you used a saved query [#229964]({{kib-pull}}229964).

**Dashboards and Visualizations**:
* Null buckets and empty string values are now rendered in the UI as `(missing value)` and `(empty)` respectively. This is now aligned across charts and tables, including Discover and Lens charts [#233369]({{kib-pull}}233369).
* Skips automatic scroll when interacting with a panel that is already visible [#233226]({{kib-pull}}233226).
* Shows solid panel borders when a dashboard is in **View** mode [#232676]({{kib-pull}}232676).
* Fixes error handling when saving a Links panel to the library from a dashboard [#231168]({{kib-pull}}231168).
* Logs a warning instead of throwing an error if a filter and query state can not be read or written due to missing or malformed references [#230088]({{kib-pull}}230088).

**Data ingestion and Fleet**:
* Fixes "package not found" error when skipping cloud onboarding for a prerelease package [#238629]({{kib-pull}}238629).

**Discover**:
* Fixes an issue with the data view creation flyout that could glitch when accessed from a separate page [#228749]({{kib-pull}}228749).

**{{esql}} editor**:
* Fixes controls' trigger across various commands [#236121]({{kib-pull}}236121).
* Fixes lookup index route failures on read permissions [#233282]({{kib-pull}}233282).
* Fixes an issue on Firefox where the {{esql}} inline editor could prevent scrolling [#228849]({{kib-pull}}228849).

**Elastic Observability solution**:
For the Elastic Observability 9.2.0 release information, refer to [Elastic Observability Solution Release Notes](docs-content://release-notes/elastic-observability/index.md).

**Elastic Security solution**:
For the Elastic Security 9.2.0 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

**Machine Learning**:
* Adds unique accessible labels for the **Show top field values** buttons on the **Log Rate Analysis** page [#237972]({{kib-pull}}237972).
* Single Metric Viewer: fixes partition field settings errors in the dashboard panel [#237046]({{kib-pull}}237046).
* Escapes URL-like string from being displayed as links in email clients [#226849]({{kib-pull}}226849).

**Search**:
* Fixes an accessibility issue where resetting changes or removing all terms in the Synonyms panel was not announced by screen readers. VoiceOver users on Safari will now hear updates when terms are reset [#237877]({{kib-pull}}237877).
* Fixes an issue with a null property being read in Playground [#230729]({{kib-pull}}230729).

## 9.1.10 [kibana-9.1.10-release-notes]

% ::::{NOTE}
% ::::


### Features and enhancements [kibana-9.1.10-features-enhancements]

**Elastic Observability solution**:
For the Elastic Observability 9.1.10 release information, refer to [Elastic Observability Solution Release Notes](docs-content://release-notes/elastic-observability/index.md).

**Elastic Security solution**:
For the Elastic Security 9.1.10 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).


### Fixes [kibana-9.1.10-fixes]

**Alerting and cases**:
* Adds maximum character validation to the email connector params and configuration [#246453]({{kib-pull}}246453).
* Adds encoding to search terms in the **Cases** page to prevent decoding errors [#247992]({{kib-pull}}247992).

**Dashboards and Visualizations**:
* Fixes compound filters showing unsaved changes on dashboard load [#247309]({{kib-pull}}247309).

**Elastic Observability solution**:
For the Elastic Observability 9.1.10 release information, refer to [Elastic Observability Solution Release Notes](docs-content://release-notes/elastic-observability/index.md).

**Elastic Security solution**:
For the Elastic Security 9.1.10 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

**Kibana platform**:
* Fixes `createAuditEvents` always returning failure as the outcome [#247152]({{kib-pull}}247152).

**Kibana security**:
* Adds case sensitivity to the index privileges fields on the **Edit roles** page [#246069]({{kib-pull}}246069).

**Machine Learning**:
* Fixes the display of map view in Data Visualizer for small screen sizes [#247615]({{kib-pull}}247615).

**Platform**:
* Unifies the flow for clients partially and fully authorized to saved objects, and applies the intersection of allowed and authorized lists [#244967]({{kib-pull}}244967).

**Search**:
* Fixes an issue where users running {{es}} with basic licenses would encounter errors when updating index mappings. Now, the Machine Learning saved object check will only run if saving semantic text mapping [#248462]({{kib-pull}}248462).

## 9.1.9 [kibana-9.1.9-release-notes]

% ::::{NOTE}
% ::::


### Features and enhancements [kibana-9.1.9-features-enhancements]

**Data ingestion and Fleet**:
* Adds the background task `FleetPolicyRevisionsCleanupTask` which removes excess policy revisions from the `.fleet-policies` index [#242612]({{kib-pull}}242612).

**Kibana platform**:
* The **API keys** management page now defaults to showing personal API keys only [#245261]({{kib-pull}}245261).
* Adds a warning when deleting API keys currently used by alerting rules [#243353]({{kib-pull}}243353).


### Fixes [kibana-9.1.9-fixes]

**Alerting**:
* Fixes an issue that caused the Security alerts table not to update columns correctly when switching view modes [#245253]({{kib-pull}}245253).
* Adds `consecutiveMatches` to action context [#244997]({{kib-pull}}244997).

**Elastic Observability solution**:
For the Elastic Observability 9.1.9 release information, refer to [Elastic Observability Solution Release Notes](docs-content://release-notes/elastic-observability/index.md).

**Elastic Security solution**:
For the Elastic Security 9.1.9 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

**Kibana platform**:
* Fixes "now" and mixed-format date handling in the **Share** menu [#245539]({{kib-pull}}245539).
* Fixes an issue with authentication when multiple OIDC providers are configured [#243869]({{kib-pull}}243869).
* Fixes an ECS incompatibility with the `kibana_started.elasticsearch.waitTime` value in logs [#245706]({{kib-pull}}245706).
* Fixes the serialization of `meta.error` in JSON layouts: if the error is an `Error` instance, only `message`, `name`, and `stack` are included. Other fields are no longer returned in the logs [#244364]({{kib-pull}}244364).

**Machine Learning**:
* Hiding the alerts table popover no longer clears the cell selection in Anomaly Explorer [#244183]({{kib-pull}}244183).


## 9.1.8 [kibana-9.1.8-release-notes]

% ::::{NOTE}
% ::::


### Features and enhancements [kibana-9.1.8-features-enhancements]

**Elastic Observability solution**:
For the Elastic Observability 9.1.8 release information, refer to [Elastic Observability Solution Release Notes](docs-content://release-notes/elastic-observability/index.md).

**Elastic Security solution**:
For the Elastic Security 9.1.8 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).


### Fixes [kibana-9.1.8-fixes]

**Alerting and cases**:
* Captures connector errors without interrupting the case creation flow. Issues with connectors can be resolved on the case details page  [#244188]({{kib-pull}}244188).
* Fixes pagination for the **Alerts** table, which was getting stuck on rule details pages [#242275]({{kib-pull}}242275).
* Fetches tracked alerts without depending on the task state [#235253]({{kib-pull}}235253).

**Dashboards and Visualizations**:
* Fixes error that occurs when you deselect the **(blank)** option from the filter controls menu [#242036]({{kib-pull}}242036).

**Data ingestion and Fleet**:
* Uses long expiration for upgrading agents [#243443]({{kib-pull}}243443).
* Fixes retrying agents stuck in auto-upgrade logic [#243326]({{kib-pull}}243326).
* Adds retry behavior for `/api/fleet/agents` when transient issues with {{es}} are encountered [#243105]({{kib-pull}}243105).
* Fixes Docker image in the **Add agent** Kubernetes manifest [#242691]({{kib-pull}}242691).
* Fixes {{fleet}} policy name uniqueness not being consistently enforced across spaces when name or space changes occur [#239631]({{kib-pull}}239631).
* Fixes `ignore_above` mapping for `flattened` fields [#238890]({{kib-pull}}238890).

**Elastic Observability solution**:
For the Elastic Observability 9.1.8 release information, refer to [Elastic Observability Solution Release Notes](docs-content://release-notes/elastic-observability/index.md).

**Elastic Security solution**:
For the Elastic Security 9.1.8 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

**Kibana platform**:
* Fixes the production build favicon's CSS specificity [#243351]({{kib-pull}}243351).
* Fixes an issue on the **Index management** page where screen reader text was different from visible text [#243802]({{kib-pull}}243802).
* Fixes an issue with keyboard focus getting trapped on pages using document preview [#243791]({{kib-pull}}243791).

**Machine Learning**:
* Ensures deleted text in AI connector or Inference endpoint forms is not sent as empty strings [#244059]({{kib-pull}}244059).
* Fixes import and improves validation for Anomaly Detection and Data Frame Analytics jobs [#242263]({{kib-pull}}242263).

## 9.1.7 [kibana-9.1.7-release-notes]

% ::::{NOTE}
% ::::


### Features and enhancements [kibana-9.1.7-features-enhancements]

**Machine Learning**:
* Adds a feedback button to Anomaly Explorer and Single Metric Viewer [#239883]({{kib-pull}}239883).


### Fixes [kibana-9.1.7-fixes]

**Alerting**:
* In Cases, tables no longer flash when the page is loading [#240155]({{kib-pull}}240155).
* Fixes an infinite loop issue occurring when the Investigation guide of a rule's details is too long [#240472]({{kib-pull}}240472).

**Dashboards and visualizations**:
* Labels in Maps' **Create index** flow now render with the default **Use vector tiles** scaling as soon as label styling is applied (or after saving), without requiring a scaling toggle [#240728]({{kib-pull}}240728).
* Fixes an issue occurring when resetting a dashboard with unsaved changes after enabling `timeRestore` and setting a time range [#239992]({{kib-pull}}239992).

**Data ingestion and Fleet**:
* Shows warnings in the integrations synchronization UI when referencing other entities [#241623]({{kib-pull}}241623).
* Adds proxy SSL options to download sources [#241115]({{kib-pull}}241115).
* Fixes Fleet policy name uniqueness not being consistently enforced across spaces when name or space changes occur [#239631]({{kib-pull}}239631).

**{{product.kibana}} platform**:
* Ensures that the `max_tokens` parameter is correctly passed as expected when connecting to Anthropic [#241212]({{kib-pull}}241212) & [#241188]({{kib-pull}}241188).
* Removes the default fallback region for the Amazon Bedrock connector [#241157]({{kib-pull}}241157).

**{{product.observability}} solution**:
For the {{product.observability}} 9.1.7 release information, refer to [{{product.observability}} Solution Release Notes](docs-content://release-notes/elastic-observability/index.md).

**{{product.security}} solution**:
For the {{product.security}} 9.1.7 release information, refer to [{{product.security}} Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

**Machine Learning**:
* Ensures that the inference endpoints list loads properly even when using a custom inference provider [#240189]({{kib-pull}}240189).

## 9.1.6 [kibana-9.1.6-release-notes]

% ::::{NOTE}
% ::::


### Features and enhancements [kibana-9.1.6-features-enhancements]

**Data ingestion and Fleet**:
* Replaces the `?showAgentless` query param with a local storage setting called `fleet:showAgentlessResources`, which can be toggled from the {{fleet}} settings page. When enabled, agentless agents and policies are visible in the {{fleet}} UI [#237528]({{kib-pull}}237528).

**Elastic Security solution**:
For the Elastic Security 9.1.6 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

**Kibana security**:
* Enhances error message by explaining why the role is considered malformed [#239098]({{kib-pull}}239098).


### Fixes [kibana-9.1.6-fixes]

**Dashboards and Visualizations**:
* Fixes an issue that prevented you from deleting unsaved dashboard changes after you had enabled the `timeRestore` setting and selected a time and date using the date picker [#239992]({{kib-pull}}239992).
* Fixes error that occured when you selected a blank value in the options list [#239791]({{kib-pull}}239791).
* Fixes an issue in Lens that incorrectly assigned unsaved, ad-hoc dataview references [#239431]({{kib-pull}}239431).
* Fixes metric color assignment when breakdown and a max dimension are defined in Lens [#238901]({{kib-pull}}238901).
* Ensures adhoc dataviews from {{esql}} charts aren't being filtered out in the KQL search bar [#238731]({{kib-pull}}238731).

**Data ingestion and Fleet**:
* Fixes an issue that occured during an integration policy upgrade that prevented the new package global variables from being included and stale variable references from being removed [#238542]({{kib-pull}}238542).

**Discover**:
* Ensures that the combined filters are considered when selecting the correct fields for the query while the `courier:ignoreFilterIfFieldNotInIndex` advanced setting is enabled [#238945]({{kib-pull}}238945).

**Elastic Observability solution**:
For the Elastic Observability 9.1.6 release information, refer to [Elastic Observability Solution Release Notes](docs-content://release-notes/elastic-observability/index.md).

**Elastic Security solution**:
For the Elastic Security 9.1.6 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

**Search**:
* Fixes visual issues with the document metadata popup that happened when the document ID was too long. Also adds a tooltip and copy button to improve the user experience [#239768]({{kib-pull}}239768).

## 9.1.5 [kibana-9.1.5-release-notes]

:::{important}
The 9.1.5 release contains fixes for potential security vulnerabilities. Check our [security advisory](https://discuss.elastic.co/c/announcements/security-announcements/31) for more details.
:::



### Features and enhancements [kibana-9.1.5-features-enhancements]

**Data ingestion and Fleet**:
* Renames Fleet Server SSL options for clarity in the **Add a Fleet Server** flyout [#236887]({{kib-pull}}236887).

**Elastic Security solution**:
For the Elastic Security 9.1.5 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

### Fixes [kibana-9.1.5-fixes]

**Alerting**:
* Rolls over the reporting data stream if its template version is newer than the version in the data stream's mappings [#234119]({{kib-pull}}234119).

**Dashboards and Visualizations**:
* Fixes an issue where the dashboard title would not get updated in the breadcrumb when edited from the list of dashboards [#236561]({{kib-pull}}236561).
* Updates dashboards to wait until controls are ready before rendering panels to prevent a double fetch of data [#237169]({{kib-pull}}237169).
* Fixes an issue with the Lens table's column sort order being different in the dashboard and the exported CSV [#236673]({{kib-pull}}236673).

**Data ingestion and Fleet**:
* Fixes text kerning issues in PDF/PNG exports of dashboards and visualizations [#235516]({{kib-pull}}235516).
* Fixes incorrect copying of SSL settings to the Fleet Hosts section of generated Agent policies [#236788]({{kib-pull}}236788).
* Validates the Logstash pipeline ID at the {{kib}} API level [#236347]({{kib-pull}}236347).
* Adds a unique count to improve accuracy of the number of transforms on the integrations overview page [#236177]({{kib-pull}}236177).
* Fixes malformed synthetics package policies [#236176]({{kib-pull}}236176).

**Discover**:
* Clears sort by `timestamp` when navigating from classic to ES|QL mode [#235338]({{kib-pull}}235338).
* Fixes sizing issues with the **Actions** column header [#235227]({{kib-pull}}235227).

**Kibana security**:
* Allows `xpack.spaces.defaultSolution` to be configured through environment variables for Docker deployments [#236570]({{kib-pull}}236570).

**Machine Learning**:
* Omits fields that should not be included in datafeed preview requests when testing custom URLs in anomaly detection jobs [#234709]({{kib-pull}}234709).
* Improves trained model performance by adding filters to the request to fetch all index settings [#237072]({{kib-pull}}237072).
* Hides the show forecast checkbox when selecting a new job in the Single Metric Viewer [#236724]({{kib-pull}}236724).
* Makes alerts visible in Anomaly Explorer to all Machine Learning-only users regardless of where they create rules [#236289]({{kib-pull}}236289).
* Fixes the **Job details** flyout on the **Analytics Map** page [#236131]({{kib-pull}}236131).
* Fixes rendering of the dashboard panel in PDF reporting for the Anomaly Swim Lane [#235475]({{kib-pull}}235475).
* Limits log rate analysis category requests to reduce `msearch` usage [#235611]({{kib-pull}}235611).

**Management**:
* Adds the `managed` field to the data views response schema to prevent the public API call from failing [#236237]({{kib-pull}}236237).
* Adds the `timeFieldName` field to the data views response schema to prevent the public API call from failing [#235975]({{kib-pull}}235975).
* Fixes privilege requirements when reindexing indices through Upgrade Assistant. Previously, the `superuser` role was required, but now the `cluster: manage` and `all` privileges are sufficient [#237055]({{kib-pull}}237055).

**Stack Management**:
* Adds the ability to do partial matches and searches in the **API keys** section [#221959]({{kib-pull}}221959).

**Search solution**:
* Adds search functionality to the **Query rules** details page [#232579]({{kib-pull}}232579).

## 9.1.4 [kibana-9.1.4-release-notes]

% ::::{NOTE}
% ::::


### Features and enhancements [kibana-9.1.4-features-enhancements]

**Elastic Observability solution**:
For the Elastic Observability 9.1.4 release information, refer to [Elastic Observability Solution Release Notes](docs-content://release-notes/elastic-observability/index.md).

**Stack management**
* Adds IPv6 support to remote clusters address fields [#233415]({{kib-pull}}233415).


### Fixes [kibana-9.1.4-fixes]

**Dashboards and Visualizations**:
* Fixes an issue with the Save modal that allowed duplicate saves of dashboards, visualizations, and other objects when clicking the **Save** button multiple times [#233933]({{kib-pull}}233933).

**Elastic Security solution**:
For the Elastic Security 9.1.4 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

**Machine Learning**:
* The **Run** button is now properly disabled in Elastic Managed LLM tests when the action's JSON body isn't valid [#231873]({{kib-pull}}231873).

## 9.1.3 [kibana-9.1.3-release-notes]

:::{important}
The 9.1.3 release contains fixes for potential security vulnerabilities. Check our [security advisory](https://discuss.elastic.co/c/announcements/security-announcements/31) for more details.
:::

### Fixes [kibana-9.1.3-fixes]

**Alerting**:
* Fixes an issue that prevents reports from showing in the Reporting UI when they're created in a non-default {{kib}} space with a dash in its name [#230876]({{kib-pull}}230876).

**Dashboards and Visualizations**:
* Fixes an issue in Lens that caused color mapping changes to render as gray [#231563]({{kib-pull}}231563).
* Fixes broken references that occured when you returned to an unsaved dashboard with reference panels [#231517]({{kib-pull}}231517).

**Data ingestion and Fleet**:
* Fixes the `deployment_modes` evaluation for policy templates when creating a package policy. When deploying in agentless mode, this prevents the acceptance of inputs from policy templates that are not opted into the agentless mode at the template level [#231679]({{kib-pull}}231679).

**Discover**:
* Disables sorting for JSON-like fields in ES|QL mode [#231289]({{kib-pull}}231289).

**Elastic Observability solution**:
For the Elastic Observability 9.1.3 release information, refer to [Elastic Observability Solution Release Notes](docs-content://release-notes/elastic-observability/index.md).

**Elastic Security solution**:
For the Elastic Security 9.1.3 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

**Kibana platform**:
* Fixes an issue where the schedule interval of the cleanup task for unused URLs wouldn't update if the `share.url_expiration.duration` changed [#231883]({{kib-pull}}231883).
* Updates the built-in `reporting_user` role to leverage a new  `reporting_user` reserved privilege [#231533]({{kib-pull}}231533).

## 9.1.2 [kibana-9.1.2-release-notes]


### Fixes [kibana-9.1.2-fixes]

**Alerting**:
* Fixes an issue that prevents reports from showing in the Reporting UI when they're created in a non-default {{kib}} space with a dash in its name [#230876]({{kib-pull}}230876).

**Data ingestion and Fleet**:
* Fixes validation for `text` and `password` inputs in the package policy editor [#229932]({{kib-pull}}229932).

**Elastic Observability solution**:
For the Elastic Observability 9.1.2 release information, refer to [Elastic Observability Solution Release Notes](docs-content://release-notes/elastic-observability/index.md).

**Elastic Security solution**:
For the Elastic Security 9.1.2 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

**Kibana platform**:
* Fixes the breadcrumb to include a link to the home page when browsing pages from the **Elasticsearch** section of the navigation [#230270]({{kib-pull}}230270).

## 9.1.1 [kibana-9.1.1-release-notes]

% ::::{NOTE}
% ::::


### Features and enhancements [kibana-9.1.1-features-enhancements]

**Dashboards and Visualizations**:
* Improves usability of dashboards when zooming up to 400% [#228978]({{kib-pull}}228978).
* Adds list options to ES|QL controls in dashboards [#227334]({{kib-pull}}227334).

**Management**:
* Console now uses explicit host selection instead of retrying failed hosts, ensuring predictable behavior and preventing silent request failures. This change fixes an issue in Console where request bodies were lost during automatic host retries. [#229574]({{kib-pull}}229574).


### Fixes [kibana-9.1.1-fixes]

**Dashboards and Visualizations**:
* Fixes incorrect panel rendering when the **Defer loading panels below "the fold"** advanced setting is on [#229662]({{kib-pull}}229662).
* Fixes an issue in reports where a PNG or PDF export would offset and clip part of the visualization in *Lens* [#228603]({{kib-pull}}228603).
* Fixes {{esql}} loading button state for long running queries in *Lens* [#226565]({{kib-pull}}226565).
* Improves the layout and accessibility of the {{esql}} control editor [#228103]({{kib-pull}}228103).

**Data ingestion and Fleet**:
* Fixes an issue where the SSL configuration isn't properly added to agent policies with pre-configured output types [#230211]({{kib-pull}}230211).

**Discover**:
* Fixes an issue where HTML search highlighting markup is incorrectly carried over into filter values when using the **Filter for value** field action in the **Log overview** tab [#227652]({{kib-pull}}227652).


**Elastic Observability solution**:
For the Elastic Observability 9.1.1 release information, refer to [Elastic Observability Solution Release Notes](docs-content://release-notes/elastic-observability/index.md).

**Elastic Security solution**:
For the Elastic Security 9.1.1 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

**Machine Learning**:
* Fixes patterns field selector menu width [#228791]({{kib-pull}}228791).

**Kibana platform**:
* Fixes the breadcrumb to include a link to the home page when browsing pages from the **Elasticsearch** section of the navigation [#230270]({{kib-pull}}230270).


## 9.1.0 [kibana-9.1.0-release-notes]

If you're upgrading to version 9.1.0, you first need to upgrade to version [8.19](https://www.elastic.co/guide/en/kibana/8.19/release-notes-8.19.0.html) or [9.0](#kibana-900-release-notes).

### Features and enhancements [kibana-9.1.0-features-enhancements]

**Alerting**:
* Adds the ability to schedule reports on a recurring basis and view previously scheduled reports [#224849]({{kib-pull}}224849), [#221028]({{kib-pull}}221028).
* Adds the `xpack.actions.email.services.enabled` {{kib}} setting, which allows you to enable or disable email services for email connectors [#223363]({{kib-pull}}223363).
* Adds the `xpack.actions.webhook.ssl.pfx.enabled` {{kib}} setting, which allows you to disable Webhook connector PFX file support for SSL client authentication [#222507]({{kib-pull}}222507).
* Adds the `xpack.actions.email.services.ses.host` {{kib}} setting, which lets you specify the SMTP endpoint for an Amazon Simple Email Service (SES) service provider that can be used by email connectors. Also adds the `xpack.actions.email.services.ses.hostport` {{kib}} setting, which allows you to specify the port number for an Amazon SES service provider that can be used by email connectors [#221389]({{kib-pull}}221389). 
* Adds `rrule` notation support for task scheduling [#217728]({{kib-pull}}217728).
* Publishes new public APIs for the Maintenance Window [#216756]({{kib-pull}}216756).
* Allows you to delete Maintenance Windows [#211399]({{kib-pull}}211399).
* Adds an alert cleanup functionality that allows you to delete active or inactive (acknowledged, recovered, closed, or untracked) alerts with no status update for a period of time [#216613]({{kib-pull}}216613).
* Adds an embeddable panel for dashboards that allows you to show a simplified version of the Alerts table from {{observability}} or {{elastic-sec}} [#216076]({{kib-pull}}216076).
* Ensures the **Reporting** page only shows reports generated in the current space [#221375]({{kib-pull}}221375).
* Moves the rule settings to a flyout [#216162]({{kib-pull}}216162).
* Allows users to delete a snooze schedule from a rule using schedule ID [#213247]({{kib-pull}}213247).
* Allows users to create a snooze schedule for rules using the schedule API [#210584]({{kib-pull}}210584).
* Implements functionality to add observables, procedures, and custom fields to alerts for {{hive}} [#207255]({{kib-pull}}207255).
* Updates the `context.link` variable to use the new Discover URL formatting in all {{es}} query rule types [#216376]({{kib-pull}}216376).

**Dashboards and Visualizations**:
* Adds the **Create alert rule** action to ES|QL dashboard panels, usable from the panel context menu or by right-clicking a data point on the visualization. This rule allows you to generate an alert when the data on the chart crosses a certain threshold [#217719]({{kib-pull}}217719).
* Adds collapsible sections to dashboards that allow you to group panels into logical groups. Collapsible sections also help dashboards load faster by only loading their content when expanded [#220877]({{kib-pull}}220877).
* Adds the ability to mark a dashboard as favorite from within the dashboard in addition to the **Dashboards** page [#201596]({{kib-pull}}201596).
* Adds the ability to resize and move dashboard panels using a keyboard [#208286]({{kib-pull}}208286).
* Adds a highlight effect when adding a panel to a dashboard [#223614]({{kib-pull}}223614).
* Adds the ability to create {{esql}} controls from the dashboard **Controls** menu [#219495]({{kib-pull}}219495).
* Adds the ability to create {{esql}} controls by typing a question mark (`?`) when editing an {{esql}} visualization's query [#216839]({{kib-pull}}216839).
* Allows the creation of dynamic aggregations controls for {{esql}} visualizations [#210170]({{kib-pull}}210170).
* Improves handling of `?_tstart` and `?_tend` named parameters when the {{esql}} visualization's query includes controls [#225054]({{kib-pull}}225054).
* Adds CRUD API routes for Lens [#223296]({{kib-pull}}223296).
* The **Color Mapping** feature is now GA. Previous Lens palette definitions are deprecated and will continue to function normally with no visual change to existing visualizations. Toggling off legacy mode will replace the palette with an equivalent color mapping configuration [#220296]({{kib-pull}}220296).
* Adds **Compare to** badge for Metric charts in Lens [#214811]({{kib-pull}}214811).
* Updates time-based charts to use the multi-layer time axis by default, providing a better time window context and improved label positioning [#210579]({{kib-pull}}210579).
* Enables read-only editor mode to inspect a panel's configuration in Lens [#208554]({{kib-pull}}208554).
* Adds a **Point visibility** option to Area and Line charts in Lens [#222187]({{kib-pull}}222187).
* Adds a setting to control the data table density in Lens [#220252]({{kib-pull}}220252).
* Opens Lens in the same tab when you select **Open in Lens** on a visualization [#217528]({{kib-pull}}217528).
* Adds the ability to open links from Vega visualizations in a new tab by specifying the `"target": "_blank"` option for the `usermeta.embedOptions.loader` property of the Vega chart configuration [#216200]({{kib-pull}}216200).
* Adds globe projection improvements to Maps [#212437]({{kib-pull}}212437).
* When possible, keeps the chart configuration after editing an {{esql}} visualization's query [#210780]({{kib-pull}}210780).

**Data ingestion and Fleet**:
* Adds support for bulk agent migration using the **Bulk actions** menu in the agent list table [#224334]({{kib-pull}}224334).
* Enables the tabular integrations feature in {{fleet}} [#222842]({{kib-pull}}222842).
* Adds support for single agent migration using the **Actions** menu in {{fleet}}. Users can provide a remote cluster URL and enrollment token, as well as customize parameters for the migration [#222111]({{kib-pull}}222111).
* Adds an API endpoint to migrate a single agent to another cluster using a URL and enrollment token. Tamper-protected and {{fleet}}-managed agents are not supported and return a `403` response if attempted [#220601]({{kib-pull}}220601).
* Adds a new integration flyout component [#220229]({{kib-pull}}220229).
* Enables the sync integrations on remote clusters feature in Fleet [#220215]({{kib-pull}}220215).
* Enables the automatic agent upgrades feature in Fleet [#219932]({{kib-pull}}219932).
* Adds edit functionality for custom integration READMEs. Editing a README automatically increments the integration version and updates all associated policies [#215259]({{kib-pull}}215259).
* Adds SSL fields to agent binary source settings [#213211]({{kib-pull}}213211).
* Adds support for Cloud Connectors in CSPM [#212200]({{kib-pull}}212200).
* Exposes SSL options for {{es}} and remote {{es}} outputs in the UI [#208745]({{kib-pull}}208745).
* Adds SSL options to {{fleet}} Server host settings [#208091]({{kib-pull}}208091).
* Adds a new action to add tags from the **Agent details** page [#225433]({{kib-pull}}225433).
* Adds a tooltip to the **Last activity** column in the agent list UI [#224850]({{kib-pull}}224850).
* Adds support for agentless traffic filters [#222082]({{kib-pull}}222082).
* Makes the tag filter in {{fleet}} agents searchable and sorted [#219639]({{kib-pull}}219639).
* Adds a callout to highlight breaking changes during integration upgrades [#217257]({{kib-pull}}217257).
* Adds MSI installer command support for {{fleet}} Server and agents [#217217]({{kib-pull}}217217).
* Makes SSL optional for {{fleet}} Logstash outputs [#216216]({{kib-pull}}216216).
* Formats the **Last activity** value in the {{fleet}} agent details view as a datetime [#215531]({{kib-pull}}215531).
* Adds support for `searchAfter` and point-in-time (`pit`) parameters in the get agents list API [#213486]({{kib-pull}}213486).
* Registers a custom integrations search provider [#213013]({{kib-pull}}213013).
* Adds support for collapsible sections in integration overview pages [#223916]({{kib-pull}}223916).

**Discover**:
* Adds an **Attributes** tab to the document viewer when exploring OTel documents in the Observability solution view [#222391]({{kib-pull}}222391).
* Shows any available results when an ES|QL query times out as a result of the `search:timeout` advanced setting [#219027]({{kib-pull}}219027).
* Adds click actions for Stacktrace and Degraded Fields when exploring logs in Discover [#214413]({{kib-pull}}214413).
* Shows a **Load more** option instead of pagination when exploring Logs in Discover [#211176]({{kib-pull}}211176).
* Expands the {{esql}} editor to fit the query size automatically when loading Discover [#225509]({{kib-pull}}225509).
* Hides the **Selected only** toggle in pages that don't support filtering by value [#220624]({{kib-pull}}220624).
* Adds a **Copy value** button to field value cells in the Document viewer [#218817]({{kib-pull}}218817).
* Adds a warning and a tooltip for explaining the `_score` column in Discover [#211013]({{kib-pull}}211013).
* Adds support for `command`/`ctrl` + click to open new Discover sessions in a separate tab. This is useful, for example, when conducting multiple searches simultaneously [#210982]({{kib-pull}}210982).
* Improves the **Display options** menu layout [#210180]({{kib-pull}}210180).
* Updates styles for Color formatter to look like badges [#189391]({{kib-pull}}189391).

**{{esql}} editor**:
* The {{esql}} `LOOKUP_JOIN` command is now GA [#225117]({{kib-pull}}225117).
* The {{esql}} `COMPLETION` command is now available in technical preview [#224811]({{kib-pull}}224811).
* The {{esql}} `FORK` command is now available in technical preview [#224680]({{kib-pull}}224680).
* Adds suggestions for all operators when writing queries [#223503]({{kib-pull}}223503).
* Improves handling of long fields [#223222]({{kib-pull}}223222).
* Adds support for `date_nanos` fields in `BUCKET` functions [#213319]({{kib-pull}}213319).
* Shows list of keyboard shortcuts at the bottom of the editor [#221331]({{kib-pull}}221331).
* Adds suggestions for full text search when writing queries [#221239]({{kib-pull}}221239).
* Adds full text search suggestions to `STATS ... WHERE` queries [#220691]({{kib-pull}}220691).
* Adds autocomplete suggestions for `STATS...WHERE` [#216379]({{kib-pull}}216379).
* Enables suggestions for the `CHANGE_POINT` command [#218100]({{kib-pull}}218100).
* Adds validation and autocomplete support for the `CHANGE_POINT` command [#216043]({{kib-pull}}216043).
* Highlights code examples in the in-product documentation [#214915]({{kib-pull}}214915).
* Suggests triple quotes when using `KQL` and `QSTR` functions [#211457]({{kib-pull}}211457).

**Elastic Observability solution**:
For the Elastic Observability 9.1.0 release information, refer to [Elastic Observability Solution Release Notes](docs-content://release-notes/elastic-observability/index.md).

**Elastic Security solution**:
For the Elastic Security 9.1.0 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

**Kibana platform**:
* Adds an option to User Settings that allows displaying the Kibana interface in high contrast mode [#216242]({{kib-pull}}216242).
* Adds an unused URL saved objects cleanup task to reduce upgrade downtime [#220138]({{kib-pull}}220138).
* Adds a `defaultSolution` setting to spaces configuration so that you can start Kibana with its default space set to a specific solution view [#218360]({{kib-pull}}218360).
* Kibana logging's pattern layout, used by default for the console appender, will now use a new default pattern layout: `[%date][%level][%logger] %message %error`. This includes the error name and stack trace if these were included in the log entry. To opt out of this behavior, you can omit the `%error` placeholder from your log pattern configuration in `kibana.yml` [#219940]({{kib-pull}}219940). For example: 

```yml
logging:
  appenders:
    console:
      type: console
      layout:
        type: pattern
        pattern: "[%date][%level][%logger] %message"
```

**Machine Learning**:
* Moves job and trained model management features into Stack Management [#204290]({{kib-pull}}204290).
* Updates NL-2-ESQL docs [#224868]({{kib-pull}}224868).
* Hides the **Adaptive Allocations** toggle in Serverless [#224097]({{kib-pull}}224097).
* Adds rare scripts job to preconfigured Security:Windows anomaly detection jobs [#223041]({{kib-pull}}223041).
* Adds new subAction for converse and converseStream for Bedrock [#223033]({{kib-pull}}223033).
* Adds a recommended query for the `CATEGORIZE` function in {{esql}} [#222871]({{kib-pull}}222871).
* Adds the ability to disable the AIOps features in {{kib}} [#221286]({{kib-pull}}221286).
* Adds new severity colors and UX for filtering anomalies [#221081]({{kib-pull}}221081).
* Prevents the download of models already present in other spaces and shows a warning [#220238]({{kib-pull}}220238).
* Enhances `No Results` state for Change Point Detection [#219072]({{kib-pull}}219072).
* Fixes some OpenAI models not accepting temperature for Inference service [#218887]({{kib-pull}}218887).
* Adds Voyage AI and DeepSeek icons [#216651]({{kib-pull}}216651).
* Enhances the display for anomaly time function values in anomaly tables [#216142]({{kib-pull}}216142).
* Improves the UX for deploying trained models [#205699]({{kib-pull}}205699).

**Management**:
* Adds autocomplete suggestions for {{esql}} queries in Console [#219980]({{kib-pull}}219980).
* Adds a loader indicator when datasources are being loaded [#225005]({{kib-pull}}225005).


**Search solution**:
* Adds a section that enables adding, updating, and deleting query rules written on top of the Query Rules APIs to pin or exclude documents according to criteria you set. [#227226]({{kib-pull}}227226).
* Adds a **Home** page dedicated to the Elasticsearch solution to Classic and Elasticsearch solution views [#225162]({{kib-pull}}225162).
* Updates the navigation items available for the Elasticsearch solution view and the Elasticsearch section of the Classic view [#224755]({{kib-pull}}224755).

**Sharing**:
* Adds the ability to switch between relative and absolute time range when sharing objects [#218056]({{kib-pull}}218056).

### Fixes [kibana-9.1.0-fixes]

**Alerting**:
* Fixes a regression that caused the cases actions to disappear from the Alerts table **Bulk actions** menu [#215111]({{kib-pull}}215111).

**Dashboards and Visualizations**:
* Forwards the secondary prefix correctly when the state value is an empty string (`None` option) in Lens [#228183]({{kib-pull}}228183).
* Fixes an issue where a Lens Partition chart (i.e. `Pie`) prevented the user from selecting a legacy palette [#228051]({{kib-pull}}228051).
* Fixes an accessibility issue where dashboard controls should be grouped as a labelled list [#227633]({{kib-pull}}227633).
* Fixes incorrectly disabled range slider tooltip and moves the **Delete control** button to be more visible [#227295]({{kib-pull}}227295).
* Fixes secondary metric styles to prevent wrapping in Lens [#227234]({{kib-pull}}227234).
* Keeps the **Save** button enabled in case of save error [#227091]({{kib-pull}}227091).
* Hides the **Select All** checkbox from single select controls [#226311]({{kib-pull}}226311).
* Removes `kebab-case` warnings [#226114]({{kib-pull}}226114).
* Fixes an issue with dashboards not saving due to exceptionally high number of references in the request payload [#225908]({{kib-pull}}225908).
* Prevents dashboards from recommending adhoc data views [#225705]({{kib-pull}}225705).
* Prevents Lens Embeddable `defaultTitle` from being overwritten with a custom title after reload [#225664]({{kib-pull}}225664).
* Fixes panel title synchronization with the corresponding saved object when using `defaultTitle` [#225237]({{kib-pull}}225237).
* Fixes visual issues causing labels to be truncated [#225430]({{kib-pull}}225430).
* Refreshes **Values from a query** options for {{esql}} controls on dashboard reload [#225101]({{kib-pull}}225101).
* Fixes an issue with calculating the query for retrieving {{esql}} control values [#214905]({{kib-pull}}214905).
* Fixes an issue with the {{esql}} **Create control** suggestions not triggering if the query already contained a control [#214833]({{kib-pull}}214833).
* Fixes the visibility of the date picker when writing {{esql}} visualization queries [#214728]({{kib-pull}}214728).
* Fixes a performance issue with {{esql}} visualizations in case of errors in the query [#225067]({{kib-pull}}225067).
* Fixes dashboard control value changes causing multiple fetches [#224761]({{kib-pull}}224761).
* Fixes an issue in Lens where reordering the groups within a layer would incorrectly assign the color mapping to a group other than the first [#215426]({{kib-pull}}215426).
* Fixes invalid dashboard being displayed as 404 instead of showing a validation error [#211661]({{kib-pull}}211661).
* Fixes an issue where custom ranges and multi-field values were not correctly colored based on selected color mapping configurations [#207957]({{kib-pull}}207957).

**Data ingestion and Fleet**:
* Fixes CSV export in the agent list [#225050]({{kib-pull}}225050).
* Replaces registry call when deleting {{kib}} assets for custom packages [#224886]({{kib-pull}}224886).
* Ensures package policy names are unique when moving across spaces [#224804]({{kib-pull}}224804).
* Fixes bulk actions incorrectly selecting agents when a namespace filter is applied [#224036]({{kib-pull}}224036).
* Reverts "Added instructions for installing {{agent}} complete." [#223520]({{kib-pull}}223520).
* Fixes styled component theme lookup issue [#221979]({{kib-pull}}221979).
* Fixes SSL config being overridden by advanced YAML in full agent policy [#219902]({{kib-pull}}219902).
* Fixes required capability for the SIEM migrations topic [#219427]({{kib-pull}}219427).
* Makes output and {{fleet}} Server settings non-editable for agentless policies [#218905]({{kib-pull}}218905).
* Supports integrations with secrets that contain multiple values [#216918]({{kib-pull}}216918).
* Adds remote cluster instructions for syncing integrations [#211997]({{kib-pull}}211997).
* Updates install snippets to include all platforms [#210249]({{kib-pull}}210249).

**Discover**:
* Fixes an issue where an {{esql}} query was overwritten when edited while the previous request was still running [#224671]({{kib-pull}}224671).
* Fixes invalid input highlight in the **Data View** flyout [#226822]({{kib-pull}}226822).
* Fixes an issue causing Discover to freeze when dragging and dropping columns with animations disabled [#226592]({{kib-pull}}226592).
* Fixes row highlighting when reordering columns [#226584]({{kib-pull}}226584).
* Fixes error appearing when updating and then deleting a saved query [#226569]({{kib-pull}}226569).
* Fixes a cell value alignment issue for aggregate metric fields [#226562]({{kib-pull}}226562).
* Adds missing information icon to the document viewer table [#222299]({{kib-pull}}222299).
* Fixes an issue incorrectly showing the unmapped icon when a field changed from unmapped to mapped [#221308]({{kib-pull}}221308).
* Fixes the parsing of index patterns in Kibana's **Inspect** feature. Previously, certain index pattern strings were not being parsed and displayed correctly [#221084]({{kib-pull}}221084).
* Fixes an issue that causes redirects from the deprecated **Logs Stream** and **Logs Explorer** routes to Discover to lose some context such as the selected time range or KQL query [#215867]({{kib-pull}}215867).
* Excludes only {{es}} metadata fields from the Summary column instead of all fields starting with `_` [#213255]({{kib-pull}}213255).
* Fixes inability to clear the **Document ID** in data view field editor preview [#220891]({{kib-pull}}220891).
* Fixed multiple accessibility issues, including adding missing aria labels and column headers, improving keyboard navigation and interactions, and improving focus changes when interacting with Discover features [View list of fixes](https://github.com/elastic/kibana/issues?q=state:closed%20label:Project:Accessibility%20label:v9.1.0%20label:Team:DataDiscovery).

**{{esql}} editor**:
* Fixes wrong validation on expressions between aggregations [#227989]({{kib-pull}}227989).
* Hides lookup index hidden indices from autocomplete [#227819]({{kib-pull}}227819).
* Fixes several issues with `BUCKET` function signatures [#222553]({{kib-pull}}222553).
* Fixes validation issues with the `COALESCE` function [#222425]({{kib-pull}}222425).
* Fixes incorrect suggestions after a variable such as `?value` when using the `WHERE` command [#222312]({{kib-pull}}222312).
* Fixes an issue with suggestions after using triple quotes [#221200]({{kib-pull}}221200).
* Fixes a validation issue when using asterisks `*` in queries [#219832]({{kib-pull}}219832).
* Fixes an issue with incorrect source validation in case of unknown patterns [#218352]({{kib-pull}}218352).
* Fixes a display issue with the editor's menus on Safari [#218167]({{kib-pull}}218167).
* Fixes a display issue with descriptions in suggestion tooltips [#218067]({{kib-pull}}218067).
* Correctly enables the time picker when time parameters are used with cast [#215820]({{kib-pull}}215820).
* Fixes an issue preventing warnings to display correctly when they include escaped quotes [#213685]({{kib-pull}}213685).
* Fixes a validation issue when a named parameter is used as a function [#213355]({{kib-pull}}213355).
* Fixes an issue with suggestions for the `WHERE` command in case of a multiline query [#213240]({{kib-pull}}213240).

**Elastic Observability solution**:
For the Elastic Observability 9.1.0 release information, refer to [Elastic Observability Solution Release Notes](docs-content://release-notes/elastic-observability/index.md).

**Elastic Security solution**:
For the Elastic Security 9.1.0 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

**Kibana platform**:
* Removes listing limit warning [#217945]({{kib-pull}}217945).
* Adds a setting to customize the link color of the top banner [#214241]({{kib-pull}}214241).
* Updates the wording used in **Sort by** menu options [#206464]({{kib-pull}}206464).
* Passes the correct namespace to `migrateInputDocument` [#222313]({{kib-pull}}222313).

**Machine Learning**:
* Fixes unknown fields not supported in Data Visualizer and Field Statistics [#223903]({{kib-pull}}223903).
* Fixes overflow of cards in the Machine Learning **Overview** page [#223431]({{kib-pull}}223431).
* Fixes an issue with the **Use full data** button that was causing the page to crash [#217291]({{kib-pull}}217291).
* Fixes permission to view ML nodes [#215503]({{kib-pull}}215503).
* Fixes chart in single metric anomaly detection wizard [#214837]({{kib-pull}}214837).
* Prevents multiple clicks in the **Delete Model** dialog [#211580]({{kib-pull}}211580).
* Fixes further deployment of models after a failed deployment [#211459]({{kib-pull}}211459).
* Allows hiding the **Load query** and **Save query** options in the query bar menu on AIOps pages [#210556]({{kib-pull}}210556).

**Management**:
* Fixes the search functionality for spaces created with an image as their avatar type [#220398]({{kib-pull}}220398).
* Fixes styling issues in the **Edit data view** flyout [#228078]({{kib-pull}}228078).

**Search**:
* Adjusts the `z-index` of the app menu header to not conflict with the Persistent Console [#224708]({{kib-pull}}224708).
* Fixes an issue preventing solution navigation submenu items from being displayed when the navigation is collapsed [#227705]({{kib-pull}}227705).

## 9.0.8 [kibana-9.0.8-release-notes]

:::{important}
The 9.0.8 release contains fixes for potential security vulnerabilities. Check our [security advisory](https://discuss.elastic.co/c/announcements/security-announcements/31) for more details.
:::

### Fixes [kibana-9.0.8-fixes]

**Dashboards and Visualizations**:
* Fixes text kerning issues in PDF/PNG exports of dashboards and visualizations [#235516]({{kib-pull}}235516).
* Fixes an issue where the dashboard title would not get updated in the breadcrumb when edited from the list of dashboards [#236561]({{kib-pull}}236561).
* Fixes an issue with the Lens table's column sort order being different in the dashboard and the exported CSV [#236673]({{kib-pull}}236673).

**Data ingestion and Fleet**:
* Validates the Logstash pipeline ID at the {{kib}} API level [#236347]({{kib-pull}}236347).
* Adds a unique count to improve accuracy of the number of transforms on the integrations overview page [#236177]({{kib-pull}}236177).

**Discover**:
* Clears sort by `timestamp` when navigating from classic to ES|QL mode [#235338]({{kib-pull}}235338).

**Machine Learning**:
* Hides the show forecast checkbox when selecting a new job in the Single Metric Viewer [#236724]({{kib-pull}}236724).
* Improves trained model performance by adding filters to the request to fetch all index settings [#237072]({{kib-pull}}237072).
* Makes alerts visible in Anomaly Explorer to all Machine Learning-only users regardless of where they create rules [#236289]({{kib-pull}}236289).
* Fixes the **Job details** flyout on the **Analytics Map** page [#236131]({{kib-pull}}236131).
* Limits log rate analysis category requests to reduce `msearch` usage [#235611]({{kib-pull}}235611).
* Fixes rendering of the dashboard panel in PDF reporting for the Anomaly Swim Lane [#235475]({{kib-pull}}235475).

**Management**:
* Fixes handling of special characters when creating, editing, and cloning ingest pipelines [#233651]({{kib-pull}}233651).

**Stack Management**:
* Adds the ability to do partial matches and searches in the **API keys** section [#221959]({{kib-pull}}221959).


## 9.0.7 [kibana-9.0.7-release-notes]

### Fixes [kibana-9.0.7-fixes]

**Elastic Security solution**:
For the Elastic Security 9.0.7 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

**Kibana security**:
* Fixes an issue causing the API Keys Management page to break when trying to load API keys with null names [#234083]({{kib-pull}}234083).

**Search solution**:
* Fixes the Docs Explorer paging information to correctly render bold text instead of escaped HTML [#234079]({{kib-pull}}234079).

## 9.0.6 [kibana-9.0.6-release-notes]

:::{important}
The 9.0.6 release contains fixes for potential security vulnerabilities. Check our [security advisory](https://discuss.elastic.co/c/announcements/security-announcements/31) for more details.
:::

### Features and enhancements [kibana-9.0.6-features-enhancements]

**Dashboards and Visualizations**:
* Improves usability of dashboards when zooming up to 400% [#228978]({{kib-pull}}228978).

### Fixes [kibana-9.0.6-fixes]

**Kibana platform**:
* Fixes the breadcrumb to include a link to the home page when browsing pages from the **{{es}}** section of the navigation [#230270]({{kib-pull}}230270).
* Updates the built-in `reporting_user` role to leverage a new  `reporting_user` reserved privilege [#231533]({{kib-pull}}231533).

**Search**:
* Fixes an incorrect link in the **Build** breadcrumb when navigating to the **Connectors** and **{{es}} indices** pages [#232504]({{kib-pull}}232504).

## 9.0.5 [kibana-9.0.5-release-notes]

### Features and enhancements [kibana-9.0.5-features-enhancements]

**Dashboards and Visualizations**:
* Improves usability of dashboards when zooming up to 400% [#228978]({{kib-pull}}228978).

### Fixes [kibana-9.0.5-fixes]

**Dashboards and Visualizations**:
* Fixes an issue with the plus sign `+` not being properly encoded when it's part of a date math expression [#230469]({{kib-pull}}230469).
* Fixes an issue in Firefox preventing you from scrolling in the Lens editor flyout [#228625]({{kib-pull}}228625).
* Fixes an issue preventing you from saving linked TSVB visualizations when changing data views [#228685]({{kib-pull}}228685).
* Fixes a console error occurring when adding a Region map visualization to a dashboard [#228669]({{kib-pull}}228669).
* Fixes an issue with the dashboard toolbar header not correctly staying visible when opening the Dashboards app from some specific sections of the Classic navigation [#229621]({{kib-pull}}229621).
* Fixes an issue in reports where a PNG or PDF export would offset and clip part of the visualization in Lens [#228603]({{kib-pull}}228603).

**Data ingestion and Fleet**:
* Fixes an issue that could cause some SSL configurations set using the UI to be overridden [#230758]({{kib-pull}}230758).
* Fixes an issue where the SSL configuration isn't properly added to agent policies with pre-configured output types [#230211]({{kib-pull}}230211).
* Fixes agentless integrations using 'organization', 'division', or 'team' data fields being overwritten by package agentless metadata on the agent policy [#230479]({{kib-pull}}230479).
* Adds `azure-blob-storage` and `gcs` inputs to the AGENTLESS_DISABLED_INPUTS list [#229117]({{kib-pull}}229117).

**Discover**:
* Improves performance of breakdown field search [#229335]({{kib-pull}}229335).
* Enables the **Save query** button after making changes [#229053]({{kib-pull}}229053).
* Fixes the field being picked for fetching stats in the sidebar popover [#228969]({{kib-pull}}228969).
* Fixes an issue where some Discover **Copy to clipboard** actions only worked when accessing Kibana in a secure browser context [#229531]({{kib-pull}}229531).
* Fixes the handling of the **Body cell lines** display option in Discover when the default value is set to `-1` in Advanced Settings [#228697]({{kib-pull}}228697). 

**Elastic Observability solution**:
For the Elastic Observability 9.0.5 release information, refer to [Elastic Observability Solution Release Notes](docs-content://release-notes/elastic-observability/index.md).

**Elastic Security solution**:
For the Elastic Security 9.0.5 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

**Kibana platform**:
* Fixes an issue with overlapping action icons in the **Data views** menu when on mobile [#229771]({{kib-pull}}229771).
* Fixes a display issue with counter indicators on toast messages [#229300]({{kib-pull}}229300).
* Fixes an issue leading to some features not being visible when updating a space solution view to Classic [#230385]({{kib-pull}}230385).
* Decreases the loading time drastically when loading Index Management component templates [#228709]({{kib-pull}}228709).

**Machine Learning**:
* Removes `removeIfExists` from the synchronization task scheduler [#228783]({{kib-pull}}228783).


## 9.0.4 [kibana-9.0.4-release-notes]

### Features and enhancements [kibana-9.0.4-features-enhancements]

**Data ingestion and Fleet**:
* Adds a tooltip to the **Last activity** column in Agent list UI [#224850]({{kib-pull}}224850).

**Machine Learning**:
* Improves error messages in the AI Connector creation UI and ensures they're surfaced in {{kib}} [#221859]({{kib-pull}}221859).


### Fixes [kibana-9.0.4-fixes]

**Dashboards and Visualizations**:
* Fixes an issue with dashboard sharing links where copied links were not shortened and some users were unable to copy links in new spaces [#227625]({{kib-pull}}227625).
* Stops dashboards from recommending adhoc data views [#225705]({{kib-pull}}225705).
* Prevents dashboards from initiating duplicate requests when making a selection on a control [#224761]({{kib-pull}}224761).

**Data ingestion and Fleet**:
* Fixes an issue that causes the CSV export to fail in Agent list [#225050]({{kib-pull}}225050).
* Replaces call to registry when deleting {{kib}} assets for custom packages [#224886]({{kib-pull}}224886).
* Fixes an issue where the background task was not deleting some unenrolled {{agents}} [#224808]({{kib-pull}}224808).
* Fixes bulk actions incorrectly selecting {{agents}} with the namespaces filter [#224036]({{kib-pull}}224036).

**Discover**:
* Makes expiration badges singular and plural [#227035]({{kib-pull}}227035).

**Elastic Observability solution**:
For the Elastic Observability 9.0.4 release information, refer to [Elastic Observability Solution Release Notes](docs-content://release-notes/elastic-observability/index.md).

**Elastic Security solution**:
For the Elastic Security 9.0.4 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

**Kibana platform**:
* Hides the header and side navigation when printing or exporting a dashboard with **Print layout** selected [#227095]({{kib-pull}}227095).

**Search**:
* Fixes handling of context limit errors in Playground when using the Elastic Managed LLM  [#225360]({{kib-pull}}225360).
* Adjusts `z-index` of the header menu to avoid conflicting with Console [#224708]({{kib-pull}}224708).

## 9.0.3 [kibana-9.0.3-release-notes]

:::{important}
The 9.0.3 release contains fixes for potential security vulnerabilities. Check our [security advisory for more details](https://discuss.elastic.co/c/announcements/security-announcements/31).
:::

### Features and enhancements [kibana-9.0.3-features-enhancements]

**Elastic Observability solution**:
For the Elastic Observability 9.0.3 release information, refer to [Elastic Observability Solution Release Notes](docs-content://release-notes/elastic-observability/index.md).

**Elastic Security solution**:
For the Elastic Security 9.0.3 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).


### Fixes [kibana-9.0.3-fixes]

**Alerting**:
* Fixes an issue that caused {{kib}} to repeatedly restart when `xpack.alerting.cancelAlertsOnRuleTimeout` was set to `false` in the `kibana.yml` file [#222263]({{kib-pull}}222263).
* Resolves multiple issues in the Watcher UI that were introduced in 8.18.0, 8.18.1, 9.0.0, and 9.1.0. This includes the table not displaying more than 10 watches, an error banner appearing unexpectedly in certain scenarios, and the search bar functionality not working as expected [#223898]({{kib-pull}}223898).
* Fixes an issue that caused errors when rules ran during an active maintenance window that had filters and a matching rule category [#221702]({{kib-pull}}221702).

**Dashboards and Visualizations**:
* Fixes an issue that prevented navigating through pages when inspecting a chart's data  [#217937]({{kib-pull}}217937).

**Discover**:
* In version 9.0.0, we changed the way time ranges are handled for Discover ES|QL CSV exports ([#216792]({{kib-pull}}216792)). We realized that this change caused an issue with CSV Post URLs now using an absolute time range instead of a relative one, leading to duplicate reports being generated. We've reverted this change while we investigate different solutions [#223249]({{kib-pull}}223249).
* The request URL now appears correctly again when inspecting an ES|QL request [#221816]({{kib-pull}}221816).

**Elastic Observability solution**:
For the Elastic Observability 9.0.3 release information, refer to [Elastic Observability Solution Release Notes](docs-content://release-notes/elastic-observability/index.md).

**Elastic Security solution**:
For the Elastic Security 9.0.3 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

**Machine Learning**:
* Ensures the {{bedrock}} connector respects the action proxy configuration [#224130]({{kib-pull}}224130).
* Ensures the OpenAI connector respects the action proxy configuration for all sub-actions [#219617]({{kib-pull}}219617).
* Allows you to add additional fields even if your ingest pipeline is empty when uploading a file [#222775]({{kib-pull}}222775).

## 9.0.2 [kibana-9.0.2-release-notes]

### Enhancements [kibana-9.0.2-features-enhancements]
**Elastic Observability solution**:
For the Elastic Observability 9.0.2 release information, refer to [Elastic Observability Solution Release Notes](docs-content://release-notes/elastic-observability/index.md).


### Fixes [kibana-9.0.2-fixes]
**Alerting**:
* Fixes ignored dynamic templates [#219875](https://github.com/elastic/kibana/pull/219875).
* Fixes an issue where notifications would not trigger after the expiration of maintenance windows on active alerts [#219797](https://github.com/elastic/kibana/pull/219797).

**Dashboards**:
* When adding a panel using **Add from library**, the interface now shows a success message and scrolls the dashboard to the added panel [#220122](https://github.com/elastic/kibana/pull/220122).

**Elastic Observability solution**:
For the Elastic Observability 9.0.2 release information, refer to [Elastic Observability Solution Release Notes](docs-content://release-notes/elastic-observability/index.md).

**Elastic Security solution**:
For the Elastic Security 9.0.2 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).



## 9.0.1 [kibana-9.0.1-release-notes]

::::{important}
The 9.0.1 release contains fixes for potential security vulnerabilities. See our [security advisory](https://discuss.elastic.co/c/announcements/security-announcements/31) for more details.
::::

### Enhancements [kibana-9.0.1-features-enhancements]
**Data ingestion and Fleet**:
* Reuses shared integration policies when duplicating agent policies [#217872](https://github.com/elastic/kibana/pull/217872).

**Elastic Security solution**:
For the Elastic Security 9.0.1 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).


### Fixes [kibana-9.0.1-fixes]
**Dashboards & Visualizations**:
* When exploring a dashboard, the request inspector now shows the correct request and response in any successful scenario [#216519](https://github.com/elastic/kibana/pull/216519).
* Correctly synchronize the dashboard ES|QL query and filters with the corresponding visualization query in **Lens** [#218997](https://github.com/elastic/kibana/pull/218997).
* Fixes an issue where keywords could be incorrectly formatted in a metric visualization [#218233](https://github.com/elastic/kibana/pull/218233).

**Discover**:
* Fixes incorrect behavior for requests on fields where the *Allow hidden and system indices* (`allow_hidden`) option of the data view could be ignored [#217628](https://github.com/elastic/kibana/pull/217628).

**Elastic Observability solution**:
For the Elastic Observability 9.0.1 release information, refer to [Elastic Observability Solution Release Notes](docs-content://release-notes/elastic-observability/index.md).

**Elastic Security solution**:
For the Elastic Security 9.0.1 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

**Kibana platform**:
* Fixes broken icons in integrations coming from the Home plugin [#219206](https://github.com/elastic/kibana/pull/219206).
* Fixes placeholder disappearing when a value is set in the Monaco code editor [#217828](https://github.com/elastic/kibana/pull/217828).

**Machine Learning**:
* Fixes an issue that could cause a page loading error to show when changing between Inference endpoints services [#219020](https://github.com/elastic/kibana/pull/219020).
* Fixes missing field names in the step details of the anomaly detection job wizards [#218570](https://github.com/elastic/kibana/pull/218570).



## 9.0.0 [kibana-900-release-notes]

If you're upgrading to version 9.0.0, you first need to upgrade to version 8.18. We recommend checking the [8.18 release notes](https://www.elastic.co/guide/en/kibana/8.18/release-notes-8.18.0.html).

### Features and enhancements [kibana-900-features-enhancements]

**Theme**:

{{kib}} 9.0 introduces a more modern and refined look and feel. This new theme brings a vibrant color palette, improved dark mode support (including honoring your system preferences), and more that will bring your data in Kibana to life.

**Data ingestion and Fleet**:
* New setting allowing automatic deletion of unenrolled agents in Fleet settings [#195544]({{kib-pull}}195544).
* Improves filtering and visibility of `Uninstalled` and `Orphaned` agents in Fleet, by differentiating them from `Offline` agents [#205815]({{kib-pull}}205815).
* Introduces air-gapped configuration for bundled packages [#202435]({{kib-pull}}202435).
* Updates removed parameters of the Fleet -> Logstash output configurations [#210115]({{kib-pull}}210115).
* Updates max supported package version  [#196675]({{kib-pull}}196675).

**Elastic Observability solution**:
* Alerting rules:
  * Adds the reason message to the rules recovery context [#211411]({{kib-pull}}211411).
* SLOs:
  * Splits Up SLO Details from Overview. Static data that describes the SLO definition has been moved to a separate tab, making charts and valuable information about SLIs faster to access. [#212826]({{kib-pull}}212826).
  * SpaceId can now be referenced in document-based access filters for roles to restrict a user's access to SLI data for spaces where they do not have access [#214278]({{kib-pull}}214278).
  * Adds a link to the location badge on synthetics SLOs that sends to the Monitors page with a filter applied that matches the location of the origin SLO [#210695]({{kib-pull}}210695).
* Synthetics:
  * Ensures 404 is returned only if `screenshot_ref` is truly not present [#215241]({{kib-pull}}215241).

**Elastic Security solution**:
For the Elastic Security 9.0.0 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

**Kibana security**:
* Updates `js-yaml` to `4.1.0` [#190678]({{kib-pull}}190678).

**Machine Learning**:
* Removes use of `ignore_throttled` [#199107]({{kib-pull}}199107).

**Platform**:
* Adds warning header to deprecated API endpoints [#205926]({{kib-pull}}205926).
* Sets HTTP2 as default if SSL is enabled and adds deprecation log if SSL is not enabled or protocol is set to HTTP1 [#204384]({{kib-pull}}204384).


### Fixes [kibana-900-fixes]

**Dashboards & Visualizations**:
* Fixes an issue in Lens where colors behind text were not correctly assigned, such as in `Pie`, `Treemap` and `Mosaic` charts [#209632]({{kib-pull}}209632).
* Fixes an issue where changing the *Ignore timeout results* control setting wasn't taken into account [#208611]({{kib-pull}}208611).
* Force returns 0 on empty buckets on count if `null` flag is disabled [#207308]({{kib-pull}}207308).
* Fixes infinite loading time for some charts due to search context reload [#203150]({{kib-pull}}203150).

**Data ingestion and Fleet**:
* Fixes overlay for Integrations on mobile [#215312]({{kib-pull}}215312).
* Update minimum package spec version to 2.3 [#214600]({{kib-pull}}214600).
* Fixes a validation error happening on multi-text input fields [#205768]({{kib-pull}}205768).

**Elastic Observability solution**:
* Alerting rules:
  * Fixes chat on the Alerts page [#197126]({{kib-pull}}197126).
* Infrastructure inventory:
  * Fixes an error that could prevent the Observability Infrastructure inventory view from loading after an upgrade due to missing versioning on inventory_view_saved_object [#207007]({{kib-pull}}207007).
* SLOs:
  * Fixes an issue where clicking on the name badge for a synthetics monitor on an SLO details page would lead to a page that failed to load monitor details [#210695]({{kib-pull}}210695).
  * Allows use of wildcard filters in SLO queries when DSL filters are also used [#213119]({{kib-pull}}213119).
  * Ensures that when an SLO is created, its ID is correctly verified to be unique across all spaces [#214496]({{kib-pull}}214496).

**Elastic Security solution**:
For the Elastic Security 9.0.0 release information, refer to [Elastic Security Solution Release Notes](docs-content://release-notes/elastic-security/index.md).

**Platform**:

* Fixes several interface inconsistencies on the Space creation and settings pages [#197303]({{kib-pull}}197303).
