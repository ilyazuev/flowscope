import { Extension } from "@codemirror/state";
import { foldService } from "@codemirror/language";

/**
 * CTE folding for SQL in CodeMirror 6.
 *
 * Supports:
 * - WITH
 * - WITH RECURSIVE
 * - cte AS (...)
 * - cte(col1, col2) AS (...)
 * - "quoted identifiers"
 *
 * Behavior:
 * - fold marker appears on the line where a CTE starts
 * - folded range is the inside of the CTE body parentheses
 */

type ScanState = {
  inSingleQuote: boolean;
  inDoubleQuote: boolean;
  inLineComment: boolean;
  inBlockComment: boolean;
};

function createScanState(): ScanState {
  return {
    inSingleQuote: false,
    inDoubleQuote: false,
    inLineComment: false,
    inBlockComment: false,
  };
}

function isWhitespace(ch: string): boolean {
  return /\s/.test(ch);
}

function isIdentifierStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}

function isIdentifierPart(ch: string): boolean {
  return /[A-Za-z0-9_$]/.test(ch);
}

function isWordBoundary(text: string, pos: number): boolean {
  if (pos < 0 || pos >= text.length) return true;
  return !/[A-Za-z0-9_$]/.test(text[pos]);
}

/**
 * Advances lexical state by one character.
 * Handles SQL single quotes, double quotes, -- comments, /* comments *\/.
 */
function advanceLexState(text: string, i: number, state: ScanState): number {
  const ch = text[i];
  const next = text[i + 1];

  if (state.inLineComment) {
    if (ch === "\n") state.inLineComment = false;
    return i + 1;
  }

  if (state.inBlockComment) {
    if (ch === "*" && next === "/") {
      state.inBlockComment = false;
      return i + 2;
    }
    return i + 1;
  }

  if (state.inSingleQuote) {
    // SQL escaping for single quote: ''
    if (ch === "'" && next === "'") return i + 2;
    if (ch === "'") {
      state.inSingleQuote = false;
      return i + 1;
    }
    return i + 1;
  }

  if (state.inDoubleQuote) {
    // SQL escaping for quoted identifier: ""
    if (ch === '"' && next === '"') return i + 2;
    if (ch === '"') {
      state.inDoubleQuote = false;
      return i + 1;
    }
    return i + 1;
  }

  if (ch === "-" && next === "-") {
    state.inLineComment = true;
    return i + 2;
  }

  if (ch === "/" && next === "*") {
    state.inBlockComment = true;
    return i + 2;
  }

  if (ch === "'") {
    state.inSingleQuote = true;
    return i + 1;
  }

  if (ch === '"') {
    state.inDoubleQuote = true;
    return i + 1;
  }

  return i + 1;
}

function skipWhitespaceAndComments(text: string, pos: number): number {
  const state = createScanState();
  let i = pos;

  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];

    if (
      !state.inSingleQuote &&
      !state.inDoubleQuote &&
      !state.inLineComment &&
      !state.inBlockComment
    ) {
      if (isWhitespace(ch)) {
        i++;
        continue;
      }
      if (ch === "-" && next === "-") {
        state.inLineComment = true;
        i += 2;
        continue;
      }
      if (ch === "/" && next === "*") {
        state.inBlockComment = true;
        i += 2;
        continue;
      }
      break;
    }

    i = advanceLexState(text, i, state);
  }

  return i;
}

function readKeyword(text: string, pos: number, keyword: string): number | null {
  const end = pos + keyword.length;
  if (end > text.length) return null;

  if (
    text.slice(pos, end).toLowerCase() === keyword.toLowerCase() &&
    isWordBoundary(text, pos - 1) &&
    isWordBoundary(text, end)
  ) {
    return end;
  }

  return null;
}

