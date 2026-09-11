/**
 * @name Unbounded string in route request validation
 * @description Detects `schema.string()` (`@kbn/config-schema`) and `z.string()`
 *              (`@kbn/zod` / `zod`) without a maximum-length constraint that flow
 *              into a route's request validation, which could lead to Denial of
 *              Service (DoS) when validating untrusted HTTP request input.
 * @kind path-problem
 * @problem.severity error
 * @security-severity 7.5
 * @precision high
 * @id js/kibana/unbounded-string-in-schema
 * @tags security
 *       dos
 *       kibana
 */

/*
 * This rule reports an unbounded string only when it reaches a route's request
 * validation (`validate` / `validation` / route-factory `params` / `schemas`;
 * body/query/params/path except under `response`), so response schemas,
 * saved-object attributes, telemetry, content-management/embeddable schemas and
 * other data-at-rest schemas are not flagged. It supersedes the earlier purely
 * syntactic detection, keeping the total well under GitHub's 5,000-results
 * per-analysis limit. Reachability covers the core/versioned routers,
 * `@kbn/server-route-repository`, cases, `alerting_v2` `static schemas`,
 * `buildRouteValidationWithZod`, object spread and `.extends`/`.extend`/`.merge`
 * composition. Known residual: a small number of request schemas assembled
 * through deep cross-file composition are not yet reached by value flow. See
 * elastic/kibana-team#3660.
 */

import javascript
import dos.KibanaDoSExclusions

/* ---------- @kbn/config-schema ---------- */

/** A reference to the `schema` object exported by `@kbn/config-schema`. */
DataFlow::SourceNode configSchema() {
  result = DataFlow::moduleImport("@kbn/config-schema").getAPropertyRead("schema")
}

/** Any `schema.<combinator>(...)` call. */
DataFlow::MethodCallNode configSchemaCall() { result = configSchema().getAMethodCall(_) }

/** A `schema.string(...)` call with no `maxLength` option. */
DataFlow::MethodCallNode unboundedConfigSchemaString() {
  result = configSchema().getAMethodCall("string") and
  not exists(ObjectExpr opts |
    opts = result.getArgument(0).asExpr() and opts.getAProperty().getName() = "maxLength"
  )
}

/* ---------- Zod (@kbn/zod, @kbn/zod/v4, zod) ---------- */

/** A reference to the `z` object from a Zod module (named or namespace import). */
DataFlow::SourceNode zodApi() {
  exists(string p | p = ["@kbn/zod", "@kbn/zod/v4", "zod"] |
    result = DataFlow::moduleImport(p).getAPropertyRead("z")
    or
    result = DataFlow::moduleImport(p)
  )
}

/** Any `z.<combinator>(...)` call. */
DataFlow::MethodCallNode zodCall() { result = zodApi().getAMethodCall(_) }

/**
 * A `z.string(...)` call with neither a `.max()` nor a format method that bounds
 * length inherently (mirrors the syntactic rule's `hasBoundedFormat`).
 */
DataFlow::MethodCallNode unboundedZodString() {
  result = zodApi().getAMethodCall("string") and
  not exists(MethodCallExpr chain |
    chain.getReceiver+() = result.asExpr() and chain.getMethodName() = "max"
  ) and
  not exists(MethodCallExpr chain |
    chain.getReceiver+() = result.asExpr() and
    chain.getMethodName() =
      [
        "datetime", "date", "time", "duration", "uuid", "uuidv4", "uuidv6", "uuidv7", "guid",
        "nanoid", "cuid", "cuid2", "ulid", "xid", "ksuid", "ipv4", "ipv6", "cidrv4", "cidrv6"
      ]
  )
}

/* ---------- Intentional reporting / unbounded helpers ---------- */

/** Public helpers whose unbounded validation is explicitly requested by the caller. */
DataFlow::Node intentionalUnboundedString() {
  exists(API::Node helpers |
    helpers = API::moduleImport("@kbn/config-schema").getMember("schema")
    or
    helpers = API::moduleImport(["@kbn/config-schema", "@kbn/zod", "@kbn/zod/v4"])
  |
    result = helpers.getMember("unboundedString").getACall()
    or
    exists(string name |
      name =
        [
          "savedObjectId", "savedObjectType", "savedObjectVersion", "spaceId", "displayName",
          "description", "searchFilter", "aggregation", "querySortField"
        ]
    |
      result = helpers.getMember(name).getMember("warn").getACall()
    )
  )
}

/* ---------- Schema-construction flow steps ---------- */

