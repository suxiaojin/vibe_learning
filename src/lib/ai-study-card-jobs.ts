import crypto from "node:crypto";
import type { AiStudyCardJob } from "@prisma/client";
import { prisma } from "./prisma";
import { askQwenDetailed } from "./qwen";
import { downloadAiStudyObject } from "./ai-study-storage";
import type { Curriculum } from "./ai-study-curriculum";
import { chapterProtocol, type ChapterCurriculum } from "./ai-study-chapter-curriculum";
import { chapterCardMessages, chapterCardSchema, parseChapterCard } from "./ai-study-chapter-card";
import { CARD_ATTEMPTS, retryCardPolicy, cardAvailability, shouldPauseCardBatch, type CardFailureKind } from "./ai-study-card-policy";
import { refreshAiStudyProgressCache } from "./ai-study-progress-cache";

const leaseMs=180000;
const capacity=2; // Database-coordinated across every worker process.
const cardTimeoutMs=Math.max(5000,Math.min(120000,Number(process.env.AI_STUDY_CARD_TIMEOUT_MS)||120000));
const cardMaxTokens=Math.max(512,Math.min(8192,Number(process.env.AI_STUDY_CARD_MAX_TOKENS)||4096));
const manifestCache=new Map<string,Curriculum|ChapterCurriculum>();
export async function readCardManifest(key:string){
  const cached=manifestCache.get(key);if(cached)return cached;
  const value=JSON.parse((await downloadAiStudyObject(key)).body.toString("utf8")) as Curriculum|ChapterCurriculum;
  if(![chapterProtocol,"evidence-curriculum-v10"].includes(value.protocol)||!value.nodeIds||!Array.isArray(value.topics))throw new Error("卡片清单协议或节点映射无效。");
  if(manifestCache.size>=2)manifestCache.delete(manifestCache.keys().next().value!);
  manifestCache.set(key,value);return value;
}

export async function readCardJobCounts(projectId:string){
  const rows=await prisma.aiStudyCardJob.groupBy({by:["status"],where:{projectId},_count:{_all:true}});
  const counts={unrequested:0,pending:0,running:0,succeeded:0,failed:0,paused:0};
  for(const r of rows)if(r.status in counts)counts[r.status as keyof typeof counts]=r._count._all;
  return {...counts,...cardAvailability(counts)};
}
export async function refreshCardProject(projectId:string){
  // Serialize completion decisions with other completions/retries, not model calls.
  await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM ai_study_projects WHERE id=${projectId} FOR UPDATE`;
    const rows=await tx.aiStudyCardJob.findMany({where:{projectId},select:{status:true}});
    if(!rows.length)return;
    const complete=rows.every(r=>r.status==="succeeded"),active=rows.some(r=>["unrequested","pending","running"].includes(r.status));
    await tx.aiStudyProject.updateMany({where:{id:projectId,deletedAt:null,status:{not:"archived"}},data:{status:complete?"ready":active?"processing":"failed"}});
  });
  await refreshAiStudyProgressCache(projectId);
}

export async function runCardJobCycle(){
  const claimed=await prisma.$transaction(async tx=>{
    // One cross-process slot allocator. No model request holds this lock.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(71883006)`;
    const stale=await tx.aiStudyCardJob.findMany({where:{status:"running",leaseExpiresAt:{lt:new Date()}},select:{id:true,attempts:true,projectId:true}});
    for(const job of stale)await tx.aiStudyCardJob.update({where:{id:job.id},data:{status:job.attempts<CARD_ATTEMPTS?"pending":"failed",leaseToken:null,leaseExpiresAt:null,errorKind:"lease_expired",errorMessage:"任务进程中断或租约过期",nextAttemptAt:new Date()}});
    const running=await tx.aiStudyCardJob.count({where:{status:"running",leaseExpiresAt:{gte:new Date()}}});
    const jobs=await tx.aiStudyCardJob.findMany({where:{status:"pending",nextAttemptAt:{lte:new Date()},project:{deletedAt:null,status:{not:"archived"}}},orderBy:[{priority:"desc"},{createdAt:"asc"},{id:"asc"}],take:Math.max(0,capacity-running)});
    const acquired:AiStudyCardJob[]=[];
    for(const job of jobs)acquired.push(await tx.aiStudyCardJob.update({where:{id:job.id},data:{status:"running",attempts:{increment:1},leaseToken:crypto.randomUUID(),leaseExpiresAt:new Date(Date.now()+leaseMs)}}));
    return {jobs:acquired,staleProjects:[...new Set(stale.map(j=>j.projectId))]};
  });
  for(const id of claimed.staleProjects)await refreshCardProject(id);
  await Promise.all(claimed.jobs.map(runCardJob));
  return claimed.jobs.length;
}

