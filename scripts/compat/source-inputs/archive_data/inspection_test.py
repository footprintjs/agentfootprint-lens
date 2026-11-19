import copy
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from . import DataRefused, inspect_artifact
from .fixtures import Fixture, encoded


class InspectionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='app-native-data-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.fixture = Fixture(self.root)
        self.expected = self.fixture.write()

    def test_observes_data_without_writing_or_running_the_package(self):
        before = sorted(self.root.rglob('*'))
        expected_before = copy.deepcopy(self.expected)
        result = inspect_artifact(self.fixture.path, self.expected)
        self.assertEqual(result['status'], 'DATA_ONLY')
        self.assertIs(result['activationAllowed'], False)
        self.assertIs(result['packageExecutionAllowed'], False)
        self.assertEqual(result['archive']['memberCount'], 2)
        self.assertNotEqual(result['source']['head'], result['tested']['head'])
        self.assertEqual(result['source']['tree'], result['tested']['tree'])
        self.assertNotIn('files', result['archive'])
        self.assertEqual(self.expected, expected_before)
        self.assertEqual(sorted(self.root.rglob('*')), before)
        self.assertFalse((self.root / 'PACKAGE-EXECUTED').exists())
        self.assertFalse((self.root / 'node_modules').exists())

    def test_outer_digest_mismatch(self):
        self.expected['outerSha256'] = '0' * 64
        with self.assertRaisesRegex(DataRefused, 'outer-digest'):
            inspect_artifact(self.fixture.path, self.expected)

    def test_required_expectations_are_closed_and_full_length(self):
        cases = []
        for path, value in [(('source', 'head'), '1' * 7),
                            (('source', 'tree'), '2' * 39),
                            (('archive', 'package'), 'other'),
                            (('archive', 'version'), '14.9.2'),
                            (('archive', 'integrity'), 'sha512-nope'),
                            (('archive', 'memberCount'), True),
                            (('archive', 'memberCount'), 20_001)]:
            item = copy.deepcopy(self.expected)
            item[path[0]][path[1]] = value
            cases.append(item)
        extra = copy.deepcopy(self.expected)
        extra['install'] = True
        cases.append(extra)
        for item in cases:
            with self.subTest(item=item), self.assertRaises(DataRefused):
                inspect_artifact(self.fixture.path, item)

    def test_receipt_source_and_tested_tree_cannot_disagree_with_pins(self):
        for section, key in [('source', 'head'), ('source', 'tree'), ('tested', 'tree')]:
            before = copy.deepcopy(self.fixture.record)
            self.fixture.record[section][key] = '4' * 40
            expected = self.fixture.write()
            expected['source'] = copy.deepcopy(self.expected['source'])
            with self.subTest(section=section, key=key), self.assertRaises(DataRefused):
                inspect_artifact(self.fixture.path, expected)
            self.fixture.record = before

    def test_duplicate_json_keys_are_refused_before_identity_comparison(self):
        raw = encoded(self.fixture.record).replace(b'"protocol":', b'"protocol":"old","protocol":', 1)
        expected = self.fixture.write(receipt=raw)
        with self.assertRaisesRegex(DataRefused, 'json-duplicate-key'):
            inspect_artifact(self.fixture.path, expected)

    def test_source_lock_duplicate_keys_and_wrong_raw_hash_are_refused(self):
        self.fixture.lock = b'{"name":"other","name":"agentfootprint","version":"15.0.0-rc.0"}'
        from .fixtures import sha
        self.fixture.record['source']['lockSha256'] = sha(self.fixture.lock)
        expected = self.fixture.write()
        with self.assertRaisesRegex(DataRefused, 'json-duplicate-key'):
            inspect_artifact(self.fixture.path, expected)
        expected['source']['lockSha256'] = '0' * 64
        with self.assertRaises(DataRefused):
            inspect_artifact(self.fixture.path, expected)

    def test_receipt_archive_digest_and_original_identity_are_pinned(self):
        for key, value in [('filename', 'renamed.tgz'), ('package', 'other'),
                           ('version', '15.0.0'), ('sha256', '0' * 64),
                           ('shasum', '0' * 40), ('integrity', 'sha512-wrong'), ('bytes', 1)]:
            before = copy.deepcopy(self.fixture.record)
            self.fixture.record['archive'][key] = value
            expected = self.fixture.write()
            expected['archive'] = copy.deepcopy(self.expected['archive'])
            with self.subTest(key=key), self.assertRaises(DataRefused):
                inspect_artifact(self.fixture.path, expected)
            self.fixture.record = before

    def test_cli_has_only_observation_and_fixed_refusal_results(self):
        expected_path = self.root / 'expected.json'
        expected_path.write_text(json.dumps(self.expected))
        facade = Path(__file__).resolve().parents[1] / 'archive-data.py'
        result = subprocess.run([sys.executable, '-B', str(facade), str(self.fixture.path),
                                 str(expected_path)], capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)['status'], 'DATA_ONLY')
        result = subprocess.run([sys.executable, '-B', str(facade), '--install'],
                                capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 2)
        refusal = json.loads(result.stdout)
        self.assertEqual(refusal['status'], 'REFUSED')
        self.assertIs(refusal['activationAllowed'], False)
        self.assertFalse((self.root / 'PACKAGE-EXECUTED').exists())

    def test_input_symlink_and_fifo_are_refused_without_opening_a_writer(self):
        link = self.root / 'link.zip'
        link.symlink_to(self.fixture.path)
        with self.assertRaises(DataRefused):
            inspect_artifact(link, self.expected)
        if hasattr(os, 'mkfifo'):
            fifo = self.root / 'fifo.zip'
            os.mkfifo(fifo)
            with self.assertRaises(DataRefused):
                inspect_artifact(fifo, self.expected)
