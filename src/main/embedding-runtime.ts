import type { EmbedPurpose } from "./bundled-embedding"
import {
  embedBundledTexts,
  getBundledEmbeddingStatus,
  initBundledEmbedding,
} from "./bundled-embedding"

export const getEmbeddingStatus = getBundledEmbeddingStatus

export async function loadEmbeddingModel(): Promise<Record<string, unknown>> {
  await initBundledEmbedding()
  return getBundledEmbeddingStatus()
}

export async function unloadEmbeddingModel(): Promise<void> {
  /* 内置模型常驻，避免反复加载 */
}

export async function embedTexts(
  texts: string | string[],
  purpose: EmbedPurpose = "document"
): Promise<number[] | number[][]> {
  return embedBundledTexts(texts, purpose)
}
