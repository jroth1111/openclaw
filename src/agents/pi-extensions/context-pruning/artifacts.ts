import type { ToolResultMessage } from "@mariozechner/pi-ai";
import type { TextContent, ImageContent } from "@mariozechner/pi-ai";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type ArtifactRef = {
  id: string;
  type: "tool-result";
  toolName?: string;
  createdAt: string;
  sizeBytes: number;
  summary: string;
  path: string;
};

type ToolResultArtifact = {
  id: string;
  type: "tool-result";
  toolName?: string;
  createdAt: string;
  sizeBytes: number;
  summary: string;
  content: ToolResultMessage["content"];
};

function collectTextSegments(content: ReadonlyArray<TextContent | ImageContent>): string[] {
  const parts: string[] = [];
  for (const block of content) {
    if (block.type === "text") {
      parts.push(block.text);
    }
  }
  return parts;
}

function summarizeText(parts: string[]): string {
  if (parts.length === 0) {
    return "";
  }
  const joined = parts.join("\n").trim();
  if (!joined) {
    return "";
  }
  const max = 200;
  if (joined.length <= max) {
    return joined;
  }
  return `${joined.slice(0, max)}…`;
}

function countImages(content: ReadonlyArray<TextContent | ImageContent>): number {
  let count = 0;
  for (const block of content) {
    if (block.type === "image") {
      count += 1;
    }
  }
  return count;
}

export function writeToolResultArtifact(params: {
  artifactDir: string;
  toolName?: string;
  content: ToolResultMessage["content"];
}): Promise<ArtifactRef> {
  const id = `art_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const createdAt = new Date().toISOString();
  const textParts = collectTextSegments(params.content);
  const imageCount = countImages(params.content);
  const summaryText = summarizeText(textParts);
  const summary = summaryText
    ? imageCount > 0
      ? `${summaryText} (${imageCount} image${imageCount === 1 ? "" : "s"})`
      : summaryText
    : imageCount > 0
      ? `${imageCount} image${imageCount === 1 ? "" : "s"}`
      : "tool result";

  const payload: ToolResultArtifact = {
    id,
    type: "tool-result",
    toolName: params.toolName,
    createdAt,
    summary,
    sizeBytes: 0,
    content: params.content,
  };

  const serialized = JSON.stringify(payload);
  payload.sizeBytes = Buffer.byteLength(serialized, "utf8");
  const finalSerialized = JSON.stringify(payload, null, 2);

  fs.mkdirSync(params.artifactDir, { recursive: true, mode: 0o700 });
  const artifactPath = path.join(params.artifactDir, `${id}.json`);
  fs.writeFileSync(artifactPath, `${finalSerialized}\n`, { mode: 0o600 });

  return {
    id,
    type: payload.type,
    toolName: payload.toolName,
    createdAt,
    sizeBytes: payload.sizeBytes,
    summary: payload.summary,
    path: artifactPath,
  };
}
