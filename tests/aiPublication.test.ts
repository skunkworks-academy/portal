import {describe, expect, it} from 'vitest';
import {coursePublicationRegistry, coursePublicationSnapshot, hasDocumentedApproval, isCoursePublished, publishedCourseCatalog, type CoursePublication} from '../api/coursePublication.js';
import {entitlementGrantsCourse, isEntitlementActive, type GrantEntitlement, type RequestedCourseAccess} from '../api/courseEntitlements.js';

const now = Date.parse('2026-10-18T08:00:00.000Z');
const course: RequestedCourseAccess = {
  courseId: 'SKW-BEG-AI-101', learnerEmail: 'learner@example.invalid',
  planId: 'starter-monthly', entitlementId: '', paymentTransactionId: ''
};
const grant: GrantEntitlement = {
  id: 'ent-1', customerEmail: 'learner@example.invalid', status: 'Active',
  validUntil: '2026-11-18T08:00:00.000Z', paymentTransactionId: 'pay-1',
  providerReference: 'provider-1', planId: 'starter-monthly',
  entitlement: 'academy.starter', courseId: ''
};
describe('AI course publication authority', () => {
  it('preserves exactly eight historical allowlisted courses while generated foundations remain in review', () => {
    expect(publishedCourseCatalog).toHaveLength(8);
    expect(coursePublicationRegistry.filter(x => x.origin === 'generated-foundation')).toHaveLength(19);
    expect(coursePublicationRegistry.filter(x => x.origin === 'generated-foundation').every(x => x.status === 'review' && x.approval === null)).toBe(true);
    for (const entry of coursePublicationRegistry.filter(x => x.origin === 'generated-foundation')) {
      expect(isCoursePublished(entry.id)).toBe(false);
    }
    expect(isCoursePublished('SWA-AI-003')).toBe(false);
    expect(isCoursePublished('CLD-UF-101')).toBe(false);
    expect(isCoursePublished('unknown')).toBe(false);
    expect(isCoursePublished('skw-beg-ai-101')).toBe(true);
  });
  it('exports stable machine-readable approvals without enabling pending checkout', () => {
    const snapshot = coursePublicationSnapshot();
    expect(snapshot.schema).toBe('skunkworks-academy/course-publication/v1');
    expect(snapshot.policy).toBe('default-deny');
    expect(snapshot.courses).toHaveLength(27);
    expect(snapshot.courses.filter(x => x.checkoutUrl)).toHaveLength(8);
    expect(snapshot.courses.find(x => x.courseId === 'SWA-AI-001')).toMatchObject({
      publicationStatus: 'review', enrolmentStatus: 'enquiry-only', checkoutUrl: null,
      review: {editorial: 'pending', commercial: 'pending', quality: 'pending'}
    });
  });
  it('demands all three approval records, signed-off reviewer, secure overview, and exact entitlement scope', () => {
    const base = coursePublicationRegistry.find(x => x.id === 'SWA-AI-001')!;
    expect(hasDocumentedApproval(base)).toBe(false);
    const proposed: CoursePublication = {
      ...base, status: 'published',
      approval: {editorialEvidence: 'PR#101', commercialEvidence: 'Decision#20', qaEvidence: 'Test#30',
        approvedBy: 'staff-reviewer', approvedAt: '2026-10-18T07:00:00Z',
        publicUrl: 'https://www.skunkworksacademy.com/courses/catalog/automation-ai-integration-specialist',
        entitlementScope: 'academy.course.SWA-AI-001'}
    };
    expect(hasDocumentedApproval(proposed)).toBe(true);
    expect(hasDocumentedApproval({...proposed, approval: {...proposed.approval!, commercialEvidence: ''}})).toBe(false);
    expect(hasDocumentedApproval({...proposed, approval: {...proposed.approval!, entitlementScope: 'academy.pro'}})).toBe(false);
  });
});

describe('server-side course-entitlement decisions', () => {
  it('accepts valid linked legacy subscription only for the right course, learner and plan', () => {
    expect(entitlementGrantsCourse(grant, course, now)).toBe(true);
    expect(entitlementGrantsCourse({...grant, status: 'Suspended'}, course, now)).toBe(false);
    expect(entitlementGrantsCourse({...grant, status: 'Cancelled'}, course, now)).toBe(false);
    expect(entitlementGrantsCourse({...grant, status: 'Expired'}, course, now)).toBe(false);
    expect(entitlementGrantsCourse({...grant, customerEmail: 'other@example.invalid'}, course, now)).toBe(false);
    expect(entitlementGrantsCourse({...grant, planId: 'mentor-monthly'}, course, now)).toBe(false);
    expect(entitlementGrantsCourse(grant, {...course, entitlementId: 'other'}, now)).toBe(false);
    expect(entitlementGrantsCourse(grant, {...course, paymentTransactionId: 'other'}, now)).toBe(false);
    expect(entitlementGrantsCourse(grant, {...course, courseId: 'SWA-AI-003'}, now)).toBe(false);
    expect(entitlementGrantsCourse(grant, {...course, courseId: 'NOT-PUBLISHED'}, now)).toBe(false);
    expect(entitlementGrantsCourse(grant, {...course, planId: ''}, now)).toBe(false);
  });
  it('denies expired, missing, or unparseable paid grants', () => {
    expect(isEntitlementActive(grant, now)).toBe(true);
    for (const validUntil of ['', 'not-a-date', '2026-10-18T08:00:00.000Z', '2026-10-17T08:00:00.000Z']) {
      expect(isEntitlementActive({...grant, validUntil}, now)).toBe(false);
    }
  });
  it('requires explicit per-course entitlement for any future newly approved generated course', () => {
    const request = {...course, courseId: 'SWA-AI-001'};
    expect(entitlementGrantsCourse(grant, request, now)).toBe(false);
    expect(entitlementGrantsCourse({...grant, entitlement: 'academy.course.SWA-AI-001', courseId: 'SWA-AI-001'}, request, now)).toBe(false);
  });
});
