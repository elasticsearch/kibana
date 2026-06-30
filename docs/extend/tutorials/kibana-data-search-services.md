---
navigation_title: "Kibana data.search Services"
description: "Kibana Search Services"
---

# Kibana data.search Services

## Search service

### Low level search

Searching data stored in Elasticsearch can be done in various ways, for example using the Elasticsearch REST API or using an `Elasticsearch Client` for low level access.

However, the recommended and easiest way to search Elasticsearch is by using the low level search service. The service is exposed from the `data` plugin, and by using it, you not only gain access to the data you stored, but also to capabilities, such as Custom Search Strategies, Asynchronous Search, Partial Results, Search Sessions, and more.

Here is a basic example for using the `data.search` service from a custom plugin:

```ts
import { CoreStart, Plugin } from '@kbn/core/public';
import { DataPublicPluginStart, isCompleteResponse, isErrorResponse } from '@kbn/data-plugin/public';

export interface MyPluginStartDependencies {
  data: DataPublicPluginStart;
}

export class MyPlugin implements Plugin {
  public start(core: CoreStart, { data }: MyPluginStartDependencies) {
    const query = {
      filter: [{
        match_all: {}
      }],
    };
    const req = {
      params: {
        index: 'my-index-*',
        body: {
          query,
          aggs: {},
        },
      }
    };
    data.search.search(req).subscribe({
      next: (result) => {
        if (isCompleteResponse(res)) {
          // handle search result
        } else if (isErrorResponse(res)) {
          // handle error, this means that some results were returned, but the search has failed to complete.
        } else {
          // handle partial results if you want.
        }
      },
      error: (e) => {
        // handle error thrown, for example a server hangup
      },
    })
  }
}
```

Note: The `data` plugin contains services to help you generate the `query` and `aggs` portions, as well as managing indices using the `data.indexPatterns` service.

:::{note} Server Side Search
The `data.search` service is available on both server and client, with similar APIs.
:::

#### Error handling

The `search` method can throw several types of errors, for example:

- `EsError` for errors originating in Elasticsearch errors
- `PainlessError` for errors originating from a Painless script
- `AbortError` if the search was aborted via an `AbortController`
- `HttpError` in case of a network error

To display the errors in the context of an application, use the helper method provided on the `data.search` service. These errors are shown in a toast message, using the `core.notifications` service.

```ts
data.search.search(req).subscribe({
  next: (result) => {},
  error: (e) => {
    data.search.showError(e);
  },
});
```

If you decide to handle errors by yourself, watch for errors coming from `Elasticsearch`. They have an additional `attributes` property that holds the raw error from `Elasticsearch`.

```ts
data.search.search(req).subscribe({
  next: (result) => {},
  error: (e) => {
    if (e instanceof IEsError) {
      showErrorReason(e.attributes);
    }
  },
});
```

#### Stop a running search

The search service `search` method supports a second argument called `options`. One of these options provides an `abortSignal` to stop searches from running to completion, if the result is no longer needed.

```ts
import { AbortError } from '@kbn/kibana-utils-plugin/common';

const abortController = new AbortController();
data.search
  .search(req, {
    abortSignal: abortController.signal,
  })
  .subscribe({
    next: (result) => {
      // handle result
    },
    error: (e) => {
      if (e instanceof AbortError) {
        // you can ignore this error
        return;
      }
      // handle error, for example a server hangup
    },
  });

// Abort the search request after a second
setTimeout(() => {
  abortController.abort();
}, 1000);
```

:::{important} Cancel your searches if results are no longer needed
Users might no longer be interested in search results. For example, they might start a new search
  or leave your app without waiting for the results. You should handle such cases by using
  `AbortController` with search API.
:::

#### Search strategies

By default, the search service uses the DSL query and aggregation syntax and returns the response from Elasticsearch as is. It also provides several additional basic strategies, such as Async DSL (`x-pack` default) and EQL.

For example, to run an EQL query using the `data.search` service, you should to specify the strategy name using the options parameter:

```ts
const req = getEqlRequest();
data.search
  .search(req, {
    strategy: EQL_SEARCH_STRATEGY,
  })
  .subscribe({
    next: (result) => {
      // handle EQL result
    },
  });
```

