# Stripe Integration Setup Guide

## Overview

This guide will help you set up and test the Stripe payment integration for Virtual Arena. The integration allows customers to make online payments for orders, tournament registrations, and other services.

## Prerequisites

1. A Stripe account (you can sign up at [stripe.com](https://stripe.com))
2. Stripe CLI for local webhook testing (optional but recommended)
3. Your backend server accessible via HTTPS (for production) or using Stripe CLI (for local development)

## Configuration Steps

### 1. Set up your Stripe account

- Log in to your Stripe Dashboard at [dashboard.stripe.com](https://dashboard.stripe.com)
- Make sure you're in test mode (toggle in the top-right corner)

### 2. Get your API keys

- Go to Developers > API keys in your Stripe Dashboard
- Copy your Publishable key and Secret key
- Update your `.env` file with these keys:
  ```
  STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key
  STRIPE_SECRET_KEY=sk_test_your_secret_key
  ```

### 3. Set up Webhook Endpoint

#### For Production:

1. Go to Developers > Webhooks in your Stripe Dashboard
2. Click "Add endpoint"
3. Enter your webhook URL: `https://your-domain.com/api/v1/payment/webhook`
4. Select events to listen for:
   - `checkout.session.async_payment_failed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.completed`
   - `checkout.session.expired`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
5. Click "Add endpoint"
6. Copy the "Signing secret" and add it to your `.env` file:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
   ```

#### For Local Development (using Stripe CLI):

1. Install the [Stripe CLI](https://stripe.com/docs/stripe-cli)
2. Login to your Stripe account via CLI:
   ```
   stripe login
   ```
3. Forward events to your local server:
   ```
   stripe listen --forward-to http://localhost:8080/api/v1/payment/webhook
   ```
4. The CLI will display a webhook signing secret. Add this to your `.env` file:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_from_cli
   ```

### 4. Configure Nginx for Production

If you're using Nginx in production, ensure it's properly configured to handle webhook requests. Use the provided `nginx.conf.example` as a reference:

```nginx
location /api/v1/payment/webhook {
    proxy_pass http://localhost:8080/api/v1/payment/webhook;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # Important: Don't buffer the request body for webhooks
    proxy_buffering off;
    
    # Increase timeouts for webhook processing
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
}
```

## Payment Methods

### 1. Payment Intents API

The Payment Intents API is used for direct payment processing on your site. This is implemented in the `createPaymentIntent` function in `paymentController.js`.

### 2. Checkout Sessions API

The Checkout Sessions API redirects customers to Stripe's hosted checkout page. This is implemented in the `createCheckoutSession` function in `paymentController.js`.

## Testing Payments

### Test Cards

Use these test card numbers to simulate different payment scenarios:

- Successful payment: `4242 4242 4242 4242`
- Payment requires authentication: `4000 0025 0000 3155`
- Payment is declined: `4000 0000 0000 0002`

For all test cards, you can use:
- Any future expiration date (MM/YY)
- Any 3-digit CVC
- Any postal code

### Testing Flow

1. Add items to your cart
2. Proceed to checkout
3. Fill in shipping information
4. Select "Online Payment"
5. Enter test card details
6. Complete the payment

### Testing Webhooks

You can trigger test webhook events using the Stripe CLI:

```bash
stripe trigger checkout.session.completed
stripe trigger payment_intent.succeeded
stripe trigger checkout.session.async_payment_failed
```

## Troubleshooting

### Common Issues

1. **Payment form doesn't appear**
   - Check browser console for errors
   - Verify that Stripe.js is loading correctly
   - Ensure your publishable key is correct

2. **Payment fails with 401 Unauthorized**
   - Check that authentication is working correctly
   - Verify the token is being sent with the correct format (Bearer token)
   - Check server logs for authentication errors

3. **Payment fails with 404 Not Found**
   - Verify the API URL is correct
   - Check that the route is properly defined in your backend
   - Ensure the API is accessible from your frontend

4. **Webhook not receiving events**
   - Verify your webhook URL is accessible
   - Check that your webhook secret is correct
   - Look for any errors in your server logs
   - Ensure your Nginx configuration preserves the raw request body

5. **Signature verification failed**
   - Ensure the webhook secret in your `.env` file matches the one from Stripe
   - Verify that your server configuration preserves the raw request body
   - Check that you're not using body parsers for the webhook endpoint

## Debugging Tips

1. Add additional logging in your webhook controller:

```javascript
console.log('Webhook received:', event.type);
console.log('Event data:', JSON.stringify(event.data.object, null, 2));
```

2. Check Stripe Dashboard for webhook delivery attempts and failures

3. Use the `/api/v1/payment/webhook-status` endpoint to verify your webhook configuration

## Additional Resources

- [Stripe API Documentation](https://stripe.com/docs/api)
- [Stripe Webhooks Documentation](https://stripe.com/docs/webhooks)
- [Stripe CLI Documentation](https://stripe.com/docs/stripe-cli)
- [Stripe Testing Documentation](https://stripe.com/docs/testing)

### Viewing Payments in Stripe Dashboard

You can view all test payments in your Stripe Dashboard under "Payments". This is useful for debugging and understanding the payment flow.

## Going Live

When you're ready to accept real payments:

1. Complete Stripe's account verification process
2. Switch to live mode in the Stripe Dashboard
3. Update your API keys to the live versions
4. Set up a production webhook endpoint
5. Test the entire flow with a real payment

## Additional Resources

- [Stripe API Documentation](https://stripe.com/docs/api)
- [Stripe.js Reference](https://stripe.com/docs/js)
- [Webhook Events Reference](https://stripe.com/docs/api/events/types)