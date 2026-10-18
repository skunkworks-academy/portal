import {coursePublicationRegistry, publishedCourseCatalog, coursePublicationSnapshot} from '../api/coursePublication.js';
const generated = coursePublicationRegistry.filter(c => c.origin === 'generated-foundation');
const assert = (ok: unknown, message: string) => { if (!ok) throw new Error(message); };
assert(generated.length === 19, 'Expected 19 generated AI foundation entries');
assert(publishedCourseCatalog.length === 8, 'Unexpected published course allowlist drift');
const records = coursePublicationSnapshot().courses;
assert(records.filter(c => c.checkoutUrl !== null).length === 8, 'Unapproved checkout route detected');
for (const record of records) {
  if (record.source === 'generated-foundation') {
    assert(record.publicationStatus === 'review' && record.checkoutUrl === null, 'Generated AI course published without sign-off: ' + record.courseId);
  }
}
if (process.argv.includes('--remote')) {
  const url = 'https://raw.githubusercontent.com/skunkworks-academy/course-catalog/main/static/ai-master-catalog.json';
  const response = await fetch(url, {signal: AbortSignal.timeout(15000), headers: {'Accept': 'application/json'}});
  if (!response.ok) throw new Error('Canonical course catalogue unavailable: HTTP ' + response.status);
  const upstream = await response.json() as {
    schema: string;
    courses: Array<{id: string; title: string; kind: string; enrolmentStatus: string}>
  };
  assert(upstream.schema === 'skunkworks-academy/ai-master-catalog/v1', 'Unexpected upstream AI course schema');
  const fromCanonical = upstream.courses.filter(c => c.kind === 'generated-foundation');
  assert(fromCanonical.length === 19, 'Canonical catalogue expected 19 foundation records');
  const byId = new Map(generated.map(c => [c.id, c.title]));
  for (const entry of fromCanonical) {
    assert(byId.get(entry.id) === entry.title, 'Portal publication registry does not match canonical course: ' + entry.id);
    assert(entry.enrolmentStatus === 'enquiry-only', 'Canonical catalogue claims an unapproved enrolment: ' + entry.id);
  }
  assert(byId.size === fromCanonical.length, 'Unmatched AI courses in publication registry');
}
console.log('AI publication contract verified: 19 review-required courses, eight historical allowlisted, default-deny grants.');
