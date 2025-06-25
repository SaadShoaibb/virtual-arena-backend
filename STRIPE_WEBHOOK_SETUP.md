# Stripe Webhook Setup Guide

## Overview

This guide provides detailed instructions for setting up and testing Stripe webhooks for Virtual Arena. Webhooks are essential for receiving asynchronous payment events from Stripe, such as successful payments, failed payments, and expired checkout sessions.

## Prerequisites

1. A Stripe account with API keys configured
2. Your backend server running and accessible
3. Stripe CLI installed for local testing (recommended)

## Configured Webhook Events

The following webhook events are configured for Virtual Arena:

- `checkout.session.async_payment_failed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.completed`
- `checkout.session.expired`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`

## Setup Instructions

### Production Setup

1. **Configure Nginx**

   Ensure your Nginx configuration preserves the raw request body for webhook verification. Add the following to your Nginx configuration:

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

2. **Set up Webhook in Stripe Dashboard**

   - Go to Developers > Webhooks in your Stripe Dashboard
   - Click "Add endpoint"
   - Enter your webhook URL: `https://your-domain.com/api/v1/payment/webhook`
   - Select the events listed above
   - Click "Add endpoint"
   - Copy the "Signing secret" and add it to your `.env` file:
     ```
     STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
     ```

3. **Verify Webhook Configuration**

   You can verify your webhook configuration using either of these endpoints:
   
   - Standard endpoint: `https://your-domain.com/api/v1/payment/webhook-status`
   - Direct endpoint: `https://your-domain.com/webhook-status` (easier to access)
   
   The response will include:
   - Webhook URL
   - Webhook secret status (configured or not configured)
   - Server configuration status
   - Overall status (ready or missing webhook secret)
   
   If you're having trouble accessing the standard endpoint, try the direct endpoint which bypasses some middleware.

### Local Development Setup

