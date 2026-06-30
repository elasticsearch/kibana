---
navigation_title: "Versioning interfaces"
description: "We need to keep old versions of interfaces available. This tutorial describes a strategy for managing versions of your interfaces over time."
---

# Versioning interfaces

To support versioned APIs we need to keep past versions of interfaces around. This tutorial presents one strategy to manage your interfaces.

## The strategy

Every plugin has a _domain_. A domain consists of one or more concepts, usually objects, that are related in some logical way.

At a high level the strategy for versioning our interfaces is:

> Version a collection of related interfaces together. Whenever a single interface changes, increment the version of the entire collection of interfaces.

Characteristics of this strategy:

1. Avoid the `extends` keyword for referencing past interfaces. This results in cleaner API docs being generated.
2. Leverage `* as` to create versioned namespaces rather than versioned interfaces.
3. Verbosity is intentional: for a single change in a collection, we create a new version of the related collection.

### An example: Weather insights unversioned
Consider a fictional Kibana plugin called "Weather insights". It allows users to easily create and curate dashboards that house visualisations and metrics for weather data. The domain contains the following:

1. **Data source**: an endpoint that is scraped and ingested into ES for aggregation and search.
2. **Weather dashboard**: a set of visualisations and metrics that draws from a data source.

We have the following `common` interfaces:

```ts
export interface DataSource {
  /** Some URL that provides weather data in an expected format for scraping */
  url: string;
  /** The data view data is stored in */
  dataViewId: string;
  /** Username to use with source URL */
  username?: string;
  /** Password to use with source URL */
  password?: string;
}

/** Fictional type, only used for this example as an external type */
import type { PortableDashboard } from '@kbn/dashboard/common';

export interface WeatherDashboard {
  /** A unique ID for this weather dashboard */
  id: string;
  /** Definition of a dashboard imported from the `dashboard` plugin */
  dashboard: PortableDashboard;
  /** Data source to use with this dashboard */
  source: DataSource;
}

type UnsavedWeatherDashboard = Omit<WeatherDashboard, 'id'>;

/** Below are the HTTP APIs based on the domain types */

export interface GetWeatherDashboardHTTPResponse {
  weatherDashboard: WeatherDashboard;
}

export interface CreateWeatherDashboardHTTPBody {
  weatherDashboard: UnsavedWeatherDashboard;
}

export interface CreateWeatherDashboardHTTPResponse {
  weatherDashboard: WeatherDashboard;
}

// Imagine this pattern for the update and list endpoints too.
```

These interfaces might be in use by an unversioned HTTP route such as:

```ts
import type { GetWeatherDashboardHTTPResponse } from '../common';

const handler = (ctx, req, res) => {
  const body: GetWeatherDashboardHTTPResponse = { ... };
  return res.ok({ body });
}
```

### An example: Weather insights versioned

The following product requirements are added to the Weather insights plugin:

1. Data sources need a more user-friendly `name`, currently we just show a URL
2. Some users have said they'd like to give data sources a short `description` too
3. New feature: **Predictions** that will generate forecasts based on past and current weather data

Before we make these changes, we need to make sure that our current interfaces are not lost.

#### Preparing our interfaces for versions

We are going to make our current set of interfaces `v1`. Let's reflect this in our code by creating this file structure in `common`:

```
common
  index.ts
  latest.ts
  data_source
    v1.ts
  weather_dashboard
    v1.ts
public
  ...
server
  ...
```

By placing `DataSource` and `WeatherDashboard` in two folders we indicate that they _could_ version independently. Specifically,
`WeatherDashboard` may version independently of `DataSource`.

**Note:** At this stage, splitting these concepts may be overkill if we expect `WeatherDashboard` to _rarely_ change, but for this example we would like the ability to version them separately.

The `latest.ts` file is going to act as an alias to the latest set of interfaces. It will look like this:

```ts
// "export *" is considered safe here because we ONLY have types in these files.
export * from './data_source/v1';
export * from './weather_data/v1';
```

Our `index.ts` file will contain:

```ts
// Explicit export of everything from latest
export { DataSource, WeatherDashboard, GetWeatherDashboardHTTPResponse } from './latest';

export * as weatherDashboardV1 from './weather_dashboard/v1';
export * as dataSourceV1 from './data_source/v1';
```

How we use these types depends on whether the code is aware of versions or not. Generally, code that is aware of multiple versions will lead to greater complexity. We might have a logger function that expects the latest dashboards:

