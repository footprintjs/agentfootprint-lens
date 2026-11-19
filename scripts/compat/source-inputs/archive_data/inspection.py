"""Bounded archive data entry; no package execution or file extraction."""
import io
import tarfile
from .receipt import DataRefused, MAX_FILES, digest, integrity, parse_json, require
from .tar_data import _expand, _path, validate_tar


def inspect_package(raw, name, version):
    """Census a registry archive, then apply the same complete bounded tar checks."""
    data, members, manifest = _expand(raw), [], None
    try:
        with tarfile.open(fileobj=io.BytesIO(data), mode='r:', errorlevel=2) as archive:
            for member in archive:
                require(len(members) < MAX_FILES, 'tar-member-count')
                _path(member.name)
                require(member.isreg() and member.type in {tarfile.REGTYPE, tarfile.AREGTYPE}
                        and not member.pax_headers and not member.sparse, 'tar-member-type')
                require(0 <= member.size <= len(data), 'tar-size')
                handle = archive.extractfile(member)
                require(handle is not None, 'tar-member')
                with handle:
                    content = handle.read(member.size + 1)
                require(len(content) == member.size, 'tar-member')
                members.append({'path': member.name, 'size': member.size, 'sha256': digest(content)})
                if member.name == 'package/package.json':
                    manifest = content
    except (tarfile.TarError, OSError, EOFError, OverflowError):
        raise DataRefused('tar-data') from None
    require(manifest is not None, 'tar-manifest')
    pkg = parse_json(manifest)
    require(type(pkg) is dict and pkg.get('name') == name and pkg.get('version') == version,
            'package-identity')
    census = validate_tar(raw, members, manifest)
    return {'name': name, 'version': version, 'sha256': digest(raw), 'integrity': integrity(raw),
            'files': {m['path'][8:]: m['sha256'] for m in members}, 'members': members,
            'manifest': pkg, **census}
