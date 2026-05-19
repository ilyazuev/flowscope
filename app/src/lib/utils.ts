import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { byteOffsetToCharOffset } from '@pondpilot/flowscope-core';
import type { Dialect, SqlParameters } from '@/lib/project-store.tsx';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Convert a UTF-8 byte offset into a line:column position within a string.
 * Lines are 1-indexed, columns are 1-indexed.
 *
 * Handles UTF-8 to UTF-16 conversion internally since JavaScript strings
 * use UTF-16 encoding while FlowScope spans use UTF-8 byte offsets.
 *
 * @param content - The string content
 * @param byteOffset - UTF-8 byte offset from the start of the string
 * @returns Line and column (both 1-indexed), or { line: 1, column: 1 } if conversion fails
 */
export function byteOffsetToLineColumn(
  content: string,
  byteOffset: number
): { line: number; column: number } {
  // Handle edge cases - empty content or negative offset
  if (!content || byteOffset < 0) {
    return { line: 1, column: 1 };
  }

  // Convert UTF-8 byte offset to JavaScript character index (UTF-16 code units)
  let charOffset: number;
  try {
    charOffset = byteOffsetToCharOffset(content, byteOffset);
    // Clamp to content length in case the offset exceeds the string
    charOffset = Math.min(charOffset, content.length);
  } catch (error) {
    // If conversion fails (e.g., offset exceeds string length or doesn't land on boundary),
    // clamp to string length to provide best-effort result
    if (import.meta.env.DEV) {
      console.warn('[byteOffsetToLineColumn] Conversion failed, clamping to end:', error);
    }
    charOffset = content.length;
  }

  const textUpToOffset = content.slice(0, charOffset);
  const lines = textUpToOffset.split('\n');
  return {
    line: lines.length,
    column: (lines[lines.length - 1]?.length ?? 0) + 1,
  };
}

// noinspection JSUnusedGlobalSymbols
export function stripSqlComments(sql: string): string {
  let result = '';
  let i = 0;
  const len = sql.length;

  let state: 'code' | 'line' | 'block' | 'string' = 'code';
  let blockDepth = 0;

  while (i < len) {
    const char = sql[i];
    const next = sql[i + 1];

    if (state === 'code') {
      if (char === '-' && next === '-') {
        state = 'line';
        i += 2;
        continue;
      }

      if (char === '/' && next === '*') {
        state = 'block';
        blockDepth = 1;
        i += 2;
        continue;
      }

      if (char === "'") {
        state = 'string';
        result += char;
        i++;
        continue;
      }

      result += char;
      i++;
      continue;
    }

    if (state === 'line') {
      if (char === '\n') {
        state = 'code';
        result += char;
      }
      i++;
      continue;
    }

    if (state === 'block') {
      if (char === '/' && next === '*') {
        blockDepth++;
        i += 2;
        continue;
      }

      if (char === '*' && next === '/') {
        blockDepth--;
        i += 2;

        if (blockDepth === 0) {
          state = 'code';
        }
        continue;
      }

      i++;
      continue;
    }

    if (state === 'string') {
      result += char;

      // SQL escaped quote: ''
      if (char === "'" && next === "'") {
        result += next;
        i += 2;
        continue;
      }

      if (char === "'") {
        state = 'code';
      }

      i++;
    }
  }

  return result;
}

function isMysqlDialect(dialect?: Dialect): boolean {
  return (dialect ?? '').toLowerCase() === 'mysql';
}

