import { apiError, apiOk } from "@/lib/api-response";
import { getStudentApiUser } from "@/lib/student-api";
import { requestCardPriority } from "@/lib/ai-study-card-jobs";
export const runtime="nodejs";
export async function POST(request:Request,context:{params:Promise<{nodeId:string}>}){
  const {user,response}=await getStudentApiUser();if(!user)return response;
  const body=await request.json().catch(()=>null);
  if(!body||typeof body.retry!=="boolean")return apiError("请求参数不合法。",400,"INVALID_INPUT");
  const {nodeId}=await context.params;
  // Do not turn database/service failures into a misleading permission error.
  const {prisma}=await import("@/lib/prisma");
  if(!await prisma.aiStudyNode.findFirst({where:{id:nodeId,depth:3,project:{ownerId:user.id,deletedAt:null}}}))return apiError("无权操作该知识点。",403,"FORBIDDEN");
  if(!await prisma.aiStudyCardJob.findUnique({where:{nodeId},select:{id:true}}))return apiError("当前知识点尚未登记详解任务。",409,"CARD_JOB_NOT_SCHEDULED");
  return apiOk({job:await requestCardPriority(user.id,nodeId,body.retry)});
}
