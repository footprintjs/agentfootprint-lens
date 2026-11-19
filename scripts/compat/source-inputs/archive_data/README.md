# Bounded inert archive data

The AF receipt and tar reader originate from the independently read App DATA
component at19db9dc5. They never extract files or execute package bytes. The ZIP
reader now takes a closed internal profile: the unchanged four-member AF format
or the separately reviewed thirteen-member UI dependency-security format.
`renderer.py` owns that second format, including its two empty stderr files,
original source manifest, actual packed metadata and complete member hashes.
The generated audit/install lock never becomes a source lock. Both paths use
the same regular-file, type, expansion, path, duplicate and single-gzip guards.
Adjacent tiny hostile fixtures exercise both formats without package execution.
`inspection.py` owns the bounded registry archive census; the facade exposes the
entry. Registry/source provenance is checked outside this inert reader before
materialization or installation.
