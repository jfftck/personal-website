import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import {
  Archive, ChevronRight, FileText, Folder, FolderPlus, Menu,
  Plus, RefreshCw, Search, Upload, X,
} from 'lucide-react';
import {
  getContentFileContent,
  getGetContentFileVersionsQueryKey, getGetContentTrashQueryKey, getGetContentTreeQueryKey,
  useCreateContentFile, useCreateContentFolder, useCreateContentUpload,
  useDeleteContentFile, useDeleteContentFolder, useGetContentTrash,
  useGetContentFileVersions, useGetContentTree, useRestoreContentFile,
  useRestoreContentFileVersion, useUpdateContentFile, useUpdateContentFolder,
  type ContentFile, type ContentFileVersion, type ContentFolder,
} from '@workspace/api-client-react';
import {
  filenameFromTitle,
  isImageFile,
  normalizeDateForApi,
  titleFromFilename,
} from '@/lib/content-formatters';
import { ErrorBoundary } from '@/components/error-boundary';
import {
  FileDetailsPanel,
  type MetadataFormValues,
} from '@/components/file-details-panel';
import { FileListPanel, FileName } from '@/components/file-list-panel';
import { FolderDialog } from '@/components/folder-dialog';
import { UploadDialog } from '@/components/upload-dialog';
import type { FolderFormValues, UploadFormValues } from '@/lib/content-dialog-types';
import { FolderNavigation } from '@/components/folder-navigation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { useAuth } from '@workspace/replit-auth-web';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 20_000, retry: 1, refetchOnWindowFocus: true } },
});
const localToday = () => {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};
const TODAY = localToday();
const UPLOAD_TODAY = TODAY;
const THEME_STORAGE_KEY = 'jmt-console-theme';
type ThemeOverride = 'light' | 'dark' | null;
const DEFAULT_STYLESHEET_OPTION = '__document_default__';
const CREATE_STYLESHEET_OPTION = '__create_stylesheet__';
const MAX_STYLESHEET_BYTES = 256_000;

function isStylesheetFile(file: ContentFile) {
  return file.contentType.toLowerCase() === 'text/css' && /\.css$/i.test(file.name);
}

