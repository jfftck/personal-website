import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import {
  Archive, ArrowDownToLine, Check, ChevronRight, File, FileImage, FileText, Film,
  Folder, FolderPlus, HardDrive, Menu, Moon, MoreHorizontal, Pencil, Plus, RefreshCw,
  Search, Sun, Trash2, Upload, X,
} from 'lucide-react';
import {
  getContentFileContent,
  getGetContentFileVersionsQueryKey, getGetContentTrashQueryKey, getGetContentTreeQueryKey, setAuthTokenGetter,
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

declare global {
  interface Window {
    Clerk?: {
      load(options: { publishableKey: string }): Promise<void>;
      user?: { id: string };
      session?: { getToken(): Promise<string | null> };
      mountSignIn(element: HTMLDivElement, options?: Record<string, unknown>): void;
      unmountSignIn(element: HTMLDivElement): void;
      addListener?(listener: (resources: { user?: { id: string }; session?: { getToken(): Promise<string | null> } | null }) => void): () => void;
      signOut?(): Promise<void>;
    };
  }
}

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

function systemPrefersDark() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

function savedThemeOverride(): ThemeOverride {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved !== 'light' && saved !== 'dark') return null;
  return (saved === 'dark') === systemPrefersDark() ? null : saved;
}

type FolderFormValues = { name: string };
type UploadFormValues = { title: string; date: string; isWallpaper: boolean };
type MetadataFormValues = { name: string; date: string; folderPath: string; isWallpaper: boolean };

function displaySize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = bytes / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) { size /= 1024; index += 1; }
  return `${size < 10 ? size.toFixed(1) : Math.round(size)} ${units[index]}`;
}

