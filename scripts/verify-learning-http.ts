import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { prisma } from "../src/lib/prisma";

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 24) {
    throw new Error("AUTH_SECRET must be at least 24 characters.");
  }
  return new TextEncoder().encode(secret);
}

async function makeSession(user: { id: string; username: string; role: "student" | "admin" }) {
  return new SignJWT({
    sub: user.id,
    username: user.username,
    role: user.role
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(getSecret());
}

async function fetchJson(path: string, token: string) {
  const response = await fetch(`http://127.0.0.1:3000${path}`, {
    headers: {
      cookie: `vl_session=${token}`
    }
  });
  const body = await response.json();
  return { status: response.status, body };
}

async function main() {
  const [region, publicSubject, major, subject] = await Promise.all([
    prisma.region.findFirstOrThrow({ where: { status: "active" }, orderBy: { sortOrder: "asc" } }),
    prisma.publicSubject.findFirstOrThrow({ where: { status: "published" }, orderBy: { sortOrder: "asc" } }),
    prisma.major.findFirstOrThrow({ where: { status: "published" }, orderBy: { sortOrder: "asc" } }),
    prisma.subject.findFirstOrThrow()
  ]);

  const username = `codex_http_learning_${Date.now()}`;
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash: await bcrypt.hash("Codex12345", 12),
      role: "student",
      studentProfile: {
        create: {
          regionId: region.id,
          publicSubjectId: publicSubject.id,
          majorId: major.id
        }
      }
    }
  });

  const course = await prisma.learningCourse.create({
    data: {
      regionId: region.id,
      publicSubjectId: publicSubject.id,
      name: "Codex HTTP 验证课程",
      courseType: "public_subject",
      status: "published",
      chapters: {
        create: {
          subjectId: subject.id,
          title: "Codex 验证章节",
          sortOrder: 9999,
          status: "published",
          points: {
            create: {
              title: "Codex 验证知识点",
              summary: "用于 HTTP 验证",
              content: "验证内容",
              sortOrder: 9999,
              status: "published",
              questions: {
                create: {
                  type: "single_choice",
                  stem: "验证题干",
                  options: [{ key: "A", text: "验证选项" }],
                  answer: ["A"],
                  analysis: "验证解析",
                  source: "Codex 验证",
                  sourceType: "manual",
                  status: "published"
                }
              }
            }
          }
        }
      }
    },
    include: {
      chapters: {
        include: {
          points: true
        }
      }
    }
  });

  try {
    const pointId = course.chapters[0].points[0].id;
    const token = await makeSession({ id: user.id, username: user.username, role: user.role });

    const courses = await fetchJson("/api/learning/courses", token);
    const detail = await fetchJson(`/api/learning/courses/${course.id}`, token);
    const outline = await fetchJson(`/api/learning/courses/${course.id}/outline`, token);
    const point = await fetchJson(`/api/learning/knowledge-points/${pointId}`, token);
    const questions = await fetchJson(`/api/learning/knowledge-points/${pointId}/questions`, token);

    console.log(
      JSON.stringify(
        {
          courses: { status: courses.status, count: courses.body.data?.courses?.length },
          detail: { status: detail.status, id: detail.body.data?.course?.id },
          outline: { status: outline.status, chapters: outline.body.data?.chapters?.length },
          point: { status: point.status, id: point.body.data?.point?.id },
          questions: {
            status: questions.status,
            count: questions.body.data?.questions?.length,
            exposesAnswer: Object.prototype.hasOwnProperty.call(questions.body.data?.questions?.[0] ?? {}, "answer")
          }
        },
        null,
        2
      )
    );

    if (courses.status !== 200 || detail.status !== 200 || outline.status !== 200 || point.status !== 200 || questions.status !== 200) {
      throw new Error("One or more learning HTTP endpoints failed.");
    }
    if (questions.body.data?.questions?.[0]?.answer) {
      throw new Error("Question list must not expose answers.");
    }
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.learningCourse.delete({ where: { id: course.id } });
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
