import fs from "node:fs/promises"
import path from "node:path"

export interface IngestChunk {
  index: number
  title: string
  content: string
}

export interface IngestResult {
  fileName: string
  title: string
  fullText: string
  chunks: IngestChunk[]
}

const TEXT_EXT = new Set([".md", ".txt", ".csv", ".json"])
const XLSX_EXT = new Set([".xlsx", ".xls"])
const DOCX_EXT = new Set([".docx"])
const PDF_EXT = new Set([".pdf"])

export function chunkText(text: string, maxLen = 2000): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim()
  if (!normalized) return []
  if (normalized.length <= maxLen) return [normalized]

  const paragraphs = normalized.split(/\n{2,}/)
  const chunks: string[] = []
  let buf = ""

  for (const paragraph of paragraphs) {
    const piece = paragraph.trim()
    if (!piece) continue
    if (buf.length + piece.length + 2 > maxLen && buf) {
      chunks.push(buf.trim())
      buf = piece
    } else {
      buf = buf ? `${buf}\n\n${piece}` : piece
    }
  }
  if (buf.trim()) chunks.push(buf.trim())

  if (chunks.length === 0) {
    for (let i = 0; i < normalized.length; i += maxLen) {
      chunks.push(normalized.slice(i, i + maxLen))
    }
  }
  return chunks
}

async function extractText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase()

  if (TEXT_EXT.has(ext)) {
    return fs.readFile(filePath, "utf8")
  }

  if (XLSX_EXT.has(ext)) {
    const XLSX = await import("xlsx")
    const buf = await fs.readFile(filePath)
    const wb = XLSX.read(buf, { type: "buffer" })
    return wb.SheetNames.map((name) => {
      const sheet = wb.Sheets[name]
      if (!sheet) return ""
      return `## ${name}\n${XLSX.utils.sheet_to_csv(sheet)}`
    })
      .filter(Boolean)
      .join("\n\n")
  }

  if (DOCX_EXT.has(ext)) {
    const mammoth = await import("mammoth")
    const buf = await fs.readFile(filePath)
    const result = await mammoth.extractRawText({ buffer: buf })
    return result.value
  }

  if (PDF_EXT.has(ext)) {
    const { PDFParse } = await import("pdf-parse")
    const buf = await fs.readFile(filePath)
    const parser = new PDFParse(buf)
    const textResult = await parser.getText()
    if (typeof textResult === "string") return textResult
    return (textResult as { text?: string })?.text ?? ""
  }

  throw new Error(`不支持的文件类型：${ext || "未知"}`)
}

export async function ingestDocumentFile(filePath: string): Promise<IngestResult> {
  const fileName = path.basename(filePath)
  const fullText = (await extractText(filePath)).trim()
  if (!fullText) {
    throw new Error("未能从文件中提取到文本内容")
  }
  const title = fileName.replace(/\.[^.]+$/, "")
  const parts = chunkText(fullText)
  const chunks = parts.map((content, index) => ({
    index,
    title: `${title} · ${index + 1}/${parts.length}`,
    content,
  }))
  return { fileName, title, fullText, chunks }
}

export const INGEST_FILE_EXTENSIONS = [
  "md",
  "txt",
  "csv",
  "json",
  "pdf",
  "docx",
  "xlsx",
  "xls",
]