1. **Install Stripe CLI**

   Follow the instructions at [stripe.com/docs/stripe-cli](https://stripe.com/docs/stripe-cli) to install the Stripe CLI for your operating system.

   For Windows:
   ```bash
   # Using Scoop
   scoop install stripe

   # Using Chocolatey
   choco install stripe-cli
   ```

   For macOS:
   ```bash
   brew install stripe/stripe-cli/stripe
   ```

   For Linux:
   ```bash
   # Download and install the appropriate package for your distribution
   # from https://github.com/stripe/stripe-cli/releases
   ```

2. **Login to Stripe**

   ```bash
   stripe login
   ```

   This will open a browser window where you can authorize the CLI to access your Stripe account.

3. **Forward Webhook Events**

   ```bash
   stripe listen --forward-to http://localhost:8080/api/v1/payment/webhook
   ```

   This command will start a local webhook forwarding service that will forward Stripe events to your local server.

4. **Set Webhook Secret**

   The CLI will display a webhook signing secret. Add this to your `.env` file:

   ```
   STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_from_cli
   ```

5. **Trigger Test Events**

   In a new terminal window, you can trigger test webhook events:

   ```bash
   # Test a successful checkout session
   stripe trigger checkout.session.completed

   # Test an expired checkout session
   stripe trigger checkout.session.expired

   # Test a successful async payment
   stripe trigger checkout.session.async_payment_succeeded

   # Test a failed async payment
   stripe trigger checkout.session.async_payment_failed

   # Test a successful payment intent
   stripe trigger payment_intent.succeeded

   # Test a failed payment intent
   stripe trigger payment_intent.payment_failed
   ```

## Webhook Handler Implementation

The webhook handler in `webhookController.js` processes incoming webhook events and updates the payment status in the database accordingly. Here's an overview of the implementation:

```javascript
// Example webhook handler structure
exports.stripeWebhook = async (req, res) => {
  const payload = req.rawBody || req.body;
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    // Verify the webhook signature
    event = stripe.webhooks.constructEvent(payload, sig, webhookSecret);
  } catch (err) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event based on its type
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutSession(event.data.object);
      break;
    case 'checkout.session.expired':
      await handleExpiredCheckoutSession(event.data.object);
      break;
    case 'checkout.session.async_payment_failed':
      await handleFailedCheckoutSession(event.data.object);
      break;
    case 'payment_intent.succeeded':
      await handleSuccessfulPaymentIntent(event.data.object);
      break;
    case 'payment_intent.payment_failed':
      await handleFailedPaymentIntent(event.data.object);
      break;
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  res.status(200).json({ received: true });
};
```

## Troubleshooting

### Common Issues

1. **404 Not Found**
   - Verify the webhook URL is correct
   - Check that the route is properly defined in your backend
   - Ensure the server is running
   - Check your Nginx configuration if using a reverse proxy

2. **Signature Verification Failed**
   - Ensure the webhook secret in your `.env` file matches the one from Stripe
   - Verify that your server configuration preserves the raw request body
   - Check that you're not using body parsers for the webhook endpoint
   - Make sure `req.rawBody` is available in your webhook handler

3. **Events Not Being Processed**
   - Check server logs for any errors
   - Verify that the event handlers are properly implemented
   - Ensure the database connection is working
   - Check that the event type is being handled in your switch statement

4. **Database Updates Not Working**
   - Verify that the payment record exists in the database
   - Check that the metadata in the Stripe event contains the correct IDs
   - Ensure your database queries are correctly formatted
   - Add logging to track the flow of data through your handlers

### Debugging

1. **Add Detailed Logging**

   Add the following to your webhook controller for debugging:

   ```javascript
   console.log('Webhook received:', event.type);
   console.log('Event data:', JSON.stringify(event.data.object, null, 2));
   console.log('Webhook signature:', req.headers['stripe-signature']);
   console.log('Webhook secret available:', !!process.env.STRIPE_WEBHOOK_SECRET);
   ```

2. **Check Stripe Dashboard**

   - Go to Developers > Webhooks in your Stripe Dashboard
   - Click on your webhook endpoint
   - View recent webhook attempts and their status
   - Check for any delivery errors or response codes

3. **Use the Webhook Status Endpoints**

   There are two webhook status endpoints available:
   
   - Standard endpoint: `/api/v1/payment/webhook-status`
   - Direct endpoint: `/webhook-status` (bypasses some middleware)
   
   If you're having trouble accessing the standard endpoint, try the direct endpoint. The response from either endpoint will help you verify that your webhook configuration is correct.
   
   Example response:
   ```json
   {
     "webhook_url": "https://your-domain.com/api/v1/payment/webhook",
     "webhook_secret_status": "configured",
     "server_configuration": {
       "raw_body_parser": true,
       "body_parser_skipped": true
     },
     "status": "ready",
     "documentation": "/STRIPE_WEBHOOK_SETUP.md"
   }
   ```

4. **Test with Stripe CLI**

   Use the Stripe CLI to trigger test events and monitor the logs:

   ```bash
   stripe trigger checkout.session.completed --log-level=debug
   ```

## Connected Accounts

If you're using Stripe Connect for marketplace payments, webhook events for connected accounts will also be sent to your platform account's webhook endpoint. The event will include a `account` property with the connected account ID.

To handle these events, check for the `account` property in the event object:

```javascript
if (event.account) {
  console.log(`Event for connected account: ${event.account}`);
  // Handle connected account event
} else {
  // Handle platform account event
}
```

### Testing Connected Account Webhooks

To test connected account webhooks with the Stripe CLI:

```bash
stripe trigger checkout.session.completed --account=acct_connected_account_id
```

## Security Considerations

1. **Always Verify Webhook Signatures**

   Never skip signature verification in production. This ensures that webhook events are actually coming from Stripe.

2. **Keep Your Webhook Secret Secure**

   Store your webhook secret in environment variables and never commit it to your code repository.

3. **Use HTTPS for Production Webhooks**

   Always use HTTPS for production webhook endpoints to ensure secure transmission of webhook data.

4. **Implement Idempotency**

   Webhook events may be sent multiple times. Implement idempotency in your handlers to ensure that the same event is not processed multiple times.

## Additional Resources

- [Stripe Webhooks Documentation](https://stripe.com/docs/webhooks)
- [Stripe CLI Documentation](https://stripe.com/docs/stripe-cli)
- [Stripe Testing Documentation](https://stripe.com/docs/testing)
- [Stripe API Reference](https://stripe.com/docs/api)