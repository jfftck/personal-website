import type { ReactNode } from 'react';
import {
  ArrowDownToLine, Folder, FolderPlus, HardDrive, Moon, Pencil, Plus, Sun, Trash2,
} from 'lucide-react';
import type { ContentFolder } from '@workspace/api-client-react';

type FolderNavigationProps = {
  folders: ContentFolder[];
  selectedFolder: string;
  view: 'library' | 'trash';
  mobileOpen: boolean;
  dark: boolean;
  fileCount: number;
  trashCount: number;
  isLoadingFolders: boolean;
  onSelectAllFiles: () => void;
  onSelectTrash: () => void;
  onSelectFolder: (folder: ContentFolder) => void;
  onCreateFolder: (parentPath: string) => void;
  onRenameFolder: (folder: ContentFolder) => void;
  onDeleteFolder: (folder: ContentFolder) => void;
  onToggleTheme: () => void;
  onSignOut: () => void;
};

export function FolderNavigation({
  folders,
  selectedFolder,
  view,
  mobileOpen,
  dark,
  fileCount,
  trashCount,
  isLoadingFolders,
  onSelectAllFiles,
  onSelectTrash,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onToggleTheme,
  onSignOut,
}: FolderNavigationProps) {
  const renderFolders = (parentPath: string, depth: number): ReactNode =>
    folders
      .filter((folder) => folder.parentPath === parentPath)
      .map((folder) => (
        <div key={folder.id}>
          <div className="folder-row">
            <button
              type="button"
              className={`folder-button ${selectedFolder === folder.path && view === 'library' ? 'active' : ''}`}
              style={{ paddingLeft: 10 + depth * 15 }}
              onClick={() => onSelectFolder(folder)}
              data-testid={`select-folder-${folder.id}`}
              aria-label={`Open folder ${folder.name}`}
            >
              <Folder aria-hidden="true" />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.name}</span>
            </button>
            <div className="folder-tools">
              <button
                className="mini-action"
                type="button"
                aria-label={`Add folder inside ${folder.name}`}
                title="Add subfolder"
                onClick={() => onCreateFolder(folder.path)}
                data-testid={`add-subfolder-${folder.id}`}
              >
                <Plus />
              </button>
              <button
                className="mini-action"
                type="button"
                aria-label={`Rename ${folder.name}`}
                title="Rename folder"
                onClick={() => onRenameFolder(folder)}
                data-testid={`rename-folder-${folder.id}`}
              >
                <Pencil />
              </button>
              <button
                className="mini-action"
                type="button"
                aria-label={`Delete ${folder.name}`}
                title="Delete folder"
                onClick={() => onDeleteFolder(folder)}
                data-testid={`delete-folder-${folder.id}`}
              >
                <Trash2 />
              </button>
            </div>
          </div>
          {renderFolders(folder.path, depth + 1)}
        </div>
      ));

  return (
    <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`} aria-label="Library navigation">
      <div className="brand">
        <div className="brand-mark">J</div>
        <div><div className="brand-title">JMT Archive</div><div className="brand-caption">Private publishing</div></div>
      </div>
      <div className="side-label">Workspace</div>
      <button
        className={`side-button ${view === 'library' && !selectedFolder ? 'active' : ''}`}
        type="button"
        onClick={onSelectAllFiles}
        data-testid="nav-all-files"
      >
        <HardDrive /> All files <span className="count-pill" style={{ marginLeft: 'auto' }}>{fileCount}</span>
      </button>
      <button
        className={`side-button ${view === 'trash' ? 'active' : ''}`}
        type="button"
        onClick={onSelectTrash}
        data-testid="nav-trash"
      >
        <Trash2 /> Trash <span className="count-pill" style={{ marginLeft: 'auto' }}>{trashCount}</span>
      </button>
      <div className="side-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        Folders
        <button
          className="mini-action"
          type="button"
          title="Create folder"
          aria-label="Create folder"
          onClick={() => onCreateFolder(selectedFolder)}
          data-testid="create-folder"
        >
          <FolderPlus />
        </button>
      </div>
      <div className="folder-tree">
        {renderFolders('', 0)}
        {folders.length === 0 && !isLoadingFolders ? (
          <p style={{ padding: '0 10px', color: 'hsl(var(--muted-foreground))', fontSize: 11 }}>No folders yet.</p>
        ) : null}
      </div>
      <div className="sidebar-bottom">
        <button className="side-button" type="button" onClick={onToggleTheme} data-testid="toggle-theme">
          {dark ? <Sun /> : <Moon />} {dark ? 'Light Appearance' : 'Dark Appearance'}
        </button>
        <button className="side-button" type="button" onClick={onSignOut} data-testid="sign-out">
          <ArrowDownToLine style={{ transform: 'rotate(180deg)' }} /> Sign Out
        </button>
      </div>
    </aside>
  );
}
