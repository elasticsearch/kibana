# Alerting v2 — Error contract

All HTTP routes emit error responses that conform to the shared
`errorResponseSchema` (defined in
[`@kbn/alerting-v2-schemas`](../../../../../packages/shared/response-ops/alerting-v2-schemas/src/error_response_schema.ts)):

```jsonc
{
  "code": "RULE_NOT_FOUND",         
  "error": "Not Found",              
  "message": "Rule with id=foo …",  
  "details": { "rule_id": "foo" }  
}
```

This shape is centralized in `BaseAlertingRoute.onError`. Clients should branch
on `code`. The `message` field is intentionally NOT part of the API contract. Do not parse it. It is subject to change.

## Quick rules

- Branch on `code`, not on `message`.
- Treat `message` as human-facing text only.
- Treat `details` as structured context whose shape depends on `code`.
- Prefer a domain-specific code from `ALERTING_V2_ERROR_CODES` over a generic
  fallback.

## How error codes are produced

1. The domain layer (`clients`, `services`, `utils`) throws
   `Boom.<status>(message, { code, details })`.
2. `BaseAlertingRoute.onError` reads `boom.data.code` and
   `boom.data.details`.
3. If no domain code is attached, `BaseAlertingRoute.onError` falls back to
   `deriveErrorCodeFromStatus(statusCode)`.
4. The route emits the normalized `{ code, error, message, details? }` body via
   `response.customError(...)`.

Two helper sources of codes:

- `server/lib/errors/error_codes.ts` — `ALERTING_V2_ERROR_CODES`: the
  authoritative catalog of domain-specific codes.
- `server/routes/derive_error_code.ts` — `deriveErrorCodeFromStatus(statusCode)`:
  the floor mapping from HTTP status to a generic code (`NOT_FOUND`,
  `CONFLICT`, …). Used only when a domain code is not attached.

## Domain catalog

Code source of truth: `server/lib/errors/error_codes.ts`. Adding a new code is
backwards compatible. Renaming or removing a code is a breaking change.

### Rules (`server/lib/rules_client/`)

| Code                          | Status | When                                                                 | `details`                                  |
| ----------------------------- | ------ | -------------------------------------------------------------------- | ------------------------------------------ |
| `RULE_NOT_FOUND`              | 404    | `getRule` / `updateRule` / `deleteRule` cannot find a rule by id     | `{ rule_id }`                              |
| `RULE_ALREADY_EXISTS`         | 409    | `createRule` collides with an existing id                            | `{ rule_id }`                              |
| `RULE_VERSION_CONFLICT`       | 409    | An update / delete races another writer (`if_seq_no` mismatch)       | `{ rule_id }`                              |
| `INVALID_RULE_DATA`           | 400    | The submitted body fails the domain-level schema check               | `{ context, errors }` (tree-shaped errors) |
| `INVALID_STATE_TRANSITION`    | 400    | `state_transition` is incompatible with the rule's `kind`            | `{ rule_id, kind, transition }`            |
| `INVALID_BULK_PARAMS`         | 400    | Bulk operation combines `ids` with `filter` / `search` / `match_all` | `{ params }`                               |
| `IMMUTABLE_FIELDS_CHANGED`    | 400    | PUT (upsert) request changes a field flagged as immutable            | `{ fields }`                               |
| `INVALID_FILTER_FIELD`        | 400    | The `filter` references a field that is not in the allow-list        | `{ field, allowed_fields }`                |
| `UNSUPPORTED_FILTER_FUNCTION` | 400    | The `filter` uses a KQL function we do not translate yet             | `{ function }`                             |
| `SCHEDULE_INTERVAL_TOO_SHORT` | 400    | `schedule.every` is below `xpack.alerting_v2.rules.minimumScheduleInterval` | `{ interval, minimumScheduleInterval }`    |
| `MAX_SCHEDULES_PER_MINUTE_EXCEEDED` | 400 | Scheduling the rule would exceed `xpack.alerting_v2.rules.maxScheduledPerMinute` | `{ interval, maxScheduledPerMinute }` |

### Action policies (`server/lib/action_policy_client/`)

| Code                              | Status | When                                                                | `details`              |
| --------------------------------- | ------ | ------------------------------------------------------------------- | ---------------------- |
| `ACTION_POLICY_NOT_FOUND`         | 404    | `get` / `update` / `delete` cannot find an action policy by id      | `{ action_policy_id }` |
| `ACTION_POLICY_ALREADY_EXISTS`    | 409    | `createActionPolicy` collides with an existing id                   | `{ action_policy_id }` |
| `ACTION_POLICY_VERSION_CONFLICT`  | 409    | An update / delete races another writer                             | `{ action_policy_id }` |
| `INVALID_ACTION_POLICY_DATA`      | 400    | The submitted body fails the domain-level schema check              | `{ context, errors }`  |
| `INVALID_DATE_STRING`             | 400    | A user-supplied date (e.g. `snoozed_until`) fails ISO-8601 parsing  | `{ value }`            |

### Alert actions (`server/lib/alert_actions_client/`)

