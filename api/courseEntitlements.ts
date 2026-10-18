import {coursePublicationRegistry, isCoursePublished} from './coursePublication.js';

export interface GrantEntitlement {
  id: string;
  customerEmail: string;
  status: string;
  validUntil: string;
  paymentTransactionId: string;
  providerReference: string;
  planId: string;
  entitlement: string;
  courseId: string;
}
export interface RequestedCourseAccess {
  courseId: string;
  learnerEmail: string;
  planId: string;
  entitlementId: string;
  paymentTransactionId: string;
}

/** Valid expiry and explicit ACTIVE state are mandatory for paid access. */
export function isEntitlementActive(entitlement: Pick<GrantEntitlement, 'status' | 'validUntil'>, at = Date.now()): boolean {
  if (entitlement.status !== 'Active' || !entitlement.validUntil) return false;
  const expiry = Date.parse(entitlement.validUntil);
  return Number.isFinite(expiry) && expiry > at;
}

/** Fail closed against another learner's subscription or unrelated course/payment. */
export function entitlementGrantsCourse(entitlement: GrantEntitlement, request: RequestedCourseAccess, at = Date.now()): boolean {
  if (!isCoursePublished(request.courseId) || !isEntitlementActive(entitlement, at)) return false;
  if (!entitlement.customerEmail || entitlement.customerEmail.trim().toLowerCase() !== request.learnerEmail.trim().toLowerCase()) return false;
  if (request.entitlementId && entitlement.id !== request.entitlementId) return false;
  if (request.paymentTransactionId && entitlement.paymentTransactionId !== request.paymentTransactionId) return false;

  const course = coursePublicationRegistry.find(c => c.id === request.courseId);
  if (!course) return false;
  if (course.origin === 'generated-foundation') {
    return entitlement.entitlement === 'academy.course.' + request.courseId &&
      entitlement.courseId === request.courseId;
  }
  const explicitCourseScope = entitlement.entitlement === 'academy.course.' + request.courseId &&
    entitlement.courseId === request.courseId;
  const legacyMembership = Boolean(request.planId) &&
    request.planId === entitlement.planId &&
    ['academy.starter', 'academy.pro', 'academy.mentor', 'academy.team_seat'].includes(entitlement.entitlement) &&
    !entitlement.courseId;
  return explicitCourseScope || legacyMembership;
}
