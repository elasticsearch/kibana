// Test cases for UnboundedStringInRoute.ql
// Tests detection of schema.string() without maxLength and z.string() without .max()
//
// CodeQL Test Annotations:
// - `// $ Alert` marks lines that SHOULD trigger a warning
// - Lines without `// $ Alert` should NOT trigger warnings

import { schema } from '@kbn/config-schema';
import { z } from '@kbn/zod';
import { z as zv4 } from '@kbn/zod/v4';
import { z as zBare } from 'zod';
import * as zNs from '@kbn/zod/v4';

// =============================================================================
// @kbn/config-schema: BAD - should be flagged (missing maxLength)
// =============================================================================

// BAD: No arguments at all
router.post({
  path: '/api/bad/no-args',
  validate: {
    body: schema.object({
      name: schema.string(),  // $ Alert
    }),
  },
}, handler);

// BAD: Empty options object
router.post({
  path: '/api/bad/empty-options',
  validate: {
    body: schema.object({
      name: schema.string({}),  // $ Alert
    }),
  },
}, handler);

// BAD: Only minLength, no maxLength
router.post({
  path: '/api/bad/minlength-only',
  validate: {
    body: schema.object({
      name: schema.string({ minLength: 1 }),  // $ Alert
    }),
  },
}, handler);

// BAD: Only validate callback, no maxLength
router.post({
  path: '/api/bad/validate-only',
  validate: {
    body: schema.object({
      name: schema.string({ validate: (v) => undefined }),  // $ Alert
    }),
  },
}, handler);

// BAD: Direct body string without maxLength
router.post({
  path: '/api/bad/direct-string',
  validate: {
    body: schema.string(),  // $ Alert
  },
}, handler);

// BAD: In params validation
router.get({
  path: '/api/bad/params/{id}',
  validate: {
    params: schema.object({
      id: schema.string(),  // $ Alert
    }),
  },
}, handler);

// BAD: In query validation
router.get({
  path: '/api/bad/query',
  validate: {
    query: schema.object({
      search: schema.string(),  // $ Alert
    }),
  },
}, handler);

// BAD: Multiple strings in same body
router.post({
  path: '/api/bad/multiple-strings',
  validate: {
    body: schema.object({
      title: schema.string(),  // $ Alert
      description: schema.string(),  // $ Alert
      content: schema.string(),  // $ Alert
    }),
  },
}, handler);

// BAD: Nullable string without maxLength
router.post({
  path: '/api/bad/nullable-string',
  validate: {
    body: schema.object({
      name: schema.nullable(schema.string()),  // $ Alert
    }),
  },
}, handler);

// BAD: Maybe string without maxLength
router.post({
  path: '/api/bad/maybe-string',
  validate: {
    body: schema.object({
      name: schema.maybe(schema.string()),  // $ Alert
    }),
  },
}, handler);

// BAD: Versioned route without maxLength
router.versioned.post({
  path: '/api/bad/versioned',
  access: 'internal',
}).addVersion({
  version: '1',
  validate: {
    request: {
      body: schema.object({
        query: schema.string(),  // $ Alert
      }),
    },
  },
}, handler);

// BAD: Separate variable without maxLength
const badQuerySchema = schema.string();  // $ Alert
router.get({
  path: '/api/bad/separate-variable',
  validate: {
    query: schema.object({
      q: badQuerySchema,
    }),
  },
}, handler);

// BAD: Only defaultValue, no maxLength
router.post({
  path: '/api/bad/default-only',
  validate: {
    body: schema.object({
      name: schema.string({ defaultValue: '' }),  // $ Alert
    }),
  },
}, handler);

// BAD: Only hostname option (no maxLength)
router.post({
  path: '/api/bad/hostname-only',
  validate: {
    body: schema.object({
      host: schema.string({ hostname: true }),  // $ Alert
    }),
  },
}, handler);

// =============================================================================
// @kbn/config-schema: GOOD - should NOT be flagged (has maxLength)
// =============================================================================

// GOOD: Has maxLength
router.post({
  path: '/api/good/with-maxlength',
  validate: {
    body: schema.object({
      name: schema.string({ maxLength: 256 }),
    }),
  },
}, handler);

// GOOD: Has both minLength and maxLength
router.post({
  path: '/api/good/min-and-max',
  validate: {
    body: schema.object({
      name: schema.string({ minLength: 1, maxLength: 100 }),
    }),
  },
}, handler);

