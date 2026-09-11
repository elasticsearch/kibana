# @kbn/swc-register

Dev-only require hook for loading Kibana Node.js modules with `@swc/core`.

On 8.19, `@kbn/swc-config/node_register` supplies only the runtime registration
configuration, with no Rspack or build-transpiler configuration dependency.
Production compilation and Jest continue to use Babel.

Transformed modules are cached in `data/swc_register_cache` using LMDB. Set
`DISABLE_SWC_REGISTER_CACHE=1` to disable caching, or `DEBUG_SWC_REGISTER_CACHE=1`
to append cache diagnostics to `swc_register_cache.log` in the working directory.
Caching is also disabled when `CODEX_SANDBOX` is set or LMDB is unavailable.
Without caching, SWC embeds inline source maps to preserve runtime stack traces.
