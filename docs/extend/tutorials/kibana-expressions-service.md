---
navigation_title: "Kibana Expressions Service"
description: "Kibana Expressions Service"
---

# Kibana Expressions Service

## What are expressions?

An expression pipeline is a chain of functions that **pipe** output to the input of the next function. Functions can be configured using arguments provided by the user. The final output of the expression pipeline can be rendered using one of the **renderers** registered in the `expressions` plugin.

All function arguments, inputs, and outputs must be serializable. Expression functions should stay *pure* — this makes them easy to reuse and enables the entire chain (and its intermediate outputs) to be serialized.

Expressions can include comments: `//` for single-line, `/* ... */` for multi-line.

Expressions power visualizations in Dashboard and Lens. Every element in Canvas is backed by an expression. Here is an example Canvas expression that fetches data from Elasticsearch, applies a calculation, and renders a metric:

```
filters
| essql
  query="SELECT COUNT(timestamp) as total_errors
    FROM kibana_sample_data_logs
    WHERE tags LIKE '%warning%' OR tags LIKE '%error%'"
| math "total_errors"
| metric "TOTAL ISSUES"
  metricFont={font family="'Open Sans', Helvetica, Arial, sans-serif" size=48 align="left" color="#FFFFFF" weight="normal" underline=false italic=false}
  labelFont={font family="'Open Sans', Helvetica, Arial, sans-serif" size=30 align="left" color="#FFFFFF" weight="lighter" underline=false italic=false}
| render
```

## Expressions service

Expression service exposes a registry of reusable functions primary used for fetching and transposing data and a registry of renderer functions that can render data into a DOM element.
Adding functions is easy and so is reusing them.
 
An expression is a chain of functions with provided arguments, which given a single input translates to a single output.
Each expression is representable by a human friendly string which a user can type.

### Creating expressions

Here is a very simple expression string:

```
essql 'select column1, column2 from myindex' | mapColumn name=column3 fn='{ column1 + 3 }' | table
```

It consists of 3 functions:

 - `essql` which runs given sql query against elasticsearch and returns the results
 - `mapColumn`, which computes a new column from existing ones;
 - `table`, which prepares the data for rendering in a tabular format.

The same expression could also be constructed in the code:

```ts
import { buildExpression, buildExpressionFunction } from 'src/plugins/expressions';

const expression = buildExpression([
  buildExpressionFunction<ExpressionFunctionEssql>('essql', [ q: 'select column1, column2 from myindex' ]),
  buildExpressionFunction<ExpressionFunctionMapColumn>('mapColumn', [ name: 'column3', expression: 'column1 + 3' ]),
  buildExpressionFunction<ExpressionFunctionTable>('table'),
]
```

Note: Consumers need to be aware which plugin registers specific functions with expressions function registry and import correct type definitions from there.

:::{note}
The `expressions` service is available on both server and client, with similar APIs.
:::

### Running expressions

Expression service exposes `execute` method which allows you to execute an expression:

```ts
const executionContract = expressions.execute(expression, input);
const result = await executionContract.getData();
```

:::{note}
Check the full spec of execute function here
:::

In addition, on the browser side, there are two additional ways to run expressions and render the results.

#### React expression renderer component

This is the easiest way to get expressions rendered inside your application.

```ts
<ReactExpressionRenderer expression={expression} />
```

:::{note}
Check the full spec of ReactExpressionRenderer component props here
:::

#### Expression loader

If you are not using React, you can use the loader expression service provides to achieve the same:

```ts
const handler = loader(domElement, expression, params);
```

:::{note}
Check the full spec of expression loader params here
:::

### Creating new expression functions

Creating a new expression function is easy, just call `registerFunction` method on expressions service setup contract with your function definition:

```ts
const functionDefinition = {
   name: 'clog',
   args: {},
   help: 'Outputs the context to the console',
   fn: (input: unknown) => {
     // eslint-disable-next-line no-console
     console.log(input);
     return input;
   },
};

expressions.registerFunction(functionDefinition);
```

:::{note}
Check the full interface of ExpressionFuntionDefinition here
:::

### Creating new expression renderers

Adding new renderers is just as easy as adding functions:

```ts
const rendererDefinition = {
   name: 'debug',
   help: 'Outputs the context to the dom element',
   render: (domElement, input, handlers) => {
     // eslint-disable-next-line no-console
     domElement.innerText = JSON.strinfigy(input);
     handlers.done();
   },
};

expressions.registerRenderer(rendererDefinition);
```

:::{note}
Check the full interface of ExpressionRendererDefinition here
:::