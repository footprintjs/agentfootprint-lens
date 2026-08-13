/** @vitest-environment jsdom */
/**
 * <ArtifactRowsTable> (built-in for 'dataset/rows') and <ArtifactMetaCard>
 * (the honest fallback) — bounded, stated, never blank.
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ArtifactMetaView } from '../../core/artifacts/types.js';
import { ArtifactMetaCard } from './ArtifactMetaCard.js';
import { ArtifactRowsTable } from './ArtifactRowsTable.js';

const META: ArtifactMetaView = {
  ref: 'art_rows1',
  kind: 'dataset/rows',
  mediaType: 'application/json',
  bytes: 2048,
  label: 'Q3 rows',
};

describe('<ArtifactRowsTable>', () => {
  it('renders rows with the union of columns, honest cells for nested values', () => {
    const data = [
      { region: 'west', total: 130 },
      { region: 'east', total: 90, note: { flagged: true } },
    ];
    render(<ArtifactRowsTable meta={META} data={data} />);
    const table = screen.getByTestId('artifact-rows-table');
    expect(table.querySelectorAll('th')).toHaveLength(3); // region, total, note
    expect(table.textContent).toContain('west');
    expect(table.textContent).toContain('{"flagged":true}');
  });

  it('caps huge datasets and STATES the remainder', () => {
    const data = Array.from({ length: 1000 }, (_, i) => ({ i }));
    render(<ArtifactRowsTable meta={META} data={data} />);
    expect(screen.getByTestId('artifact-rows-table').querySelectorAll('tbody tr')).toHaveLength(200);
    expect(screen.getByTestId('artifact-rows-capped').textContent).toContain(
      'first 200 of 1,000 rows',
    );
  });

  it('states an empty dataset instead of rendering nothing', () => {
    render(<ArtifactRowsTable meta={META} data={[]} />);
    expect(screen.getByTestId('artifact-rows-empty').textContent).toMatch(/zero rows/);
  });

  it('says so when the payload is not an array of rows, and falls back to the card', () => {
    render(<ArtifactRowsTable meta={META} data={{ oops: 'not rows' }} />);
    const stated = screen.getByTestId('artifact-rows-not-rows');
    expect(stated.textContent).toContain('not an array of rows');
    expect(screen.getByTestId('artifact-meta-card')).toBeTruthy();
  });
});

describe('<ArtifactMetaCard> — the honest fallback', () => {
  it('renders the claim ticket: label, ref, kind, media type, size — plus payload affordances', () => {
    render(<ArtifactMetaCard meta={META} data={[{ q: 'Q3' }]} />);
    const card = screen.getByTestId('artifact-meta-card');
    expect(card.textContent).toContain('Q3 rows');
    expect(card.textContent).toContain('art_rows1');
    expect(card.textContent).toContain('dataset/rows');
    expect(card.textContent).toContain('application/json');
    expect(card.textContent).toContain('2.0 KB');
    expect(screen.getByTestId('artifact-card-preview').textContent).toContain('"q": "Q3"');
    expect(screen.getByTestId('artifact-card-copy')).toBeTruthy();
    expect(screen.getByTestId('artifact-card-download').textContent).toContain('Q3_rows.json');
  });

  it('states metadata-only when the payload was not fetched', () => {
    render(<ArtifactMetaCard meta={META} data={undefined} />);
    expect(screen.getByTestId('artifact-card-no-payload').textContent).toContain(
      'the payload was not fetched',
    );
    expect(screen.queryByTestId('artifact-card-copy')).toBeNull();
  });

  it('states a preview cut on oversized payloads — the download carries the whole', () => {
    const big = { text: 'x'.repeat(25_000) };
    render(<ArtifactMetaCard meta={META} data={big} />);
    expect(screen.getByTestId('artifact-card-truncated').textContent).toContain('Preview cut');
  });
});
