---
mapped_pages:
  - https://www.elastic.co/guide/en/kibana/current/testing-kibana-plugin.html
---

# Testing Kibana Plugins [testing-kibana-plugin]

## Writing tests [_writing_tests]

Learn about [recommended testing approaches](/extend/testing/index.md).

For modern UI and API end-to-end tests in the {{kib}} repo, see [Scout](/extend/testing/scout.md).


## Mock {{kib}} Core services in tests [_mock_kib_core_services_in_tests]

Core services already provide mocks to simplify testing and make sure plugins always rely on valid public contracts:

**my_plugin/server/plugin.test.ts**

```typescript
import { configServiceMock } from '@kbn/core/server/mocks';

const configService = configServiceMock.create();
configService.atPath.mockReturnValue(config$);
…
const plugin = new MyPlugin({ configService }, …);
```

Or if you need to get the whole core `setup` or `start` contracts:

**my_plugin/server/plugin.test.ts**

```typescript
import { coreMock } from '@kbn/core/public/mocks';

const coreSetup = coreMock.createSetup();
coreSetup.uiSettings.get.mockImplementation((key: string) => {
  …
});
…
const plugin = new MyPlugin(coreSetup, ...);
```


## Writing mocks for your plugin [_writing_mocks_for_your_plugin]

Although it isn’t mandatory, we strongly recommended you export your plugin mocks as well, in order for dependent plugins to use them in tests. Your plugin mocks should be exported from the root `/server` and `/public` directories in your plugin:

**my_plugin/(server|public)/mocks.ts**

```typescript
const createSetupContractMock = () => {
  const startContract: jest.Mocked<MyPluginStartContract>= {
    isValid: jest.fn(),
  }
  // here we already type check as TS infers to the correct type declared above
  startContract.isValid.mockReturnValue(true);
  return startContract;
}

export const myPluginMocks = {
  createSetup: createSetupContractMock,
  createStart: …
}
```

Plugin mocks should consist of mocks for *public APIs only*: `setup`, `start` & `stop` contracts. Mocks aren’t necessary for pure functions as other plugins can call the original implementation in tests.


