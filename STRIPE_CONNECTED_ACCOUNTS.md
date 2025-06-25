# Stripe Connected Accounts Setup Guide

## Overview

This guide will help you set up Stripe Connected Accounts for Virtual Arena, allowing your clients to receive payments directly to their own Stripe accounts while you maintain control over the payment flow.

## Prerequisites

1. A Stripe account with Platform capabilities enabled
2. Your Virtual Arena backend server running and accessible via HTTPS
3. Nginx or similar web server configured for your domain

## Setup Steps

### 1. Enable Connect in your Stripe Dashboard

1. Log in to your [Stripe Dashboard](https://dashboard.stripe.com)
2. Navigate to **Connect** > **Settings**
3. Choose the appropriate Connect account type:
   - **Standard**: Simplest integration, users create their own Stripe accounts
   - **Express**: Streamlined onboarding with Stripe-hosted pages
   - **Custom**: Full control over the onboarding experience

### 2. Create Connected Accounts

Depending on your chosen account type, follow Stripe's documentation to create connected accounts for your clients:

- [Standard Accounts](https://stripe.com/docs/connect/standard-accounts)
- [Express Accounts](https://stripe.com/docs/connect/express-accounts)
- [Custom Accounts](https://stripe.com/docs/connect/custom-accounts)

### 3. Configure Webhook Endpoints for Connected Accounts

#### In Stripe Dashboard:

1. Go to **Developers** > **Webhooks**
2. Click **Add endpoint**
3. Enter your webhook URL: `https://vrtualarena.ca/api/v1/payment/webhook`
4. Select events to listen for:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`
5. Under **Filter event** section, select **Connect** to receive events from connected accounts
6. Click **Add endpoint**
7. Copy the **Signing secret** and add it to your `.env` file:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
   ```

### 4. Update Your Nginx Configuration

Ensure your Nginx configuration properly handles the webhook endpoint. Use the provided `nginx.conf.example` as a reference.

### 5. Modify Payment Flow for Connected Accounts

When creating a payment intent or checkout session for a connected account, add the `stripe_account` parameter:

```javascript
// Example modification to createCheckoutSession function
const session = await stripe.checkout.sessions.create({
  payment_method_types: ['card'],
  line_items: lineItems,
  mode: 'payment',
  success_url: `${process.env.FRONTEND_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${process.env.FRONTEND_URL}/checkout?canceled=true`,
  customer_email: userEmail,
  metadata: {
    user_id,
    entity_id,
    entity_type,
    user_name: userName
  },
  // Add this line to specify the connected account
  stripe_account: connectedAccountId
});
```

### 6. Update Webhook Handler for Connected Accounts

Modify your webhook handler to check for the `account` property in the event, which indicates the connected account ID:

```javascript
const handleStripeWebhook = async (req, res) => {
  // ... existing code ...
  
  try {
    // Verify the event came from Stripe
    event = stripe.webhooks.constructEvent(
      payload,
      signature,
      webhookSecret
    );
    
    // Check if this is a connected account event
    const connectedAccountId = event.account;
    if (connectedAccountId) {
      console.log(`Event from connected account: ${connectedAccountId}`);
      // You may want to store or verify this account ID
    }
    
    // ... rest of your webhook handling code ...
  } catch (err) {
    // ... error handling ...
  }
};
```

## Testing Connected Accounts

1. Create a test connected account in your Stripe Dashboard
2. Create a checkout session specifying the connected account ID
3. Complete a test payment
4. Verify the webhook events are received and processed correctly
5. Check that the payment appears in both your platform account and the connected account

## Going Live

Before going live with connected accounts:

1. Complete Stripe's account verification process
2. Ensure your terms of service and privacy policy comply with Stripe's requirements
3. Test the entire payment flow thoroughly
4. Switch to live mode in the Stripe Dashboard
5. Update your API keys to the live versions

## Additional Resources

- [Stripe Connect Documentation](https://stripe.com/docs/connect)
- [Connect Account Types](https://stripe.com/docs/connect/accounts)
- [Connect Webhooks](https://stripe.com/docs/connect/webhooks)
- [Stripe Connect Testing](https://stripe.com/docs/connect/testing)