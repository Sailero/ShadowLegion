"""Read public Steam review summaries. Does not retain review text or profiles.

Run from the repository root with Python 3. It writes a new dated summary;
an existing snapshot is deliberately not overwritten.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import json

APPS = [
    ('cozy', 1055540, 'A Short Hike'),
    ('cozy', 1586800, 'Lil Gator Game'),
    ('cozy', 1307580, 'TOEM'),
    ('cozy', 1607240, 'Mail Time'),
    ('cozy', 1549550, 'Haven Park'),
    ('cozy', 1177980, 'Little Kitty, Big City'),
    ('cozy', 2198150, 'Tiny Glade'),
    ('cozy', 2908050, "Catto's Post Office"),
    ('survivor', 1794680, 'Vampire Survivors'),
    ('survivor', 1942280, 'Brotato'),
    ('survivor', 2218750, 'Halls of Torment'),
    ('survivor', 2334730, 'Death Must Die'),
    ('survivor', 2066020, 'Soulstone Survivors'),
    ('survivor', 2321470, 'Deep Rock Galactic: Survivor'),
    ('survivor', 3405340, 'Megabonk'),
    ('survivor', 2510960, 'Temtem: Swarm'),
    ('mechanism-contrast', 850320, 'PHOGS!'),
    ('mechanism-contrast', 1519710, 'SCHiM'),
    ('mechanism-contrast', 1634860, "Minishoot' Adventures"),
]
PARAMS = dict(json=1, filter='all', language='all', review_type='all',
              purchase_type='steam', num_per_page=1, filter_offtopic_activity=1)

def collect(app):
    group, app_id, name = app
    url = f'https://store.steampowered.com/appreviews/{app_id}?{urlencode(PARAMS)}'
    row = dict(group=group, appId=app_id, name=name, url=url,
               storeUrl=f'https://store.steampowered.com/app/{app_id}/')
    try:
        request = Request(url, headers={'User-Agent': 'Sunlit-Echoes-Research/1.0'})
        with urlopen(request, timeout=25) as response:
            data = json.load(response)
        assert data.get('success') == 1, 'Steam did not report success'
        summary = data['query_summary']
        assert summary['total_positive'] + summary['total_negative'] == summary['total_reviews']
        row['summary'] = summary
        row['computedPositivePercent'] = round(100 * summary['total_positive'] / summary['total_reviews'], 2)
        row['status'] = 'ok'
    except Exception as exc:
        row.update(status='error', error=str(exc))
    row['retrievedAtUtc'] = datetime.now(timezone.utc).isoformat()
    return row

if __name__ == '__main__':
    started = datetime.now(timezone.utc)
    with ThreadPoolExecutor(max_workers=4) as pool:
        rows = list(pool.map(collect, APPS))
    output = dict(
        startedAtUtc=started.isoformat(),
        completedAtUtc=datetime.now(timezone.utc).isoformat(),
        method='Steam public appreviews query_summary, same parameters for every game.',
        parameters=PARAMS,
        documentation='https://partner.steamgames.com/doc/store/getreviews',
        interpretation='All-language aggregate matching these parameters. Historical review counts, not sales, revenue, player counts, representative market shares or a success probability. Rounded percentages computed from returned counts, not Steam display rounding.',
        sample='Purposeful 19-game contrast sample, includes prominent titles and mechanism/scale contrasts; not a random census. Differences in age, price, IP, EA history, updates, promotions and localization are uncontrolled.',
        apps=rows,
    )
    destination = Path(__file__).with_name('steam-review-snapshot-' + started.strftime('%Y-%m-%dT%H-%M-%SZ') + '.json')
    with destination.open('x', encoding='utf-8', newline='\n') as handle:
        json.dump(output, handle, ensure_ascii=False, indent=2)
        handle.write('\n')
    print(destination)
    for row in rows:
        s = row.get('summary', {})
        print(row['name'], s.get('total_reviews', row.get('error')), row.get('computedPositivePercent'))
    raise SystemExit(0 if all(row['status'] == 'ok' for row in rows) else 1)
