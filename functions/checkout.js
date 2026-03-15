const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY.trim());

exports.handler = async (event) => {
    try {
        if (event.httpMethod !== 'POST') {
            return { statusCode: 405, body: 'Method Not Allowed' };
        }

        const { sessionData, formData } = JSON.parse(event.body);

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price: 'price_1T91Cl1XJx7K3CRmxmOO3WWb',
                quantity: 1,
            }],
            mode: 'payment',
            metadata: {
                pace: sessionData.pace,
                accommodation: sessionData.accommodation,
                season: sessionData.season,
                party_size: sessionData.party_size,
                partner_emails: formData.partner_emails || '',
                supabase_user_id: sessionData.user_id || '',
            },
            custom_text: {
                submit: {
                    message: 'Your personalized PDF guide will be emailed instantly after purchase.'
                },
                after_submit: {
                    message: 'Added partners\' emails? We\'ll send them packing tips and logistics — no spam, no upsell.'
                }
            },
            success_url: 'https://openride.bike/success?session_id={CHECKOUT_SESSION_ID}',
            cancel_url: 'https://openride.bike/natchez-trace-lower.html',
        });

        console.log("✅ Stripe Session Created:", session.id);
        const retrievedSession = await stripe.checkout.sessions.retrieve(session.id);
        console.log('Metadata from Stripe:', JSON.stringify(retrievedSession.metadata, null, 2));

        return {
            statusCode: 200,
            body: JSON.stringify({ url: session.url }),
        };
    } catch (error) {
        console.error("Stripe Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};
