import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// The paired declaration check uses these two original registry images.
export const narrativeRenderers = Object.freeze({
  '0.38.0': Object.freeze({
    tarball: 'https://registry.npmjs.org/footprint-explainable-ui/-/footprint-explainable-ui-0.38.0.tgz',
    integrity: 'sha512-Lh4FQtfq6mCCoDS2YpKdg0aLI8MENUiFGVwPGwxKf7kJ1Fh2Uiax+nlJyExfBpUnB/uez42C4A4t7TTIgYWFhw==',
    shasum: 'a22126919b980a00d0650683d2748d371940c72c',
    sha256: '18abd83ec0ba0fa77eec58a815d31110c1daba48829f0adc742ee359adac6b76',
    bytes: 1_220_527,
    acceptsNarrative: false,
  }),
  '2.0.0': Object.freeze({
    tarball: 'https://registry.npmjs.org/footprint-explainable-ui/-/footprint-explainable-ui-2.0.0.tgz',
    integrity: 'sha512-8pn4qmvXe3AHiKIcyOUYsEwd/mB1c0k0TJq4/O07kuA95udby0dYqElkN2Gxs1AIyLmZaXHcCwkqW8iGZIUK6A==',
    shasum: 'f02fa7e4ead7423e3695726665cc445a47502a04',
    sha256: '964d9b917cbbf1f4f9d278c63dbe4f105c776cc997638d70206197f2433c3831',
    bytes: 2_655_498,
    acceptsNarrative: true,
  }),
});

export function narrativeRenderer(version) {
  return Object.hasOwn(narrativeRenderers, version) ? narrativeRenderers[version] : undefined;
}

export function assertNarrativeRendererBytes(identity, archive) {
  assert.equal(archive.length, identity.bytes, 'narrative renderer archive size');
  assert.equal(createHash('sha256').update(archive).digest('hex'), identity.sha256, 'narrative renderer archive SHA256');
  assert.equal(createHash('sha1').update(archive).digest('hex'), identity.shasum, 'narrative renderer archive SHA1');
  assert.equal(`sha512-${createHash('sha512').update(archive).digest('base64')}`, identity.integrity,
    'narrative renderer archive SRI');
}

export function assertNarrativeRejection(output, fixture) {
  const diagnostics = output.trimEnd().split('\n').filter(line => !/^\s/.test(line));
  assert.equal(diagnostics.length, 1, `expected only the narrative argument rejection:\n${output}`);
  const [diagnostic] = diagnostics;
  assert.ok(diagnostic.startsWith(`${fixture}(`) &&
    /: error TS2345: Argument of type 'CombinedNarrativeEntry\[\]'/.test(diagnostic) &&
    /Type '"attempt"' is not assignable/.test(output), `expected the official attempt to be rejected:\n${output}`);
}
