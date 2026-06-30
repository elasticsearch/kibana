---
navigation_title: Unit tests
description: Unit testing Kibana plugins with Jest
---

# Unit tests [unit-tests]

Unit tests are small, fast, and exhaustive. They test a single function, class, or component in isolation by mocking external dependencies. Use Jest for all Kibana unit tests.

## Core mocks [unit-tests-core-mocks]

When testing a plugin's integration points with Core APIs, use the mocks provided in `src/core/server/mocks` and `src/core/public/mocks`. These are Jest mocks that mimic the Core API interface without returning realistic values.

If the unit under test expects a particular response from a Core API, set the return value explicitly. Return values are type-checked against the real API to catch stale mocks.

```typescript
import { elasticsearchServiceMock } from 'src/core/server/mocks';

test('my test', async () => {
  // Setup mock and faked response
  const esClient = elasticsearchServiceMock.createScopedClusterClient();
  esClient.callAsCurrentUser.mockResolvedValue(/** insert ES response here */);

  // Call unit under test with mocked client
  const result = await myFunction(esClient);

  // Assert that client was called with expected arguments
  expect(esClient.callAsCurrentUser).toHaveBeenCalledWith(/** expected args */);
  // Expect that unit under test returns expected value based on client's response
  expect(result).toEqual(/** expected return value */)
});
```

## HTTP routes [unit-tests-http-routes]

The HTTP API is a public contract of Kibana. Evaluate the required coverage level based on whether an endpoint is public or private. Public APIs should have higher test coverage of observable behavior.

### Preconditions [unit-tests-http-routes-preconditions]

The following examples test the `myPlugin` plugin, which formats user-provided text, stores it, and retrieves it. The plugin has thin route controllers that delegate logic to the plugin model:

```typescript
class TextFormatter {
  public static async format(text: string, sanitizer: Deps['sanitizer']) {
    const sanitizedText = await sanitizer.sanitize(text);
    return sanitizedText;
  }

  public static async save(text: string, savedObjectsClient: SavedObjectsClient) {
    const { id } = await savedObjectsClient.update('myPlugin-type', 'myPlugin', {
      userText: text
    });
    return { id };
  }

  public static async getById(id: string, savedObjectsClient: SavedObjectsClient) {
    const { attributes } = await savedObjectsClient.get('myPlugin-type', id);
    return { text: attributes.userText };
  }
}
```

### Unit testing routes [unit-tests-http-routes-unit]

Unit tests provide the fastest way to test route controller logic and plugin models. Use them when adding integration tests is hard due to complex setup or many logic permutations. Since all external dependencies are mocked, you don't get a guarantee that the whole system works together.

**Pros:**
- Fast
- Easier to debug

**Cons:**
- Does not test against real dependencies
- Does not cover integration with other plugins

Add a `*.test.ts` file and use dependency mocks to cover:
- Input permutations and edge cases
- Expected exceptions
- Interaction with dependencies

```typescript
// src/platform/plugins/shared/my_plugin/server/formatter.test.ts
describe('TextFormatter', () => {
  describe('format()', () => {
    const sanitizer = sanitizerMock.createSetup();
    sanitizer.sanitize.mockImplementation((input: string) => `sanitizer result:${input}`);

    it('formats text to a ... format', async () => {
      expect(await TextFormatter.format('aaa', sanitizer)).toBe('...');
    });

    it('calls Sanitizer.sanitize with correct arguments', async () => {
      await TextFormatter.format('aaa', sanitizer);
      expect(sanitizer.sanitize).toHaveBeenCalledTimes(1);
      expect(sanitizer.sanitize).toHaveBeenCalledWith('aaa');
    });

    it('throws MisformedTextError if passed string contains banned symbols', async () => {
      sanitizer.sanitize.mockRejectedValueOnce(new MisformedTextError());
      await expect(TextFormatter.format('any', sanitizer)).rejects.toThrow(MisformedTextError);
    });
    // ... other tests
  });
});
```

For higher-level integration tests that start a real Kibana instance, see [Integration tests](./integration-tests.md).

## Applications [unit-tests-applications]

Kibana Platform applications are mounted and unmounted from the DOM as the user navigates, without full-page refreshes. Long-lived sessions make cleanup more important than before.

Common things to test when your application is unmounted:
- Subscriptions and polling (e.g. `uiSettings.get$()`)
- Core API calls that set state (e.g. `core.chrome.setIsVisible`)
- Open connections (e.g. WebSockets)

