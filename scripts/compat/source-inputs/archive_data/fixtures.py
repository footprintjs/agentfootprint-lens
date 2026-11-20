"""Inert synthetic inputs for the adjacent tests, independent of production hashing helpers."""
import base64
import gzip
import hashlib
import io
import json
import tarfile

def encoded(value):
    return json.dumps(value, separators=(',', ':')).encode()


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def sri(raw):
    return 'sha512-' + base64.b64encode(hashlib.sha512(raw).digest()).decode()


class Fixture:
    def __init__(self, extra=None):
        manifest = encoded({'name': 'footprint-explainable-ui', 'version': '1.1.1',
                            'scripts': {'postinstall': 'node dist/index.cjs'}})
        payload = b"require('node:fs').writeFileSync('PACKAGE-EXECUTED', 'bad');\n"
        self.members = [('package/package.json', manifest, tarfile.REGTYPE),
                        ('package/dist/index.cjs', payload, tarfile.REGTYPE)] + (extra or [])

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
