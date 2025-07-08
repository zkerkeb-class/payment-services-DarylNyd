const express = require('express');
const router = express.Router();
const { validatePaymentMethod, validatePagination } = require('../middleware/validation');
const stripeService = require('../services/stripeService');
const paypalService = require('../services/paypalService');
const winston = require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.simple(),
    transports: [new winston.transports.Console()]
});

// Create a payment intent
router.post('/intent', async (req, res) => {
    try {
        const { amount, currency = 'eur', paymentMethod = 'stripe', metadata = {} } = req.body;
        const userId = req.user.id;

        if (paymentMethod === 'stripe') {
            // Create or get customer
            let customer;
            try {
                customer = await stripeService.createCustomer(req.user);
            } catch (error) {
                // Customer might already exist, try to get existing one
                // TODO: Implement customer lookup
                throw error;
            }

            const paymentIntent = await stripeService.createPaymentIntent(
                amount,
                currency,
                customer.id,
                {
                    userId,
                    ...metadata
                }
            );

            res.json({
                success: true,
                data: {
                    clientSecret: paymentIntent.client_secret,
                    paymentIntentId: paymentIntent.id
                }
            });
        } else if (paymentMethod === 'paypal') {
            const order = await paypalService.createOrder(amount, currency.toUpperCase());
            
            res.json({
                success: true,
                data: {
                    orderId: order.id,
                    approvalUrl: order.links.find(link => link.rel === 'approve').href
                }
            });
        } else {
            return res.status(400).json({
                error: 'Invalid payment method',
                message: 'Only Stripe and PayPal are supported'
            });
        }
    } catch (error) {
        logger.error('Error creating payment intent:', error);
        res.status(500).json({
            error: 'Failed to create payment intent',
            message: error.message
        });
    }
});

// Confirm payment
router.post('/confirm', async (req, res) => {
    try {
        const { paymentIntentId, paymentMethod } = req.body;
        const userId = req.user.id;

        if (paymentMethod === 'stripe') {
            // For Stripe, the payment is confirmed on the client side
            // This endpoint can be used for additional server-side processing
            res.json({
                success: true,
                message: 'Payment confirmed successfully'
            });
        } else if (paymentMethod === 'paypal') {
            const capture = await paypalService.captureOrder(paymentIntentId);
            
            res.json({
                success: true,
                data: capture,
                message: 'Payment captured successfully'
            });
        } else {
            return res.status(400).json({
                error: 'Invalid payment method',
                message: 'Only Stripe and PayPal are supported'
            });
        }
    } catch (error) {
        logger.error('Error confirming payment:', error);
        res.status(500).json({
            error: 'Failed to confirm payment',
            message: error.message
        });
    }
});

// Create refund
router.post('/refund', async (req, res) => {
    try {
        const { paymentIntentId, amount, reason = 'requested_by_customer', paymentMethod } = req.body;
        const userId = req.user.id;

        if (paymentMethod === 'stripe') {
            const refund = await stripeService.createRefund(paymentIntentId, amount, reason);
            
            res.json({
                success: true,
                data: refund,
                message: 'Refund created successfully'
            });
        } else if (paymentMethod === 'paypal') {
            const refund = await paypalService.createRefund(paymentIntentId, amount, reason);
            
            res.json({
                success: true,
                data: refund,
                message: 'Refund created successfully'
            });
        } else {
            return res.status(400).json({
                error: 'Invalid payment method',
                message: 'Only Stripe and PayPal are supported'
            });
        }
    } catch (error) {
        logger.error('Error creating refund:', error);
        res.status(500).json({
            error: 'Failed to create refund',
            message: error.message
        });
    }
});

// Get payment methods
router.get('/methods', async (req, res) => {
    try {
        const userId = req.user.id;

        // TODO: Fetch from database - for now return mock data
        const paymentMethods = [
            {
                id: 'pm_1',
                type: 'card',
                brand: 'visa',
                last4: '4242',
                expMonth: 12,
                expYear: 2025,
                isDefault: true
            }
        ];

        res.json({
            success: true,
            data: paymentMethods
        });
    } catch (error) {
        logger.error('Error fetching payment methods:', error);
        res.status(500).json({
            error: 'Failed to fetch payment methods',
            message: error.message
        });
    }
});

// Add payment method
router.post('/methods', validatePaymentMethod, async (req, res) => {
    try {
        const { type, cardNumber, expiryDate, cvv, cardholderName, paypalEmail } = req.body;
        const userId = req.user.id;

        if (type === 'card') {
            // Create or get customer
            let customer;
            try {
                customer = await stripeService.createCustomer(req.user);
            } catch (error) {
                // Customer might already exist, try to get existing one
                // TODO: Implement customer lookup
                throw error;
            }

            // Create setup intent for adding payment method
            const setupIntent = await stripeService.createSetupIntent(customer.id);

            res.json({
                success: true,
                data: {
                    setupIntentId: setupIntent.id,
                    clientSecret: setupIntent.client_secret
                },
                message: 'Setup intent created successfully'
            });
        } else if (type === 'paypal') {
            // For PayPal, the payment method is added during the payment flow
            res.json({
                success: true,
                message: 'PayPal payment method will be added during payment'
            });
        } else {
            return res.status(400).json({
                error: 'Invalid payment method type',
                message: 'Only card and paypal are supported'
            });
        }
    } catch (error) {
        logger.error('Error adding payment method:', error);
        res.status(500).json({
            error: 'Failed to add payment method',
            message: error.message
        });
    }
});

// Remove payment method
router.delete('/methods/:methodId', async (req, res) => {
    try {
        const { methodId } = req.params;
        const userId = req.user.id;

        // TODO: Verify payment method belongs to user and remove from database

        res.json({
            success: true,
            message: 'Payment method removed successfully'
        });
    } catch (error) {
        logger.error('Error removing payment method:', error);
        res.status(500).json({
            error: 'Failed to remove payment method',
            message: error.message
        });
    }
});

// Get payment history
router.get('/history', validatePagination, async (req, res) => {
    try {
        const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
        const userId = req.user.id;

        // TODO: Fetch from database - for now return mock data
        const paymentHistory = [
            {
                id: 'pi_1',
                amount: 2000,
                currency: 'eur',
                status: 'succeeded',
                paymentMethod: 'stripe',
                description: 'Pro Plan Subscription',
                date: new Date().toISOString()
            }
        ];

        res.json({
            success: true,
            data: paymentHistory,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: 1
            }
        });
    } catch (error) {
        logger.error('Error fetching payment history:', error);
        res.status(500).json({
            error: 'Failed to fetch payment history',
            message: error.message
        });
    }
});

// Get payment details
router.get('/:paymentId', async (req, res) => {
    try {
        const { paymentId } = req.params;
        const userId = req.user.id;

        // TODO: Fetch from database and verify ownership

        const paymentDetails = {
            id: paymentId,
            amount: 2000,
            currency: 'eur',
            status: 'succeeded',
            paymentMethod: 'stripe',
            description: 'Pro Plan Subscription',
            date: new Date().toISOString(),
            metadata: {
                userId,
                planId: 'pro'
            }
        };

        res.json({
            success: true,
            data: paymentDetails
        });
    } catch (error) {
        logger.error('Error fetching payment details:', error);
        res.status(500).json({
            error: 'Failed to fetch payment details',
            message: error.message
        });
    }
});

module.exports = router; 