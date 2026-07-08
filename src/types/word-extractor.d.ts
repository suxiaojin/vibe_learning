declare module "word-extractor" {
  type HeaderOptions = {
    includeFooters?: boolean;
  };

  type TextboxOptions = {
    includeBody?: boolean;
    includeHeadersAndFooters?: boolean;
  };

  type ExtractedWordDocument = {
    getBody(): string;
    getFootnotes(): string;
    getEndnotes(): string;
    getHeaders(options?: HeaderOptions): string;
    getFooters(): string;
    getAnnotations(): string;
    getTextboxes(options?: TextboxOptions): string;
  };

  export default class WordExtractor {
    extract(source: string | Buffer): Promise<ExtractedWordDocument>;
  }
}
