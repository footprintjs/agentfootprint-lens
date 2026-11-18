"""Read and report inert archive bytes through the bounded package entry."""
import json
import sys
from .inspection import inspect_artifact, inspect_package, stage_source
from .renderer import stage_renderer
from .receipt import DataRefused, MAX_ARCHIVE, parse_json, require
from .zip_data import read_regular


def main(args):
    try:
        if len(args) == 4 and args[0] == 'renderer':
            result = stage_renderer(args[1], parse_json(read_regular(args[2], 64 * 1024)), args[3])
        elif len(args) == 4 and args[0] == 'source':
            result = stage_source(args[1], parse_json(read_regular(args[2], 64 * 1024)), args[3])
        elif len(args) == 2:  # Adjacent inert contract fixtures.
            result = inspect_artifact(args[0], parse_json(read_regular(args[1], 64 * 1024)))
        else:
            require(len(args) == 4 and args[0] == 'tar', 'arguments')
            result = inspect_package(read_regular(args[1], MAX_ARCHIVE), args[2], args[3])
        print(json.dumps(result, sort_keys=True))
        return 0
    except DataRefused as error:
        print(json.dumps({'status': 'REFUSED', 'activationAllowed': False,
                          'packageExecutionAllowed': False, 'reason': error.reason}))
        return 2
