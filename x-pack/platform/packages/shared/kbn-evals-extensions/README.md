# @kbn/evals-extensions

Experimental and advanced extensions for `@kbn/evals`.

This package is the home for evals capabilities that are experimental or too specialized to live in the core `@kbn/evals` framework. Mature features can later graduate into `@kbn/evals`.

## What lives here

- **Custom CLI commands** under the `ext` namespace, run via `node scripts/evals ext <command>`.

## Architecture

This package depends on `@kbn/evals`, never the other way around:

- `kbn-evals-extensions` CAN import from `kbn-evals`
- `kbn-evals` MUST NOT import from `kbn-evals-extensions`
- Evaluation suites can use both packages independently

## Usage

### CLI

```bash
node scripts/evals ext --help

node scripts/evals ext [command] [...args]
```

### In an evaluation suite

Suites opt in to extension features by importing them from `@kbn/evals-extensions` explicitly, alongside `@kbn/evals` core:

```typescript
import { evaluate } from '@kbn/evals';
import { createSomeEvaluator } from '@kbn/evals-extensions';

evaluate('my suite', async ({ executorClient }) => {
  await executorClient.runExperiment({ datasets: [dataset], task }, [
    // mix core and extension evaluators
    createSomeEvaluator(),
  ]);
});
```
