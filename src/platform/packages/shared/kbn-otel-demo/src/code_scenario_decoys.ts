/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { PatchEntry } from './types';

export const CODE_SCENARIO_DECOYS: PatchEntry[] = [
  {
    file: 'src/checkoutservice/main.go',
    commitMessage: 'Normalize checkout order log formatting',
    patch: `diff --git a/src/checkoutservice/main.go b/src/checkoutservice/main.go
index c67251a..9d4262f 100644
--- a/src/checkoutservice/main.go
+++ b/src/checkoutservice/main.go
@@ -245,7 +245,11 @@ func (cs *checkoutService) PlaceOrder(ctx context.Context, req *pb.PlaceOrderReq
 \t\tattribute.String("app.user.id", req.UserId),
 \t\tattribute.String("app.user.currency", req.UserCurrency),
 \t)
-\tlog.Infof("[PlaceOrder] user_id=%q user_currency=%q", req.UserId, req.UserCurrency)
+\tlog.Infof(
+\t\t"[PlaceOrder] user_id=%q user_currency=%q",
+\t\treq.UserId,
+\t\treq.UserCurrency,
+\t)
${' '}
 \tvar err error
 \tdefer func() {
`,
  },
  {
    file: 'src/frontend/utils/Request.ts',
    commitMessage: 'Document frontend request timeout ownership',
    patch: `diff --git a/src/frontend/utils/Request.ts b/src/frontend/utils/Request.ts
index b0ff20e..5abcf26 100644
--- a/src/frontend/utils/Request.ts
+++ b/src/frontend/utils/Request.ts
@@ -18,6 +18,7 @@ const request = async <T>({
     'content-type': 'application/json',
   },
 }: IRequestParams): Promise<T> => {
+  // Fetch timeout behavior is owned by the browser/runtime for this demo client.
   const response = await fetch(\`\${url}?\${new URLSearchParams(queryParams).toString()}\`, {
     method,
     body: body ? JSON.stringify(body) : undefined,
`,
  },
  {
    file: 'src/paymentservice/charge.js',
    commitMessage: 'Fix payment card type capitalization',
    patch: `diff --git a/src/paymentservice/charge.js b/src/paymentservice/charge.js
index 7fcb7fb..d106d59 100644
--- a/src/paymentservice/charge.js
+++ b/src/paymentservice/charge.js
@@ -44,7 +44,7 @@ module.exports.charge = async request => {
   }
${' '}
   if (!['visa', 'mastercard'].includes(cardType)) {
-    throw new Error(\`Sorry, we cannot process \${cardType} credit cards. Only VISA or MasterCard is accepted.\`);
+    throw new Error(\`Sorry, we cannot process \${cardType} credit cards. Only Visa or MasterCard is accepted.\`);
   }
${' '}
   if ((currentYear * 12 + currentMonth) > (year * 12 + month)) {
`,
  },
  {
    file: 'src/cartservice/src/cartstore/ValkeyCartStore.cs',
    commitMessage: 'Refresh cart store retry comment',
    patch: `diff --git a/src/cartservice/src/cartstore/ValkeyCartStore.cs b/src/cartservice/src/cartstore/ValkeyCartStore.cs
index aa79afe..d061503 100644
--- a/src/cartservice/src/cartstore/ValkeyCartStore.cs
+++ b/src/cartservice/src/cartstore/ValkeyCartStore.cs
@@ -35,7 +35,7 @@ public class ValkeyCartStore : ICartStore
${' '}
         _redisConnectionOptions = ConfigurationOptions.Parse(_connectionString);
${' '}
-        // Try to reconnect multiple times if the first retry fails.
+        // Keep retry attempts high enough for Valkey startup during pod rollout.
         _redisConnectionOptions.ConnectRetry = RedisRetryNumber;
         _redisConnectionOptions.ReconnectRetryPolicy = new ExponentialRetry(1000);
${' '}
`,
  },
  {
    file: 'src/adservice/src/main/java/oteldemo/AdService.java',
    commitMessage: 'Rename ad response local for readability',
    patch: `diff --git a/src/adservice/src/main/java/oteldemo/AdService.java b/src/adservice/src/main/java/oteldemo/AdService.java
index c55b663..334a167 100644
--- a/src/adservice/src/main/java/oteldemo/AdService.java
+++ b/src/adservice/src/main/java/oteldemo/AdService.java
@@ -212,8 +212,8 @@ public final class AdService {
           gct.doExecute();
         }
${' '}
-        AdResponse reply = AdResponse.newBuilder().addAllAds(allAds).build();
-        responseObserver.onNext(reply);
+        AdResponse response = AdResponse.newBuilder().addAllAds(allAds).build();
+        responseObserver.onNext(response);
         responseObserver.onCompleted();
       } catch (StatusRuntimeException e) {
         span.addEvent(
`,
  },
  {
    file: 'src/currencyservice/src/server.cpp',
    commitMessage: 'Explain currency unit truncation',
    patch: `diff --git a/src/currencyservice/src/server.cpp b/src/currencyservice/src/server.cpp
index ff194ed..9ff833b 100644
--- a/src/currencyservice/src/server.cpp
+++ b/src/currencyservice/src/server.cpp
@@ -156,6 +156,7 @@ class CurrencyService final : public oteldemo::CurrencyService::Service
   }
${' '}
   void getUnitsAndNanos(Money& money, double value) {
+    // Unit truncation is safe here because nanos carries the fractional remainder.
     long unit = (long)value;
     double rem = value - unit;
     long nano = rem * pow(10, 9);
`,
  },
  {
    file: 'src/emailservice/email_server.rb',
    commitMessage: 'Reformat email response builder block',
    patch: `diff --git a/src/emailservice/email_server.rb b/src/emailservice/email_server.rb
index ae0291d..e47335d 100644
--- a/src/emailservice/email_server.rb
+++ b/src/emailservice/email_server.rb
@@ -37,11 +37,11 @@ def send_email(data)
   tracer = OpenTelemetry.tracer_provider.tracer('emailservice')
   tracer.in_span("send_email") do |span|
     Pony.mail(
-      to:       data.email,
-      from:     "noreply@example.com",
-      subject:  "Your confirmation email",
-      body:     erb(:confirmation, locals: { order: data.order }),
-      via:      :test
+      to: data.email,
+      from: "noreply@example.com",
+      subject: "Your confirmation email",
+      body: erb(:confirmation, locals: { order: data.order }),
+      via: :test
     )
     span.set_attribute("app.email.recipient", data.email)
     puts "Order confirmation email sent to: #{data.email}"
`,
  },
  {
    file: 'src/recommendationservice/recommendation_server.py',
    commitMessage: 'Document recommendation product helper',
    patch: `diff --git a/src/recommendationservice/recommendation_server.py b/src/recommendationservice/recommendation_server.py
index 1a6826d..16c7c87 100644
--- a/src/recommendationservice/recommendation_server.py
+++ b/src/recommendationservice/recommendation_server.py
@@ -65,6 +65,7 @@ class RecommendationService(demo_pb2_grpc.RecommendationServiceServicer):
${' '}
${' '}
 def get_product_list(request_product_ids):
+    """Return recommended product ids excluding the products already in the cart."""
     global first_run
     global cached_ids
     with tracer.start_as_current_span("get_product_list") as span:
`,
  },
  {
    file: 'src/shippingservice/src/shipping_service/quote.rs',
    commitMessage: 'Add quote client refactor note',
    patch: `diff --git a/src/shippingservice/src/shipping_service/quote.rs b/src/shippingservice/src/shipping_service/quote.rs
index 2ffdb83..59543e9 100644
--- a/src/shippingservice/src/shipping_service/quote.rs
+++ b/src/shippingservice/src/shipping_service/quote.rs
@@ -16,6 +16,7 @@ pub struct Quote {
 }
${' '}
 // TODO: Check product catalog for price on each item (will likely need item ID)
+// FIXME: Move quote client construction behind a reusable helper.
 pub async fn create_quote_from_count(count: u32) -> Result<Quote, tonic::Status> {
     let f = match request_quote(count).await {
         Ok(float) => float,
`,
  },
  {
    file: 'src/quoteservice/app/routes.php',
    commitMessage: 'Lower verbose quote log level',
    patch: `diff --git a/src/quoteservice/app/routes.php b/src/quoteservice/app/routes.php
index 2c2231a..7030bb7 100644
--- a/src/quoteservice/app/routes.php
+++ b/src/quoteservice/app/routes.php
@@ -64,7 +64,7 @@ return function (App $app) {
             'app.quote.cost.total' => $data
         ]);
         //exported as an opentelemetry log (see dependencies.php)
-        $logger->info('Calculated quote', [
+        $logger->debug('Calculated quote', [
             'total' => $data,
         ]);
${' '}
`,
  },
  {
    file: 'src/productcatalogservice/main.go',
    commitMessage: 'Normalize product catalog file list naming',
    patch: `diff --git a/src/productcatalogservice/main.go b/src/productcatalogservice/main.go
index 12cfd4b..ef64893 100644
--- a/src/productcatalogservice/main.go
+++ b/src/productcatalogservice/main.go
@@ -186,21 +186,21 @@ func readProductFiles() ([]*pb.Product, error) {
 \t\treturn nil, err
 \t}
${' '}
-\tjsonFiles := make([]fs.FileInfo, 0, len(entries))
+\tproductFiles := make([]fs.FileInfo, 0, len(entries))
 \tfor _, entry := range entries {
 \t\tif strings.HasSuffix(entry.Name(), ".json") {
 \t\t\tinfo, err := entry.Info()
 \t\t\tif err != nil {
 \t\t\t\treturn nil, err
 \t\t\t}
-\t\t\tjsonFiles = append(jsonFiles, info)
+\t\t\tproductFiles = append(productFiles, info)
 \t\t}
 \t}
${' '}
 \t// read the contents of each .json file and unmarshal into a ListProductsResponse
 \t// then append the products to the catalog
 \tvar products []*pb.Product
-\tfor _, f := range jsonFiles {
+\tfor _, f := range productFiles {
 \t\tjsonData, err := os.ReadFile("./products/" + f.Name())
 \t\tif err != nil {
 \t\t\treturn nil, err
`,
  },
  {
    file: 'src/frontend/utils/Request.ts',
    commitMessage: 'Simplify frontend empty response check',
    patch: `diff --git a/src/frontend/utils/Request.ts b/src/frontend/utils/Request.ts
index b0ff20e..516a65d 100644
--- a/src/frontend/utils/Request.ts
+++ b/src/frontend/utils/Request.ts
@@ -26,7 +26,7 @@ const request = async <T>({
${' '}
   const responseText = await response.text();
${' '}
-  if (!!responseText) return JSON.parse(responseText);
+  if (responseText) return JSON.parse(responseText);
${' '}
   return undefined as unknown as T;
 };
`,
  },
  {
    file: 'src/checkoutservice/main.go',
    commitMessage: 'Add checkout request region span attribute',
    patch: `diff --git a/src/checkoutservice/main.go b/src/checkoutservice/main.go
index c67251a..512dcb3 100644
--- a/src/checkoutservice/main.go
+++ b/src/checkoutservice/main.go
@@ -264,6 +264,7 @@ func (cs *checkoutService) PlaceOrder(ctx context.Context, req *pb.PlaceOrderReq
 \t\treturn nil, status.Errorf(codes.Internal, err.Error())
 \t}
 \tspan.AddEvent("prepared")
+\tspan.SetAttributes(attribute.String("app.request.region", req.Address.GetState()))
${' '}
 \ttotal := &pb.Money{CurrencyCode: req.UserCurrency,
 \t\tUnits: 0,
`,
  },
  {
    file: 'src/cartservice/src/cartstore/ValkeyCartStore.cs',
    commitMessage: 'Clarify cart storage error wording',
    patch: `diff --git a/src/cartservice/src/cartstore/ValkeyCartStore.cs b/src/cartservice/src/cartstore/ValkeyCartStore.cs
index aa79afe..a1aaa85 100644
--- a/src/cartservice/src/cartstore/ValkeyCartStore.cs
+++ b/src/cartservice/src/cartstore/ValkeyCartStore.cs
@@ -144,7 +144,7 @@ public class ValkeyCartStore : ICartStore
         }
         catch (Exception ex)
         {
-            throw new RpcException(new Status(StatusCode.FailedPrecondition, $"Can't access cart storage. {ex}"));
+            throw new RpcException(new Status(StatusCode.FailedPrecondition, $"Unable to access cart storage. {ex}"));
         }
     }
${' '}
`,
  },
  {
    file: 'src/adservice/src/main/java/oteldemo/AdService.java',
    commitMessage: 'Format ad service logger initialization',
    patch: `diff --git a/src/adservice/src/main/java/oteldemo/AdService.java b/src/adservice/src/main/java/oteldemo/AdService.java
index c55b663..841a31e 100644
--- a/src/adservice/src/main/java/oteldemo/AdService.java
+++ b/src/adservice/src/main/java/oteldemo/AdService.java
@@ -50,7 +50,8 @@ import java.util.UUID;
${' '}
 public final class AdService {
${' '}
-  private static final Logger logger = LogManager.getLogger(AdService.class);
+  private static final Logger logger =
+      LogManager.getLogger(AdService.class);
${' '}
   @SuppressWarnings("FieldCanBeLocal")
   private static final int MAX_ADS_TO_SERVE = 2;
`,
  },
  {
    file: 'src/recommendationservice/recommendation_server.py',
    commitMessage: 'Sort recommendation telemetry imports',
    patch: `diff --git a/src/recommendationservice/Dockerfile b/src/recommendationservice/Dockerfile
index 4a3d2e7..8ea0b89 100644
--- a/src/recommendationservice/Dockerfile
+++ b/src/recommendationservice/Dockerfile
@@ -17,6 +17,7 @@ COPY ./src/recommendationservice/requirements.txt ./
${' '}
 RUN pip install --upgrade pip
 RUN pip install --prefix="/reqs" -r requirements.txt
+RUN pip install --prefix="/reqs" "setuptools<81"
${' '}
 #
 # Build gRPC files
@@ -25,7 +26,7 @@ FROM base as grpc-builder
 WORKDIR /usr/src/app/
 COPY ./pb/ ./proto/
${' '}
-RUN python -m pip install grpcio-tools==1.59.2
+RUN python -m pip install grpcio-tools==1.59.2 "setuptools<81"
 RUN python -m grpc_tools.protoc -I=./proto/ --python_out=./ --grpc_python_out=./ ./proto/demo.proto
${' '}
 #
diff --git a/src/recommendationservice/recommendation_server.py b/src/recommendationservice/recommendation_server.py
index 1a6826d..69913b6 100644
--- a/src/recommendationservice/recommendation_server.py
+++ b/src/recommendationservice/recommendation_server.py
@@ -11,7 +11,7 @@ from concurrent import futures
${' '}
 # Pip
 import grpc
-from opentelemetry import trace, metrics
+from opentelemetry import metrics, trace
 from opentelemetry._logs import set_logger_provider
 from opentelemetry.exporter.otlp.proto.grpc._log_exporter import (
     OTLPLogExporter,
`,
  },
  {
    file: 'src/paymentservice/index.js',
    commitMessage: 'Guard payment requests without an amount',
    patch: `diff --git a/src/paymentservice/index.js b/src/paymentservice/index.js
index af40998..744e421 100644
--- a/src/paymentservice/index.js
+++ b/src/paymentservice/index.js
@@ -13,6 +13,10 @@ async function chargeServiceHandler(call, callback) {
${' '}
   try {
     const amount = call.request.amount
+    if (!amount) {
+      callback(new Error("Charge request amount is required."))
+      return
+    }
     span.setAttributes({
       'app.payment.amount': parseFloat(\`\${amount.units}.\${amount.nanos}\`)
     })
`,
  },
  {
    file: 'src/shippingservice/src/shipping_service.rs',
    commitMessage: 'Record shipping build revision attribute',
    patch: `diff --git a/src/shippingservice/src/shipping_service.rs b/src/shippingservice/src/shipping_service.rs
index dbb2ccc..3dcec1d 100644
--- a/src/shippingservice/src/shipping_service.rs
+++ b/src/shippingservice/src/shipping_service.rs
@@ -138,6 +138,10 @@ impl ShippingService for ShippingServer {
${' '}
         let tid = create_tracking_id();
         span.set_attribute(KeyValue::new("app.shipping.tracking.id", tid.clone()));
+        span.set_attribute(KeyValue::new(
+            "app.shipping.git_sha",
+            option_env!("GIT_SHA").unwrap_or("unknown"),
+        ));
         info!("Tracking ID Created: {}", tid);
${' '}
         span.add_event(
`,
  },
  {
    file: 'src/currencyservice/src/server.cpp',
    commitMessage: 'Group currency gRPC using declarations',
    patch: `diff --git a/src/currencyservice/src/server.cpp b/src/currencyservice/src/server.cpp
index ff194ed..2fae412 100644
--- a/src/currencyservice/src/server.cpp
+++ b/src/currencyservice/src/server.cpp
@@ -29,10 +29,10 @@ using oteldemo::GetSupportedCurrenciesResponse;
 using oteldemo::CurrencyConversionRequest;
 using oteldemo::Money;
${' '}
-using grpc::Status;
-using grpc::ServerContext;
-using grpc::ServerBuilder;
 using grpc::Server;
+using grpc::ServerBuilder;
+using grpc::ServerContext;
+using grpc::Status;
${' '}
 using Span        = opentelemetry::trace::Span;
 using SpanContext = opentelemetry::trace::SpanContext;
`,
  },
  {
    file: 'src/emailservice/email_server.rb',
    commitMessage: 'Reword email port configuration comment',
    patch: `diff --git a/src/emailservice/email_server.rb b/src/emailservice/email_server.rb
index ae0291d..76ec4eb 100644
--- a/src/emailservice/email_server.rb
+++ b/src/emailservice/email_server.rb
@@ -9,6 +9,7 @@ require "opentelemetry/sdk"
 require "opentelemetry/exporter/otlp"
 require "opentelemetry/instrumentation/sinatra"
${' '}
+# Sinatra reads the demo service port from the deployment environment.
 set :port, ENV["EMAIL_SERVICE_PORT"]
${' '}
 OpenTelemetry::SDK.configure do |c|
`,
  },
];