```ts
// This type is being pulled from "latest", so whenever a new latest is linked,
// it will also point to the latest WeatherDashboard.
import type { WeatherDashboard } from '../common';

function logIt(dashboard: WeatherDashboard) {
  logger.debug(dashboard);
}
```

Or we might have a route handler that expects a specific version our domain objects:

```ts
// Now we bring it all together by using our versioned types in our handler from before:
import type { weatherDashboardV1 } from '../common';

const handler = (ctx, req, res) => {
  const body: weatherDashboardV1.GetWeatherDashboardHTTPResponse = { ... };
  return res.ok({ body });
}
```

:::{note} Minimize the impact of refactors
By referencing types linked from `latest.ts` we will not have to refactor all our app code to point to the latest version of `WeatherDashboard`. This happens by simply re-exporting the newest types from `latest.ts`. Otherwise, code that needs to know about a specific version or versions will have access to it by using the appropriate namespace.
:::

### Introducing a new field to `DataSource`

Now that we have prepared our interfaces to be versioned, let's introduce the `name` field to `DataSource`.

Create a new `v2.ts` file under the `data_source` directory:

```
common
  data_source
    v1.ts
    v2.ts
```

The `v2.ts` file will contain:

```ts
export interface DataSource {
  /** Some URL that provides weather data in an expected format for scraping */
  url: string;
  /** A user-friendly name */
  name: string;
  /** A longer description of this data source */
  description?: string;
  /** The data view data is stored in */
  dataViewId: string;
  /** Username to use with source URL */
  username?: string;
  /** Password to use with source URL */
  password?: string;
}
```

:::{note} What is a breaking change?
If we had only added the optional `description` field to `DataSource` this would be a backwards-compatible change that does not require a new version. We could have remained on `v1` of the `DataSource` interface.
:::

We also need to update the `WeatherDashboard` interface to use our new `DataSource` interface:

```
common
  weather_dashboard
    v1.ts
    v2.ts
```

```ts
// common/weather_dashboard/v2.ts

// This is largely a copy of v1.ts, but using a new WeatherDashboard type in all
// the relevant places

/** Fictional type, only used for this example as an external type */
import type { PortableDashboard } from '@kbn/dashboard/common';
import type { DataSource } from '../data_source/v2';

// Optionally, re-export the entire set of types. Interfaces and types declared after this will override v1 declarations.
export * from './v1';

export interface WeatherDashboard {
  /** A unique ID for this weather dashboard */
  id: string;
  /** Definition of a dashboard imported from the `dashboard` plugin */
  dashboard: PortableDashboard;
  /** Data source to use with this dashboard */
  source: DataSource;
}

type UnsavedWeatherDashboard = Omit<WeatherDashboard, 'id'>;

/** Below are the HTTP APIs based on the domain types */

export interface GetWeatherDashboardHTTPResponse {
  weatherDashboard: WeatherDashboard;
}

export interface CreateWeatherDashboardHTTPBody {
  weatherDashboard: UnsavedWeatherDashboard;
}

export interface CreateWeatherDashboardHTTPResponse {
  weatherDashboard: WeatherDashboard;
}

// Imagine this pattern for the update and list endpoints too.

```

:::{note} Inherit types from the `v1` namespace
It is possible to add `export * from './v1';` to the top of our `weather_dashboard/v2.ts` file to re-export unchanged types and avoid copying the whole file.

 However, copying and adapting the entire set of types is OK too. If we have correctly grouped our sub-domains we should be versioning all collections of types together.
:::

Now we update the `latest.ts` and `index.ts` files accordingly:

```ts
// latest.ts
export * from './data_source/v2';
export * from './weather_dashboard/v2';
```

```ts
// index.ts
// Explicit export of everything from latest
export { DataSource, WeatherDashboard, GetWeatherDashboardHTTPResponse } from './latest';

export * as weatherDashboardV1 from './weather_dashboard/v1';
export * as dataSourceV1 from './data_source/v1';

export * as weatherDashboardV2 from './weather_dashboard/v2';
export * as dataSourceV2 from './data_source/v2';
```

### Introduce a new sub-domain: `Prediction`

For our second product requirement we are going to introduce a new concept. Let's start by updating our folder structure:

```
common
  index.ts
  latest.ts
  data_source
  weather_dashboard
  prediction
    v1.ts
```