// GOOD: maxLength with other options
router.post({
  path: '/api/good/maxlength-with-others',
  validate: {
    body: schema.object({
      name: schema.string({ minLength: 0, maxLength: 512, defaultValue: '' }),
    }),
  },
}, handler);

// GOOD: maxLength with validate callback
router.post({
  path: '/api/good/maxlength-with-validate',
  validate: {
    body: schema.object({
      name: schema.string({ maxLength: 1024, validate: (v) => undefined }),
    }),
  },
}, handler);

// GOOD: Small maxLength
router.post({
  path: '/api/good/small-maxlength',
  validate: {
    body: schema.object({
      code: schema.string({ maxLength: 6 }),
    }),
  },
}, handler);

// GOOD: Multiple strings all bounded
router.post({
  path: '/api/good/multiple-bounded',
  validate: {
    body: schema.object({
      title: schema.string({ maxLength: 256 }),
      description: schema.string({ maxLength: 2048 }),
      tag: schema.string({ maxLength: 50 }),
    }),
  },
}, handler);

// =============================================================================
// @kbn/zod: BAD - should be flagged (missing .max())
// =============================================================================

// BAD: Bare z.string()
router.post({
  path: '/api/bad/zod-bare',
  validate: {
    body: z.object({
      name: z.string(),  // $ Alert
    }),
  },
}, handler);

// BAD: z.string() with only .min()
router.post({
  path: '/api/bad/zod-min-only',
  validate: {
    body: z.object({
      name: z.string().min(1),  // $ Alert
    }),
  },
}, handler);

// BAD: z.string() with only .optional()
router.post({
  path: '/api/bad/zod-optional-only',
  validate: {
    body: z.object({
      name: z.string().optional(),  // $ Alert
    }),
  },
}, handler);

// BAD: z.string() with only .describe()
router.post({
  path: '/api/bad/zod-describe-only',
  validate: {
    body: z.object({
      name: z.string().describe('A name'),  // $ Alert
    }),
  },
}, handler);

// BAD: z.string() with .min() and .optional() but no .max()
router.post({
  path: '/api/bad/zod-min-optional',
  validate: {
    body: z.object({
      name: z.string().min(1).optional(),  // $ Alert
    }),
  },
}, handler);

// BAD: z.string() with .regex() but no .max()
router.post({
  path: '/api/bad/zod-regex-only',
  validate: {
    body: z.object({
      code: z.string().regex(/^[A-Z]+$/),  // $ Alert
    }),
  },
}, handler);

// BAD: Direct body as z.string()
const zodBodySchema = z.string();  // $ Alert
router.post({
  path: '/api/bad/zod-direct',
  validate: {
    body: zodBodySchema,
  },
}, handler);

// BAD: z.string() in query params
router.get({
  path: '/api/bad/zod-query',
  validate: {
    query: z.object({
      search: z.string(),  // $ Alert
      filter: z.string().min(1),  // $ Alert
    }),
  },
}, handler);

// BAD: z.string() with .nullable() but no .max()
router.post({
  path: '/api/bad/zod-nullable',
  validate: {
    body: z.object({
      name: z.string().nullable(),  // $ Alert
    }),
  },
}, handler);

// BAD: z.string() with .trim() but no .max()
router.post({
  path: '/api/bad/zod-trim',
  validate: {
    body: z.object({
      name: z.string().trim(),  // $ Alert
    }),
  },
}, handler);

// =============================================================================
// @kbn/zod: GOOD - should NOT be flagged (has .max())
// =============================================================================

// GOOD: z.string().max()
router.post({
  path: '/api/good/zod-max',
  validate: {
    body: z.object({
      name: z.string().max(256),
    }),
  },
}, handler);

// GOOD: z.string().min().max()
router.post({
  path: '/api/good/zod-min-max',
  validate: {
    body: z.object({
      name: z.string().min(1).max(256),
    }),
  },
}, handler);

// GOOD: z.string().max().optional()
router.post({
  path: '/api/good/zod-max-optional',
  validate: {
    body: z.object({
      name: z.string().max(100).optional(),
    }),
  },
}, handler);

// GOOD: z.string().max().describe()
router.post({
  path: '/api/good/zod-max-describe',
  validate: {
    body: z.object({
      name: z.string().max(100).describe('The name'),
    }),
  },
}, handler);

