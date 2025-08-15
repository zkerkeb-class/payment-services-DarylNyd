const paypal = require('@paypal/checkout-server-sdk');
const winston = require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.simple(),
    transports: [new winston.transports.Console()]
});

// Plan configurations
const PLANS = {
    'free': {
        name: 'Free',
        price: 0,
        requests: 5,
        paypalPlanId: null
    },
    'pro': {
        name: 'Pro',
        price: 20.00,
        requests: 20,
        paypalPlanId: process.env.PAYPAL_PRO_PLAN_ID || 'P-5ML4271244454362XMQIZHI'
    },
    'super-pro': {
        name: 'Super Pro',
        price: 40.00,
        requests: 55,
        paypalPlanId: process.env.PAYPAL_SUPER_PRO_PLAN_ID || 'P-5ML4271244454362XMQIZHI'
    }
};

class PayPalService {
    constructor() {
        this.environment = process.env.PAYPAL_MODE === 'live' 
            ? new paypal.core.LiveEnvironment(process.env.PAYPAL_CLIENT_ID, process.env.PAYPAL_CLIENT_SECRET)
            : new paypal.core.SandboxEnvironment(process.env.PAYPAL_CLIENT_ID, process.env.PAYPAL_CLIENT_SECRET);
        
        this.client = new paypal.core.PayPalHttpClient(this.environment);
    }

    // Create a PayPal order
    async createOrder(amount, currency = 'EUR', description = 'NydArt Advisor Subscription') {
        try {
            const request = new paypal.orders.OrdersCreateRequest();
            request.prefer("return=representation");
            request.requestBody({
                intent: 'CAPTURE',
                purchase_units: [{
                    amount: {
                        currency_code: currency,
                        value: amount.toString()
                    },
                    description: description
                }]
            });

            const order = await this.client.execute(request);
            logger.info(`Created PayPal order: ${order.result.id}`);
            return order.result;
        } catch (error) {
            logger.error('Error creating PayPal order:', error);
            throw new Error(`Failed to create PayPal order: ${error.message}`);
        }
    }

    // Capture a PayPal order
    async captureOrder(orderId) {
        try {
            const request = new paypal.orders.OrdersCaptureRequest(orderId);
            request.prefer("return=representation");

            const capture = await this.client.execute(request);
            logger.info(`Captured PayPal order: ${orderId}`);
            return capture.result;
        } catch (error) {
            logger.error('Error capturing PayPal order:', error);
            throw new Error(`Failed to capture PayPal order: ${error.message}`);
        }
    }

    // Create a subscription
    async createSubscription(planId, userData) {
        try {
            const plan = PLANS[planId];
            if (!plan || !plan.paypalPlanId) {
                throw new Error('Invalid plan or plan not configured for PayPal');
            }

            const request = new paypal.catalogs.ProductsPostRequest();
            request.requestBody({
                name: plan.name,
                description: `${plan.name} Plan - ${plan.requests} AI art analyses per month`,
                type: 'SERVICE',
                category: 'SOFTWARE'
            });

            const product = await this.client.execute(request);

            const planRequest = new paypal.catalogs.PlansPostRequest();
            planRequest.requestBody({
                product_id: product.result.id,
                name: plan.name,
                description: `${plan.name} Plan`,
                billing_cycles: [{
                    frequency: {
                        interval_unit: 'MONTH',
                        interval_count: 1
                    },
                    tenure_type: 'REGULAR',
                    sequence: 1,
                    total_cycles: 0,
                    pricing_scheme: {
                        fixed_price: {
                            value: plan.price.toString(),
                            currency_code: 'EUR'
                        }
                    }
                }],
                payment_preferences: {
                    auto_bill_outstanding: true,
                    setup_fee: {
                        value: '0',
                        currency_code: 'EUR'
                    },
                    setup_fee_failure_action: 'CONTINUE',
                    payment_failure_threshold: 3
                }
            });

            const paypalPlan = await this.client.execute(planRequest);

            const subscriptionRequest = new paypal.subscriptions.SubscriptionsPostRequest();
            subscriptionRequest.requestBody({
                plan_id: paypalPlan.result.id,
                start_time: new Date(Date.now() + 60000).toISOString(), // Start in 1 minute
                subscriber: {
                    name: {
                        given_name: userData.username,
                        surname: userData.username
                    },
                    email_address: userData.email
                },
                application_context: {
                    brand_name: 'NydArt Advisor',
                    locale: 'en-US',
                    shipping_preference: 'NO_SHIPPING',
                    user_action: 'SUBSCRIBE_NOW',
                    payment_method: {
                        payer_selected: 'PAYPAL',
                        payee_preferred: 'IMMEDIATE_PAYMENT_REQUIRED'
                    },
                    return_url: `${process.env.FRONTEND_URL}/payment/success?plan=${encodeURIComponent(plan.name)}`,
                    cancel_url: `${process.env.FRONTEND_URL}/payment/failed?error=Payment cancelled by user`
                }
            });

            const subscription = await this.client.execute(subscriptionRequest);
            logger.info(`Created PayPal subscription: ${subscription.result.id}`);
            return subscription.result;
        } catch (error) {
            logger.error('Error creating PayPal subscription:', error);
            throw new Error(`Failed to create PayPal subscription: ${error.message}`);
        }
    }

