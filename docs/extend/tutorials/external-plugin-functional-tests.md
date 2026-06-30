---
mapped_pages:
  - https://www.elastic.co/guide/en/kibana/current/external-plugin-functional-tests.html
---

# Functional Tests for Plugins outside the Kibana repo [external-plugin-functional-tests]

Plugins use the `FunctionalTestRunner` by running it out of the {{kib}} repo. Ensure that your {{kib}} Development Environment is setup properly before continuing.


## Writing your own configuration [_writing_your_own_configuration]

Every project or plugin should have its own `FunctionalTestRunner` config file. Just like {{kib}}'s, this config file will define all of the test files to load, providers for Services and PageObjects, as well as configuration options for certain services.

To get started copy and paste this example to `src/platform/test/functional/config.js`:

```js subs=true
import { resolve } from 'path';
import { REPO_ROOT } from '@kbn/utils';

import { MyServiceProvider } from './services/my_service';
import { MyAppPageProvider } from './services/my_app_page';

// the default export of config files must be a config provider
// that returns an object with the projects config values
export default async function ({ readConfigFile }) {

  // read the Kibana config file so that we can utilize some of
  // its services and PageObjects
  const kibanaConfig = await readConfigFile(resolve(REPO_ROOT, 'src/platform/test/functional/config.base.js'));

  return {
    // list paths to the files that contain your plugins tests
    testFiles: [
      resolve(__dirname, './my_test_file.js'),
    ],

    // define the name and providers for services that should be
    // available to your tests. If you don't specify anything here
    // only the built-in services will be available
    services: {
      ...kibanaConfig.get('services'),
      myService: MyServiceProvider,
    },

    // just like services, PageObjects are defined as a map of
    // names to Providers. Merge in Kibana's or pick specific ones
    pageObjects: {
      management: kibanaConfig.get('pageObjects.management'),
      myApp: MyAppPageProvider,
    },

    // the apps section defines the urls that
    // `PageObjects.common.navigateTo(appKey)` will use.
    // Merge urls for your plugin with the urls defined in
    // Kibana's config in order to use this helper
    apps: {
      ...kibanaConfig.get('apps'),
      myApp: {
        pathname: '/app/my_app',
      }
    },

    // choose where screenshots should be saved
    screenshots: {
      directory: resolve(__dirname, './tmp/screenshots'),
    }

    // more settings, like timeouts, mochaOpts, etc are
    // defined in the config schema.
    // https://github.com/elastic/kibana/blob/{{version.stack | M.M}}/src/platform/packages/shared/kbn-test/src/functional_test_runner/lib/config/schema.ts
  };
}
```

From the root of your repo you should now be able to run the `FunctionalTestRunner` script from your plugin project.

```shell
node ../../kibana/scripts/functional_test_runner
```


## Using esArchiver [_using_esarchiver]

We’re working on documentation for this, but for now the best place to look is the original [pull request](https://github.com/elastic/kibana/issues/10359).
