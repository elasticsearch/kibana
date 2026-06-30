---
mapped_pages:
  - https://www.elastic.co/guide/en/kibana/current/reporting-integration.html
---

# Reporting integration [reporting-integration]

Applications abide by a contract that {{report-features}} use to determine the information that is required to request exports of data from {{kib}}, and how to generate and store the reports.

::::{important}
These pages document internal APIs and are not guaranteed to be supported across future versions of {{kib}}. However, these docs will be kept up-to-date to reflect the current implementation of Reporting integration in {{kib}}.

::::



### Reporting Export Types [_reporting_export_types]

"Export Types" are pieces of code that plug into the {{kib}} Reporting framework, and are responsible for exporting data on behalf of a {{kib}} application. These pieces of code are implemented as TypeScript classes that extend an abstract base class, and implement methods for controlling the creation of report jobs, and asynchronously generating report contents. Their `createJob` methods handle requests to create report jobs, by accepting jobParams objects and returning "task payload" objects. Their `runTask` methods generate the report contents by accepting the task payload object created from the `createJob` function, which is then stored in a system index in Elasticsearch.


### Share menu extensions [reporting-share-service-registrations]

X-Pack services, such as the {{report-features}}, register with the `share` plugin of the Kibana platform to register additional actions available to make content shareable.


### Generate a report job URL [_generate_a_report_job_url]

To generate a new reporting job, different export types require different `jobParams` objects, which are Rison-encoded and used as a `jobParams` query string variable in the Reporting generation endpoint URL. If you use the aforementioned [Sharing plugin registrations](#reporting-share-service-registrations) then this detail will be abstracted away. If your application does not use the Share menu extensions, you will have to generate the URL and create a POST request to the URL.


### Basic job parameters [_basic_job_parameters]

Certain fields of Reporting job parameters are required for every type of export.

```
interface BaseParams {
  title: string; <1>
  objectType: string; <2>
  browserTimezone: string; <3>
  version: string; <4>
};
```

1. The `title` for the report. This is shown in the listing of reports in **Stack Management > Alerts and Insights > Reporting** and used as the filename when the report is downloaded.
2. The `objectType` field is automatically added when using internal Reporting APIs. This value used for choosing an icon for the report job in the listing of reports in {{kib}}.
3. The `browserTimezone` field is automatically added when using internal Reporting APIs to craft the job parameters. This is used to correctly format time-based data in the user’s desired timezone.
4. The `version` field is automatically added when using internal Reporting APIs. This is used in cases where job parameters are reused after an upgrade of Kibana, and a migration may be needed.



### CSV [_csv]


#### Job parameters of CsvSearchSource [_job_parameters_of_csvsearchsource]

The export type to generate CSV reports and is available in Discover uses "search source" objects. This export type is called `csv_searchsource` in the code. A configuration for a CSV report job is represented with an interface that includes the `BaseParams` and the following fields. To create a request for a CSV report, these required job parameters are Rison encoded into a query string variable of the report generation URL:

```
interface JobParamsCSV {
  searchSource: SerializedSearchSourceFields; <1>
  columns?: string[]; <2>
};
```

1. An object of serialized data that internally represents a search object in Kibana. It will contain a reference to a DataView saved object.
2. An array of field names to include as columns in the CSV report.



#### Job parameters of CsvFromSavedObject [_job_parameters_of_csvfromsavedobject]

A newer export type to generate CSV reports is available, currently only by API. This export type is called `csv_v2` in the code.

```
interface JobParamsCsvFromSavedObject {
  locatorParams: LocatorParams[]; <1>
};
```

1. The `locatorParams` value is controlled by the Discover application and identifies a search loaded in Discover, including the selection of DataView, columns and filters. Only a single value in the array is permitted in the `createJob` method.



#### Job payload [_job_payload]

After the job parameters are received by the route handler for the report generation URL, an additional field is automatically added to the fields from job parameters:

```
interface TaskPayloadCSV {
  pagingStrategy: 'scan' | 'pit' <1>
}
```

1. The `pagingStrategy` value is taken from the value of the `xpack.reporting.csv.scroll.strategy` setting in kibana.yml and used to control how the `runTask` method pages through all of the data.



### PDF and PNG [_pdf_and_png]


#### Job parameters [_job_parameters]

A configuration for a PDF or PNG report job is represented with an interface that includes the `BaseParams` and the following fields. To create a request for one of these report types, these required job parameters are encoded into a query string variable of the report generation URL:

```
interface BaseParamsPDFV2 {
  layout: {
    id: string; <1>
    dimensions: {
      height: number;
      width: number;
    };
  };
  locatorParams: LocatorParams[]; <2>
}

interface BaseParamsPNGV2 {
  layout: {
    id: string; <3>
    dimensions: {
      height: number;
      width: number;
    };
  };
  locatorParams: LocatorParams; <4>
}
```

1. The available `layout.id` options for PDF exports are `preserve_layout`, `print`, and `canvas`. These control how dashboard panels are captured and positioned into pages in the PDF file.
2. The `locatorParams` value is controlled by the application loaded in the browser for which a screenshot will be captured. The parameters to generate a PDF report allow an array of `locatorParams` to support multi-page PDF reports.
3. The only available `layout.id` option for PNG exports is `preserve_layout`.
4. The parameters to generate a PNG report allow a single value for `locatorParams`.



#### How applications make themselves screenshot-capable [_how_applications_make_themselves_screenshot_capable]

When generating the PDF, the headless browser launched by the Reporting export type runs a script that looks for a number of attributes in the DOM to determine which elements should have their screenshot taken and when the Visualizations are done rendering.

The print layout takes a screenshot of every element with the `data-shared-item` attribute and includes the individual screenshots in the PDF. The print layout also uses the `data-title` and `data-description` attributes on the same HTMLElement as the `data-shared-item` to specify the title and description.

The preserve layout takes a screenshot of the element with the `data-shared-items-container` attribute. Additionally, reporting will resize the element with the `data-shared-items-container` to be the size specified in the layout dimensions. The preserve layout also uses the `data-title` and `data-description` attributes on the HTMLElement with the `data-shared-items-container` attribute to specify the title/description for the entire PDF.

Reporting needs to determine when all of the visualizations have completed rendering, so that it can begin taking screenshots. If there are multiple visualizations, the `data-shared-items-count` attribute should be specified to let Reporting know how many Visualizations to look for. Reporting will look at every element with the `data-shared-item` attribute and use the corresponding `data-render-complete` attribute and `renderComplete` events to listen for rendering to complete. When rendering is complete for a visualization the `data-render-complete` attribute should be set to "true" and it should dispatch a custom DOM `renderComplete` event.

If the reporting job uses multiple URLs, before looking for any of the `data-shared-item` or `data-shared-items-count` attributes, it waits for a `data-shared-page` attribute that specifies which page is being loaded.

## Using POST URLs for debugging [_using_post_urls_for_debugging]

Developers can capture a POST URL from a reporting-capable application to access the `jobParams` query string variable in the public API report generation endpoint. The query string variable can be passed through a URL de-encoder and then passed through a Rison-to-JSON converter to make the job parameters human-readable.

If attempting to send requests to the POST URL to test generating a report, use a shell script containing the curl command that POSTs the request. This will avoid any unintentional character escaping that can happen if running the curl command in an interactive shell.
