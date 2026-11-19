"""Read bounded gzip/tar member content and compare the complete pinned census."""
import io
import posixpath
import tarfile
import zlib

from .receipt import DataRefused, MAX_ARCHIVE, MAX_EXPANDED, MAX_FILES, digest, require


def _expand(raw):
    require(0 < len(raw) <= MAX_ARCHIVE, 'archive-size')
    try:
        decoder = zlib.decompressobj(31)
        data = decoder.decompress(raw, MAX_EXPANDED + 1)
        require(len(data) <= MAX_EXPANDED and decoder.eof and not decoder.unconsumed_tail
                and not decoder.unused_data, 'gzip-data')
        return data
    except zlib.error:
        raise DataRefused('gzip-data') from None


def _path(name):
    require(type(name) is str and name.startswith('package/'), 'tar-path')
    require('\\' not in name and '\x00' not in name and ':' not in name, 'tar-path')
    require(all(part not in {'', '.', '..'} for part in name.split('/')), 'tar-path')
    require(posixpath.normpath(name) == name, 'tar-path')
    try:
        name.encode('utf-8', 'strict')
    except UnicodeError:
        raise DataRefused('tar-path') from None


def _member(archive, member, expected, cursor):
    _path(member.name)
    require(member.isreg() and member.type in {tarfile.REGTYPE, tarfile.AREGTYPE}
            and not member.pax_headers and not member.sparse, 'tar-member-type')
    require(member.offset == cursor and member.offset_data == cursor + 512, 'tar-extension')
    require(0 <= member.size <= MAX_EXPANDED, 'tar-size')
    handle = archive.extractfile(member)
    require(handle is not None, 'tar-member')
    with handle:
        content = handle.read(member.size + 1)
    actual = {'path': member.name, 'size': len(content), 'sha256': digest(content)}
    require(len(content) == member.size and actual == expected, 'tar-member')
    return content


def validate_tar(raw, members, source_manifest):
    data = _expand(raw)
    expected = {member['path']: member for member in members}
    ordered_paths = [member['path'] for member in members]
    seen, folded = set(), set()
    cursor, total, manifest = 0, 0, None
    try:
        with tarfile.open(fileobj=io.BytesIO(data), mode='r:', errorlevel=2) as archive:
            for member in archive:
                require(len(seen) < MAX_FILES, 'tar-member-count')
                require(len(seen) < len(ordered_paths) and
                        member.name == ordered_paths[len(seen)], 'tar-order')
                require(member.name not in seen and member.name.casefold() not in folded,
                        'tar-duplicate')
                content = _member(archive, member, expected.get(member.name), cursor)
                seen.add(member.name)
                folded.add(member.name.casefold())
                total += member.size
                require(total <= MAX_EXPANDED, 'tar-size')
                end = member.offset_data + member.size
                cursor = member.offset_data + ((member.size + 511) // 512) * 512
                require(not any(data[end:cursor]), 'tar-padding')
                if member.name == 'package/package.json':
                    manifest = content
    except (tarfile.TarError, OSError, EOFError, OverflowError):
        raise DataRefused('tar-data') from None
    require(seen == set(expected), 'tar-inventory')
    require(manifest == source_manifest, 'tar-manifest')
    require(len(data) - cursor >= 1024 and not any(data[cursor:]), 'tar-trailing')
    require(all('/'.join(name.split('/')[:i]) not in seen for name in seen
                for i in range(1, len(name.split('/')))), 'tar-path-collision')
    return {'memberCount': len(seen), 'memberBytes': total, 'expandedTarBytes': len(data)}
