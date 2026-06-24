# Open in Lens — Scout UI tests

These tests cover the **"Open in Lens"** conversion flow: the user right-clicks a visualization panel on a dashboard and chooses the action that opens it inside the Lens editor. Each test verifies that the converted visualization renders correctly — correct chart type, dimension labels, metric values, and colour configuration.

`agg_based/` specs run in parallel using `spaceTest` and are tagged **`tags.stateful.classic`** (stateful migration phase 1). Serverless coverage for agg-based open-in-Lens remains in serverless FTR until phase 2.

## Directory structure

```
open_in_lens/
  agg_based/       # Agg-based visualizations (Metric, Goal, Gauge, Pie, Table, Heatmap, XY)
  tsvb/            # TSVB visualizations (Metric, Gauge, Timeseries, Top N, Table, Dashboard) — planned
  dashboard.spec.ts  # Dashboard-level open-in-lens behaviour — planned
```

## Test data

Each subdirectory loads its own kbn archive from `fixtures/kbn_archives/open_in_lens/` — pre-built dashboards that contain one panel per conversion scenario. The logstash ES archive is loaded once in `global.setup.ts` and shared across all specs.

## Migration status (agg_based)

| Scout spec | Replaces (stateful FTR) | Serverless FTR (until phase 2) |
|---|---|---|
| `agg_based/metric.spec.ts` | `agg_based_1/metric.ts` | `group2/.../metric.ts` |
| `agg_based/goal.spec.ts` | `agg_based_3/goal.ts` | `group9/.../goal.ts` |
| `agg_based/gauge.spec.ts` | `agg_based_2/gauge.ts` | `group9/.../gauge.ts` |
| `agg_based/pie.spec.ts` | `agg_based_1/pie.ts` | `group2/.../pie.ts` |
| `agg_based/table.spec.ts` | `agg_based_3/table.ts` | `group9/.../table.ts` |
| `agg_based/heatmap.spec.ts` | `agg_based_4/heatmap.ts` | `group10/.../heatmap.ts` |
| `agg_based/xy.spec.ts` | `agg_based_2/xy.ts` | `group2/.../xy.ts` |

Tracking issue: [#267494](https://github.com/elastic/kibana/issues/267494) (parent: [#266317](https://github.com/elastic/kibana/issues/266317))
