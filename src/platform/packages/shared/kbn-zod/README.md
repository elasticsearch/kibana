# `@kbn/zod`

Kibana's `Zod` library. Exposes the `Zod` API with some Kibana-specific
improvements.

## Built-in string helpers

The root package and `@kbn/zod/v4` export these helpers with the same defaults as
`@kbn/config-schema`:

| Helper | Minimum length | Maximum length |
| --- | ---: | ---: |
| `savedObjectId` | 1 | 512 |
| `savedObjectType` | 0 | 256 |
| `savedObjectVersion` | 0 | 256 |
| `spaceId` | 1 | 512 |
| `displayName` | 1 | 1,024 |
| `description` | 0 | 10,000 |
| `searchFilter` | 0 | 10,000 |
| `aggregation` | 0 | 100,000 |
| `querySortField` | 0 | 256 |

```typescript
import { z, savedObjectId, spaceId, displayName, unboundedString } from '@kbn/zod';

const params = z.object({
  spaceId: spaceId(),
  savedObjectId: savedObjectId.warn({ label: 'dashboard.panelId' }),
});
const body = z.object({
  name: displayName({ maxLength: 512 }),
  trustedText: unboundedString({ reason: 'Size is enforced upstream' }),
});
```

Each helper is a named factory: call `savedObjectId()` for strict validation or
`savedObjectId.warn()` for reporting mode. Factories accept Zod string constructor
options such as `error` in addition to `minLength` and `maxLength`. Use ordinary
Zod composition for
`.optional()`, `.nullable()`, `.regex()`, `.refine()` and other validation.
Apply those modifiers **after** selecting strict or reporting mode; `.warn()` is
available on the factory. Both modes return ordinary Zod schemas.
Strict schemas emit their length limits in JSON Schema / OpenAPI; reporting
schemas omit the maximum they do not enforce.

Lengths count UTF-16 code units, matching JavaScript `string.length`. These are
input size bounds, not byte limits or format validation. Saved object defaults
follow `src/core/packages/saved-objects/server/src/saved_objects_length_limits.ts`;
Elasticsearch still enforces its separate byte limit on the combined document ID.
Descriptions and other helpers with minimum zero allow empty strings; use the
library's optional wrapper to allow an absent field.

Factories accept `minLength` and `maxLength` overrides. Undefined overrides retain
the defaults; limits must be finite, non-negative integers with minimum <= maximum.
Use overrides to preserve existing route contracts when adopting a helper.

### Reporting mode

Call the helper's `.warn({ label: 'dashboard.panelId' })` to accept overlong input
while recording a violation. Only maximum length enforcement is disabled; minimum
length and other validators remain active. A `maxLength` override changes the
reporting threshold. Call `.warn()` before composing the returned schema.

Each overlong string validation records its length in the histogram
`kibana.schema.string_length_violation.length` on the `kibana.schema` OTel meter.
The histogram measures UTF-16 code units (`{code_unit}`) and has attributes
`schema.helper`, `schema.library` (`config-schema` or `zod`), `schema.max_length`,
and optional `schema.label`. Labels must be static field identifiers, never
request values or user IDs. Neither input contents nor actual input lengths are
recorded as attributes. The histogram count gives the number of violations; its
sum, minimum, maximum and buckets describe the lengths of violating strings.
Suggested bucket boundaries cover lengths through 1,048,576 code units, with
larger values in the overflow bucket; exporter or provider views may override
these boundaries. Counts represent validation attempts, including repeated
validation and unsuccessful union branches, rather than distinct requests.

Reporting uses the existing OTel provider and exporters. Without a configured
provider it is a no-op. Enable and configure `telemetry.metrics` as described in
[`@kbn/metrics`](../../private/opentelemetry/kbn-metrics/README.md).
Where metrics are shipped to the serverless metrics cluster, query
`serverless-metrics-*:metrics-*.otel-*` for
`metrics.kibana.schema.string_length_violation.length:*` and group by the attributes above.
Calling `.warn()` does not enable exporters or impose a maximum length; switch to
the strict helper once the observed bounds have been reviewed.

### Intentionally unbounded strings

`unboundedString({ reason: 'Size is enforced upstream' })` requires a nonempty
explanation at schema definition time and excludes a maximum-length option from
its type. The reason documents the call site and is not sent to telemetry.
CodeQL recognizes this escape hatch and the helpers' explicit `.warn()` mode;
ordinary unbounded string schemas remain subject to the rule.

Adopt helpers in team-owned route changes, preserving stricter bounds and existing
format validation as needed. Replace justified `codeql[...]` string suppressions
with `unboundedString({ reason: ... })`.
