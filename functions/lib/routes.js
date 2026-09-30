// Server-side catalog: which Stripe price buys which route. Clients never send a price.
// tour_path is where the rider lands after paying (moves to /tours/<slug>/ in Phase 3).
module.exports = {
    'natchez-lower': {
        name: 'Lower Natchez Trace',
        price_id: 'price_1T91Cl1XJx7K3CRmxmOO3WWb',
        tour_path: '/guide/natchez-lower/',
        cancel_path: '/natchez-trace-lower.html'
    }
};
