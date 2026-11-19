"""Inert synthetic inputs for the adjacent tests, independent of production hashing helpers."""
import base64
import copy
import gzip
import hashlib
import io
import json
import tarfile
import zipfile

NAME = 'agentfootprint-15.0.0-rc.0.tgz'


def encoded(value):
    return json.dumps(value, separators=(',', ':')).encode()


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def sri(raw):
    return 'sha512-' + base64.b64encode(hashlib.sha512(raw).digest()).decode()


def census(files):
    return sha(json.dumps(files, ensure_ascii=True, separators=(',', ':')).encode('ascii'))


class Fixture:
    def __init__(self, root, extra=None):
        self.root = root
        self.path = root / 'input.zip'
        self.manifest = encoded({'name': 'agentfootprint', 'version': '15.0.0-rc.0',
                                 'scripts': {'postinstall': 'node dist/index.cjs'},
                                 'peerDependencies': {'footprintjs': '^13.0.0'},
                                 'dependencies': {'foottrace': '^2.0.0'}})
        self.lock = encoded({'name': 'agentfootprint', 'version': '15.0.0-rc.0',
                             'lockfileVersion': 3, 'packages': {}})
        payload = b"require('node:fs').writeFileSync('PACKAGE-EXECUTED', 'bad');\n"
        self.members = [('package/package.json', self.manifest, tarfile.REGTYPE),
                        ('package/dist/index.cjs', payload, tarfile.REGTYPE)] + (extra or [])
        self.record = {'protocol': 'agentfootprint.source-candidate.v1',
                       'source': {'head': '1' * 40, 'tree': '2' * 40,
                                  'manifestSha256': sha(self.manifest), 'lockSha256': sha(self.lock)},
                       'tested': {'head': '3' * 40, 'tree': '2' * 40}, 'archive': {}}
        self.replace_tar(self.tar_bytes())

    def tar_bytes(self):
        output = io.BytesIO()
        with tarfile.open(fileobj=output, mode='w', format=tarfile.USTAR_FORMAT) as archive:
            for name, content, kind in self.members:
                member = tarfile.TarInfo(name)
                member.type, member.mode, member.mtime = kind, 0o644, 0
                member.size = len(content) if kind == tarfile.REGTYPE else 0
                if kind in {tarfile.SYMTYPE, tarfile.LNKTYPE}:
                    member.linkname = '../../outside'
                archive.addfile(member, io.BytesIO(content) if member.size else None)
        return gzip.compress(output.getvalue(), mtime=0)

    def replace_tar(self, raw):
        self.tgz = raw
        files = [{'path': name, 'size': len(content) if kind == tarfile.REGTYPE else 0,
                  'sha256': sha(content if kind == tarfile.REGTYPE else b'')}
                 for name, content, kind in self.members]
        self.record['archive'] = {'filename': NAME, 'package': 'agentfootprint',
                                  'version': '15.0.0-rc.0', 'sha256': sha(raw),
                                  'shasum': hashlib.sha1(raw).hexdigest(), 'integrity': sri(raw),
                                  'bytes': len(raw), 'files': files}

    def expected(self):
        archive = self.record['archive']
        return {'outerSha256': sha(self.path.read_bytes()), 'source': copy.deepcopy(self.record['source']),
                'archive': {key: archive[key] for key in
                            ['filename', 'package', 'version', 'sha256', 'integrity']} |
                           {'memberCount': len(archive['files']),
                            'memberCensusSha256': census(archive['files'])}}

    def write(self, entries=None, receipt=None):
        files = [(NAME, self.tgz), ('candidate.json', receipt or encoded(self.record)),
                 ('source-package.json', self.manifest), ('source-package-lock.json', self.lock)]
        with zipfile.ZipFile(self.path, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            for name, raw in files if entries is None else entries:
                archive.writestr(name, raw)
        return self.expected()
