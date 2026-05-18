import bcrypt from "bcryptjs";
import { getAvailableLearningCoursesForStudent } from "../src/lib/courses";
import { saveStudentFoundationProfile } from "../src/lib/foundation";
import { prisma } from "../src/lib/prisma";

async function main() {
  const [region, publicSubject, major] = await Promise.all([
    prisma.region.findFirst({ where: { status: "active" }, orderBy: { sortOrder: "asc" } }),
    prisma.publicSubject.findFirst({ where: { status: "published" }, orderBy: { sortOrder: "asc" } }),
    prisma.major.findFirst({ where: { status: "published" }, orderBy: { sortOrder: "asc" } })
  ]);

  if (!region || !publicSubject || !major) {
    throw new Error("Need one active region, one published public subject, and one published major.");
  }

  const username = `codex_courses_${Date.now()}`;
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash: await bcrypt.hash("Codex12345", 12),
      role: "student"
    }
  });

  const publicCourse = await prisma.learningCourse.create({
    data: {
      regionId: region.id,
      publicSubjectId: publicSubject.id,
      name: `${publicSubject.name}验证课程`,
      courseType: "public_subject",
      status: "published"
    }
  });
  const majorCourse = await prisma.learningCourse.create({
    data: {
      regionId: region.id,
      majorId: major.id,
      name: `${major.name}验证课程`,
      courseType: "major",
      status: "published"
    }
  });

  try {
    await saveStudentFoundationProfile(user.id, {
      regionId: region.id,
      publicSubjectId: publicSubject.id,
      majorId: major.id
    });

    const courses = await getAvailableLearningCoursesForStudent(user.id);
    console.log(JSON.stringify({ courseCount: courses.length, courseIds: courses.map((course) => course.id) }, null, 2));

    const ids = new Set(courses.map((course) => course.id));
    if (!ids.has(publicCourse.id) || !ids.has(majorCourse.id)) {
      throw new Error("Learning course lookup did not return both matching courses.");
    }
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.learningCourse.deleteMany({ where: { id: { in: [publicCourse.id, majorCourse.id] } } });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
