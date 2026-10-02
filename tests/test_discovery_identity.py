"""Factual person identity and explicit attribution in public discovery pages."""

import importlib.util
import json
from pathlib import Path
import re
import unittest

from test_echoes import Page, is_type, normalized


ROOT = Path(__file__).resolve().parents[1]
PERSON_ID = 'https://zhuzhenfang.com/#person'
COMPANY_URL = 'https://redding-ai.com/'
COMPANY_ABOUT = COMPANY_URL + 'about.html'


class DiscoveryIdentityTests(unittest.TestCase):
    def test_profiles_reuse_one_person_and_cite_the_actual_company_profile(self):
        for relative in ['index.html', 'en/index.html', 'zh/index.html', 'about/index.html']:
            with self.subTest(page=relative):
                nodes = Page(ROOT / relative).structured_nodes()
                profile, = [node for node in nodes if is_type(node, 'ProfilePage')]
                person = profile['mainEntity']
                self.assertEqual(person['@id'], PERSON_ID)
                self.assertEqual(person['name'], 'Zhenfang Zhu')
                self.assertIn('朱振方', person['alternateName'])
                self.assertNotIn('朱志邦', person['alternateName'])
                organization = person['affiliation']
                self.assertEqual(organization['@id'], COMPANY_URL + '#organization')
                self.assertEqual(organization['url'], COMPANY_URL)
                self.assertEqual(organization['founder']['@id'], PERSON_ID)
                company_profile, = [node for node in person['subjectOf']
                                    if node.get('url') == COMPANY_ABOUT]
                self.assertEqual(company_profile['@id'], COMPANY_ABOUT)
                self.assertEqual(profile['citation']['@id'], COMPANY_ABOUT)
                self.assertIn('https://github.com/zhenfangzhu', person['sameAs'])

    def test_about_biography_and_evidence_are_readable_without_metadata_or_javascript(self):
        page = Page(ROOT / 'about/index.html')
        paragraphs = [element for element in page.elements('p')
                      if element.has_class('profile-bio')]
        chinese, = [element for element in paragraphs if element.attrs.get('data-lang') == 'zh']
        english, = [element for element in paragraphs if element.attrs.get('data-lang') == 'en']
        for fact in ['朱振方', 'Zhenfang Zhu', 'Redding AI', '联合创始人', '中国科学技术大学', '理学学士']:
            self.assertIn(fact, chinese.text())
        for fact in ['Zhenfang Zhu', '朱振方', 'co-founder', 'Bachelor of Science',
                     'University of Science and Technology of China']:
            self.assertIn(fact, english.text())
        works, = page.elements('section', **{'aria-labelledby': 'works-title'})
        work_links = [element.attrs.get('href') for element in works.walk() if element.tag == 'a']
        self.assertCountEqual(work_links, ['/founder-dna/', '/shicao/', '/board/'])
        sources, = page.elements('section', **{'aria-labelledby': 'public-sources-title'})
        source_links = [element.attrs.get('href') for element in sources.walk() if element.tag == 'a']
        self.assertCountEqual(source_links, [COMPANY_ABOUT, 'https://github.com/zhenfangzhu'])

    def test_tools_credit_the_same_person_as_the_profiles(self):
        for relative in ['founder-dna/index.html', 'shicao/index.html', 'board/index.html']:
            with self.subTest(page=relative):
                applications = [node for node in Page(ROOT / relative).structured_nodes()
                                if is_type(node, 'WebApplication')]
                self.assertEqual(len(applications), 1)
                self.assertEqual(applications[0]['author']['@id'], PERSON_ID)


class EchoesAttributionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location('build_echoes_identity', ROOT / 'scripts/build_echoes.py')
        cls.builder = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.builder)
        cls.entries = [json.loads(path.read_text()) for path in (ROOT / 'echoes/content').glob('*.json')]
        cls.template = (ROOT / 'echoes/template.html').read_text()

    def test_published_notes_distinguish_the_compiler_from_the_original_content(self):
        for entry in self.entries:
            if entry['status'] != 'published':
                continue
            with self.subTest(note=entry['id']):
                page = Page(ROOT / 'echoes' / entry['id'] / 'index.html')
                article, = [node for node in page.structured_nodes() if is_type(node, 'Article')]
                self.assertEqual(article['author']['@id'], PERSON_ID)
                self.assertEqual(article['isPartOf']['@id'], 'https://zhuzhenfang.com/#website')
                author_links = page.elements('a', rel='author')
                self.assertTrue(any(link.attrs.get('href') == '/about/' and '朱振方' in link.text()
                                    for link in author_links))
                self.assertIn('听后笔记', page.root.text())
                self.assertNotIn('datePublished', article, 'A note date is not a verified publication date')
                source_url = re.search(r'https?://[^\s]+', entry['source'])
                source_title = entry['source'][:source_url.start()].strip() if source_url else entry['source'].strip()
                citation = article['citation']
                self.assertNotIn('author', citation, 'Do not infer original creators from titles')
                self.assertNotIn('datePublished', citation, 'Do not infer original publication dates')
                self.assertEqual(citation['name'], source_title or entry.get('source_short') or source_url.group())
                sources, = [element for element in page.elements('aside') if element.has_class('echo-source-detail')]
                self.assertIn(normalized(citation['name']), normalized(sources.text()))
                if source_url:
                    self.assertEqual(citation['url'], source_url.group())
                    self.assertEqual(article['isBasedOn']['@id'], source_url.group())
                    self.assertTrue(any(link.attrs.get('href') == source_url.group()
                                        for link in sources.walk() if link.tag == 'a'))

    def test_directory_has_a_visible_author_link_and_the_same_entity_id(self):
        page = Page(ROOT / 'echoes/index.html')
        collection, = [node for node in page.structured_nodes() if is_type(node, 'CollectionPage')]
        self.assertEqual(collection['author']['@id'], PERSON_ID)
        self.assertTrue(any(link.attrs.get('href') == '/about/' and '朱振方' in link.text()
                            for link in page.elements('a', rel='author')))

    def entry(self, source):
        return {'id': 'source-attribution', 'date': '2026-01-05', 'status': 'published',
                'title': 'Listening note', 'summary': 'A listening note, not the original recording.',
                'type': '视频', 'source': source,
                'sections': [{'items': [{'text': 'An excerpt or takeaway.', 'note': 'My comment.'}]}]}

    def test_source_titles_with_markup_are_rendered_as_text_in_both_contexts(self):
        title = 'Source </script><img src=x onerror=alert(1)> & "quoted title"'
        source_url = 'https://example.com/recording?q=1&part=2'
        page = Page(source=self.builder.share_page(self.entry(title + ' ' + source_url), self.template))
        self.assertFalse(page.elements('img'))
        self.assertFalse(any('onerror' in element.attrs for element in page.root.walk()))
        sources, = [element for element in page.elements('aside') if element.has_class('echo-source-detail')]
        self.assertIn(title, sources.text())
        article, = [node for node in page.structured_nodes() if is_type(node, 'Article')]
        self.assertEqual(article['citation']['name'], title)
        self.assertEqual(article['citation']['url'], source_url)

    def test_named_sources_without_urls_are_preserved_without_inventing_an_external_identity(self):
        title = 'Offline source "title" & <context>'
        page = Page(source=self.builder.share_page(self.entry(title), self.template))
        self.assertIn(title, page.root.text())
        article, = [node for node in page.structured_nodes() if is_type(node, 'Article')]
        self.assertEqual(article['citation']['name'], title)
        self.assertNotIn('url', article['citation'])
        self.assertNotIn('@id', article['citation'])
        self.assertNotIn('author', article['citation'])


if __name__ == '__main__':
    unittest.main()
