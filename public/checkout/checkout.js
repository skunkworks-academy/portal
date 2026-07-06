/* Skunkworks Academy checkout browser runtime. Version: 2026-06-25 */
(function () {
  'use strict';

  const productionApiBaseUrl = 'https://skunkworks-instructor-portal-api-a5gxhyc2fvc7gmch.southafricanorth-01.azurewebsites.net/api';
  const localApiBaseUrl = 'http://localhost:7071/api';
  const apiBaseUrl = (window.SWA_PAYMENT_API_BASE || (['localhost', '127.0.0.1'].includes(location.hostname) ? localApiBaseUrl : productionApiBaseUrl)).replace(/\/$/, '');

  const elements = {
    plans: document.getElementById('plans'),
    status: document.getElementById('status'),
    year: document.getElementById('year'),
    customerName: document.getElementById('customerName'),
    customerEmail: document.getElementById('customerEmail')
  };

  function escapeHtml(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function status(message) {
    elements.status.textContent = message;
  }

  async function request(path, options) {
    const response = await fetch(`${apiBaseUrl}${path}`, options);
    const contentType = response.headers.get('Content-Type') || '';
    const body = contentType.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) throw new Error(typeof body === 'string' ? body : body.message || `Request failed with ${response.status}`);
    return body;
  }

  function renderPlans(plans) {
    elements.plans.innerHTML = plans.map((plan) => `
      <article class="plan-card">
        <h3>${escapeHtml(plan.name)}</h3>
        <p>${escapeHtml(plan.description)}</p>
        <div class="price-block">
          <div class="price-line"><span>PayFast ZAR</span><strong>R${Number(plan.zar).toLocaleString('en-ZA')}</strong></div>
          <div class="price-line"><span>PayPal USD</span><strong>$${Number(plan.usd).toLocaleString('en-US')}</strong></div>
        </div>
        <ul>${(plan.features || []).map((feature) => `<li>${escapeHtml(feature)}</li>`).join('')}</ul>
        <div class="gateway-actions">
          <button type="button" data-plan="${escapeHtml(plan.id)}" data-gateway="payfast">Pay with PayFast</button>
          <button type="button" data-plan="${escapeHtml(plan.id)}" data-gateway="paypal">Pay with PayPal</button>
        </div>
      </article>
    `).join('');
  }

  function validateCustomer() {
    const customerName = elements.customerName.value.trim();
    const customerEmail = elements.customerEmail.value.trim().toLowerCase();
    if (!customerEmail || !customerEmail.includes('@')) {
      elements.customerEmail.focus();
      throw new Error('Enter a valid email address before checkout.');
    }
    return { customerName, customerEmail };
  }

  function postForm(action, fields) {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = action;
    form.style.display = 'none';

    Object.entries(fields || {}).forEach(([name, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = String(value || '');
      form.appendChild(input);
    });

    document.body.appendChild(form);
    form.submit();
  }

  async function startCheckout(planId, gateway, button) {
    const customer = validateCustomer();
    button.disabled = true;
    status(`Creating ${gateway} checkout session...`);

    const session = await request('/checkout/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planId,
        gateway,
        ...customer,
        successUrl: `${location.origin}/checkout/success/`,
        cancelUrl: `${location.origin}/checkout/cancel/`
      })
    });

    if (session.checkoutMode === 'form-post') {
      status('Redirecting to PayFast...');
      postForm(session.action, session.fields);
      return;
    }

    if (session.approvalUrl) {
      status('Redirecting to PayPal...');
      location.href = session.approvalUrl;
      return;
    }

    throw new Error('Gateway did not return a supported checkout instruction.');
  }

  async function init() {
    elements.year.textContent = new Date().getFullYear();
    const params = new URLSearchParams(location.search);
    const planHint = params.get('plan');
    const gatewayHint = params.get('gateway');

    try {
      const plans = await request('/checkout/plans');
      renderPlans(plans);
      status('Select a plan and gateway.');

      if (planHint) {
        document.querySelector(`[data-plan="${CSS.escape(planHint)}"][data-gateway="${CSS.escape(gatewayHint || 'payfast')}"]`)?.scrollIntoView({ block: 'center' });
      }

      elements.plans.addEventListener('click', async (event) => {
        const button = event.target.closest('button[data-plan][data-gateway]');
        if (!button) return;
        try {
          await startCheckout(button.dataset.plan, button.dataset.gateway, button);
        } catch (error) {
          status(error.message || 'Checkout failed.');
          button.disabled = false;
        }
      });
    } catch (error) {
      elements.plans.innerHTML = '<div class="notice">Checkout plans could not be loaded. Confirm the portal API is deployed and payment routes are enabled.</div>';
      status(error.message || 'Unable to load checkout.');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
