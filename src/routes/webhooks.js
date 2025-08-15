const express = require('express');
const router = express.Router();
const stripeService = require('../services/stripeService');
const paypalService = require('../services/paypalService');
const winston = require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.simple(),
    transports: [new winston.transports.Console()]
});

// Test webhook endpoint (for development only)
router.post('/test', async (req, res) => {
    try {
        const { userId, planId } = req.body;
        
        if (!userId || !planId) {
            return res.status(400).json({ error: 'userId and planId are required' });
        }
        
        logger.info(`Test webhook - updating user ${userId} to plan ${planId}`);
        
        // Update user's current plan in the authentication service
        try {
            const fetch = (await import('node-fetch')).default;
            const response = await fetch(`http://localhost:5002/auth/users/${userId}/plan`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ planId })
            });
            
            logger.info('Test PATCH response status:', response.status);
            const responseBody = await response.text();
            logger.info('Test PATCH response body:', responseBody);
            
            if (!response.ok) {
                logger.error(`Failed to update user plan in auth service: ${response.status} ${response.statusText}`);
                return res.status(500).json({ error: 'Failed to update user plan' });
            } else {
                logger.info(`User ${userId} plan updated to ${planId} in auth service.`);
                return res.json({ success: true, message: `User ${userId} plan updated to ${planId}` });
            }
        } catch (err) {
            logger.error('Test PATCH request failed:', err);
            return res.status(500).json({ error: 'Failed to update user plan', details: err.message });
        }
        
    } catch (error) {
        logger.error('Error in test webhook:', error);
        res.status(500).json({ error: 'Test webhook failed', details: error.message });
    }
});

