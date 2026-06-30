---
navigation_title: "Runtime constraints"
description: "Constraints of the Kibana runtime environment that plugin authors should understand and respect."
---

# Runtime constraints

Avoid these common mistakes when writing plugin code.

## Treating Kibana's filesystem as durable storage

Plugins should rarely, if ever, access {{kib}}'s filesystem directly. {{kib}} instances are commonly ephemeral and anything written to the filesystem will potentially not be there on restart.

## Storing state in server memory

There are generally multiple instances of {{kib}} all hosted behind a round-robin load-balancer. As a result, storing state in server memory is risky as there is no guarantee that a single end-user's HTTP requests will be served by the same {{kib}} instance.

## Using WebSockets

{{kib}} has a number of platform services that don't work with WebSockets, for example authentication and authorization. If your use-case would benefit substantially from websockets, talk to the {{kib}} Core team about adding support. Do not hack around this limitation.
