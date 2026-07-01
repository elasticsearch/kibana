# Data Federation

Management UI for ES|QL data federation — the Elasticsearch feature that lets you query external object storage directly from ES|QL without ingesting data first.

## What it does

Exposes two management screens under **Stack Management > Data**:

- **Data sources** — connections to external storage (S3, GCS, Azure Blob). Each data source holds the credentials and endpoint config Elasticsearch needs to read files. Supports access key, service account, and federated identity (keyless) auth.
- **Data sets** — named references to a path or glob pattern within a data source, plus optional file format settings (Parquet, CSV, NDJSON, etc.). A data set is what you reference in an ES|QL `FROM` clause.

The plugin proxies create/read/delete operations through Kibana's server to the Elasticsearch `/_query/datasource` and `/_query/data_sets` APIs.

## Federated identity auth

When running on Elastic Cloud, data sources can authenticate using the workload identity issuer instead of static credentials. The creation flyout shows the JWT issuer URL and deployment/project ID that the user needs to configure the trust policy on the CSP side (AWS IAM, GCP workload identity, Azure federated credentials).

The issuer URL is injected by the kibana-controller via `xpack.dataFederation.workloadIdentityIssuerUrl`. If that config key is absent the read-only fields are hidden — no derived URL is shown.

## Feature flags

| Key | Default | Description |
|-----|---------|-------------|
| `xpack.dataFederation.enableFederatedIdentityAuth` | `false` | Show the federated identity auth option in the creation flyout |
| `xpack.dataFederation.enableGoogleCloudStorageDataSourceType` | `false` | Show GCS as a data source type |
| `xpack.dataFederation.enableAzureDataSourceType` | `false` | Show Azure Blob as a data source type |
