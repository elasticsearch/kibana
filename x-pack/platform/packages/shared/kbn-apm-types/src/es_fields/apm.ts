/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
export const ID = '_id';

export const TIMESTAMP_US = 'timestamp.us';
export const AT_TIMESTAMP = '@timestamp';
export const AGENT = 'agent';
export const AGENT_NAME = 'agent.name';
export const AGENT_VERSION = 'agent.version';
export const AGENT_ACTIVATION_METHOD = 'agent.activation_method';

export const DESTINATION_ADDRESS = 'destination.address';

export const CLOUD = 'cloud';
export const CLOUD_AVAILABILITY_ZONE = 'cloud.availability_zone';
export const CLOUD_PROVIDER = 'cloud.provider';
export const CLOUD_REGION = 'cloud.region';
export const CLOUD_MACHINE_TYPE = 'cloud.machine.type';
export const CLOUD_ACCOUNT_ID = 'cloud.account.id';
export const CLOUD_ACCOUNT_NAME = 'cloud.account.name';
export const CLOUD_INSTANCE_ID = 'cloud.instance.id';
export const CLOUD_INSTANCE_NAME = 'cloud.instance.name';
export const CLOUD_SERVICE_NAME = 'cloud.service.name';
export const CLOUD_PROJECT_NAME = 'cloud.project.name';

export const EVENT_SUCCESS_COUNT = 'event.success_count';

export const SERVICE = 'service';
export const SERVICE_NAME = 'service.name';
export const SERVICE_NAMESPACE = 'service.namespace';
export const SERVICE_ENVIRONMENT = 'service.environment';
export const SERVICE_FRAMEWORK_NAME = 'service.framework.name';
export const SERVICE_FRAMEWORK_VERSION = 'service.framework.version';
export const SERVICE_LANGUAGE_NAME = 'service.language.name';
export const SERVICE_LANGUAGE_VERSION = 'service.language.version';
export const SERVICE_RUNTIME_NAME = 'service.runtime.name';
export const SERVICE_RUNTIME_VERSION = 'service.runtime.version';
export const SERVICE_NODE_NAME = 'service.node.name';
export const SERVICE_VERSION = 'service.version';
export const SERVICE_TARGET_TYPE = 'service.target.type';
export const SERVICE_OVERFLOW_COUNT = 'service_transaction.aggregation.overflow_count';

export const URL_FULL = 'url.full';
export const HTTP_REQUEST_METHOD = 'http.request.method';
export const HTTP_RESPONSE_STATUS_CODE = 'http.response.status_code';
export const USER_ID = 'user.id';
export const USER_AGENT_ORIGINAL = 'user_agent.original';
export const USER_AGENT_NAME = 'user_agent.name';
export const USER_AGENT_VERSION = 'user_agent.version';

export const OBSERVER_VERSION = 'observer.version';
export const OBSERVER_VERSION_MAJOR = 'observer.version_major';
export const OBSERVER_HOSTNAME = 'observer.hostname';
export const OBSERVER_LISTENING = 'observer.listening';
export const PROCESSOR_EVENT = 'processor.event';
export const PROCESSOR_NAME = 'processor.name';

export const TRANSACTION_MARKS_AGENT = 'transaction.marks.agent';
export const TRANSACTION_DURATION = 'transaction.duration.us';
export const TRANSACTION_DURATION_HISTOGRAM = 'transaction.duration.histogram';
export const TRANSACTION_DURATION_SUMMARY = 'transaction.duration.summary';
export const TRANSACTION_TYPE = 'transaction.type';
export const TRANSACTION_RESULT = 'transaction.result';
export const TRANSACTION_NAME = 'transaction.name';
export const TRANSACTION_ID = 'transaction.id';
export const TRANSACTION_SAMPLED = 'transaction.sampled';
export const TRANSACTION_PAGE_URL = 'transaction.page.url';
export const TRANSACTION_FAILURE_COUNT = 'transaction.failure_count';
export const TRANSACTION_SUCCESS_COUNT = 'transaction.success_count';
export const TRANSACTION_OVERFLOW_COUNT = 'transaction.aggregation.overflow_count';
// for transaction metrics
export const TRANSACTION_ROOT = 'transaction.root';
export const TRANSACTION_PROFILER_STACK_TRACE_IDS = 'transaction.profiler_stack_trace_ids';

