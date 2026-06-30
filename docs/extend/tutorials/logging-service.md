---
mapped_pages:
  - https://www.elastic.co/guide/en/kibana/current/logging-service.html
---

# Logging service [logging-service]

Allows a plugin to provide status and diagnostic information.

::::{note}
The Logging service is only available server side.
::::

For editorial guidance on what to log and what to avoid (sensitive data, noisy `info` messages, implementation details), see the [logging guidelines](../contributing/codebase/logging.md).


```typescript
import type { PluginInitializerContext, CoreSetup, Plugin, Logger } from '@kbn/core/server';

export class MyPlugin implements Plugin {
  private readonly logger: Logger;

  constructor(initializerContext: PluginInitializerContext) {
    this.logger = initializerContext.logger.get();
  }

  public setup(core: CoreSetup) {
    try {
      this.logger.debug('doing something...');
      // …
    } catch (e) {
      this.logger.error('failed doing something...');
    }
  }
}
```

## Usage [_usage_2]

Usage is very straightforward, one should just get a logger for a specific context and use it to log messages with different log level.

```typescript
const logger = kibana.logger.get('server');

logger.trace('Message with `trace` log level.');
logger.debug('Message with `debug` log level.');
logger.info('Message with `info` log level.');
logger.warn('Message with `warn` log level.');
logger.error('Message with `error` log level.');
logger.fatal('Message with `fatal` log level.');

const loggerWithNestedContext = kibana.logger.get('server', 'http');
loggerWithNestedContext.trace('Message with `trace` log level.');
loggerWithNestedContext.debug('Message with `debug` log level.');
```

And assuming logger for `server` name with `console` appender and `trace` level was used, console output will look like this:

```bash
[2017-07-25T11:54:41.639-07:00][TRACE][server] Message with `trace` log level.
[2017-07-25T11:54:41.639-07:00][DEBUG][server] Message with `debug` log level.
[2017-07-25T11:54:41.639-07:00][INFO ][server] Message with `info` log level.
[2017-07-25T11:54:41.639-07:00][WARN ][server] Message with `warn` log level.
[2017-07-25T11:54:41.639-07:00][ERROR][server] Message with `error` log level.
[2017-07-25T11:54:41.639-07:00][FATAL][server] Message with `fatal` log level.

[2017-07-25T11:54:41.639-07:00][TRACE][server.http] Message with `trace` log level.
[2017-07-25T11:54:41.639-07:00][DEBUG][server.http] Message with `debug` log level.
```

The log will be less verbose with `warn` level for the `server` logger:

```bash
[2017-07-25T11:54:41.639-07:00][WARN ][server] Message with `warn` log level.
[2017-07-25T11:54:41.639-07:00][ERROR][server] Message with `error` log level.
[2017-07-25T11:54:41.639-07:00][FATAL][server] Message with `fatal` log level.
```


