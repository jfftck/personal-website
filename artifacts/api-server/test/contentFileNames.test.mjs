import assert from "node:assert/strict";
import test from "node:test";
import {
  assertGeneratedFileNameAvailable,
  CONTENT_NAME_CONFLICT_MESSAGE,
  ContentNameConflictError,
  standardFileName,
} from "../src/lib/contentFileNames.ts";
import {
  filenameFromTitle,
  normalizeDateForApi,
  titleFromFilename,
} from "../../admin-console/src/lib/content-formatters.ts";

const date = "2026-10-30";

test("native date input values normalize after submission", () => {
  assert.equal(normalizeDateForApi("2026-10-30"), "2026-10-30");
  assert.equal(normalizeDateForApi("2026-02-30"), null);
  assert.equal(normalizeDateForApi(""), null);
});

test("Markdown creation previews match the server-generated date-prefixed name", () => {
  const preview = filenameFromTitle(
    "Weekly update",
    date,
    "new-document.md",
    "text/markdown",
    ".md",
  );

  assert.equal(preview, "20261030_Weekly_update.md");
  assert.equal(standardFileName("Weekly update", date, ".md"), preview);
});

test("uploads preserve the selected file extension across images, videos, and documents", () => {
  const uploads = [
    { original: "Beach Photo.JPG", title: "Beach Photo.JPG", type: "image/jpeg", expected: "20261030_Beach_Photo.jpg" },
    { original: "Summer Tour.MP4", title: "Summer Tour.MP4", type: "video/mp4", expected: "20261030_Summer_Tour.mp4" },
    { original: "Meeting Notes.DOCX", title: "Meeting Notes.DOCX", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", expected: "20261030_Meeting_Notes.docx" },
    { original: "Scan.PDF", title: "Scan.PDF", type: "application/pdf", expected: "20261030_Scan.pdf" },
  ];

  for (const upload of uploads) {
    const preview = filenameFromTitle(
      upload.title,
      date,
      upload.original,
      upload.type,
      ".bin",
    );
    assert.equal(preview, upload.expected, upload.original);
    assert.equal(
      standardFileName(upload.title, date, upload.original.slice(upload.original.lastIndexOf("."))),
      preview,
      `${upload.original}: server and preview should agree`,
    );
  }
});

test("editing title or date changes the expected filename and normalizes punctuation", () => {
  assert.equal(
    filenameFromTitle("Café: 100% / summer!", date, "old-name.md", "text/markdown"),
    "20261030_Café_100_summer.md",
  );
  assert.equal(
    standardFileName("Café: 100% / summer!", date, ".md"),
    "20261030_Café_100_summer.md",
  );
  assert.equal(
    filenameFromTitle("Café: 100% / summer!", "2026-11-02", "old-name.md", "text/markdown"),
    "20261102_Café_100_summer.md",
  );
  assert.equal(
    standardFileName("Updated Title", "2026-11-02", ".jpg"),
    "20261102_Updated_Title.jpg",
  );
});

test("long Unicode titles stay within the filename limit without splitting characters", () => {
  const title = "🎉".repeat(200);
  const preview = filenameFromTitle(title, date, "upload.pdf", "application/pdf");
  const serverName = standardFileName(title, date, ".pdf");

  assert.equal(preview, serverName);
  assert.ok(preview.length <= 255);
  assert.ok(!preview.includes("\uFFFD"));
  assert.ok(preview.endsWith(".pdf"));
});

test("upload titles retain the original basename, including common extensions", () => {
  assert.equal(titleFromFilename("C:\\fakepath\\Summer Tour.MP4"), "Summer Tour.MP4");
  assert.equal(titleFromFilename("/tmp/Meeting Notes.DOCX"), "Meeting Notes.DOCX");
});

test("a generated-name collision raises a clear 409 before a write can proceed", () => {
  let inserted = false;
  assert.throws(
    () => {
      assertGeneratedFileNameAvailable(true);
      inserted = true;
    },
    (error) => {
      assert.ok(error instanceof ContentNameConflictError);
      assert.equal(error.status, 409);
      assert.equal(error.message, CONTENT_NAME_CONFLICT_MESSAGE);
      return true;
    },
  );
  assert.equal(inserted, false);
  assert.doesNotThrow(() => assertGeneratedFileNameAvailable(false));
});
