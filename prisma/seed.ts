import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminUsername = process.env.ADMIN_USERNAME || "admin";
  const adminPassword = process.env.ADMIN_PASSWORD || "ChangeMe123!";
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  await prisma.user.upsert({
    where: { username: adminUsername },
    update: { passwordHash, role: "admin" },
    create: { username: adminUsername, passwordHash, role: "admin" }
  });

  await prisma.systemSetting.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      loginHeroImageUrl: "/login-hero-vibelearning.png",
      loginMarketingIcon: "gift",
      loginMarketingTitle: "新注册用户限时赠送学习加速包",
      loginMarketingDescription: "完成注册即可开启江苏专转本计算机闯关学习",
      loginWelcomeTitle: "Welcome to VibeLearning",
      userAgreementContent: "test",
      privacyPolicyContent: "test",
      platformAgreementContent: "test",
      customerServiceEmail: "714399532@qq.com"
    }
  });

  const subject = await prisma.subject.upsert({
    where: {
      province_examType_name: {
        province: "江苏",
        examType: "专转本",
        name: "计算机"
      }
    },
    update: { status: "published" },
    create: {
      province: "江苏",
      examType: "专转本",
      name: "计算机",
      status: "published"
    }
  });

  const chapterTitles = ["计算机基础", "操作系统与办公软件", "程序设计与数据库"];
  for (const [index, title] of chapterTitles.entries()) {
    const existing = await prisma.chapter.findFirst({
      where: { subjectId: subject.id, title }
    });

    if (!existing) {
      await prisma.chapter.create({
        data: {
          subjectId: subject.id,
          title,
          sortOrder: index + 1,
          status: "published"
        }
      });
    }
  }

  console.log(`Seed completed. Admin: ${adminUsername} / ${adminPassword}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
