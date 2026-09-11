# @kbn/lens-test-helpers

Shared test helpers and test-case definitions for Lens.

## Purpose

Home for Lens test artifacts that are consumed by more than one test layer or
module, so case matrices and helpers are defined once instead of drifting
across copies.

## Contents

- `buildTrendlineQueryCases({ index })` — ES|QL metric trendline rewrite case
  matrix. Consumed by:
  - unit tests in `@kbn/lens-common`
    (`esql/trendline_query/trendline_query_cases.test.ts`): assert the
    rewritten query and time field for every case (fast, no infra)
  - Scout API tests in the Lens plugin
    (`x-pack/platform/plugins/shared/lens/test/scout/core/api`): execute the
    source and generated queries against real Elasticsearch

Helpers in this package must stay dependency-free (pure data / functions), so
any Kibana module — including `@kbn/lens-common` itself — can consume them
without dependency cycles.

Adding a case to the matrix automatically extends both layers.
