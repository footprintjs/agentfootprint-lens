# Bounded inert archive data

`receipt.py`, `zip_data.py` and `tar_data.py` are unchanged copies of the
independently read App DATA component at 19db9dc5. They never extract files or
execute package bytes. The adjacent hostile fixtures remain inert; their only
adaptation points at the Lens-local CLI. `inspection.py` owns the bounded registry
archive census; `__init__.py` exposes the entry. Registry SRI/provenance admission remains
outside this data reader, before any materialization or installation.
