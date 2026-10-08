"""Bounded no-key research adapters. Public accessibility is not a redistribution license.
No proxy rotation, spoofed browser headers, retries around denials, or auth bypass.
"""
import datetime as dt
import hashlib
import json
from pathlib import Path
import time
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent / 'cache'
_LAST = 0.0

def read(url, body=None):
    global _LAST
    ROOT.mkdir(exist_ok=True)
    bodybytes = urllib.parse.urlencode(body).encode() if body is not None else None
    key = hashlib.sha256(url.encode() + (bodybytes or b'')).hexdigest()
    target = ROOT / (key + '.json')
    if target.exists():
        saved = json.loads(target.read_text())
        return saved['payload'], saved['provenance']
    time.sleep(max(0, 2 - (time.monotonic() - _LAST)))
    headers = {'User-Agent': 'ResearchPrototype/0.1', 'Accept': 'application/json'}
    if bodybytes is not None:
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
    req = urllib.request.Request(url, data=bodybytes, headers=headers)
    # HTTPError (incl 401/403/429), CAPTCHA/HTML and malformed JSON stop the request.
    # No automatic retries. Do not change identity or route to bypass denial.
    with urllib.request.urlopen(req, timeout=25) as response:
        raw = response.read(5_000_001)
    _LAST = time.monotonic()
    if len(raw) > 5_000_000:
        raise ValueError('Response exceeds bounded size')
    if raw.startswith(b"researchCallback(") and raw.rstrip().endswith(b")"):
        payload = json.loads(raw.strip()[len(b"researchCallback("):-1])
    else:
        payload = json.loads(raw)
    provenance = {'source_url': url, 'request_parameters': body,
                  'fetched_at': dt.datetime.now(dt.timezone.utc).isoformat(),
                  'sha256': hashlib.sha256(raw).hexdigest(),
                  'access': 'public_no_key', 'redistribution_rights': 'not_verified'}
    target.write_text(json.dumps({'payload':payload,'provenance':provenance}, ensure_ascii=False))
    return payload, provenance

def prices(symbol, start, end):
    if symbol not in ('sh600519','sh600036','sh601318'):
        raise ValueError('Pilot limited to three approved stocks')
    first, last = dt.date.fromisoformat(start), dt.date.fromisoformat(end)
    if last < first or (last-first).days > 100:
        raise ValueError('Pilot window maximum 100 calendar days')
    url = f'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param={symbol},day,{start},{end},100,'
    payload, provenance = read(url)
    if payload.get('code') != 0:
        raise ValueError('Source rejected query')
    raw = payload['data'][symbol].get('day', [])
    if len(raw) >= 100:
        raise ValueError('Potential truncation: requested limit reached')
    bars = []
    for r in raw:
        if not start <= r[0] <= end:
            continue
        date, o, c, h, l, v = r[:6]
        o,c,h,l,v = map(float,(o,c,h,l,v))
        if not (0 < l <= min(o,c) <= max(o,c) <= h and v >= 0):
            raise ValueError('Invalid OHLCV')
        bars.append({'date':date,'open':o,'close':c,'high':h,'low':l,
                     'volume_raw':v,'volume_unit':'unverified','adjustment':'none'})
    return {'symbol':symbol,'bars':bars,'provenance':provenance,
            'warnings':['Current quote metadata intentionally excluded',
                        'Corporate actions are not included; raw price returns are not total returns',
                        'No bar does not prove market holiday; may indicate suspension or missing data']}

def announcements(start, end, page=1):
    if not 1 <= page <= 3:
        raise ValueError('Pilot bounded to three pages')
    body={'pageNum':page,'pageSize':3,'column':'sse','tabName':'fulltext','plate':'sh',
          'searchkey':'贵州茅台','secid':'','stock':'','category':'','trade':'',
          'seDate':f'{start}~{end}','sortName':'time','sortType':'asc','isHLtitle':'false'}
    payload, provenance=read('https://www.cninfo.com.cn/new/hisAnnouncement/query',body)
    items=[]
    for a in payload.get('announcements') or []:
        if a.get('secCode') != '600519':
            continue
        stamp=a['announcementTime']
        local=dt.datetime.fromtimestamp(stamp/1000,dt.timezone(dt.timedelta(hours=8)))
        items.append({'id':a['announcementId'],'symbol':'sh600519','title':a['announcementTitle'],
                      'source_timestamp_ms':stamp,'publication_date':local.date().isoformat(),
                      'timestamp_precision':'date_only_unverified_intraday',
                      'available_after_local_date':local.date().isoformat(),
                      'source_url':'https://static.cninfo.com.cn/'+a['adjunctUrl'],
                      'text':None,'text_status':'not_fetched',
                      'warning':'Use only on a strictly later trading date; do not treat midnight as verified release time'})
    return {'items':items,'has_more':payload.get('hasMore'),
            'total':payload.get('totalAnnouncement'),'provenance':provenance,
            'coverage':'issuer_announcements_only_not_historical_news'}

if __name__ == '__main__':
    print(json.dumps(prices('sh600519','2026-07-01','2026-09-30'),ensure_ascii=False))


def news(symbol, start, end, page=1):
    """Bounded public search results, locally date filtered; never a complete archive."""
    if symbol not in ('600519','600036','601318') or not 1 <= page <= 3:
        raise ValueError('Pilot limited to three securities and three pages')
    first, last = dt.date.fromisoformat(start), dt.date.fromisoformat(end)
    if last < first or (last-first).days > 100:
        raise ValueError('Pilot window maximum 100 calendar days')
    body={'uid':'','keyword':symbol,'type':['cmsArticleWebOld'],'client':'web',
          'clientType':'web','clientVersion':'curr','param':{'cmsArticleWebOld':
          {'searchScope':'default','sort':'time','pageIndex':page,'pageSize':30,'preTag':'','postTag':''}}}
    url='https://search-api-web.eastmoney.com/search/jsonp?'+urllib.parse.urlencode(
        {'cb':'researchCallback','param':json.dumps(body)})
    payload, provenance=read(url)
    if payload.get('code') != 0 or payload.get('bizCode'):
        raise ValueError('Search failed or source requested intervention')
    entries=payload.get('result',{}).get('cmsArticleWebOld',[])
    items=[]
    for entry in entries:
        date=entry.get('date','')
        if not start <= date[:10] <= end:
            continue
        stamp=dt.datetime.strptime(date,'%Y-%m-%d %H:%M:%S').replace(
            tzinfo=dt.timezone(dt.timedelta(hours=8)))
        items.append({'id':entry.get('code'),'symbol':symbol,'title':entry.get('title'),
                      'snippet':entry.get('content'),'text_status':'search_excerpt_not_full_article',
                      'published_at':stamp.isoformat(),'source_time_raw':date,
                      'timezone_assumption':'Asia/Shanghai','media_name':entry.get('mediaName'),
                      'source_url':entry.get('url'),
                      'revision_history':'not_available'})
    dates=[x['date'] for x in entries if x.get('date')]
    return {'items':items,'provenance':provenance,'page':page,
            'source_hits_total':payload.get('hitsTotal'),'retrieved_count':len(entries),
            'retrieved_oldest':min(dates) if dates else None,
            'retrieved_newest':max(dates) if dates else None,
            'coverage':'incomplete_bounded_search_results','date_filter':'local_not_server_archive',
            'warnings':['Results are excerpts, not original full text',
                        'No results means no retrieved matches, not no historical news',
                        'Search index and excerpts retrieved today may have been revised',
                        'Publication timestamps must precede simulated decision time']}
