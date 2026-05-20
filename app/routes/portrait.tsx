import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Download, RefreshCw, UserRound } from "lucide-react"
import { toast } from "sonner"

import { UserPortraitPanel } from "~/components/user-portrait-panel"
import { Button } from "~/components/ui/button"
import {
  exportPortraitMarkdown,
  getUserPortrait,
  resetUserPortrait,
} from "~/services/user-portrait"

export default function PortraitRoute() {
  const queryClient = useQueryClient()
  const { data: portrait, isLoading } = useQuery({
    queryKey: ["user-portrait"],
    queryFn: getUserPortrait,
  })

  const resetMutation = useMutation({
    mutationFn: resetUserPortrait,
    onSuccess: (next) => {
      queryClient.setQueryData(["user-portrait"], next)
      toast.success("人格画像已清空，将随新对话重新积累")
    },
  })

  const handleExport = async () => {
    try {
      await exportPortraitMarkdown()
      toast.success("已导出 Markdown 文件")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导出失败")
    }
  }

  return (
    <div className="space-y-4 pt-2 pb-8">
      <div className="flex items-center justify-end gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-full"
          onClick={handleExport}
          aria-label="导出"
        >
          <Download className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-full text-muted-foreground"
          disabled={resetMutation.isPending}
          onClick={() => resetMutation.mutate()}
          aria-label="清空画像"
        >
          <RefreshCw className="size-4" />
        </Button>
      </div>

      {isLoading || !portrait ? (
        <div className="flex items-center justify-center py-24">
          <UserRound className="size-10 animate-pulse text-primary/30" />
        </div>
      ) : (
        <UserPortraitPanel portrait={portrait} />
      )}
    </div>
  )
}
