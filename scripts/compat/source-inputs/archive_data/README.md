# Bounded renderer archive data

The original format comes from the independently reviewed App data reader
at `19db9dc5`. It reads archive bytes without extracting members or running
package scripts. `renderer.py` owns the reviewed thirteen-member UI
dependency-security ZIP. It checks the original source manifest, packed
metadata and member hashes. Its generated audit lock remains evidence.

The renderer and standalone package census share the regular-file, type,
expansion, path, duplicate and single-gzip guards. Adjacent fixtures exercise
these guards directly and through the renderer. The archive provider's run,
tested commit and source identity are checked before reading its artifact.
