---
mapped_pages:
  - https://www.elastic.co/guide/en/kibana/current/legacy-url-aliases.html
---

# Legacy URL Aliases [legacy-url-aliases]

This page describes legacy URL aliases: what they are, where they come from, and how to disable them.

## Overview [legacy-url-aliases-overview]

Many saved object types were converted in {{kib}} 8.0, so they can eventually be shared across [spaces](docs-content://deploy-manage/manage-spaces.md). Before 8.0, you could have two objects with the same type and same ID in two different spaces. Part of this conversion is to make sure all object IDs of a given type are **globally unique across all spaces**.

{{kib}} creates a special entity called a **legacy URL alias** for each saved object that requires a new ID. This legacy URL alias allows {{kib}} to preserve any deep link URLs that exist for these objects.

There are two cases where a legacy URL alias will get generated.

1. During migration, when an object’s namespace type is being converted from the single-namespace type to a multi-namespace type. If the object resides in a non-default space, it gets a new ID and a legacy URL alias is generated.
2. During copy/import of saved objects, when any object requires a new ID **and the compatibilityMode option is enabled** (see the [copy saved objects to space](https://www.elastic.co/docs/api/doc/kibana/v8/group/endpoint-spaces) API and [PR #149021](https://github.com/elastic/kibana/pull/149021) for more information).


## Examples [legacy-url-aliases-example]

Consider the following scenarios:

### Migration scenario [_migration_scenario]

You have {{kib}} 7.16, and you create a new dashboard.The ID of this dashboard is "123". You create a new space called "Bill’s space" and [copy](docs-content://explore-analyze/find-and-organize/saved-objects.md#managing-saved-objects-copy-to-space) your dashboard to the other space. Now you have two different dashboards that can be accessed at the following URLs:

* **Default space**: `http://localhost:5601/app/dashboards#/view/123`
* **Bill’s space**: `http://localhost:5601/s/bills-space/app/dashboards#/view/123`

You use these two dashboards frequently, so you bookmark them in your web browser. After some time, you decide to upgrade to {{kib}} 8.0. When these two dashboards go through the conversion process, the one in "Bill’s space" will have its ID changed to "456". The URL to access that dashboard is different; not to worry though, there is a legacy URL alias for that dashboard.

If you use your bookmark to access that dashboard using its old URL, {{kib}} detects that you are using a legacy URL, and finds the new object ID. If you navigate to `http://localhost:5601/s/bills-space/app/dashboards#/view/123`, you’ll see a message indicating that the dashboard has a new URL, and you’re automatically redirected to `http://localhost:5601/s/bills-space/app/dashboards#/view/456`.


### Copy scenario (weak links) [_copy_scenario_weak_links]

You have a data view and two dashboards in the default space, but you would also like to have them in another space. One of the dashboards includes a Markdown visualization with a link to the other dashboard - a so-called **weak link**. This is a weak link because the ID of the referenced object is not added to the object’s references array, and therefore there is no explicit relationship between the objects.

If you were to use the [copy saved objects to space](https://www.elastic.co/docs/api/doc/kibana/v8/group/endpoint-spaces) API to create new copies of these assets in another space **without the `compatibilityMode` option set to true**, the Markdown link would be broken. The copied objects created in the target space receive a new ID, and the weak link in the Markdown visualization would point to the ID of the source object from the originating space.

By setting `compatibilityMode` to true when using the copy API, legacy aliases will be generated for any objects that require a new ID. This allows the weak link to the second dashboard to be resolved. Though a dashboard with the ID from the weak link will not be found, a legacy alias with this source ID will have been generated, and it will contain a target ID of the new local copy of the dashboard.



## Handling errors [legacy-url-aliases-handling-errors]

Legacy URL aliases are intended to be fully transparent, but there are rare situations where this can lead to an error. For example, you might have a dashboard and one of the visualizations fails to load, directing you to this page. If you encounter an error in this situation, you might want to disable the legacy URL alias completely. This leaves the saved object intact, and you will not lose any data. You just won’t be able to use the old URL to access that saved object.

To disable a legacy URL alias, you need three pieces of information: the `targetSpace`, the `targetType`, and the `sourceId`. Then use the [`_disable_legacy_url_aliases`](https://www.elastic.co/docs/api/doc/kibana/v8/group/endpoint-spaces) API to disable the problematic legacy URL alias.
