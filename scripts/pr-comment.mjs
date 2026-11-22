const marker = "<!-- specvow-report -->";

export function existingComment(comments, needle = marker) {
  return comments.find((comment) => typeof comment.body === "string" && comment.body.includes(needle));
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const token = process.env.SPECVOW_TOKEN ?? "";
  const event = process.env.SPECVOW_EVENT ?? "";
  const pr = process.env.SPECVOW_PR ?? "";
  const repo = process.env.SPECVOW_REPO ?? "";
  const api = process.env.SPECVOW_API || "https://api.github.com";
  if (event !== "pull_request" || token === "" || pr === "" || repo === "") return;

  const report = (await readStdin()).trimEnd();
  const body = `${marker}\n\n${report}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "specvow",
  };

  const list = await fetch(`${api}/repos/${repo}/issues/${pr}/comments?per_page=100`, { headers });
  if (!list.ok) {
    console.error(`Could not comment on the pull request (${list.status}).`);
    return;
  }

  const comments = await list.json();
  const existing = Array.isArray(comments) ? existingComment(comments) : undefined;
  const url = existing
    ? `${api}/repos/${repo}/issues/comments/${existing.id}`
    : `${api}/repos/${repo}/issues/${pr}/comments`;
  const method = existing ? "PATCH" : "POST";
  const posted = await fetch(url, { method, headers, body: JSON.stringify({ body }) });
  if (!posted.ok) console.error(`Could not comment on the pull request (${posted.status}).`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/"))) {
  main().catch((error) => {
    console.error(`Could not comment on the pull request (${error instanceof Error ? error.message : "unknown"}).`);
  });
}