function fileIcon(file: ContentFile) {
  const type = file.contentType.toLowerCase();
  if (type.startsWith('image/')) return <FileImage aria-hidden="true" />;
  if (type.startsWith('video/')) return <Film aria-hidden="true" />;
  if (/\.md$|\.markdown$|\.txt$|\.csv$/i.test(file.name) || type.startsWith('text/')) return <FileText aria-hidden="true" />;
  return <File aria-hidden="true" />;
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
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);
  const [themeOverride, setThemeOverride] = useState<ThemeOverride>(savedThemeOverride);
  const dark = themeOverride ? themeOverride === 'dark' : systemDark;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [view, setView] = useState<'library' | 'trash'>('library');
  const [selectedFolder, setSelectedFolder] = useState('');
  const [selectedFile, setSelectedFile] = useState<ContentFile | null>(null);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'folder' | 'upload' | null>(null);
  const [folderParent, setFolderParent] = useState('');
  const [editingFolder, setEditingFolder] = useState<ContentFolder | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [editorFile, setEditorFile] = useState<ContentFile | null>(null);
  const [editorText, setEditorText] = useState('');
  const [editorBusy, setEditorBusy] = useState(false);
  const [editorLoading, setEditorLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const clerkSignInRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const queryClient = useQueryClient();

  const treeQuery = useGetContentTree({
    query: { enabled: signedIn, queryKey: getGetContentTreeQueryKey() },
  });
  const fileVersionsQuery = useGetContentFileVersions(selectedFile?.id ?? '', {
    query: { enabled: signedIn && Boolean(selectedFile) },
  });
  const trashQuery = useGetContentTrash({
    query: { enabled: signedIn, queryKey: getGetContentTrashQueryKey() },
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
  const folderForm = useForm<FolderFormValues>({ defaultValues: { name: '' } });
  const uploadForm = useForm<UploadFormValues>({
    defaultValues: { title: '', date: UPLOAD_TODAY, isWallpaper: false },
  });
  const metadataForm = useForm<MetadataFormValues>({
    defaultValues: { name: '', date: TODAY, folderPath: '', isWallpaper: false },
  });
  const resetMetadata = metadataForm.reset;

  const invalidateContent = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetContentTreeQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetContentTrashQueryKey() }),
      queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === 'string' &&
          query.queryKey[0].startsWith('/api/content/files/') &&
          query.queryKey[0].endsWith('/versions'),
      }),
    ]);
  }, [queryClient]);

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
    if (!signedIn) queryClient.clear();
  }, [signedIn, queryClient]);

  useEffect(() => {
    let cancelled = false;
    const syncAuth = () => setSignedIn(Boolean(window.Clerk?.user && window.Clerk?.session));
    const initialize = async () => {
      try {
        const response = await fetch('/api/clerk-config');
        if (!response.ok) throw new Error('Could not load sign-in configuration.');
        const config = await response.json() as { publishableKey?: string };
        if (!config.publishableKey) throw new Error('The sign-in key is not configured.');
        if (!window.Clerk) {
          await new Promise<void>((resolve, reject) => {
            const existing = document.getElementById('clerk-js') as HTMLScriptElement | null;
            if (existing) {
              if (window.Clerk) { resolve(); return; }
              existing.addEventListener('load', () => resolve(), { once: true });
              existing.addEventListener('error', () => reject(new Error('Clerk could not be loaded.')), { once: true });
              return;
            }
            const script = document.createElement('script');
            script.id = 'clerk-js';
            script.src = '/clerk-js/clerk.browser.js';
            script.setAttribute('data-clerk-publishable-key', config.publishableKey!);
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Clerk could not be loaded.'));
            document.head.appendChild(script);
          });
        }
        if (cancelled || !window.Clerk) return;
        await window.Clerk.load({ publishableKey: config.publishableKey });
        setAuthTokenGetter(async () => window.Clerk?.session?.getToken() ?? null);
        syncAuth();
        window.Clerk.addListener?.((resources) => setSignedIn(Boolean(resources.user && resources.session)));
      } catch (error) {
        if (!cancelled) setAuthError(error instanceof Error ? error.message : 'Sign-in could not be initialized.');
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    };
    void initialize();
    return () => { cancelled = true; setAuthTokenGetter(null); };
  }, []);

  useEffect(() => {
    const clerk = window.Clerk;
    const target = clerkSignInRef.current;
    if (!authReady || signedIn || !clerk || !target) return;
    clerk.mountSignIn(target);
    return () => { try { clerk.unmountSignIn(target); } catch { /* Clerk may already have unmounted. */ } };
  }, [authReady, signedIn]);

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
    resetMetadata({
      name: selectedFile.name,
      date: selectedFile.date,
      folderPath: selectedFile.folderPath,
      isWallpaper: selectedFile.isWallpaper,
    });
  }, [selectedFile?.id, selectedFile?.name, selectedFile?.date, selectedFile?.folderPath, selectedFile?.isWallpaper, resetMetadata]);

  const folders = treeQuery.data?.folders ?? [];
  const allFiles = treeQuery.data?.files ?? [];
  const trash = trashQuery.data ?? [];
  const folderByPath = useMemo(() => new Map(folders.map((folder) => [folder.path, folder])), [folders]);
  const selectedFolderLabel = selectedFolder ? folderByPath.get(selectedFolder)?.name ?? selectedFolder : 'All files';
  const uploadTitle = uploadForm.watch('title');
  const generatedUploadName = uploadFile && uploadTitle.trim()
    ? filenameFromTitle(uploadTitle, uploadFile.name, uploadFile.type || 'application/octet-stream')
    : '';
  const visibleFiles = useMemo(() => {
    const query = search.trim().toLowerCase();
    return allFiles.filter((file) => {
      const inFolder = query || !selectedFolder || file.folderPath === selectedFolder;
      const matches = !query || `${file.name} ${file.folderPath} ${file.contentType} ${file.date}`.toLowerCase().includes(query);
      return inFolder && matches;
    });
  }, [allFiles, search, selectedFolder]);
  const visibleTrash = useMemo(() => {
    const query = search.trim().toLowerCase();
    return trash.filter((file) => !query || `${file.name} ${file.folderPath} ${file.contentType}`.toLowerCase().includes(query));
  }, [trash, search]);

  const folderChildren = (path: string) => folders.filter((folder) => folder.parentPath === path);
  const openFolderModal = (parent: string, folder?: ContentFolder) => {
    setFolderParent(parent);
    setEditingFolder(folder ?? null);
    folderForm.reset({ name: folder?.name ?? '' });
    setModal('folder');
  };

  const saveFolder = async (values: FolderFormValues) => {
    const name = values.name.trim();
    if (!name) return;
    try {
      let updated: ContentFolder | undefined;
      if (editingFolder) updated = await updateFolder.mutateAsync({ folderId: editingFolder.id, data: { name } });
      else await createFolder.mutateAsync({ data: { name, parentPath: folderParent } });
      if (editingFolder && updated && updated.path !== editingFolder.path) {
        const oldPath = editingFolder.path;
        const newPath = updated.path;
        const rebase = (path: string) => path === oldPath || path.startsWith(`${oldPath}/`)
          ? `${newPath}${path.slice(oldPath.length)}`
          : path;
        setSelectedFolder((current) => rebase(current));
        setSelectedFile((current) => current ? { ...current, folderPath: rebase(current.folderPath) } : current);
      }
      await invalidateContent();
      setToastMessage(editingFolder ? 'Folder renamed.' : 'Folder created.');
      setModal(null);
    } catch (error) { setToastMessage(errorMessage(error)); }
  };

  const handleDeleteFolder = async (folder: ContentFolder) => {
    if (!window.confirm(`Delete the empty folder “${folder.name}”?`)) return;
    try {
      await deleteFolder.mutateAsync({ folderId: folder.id });
      if (selectedFolder === folder.path) setSelectedFolder(folder.parentPath);
      await invalidateContent();
      setToastMessage('Folder deleted.');
    } catch (error) { setToastMessage(errorMessage(error)); }
  };

  const uploadSelected = async (values: UploadFormValues) => {
    if (!uploadFile || !values.title.trim()) return;
    const contentType = uploadFile.type || 'application/octet-stream';
    const name = filenameFromTitle(values.title, uploadFile.name, contentType);
    const date = normalizeDateForApi(values.date);
    if (!date) {
      uploadForm.setError('date', { type: 'validate', message: 'Enter a valid date.' });
      return;
    }
    setUploadBusy(true);
    try {
      const target = await createUpload.mutateAsync({ data: { name, contentType, sizeBytes: uploadFile.size } });
      const response = await fetch(target.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: uploadFile,
      });
      if (!response.ok) throw new Error(`File upload failed (${response.status}).`);
      await createFile.mutateAsync({
        data: {
          name, folderPath: selectedFolder, date,
          contentType, sizeBytes: uploadFile.size, objectPath: target.objectPath,
          isWallpaper: isImageFile(uploadFile) && values.isWallpaper,
        },
      });
      await invalidateContent();
      setToastMessage('File uploaded to App Storage.');
      setModal(null);
      setUploadFile(null);
      uploadForm.reset({ title: '', date: localToday(), isWallpaper: false });
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
    const name = values.name.trim();
    const date = values.date;
    if (!name || !date) return;
    try {
      const updated = await updateFile.mutateAsync({
        fileId: selectedFile.id,
        data: {
          name,
          date,
          folderPath: values.folderPath,
          isWallpaper: isImageFile({ name: selectedFile.name, type: selectedFile.contentType }) && values.isWallpaper,
        },
      });
      setSelectedFile(updated);
      if (updated.folderPath !== selectedFile.folderPath) setSelectedFolder(updated.folderPath);
      await invalidateContent();
      setToastMessage('File details saved.');
    } catch (error) { setToastMessage(errorMessage(error)); }
  };

  const removeFile = async (file: ContentFile) => {
    if (!window.confirm(`Move “${file.name}” to trash?`)) return;
    try {
      await deleteFile.mutateAsync({ fileId: file.id });
      if (selectedFile?.id === file.id) setSelectedFile(null);
      await invalidateContent();
      setToastMessage('Moved to trash.');
    } catch (error) { setToastMessage(errorMessage(error)); }
  };

  const restore = async (file: ContentFile) => {
    try {
      await restoreFile.mutateAsync({ fileId: file.id });
      await invalidateContent();
      setToastMessage('File restored.');
    } catch (error) { setToastMessage(errorMessage(error)); }
  };

  const restoreRevision = async (version: ContentFileVersion) => {
    if (!selectedFile) return;
    if (!window.confirm(`Restore version ${version.versionNumber} of “${selectedFile.name}”?`)) return;
    try {
      const updated = await restoreFileVersion.mutateAsync({
        fileId: selectedFile.id,
        versionId: version.id,
      });
      setSelectedFile(updated);
      await invalidateContent();
      await queryClient.invalidateQueries({
        queryKey: getGetContentFileVersionsQueryKey(selectedFile.id),
      });
      setToastMessage(`Restored version ${version.versionNumber}.`);
    } catch (error) { setToastMessage(errorMessage(error)); }
  };

  const openTextEditor = async (file: ContentFile) => {
    setEditorFile(file);
    setEditorText('');
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
        data: { objectPath: target.objectPath, contentType, sizeBytes: blob.size },
      });
      setSelectedFile(updated);
      await invalidateContent();
      setEditorFile(null);
      setToastMessage('Text file saved.');
    } catch (error) { setToastMessage(errorMessage(error)); }
    finally { setEditorBusy(false); }
  };

  const isEditableText = (file: ContentFile) => /\.(md|markdown|txt|csv)$/i.test(file.name);
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files[0]) chooseUpload(event.dataTransfer.files[0]);
  };
  const openUpload = () => {
    setUploadFile(null);
    uploadForm.reset({ title: '', date: localToday(), isWallpaper: false });
    setModal('upload');
  };

  if (!authReady) return <LoadingAuth />;
  if (!signedIn) {
    return (
      <main className="auth-screen">
        <section className="auth-card">
          <div className="brand" style={{ padding: 0 }}>
            <div className="brand-mark">J</div>
            <div><div className="brand-title">JMT Archive</div><div className="brand-caption">Private publishing</div></div>
          </div>
          <h1>Your library, securely yours.</h1>
          <p>Sign in to manage the files and folders published on your personal website.</p>
          {authError ? <div className="auth-error" role="alert" data-testid="status-auth-error">{authError}</div> : null}
          <div className="clerk-slot" ref={clerkSignInRef} data-testid="clerk-sign-in" />
        </section>
      </main>
    );
  }

  const renderFolders = (parent: string, depth: number): ReactNode => folderChildren(parent).map((folder) => (
    <div key={folder.id}>
      <div className="folder-row">
        <button
          type="button" className={`folder-button ${selectedFolder === folder.path && view === 'library' ? 'active' : ''}`}
          style={{ paddingLeft: 10 + depth * 15 }} onClick={() => { setSelectedFolder(folder.path); setView('library'); setSelectedFile(null); setMobileOpen(false); }}
          data-testid={`select-folder-${folder.id}`} aria-label={`Open folder ${folder.name}`}
        >
          <Folder aria-hidden="true" /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.name}</span>
        </button>
        <div className="folder-tools">
          <button className="mini-action" type="button" aria-label={`Add folder inside ${folder.name}`} title="Add subfolder" onClick={() => openFolderModal(folder.path)} data-testid={`add-subfolder-${folder.id}`}><Plus /></button>
          <button className="mini-action" type="button" aria-label={`Rename ${folder.name}`} title="Rename folder" onClick={() => openFolderModal(folder.parentPath, folder)} data-testid={`rename-folder-${folder.id}`}><Pencil /></button>
          <button className="mini-action" type="button" aria-label={`Delete ${folder.name}`} title="Delete folder" onClick={() => void handleDeleteFolder(folder)} data-testid={`delete-folder-${folder.id}`}><Trash2 /></button>
        </div>
      </div>
      {renderFolders(folder.path, depth + 1)}
    </div>
  ));

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`} aria-label="Library navigation">
        <div className="brand">
          <div className="brand-mark">J</div>
          <div><div className="brand-title">JMT Archive</div><div className="brand-caption">Private publishing</div></div>
        </div>
        <div className="side-label">Workspace</div>
        <button className={`side-button ${view === 'library' && !selectedFolder ? 'active' : ''}`} type="button" onClick={() => { setView('library'); setSelectedFolder(''); setSelectedFile(null); setMobileOpen(false); }} data-testid="nav-all-files">
          <HardDrive /> All files <span className="count-pill" style={{ marginLeft: 'auto' }}>{allFiles.length}</span>
        </button>
        <button className={`side-button ${view === 'trash' ? 'active' : ''}`} type="button" onClick={() => { setView('trash'); setSelectedFile(null); setMobileOpen(false); }} data-testid="nav-trash">
          <Trash2 /> Trash <span className="count-pill" style={{ marginLeft: 'auto' }}>{trash.length}</span>
        </button>
        <div className="side-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          Folders
          <button className="mini-action" type="button" title="Create folder" aria-label="Create folder" onClick={() => openFolderModal(selectedFolder)} data-testid="create-folder"><FolderPlus /></button>
        </div>
        <div className="folder-tree">
          {renderFolders('', 0)}
          {folders.length === 0 && !treeQuery.isLoading ? <p style={{ padding: '0 10px', color: 'hsl(var(--muted-foreground))', fontSize: 11 }}>No folders yet.</p> : null}
        </div>
        <div className="sidebar-bottom">
          <button
            className="side-button"
            type="button"
            onClick={() => {
              const nextDark = !dark;
              setThemeOverride(nextDark === systemDark ? null : nextDark ? 'dark' : 'light');
            }}
            data-testid="toggle-theme"
          >
            {dark ? <Sun /> : <Moon />} {dark ? 'Light Appearance' : 'Dark Appearance'}
          </button>
          <button className="side-button" type="button" onClick={() => void window.Clerk?.signOut?.()} data-testid="sign-out">
            <ArrowDownToLine style={{ transform: 'rotate(180deg)' }} /> Sign Out
          </button>
        </div>
      </aside>

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
              <button className="button button-primary" type="button" onClick={openUpload} data-testid="upload-file"><Plus /> Add a File</button>
            </div> : null}
          </div>

          {view === 'trash' ? (
            <section className="panel">
              <div className="list-toolbar"><div className="list-title"><Archive size={16} /> Removed files <span className="count-pill">{visibleTrash.length}</span></div><span className="list-hint">Restoring returns the file to its original folder</span></div>
              {trashQuery.isLoading ? <SkeletonRows /> : trashQuery.isError ? <ErrorState onRetry={() => void trashQuery.refetch()} /> : visibleTrash.length === 0 ? (
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
          ) : treeQuery.isLoading ? <div className="panel"><SkeletonRows /></div> : treeQuery.isError ? <ErrorState onRetry={() => void treeQuery.refetch()} /> : (
            <div className="workspace-grid">
              <section className="panel list-panel" aria-label="Files">
                <div className="list-toolbar">
                  <div className="list-title"><Folder size={16} /> Files <span className="count-pill">{visibleFiles.length}</span></div>
                  <span className="list-hint">{search ? 'Search results across the library' : selectedFolder ? selectedFolder : 'Private library · public delivery enabled'}</span>
                </div>
                <div className="file-table-head"><span>Name</span><span>Content date</span><span>Size</span><span /></div>
                {visibleFiles.length === 0 ? (
                  <EmptyState title={search ? 'No files found' : 'This folder is ready'} description={search ? 'Try a different name, folder, or file type.' : 'New uploads are stored in App Storage and published from stable /files URLs.'} action={!search ? <button className="button button-primary" type="button" onClick={openUpload} data-testid="empty-upload"><Upload /> Upload a File</button> : undefined} />
                ) : visibleFiles.map((file) => (
                  <div
                    key={file.id}
                    className={`file-row ${selectedFile?.id === file.id ? 'selected' : ''}`}
                    role="button" tabIndex={0} onClick={() => setSelectedFile(file)}
                    onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedFile(file); } }}
                    aria-label={`Select ${file.name}`} data-testid={`file-row-${file.id}`}
                  >
                    <FileName file={file} />
                    <span className="table-meta table-date">{file.date}</span>
                    <span className="table-meta table-size">{displaySize(file.sizeBytes)}</span>
                    <div className="row-actions">
                      {isEditableText(file) ? <button className="mini-action" type="button" title="Edit Text" aria-label={`Edit ${file.name}`} onClick={(event) => { event.stopPropagation(); void openTextEditor(file); }} data-testid={`edit-text-${file.id}`}><Pencil /></button> : null}
                      <button className="mini-action" type="button" title="Move to Trash" aria-label={`Move ${file.name} to trash`} onClick={(event) => { event.stopPropagation(); void removeFile(file); }} data-testid={`trash-file-${file.id}`}><Trash2 /></button>
                    </div>
                  </div>
                ))}
              </section>

              <aside className="panel detail-panel" aria-label="Selected file details">
                <div className="detail-top"><h2>File details</h2>{selectedFile ? <button className="mini-action" type="button" aria-label="Close file details" onClick={() => setSelectedFile(null)} data-testid="close-file-details"><X /></button> : null}</div>
                {!selectedFile ? (
                  <div className="detail-empty"><div><div className="detail-empty-icon"><MoreHorizontal /></div><p>Select a file to edit its name, content date, or text.</p></div></div>
                ) : (
                  <>
                    <div className="detail-file">
                      <div className="detail-file-icon">{fileIcon(selectedFile)}</div>
                      <h3>{selectedFile.name}</h3><p>{selectedFile.folderPath || 'Root folder'}</p>
                    </div>
                    <Form {...metadataForm}>
                    <form key={`${selectedFile.id}-${selectedFile.updatedAt}`} onSubmit={metadataForm.handleSubmit(saveMetadata)}>
                      <FormField control={metadataForm.control} name="name" rules={{ required: 'Enter a file name.' }} render={({ field }) => (
                        <FormItem>
                          <FormLabel className="field-label">File name</FormLabel>
                          <FormControl><input className="field-control" maxLength={255} data-testid="input-file-name" {...field} /></FormControl>
                          <FormMessage data-testid="error-file-name" />
                        </FormItem>
                      )} />
                      <FormField control={metadataForm.control} name="date" rules={{ required: 'Choose a content date.' }} render={({ field }) => (
                        <FormItem>
                          <FormLabel className="field-label">Content date</FormLabel>
                          <FormControl><input className="field-control" type="date" data-testid="input-file-date" {...field} /></FormControl>
                          <FormMessage data-testid="error-file-date" />
                        </FormItem>
                      )} />
                      <FormField control={metadataForm.control} name="folderPath" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="field-label">Destination folder</FormLabel>
                          <FormControl>
                            <select className="field-control" data-testid="select-file-destination" {...field}>
                              <option value="">Root folder</option>
                              {[...folders].sort((a, b) => a.path.localeCompare(b.path)).map((folder) => (
                                <option key={folder.id} value={folder.path}>{folder.path}</option>
                              ))}
                            </select>
                          </FormControl>
                          <FormMessage data-testid="error-file-destination" />
                        </FormItem>
                      )} />
                      {isImageFile({ name: selectedFile.name, type: selectedFile.contentType }) ? (
                        <FormField control={metadataForm.control} name="isWallpaper" render={({ field }) => (
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
                              <FormLabel className="checkbox-label">Allow as desktop wallpaper</FormLabel>
                              <p className="field-help">This image will be marked as eligible in the public file manifest.</p>
                            </div>
                          </FormItem>
                        )} />
                      ) : null}
                      <div className="detail-stats">
                        <div><span className="stat-label">Type</span><span className="stat-value">{selectedFile.contentType}</span></div>
                        <div><span className="stat-label">Size</span><span className="stat-value">{displaySize(selectedFile.sizeBytes)}</span></div>
                        <div><span className="stat-label">Updated</span><span className="stat-value">{new Date(selectedFile.updatedAt).toLocaleDateString()}</span></div>
                        <div><span className="stat-label">Published at</span><a className="stat-value" href={selectedFile.url} target="_blank" rel="noreferrer" data-testid={`file-public-url-${selectedFile.id}`}>{selectedFile.url}</a></div>
                      </div>
                      <div className="detail-actions">
                        <button className="button button-primary" type="submit" disabled={updateFile.isPending} data-testid="save-file-details"><Check /> Save Details</button>
                        {isEditableText(selectedFile) ? <button className="button button-quiet" type="button" onClick={() => void openTextEditor(selectedFile)} data-testid="open-text-editor"><FileText /> Edit Text</button> : null}
                      </div>
                    </form>
                    </Form>
                    <p className="status-line">Choose the destination folder above.</p>
                    <section className="revision-history" aria-labelledby="revision-history-title" data-testid="revision-history">
                      <div className="revision-history-heading">
                        <div>
                          <h3 id="revision-history-title">Revision History</h3>
                          <p>File bytes stay in App Storage; Git records each revision.</p>
                        </div>
                        <a className="button button-quiet revision-repository-link" href="https://github.com/jfftck/personal-files" target="_blank" rel="noreferrer">Repository</a>
                      </div>
                      {fileVersionsQuery.isLoading ? (
                        <div className="revision-loading" role="status">Loading revisions…</div>
                      ) : fileVersionsQuery.isError ? (
                        <div className="revision-error" role="alert">{errorMessage(fileVersionsQuery.error)}</div>
                      ) : !fileVersionsQuery.data?.length ? (
                        <div className="revision-empty">No revisions are available yet.</div>
                      ) : (
                        <ol className="revision-list">
                          {fileVersionsQuery.data.map((version, index) => (
                            <li className="revision-item" key={version.id} data-testid={`revision-${version.versionNumber}`}>
                              <div className="revision-item-header">
                                <strong>Version {version.versionNumber} · {version.action[0].toUpperCase() + version.action.slice(1)}</strong>
                                <time dateTime={version.createdAt}>{new Date(version.createdAt).toLocaleString()}</time>
                              </div>
                              <p className="revision-file">{version.name} <span>·</span> {version.folderPath || 'Root folder'} <span>·</span> {version.date}</p>
                              <div className="revision-item-footer">
                                <a href={version.gitUrl} target="_blank" rel="noreferrer">Commit {version.gitCommitSha.slice(0, 7)}</a>
                                {index === 0 ? (
                                  <span className="revision-current">Current</span>
                                ) : (
                                  <button
                                    className="button button-quiet revision-restore"
                                    type="button"
                                    disabled={restoreFileVersion.isPending}
                                    onClick={() => void restoreRevision(version)}
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
            </div>
          )}
        </main>
      </div>

      {modal === 'folder' ? (
        <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}>
          <Form {...folderForm}>
          <form className="dialog" onSubmit={folderForm.handleSubmit(saveFolder)} aria-labelledby="folder-dialog-title">
            <div className="dialog-head"><div><h2 id="folder-dialog-title">{editingFolder ? 'Rename folder' : 'Create folder'}</h2><p>{editingFolder ? editingFolder.path : folderParent ? `Inside ${folderParent}` : 'At the top level of your library'}</p></div><button className="mini-action" type="button" aria-label="Close dialog" onClick={() => setModal(null)} data-testid="close-folder-dialog"><X /></button></div>
            <FormField control={folderForm.control} name="name" rules={{ required: 'Enter a folder name.' }} render={({ field }) => (
              <FormItem>
                <FormLabel className="field-label">Folder name</FormLabel>
                <FormControl><input className="field-control" maxLength={120} autoFocus data-testid="input-folder-name" {...field} /></FormControl>
                <FormMessage data-testid="error-folder-name" />
              </FormItem>
            )} />
            <div className="dialog-footer"><button className="button button-quiet" type="button" onClick={() => setModal(null)} data-testid="cancel-folder">Cancel</button><button className="button button-primary" type="submit" disabled={!folderForm.watch('name')?.trim() || createFolder.isPending || updateFolder.isPending} data-testid="save-folder">{editingFolder ? 'Save Name' : 'Create Folder'}</button></div>
          </form>
          </Form>
        </div>
      ) : null}

      {modal === 'upload' ? (
        <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !uploadBusy) setModal(null); }}>
          <Form {...uploadForm}>
          <form className="dialog" onSubmit={uploadForm.handleSubmit(uploadSelected)} aria-labelledby="upload-dialog-title">
            <div className="dialog-head"><div><h2 id="upload-dialog-title">Add to the library</h2><p>Stored in App Storage</p></div><button className="mini-action" type="button" aria-label="Close upload dialog" disabled={uploadBusy} onClick={() => setModal(null)} data-testid="close-upload-dialog"><X /></button></div>
            <div className="upload-destination" data-testid="upload-destination">
              <Folder aria-hidden="true" />
              <div><span>Upload destination</span><strong>{selectedFolder || 'Root folder'}</strong></div>
            </div>
            <input ref={fileInputRef} type="file" hidden onChange={(event) => chooseUpload(event.target.files?.[0])} data-testid="input-upload-file" />
            <div className={`dropzone ${dragging ? 'dragging' : ''}`} role="button" tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') fileInputRef.current?.click(); }}
              onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)} onDrop={handleDrop}
              data-testid="upload-dropzone">
              <div><Upload /><strong>{uploadFile ? uploadFile.name : 'Choose a file or drop it here'}</strong><span>{uploadFile ? `${displaySize(uploadFile.size)} · ${uploadFile.type || 'application/octet-stream'}` : 'File type and size are read from the actual file.'}</span></div>
            </div>
            <FormField control={uploadForm.control} name="title" rules={{ required: 'Enter a title.' }} render={({ field }) => (
              <FormItem>
                <FormLabel className="field-label">Title</FormLabel>
                <FormControl><input className="field-control" maxLength={220} data-testid="input-upload-title" {...field} /></FormControl>
                <FormMessage data-testid="error-upload-title" />
                <p className="field-help">File name: <code data-testid="generated-upload-filename">{generatedUploadName || 'Choose a file to preview its extension'}</code></p>
              </FormItem>
            )} />
            <FormField control={uploadForm.control} name="date" rules={{
              required: 'Enter a content date.',
              validate: (value) => normalizeDateForApi(value) !== null || 'Choose a valid date.',
            }} render={({ field }) => (
              <FormItem>
                <FormLabel className="field-label">Content date</FormLabel>
                <FormControl><input className="field-control" type="date" data-testid="input-upload-date" {...field} /></FormControl>
                <FormMessage data-testid="error-upload-date" />
                <p className="field-help">The selected local date is saved in ISO format.</p>
              </FormItem>
            )} />
            {uploadFile && isImageFile(uploadFile) ? (
              <FormField control={uploadForm.control} name="isWallpaper" render={({ field }) => (
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
              )} />
            ) : null}
            <div className="dialog-footer"><button className="button button-quiet" type="button" disabled={uploadBusy} onClick={() => setModal(null)} data-testid="cancel-upload">Cancel</button><button className="button button-primary" type="submit" disabled={!uploadFile || !uploadForm.watch('title')?.trim() || uploadBusy} data-testid="submit-upload">{uploadBusy ? 'Uploading…' : 'Upload File'}</button></div>
          </form>
          </Form>
        </div>
      ) : null}

      {editorFile ? (
        <div className="overlay" role="presentation">
          <section className="dialog dialog-wide" aria-labelledby="editor-dialog-title">
            <div className="dialog-head"><div><h2 id="editor-dialog-title">Edit text file</h2><p>{editorFile.folderPath}/{editorFile.name}</p></div><button className="mini-action" type="button" aria-label="Close text editor" disabled={editorBusy} onClick={() => setEditorFile(null)} data-testid="close-text-editor"><X /></button></div>
            <div className="editor-meta"><span>Plain text editor</span><span>{new Blob([editorText]).size.toLocaleString()} bytes</span></div>
            {editorLoading ? <div className="loading-state"><div><div className="skeleton" style={{ width: 280 }} /><div className="skeleton" style={{ width: 220 }} /><div className="skeleton" style={{ width: 260 }} /></div></div> : <textarea className="editor-area" value={editorText} onChange={(event) => setEditorText(event.target.value)} spellCheck={false} aria-label="Text file contents" data-testid="textarea-text-content" />}
            <div className="dialog-footer"><button className="button button-quiet" type="button" disabled={editorBusy} onClick={() => setEditorFile(null)} data-testid="cancel-text-edit">Cancel</button><button className="button button-primary" type="button" disabled={editorLoading || editorBusy} onClick={() => void saveText()} data-testid="save-text-file">{editorBusy ? 'Saving…' : 'Save Changes'}</button></div>
          </section>
        </div>
      ) : null}
      {toastMessage ? <div role="status" aria-live="polite" className="toast" data-testid="status-toast">{toastMessage}</div> : null}
    </div>
  );
}

function FileName({ file }: { file: ContentFile }) {
  return (
    <div className="file-name-cell">
      <div className="file-icon">{fileIcon(file)}</div>
      <div className="file-name-wrap">
        <span className="file-name" data-testid={`text-file-name-${file.id}`}>{file.name}</span>
        <span className="file-sub">{file.folderPath || 'Root'} · {file.contentType}</span>
      </div>
    </div>
  );
}

function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><div><div className="empty-art"><Folder /></div><h3>{title}</h3><p>{description}</p>{action}</div></div>;
}

function SkeletonRows() {
  return <div className="loading-state" role="status" aria-label="Loading files" data-testid="status-loading-files"><div style={{ width: '100%' }}>{[0, 1, 2, 3].map((item) => <div key={item} className="skeleton" style={{ width: `${88 - item * 8}%`, height: 38, margin: '12px auto' }} />)}</div></div>;
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return <div className="error-state" role="alert" data-testid="status-load-error"><div><div className="empty-art"><RefreshCw /></div><h3>Couldn’t load the library</h3><p>Check your connection and try again. Your files haven’t been changed.</p><button className="button button-primary" type="button" onClick={onRetry} data-testid="retry-load"><RefreshCw /> Try Again</button></div></div>;
}

function LoadingAuth() {
  return <main className="auth-screen" role="status" data-testid="status-auth-loading"><div className="auth-card"><div className="brand"><div className="brand-mark">J</div><div><div className="brand-title">JMT Archive</div><div className="brand-caption">Private publishing</div></div></div><div className="skeleton" style={{ width: '65%', margin: '28px 0 12px' }} /><div className="skeleton" style={{ width: '95%' }} /><div className="skeleton" style={{ width: '82%' }} /></div></main>;
}

function NotFound() {
  return <main className="auth-screen"><section className="auth-card"><div className="eyebrow">Archive / 404</div><h1>That page isn’t here.</h1><p>Return to the admin console to continue managing your library.</p><a href="/" className="button button-primary" data-testid="link-return-home">Return to library</a></section></main>;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message.replace(/^HTTP \d+ [^:]+:\s*/, '') : 'Something went wrong. Please try again.';
}

export default App;
