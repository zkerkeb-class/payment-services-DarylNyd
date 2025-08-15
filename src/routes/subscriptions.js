const express = require('express');
const router = express.Router();
const { validateSubscription, validateUpdateSubscription, validatePagination } = require('../middleware/validation');
const stripeService = require('../services/stripeService');
const paypalService = require('../services/paypalService');
const winston = require('winston');
const Plan = require('../models/Plan');
const axios = require('axios');
const authMiddleware = require('../middleware/auth');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.simple(),
    transports: [new winston.transports.Console()]
});

// Get available plans
router.get('/plans', async (req, res) => {
    try {
        // Fetch plans from the bdd service
        const bddUrl = process.env.BDD_SERVICE_URL || 'http://localhost:5001/api/plans';
        const response = await axios.get(bddUrl);
        const plans = response.data.data;
        res.json({ success: true, data: plans });
    } catch (error) {
        logger.error('Error fetching plans from bdd service:', error);
        res.status(500).json({ error: 'Failed to fetch plans from bdd service', message: error.message });
    }
});

// Get user's current subscription
router.get('/current', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        // TODO: Fetch from database - for now return mock data
        // Simulate: If user has no subscription, assign free plan
        let userSubscription = null; // TODO: Replace with DB lookup

        if (!userSubscription) {
            // Assign free plan if no subscription exists
            userSubscription = {
                id: 'free_sub_' + userId,
                plan: 'free',
                status: 'active',
                currentPeriodStart: new Date().toISOString(),
                currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                requestsUsed: 0,
                requestsTotal: 5,
                paymentMethod: 'none',
                provider: 'internal',
                autoAssigned: true
            };
            // TODO: Save to database
        }

        res.json({
            success: true,
            data: userSubscription
        });
    } catch (error) {
        logger.error('Error fetching current subscription:', error);
        res.status(500).json({
            error: 'Failed to fetch subscription',
            message: error.message
        });
    }
});

// Create a new subscription
router.post('/', authMiddleware, validateSubscription, async (req, res) => {
    try {
        const { planId, paymentMethod, currency = 'eur', metadata = {} } = req.body;
        const userId = req.user.id;

        // Check if user already has an active subscription
        // TODO: Check database for existing subscription

        if (planId === 'free') {
            // Handle free plan
            const subscription = {
                id: 'free_sub',
                plan: 'free',
                status: 'active',
                currentPeriodStart: new Date().toISOString(),
                currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                requestsUsed: 0,
                requestsTotal: 5,
                paymentMethod: 'none',
                provider: 'internal'
            };

            // TODO: Save to database

            return res.json({
                success: true,
                data: subscription,
                message: 'Free plan activated successfully'
            });
        }

        let subscription;
        let paymentData;

        if (paymentMethod === 'stripe') {
            // Fetch plan from the database using planId
            const plan = await Plan.findOne({ planId });
            if (!plan || !plan.stripePriceId) {
                return res.status(400).json({
                    error: 'Invalid plan',
                    message: 'Selected plan is not available for Stripe payments'
                });
            }

            // Create or get customer
            let customer;
            try {
                customer = await stripeService.createCustomer(req.user);
            } catch (error) {
                // Customer might already exist, try to get existing one
                // TODO: Implement customer lookup
                throw error;
            }

            // Create Stripe Checkout Session
            const session = await stripeService.stripe.checkout.sessions.create({
                mode: 'subscription',
                payment_method_types: ['card'],
                customer: customer.id,
                line_items: [
                    {
                        price: plan.stripePriceId,
                        quantity: 1,
                    },
                ],
                success_url: process.env.FRONTEND_URL + '/payment/success?session_id={CHECKOUT_SESSION_ID}&plan=' + encodeURIComponent(plan.name),
                cancel_url: process.env.FRONTEND_URL + '/payment/failed?error=Payment cancelled by user',
                metadata: {
                    userId,
                    planId,
                    ...metadata
                }
            });

            logger.info(`Created Stripe checkout session: ${session.id}`);
            logger.info(`Session metadata: userId=${userId}, planId=${planId}`);
            logger.info(`Success URL: ${session.url}`);

            return res.json({
                success: true,
                data: {
                    checkoutUrl: session.url
                }
            });
        } else if (paymentMethod === 'paypal') {
            // Create PayPal subscription
            subscription = await paypalService.createSubscription(planId, req.user);
            
            paymentData = {
                subscriptionId: subscription.id,
                approvalUrl: subscription.links.find(link => link.rel === 'approve').href
            };
        } else {
            return res.status(400).json({
                error: 'Invalid payment method',
                message: 'Only Stripe and PayPal are supported'
            });
        }

        // TODO: Save subscription to database

        res.json({
            success: true,
            data: {
                subscription,
                paymentData
            },
            message: 'Subscription created successfully'
        });
    } catch (error) {
        logger.error('Error creating subscription:', error);
        res.status(500).json({
            error: 'Failed to create subscription',
            message: error.message
        });
    }
});

