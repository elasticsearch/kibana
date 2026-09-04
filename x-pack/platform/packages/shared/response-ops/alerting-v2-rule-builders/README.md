# @kbn/alerting-v2-rule-builders

The rule builder type contract for Alerting v2. A builder type pairs a bounded Zod schema for
`metadata.builder_fields` with a deterministic `generateQuery` function that turns those fields
into the rule's ES|QL query.

Definitions live in a package rather than in the alerting v2 plugin because they are isomorphic:
the server validates `builder_fields` and generates the persisted query with them, while the
browser can use the same code for a live query preview, so the two cannot drift apart.

See `x-pack/platform/plugins/shared/alerting_v2/docs/rule_builder_registration.md` for the
registration guide.
