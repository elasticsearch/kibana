---
navigation_title: "Audit Logging"
description: "Audit Logging"
---

# Audit Logging

## Audit logging

Audit logging is a subscription feature that users can enable to keep track of security-related events, such as authorization success and failures. Logging these events enables you to monitor Kibana for suspicious activity and provides evidence in the event of an attack.

Use the Kibana audit logs in conjunction with Elasticsearch audit logging to get a holistic view of all security related events. Kibana defers to the Elasticsearch security model for authentication, data index authorization, and features that are driven by cluster-wide privileges.

### Automatic audit logging

The Kibana Platform automatically records audit events for the following operations:
- Calling HTTP endpoints
- CRUD operations on Saved Objects [1]
- CRUD operations on Spaces
- Login / Logout events

:::{warning}
[1] Saved Object operations are only audited when using the Scoped Saved Objects Client. Audit logging will not be performed if you create an unscoped client, or choose to exclude the `security` wrapper.
:::

More information on these events can be found in our [audit logging documentation](https://www.elastic.co/guide/en/kibana/current/xpack-security-audit-logging.html#xpack-security-ecs-audit-logging)

### Custom audit logging

There may be times when it makes sense for a feature to implement its own audit logging, in order to suppliment our automatic audit logging.
Access to the audit logging service is exposed through the `security` plugin.

#### Example

```typescript
const auditLogger = securitySetup.audit.asScoped(request);
auditLogger.log({
  message: 'User is updating dashboard [id=123]',
  event: {
    action: 'saved_object_update',
    category: ['database'],
    type: ['change'],
    outcome: 'unknown',
  },
  kibana: {
    saved_object: { type: 'dashboard', id: '123' },
  },
});
```

### What events should be logged?

The purpose of an audit log is to support compliance, accountability and
security by capturing who performed an action, what action was performed and
when it occurred. It is not the purpose of an audit log to aid with debugging
the system or provide usage statistics.

**Kibana guidelines:**

Each API call to Kibana will result in a record in the audit log that captures
general information about the request (`http_request` event).

In addition to that, any operation that is performed on a resource owned by
Kibana (e.g. saved objects) and that falls in the following categories, should
be included in the audit log:

- System access (incl. failed attempts due to authentication errors)
- Data reads (incl. failed attempts due to authorisation errors)
- Data writes (incl. failed attempts due to authorisation errors)

If Kibana does not own the resource (e.g. when running queries against user
indices), then auditing responsibilities are deferred to Elasticsearch and no
additional events will be logged.

**Examples:**

For a list of audit events that Kibana currently logs see:
`docs/user/security/audit-logging.asciidoc`

### When should an event be logged?

Due to the asynchronous nature of most operations in Kibana, there is an
inherent tradeoff between the following logging approaches:

- Logging the **intention** before performing an operation, leading to false
  positives if the operation fails downstream.
- Logging the **outcome** after completing an operation, leading to missing
  records if Kibana crashes before the response is received.
- Logging **both**, intention and outcome, leading to unnecessary duplication
  and noisy/difficult to analyse logs.

**Kibana guidelines:**

- **Write operations** should be logged immediately after all authorisation
  checks have passed, but before the response is received (logging the
  intention). This ensures that a record of every operation is persisted even in
  case of an unexpected error.
- **Read operations**, on the other hand, should be logged after the operation
  completed (logging the outcome) since we won't know what resources were
  accessed before receiving the response.
- Be explicit about the timing and outcome of an action in your messaging. (e.g.
  "User has logged in" vs. "User is creating dashboard")

### Can an action trigger multiple events?

- A request to Kibana can perform a combination of different operations, each of
  which should be captured as separate events.
- Operations that are performed on multiple resources (**bulk operations**)
  should be logged as separate events, one for each resource.
- Actions that kick off **background tasks** should be logged as separate
  events, one for creating the task and another one for executing it.
- **Internal checks**, which have been carried out in order to perform an
  operation, or **errors** that occured as a result of an operation should be
  logged as an outcome of the operation itself, using the ECS `event.outcome`
  and `error` fields, instead of logging a separate event.
- Multiple events that were part of the same request can be correlated in the
  audit log using the ECS `trace.id` property.