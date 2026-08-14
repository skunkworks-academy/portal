/* Skunkworks Academy course enrolment bridge. Version: 2026-07-27.1 */
(function () {
  'use strict';

  const productionApiBaseUrl = 'https://skunkworks-instructor-portal-api-a5gxhyc2fvc7gmch.southafricanorth-01.azurewebsites.net/api';
  const localApiBaseUrl = 'http://localhost:7071/api';
  const apiBaseUrl = (window.SWA_PAYMENT_API_BASE || (['localhost', '127.0.0.1'].includes(location.hostname) ? localApiBaseUrl : productionApiBaseUrl)).replace(/\/$/, '');
  const originalFetch = window.fetch.bind(window);
  const params = new URLSearchParams(location.search);
  const courseId = String(params.get('courseId') || params.get('course') || '').trim().toUpperCase();
  const returnUrl = String(params.get('returnUrl') || '').trim();
  const courseTitles = {
    'SHP-UPA-101': 'Shopify User Permissions',
    'GHP-DOM-101': 'GitHub Pages Setup',
    'M365-LIC-101': 'Microsoft 365 Licenses'
  };
  const pendingRequests = new Map();

  if (courseId && !params.get('course')) {
    params.set('course', courseId);
    history.replaceState(null, '', `${location.pathname}?${params.toString()}${location.hash}`);
  }

  function value(id) {
    return String(document.getElementById(id)?.value || '').trim();
  }

  function setStatus(message, isError) {
    const target = document.getElementById('enrolmentStatus') || document.getElementById('status');
    if (!target) return;
    target.textContent = message;
    target.dataset.state = isError ? 'error' : 'ok';
  }

  function validateLearner() {
    const learnerName = value('customerName');
    const learnerEmail = value('customerEmail').toLowerCase();
    if (!courseId) throw new Error('A course ID is required to submit an enrolment.');
    if (!learnerEmail || !learnerEmail.includes('@')) {
      document.getElementById('customerEmail')?.focus();
      throw new Error('Enter the learner email address before submitting enrolment.');
    }
    return { learnerName, learnerEmail };
  }

  async function readResponse(response) {
    const contentType = response.headers.get('Content-Type') || '';
    const body = contentType.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) {
      const message = typeof body === 'string' ? body : body?.message;
      throw new Error(message || `Enrolment request failed with HTTP ${response.status}.`);
    }
    return body;
  }

  async function recordEnrolment(planId, gateway) {
    const learner = validateLearner();
    const key = `${courseId}|${learner.learnerEmail}|${planId || ''}|${gateway || ''}`;
    if (pendingRequests.has(key)) return pendingRequests.get(key);

    const request = (async function () {
      setStatus('Recording the learner and course enrolment…', false);
      const response = await originalFetch(`${apiBaseUrl}/enrolments/requests`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          courseId,
          learnerName: learner.learnerName,
          learnerEmail: learner.learnerEmail,
          planId: planId || '',
          gateway: gateway || 'manual',
          returnUrl,
          source: 'checkout',
          website: ''
        })
      });
      const enrolment = await readResponse(response);
      sessionStorage.setItem('swa_course_enrolment_id', enrolment.id || '');
      sessionStorage.setItem('swa_course_enrolment_course', courseId);
      setStatus(`Enrolment ${enrolment.id || ''} recorded with status ${enrolment.status || 'Submitted'}.`, false);
      return enrolment;
    }());

    pendingRequests.set(key, request);
    try {
      return await request;
    } catch (error) {
      pendingRequests.delete(key);
      throw error;
    }
  }

  function configureCourseContext() {
    if (!courseId) return;
    const context = document.getElementById('courseContext');
    const courseName = document.getElementById('courseName');
    if (context) context.hidden = false;
    if (courseName) courseName.textContent = `${courseTitles[courseId] || courseId} (${courseId})`;
    document.title = `${courseTitles[courseId] || courseId} Checkout | Skunkworks Academy`;

    const button = document.getElementById('submitEnrolmentRequest');
    if (button) {
      button.hidden = false;
      button.addEventListener('click', async function () {
        button.disabled = true;
        try {
          const enrolment = await recordEnrolment('', 'manual');
          setStatus(`Your enrolment request ${enrolment.id} has been submitted. Sign in to the Portal to track it.`, false);
        } catch (error) {
          setStatus(error?.message || 'The enrolment request could not be submitted.', true);
        } finally {
          button.disabled = false;
        }
      });
    }
  }

  window.fetch = async function (input, init) {
    const requestUrl = typeof input === 'string' ? input : input?.url;
    const method = String(init?.method || (typeof input !== 'string' ? input?.method : 'GET') || 'GET').toUpperCase();
    const target = requestUrl ? new URL(requestUrl, location.href) : null;
    const isPaymentStart = target && method === 'POST' && (
      target.pathname.endsWith('/checkout/sessions') ||
      target.pathname.endsWith('/checkout/paypal/subscription-intents')
    );

    if (!isPaymentStart || !courseId || typeof init?.body !== 'string') {
      return originalFetch(input, init);
    }

    let payload;
    try {
      payload = JSON.parse(init.body);
    } catch {
      return originalFetch(input, init);
    }

    const enrolment = await recordEnrolment(payload.planId, payload.gateway);
    const nextInit = {
      ...init,
      body: JSON.stringify({
        ...payload,
        courseId,
        enrolmentId: enrolment.id,
        returnUrl
      })
    };
    return originalFetch(input, nextInit);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', configureCourseContext, { once: true });
  } else {
    configureCourseContext();
  }
}());
