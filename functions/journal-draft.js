exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const {
    ride_id,
    day_number,
    tour_name,
    date,
    start_location,
    end_location,
    miles_today,
    elevation_gain_ft,
    moving_time_minutes,
    waypoints_visited,
    lodging_tonight,
    weather_high_f,
    weather_low_f,
    weather_conditions,
    voice_transcript,
    audio_mode
  } = body;

  if (!miles_today && !voice_transcript) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Need at least ride stats or a voice transcript' })
    };
  }

  // Build rich context for Claude
  const rideContext = [
    tour_name && `Tour: ${tour_name}`,
    day_number && `Day ${day_number}`,
    date && `Date: ${date}`,
    start_location && end_location && `Route: ${start_location} to ${end_location}`,
    miles_today && `Miles ridden: ${miles_today}`,
    elevation_gain_ft && `Elevation gain: ${elevation_gain_ft} ft`,
    moving_time_minutes && `Moving time: ${Math.floor(moving_time_minutes/60)}h ${moving_time_minutes%60}min`,
    waypoints_visited?.length && `Stops made: ${waypoints_visited.join(', ')}`,
    lodging_tonight && `Staying tonight: ${lodging_tonight}`,
    weather_high_f && `Weather: High ${weather_high_f}F, Low ${weather_low_f}F, ${weather_conditions || ''}`,
  ].filter(Boolean).join('\n');

  const systemPrompt = `You are helping a cyclist write their tour journal for OpenRide.bike.

Write a journal entry in first person, as if the rider wrote it themselves.
The voice should be direct, specific, honest - not flowery or AI-sounding.
Reference specific details from the ride data. Name the actual places.
Mention the physical reality - tired legs, a good meal, what the road felt like.
Keep it 150-300 words. No headers. Just a natural journal entry.

Never use: "embarked", "journey", "breathtaking", "stunning", "unforgettable",
"nestled", "vibrant", "seamless", "epic adventure", or any cycling clichés.

If the rider provided a voice transcript, use their exact words and observations
as the backbone. The stats are context, their words are the story.`;

  const userPrompt = `Write a journal entry for today's ride.

RIDE DATA:
${rideContext}

${voice_transcript ? `RIDER'S OWN WORDS (use these as the backbone of the entry):
"${voice_transcript}"` : 'No voice transcript - write from the ride data alone.'}

Write the journal entry now. First person. No preamble.`;

  try {
    const apiKey = process.env.ANTHROPIC_KEY;
    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: 'ANTHROPIC_KEY not configured' }) };
    }

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 600,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('Anthropic API error:', resp.status, errText);
      return {
        statusCode: 502,
        body: JSON.stringify({ error: 'Anthropic API error', status: resp.status, details: errText })
      };
    }

    const data = await resp.json();
    const draft = data.content[0].text;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        draft,
        ride_id,
        day_number,
        generated_at: new Date().toISOString()
      })
    };

  } catch (err) {
    console.error('Journal draft error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to generate draft', details: err.message })
    };
  }
};
