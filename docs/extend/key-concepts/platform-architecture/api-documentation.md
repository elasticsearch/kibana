---
navigation_title: "API documentation"
description: "How to use our automatically generated API documentation"
---

# API documentation

Welcome to our automatically generated typescript API 
documentation for every plugin that exposes a [public API](./plugins-packages-and-the-platform.md#public-plugin-api)!

:::{warning} Experimental
This documentation is being automatically generated using an
 [_experimental_ system](https://github.com/elastic/kibana/blob/main/legacy_rfcs/text/0014_api_documentation.md). That means
 it may be removed or modified at any time. If you have any questions, feedback or concerns, please create an issue using
  the label `APIDocs`, or reach out to the Kibana Tech Leads
 who are temporarily owning and maintaining this system.
:::

## API docs contribution guidelines

To learn more about how to write docs specifically for our [API references](https://www.elastic.co/docs/api/), refer to the [Contribute to Elastic API docs](https://www.elastic.co/docs/extend/contribute/api-docs/).

## What is included

Every plugin that 
[exposes functionality for other plugins to use](./plugins-packages-and-the-platform.md#public-plugin-api) will have
API documentation automatically generated (note this system 
does *not* handle REST APIs).

:::{note} @internal tags
API items that have an `@internal` in the comment are not 
included in the documentation system.
:::


## Q & A 

### Why do I not see my plugin's public API?

There is one extra step required to have your API docs show up in the _navigation_ of the docs system. Follow
the instructions here to learn how to 
configure the navigation menu.  The nav file you need to
 edit is: [https://github.com/elastic/elastic-docs-prototype/blob/master/config/nav-kibana-dev.ts](https://github.com/elastic/elastic-docs-prototype/blob/master/config/nav-kibana-dev.ts)

Your API docs will exist in the top level [`api_docs` folder](https://github.com/elastic/kibana/tree/main/api_docs) and will use a doc id of the pattern `kib${PluginName}PluginApi`.

### Why is a referenced API item not showing up as clickable?

There are a few reasons his could happen. First, check if you are exporting the API item. For example,
if you have the following in your `my_plugin/public/index.ts` file:

```
type Bar = { id: string };
export type Foo = Bar | string;
```

`Bar`, in the signature of `Foo`, will not be clickable because it would result in a broken link. `Bar` is not publicly exported!

If that isn't the case, please file an issue, it could be a bug with the system.

### Why are the docs so slow?

We are [aware of some performance issues](https://github.com/elastic/elastic-docs/issues/274) with deeply nested, or large APIs.

In the short term, the best thing you can do is avoid deeply nested API items. Use interfaces rather than inlined objects. Also consider
adding `serviceFolders` in your kibana.jsonc. This will automatically split your docs up based on which APIs are defined within the service folders.
They will get built into a doc with an id of
`kib${PluginName}${ServiceName}PluginApi`. The data plugin does this, so you
 can [check that out as an example](https://github.com/elastic/kibana/blob/main/src/platform/plugins/shared/data/kibana.jsonc#L11-L15).

 If that isn't the case and you are still experiencing performance issues, please file an issue!

### Where do I ask questions or give feedback?

If you have any questions or issues, please reach out to the Kibana Tech Leads or create an issue [here](https://github.com/elastic/kibana/issues)
and use the label `APIDocs`.