/**
 * Holds when a schema expression `child` is nested inside the construction of the
 * schema produced by `parent`: a config-schema or Zod combinator argument, an
 * object-literal property value (`object({ k: child })`), an array-literal element
 * (`oneOf`/`union`/`tuple`), a Zod modifier chain receiver (`child.optional()`),
 * or an argument of a `buildRouteValidation*` wrapper.
 */
predicate schemaBuildStep(DataFlow::Node child, DataFlow::Node parent) {
  // config-schema / Zod combinators: argument, object-prop value, or array element -> result
  exists(DataFlow::MethodCallNode call, DataFlow::Node arg |
    (call = configSchemaCall() or call = zodCall()) and parent = call and arg = call.getAnArgument()
  |
    child = arg
    or
    child = arg.getALocalSource().(DataFlow::ObjectLiteralNode).getAPropertyWrite().getRhs()
    or
    child = arg.getALocalSource().(DataFlow::ArrayLiteralNode).getAnElement()
  )
  or
  // Zod chains carry the schema through: wrappers (`.optional()`, `.nullable()`, ...) and
  // string refinements/formats that do NOT bound the maximum length (`.min()`, `.regex()`,
  // `.trim()`, `.email()`, ...). A `z.string()` with only these in its chain is still
  // unbounded, so the string must continue to flow to the request-validation sink.
  exists(DataFlow::MethodCallNode m |
    m.getMethodName() =
      [
        // structural wrappers
        "optional", "nullable", "nullish", "default", "describe", "catch", "brand", "readonly",
        "refine", "superRefine", "transform", "pipe", "and", "or", "array",
        // non-length-bounding string refinements and formats
        "min", "length", "nonempty", "trim", "toLowerCase", "toUpperCase", "lowercase",
        "uppercase", "regex", "includes", "startsWith", "endsWith", "email", "url", "uuid",
        "datetime", "date", "time", "duration", "ip", "cidr", "emoji", "base64", "base64url",
        "nanoid", "cuid", "cuid2", "ulid"
      ] and
    parent = m and
    child = m.getReceiver()
  )
  or
  // Schema composition: `Base.extends({ ...fields })` (config-schema), `Base.extend({...})` /
  // `Base.merge(Other)` (Zod). The base receiver, the extension object's field values, and a
  // merged schema argument all contribute fields to the composed schema.
  exists(DataFlow::MethodCallNode m | m.getMethodName() = ["extends", "extend", "merge"] and parent = m |
    child = m.getReceiver()
    or
    child = m.getArgument(0)
    or
    child = m.getArgument(0).getALocalSource().(DataFlow::ObjectLiteralNode).getAPropertyWrite().getRhs()
  )
  or
  // Route validation wrapper passthrough: `buildRouteValidationWithZod(schema)`.
  exists(DataFlow::CallNode c |
    c.getCalleeName().matches("buildRouteValidation%") and parent = c and child = c.getAnArgument()
  )
  or
  // Request-fields grouping object: a `body`/`query`/`params`/`path` value flows to its
  // enclosing object literal, so a grouping object referenced (and imported) as a whole —
  // e.g. `validate: { request: FooRequestSchema }` — carries its nested schemas to the sink.
  exists(DataFlow::ObjectLiteralNode o, DataFlow::PropWrite pw |
    pw = o.getAPropertyWrite() and
    pw.getPropertyName() = ["body", "query", "params", "path"] and
    child = pw.getRhs() and
    parent = o
  )
}

/* ---------- Route request-validation sinks ---------- */

/**
 * The config object literal passed to a route-factory call. Covers the many
 * per-plugin route wrappers built on `@kbn/server-route-repository`
 * (`createServerRoute`), cases (`createCasesRoute`), and similar
 * `create*Route` / `register*Route` helpers, whose request schema is not held
 * under a `validate:` key.
 */
DataFlow::ObjectLiteralNode routeFactoryConfig() {
  exists(DataFlow::CallNode c |
    c.getCalleeName().regexpMatch("(?i)(create|register)[a-z0-9_]*route[a-z0-9_]*") and
    result = c.getAnArgument().getALocalSource()
  )
}

/**
 * A route-configuration object. Rather than enumerate the ever-growing set of
 * per-plugin wrapper key names (`validate`, `validation`, `schemas`, `request`,
 * `params`, ...), we anchor structurally on the one near-universal invariant of a
 * Kibana route definition: it has a `handler`. Also seeded by route-factory config
 * args and `schemas:` objects (e.g. alerting_v2 `static schemas`), which may hold
 * the handler on a sibling/class member rather than inline.
 */
