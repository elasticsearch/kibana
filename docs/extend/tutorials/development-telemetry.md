---
mapped_pages:
  - https://www.elastic.co/guide/en/kibana/current/development-telemetry.html
---

# Development Telemetry [development-telemetry]

To help us provide a good developer experience, we track some straightforward metrics when running certain tasks locally and ship them to a service that we run. To disable this functionality, specify `CI_STATS_DISABLED=true` in your environment.

The operations we current report timing data for:

* Total execution time of `yarn kbn bootstrap`.
* Total execution time of `@kbn/optimizer` runs as well as the following metadata about the runs: The number of bundles created, the number of bundles which were cached, usage of `--watch`, `--dist`, `--workers` and `--no-cache` flags, and the count of themes being built.
* The time from when you run `yarn start` until both the Kibana server and `@kbn/optimizer` are ready for use.
* The time it takes for the Kibana server to start listening after it is spawned by `yarn start`.

Along with the execution time of each execution, we ship the following information about your machine to the service:

* The `branch` property from the package.json file
* The value of the `data/uuid` file
* [Operating system platform](https://nodejs.org/docs/latest/api/os.md#os_os_platform)
* [Operating system release](https://nodejs.org/docs/latest/api/os.md#os_os_release)
* [Count, model, and speed of the CPUs](https://nodejs.org/docs/latest/api/os.md#os_os_cpus)
* [CPU architecture](https://nodejs.org/docs/latest/api/os.md#os_os_arch)
* [Total memory](https://nodejs.org/docs/latest/api/os.md#os_os_totalmem) and [Free memory](https://nodejs.org/docs/latest/api/os.md#os_os_freemem)

