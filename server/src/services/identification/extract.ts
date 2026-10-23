import { parseYear } from '../../utils/text.js';

export interface CoverTextHints {
  titleGuess: string | null;
  authorGuess: string | null;
  publisherGuess: string | null;
  yearGuess: number | null;
  textPreview: string;
  lineCount: number;
}

const IGNORE_LINE =
  /(isbn|copyright|©|\(c\)|all rights reserved|rights reserved|printed in|first published|published by|publisher|publishers|publishing|imprint|table of contents|contents|www\.|https?:|library of congress|no part of this|cover design|cover photograph|author photograph|retail price|suggested price|distributed by)/i;

function normalizeLine(line: string): string {
  return line
    .replace(/\s+/g, ' ')
    .replace(/^[|•·*\-–—]+\s*/, '')
    .replace(/\s+[|•·]+$/, '')
    .trim();
}

function hasEnoughLetters(line: string): boolean {
  const letters = (line.match(/\p{L}/gu) ?? []).length;
  return letters >= 3 && letters / Math.max(1, line.length) > 0.45;
}

function looksLikeAuthorLine(line: string): boolean {
  return /^(?:by|written by|author|edited by|illustrated by)\b/i.test(line);
}

function titleCandidateScore(line: string, index: number, nextLine: string | null): number {
  let score = 8;
  if (line.length >= 5 && line.length <= 60) score += 10;
  else if (line.length <= 90) score += 4;
  if (index === 0) score += 10;
  else if (index === 1) score += 8;
  else if (index === 2) score += 5;
  else if (index <= 4) score += 2;
  if (/\p{L}/u.test(line) && !/\d/.test(line)) score += 4;
  if (/[A-Z]{4,}/.test(line) && line === line.toUpperCase()) score += 2;
  if (line.includes(':')) score += 2;
  if (/\b(a novel|the .* series|book \d+)\b/i.test(line)) score += 3;
  if (nextLine && looksLikeAuthorLine(nextLine)) score += 6;
  if (/\b(19|20)\d{2}\b/.test(line)) score -= 5;
  if (line.split(' ').length > 16) score -= 5;
  return score;
}

function guessAuthor(text: string): string | null {
  const byPattern = /\b(?:written by|by)\s+([A-Z][\p{L}.'-]+(?:\s+[A-Z][\p{L}.'-]+){0,4})/u;
  const match = text.match(byPattern);
  if (match?.[1]) {
    return match[1]
      .replace(/\s+(?:A|An|The|Novel|Books?|Press)$/i, '')
      .trim();
  }

  for (const line of text.split(/\r?\n/).slice(0, 30)) {
    const cleaned = normalizeLine(line);
    const lineMatch = cleaned.match(/^(?:by|written by|author:?)\s+(.+)$/i);
    if (lineMatch?.[1] && lineMatch[1].length <= 90) {
      return lineMatch[1].trim();
    }
  }
  return null;
}

function guessPublisher(lines: string[], title: string | null): string | null {
  for (const line of lines.slice(0, 28)) {
    if (IGNORE_LINE.test(line)) {
      const match = line.match(
        /([\p{L}&.' -]{3,80}(?:Press|Publishers?|Publishing|Books|House|Editions?|Imprint))/iu,
      );
      if (match?.[1] && match[1].trim() !== title) return match[1].trim();
    }
  }
  return null;
}

export function extractCoverTextHints(text: string): CoverTextHints {
  const lines = text
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter((line) => line.length > 0);

  const candidates: Array<{ value: string; score: number; index: number }> = [];

  for (let index = 0; index < Math.min(lines.length, 18); index += 1) {
    const line = lines[index];
    if (!line) continue;
    if (
      line.length < 3 ||
      line.length > 120 ||
      IGNORE_LINE.test(line) ||
      looksLikeAuthorLine(line) ||
      !hasEnoughLetters(line) ||
      /^\d[\d\s.-]+$/.test(line)
    ) {
      continue;
    }

    const nextLine = lines[index + 1] ?? null;
    const score = titleCandidateScore(line, index, nextLine);
    candidates.push({ value: line, score, index });

    if (
      nextLine &&
      nextLine.length <= 55 &&
      nextLine.length >= 3 &&
      !IGNORE_LINE.test(nextLine) &&
      !looksLikeAuthorLine(nextLine) &&
      hasEnoughLetters(nextLine) &&
      !/\b(19|20)\d{2}\b/.test(nextLine) &&
      candidates.length < 30
    ) {
      candidates.push({
        value: `${line}: ${nextLine}`,
        score: score - 1,
        index,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.index - b.index);
  const best = candidates[0];
  const titleGuess = best && best.score >= 12 ? best.value : null;
  const authorGuess = guessAuthor(text);
  const yearMatch = text.match(/\b(19|20)\d{2}\b/);
  const publisherGuess = guessPublisher(lines, titleGuess);

  return {
    titleGuess,
    authorGuess,
    publisherGuess,
    yearGuess: yearMatch ? parseYear(yearMatch[0]) : null,
    textPreview: text.slice(0, 1600).trim(),
    lineCount: lines.length,
  };
}
