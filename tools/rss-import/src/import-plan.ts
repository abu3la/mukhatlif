import { stableStringify } from '../../wordpress-import/src/hash.ts';

export interface ImportMergeResult<Row> {
  row: Row;
  changedFields: string[];
  preservedFields: string[];
}

function sameValue(left: unknown, right: unknown): boolean {
  return stableStringify(left ?? null) === stableStringify(right ?? null);
}

/**
 * A feed value may replace a field only if the current value still equals the
 * previous imported value. A divergence is an intentional Studio edit. During
 * first adoption, populated existing fields are preserved and blank ones filled.
 */
export function mergeImportedRow<Row extends Record<string, unknown>>(
  current: Row | null,
  incoming: Row,
  previousImportedValues: Record<string, unknown> | null,
  protectedFields: ReadonlySet<string>,
): ImportMergeResult<Row> {
  if (!current) {
    return {
      row: incoming,
      changedFields: Object.keys(incoming),
      preservedFields: [],
    };
  }
  const row = { ...current };
  const changedFields: string[] = [];
  const preservedFields: string[] = [];
  for (const [field, nextValue] of Object.entries(incoming)) {
    if (field === 'id' || protectedFields.has(field) || sameValue(current[field], nextValue)) {
      continue;
    }
    const hasBaseline =
      previousImportedValues !== null &&
      Object.prototype.hasOwnProperty.call(previousImportedValues, field);
    const safeToUpdate = hasBaseline
      ? sameValue(current[field], previousImportedValues[field])
      : current[field] === null || current[field] === undefined || current[field] === '';
    if (safeToUpdate) {
      row[field as keyof Row] = nextValue as Row[keyof Row];
      changedFields.push(field);
    } else {
      preservedFields.push(field);
    }
  }
  return { row, changedFields, preservedFields };
}
