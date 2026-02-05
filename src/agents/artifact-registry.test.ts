import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  appendArtifactRegistryEntry,
  computeArtifactHash,
  findArtifactByHash,
  getArtifactById,
  readArtifactRegistry,
} from "./artifact-registry.js";

describe("artifact registry", () => {
  it("computes deterministic hashes", () => {
    const a = computeArtifactHash({ foo: "bar" });
    const b = computeArtifactHash({ foo: "bar" });
    expect(a).toBe(b);
  });

  it("appends and reads registry entries", () => {
    const dir = fs.mkdtempSync(path.join(tmpdir(), "openclaw-artifact-registry-"));
    const hash = computeArtifactHash({ foo: "bar" });
    appendArtifactRegistryEntry({
      artifactDir: dir,
      entry: {
        hash,
        artifact: {
          id: "art_1",
          type: "tool-result",
          createdAt: new Date().toISOString(),
          sizeBytes: 12,
          summary: "ok",
          path: path.join(dir, "art_1.json"),
        },
      },
    });

    const entries = readArtifactRegistry(dir);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.hash).toBe(hash);
    expect(entries[0]?.artifact?.id).toBe("art_1");

    const found = findArtifactByHash(dir, hash);
    expect(found?.artifact?.id).toBe("art_1");

    const byId = getArtifactById(dir, "art_1");
    expect(byId?.hash).toBe(hash);
  });
});
