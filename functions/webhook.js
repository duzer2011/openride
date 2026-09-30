const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY.trim());
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY.trim());
const ROUTES = require('./lib/routes');
const { createClient } = require('@supabase/supabase-js');
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const SITE = 'https://openride.bike';

async function sendWelcomeEmail(customerEmail, route) {
    const tourUrl = `${SITE}${route.tour_path}`;
    await resend.emails.send({
        from: 'Chris at OpenRide <hello@openride.bike>',
        to: customerEmail,
        subject: 'Your Natchez Trace tour is ready',
        html: `
      <p>Hi,</p>
      <p>Your ${route.name} tour is ready. Sign in with this email address and open it here:</p>
      <p><a href="${tourUrl}">${tourUrl}</a></p>
      <p>It is a page, not a PDF. When a restaurant changes its hours or a closure gets posted, the page changes and you see it. Your access does not expire.</p>
      <p>Questions before you go? Reply to this email.</p>
      <p>Chris<br>OpenRide.bike</p>
    `
    });
    console.log(`Welcome email sent to ${customerEmail}`);
}

exports.handler = async (event) => {
    const sig = event.headers['stripe-signature'];
    let stripeEvent;

    try {
        stripeEvent = stripe.webhooks.constructEvent(
            event.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET.trim()
        );
    } catch (err) {
        console.error(`Webhook Signature Error: ${err.message}`);
        return { statusCode: 400, body: `Webhook error: ${err.message}` };
    }

    if (stripeEvent.type === 'checkout.session.completed') {
        const session = stripeEvent.data.object;
        const customerEmail = (session.customer_details && session.customer_details.email) || session.customer_email;
        const metadata = session.metadata || {};
        const route = Object.prototype.hasOwnProperty.call(ROUTES, metadata.route_slug) ? ROUTES[metadata.route_slug] : null;

        if (session.payment_status !== 'paid') {
            console.log(`Session ${session.id} not paid (${session.payment_status}), skipping`);
        } else if (!route || !customerEmail) {
            // Nothing to grant. Return 200 so Stripe does not retry forever; the log has the details.
            console.error(`Session ${session.id}: missing or unknown route_slug (${metadata.route_slug}) or email`);
        } else {
            console.log(`Payment success: ${session.id} for ${customerEmail} (${metadata.route_slug})`);

            const row = {
                email: customerEmail,
                user_id: metadata.user_id || null,
                stripe_session_id: session.id,
                route_slug: metadata.route_slug,
                amount_cents: session.amount_total,
                metadata: { source: 'tour-access' }
            };

            let { error } = await supabaseAdmin.from('purchases').insert(row);
            // user_id references profiles(id). If no profile row exists yet, the email match still unlocks the tour.
            if (error && error.code === '23503' && row.user_id) {
                console.warn(`No profile for ${row.user_id}, recording purchase by email only`);
                ({ error } = await supabaseAdmin.from('purchases').insert({ ...row, user_id: null }));
            }

            if (error && error.code === '23505') {
                // stripe_session_id is UNIQUE: Stripe retried an event we already handled.
                console.log(`Session ${session.id} already recorded, skipping`);
            } else if (error) {
                console.error('Purchase insert failed:', error);
                return { statusCode: 500, body: 'Could not record purchase' };
            } else {
                try {
                    await sendWelcomeEmail(customerEmail, route);
                } catch (e) {
                    // Purchase is recorded; access works without the email. Do not make Stripe retry.
                    console.error('Welcome email failed:', e);
                }
            }
        }
    }

    return {
        statusCode: 200,
        body: JSON.stringify({ received: true })
    };
};