// OTel field to link profiling and APM
export const ELASTIC_PROFILER_STACK_TRACE_IDS = 'elastic.profiler_stack_trace_ids';

export const EVENT_OUTCOME = 'event.outcome';

export const TRACE_ID = 'trace.id';

export const SPAN_DURATION = 'span.duration.us';
export const SPAN_TYPE = 'span.type';
export const SPAN_SUBTYPE = 'span.subtype';
export const SPAN_SELF_TIME_SUM = 'span.self_time.sum.us';
export const SPAN_ACTION = 'span.action';
export const SPAN_NAME = 'span.name';
export const SPAN_ID = 'span.id';
export const SPAN_DESTINATION_SERVICE_RESOURCE = 'span.destination.service.resource';
export const SPAN_DESTINATION_SERVICE_RESPONSE_TIME_COUNT =
  'span.destination.service.response_time.count';

export const SPAN_DESTINATION_SERVICE_RESPONSE_TIME_SUM =
  'span.destination.service.response_time.sum.us';

export const SPAN_LINKS = 'span.links';
export const SPAN_LINKS_TRACE_ID = 'span.links.trace.id';
export const SPAN_LINKS_SPAN_ID = 'span.links.span.id';

export const SPAN_COMPOSITE_COUNT = 'span.composite.count';
export const SPAN_COMPOSITE_SUM = 'span.composite.sum.us';
export const SPAN_COMPOSITE_COMPRESSION_STRATEGY = 'span.composite.compression_strategy';

export const SPAN_SYNC = 'span.sync';
export const SPAN_STACKTRACE = 'span.stacktrace';

// Parent ID for a transaction or span
export const PARENT_ID = 'parent.id';

export const ERROR_ID = 'error.id';
export const ERROR_GROUP_ID = 'error.grouping_key';
export const ERROR_GROUP_NAME = 'error.grouping_name';
export const ERROR_CULPRIT = 'error.culprit';
export const ERROR_LOG_LEVEL = 'error.log.level';
export const ERROR_LOG_MESSAGE = 'error.log.message';
export const ERROR_EXCEPTION = 'error.exception';
export const ERROR_EXC_MESSAGE = 'error.exception.message'; // only to be used in es queries, since error.exception is now an array
export const ERROR_EXC_HANDLED = 'error.exception.handled'; // only to be used in es queries, since error.exception is now an array
export const ERROR_EXC_TYPE = 'error.exception.type';
export const ERROR_PAGE_URL = 'error.page.url';
export const ERROR_STACK_TRACE = 'error.stack_trace';
export const ERROR_TYPE = 'error.type';
export const ERROR_CODE = 'error.code';

// ANOMALY
export const ANOMALY_DETECTOR_TYPE = 'anomaly.detector_type';

// METRICS
export const METRIC_SYSTEM_FREE_MEMORY = 'system.memory.actual.free';
export const METRIC_SYSTEM_TOTAL_MEMORY = 'system.memory.total';
export const METRIC_SYSTEM_CPU_PERCENT = 'system.cpu.total.norm.pct';
export const METRIC_PROCESS_CPU_PERCENT = 'system.process.cpu.total.norm.pct';
export const METRIC_CGROUP_MEMORY_LIMIT_BYTES = 'system.process.cgroup.memory.mem.limit.bytes';
export const METRIC_CGROUP_MEMORY_USAGE_BYTES = 'system.process.cgroup.memory.mem.usage.bytes';

