require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY.trim());

async function checkWebhooks() {
    try {
        const events = await stripe.events.list({
            type: 'checkout.session.completed',
            limit: 3
        });

        console.log("Recent checkout.session.completed events:");
        for (const evt of events.data) {
            console.log(`\nEvent ID: ${evt.id}`);
            console.log(`Created: ${new Date(evt.created * 1000).toISOString()}`);

            // Check webhook delivery attempts
            // Wait, Stripe SDK doesn't have an endpoint for event deliveries directly?
            // "If you want to view the delivery attempts for an event, you can list them with /v1/events/:id"
            // Let's just retrieve the event to see if it has pending_webhooks
            const fullEvent = await stripe.events.retrieve(evt.id);
            console.log("Pending Webhooks:", fullEvent.pending_webhooks);
        }
    } catch (e) {
        console.error(e.message);
    }
}

checkWebhooks();
