"""Build the Echoes directory and standalone articles from content/*.json (Pillow required)."""
import argparse
import datetime
import json
import re
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE_URL = 'https://zhuzhenfang.com'
ECHOES_URL = SITE_URL + '/echoes/'
PERSON_ID = SITE_URL + '/#person'


def bilingual(zh, en):
    return f'<span data-lang="zh" lang="zh-CN">{zh}</span><span data-lang="en" lang="en">{en}</span>'


def structured_data(value):
    # JSON is script content, not HTML text: escape < to keep note titles inert.
    data = json.dumps(value, ensure_ascii=False).replace('<', '\\u003c')
    return f'<script type="application/ld+json">{data}</script>'


def collection_data(entries):
    return structured_data({
        '@context': 'https://schema.org', '@type': 'CollectionPage',
        '@id': ECHOES_URL + '#webpage', 'name': '回声', 'url': ECHOES_URL,
        'inLanguage': ['zh-CN', 'en'],
        'isPartOf': {'@id': SITE_URL + '/#website'},
        'author': {'@type': 'Person', '@id': PERSON_ID, 'name': '朱振方', 'url': SITE_URL + '/about/'},
        'description': '朱振方的播客、访谈与演讲笔记。',
        'mainEntity': {
            '@type': 'ItemList',
            'itemListElement': [
                {'@type': 'ListItem', 'position': i, 'name': entry['title'],
                 'url': ECHOES_URL + entry['id'] + '/'}
                for i, entry in enumerate((e for e in entries if e['status'] == 'published'), 1)
            ],
        },
    })


def source_reference(entry):
    source_url = re.search(r'https?://[^\s]+', entry['source'])
    title = entry['source'][:source_url.start()].strip() if source_url else entry['source'].strip()
    reference = {'@type': 'CreativeWork', 'name': title or entry.get('source_short') or source_url.group()}
    if source_url:
        reference.update({'@id': source_url.group(), 'url': source_url.group()})
    return reference


def english_translation(entry):
    translation = entry.get('en')
    if translation is None:
        return None
    for field in ('title', 'summary', 'type', 'source_title'):
        assert isinstance(translation.get(field), str) and translation[field].strip(), f'en.{field}'
    assert len(translation['sections']) == len(entry['sections']), 'Translation must include every section'
    for original, translated in zip(entry['sections'], translation['sections']):
        assert len(original['items']) == len(translated['items']), 'Translation must include every item'
        assert bool(original.get('title')) == bool(translated.get('title')), 'Translation must preserve section headings'
        assert original.get('kind', 'notes') == translated.get('kind', 'notes'), 'Translation must preserve quotation sections'
        for item, counterpart in zip(original['items'], translated['items']):
            assert bool(item.get('note')) == bool(counterpart.get('note')), 'Translation must preserve every annotation'
    return translation


def render_sections(content):
    e = escape
    sections = []
    for section in content['sections']:
        assert section['items'], 'Empty section'
        items = []
        for item in section['items']:
            assert isinstance(item['text'], str) and item['text'].strip()
            note = f'<p class="echo-note-body">{e(item["note"])}</p>' if item.get('note') else ''
            quotation = ' echo-quotation' if item['text'].startswith(('“', '「', '『', '"')) else ''
            items.append(f'<li class="echo-quote{quotation}"><p class="echo-note-title">{e(item["text"])}</p>{note}</li>')
        section_title = re.sub(r'^[\s\u200d\ufe0f\u2600-\u27bf\U0001f000-\U0001faff]+', '', section.get('title', '')).strip()
        section_heading = f'<h2 class="echo-section-title">{e(section_title)}</h2>' if section_title else ''
        section_kind = section.get('kind', 'notes')
        assert section_kind in ('notes', 'quotation'), 'Invalid section kind'
        tag = 'blockquote' if section_kind == 'quotation' else 'section'
        classes = 'echo-section echo-reference' if section_kind == 'quotation' else 'echo-section'
        sections.append(f'<{tag} class="{classes}">{section_heading}<ul class="echo-quote-list">{"".join(items)}</ul></{tag}>')
    return ''.join(sections)