export const METRIC_JAVA_HEAP_MEMORY_MAX = 'jvm.memory.heap.max';
export const METRIC_JAVA_HEAP_MEMORY_COMMITTED = 'jvm.memory.heap.committed';
export const METRIC_JAVA_HEAP_MEMORY_USED = 'jvm.memory.heap.used';
export const METRIC_JAVA_NON_HEAP_MEMORY_MAX = 'jvm.memory.non_heap.max';
export const METRIC_JAVA_NON_HEAP_MEMORY_COMMITTED = 'jvm.memory.non_heap.committed';
export const METRIC_JAVA_NON_HEAP_MEMORY_USED = 'jvm.memory.non_heap.used';
export const METRIC_JAVA_THREAD_COUNT = 'jvm.thread.count';
export const METRIC_JAVA_GC_COUNT = 'jvm.gc.count';
export const METRIC_JAVA_GC_TIME = 'jvm.gc.time';

export const METRICSET_NAME = 'metricset.name';
export const METRICSET_INTERVAL = 'metricset.interval';

export const LABEL_NAME = 'labels.name';
export const LABEL_GC = 'labels.gc';
export const LABEL_TYPE = 'labels.type';
export const LABEL_TELEMETRY_AUTO_VERSION = 'labels.telemetry_auto_version';
export const LABEL_LIFECYCLE_STATE = 'labels.lifecycle_state';

export const HOST = 'host';
export const HOST_HOSTNAME = 'host.hostname'; // Do not use. Please use `HOST_NAME` instead.
export const HOST_NAME = 'host.name';
export const HOST_OS_PLATFORM = 'host.os.platform';
export const HOST_ARCHITECTURE = 'host.architecture';
export const HOST_OS_VERSION = 'host.os.version';

export const CONTAINER_ID = 'container.id';
export const CONTAINER = 'container';
export const CONTAINER_IMAGE = 'container.image.name';

export const KUBERNETES = 'kubernetes';
export const KUBERNETES_POD_NAME = 'kubernetes.pod.name';
export const KUBERNETES_POD_UID = 'kubernetes.pod.uid';
export const KUBERNETES_NAMESPACE = 'kubernetes.namespace';
export const KUBERNETES_NODE_NAME = 'kubernetes.node.name';
export const KUBERNETES_CONTAINER_NAME = 'kubernetes.container.name';
export const KUBERNETES_CONTAINER_ID = 'kubernetes.container.id';
export const KUBERNETES_DEPLOYMENT_NAME = 'kubernetes.deployment.name';
export const KUBERNETES_REPLICASET_NAME = 'kubernetes.replicaset.name';

export const FAAS_ID = 'faas.id';
export const FAAS_NAME = 'faas.name';
export const FAAS_COLDSTART = 'faas.coldstart';
export const FAAS_TRIGGER_TYPE = 'faas.trigger.type';
export const FAAS_DURATION = 'faas.duration';
export const FAAS_COLDSTART_DURATION = 'faas.coldstart_duration';
export const FAAS_BILLED_DURATION = 'faas.billed_duration';

// OpenTelemetry Metrics
export const METRIC_OTEL_SYSTEM_CPU_UTILIZATION = 'system.cpu.utilization';
export const METRIC_OTEL_SYSTEM_MEMORY_UTILIZATION = 'system.memory.utilization';

// OTel JVM metrics - experimental semconv (process.runtime.jvm.*)
export const METRIC_OTEL_JVM_PROCESS_CPU_PERCENT = 'process.runtime.jvm.cpu.utilization';
export const METRIC_OTEL_JVM_PROCESS_MEMORY_USAGE = 'process.runtime.jvm.memory.usage';
export const METRIC_OTEL_JVM_PROCESS_MEMORY_COMMITTED = 'process.runtime.jvm.memory.committed';
export const METRIC_OTEL_JVM_PROCESS_MEMORY_LIMIT = 'process.runtime.jvm.memory.limit';
export const METRIC_OTEL_JVM_PROCESS_THREADS_COUNT = 'process.runtime.jvm.threads.count';
export const METRIC_OTEL_JVM_SYSTEM_CPU_PERCENT = 'process.runtime.jvm.system.cpu.utilization';
export const METRIC_OTEL_JVM_GC_DURATION = 'process.runtime.jvm.gc.duration';

