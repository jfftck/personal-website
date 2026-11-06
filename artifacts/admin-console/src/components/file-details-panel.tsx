import {
  Check,
  FileText,
  FolderPlus,
  MoreHorizontal,
  X,
} from "lucide-react";
import type {
  ContentFile,
  ContentFileVersion,
  ContentFolder,
} from "@workspace/api-client-react";
import type { SubmitHandler, UseFormReturn } from "react-hook-form";
import {
  filenameFromTitle,
  isImageFile,
} from "@/lib/content-formatters";
import { ROOT_FOLDER_OPTION } from "@/lib/content-constants";
import { FileName, fileIcon, isEditableText } from "@/components/file-list-panel";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type MetadataFormValues = {
  title: string;
  description: string;
  date: string;
  folderPath: string;
  isWallpaper: boolean;
};

type FileDetailsPanelProps = {
  file: ContentFile | null;
  assignedDocuments: ContentFile[];
  folders: ContentFolder[];
  metadataForm: UseFormReturn<MetadataFormValues>;
  revisions: ContentFileVersion[] | undefined;
  revisionsLoading: boolean;
  revisionsError: string | null;
  isSaving: boolean;
  isRestoring: boolean;
  formatSize: (bytes: number) => string;
  onClose: () => void;
  onSaveMetadata: SubmitHandler<MetadataFormValues>;
  onCreateFolder: () => void;
  onTogglePublication: (file: ContentFile) => void | Promise<void>;
  onEditText: (file: ContentFile) => void;
  onRestoreRevision: (version: ContentFileVersion) => void;
};