By following the [renderApp](https://github.com/elastic/kibana/blob/main/src/core/CONVENTIONS.md#applications) convention, you reduce the amount of logic in the mount function and make the rendering logic easier to test.

```typescript
/** public/plugin.ts */
class Plugin {
  setup(core) {
    core.application.register({
      async mount(params) {
        const [{ renderApp }, [coreStart, startDeps]] = await Promise.all([
          import('./application'),
          core.getStartServices()
        ]);
        return renderApp(params, coreStart, startDeps);
      }
    })
  }
}
```

In testing `renderApp`, verify that:
1. Your application mounts and unmounts correctly
2. Cleanup logic completes as expected

```typescript
/** public/application.test.ts */
import { createMemoryHistory } from 'history';
import { ScopedHistory } from '@kbn/core/public';
import { coreMock } from '@kbn/core/public/mocks';
import { renderApp } from './application';

describe('renderApp', () => {
  it('mounts and unmounts UI', () => {
    const params = coreMock.createAppMountParameters('/fake/base/path');
    const core = coreMock.createStart();

    const unmount = renderApp(params, core, {});
    expect(params.element.querySelector('.some-app-class')).not.toBeUndefined();
    unmount();
    expect(params.element.innerHTML).toEqual('');
  });

  it('unsubscribes from uiSettings', () => {
    const params = coreMock.createAppMountParameters('/fake/base/path');
    const core = coreMock.createStart();
    const settings$ = new Subject();
    core.uiSettings.get$.mockReturnValue(settings$);

    const unmount = renderApp(params, core, {});
    expect(settings$.observers.length).toBe(1);
    unmount();
    expect(settings$.observers.length).toBe(0);
  });

  it('resets chrome visibility', () => {
    const params = coreMock.createAppMountParameters('/fake/base/path');
    const core = coreMock.createStart();

    const unmount = renderApp(params, core, {});
    expect(core.chrome.setIsVisible).toHaveBeenCalledWith(false);
    core.chrome.setIsVisible.mockClear();
    unmount();
    expect(core.chrome.setIsVisible).toHaveBeenCalledWith(true);
  })
});
```

## SavedObjectsClient [unit-tests-saved-objects-client]

To unit test code that uses the Saved Objects client, mock the client methods and assert against the expected behavior.

Since the Saved Objects client makes network requests to an external Elasticsearch cluster, include failure scenarios in your test cases. When writing a view that the user might interact with, ensure your code can recover from exceptions.

### Server-side example [unit-tests-saved-objects-server]

```typescript
// src/platform/plugins/myplugin/server/lib/short_url_lookup.ts
import crypto from 'node:crypto';
import { SavedObjectsClientContract } from '@kbn/core/server';

export const shortUrlLookup = {
  generateUrlId(url: string, savedObjectsClient: SavedObjectsClientContract) {
    const id = crypto.createHash('md5').update(url).digest('hex');

    return savedObjectsClient
      .create('url', { url, accessCount: 0, createDate: new Date().valueOf(), accessDate: new Date().valueOf() }, { id })
      .then(doc => doc.id)
      .catch(err => {
        if (savedObjectsClient.errors.isConflictError(err)) {
          return id;
        } else {
          throw err;
        }
      });
  },
};
```

```typescript
// src/platform/plugins/myplugin/server/lib/short_url_lookup.test.ts
import { shortUrlLookup } from './short_url_lookup';
import { savedObjectsClientMock } from '@kbn/core/server/mocks';

describe('shortUrlLookup', () => {
  const ID = 'bf00ad16941fc51420f91a93428b27a0';
  const TYPE = 'url';
  const URL = 'http://elastic.co';
  const mockSavedObjectsClient = savedObjectsClientMock.create();

  beforeEach(() => { jest.resetAllMocks(); });

  describe('generateUrlId', () => {
    it('provides correct arguments to savedObjectsClient', async () => {
      const ATTRIBUTES = { url: URL, accessCount: 0, createDate: new Date().valueOf(), accessDate: new Date().valueOf() };
      mockSavedObjectsClient.create.mockResolvedValueOnce({ id: ID, type: TYPE, references: [], attributes: ATTRIBUTES });
      await shortUrlLookup.generateUrlId(URL, mockSavedObjectsClient);

      const [type, attributes, options] = mockSavedObjectsClient.create.mock.calls[0];
      expect(type).toBe(TYPE);
      expect(attributes).toStrictEqual(ATTRIBUTES);
      expect(options).toStrictEqual({ id: ID });
    });

    it('ignores version conflict and returns id', async () => {
      mockSavedObjectsClient.create.mockRejectedValueOnce(
        mockSavedObjectsClient.errors.decorateConflictError(new Error())
      );
      const id = await shortUrlLookup.generateUrlId(URL, mockSavedObjectsClient);
      expect(id).toEqual(ID);
    });

    it('rejects with passed through savedObjectsClient errors', () => {
      const error = new Error('oops');
      mockSavedObjectsClient.create.mockRejectedValueOnce(error);
      return expect(shortUrlLookup.generateUrlId(URL, mockSavedObjectsClient)).rejects.toBe(error);
    });
  });
});
```

### Client-side example [unit-tests-saved-objects-client-side]

The public Saved Objects client returns `SimpleSavedObject` instances, which needs to be reflected in the mock:

```typescript
// src/platform/plugins/myplugin/public/saved_query_service.test.ts
import { createSavedQueryService, SavedQueryAttributes } from './saved_query_service';
import { savedObjectsServiceMock } from '@kbn/core/public/mocks';
import { SavedObjectsClientContract, SimpleSavedObject } from '@kbn/core/public';

describe('saved query service', () => {
  const savedQueryAttributes: SavedQueryAttributes = {
    title: 'foo',
    description: 'bar',
    query: { language: 'kuery', query: 'response:200' },
  };

  const mockSavedObjectsClient = savedObjectsServiceMock.createStartContract()
    .client as jest.Mocked<SavedObjectsClientContract>;
  const savedQueryService = createSavedQueryService(mockSavedObjectsClient);

  afterEach(() => { jest.resetAllMocks(); });

  describe('saveQuery', function() {
    it('should create a saved object for the given attributes', async () => {
      const mockReturnValue = new SimpleSavedObject(mockSavedObjectsClient, {
        type: 'query',
        id: 'foo',
        attributes: savedQueryAttributes,
        references: [],
      });
      mockSavedObjectsClient.create.mockResolvedValue(mockReturnValue);

      const response = await savedQueryService.saveQuery(savedQueryAttributes);
      expect(mockSavedObjectsClient.create).toHaveBeenCalledWith('query', savedQueryAttributes, { id: 'foo' });
      expect(response).toBe(mockReturnValue);
    });
  });
});
```

## Saved object model versions [unit-tests-model-versions]

_Also see [Defining model versions](../key-concepts/saved-objects/create.md)._

Model version definitions are more structured than legacy migration functions, requiring specific tooling to test. The `@kbn/core-test-helpers-model-versions` package exposes utilities for testing model version transformations.

### Model version test migrator [unit-tests-model-version-migrator]

`createModelVersionTestMigrator` creates a test migrator that transforms documents the same way the migration algorithm would during an upgrade.

```ts
import {
  createModelVersionTestMigrator,
  type ModelVersionTestMigrator
} from '@kbn/core-test-helpers-model-versions';

const mySoTypeDefinition = someSoType();

describe('mySoTypeDefinition model version transformations', () => {
  let migrator: ModelVersionTestMigrator;

  beforeEach(() => {
    migrator = createModelVersionTestMigrator({ type: mySoTypeDefinition });
  });

  describe('Model version 2', () => {
    it('properly backfills the expected fields when converting from v1 to v2', () => {
      const obj = createSomeSavedObject();
      const migrated = migrator.migrate({ document: obj, fromVersion: 1, toVersion: 2 });
      expect(migrated.properties).toEqual(expectedV2Properties);
    });

    it('properly removes the expected fields when converting from v2 to v1', () => {
      const obj = createSomeSavedObject();
      const migrated = migrator.migrate({ document: obj, fromVersion: 2, toVersion: 1 });
      expect(migrated.properties).toEqual(expectedV1Properties);
    });
  });
});
```

## Plugin integrations [unit-tests-plugin-integrations]

All plugin dependencies are explicitly declared in `kibana.json`. The `setup` and `start` contracts are injected into your plugin's lifecycle phases. Because dependencies are explicit, isolating specific logical components for unit testing is straightforward.

The approach to testing plugin code that relies on other plugins is the same as testing Core API usage: mock the dependency and return the value the test expects.

Most plugins expose mocks for their contracts in a `mocks` file (e.g. `src/plugins/data/public/mocks.ts`). Use these when available instead of creating your own.

### Testing dependency usage [unit-tests-plugin-dependency-usage]

Assert that registration APIs are called correctly and that downstream services are called with the expected parameters:

```typescript
// src/platform/plugins/myplugin/public/suggestions/suggestion_service.test.ts
import { dataPluginMock } from '@kbn/data-plugin/public/mocks';
import { SuggestionsService } from './suggestion_service';

describe('SuggestionsService', () => {
  let service: SuggestionsService;
  let dataSetup: DataPluginSetupMock;
  let dataStart: DataPluginStartMock;

  beforeEach(() => {
    service = new SuggestionsService();
    dataSetup = dataPluginMock.createSetupContract();
    dataStart = dataPluginMock.createStartContract();
  });

  describe('#setup', () => {
    it('registers the query suggestion provider to the data plugin', () => {
      service.setup(dataSetup);

      expect(dataSetup.autocomplete.addQuerySuggestionProvider).toHaveBeenCalledTimes(1);
      expect(dataSetup.autocomplete.addQuerySuggestionProvider).toHaveBeenCalledWith(
        'fr',
        expect.any(Function)
      );
    });
  });
});
```

### Testing optional plugin dependencies [unit-tests-optional-dependencies]

Plugins should test behavior when optional dependencies are both present and absent:

```typescript
// src/platform/plugins/myplugin/public/plugin.test.ts
import { coreMock } from '@kbn/core/public/mocks';
import { dataPluginMock } from '@kbn/data-plugin/public/mocks';
import { MyPlugin } from './plugin';

describe('Plugin', () => {
  it('initializes correctly if usageCollection is disabled', () => {
    const plugin = new MyPlugin(coreMock.createPluginInitializerContext());
    const coreSetup = coreMock.createSetup();
    const setupDeps = { data: dataPluginMock.createSetupContract() };

    expect(() => { plugin.setup(coreSetup, setupDeps); }).not.toThrow();
    expect(() => { plugin.start(coreMock.createStart(), { data: dataPluginMock.createStartContract() }); }).not.toThrow();
  });
});
```

## RXJS testing [unit-tests-rxjs]

### Testing RXJS observables with marble [unit-tests-rxjs-marble]

Testing observable-based APIs can be challenging when asynchronous operators or timing assertions are needed. RxJS includes a `marble` testing module for this purpose.

See the [official marble testing docs](https://rxjs-dev.firebaseapp.com/guide/testing/marble-testing) for full reference.

**Setup:**

```typescript
import { TestScheduler } from 'rxjs/testing';

const getTestScheduler = () =>
  new TestScheduler((actual, expected) => {
    expect(actual).toEqual(expected);
  });
```

### Testing an interval-based observable [unit-tests-rxjs-interval]

```typescript
describe('getUpdate$', () => {
  it('emits updates every 100ms', () => {
    getTestScheduler().run(({ expectObservable }) => {
      const { getUpdate$ } = service.setup();
      expectObservable(getUpdate$(), '301ms !').toBe('100ms a 99ms b 99ms c', {
        a: 'update-1',
        b: 'update-2',
        c: 'update-3',
      });
    });
  });
});
```

Notes:
- The test is synchronous
- The second parameter of `expectObservable` (`'301ms !'`) manually unsubscribes from the infinite `interval` observable
- An emission occupies a time frame, so after the initial `a` at frame `100`, there is a `99ms` gap (not `100ms`) before `b`

### Testing observable completion [unit-tests-rxjs-completion]

```typescript
it('getUpdate$ completes when `abort$` emits', () => {
  const service = new FooService();
  getTestScheduler().run(({ expectObservable, hot }) => {
    const { getUpdate$ } = service.setup();
    const abort$ = hot('149ms a', { a: undefined });
    expectObservable(getUpdate$({ abort$ })).toBe('100ms a 48ms |', {
      a: 'update-1',
    });
  });
});
```

### Testing promise-based observables [unit-tests-rxjs-promises]

Marble testing does not work directly with promises because the test scheduler cannot handle asynchronous resolution. Work around this by having the mock return an observable instead of a promise:

```typescript
// NOTE: test scheduler does not properly work with promises.
// We mock http.post to return an observable instead, then test promise behavior separately.
it('callServerAPI result observable emits when the response is received', () => {
  const http = httpServiceMock.createStartContract();
  getTestScheduler().run(({ expectObservable, hot }) => {
    http.post.mockReturnValue(hot('---(a|)', { a: { someData: 'foo' } }) as any);

    const results = callServerAPI(http, { query: 'term' }, {});

    expectObservable(results).toBe('---(a|)', {
      a: { someData: 'foo' },
    });
  });
});
```