function readIdentifier(text: string, pos: number): { from: number; to: number } | null {
  if (pos >= text.length) return null;

  // "quoted identifier"
  if (text[pos] === '"') {
    let i = pos + 1;
    while (i < text.length) {
      if (text[i] === '"' && text[i + 1] === '"') {
        i += 2;
        continue;
      }
      if (text[i] === '"') {
        return { from: pos, to: i + 1 };
      }
      i++;
    }
    return null;
  }

  // regular identifier
  if (!isIdentifierStart(text[pos])) return null;
  let i = pos + 1;
  while (i < text.length && isIdentifierPart(text[i])) i++;
  return { from: pos, to: i };
}

function findMatchingParen(text: string, openPos: number): number | null {
  const state = createScanState();
  let depth = 0;

  for (let i = openPos; i < text.length; ) {
    const ch = text[i];

    if (
      state.inSingleQuote ||
      state.inDoubleQuote ||
      state.inLineComment ||
      state.inBlockComment
    ) {
      i = advanceLexState(text, i, state);
      continue;
    }

    const next = text[i + 1];
    if (ch === "-" && next === "-") {
      state.inLineComment = true;
      i += 2;
      continue;
    }
    if (ch === "/" && next === "*") {
      state.inBlockComment = true;
      i += 2;
      continue;
    }
    if (ch === "'") {
      state.inSingleQuote = true;
      i++;
      continue;
    }
    if (ch === '"') {
      state.inDoubleQuote = true;
      i++;
      continue;
    }

    if (ch === "(") {
      depth++;
      i++;
      continue;
    }

    if (ch === ")") {
      depth--;
      if (depth === 0) return i;
      i++;
      continue;
    }

    i++;
  }

  return null;
}

function readBalancedParenGroup(
  text: string,
  openPos: number
): { from: number; to: number } | null {
  if (text[openPos] !== "(") return null;
  const closePos = findMatchingParen(text, openPos);
  if (closePos == null) return null;
  return { from: openPos, to: closePos + 1 };
}

/**
 * Parses a CTE header from a given position:
 *   name AS (
 *   name(col1, col2) AS (
 *
 * Returns the body paren range if it is a CTE header.
 */
function parseCteAt(text: string, pos: number): { bodyOpen: number; bodyClose: number } | null {
  let i = skipWhitespaceAndComments(text, pos);

  // CTE name
  const name = readIdentifier(text, i);
  if (!name) return null;
  i = name.to;

  i = skipWhitespaceAndComments(text, i);

  // Optional column list: cte(col1, col2)
  if (text[i] === "(") {
    const cols = readBalancedParenGroup(text, i);
    if (!cols) return null;
    i = cols.to;
    i = skipWhitespaceAndComments(text, i);
  }

  const afterAs = readKeyword(text, i, "AS");
  if (afterAs == null) return null;
  i = afterAs;

  i = skipWhitespaceAndComments(text, i);

  if (text[i] !== "(") return null;

  const body = readBalancedParenGroup(text, i);
  if (!body) return null;

  return {
    bodyOpen: body.from,
    bodyClose: body.to - 1,
  };
}

/**
 * Find whether the line begins a CTE definition.
 * We intentionally parse only from the start of the given line so that
 * the fold marker appears exactly on that line.
 */
function findCteFoldOnLine(docText: string, lineFrom: number, lineTo: number) {
  const lineText = docText.slice(lineFrom, lineTo);

  // if line starts with SQL line comment — no fold marker here
  if (/^\s*--/.test(lineText)) {
    return null;
  }

  const lookAheadLimit = Math.min(docText.length, lineTo + 4000);
  const slice = docText.slice(lineFrom, lookAheadLimit);

  const parsed = parseCteAt(slice, 0);
  if (!parsed) return null;

  return {
    from: lineFrom + parsed.bodyOpen + 1,
    to: lineFrom + parsed.bodyClose,
  };
}

export function sqlCteFolding(): Extension {
  return foldService.of((state, lineStart, lineEnd) => {
    const docText = state.doc.toString();

    const range = findCteFoldOnLine(docText, lineStart, lineEnd);
    if (!range) return null;

    if (range.to <= range.from) return null;

    return range;
  });
}