export function extractSqlParams(sql: string, dialect?: Dialect): Set<string> {
  const params = new Set<string>();

  let i = 0;
  const len = sql.length;

  let state: 'code' | 'line' | 'block' | 'single' | 'double' | 'backtick' | 'bracket' | 'dollar' = 'code';
  let blockDepth = 0;
  let dollarTag = '';

  const mysql = isMysqlDialect(dialect);

  const isIdentPart = (c?: string) => !!c && /[A-Za-z0-9_]/.test(c);

  const readIdent = (start: number): { value: string; end: number } | null => {
    if (!isIdentPart(sql[start])) return null;

    let end = start + 1;
    while (end < len && isIdentPart(sql[end])) end++;

    return { value: sql.slice(start, end), end };
  };

  const readDottedIdent = (start: number): { value: string; end: number } | null => {
    const first = readIdent(start);
    if (!first) return null;

    let value = first.value;
    let end = first.end;

    while (sql[end] === '.') {
      const next = readIdent(end + 1);
      if (!next) break;

      value += `.${next.value}`;
      end = next.end;
    }

    return { value, end };
  };

  const readDollarTag = (start: number): string | null => {
    if (sql[start] !== '$') return null;

    let end = start + 1;
    while (end < len && /[A-Za-z0-9_]/.test(sql[end])) end++;

    if (sql[end] !== '$') return null;

    return sql.slice(start, end + 1);
  };

  while (i < len) {
    const char = sql[i];
    const next = sql[i + 1];

    if (state === 'code') {
      if (char === '-' && next === '-') {
        state = 'line';
        i += 2;
        continue;
      }

      if (mysql && char === '#') {
        state = 'line';
        i++;
        continue;
      }

      if (char === '/' && next === '*') {
        state = 'block';
        blockDepth = 1;
        i += 2;
        continue;
      }

      if (char === "'") {
        state = 'single';
        i++;
        continue;
      }

      if (char === '"') {
        state = 'double';
        i++;
        continue;
      }

      if (char === '`') {
        state = 'backtick';
        i++;
        continue;
      }

      if (char === '[') {
        state = 'bracket';
        i++;
        continue;
      }

      if (char === '$') {
        const tag = readDollarTag(i);
        if (tag) {
          state = 'dollar';
          dollarTag = tag;
          i += tag.length;
          continue;
        }
      }

      // :PARAM_1 and :PARAM_1:
      // Avoid PostgreSQL casts/operators: ::, :=, and the second ':' in '::'.
      if (char === ':' && next !== ':' && next !== '=' && sql[i - 1] !== ':') {
        const ident = readIdent(i + 1);

        if (ident) {
          const baseKey = `:${ident.value}`;
          const hasTrailingColon = sql[ident.end] === ':' && sql[ident.end + 1] !== ':';
          const key = hasTrailingColon ? `${baseKey}:` : baseKey;

          params.add(key);
          i = ident.end + (hasTrailingColon ? 1 : 0);
          continue;
        }
      }

      // &PARAM_1 and &&PARAM_1
      if (char === '&') {
        const prefix = next === '&' ? '&&' : '&';
        const ident = readIdent(i + prefix.length);

        if (ident) {
          params.add(`${prefix}${ident.value}`);
          i = ident.end;
          continue;
        }
      }

      // #PARAM_1# and #GROUP_1.PARAM_1# are intentionally disabled for MySQL,
      // because '#' is a MySQL line-comment introducer.
      if (!mysql && char === '#') {
        const ident = readDottedIdent(i + 1);

        if (ident && sql[ident.end] === '#') {
          params.add(`#${ident.value}#`);
          i = ident.end + 1;
          continue;
        }
      }

      i++;
      continue;
    }

    if (state === 'line') {
      if (char === '\n') {
        state = 'code';
      }
      i++;
      continue;
    }

    if (state === 'block') {
      if (char === '/' && next === '*') {
        blockDepth++;
        i += 2;
        continue;
      }

      if (char === '*' && next === '/') {
        blockDepth--;
        i += 2;
        if (blockDepth === 0) {
          state = 'code';
        }
        continue;
      }

      i++;
      continue;
    }

    if (state === 'single') {
      if (char === "'" && next === "'") {
        i += 2;
        continue;
      }

      if (char === "'") {
        state = 'code';
      }

      i++;
      continue;
    }

    if (state === 'double') {
      if (char === '"' && next === '"') {
        i += 2;
        continue;
      }

      if (char === '"') {
        state = 'code';
      }

      i++;
      continue;
    }

    if (state === 'backtick') {
      if (char === '`' && next === '`') {
        i += 2;
        continue;
      }

      if (char === '`') {
        state = 'code';
      }

      i++;
      continue;
    }

    if (state === 'bracket') {
      if (char === ']' && next === ']') {
        i += 2;
        continue;
      }

      if (char === ']') {
        state = 'code';
      }

      i++;
      continue;
    }

    if (state === 'dollar') {
      if (dollarTag && sql.startsWith(dollarTag, i)) {
        i += dollarTag.length;
        dollarTag = '';
        state = 'code';
        continue;
      }

      i++;
    }
  }

  return params;
}

export function extractKnownSqlParamsInSqlOrder(
  sql: string,
  cachedValues?: SqlParameters,
  dialect?: Dialect
): SqlParameters {
  const result = {} as SqlParameters;
  for (const key of extractSqlParams(sql, dialect)) {
    result[key] = cachedValues?.[key] ?? '';
  }
  return result;
}
