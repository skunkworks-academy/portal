import { hasPortalRole } from "./auth.js";
import { HttpError } from "./http.js";
import type { LmsContext } from "./lmsDomain.js";

/** Only server-selected own-learner routes use this after verified tenant/org resolution.
 * The verified principal and original management context remain unchanged.
 * A browser workspace preference is never an authorization input.
 */
export function ownLearnerContext(ctx: LmsContext): LmsContext {
  const explicitStudent = hasPortalRole(ctx.principal, ["Portal.Student"]);
  const management = ctx.role !== "student" || hasPortalRole(ctx.principal, ["Portal.Staff", "Portal.Admin", "Portal.Instructor"]);
  if (management && !explicitStudent) throw new HttpError(403, "Portal.Student access is required for this account's learner workspace.");
  return { ...ctx, role: "student" };
}