DataFlow::ObjectLiteralNode routeConfigObject() {
  result.getAPropertyWrite().getPropertyName() = "handler"
  or
  result = routeFactoryConfig()
  or
  exists(DataFlow::PropWrite pw |
    pw.getPropertyName() = "schemas" and result = pw.getRhs().getALocalSource()
  )
}

/**
 * A request-validation wrapper object: any object nested inside a route config
 * (transitively) via a property OTHER than `response`. This captures whatever
 * wrapper key a plugin uses (`validate` / `validation` / `request` / `schemas` /
 * `params` grouping / ...) without hard-coding names, while the `response`
 * exclusion keeps response schemas out of scope. Starts one level below the
 * config so route metadata on the config itself (`path`, `method`) is not treated
 * as request input.
 */
DataFlow::ObjectLiteralNode requestWrapper() {
  // Direct seed: `validate` / `validation` values are unambiguous request-validation
  // containers in Kibana regardless of where the handler lives (the core router takes
  // the handler as a separate argument, so its config object has no `handler` key).
  exists(DataFlow::PropWrite pw |
    pw.getPropertyName() = ["validate", "validation"] and
    result = pw.getRhs().getALocalSource()
  )
  or
  // Structural seed + recursion: anything nested inside a route config (handler-bearing,
  // factory arg, or `schemas` object) via a property other than `response`.
  exists(DataFlow::PropWrite pw |
    pw.getPropertyName() != "response" and
    pw.getBase().getALocalSource() = [routeConfigObject(), requestWrapper()] and
    result = pw.getRhs().getALocalSource()
  )
  or
  // Object spread: `validate: { ...rt }` — the spread-source object carries the request
  // fields, so it is itself a request wrapper (files plugin pattern).
  exists(DataFlow::ObjectLiteralNode target, SpreadElement se |
    target = requestWrapper() and
    se = target.asExpr().(ObjectExpr).getAProperty().getInit() and
    result = se.getOperand().flow().getALocalSource()
  )
}

/** Nodes into which a request-validation schema is expected to flow. */
DataFlow::Node requestSchemaField() {
  // leaf request fields (body/query/params/path) inside any request wrapper
  exists(DataFlow::PropWrite pw |
    pw.getPropertyName() = ["body", "query", "params", "path"] and
    pw.getBase().getALocalSource() = requestWrapper() and
    result = pw.getRhs()
  )
  or
  // server-route-repository: the whole request schema is the `params` value at the
  // route-config top level (a schema, not a wrapper object)
  exists(DataFlow::PropWrite pw |
    pw.getPropertyName() = "params" and
    pw.getBase().getALocalSource() = routeConfigObject() and
    result = pw.getRhs()
  )
  or
  // wrapper value bound to an (often imported) grouping object or schema, e.g.
  // `validate: FooSchema`, `request: FooRequestSchema`, `validation: FooVal`
  exists(DataFlow::PropWrite pw |
    pw.getPropertyName() = ["validate", "validation", "request"] and
    pw.getBase().getALocalSource() = [routeConfigObject(), requestWrapper()] and
    result = pw.getRhs()
  )
}

/* ---------- Data-flow configuration ---------- */

module RouteStringConfig implements DataFlow::ConfigSig {
  predicate isSource(DataFlow::Node source) {
    (source = unboundedConfigSchemaString() or source = unboundedZodString()) and
    not shouldExcludeFileFromDoSRules(source.asExpr())
  }

  predicate isSink(DataFlow::Node sink) { sink = requestSchemaField() }

  predicate isBarrier(DataFlow::Node node) { node = intentionalUnboundedString() }

  predicate isAdditionalFlowStep(DataFlow::Node node1, DataFlow::Node node2) {
    schemaBuildStep(node1, node2)
  }
}

module RouteStringFlow = DataFlow::Global<RouteStringConfig>;

import RouteStringFlow::PathGraph

from RouteStringFlow::PathNode source, RouteStringFlow::PathNode sink, string message
where
  RouteStringFlow::flowPath(source, sink) and
  (
    source.getNode() = unboundedConfigSchemaString() and
    message =
      "This schema.string() reaches route request validation ($@) without a maxLength; unbounded request input can cause Denial of Service. Add { maxLength: N }."
    or
    source.getNode() = unboundedZodString() and
    message =
      "This z.string() reaches route request validation ($@) without a .max() constraint; unbounded request input can cause Denial of Service. Add .max(N)."
  )
select source.getNode(), source, sink, message, sink.getNode(), "route validation"