// Update subscription
router.put('/:subscriptionId', validateUpdateSubscription, async (req, res) => {
    try {
        const { subscriptionId } = req.params;
        const { planId, cancelAtPeriodEnd } = req.body;
        const userId = req.user.id;

        // TODO: Verify subscription belongs to user

        if (cancelAtPeriodEnd !== undefined) {
            // Cancel or reactivate subscription
            if (cancelAtPeriodEnd) {
                await stripeService.cancelSubscription(subscriptionId, true);
            } else {
                await stripeService.reactivateSubscription(subscriptionId);
            }
        } else if (planId) {
            // Update plan
            const plan = stripeService.getPlanDetails(planId);
            if (!plan || !plan.stripePriceId) {
                return res.status(400).json({
                    error: 'Invalid plan',
                    message: 'Selected plan is not available'
                });
            }

            await stripeService.updateSubscription(subscriptionId, plan.stripePriceId);
        }

        // TODO: Update database

        res.json({
            success: true,
            message: 'Subscription updated successfully'
        });
    } catch (error) {
        logger.error('Error updating subscription:', error);
        res.status(500).json({
            error: 'Failed to update subscription',
            message: error.message
        });
    }
});

// Cancel subscription
router.delete('/:subscriptionId', async (req, res) => {
    try {
        const { subscriptionId } = req.params;
        const userId = req.user.id;

        // TODO: Verify subscription belongs to user

        await stripeService.cancelSubscription(subscriptionId, true);

        // TODO: Update database

        res.json({
            success: true,
            message: 'Subscription cancelled successfully'
        });
    } catch (error) {
        logger.error('Error cancelling subscription:', error);
        res.status(500).json({
            error: 'Failed to cancel subscription',
            message: error.message
        });
    }
});

// Get subscription usage
router.get('/:subscriptionId/usage', async (req, res) => {
    try {
        const { subscriptionId } = req.params;
        const userId = req.user.id;

        // TODO: Verify subscription belongs to user and fetch from database

        const usage = {
            requestsUsed: 12,
            requestsTotal: 20,
            requestsRemaining: 8,
            usagePercentage: 60,
            resetDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString()
        };

        res.json({
            success: true,
            data: usage
        });
    } catch (error) {
        logger.error('Error fetching subscription usage:', error);
        res.status(500).json({
            error: 'Failed to fetch usage',
            message: error.message
        });
    }
});

// Get billing history
router.get('/:subscriptionId/billing', validatePagination, async (req, res) => {
    try {
        const { subscriptionId } = req.params;
        const { page = 1, limit = 10 } = req.query;
        const userId = req.user.id;

        // TODO: Verify subscription belongs to user and fetch from database

        const billingHistory = [
            {
                id: 'inv_1',
                amount: 2000,
                currency: 'eur',
                status: 'paid',
                date: new Date().toISOString(),
                description: 'Pro Plan - Monthly'
            }
        ];

        res.json({
            success: true,
            data: billingHistory,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: 1
            }
        });
    } catch (error) {
        logger.error('Error fetching billing history:', error);
        res.status(500).json({
            error: 'Failed to fetch billing history',
            message: error.message
        });
    }
});

// Admin: Create or update a plan
router.post('/plans', async (req, res) => {
    try {
        const { name, description, price, currency, requests, stripePriceId, paypalPlanId, features, isActive } = req.body;
        let plan = await Plan.findOne({ name });
        if (plan) {
            // Update existing plan
            plan.description = description;
            plan.price = price;
            plan.currency = currency;
            plan.requests = requests;
            plan.stripePriceId = stripePriceId;
            plan.paypalPlanId = paypalPlanId;
            plan.features = features;
            plan.isActive = isActive !== undefined ? isActive : plan.isActive;
            plan.updatedAt = new Date();
            await plan.save();
        } else {
            // Create new plan
            plan = new Plan({ name, description, price, currency, requests, stripePriceId, paypalPlanId, features, isActive });
            await plan.save();
        }
        res.json({ success: true, data: plan });
    } catch (error) {
        logger.error('Error creating/updating plan:', error);
        res.status(500).json({ error: 'Failed to create/update plan', message: error.message });
    }
});

module.exports = router; 