/** The same generated listing used by the Academy self-paced website. No enrolment or progress data. */
export const academyCatalogueUrl = "https://raw.githubusercontent.com/skunkworks-academy/www/main/assets/course-catalog.generated.js";
export const academyCataloguePage = "https://www.skunkworksacademy.com/self-paced/";

export type DiscoveryCourse = {
  courseId: string; title: string; deliveryMode: string; category: string;
  level: string; estimatedEffort: string; courseUrl: string;
};
export type CourseCatalogue = { generatedOn: string; courses: DiscoveryCourse[] };
export type DiscoveryFilters = { category: string; level: string; deliveryMode: string };
export type DiscoveryChoices = DiscoveryFilters & { selectedId: string };
export const emptyDiscoveryChoices: DiscoveryChoices = { category: "", level: "", deliveryMode: "", selectedId: "" };
const fields = ["courseId", "title", "deliveryMode", "category", "level", "estimatedEffort", "courseUrl"] as const;

export function parseAcademyCatalogue(source: string): CourseCatalogue {
  // Parse the known data wrapper, never execute remote JavaScript.
  const match = source.trim().match(/^window\.SKUNKWORKS_COURSE_CATALOG_DATA\s*=\s*(\{[\s\S]*\});\s*window\.SKUNKWORKS_COURSE_CATALOG_PROMISE\s*=\s*Promise\.resolve\(window\.SKUNKWORKS_COURSE_CATALOG_DATA\);?$/);
  if (!match) throw new Error("The published course listing has an unsupported format.");
  const data = JSON.parse(match[1]);
  if (data?.schema !== "skunkworks-academy/public-course-listing/v2" ||
      !Array.isArray(data.fields) || data.fields.join("|") !== fields.join("|") ||
      !Array.isArray(data.courses) || data.courseCount !== data.courses.length ||
      typeof data.generatedOn !== "string") throw new Error("The published course listing could not be verified.");
  const seen = new Set<string>();
  const courses: DiscoveryCourse[] = data.courses.map((row: unknown) => {
    if (!Array.isArray(row) || row.length !== fields.length || row.some(value => typeof value !== "string" || !value.trim())) {
      throw new Error("A published course is missing its catalogue metadata.");
    }
    const course = Object.fromEntries(fields.map((field, index) => [field, row[index]])) as DiscoveryCourse;
    const url = new URL(course.courseUrl);
    const approvedPath = (url.hostname === "www.skunkworksacademy.com" && url.pathname.startsWith("/courses/")) ||
      (url.hostname === "skunkworks-academy.github.io" && url.pathname.startsWith("/course-catalog/courses/"));
    if (url.protocol !== "https:" || url.username || url.password || url.port || !approvedPath || seen.has(course.courseId)) {
      throw new Error("A published course has an unrecognised overview link or duplicate identity.");
    }
    seen.add(course.courseId);
    return course;
  });
  return { generatedOn: data.generatedOn, courses };
}

export async function loadAcademyCatalogue(signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<CourseCatalogue> {
  const response = await fetcher(academyCatalogueUrl, { signal, credentials: "omit", referrerPolicy: "no-referrer" });
  if (!response.ok) throw new Error(`Published catalogue request failed (${response.status}).`);
  return parseAcademyCatalogue(await response.text());
}

export function filterDiscoveryCourses(courses: DiscoveryCourse[], query: string, filters: DiscoveryFilters): DiscoveryCourse[] {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return courses.filter(course => (!filters.category || course.category === filters.category) &&
    (!filters.level || course.level === filters.level) && (!filters.deliveryMode || course.deliveryMode === filters.deliveryMode) &&
    words.every(word => `${course.courseId} ${course.title} ${course.category} ${course.level} ${course.deliveryMode}`.toLocaleLowerCase().includes(word)));
}

export function discoveryFilterOptions(courses: DiscoveryCourse[], field: keyof DiscoveryFilters): string[] {
  return [...new Set(courses.map(course => course[field]))].sort((a, b) => a.localeCompare(b));
}

export function discoveryStorageKey(accountId: string): string { return `academy:course-discovery:v1:${encodeURIComponent(accountId)}`; }
export function readDiscoveryChoices(storage: Pick<Storage, "getItem">, accountId: string): DiscoveryChoices {
  if (!accountId) return { ...emptyDiscoveryChoices };
  try {
    const data = JSON.parse(storage.getItem(discoveryStorageKey(accountId)) ?? "null");
    if (data?.version === 1 && Object.keys(emptyDiscoveryChoices).every(key => typeof data[key] === "string")) {
      return { category: data.category, level: data.level, deliveryMode: data.deliveryMode, selectedId: data.selectedId };
    }
  } catch { /* Malformed or blocked browser storage must not prevent discovery. */ }
  return { ...emptyDiscoveryChoices };
}
export function saveDiscoveryChoices(storage: Pick<Storage, "setItem">, accountId: string, choices: DiscoveryChoices): void {
  if (accountId) storage.setItem(discoveryStorageKey(accountId), JSON.stringify({ version: 1, ...choices }));
}
