import gzip
import os
import stat
import struct
import subprocess
import sys
import tarfile
import tempfile
import unittest
import warnings
import zipfile
from pathlib import Path

from .fixtures import Fixture, sha
from .inspection import inspect_package
from .receipt import DataRefused, parse_json
from .zip_data import MAX_ZIP, read_regular, read_zip


class ArchiveTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='app-native-archive-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.path = self.root / 'input.zip'
        self.tgz = Fixture().tar_bytes()

    def inspect(self, raw):
        return inspect_package(raw, 'footprint-explainable-ui', '1.1.1')

    def write_zip(self, entries):
        with zipfile.ZipFile(self.path, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            for name, raw in entries:
                archive.writestr(name, raw)
        return self.path.read_bytes()

    def test_oversized_gnu_and_pax_extension_reads_are_fixed_refusals(self):
        for kind in [tarfile.GNUTYPE_LONGNAME, tarfile.XHDTYPE]:
            header = tarfile.TarInfo('././@LongLink')
            header.type, header.size = kind, sys.maxsize + 1
            raw = header.tobuf(format=tarfile.GNU_FORMAT) + bytes(1024)
            self.assertLess(len(raw), 2048)
            with self.subTest(kind=kind), self.assertRaisesRegex(DataRefused, 'tar-data'):
                self.inspect(gzip.compress(raw, mtime=0))

    def test_corrupt_zip_deflate_is_a_fixed_refusal(self):
        raw = bytearray(self.write_zip([('report.json', b'{}')]))
        with zipfile.ZipFile(self.path) as archive:
            member = archive.getinfo('report.json')
        name_size, extra_size = struct.unpack_from('<HH', raw, member.header_offset + 26)
        offset = member.header_offset + 30 + name_size + extra_size
        raw[offset] = 0x07
        with self.assertRaisesRegex(DataRefused, 'zip-data'):
            read_zip(raw, sha(raw), {'report.json': 1024})

    def test_zip_traversal_duplicates_and_nonregular_files_are_refused(self):
        normal = [('report.json', b'{}')]
        malformed = [[(name, b'{}')] for name in ['../report.json', '/report.json', 'a\\report.json']]
        malformed.append(normal + normal)
        link = zipfile.ZipInfo('report.json')
        link.create_system = 3
        link.external_attr = (stat.S_IFLNK | 0o777) << 16
        malformed.append([(link, b'../outside')])
        for entries in malformed:
            with warnings.catch_warnings():
                warnings.simplefilter('ignore', UserWarning)
                raw = self.write_zip(entries)
            with self.subTest(entries=str(entries[0][0])), self.assertRaises(DataRefused):
                read_zip(raw, sha(raw), {'report.json': 1024})

    def test_tar_traversal_links_duplicates_and_nonregular_members_are_refused(self):
        for name, content, kind in [('package/../outside', b'x', tarfile.REGTYPE),
                                     ('/outside', b'x', tarfile.REGTYPE),
                                     ('package/a\\b', b'x', tarfile.REGTYPE),
                                     ('package/link', b'', tarfile.SYMTYPE),
                                     ('package/hard', b'', tarfile.LNKTYPE),
                                     ('package/directory', b'', tarfile.DIRTYPE),
                                     ('package/dist/index.cjs', b'extra', tarfile.REGTYPE)]:
            raw = Fixture([(name, content, kind)]).tar_bytes()
            with self.subTest(name=name, kind=kind), self.assertRaises(DataRefused):
                self.inspect(raw)

    def test_gzip_trailing_or_second_member_is_refused(self):
        for suffix in [b'hidden', gzip.compress(b'other', mtime=0)]:
            with self.subTest(suffix=suffix[:6]), self.assertRaisesRegex(DataRefused, 'gzip-data'):
                self.inspect(self.tgz + suffix)

    def test_nonzero_payload_after_tar_end_is_refused(self):
        raw = gzip.compress(gzip.decompress(self.tgz) + b'hidden', mtime=0)
        with self.assertRaisesRegex(DataRefused, 'tar-trailing'):
            self.inspect(raw)

    def test_case_or_file_directory_collisions_are_refused(self):
        for extra in [[('package/DIST/index.cjs', b'other', tarfile.REGTYPE)],
                      [('package/dist', b'other', tarfile.REGTYPE)]]:
            with self.subTest(extra=extra[0][0]), self.assertRaises(DataRefused):
                self.inspect(Fixture(extra).tar_bytes())

    def test_more_than_ten_thousand_members_fit_the_shared_archive_limit(self):
        extra = [(f'package/dist/unit{i}.js', b'', tarfile.REGTYPE) for i in range(9_999)]
        self.assertEqual(self.inspect(Fixture(extra).tar_bytes())['memberCount'], 10_001)

    def test_sparse_oversized_zip_input_is_refused_before_reading(self):
        with self.path.open('wb') as handle:
            handle.truncate(MAX_ZIP + 1)
        with self.assertRaisesRegex(DataRefused, 'input-size'):
            read_regular(self.path, MAX_ZIP)

    def test_input_symlink_and_fifo_are_refused_without_opening_a_writer(self):
        self.path.write_bytes(b'inert')
        link = self.root / 'link.zip'
        link.symlink_to(self.path)
        with self.assertRaises(DataRefused):
            read_regular(link, MAX_ZIP)
        if hasattr(os, 'mkfifo'):
            fifo = self.root / 'fifo.zip'
            os.mkfifo(fifo)
            with self.assertRaises(DataRefused):
                read_regular(fifo, MAX_ZIP)

    def test_strict_json_refuses_duplicate_keys(self):
        with self.assertRaisesRegex(DataRefused, 'json-duplicate-key'):
            parse_json(b'{"protocol":"old","protocol":"new"}')

    def test_cli_refuses_an_unsupported_action(self):
        facade = Path(__file__).resolve().parents[1] / 'archive-data.py'
        result = subprocess.run([sys.executable, '-B', str(facade), '--install'],
                                capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 2)
        refusal = parse_json(result.stdout.encode())
        self.assertEqual(refusal['status'], 'REFUSED')
        self.assertIs(refusal['activationAllowed'], False)
