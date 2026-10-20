import crypto from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { refreshCardProject } from "../src/lib/ai-study-card-jobs";
import { disconnectRedis } from "../src/lib/redis";
const snapshot=(rows:{id:string;status:string;updatedAt:Date}[])=>crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex");
async function main(){
  const args=process.argv.slice(2),option=(key:string)=>args.find(a=>a.startsWith(`${key}=`))?.slice(key.length+1);
  const projectId=option("--project"),expected=option("--expected"),apply=args.includes("--apply");
  if(!projectId||args.some(a=>a!=="--apply"&&!a.startsWith("--project=")&&!a.startsWith("--expected=")))throw new Error("用法：--project=<id> [--expected=<预览指纹> --apply]");
  const project=await prisma.aiStudyProject.findUniqueOrThrow({where:{id:projectId},select:{title:true,deletedAt:true}});
  if(project.deletedAt)throw new Error("项目已删除。");
  const where={projectId,status:{in:["failed","paused"]}};
  const rows=await prisma.aiStudyCardJob.findMany({where,orderBy:{id:"asc"},select:{id:true,status:true,updatedAt:true}});
  const fingerprint=snapshot(rows);
  console.log(JSON.stringify({mode:apply?"apply":"preview",projectId,title:project.title,retryCount:rows.length,expected:fingerprint,preservesSavedCards:true,reparsesSource:false,chargesDiamonds:false},null,2));
  if(!apply)return;
  if(!expected||expected!==fingerprint)throw new Error("恢复预览已变化，请重新预览并使用--expected指纹。");
  await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM ai_study_projects WHERE id=${projectId} FOR UPDATE`;
    const current=await tx.aiStudyProject.findUniqueOrThrow({where:{id:projectId},select:{deletedAt:true}});
    if(current.deletedAt)throw new Error("项目已删除。");
    const fresh=await tx.aiStudyCardJob.findMany({where,orderBy:{id:"asc"},select:{id:true,status:true,updatedAt:true}});
    if(snapshot(fresh)!==expected)throw new Error("任务状态已变化，请重新预览。");
    await tx.aiStudyCardJob.updateMany({where:{id:{in:fresh.map(j=>j.id)},...where},data:{status:"pending",attempts:0,errorKind:null,errorMessage:null,leaseToken:null,leaseExpiresAt:null,nextAttemptAt:new Date()}});
  });
  await refreshCardProject(projectId);
  console.log("Missing card jobs requeued. Saved cards were not modified.");
}
main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exitCode=1}).finally(async()=>{await disconnectRedis();await prisma.$disconnect();});
