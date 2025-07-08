const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
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
        stripePriceId: null
    },
    'pro': {
        name: 'Pro',
        price: 2000, // €20.00 in cents
        requests: 20,
        stripePriceId: process.env.STRIPE_PRO_PRICE_ID || 'price_pro_placeholder'
    },
    'super-pro': {
        name: 'Super Pro',
        price: 4000, // €40.00 in cents
        requests: 55,
        stripePriceId: process.env.STRIPE_SUPER_PRO_PRICE_ID || 'price_super_pro_placeholder'
    }
};

class StripeService {
    constructor() {
        this.stripe = stripe;
    }

    // Create a customer
    async createCustomer(userData) {
        try {
            const customer = await this.stripe.customers.create({
                email: userData.email,
                name: userData.username,
                metadata: {
                    userId: userData.id
                }
            });

            logger.info(`Created Stripe customer: ${customer.id} for user: ${userData.id}`);
            return customer;
        } catch (error) {
            logger.error('Error creating Stripe customer:', error);
            throw new Error(`Failed to create customer: ${error.message}`);
        }
    }

    // Create a payment intent
    async createPaymentIntent(amount, currency, customerId, metadata = {}) {
        try {
            const paymentIntent = await this.stripe.paymentIntents.create({
                amount,
                currency,
                customer: customerId,
                metadata,
                automatic_payment_methods: {
                    enabled: true,
                },
            });

            logger.info(`Created payment intent: ${paymentIntent.id} for customer: ${customerId}`);
            return paymentIntent;
        } catch (error) {
            logger.error('Error creating payment intent:', error);
            throw new Error(`Failed to create payment intent: ${error.message}`);
        }
    }

    // Create a subscription
    async createSubscription(customerId, priceId, metadata = {}) {
        try {
            const subscription = await this.stripe.subscriptions.create({
                customer: customerId,
                items: [{ price: priceId }],
                payment_behavior: 'default_incomplete',
                payment_settings: { save_default_payment_method: 'on_subscription' },
                expand: ['latest_invoice.payment_intent'],
                metadata
            });

            logger.info(`Created subscription: ${subscription.id} for customer: ${customerId}`);
            return subscription;
        } catch (error) {
            logger.error('Error creating subscription:', error);
            throw new Error(`Failed to create subscription: ${error.message}`);
        }
    }

    // Update a subscription
    async updateSubscription(subscriptionId, priceId) {
        try {
            const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
            
            const updatedSubscription = await this.stripe.subscriptions.update(subscriptionId, {
                items: [{
                    id: subscription.items.data[0].id,
                    price: priceId,
                }],
                proration_behavior: 'create_prorations',
            });

            logger.info(`Updated subscription: ${subscriptionId} to price: ${priceId}`);
            return updatedSubscription;
        } catch (error) {
            logger.error('Error updating subscription:', error);
            throw new Error(`Failed to update subscription: ${error.message}`);
        }
    }

    // Cancel a subscription
    async cancelSubscription(subscriptionId, cancelAtPeriodEnd = true) {
        try {
            const subscription = await this.stripe.subscriptions.update(subscriptionId, {
                cancel_at_period_end: cancelAtPeriodEnd
            });

            logger.info(`Cancelled subscription: ${subscriptionId}, cancel at period end: ${cancelAtPeriodEnd}`);
            return subscription;
        } catch (error) {
            logger.error('Error cancelling subscription:', error);
            throw new Error(`Failed to cancel subscription: ${error.message}`);
        }
    }

    // Reactivate a subscription
    async reactivateSubscription(subscriptionId) {
        try {
            const subscription = await this.stripe.subscriptions.update(subscriptionId, {
                cancel_at_period_end: false
            });

            logger.info(`Reactivated subscription: ${subscriptionId}`);
            return subscription;
        } catch (error) {
            logger.error('Error reactivating subscription:', error);
            throw new Error(`Failed to reactivate subscription: ${error.message}`);
        }
    }

    // Get subscription details
    async getSubscription(subscriptionId) {
        try {
            const subscription = await this.stripe.subscriptions.retrieve(subscriptionId, {
                expand: ['customer', 'latest_invoice', 'default_payment_method']
            });

            return subscription;
        } catch (error) {
            logger.error('Error retrieving subscription:', error);
            throw new Error(`Failed to retrieve subscription: ${error.message}`);
        }
    }

    // Get customer details
    async getCustomer(customerId) {
        try {
            const customer = await this.stripe.customers.retrieve(customerId, {
                expand: ['subscriptions', 'payment_methods']
            });

            return customer;
        } catch (error) {
            logger.error('Error retrieving customer:', error);
            throw new Error(`Failed to retrieve customer: ${error.message}`);
        }
    }

    // Create a refund
    async createRefund(paymentIntentId, amount = null, reason = 'requested_by_customer') {
        try {
            const refundData = {
                payment_intent: paymentIntentId,
                reason
            };

            if (amount) {
                refundData.amount = amount;
            }

            const refund = await this.stripe.refunds.create(refundData);

            logger.info(`Created refund: ${refund.id} for payment intent: ${paymentIntentId}`);
            return refund;
        } catch (error) {
            logger.error('Error creating refund:', error);
            throw new Error(`Failed to create refund: ${error.message}`);
        }
    }

    // Verify webhook signature
    verifyWebhookSignature(payload, signature) {
        try {
            const event = this.stripe.webhooks.constructEvent(
                payload,
                signature,
                process.env.STRIPE_WEBHOOK_SECRET
            );
            return event;
        } catch (error) {
            logger.error('Webhook signature verification failed:', error);
            throw new Error(`Webhook signature verification failed: ${error.message}`);
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

    // Create a setup intent for saving payment methods
    async createSetupIntent(customerId) {
        try {
            const setupIntent = await this.stripe.setupIntents.create({
                customer: customerId,
                payment_method_types: ['card'],
            });

            logger.info(`Created setup intent: ${setupIntent.id} for customer: ${customerId}`);
            return setupIntent;
        } catch (error) {
            logger.error('Error creating setup intent:', error);
            throw new Error(`Failed to create setup intent: ${error.message}`);
        }
    }

    // Attach payment method to customer
    async attachPaymentMethod(paymentMethodId, customerId) {
        try {
            const paymentMethod = await this.stripe.paymentMethods.attach(paymentMethodId, {
                customer: customerId,
            });

            logger.info(`Attached payment method: ${paymentMethodId} to customer: ${customerId}`);
            return paymentMethod;
        } catch (error) {
            logger.error('Error attaching payment method:', error);
            throw new Error(`Failed to attach payment method: ${error.message}`);
        }
    }
}

module.exports = new StripeService(); 