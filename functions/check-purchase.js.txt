const { createClient } = require('@supabase/supabase-js');
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { route_slug } = JSON.parse(event.body);
        const authHeader = event.headers.authorization;

        if (!authHeader) {
            return { statusCode: 401, body: JSON.stringify({ error: 'No token provided' }) };
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

        if (authError || !user) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) };
        }

        // Query purchases for matching user_id OR email + route_slug
        const { data: purchases, error: purchaseError } = await supabaseAdmin
            .from('purchases')
            .select('id')
            .eq('route_slug', route_slug)
            .or(`user_id.eq.${user.id},email.eq.${user.email}`);

        if (purchaseError) {
            console.error('Purchase check error:', purchaseError);
            return { statusCode: 500, body: JSON.stringify({ error: 'Database error' }) };
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ purchased: purchases && purchases.length > 0 })
        };
    } catch (error) {
        console.error('Unexpected error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