def render(entry, standalone=False):
    e = escape
    slug = entry['id']
    assert re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', slug), 'Invalid id'
    datetime.date.fromisoformat(entry['date'])
    assert entry['status'] in ('published', 'pending')
    for field in ('title', 'source', 'type'):
        assert isinstance(entry[field], str) and entry[field].strip(), field
    ready = entry['status'] == 'published'
    assert not ready or entry['sections'], 'Published notes need content'
    translation = english_translation(entry) if ready else None
    date = f'<time class="echo-date" datetime="{entry["date"]}">{entry["date"].replace("-", "/")}</time>'
    kind_en = translation['type'] if translation else {'播客': 'Podcast', '视频': 'Video', '社会': 'Life'}.get(entry['type'], entry['type'])
    kind = f'<span class="echo-tag">{bilingual(e(entry["type"]), e(kind_en))}</span>' if standalone else ''
    if standalone:
        author = bilingual('<a rel="author" href="/about/">朱振方</a>的听后笔记', 'Listening notes by <a rel="author" href="/about/">Zhenfang Zhu</a>')
        kind += f'<span class="echo-tag">{author}</span>'
    meta = f'<span class="echo-meta">{date}{kind}'
    if not ready:
        meta += '<span class="echo-pending">' + bilingual('待整理', 'Notes pending') + '</span>'
    else:
        label = bilingual('中英双语', 'Chinese / English') if translation else bilingual('中文原文', 'Chinese original')
        meta += f'<span class="echo-tag echo-content-language">{label}</span>'
    rating = entry.get('rating')
    assert rating is None or type(rating) is int and 1 <= rating <= 5
    meta += '</span>'
    title = bilingual(e(entry['title']), e(translation['title'])) if translation else e(entry['title'])
    heading = f'{meta}<h2 class="echo-title" id="title-{slug}">{title}</h2>'
    if not ready:
        return f'<article class="echo-card echo-card-pending" id="{slug}" lang="zh-CN">{heading}</article>'
    assert isinstance(entry.get('summary'), str) and entry['summary'].strip(), 'Published notes need a summary'
    if not standalone:
        summary_text = bilingual(e(entry['summary']), e(translation['summary'])) if translation else e(entry['summary'])
        summary = f'<p class="echo-summary">{summary_text}</p>'
        search_fragments = []
        for content in (entry, translation):
            if content is None:
                continue
            for section in content['sections']:
                search_fragments.append(section.get('title', ''))
                for item in section['items']:
                    search_fragments.extend((item['text'], item.get('note', '')))
        search_text = e(' '.join(fragment for fragment in search_fragments if fragment), quote=True)
        return f'<article class="echo-card" id="{slug}" lang="zh-CN" data-search-text="{search_text}"><a class="echo-card-link" href="/echoes/{slug}/" aria-labelledby="title-{slug}">{heading}{summary}<span class="echo-arrow" aria-hidden="true">→</span></a></article>'
    if translation:
        body = f'<div data-lang="zh" lang="zh-CN">{render_sections(entry)}</div><div data-lang="en" lang="en">{render_sections(translation)}</div>'
        notice = bilingual('中文原文附英文翻译。来源链接指向原始内容。', 'English translation of my Chinese notes. Source links point to the original content.')
    else:
        body = render_sections(entry)
        notice = bilingual('本文为中文原文。', 'This note is in Chinese. An English translation is not available yet.')
    reference = source_reference(entry)
    source_title, source_url = reference['name'], reference.get('url')
    source_name = bilingual(e(source_title), e(translation['source_title'])) if translation else e(source_title)
    source_link = f'<a href="{e(source_url, quote=True)}" target="_blank" rel="noopener noreferrer">{source_name} ↗</a>' if source_url else source_name
    source_label = bilingual('原内容 · 摘录与要点来源', 'Original content · Source of excerpts and takeaways')
    source = f'<aside class="echo-source-detail"><p class="echo-source-label">{source_label}</p><p>{source_link}</p></aside>'
    heading = heading.replace('<h2 ', '<h1 ').replace('</h2>', '</h1>')
    signoff = bilingual('我听见了一些东西。<br>它们离开以后，留下了这些。', 'I heard a few things.<br>After they were gone, this is what stayed.')
    return f'<article class="echo-entry echo-standalone" lang="zh-CN"><header>{heading}</header><p class="echo-language-note">{notice}</p><div class="echo-body">{body}{source}</div><footer class="echo-signoff"><p>{signoff}</p></footer></article>'


