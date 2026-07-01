---
name: add-http-route
description: Add a new HTTP route to an existing Kibana plugin — handler, validation schemas, registration, and integration test
---

# Add HTTP route to a Kibana plugin

Use this skill when the user wants to add a new REST endpoint to an existing plugin (e.g. "add a GET /api/my_plugin/foo" or "add a POST route that accepts a body and returns JSON").

## Inputs

- **Plugin path** — where the plugin lives (e.g. `src/plugins/my_plugin` or `x-pack/plugins/...`)
- **Endpoint** — HTTP method and path (e.g. `GET /api/my_plugin/status`, `POST /internal/my_plugin/run`)
- **Request/response** — short description of request (query, body) and response shape so validation and types can be defined

## Steps

1. **Locate the plugin’s server setup.** Find where routes are registered (usually in `server/plugin.ts` or `server/routes/index.ts`). Check how existing routes are defined (e.g. `core.http.createRouter()` or `core.http.route()`).

2. **Define request validation.** Use Zod (or the repo’s standard, e.g. `@kbn/config-schema`) to define:
   - Query parameters (if any)
   - Body schema (for POST/PUT/PATCH)
   - Derive TypeScript types from the schema for use in the handler

3. **Implement the route handler:**
   - Accept `context` (with core services), `request`, and `response`
   - Parse and validate request (query/body) using the schema; return 400 with a clear message on validation failure
   - Perform the operation; catch errors, log appropriately, and return the correct HTTP status (e.g. 500 for unexpected errors)
   - Return the response body in the format the client expects (JSON)

4. **Register the route** in the plugin’s `setup()` (or where other routes are registered). Use the same base path pattern as existing routes (e.g. `/api/my_plugin` or `/internal/my_plugin`).

5. **Add an API integration test:**
   - Use the repo’s FTR API test config and service injection (e.g. `getService('supertest')`)
   Default to **Scout** for new configs (scout-api-testing, create Scout scaffold if needed); use **FTR** only when the plugin already has existing FTR API tests. Cover success (200), validation failure (400), auth/error cases; clean up created data. If FTR: use repo FTR API config and service injection (e.g. `getService('supertest')`).

## Validation (run these and fix any failures)

1. **Type check:** Run `node scripts/type_check` from repo root. Fix any errors in the new or modified files.
2. **Lint:** Run `node scripts/eslint_all_files` for the changed paths. Fix any violations.
3. **API test:** Run the API test suite (Scout or FTR) that includes the new test (e.g. the plugin’s API test group). Ensure the new test passes.
4. **Manual (optional):** Start Kibana and call the endpoint (e.g. with curl or browser) to confirm the response.

After validation, report: route method and path, file(s) changed, and that type-check, lint, and the API test (Scout or FTR) pass.