function createStylesheetPreviewDocument(cssText: string) {
  const safeCssText = cssText.replace(/<\/style/gi, '\\3C /style');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    :root { color-scheme: light; --app-text: #24313d; --accent: #236b88; --accent-light: #3284a3; --app-border: #d7e0e5; }
    html { min-height: 100%; background: #edf1f3; }
    body { min-height: 100vh; margin: 0; padding: 28px; background: #fff; color: #24313d; font: 16px/1.65 Georgia, "Times New Roman", serif; }
    .doc-body { max-width: 68ch; margin: 0 auto; line-height: 1.75; color: var(--app-text); font-size: 16px; }
    .doc-body h1 { margin: 0 0 .35em; font: 700 1.75em/1.2 Georgia, "Times New Roman", serif; }
    .doc-body h2 { margin: 1.8em 0 .5em; color: var(--accent); font: 600 1.2em/1.3 Georgia, "Times New Roman", serif; }
    .doc-body p, .doc-body ul, .doc-body blockquote, .doc-body pre, .doc-body table { margin: 0 0 1em; }
    .doc-body ul { padding-left: 1.5em; }
    .doc-body blockquote { border-left: 3px solid var(--accent); padding-left: 1em; color: #50606a; }
    .doc-body code { border-radius: 4px; background: #edf3f5; padding: .1em .35em; font: .9em ui-monospace, monospace; }
    .doc-body pre { overflow-x: auto; border: 1px solid var(--app-border); border-radius: 8px; padding: 1em; background: #f5f7f8; }
    .doc-body pre code { padding: 0; background: transparent; }
    .doc-body .md-table { width: 100%; border-collapse: collapse; }
    .doc-body .md-table th, .doc-body .md-table td { border: 1px solid var(--app-border); padding: .45em .65em; text-align: left; }
    .doc-body .md-table th { background: #eaf1f4; }
    @media (max-width: 600px) { body { padding: 20px; } }
  </style>
  <style>${safeCssText}</style>
</head>
<body class="doc-body">
  <h1>Notes from the Coast</h1>
  <p>This sample shows how a document stylesheet affects headings, paragraphs, links, lists, tables, and code.</p>
  <h2>A little structure</h2>
  <p>Readable documents benefit from a clear rhythm. A stylesheet can change the type, spacing, and color without changing the original Markdown.</p>
  <ul>
    <li>Keep headings easy to scan</li>
    <li>Give longer passages room to breathe</li>
  </ul>
  <blockquote>Good typography should make the content easier to read, not compete with it.</blockquote>
  <p>Inline code: <code>const title = "Hello";</code></p>
  <pre><code>function greet(name) {
  return \`Hello, \${name}!\`;
}</code></pre>
  <table class="md-table">
    <thead><tr><th>Day</th><th>Weather</th></tr></thead>
    <tbody><tr><td>Monday</td><td>Cloudy</td></tr><tr><td>Tuesday</td><td>Clear</td></tr></tbody>
  </table>
</body>
</html>`;
}

function isMarkdownDocument(file: ContentFile) {
  return /\.(md|markdown)$/i.test(file.name) &&
    /^text\/(markdown|plain)/i.test(file.contentType);
}

function systemPrefersDark() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

function savedThemeOverride(): ThemeOverride {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved !== 'light' && saved !== 'dark') return null;
  return (saved === 'dark') === systemPrefersDark() ? null : saved;
}

type ContentTreeData = { folders: ContentFolder[]; files: ContentFile[] };

function displaySize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = bytes / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) { size /= 1024; index += 1; }
  return `${size < 10 ? size.toFixed(1) : Math.round(size)} ${units[index]}`;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <RoutedBoundary>
            <Switch>
              <Route path="/" component={Console} />
              <Route component={NotFound} />
            </Switch>
          </RoutedBoundary>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function RoutedBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function Console() {
  const {
    isLoading: authLoading,
    isAuthenticated: signedIn,
    isOwner,
    login,
    logout,
  } = useAuth();
  const [systemDark, setSystemDark] = useState(systemPrefersDark);
  const [themeOverride, setThemeOverride] = useState<ThemeOverride>(savedThemeOverride);
  const dark = themeOverride ? themeOverride === 'dark' : systemDark;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [view, setView] = useState<'library' | 'trash'>('library');
  const [selectedFolder, setSelectedFolder] = useState('');
  const [selectedFile, setSelectedFile] = useState<ContentFile | null>(null);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'folder' | 'upload' | null>(null);
  const [editingFolder, setEditingFolder] = useState<ContentFolder | null>(null);
  const [folderModalReturnTo, setFolderModalReturnTo] = useState<'upload' | 'edit' | null>(null);
  const [pendingEditFolderPath, setPendingEditFolderPath] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadMode, setUploadMode] = useState<'upload' | 'markdown'>('upload');
  const [uploadBusy, setUploadBusy] = useState(false);
  const [editorFile, setEditorFile] = useState<ContentFile | null>(null);
  const [editorText, setEditorText] = useState('');
  const [editorBusy, setEditorBusy] = useState(false);
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorStylesheetId, setEditorStylesheetId] = useState('');
  const [stylesheetEditorOpen, setStylesheetEditorOpen] = useState(false);
  const [stylesheetFile, setStylesheetFile] = useState<ContentFile | null>(null);
  const [stylesheetTitle, setStylesheetTitle] = useState('');
  const [stylesheetText, setStylesheetText] = useState('');
  const [stylesheetPreviewViewport, setStylesheetPreviewViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [stylesheetLoading, setStylesheetLoading] = useState(false);
  const [stylesheetBusy, setStylesheetBusy] = useState(false);
  const [stylesheetError, setStylesheetError] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const queryClient = useQueryClient();

  const treeQuery = useGetContentTree({
    query: { enabled: isOwner, queryKey: getGetContentTreeQueryKey() },
  });
  const fileVersionsQuery = useGetContentFileVersions(selectedFile?.id ?? '', {
    query: { enabled: isOwner && Boolean(selectedFile) },
  });
  const trashQuery = useGetContentTrash({
    query: { enabled: isOwner, queryKey: getGetContentTrashQueryKey() },
  });
  const createFolder = useCreateContentFolder();
  const updateFolder = useUpdateContentFolder();
  const deleteFolder = useDeleteContentFolder();
  const createUpload = useCreateContentUpload();
  const createFile = useCreateContentFile();
  const updateFile = useUpdateContentFile();
  const deleteFile = useDeleteContentFile();
  const restoreFile = useRestoreContentFile();
  const restoreFileVersion = useRestoreContentFileVersion();
  const folderForm = useForm<FolderFormValues>({ defaultValues: { name: '', parentPath: '' } });
  const uploadForm = useForm<UploadFormValues>({
    defaultValues: { title: '', description: '', date: UPLOAD_TODAY, folderPath: '', isWallpaper: false },
  });
  const metadataForm = useForm<MetadataFormValues>({
    defaultValues: { title: '', description: '', date: TODAY, folderPath: '', isWallpaper: false },
  });
  const resetMetadataRef = useRef(metadataForm.reset);
  resetMetadataRef.current = metadataForm.reset;
  const stylesheetTextBytes = useMemo(() => new Blob([stylesheetText]).size, [stylesheetText]);
  const stylesheetPreviewDocument = useMemo(
    () => stylesheetTextBytes <= MAX_STYLESHEET_BYTES ? createStylesheetPreviewDocument(stylesheetText) : '',
    [stylesheetText, stylesheetTextBytes],
  );

  const patchTreeCache = useCallback((update: (tree: ContentTreeData) => ContentTreeData) => {
    const queryKey = getGetContentTreeQueryKey();
    if (!queryClient.getQueryData<ContentTreeData>(queryKey)) {
      void queryClient.invalidateQueries({ queryKey });
      return;
    }
    queryClient.setQueryData<ContentTreeData>(queryKey, (current) => current ? update(current) : current);
  }, [queryClient]);
  const patchTrashCache = useCallback((update: (files: ContentFile[]) => ContentFile[]) => {
    const queryKey = getGetContentTrashQueryKey();
    if (!queryClient.getQueryData<ContentFile[]>(queryKey)) {
      void queryClient.invalidateQueries({ queryKey });
      return;
    }
    queryClient.setQueryData<ContentFile[]>(queryKey, (current) => current ? update(current) : current);
  }, [queryClient]);
  const refreshTree = useCallback(
    () => queryClient.invalidateQueries({ queryKey: getGetContentTreeQueryKey() }),
    [queryClient],
  );
  const refreshTrash = useCallback(
    () => queryClient.invalidateQueries({ queryKey: getGetContentTrashQueryKey() }),
    [queryClient],
  );
  const refreshFileVersions = useCallback(
    (fileId: string) => queryClient.invalidateQueries({ queryKey: getGetContentFileVersionsQueryKey(fileId) }),
    [queryClient],
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const syncSystemAppearance = () => setSystemDark(media.matches);
    media.addEventListener?.('change', syncSystemAppearance);
    return () => media.removeEventListener?.('change', syncSystemAppearance);
  }, []);

  useEffect(() => {
    if (themeOverride && (themeOverride === 'dark') === systemDark) {
      setThemeOverride(null);
    }
  }, [themeOverride, systemDark]);

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    if (themeOverride) localStorage.setItem(THEME_STORAGE_KEY, themeOverride);
    else localStorage.removeItem(THEME_STORAGE_KEY);
  }, [dark, themeOverride]);

  useEffect(() => {
    if (!isOwner) queryClient.clear();
  }, [isOwner, queryClient]);

  useEffect(() => {
    if (!toastMessage) return;
    const timeout = window.setTimeout(() => setToastMessage(''), 3200);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  useEffect(() => {
    if (selectedFile && treeQuery.data) {
      const fresh = treeQuery.data.files.find((item) => item.id === selectedFile.id);
      if (fresh) setSelectedFile(fresh);
    }
  }, [treeQuery.data, selectedFile?.id]);

  useEffect(() => {
    if (!selectedFile) return;
    resetMetadataRef.current({
      title: selectedFile.title,
      description: selectedFile.description ?? '',
      date: selectedFile.date,
      folderPath: selectedFile.folderPath,
      isWallpaper: selectedFile.isWallpaper,
    });
  }, [selectedFile?.id, selectedFile?.updatedAt]);

  useEffect(() => {
    if (modal !== null || pendingEditFolderPath === null) return;
    metadataForm.setValue('folderPath', pendingEditFolderPath, { shouldDirty: true, shouldValidate: true });
    setPendingEditFolderPath(null);
  }, [modal, pendingEditFolderPath, metadataForm]);

  const folders = treeQuery.data?.folders ?? [];
  const allFiles = treeQuery.data?.files ?? [];
  const stylesheets = useMemo(
    () => allFiles.filter(isStylesheetFile).sort((left, right) => left.title.localeCompare(right.title)),
    [allFiles],
  );
  const trash = trashQuery.data ?? [];
  const folderByPath = useMemo(() => new Map(folders.map((folder) => [folder.path, folder])), [folders]);
  const folderParentOptions = useMemo(
    () => folders
      .filter((folder) => !editingFolder ||
        (folder.path !== editingFolder.path && !folder.path.startsWith(`${editingFolder.path}/`)))
      .sort((left, right) => left.path.localeCompare(right.path)),
    [folders, editingFolder],
  );
  const selectedFolderLabel = selectedFolder ? folderByPath.get(selectedFolder)?.name ?? selectedFolder : 'All files';
  const folderParent = folderForm.watch('parentPath') ?? '';
  const uploadTitle = uploadForm.watch('title') ?? '';
  const uploadDate = uploadForm.watch('date') ?? '';
  const uploadDestination = uploadForm.watch('folderPath') ?? '';
  const generatedUploadName = uploadTitle.trim()
    ? uploadMode === 'markdown'
      ? filenameFromTitle(uploadTitle, uploadDate, 'new-document.md', 'text/markdown', '.md')
      : uploadFile
        ? filenameFromTitle(uploadTitle, uploadDate, uploadFile.name, uploadFile.type || 'application/octet-stream', '.bin')
        : ''
    : '';
  const visibleFiles = useMemo(() => {
    const query = search.trim().toLowerCase();
    return allFiles.filter((file) => {
      const inFolder = query || !selectedFolder || file.folderPath === selectedFolder;
        const matches = !query || `${file.title} ${file.name} ${file.originalFileName} ${file.description} ${file.folderPath} ${file.contentType} ${file.date}`.toLowerCase().includes(query);
      return inFolder && matches;
    });
  }, [allFiles, search, selectedFolder]);
  const visibleTrash = useMemo(() => {
    const query = search.trim().toLowerCase();
    return trash.filter((file) => !query || `${file.title} ${file.name} ${file.folderPath} ${file.contentType}`.toLowerCase().includes(query));
  }, [trash, search]);

  const openFolderModal = (parent: string, folder?: ContentFolder) => {
    setFolderModalReturnTo(null);
    setEditingFolder(folder ?? null);
    folderForm.reset({ name: folder?.name ?? '', parentPath: folder?.parentPath ?? parent });
    setModal('folder');
  };

  const closeFolderModal = () => {
    setModal(folderModalReturnTo === 'upload' ? 'upload' : null);
    setFolderModalReturnTo(null);
  };

  const openFolderModalForUpload = () => {
    setFolderModalReturnTo('upload');
    setEditingFolder(null);
    folderForm.reset({ name: '', parentPath: uploadDestination });
    setModal('folder');
  };

  const openFolderModalForEdit = () => {
    setFolderModalReturnTo('edit');
    setEditingFolder(null);
    folderForm.reset({ name: '', parentPath: metadataForm.getValues('folderPath') });
    setModal('folder');
  };

  const saveFolder = async (values: FolderFormValues) => {
    const name = values.name.trim();
    if (!name) return;
    const parentPath = values.parentPath || '';
    try {
      let updated: ContentFolder | undefined;
      let created: ContentFolder | undefined;
      if (editingFolder) {
        updated = await updateFolder.mutateAsync({
          folderId: editingFolder.id,
          data: { name, parentPath },
        });
      } else {
        created = await createFolder.mutateAsync({ data: { name, parentPath } });
      }
      if (editingFolder && updated && updated.path !== editingFolder.path) {
        const oldPath = editingFolder.path;
        const newPath = updated.path;
        const rebase = (path: string) => path === oldPath || path.startsWith(`${oldPath}/`)
          ? `${newPath}${path.slice(oldPath.length)}`
          : path;
        setSelectedFolder((current) => rebase(current));
        setSelectedFile((current) => current ? { ...current, folderPath: rebase(current.folderPath) } : current);
        await Promise.all([refreshTree(), refreshTrash()]);
      } else if (updated) {
        patchTreeCache((tree) => ({
          ...tree,
          folders: tree.folders.map((folder) => folder.id === updated!.id ? updated! : folder),
        }));
      } else if (created) {
        patchTreeCache((tree) => ({
          ...tree,
          folders: [...tree.folders.filter((folder) => folder.id !== created!.id), created!],
        }));
      }
      if (editingFolder && updated) {
        const moved = updated.parentPath !== editingFolder.parentPath;
        const renamed = updated.name !== editingFolder.name;
        setToastMessage(
          moved && renamed ? 'Folder moved and renamed.' :
            moved ? 'Folder moved.' :
              renamed ? 'Folder renamed.' : 'Folder saved.',
        );
      } else {
        setToastMessage('Folder created.');
      }
      if (created && folderModalReturnTo === 'upload') {
        uploadForm.setValue('folderPath', created.path, { shouldDirty: true });
        setModal('upload');
      } else {
        if (created && folderModalReturnTo === 'edit') {
          setPendingEditFolderPath(created.path);
        }
        setModal(null);
      }
      setFolderModalReturnTo(null);
    } catch (error) {
      const message = errorMessage(error);
      const field = /destination folder|moved inside/i.test(message) ? 'parentPath' : 'name';
      folderForm.setError(field, { type: 'server', message });
    }
  };

  const handleDeleteFolder = async (folder: ContentFolder) => {
    if (!window.confirm(`Delete the empty folder “${folder.name}”?`)) return;
    try {
      await deleteFolder.mutateAsync({ folderId: folder.id });
      if (selectedFolder === folder.path) setSelectedFolder(folder.parentPath);
      patchTreeCache((tree) => ({
        ...tree,
        folders: tree.folders.filter((item) => item.id !== folder.id),
      }));
      setToastMessage('Folder deleted.');
    } catch (error) { setToastMessage(errorMessage(error)); }
  };

  const uploadSelected = async (values: UploadFormValues) => {
    const creatingMarkdown = uploadMode === 'markdown';
    const sourceFile = creatingMarkdown
      ? new window.File([`# ${values.title.trim()}\n\n`], 'new-document.md', { type: 'text/markdown' })
      : uploadFile;
    if (!sourceFile || !values.title.trim()) return;
    const contentType = sourceFile.type || 'application/octet-stream';
    const name = filenameFromTitle(
      values.title,
      values.date,
      sourceFile.name,
      contentType,
      creatingMarkdown ? '.md' : '.bin',
    );
    const date = normalizeDateForApi(values.date);
    if (!date) {
      uploadForm.setError('date', { type: 'validate', message: 'Choose a valid date.' });
      return;
    }
    if (!name) return;
    const originalFileName = creatingMarkdown ? name : sourceFile.name;
    setUploadBusy(true);
    try {
      const target = await createUpload.mutateAsync({ data: { name, contentType, sizeBytes: sourceFile.size } });
      const response = await fetch(target.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: sourceFile,
      });
      if (!response.ok) throw new Error(`File upload failed (${response.status}).`);
      const created = await createFile.mutateAsync({
        data: {
          name, originalFileName, title: values.title.trim(), description: values.description.trim(), folderPath: uploadDestination, date,
          contentType, sizeBytes: sourceFile.size, objectPath: target.objectPath,
          isWallpaper: !creatingMarkdown && isImageFile(sourceFile) && values.isWallpaper,
        },
      });
      setSelectedFolder(uploadDestination);
      setSelectedFile(created);
      patchTreeCache((tree) => ({
        ...tree,
        files: [...tree.files.filter((item) => item.id !== created.id), created],
      }));
      setToastMessage(creatingMarkdown ? 'Markdown document created.' : 'File uploaded to App Storage.');
      setModal(null);
      setUploadFile(null);
      setUploadMode('upload');
      uploadForm.reset({ title: '', description: '', date: localToday(), folderPath: uploadDestination, isWallpaper: false });
      if (creatingMarkdown) await openTextEditor(created);
    } catch (error) {
      setToastMessage(errorMessage(error));
    } finally { setUploadBusy(false); }
  };

  const chooseUpload = (file?: File) => {
    if (!file) return;
    setUploadFile(file);
    uploadForm.setValue('title', titleFromFilename(file.name), { shouldValidate: true });
    uploadForm.setValue('date', localToday(), { shouldValidate: true });
    uploadForm.setValue('isWallpaper', false, { shouldValidate: true });
  };

  const saveMetadata = async (values: MetadataFormValues) => {
    if (!selectedFile) return;
    const title = values.title.trim();
    const date = normalizeDateForApi(values.date);
    if (!date) {
      metadataForm.setError('date', { type: 'validate', message: 'Choose a valid date.' });
      return;
    }
    if (!title) return;
    try {
      const updated = await updateFile.mutateAsync({
        fileId: selectedFile.id,
        data: {
          title,
          description: values.description.trim(),
          date,
          folderPath: values.folderPath,
          isWallpaper: isImageFile({ name: selectedFile.name, type: selectedFile.contentType }) && values.isWallpaper,
        },
      });
      setSelectedFile(updated);
      if (updated.folderPath !== selectedFile.folderPath) setSelectedFolder(updated.folderPath);
      patchTreeCache((tree) => ({
        ...tree,
        files: tree.files.map((item) => item.id === updated.id ? updated : item),
      }));
      await refreshFileVersions(updated.id);
      setToastMessage('File details saved.');
    } catch (error) { setToastMessage(errorMessage(error)); }
  };

  const togglePublication = async (file: ContentFile) => {
    const isPublished = !file.isPublished;
    try {
      const updated = await updateFile.mutateAsync({
        fileId: file.id,
        data: { isPublished },
      });
      setSelectedFile((current) => current?.id === file.id ? updated : current);
      patchTreeCache((tree) => ({
        ...tree,
        files: tree.files.map((item) => item.id === updated.id ? updated : item),
      }));
      await Promise.all([refreshTree(), refreshFileVersions(file.id)]);
      setToastMessage(isPublished ? 'File published.' : 'File unpublished.');
    } catch (error) {
      setToastMessage(errorMessage(error));
    }
  };

  const removeFile = async (file: ContentFile): Promise<boolean> => {
    const assignedDocuments = isStylesheetFile(file)
      ? allFiles.filter((item) => item.stylesheetId === file.id)
      : [];
    const confirmation = isStylesheetFile(file)
      ? `Move “${file.title}” to trash? It is assigned to ${assignedDocuments.length} ${assignedDocuments.length === 1 ? 'document' : 'documents'}. Those documents will be reset to Default.`
      : `Move “${file.title}” to trash?`;
    if (!window.confirm(confirmation)) return false;
    try {
      await deleteFile.mutateAsync({ fileId: file.id });
      if (selectedFile?.id === file.id) setSelectedFile(null);
      patchTreeCache((tree) => ({
        ...tree,
        files: tree.files
          .filter((item) => item.id !== file.id)
          .map((item) => item.stylesheetId === file.id ? { ...item, stylesheetId: null } : item),
      }));
      patchTrashCache((files) => files.some((item) => item.id === file.id) ? files : [file, ...files]);
      await refreshFileVersions(file.id);
      setToastMessage('Moved to trash.');
      return true;
    } catch (error) {
      setToastMessage(errorMessage(error));
      return false;
    }
  };

  const restore = async (file: ContentFile) => {
    try {
      const restored = await restoreFile.mutateAsync({ fileId: file.id });
      patchTreeCache((tree) => ({
        ...tree,
        files: [...tree.files.filter((item) => item.id !== restored.id), restored],
      }));
      patchTrashCache((files) => files.filter((item) => item.id !== restored.id));
      await refreshFileVersions(restored.id);
      setToastMessage('File restored.');
    } catch (error) { setToastMessage(errorMessage(error)); }
  };

  const restoreRevision = async (version: ContentFileVersion) => {
    if (!selectedFile) return;
    if (!window.confirm(`Restore version ${version.versionNumber} of “${selectedFile.title}”?`)) return;
    try {
      const updated = await restoreFileVersion.mutateAsync({
        fileId: selectedFile.id,
        versionId: version.id,
      });
      setSelectedFile(updated);
      patchTreeCache((tree) => ({
        ...tree,
        files: tree.files.map((item) => item.id === updated.id ? updated : item),
      }));
      await refreshFileVersions(selectedFile.id);
      setToastMessage(
        version.folderPath !== updated.folderPath
          ? `Version restored to ${updated.folderPath || 'Root folder'} because its original folder no longer exists.`
          : `Restored version ${version.versionNumber}.`,
      );
    } catch (error) { setToastMessage(errorMessage(error)); }
  };

  const openStylesheetEditor = async (file?: ContentFile) => {
    setStylesheetFile(file ?? null);
    setStylesheetTitle(file?.title ?? '');
    setStylesheetText('');
    setStylesheetPreviewViewport('desktop');
    setStylesheetError('');
    setStylesheetEditorOpen(true);
    setStylesheetLoading(Boolean(file));
    if (!file) return;
    try {
      setStylesheetText(await getContentFileContent(file.id));
    } catch (error) {
      setStylesheetEditorOpen(false);
      setToastMessage(errorMessage(error));
    } finally {
      setStylesheetLoading(false);
    }
  };

  const closeStylesheetEditor = () => {
    if (stylesheetBusy) return;
    setStylesheetEditorOpen(false);
    setStylesheetFile(null);
    setStylesheetError('');
  };

  const saveStylesheet = async () => {
    const title = stylesheetTitle.trim();
    const content = stylesheetText;
    const blob = new Blob([content], { type: 'text/css' });
    if (!title) {
      setStylesheetError('Enter a stylesheet title.');
      return;
    }
    if (!content.trim()) {
      setStylesheetError('Add CSS before saving the stylesheet.');
      return;
    }
    if (blob.size > MAX_STYLESHEET_BYTES) {
      setStylesheetError('Stylesheets must be 256 KB or smaller.');
      return;
    }
    setStylesheetBusy(true);
    setStylesheetError('');
    try {
      const contentType = 'text/css';
      const target = await createUpload.mutateAsync({
        data: {
          name: stylesheetFile?.name ?? filenameFromTitle(title, localToday(), 'new-stylesheet.css', contentType, '.css'),
          contentType,
          sizeBytes: blob.size,
        },
      });
      const response = await fetch(target.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: blob,
      });
      if (!response.ok) throw new Error(`Stylesheet upload failed (${response.status}).`);

      let saved: ContentFile;
      if (stylesheetFile) {
        saved = await updateFile.mutateAsync({
          fileId: stylesheetFile.id,
          data: { title, objectPath: target.objectPath, contentType, sizeBytes: blob.size },
        });
      } else {
        const date = localToday();
        const name = filenameFromTitle(title, date, 'new-stylesheet.css', contentType, '.css');
        saved = await createFile.mutateAsync({
          data: {
            name,
            originalFileName: name,
            title,
            description: '',
            folderPath: 'stylesheets',
            date,
            contentType,
            sizeBytes: blob.size,
            objectPath: target.objectPath,
            isWallpaper: false,
          },
        });
        if (editorFile && isMarkdownDocument(editorFile)) setEditorStylesheetId(saved.id);
      }

      patchTreeCache((tree) => ({
        ...tree,
        files: [...tree.files.filter((item) => item.id !== saved.id), saved],
      }));
      if (selectedFile?.id === saved.id) setSelectedFile(saved);
      if (stylesheetFile) await refreshFileVersions(saved.id);
      setStylesheetEditorOpen(false);
      setStylesheetFile(null);
      setToastMessage(stylesheetFile ? 'Stylesheet saved.' : 'Stylesheet created.');
    } catch (error) {
      setStylesheetError(errorMessage(error));
    } finally {
      setStylesheetBusy(false);
    }
  };

  const deleteStylesheet = async () => {
    if (!stylesheetFile) return;
    setStylesheetBusy(true);
    const removed = await removeFile(stylesheetFile);
    setStylesheetBusy(false);
    if (removed) {
      if (editorStylesheetId === stylesheetFile.id) setEditorStylesheetId('');
      setStylesheetEditorOpen(false);
      setStylesheetFile(null);
    }
  };

  const openTextEditor = async (file: ContentFile) => {
    if (isStylesheetFile(file)) {
      await openStylesheetEditor(file);
      return;
    }
    setEditorFile(file);
    setEditorText('');
    setEditorStylesheetId(file.stylesheetId ?? '');
    setEditorLoading(true);
    try {
      setEditorText(await getContentFileContent(file.id));
    } catch (error) {
      setEditorFile(null);
      setToastMessage(errorMessage(error));
    } finally { setEditorLoading(false); }
  };

  const saveText = async () => {
    if (!editorFile) return;
    setEditorBusy(true);
    const contentType = editorFile.contentType || 'text/plain';
    const blob = new Blob([editorText], { type: contentType });
    try {
      const target = await createUpload.mutateAsync({
        data: { name: editorFile.name, contentType, sizeBytes: blob.size },
      });
      const response = await fetch(target.uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: blob });
      if (!response.ok) throw new Error(`Text upload failed (${response.status}).`);
      const updated = await updateFile.mutateAsync({
        fileId: editorFile.id,
        data: {
          objectPath: target.objectPath,
          contentType,
          sizeBytes: blob.size,
          ...(isMarkdownDocument(editorFile) ? { stylesheetId: editorStylesheetId || null } : {}),
        },
      });
      setSelectedFile(updated);
      patchTreeCache((tree) => ({
        ...tree,
        files: tree.files.map((item) => item.id === updated.id ? updated : item),
      }));
      await refreshFileVersions(updated.id);
      setEditorFile(null);
      setToastMessage('Text file saved.');
    } catch (error) { setToastMessage(errorMessage(error)); }
    finally { setEditorBusy(false); }
  };

  const openUpload = () => {
    setUploadFile(null);
    setUploadMode('upload');
    uploadForm.reset({ title: '', description: '', date: localToday(), folderPath: selectedFolder, isWallpaper: false });
    setModal('upload');
  };
  const openNewDocument = () => {
    setUploadFile(null);
    setUploadMode('markdown');
    const documentFolder = /^(posts|documents)(\/|$)/.test(selectedFolder) ? selectedFolder : 'documents';
    uploadForm.reset({ title: '', description: '', date: localToday(), folderPath: documentFolder, isWallpaper: false });
    setModal('upload');
  };
  const selectAllFiles = () => {
    setView('library');
    setSelectedFolder('');
    setSelectedFile(null);
    setMobileOpen(false);
  };
  const selectTrash = () => {
    setView('trash');
    setSelectedFile(null);
    setMobileOpen(false);
  };
  const selectFolder = (folder: ContentFolder) => {
    setSelectedFolder(folder.path);
    setView('library');
    setSelectedFile(null);
    setMobileOpen(false);
  };
  const toggleTheme = () => {
    const nextDark = !dark;
    setThemeOverride(nextDark === systemDark ? null : nextDark ? 'dark' : 'light');
  };

  if (authLoading) return <LoadingAuth />;
  if (!signedIn) {
    const accessDenied = new URLSearchParams(window.location.search).get('access') === 'denied';
    return (
      <main className="auth-screen">
        <section className="auth-card">
          <div className="brand" style={{ padding: 0 }}>
            <div className="brand-mark">J</div>
            <div><div className="brand-title">JMT Archive</div><div className="brand-caption">Private publishing</div></div>
          </div>
          <h1>Your library, securely yours.</h1>
          <p>Sign in to manage the files and folders published on your personal website.</p>
          {accessDenied ? <div className="auth-error" role="alert" data-testid="status-auth-error">This account does not have access to the content library.</div> : null}
          <button className="button button-primary" type="button" onClick={login} data-testid="sign-in">Sign In</button>
        </section>
      </main>
    );
  }
  if (!isOwner) {
    return (
      <main className="auth-screen">
        <section className="auth-card">
          <div className="brand" style={{ padding: 0 }}>
            <div className="brand-mark">J</div>
            <div><div className="brand-title">JMT Archive</div><div className="brand-caption">Private publishing</div></div>
          </div>
          <h1>This account cannot access the library.</h1>
          <p>Sign out and use the account that owns this workspace.</p>
          <button className="button button-primary" type="button" onClick={logout} data-testid="sign-out-denied">Sign Out</button>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <FolderNavigation
        folders={folders}
        selectedFolder={selectedFolder}
        view={view}
        mobileOpen={mobileOpen}
        dark={dark}
        fileCount={allFiles.length}
        trashCount={trash.length}
        isLoadingFolders={treeQuery.isLoading}
        onSelectAllFiles={selectAllFiles}
        onSelectTrash={selectTrash}
        onSelectFolder={selectFolder}
        onCreateFolder={openFolderModal}
        onRenameFolder={(folder) => openFolderModal(folder.parentPath, folder)}
        onDeleteFolder={(folder) => void handleDeleteFolder(folder)}
        onToggleTheme={toggleTheme}
        onSignOut={logout}
      />

      {mobileOpen ? <button type="button" aria-label="Close navigation" className="mobile-backdrop" onClick={() => setMobileOpen(false)} data-testid="close-mobile-navigation" /> : null}
      <div className="main-column">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="icon-button mobile-toggle" type="button" aria-label="Open navigation" onClick={() => setMobileOpen(true)} data-testid="open-mobile-navigation"><Menu /></button>
            <div className="crumb"><span>Archive</span><ChevronRight size={13} /><strong>{view === 'trash' ? 'Trash' : selectedFolderLabel}</strong></div>
          </div>
          <div className="top-actions">
            <label className="searchbox">
              <Search aria-hidden="true" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search files and folders" aria-label="Search files" data-testid="input-search-files" />
            </label>
            <button type="button" className="button button-primary" onClick={openUpload} data-testid="open-upload"><Upload /><span>Upload</span></button>
          </div>
        </header>
        <main className="content-wrap">
          <div className="page-heading">
            <div>
              <div className="eyebrow">{view === 'trash' ? 'Recently removed' : 'Your content library'}</div>
              <h1>{view === 'trash' ? 'Trash' : selectedFolderLabel}</h1>
              <p>{view === 'trash' ? 'Restore a file to return it to its original folder.' : 'Every file here is stored in App Storage and ready for public delivery.'}</p>
            </div>
            {view === 'library' ? <div className="heading-actions">
              <button className="button button-quiet" type="button" onClick={() => openFolderModal(selectedFolder)} data-testid="new-folder"><FolderPlus /> New Folder</button>
              <button className="button button-quiet" type="button" onClick={openNewDocument} data-testid="new-markdown-document"><FileText /> New Document</button>
              <button className="button button-primary" type="button" onClick={openUpload} data-testid="upload-file"><Plus /> Upload a File</button>
            </div> : null}
          </div>

          {view === 'trash' ? (
            <section className="panel">
              <div className="list-toolbar"><div className="list-title"><Archive size={16} /> Removed files <span className="count-pill">{visibleTrash.length}</span></div><span className="list-hint">Restoring returns the file to its original folder</span></div>
              {trashQuery.isLoading ? <SkeletonRows /> : trashQuery.isError ? <ErrorState error={trashQuery.error} onRetry={() => void trashQuery.refetch()} /> : visibleTrash.length === 0 ? (
                <EmptyState title={search ? 'No matches in trash' : 'Nothing in the bin'} description={search ? 'Try another search term.' : 'Deleted files will stay here until you restore them.'} />
              ) : (
                <div className="trash-list">
                  {visibleTrash.map((file) => (
                    <div className="trash-row" key={file.id} data-testid={`trash-row-${file.id}`}>
                      <FileName file={file} />
                      <span className="table-meta table-date">{file.date}</span>
                      <span className="table-meta table-size">{displaySize(file.sizeBytes)}</span>
                      <button className="button button-quiet" type="button" onClick={() => void restore(file)} data-testid={`restore-file-${file.id}`}><RefreshCw /> Restore</button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : treeQuery.isLoading ? <div className="panel"><SkeletonRows /></div> : treeQuery.isError ? <ErrorState error={treeQuery.error} onRetry={() => void treeQuery.refetch()} /> : (
            <div className="workspace-grid">
              <FileListPanel
                files={visibleFiles}
                selectedFileId={selectedFile?.id ?? null}
                selectedFolder={selectedFolder}
                search={search}
                formatSize={displaySize}
                onSelectFile={setSelectedFile}
                onEditText={(file) => void openTextEditor(file)}
                onMoveToTrash={(file) => void removeFile(file)}
                emptyState={visibleFiles.length === 0 ? (
                  <EmptyState
                    title={search ? 'No files found' : 'This folder is ready'}
                    description={search ? 'Try a different name, folder, or file type.' : 'New uploads are stored in App Storage and published from stable /files URLs.'}
                    action={!search ? (
                      <button className="button button-primary" type="button" onClick={openUpload} data-testid="empty-upload">
                        <Upload /> Upload a File
                      </button>
                    ) : undefined}
                  />
                ) : null}
              />

              <FileDetailsPanel
                file={selectedFile}
                folders={folders}
                metadataForm={metadataForm}
                revisions={fileVersionsQuery.data}
                revisionsLoading={fileVersionsQuery.isLoading}
                revisionsError={fileVersionsQuery.isError
                  ? errorMessage(fileVersionsQuery.error)
                  : null}
                isSaving={updateFile.isPending}
                isRestoring={restoreFileVersion.isPending}
                formatSize={displaySize}
                onClose={() => setSelectedFile(null)}
                onSaveMetadata={saveMetadata}
                onCreateFolder={openFolderModalForEdit}
                onTogglePublication={(file) => void togglePublication(file)}
                onEditText={(file) => void openTextEditor(file)}
                onRestoreRevision={(version) => void restoreRevision(version)}
              />
            </div>
          )}
        </main>
      </div>

      {modal === 'folder' ? (
        <FolderDialog
          editingFolder={editingFolder}
          parentOptions={folderParentOptions}
          parentPath={folderParent}
          form={folderForm}
          isSaving={createFolder.isPending || updateFolder.isPending}
          onClose={closeFolderModal}
          onSubmit={saveFolder}
        />
      ) : null}

      {modal === 'upload' ? (
        <UploadDialog
          form={uploadForm}
          folders={folders}
          uploadMode={uploadMode}
          uploadFile={uploadFile}
          generatedName={generatedUploadName}
          isBusy={uploadBusy}
          formatSize={displaySize}
          onChooseFile={chooseUpload}
          onCreateFolder={openFolderModalForUpload}
          onClose={() => setModal(null)}
          onSubmit={uploadSelected}
        />
      ) : null}

      {editorFile ? (
        <div className="overlay" role="presentation">
          <section className="dialog dialog-wide" role="dialog" aria-modal="true" aria-labelledby="editor-dialog-title">
            <div className="dialog-head"><div><h2 id="editor-dialog-title">Edit text file</h2><p>{editorFile.folderPath}/{editorFile.name}</p></div><button className="mini-action" type="button" aria-label="Close text editor" disabled={editorBusy} onClick={() => setEditorFile(null)} data-testid="close-text-editor"><X /></button></div>
            {isMarkdownDocument(editorFile) ? (
              <div className="stylesheet-assignment">
                <label className="field-label" htmlFor="document-stylesheet-select">Stylesheet</label>
                <div className="stylesheet-assignment-controls">
                  <Select
                    value={editorStylesheetId || DEFAULT_STYLESHEET_OPTION}
                    onValueChange={(value) => {
                      if (value === CREATE_STYLESHEET_OPTION) {
                        void openStylesheetEditor();
                        return;
                      }
                      setEditorStylesheetId(value === DEFAULT_STYLESHEET_OPTION ? '' : value);
                    }}
                  >
                    <SelectTrigger className="field-control folder-picker-trigger" id="document-stylesheet-select" aria-label="Document stylesheet" data-testid="select-document-stylesheet">
                      <SelectValue placeholder="Default" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={DEFAULT_STYLESHEET_OPTION}>Default</SelectItem>
                      {stylesheets.map((stylesheet) => (
                        <SelectItem key={stylesheet.id} value={stylesheet.id}>{stylesheet.title}</SelectItem>
                      ))}
                      <SelectItem value={CREATE_STYLESHEET_OPTION}>Create New…</SelectItem>
                    </SelectContent>
                  </Select>
                  <button
                    className="button button-quiet"
                    type="button"
                    disabled={!editorStylesheetId || editorBusy}
                    onClick={() => {
                      const stylesheet = stylesheets.find((item) => item.id === editorStylesheetId);
                      if (stylesheet) void openStylesheetEditor(stylesheet);
                    }}
                    data-testid="edit-document-stylesheet"
                  >
                    Edit Stylesheet
                  </button>
                </div>
                <p className="field-help">Choose a saved stylesheet or use the default document appearance.</p>
              </div>
            ) : null}
            <div className="editor-meta"><span>Plain text editor</span><span>{new Blob([editorText]).size.toLocaleString()} bytes</span></div>
            {editorLoading ? <div className="loading-state"><div><div className="skeleton" style={{ width: 280 }} /><div className="skeleton" style={{ width: 220 }} /><div className="skeleton" style={{ width: 260 }} /></div></div> : <textarea className="editor-area" value={editorText} onChange={(event) => setEditorText(event.target.value)} spellCheck={false} aria-label="Text file contents" data-testid="textarea-text-content" />}
            <div className="dialog-footer"><button className="button button-quiet" type="button" disabled={editorBusy} onClick={() => setEditorFile(null)} data-testid="cancel-text-edit">Cancel</button><button className="button button-primary" type="button" disabled={editorLoading || editorBusy} onClick={() => void saveText()} data-testid="save-text-file">{editorBusy ? 'Saving…' : 'Save Changes'}</button></div>
          </section>
        </div>
      ) : null}
      {stylesheetEditorOpen ? (
        <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeStylesheetEditor(); }}>
          <section
            className="dialog dialog-wide stylesheet-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="stylesheet-dialog-title"
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !stylesheetBusy) closeStylesheetEditor();
              if (event.key === 'Tab') {
                const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>(
                  'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
                )].filter((element) => !element.hasAttribute('hidden'));
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                  event.preventDefault();
                  last?.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                  event.preventDefault();
                  first?.focus();
                }
              }
            }}
          >
            <div className="dialog-head">
              <div>
                <h2 id="stylesheet-dialog-title">{stylesheetFile ? 'Edit CSS stylesheet' : 'Create CSS stylesheet'}</h2>
                <p>{stylesheetFile ? `${stylesheetFile.folderPath}/${stylesheetFile.name}` : 'Styles will be scoped to document content.'}</p>
              </div>
              <button className="mini-action" type="button" aria-label="Close stylesheet editor" disabled={stylesheetBusy} onClick={closeStylesheetEditor} data-testid="close-stylesheet-editor"><X /></button>
            </div>
            <label className="field-label" htmlFor="stylesheet-title">Stylesheet title</label>
            <input
              id="stylesheet-title"
              className="field-control stylesheet-title"
              value={stylesheetTitle}
              maxLength={220}
              autoFocus
              autoComplete="off"
              onChange={(event) => { setStylesheetTitle(event.target.value); setStylesheetError(''); }}
              data-testid="input-stylesheet-title"
            />
            <div className="editor-meta">
              <span>CSS is applied only inside Markdown documents. External imports are not supported.</span>
              <span>{new Blob([stylesheetText]).size.toLocaleString()} / 256,000 bytes</span>
            </div>
            {stylesheetLoading
              ? <div className="loading-state" role="status" aria-label="Loading stylesheet"><div><div className="skeleton" style={{ width: 280 }} /><div className="skeleton" style={{ width: 220 }} /><div className="skeleton" style={{ width: 260 }} /></div></div>
              : <textarea
                  id="stylesheet-content"
                  className="editor-area stylesheet-editor-area"
                  value={stylesheetText}
                  onChange={(event) => { setStylesheetText(event.target.value); setStylesheetError(''); }}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoComplete="off"
                  aria-label="CSS stylesheet contents"
                  data-testid="textarea-stylesheet-content"
                />}
            {stylesheetError ? <p className="stylesheet-error" role="alert">{stylesheetError}</p> : null}
            <section className="stylesheet-preview" aria-labelledby="stylesheet-preview-title">
              <div className="stylesheet-preview-head">
                <div>
                  <h3 id="stylesheet-preview-title">Sample document preview</h3>
                  <p>Updates as you edit. Changes are not saved until you select Save Stylesheet.</p>
                </div>
                <div className="stylesheet-preview-sizes" role="group" aria-label="Preview width">
                  <button
                    className={`button button-quiet${stylesheetPreviewViewport === 'desktop' ? ' is-selected' : ''}`}
                    type="button"
                    aria-pressed={stylesheetPreviewViewport === 'desktop'}
                    onClick={() => setStylesheetPreviewViewport('desktop')}
                    data-testid="stylesheet-preview-desktop"
                  >
                    Desktop
                  </button>
                  <button
                    className={`button button-quiet${stylesheetPreviewViewport === 'mobile' ? ' is-selected' : ''}`}
                    type="button"
                    aria-pressed={stylesheetPreviewViewport === 'mobile'}
                    onClick={() => setStylesheetPreviewViewport('mobile')}
                    data-testid="stylesheet-preview-mobile"
                  >
                    Mobile
                  </button>
                </div>
              </div>
              <div className={`stylesheet-preview-frame-shell${stylesheetPreviewViewport === 'mobile' ? ' is-mobile' : ''}`}>
                {stylesheetLoading
                  ? <div className="stylesheet-preview-status" role="status">Loading stylesheet…</div>
                  : stylesheetTextBytes > MAX_STYLESHEET_BYTES
                    ? <div className="stylesheet-preview-status" role="status">Preview is unavailable above 256 KB. Reduce the stylesheet size to preview it.</div>
                    : <iframe
                        className="stylesheet-preview-frame"
                        title="Sample Markdown document preview"
                        sandbox=""
                        referrerPolicy="no-referrer"
                        srcDoc={stylesheetPreviewDocument}
                        data-testid="stylesheet-preview-frame"
                      />}
              </div>
            </section>
            <div className="dialog-footer stylesheet-dialog-footer">
              <div>
                {stylesheetFile ? (
                  <button className="button button-danger" type="button" disabled={stylesheetBusy} onClick={() => void deleteStylesheet()} data-testid="delete-stylesheet">Move to Trash</button>
                ) : null}
              </div>
              <div className="stylesheet-dialog-actions">
                <button className="button button-quiet" type="button" disabled={stylesheetBusy} onClick={closeStylesheetEditor} data-testid="cancel-stylesheet">Cancel</button>
                <button className="button button-primary" type="button" disabled={stylesheetLoading || stylesheetBusy} onClick={() => void saveStylesheet()} data-testid="save-stylesheet">{stylesheetBusy ? 'Saving…' : 'Save Stylesheet'}</button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
      {toastMessage ? <div role="status" aria-live="polite" className="toast" data-testid="status-toast">{toastMessage}</div> : null}
    </div>
  );
}

function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><div><div className="empty-art"><Folder /></div><h3>{title}</h3><p>{description}</p>{action}</div></div>;
}

function SkeletonRows() {
  return <div className="loading-state" role="status" aria-label="Loading files" data-testid="status-loading-files"><div style={{ width: '100%' }}>{[0, 1, 2, 3].map((item) => <div key={item} className="skeleton" style={{ width: `${88 - item * 8}%`, height: 38, margin: '12px auto' }} />)}</div></div>;
}

function ErrorState({ error, onRetry }: { error?: unknown; onRetry: () => void }) {
  const detail = error instanceof Error ? errorMessage(error) : '';
  const message = detail
    ? `${detail} Your files haven’t been changed.`
    : 'Check your connection and try again. Your files haven’t been changed.';
  return <div className="error-state" role="alert" data-testid="status-load-error"><div><div className="empty-art"><RefreshCw /></div><h3>Couldn’t load the library</h3><p>{message}</p><button className="button button-primary" type="button" onClick={onRetry} data-testid="retry-load"><RefreshCw /> Try Again</button></div></div>;
}

function LoadingAuth() {
  return <main className="auth-screen" role="status" data-testid="status-auth-loading"><div className="auth-card"><div className="brand"><div className="brand-mark">J</div><div><div className="brand-title">JMT Archive</div><div className="brand-caption">Private publishing</div></div></div><div className="skeleton" style={{ width: '65%', margin: '28px 0 12px' }} /><div className="skeleton" style={{ width: '95%' }} /><div className="skeleton" style={{ width: '82%' }} /></div></main>;
}

function NotFound() {
  return <main className="auth-screen"><section className="auth-card"><div className="eyebrow">Archive / 404</div><h1>That page isn’t here.</h1><p>Return to the admin console to continue managing your library.</p><a href={import.meta.env.BASE_URL} className="button button-primary" data-testid="link-return-home">Return to admin console</a></section></main>;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message.replace(/^HTTP \d+ [^:]+:\s*/, '') : 'Something went wrong. Please try again.';
}

export default App;