    // Get subscription details
    async getSubscription(subscriptionId) {
        try {
            const request = new paypal.subscriptions.SubscriptionsGetRequest(subscriptionId);
            const subscription = await this.client.execute(request);
            return subscription.result;
        } catch (error) {
            logger.error('Error retrieving PayPal subscription:', error);
            throw new Error(`Failed to retrieve PayPal subscription: ${error.message}`);
        }
    }

    // Cancel a subscription
    async cancelSubscription(subscriptionId, reason = 'User requested cancellation') {
        try {
            const request = new paypal.subscriptions.SubscriptionsCancelRequest(subscriptionId);
            request.requestBody({
                reason: reason
            });

            await this.client.execute(request);
            logger.info(`Cancelled PayPal subscription: ${subscriptionId}`);
            return { success: true };
        } catch (error) {
            logger.error('Error cancelling PayPal subscription:', error);
            throw new Error(`Failed to cancel PayPal subscription: ${error.message}`);
        }
    }

    // Activate a subscription
    async activateSubscription(subscriptionId) {
        try {
            const request = new paypal.subscriptions.SubscriptionsActivateRequest(subscriptionId);
            request.requestBody({
                reason: 'User requested activation'
            });

            await this.client.execute(request);
            logger.info(`Activated PayPal subscription: ${subscriptionId}`);
            return { success: true };
        } catch (error) {
            logger.error('Error activating PayPal subscription:', error);
            throw new Error(`Failed to activate PayPal subscription: ${error.message}`);
        }
    }

    // Create a refund
    async createRefund(captureId, amount = null, reason = 'BUYER_REQUESTED') {
        try {
            const request = new paypal.payments.CapturesRefundRequest(captureId);
            
            const refundData = {
                reason: reason
            };

            if (amount) {
                refundData.amount = {
                    value: amount.toString(),
                    currency_code: 'EUR'
                };
            }

            request.requestBody(refundData);

            const refund = await this.client.execute(request);
            logger.info(`Created PayPal refund: ${refund.result.id} for capture: ${captureId}`);
            return refund.result;
        } catch (error) {
            logger.error('Error creating PayPal refund:', error);
            throw new Error(`Failed to create PayPal refund: ${error.message}`);
        }
    }

    // Verify webhook signature
    async verifyWebhookSignature(transmissionId, timestamp, webhookId, eventBody) {
        try {
            const request = new paypal.notifications.WebhooksVerifySignatureRequest();
            request.requestBody({
                auth_algo: 'SHA256withRSA',
                cert_url: 'https://api.paypal.com/v1/notifications/certs/CERT-360caa42-fca2a594-5c11a4d1',
                transmission_id: transmissionId,
                transmission_sig: 'signature',
                transmission_time: timestamp,
                webhook_id: webhookId,
                webhook_event: JSON.parse(eventBody)
            });

            const response = await this.client.execute(request);
            return response.result.verification_status === 'SUCCESS';
        } catch (error) {
            logger.error('PayPal webhook signature verification failed:', error);
            return false;
        }
    }

    // Get plan details
    getPlanDetails(planId) {
        return PLANS[planId] || null;
    }

    // Get all plans
    getAllPlans() {
        return PLANS;
    }

    // Create a billing agreement (for recurring payments)
    async createBillingAgreement(planId, userData) {
        try {
            const plan = PLANS[planId];
            if (!plan) {
                throw new Error('Invalid plan');
            }

            const request = new paypal.billingagreements.BillingAgreementsPostRequest();
            request.requestBody({
                name: `${plan.name} Plan Agreement`,
                description: `${plan.name} Plan - ${plan.requests} AI art analyses per month`,
                start_date: new Date(Date.now() + 60000).toISOString(),
                payer: {
                    payment_method: 'PAYPAL'
                },
                plan: {
                    type: 'MERCHANT_INITIATED_BILLING',
                    merchant_id: process.env.PAYPAL_MERCHANT_ID,
                    merchant_payer_id: userData.id
                },
                shipping_address: {
                    line1: 'N/A',
                    city: 'N/A',
                    state: 'N/A',
                    postal_code: '00000',
                    country_code: 'US'
                },
                override_merchant_preferences: {
                    setup_fee: {
                        value: '0',
                        currency: 'EUR'
                    },
                    return_url: `${process.env.FRONTEND_URL}/dashboard?subscription=success`,
                    cancel_url: `${process.env.FRONTEND_URL}/subscribe?cancelled=true`,
                    accepted_pymt_type: 'INSTANT',
                    skip_shipping_address_confirmation: true,
                    immutable_shipping_address: true
                }
            });

            const agreement = await this.client.execute(request);
            logger.info(`Created PayPal billing agreement: ${agreement.result.id}`);
            return agreement.result;
        } catch (error) {
            logger.error('Error creating PayPal billing agreement:', error);
            throw new Error(`Failed to create PayPal billing agreement: ${error.message}`);
        }
    }

    // Execute a billing agreement
    async executeBillingAgreement(token) {
        try {
            const request = new paypal.billingagreements.BillingAgreementsExecuteRequest(token);
            const agreement = await this.client.execute(request);
            logger.info(`Executed PayPal billing agreement: ${token}`);
            return agreement.result;
        } catch (error) {
            logger.error('Error executing PayPal billing agreement:', error);
            throw new Error(`Failed to execute PayPal billing agreement: ${error.message}`);
        }
    }
}

module.exports = new PayPalService(); 