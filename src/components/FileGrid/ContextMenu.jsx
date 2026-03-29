import { 
  FolderPlus, Upload, RefreshCw, Move, Copy, Trash2, 
  Download, Edit3, Unlock, Lock, Star, Link2 
} from 'lucide-react';
import styles from './FileGrid.module.css';

export default function ContextMenu({
  contextMenu,
  setContextMenu,
  contextMenuRef,
  t,
  selectedFiles,
  handlePickFiles,
  refresh,
  handleBulkMove,
  handleBulkDelete,
  downloadFile,
  setMoveModal,
  startRename,
  folderLocks,
  handleToggleLock,
  folderStars,
  handleToggleStar,
  shareEnabled,
  setShareDialog,
  handleDelete,
  setShowCreateFolder
}) {
  if (!contextMenu) return null;

  return (
    <>
      <div 
        className={styles.contextMenuBackdrop} 
        onClick={() => setContextMenu(null)} 
        onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} 
      />
      <div 
        ref={contextMenuRef} 
        className={styles.contextMenu} 
        style={{ top: contextMenu.y, left: contextMenu.x }} 
        onClick={e => e.stopPropagation()}
      >
        {contextMenu.type === 'empty' ? (
          <>
            <button onClick={() => { setShowCreateFolder(true); setContextMenu(null); }}>
              <FolderPlus size={13} /> {t('new_folder')}
            </button>
            <button onClick={() => { handlePickFiles(); setContextMenu(null); }}>
              <Upload size={13} /> {t('upload')} File
            </button>
            <div className={styles.contextDivider} />
            <button onClick={() => { refresh(); setContextMenu(null); }}>
              <RefreshCw size={13} /> {t('refresh')}
            </button>
          </>
        ) : selectedFiles.size > 1 && selectedFiles.has(contextMenu.isFolder ? contextMenu.path : contextMenu.file?.id) ? (
          <>
            <button onClick={() => { handleBulkMove('move'); setContextMenu(null); }}>
              <Move size={13} /> {t('pindah_item', { count: selectedFiles.size })}
            </button>
            <button onClick={() => { handleBulkMove('copy'); setContextMenu(null); }}>
              <Copy size={13} /> {t('salin_item', { count: selectedFiles.size })}
            </button>
            <div className={styles.contextDivider} />
            <button className={styles.dangerItem} onClick={() => { handleBulkDelete(); setContextMenu(null); }}>
              <Trash2 size={13} /> {t('hapus_item', { count: selectedFiles.size })}
            </button>
          </>
        ) : (
          <>
            {!contextMenu.isFolder && (
              <button onClick={() => { downloadFile(contextMenu.file); setContextMenu(null); }}>
                <Download size={13} /> {t('download')}
              </button>
            )}
            <button onClick={() => { 
              setMoveModal({ id: contextMenu.isFolder ? null : contextMenu.file?.id, path: contextMenu.path, mode: 'move' }); 
              setContextMenu(null); 
            }}>
              <Move size={13} /> {t('move')}
            </button>
            <button onClick={() => { 
              setMoveModal({ id: contextMenu.isFolder ? null : contextMenu.file?.id, path: contextMenu.path, mode: 'copy' }); 
              setContextMenu(null); 
            }}>
              <Copy size={13} /> {t('copy')}
            </button>
            <button onClick={() => startRename(contextMenu.path, contextMenu.isFolder, contextMenu.isFolder ? null : contextMenu.file?.id)}>
              <Edit3 size={13} /> {t('rename')}
            </button>
            {contextMenu.isFolder ? (() => {
              const l = folderLocks.get(contextMenu.path);
              const isLocked = l && l.count > 0 && l.lockedCount === l.count;
              return (
                <button onClick={() => handleToggleLock(contextMenu.path, null, !isLocked)}>
                  {isLocked ? <><Unlock size={13} /> {t('unlock')}</> : <><Lock size={13} /> {t('lock')}</>}
                </button>
              );
            })() : (
              <button onClick={() => handleToggleLock(contextMenu.path, contextMenu.file?.id, !contextMenu.file?.isLocked)}>
                {contextMenu.file?.isLocked ? <><Unlock size={13} /> {t('unlock')}</> : <><Lock size={13} /> {t('lock')}</>}
              </button>
            )}
            {contextMenu.isFolder ? (() => {
              const isStarred = folderStars.has(contextMenu.path);
              return (
                <button onClick={() => handleToggleStar(contextMenu.path, null, !isStarred)}>
                  {isStarred ? <><Star size={13} fill="currentColor" /> {t('unstar')}</> : <><Star size={13} /> {t('star')}</>}
                </button>
              );
            })() : (
              <button onClick={() => handleToggleStar(contextMenu.path, contextMenu.file?.id, !contextMenu.file?.isStarred)}>
                {contextMenu.file?.isStarred ? <><Star size={13} fill="currentColor" /> {t('unstar')}</> : <><Star size={13} /> {t('star')}</>}
              </button>
            )}
            <div className={styles.contextDivider} />
            {shareEnabled && !contextMenu.isFolder && (
              <button onClick={() => { setShareDialog({ path: contextMenu.path, file: contextMenu.file }); setContextMenu(null); }}>
                <Link2 size={13} /> Share
              </button>
            )}
            <div className={styles.contextDivider} />
            <button 
              className={styles.dangerItem} 
              onClick={() => { handleDelete(contextMenu.path, contextMenu.isFolder ? null : contextMenu.file?.id); setContextMenu(null); }}
            >
              <Trash2 size={13} /> {t('delete')}
            </button>
          </>
        )}
      </div>
    </>
  );
}
