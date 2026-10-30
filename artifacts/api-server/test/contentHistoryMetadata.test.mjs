import assert from "node:assert/strict";
import test from "node:test";

const {
  createContentFileVersionSnapshot,
  restoreContentFileRevisionMetadata,
} = await import("../src/lib/contentRevisionMetadata.ts");

const originalFile = {
  id: "file-id",
  name: "20261030_Original_title.md",
  title: "Original title",
  folderPath: "documents",
  contentDate: "2026-10-30",
  contentType: "text/markdown",
  sizeBytes: 30,
  objectPath: "documents/original.md",
  sourceUrl: null,
  posterUrl: null,
  isWallpaper: false,
  isPublished: true,
  deletedAt: null,
};

test("a title edit records the new title, date, and generated filename together", () => {
  const snapshot = createContentFileVersionSnapshot({
    ...originalFile,
    name: "20261030_Renamed_title.md",
    title: "Renamed title",
  });

  assert.deepEqual(
    {
      title: snapshot.title,
      date: snapshot.contentDate,
      name: snapshot.name,
    },
    {
      title: "Renamed title",
      date: "2026-10-30",
      name: "20261030_Renamed_title.md",
    },
  );
});

test("a date edit records the new date, title, and generated filename together", () => {
  const snapshot = createContentFileVersionSnapshot({
    ...originalFile,
    name: "20261102_Original_title.md",
    contentDate: "2026-11-02",
  });

  assert.deepEqual(
    {
      title: snapshot.title,
      date: snapshot.contentDate,
      name: snapshot.name,
    },
    {
      title: "Original title",
      date: "2026-11-02",
      name: "20261102_Original_title.md",
    },
  );
});

test("restoring an older revision returns its title, date, and filename as one unit", () => {
  const olderRevision = createContentFileVersionSnapshot(originalFile);
  const restored = restoreContentFileRevisionMetadata(olderRevision);

  assert.deepEqual(restored, {
    name: "20261030_Original_title.md",
    title: "Original title",
    contentDate: "2026-10-30",
  });
});
