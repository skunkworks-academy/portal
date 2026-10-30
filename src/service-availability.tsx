import type { PortalHealth } from "./types";
import "./service-availability.css";

export type PortalService = "api" | "jobs" | "courses" | "classes";
export type ServiceStatus = "loading" | "available" | "unavailable";
export type PortalServiceAvailability = Record<PortalService, ServiceStatus>;

export const loadingServices: PortalServiceAvailability = {
  api: "loading", jobs: "loading", courses: "loading", classes: "loading"
};
export const availableServices: PortalServiceAvailability = {
  api: "available", jobs: "available", courses: "available", classes: "available"
};

const serviceNames: Record<PortalService, string> = {
  api: "Portal API", jobs: "Instructor opportunities", courses: "Course catalogue", classes: "Class schedule"
};

export function resolveAvailability(
  results: [PromiseSettledResult<PortalHealth>, PromiseSettledResult<unknown>, PromiseSettledResult<unknown>, PromiseSettledResult<unknown>]
): PortalServiceAvailability {
  const [health, jobs, courses, classes] = results;
  return {
    api: health.status === "fulfilled" && health.value?.ok === true ? "available" : "unavailable",
    jobs: jobs.status === "fulfilled" ? "available" : "unavailable",
    courses: courses.status === "fulfilled" ? "available" : "unavailable",
    classes: classes.status === "fulfilled" ? "available" : "unavailable"
  };
}

export function PortalServiceNotice({
  services,
  onRetry
}: {
  services: PortalServiceAvailability;
  onRetry: () => void;
}) {
  const failed = (Object.keys(services) as PortalService[]).filter((key) => services[key] === "unavailable");
  const pending = (Object.keys(services) as PortalService[]).filter((key) => services[key] === "loading");

  if (failed.length === 0 && pending.length === 0) return null;
  const isFailure = failed.length > 0;
  return (
    <section className={isFailure ? "portal-services portal-services--failure" : "portal-services portal-services--loading"}
      role="status" aria-live="polite" aria-atomic="true">
      <div>
        <strong>{isFailure ? "Some Academy services are unavailable" : "Connecting to Academy services…"}</strong>
        <p>{isFailure
          ? `Could not retrieve ${failed.map((key) => serviceNames[key]).join(", ")}. Missing records below do not mean there are no courses or classes.`
          : "Retrieving real Academy records. Your saved data is not being replaced with example content."}
        </p>
      </div>
      <button type="button" onClick={onRetry} disabled={pending.length > 0} aria-label="Retry loading Academy services">
        {pending.length > 0 ? "Checking…" : "Retry services"}
      </button>
    </section>
  );
}
