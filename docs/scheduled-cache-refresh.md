Daily cache refresh runs at 07:00 IST for production and nonproduction independently.
Automation uses a restricted POST endpoint at
`/api/internal/daily-cache-refresh?cache=dashboard` or `cache=customers`.
It warms daily caches and returns status only.

Before enabling the updated workflow:

1. Generate a random secret of at least 32 characters for each environment.
2. Set `CACHE_REFRESH_TOKEN` in the corresponding Cloudflare Pages project's
   production secrets (pc-tech for nonproduction; the project serving
   www.polarcanvas.in for production).
3. Set the matching GitHub Actions environment secret `CACHE_REFRESH_TOKEN`
   in `nonproduction` or `production`, respectively.
4. Deploy the endpoint to both environments, then manually run
   `Refresh Daily Application Caches` and check both jobs.

Missing or invalid credentials fail closed. The deployment maintenance gate still
applies. Existing daily freshness rules avoid repeated Zoho fetches when today's
cache is populated. Do not use user passwords or session cookies for automation.