// Stripe webhook handler
router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        const signature = req.headers['stripe-signature'];
        
        if (!signature) {
            logger.error('No Stripe signature found in webhook');
            return res.status(400).json({ error: 'No signature found' });
        }

        let event;
        try {
            event = stripeService.verifyWebhookSignature(req.body, signature);
        } catch (error) {
            logger.error('Webhook signature verification failed:', error);
            return res.status(400).json({ error: 'Invalid signature' });
        }

        logger.info(`Processing Stripe webhook: ${event.type}`);

        switch (event.type) {
            case 'payment_intent.succeeded':
                await handlePaymentIntentSucceeded(event.data.object);
                break;
            
            case 'payment_intent.payment_failed':
                await handlePaymentIntentFailed(event.data.object);
                break;
            
            case 'invoice.payment_succeeded':
                await handleInvoicePaymentSucceeded(event.data.object);
                break;
            
            case 'invoice.payment_failed':
                await handleInvoicePaymentFailed(event.data.object);
                break;
            
            case 'checkout.session.completed':
                await handleCheckoutSessionCompleted(event.data.object);
                break;
            
            case 'customer.subscription.created':
                await handleSubscriptionCreated(event.data.object);
                break;
            
            case 'customer.subscription.updated':
                await handleSubscriptionUpdated(event.data.object);
                break;
            
            case 'customer.subscription.deleted':
                await handleSubscriptionDeleted(event.data.object);
                break;
            
            case 'customer.subscription.trial_will_end':
                await handleSubscriptionTrialWillEnd(event.data.object);
                break;
            
            default:
                logger.info(`Unhandled Stripe event type: ${event.type}`);
        }

        res.json({ received: true });
    } catch (error) {
        logger.error('Error processing Stripe webhook:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

// PayPal webhook handler
router.post('/paypal', async (req, res) => {
    try {
        const { event_type, resource_type, resource } = req.body;
        
        logger.info(`Processing PayPal webhook: ${event_type}`);

        switch (event_type) {
            case 'PAYMENT.CAPTURE.COMPLETED':
                await handlePayPalPaymentCompleted(resource);
                break;
            
            case 'PAYMENT.CAPTURE.DENIED':
                await handlePayPalPaymentDenied(resource);
                break;
            
            case 'BILLING.SUBSCRIPTION.CREATED':
                await handlePayPalSubscriptionCreated(resource);
                break;
            
            case 'BILLING.SUBSCRIPTION.ACTIVATED':
                await handlePayPalSubscriptionActivated(resource);
                break;
            
            case 'BILLING.SUBSCRIPTION.CANCELLED':
                await handlePayPalSubscriptionCancelled(resource);
                break;
            
            case 'BILLING.SUBSCRIPTION.EXPIRED':
                await handlePayPalSubscriptionExpired(resource);
                break;
            
            case 'BILLING.SUBSCRIPTION.PAYMENT.COMPLETED':
                await handlePayPalSubscriptionPaymentCompleted(resource);
                break;
            
            case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED':
                await handlePayPalSubscriptionPaymentFailed(resource);
                break;
            
            default:
                logger.info(`Unhandled PayPal event type: ${event_type}`);
        }

        res.json({ received: true });
    } catch (error) {
        logger.error('Error processing PayPal webhook:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

// Stripe webhook handlers
async function handlePaymentIntentSucceeded(paymentIntent) {
    try {
        logger.info(`Payment intent succeeded: ${paymentIntent.id}`);
        
        // TODO: Update database with successful payment
        // TODO: Send confirmation email
        // TODO: Update subscription status if applicable
        
    } catch (error) {
        logger.error('Error handling payment intent succeeded:', error);
    }
}

async function handlePaymentIntentFailed(paymentIntent) {
    try {
        logger.info(`Payment intent failed: ${paymentIntent.id}`);
        
        // TODO: Update database with failed payment
        // TODO: Send failure notification email
        // TODO: Update subscription status if applicable
        
    } catch (error) {
        logger.error('Error handling payment intent failed:', error);
    }
}

async function handleInvoicePaymentSucceeded(invoice) {
    try {
        logger.info(`Invoice payment succeeded: ${invoice.id}`);
        
        // TODO: Update database with successful invoice payment
        // TODO: Send invoice receipt email
        // TODO: Update subscription status
        
    } catch (error) {
        logger.error('Error handling invoice payment succeeded:', error);
    }
}

async function handleInvoicePaymentFailed(invoice) {
    try {
        logger.info(`Invoice payment failed: ${invoice.id}`);
        
        // TODO: Update database with failed invoice payment
        // TODO: Send payment failure notification
        // TODO: Update subscription status
        
    } catch (error) {
        logger.error('Error handling invoice payment failed:', error);
    }
}

async function handleCheckoutSessionCompleted(session) {
    try {
        logger.info(`Checkout session completed: ${session.id}`);
        
        // Extract metadata from the session
        const userId = session.metadata && session.metadata.userId;
        const planId = session.metadata && session.metadata.planId;
        
        logger.info(`Session metadata - userId: ${userId}, planId: ${planId}`);
        
        if (userId && planId) {
            // Update user's current plan in the authentication service
            try {
                const fetch = (await import('node-fetch')).default;
                const response = await fetch(`http://localhost:5002/auth/users/${userId}/plan`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ planId })
                });
                
                logger.info('PATCH response status:', response.status);
                const responseBody = await response.text();
                logger.info('PATCH response body:', responseBody);
                
                if (!response.ok) {
                    logger.error(`Failed to update user plan in auth service: ${response.status} ${response.statusText}`);
                } else {
                    logger.info(`User ${userId} plan updated to ${planId} in auth service.`);
                }
            } catch (err) {
                logger.error('PATCH request failed:', err);
            }
        } else {
            logger.warn('userId or planId missing in session metadata.');
        }
        
    } catch (error) {
        logger.error('Error handling checkout session completed:', error);
    }
}

async function handleSubscriptionCreated(subscription) {
    try {
        logger.info('Stripe webhook event:', JSON.stringify(subscription, null, 2));
        // Extract userId and planId from metadata
        const userId = subscription.metadata && subscription.metadata.userId;
        const planId = subscription.metadata && subscription.metadata.planId;
        logger.info('userId:', userId, 'planId:', planId);
        if (userId && planId) {
            // Update user's current plan in the authentication service
            try {
                const fetch = (await import('node-fetch')).default;
                const response = await fetch(`http://localhost:5002/auth/users/${userId}/plan`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ planId })
                });
                logger.info('PATCH response status:', response.status);
                const responseBody = await response.text();
                logger.info('PATCH response body:', responseBody);
                if (!response.ok) {
                    logger.error(`Failed to update user plan in auth service: ${response.status} ${response.statusText}`);
                } else {
                    logger.info(`User ${userId} plan updated to ${planId} in auth service.`);
                }
            } catch (err) {
                logger.error('PATCH request failed:', err);
            }
        } else {
            logger.warn('userId or planId missing in subscription metadata.');
        }
        // TODO: Save subscription to database
        // TODO: Send welcome email
        // TODO: Update user subscription status
        
    } catch (error) {
        logger.error('Error handling subscription created:', error);
    }
}