async function runCardJob(job:AiStudyCardJob){
  let phase:CardFailureKind="storage", heartbeatFailed=false;
  let heartbeatPromise:Promise<unknown>|undefined;
  const timer=setInterval(()=>{
    if(heartbeatPromise)return;
    heartbeatPromise=prisma.aiStudyCardJob.updateMany({where:{id:job.id,status:"running",leaseToken:job.leaseToken,leaseExpiresAt:{gt:new Date()}},data:{leaseExpiresAt:new Date(Date.now()+leaseMs)}})
      .then(r=>{if(!r.count)heartbeatFailed=true;}).catch(()=>{heartbeatFailed=true;}).finally(()=>{heartbeatPromise=undefined;});
  },30000);
  try{
    if(!job.manifestKey.startsWith(`ai-study/${job.projectId}/generation/${job.outlineTaskId}/`))throw new Error("卡片来源清单不属于当前项目。");
    const manifest=await readCardManifest(job.manifestKey),clientId=Object.entries(manifest.nodeIds!).find(([,id])=>id===job.nodeId)?.[0];
    const topic=manifest.topics.find(t=>t.id===clientId);
    if(!topic||manifest.protocol!==job.protocol)throw new Error("卡片来源与任务版本不一致。");
    const project=await prisma.aiStudyProject.findUniqueOrThrow({where:{id:job.projectId},select:{title:true,aiPromptVersionId:true,deletedAt:true}});
    if(project.deletedAt)throw new Error("项目已删除。");
    phase="transport";
    // Also supports missing cards from a v10 manifest, with the single current
    // teaching protocol. Existing saved cards are never overwritten.
    const response=await askQwenDetailed(chapterCardMessages(project.title,topic,manifest.units,job.errorMessage??undefined),{moduleKey:"ai_study_detail",temperature:0.2,timeoutMs:cardTimeoutMs,maxCompletionTokens:cardMaxTokens,enableThinking:false,jsonSchema:{name:"study_concept_card",schema:chapterCardSchema}});
    phase="content";
    if(response.finishReason==="length")throw new Error("讲解输出截断，请简洁完整回答。");
    const result=parseChapterCard(response.content,topic,manifest.units);
    phase="storage";
    if(heartbeatFailed)throw new Error("卡片任务租约失效，禁止旧进程保存结果。");
    await prisma.$transaction(async tx=>{
      // Fence an expired owner even if it finishes after a replacement worker.
      const owned=await tx.aiStudyCardJob.updateMany({where:{id:job.id,status:"running",leaseToken:job.leaseToken,leaseExpiresAt:{gt:new Date()},project:{deletedAt:null,status:{not:"archived"}}},data:{status:"succeeded",leaseToken:null,leaseExpiresAt:null,errorKind:null,errorMessage:null,qualityFlags:result.qualityFlags}});
      if(!owned.count)throw new Error("卡片任务租约已移交。");
      if(!await tx.aiStudyCard.findFirst({where:{nodeId:job.nodeId}}))await tx.aiStudyCard.create({data:{...result.card,nodeId:job.nodeId,projectId:job.projectId,aiPromptVersionId:project.aiPromptVersionId,modelName:response.serverConfig.model,promptVersion:`${job.protocol};concept-card-v1`,reviewStatus:"unreviewed"}});
    });
  }catch(error){
    const message=(error instanceof Error?error.message:String(error)).slice(0,1500);
    const policy=retryCardPolicy(job.attempts,phase),family=phase==="content"?(/数字|数值|单位/.test(message)?"content_numeric":/JSON|json|截断/.test(message)?"content_json":"content_other"):phase;
    const owned=await prisma.aiStudyCardJob.updateMany({where:{id:job.id,status:"running",leaseToken:job.leaseToken},data:{status:policy.status,leaseToken:null,leaseExpiresAt:null,nextAttemptAt:new Date(Date.now()+policy.delayMs),errorKind:family,errorMessage:message}});
    if(owned.count && policy.status==="failed"){
      const recent=await prisma.aiStudyCardJob.findMany({where:{projectId:job.projectId,status:{in:["failed","succeeded"]}},orderBy:{updatedAt:"desc"},take:6,select:{errorKind:true}});
      if(shouldPauseCardBatch(recent.map(r=>r.errorKind),family))await prisma.aiStudyCardJob.updateMany({where:{projectId:job.projectId,status:"pending"},data:{status:"paused",errorKind:"circuit_open",errorMessage:`多张卡片出现同类错误（${family}），已暂停待生成内容，修复后可单卡重试。`}});
    }
  }finally{clearInterval(timer);await heartbeatPromise;await refreshCardProject(job.projectId);}
}

export async function requestCardPriority(ownerId:string,nodeId:string,retry=false){
  // Only project owners may schedule/retry; this endpoint never creates a paid
  // project, charges diamonds, reparses documents, or modifies a ready card.
  const node=await prisma.aiStudyNode.findFirst({where:{id:nodeId,project:{ownerId,deletedAt:null}},select:{id:true,projectId:true,parentId:true,depth:true}});
  if(!node||node.depth!==3)throw new Error("仅项目所有者可请求该知识点详解。");
  await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM ai_study_projects WHERE id=${node.projectId} FOR UPDATE`;
    if(retry){
      await tx.aiStudyCardJob.updateMany({where:{nodeId,status:{in:["failed","paused"]}},data:{status:"pending",attempts:0,errorKind:null,errorMessage:null,nextAttemptAt:new Date(),priority:100}});
    }else{
      // Only an explicit click releases this one card to the worker.
      await tx.aiStudyCardJob.updateMany({where:{nodeId,status:"unrequested"},data:{status:"pending",nextAttemptAt:new Date(),priority:100}});
    }
  });
  await refreshCardProject(node.projectId);
  return prisma.aiStudyCardJob.findUnique({where:{nodeId},select:{status:true,attempts:true,errorMessage:true}});
}