export function FileDetailsPanel({
  file,
  assignedDocuments,
  folders,
  metadataForm,
  revisions,
  revisionsLoading,
  revisionsError,
  isSaving,
  isRestoring,
  formatSize,
  onClose,
  onSaveMetadata,
  onCreateFolder,
  onTogglePublication,
  onEditText,
  onRestoreRevision,
}: FileDetailsPanelProps) {
  const currentFolderPath = metadataForm.watch("folderPath") ?? "";
  return (
    <>
      <button
        className={`detail-backdrop ${file ? "visible" : ""}`}
        type="button"
        disabled={!file}
        aria-hidden={!file}
        aria-label="Close file details"
        onClick={onClose}
        data-testid="detail-panel-backdrop"
      />
      <aside
        className={`panel detail-panel ${file ? "mobile-visible" : ""}`}
        aria-label="Selected file details"
      >
        <div className="detail-top">
          <h2>File details</h2>
          {file ? (
            <button
              className="mini-action"
              type="button"
              aria-label="Close file details"
              onClick={onClose}
              data-testid="close-file-details"
            >
              <X />
            </button>
          ) : null}
        </div>
        {!file ? (
          <div className="detail-empty">
            <div>
              <div className="detail-empty-icon"><MoreHorizontal /></div>
              <p>Select a file to edit its title, content date, or text.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="detail-file">
              {file.contentType.toLowerCase().startsWith("image/") ? (
                <div className="detail-media-frame">
                  <img
                    className="detail-media"
                    src={file.url}
                    alt={file.title || file.name}
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              ) : file.contentType.toLowerCase().startsWith("video/") ? (
                <div className="detail-media-frame">
                  <video
                    className="detail-media"
                    src={file.url}
                    poster={file.posterUrl ?? undefined}
                    controls
                    playsInline
                    preload="metadata"
                    aria-label={`Preview ${file.title || file.name}`}
                  />
                </div>
              ) : (
                <div className="detail-file-icon">{fileIcon(file)}</div>
              )}
              <h3 title={file.title}>{file.title}</h3>
              <p title={`${file.name} · ${file.folderPath || "Root folder"}`}>
                {file.name} · {file.folderPath || "Root folder"}
              </p>
            </div>
            <Form {...metadataForm}>
              <form
                key={`${file.id}-${file.updatedAt}`}
                onSubmit={metadataForm.handleSubmit(onSaveMetadata)}
              >
                <FormField
                  control={metadataForm.control}
                  name="title"
                  rules={{ required: "Enter a title." }}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="field-label">Title</FormLabel>
                      <FormControl>
                        <input
                          className="field-control"
                          maxLength={220}
                          data-testid="input-file-title"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage data-testid="error-file-title" />
                      <p className="field-help file-name-preview">
                        File name:{" "}
                        <code
                          title={filenameFromTitle(
                            metadataForm.watch("title") ?? "",
                            metadataForm.watch("date") ?? "",
                            file.name,
                            file.contentType,
                            ".md",
                          ) || "Choose a title and date"}
                          data-testid="generated-file-name"
                        >
                          {filenameFromTitle(
                            metadataForm.watch("title") ?? "",
                            metadataForm.watch("date") ?? "",
                            file.name,
                            file.contentType,
                            ".md",
                          ) || "Choose a title and date"}
                        </code>
                      </p>
                    </FormItem>
                  )}
                />
                <div className="readonly-file-field">
                  <label className="field-label" htmlFor="input-file-original-name">
                    Original file name
                  </label>
                  <input
                    id="input-file-original-name"
                    className="field-control"
                    value={file.originalFileName ?? ""}
                    readOnly
                    placeholder="Not recorded for this file"
                    title={file.originalFileName || "Not recorded for this file"}
                    data-testid="input-file-original-name"
                  />
                  <p className="field-help">
                    Captured from the upload and kept unchanged. Edit the title to use a friendlier name.
                  </p>
                </div>
                <FormField
                  control={metadataForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="field-label">Description</FormLabel>
                      <FormControl>
                        <textarea
                          className="field-control field-textarea"
                          maxLength={2000}
                          rows={3}
                          placeholder="Add details about this file"
                          data-testid="input-file-description"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage data-testid="error-file-description" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={metadataForm.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="field-label">Content date</FormLabel>
                      <FormControl>
                        <input
                          className="field-control"
                          type="date"
                          data-testid="input-file-date"
                          {...field}
                          onChange={(event) => {
                            field.onChange(event);
                            metadataForm.clearErrors("date");
                          }}
                        />
                      </FormControl>
                      <FormMessage data-testid="error-file-date" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={metadataForm.control}
                  name="folderPath"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="field-label">Destination folder</FormLabel>
                      <div className="folder-picker-row">
                        <Select
                          value={currentFolderPath || ROOT_FOLDER_OPTION}
                          onValueChange={(value) =>
                            field.onChange(value === ROOT_FOLDER_OPTION ? "" : value)
                          }
                        >
                          <FormControl>
                            <SelectTrigger
                              className="field-control folder-picker-trigger"
                              title={field.value || "Root folder"}
                              data-testid="select-file-destination"
                              aria-label="Destination folder"
                            >
                              <SelectValue placeholder="Choose a folder" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value={ROOT_FOLDER_OPTION}>Root folder</SelectItem>
                            {[...folders]
                              .sort((a, b) => a.path.localeCompare(b.path))
                              .map((folder) => (
                                <SelectItem key={folder.id} value={folder.path}>
                                  {folder.path}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <button
                          className="button button-quiet folder-picker-create"
                          type="button"
                          onClick={onCreateFolder}
                          data-testid="create-folder-from-edit"
                        >
                          <FolderPlus /> New Folder
                        </button>
                      </div>
                      <FormMessage data-testid="error-file-destination" />
                    </FormItem>
                  )}
                />
                {isImageFile({ name: file.name, type: file.contentType }) ? (
                  <FormField
                    control={metadataForm.control}
                    name="isWallpaper"
                    render={({ field }) => (
                      <FormItem className="checkbox-item">
                        <FormControl>
                          <input
                            type="checkbox"
                            checked={field.value}
                            onChange={(event) => field.onChange(event.target.checked)}
                            onBlur={field.onBlur}
                            name={field.name}
                            ref={field.ref}
                            data-testid="checkbox-file-wallpaper"
                          />
                        </FormControl>
                        <div>
                          <FormLabel className="checkbox-label">
                            Allow as desktop wallpaper
                          </FormLabel>
                          <p className="field-help">
                            This image will be marked as eligible in the public file manifest.
                          </p>
                        </div>
                      </FormItem>
                    )}
                  />
                ) : null}
                <div className="detail-stats">
                  <div>
                    <span className="stat-label">Type</span>
                    <span className="stat-value" title={file.contentType}>
                      {file.contentType}
                    </span>
                  </div>
                  <div>
                    <span className="stat-label">Size</span>
                    <span className="stat-value">{formatSize(file.sizeBytes)}</span>
                  </div>
                  <div>
                    <span className="stat-label">Updated</span>
                    <span className="stat-value">
                      {new Date(file.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div>
                    <span className="stat-label">Publication</span>
                    <span
                      className={`publication-badge ${file.isPublished ? "is-published" : "is-unpublished"}`}
                      role="status"
                      data-testid={`publication-status-${file.id}`}
                    >
                      {file.isPublished ? "Published" : "Unpublished"}
                    </span>
                  </div>
                  <div>
                    <span className="stat-label">File URL</span>
                    <a
                      className="stat-value"
                      href={file.url}
                      target="_blank"
                      rel="noreferrer"
                      title={file.url}
                      data-testid={`file-public-url-${file.id}`}
                    >
                      {file.url}
                    </a>
                  </div>
                </div>
                <div className="detail-actions">
                  <button
                    className={`button ${file.isPublished ? "button-quiet" : "button-primary"}`}
                    type="button"
                    onClick={() => void onTogglePublication(file)}
                    disabled={isSaving}
                    aria-label={`${file.isPublished ? "Unpublish" : "Publish"} ${file.title}`}
                    data-testid={`toggle-publication-${file.id}`}
                  >
                    {file.isPublished ? "Unpublish" : "Publish"}
                  </button>
                  <button
                    className="button button-primary"
                    type="submit"
                    disabled={isSaving}
                    data-testid="save-file-details"
                  >
                    <Check /> Save Details
                  </button>
                  {isEditableText(file) ? (
                    <button
                      className="button button-quiet"
                      type="button"
                      onClick={() => onEditText(file)}
                      data-testid="open-text-editor"
                    >
                      <FileText /> Edit Text
                    </button>
                  ) : null}
                </div>
              </form>
            </Form>
            <p className="status-line">Choose the destination folder above.</p>
            {file.contentType.toLowerCase() === "text/css" && /\.css$/i.test(file.name) ? (
              <section
                className="stylesheet-assigned-documents"
                aria-labelledby="stylesheet-assigned-documents-title"
                data-testid="stylesheet-assigned-documents"
              >
                <div className="stylesheet-assigned-documents-heading">
                  <div>
                    <h3 id="stylesheet-assigned-documents-title">Assigned Documents</h3>
                    <p>Markdown documents that use this stylesheet.</p>
                  </div>
                  <span
                    className="count-pill"
                    aria-label={`${assignedDocuments.length} ${assignedDocuments.length === 1 ? "document" : "documents"}`}
                  >
                    {assignedDocuments.length}
                  </span>
                </div>
                {assignedDocuments.length ? (
                  <ul className="stylesheet-assigned-document-list">
                    {assignedDocuments.map((document) => (
                      <li key={document.id}>
                        <button
                          className="stylesheet-assigned-document"
                          type="button"
                          aria-label={`Edit ${document.title}`}
                          onClick={() => onEditText(document)}
                          data-testid={`stylesheet-assigned-document-${document.id}`}
                        >
                          <FileText aria-hidden="true" />
                          <span className="stylesheet-assigned-document-copy">
                            <strong title={document.title}>{document.title}</strong>
                            <small title={document.folderPath || "Root folder"}>
                              {document.folderPath || "Root folder"}
                            </small>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="stylesheet-assigned-document-empty" role="status">
                    No Markdown documents currently use this stylesheet.
                  </p>
                )}
              </section>
            ) : null}
            <section
              className="revision-history"
              aria-labelledby="revision-history-title"
              data-testid="revision-history"
            >
              <div className="revision-history-heading">
                <div>
                  <h3 id="revision-history-title">Revision History</h3>
                  <p>File bytes stay in App Storage; Git records each revision.</p>
                </div>
                <a
                  className="button button-quiet revision-repository-link"
                  href="https://github.com/jfftck/personal-files"
                  target="_blank"
                  rel="noreferrer"
                >
                  Repository
                </a>
              </div>
              {revisionsLoading ? (
                <div className="revision-loading" role="status">Loading revisions…</div>
              ) : revisionsError ? (
                <div className="revision-error" role="alert">{revisionsError}</div>
              ) : !revisions?.length ? (
                <div className="revision-empty">No revisions are available yet.</div>
              ) : (
                <ol className="revision-list">
                  {revisions.map((version, index) => (
                    <li
                      className="revision-item"
                      key={version.id}
                      data-testid={`revision-${version.versionNumber}`}
                    >
                      <div className="revision-item-header">
                        <strong
                          title={`Version ${version.versionNumber} · ${version.action[0].toUpperCase() + version.action.slice(1)}`}
                        >
                          Version {version.versionNumber} · {version.action[0].toUpperCase() + version.action.slice(1)}
                        </strong>
                        <time
                          dateTime={version.createdAt}
                          title={new Date(version.createdAt).toLocaleString()}
                        >
                          {new Date(version.createdAt).toLocaleString()}
                        </time>
                      </div>
                      <p
                        className="revision-file"
                        title={`${version.title} · ${version.name} · ${version.folderPath || "Root folder"} · ${version.date}`}
                      >
                        {version.title} <span>·</span> {version.name} <span>·</span>{" "}
                        {version.folderPath || "Root folder"} <span>·</span> {version.date}
                      </p>
                      <div className="revision-item-footer">
                        <a href={version.gitUrl} target="_blank" rel="noreferrer">
                          Commit {version.gitCommitSha.slice(0, 7)}
                        </a>
                        {index === 0 ? (
                          <span className="revision-current">Current</span>
                        ) : (
                          <button
                            className="button button-quiet revision-restore"
                            type="button"
                            disabled={isRestoring}
                            onClick={() => onRestoreRevision(version)}
                            data-testid={`restore-revision-${version.versionNumber}`}
                          >
                            Restore This Version
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </>
        )}
      </aside>
    </>
  );
}
