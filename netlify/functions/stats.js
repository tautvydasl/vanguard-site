// netlify/functions/stats.js
//
// Reads the latest "Player Stats" bot embeds (AI Hunter Leaderboard,
// PvP Leaderboard, Currently Online) from a Discord channel and returns
// them as JSON for the website to render. Runs server-side, so it avoids
// the browser CORS restriction that blocks calling Discord directly.
//
// Requires two environment variables set in Netlify (Site settings > Environment variables):
//   DISCORD_BOT_TOKEN   - the bot token from the Discord Developer Portal
//   DISCORD_CHANNEL_ID  - the "statistika" channel ID (1523357634638516234)

exports.handler = async function () {
  const TOKEN = process.env.DISCORD_BOT_TOKEN;
  const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

  const headers = {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'cache-control': 'public, max-age=60',
  };

  if (!TOKEN || !CHANNEL_ID) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Missing DISCORD_BOT_TOKEN or DISCORD_CHANNEL_ID env vars' }),
    };
  }

  try {
    const res = await fetch(
      `https://discord.com/api/v10/channels/${CHANNEL_ID}/messages?limit=20`,
      { headers: { Authorization: `Bot ${TOKEN}` } }
    );

    if (!res.ok) {
      const text = await res.text();
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: 'Discord API error', detail: text }),
      };
    }

    const messages = await res.json();

    const getField = (embed, name) =>
      (embed.fields || []).find((f) =>
        f.name.toLowerCase().includes(name.toLowerCase())
      );

    const cleanEntry = (s) =>
      s
        .trim()
        .replace(/\*\*/g, '')
        .trim()
        .replace(/^\d+\.\s*/, '')
        .trim();

    const splitField = (field) => {
      if (!field || !field.value) return [];
      return field.value
        .split(/\n|\|/)
        .map(cleanEntry)
        .filter(
          (line) =>
            line &&
            line.toLowerCase() !== 'n/a' &&
            !line.toLowerCase().includes('no pve statistics') &&
            !line.toLowerCase().includes('no pvp statistics')
        );
    };

    const findEmbed = (matchTitle) => {
      for (const msg of messages) {
        const embed = (msg.embeds || []).find((e) =>
          (e.title || '').toLowerCase().includes(matchTitle)
        );
        if (embed) return { embed, message: msg };
      }
      return null;
    };

    let aiHunter = [];
    const aiResult = findEmbed('ai hunter');
    if (aiResult) {
      const names = splitField(getField(aiResult.embed, 'player'));
      const kills = splitField(getField(aiResult.embed, 'ai kills'));
      aiHunter = names.map((name, i) => ({
        name,
        aiKills: parseInt(kills[i]) || 0,
      }));
    }

    let pvp = [];
    const pvpResult = findEmbed('pvp leaderboard');
    if (pvpResult) {
      const names = splitField(getField(pvpResult.embed, 'player'));
      const kills = splitField(getField(pvpResult.embed, 'player kills'));
      const shots = splitField(getField(pvpResult.embed, 'longest shot'));
      pvp = names.map((name, i) => ({
        name,
        playerKills: parseInt(kills[i]) || 0,
        longestShot: shots[i] || '',
      }));
    }

    let online = [];
    let updatedAt = null;
    const onlineResult = findEmbed('currently online');
    if (onlineResult) {
      const { embed, message } = onlineResult;
      if (embed.fields && embed.fields.length) {
        const raw = embed.fields.map((f) => f.value).join(' | ');
        online = raw
          .split(/\n|\|/)
          .map(cleanEntry)
          .filter(
            (line) => line && line !== '_' && !line.toLowerCase().includes('live status')
          );
      }
      updatedAt = message.edited_timestamp || message.timestamp;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ aiHunter, pvp, online, updatedAt }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Unexpected error', detail: String(err) }),
    };
  }
};
