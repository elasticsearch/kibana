/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DemoConfig, ServiceConfig } from '../../types';

const CONTAINER_REGISTRY = 'ghcr.io/open-telemetry/demo';

/**
 * OpenTelemetry Demo configuration
 * https://github.com/open-telemetry/opentelemetry-demo
 */
export const otelDemoConfig: DemoConfig = {
  id: 'otel-demo',
  displayName: 'OpenTelemetry Demo',
  namespace: 'otel-demo',
  description:
    'OpenTelemetry instrumentation showcase - 11 microservices in Go, C#, Java, Python, JavaScript, Rust, PHP',
  defaultVersion: '1.12.0',
  availableVersions: ['1.12.0', '1.11.1', '1.11.0', '1.10.0'],
  serviceSourcePaths: {
    accounting: { context: '.', dockerfile: 'src/accountingservice/Dockerfile' },
    ad: { context: '.', dockerfile: 'src/adservice/Dockerfile' },
    cart: { context: '.', dockerfile: 'src/cartservice/src/Dockerfile' },
    checkout: { context: '.', dockerfile: 'src/checkoutservice/Dockerfile' },
    currency: { context: '.', dockerfile: 'src/currencyservice/Dockerfile' },
    email: { context: '.', dockerfile: 'src/emailservice/Dockerfile' },
    frontend: { context: '.', dockerfile: 'src/frontend/Dockerfile' },
    'load-generator': { context: '.', dockerfile: 'src/loadgenerator/Dockerfile' },
    payment: { context: '.', dockerfile: 'src/paymentservice/Dockerfile' },
    'product-catalog': { context: '.', dockerfile: 'src/productcatalogservice/Dockerfile' },
    quote: { context: '.', dockerfile: 'src/quoteservice/Dockerfile' },
    recommendation: { context: '.', dockerfile: 'src/recommendationservice/Dockerfile' },
    shipping: { context: '.', dockerfile: 'src/shippingservice/Dockerfile' },
  },

  frontendService: {
    name: 'frontend',
    nodePort: 30080,
  },

  getServices: (version = '1.12.0'): ServiceConfig[] => [
    // Supporting services
    {
      name: 'valkey',
      image: 'valkey/valkey:8-alpine',
      port: 6379,
    },
    {
      name: 'flagd',
      image: 'ghcr.io/open-feature/flagd:v0.11.4',
      port: 8013,
      env: {
        FLAGD_PORT: '8013',
      },
    },

    // Demo microservices
    {
      name: 'cart',
      image: `${CONTAINER_REGISTRY}:${version}-cartservice`,
      port: 7070,
      env: {
        CART_SERVICE_PORT: '7070',
        VALKEY_ADDR: 'valkey:6379',
        ASPNETCORE_URLS: 'http://*:7070',
        FLAGD_HOST: 'flagd',
        FLAGD_PORT: '8013',
      },
    },
    {
      name: 'currency',
      image: `${CONTAINER_REGISTRY}:${version}-currencyservice`,
      port: 7285,
      env: {
        CURRENCY_SERVICE_PORT: '7285',
        VERSION: version,
      },
    },
    {
      name: 'email',
      image: `${CONTAINER_REGISTRY}:${version}-emailservice`,
      port: 6060,
      env: {
        APP_ENV: 'production',
        EMAIL_SERVICE_PORT: '6060',
      },
    },
    {
      name: 'payment',
      image: `${CONTAINER_REGISTRY}:${version}-paymentservice`,
      port: 50051,
      env: {
        PAYMENT_SERVICE_PORT: '50051',
        FLAGD_HOST: 'flagd',
        FLAGD_PORT: '8013',
      },
    },
    {
      name: 'product-catalog',
      image: `${CONTAINER_REGISTRY}:${version}-productcatalogservice`,
      port: 3550,
      env: {
        PRODUCT_CATALOG_SERVICE_PORT: '3550',
        FLAGD_HOST: 'flagd',
        FLAGD_PORT: '8013',
      },
    },
    {
      name: 'quote',
      image: `${CONTAINER_REGISTRY}:${version}-quoteservice`,
      port: 8090,
      env: {
        QUOTE_SERVICE_PORT: '8090',
        OTEL_PHP_AUTOLOAD_ENABLED: 'true',
      },
    },
    {
      name: 'shipping',
      image: `${CONTAINER_REGISTRY}:${version}-shippingservice`,
      port: 50051,
      env: {
        SHIPPING_SERVICE_PORT: '50051',
        QUOTE_SERVICE_ADDR: 'http://quote:8090',
      },
    },
    {
      name: 'ad',
      image: `${CONTAINER_REGISTRY}:${version}-adservice`,
      port: 9555,
      env: {
        AD_SERVICE_PORT: '9555',
        FLAGD_HOST: 'flagd',
        FLAGD_PORT: '8013',
        OTEL_LOGS_EXPORTER: 'otlp',
      },
    },
    {
      name: 'recommendation',
      image: `${CONTAINER_REGISTRY}:${version}-recommendationservice`,
      port: 9001,
      env: {
        RECOMMENDATION_SERVICE_PORT: '9001',
        PRODUCT_CATALOG_SERVICE_ADDR: 'product-catalog:3550',
        FLAGD_HOST: 'flagd',
        FLAGD_PORT: '8013',
        OTEL_PYTHON_LOG_CORRELATION: 'true',
        PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION: 'python',
      },
    },
    {
      name: 'checkout',
      image: `${CONTAINER_REGISTRY}:${version}-checkoutservice`,
      port: 5050,
      env: {
        CHECKOUT_SERVICE_PORT: '5050',
        CART_SERVICE_ADDR: 'cart:7070',
        CURRENCY_SERVICE_ADDR: 'currency:7285',
        EMAIL_SERVICE_ADDR: 'http://email:6060',
        PAYMENT_SERVICE_ADDR: 'payment:50051',
        PRODUCT_CATALOG_SERVICE_ADDR: 'product-catalog:3550',
        SHIPPING_SERVICE_ADDR: 'shipping:50051',
        FLAGD_HOST: 'flagd',
        FLAGD_PORT: '8013',
      },
    },
    {
      name: 'frontend',
      image: `${CONTAINER_REGISTRY}:${version}-frontend`,
      port: 8080,
      env: {
        PORT: '8080',
        FRONTEND_ADDR: ':8080',
        AD_SERVICE_ADDR: 'ad:9555',
        CART_SERVICE_ADDR: 'cart:7070',
        CHECKOUT_SERVICE_ADDR: 'checkout:5050',
        CURRENCY_SERVICE_ADDR: 'currency:7285',
        PRODUCT_CATALOG_SERVICE_ADDR: 'product-catalog:3550',
        RECOMMENDATION_SERVICE_ADDR: 'recommendation:9001',
        SHIPPING_SERVICE_ADDR: 'shipping:50051',
        OTEL_COLLECTOR_HOST: 'otel-collector',
        FLAGD_HOST: 'flagd',
        FLAGD_PORT: '8013',
        ENV_PLATFORM: 'local',
        WEB_OTEL_SERVICE_NAME: 'frontend-web',
      },
    },
    {
      name: 'load-generator',
      image: `${CONTAINER_REGISTRY}:${version}-loadgenerator`,
      port: 8089,
      env: {
        LOCUST_WEB_PORT: '8089',
        LOCUST_HOST: 'http://frontend:8080',
        LOCUST_HEADLESS: 'false',
        LOCUST_AUTOSTART: 'true',
        LOCUST_USERS: '10',
        LOCUST_WEB_HOST: '0.0.0.0',
        FLAGD_HOST: 'flagd',
        FLAGD_PORT: '8013',
        PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION: 'python',
      },
    },
  ],
};

