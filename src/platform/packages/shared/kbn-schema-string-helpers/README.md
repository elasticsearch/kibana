# Schema string helper infrastructure

Shared defaults, option validation, and OpenTelemetry reporting for
[`@kbn/config-schema`](../kbn-config-schema/README.md#built-in-string-helpers) and
[`@kbn/zod`](../kbn-zod/README.md#built-in-string-helpers).

Use those libraries to construct schemas. This package is independent of both
validators so it can supply consistent limits and one length histogram without creating a
circular dependency. It uses only the browser-compatible OpenTelemetry API;
provider and exporter initialization remains with Kibana telemetry.
