// recap-share/index.ts
// GET /functions/v1/recap-share/<week>          -> bot: OG-tagged HTML page; person: 302 redirect to the real report
// GET /functions/v1/recap-share/<week>/image.svg -> the week-specific thumbnail image itself
//
// This function exists because the actual report is a client-side React
// SPA page (hof-codez.github.io/brownbell/#/recap/<week>) - a link-preview
// crawler (Sleeper's chat, iMessage, RCS, etc.) never runs JavaScript, so
// it can only ever see whatever raw HTML the URL returns on first fetch.
// Sharing the SPA URL directly would show the exact same generic HTML
// shell for every week, since GitHub Pages serves one static index.html
// regardless of the hash. This function is the thing actually shared
// instead: real server-side code that can tell a bot from a person and
// serve each one something different from the SAME url.
//
// verify_jwt must be OFF for this function (see ../../config.toml) - a
// crawler will never send a Supabase auth header, and this needs to
// work for a completely anonymous visitor regardless.

import { createAdminClient } from '../_shared/supabaseAdmin.ts';

const SPA_BASE_URL = 'https://hof-codez.github.io/brownbell';

// Known link-preview crawler User-Agent substrings, plus a broad
// catch-all for the word "bot" itself, which the large majority of
// crawlers self-identify with somewhere in their UA string. This can't
// be exhaustive - if Sleeper's own in-app fetcher turns out to use
// something unrecognizable, it'll be treated as a person and redirected
// straight through, which just means Sleeper's preview card falls back
// to no rich preview at all rather than showing the wrong thing.
const BOT_UA_PATTERNS = [
    'bot', 'facebookexternalhit', 'twitterbot', 'slackbot', 'discordbot',
    'whatsapp', 'telegrambot', 'linkedinbot', 'skypeuripreview',
    'linkpresentation', 'iframely', 'embedly', 'redditbot', 'pinterest',
    'vkshare', 'w3c_validator', 'facebookcatalog'
];

function isLikelyBot(userAgent: string): boolean {
    const ua = userAgent.toLowerCase();
    return BOT_UA_PATTERNS.some(pattern => ua.includes(pattern));
}

