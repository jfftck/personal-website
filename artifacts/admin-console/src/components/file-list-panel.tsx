import type { KeyboardEvent, ReactNode } from 'react';
import { File, FileImage, FileText, Film, Folder, Pencil, Trash2 } from 'lucide-react';
import type { ContentFile } from '@workspace/api-client-react';

type FileListPanelProps = {
  files: ContentFile[];
  selectedFileId: string | null;
  selectedFolder: string;
  search: string;
  emptyState: ReactNode;
  formatSize: (bytes: number) => string;
  onSelectFile: (file: ContentFile) => void;
  onEditText: (file: ContentFile) => void;
  onMoveToTrash: (file: ContentFile) => void;
};

export function FileListPanel({
  files,
  selectedFileId,
  selectedFolder,
  search,
  emptyState,
  formatSize,
  onSelectFile,
  onEditText,
  onMoveToTrash,
}: FileListPanelProps) {
  const handleRowKeyDown = (event: KeyboardEvent<HTMLDivElement>, file: ContentFile) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelectFile(file);
    }
  };

  return (
    <section className="panel list-panel" aria-label="Files">
      <div className="list-toolbar">
        <div className="list-title"><Folder size={16} /> Files <span className="count-pill">{files.length}</span></div>
        <span
          className="list-hint"
          title={search ? 'Search results across the library' : selectedFolder || 'Private library · public delivery enabled'}
        >
          {search ? 'Search results across the library' : selectedFolder ? selectedFolder : 'Private library · public delivery enabled'}
        </span>
      </div>
      <div className="file-table-head"><span>Title</span><span>Content date</span><span>Size</span><span /></div>
      {files.length === 0 ? emptyState : files.map((file) => (
        <div
          key={file.id}
          className={`file-row ${selectedFileId === file.id ? 'selected' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => onSelectFile(file)}
          onKeyDown={(event) => handleRowKeyDown(event, file)}
          aria-label={`Select ${file.title}`}
          data-testid={`file-row-${file.id}`}
        >
          <FileName file={file} />
          <span className="table-meta table-date">{file.date}</span>
          <span className="table-meta table-size">{formatSize(file.sizeBytes)}</span>
          <div className="row-actions">
            {isEditableText(file) ? (
              <button
                className="mini-action"
                type="button"
                title="Edit Text"
                aria-label={`Edit ${file.title}`}
                onClick={(event) => { event.stopPropagation(); onEditText(file); }}
                data-testid={`edit-text-${file.id}`}
              >
                <Pencil />
              </button>
            ) : null}
            <button
              className="mini-action"
              type="button"
              title="Move to Trash"
              aria-label={`Move ${file.title} to trash`}
              onClick={(event) => { event.stopPropagation(); onMoveToTrash(file); }}
              data-testid={`trash-file-${file.id}`}
            >
              <Trash2 />
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}

export function fileIcon(file: ContentFile) {
  const type = file.contentType.toLowerCase();
  if (type.startsWith('image/')) return <FileImage aria-hidden="true" />;
  if (type.startsWith('video/')) return <Film aria-hidden="true" />;
  if (/\.md$|\.markdown$|\.txt$|\.csv$/i.test(file.name) || type.startsWith('text/')) return <FileText aria-hidden="true" />;
  return <File aria-hidden="true" />;
}

export function isEditableText(file: ContentFile) {
  return /\.(md|markdown|txt|csv)$/i.test(file.name);
}

export function FileName({ file }: { file: ContentFile }) {
  return (
    <div className="file-name-cell">
      <div className="file-icon">{fileIcon(file)}</div>
      <div className="file-name-wrap">
        <span className="file-name" title={file.title} data-testid={`text-file-name-${file.id}`}>{file.title}</span>
        <span className="file-sub" title={`${file.name} · ${file.folderPath || 'Root'} · ${file.contentType}`}>
          {file.name} · {file.folderPath || 'Root'} · {file.contentType}
        </span>
      </div>
    </div>
  );
}
