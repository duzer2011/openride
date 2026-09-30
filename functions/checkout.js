const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY.trim());
const { createClient } = require('@supabase/supabase-js');
const ROUTES = require('./lib/routes');

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const SITE = 'https://openride.bike';

const json = (statusCode, body) => ({ statusCode, body: JSON.stringify(body) });

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const authHeader = event.headers.authorization || event.headers.Authorization;
        if (!authHeader) {
            return json(401, { error: 'Sign in to buy a tour.' });
        }
        const token = authHeader.replace(/^Bearer\s+/i, '');
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) {
            return json(401, { error: 'Sign in to buy a tour.' });
        }

        let route_slug;
        try {
            ({ route_slug } = JSON.parse(event.body || '{}'));
        } catch (e) {
            return json(400, { error: 'Invalid JSON' });
        }
        const route = Object.prototype.hasOwnProperty.call(ROUTES, route_slug) ? ROUTES[route_slug] : null;
        if (!route) {
            return json(400, { error: 'Unknown route.' });
        }

        // User id and email come from the verified token. Anything else the client sends is ignored.
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{ price: route.price_id, quantity: 1 }],
            mode: 'payment',
            customer_email: user.email,
            client_reference_id: user.id,
            metadata: { route_slug, user_id: user.id },
            success_url: `${SITE}${route.tour_path}?purchased=1`,
            cancel_url: `${SITE}${route.cancel_path}`,
        });

        console.log('Stripe session created:', session.id, route_slug);
        return json(200, { url: session.url });
    } catch (error) {
        console.error('Stripe Error:', error);
        return json(500, { error: 'Checkout failed. Please try again.' });
    }
};