// OTel JVM metrics - stable semconv (jvm.*)
// https://opentelemetry.io/docs/specs/semconv/runtime/jvm-metrics/
export const METRIC_OTEL_JVM_CPU_PERCENT = 'metrics.jvm.cpu.recent_utilization';
export const METRIC_OTEL_JVM_MEMORY_USED = 'metrics.jvm.memory.used';
export const METRIC_OTEL_JVM_MEMORY_COMMITTED = 'metrics.jvm.memory.committed';
export const METRIC_OTEL_JVM_MEMORY_LIMIT = 'metrics.jvm.memory.limit';
export const METRIC_OTEL_JVM_THREAD_COUNT = 'metrics.jvm.thread.count';
export const METRIC_OTEL_JVM_SYSTEM_CPU = 'metrics.jvm.system.cpu.utilization';
export const METRIC_OTEL_JVM_GC_DURATION_SECONDS = 'metrics.jvm.gc.duration';
// OTel native ingest (EDOT Collector → ES) stores as attributes.*
export const ATTRIBUTE_OTEL_JVM_MEMORY_TYPE = 'attributes.jvm.memory.type';
// APM Server ingest (OTel SDK → APM Server → ES) stores as labels.* with dots → underscores
// See: https://www.elastic.co/docs/solutions/observability/apm/opentelemetry/attributes
export const LABEL_OTEL_JVM_MEMORY_TYPE = 'labels.jvm_memory_type';
export const VALUE_OTEL_JVM_MEMORY_TYPE_HEAP = 'heap';
export const VALUE_OTEL_JVM_MEMORY_TYPE_NON_HEAP = 'non_heap';

// OpenTelemetry semconv fields for AgentName https://opentelemetry.io/docs/specs/semconv/resource/#telemetry-sdk
export const TELEMETRY_SDK_NAME = 'telemetry.sdk.name';
export const TELEMETRY_SDK_LANGUAGE = 'telemetry.sdk.language';
export const TELEMETRY_SDK_VERSION = 'telemetry.sdk.version';

// OpenTelemetry semconv fields for HTTP server https://opentelemetry.io/docs/specs/semconv/http/http-spans/#http-server-semantic-conventions
export const URL_PATH = 'url.path';
export const URL_SCHEME = 'url.scheme';
export const SERVER_ADDRESS = 'server.address';
export const SERVER_PORT = 'server.port';

// OpenTelemetry span links
export const OTEL_SPAN_LINKS = 'links';
export const OTEL_SPAN_LINKS_SPAN_ID = 'links.span_id';
export const OTEL_SPAN_LINKS_TRACE_ID = 'links.trace_id';

// Metadata
export const TIER = '_tier';
export const INDEX = '_index';
export const DATA_STEAM_TYPE = 'data_stream.type';

// Mobile
export const NETWORK_CONNECTION_TYPE = 'network.connection.type';
export const DEVICE_MODEL_IDENTIFIER = 'device.model.identifier';
export const SESSION_ID = 'session.id';
export const APP_LAUNCH_TIME = 'application.launch.time';
export const EVENT_NAME = 'event.name';

// Location
export const CLIENT_GEO_COUNTRY_ISO_CODE = 'client.geo.country_iso_code';
export const CLIENT_GEO_REGION_ISO_CODE = 'client.geo.region_iso_code';
export const CLIENT_GEO_COUNTRY_NAME = 'client.geo.country_name';
export const CLIENT_GEO_CITY_NAME = 'client.geo.city_name';
export const CLIENT_GEO_REGION_NAME = 'client.geo.region_name';

export const CHILD_ID = 'child.id';

export const LOG_LEVEL = 'log.level';

// Process
export const PROCESS_ARGS = 'process.args';
export const PROCESS_PID = 'process.pid';
