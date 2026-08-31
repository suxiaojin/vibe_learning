import { cn } from "@/lib/utils";

const richTextHtmlPattern = /<\/?[a-z][\s\S]*>/i;
const richTextWhitespaceEntityPattern = /(?:&nbsp;|&#160;|&#x0*a0;)/i;

function containsRichTextMarkup(value: string) {
  return richTextHtmlPattern.test(value) || richTextWhitespaceEntityPattern.test(value);
}

export function RichTextContent({ className, value }: { className?: string; value: string }) {
  if (!containsRichTextMarkup(value)) {
    return <p className={cn("whitespace-pre-wrap break-words", className)}>{value}</p>;
  }

  return (
    <div
      className={cn(
        "overflow-x-auto break-words [&_div]:my-1 [&_img]:my-2 [&_img]:h-auto [&_img]:max-w-full [&_li]:my-0.5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_table]:my-2 [&_table]:max-w-full [&_table]:border-collapse [&_td]:border [&_td]:border-current [&_td]:p-2 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5",
        className
      )}
      dangerouslySetInnerHTML={{ __html: value }}
    />
  );
}
