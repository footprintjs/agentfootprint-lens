"""Closed expected identities and the AF v1 data receipt; no package actions."""
import base64
import hashlib
import json
import re

MAX_ARCHIVE = 32 * 1024 * 1024
MAX_EXPANDED = 128 * 1024 * 1024
MAX_FILES = 20_000
PACKAGE = 'agentfootprint'
VERSION = '15.0.0-rc.0'
FILENAME = f'{PACKAGE}-{VERSION}.tgz'
PROTOCOL = 'agentfootprint.source-candidate.v1'
SOURCE_KEYS = {'head', 'tree', 'manifestSha256', 'lockSha256'}


class DataRefused(ValueError):
    def __init__(self, reason):
        self.reason = reason
        super().__init__('native-input-refused:' + reason)


def require(condition, reason):
    if not condition:
        raise DataRefused(reason)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def integrity(data):
    return 'sha512-' + base64.b64encode(hashlib.sha512(data).digest()).decode('ascii')


def _pairs(items):
    result = {}
    for key, value in items:
        require(key not in result, 'json-duplicate-key')
        result[key] = value
    return result


def _invalid_number(_value):
    raise DataRefused('json-number')


def parse_json(raw):
    try:
        return json.loads(raw.decode('utf-8', 'strict'), object_pairs_hook=_pairs,
                          parse_constant=_invalid_number)
    except DataRefused:
        raise
    except (UnicodeError, ValueError, RecursionError):
        raise DataRefused('json-data') from None


def shape(value, keys, reason):
    require(type(value) is dict, reason)
    require(all(type(key) is str for key in value), reason)
    require(set(value) == keys, reason)


def _hex(value, length):
    return type(value) is str and re.fullmatch('[a-f0-9]{' + str(length) + '}', value) is not None


def validate_expected(value):
    shape(value, {'outerSha256', 'source', 'archive'}, 'expected-shape')
    source, archive = value['source'], value['archive']
    shape(source, SOURCE_KEYS, 'expected-source')
    shape(archive, {'filename', 'package', 'version', 'sha256', 'integrity',
                    'memberCount', 'memberCensusSha256'}, 'expected-archive')
    require(_hex(value['outerSha256'], 64), 'expected-digest')
    require(all(_hex(source[k], 40 if k in {'head', 'tree'} else 64)
                for k in SOURCE_KEYS), 'expected-source')
    require(archive['package'] == PACKAGE and archive['version'] == VERSION
            and archive['filename'] == FILENAME, 'expected-identity')
    require(_hex(archive['sha256'], 64) and _hex(archive['memberCensusSha256'], 64),
            'expected-digest')
    require(type(archive['memberCount']) is int and 0 < archive['memberCount'] <= MAX_FILES,
            'expected-member-count')
    require(type(archive['integrity']) is str, 'expected-integrity')
    try:
        encoded = archive['integrity'].removeprefix('sha512-')
        decoded = base64.b64decode(encoded, validate=True)
        require(len(decoded) == 64 and archive['integrity'] ==
                'sha512-' + base64.b64encode(decoded).decode('ascii'), 'expected-integrity')
    except (ValueError, UnicodeError):
        raise DataRefused('expected-integrity') from None
    return {'outerSha256': value['outerSha256'], 'source': dict(source), 'archive': dict(archive)}


def census_digest(files):
    canonical = [{'path': f['path'], 'size': f['size'], 'sha256': f['sha256']} for f in files]
    return digest(json.dumps(canonical, ensure_ascii=True, separators=(',', ':')).encode('ascii'))


def _validate_files(files, expected):
    require(type(files) is list and len(files) == expected['memberCount'], 'receipt-files')
    seen = set()
    for member in files:
        shape(member, {'path', 'size', 'sha256'}, 'receipt-member')
        require(type(member['path']) is str and member['path'] not in seen, 'receipt-member')
        seen.add(member['path'])
        require(type(member['size']) is int and 0 <= member['size'] <= MAX_EXPANDED,
                'receipt-member')
        require(_hex(member['sha256'], 64), 'receipt-member')
    require(census_digest(files) == expected['memberCensusSha256'], 'receipt-census')


def _validate_archive(archive, expected, raw):
    shape(archive, {'filename', 'package', 'version', 'sha256', 'shasum', 'integrity',
                    'bytes', 'files'}, 'receipt-archive')
    for key in ['filename', 'package', 'version', 'sha256', 'integrity']:
        require(archive[key] == expected[key], 'receipt-archive-identity')
    require(type(archive['bytes']) is int and archive['bytes'] == len(raw), 'archive-length')
    require(digest(raw) == expected['sha256'], 'archive-digest')
    require(_hex(archive['shasum'], 40) and archive['shasum'] == hashlib.sha1(raw).hexdigest(),
            'archive-sha1')
    require(integrity(raw) == expected['integrity'], 'archive-integrity')
    _validate_files(archive['files'], expected)


def validate_receipt(record, expected, files):
    shape(record, {'protocol', 'source', 'tested', 'archive'}, 'receipt-shape')
    require(record['protocol'] == PROTOCOL, 'receipt-protocol')
    shape(record['source'], SOURCE_KEYS, 'receipt-source')
    require(record['source'] == expected['source'], 'receipt-source')
    shape(record['tested'], {'head', 'tree'}, 'receipt-tested')
    require(_hex(record['tested']['head'], 40) and
            record['tested']['tree'] == expected['source']['tree'], 'receipt-tested')
    manifest_raw, lock_raw = files['source-package.json'], files['source-package-lock.json']
    require(digest(manifest_raw) == expected['source']['manifestSha256'], 'manifest-digest')
    require(digest(lock_raw) == expected['source']['lockSha256'], 'lock-digest')
    manifest, lock = parse_json(manifest_raw), parse_json(lock_raw)
    for value in [manifest, lock]:
        require(type(value) is dict and value.get('name') == PACKAGE and
                value.get('version') == VERSION, 'source-package-identity')
    _validate_archive(record['archive'], expected['archive'], files[FILENAME])
    return record
