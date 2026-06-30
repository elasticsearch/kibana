/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CodeScenario } from './types';

export const CODE_SCENARIOS: CodeScenario[] = [
  {
    id: 'recommendation-n-plus-1',
    name: 'Recommendation N+1 product lookup',
    description:
      'Recommendation service validates recommended products with serial GetProduct calls, driving product-catalog call volume and deadline errors under load.',
    category: 'subtle',
    affectedServices: ['recommendation'],

    bugPatch: {
      file: 'src/recommendationservice/recommendation_server.py',
      commitMessage: 'Validate recommendation products before returning ids',
      patch: `diff --git a/src/recommendationservice/recommendation_server.py b/src/recommendationservice/recommendation_server.py
index 1a6826d..24afb43 100644
--- a/src/recommendationservice/recommendation_server.py
+++ b/src/recommendationservice/recommendation_server.py
@@ -108,6 +108,22 @@ def get_product_list(request_product_ids):
         # Fetch product ids from indices
         prod_list = [filtered_products[i] for i in indices]
${' '}
+        validated_product_ids = []
+        for product_id in prod_list:
+            try:
+                product = product_catalog_stub.GetProduct(
+                    demo_pb2.GetProductRequest(id=product_id),
+                    timeout=0.001,
+                )
+                validated_product_ids.append(product.id)
+            except grpc.RpcError:
+                logger.error(
+                    "rpc deadline exceeded while calling product-catalog from recommendation",
+                    exc_info=True,
+                )
+                raise
+
+        prod_list = validated_product_ids
         span.set_attribute("app.filtered_products.list", prod_list)
${' '}
         return prod_list
`,
    },
  },
  {
    id: 'checkout-nil-address-panic',
    name: 'Checkout nil address panic',
    description:
      'Checkout normalizes some shipping addresses to nil and then dereferences the address in PlaceOrder, causing intermittent Go panics.',
    category: 'dramatic',
    affectedServices: ['checkout'],

    bugPatch: {
      file: 'src/checkoutservice/main.go',
      commitMessage: 'Normalize checkout shipping address before fulfillment',
      patch: `diff --git a/src/checkoutservice/main.go b/src/checkoutservice/main.go
index c67251a..9cc8a28 100644
--- a/src/checkoutservice/main.go
+++ b/src/checkoutservice/main.go
@@ -259,7 +259,13 @@ func (cs *checkoutService) PlaceOrder(ctx context.Context, req *pb.PlaceOrderReq
 \t\treturn nil, status.Errorf(codes.Internal, "failed to generate order uuid")
 \t}
${' '}
-\tprep, err := cs.prepareOrderItemsAndShippingQuoteFromCart(ctx, req.UserId, req.UserCurrency, req.Address)
+\tshippingAddress := req.Address
+\tif shippingAddress.GetCountry() != "United States" {
+\t\tshippingAddress = nil
+\t}
+\tspan.SetAttributes(attribute.String("app.shipping.street", shippingAddress.StreetAddress))
+
+\tprep, err := cs.prepareOrderItemsAndShippingQuoteFromCart(ctx, req.UserId, req.UserCurrency, shippingAddress)
 \tif err != nil {
 \t\treturn nil, status.Errorf(codes.Internal, err.Error())
 \t}
@@ -282,7 +288,7 @@ func (cs *checkoutService) PlaceOrder(ctx context.Context, req *pb.PlaceOrderReq
 \tspan.AddEvent("charged",
 \t\ttrace.WithAttributes(attribute.String("app.payment.transaction.id", txID)))
${' '}
-\tshippingTrackingID, err := cs.shipOrder(ctx, req.Address, prep.cartItems)
+\tshippingTrackingID, err := cs.shipOrder(ctx, shippingAddress, prep.cartItems)
 \tif err != nil {
 \t\treturn nil, status.Errorf(codes.Unavailable, "shipping error: %+v", err)
 \t}
@@ -295,7 +301,7 @@ func (cs *checkoutService) PlaceOrder(ctx context.Context, req *pb.PlaceOrderReq
 \t\tOrderId:            orderID.String(),
 \t\tShippingTrackingId: shippingTrackingID,
 \t\tShippingCost:       prep.shippingCostLocalized,
-\t\tShippingAddress:    req.Address,
+\t\tShippingAddress:    shippingAddress,
 \t\tItems:              prep.orderItems,
 \t}
${' '}
`,
    },
  },
  {
    id: 'payment-float-precision',
    name: 'Payment float precision regression',
    description:
      'Payment validation converts money nanos through floating-point arithmetic, causing exact cent comparisons to fail for specific amounts.',
    category: 'subtle',
    affectedServices: ['payment'],

    bugPatch: {
      file: 'src/paymentservice/charge.js',
      commitMessage: 'Validate processor charge amount before capture',
      patch: `diff --git a/src/paymentservice/charge.js b/src/paymentservice/charge.js
index 7fcb7fb..8a327a8 100644
--- a/src/paymentservice/charge.js
+++ b/src/paymentservice/charge.js
@@ -13,6 +13,10 @@ const tracer = trace.getTracer('paymentservice');
 const meter = metrics.getMeter('paymentservice');
 const transactionsCounter = meter.createCounter('app.payment.transactions')
${' '}
+function calculateProcessorAmount(amount) {
+  return amount.units + parseFloat(amount.nanos) / 1e9;
+}
+
 module.exports.charge = async request => {
   const span = tracer.startSpan('charge');
${' '}
@@ -59,9 +63,16 @@ module.exports.charge = async request => {
     span.setAttribute('app.payment.charged', true);
   }
${' '}
+  const { units, nanos, currencyCode } = request.amount;
+  const processorAmount = calculateProcessorAmount(request.amount);
+  const expectedCents = units * 100 + nanos / 10000000;
+  const processorCents = processorAmount * 100;
+  if (processorCents !== expectedCents) {
+    throw new Error(\`Charge amount mismatch: expected \${expectedCents} cents but processor calculated \${processorCents} cents (\${processorAmount})\`);
+  }
+
   span.end();
${' '}
-  const { units, nanos, currencyCode } = request.amount;
   logger.info({transactionId, cardType, lastFourDigits, amount: { units, nanos, currencyCode }}, "Transaction complete.");
   transactionsCounter.add(1, {"app.payment.currency": currencyCode})
   return { transactionId }
`,
    },
  },
  {
    id: 'product-catalog-unbounded-cache',
    name: 'Product catalog unbounded search cache',
    description:
      'Product catalog writes every SearchProducts response into an in-memory cache keyed by query and timestamp without eviction.',
    category: 'subtle',
    affectedServices: ['product-catalog'],

    resourceOverrides: {
      'product-catalog': {
        requests: {
          memory: '64Mi',
        },
        limits: {
          memory: '128Mi',
        },
      },
    },
    bugPatch: {
      file: 'src/productcatalogservice/main.go',
      commitMessage: 'Cache product catalog search responses',
      patch: `diff --git a/src/productcatalogservice/main.go b/src/productcatalogservice/main.go
index 12cfd4b..4b7fddf 100644
--- a/src/productcatalogservice/main.go
+++ b/src/productcatalogservice/main.go
@@ -7,6 +7,7 @@ package main
 //go:generate protoc --go_out=./ --go-grpc_out=./ --proto_path=../../pb ../../pb/demo.proto
${' '}
 import (
+\t"bytes"
 \t"context"
 \t"fmt"
 \t"io/fs"
@@ -47,10 +48,13 @@ import (
 )
${' '}
 var (
-\tlog               *logrus.Logger
-\tcatalog           []*pb.Product
-\tresource          *sdkresource.Resource
-\tinitResourcesOnce sync.Once
+\tlog                 *logrus.Logger
+\tcatalog             []*pb.Product
+\tresource            *sdkresource.Resource
+\tinitResourcesOnce   sync.Once
+\tsearchCache         = map[string][]*pb.Product{}
+\tsearchCachePayloads = map[string][]byte{}
+\tsearchCacheMu       sync.Mutex
 )
${' '}
 func init() {
@@ -238,6 +242,7 @@ func (p *productCatalog) Watch(req *healthpb.HealthCheckRequest, ws healthpb.Hea
 func (p *productCatalog) ListProducts(ctx context.Context, req *pb.Empty) (*pb.ListProductsResponse, error) {
 \tspan := trace.SpanFromContext(ctx)
${' '}
+\tcacheSearchProductsResult("list-products", catalog, span)
 \tspan.SetAttributes(
 \t\tattribute.Int("app.products.count", len(catalog)),
 \t)
@@ -275,6 +280,7 @@ func (p *productCatalog) GetProduct(ctx context.Context, req *pb.GetProductReque
${' '}
 \tmsg := fmt.Sprintf("Product Found - ID: %s, Name: %s", req.Id, found.Name)
 \tspan.AddEvent(msg)
+\tcacheSearchProductsResult("get-product:"+req.Id, []*pb.Product{found}, span)
 \tspan.SetAttributes(
 \t\tattribute.String("app.product.name", found.Name),
 \t)
@@ -291,12 +297,26 @@ func (p *productCatalog) SearchProducts(ctx context.Context, req *pb.SearchProdu
 \t\t\tresult = append(result, product)
 \t\t}
 \t}
+\tcacheSearchProductsResult(req.Query, result, span)
 \tspan.SetAttributes(
 \t\tattribute.Int("app.products_search.count", len(result)),
 \t)
 \treturn &pb.SearchProductsResponse{Results: result}, nil
 }
${' '}
+func cacheSearchProductsResult(query string, result []*pb.Product, span trace.Span) {
+\tcacheKey := fmt.Sprintf("%s:%d", query, time.Now().UnixNano())
+\tpayload := bytes.Repeat([]byte(cacheKey), (8*1024*1024/len(cacheKey))+1)
+\tsearchCacheMu.Lock()
+\tdefer searchCacheMu.Unlock()
+\tsearchCache[cacheKey] = result
+\tsearchCachePayloads[cacheKey] = payload[:8*1024*1024]
+\tlog.Warnf("product search cache entries=%d retained_bytes=%d", len(searchCache), len(searchCachePayloads)*8*1024*1024)
+\tspan.SetAttributes(
+\t\tattribute.Int("app.products_search.cache.size", len(searchCache)),
+\t)
+}
+
 func (p *productCatalog) checkProductFailure(ctx context.Context, id string) bool {
 \tif id != "OLJCESPC7Z" {
 \t\treturn false
`,
    },
  },
  {
    id: 'shipping-timeout-regression',
    name: 'Shipping quote timeout regression',
    description:
      'Shipping adds a 50ms quote-service HTTP timeout, causing quote calls to time out during realistic demo traffic.',
    category: 'dramatic',
    affectedServices: ['shipping'],

    bugPatch: {
      file: 'src/shippingservice/src/shipping_service/quote.rs',
      commitMessage: 'Tighten quote service client timeout',
      patch: `diff --git a/src/shippingservice/src/shipping_service/quote.rs b/src/shippingservice/src/shipping_service/quote.rs
index 2ffdb83..acaa66e 100644
--- a/src/shippingservice/src/shipping_service/quote.rs
+++ b/src/shippingservice/src/shipping_service/quote.rs
@@ -2,9 +2,9 @@
 // SPDX-License-Identifier: Apache-2.0
${' '}
 use core::fmt;
-use std::{collections::HashMap, env};
+use std::{collections::HashMap, env, io, time::Duration};
${' '}
-use log::info;
+use log::{error, info};
 use opentelemetry::{trace::get_active_span, KeyValue};
 use reqwest_middleware::ClientBuilder;
 use reqwest_tracing::{SpanBackendWithUrl, TracingMiddleware};
@@ -21,6 +21,7 @@ pub async fn create_quote_from_count(count: u32) -> Result<Quote, tonic::Status>
         Ok(float) => float,
         Err(err) => {
             let msg = format!("{}", err);
+            error!("quote service request failed: {}", msg);
             return Err(tonic::Status::unknown(msg));
         }
     };
@@ -50,17 +51,30 @@ async fn request_quote(count: u32) -> Result<f64, Box<dyn std::error::Error>> {
     let mut reqbody = HashMap::new();
     reqbody.insert("numberOfItems", count);
${' '}
-    let client = ClientBuilder::new(reqwest::Client::new())
+    let http_client = reqwest::Client::builder()
+        .timeout(Duration::from_millis(50))
+        .build()?;
+    let client = ClientBuilder::new(http_client)
         .with(TracingMiddleware::<SpanBackendWithUrl>::new())
         .build();
${' '}
-    let resp = client
-        .post(quote_service_addr)
-        .json(&reqbody)
-        .send()
-        .await?
-        .text_with_charset("utf-8")
-        .await?;
+    let response = match tokio::time::timeout(Duration::from_millis(50), async {
+        tokio::time::sleep(Duration::from_millis(75)).await;
+        client.post(quote_service_addr).json(&reqbody).send().await
+    })
+    .await
+    {
+        Ok(Ok(response)) => response,
+        Ok(Err(error)) => return Err(Box::new(error)),
+        Err(_) => {
+            return Err(Box::new(io::Error::new(
+                io::ErrorKind::TimedOut,
+                "operation timed out while calling quote service after 50ms",
+            )))
+        }
+    };
+
+    let resp = response.text_with_charset("utf-8").await?;
${' '}
     info!("Received quote: {:?}", resp);
${' '}
`,
    },
  },
];

export function getCodeScenarioById(id: string): CodeScenario | undefined {
  return CODE_SCENARIOS.find((scenario) => scenario.id === id);
}
