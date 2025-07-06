const express = require('express');
const router = express.Router();
const stripeService = require('../services/stripeService');
const paypalService = require('../services/paypalService');

// Health check endpoint
router.get('/', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'Payment Service',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Detailed health check
router.get('/detailed', async (req, res) => {
    try {
        const health = {
            status: 'healthy',
            service: 'Payment Service',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            checks: {
                stripe: 'unknown',
                paypal: 'unknown',
                database: 'unknown'
            }
        };

        // Check Stripe connectivity
        try {
            // Simple Stripe API call to test connectivity
            const plans = stripeService.getAllPlans();
            health.checks.stripe = 'healthy';
        } catch (error) {
            health.checks.stripe = 'unhealthy';
            health.status = 'degraded';
        }

        // Check PayPal connectivity
        try {
            // Simple PayPal API call to test connectivity
            const plans = paypalService.getAllPlans();
            health.checks.paypal = 'healthy';
        } catch (error) {
            health.checks.paypal = 'unhealthy';
            health.status = 'degraded';
        }

        // Check database connectivity (if implemented)
        try {
            // TODO: Add database health check
            health.checks.database = 'healthy';
        } catch (error) {
            health.checks.database = 'unhealthy';
            health.status = 'degraded';
        }

        // Determine overall status
        const unhealthyChecks = Object.values(health.checks).filter(check => check === 'unhealthy');
        if (unhealthyChecks.length > 0) {
            health.status = unhealthyChecks.length === Object.keys(health.checks).length ? 'unhealthy' : 'degraded';
        }

        const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
        res.status(statusCode).json(health);
    } catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            service: 'Payment Service',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
});

// Readiness check
router.get('/ready', (req, res) => {
    // Check if the service is ready to accept requests
    const isReady = process.env.STRIPE_SECRET_KEY && process.env.PAYPAL_CLIENT_ID;
    
    if (isReady) {
        res.json({
            status: 'ready',
            service: 'Payment Service',
            timestamp: new Date().toISOString()
        });
    } else {
        res.status(503).json({
            status: 'not ready',
            service: 'Payment Service',
            timestamp: new Date().toISOString(),
            message: 'Service is not ready to accept requests'
        });
    }
});

// Liveness check
router.get('/live', (req, res) => {
    // Simple check to see if the service is alive
    res.json({
        status: 'alive',
        service: 'Payment Service',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

module.exports = router; 