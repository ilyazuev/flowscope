import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { byteOffsetToCharOffset } from '@pondpilot/flowscope-core';
import type { SqlParameters } from '@/lib/project-store.tsx';

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

export function stripSqlComments(sql: string): string {
  let result = "";
  let i = 0;
  const len = sql.length;

  let state: "code" | "line" | "block" | "string" = "code";
  let blockDepth = 0;

  while (i < len) {
    const char = sql[i];
    const next = sql[i + 1];

    if (state === "code") {
      if (char === "-" && next === "-") {
        state = "line";
        i += 2;
        continue;
      }

      if (char === "/" && next === "*") {
        state = "block";
        blockDepth = 1;
        i += 2;
        continue;
      }

      if (char === "'") {
        state = "string";
        result += char;
        i++;
        continue;
      }

      result += char;
      i++;
      continue;
    }

    if (state === "line") {
      if (char === "\n") {
        state = "code";
        result += char;
      }
      i++;
      continue;
    }

    if (state === "block") {
      if (char === "/" && next === "*") {
        blockDepth++;
        i += 2;
        continue;
      }

      if (char === "*" && next === "/") {
        blockDepth--;
        i += 2;

        if (blockDepth === 0) {
          state = "code";
        }
        continue;
      }

      i++;
      continue;
    }

    if (state === "string") {
      result += char;

      // SQL escaped quote: ''
      if (char === "'" && next === "'") {
        result += next;
        i += 2;
        continue;
      }

      if (char === "'") {
        state = "code";
      }

      i++;

    }
  }

  return result;
}

export function extractSqlParams(sql: string): Set<string> {
  const params = new Set<string>();

  let i = 0;
  const len = sql.length;

  let state: "code" | "line" | "block" | "string" = "code";
  let blockDepth = 0;

  const isIdentStart = (c: string | undefined) =>
    !!c && /[A-Za-z_]/.test(c);

  const isIdentPart = (c: string | undefined) =>
    !!c && /[A-Za-z0-9_]/.test(c);

  while (i < len) {
    const char = sql[i];
    const next = sql[i + 1];

    if (state === "code") {
      // line comment
      if (char === "-" && next === "-") {
        state = "line";
        i += 2;
        continue;
      }

      // block comment, supports nesting
      if (char === "/" && next === "*") {
        state = "block";
        blockDepth = 1;
        i += 2;
        continue;
      }

      // string literal
      if (char === "'") {
        state = "string";
        i++;
        continue;
      }

      // named bind param :param
      // ignore :: cast/operator forms
      if (char === ":" && next !== ":" && isIdentStart(next)) {
        const prev = i > 0 ? sql[i - 1] : "";

        // extra safety: do not match second colon in ::
        if (prev !== ":") {
          let j = i + 1;
          while (j < len && isIdentPart(sql[j])) j++;
          params.add(sql.slice(i + 1, j));
          i = j;
          continue;
        }
      }

      i++;
      continue;
    }

    if (state === "line") {
      if (char === "\n") {
        state = "code";
      }
      i++;
      continue;
    }

    if (state === "block") {
      if (char === "/" && next === "*") {
        blockDepth++;
        i += 2;
        continue;
      }

      if (char === "*" && next === "/") {
        blockDepth--;
        i += 2;
        if (blockDepth === 0) {
          state = "code";
        }
        continue;
      }

      i++;
      continue;
    }

    if (state === "string") {
      // escaped quote in SQL: ''
      if (char === "'" && next === "'") {
        i += 2;
        continue;
      }

      if (char === "'") {
        state = "code";
      }

      i++;

    }
  }

  return params;
}

// noinspection JSUnusedGlobalSymbols
export function filterParamsUsedInSql (
  sql: string,
  editedParameters: SqlParameters,
): SqlParameters {
  const usedParams = extractSqlParams(sql);

  return Object.fromEntries(
    Object.entries(editedParameters).filter(([key]) => usedParams.has(key)),
  );
}

export function extractKnownSqlParams (
  sql: string,
  editedParameters: SqlParameters,
): SqlParameters {
  const result: SqlParameters = {};

  if( !editedParameters ) {
    return result;
  }

  // Precompute allowed keys for O(1) lookup
  const allowed = new Set(Object.keys(editedParameters));

  let i = 0;
  const len = sql.length;

  let state: "code" | "line" | "block" | "string" = "code";
  let blockDepth = 0;

  const isIdentStart = (c: string | undefined) =>
    !!c && /[A-Za-z_]/.test(c);

  const isIdentPart = (c: string | undefined) =>
    !!c && /[A-Za-z0-9_]/.test(c);

  while (i < len) {
    const char = sql[i];
    const next = sql[i + 1];

    if (state === "code") {
      // -- line comment
      if (char === "-" && next === "-") {
        state = "line";
        i += 2;
        continue;
      }

      // /* block comment */ (nested)
      if (char === "/" && next === "*") {
        state = "block";
        blockDepth = 1;
        i += 2;
        continue;
      }

      // 'string literal'
      if (char === "'") {
        state = "string";
        i++;
        continue;
      }

      // :param detection (only from allowed set)
      if (char === ":" && next !== ":" && isIdentStart(next)) {
        const prev = i > 0 ? sql[i - 1] : "";

        if (prev !== ":") {
          let j = i + 1;
          while (j < len && isIdentPart(sql[j])) j++;

          const name = sql.slice(i + 1, j);

          if (allowed.has(name)) {
            result[name] = editedParameters[name];
          }

          i = j;
          continue;
        }
      }

      i++;
      continue;
    }

    if (state === "line") {
      if (char === "\n") {
        state = "code";
      }
      i++;
      continue;
    }

    if (state === "block") {
      if (char === "/" && next === "*") {
        blockDepth++;
        i += 2;
        continue;
      }

      if (char === "*" && next === "/") {
        blockDepth--;
        i += 2;
        if (blockDepth === 0) state = "code";
        continue;
      }

      i++;
      continue;
    }

    if (state === "string") {
      // escaped ''
      if (char === "'" && next === "'") {
        i += 2;
        continue;
      }

      if (char === "'") {
        state = "code";
      }

      i++;

    }
  }

  return result;
}