/**
 * Services that use HTTP for OTLP exports (not gRPC)
 */
export const HTTP_OTLP_SERVICES = new Set([
  'quote',
  'email',
  'accounting',
  'ad',
  'fraud-detection',
]);

/**
 * Default environment values for services (used for scenario reset)
 */
export const SERVICE_DEFAULTS: Record<string, Record<string, string>> = {
  cart: {
    VALKEY_ADDR: 'valkey:6379',
    FLAGD_HOST: 'flagd',
  },
  checkout: {
    GOMEMLIMIT: '16MiB',
    CURRENCY_SERVICE_ADDR: 'currency:7285',
    PAYMENT_SERVICE_ADDR: 'payment:50051',
  },
  frontend: {
    CURRENCY_SERVICE_ADDR: 'currency:7285',
    PRODUCT_CATALOG_SERVICE_ADDR: 'product-catalog:3550',
    WEB_OTEL_SERVICE_NAME: 'frontend-web',
    OTEL_EXPORTER_OTLP_ENDPOINT: 'http://otel-collector:4317',
  },
  'load-generator': {
    LOCUST_USERS: '10',
  },
  recommendation: {
    OTEL_SERVICE_NAME: 'recommendation',
    FLAGD_HOST: 'flagd',
  },
  payment: {
    FLAGD_HOST: 'flagd',
  },
};

/**
 * Feature flag configuration for OTel Demo
 */
export function getFlagdConfig(): object {
  return {
    flags: {
      productCatalogFailure: {
        state: 'ENABLED',
        variants: { on: true, off: false },
        defaultVariant: 'off',
      },
      recommendationServiceCacheFailure: {
        state: 'ENABLED',
        variants: { on: true, off: false },
        defaultVariant: 'off',
      },
      adServiceManualGc: {
        state: 'ENABLED',
        variants: { on: true, off: false },
        defaultVariant: 'off',
      },
      adServiceHighCpu: {
        state: 'ENABLED',
        variants: { on: true, off: false },
        defaultVariant: 'off',
      },
      cartServiceFailure: {
        state: 'ENABLED',
        variants: { on: true, off: false },
        defaultVariant: 'off',
      },
      paymentServiceFailure: {
        state: 'ENABLED',
        variants: { on: true, off: false },
        defaultVariant: 'off',
      },
      paymentServiceUnreachable: {
        state: 'ENABLED',
        variants: { on: true, off: false },
        defaultVariant: 'off',
      },
      loadgeneratorFloodHomepage: {
        state: 'ENABLED',
        variants: { on: true, off: false },
        defaultVariant: 'off',
      },
      kafkaQueueProblems: {
        state: 'ENABLED',
        variants: { on: true, off: false },
        defaultVariant: 'off',
      },
      imageSlowLoad: {
        state: 'ENABLED',
        variants: { on: true, off: false },
        defaultVariant: 'off',
      },
    },
  };
}
