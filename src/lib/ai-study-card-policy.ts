// Compare values inside cells/text boundaries; never join adjacent table cells.
const numberPattern=/\d{1,3}(?:[,\u00a0 ]\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;
const numericValue=(value:string)=>value.replace(/[,\u00a0 ]/g,"").replace(/^0+(?=\d)/,"").replace(/(\.\d*?)0+$/, "$1").replace(/\.$/,"");
const plainEvidence=(text:string)=>text.normalize("NFKC").replace(/<[^>]*>/g," | ").replace(/&nbsp;/g," ");
export function canonicalEvidenceText(text:string){return plainEvidence(text).replace(numberPattern,numericValue);}
export function evidenceNumbers(text: string): Set<string> {
  const clean=plainEvidence(text);
  const values=new Set<string>();
  for(const date of clean.matchAll(/\b((?:19|20)\d{2})[./年](\d{1,2})(?:[./月](\d{1,2}))?/g)) {values.add(date[1]);values.add(String(Number(date[2])));if(date[3])values.add(String(Number(date[3])));}
  for(const m of clean.matchAll(numberPattern)) values.add(numericValue(m[0]));
  return values;
}
export type CardFailureKind = "content" | "transport" | "storage";
export const CARD_ATTEMPTS=2;
export function shouldPauseCardBatch(kinds:(string|null)[],family:string){return kinds.length>=5 && kinds.filter(k=>k===family).length>=5;}
export function retryCardPolicy(attempts:number,kind:CardFailureKind){return {status:attempts<CARD_ATTEMPTS?"pending":"failed",delayMs:kind==="transport"?60000:1000};}
export function cardAvailability(counts:{unrequested:number;pending:number;running:number;failed:number;paused:number;succeeded:number}) {
  const total=Object.values(counts).reduce((a,b)=>a+b,0);
  return {total,completed:counts.succeeded,needsAttention:counts.failed+counts.paused,complete:total>0 && counts.succeeded===total};
}
