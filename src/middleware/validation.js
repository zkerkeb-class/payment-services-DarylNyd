const Joi = require('joi');

// Validation schemas
const subscriptionSchema = Joi.object({
    planId: Joi.string().valid('free', 'pro', 'super-pro').required(),
    paymentMethod: Joi.string().valid('stripe', 'paypal').required(),
    currency: Joi.string().default('eur'),
    metadata: Joi.object().optional()
});

const paymentMethodSchema = Joi.object({
    type: Joi.string().valid('card', 'paypal').required(),
    cardNumber: Joi.when('type', {
        is: 'card',
        then: Joi.string().pattern(/^\d{4}\s\d{4}\s\d{4}\s\d{4}$/).required(),
        otherwise: Joi.forbidden()
    }),
    expiryDate: Joi.when('type', {
        is: 'card',
        then: Joi.string().pattern(/^(0[1-9]|1[0-2])\/([0-9]{2})$/).required(),
        otherwise: Joi.forbidden()
    }),
    cvv: Joi.when('type', {
        is: 'card',
        then: Joi.string().pattern(/^\d{3,4}$/).required(),
        otherwise: Joi.forbidden()
    }),
    cardholderName: Joi.when('type', {
        is: 'card',
        then: Joi.string().min(2).max(100).required(),
        otherwise: Joi.forbidden()
    }),
    paypalEmail: Joi.when('type', {
        is: 'paypal',
        then: Joi.string().email().required(),
        otherwise: Joi.forbidden()
    })
});

const webhookSchema = Joi.object({
    type: Joi.string().required(),
    data: Joi.object().required(),
    signature: Joi.string().optional()
});

const updateSubscriptionSchema = Joi.object({
    planId: Joi.string().valid('free', 'pro', 'super-pro').required(),
    cancelAtPeriodEnd: Joi.boolean().optional()
});

// Validation middleware factory
const validate = (schema, property = 'body') => {
    return (req, res, next) => {
        const { error, value } = schema.validate(req[property], {
            abortEarly: false,
            stripUnknown: true
        });

        if (error) {
            const errorMessage = error.details.map(detail => detail.message).join(', ');
            return res.status(400).json({
                error: 'Validation Error',
                message: errorMessage,
                details: error.details
            });
        }

        // Replace request data with validated data
        req[property] = value;
        next();
    };
};

// Specific validation middlewares
const validateSubscription = validate(subscriptionSchema);
const validatePaymentMethod = validate(paymentMethodSchema);
const validateWebhook = validate(webhookSchema);
const validateUpdateSubscription = validate(updateSubscriptionSchema);

// Query parameter validation
const validateQuery = (schema) => {
    return (req, res, next) => {
        const { error, value } = schema.validate(req.query, {
            abortEarly: false,
            stripUnknown: true
        });

        if (error) {
            const errorMessage = error.details.map(detail => detail.message).join(', ');
            return res.status(400).json({
                error: 'Validation Error',
                message: errorMessage,
                details: error.details
            });
        }

        req.query = value;
        next();
    };
};

// Common query schemas
const paginationSchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sortBy: Joi.string().valid('createdAt', 'updatedAt', 'amount', 'status').default('createdAt'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc')
});

const validatePagination = validateQuery(paginationSchema);

module.exports = {
    validateSubscription,
    validatePaymentMethod,
    validateWebhook,
    validateUpdateSubscription,
    validatePagination,
    validate
}; 