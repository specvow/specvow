import type { Finding } from "./types.js";

export function exitCode(findings: Finding[]): number {
  return findings.some((finding) => finding.level === "breaking") ? 2 : 0;
}

function counts(findings: Finding[]): string {
  const breaking = findings.filter((finding) => finding.level === "breaking").length;
  const gaps = findings.filter((finding) => finding.level === "gap").length;
  const notes = findings.filter((finding) => finding.level === "note").length;
  return `${breaking} breaking, ${gaps} gap, ${notes} note`;
}

export function renderText(findings: Finding[], locked: boolean): string {
  if (findings.length === 0) {
    return locked
      ? "No breaking changes.\n"
      : "No breaking changes. No lockfile, so removed methods are not checked.\n";
  }

  const lines: string[] = [];
  const groups: Array<[Finding["level"], string]> = [
    ["breaking", "Breaking"],
    ["gap", "Gaps"],
    ["note", "Notes"],
  ];
  for (const [level, title] of groups) {
    const items = findings.filter((finding) => finding.level === level);
    if (items.length === 0) continue;
    lines.push(title);
    for (const item of items) lines.push(`  ${item.detail}`);
    lines.push("");
  }
  lines.push(counts(findings));
  return `${lines.join("\n")}\n`;
}

export function renderMarkdown(findings: Finding[], locked: boolean): string {
  if (findings.length === 0) {
    const line = locked
      ? "No breaking changes."
      : "No breaking changes. No lockfile, so removed methods are not checked.";
    return `## SpecVow\n\n${line}\n`;
  }
  const sections = [
    ["breaking", "Breaking"],
    ["gap", "Gaps"],
    ["note", "Notes"],
  ] as const;
  const lines = ["## SpecVow", ""];
  for (const [level, title] of sections) {
    const items = findings.filter((finding) => finding.level === level);
    if (items.length === 0) continue;
    lines.push(`### ${title}`, "");
    for (const item of items) lines.push(`- ${item.detail}`);
    lines.push("");
  }
  lines.push(counts(findings));
  return `${lines.join("\n")}\n`;
}

export function renderJson(findings: Finding[], locked: boolean): string {
  return `${JSON.stringify(
    {
      locked,
      breaking: findings.filter((finding) => finding.level === "breaking").length,
      findings,
    },
    null,
    2,
  )}\n`;
}

export function render(findings: Finding[], locked: boolean, format: string): string {
  if (format === "text") return renderText(findings, locked);
  if (format === "markdown") return renderMarkdown(findings, locked);
  if (format === "json") return renderJson(findings, locked);
  throw new Error(`Unknown format "${format}". Use text, markdown, or json.`);
}
