import { prisma } from "@/lib/prisma";

export type QuestionBankOwnerType = "public_subject" | "major";

const defaultRegion = {
  name: "江苏三年制",
  province: "江苏",
  studySystem: "三年制"
};

const defaultPublicSubjects = [
  { name: "高等数学", sortOrder: 0 }
];

const defaultMajors = [
  "计算机专业",
  "财经专业",
  "管理专业",
  "电子信息专业",
  "机械工程专业",
  "音乐专业",
  "美术专业",
  "化工生物专业",
  "文史专业",
  "土木建筑专业",
  "新闻传播专业",
  "医护专业",
  "日语专业",
  "英语专业",
  "法学专业",
  "教育专业",
  "资源环境专业",
  "农林专业",
  "食品专业"
].map((name, index) => ({ name, sortOrder: index }));

async function ensureDefaultRegion() {
  return prisma.region.upsert({
    where: { name: defaultRegion.name },
    update: {},
    create: {
      ...defaultRegion,
      description: "面向江苏三年制专转本学生",
      status: "active",
      sortOrder: 1
    }
  });
}

async function ensurePublicSubjectCourse(publicSubjectId: string, regionId: string, name: string) {
  const existing = await prisma.learningCourse.findFirst({
    where: { publicSubjectId, regionId, courseType: "public_subject" },
    select: { id: true }
  });

  if (existing) {
    return;
  }

  await prisma.learningCourse.create({
    data: {
      publicSubjectId,
      regionId,
      name,
      courseType: "public_subject",
      status: "published",
      sortOrder: 1
    }
  });
}

async function ensureMajorCourse(majorId: string, regionId: string, name: string, sortOrder: number) {
  const existing = await prisma.learningCourse.findFirst({
    where: { majorId, regionId, courseType: "major" },
    select: { id: true }
  });

  if (existing) {
    return;
  }

  await prisma.learningCourse.create({
    data: {
      majorId,
      regionId,
      name,
      courseType: "major",
      status: "published",
      sortOrder: sortOrder + 1
    }
  });
}

export async function ensureDefaultQuestionBankCatalog() {
  const region = await ensureDefaultRegion();

  for (const item of defaultPublicSubjects) {
    const subject = await prisma.publicSubject.upsert({
      where: { name: item.name },
      update: {},
      create: {
        name: item.name,
        status: "published",
        sortOrder: item.sortOrder
      }
    });

    await prisma.regionPublicSubject.upsert({
      where: {
        regionId_publicSubjectId: {
          regionId: region.id,
          publicSubjectId: subject.id
        }
      },
      update: {},
      create: {
        regionId: region.id,
        publicSubjectId: subject.id
      }
    });

    await ensurePublicSubjectCourse(subject.id, region.id, subject.name);
  }

  for (const item of defaultMajors) {
    const major = await prisma.major.upsert({
      where: { name: item.name },
      update: {},
      create: {
        name: item.name,
        status: "published",
        sortOrder: item.sortOrder
      }
    });

    await prisma.regionMajor.upsert({
      where: {
        regionId_majorId: {
          regionId: region.id,
          majorId: major.id
        }
      },
      update: {},
      create: {
        regionId: region.id,
        majorId: major.id
      }
    });

    await ensureMajorCourse(major.id, region.id, major.name, item.sortOrder);
  }
}
