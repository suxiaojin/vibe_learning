"use client";

import React from "react";
import katex from "katex";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { normalizeAiMathDelimiters } from "@/lib/ai-math-delimiters";

// Parse math before Markdown consumes backslashes, underscores, or asterisks.
// Live answers and restored history must go through this same raw-text entry.
export function MathMarkdownText({ children, components = {} }: { children: string; components?: Components }) {
  const Code = components.code;
  const Pre = components.pre;
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      skipHtml
      components={{
        ...components,
        code: ({ node, children: content, className, ...props }) => {
          const classes = className?.split(/\s+/) || [];
          if (classes.includes("math-inline") || classes.includes("math-display")) {
            const formula = String(content).replace(/\n$/, "");
            const display = classes.includes("math-display");
            try {
              const html = katex.renderToString(formula, {
                displayMode: display,
                output: "htmlAndMathml",
                throwOnError: true,
                strict: "ignore",
                trust: false,
                maxExpand: 1000
              });
              return <span className={display ? "block max-w-full overflow-x-auto" : undefined} dangerouslySetInnerHTML={{ __html: html }} />;
            } catch {
              const delimiter = display ? "$$" : "$";
              return <span className="whitespace-pre-wrap break-words">{delimiter + formula + delimiter}</span>;
            }
          }
          if (Code && typeof Code !== "string") {
            return <Code {...props} node={node} className={className}>{content}</Code>;
          }
          return React.createElement(Code || "code", { ...props, className }, content);
        },
        pre: ({ node, children: content, ...props }) => {
          const child = node?.children[0];
          const classes = child?.type === "element" ? child.properties.className : undefined;
          if (Array.isArray(classes) && classes.includes("math-display")) {
            return <div className="my-2 max-w-full overflow-x-auto">{content}</div>;
          }
          if (Pre && typeof Pre !== "string") {
            return <Pre {...props} node={node}>{content}</Pre>;
          }
          return React.createElement(Pre || "pre", props, content);
        }
      }}
    >
      {normalizeAiMathDelimiters(children)}
    </ReactMarkdown>
  );
}
