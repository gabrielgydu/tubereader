"use client";

import ReactMarkdown from "react-markdown";
import { useReadingSettings } from "@/components/layout/reading-settings";

export function Markdown({ children }: { children: string }) {
  const { fontCss, fontSize } = useReadingSettings();

  return (
    <div
      className="break-words"
      style={{ fontFamily: fontCss, fontSize: `${fontSize}px` }}
    >
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <h1 className="text-lg font-bold mt-4 mb-2">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-semibold mt-3 mb-1.5 text-foreground">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="font-semibold mt-2 mb-1 text-foreground" style={{ fontSize: `${fontSize}px` }}>{children}</h3>
          ),
          p: ({ children }) => (
            <p className="text-muted-foreground mb-2 leading-relaxed">{children}</p>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          ul: ({ children }) => (
            <ul className="text-muted-foreground mb-2 space-y-1 list-disc list-inside">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="text-muted-foreground mb-2 space-y-1 list-decimal list-inside">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-muted-foreground/30 pl-3 my-2 italic text-muted-foreground">
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code className="bg-muted px-1.5 py-0.5 rounded font-mono" style={{ fontSize: `${fontSize - 2}px` }}>{children}</code>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
