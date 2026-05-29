import type { Components } from "react-markdown"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { cn } from "~/lib/utils"

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="mt-5 mb-3 text-xl font-semibold tracking-tight first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-4 mb-2.5 text-lg font-semibold tracking-tight first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-3 mb-2 text-base font-semibold first:mt-0">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mt-3 mb-1.5 text-sm font-semibold first:mt-0">{children}</h4>
  ),
  p: ({ children }) => (
    <p className="mb-3 leading-relaxed last:mb-0 [&:not(:first-child)]:mt-0">
      {children}
    </p>
  ),
  ul: ({ children }) => (
    <ul className="my-3 list-disc space-y-1.5 pl-5 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-3 list-decimal space-y-1.5 pl-5 last:mb-0">{children}</ol>
  ),
  li: ({ children, className }) => (
    <li
      className={cn(
        "text-sm leading-relaxed [&>p]:mb-1.5",
        className?.includes("task-list-item") && "list-none pl-0",
        className
      )}
    >
      {children}
    </li>
  ),
  input: ({ type, checked, disabled }) => {
    if (type !== "checkbox") return null
    return (
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        readOnly
        className="mr-2 size-3.5 shrink-0 translate-y-0.5 rounded border-border accent-primary"
        aria-hidden
      />
    )
  },
  code: ({ className, children, ...props }) => {
    const isBlock = Boolean(className?.includes("language-"))
    if (isBlock) {
      return (
        <code
          className={cn("block font-mono text-[13px] leading-relaxed", className)}
          {...props}
        >
          {children}
        </code>
      )
    }
    return (
      <code
        className="rounded-md bg-muted/80 px-1.5 py-0.5 font-mono text-[0.9em]"
        {...props}
      >
        {children}
      </code>
    )
  },
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-xl border border-border/50 bg-muted/40 p-4 text-[13px] leading-relaxed last:mb-0">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 rounded-r-lg border-l-4 border-primary/35 bg-muted/30 py-2 pr-3 pl-4 text-muted-foreground italic">
      {children}
    </blockquote>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-primary underline underline-offset-2 hover:text-primary/80"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => (
    <del className="text-muted-foreground line-through">{children}</del>
  ),
  hr: () => <hr className="my-4 border-border/40" />,
  table: ({ children }) => (
    <div className="my-4 w-full overflow-x-auto rounded-xl border border-border/50 bg-background/50">
      <table className="w-full min-w-[20rem] border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b border-border/50 bg-muted/40">{children}</thead>
  ),
  tbody: ({ children }) => (
    <tbody className="divide-y divide-border/40">{children}</tbody>
  ),
  tr: ({ children }) => <tr className="border-border/30">{children}</tr>,
  th: ({ children }) => (
    <th className="px-3 py-2.5 text-left text-xs font-semibold text-foreground">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2.5 align-top text-sm leading-relaxed text-foreground/90">
      {children}
    </td>
  ),
  img: ({ src, alt }) => (
    <img
      src={src}
      alt={alt ?? ""}
      className="my-3 max-h-96 max-w-full rounded-xl border border-border/50 object-contain"
      loading="lazy"
    />
  ),
}

export function MarkdownContent({
  content,
  className,
}: {
  content: string
  className?: string
}) {
  return (
    <div className={cn("markdown-content min-w-0 text-foreground/95", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
