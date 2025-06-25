# Stripe Integration Setup Guide

## Overview

This guide will help you set up and test the Stripe payment integration for Virtual Arena. The integration allows customers to make online payments for orders, tournament registrations, and other services.

## Prerequisites

1. A Stripe account (you can sign up at [stripe.com](https://stripe.com))
2. Stripe CLI for local webhook testing (optional but recommended)

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
4. Select events to listen for (at minimum, select `payment_intent.succeeded` and `checkout.session.completed`)
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

## Troubleshooting

### Common Issues

1. **Payment form doesn't appear**
   - Check browser console for errors
   - Verify that Stripe.js is loading correctly
   - Ensure your publishable key is correct

2. **Payment fails**
   - Check the Stripe Dashboard for error messages
   - Verify you're using a valid test card number
   - Check server logs for any backend errors

3. **Webhook not receiving events**
   - Verify your webhook URL is accessible
   - Check that your webhook secret is correct
   - Look for any errors in your server logs

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