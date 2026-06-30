---
navigation_title: Integration tests
description: Integration testing Kibana plugins with Jest and TestUtils
---

# Integration tests [integration-tests]

Integration tests verify interactions between systems: HTTP APIs, Elasticsearch API calls, and cross-plugin contracts. They run against a real (or near-real) Kibana or Elasticsearch instance rather than mocks.

Use Jest-based integration tests when your unit tests cannot cover a scenario because mocking would be too brittle or would not replicate real behavior. For E2E browser testing, use [Scout](./scout.md).

## HTTP routes with TestUtils [integration-tests-testutils]

TestUtils starts a real Kibana server instance without a full Elasticsearch cluster. Use it when your plugin does not interact directly with Elasticsearch or can mock its own ES methods.

**Pros:**
- Runs the real Kibana instance
- Tests cross-plugin integration
- Faster than FTR because it skips Elasticsearch

**Cons:**
- Slower than pure unit tests
- Does not cover Elasticsearch interactions

### Preconditions [integration-tests-testutils-preconditions]

The following examples test an HTTP route in `myPlugin` that formats and stores user-provided text:

```typescript
class TextFormatter {
  public static async format(text: string, sanitizer: Deps['sanitizer']) {
    const sanitizedText = await sanitizer.sanitize(text);
    return sanitizedText;
  }
  // ...
}
```

### TestUtils example [integration-tests-testutils-example]

```typescript
// src/platform/plugins/my_plugin/server/integration_tests/formatter.test.ts
import { createRoot, request } from '@kbn/core-test-helpers-kbn-server';

describe('myPlugin', () => {
  describe('GET /myPlugin/formatter', () => {
    let root: ReturnType<typeof createRoot>;

    beforeAll(async () => {
      root = createRoot();
      await root.preboot();
      await root.setup();
      await root.start();
    }, 30000);

    afterAll(async () => await root.shutdown());

    it('validates given text', async () => {
      const response = await request
        .get(root, '/myPlugin/formatter')
        .query({ text: 'input string'.repeat(100) })
        .expect(400);

      expect(response.body).toHaveProperty('message');
    });

    it('formats given text', async () => {
      const response = await request
        .get(root, '/myPlugin/formatter')
        .query({ text: 'input string' })
        .expect(200);

      expect(response.text).toBe('...');
    });
  });
});
```

You can also apply a hybrid approach — mock specific model methods to test error handling without calling the real sanitizer dependency:

```typescript
jest.mock('../path/to/model');
import { TextFormatter } from '../path/to/model';
import { MisformedTextError } from '../path/to/sanitizer'

describe('myPlugin', () => {
  describe('GET /myPlugin/formatter', () => {
    let root: ReturnType<typeof createRoot>;

    beforeAll(async () => {
      root = createRoot();
      await root.preboot();
      await root.setup();
      await root.start();
    }, 30000);

    afterAll(async () => await root.shutdown());

    it('returns BadRequest if Sanitizer throws MisformedTextError', async () => {
      TextFormatter.format.mockRejectedValueOnce(new MisformedTextError());

      await request
        .get(root, '/myPlugin/formatter')
        .query({ text: 'any text' })
        .expect(400, 'bad bad request');
    });
  });
});
```

## SavedObjectsClient integration tests [integration-tests-saved-objects]

To get the highest confidence in code that uses the Saved Objects client, write integration tests that load data into and query a real Elasticsearch database.

1. Create fixture data for Elasticsearch
2. Create a fixtures archive: `node scripts/es_archiver save <path> [index patterns...]`
3. Load fixtures in your test: `esArchiver.load('path from root of repo')`

_todo: fully worked out example_

## Saved object model versions [integration-tests-model-versions]

_Also see [Defining model versions](../key-concepts/saved-objects/create.md)._

During integration tests with a real Elasticsearch cluster, you can manipulate saved object documents in a way that closely mirrors production runtime. You can even simulate two Kibana instances with different model versions running simultaneously.

### Model version test bed [integration-tests-model-version-testbed]

`createModelVersionTestBed` sets up a test bed for model version integration testing. It starts and stops an ES server and initiates the migration between two versions.

```ts
import {
  createModelVersionTestBed,
  type ModelVersionTestKit
} from '@kbn/core-test-helpers-model-versions';

describe('myIntegrationTest', () => {
  const testbed = createModelVersionTestBed();
  let testkit: ModelVersionTestKit;

  beforeAll(async () => {
    await testbed.startES();
  });

  afterAll(async () => {
    await testbed.stopES();
  });

  beforeEach(async () => {
    testkit = await testbed.prepareTestKit({
      savedObjectDefinitions: [{
        definition: mySoTypeDefinition,
        modelVersionBefore: 1,
        modelVersionAfter: 2,
      }]
    });
  });

  afterEach(async () => {
    if (testkit) {
      await testkit.tearsDown();
    }
  });

  it('can be used to test model version cohabitation', async () => {
    const repositoryV1 = testkit.repositoryBefore;
    const repositoryV2 = testkit.repositoryAfter;

    await repositoryV1.create(someAttrs, { id });
    const v2docReadFromV1 = await repositoryV2.get('my-type', id);
    expect(v2docReadFromV1.attributes).toEqual(whatIExpect);
  });
});
```

**Limitations:**

Because the test bed only creates the Core parts needed to instantiate the two SO repositories, and cannot load all plugins, the integration test bed has these limitations:

- No extensions (no security, no encryption, no spaces)
- All SO types use the same SO index

## Serverless limitations and edge cases [integration-tests-serverless]

Serverless upgrades involve a period where old and new versions of the application coexist. This affects the behavior of some Saved Objects APIs.

### Using the `fields` option of `find` [integration-tests-serverless-find-fields]

By default, `find` (and other SO APIs that return documents) migrates all documents before returning them. However, when using the `fields` option, documents cannot be migrated because some model version changes cannot be applied against a partial set of attributes.

When `fields` is provided, returned documents are **not** migrated.

Therefore, every field passed to `fields` must have been present in the **prior model version**. Otherwise, newly introduced or backfilled fields may not appear during upgrades.

### Using `bulkUpdate` with large JSON blobs [integration-tests-serverless-bulk-update]

`bulkUpdate` updates documents client-side and then reindexes them. These in-memory operations can cause memory constraint issues when updating many objects with large JSON blobs. Avoid using `bulkUpdate` for saved objects that:

- Use arrays (which tend to be large)
- Store large JSON blobs in some fields
