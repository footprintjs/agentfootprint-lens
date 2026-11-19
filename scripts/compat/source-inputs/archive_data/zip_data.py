"""Bounded regular-file and ZIP reads with the caller’s closed member inventory."""
import io
import os
import stat
import zipfile
import zlib

from .receipt import DataRefused, digest, require

MAX_ZIP = 64 * 1024 * 1024


def read_regular(path, limit):
    try:
        require(hasattr(os, 'O_NOFOLLOW') and hasattr(os, 'O_NONBLOCK'), 'input-platform')
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK |
                     getattr(os, 'O_CLOEXEC', 0))
        with os.fdopen(fd, 'rb') as handle:
            info = os.fstat(handle.fileno())
            require(stat.S_ISREG(info.st_mode) and 0 < info.st_size <= limit, 'input-size')
            raw = handle.read(limit + 1)
            require(0 < len(raw) <= limit, 'input-size')
            return raw
    except OSError:
        raise DataRefused('input-file') from None


def read_zip(raw, expected_sha256, limits, empty=()):
    require(digest(raw) == expected_sha256, 'outer-digest')
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            infos = archive.infolist()
            require(len(infos) == len(limits), 'zip-inventory')
            require({f.filename for f in infos} == set(limits), 'zip-inventory')
            require(sum(f.file_size for f in infos) <= MAX_ZIP, 'zip-size')
            result = {}
            for member in infos:
                mode = member.external_attr >> 16
                require(not member.is_dir() and not member.external_attr & 0x10
                        and stat.S_IFMT(mode) in {0, stat.S_IFREG},
                        'zip-member-type')
                require(not member.flag_bits & 1 and member.compress_type in
                        {zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED}, 'zip-member-format')
                require((0 if member.filename in empty else 1) <= member.file_size
                        <= limits[member.filename], 'zip-size')
                data = archive.read(member)
                require(len(data) == member.file_size, 'zip-size')
                result[member.filename] = data
            return result
    except DataRefused:
        raise
    except (OSError, zipfile.BadZipFile, RuntimeError, NotImplementedError, UnicodeError,
            ValueError, OverflowError, zlib.error):
        raise DataRefused('zip-data') from None
