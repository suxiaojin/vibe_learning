import assert from "node:assert/strict";
import { buildChapterSections, buildChapterEvidenceUnits, parseChapterConcepts, parseChapterAssignments, isReferenceFootnote, isContentsEntry, generateChapterCurriculum, type ChapterSection } from "../src/lib/ai-study-chapter-curriculum";
import { assertEvidenceFidelity } from "../src/lib/ai-study-grounded-card";
import { evidenceNumbers, retryCardPolicy, cardAvailability, shouldPauseCardBatch } from "../src/lib/ai-study-card-policy";
import { chapterCardMessages, parseChapterCard } from "../src/lib/ai-study-chapter-card";
import { assertCompleteFourLevelOutline } from "../src/lib/ai-study-outline-validation";
const u=(id:string,text:string,blockType="text")=>({id,text,blockType,sourceChunkId:"c1",sourceBlockIds:[id],pageStart:1,pageEnd:1});
async function main(){
  assertEvidenceFidelity("借记其他应收款3,000元。", "<table><tr><td>借:其他应收款</td><td>3 000</td></tr></table>");
  assertEvidenceFidelity("2021年出版。","出版社，2021.7");
  assertEvidenceFidelity("历时3小时。","历时3.00小时。");
  assert.throws(()=>assertEvidenceFidelity("借记30000元。","借记3 000元"));
  assert(!evidenceNumbers("<td>3</td><td>000</td>").has("3000"));
  assert(evidenceNumbers("22,000.00").has("22000"));
  assert.throws(()=>assertEvidenceFidelity("间隔24分钟53小时。","间隔24小时53分钟。"));
  const units=[u("h1","第一章 会计基础","heading"),u("h2","第一节 会计要素","heading"),u("p1","资产是企业控制的资源。"),u("p2","资产能够带来经济利益。"),u("p3","借:资产 3 000","table"),u("copyright","基础会计 / 陈国辉，迟旭升主编．—7版．—大连：东北财经大学出版社，2021.7")];
  const sections=buildChapterSections(units);assert.equal(sections.length,1);assert.equal(sections[0].units.length,3);
  assert.equal(buildChapterSections([u("definition","资产是企业控制的资源","heading")])[0].units.length,1);
  const section:ChapterSection={...sections[0],units:[u("p1","定义"),u("p2","条件")]};
  assert.equal(parseChapterConcepts(JSON.stringify({concepts:[{title:"资产",evidenceIds:["p1","p2"]}]}),section).length,1);
  assert.throws(()=>parseChapterConcepts(JSON.stringify({concepts:[{title:"资产",evidenceIds:["p1"]}]}),section));
  assert.throws(()=>parseChapterConcepts(JSON.stringify({concepts:[{title:"资产",evidenceIds:["p1","p2","foreign"]}]}),section));
  const footnote=u("ref","① 马克思，恩格斯．马克思恩格斯全集：第24卷[M].北京：人民出版社，1972：152.","page_footnote");
  assert(isReferenceFootnote(footnote));
  assert(!isReferenceFootnote(u("note","① 本例采用权责发生制，收款时点不影响收入确认。","page_footnote")));
  assert.equal(parseChapterConcepts(JSON.stringify({concepts:[{title:"资产",evidenceIds:["p1","p2"]}]}),{...section,units:[...section.units,footnote]}).length,1,"bibliography omission is not a missing knowledge point");
  const catalog=[{id:"c1",title:"资产"}];
  assert.equal(parseChapterAssignments(JSON.stringify({concepts:catalog,assignments:{p1:["c1"],p2:["c1"]}}),section).length,1);
  assert.throws(()=>parseChapterAssignments(JSON.stringify({concepts:catalog,assignments:{p1:["c1"]}}),section));
  assert.throws(()=>parseChapterAssignments(JSON.stringify({concepts:catalog,assignments:{p1:["c1"],p2:["c1"],foreign:["c1"]}}),section));
  assert.throws(()=>parseChapterAssignments(JSON.stringify({concepts:catalog,assignments:{p1:["c1"],p2:["c2"]}}),section),"unknown topic IDs must fail");
  assert.equal(parseChapterAssignments(JSON.stringify({concepts:[...catalog,{id:"c2",title:"资产"}],assignments:{p1:["c1"],p2:["c2"]}}),section).length,1,"duplicate active theme names should merge");
  assert.deepEqual(parseChapterAssignments(JSON.stringify({concepts:[...catalog,{id:"c2",title:"目录"}],assignments:{p1:["c1"],p2:["c1"]}}),section),[{title:"资产",evidenceIds:["p1","p2"]}],"unassigned catalog entries must not fail or create nodes");
  const situations:ChapterSection={...section,title:"02深焦思维：对焦到冲突背后的那个人",units:[u("p1","需求未被满足。"),u("p2","出现反击冲动。"),u("p3","识别深焦思维的原理。")]};
  const groupedSituations=parseChapterAssignments(JSON.stringify({concepts:[{id:"c1",title:"情形一：需求未被满足"},{id:"c2",title:"情形二：反击的冲动"},{id:"c3",title:"深焦思维的原理"},{id:"c4",title:"情形三：未被引用"}],assignments:{p1:["c1"],p2:["c2"],p3:["c3"]}}),situations);
  assert.deepEqual(groupedSituations,[{title:"深焦思维的原理",evidenceIds:["p3"]},{title:"深焦思维：应用情形",evidenceIds:["p1","p2"]}],"numbered situations share one grounded topic");
  const pages=[u("chapter","第一章 总论","heading"),u("section","第一节 会计属性","heading"),...Array.from({length:4},(_,i)=>[
    {...u(`head${i}`,"第一章 总论","heading"),pageStart:i+2,pageEnd:i+2},
    {...u(`sub${i}`,`${i+1}. 属性分类`,"heading"),pageStart:i+2,pageEnd:i+2},
    {...u(`body${i}`,"会计包括技术性和社会性。"),pageStart:i+2,pageEnd:i+2},
    {...u(`book${i}`,"基础会计","heading"),pageStart:i+2,pageEnd:i+2}]).flat(),footnote];
  const pageSections=buildChapterSections(pages);
  assert.equal(pageSections.length,1,"running headers and inline headings must not create sections");
  assert.equal(pageSections[0].title,"第一节 会计属性");
  assert.equal(pageSections[0].units.length,8,"inline headings and all body paragraphs survive");
  assert(isContentsEntry(u("toc","- 第一节 会计对象……17\n- 第二节 会计要素 19","list")));
  assert(!isContentsEntry(u("chapter","第一章 会计基础","heading")));
  const atPage=(id:string,text:string,page:number,blockType="heading")=>({...u(id,text,blockType),pageStart:page,pageEnd:page});
  const actualChapters=buildChapterSections([
    atPage("toc1","第一章 总论……1",1),atPage("toc2","第二章 资产……17",1),
    atPage("title1","总论",2),atPage("sec1","第一节 会计基础",2),atPage("body1","会计用于反映经济活动。",2,"text"),atPage("mark1","第一章",2),
    atPage("run1","第一章 总论",3),atPage("body2","会计也具有监督职能。",3,"text"),
    atPage("title2","资产",4),atPage("sec2","第一节 定义",4),atPage("body3","资产由企业控制。",4,"text"),atPage("mark2","第二章",4),atPage("run2","第二章 资产",5)
  ]);
  assert.deepEqual(actualChapters.map(s=>s.chapter),["第一章 总论","第二章 资产"],"TOC and page-end chapter markers must not misassign body sections");
  assert.deepEqual(actualChapters.map(s=>s.units.length),[2,1],"detached chapter names are navigation, not isolated concepts");
  const lessonSections=buildChapterSections([
    atPage("copyrightTitle","版权信息",1),atPage("copyrightBody","ISBN 1234567890",1,"text"),
    atPage("preface","序言",2),atPage("prefaceBody","本书写作于春天。",2,"text"),
    atPage("part","第一部分 理解自己",3),
    atPage("chapterLesson","第一章 缓解人际冲突",3),
    atPage("lesson1","01 非敌思维：看见关系",4),atPage("lessonBody1","人际冲突常源自误解。",4,"text"),
    atPage("lesson2","02深焦思维：处理问题",5),atPage("lessonBody2","先辨认问题的核心。",5,"text"),
    atPage("lesson3","03错配思维：认识差异",6),atPage("lessonBody3","不同需求可能错位。",6,"text")
  ]);
  assert.deepEqual(lessonSections.map(s=>s.title),["序言","01 非敌思维：看见关系","02深焦思维：处理问题","03错配思维：认识差异"]);
  assert.deepEqual(lessonSections.map(s=>s.units.length),[1,1,1,1],"publication data is excluded but preface prose remains teaching evidence");
  const textbookSections=buildChapterSections([
    atPage("publisher","东北财经大学会计学系列教材",1),atPage("publisherBody","教材修订背景与理念。",2,"text"),
    atPage("toc","目录",3),atPage("chapterTextbook","第一章 总论",4),
    atPage("sectionTextbook","第一节 会计概念",4),atPage("textbookBody","会计反映和监督经济活动。",4,"text")
  ]);
  assert.deepEqual(textbookSections.map(s=>s.units.map(u=>u.id)),[["textbookBody"]],"textbook cover and preface are not teaching nodes");
  const sectionOnly=buildChapterSections([atPage("sectionOnly","第一节 基本原理",1),atPage("sectionBody","原理用于解释现象。",1,"text")]);
  assert.deepEqual(sectionOnly.map(s=>s.units.map(u=>u.id)),[["sectionBody"]],"section-only sources must retain their body");
  const ordered=buildChapterEvidenceUnits([{id:"dedup",content:"",pageStart:1,pageEnd:3,evidenceBlocks:[{id:"a",content:"基础会计",pageNumber:1,blockType:"heading"},{id:"c",content:"基础会计",pageNumber:3,blockType:"heading"}]},{id:"body",content:"",pageStart:2,pageEnd:2,evidenceBlocks:[{id:"b",content:"会计的性质包括技术性。",pageNumber:2,blockType:"text"}]}]);
  assert.deepEqual(ordered.map(x=>x.pageStart),[1,2,3],"deduplicated chunk membership is not reading order");
  let calls=0;let saved:any;
  const sources=[{id:"c1",sourceId:"book1",content:"",pageStart:1,pageEnd:1,evidenceBlocks:units.map(x=>({id:x.id,content:x.text,pageNumber:1,blockType:x.blockType}))}];
  const run=(checkpoint?:any)=>generateChapterCurriculum({projectTitle:"会计",sources,safetyMaxNodes:5000,checkpoint,saveCheckpoint:async cp=>{saved=cp;},request:async call=>{calls++;const data=JSON.parse(call.messages[1].content);const schema=call.jsonSchema.schema as any;assert.deepEqual(schema.properties.assignments.required,data.evidence.map((x:any)=>x.id));const raw=JSON.stringify({concepts:[{id:"c1",title:"资产"}],assignments:Object.fromEntries(data.evidence.map((x:any)=>[x.id,["c1"]]))});call.validateContent(raw);return raw;}});
  const c=await run();assertCompleteFourLevelOutline(c.nodes);assert.equal(c.topics.length,1);assert.equal(c.topics[0].objectives.length,3);assert.equal(calls,1);
  await run(saved);assert.equal(calls,1,"checkpoint avoids model call");
  const messages=chapterCardMessages("会计",c.topics[0],c.units);assert.equal(messages.length,2);assert(!JSON.stringify(messages).includes("旧JSON"));
  const card=parseChapterCard(JSON.stringify({explanation:"资产是企业控制、能够带来经济利益的资源。案例分录借记资产3,000元，具体适用情境需结合资料理解。"}),c.topics[0],c.units);assert(card.card.explanation.includes("本卡原文依据"));
  assert.throws(()=>parseChapterCard('{"explanation":',c.topics[0],c.units));
  assert.equal(retryCardPolicy(1,"transport").status,"pending");assert.equal(retryCardPolicy(2,"content").status,"failed");
  assert.equal(cardAvailability({unrequested:1,pending:0,running:0,succeeded:99,failed:0,paused:0}).complete,false,"unrequested detail cannot make a project publishable");
  assert.equal(cardAvailability({unrequested:0,pending:0,running:0,succeeded:99,failed:1,paused:0}).complete,false);
  assert.equal(cardAvailability({unrequested:0,pending:0,running:0,succeeded:100,failed:0,paused:0}).complete,true);
  assert(shouldPauseCardBatch(["content_numeric","content_numeric","content_numeric","content_numeric","content_numeric"],"content_numeric"));
  assert(!shouldPauseCardBatch([null,"content_numeric",null,"content_numeric",null],"content_numeric"));
  const manyUnits=Array.from({length:80},(_,i)=>u(`u${i}`,`独立概念${i}的定义与适用条件。`));
  let conceptNumber=0;
  const knownThemeCounts:number[]=[];
  const large=await generateChapterCurriculum({projectTitle:"完整性",sources:[{id:"full",content:"",pageStart:1,pageEnd:1,evidenceBlocks:manyUnits.map(x=>({id:x.id,content:x.text,pageNumber:1,blockType:x.blockType}))}],safetyMaxNodes:5000,saveCheckpoint:async()=>{},request:async call=>{const data=JSON.parse(call.messages[1].content);knownThemeCounts.push(data.knownThemes.length);const concepts=data.evidence.map(()=>({id:`c${++conceptNumber}`,title:`具体机制${conceptNumber}`}));const raw=JSON.stringify({concepts,assignments:Object.fromEntries(data.evidence.map((x:any,i:number)=>[x.id,[concepts[i].id]]))});call.validateContent(raw);return raw;}});
  assert.equal(large.topics.length,80);assertCompleteFourLevelOutline(large.nodes);
  assert.deepEqual(knownThemeCounts,[0,64],"later batches receive the earlier themes of the same section");
  console.log("chapter, evidence, card and retry policy tests passed (no model calls)");
}
main().catch(e=>{console.error(e);process.exitCode=1});
