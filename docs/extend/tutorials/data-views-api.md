---
navigation_title: "Data views API"
description: "Data views API"
---

# Data views API

*Note: Kibana index patterns are currently being renamed to data views. There will be some naming inconsistencies until the transition is complete.*

### Data views API

- Get list of data views
- Get default data view and examine fields
- Get data view by id
- Find data view by title
- Create data view
- Create data view and save it
- Modify data view and save it
- Delete data view

#### Get list of data view titles and ids

```
const idsAndTitles = await data.indexPatterns.getIdsWithTitle();
idsAndTitles.forEach(({id, title}) => console.log(`Data view id: ${id} title: ${title}`));
```

#### Get default data view and examine fields

```
const defaultDataView = await data.indexPatterns.getDefault();
defaultDataView.fields.forEach(({name}) => { console.log(name); })
```

#### Get data view by id

```
const id = 'xxxxxx-xxx-xxxxxx';
const dataView = await data.indexPatterns.get(id);
```

#### Find data view by title

```
const title = 'kibana-*';
const [dataView] = await data.indexPatterns.find(title);
```

#### Create data view

```
const dataView = await data.indexPatterns.create({ title: 'kibana-*' });
```

#### Create data view and save it immediately

```
const dataView = await data.indexPatterns.createAndSave({ title: 'kibana-*' });
```

#### Create data view, modify, and save

```
const dataView = await data.indexPatterns.create({ title: 'kibana-*' });
dataView.setFieldCustomLabel('customer_name', 'Customer Name');
data.indexPatterns.createSavedObject(dataView);
```

#### Modify data view and save it

```
dataView.setFieldCustomLabel('customer_name', 'Customer Name');
await data.indexPatterns.updateSavedObject(dataView);
```

#### Delete index pattern

```
await data.indexPatterns.delete(dataViewId);
```

### Data view HTTP API

Rest-like HTTP CRUD+ API - [docs](https://www.elastic.co/guide/en/kibana/master/data-views-api.html)

### Services

#### **hasData:** A standardized way to check the empty state for indices and data views.
- `hasESData: () => Promise<boolean>; // Check to see if ES data exists`
- `hasDataView: () => Promise<boolean>; // Check to see if any data view exists (managed or user created)`
- `hasUserDataView: () => Promise<boolean>; // Check to see if user created data views exists`