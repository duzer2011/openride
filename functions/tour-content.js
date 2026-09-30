const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const json = (statusCode, body) => ({
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
    body: JSON.stringify(body)
});

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        let route_slug;
        try {
            ({ route_slug } = JSON.parse(event.body || '{}'));
        } catch (e) {
            return json(400, { error: 'Invalid JSON' });
        }
        // Slug is used in a file path: allow only lowercase letters, digits, hyphens.
        if (typeof route_slug !== 'string' || !/^[a-z0-9-]+$/.test(route_slug)) {
            return json(400, { error: 'Invalid route_slug' });
        }

        const authHeader = event.headers.authorization || event.headers.Authorization;
        if (!authHeader) {
            return json(401, { error: 'No token provided' });
        }

        const token = authHeader.replace(/^Bearer\s+/i, '');
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) {
            return json(401, { error: 'Invalid token' });
        }

        // Same rule as check-purchase: user_id OR email + route_slug
        const { data: purchases, error: purchaseError } = await supabaseAdmin
            .from('purchases')
            .select('id')
            .eq('route_slug', route_slug)
            .or(`user_id.eq.${user.id},email.eq.${user.email}`);

        if (purchaseError) {
            console.error('Purchase check error:', purchaseError);
            return json(500, { error: 'Database error' });
        }
        if (!purchases || purchases.length === 0) {
            return json(403, { error: 'No purchase found for this route' });
        }

        const file = path.join(__dirname, '..', 'content', 'tours', route_slug, 'tour.json');
        let raw;
        try {
            raw = fs.readFileSync(file, 'utf8');
        } catch (e) {
            return json(404, { error: 'Tour not found' });
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
            body: raw
        };
    } catch (error) {
        console.error('Unexpected error:', error);
        return json(500, { error: 'Server error' });
    }
};
