// check-egress-anomalies.js
//
// Supabase doesn't expose exact egress-in-GB through any API - the usage
// dashboard is the only place that shows the real byte total. But request
// COUNT per endpoint is a solid proxy, and it's exactly what caught the
// real duo_names bug (24,000+ requests to one endpoint in a day, before
// anyone had looked at actual GB). This script re-runs that same check
// daily, so a similar runaway-refetch bug gets flagged automatically
// instead of silently accumulating for weeks.
//
// Why daily specifically: Supabase's Free plan keeps detailed request logs
// for roughly a day. The egress usage GRAPH itself keeps the whole billing
// cycle's history, so a spike is always visible eventually - but by the
// time someone notices it on a weekly or monthly glance, the underlying
// "which endpoint did this" data has usually already aged out. Checking
// daily is what keeps the diagnostic window from closing before anyone
// looks.
//
// Needs a Supabase PERSONAL ACCESS TOKEN (not the service role key) -
// generate one at https://supabase.com/dashboard/account/tokens and set
// it as SUPABASE_ACCESS_TOKEN. This is a different credential from
// everything else this repo already uses, since the Management API (which
// this script calls) is account-scoped, not project-scoped.
//
// Deliberately a single, narrow, 24-hour, single-source query - anything
// broader burns disproportionately more of the Logs Query quota for no
// extra signal (see "Optimize usage" in Supabase's own Logs Query docs).

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

// Comfortably above any legitimate daily traffic this app generates today
// (a dozen or so league owners, occasional automation checkpoints), but
// well below the 24,000+ that the actual duo_names bug produced - wide
// enough margin that this won't cry wolf over a busy game day, tight
// enough to catch the next version of the same mistake long before it
// becomes a real egress problem.
const REQUEST_COUNT_THRESHOLD = 3000;

if (!PROJECT_REF || !ACCESS_TOKEN) {
    console.error('Missing SUPABASE_PROJECT_REF or SUPABASE_ACCESS_TOKEN - skipping egress anomaly check.');
    process.exit(1);
}

async function run() {
    const end = new Date();
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);

    const sql = `
        select
            log_attributes['request.method'] as method,
            log_attributes['request.path'] as path,
            count() as request_count
        from logs
        where source = 'edge_logs'
        group by method, path
        order by request_count desc
        limit 20
    `;

    const url = new URL(`https://api.supabase.com/v1/projects/${PROJECT_REF}/analytics/endpoints/logs`);
    url.searchParams.set('sql', sql);
    url.searchParams.set('iso_timestamp_start', start.toISOString());
    url.searchParams.set('iso_timestamp_end', end.toISOString());

    const response = await fetch(url, {
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}` }
    });

    if (!response.ok) {
        const body = await response.text();
        console.error(`Logs API request failed (${response.status}): ${body}`);
        process.exit(1);
    }

    const data = await response.json();
    const rows = data.result || data || [];

    console.log(`Top ${rows.length} endpoint(s) by request count, last 24 hours:`);
    for (const row of rows) {
        console.log(`  ${row.request_count.toString().padStart(6)}  ${row.method} ${row.path}`);
    }

    const offenders = rows.filter(row => row.request_count > REQUEST_COUNT_THRESHOLD);

    if (offenders.length > 0) {
        console.error(`\n⚠️  ${offenders.length} endpoint(s) exceeded the ${REQUEST_COUNT_THRESHOLD}-request/day threshold:`);
        for (const row of offenders) {
            console.error(`  ${row.method} ${row.path}: ${row.request_count} requests`);
        }
        console.error('\nThis pattern (one endpoint far outpacing everything else) is exactly what a stale');
        console.error('React dependency or a refetch loop looks like - check for a useEffect whose');
        console.error('dependency array holds an array/object that gets recreated on every render.');
        process.exit(1);
    }

    console.log('\n✅ No anomalous request volume detected.');
}

run().catch(err => {
    console.error('check-egress-anomalies.js threw:', err);
    process.exit(1);
});
