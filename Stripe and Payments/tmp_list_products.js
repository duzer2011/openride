const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function listProducts() {
    try {
        const products = await stripe.products.list({ limit: 10 });
        console.log('SUCCESS');
        console.log('PRODUCTS_COUNT:', products.data.length);
        products.data.forEach(p => {
            console.log(`- ${p.name} (${p.id})`);
        });
    } catch (error) {
        console.error('ERROR:', error.message);
    }
}

listProducts();