async function handleSubscriptionUpdated(subscription) {
    try {
        logger.info('Stripe webhook event:', JSON.stringify(subscription, null, 2));
        // Extract userId and planId from metadata
        const userId = subscription.metadata && subscription.metadata.userId;
        const planId = subscription.metadata && subscription.metadata.planId;
        logger.info('userId:', userId, 'planId:', planId);
        if (userId && planId) {
            // Update user's current plan in the authentication service
            try {
                const fetch = (await import('node-fetch')).default;
                const response = await fetch(`http://localhost:5002/auth/users/${userId}/plan`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ planId })
                });
                logger.info('PATCH response status:', response.status);
                const responseBody = await response.text();
                logger.info('PATCH response body:', responseBody);
                if (!response.ok) {
                    logger.error(`Failed to update user plan in auth service: ${response.status} ${response.statusText}`);
                } else {
                    logger.info(`User ${userId} plan updated to ${planId} in auth service.`);
                }
            } catch (err) {
                logger.error('PATCH request failed:', err);
            }
        } else {
            logger.warn('userId or planId missing in subscription metadata.');
        }
        // TODO: Update subscription in database
        // TODO: Send update notification if significant changes
        
    } catch (error) {
        logger.error('Error handling subscription updated:', error);
    }
}

async function handleSubscriptionDeleted(subscription) {
    try {
        logger.info(`Subscription deleted: ${subscription.id}`);
        
        // TODO: Update subscription status in database
        // TODO: Send cancellation email
        // TODO: Update user subscription status
        
    } catch (error) {
        logger.error('Error handling subscription deleted:', error);
    }
}

async function handleSubscriptionTrialWillEnd(subscription) {
    try {
        logger.info(`Subscription trial will end: ${subscription.id}`);
        
        // TODO: Send trial ending notification
        // TODO: Update subscription status
        
    } catch (error) {
        logger.error('Error handling subscription trial will end:', error);
    }
}

// PayPal webhook handlers
async function handlePayPalPaymentCompleted(resource) {
    try {
        logger.info(`PayPal payment completed: ${resource.id}`);
        
        // TODO: Update database with successful payment
        // TODO: Send confirmation email
        // TODO: Update subscription status if applicable
        
    } catch (error) {
        logger.error('Error handling PayPal payment completed:', error);
    }
}

async function handlePayPalPaymentDenied(resource) {
    try {
        logger.info(`PayPal payment denied: ${resource.id}`);
        
        // TODO: Update database with denied payment
        // TODO: Send failure notification
        // TODO: Update subscription status if applicable
        
    } catch (error) {
        logger.error('Error handling PayPal payment denied:', error);
    }
}

async function handlePayPalSubscriptionCreated(resource) {
    try {
        logger.info(`PayPal subscription created: ${resource.id}`);
        
        // TODO: Save subscription to database
        // TODO: Send welcome email
        // TODO: Update user subscription status
        
    } catch (error) {
        logger.error('Error handling PayPal subscription created:', error);
    }
}

async function handlePayPalSubscriptionActivated(resource) {
    try {
        logger.info(`PayPal subscription activated: ${resource.id}`);
        
        // TODO: Update subscription status in database
        // TODO: Send activation email
        // TODO: Update user subscription status
        
    } catch (error) {
        logger.error('Error handling PayPal subscription activated:', error);
    }
}

async function handlePayPalSubscriptionCancelled(resource) {
    try {
        logger.info(`PayPal subscription cancelled: ${resource.id}`);
        
        // TODO: Update subscription status in database
        // TODO: Send cancellation email
        // TODO: Update user subscription status
        
    } catch (error) {
        logger.error('Error handling PayPal subscription cancelled:', error);
    }
}

async function handlePayPalSubscriptionExpired(resource) {
    try {
        logger.info(`PayPal subscription expired: ${resource.id}`);
        
        // TODO: Update subscription status in database
        // TODO: Send expiration notification
        // TODO: Update user subscription status
        
    } catch (error) {
        logger.error('Error handling PayPal subscription expired:', error);
    }
}

async function handlePayPalSubscriptionPaymentCompleted(resource) {
    try {
        logger.info(`PayPal subscription payment completed: ${resource.id}`);
        
        // TODO: Update database with successful payment
        // TODO: Send payment confirmation
        // TODO: Update subscription status
        
    } catch (error) {
        logger.error('Error handling PayPal subscription payment completed:', error);
    }
}

async function handlePayPalSubscriptionPaymentFailed(resource) {
    try {
        logger.info(`PayPal subscription payment failed: ${resource.id}`);
        
        // TODO: Update database with failed payment
        // TODO: Send payment failure notification
        // TODO: Update subscription status
        
    } catch (error) {
        logger.error('Error handling PayPal subscription payment failed:', error);
    }
}

module.exports = router; 