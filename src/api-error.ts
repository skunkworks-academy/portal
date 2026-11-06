/** Preserve the HTTP status even when a gateway returns only "Forbidden". */
export class PortalApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "PortalApiError";
  }
}