function escapeXml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escapeHtml(value: string): string {
    return escapeXml(value).replace(/'/g, '&#39;');
}

Deno.serve(async (req: Request) => {
    try {
        const url = new URL(req.url);
        // Path looks like /recap-share/<week> or /recap-share/<week>/image.svg
        // - Deno.serve gives the full path including the function's own
        // name segment, so both are pulled from the tail end rather than
        // assuming a fixed prefix length.
        const segments = url.pathname.split('/').filter(Boolean);
        const wantsImage = segments[segments.length - 1] === 'image.svg';
        const weekSegment = wantsImage ? segments[segments.length - 2] : segments[segments.length - 1];
        const week = Number(weekSegment);

        if (!Number.isInteger(week) || week < 1) {
            return new Response('Not found', { status: 404 });
        }

        const supabase = createAdminClient();
        const { data: recap, error } = await supabase
            .from('weekly_recaps')
            .select('content')
            .eq('week', week)
            .maybeSingle();

        if (error || !recap) {
            return new Response('Recap not found for this week', { status: 404 });
        }

        const content = recap.content as {
            matchupOfTheWeek: { teamA: string; teamB: string; scoreA: number; scoreB: number; winner: string | null } | null;
        };

        if (wantsImage) {
            return new Response(buildThumbnailSvg(week, content.matchupOfTheWeek), {
                headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=604800' }
            });
        }

        const targetUrl = `${SPA_BASE_URL}/#/recap/${week}`;
        const userAgent = req.headers.get('user-agent') || '';

        if (!isLikelyBot(userAgent)) {
            return Response.redirect(targetUrl, 302);
        }

        // A bot never follows the redirect to fetch its own og:image tags
        // (crawlers resolve relative/absolute image URLs from THIS page's
        // markup, not from wherever a 302 might have pointed), so the
        // image URL below must be this same function's own image route,
        // not the SPA.
        const imageUrl = `${url.origin}${url.pathname.replace(/\/?$/, '')}/image.svg`;
        const title = `Week ${week} Brown Bell Recap`;
        const description = describeMatchupOfTheWeek(content.matchupOfTheWeek);

        const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(imageUrl)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${escapeHtml(targetUrl)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(imageUrl)}">
<meta http-equiv="refresh" content="0; url=${escapeHtml(targetUrl)}">
</head>
<body>
<p>Redirecting to <a href="${escapeHtml(targetUrl)}">the Week ${week} recap</a>&hellip;</p>
</body>
</html>`;

        return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });

    } catch (err) {
        console.error('recap-share error:', err);
        return new Response('Internal error', { status: 500 });
    }
});

function describeMatchupOfTheWeek(m: { teamA: string; teamB: string; scoreA: number; scoreB: number; winner: string | null } | null): string {
    if (!m) return 'See how this week\u2019s Brown Bell matchups played out.';
    if (m.winner === null) {
        return `${m.teamA} and ${m.teamB} tied ${m.scoreA.toFixed(1)}-${m.scoreB.toFixed(1)} in the Matchup of the Week.`;
    }
    const loser = m.winner === m.teamA ? m.teamB : m.teamA;
    const winnerScore = m.winner === m.teamA ? m.scoreA : m.scoreB;
    const loserScore = m.winner === m.teamA ? m.scoreB : m.scoreA;
    return `${m.winner} beat ${loser} ${winnerScore.toFixed(1)}-${loserScore.toFixed(1)} in the Matchup of the Week.`;
}

// A simple templated thumbnail, built as inline SVG rather than a
// rendered PNG - Edge Functions (Deno) aren't well suited to heavyweight
// image rendering, and SVG og:image support is solid on most modern
// platforms. If Sleeper's or RCS's specific preview renderer turns out
// not to support it, converting this to a rendered PNG is the fallback,
// but meaningfully more work - worth testing directly before assuming
// that's needed. Colors and general layout match the app's own palette
// (frontend/tailwind.config.ts) rather than inventing a new look.
function buildThumbnailSvg(week: number, matchup: { teamA: string; teamB: string; scoreA: number; scoreB: number; winner: string | null } | null): string {
    const FIELD = '#14201B';
    const PANEL_LINE = '#2A3A30';
    const BELL = '#C9A15A';
    const CHALK = '#EDEAE1';
    const CHALK_DIM = '#9CA89E';

    const width = 1200, height = 630;

    let matchupBlock = '';
    if (matchup) {
        const aWon = matchup.winner === matchup.teamA;
        const bWon = matchup.winner === matchup.teamB;
        matchupBlock = `
            <text x="${width / 2}" y="300" text-anchor="middle" font-family="sans-serif" font-size="22" letter-spacing="4" fill="${BELL}">MATCHUP OF THE WEEK</text>
            <text x="340" y="380" text-anchor="middle" font-family="sans-serif" font-size="40" font-weight="700" fill="${aWon ? CHALK : CHALK_DIM}">${escapeXml(matchup.teamA)}</text>
            <text x="340" y="440" text-anchor="middle" font-family="monospace" font-size="56" font-weight="700" fill="${aWon ? CHALK : CHALK_DIM}">${matchup.scoreA.toFixed(1)}</text>
            <text x="${width / 2}" y="410" text-anchor="middle" font-family="sans-serif" font-size="28" fill="${CHALK_DIM}">vs</text>
            <text x="860" y="380" text-anchor="middle" font-family="sans-serif" font-size="40" font-weight="700" fill="${bWon ? CHALK : CHALK_DIM}">${escapeXml(matchup.teamB)}</text>
            <text x="860" y="440" text-anchor="middle" font-family="monospace" font-size="56" font-weight="700" fill="${bWon ? CHALK : CHALK_DIM}">${matchup.scoreB.toFixed(1)}</text>
        `;
    } else {
        matchupBlock = `<text x="${width / 2}" y="380" text-anchor="middle" font-family="sans-serif" font-size="28" fill="${CHALK_DIM}">See how this week played out</text>`;
    }

    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${width}" height="${height}" fill="${FIELD}"/>
        <rect x="40" y="40" width="${width - 80}" height="${height - 80}" fill="none" stroke="${PANEL_LINE}" stroke-width="2" rx="12"/>
        <text x="${width / 2}" y="150" text-anchor="middle" font-family="sans-serif" font-size="26" letter-spacing="6" fill="${BELL}">DYNASTY SIDE AWARDS</text>
        <text x="${width / 2}" y="220" text-anchor="middle" font-family="sans-serif" font-size="64" font-weight="800" fill="${CHALK}">BROWN BELL <tspan fill="${BELL}">&amp;</tspan> NEXT UP</text>
        <text x="${width / 2}" y="265" text-anchor="middle" font-family="sans-serif" font-size="26" fill="${CHALK_DIM}">Week ${week} Recap</text>
        ${matchupBlock}
    </svg>`;
}
