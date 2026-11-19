"""Read the renderer's real dependency-security ZIP, never an AF source protocol."""
import hashlib
from .inspection import inspect_package
from .receipt import digest, integrity, parse_json, require, shape
from .zip_data import MAX_ZIP, read_regular, read_zip

MAX_JSON = 2 * 1024 * 1024


def stage_renderer(path, expected, destination):
    shape(expected, {'outerSha256', 'source', 'tested', 'archive'}, 'renderer-profile')
    identity = expected['archive']
    shape(identity, {'filename', 'package', 'version', 'bytes', 'sha256', 'shasum',
                     'integrity', 'memberCount', 'memberBytes'}, 'renderer-profile')
    shape(expected['source'], {'head', 'tree', 'manifestSha256'}, 'renderer-profile')
    shape(expected['tested'], {'head', 'tree'}, 'renderer-profile')
    require(identity.get('package') == 'footprint-explainable-ui', 'renderer-package')
    require(identity.get('filename') == f"footprint-explainable-ui-{identity.get('version')}.tgz",
            'renderer-filename')
    # Exact closed artifact shape. There is no source lock in this producer tree;
    # package-lock.json is generated audit/install evidence, not source identity.
    limits = {identity['filename']: 8 * 1024 * 1024,
              'package-lock.json': MAX_JSON, 'packed-review.json': MAX_JSON,
              'record-consumer-verification.json': MAX_JSON, 'report.json': MAX_JSON}
    for role in ['full', 'production']:
        limits.update({f'{role}.{suffix}': MAX_JSON
                       for suffix in ['audit.json', 'status.json', 'stdout.txt', 'stderr.txt']})
    files = read_zip(read_regular(path, MAX_ZIP), expected['outerSha256'], limits,
                     ('full.stderr.txt', 'production.stderr.txt'))
    raw = files[identity['filename']]
    require(len(raw) == identity['bytes'], 'renderer-length')
    require(digest(raw) == identity['sha256'], 'renderer-digest')
    require(integrity(raw) == identity['integrity'], 'renderer-integrity')
    require(hashlib.sha1(raw).hexdigest() == identity['shasum'], 'renderer-sha1')
    inspected = inspect_package(raw, identity['package'], identity['version'])
    require(inspected['memberCount'] == identity['memberCount'] and
            inspected['memberBytes'] == identity['memberBytes'], 'renderer-members')
    require(inspected['files']['package.json'] == expected['source']['manifestSha256'],
            'renderer-source-manifest')
    packed = parse_json(files['packed-review.json'])
    require(type(packed) is list and len(packed) == 1, 'renderer-pack-receipt')
    require(type(packed[0]) is dict, 'renderer-pack-receipt')
    for field in ['filename', 'version', 'shasum', 'integrity']:
        require(packed[0].get(field) == identity[field], 'renderer-pack-identity')
    require(packed[0].get('name') == identity['package'] and
            packed[0].get('size') == len(raw), 'renderer-pack-identity')
    proof = parse_json(files['record-consumer-verification.json'])
    require(type(proof) is dict and type(proof.get('gates')) is dict,
            'renderer-proof')
    normal = proof['gates'].get('normalTarball')
    require(type(normal) is dict and type(proof.get('sourceDigests')) is dict,
            'renderer-proof')
    require(normal.get('testedCommit') == expected['tested']['head'] and
            normal.get('testedTree') == expected['source']['tree'] == expected['tested']['tree'],
            'renderer-tested-source')
    require(normal.get('sha256') == identity['sha256'] and
            normal.get('integrity') == identity['integrity'], 'renderer-tested-archive')
    require(proof.get('sourceDigests', {}).get('package.json') ==
            expected['source']['manifestSha256'], 'renderer-source-manifest')
    require(normal.get('memberSha256') == inspected['files'], 'renderer-tested-members')
    with open(destination, 'xb') as output:
        output.write(raw)
    return inspected
