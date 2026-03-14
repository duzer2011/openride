const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY.trim());
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY.trim());
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function sendPDF(customerEmail, pdfFile, metadata) {
    const pdfPath = path.join(__dirname, '../guides/', pdfFile);

    // Fallback to default if exact variant doesn't exist
    const finalPath = fs.existsSync(pdfPath)
        ? pdfPath
        : path.join(__dirname, '../guides/natchez-moderate-bnb-spring.pdf');

    const pdfData = fs.readFileSync(finalPath);

    await resend.emails.send({
        from: 'Chris at OpenRide <hello@openride.bike>',
        to: customerEmail,
        subject: 'Your Natchez Trace Route Guide is here',
        html: `
      <p>Hi,</p>
      <p>Your personalized guide is attached — built around your 
      ${metadata.pace} pace, ${metadata.accommodation} accommodation 
      preference, riding in ${metadata.season}.</p>
      <p>You're going to love this route. Any questions before you go, 
      just reply to this email.</p>
      <p>— Chris<br>OpenRide.bike</p>
    `,
        attachments: [{
            filename: pdfFile,
            content: pdfData.toString('base64'),
            type: 'application/pdf'
        }]
    });
    console.log(`✅ PDF sent to ${customerEmail}`);
}

async function sendPartnerEmail(email, metadata) {
    await resend.emails.send({
        from: 'Chris at OpenRide <hello@openride.bike>',
        to: email,
        subject: 'Your crew is riding the Natchez Trace — here\'s how to prepare',
        html: `
      <p>Hi,</p>
      <p>Someone in your riding group is planning a Natchez Trace trip 
      and added you to the crew.</p>
      <p>We'll send you packing tips, fitness prep, and logistics info 
      so everyone shows up ready.</p>
      <p>No spam. Just useful stuff for the ride.</p>
      <p>— Chris<br>OpenRide.bike</p>
    `
    });
    console.log(`✅ Partner prep email sent to ${email}`);
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
        const customerEmail = session.customer_details.email;
        const metadata = session.metadata;

        console.log(`✅ Payment Success: ${session.id} for ${customerEmail}`);

        // Determine correct PDF variant from metadata
        const pace = metadata.pace || 'moderate';
        const accommodation = metadata.accommodation || 'bnb';
        const season = metadata.season || 'spring';

        // Map to normalized filename
        const pdfFile = `natchez-${pace}-${accommodation}-${season}.pdf`;

        // Send email with PDF
        await sendPDF(customerEmail, pdfFile, metadata);

        // Record purchase in Supabase
        await supabaseAdmin.from('purchases').insert({
            email: customerEmail,
            user_id: metadata.supabase_user_id || null,
            stripe_session_id: session.id,
            route_slug: 'natchez-lower',
            pdf_variant: pdfFile,
            amount_cents: session.amount_total,
            metadata: { 
                pace: metadata.pace, 
                accommodation: metadata.accommodation, 
                season: metadata.season 
            }
        });

        // If partner emails exist, send prep email to each
        if (metadata.partner_emails) {
            const partners = metadata.partner_emails.split(',').map(e => e.trim()).filter(e => e.length > 0);
            for (const email of partners) {
                await sendPartnerEmail(email, metadata);
            }
        }
    }

    return {
        statusCode: 200,
        body: JSON.stringify({ received: true })
    };
};