// GOOD: z.string().min().max().regex()
router.post({
  path: '/api/good/zod-full-chain',
  validate: {
    body: z.object({
      code: z.string().min(1).max(10).regex(/^[A-Z]+$/),
    }),
  },
}, handler);

// GOOD: z.string().max() with custom error message
router.post({
  path: '/api/good/zod-max-message',
  validate: {
    body: z.object({
      name: z.string().max(256, 'Name too long'),
    }),
  },
}, handler);

// GOOD: z.string().max().nullable()
router.post({
  path: '/api/good/zod-max-nullable',
  validate: {
    body: z.object({
      name: z.string().max(256).nullable(),
    }),
  },
}, handler);

// GOOD: Multiple strings all bounded
router.post({
  path: '/api/good/zod-multiple-bounded',
  validate: {
    body: z.object({
      title: z.string().max(160),
      description: z.string().max(2048),
      tag: z.string().max(50),
    }),
  },
}, handler);

// =============================================================================
// @kbn/zod: GOOD - bounded format methods (no .max() needed)
// =============================================================================

// GOOD: .datetime() is ISO 8601 — inherently bounded (~24–35 chars)
router.post({ path: '/api/good/zod-datetime', validate: { body: z.object({
  ts: z.string().datetime(),
})} }, handler);

// GOOD: .datetime().optional() — the motivating case
router.post({ path: '/api/good/zod-datetime-optional', validate: { body: z.object({
  tracking_started_at: z.string().datetime().optional(),
})} }, handler);

// GOOD: .date() — YYYY-MM-DD, 10 chars
router.post({ path: '/api/good/zod-date', validate: { body: z.object({
  d: z.string().date(),
})} }, handler);

// GOOD: .time() — bounded time string
router.post({ path: '/api/good/zod-time', validate: { body: z.object({
  t: z.string().time(),
})} }, handler);

// GOOD: .duration() — ISO 8601 duration
router.post({ path: '/api/good/zod-duration', validate: { body: z.object({
  dur: z.string().duration(),
})} }, handler);

// GOOD: .uuid() — 36 chars
router.post({ path: '/api/good/zod-uuid', validate: { body: z.object({
  id: z.string().uuid(),
})} }, handler);

// GOOD: .uuidv4() / .uuidv6() / .uuidv7() — 36 chars
router.post({ path: '/api/good/zod-uuidvx', validate: { body: z.object({
  a: z.string().uuidv4(),
  b: z.string().uuidv6(),
  c: z.string().uuidv7(),
})} }, handler);

// GOOD: .guid() — 36 chars
router.post({ path: '/api/good/zod-guid', validate: { body: z.object({
  id: z.string().guid(),
})} }, handler);

// GOOD: .nanoid() — 21 chars
router.post({ path: '/api/good/zod-nanoid', validate: { body: z.object({
  id: z.string().nanoid(),
})} }, handler);

// GOOD: .cuid() / .cuid2() — fixed-length
router.post({ path: '/api/good/zod-cuid', validate: { body: z.object({
  a: z.string().cuid(),
  b: z.string().cuid2(),
})} }, handler);

// GOOD: .ulid() — 26 chars
router.post({ path: '/api/good/zod-ulid', validate: { body: z.object({
  id: z.string().ulid(),
})} }, handler);

// GOOD: .xid() / .ksuid() — fixed-length identifiers
router.post({ path: '/api/good/zod-xid-ksuid', validate: { body: z.object({
  a: z.string().xid(),
  b: z.string().ksuid(),
})} }, handler);

// GOOD: .ipv4() / .ipv6() — IPv4 ≤15 chars, IPv6 ≤45 chars
router.post({ path: '/api/good/zod-ip', validate: { body: z.object({
  v4: z.string().ipv4(),
  v6: z.string().ipv6(),
})} }, handler);

// GOOD: .cidrv4() / .cidrv6() — CIDR notation, bounded
router.post({ path: '/api/good/zod-cidr', validate: { body: z.object({
  v4: z.string().cidrv4(),
  v6: z.string().cidrv6(),
})} }, handler);

// GOOD: format method chained before .optional() / .nullable() / .describe()
router.post({ path: '/api/good/zod-format-chained', validate: { body: z.object({
  a: z.string().datetime().optional(),
  b: z.string().uuid().nullable(),
  c: z.string().ulid().describe('A ULID'),
})} }, handler);

