import { useRef, useState } from 'react';
import type { DragEvent } from 'react';
import type { SubmitHandler, UseFormReturn } from 'react-hook-form';
import type { ContentFolder } from '@workspace/api-client-react';
import { FileText, Folder, FolderPlus, Upload, X } from 'lucide-react';
import { isImageFile } from '@/lib/content-formatters';
import type { UploadFormValues } from '@/lib/content-dialog-types';
import { ROOT_FOLDER_OPTION } from '@/lib/content-constants';
import { handleDialogKeyDown } from '@/components/dialog-interactions';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type UploadMode = 'upload' | 'markdown';

type UploadDialogProps = {
  form: UseFormReturn<UploadFormValues>;
  folders: ContentFolder[];
  uploadMode: UploadMode;
  uploadFile: File | null;
  generatedName: string;
  isBusy: boolean;
  formatSize: (bytes: number) => string;
  onChooseFile: (file?: File) => void;
  onCreateFolder: () => void;
  onClose: () => void;
  onSubmit: SubmitHandler<UploadFormValues>;
};

export function UploadDialog({
  form,
  folders,
  uploadMode,
  uploadFile,
  generatedName,
  isBusy,
  formatSize,
  onChooseFile,
  onCreateFolder,
  onClose,
  onSubmit,
}: UploadDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const title = form.watch('title') ?? '';

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files[0]) onChooseFile(event.dataTransfer.files[0]);
  };

  return (
    <div
      className="overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isBusy) onClose();
      }}
    >
      <Form {...form}>
        <form
          className="dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="upload-dialog-title"
          onSubmit={form.handleSubmit(onSubmit)}
          onKeyDown={(event) => handleDialogKeyDown(event, onClose, !isBusy)}
        >
          <div className="dialog-head">
            <div>
              <h2 id="upload-dialog-title">
                {uploadMode === 'markdown' ? 'New Markdown Document' : 'Add to the library'}
              </h2>
              <p>{uploadMode === 'markdown' ? 'Creates an editable .md file.' : 'Stored in App Storage'}</p>
            </div>
            <button
              className="mini-action"
              type="button"
              aria-label="Close upload dialog"
              disabled={isBusy}
              onClick={onClose}
              data-testid="close-upload-dialog"
            >
              <X />
            </button>
          </div>
          <div className="upload-destination" data-testid="upload-destination">
            <Folder aria-hidden="true" />
            <div className="upload-destination-main">
              <span>{uploadMode === 'markdown' ? 'Document destination' : 'Upload destination'}</span>
              <FormField
                control={form.control}
                name="folderPath"
                render={({ field }) => (
                  <FormItem>
                    <div className="folder-picker-row">
                      <Select
                        value={field.value || ROOT_FOLDER_OPTION}
                        onValueChange={(value) => field.onChange(value === ROOT_FOLDER_OPTION ? '' : value)}
                      >
                        <FormControl>
                          <SelectTrigger
                            className="field-control folder-picker-trigger"
                            title={field.value || 'Root folder'}
                            data-testid="select-upload-destination"
                            aria-label="Upload destination folder"
                          >
                            <SelectValue placeholder="Choose a folder" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={ROOT_FOLDER_OPTION}>Root folder</SelectItem>
                          {[...folders].sort((a, b) => a.path.localeCompare(b.path)).map((folder) => (
                            <SelectItem key={folder.id} value={folder.path}>{folder.path}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <button
                        className="button button-quiet folder-picker-create"
                        type="button"
                        onClick={onCreateFolder}
                        data-testid="create-folder-from-upload"
                      >
                        <FolderPlus /> New Folder
                      </button>
                    </div>
                    <FormMessage data-testid="error-upload-destination" />
                  </FormItem>
                )}
              />
            </div>
          </div>
          {uploadMode === 'markdown' ? (
            <div className="markdown-create-note">
              <FileText aria-hidden="true" />
              <div><strong>Markdown (.md)</strong><span>A starter heading is created; edit the document after saving.</span></div>
            </div>
          ) : (
            <>
              <input
                ref={fileInputRef}
                type="file"
                hidden
                onChange={(event) => {
                  onChooseFile(event.target.files?.[0]);
                  event.currentTarget.value = '';
                }}
                data-testid="input-upload-file"
              />
              <button
                className={`dropzone ${dragging ? 'dragging' : ''}`}
                type="button"
                autoFocus
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                data-testid="upload-dropzone"
              >
                <div>
                  <Upload />
                  <strong>{uploadFile ? uploadFile.name : 'Choose a file or drop it here'}</strong>
                  <span>
                    {uploadFile
                      ? `${formatSize(uploadFile.size)} · ${uploadFile.type || 'application/octet-stream'}`
                      : 'File type and size are read from the actual file.'}
                  </span>
                </div>
              </button>
            </>
          )}
          <FormField
            control={form.control}
            name="title"
            rules={{ required: 'Enter a title.' }}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="field-label">Title</FormLabel>
                <FormControl>
                  <input
                    className="field-control"
                    maxLength={220}
                    autoFocus={uploadMode === 'markdown'}
                    data-testid="input-upload-title"
                    {...field}
                  />
                </FormControl>
                <FormMessage data-testid="error-upload-title" />
                <p className="field-help file-name-preview">
                  File name:{' '}
                  <code
                    title={generatedName || (uploadMode === 'markdown'
                      ? 'Enter a title to preview the .md filename'
                      : 'Choose a file to preview its filename')}
                    data-testid="generated-upload-filename"
                  >
                    {generatedName || (uploadMode === 'markdown'
                      ? 'Enter a title to preview the .md filename'
                      : 'Choose a file to preview its filename')}
                  </code>
                </p>
              </FormItem>
            )}
          />
          {uploadMode === 'upload' ? (
            <div className="readonly-file-field">
              <label className="field-label" htmlFor="input-upload-original-name">Original file name</label>
              <input
                id="input-upload-original-name"
                className="field-control"
                value={uploadFile?.name ?? ''}
                readOnly
                placeholder="Choose a file first"
                data-testid="input-upload-original-name"
              />
              <p className="field-help">Captured from the selected file and kept unchanged. Edit the title to use a friendlier name.</p>
            </div>
          ) : null}
          <FormField
            control={form.control}
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
                    data-testid="input-upload-description"
                    {...field}
                  />
                </FormControl>
                <FormMessage data-testid="error-upload-description" />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="field-label">Content date</FormLabel>
                <FormControl>
                  <input
                    className="field-control"
                    type="date"
                    data-testid="input-upload-date"
                    {...field}
                    onChange={(event) => {
                      field.onChange(event);
                      form.clearErrors('date');
                    }}
                  />
                </FormControl>
                <FormMessage data-testid="error-upload-date" />
                <p className="field-help">The selected local date is saved in ISO format.</p>
              </FormItem>
            )}
          />
          {uploadFile && isImageFile(uploadFile) ? (
            <FormField
              control={form.control}
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
                      data-testid="checkbox-upload-wallpaper"
                    />
                  </FormControl>
                  <div>
                    <FormLabel className="checkbox-label">Allow as desktop wallpaper</FormLabel>
                    <p className="field-help">This image will be marked as eligible in the public file manifest.</p>
                  </div>
                </FormItem>
              )}
            />
          ) : null}
          <div className="dialog-footer">
            <button className="button button-quiet" type="button" disabled={isBusy} onClick={onClose} data-testid="cancel-upload">
              Cancel
            </button>
            <button
              className="button button-primary"
              type="submit"
              disabled={(uploadMode === 'upload' && !uploadFile) || !title.trim() || isBusy}
              data-testid="submit-upload"
            >
              {isBusy ? 'Saving…' : uploadMode === 'markdown' ? 'Create Document' : 'Upload File'}
            </button>
          </div>
        </form>
      </Form>
    </div>
  );
}
