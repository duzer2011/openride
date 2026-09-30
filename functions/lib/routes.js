// Server-side catalog: which Stripe price buys which route. Clients never send a price.
// tour_path is where the rider lands after paying (the tour page).
module.exports = {
    'natchez-lower': {
        name: 'Natchez Trace Inn-to-Inn: Jackson to Natchez',
        price_id: 'price_1T91Cl1XJx7K3CRmxmOO3WWb',
        tour_path: '/tours/natchez-lower/',
        cancel_path: '/natchez-trace-lower.html'
    }
};