| Code                    | Status | When                                                                     | `details`                     |
| ----------------------- | ------ | ------------------------------------------------------------------------ | ----------------------------- |
| `ALERT_EVENT_NOT_FOUND` | 404    | No alert event matches the supplied `group_hash` (+ optional `episode_id`) | `{ group_hash, episode_id? }` |

### Rule doctor insights (`server/lib/rule_doctor_insights_client/`)

| Code                | Status | When                                                          | `details`        |
| ------------------- | ------ | ------------------------------------------------------------- | ---------------- |
| `INSIGHT_NOT_FOUND` | 404    | `getInsight` / `updateInsightStatus` cannot find an insight by id | `{ insight_id }` |

### Engine state (`server/routes/base_alerting_route.ts`)

| Code                   | Status | When                                                                                                                                                                          | `details` |
| ---------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `ALERTING_DISABLED` | 503    | `BaseAlertingRoute.handle` short-circuits when `alerting:v2:enabled` is off so every route refuses requests until the operator turns the engine back on.                       | _(none)_  |

### Generic fallback codes

| Code                    | Status | When                                                                        |
| ----------------------- | ------ | --------------------------------------------------------------------------- |
| `INTERNAL_SERVER_ERROR` | 5xx    | Catch-all when the handler boomifies an unexpected error and no domain code applies. |

## Common error responses (every route)

`BaseAlertingRoute` declares a `commonResponses` block that `static get
validate()` merges into each subclass's `schemas.response`. Every route therefore documents these four OAS responses without restating them:

| HTTP status | When                                                                                                  |
| ----------- | ----------------------------------------------------------------------------------------------------- |
| `401`       | The request was not authenticated.                                                                    |
| `403`       | The caller lacks the route's `requiredPrivileges`.                                                    |
| `500`       | Any uncaught throw boomifies to 500.                                                                  |
| `503`       | Alerting is administratively disabled via the `alerting:v2:enabled` advanced setting (kill switch).|

Important distinction:

- These are OpenAPI response declarations shared by every route.
- They do not replace domain-specific `code` values attached at throw sites.
- Subclass-declared statuses take precedence. A route can override, for example,
  `500` with a more specific description in its own `static schemas.response`.
- Route-specific statuses (`400`, `404`, `409`, ...) still belong on each
  subclass.

## HTTP status code → code fallbacks

`deriveErrorCodeFromStatus(statusCode)` is the floor. Used only when no domain code
is attached to `boom.data`. Prefer domain codes whenever possible.

| HTTP status | Fallback `code`         |
| ----------- | ----------------------- |
| 400         | `BAD_REQUEST`           |
| 401         | `UNAUTHORIZED`          |
| 403         | `FORBIDDEN`             |
| 404         | `NOT_FOUND`             |
| 409         | `CONFLICT`              |
| 422         | `UNPROCESSABLE_ENTITY`  |
| 429         | `TOO_MANY_REQUESTS`     |
| 500         | `INTERNAL_SERVER_ERROR` |
| 502         | `BAD_GATEWAY`           |
| 503         | `SERVICE_UNAVAILABLE`   |
| 504         | `GATEWAY_TIMEOUT`       |
| other 4xx   | `BAD_REQUEST`           |
| other       | `INTERNAL_SERVER_ERROR` |

## How to throw a domain error

Use `Boom.<status>(message, data)` and attach the catalog code at the throw
site:

```ts
import Boom from '@hapi/boom';
import { ALERTING_V2_ERROR_CODES } from '../errors/error_codes';

throw Boom.notFound(`Rule with id=${id} not found`, {
  code: ALERTING_V2_ERROR_CODES.RULE_NOT_FOUND,
  details: { rule_id: id },
});
```

`BaseAlertingRoute` picks up `boom.data.code` and `boom.data.details` and emits
the standard body. No additional route-layer mapping is needed.

## How to add a new code

1. Add a new entry to `ALERTING_V2_ERROR_CODES` in `error_codes.ts`. Use
   `UPPER_SNAKE_CASE`. Add a one-line JSDoc explaining when it fires.
2. Use it via `Boom.<status>(msg, { code, details })` at the throw site.
3. Add a unit test that asserts the boomified error carries the expected
   `code` and `details` (see `rules_client.test.ts` and
   `action_policy_client.test.ts`, in the `error codes and details` blocks).
4. Update the matching table in this README.

## How to declare a route response

Routes declare their request/response schemas on `static schemas = {...}` and
`BaseAlertingRoute` wraps them with `buildRouteValidationWithZod` via the
inherited `static get validate()` getter:

```ts
import { errorResponseSchema, ruleResponseSchema } from '@kbn/alerting-v2-schemas';

static schemas = {
  request: {
    body: createRuleDataSchema,
  },
  response: {
    201: {
      body: () => ruleResponseSchema,
      description: 'Indicates a successful call.',
    },
    400: {
      body: () => errorResponseSchema,
      description: 'Indicates an invalid schema or parameters.',
    },
  },
};
```

Every documented error status (`400`, `404`, `409`, ...) should reference
`errorResponseSchema` so the generated OAS captures the `{ code, error,
message, details? }` contract.
