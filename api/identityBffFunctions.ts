import {
  app,
  type Cookie,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext
} from "@azure/functions";
import { HttpError } from "./http.js";
import {
  assertIdentityBffReady,
  AzureTableIdentityStore,
  EntraOidcClient,
  IdentityBffService,
  loadIdentityBffConfig,
  readSessionCookie
} from "./identityBff.js";
import {
  browserBindingForState,
  readBrowserBindingCookie,
  verifyBrowserBinding
} from "./identityBffBrowserBinding.js";

const identityConfig = loadIdentityBffConfig();
let identityService: IdentityBffService | undefined;

function service() {
  assertIdentityBffReady(identityConfig);
  identityService ??= new IdentityBffService(
    identityConfig,
    new AzureTableIdentityStore(identityConfig),
    new EntraOidcClient(identityConfig)
  );
  return identityService;
}

function firstForwardedValue(value: string | null) {
  return value?.split(",")[0]?.trim() ?? "";
}

function assertPublicBoundary(request: HttpRequest) {
  assertIdentityBffReady(identityConfig);
  const expected = new URL(identityConfig.publicOrigin);
  const forwardedHost = firstForwardedValue(request.headers.get("x-forwarded-host"));
  const requestHost = forwardedHost || request.headers.get("host") || "";
  if (requestHost.toLowerCase() !== expected.host.toLowerCase()) {
    throw new HttpError(421, "Identity request did not arrive through the configured application origin.");
  }

  const forwardedProto = firstForwardedValue(request.headers.get("x-forwarded-proto"));
  if (expected.protocol === "https:" && forwardedProto && forwardedProto !== "https") {
    throw new HttpError(421, "Identity request did not arrive through HTTPS.");
  }
}

function assertSameOriginWrite(request: HttpRequest) {
  assertPublicBoundary(request);
  const origin = request.headers.get("origin") ?? "";
  if (origin !== identityConfig.publicOrigin) throw new HttpError(403, "Cross-origin identity state changes are not permitted.");
}

function noStoreHeaders(extra: Record<string, string> = {}) {
  return {
    "Cache-Control": "no-store, private",
    "Pragma": "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    ...extra
  };
}

function sessionCookie(value: string, maxAge: number): Cookie {
  return {
    name: "__Host-swa_session",
    value,
    path: "/",
    maxAge,
    secure: true,
    httpOnly: true,
    sameSite: "Lax"
  };
}

function browserBindingCookie(value: string, maxAge: number): Cookie {
  return {
    name: "__Host-swa_auth_tx",
    value,
    path: "/",
    maxAge,
    secure: true,
    httpOnly: true,
    sameSite: "Lax"
  };
}

function jsonNoStore(body: unknown, status = 200, cookies?: Cookie[]): HttpResponseInit {
  return {
    status,
    cookies,
    headers: noStoreHeaders({
      "Content-Type": "application/json; charset=utf-8",
      "Vary": "Cookie"
    }),
    jsonBody: body
  };
}

function safeFailure(error: unknown, cookies?: Cookie[]): HttpResponseInit {
  const status = error instanceof HttpError ? error.status : 500;
  const message = error instanceof HttpError && error.status < 500
    ? error.message
    : status === 503 ? "Identity session service is unavailable." : "Identity session request failed.";
  return {
    status,
    cookies,
    headers: noStoreHeaders({ "Content-Type": "text/plain; charset=utf-8" }),
    body: message
  };
}

function logRejected(context: InvocationContext, error: unknown) {
  const status = error instanceof HttpError ? error.status : 500;
  if (status >= 500) context.error("Identity BFF request failed.", error instanceof Error ? error.message : "unknown_error");
  else context.warn("Identity BFF request rejected.", { status, reason: error instanceof Error ? error.message : "request_rejected" });
}

async function handle(context: InvocationContext, action: () => Promise<HttpResponseInit>) {
  try {
    return await action();
  } catch (error) {
    logRejected(context, error);
    return safeFailure(error);
  }
}

app.http("identityBffLogin", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "auth/login",
  handler: async (request, context) => handle(context, async () => {
    assertPublicBoundary(request);
    const result = await service().startLogin(request.query.get("returnTo"));
    const state = new URL(result.location).searchParams.get("state");
    if (!state) throw new HttpError(500, "Identity provider authorization request did not contain state.");
    const binding = browserBindingForState(state, identityConfig.encryptionKey);
    context.log("Identity BFF login initiated.", { correlationId: result.correlationId, propertyId: identityConfig.propertyId });
    return {
      status: 302,
      cookies: [browserBindingCookie(binding, identityConfig.transactionTtlMinutes * 60)],
      headers: noStoreHeaders({ Location: result.location })
    };
  })
});

app.http("identityBffCallback", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "auth/callback",
  handler: async (request, context) => {
    const clearBinding = browserBindingCookie("", 0);
    try {
      assertPublicBoundary(request);
      const state = request.query.get("state")?.trim() ?? "";
      const binding = readBrowserBindingCookie(request.headers.get("cookie"));
      if (!state || !verifyBrowserBinding(state, binding, identityConfig.encryptionKey)) {
        throw new HttpError(400, "Authorization callback is not bound to the initiating browser transaction.");
      }

      const result = await service().completeCallback({
        state,
        code: request.query.get("code"),
        error: request.query.get("error")
      });
      const maxAgeSeconds = identityConfig.sessionTtlMinutes * 60;
      context.log("Identity BFF session created.", {
        correlationId: result.session.correlationId,
        propertyId: identityConfig.propertyId,
        subjectId: result.session.subjectId
      });
      return {
        status: 302,
        cookies: [clearBinding, sessionCookie(result.sessionId, maxAgeSeconds)],
        headers: noStoreHeaders({ Location: result.returnTo })
      } satisfies HttpResponseInit;
    } catch (error) {
      logRejected(context, error);
      return safeFailure(error, [clearBinding]);
    }
  }
});

app.http("identityBffSession", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "session",
  handler: async (request, context) => handle(context, async () => {
    assertPublicBoundary(request);
    const sessionId = readSessionCookie(request.headers.get("cookie"));
    const session = await service().sessionView(sessionId);
    if (!session) {
      return jsonNoStore(
        { authenticated: false },
        200,
        sessionId ? [sessionCookie("", 0)] : undefined
      );
    }
    context.log("Identity BFF session resolved.", { propertyId: identityConfig.propertyId, subjectId: session.subject });
    return jsonNoStore(session);
  })
});

app.http("identityBffLogout", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "auth/logout",
  handler: async (request, context) => handle(context, async () => {
    assertSameOriginWrite(request);
    const sessionId = readSessionCookie(request.headers.get("cookie"));
    const csrfToken = request.headers.get("x-csrf-token");
    await service().logout(sessionId, csrfToken);
    context.log("Identity BFF local logout completed.", { propertyId: identityConfig.propertyId });
    return {
      status: 204,
      cookies: [sessionCookie("", 0)],
      headers: noStoreHeaders()
    };
  })
});