```ts
// common/prediction/v1.ts

import type { DataSource } from '../data_source/v2';

/** Random set of weather models, just for illustration */
type Model = 'GFS' | 'ECMWF' | 'GEM';

/** Limited set of options rather than "string" so we can more easily version */
type TimeFrame = '1d' | '2d' | '3d' | '4d' | '5d' | '6d' | '1w' | '2w';

export interface PredictionInput {
  /** How far back we should look in our data */
  start_date: string; // !! Introduction of inconsistent snake case naming convention, will need a new version to fix
  /** How far out to predict. Note, longer time frames result in lower accuracy */
  timeFrame: TimeFrame;
  /** Choice of weather model to use */
  model: Model;
  /** Data source for this prediction */
  dataSource: DataSource;
}

export interface PredictionOutput { ... }

// Below are HTTP APIs for predictions

export interface CreatePredictionHTTPBody {
  input: PredictionInput;
}

export interface CreatePredictionHTTPResponse {
  result: PredictionOutput;
}

// And so forth...
```

:::{warning} Referenced interfaces affect one another
Both `WeatherDashboard` and `Prediction` reference `DataSource`. Therefore, both will increment their version whenever `DataSource` changes.
:::

## Challenge

Normalize our domain objects by only holding a reference to `DataSource` in `WeatherDashboard` and `Prediction` domain objects.

<details>
  <summary>Solution</summary>
  <hr />
  1. We will add a way to uniquely identify a `DataSource`
  2. `DataSource` is currently specified in both `WeatherDashboard` and `Prediction`, therefore both will need to be updated as well.

  Let's start by updating our folder structure to introduce the new versions.

```
common
 data_source
   v1.ts
   v2.ts
   v3.ts
 weather_dashboard
   v1.ts
   v2.ts
   v3.ts
 prediction
   v1.ts
   v2.ts
```

  Now, let's add our new types :

```ts
// common/data_source/v3.ts
export interface DataSource {
  /** A string that uniquely identifies a DataSource */
  id: string;
  /** Some URL that provides weather data in an expected format for scraping */
  url: string;
  /** A user-friendly name */
  name: string;
  /** A longer description of this data source */
  description?: string;
  /** The data view data is stored in */
  dataViewId: string;
  /** Username to use with source URL */
  username?: string;
  /** Password to use with source URL */
  password?: string;
}
// ...followed by all other HTTP related interfaces

// common/weather_dashboard/v3.ts
export interface WeatherDashboard {
  /** A unique ID for this weather dashboard */
  id: string;
  /** Definition of a dashboard imported from the `dashboard` plugin */
  dashboard: PortableDashboard;
  /** ID of the data source to use with this dashboard */
  dataSourceId: string;
}
// ...followed by all other HTTP related interfaces

// common/prediction/v3.ts
export interface PredictionInput {
  /** How far back we should look in our data */
  startDate: string; // Fixed inconsistent naming
  /** How far out to predict. Note, longer time frames result in lower accuracy */
  timeFrame: TimeFrame;
  /** Choice of weather model to use */
  model: Model;
  /** Data source for this prediction */
  dataSourceId: string;
}
// ...followed by all other HTTP related interfaces
```

  Next let's update `latest.ts` and `index.ts`:

```ts
// latest.ts
export * from './data_source/v3';
export * from './weather_dashboard/v3';
export * from './prediction/v3';

// index.ts
export { DataSource, WeatherDashboard, GetWeatherDashboardHTTPResponse, Prediction } from './latest';
export * as weatherDashboardV1 from './weather_dashboard/v1';
export * as dataSourceV1 from './data_source/v1';
export * as predictionV1 from './prediction/v1';

export * as weatherDashboardV2 from './weather_dashboard/v2';
export * as dataSourceV2 from './data_source/v2';
export * as predictionV2 from './prediction/v2';

export * as weatherDashboardV3 from './weather_dashboard/v3';
export * as dataSourceV3 from './data_source/v3';
```

  Refactoring interfaces in this way creates a much larger maintenance burden because:

  1. application code must now translate between the denormalized and normalized versions of these interfaces
  2. code must remember to support both old and new naming conventions

  ...for as long as these APIs are in use. We will not cover deprecation strategies in this tutorial (incoming). Sufficed to
  say: _take care when designing public APIs_.
</details>

## Additional resources

* [PR to prepare Saved Objects Management](https://github.com/elastic/kibana/pull/149495) for versioning