##### Custom search strategies

To use a different query syntax, preprocess the request, or process the response before returning it to the client, you can create and register a custom search strategy to encapsulate your custom logic.

The following example shows how to define, register, and use a search strategy that preprocesses the request before sending it to the default DSL search strategy, and then processes the response before returning.

```ts
// ./myPlugin/server/myStrategy.ts

/**
 * Your custom search strategy should implement the ISearchStrategy interface, requiring at minimum a `search` function.
 */
export const mySearchStrategyProvider = (
  data: PluginStart
): ISearchStrategy<IMyStrategyRequest, IMyStrategyResponse> => {
  const preprocessRequest = (request: IMyStrategyRequest) => {
    // Custom preprocessing
  };

  const formatResponse = (response: IMyStrategyResponse) => {
    // Custom post-processing
  };

  // Get the default search strategy
  const es = data.search.getSearchStrategy(ES_SEARCH_STRATEGY);
  return {
    search: (request, options, deps) => {
      return formatResponse(es.search(preprocessRequest(request), options, deps));
    },
  };
};
```

```ts
// ./myPlugin/server/plugin.ts
import type { CoreSetup, CoreStart, Plugin } from '@kbn/core/server';

import { mySearchStrategyProvider } from './my_strategy';

/**
 * Your plugin will receive the `data` plugin contact in both the setup and start lifecycle hooks.
 */
export interface MyPluginSetupDeps {
  data: PluginSetup;
}

export interface MyPluginStartDeps {
  data: PluginStart;
}

/**
 * In your custom server side plugin, register the strategy from the setup contract
 */
export class MyPlugin implements Plugin {
  public setup(core: CoreSetup<MyPluginStartDeps>, deps: MyPluginSetupDeps) {
    core.getStartServices().then(([_, depsStart]) => {
      const myStrategy = mySearchStrategyProvider(depsStart.data);
      deps.data.search.registerSearchStrategy('myCustomStrategy', myStrategy);
    });
  }
}
```

```ts
// ./myPlugin/public/plugin.ts
const req = getRequest();
data.search
  .search(req, {
    strategy: 'myCustomStrategy',
  })
  .subscribe({
    next: (result) => {
      // handle result
    },
  });
```

##### Async search and custom async search strategies

The open source default search strategy (`ES_SEARCH_STRATEGY`), run searches synchronously, keeping an open connection to Elasticsearch while the query executes. The duration of these queries is restricted by the `elasticsearch.requestTimeout` setting in `kibana.yml`, which is 30 seconds by default.

