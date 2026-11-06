import type { SubmitHandler, UseFormReturn } from 'react-hook-form';
import type { ContentFolder } from '@workspace/api-client-react';
import { X } from 'lucide-react';
import type { FolderFormValues } from '@/lib/content-dialog-types';
import { ROOT_FOLDER_OPTION } from '@/lib/content-constants';
import { handleDialogKeyDown } from '@/components/dialog-interactions';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type FolderDialogProps = {
  editingFolder: ContentFolder | null;
  parentOptions: ContentFolder[];
  parentPath: string;
  form: UseFormReturn<FolderFormValues>;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: SubmitHandler<FolderFormValues>;
};

export function FolderDialog({
  editingFolder,
  parentOptions,
  parentPath,
  form,
  isSaving,
  onClose,
  onSubmit,
}: FolderDialogProps) {
  return (
    <div
      className="overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <Form {...form}>
        <form
          className="dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="folder-dialog-title"
          onSubmit={form.handleSubmit(onSubmit)}
          onKeyDown={(event) => handleDialogKeyDown(event, onClose, true)}
        >
          <div className="dialog-head">
            <div>
              <h2 id="folder-dialog-title">{editingFolder ? 'Move or rename folder' : 'Create folder'}</h2>
              <p>
                {editingFolder
                  ? editingFolder.path
                  : parentPath
                    ? `Inside ${parentPath}`
                    : 'At the top level of your library'}
              </p>
            </div>
            <button
              className="mini-action"
              type="button"
              aria-label="Close dialog"
              onClick={onClose}
              data-testid="close-folder-dialog"
            >
              <X />
            </button>
          </div>
          <FormField
            control={form.control}
            name="name"
            rules={{ required: 'Enter a folder name.' }}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="field-label">Folder name</FormLabel>
                <FormControl>
                  <input
                    className="field-control"
                    maxLength={120}
                    autoFocus
                    data-testid="input-folder-name"
                    {...field}
                    onChange={(event) => {
                      field.onChange(event);
                      form.clearErrors('name');
                    }}
                  />
                </FormControl>
                <FormMessage role="alert" data-testid="error-folder-name" />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="parentPath"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="field-label">{editingFolder ? 'Move to parent folder' : 'Parent folder'}</FormLabel>
                <Select
                  value={field.value || ROOT_FOLDER_OPTION}
                  onValueChange={(value) => {
                    field.onChange(value === ROOT_FOLDER_OPTION ? '' : value);
                    form.clearErrors('parentPath');
                  }}
                >
                  <FormControl>
                    <SelectTrigger className="field-control" data-testid="select-folder-parent" aria-label="Parent folder">
                      <SelectValue placeholder="Choose a parent folder" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={ROOT_FOLDER_OPTION}>Root folder</SelectItem>
                    {parentOptions.map((folder) => (
                      <SelectItem key={folder.id} value={folder.path}>{folder.path}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage role="alert" data-testid="error-folder-parent" />
              </FormItem>
            )}
          />
          <div className="dialog-footer">
            <button className="button button-quiet" type="button" onClick={onClose} data-testid="cancel-folder">
              Cancel
            </button>
            <button
              className="button button-primary"
              type="submit"
              disabled={!form.watch('name')?.trim() || isSaving}
              data-testid="save-folder"
            >
              {editingFolder ? 'Save Changes' : 'Create Folder'}
            </button>
          </div>
        </form>
      </Form>
    </div>
  );
}
