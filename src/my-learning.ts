import type { LmsCourseRecord, LmsEnrolmentRecord } from "./api";

/** Only a matching, authorised enrolment makes a catalogue course personal learning. */
export function enrolledLearning(courses: LmsCourseRecord[], enrolments: LmsEnrolmentRecord[]) {
  const key = (item: { organizationId: string; courseId: string }) => JSON.stringify([item.organizationId, item.courseId]);
  const recorded = new Map(enrolments.filter(item => item.status === "active" || item.status === "completed").map(item => [key(item), item]));
  const enrolled = courses.filter(course => recorded.has(key({ organizationId: course.organizationId, courseId: course.id })));
  const visible = new Set(enrolled.map(course => key({ organizationId: course.organizationId, courseId: course.id })));
  return { courses: enrolled, enrolments: [...recorded.values()], unavailable: [...recorded.entries()].filter(([id]) => !visible.has(id)).map(([, item]) => item) };
}
