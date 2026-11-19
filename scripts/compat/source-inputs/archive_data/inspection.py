"""Bounded archive data entry; no package execution or file extraction."""
import io
import tarfile
from .receipt import DataRefused, FILENAME, MAX_FILES, digest, integrity, parse_json, require
from .receipt import validate_expected, validate_receipt, census_digest
from .tar_data import _expand, _path, validate_tar
from .zip_data import MAX_ZIP, read_regular, read_zip


def inspect_artifact(path, expected):
    expected = validate_expected(expected)
    files = read_zip(read_regular(path, MAX_ZIP), expected['outerSha256'])
    record = validate_receipt(parse_json(files['candidate.json']), expected, files)
    census = validate_tar(files[FILENAME], record['archive']['files'], files['source-package.json'])
    archive = {key: value for key, value in record['archive'].items() if key != 'files'}
    archive.update(census)
    archive['memberCensusSha256'] = census_digest(record['archive']['files'])
    return {'status': 'DATA_ONLY', 'activationAllowed': False, 'packageExecutionAllowed': False,
            'outerSha256': expected['outerSha256'], 'source': dict(record['source']),
            'tested': dict(record['tested']), 'archive': archive}


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


def stage_source(path, expected, destination):
    """Retain the original compressed archive, never extract package members."""
    expected = validate_expected(expected)
    files = read_zip(read_regular(path, MAX_ZIP), expected['outerSha256'])
    record = validate_receipt(parse_json(files['candidate.json']), expected, files)
    validate_tar(files[FILENAME], record['archive']['files'], files['source-package.json'])
    report = inspect_package(files[FILENAME], 'agentfootprint', expected['archive']['version'])
    with open(destination, 'xb') as output:
        output.write(files[FILENAME])
    return {'candidate': record, 'archive': report}
