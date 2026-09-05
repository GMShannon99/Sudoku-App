#!/usr/bin/env python3
"""Fetches the visitor country breakdown from GoatCounter's API and writes
it to stats-snapshot.json in the repo root, for the front end to fetch as a
static file (see showCountryStats() in sudoku-ui.js).

Endpoint: GET /api/v0/stats/{page} with page=locations -- confirmed against
GoatCounter's own OpenAPI spec (https://<code>.goatcounter.com/api.json)
rather than assumed. Relevant bits from that spec:

  - There is no dedicated "/stats/locations" route; "locations" is a value
    of the {page} path parameter shared by browsers/systems/locations/
    languages/sizes/campaigns/toprefs.
  - Query params are "start" and "end" (format: date-time), each optional --
    default to "one week ago" and "current time" respectively. Left unset
    here on purpose: the default one-week window matches this script's
    weekly cron schedule, so the snapshot always reflects "since last run".
  - "limit" (default 20, max 100) and "offset" page through results; "more"
    in the response tells you whether another page follows.
  - Response shape is { "more": bool, "stats": [ { "id", "name", "count" },
    ... ] } -- country name is "name", not "country"; visitor count is
    "count", an integer, with no percentage field.
  - Auth is "Authorization: Bearer <token>" (GoatCounter's help/api page;
    the OpenAPI spec's "basicAuth" label is misleading -- Basic auth is
    only offered as an alternative for ad hoc browser testing).
"""

import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from os import environ

PAGE_LIMIT = 100  # GoatCounter's documented maximum for this endpoint.
REQUEST_TIMEOUT_SECONDS = 15
OUTPUT_PATH = "stats-snapshot.json"


def fail(message):
    print(f"fetch_goatcounter_stats: {message}", file=sys.stderr)
    sys.exit(1)


def fetch_page(base_url, token, offset):
    url = f"{base_url}?limit={PAGE_LIMIT}&offset={offset}"
    request = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        detail = body
        try:
            parsed = json.loads(body)
            detail = parsed.get("error") or parsed.get("Error") or parsed.get("errors") or body
        except json.JSONDecodeError:
            pass
        fail(f"GoatCounter API returned {e.code}: {detail}")
    except urllib.error.URLError as e:
        fail(f"network error contacting GoatCounter: {e.reason}")
    except TimeoutError:
        fail("request to GoatCounter timed out")


def main():
    code = environ.get("GOATCOUNTER_CODE")
    token = environ.get("GOATCOUNTER_TOKEN")
    if not code:
        fail("GOATCOUNTER_CODE environment variable is not set")
    if not token:
        fail("GOATCOUNTER_TOKEN environment variable is not set")

    base_url = f"https://{code}.goatcounter.com/api/v0/stats/locations"

    countries = []
    offset = 0
    while True:
        data = fetch_page(base_url, token, offset)
        stats = data.get("stats")
        if not isinstance(stats, list):
            fail(f"unexpected response shape from GoatCounter: {data!r}")

        for entry in stats:
            name = entry.get("name")
            count = entry.get("count")
            if not isinstance(name, str) or not isinstance(count, int):
                fail(f"unexpected stat entry from GoatCounter: {entry!r}")
            countries.append({"country": name, "count": count})

        if not data.get("more"):
            break
        offset += PAGE_LIMIT

    countries.sort(key=lambda c: c["count"], reverse=True)

    snapshot = {
        "updated": datetime.now(timezone.utc).date().isoformat(),
        "countries": countries,
    }

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, indent=2)
        f.write("\n")

    print(f"Wrote {len(countries)} countries to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
