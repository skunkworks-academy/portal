import { app } from "@azure/functions";
import { empty, failure, json } from "./http.js";
import {
  capturePayPalOrder,
  createCheckoutSession,
  handlePayFastWebhook,
  handlePayPalWebhook,
  publicCheckoutPlans
} from "./payments.js";

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

app.http("checkoutPlans", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "checkout/plans",
  handler: async (request) => json(request, publicCheckoutPlans())
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