def share_page(entry, template):
    url = 'https://zhuzhenfang.com/echoes/' + entry['id'] + '/'
    image = 'https://zhuzhenfang.com/static/assets/echoes/' + entry['id'] + '.png'
    reference = source_reference(entry)
    title, summary = escape(entry['title'], quote=True), escape(entry['summary'], quote=True)
    head = template.split('<body')[0].replace('    {{STRUCTURED_DATA}}\n', '')
    head = re.sub(r'<title>.*?</title>', f'<title>{title}｜回声</title>', head)
    head = re.sub(r'    <(?:meta (?:name="description"|property="og:[^"]+")[^>]*|link rel="canonical"[^>]*)>\n', '', head)
    head = re.sub(r'    <script defer src="/static/js/echoes.js[^>]*></script>\n', '', head)
    metadata = f'''    <meta name="description" content="{summary}">
    <link rel="canonical" href="{url}">
    <meta property="og:type" content="article">
    <meta property="og:site_name" content="朱振方 · 回声">
    <meta property="og:title" content="{title}">
    <meta property="og:description" content="{summary}">
    <meta property="og:url" content="{url}">
    <meta property="og:image" content="{image}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="{title} — {summary}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="{title}">
    <meta name="twitter:description" content="{summary}">
    <meta name="twitter:image" content="{image}">
'''
    metadata += '    ' + structured_data({
        '@context': 'https://schema.org',
        '@graph': [
            {'@type': 'Article', '@id': url + '#article', 'url': url,
             'mainEntityOfPage': {'@type': 'WebPage', '@id': url},
             'headline': entry['title'], 'description': entry['summary'],
             'image': [image], 'inLanguage': ['zh-CN', 'en'] if english_translation(entry) else 'zh-CN',
             'author': {'@type': 'Person', '@id': PERSON_ID, 'name': '朱振方', 'url': SITE_URL + '/about/'},
             'isPartOf': {'@id': SITE_URL + '/#website'},
             'citation': reference,
             'isBasedOn': {'@id': reference['url']} if reference.get('url') else reference},
            {'@type': 'BreadcrumbList', 'itemListElement': [
                {'@type': 'ListItem', 'position': 1, 'name': '朱振方', 'item': SITE_URL + '/'},
                {'@type': 'ListItem', 'position': 2, 'name': '回声', 'item': ECHOES_URL},
                {'@type': 'ListItem', 'position': 3, 'name': entry['title'], 'item': url},
            ]},
        ],
    }) + '\n'
    nav = bilingual('← 返回回声', '← Back to Echoes')
    title_en = escape((entry.get('en') or {}).get('title', entry['title']) + ' | Echoes', quote=True)
    return head.replace('</head>', metadata + '</head>') + f'''<body data-title-zh="{title}｜回声" data-title-en="{title_en}">
    <header class="site-chrome"><a class="site-return" href="/echoes/#{entry['id']}">{nav}</a></header>
    <a class="skip-link" href="#echoes-content">{bilingual('跳到正文', 'Skip to content')}</a>
    <main class="echoes-page" id="echoes-content">
        {render(entry, standalone=True)}
        <nav class="echo-reading-actions" aria-label="Echoes"><a href="/echoes/">{bilingual('← 全部回声', '← All notes')}</a></nav>
    </main>
</body>
</html>
'''


def build(check=False):
    entries = [json.loads(p.read_text()) for p in sorted((ROOT / 'echoes/content').glob('*.json'))]
    ids = [entry['id'] for entry in entries]
    assert len(ids) == len(set(ids)), 'Duplicate ids'
    entries.sort(key=lambda entry: entry['date'], reverse=True)
    template = (ROOT / 'echoes/template.html').read_text()
    result = template.replace('{{ENTRIES}}', '\n'.join(render(entry) for entry in entries)).replace('{{STRUCTURED_DATA}}', collection_data(entries))
    output = ROOT / 'echoes/index.html'
    from build_echo_covers import cover
    outputs = {output: result.encode()}
    for entry in entries:
        if entry['status'] != 'published':
            continue
        assert entry.get('summary'), 'Published notes need a summary'
        outputs[ROOT / 'echoes' / entry['id'] / 'index.html'] = share_page(entry, template).encode()
        outputs[ROOT / 'static/assets/echoes' / (entry['id'] + '.png')] = cover(entry)
    sitemap = ROOT / 'sitemap.xml'
    xml = sitemap.read_text()
    for entry in entries:
        if entry['status'] != 'published':
            continue
        url = 'https://zhuzhenfang.com/echoes/' + entry['id'] + '/'
        if '<loc>' + url + '</loc>' not in xml:
            xml = xml.replace('</urlset>', f'  <url>\n    <loc>{url}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>\n</urlset>')
    outputs[sitemap] = xml.encode()
    for path, data in outputs.items():
        if check:
            assert path.exists() and path.read_bytes() == data, f'Outdated: {path}'
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
    print(f'Validated directory, {len(entries)} notes and article pages/covers; output is current.' if check else f'Built directory, {len(entries)} notes and article pages/covers.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    build(parser.parse_args().check)
