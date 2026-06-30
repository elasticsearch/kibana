---
navigation_title: Key concepts
---

# Key concepts [key-concepts]

The mental models and architecture you need to build on the {{kib}} platform: plugins and packages versus core, the platform lifecycle, saved objects, security, data views, embeddables and other UI building blocks, and plugin performance.

## Platform architecture

How {{kib}} is composed of plugins, packages, and core, and the patterns that hold them together.

- [Plugins, packages, and the platform](./platform-architecture/plugins-packages-and-the-platform.md)
- [Anatomy of a plugin](./platform-architecture/anatomy-of-a-plugin.md)
- [Scoped services and patterns](./platform-architecture/scoped-services.md)
- [Routing, navigation, and URL](./platform-architecture/routing-navigation-and-url.md)
- [API documentation](./platform-architecture/api-documentation.md)

## Security

Authentication, authorization, privileges, RBAC, audit logging, and encrypted saved objects.

- [Security overview](./security/overview.md)
- [API authorization](./security/api-authorization.md)
- [Feature privileges](./security/feature-privileges.md)
- [RBAC and saved objects](./security/rbac-and-saved-objects.md)
- [System user](./security/system-user.md)
- [Encrypted saved objects](./security/encrypted-saved-objects.md)
- [Audit logging](./security/audit-logging.md)

## Saved objects

Treating {{es}} like a primary database from a plugin, plus migrations, sharing, and persistence.

- [Saved Objects](./saved-objects.md) — overview and full sub-topic index

## Data

How queryable data sets are modeled and accessed.

- [Data Views](./data/data-views.md)

## UI

Architectural building blocks for plugin UIs.

- [Building blocks](./ui/building-blocks.md)
- [Embeddables](./ui/embeddables.md)
- [UI Actions](./ui/ui-actions.md)
- [Lens (visualization framework)](./ui/lens.md)

## Performance

Keeping the {{kib}} platform fast as plugins grow.

- [Plugin performance and optimization](./performance/plugin-performance-and-optimization.md)
- [Client performance](./performance/client-performance.md)
- [Server performance](./performance/server-performance.md)
