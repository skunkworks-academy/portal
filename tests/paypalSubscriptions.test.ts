import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { publicCheckoutPlans, publicPayPalConfig } from "../api/checkoutService";

const originalEnvironment = { ...process.env };

beforeEach(() => {
  process.env.PAYPAL_ENV = "sandbox";
  process.env.PAYPAL_CLIENT_ID = "public-sandbox-client-id";
  process.env.PAYPAL_CLIENT_SECRET = "server-only-secret";
  process.env.PAYPAL_PLAN_STARTER_MONTHLY = "P-STARTER";
  process.env.PAYPAL_PLAN_PRO_MONTHLY = "P-PRO";
  process.env.PAYPAL_PLAN_MENTOR_MONTHLY = "P-MENTOR";
  process.env.PAYPAL_PLAN_TEAM_SEAT_MONTHLY = "P-TEAM";
});

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe("PayPal subscription configuration", () => {
  it("maps each Academy plan to its server-configured PayPal billing plan", () => {
    const plans = publicCheckoutPlans();

    expect(plans).toHaveLength(4);
    expect(plans.map((plan) => [plan.id, plan.paypalPlanId])).toEqual([
      ["starter-monthly", "P-STARTER"],
      ["pro-monthly", "P-PRO"],
      ["mentor-monthly", "P-MENTOR"],
      ["team-seat-monthly", "P-TEAM"]
    ]);
    expect(plans.every((plan) => plan.gateways.includes("paypal"))).toBe(true);
    expect(plans.every((plan) => plan.currencyNote.includes("subscriptions"))).toBe(true);
  });

  it("returns only public JavaScript SDK settings", () => {
    const config = publicPayPalConfig();

    expect(config).toEqual({
      enabled: true,
      clientId: "public-sandbox-client-id",
      environment: "sandbox",
      currency: "USD",
      intent: "subscription",
      vault: true
    });
    expect(JSON.stringify(config)).not.toContain("server-only-secret");
  });

  it("disables PayPal buttons until a client ID and billing plan are configured", () => {
    delete process.env.PAYPAL_CLIENT_ID;
    delete process.env.PAYPAL_PLAN_STARTER_MONTHLY;
    delete process.env.PAYPAL_PLAN_PRO_MONTHLY;
    delete process.env.PAYPAL_PLAN_MENTOR_MONTHLY;
    delete process.env.PAYPAL_PLAN_TEAM_SEAT_MONTHLY;

    expect(publicPayPalConfig().enabled).toBe(false);
    expect(publicCheckoutPlans().every((plan) => plan.paypalPlanId === "")).toBe(true);
  });
});
