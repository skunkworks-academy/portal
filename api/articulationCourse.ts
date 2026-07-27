import { publishedCourseCatalog } from "./enrolmentService.js";

const articulationCourse = {
  id: "ART-101",
  title: "Professional Articulation and Executive Communication"
} as const;

const mutableCatalog = publishedCourseCatalog as unknown as Array<{ id: string; title: string }>;

if (!mutableCatalog.some((course) => course.id === articulationCourse.id)) {
  mutableCatalog.unshift(articulationCourse);
}

export { articulationCourse };