// =============================================================================
// EDGE CASES
// =============================================================================

// EDGE: Variable maxLength (still detected as bounded)
const MAX_NAME_LENGTH = 256;
router.post({
  path: '/api/edge/variable-maxlength',
  validate: {
    body: schema.object({
      name: schema.string({ maxLength: MAX_NAME_LENGTH }),
    }),
  },
}, handler);

// EDGE: Computed maxLength (still detected as bounded)
router.post({
  path: '/api/edge/computed-maxlength',
  validate: {
    body: schema.object({
      name: schema.string({ maxLength: 64 * 4 }),
    }),
  },
}, handler);

// EDGE: Zod variable max (still detected as bounded)
const MAX_LEN = 100;
router.post({
  path: '/api/edge/zod-variable-max',
  validate: {
    body: z.object({
      name: z.string().max(MAX_LEN),
    }),
  },
}, handler);

// EDGE: Deeply nested object with unbounded strings
router.post({
  path: '/api/edge/deeply-nested',
  validate: {
    body: schema.object({
      level1: schema.object({
        level2: schema.object({
          name: schema.string(),  // $ Alert
        }),
      }),
    }),
  },
}, handler);

// EDGE: Deeply nested Zod object with unbounded strings
router.post({
  path: '/api/edge/zod-deeply-nested',
  validate: {
    body: z.object({
      level1: z.object({
        level2: z.object({
          name: z.string(),  // $ Alert
        }),
      }),
    }),
  },
}, handler);

// EDGE: Nested schema.object with mix of bounded and unbounded
router.post({
  path: '/api/edge/nested-mixed',
  validate: {
    body: schema.object({
      metadata: schema.object({
        title: schema.string({ maxLength: 256 }),
        description: schema.string(),  // $ Alert
      }),
      config: schema.object({
        key: schema.string({ maxLength: 100 }),
        value: schema.string(),  // $ Alert
      }),
    }),
  },
}, handler);

// EDGE: Nested Zod object with mix of bounded and unbounded
router.post({
  path: '/api/edge/zod-nested-mixed',
  validate: {
    body: z.object({
      metadata: z.object({
        title: z.string().max(256),
        description: z.string(),  // $ Alert
      }),
      config: z.object({
        key: z.string().max(100),
        value: z.string(),  // $ Alert
      }),
    }),
  },
}, handler);

// EDGE: Conditional usage (should still flag the unbounded case)
const useValidation = true;
router.post({
  path: '/api/edge/conditional',
  validate: {
    body: useValidation ? schema.string() : schema.any(),  // $ Alert
  },
}, handler);

// EDGE: Function returning unbounded schema
function createStringSchema() {
  return schema.string();  // $ Alert
}

// EDGE: Class method returning unbounded zod schema
class SchemaBuilder {
  buildString() {
    return z.string();  // $ Alert
  }
}

// =============================================================================
// @kbn/zod/v4 import: BAD - should be flagged
// =============================================================================

// BAD: zv4.string() bare (imported from @kbn/zod/v4)
router.post({
  path: '/api/bad/zodv4-bare',
  validate: {
    body: zv4.object({
      name: zv4.string(),  // $ Alert
    }),
  },
}, handler);

// BAD: zv4.string() with only .min()
router.post({
  path: '/api/bad/zodv4-min-only',
  validate: {
    body: zv4.object({
      name: zv4.string().min(1),  // $ Alert
    }),
  },
}, handler);

// BAD: zv4.string() with .optional() but no .max()
router.post({
  path: '/api/bad/zodv4-optional',
  validate: {
    body: zv4.object({
      name: zv4.string().optional(),  // $ Alert
    }),
  },
}, handler);

// GOOD: zv4.string().max() (imported from @kbn/zod/v4)
router.post({
  path: '/api/good/zodv4-max',
  validate: {
    body: zv4.object({
      name: zv4.string().max(256),
    }),
  },
}, handler);

// GOOD: zv4.string().min().max() (imported from @kbn/zod/v4)
router.post({
  path: '/api/good/zodv4-min-max',
  validate: {
    body: zv4.object({
      name: zv4.string().min(1).max(256),
    }),
  },
}, handler);

// =============================================================================
// plain 'zod' import: BAD - should be flagged
// =============================================================================

