"""Tiny hostile renderer data fixtures; never install or execute the tar's scripts."""
import copy
import hashlib
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from .fixtures import Fixture, encoded, sha, sri
from .inspection import inspect_package
from .receipt import DataRefused
from .renderer import stage_renderer


class RendererTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='lens-renderer-fixture-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        fixture = Fixture()
        manifest = fixture.members[0][1]
        self.tgz = fixture.tar_bytes()
        self.filename = 'footprint-explainable-ui-1.1.1.tgz'
        inspected = inspect_package(self.tgz, 'footprint-explainable-ui', '1.1.1')
        self.expected = {'outerSha256': '',
                         'source': {'head': '1'*40, 'tree': '2'*40,
                                    'manifestSha256': sha(manifest)},
                         'tested': {'head': '3'*40, 'tree': '2'*40},
                         'archive': {'filename': self.filename,
                                     'package': 'footprint-explainable-ui', 'version': '1.1.1',
                                     'bytes': len(self.tgz), 'sha256': sha(self.tgz),
                                     'shasum': hashlib.sha1(self.tgz).hexdigest(),
                                     'integrity': sri(self.tgz), 'memberCount': 2,
                                     'memberBytes': inspected['memberBytes']}}
        pack = {**self.expected['archive'], 'name': 'footprint-explainable-ui',
                'size': len(self.tgz)}
        normal = {'testedCommit': '3'*40, 'testedTree': '2'*40,
                  'sha256': sha(self.tgz), 'integrity': sri(self.tgz),
                  'memberSha256': inspected['files']}
        proof = {'gates': {'normalTarball': normal},
                 'sourceDigests': {'package.json': sha(manifest)}}
        self.files = {self.filename: self.tgz, 'package-lock.json': b'{"generated":true}',
                      'packed-review.json': encoded([pack]),
                      'record-consumer-verification.json': encoded(proof), 'report.json': b'{}'}
        for role in ['full', 'production']:
            for suffix in ['audit.json', 'status.json', 'stdout.txt', 'stderr.txt']:
                self.files[f'{role}.{suffix}'] = b'' if suffix == 'stderr.txt' else b'{}'

    def write(self, files=None):
        path = self.root/'input.zip'
        with zipfile.ZipFile(path, 'w', compression=zipfile.ZIP_DEFLATED) as z:
            for name, content in (files or self.files).items():
                z.writestr(name, content)
        self.expected['outerSha256'] = sha(path.read_bytes())
        return path

    def test_exact_thirteen_member_shape_retains_original_tar_without_execution(self):
        output = self.root/'original.tgz'
        got = stage_renderer(self.write(), self.expected, output)
        self.assertEqual(output.read_bytes(), self.tgz)
        self.assertEqual(got['memberCount'], 2)
        self.assertFalse((self.root/'PACKAGE-EXECUTED').exists())

    def test_af_source_lock_or_unknown_outer_file_refuses(self):
        for name in ['source-package-lock.json', 'candidate.json', '../outside']:
            files = {**self.files, name: b'{}'}
            with self.subTest(name=name), self.assertRaisesRegex(DataRefused, 'zip-inventory'):
                stage_renderer(self.write(files), self.expected, self.root/'out.tgz')

    def test_wrong_source_tree_manifest_version_or_tar_identity_refuses(self):
        path = self.write()
        for field, key, value in [('source', 'tree', '4'*40),
                                  ('source', 'manifestSha256', '0'*64),
                                  ('archive', 'version', '1.1.2'),
                                  ('archive', 'integrity', 'sha512-wrong'),
                                  ('archive', 'sha256', '0'*64),
                                  ('archive', 'memberBytes', 1)]:
            expected = copy.deepcopy(self.expected)
            expected[field][key] = value
            with self.subTest(key=key), self.assertRaises(DataRefused):
                stage_renderer(path, expected, self.root/'out.tgz')

    def test_forged_packed_proof_cannot_override_original_members(self):
        for edit in ['members', 'tree', 'pack-version', 'proof-shape', 'pack-shape']:
            files = dict(self.files)
            if edit.startswith('pack-'):
                value = json.loads(files['packed-review.json'])
                if edit == 'pack-shape': value = [None]
                else: value[0]['version'] = '1.1.2'
                files['packed-review.json'] = encoded(value)
            else:
                value = json.loads(files['record-consumer-verification.json'])
                if edit == 'proof-shape': value = []
                elif edit == 'members': value['gates']['normalTarball']['memberSha256'] = {}
                else: value['gates']['normalTarball']['testedTree'] = '0'*40
                files['record-consumer-verification.json'] = encoded(value)
            with self.subTest(edit=edit), self.assertRaises(DataRefused):
                stage_renderer(self.write(files), self.expected, self.root/'out.tgz')
