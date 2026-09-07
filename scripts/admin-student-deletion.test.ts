import assert from "node:assert/strict";
import test from "node:test";
import { collectStudentStorageKeys } from "../src/lib/admin-student-deletion";

test("collectStudentStorageKeys collects and deduplicates student-owned objects", () => {
  const keys = collectStudentStorageKeys({
    studentProfile: {
      avatarImage: "/api/avatars/student-1/123e4567-e89b-42d3-a456-426614174000.webp"
    },
    aiStudyProjects: [
      {
        id: "project-1",
        sources: [
          {
            id: "source-1",
            storageKey: "ai-study/project-1/source-1/original.pdf",
            parseManifestKey: "ai-study/project-1/source-1/mineru/manifest.json",
            parseContentListKey: "ai-study/project-1/source-1/mineru/content-list.json",
            parseMarkdownKey: "ai-study/project-1/source-1/mineru/document.md",
            blocks: [
              { assetKey: "ai-study/project-1/source-1/mineru/images/figure-1.png" },
              { assetKey: "ai-study/project-1/source-1/mineru/images/figure-1.png" }
            ]
          }
        ]
      }
    ]
  });

  assert.deepEqual(new Set(keys), new Set([
    "avatars/student-1/123e4567-e89b-42d3-a456-426614174000.webp",
    "ai-study/project-1/source-1/original.pdf",
    "ai-study/project-1/source-1/mineru/document.md",
    "ai-study/project-1/source-1/mineru/content-list.json",
    "ai-study/project-1/source-1/mineru/middle.json",
    "ai-study/project-1/source-1/mineru/manifest.json",
    "ai-study/project-1/source-1/mineru/images/figure-1.png"
  ]));
  assert.equal(keys.length, 7);
});

test("collectStudentStorageKeys ignores avatars that are not stored object URLs", () => {
  const keys = collectStudentStorageKeys({
    studentProfile: { avatarImage: "data:image/webp;base64,abc" },
    aiStudyProjects: []
  });

  assert.deepEqual(keys, []);
});
