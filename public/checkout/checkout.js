/* Skunkworks Academy checkout browser runtime. Version: 2026-08-14.2 */
(function () {
  'use strict';

  const productionApiBaseUrl = 'https://api.skunkworksacademy.com/api';
  const localApiBaseUrl = 'http://localhost:7071/api';
  const apiBaseUrl = (window.SWA_PAYMENT_API_BASE || (['localhost', '127.0.0.1'].includes(location.hostname) ? localApiBaseUrl : productionApiBaseUrl)).replace(/\/$/, '');
  const osintEnrolmentRequestUrl = 'https://skunkworks.africa/products/osint-101-enrolment-request';
  const checkoutSupportUrl = 'mailto:training@skunkworks.africa?subject=Checkout%20support';

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
      <article class="plan-card" data-plan-card="${escapeHtml(plan.id)}">
        <h3>${escapeHtml(plan.name)}</h3>
        <p>${escapeHtml(plan.description)}</p>
        <div class="price-block">
          <div class="price-line"><span>PayFast monthly</span><strong>R${Number(plan.zar).toLocaleString('en-ZA')}</strong></div>
          <div class="price-line"><span>PayPal subscription</span><strong>$${Number(plan.usd).toLocaleString('en-US')}</strong></div>
        </div>
        <ul>${(plan.features || []).map((feature) => `<li>${escapeHtml(feature)}</li>`).join('')}</ul>
        <div class="gateway-actions">
          <button type="button" data-plan="${escapeHtml(plan.id)}" data-gateway="payfast">Subscribe with PayFast</button>
          <div class="paypal-button-slot" data-paypal-slot="${escapeHtml(plan.id)}" aria-label="Subscribe to ${escapeHtml(plan.name)} with PayPal"></div>
          <p class="gateway-note" data-paypal-note="${escapeHtml(plan.id)}">Loading secure PayPal subscription button…</p>
        </div>
      </article>
    `).join('');
  }

  function renderCheckoutFallback(course, source) {
    const isOsint = String(course || '').toUpperCase() === 'OSINT-101' || source === 'osint';

    if (isOsint) {
      elements.plans.innerHTML = `
        <article class="plan-card fallback-card">
          <p class="eyebrow">Temporary enrolment route</p>
          <h3>Submit your OSINT-101 enrolment request</h3>
          <p>The Academy subscription payment service is temporarily unavailable. Use the no-cost Shopify checkout to record your learner details and enrolment request.</p>
          <ul>
            <li>No course fee is charged by this temporary request.</li>
            <li>Use the same email address as your Academy Portal account.</li>
            <li>Access is issued after Academy review and confirmation of the applicable entitlement or payment arrangement.</li>
          </ul>
          <div class="gateway-actions">
            <a class="notice" href="${osintEnrolmentRequestUrl}">Submit OSINT-101 enrolment request</a>
            <a class="notice" href="https://portal.skunkworksacademy.com/">Already enrolled? Sign in to the Portal</a>
            <a class="notice" href="${checkoutSupportUrl}">Contact training support</a>
          </div>
        </article>
      `;
      status('Subscription checkout is temporarily unavailable. The OSINT-101 enrolment-request checkout is available below.');
      return;
    }

    elements.plans.innerHTML = `
      <div class="notice">
        Checkout plans could not be loaded. <a href="${checkoutSupportUrl}">Contact training support</a>.
      </div>
    `;
    status('The Academy payment service is temporarily unavailable.');
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

  function splitName(fullName) {
    const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return {};
    return {
      given_name: parts[0],
      surname: parts.slice(1).join(' ') || parts[0]
    };
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

  async function startPayFastCheckout(planId, button) {
    const customer = validateCustomer();
    button.disabled = true;
    status('Creating PayFast subscription checkout…');

    const session = await request('/checkout/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planId,
        gateway: 'payfast',
        ...customer,
        successUrl: `${location.origin}/checkout/success/`,
        cancelUrl: `${location.origin}/checkout/cancel/`
      })
    });

    if (session.checkoutMode !== 'form-post') {
      throw new Error('PayFast did not return a supported checkout instruction.');
    }

    status('Redirecting to PayFast…');
    postForm(session.action, session.fields);
  }

  function loadPayPalSdk(config) {
    if (window.paypal?.Buttons) return Promise.resolve(window.paypal);

    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-swa-paypal-sdk]');
      if (existing) {
        existing.addEventListener('load', () => resolve(window.paypal), { once: true });
        existing.addEventListener('error', () => reject(new Error('PayPal SDK could not be loaded.')), { once: true });
        return;
      }

      const script = document.createElement('script');
      const params = new URLSearchParams({
        'client-id': config.clientId,
        components: 'buttons',
        currency: config.currency || 'USD',
        vault: 'true',
        intent: 'subscription'
      });
      script.src = `https://www.paypal.com/sdk/js?${params.toString()}`;
      script.async = true;
      script.dataset.swaPaypalSdk = 'true';
      script.addEventListener('load', () => resolve(window.paypal), { once: true });
      script.addEventListener('error', () => reject(new Error('PayPal SDK could not be loaded.')), { once: true });
      document.head.appendChild(script);
    });
  }

  async function renderPayPalButtons(plans, config) {
    if (!config.enabled || !config.clientId) {
      document.querySelectorAll('[data-paypal-note]').forEach((note) => {
        note.textContent = 'PayPal subscriptions are temporarily unavailable. Use PayFast or contact Skunkworks Academy.';
      });
      return;
    }

    const paypal = await loadPayPalSdk(config);
    if (!paypal?.Buttons) throw new Error('PayPal SDK loaded without the Buttons component.');

    for (const plan of plans) {
      const container = document.querySelector(`[data-paypal-slot="${CSS.escape(plan.id)}"]`);
      const note = document.querySelector(`[data-paypal-note="${CSS.escape(plan.id)}"]`);
      if (!container || !note) continue;

      if (!plan.paypalPlanId) {
        note.textContent = 'PayPal billing plan is not configured for this Academy plan.';
        continue;
      }

      let pendingIntent = null;
      const buttons = paypal.Buttons({
        style: {
          layout: 'vertical',
          shape: 'pill',
          label: 'subscribe',
          height: 46
        },
        onClick: function (_data, actions) {
          try {
            validateCustomer();
            return actions.resolve();
          } catch (error) {
            status(error.message || 'Enter valid buyer details.');
            return actions.reject();
          }
        },
        createSubscription: async function (_data, actions) {
          const customer = validateCustomer();
          status(`Creating the ${plan.name} PayPal subscription…`);

          pendingIntent = await request('/checkout/paypal/subscription-intents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              planId: plan.id,
              gateway: 'paypal',
              ...customer
            })
          });

          return actions.subscription.create({
            plan_id: pendingIntent.paypalPlanId,
            custom_id: pendingIntent.transactionId,
            subscriber: {
              name: splitName(customer.customerName),
              email_address: customer.customerEmail
            },
            application_context: {
              brand_name: 'Skunkworks Academy',
              shipping_preference: 'NO_SHIPPING',
              user_action: 'SUBSCRIBE_NOW'
            }
          });
        },
        onApprove: async function (data) {
          if (!pendingIntent?.transactionId) throw new Error('PayPal approval returned without an Academy transaction.');
          status('Verifying the PayPal subscription with the Academy payment API…');

          await request('/checkout/paypal/subscriptions/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              transactionId: pendingIntent.transactionId,
              subscriptionId: data.subscriptionID
            })
          });

          const success = new URL(`${location.origin}/checkout/success/`);
          success.searchParams.set('provider', 'paypal-subscription');
          success.searchParams.set('subscription_id', data.subscriptionID);
          success.searchParams.set('transaction_id', pendingIntent.transactionId);
          location.href = success.href;
        },
        onCancel: function () {
          status('PayPal subscription approval was cancelled. No entitlement was granted.');
          pendingIntent = null;
        },
        onError: function (error) {
          console.error(error);
          status(error?.message || 'PayPal subscription checkout failed.');
          pendingIntent = null;
        }
      });

      if (!buttons.isEligible()) {
        note.textContent = 'PayPal is not eligible for this browser or buyer location.';
        continue;
      }

      await buttons.render(container);
      note.textContent = 'Recurring USD billing through PayPal. Cancel or manage the subscription from the PayPal account.';
    }
  }

  async function init() {
    elements.year.textContent = new Date().getFullYear();
    const params = new URLSearchParams(location.search);
    const planHint = params.get('plan');
    const gatewayHint = params.get('gateway');
    const courseHint = params.get('course');
    const sourceHint = params.get('source');

    try {
      const [plans, paypalConfig] = await Promise.all([
        request('/checkout/plans'),
        request('/checkout/paypal/config')
      ]);

      renderPlans(plans);
      status('Enter buyer details, then choose PayFast or PayPal.');

      elements.plans.addEventListener('click', async (event) => {
        const button = event.target.closest('button[data-plan][data-gateway="payfast"]');
        if (!button) return;
        try {
          await startPayFastCheckout(button.dataset.plan, button);
        } catch (error) {
          status(error.message || 'PayFast checkout failed.');
          button.disabled = false;
        }
      });

      renderPayPalButtons(plans, paypalConfig).catch((error) => {
        console.error(error);
        status(error.message || 'PayPal subscriptions could not be initialized.');
        document.querySelectorAll('[data-paypal-note]').forEach((note) => {
          note.textContent = 'PayPal subscriptions could not be initialized. Use PayFast or contact support.';
        });
      });

      if (planHint) {
        const card = document.querySelector(`[data-plan-card="${CSS.escape(planHint)}"]`);
        card?.scrollIntoView({ block: 'center' });
        if (gatewayHint === 'paypal') status('Enter buyer details, then select the PayPal Subscribe button for the highlighted plan.');
      }
    } catch (error) {
      console.error('Checkout API unavailable', error);
      renderCheckoutFallback(courseHint, sourceHint);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
