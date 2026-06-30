---
navigation_title: "Server performance"
description: "Performance tips for plugin server code."
---

# Server performance

## Don't block the event loop

[Node.js is single threaded](https://nodejs.dev/learn/introduction-to-nodejs) which means a single CPU-intensive server-side, synchronous operation will block any other functionality waiting to execute on the Kibana server. The affects background tasks, like alerts, and search sessions, as well as search requests and page loads.

**When writing code that will run on the server, [don't block the event loop](https://nodejs.org/en/docs/guides/dont-block-the-event-loop/)**. Instead consider:

- Writing async code. For example, leverage [setImmediate](https://nodejs.dev/learn/understanding-setimmediate) inside for loops.
- Executing logic on the client instead. This may not be a good option if you require a lot of data going back and forth between the server and the client, as that can also slow down the user's experience, especially over slower bandwidth internet connections.
- Worker threads are also an option if the code doesn't rely on stateful Kibana services. If you are interested in using worker threads, please reach out to a tech-lead before doing so. We will likely want to implement a worker threads pool to ensure worker threads cooperate appropriately.