// BAD: zBare.string() bare (imported from 'zod')
router.post({
  path: '/api/bad/zod-bare-import',
  validate: {
    body: zBare.object({
      name: zBare.string(),  // $ Alert
    }),
  },
}, handler);

// BAD: zBare.string() with .min() but no .max()
router.post({
  path: '/api/bad/zod-bare-min-only',
  validate: {
    body: zBare.object({
      name: zBare.string().min(1),  // $ Alert
    }),
  },
}, handler);

// BAD: zBare.string() with .nullable() but no .max()
router.post({
  path: '/api/bad/zod-bare-nullable',
  validate: {
    body: zBare.object({
      name: zBare.string().nullable(),  // $ Alert
    }),
  },
}, handler);

// GOOD: zBare.string().max() (imported from 'zod')
router.post({
  path: '/api/good/zod-bare-max',
  validate: {
    body: zBare.object({
      name: zBare.string().max(100),
    }),
  },
}, handler);

// GOOD: zBare.string().min().max() (imported from 'zod')
router.post({
  path: '/api/good/zod-bare-min-max',
  validate: {
    body: zBare.object({
      name: zBare.string().min(1).max(512),
    }),
  },
}, handler);

// =============================================================================
// namespace import (`import * as zNs from '@kbn/zod/v4'`): BAD - should be flagged
// =============================================================================

// BAD: zNs.string() bare (namespace import from @kbn/zod/v4)
router.post({
  path: '/api/bad/zod-ns-bare',
  validate: {
    body: zNs.object({
      name: zNs.string(),  // $ Alert
    }),
  },
}, handler);

// BAD: zNs.string() with only .min()
router.post({
  path: '/api/bad/zod-ns-min-only',
  validate: {
    body: zNs.object({
      name: zNs.string().min(1),  // $ Alert
    }),
  },
}, handler);

// BAD: zNs.string() with .optional() but no .max()
router.post({
  path: '/api/bad/zod-ns-optional',
  validate: {
    body: zNs.object({
      name: zNs.string().optional(),  // $ Alert
    }),
  },
}, handler);

// BAD: zNs.string() with .nullable() but no .max()
router.post({
  path: '/api/bad/zod-ns-nullable',
  validate: {
    body: zNs.object({
      name: zNs.string().nullable(),  // $ Alert
    }),
  },
}, handler);

// =============================================================================
// namespace import (`import * as zNs from '@kbn/zod/v4'`): GOOD - should NOT be flagged
// =============================================================================

// GOOD: zNs.string().max()
router.post({
  path: '/api/good/zod-ns-max',
  validate: {
    body: zNs.object({
      name: zNs.string().max(256),
    }),
  },
}, handler);

// GOOD: zNs.string().min().max()
router.post({
  path: '/api/good/zod-ns-min-max',
  validate: {
    body: zNs.object({
      name: zNs.string().min(1).max(256),
    }),
  },
}, handler);

// GOOD: zNs.string().max().optional()
router.post({
  path: '/api/good/zod-ns-max-optional',
  validate: {
    body: zNs.object({
      name: zNs.string().max(100).optional(),
    }),
  },
}, handler);

// =============================================================================
// NON-EXCLUDED CONTEXTS: These look like non-route usage but SHOULD still fire.
// Response schemas, common/ schemas, and schemas in route files must stay flagged
// because they often coexist with request payload schemas in the same file.
// =============================================================================

// BAD: Response schema in a route file — still flagged (same file as request schemas)
router.versioned.post({
  path: '/api/edge/response-schema',
  access: 'internal',
}).addVersion({
  version: '1',
  validate: {
    request: {
      body: schema.object({
        query: schema.string({ maxLength: 256 }),
      }),
    },
    response: {
      200: {
        body: () => schema.object({
          result: schema.string(),  // $ Alert
        }),
      },
    },
  },
}, handler);

// BAD: Shared schema in a "common" module — still flagged (used by routes)
const sharedCommonSchema = schema.object({
  name: schema.string(),  // $ Alert
  tag: schema.string(),  // $ Alert
});

// BAD: Schema exported for use in routes — still flagged
export const routeBodySchema = z.object({
  description: z.string(),  // $ Alert
});

// BAD: Schema in a helper function used by route handlers — still flagged
function buildRouteSchema() {
  return schema.object({
    filter: schema.string(),  // $ Alert
  });
}
