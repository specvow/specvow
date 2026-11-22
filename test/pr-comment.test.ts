import { describe, expect, it } from "vitest";
import { existingComment } from "../scripts/pr-comment.mjs";

describe("pull request comment", () => {
  it("updates the comment that already carries the marker", () => {
    const comments = [
      { id: 1, body: "unrelated" },
      { id: 2, body: "<!-- specvow-report -->\n\nBreaking" },
    ];
    expect(existingComment(comments)?.id).toBe(2);
  });

  it("posts a new comment when the marker is absent", () => {
    expect(existingComment([{ id: 1, body: "hello" }])).toBeUndefined();
  });
});