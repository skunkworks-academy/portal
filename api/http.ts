import type { HttpRequest, HttpResponseInit } from "@azure/functions";
import { config } from "./config.js";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function corsHeaders(request: HttpRequest) {
  const origin = request.headers.get("origin") ?? "";
  const allowedOrigin = config.allowedOrigins.includes(origin) ? origin : config.allowedOrigins[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
    "Access-Control-Allow-Headers": "authorization,content-type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

export function json(request: HttpRequest, body: unknown, status = 200): HttpResponseInit {
  return {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json"
    },
    jsonBody: body
  };
}

export function empty(request: HttpRequest, status = 204): HttpResponseInit {
  return { status, headers: corsHeaders(request) };
}

export function failure(request: HttpRequest, error: unknown): HttpResponseInit {
  const status = error instanceof HttpError ? error.status : 500;
  const message = error instanceof Error ? error.message : "Unexpected server error";
  return {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "text/plain"
    },
    body: message
  };
}

export async function readJson<T>(request: HttpRequest): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
}