This synchronous execution works great in most cases. However, with the introduction of features such as `data tiers` and `runtime fields`, the need to allow slower-running queries, where holding an open connection might be inefficient, has increased. In 7.7, `Elasticsearch` introduced the [async_search API](https://www.elastic.co/guide/en/elasticsearch/reference/current/async-search.html), allowing a query to run longer without keeping an open connection. Instead, the initial search request returns an ID that identifies the search running in `Elasticsearch`. This ID can then be used to retrieve, cancel, or manage the search result.

The [async_search API](https://www.elastic.co/guide/en/elasticsearch/reference/current/async-search.html) is what drives more advanced `Kibana` `search` features, such as `partial results` and `search sessions`. [When available](https://www.elastic.co/subscriptions), the default search strategy of `Kibana` is automatically set to the **async** default search strategy (`ENHANCED_ES_SEARCH_STRATEGY`), empowering Kibana to run longer queries, with an **optional** duration restriction defined by the UI setting `search:timeout`.

If you are implementing your own async custom search strategy, make sure to implement `cancel` and `extend`, as shown in the following example:

```ts
// ./myPlugin/server/myEnhancedStrategy.ts
export const myEnhancedSearchStrategyProvider = (
  data: PluginStart
): ISearchStrategy<IMyStrategyRequest, IMyStrategyResponse> => {
  // Get the default search strategy
  const ese = data.search.getSearchStrategy(ENHANCED_ES_SEARCH_STRATEGY);
  return {
    search: (request, options, deps) => {
      // search will be called multiple times,
      // be sure your response formatting is capable of handling partial results, as well as the final result.
      return formatResponse(ese.search(request, options, deps));
    },
    cancel: async (id, options, deps) => {
      // call the cancel method of the async strategy you are using or implement your own cancellation function.
      await ese.cancel(id, options, deps);
    },
    extend: async (id, keepAlive, options, deps) => {
      // async search results are not stored indefinitely. By default, they expire after 7 days (or as defined by data.search.sessions.defaultExpiration setting in kibana.yml).
      // call the extend method of the async strategy you are using or implement your own extend function.
      await ese.extend(id, options, deps);
    },
  };
};
```

### High level search

The high level search service is a simplified way to create and run search requests, without writing custom DSL queries.

#### Search source

```ts
function searchWithSearchSource() {
  const indexPattern = data.indexPatterns.getDefault();
  const query = data.query.queryString.getQuery();
  const filters = data.query.filterManager.getFilters();
  const timefilter = data.query.timefilter.timefilter.createFilter(indexPattern);
  if (timefilter) {
    filters.push(timefilter);
  }

  const searchSource = await data.search.searchSource.create();

  searchSource
    .setField('index', indexPattern)
    .setField('filter', filters)
    .setField('query', query)
    .setField('fields', selectedFields.length ? selectedFields.map((f) => f.name) : ['*'])
    .setField('aggs', getAggsDsl());

  searchSource.fetch$().subscribe({
    next: () => {},
    error: () => {},
  });
}
```

### Partial results

When searching using an `async` strategy (such as async DSL and async EQL), the search service will stream back partial results.

Although you can ignore the partial results and wait for the final result before rendering, you can also use the partial results to create a more interactive experience for your users. It is highly advised, however, to make sure users are aware that the results they are seeing are partial.

```ts
// Handling partial results
data.search.search(req).subscribe({
  next: (result) => {
    if (isCompleteResponse(res)) {
      renderFinalResult(res);
    } else if (isPartialResponse(res)) {
      renderPartialResult(res);
    }
  },
});

// Skipping partial results
const finalResult = await data.search.search(req).toPromise();
```

### Search sessions

A search session is a higher level concept than search. A search session describes a grouping of one or more async search requests with additional context.

Search sessions are handy when you want to enable a user to run something asynchronously (for example, a dashboard over a long period of time), and then quickly restore the results at a later time. The `Search Service` transparently fetches results from the `.async-search` index, instead of running each request again.

Internally, any search run within a search session is saved into an object, allowing Kibana to manage their lifecycle. Most saved objects are deleted automatically after a short period of time, but if a user chooses to save the search session, the saved object is persisted, so that results can be restored in a later time.

Stored search sessions are listed in the _Management_ application, under _Kibana > Search Sessions_, making it easy to find, manage, and restore them.

As a developer, you might encounter these two common, use cases:

- Running a search inside an existing search session
- Supporting search sessions in your application

#### Running a search inside an existing search session

For this example, assume you are implementing a new type of `Embeddable` that will be shown on dashboards. The same principle applies, however, to any search requests that you are running, as long as the application you are running inside is managing an active session.

Because the Dashboard application is already managing a search session, all you need to do is pass down the `searchSessionId` argument to any `search` call. This applies to both the low and high level search APIs.

The search information will be added to the saved object for the search session.

```ts
export class SearchEmbeddable extends Embeddable<MyInput, MyOutput> {
  private async fetchData() {
    // Every embeddable receives an optional `searchSessionId` input parameter.
    const { searchSessionId } = this.input;

    // Setup your search source
    this.configureSearchSource();

    try {
      // Mark the embeddable as loading
      this.updateOutput({ loading: true, error: undefined });

      // Make the request, wait for the final result
      const { rawResponse: resp } = await searchSource
        .fetch$({
          sessionId: searchSessionId,
        })
        .toPromise();

      this.useSearchResult(resp);

      this.updateOutput({ loading: false, error: undefined });
    } catch (error) {
      // handle search errors
      this.updateOutput({ loading: false, error });
    }
  }
}
```

You can also retrieve the active `Search Session ID` from the `Search Service` directly:

```ts
async function fetchData(data: DataPublicPluginStart) {
  try {
    return await searchSource
      .fetch$({
        sessionId: data.search.sessions.getSessionId(),
      })
      .toPromise();
  } catch (e) {
    // handle search errors
  }
}
```

:::{note} Search Sessions with Server Side Search
Search sessions are initiated by the client. If you are using a route that runs server side
  searches, you can send the `searchSessionId` to the server, and then pass it down to the server
  side `data.search` function call.
:::

#### Supporting search sessions in your application

Before implementing the ability to create and restore search sessions in your application, ask yourself the following questions:

1. **Does your application normally run long operations?** For example, it makes sense for a user to generate a Dashboard or a Canvas report from data stored in cold storage. However, when editing a single visualization, it is best to work with a shorter timeframe of hot or warm data.
2. **Does it make sense for your application to restore a search session?** For example, you might want to restore an interesting configuration of filters of older documents you found in Discover. However, a single Lens or Map visualization might not be as helpful, outside the context of a specific dashboard.
3. **What is a search session in the context of your application?** Although Discover and Dashboard start a new search session every time the time range or filters change, or when the user clicks **Refresh**, you can manage your sessions differently. For example, if your application has tabs, you might group searches from multiple tabs into a single search session. You must be able to clearly define the **state** used to create the search session`. The **state** refers to any setting that might change the queries being set to `Elasticsearch`.

Once you answer those questions, proceed to implement the following bits of code in your application.

##### Provide storage configuration

In your plugin's `start` lifecycle method, call the `enableStorage` method. This method helps the `Session Service` gather the information required to save the search sessions upon a user's request and construct the restore state:

```ts
export class MyPlugin implements Plugin {
  public start(core: CoreStart, { data }: MyPluginStartDependencies) {
    const sessionRestorationDataProvider: SearchSessionInfoProvider = {
      data,
      getDashboard,
    };

    data.search.session.enableStorage({
      getName: async () => {
        // return the name you want to give the saved Search Session
        return `MyApp_${Math.random()}`;
      },
      getLocatorData: async () => {
        return {
          id: MY_LOCATOR,
          initialState: getLocatorParams({ ...deps, shouldRestoreSearchSession: false }),
          restoreState: getLocatorParams({ ...deps, shouldRestoreSearchSession: true }),
        };
      },
    });
  }
}
```

:::{note} Search sessions restore state
The restore state of a search session may be different from the initial state used to create it.
  For example, where the initial state may contain relative dates, in the restore state, those must
  be converted to absolute dates. Read more about the NowProvider.
:::

:::{important} Search sessions indicator
Calling `enableStorage` will also enable the `Search Session Indicator` component in the chrome
  component of your solution. The `Search Session Indicator` is a small button, used by default to
  engage users and save new search sessions. To implement your own UI, contact the Kibana
  application services team to decouple this behavior.
:::

##### Start a new search session

Make sure to call `start` when the **state** you previously defined changes.

```ts
function onSearchSessionConfigChange() {
  this.searchSessionId = data.search.sessions.start();
}
```

Pass the `searchSessionId` to every `search` call inside your application. If you're using `Embeddables`, pass down the `searchSessionId` as `input`.

If you can't pass the `searchSessionId` directly, you can retrieve it from the service.

```ts
const currentSearchSessionId = data.search.sessions.getSessionId();
```

##### Clear search sessions

Creating a new search session clears the previous one. You must explicitly `clear` the search session when your application is being destroyed:

```ts
function onDestroy() {
  data.search.session.clear();
}
```

If you don't call `clear`, you will see a warning in the console while developing. However, when running in production, you will get a fatal error. This is done to avoid leakage of unrelated search requests into an existing search session left open by mistake.

##### Restore search sessions

The last step of the integration is restoring an existing search session. The `searchSessionId` parameter and the rest of the restore state are passed into the application via the URL. Non-URL support is planned for future releases.

If you detect the presence of a `searchSessionId` parameter in the URL, call the `restore` method **instead** of calling `start`. The previous example would now become:

```ts
function onSearchSessionConfigChange(searchSessionIdFromUrl?: string) {
  if (searchSessionIdFromUrl) {
    data.search.sessions.restore(searchSessionIdFromUrl);
  } else {
    data.search.sessions.start();
  }
}
```

Once you `restore` the session, as long as all `search` requests run with the same `searchSessionId`, the search session should be seamlessly restored.

##### Customize the user experience

TBD