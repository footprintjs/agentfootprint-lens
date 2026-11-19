"""Shared bounds and strict data parsing for the renderer and package readers."""
import base64
import hashlib
import json

MAX_ARCHIVE = 32 * 1024 * 1024
MAX_EXPANDED = 128 * 1024 * 1024
MAX_FILES = 20_000



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
