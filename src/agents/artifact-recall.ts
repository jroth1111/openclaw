import path from "node:path";
import type { OpenClawConfig } from "../config/config.js";
import type { MemoryArtifactsConfig } from "../config/types.memory.js";
import { listArtifactsForSession } from "./artifact-registry.js";

const DEFAULT_ARTIFACT_RECALL: Required<MemoryArtifactsConfig> = {
  enabled: true,
  maxItems: 8,
  maxChars: 2000,
  narrativeMaxChars: 600,
};

function resolveConfig(cfg?: MemoryArtifactsConfig): Required<MemoryArtifactsConfig> {
  return {
    enabled: cfg?.enabled ?? DEFAULT_ARTIFACT_RECALL.enabled,
    maxItems: cfg?.maxItems ?? DEFAULT_ARTIFACT_RECALL.maxItems,
    maxChars: cfg?.maxChars ?? DEFAULT_ARTIFACT_RECALL.maxChars,
    narrativeMaxChars: cfg?.narrativeMaxChars ?? DEFAULT_ARTIFACT_RECALL.narrativeMaxChars,
  };
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

function buildNarrative(summaries: string[], maxChars: number): string | null {
  if (summaries.length === 0) {
    return null;
  }
  const sentence = `I recently used tools that produced: ${summaries.join("; ")}.`;
  return truncateText(sentence, maxChars);
}

export function buildArtifactRecallSection(params: {
  sessionFile?: string | null;
  sessionKey?: string;
  config?: OpenClawConfig;
}): string | null {
  if (!params.sessionFile || !params.sessionKey) {
    return null;
  }
  const cfg = resolveConfig(params.config?.memory?.artifacts);
  if (!cfg.enabled) {
    return null;
  }
  const artifactDir = path.join(path.dirname(params.sessionFile), "artifacts");
  const entries = listArtifactsForSession({ artifactDir, sessionKey: params.sessionKey });
  if (entries.length === 0) {
    return null;
  }
  const recent = entries.slice(-cfg.maxItems);
  const summaries = recent.map((entry) => entry.artifact.summary).filter(Boolean);
  const narrative = buildNarrative(summaries, cfg.narrativeMaxChars);

  const lines: string[] = [];
  for (const entry of recent) {
    const summary = entry.artifact.summary || "artifact";
    const line = `- ${summary} (artifact: ${entry.artifact.id}, path: ${entry.artifact.path})`;
    if (lines.join("\n").length + line.length + 1 > cfg.maxChars) {
      lines.push("- …");
      break;
    }
    lines.push(line);
  }

  const sectionParts: string[] = [
    "## Artifact Recall",
    "These artifacts are referenced for exact recall. Use the artifact id/path when needed.",
  ];
  if (narrative) {
    sectionParts.push("", "### Narrative", narrative);
  }
  if (lines.length > 0) {
    sectionParts.push("", "### Recent Artifacts", lines.join("\n"));
  }

  const section = sectionParts.join("\n");
  return truncateText(section, cfg.maxChars);
}
