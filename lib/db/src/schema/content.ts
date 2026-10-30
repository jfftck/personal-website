import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const contentFoldersTable = pgTable(
  "content_folders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    path: text("path").notNull(),
    parentPath: text("parent_path").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("content_folders_path_unique").on(table.path)],
);

export const contentFilesTable = pgTable(
  "content_files",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    title: text("title").notNull().default(""),
    folderPath: text("folder_path").notNull().default(""),
    contentDate: date("content_date", { mode: "string" }).notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    objectPath: text("object_path"),
    sourceUrl: text("source_url"),
    posterUrl: text("poster_url"),
    isWallpaper: boolean("is_wallpaper").notNull().default(false),
    isPublished: boolean("is_published").notNull().default(true),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("content_files_folder_name_unique").on(
      table.folderPath,
      table.name,
    ).where(sql`${table.deletedAt} IS NULL`),
  ],
);

export type ContentFileVersionSnapshot = {
  name: string;
  title: string;
  folderPath: string;
  contentDate: string;
  contentType: string;
  sizeBytes: number;
  objectPath: string | null;
  sourceUrl: string | null;
  posterUrl: string | null;
  isWallpaper: boolean;
  isPublished: boolean;
  deletedAt: string | null;
};

export const contentFileVersionsTable = pgTable(
  "content_file_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => contentFilesTable.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    action: text("action").notNull(),
    snapshot: jsonb("snapshot")
      .$type<ContentFileVersionSnapshot>()
      .notNull(),
    gitPath: text("git_path").notNull(),
    gitCommitSha: text("git_commit_sha").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("content_file_versions_number_unique").on(
      table.fileId,
      table.versionNumber,
    ),
    uniqueIndex("content_file_versions_git_path_unique").on(table.gitPath),
  ],
);

export const insertContentFolderSchema = createInsertSchema(
  contentFoldersTable,
).omit({ id: true, createdAt: true });

export const insertContentFileSchema = createInsertSchema(
  contentFilesTable,
).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });

export type InsertContentFolder = z.infer<typeof insertContentFolderSchema>;
export type ContentFolder = typeof contentFoldersTable.$inferSelect;
export type InsertContentFile = z.infer<typeof insertContentFileSchema>;
export type ContentFile = typeof contentFilesTable.$inferSelect;
export type ContentFileVersion =
  typeof contentFileVersionsTable.$inferSelect;
