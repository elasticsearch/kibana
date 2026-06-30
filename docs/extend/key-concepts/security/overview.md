---
navigation_title: "Security overview"
description: "A map of Kibana's security and access-control concepts: authentication, authorization, privileges, RBAC, audit logging, and encrypted saved objects."
---

# Security overview

Kibana enforces security at several layers. Use this page as a map; each sub-topic has its own concept guide.

## The `kibana_system` service account

The Kibana server authenticates to Elasticsearch as the `elastic/kibana` service account. Most features don't need changes to its privileges, but when they do, the changes must be carefully reviewed — the `kibana_system` account should never have access to user data.

See [Kibana system user](./system-user.md).

## API route authorization

Every HTTP route — public or internal — must declare its authorization requirements via the `security` configuration in `KibanaRouteOptions`. This is especially important for routes that do non-trivial processing, call Elasticsearch as `kibana_system`, or bypass built-in saved-object authorization.

See [API authorization](./api-authorization.md).

## Feature privileges

Features register privileges that administrators can assign to roles. This is how Kibana exposes granular "who can access my feature, and what can they do?" control on top of Kibana's role-based access control.

See [Feature privileges](./feature-privileges.md).

## RBAC and the Saved Objects client

The Saved Objects client automatically applies role-based access control when Kibana reads or writes saved objects on behalf of an end user. Kibana privileges map to Elasticsearch application privileges; the SO client enforces them transparently.

See [RBAC and the Saved Objects client](./rbac-and-saved-objects.md).

## Encrypted Saved Objects

Saved object types that hold sensitive data (credentials, API keys, secrets) can be registered with the Encrypted Saved Objects (ESO) service. ESO encrypts specified attributes at rest and can bind decryption to a set of Additional Authenticated Data (AAD) attributes so tampering is detectable.

See [Encrypted Saved Objects](./encrypted-saved-objects.md).

## Audit logging

Audit logging records security-relevant events — authentication outcomes, authorization decisions, saved object access — so Kibana activity can be monitored and reviewed after an incident. It complements Elasticsearch audit logging.

See [Audit logging](./audit-logging.md).
