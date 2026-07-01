# @kbn/evals-suite-pci-compliance

End-to-end evaluation suite for the **PCI DSS v4.0.1 compliance** Agent Builder
skill. It exercises the consolidated `pci_compliance` tool along with
`pci_scope_discovery` and `pci_field_mapper` against a small, deterministic
dataset and asserts on scoring, evidence, scope claims, and the mandatory QSA
disclaimer.

The suite is modeled on `@kbn/evals-suite-endpoint` so traces, spans, and
evaluator fields are directly comparable across security eval suites.

## Prerequisites

- The `pciComplianceAgentBuilder` experimental flag must be on for the Kibana
  test server. The `evals_pci_compliance` Scout `serverConfigSet`
  (`src/platform/packages/shared/kbn-scout/src/servers/configs/config_sets/evals_pci_compliance`)
  enables it explicitly, so the suite does not depend on the global default
  in `experimental_features.ts` and works whether the flag ships on or off
  by default.
- An AI connector must be available (see the `@kbn/evals` docs for the
  standard connector setup).
- The Agent Builder experimental features UI setting is also enabled by that
  config set.

## Running

From the Kibana repo root:

```sh
# Start the Kibana + ES test server with the PCI compliance config set
node scripts/scout start-server \
  --arch stateful \
  --domain classic \
  --serverConfigSet evals_pci_compliance

# In another terminal, run the suite
node scripts/evals start --suite pci-compliance
```

All evaluation specs live under [`evals/pci_compliance`](./evals/pci_compliance).

### Seeding a dev cluster manually

To import the eval data into a remote dev cluster (e.g. Elastic Cloud):

```sh
# Auth via API key (preferred) or basic auth. Either:
#   export ES_URL=https://my-cluster.es.io:9243
#   export ES_API_KEY=<base64-api-key>
# OR drop a .env file at the kibana repo root containing those variables.
# Basic auth (ES_USERNAME / ES_PASSWORD) is supported as a fallback.
./scripts/seed_dev_cluster.sh            # seed data
./scripts/seed_dev_cluster.sh --cleanup  # delete data streams
```

## Scenarios

| Spec                                    | Skill / Tool                        | What it asserts                                                                                    |
| --------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| `full compliance report`                | `pci_compliance` (`mode: "report"`) | Full scorecard across all 12 requirements with correct RED/AMBER/GREEN status.                     |
| `requirement 8.3.4 — brute force`       | `pci_compliance` (`mode: "check"`)  | Detects 12 failed logins for jdoe (exceeds threshold of 10), RED status.                           |
| `requirement 4.1 — weak TLS`            | `pci_compliance` (`mode: "check"`)  | Flags TLS 1.0, TLS 1.1, and plain HTTP as violations.                                             |
| `requirement 2.2.4 — default accounts`  | `pci_compliance` (`mode: "check"`)  | Flags admin and root successful logins as default-account violations.                              |
| `scope discovery`                       | `pci_scope_discovery`               | Identifies 4 ECS indices and classifies them (identity, network, endpoint).                        |
| `field mapping for custom data`         | `pci_field_mapper`                  | Suggests correct ECS targets for non-ECS fields (username → user.name, etc.).                      |
| `scoped check (auth-only)`              | `pci_compliance`                    | Auth requirements produce real findings; network/vuln/malware requirements are NOT_ASSESSABLE.     |
| `requirement 9 — no matching data`      | `pci_compliance` (`mode: "check"`)  | Returns AMBER/NOT_ASSESSABLE when no physical access events exist.                                 |

## Data generators

Deterministic seed data lives in
[`src/data_generators/pci_data.ts`](./src/data_generators/pci_data.ts). It
provisions five data streams:

| Index                     | Contents                                             | Doc count |
| ------------------------- | ---------------------------------------------------- | --------- |
| `logs-pci-auth-eval`      | ECS auth events: 12 failed logins (jdoe), admin/root successes, IAM events | 18       |
| `logs-pci-network-eval`   | TLS 1.3/1.2 (good), TLS 1.0/1.1 (weak), plain HTTP | 6         |
| `logs-pci-vuln-eval`      | Critical/high CVEs, IDS alerts (exploit, port scan)  | 4         |
| `logs-pci-endpoint-eval`  | Malware detection, suspicious process execution      | 2         |
| `logs-pci-custom-eval`    | Non-ECS legacy fields for field-mapper tests         | 4         |

The generators expose `seedPciEvalData()` and `cleanupPciEvalData()` so each
spec owns its lifecycle without leaking indices between runs.

## Evaluator

The suite uses a PCI-specific criteria evaluator
(`src/evaluate_dataset.ts#createPciCriteriaEvaluator`) that pins a baseline
(`BASELINE_PCI_CRITERIA`) asserting:

- The DSS version (`4.0.1`) is referenced.
- The response declines to act as QSA attestation (non-attestation disclaimer).
- A structured `scopeClaim` payload is emitted alongside any finding.

Scenario-specific criteria layer on top of the baseline.

## Why a dedicated suite

- **Determinism**: PCI findings depend heavily on the data shape. Seeding a
  small known-good dataset is far more reliable than reusing generic logs.
- **Scope-claim parity**: Every PCI tool response ships a scope claim with
  DSS version, indices, time range, evaluated requirements, checked fields,
  and a disclaimer. The suite asserts on this for every scenario.
- **Feature flag isolation**: The `evals_pci_compliance` config set
  explicitly enables `pciComplianceAgentBuilder` for the Kibana test server,
  so the suite is decoupled from whatever the global default is in
  `experimental_features.ts` and the run cannot be silently skipped if that
  default changes.
