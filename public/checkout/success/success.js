(function () {
  'use strict';

  const params = new URLSearchParams(location.search);
  const provider = params.get('provider');
  const subscriptionId = params.get('subscription_id');
  const message = document.getElementById('message');

  if (provider === 'paypal-subscription' && subscriptionId) {
    message.textContent = `PayPal subscription ${subscriptionId} was approved. Access will activate after the verified PayPal webhook is processed.`;
  } else if (provider === 'paypal') {
    message.textContent = 'A legacy PayPal order return was received. The Academy payment API and PayPal webhook will complete verification.';
  } else {
    message.textContent = 'The payment gateway return was received. Access will activate only after a verified gateway notification is processed.';
  }
}());
