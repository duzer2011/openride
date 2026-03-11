const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function checkAccount() {
    try {
        const account = await stripe.accounts.retrieve();
        console.log('SUCCESS');
        console.log('ACCOUNT_ID:', account.id);
        console.log('EMAIL:', account.email || 'N/A');
        console.log('BUSINESS_NAME:', account.settings?.dashboard?.display_name || 'N/A');
    } catch (error) {
        console.error('ERROR:', error.message);
    }
}

checkAccount();
