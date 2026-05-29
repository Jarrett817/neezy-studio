import { useMutation, useQueryClient } from "@tanstack/react-query"
import { FileUp, Loader2 } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "~/components/ui/button"
import {
  importKnowledgeDocuments,
  pickKnowledgeDocuments,
} from "~/services/knowledge-ingest"

const ACCEPT = ".md,.txt,.csv,.json,.pdf,.docx,.xlsx,.xls"

export function KnowledgeDocumentsPanel() {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const importMutation = useMutation({
    mutationFn: importKnowledgeDocuments,
    onSuccess: ({ totalChunks, files }) => {
      void queryClient.invalidateQueries({ queryKey: ["memories"] })
      void queryClient.invalidateQueries({ queryKey: ["knowledge-items"] })
      toast.success(`已导入 ${files.length} 个文件，共 ${totalChunks} 条知识片段`)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "导入失败"),
  })

  const runImport = async (paths: string[]) => {
    if (!paths.length) return
    await importMutation.mutateAsync(paths)
  }

  const onPick = async () => {
    try {
      const paths = await pickKnowledgeDocuments()
      await runImport(paths)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "选择文件失败")
    }
  }

  return (
    <div className="space-y-4">
      <div
        className={[
          "flex flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed px-6 py-12 text-center transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-border/70 bg-muted/15",
        ].join(" ")}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          toast.info("请使用下方按钮选择文件（拖拽路径需 Electron 支持）")
        }}
      >
        <div className="flex size-14 items-center justify-center rounded-2xl bg-background shadow-sm ring-1 ring-border/60">
          <FileUp className="size-7 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium">上传文档，自动生成知识</p>
          <p className="mt-1 text-xs text-muted-foreground">
            支持 MD / TXT / PDF / Word / Excel · Agent 会分块并向量化
          </p>
        </div>
        <Button
          type="button"
          className="mt-2 h-11 rounded-2xl px-8"
          disabled={importMutation.isPending}
          onClick={() => void onPick()}
        >
          {importMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            "选择文件"
          )}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={() => {
            toast.info("请使用「选择文件」以写入完整路径")
          }}
        />
      </div>
    </div>
  )
}
