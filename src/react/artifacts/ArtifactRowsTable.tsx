/**
 * <ArtifactRowsTable> — the shipped renderer for `kind: 'dataset/rows'`.
 *
 * A generic table over an array of row objects: columns are the union of the
 * rendered rows' keys, cells print primitives as themselves and nested values
 * as JSON. Big datasets render a bounded slice with the remainder STATED
 * (`Showing the first 200 of 48,210 rows`) — never a silent cut, never a
 * DOM-melting 48,210-row table.
 *
 * A payload that is not an array of rows is said so, and the artifact falls
 * back to the metadata card — the kind promised rows and the payload broke
 * the promise; hiding that would be accepted-and-silently-wrong.
 */

import React from 'react';
import { ensureLensStyles } from '../lensStyles.js';
import { ArtifactMetaCard } from './ArtifactMetaCard.js';
import type { ArtifactComponentProps } from './registry.js';

/** How many rows render. The remainder is stated; download lives on the card. */
const ROW_CAP = 200;

/** One cell, printed honestly: strings as-is, other primitives via String,
 *  nested structures as JSON, absent as empty. */
function cellText(value: unknown): string {
  if (value === undefined) return '';
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '[unserializable]';
    }
  }
  return String(value);
}

export const ArtifactRowsTable: React.FC<ArtifactComponentProps> = (props) => {
  ensureLensStyles();
  const { meta, data } = props;

  if (!Array.isArray(data)) {
    return (
      <div className="lens-artifact__table-wrap" data-testid="artifact-rows-not-rows">
        <p className="lens-artifact__note" role="alert">
          This artifact is kind &lsquo;{meta.kind}&rsquo; but its payload is{' '}
          {data === null ? 'null' : `a ${typeof data}`}, not an array of rows — showing its
          metadata and raw payload instead.
        </p>
        <ArtifactMetaCard {...props} />
      </div>
    );
  }

  const rows = data.slice(0, ROW_CAP);
  const columns: string[] = [];
  let hasBareValues = false;
  for (const row of rows) {
    if (row !== null && typeof row === 'object' && !Array.isArray(row)) {
      for (const key of Object.keys(row as Record<string, unknown>)) {
        if (!columns.includes(key)) columns.push(key);
      }
    } else {
      hasBareValues = true;
    }
  }

  return (
    <div className="lens-artifact__table-wrap" data-testid="artifact-rows-table">
      {data.length === 0 ? (
        <p className="lens-artifact__note" data-testid="artifact-rows-empty">
          The dataset is empty — zero rows, and honestly so.
        </p>
      ) : (
        <table className="lens-artifact__table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
              {hasBareValues && <th>(value)</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const isRecord = row !== null && typeof row === 'object' && !Array.isArray(row);
              return (
                <tr key={index}>
                  {columns.map((column) => (
                    <td key={column}>
                      {isRecord ? cellText((row as Record<string, unknown>)[column]) : ''}
                    </td>
                  ))}
                  {hasBareValues && <td>{isRecord ? '' : cellText(row)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {data.length > ROW_CAP && (
        <p className="lens-artifact__note" data-testid="artifact-rows-capped">
          Showing the first {ROW_CAP.toLocaleString()} of {data.length.toLocaleString()} rows.
        </p>
      )}
    </div>
  );
};
