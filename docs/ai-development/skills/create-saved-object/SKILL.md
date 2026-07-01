---
name: create-saved-object
description: Create a new saved object type — schema, modelVersions, registration, and CRUD usage
---

# Create saved object type in a Kibana plugin

Use this skill when the user wants to add a new saved object type to a plugin (e.g. "add a saved object for X" or "create a type that stores Y with fields Z").

## Inputs

- **Plugin path** — where the plugin lives
- **Type name** — kebab-case constant (e.g. `my_plugin_workspace`) used as the saved object type
- **Attributes** — field names and types (e.g. title: string, count: number, config: object). Decide namespace: single (one per space), multiple, or multiple-isolated

## Steps

1. **Define the type constant** in `common/` (e.g. `common/constants.ts`) so public and server can share it: `export const MY_TYPE_SAVED_OBJECT_TYPE = 'my_plugin_workspace';`.

2. **Create attribute schema** (e.g. `server/saved_objects/my_type/schema/v1/v1.ts`) using `@kbn/config-schema`: define an object schema for all attributes. Export it (e.g. `myTypeAttributesSchema`).

3. **Create the SavedObjectsType** (e.g. `server/saved_objects/my_type/my_type.ts`):
   - `name`: the type constant
   - `namespaceType`: `'single'`, `'multiple'`, or `'multiple-isolated'` per product requirements
   - `hidden`: `true` only if the type is internal and should not appear in default listings
   - `indexPattern`: use default Kibana index or the solution’s index (e.g. `SEARCH_SOLUTION_SAVED_OBJECT_INDEX`) if the plugin is in a solution
   - `mappings`: Elasticsearch mapping — `dynamic: false`, `properties` for each attribute (use `keyword`, `text`, `integer`, etc. as appropriate)
   - `modelVersions`: start with `1` — `changes: []`, `schemas.create`: your config-schema (or Zod). Optionally `schemas.forwardCompatibility` for lenient reads

4. **Register the type** in the plugin’s `setup()`: `core.savedObjects.registerType(createMyTypeSavedObjectType())`. Call this in the same file where you set up routes (e.g. server plugin class).

5. **Use the type in CRUD** — In route handlers or services, use `core.savedObjects.getScopedClient(request)` (or the client from start contract). Create with `client.create(type, attributes, { references })`, get with `client.get(type, id)`, update with `client.update(type, id, attributes)`, delete with `client.delete(type, id)`. Handle 409 conflicts and return appropriate HTTP status and body.

6. **Optional: export CRUD helpers** — If the plugin will do a lot of saved object work, add small functions (e.g. `getWorkspace(client, id)`, `saveWorkspace(client, attributes)`) that wrap the client calls and keep route handlers thin.

## Validation (run these and fix any failures)

1. **Type check:** Run `node scripts/type_check` from repo root. Fix any errors in the new or modified files.
2. **Lint:** Run `node scripts/eslint_all_files` for the changed paths. Fix any violations.
3. **Unit test:** If you added migrations or model version logic, add a Jest test that applies the schema/transform to sample documents and assert the result.
4. **Integration (optional):** Add an FTR API test that creates, reads, updates, and deletes the saved object (via supertest or the savedObjects service) and clean up in afterEach.

After validation, report: type name, file(s) created, and that type-check and lint pass (and tests if added).
