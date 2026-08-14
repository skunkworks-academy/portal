import { app } from "@azure/functions";
import { empty, failure, json } from "./http.js";
import {
  approvePayPalSubscription,
  capturePayPalOrder,
  createCheckoutSession,
  createPayPalSubscriptionIntent,
  handlePayFastWebhook,
  handlePayPalWebhook,
  publicCheckoutPlans,
  publicPayPalConfig
} from "./payments.js";
import "./articulationCourse.js";
import "./enrolmentFunctions.js";

app.http("checkoutCors", {
  methods: ["OPTIONS"],
  authLevel: "anonymous",
  route: "checkout/{*path}",
  handler: async (request) => empty(request)
});

app.http("webhookCors", {
  methods: ["OPTIONS"],
  authLevel: "anonymous",
  route: "webhooks/{*path}",
  handler: async (request) => empty(request)
});

app.http("payfastCors", {
  methods: ["OPTIONS"],
  authLevel: "anonymous",
  route: "payfast/{*path}",
  handler: async (request) => empty(request)
});

app.http("checkoutPlans", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "checkout/plans",
  handler: async (request) => json(request, publicCheckoutPlans())
});

app.http("paypalConfig", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "checkout/paypal/config",
  handler: async (request) => json(request, publicPayPalConfig())
});

app.http("createCheckoutSession", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "checkout/sessions",
  handler: async (request, context) => {
    try {
      return json(request, await createCheckoutSession(request), 201);
    } catch (error) {
      context.error(error);
      return failure(request, error);
    }
  }
});

app.http("createPayPalSubscriptionIntent", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "checkout/paypal/subscription-intents",
  handler: async (request, context) => {
    try {
      return json(request, await createPayPalSubscriptionIntent(request), 201);
    } catch (error) {
      context.error(error);
      return failure(request, error);
    }
  }
});

app.http("approvePayPalSubscription", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "checkout/paypal/subscriptions/approve",
  handler: async (request, context) => {
    try {
      return json(request, await approvePayPalSubscription(request));
    } catch (error) {
      context.error(error);
      return failure(request, error);
    }
  }
});

app.http("capturePayPalOrder", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "checkout/paypal/capture",
  handler: async (request, context) => {
    try {
      return json(request, await capturePayPalOrder(request));
    } catch (error) {
      context.error(error);
      return failure(request, error);
    }
  }
});

app.http("payfastItnWebhook", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "webhooks/payfast/itn",
  handler: async (request, context) => {
    try {
      return json(request, await handlePayFastWebhook(request));
    } catch (error) {
      context.error(error);
      return failure(request, error);
    }
  }
});

app.http("payfastItnCompatibility", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "payfast/itn",
  handler: async (request, context) => {
    try {
      return json(request, await handlePayFastWebhook(request));
    } catch (error) {
      context.error(error);
      return failure(request, error);
    }
  }
});

app.http("paypalWebhook", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "webhooks/paypal",
  handler: async (request, context) => {
    try {
      return json(request, await handlePayPalWebhook(request));
    } catch (error) {
      context.error(error);
      return failure(request, error);
    }
  }
});
