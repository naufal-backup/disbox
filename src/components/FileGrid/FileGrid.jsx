import { ArrowUpDown, ChevronDown, ChevronRight, Folder, FolderPlus, Grid3x3, Home, List, Search, Upload, ZoomIn, Check } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import styles from './FileGrid.module.css';

import { CreateFolderModal, MoveModal, ConfirmModal } from '@/components/FolderModal/FolderModal.jsx';
import ShareDialog from '@/components/ShareDialog/ShareDialog.jsx';
import FilePreview from '@/components/FilePreview/FilePreview.jsx';
import FileThumbnail from './Thumbnail.jsx';
import PinPromptModal from './PinPrompt.jsx';
import ContextMenu from './ContextMenu.jsx';
import GridItem from './GridItem.jsx';
import ListItem from './ListItem.jsx';
import useFileGrid from './hooks/useFileGrid.js';

export default function FileGrid({ isLockedView = false, isStarredView = false, isRecentView = false, onNavigate }) {
  const {
    // State
    viewMode, setViewMode,
    zoom, setZoom,
    sortMode, setSortMode,
    searchQuery, setSearchQuery,
    selectedFiles,
    contextMenu, setContextMenu,
    renameTarget, setRenameTarget,
    renameValue, setRenameValue,
    uploading,
    showCreateFolder, setShowCreateFolder,
    moveModal, setMoveModal,
    dragSource, setDragSource,
    isSelectionMode,
    confirmAction, setConfirmAction,
    dragOverTarget, setDragOverTarget,
    previewFile, setPreviewFile,
    pinPrompt, setPinPrompt,
    showBreadcrumbMenu, setShowBreadcrumbMenu,
    shareDialog, setShareDialog,
    showSortMenu, setShowSortMenu,
    isLastPartTruncated,
    isDragOver, setIsDragOver,
    ghostUploads,
    
    // Refs
    activeFolderRef,
    contextMenuRef,
    contentRef,

    // Handlers
    formatItemDate,
    navigate,
    handleFolderClick,
    handleFileClick,
    handleDownloadClick,
    handleToggleLock,
    handleToggleStar,
    handleDelete,
    handleBulkDelete,
    handleBulkMove,
    startRename,
    commitRename,
    handlePickFiles,
    handleDropZone,
    downloadFile,
    toggleSelect,
    clearSelection,
    handleDragStart,
    handleDropMove,

    // Processed data
    pathParts,
    processedFiles,
    processedDirs,
    folderLocks,
    folderStars,

    // App Context Passthrough
    loading,
    refresh,
    t,
    uiScale,
    animationsEnabled,
    shareEnabled,
    currentPath
  } = useFileGrid({ isLockedView, isStarredView, isRecentView, onNavigate });

  return (
    <div className={`${styles.container} ${isDragOver ? styles.dragOver : ''} ${isSelectionMode ? styles.isSelectionMode : ''}`} style={{ '--zoom': zoom }} onDragOver={(e) => { 
  e.preventDefault(); 
  if (e.dataTransfer.types.includes('Files') && !dragSource) {
    setIsDragOver(true); 
  } else {
    setIsDragOver(false);
  }
}} onDragLeave={() => setIsDragOver(false)} onDrop={(e) => { setIsDragOver(false); if (e.dataTransfer.files.length > 0) handleDropZone(e); }} onClick={() => { setContextMenu(null); if (!isSelectionMode) clearSelection(); }} onContextMenu={(e) => { 
      if (e.target.closest('.' + styles.toolbar)) return;
      e.preventDefault(); 
      setContextMenu({ x: e.clientX / uiScale, y: e.clientY / uiScale, type: 'empty' }); 
    }}>
      <div className={styles.toolbar}>
        {(() => {
          const totalChars = pathParts.join('').length + (pathParts.length * 3);
          const isCompact = (totalChars > 45 || pathParts.length > 4) && pathParts.length > 1;
          const lastPart = pathParts[pathParts.length - 1] || '';
          const displayLen = isCompact ? (10 + lastPart.length) : totalChars;
          const isShort = displayLen < 160;
          return (
            <div className={styles.breadcrumb} style={{ marginRight: isShort ? 24 : 124 }}>
              <button className={styles.breadcrumbItem} onClick={() => navigate('/')} onDragOver={e => e.preventDefault()} onDrop={e => handleDropMove(e, '')}><Home size={13} /></button>
              {!isCompact ? pathParts.map((part, i) => {
                const targetPath = '/' + pathParts.slice(0, i + 1).join('/');
                const isLast = i === pathParts.length - 1;
                return <span key={i} className={styles.breadcrumbRow}><ChevronRight size={12} className={styles.breadcrumbSep} /><button className={`${styles.breadcrumbItem} ${isLast ? styles.breadcrumbActive : ''}`} onClick={() => navigate(targetPath)}>{part}</button></span>;
              }) : <>
                <ChevronRight size={12} className={styles.breadcrumbSep} />
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', zIndex: showBreadcrumbMenu ? 1001 : 'auto' }}>
                  <button className={`${styles.breadcrumbItem} ${styles.breadcrumbEllipsis}`} onClick={(e) => { e.stopPropagation(); setShowBreadcrumbMenu(!showBreadcrumbMenu); }}>...</button>
                  {showBreadcrumbMenu && <><div className={styles.breadcrumbBackdrop} onClick={(e) => { e.stopPropagation(); setShowBreadcrumbMenu(false); }} /><div className={styles.breadcrumbMenu}>{pathParts.slice(0, -1).map((part, i) => { const targetPath = '/' + pathParts.slice(0, i + 1).join('/'); return <button key={i} className={styles.breadcrumbMenuItem} style={{ paddingLeft: 12 + (i * 12) }} onClick={() => { navigate(targetPath); setShowBreadcrumbMenu(false); }}><div className={styles.menuBranch} style={{ left: 8 + (i * 12) }} /><Folder size={12} style={{ color: 'var(--amber)', flexShrink: 0 }} /><span className="truncate">{part}</span></button>; })}</div></>}
                </div>
                <ChevronRight size={12} className={styles.breadcrumbSep} />
                <button ref={activeFolderRef} className={`${styles.breadcrumbItem} ${styles.breadcrumbActive}`} onClick={() => navigate('/' + pathParts.join('/'))}>{lastPart}</button>
              </>}
            </div>
          );
        })()}
        <div className={styles.toolbarRight}>
          <div className={styles.searchBox}><Search size={13} /><input type="text" placeholder={t('search')} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className={styles.searchInput} /></div>
          <div className={styles.sortBoxContainer}>
            <button className={styles.sortBox} onClick={(e) => { e.stopPropagation(); setShowSortMenu(!showSortMenu); }}>
              <ArrowUpDown size={12} className={styles.sortIconMain} />
              <span className={styles.sortText}>
                {sortMode === 'name' ? t('sort_name') : sortMode === 'date' ? t('sort_date') : t('sort_size')}
              </span>
              <ChevronDown size={12} className={`${styles.sortIconArrow} ${showSortMenu ? styles.rotated : ''}`} />
            </button>
            {showSortMenu && (
              <>
                <div className={styles.menuBackdrop} onClick={(e) => { e.stopPropagation(); setShowSortMenu(false); }} />
                <div className={styles.sortMenu}>
                  <button className={`${styles.sortMenuItem} ${sortMode === 'name' ? styles.active : ''}`} onClick={() => { setSortMode('name'); setShowSortMenu(false); }}>
                    <div className={styles.checkIcon}>{sortMode === 'name' && <Check size={12} />}</div>
                    {t('sort_name')}
                  </button>
                  <button className={`${styles.sortMenuItem} ${sortMode === 'date' ? styles.active : ''}`} onClick={() => { setSortMode('date'); setShowSortMenu(false); }}>
                    <div className={styles.checkIcon}>{sortMode === 'date' && <Check size={12} />}</div>
                    {t('sort_date')}
                  </button>
                  <button className={`${styles.sortMenuItem} ${sortMode === 'size' ? styles.active : ''}`} onClick={() => { setSortMode('size'); setShowSortMenu(false); }}>
                    <div className={styles.checkIcon}>{sortMode === 'size' && <Check size={12} />}</div>
                    {t('sort_size')}
                  </button>
                </div>
              </>
            )}
          </div>
          <div className={styles.viewToggle}><button className={`${styles.viewBtn} ${viewMode === 'grid' ? styles.viewActive : ''}`} onClick={() => setViewMode('grid')}><Grid3x3 size={13} /></button><button className={`${styles.viewBtn} ${viewMode === 'list' ? styles.viewActive : ''}`} onClick={() => setViewMode('list')}><List size={13} /></button></div>
          <div className={styles.zoomBox}><ZoomIn size={13} /><input type="range" min="0.6" max="1.8" step="0.1" value={zoom} onChange={e => setZoom(parseFloat(e.target.value))} className={styles.zoomSlider} /></div>
          <button className={styles.folderBtn} onClick={() => setShowCreateFolder(true)} title={t('new_folder')}><FolderPlus size={14} /></button>
          <button className={styles.uploadBtn} onClick={handlePickFiles} disabled={uploading}><Upload size={14} /><span>{uploading ? 'Uploading…' : t('upload')}</span></button>
        </div>
      </div>
      <div className={styles.content} ref={contentRef} style={{ position: 'relative' }}>
        <AnimatePresence mode="wait">
          {loading && processedFiles.length === 0 && processedDirs.length === 0 ? (
            <motion.div 
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={styles.loading}
            >
              {[...Array(6)].map((_, i) => <div key={i} className={`skeleton ${styles.skeletonCard}`} />)}
            </motion.div>
          ) : processedFiles.length === 0 && processedDirs.length === 0 ? (
            <motion.div 
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={styles.empty}
            >
              <div className={styles.emptyIcon}>📂</div>
              <p className={styles.emptyTitle}>{t('empty_folder')}</p>
              <p className={styles.emptyHint}>{t('empty_hint')}</p>
            </motion.div>
          ) : viewMode === 'grid' ? (
            <motion.div 
              key={`grid-${currentPath}-${isLockedView}-${isStarredView}-${isRecentView}`}
              initial={animationsEnabled ? { opacity: 0, y: 5 } : false}
              animate={{ opacity: 1, y: 0 }}
              exit={animationsEnabled ? { opacity: 0, y: -5 } : false}
              transition={{ duration: 0.15 }}
              className={styles.grid}
            >
              {processedDirs.map((dir) => (
                <GridItem
                  key={dir.fullPath}
                  item={dir}
                  isFolder={true}
                  isSelected={selectedFiles.has(dir.fullPath)}
                  dragOverTarget={dragOverTarget}
                  dragSource={dragSource}
                  handleDragStart={handleDragStart}
                  setDragSource={setDragSource}
                  setDragOverTarget={setDragOverTarget}
                  handleDropMove={handleDropMove}
                  handleFolderClick={handleFolderClick}
                  toggleSelect={toggleSelect}
                  setContextMenu={setContextMenu}
                  uiScale={uiScale}
                  renameTarget={renameTarget}
                  renameValue={renameValue}
                  setRenameValue={setRenameValue}
                  commitRename={commitRename}
                  setRenameTarget={setRenameTarget}
                  formatItemDate={formatItemDate}
                />
              ))}
              {processedFiles.map((file) => (
                <GridItem
                  key={file.id || file.path}
                  item={file}
                  isFolder={false}
                  isSelected={selectedFiles.has(file.id)}
                  dragOverTarget={dragOverTarget}
                  dragSource={dragSource}
                  handleDragStart={handleDragStart}
                  setDragSource={setDragSource}
                  setDragOverTarget={setDragOverTarget}
                  handleDropMove={handleDropMove}
                  handleFileClick={handleFileClick}
                  toggleSelect={toggleSelect}
                  setContextMenu={setContextMenu}
                  uiScale={uiScale}
                  renameTarget={renameTarget}
                  renameValue={renameValue}
                  setRenameValue={setRenameValue}
                  commitRename={commitRename}
                  setRenameTarget={setRenameTarget}
                  formatItemDate={formatItemDate}
                />
              ))}
              {ghostUploads
                .filter(g => {
                  // Only show ghosts for the current folder
                  const ghostDir = g.path.includes('/') ? g.path.split('/').slice(0, -1).join('/') : '';
                  return ghostDir === (currentPath === '/' ? '' : currentPath.slice(1));
                })
                .map(ghost => (
                  <div key={ghost.id} className={`${styles.card} ${styles.ghostCard}`} style={{ '--ghost-progress': ghost.progress }}>
                    <div className={styles.cardHeader}>
                      <div className={styles.cardIconWrapper}>
                        <div className={`skeleton ${styles.ghostIconSkeleton}`} />
                      </div>
                      <div className={styles.cardTitleWrapper}>
                        <div className={`skeleton ${styles.ghostTitleSkeleton}`} />
                      </div>
                    </div>
                    <div className={styles.cardPreview}>
                      <div className={styles.cardPreviewInner}>
                        <div className={`skeleton ${styles.ghostPreviewSkeleton}`} />
                      </div>
                    </div>
                    <div className={styles.cardFooter}>
                      <div className={styles.ghostProgressBar}>
                        <div className={styles.ghostProgressFill} style={{ width: `${(ghost.progress * 100).toFixed(0)}%` }} />
                      </div>
                    </div>
                  </div>
                ))
              }
            </motion.div>
          ) : (
            <motion.div 
              key={`list-${currentPath}-${isLockedView}-${isStarredView}-${isRecentView}`}
              initial={animationsEnabled ? { opacity: 0, x: -5 } : false}
              animate={{ opacity: 1, x: 0 }}
              exit={animationsEnabled ? { opacity: 0, x: 5 } : false}
              transition={{ duration: 0.15 }}
              className={styles.list}
            >
              <div className={styles.listHeader}>
                <span className={styles.listColCheck}></span>
                <span className={styles.listColName}>Nama</span>
                <span className={styles.listColSize}>Ukuran</span>
                <span className={styles.listColActions}></span>
              </div>
              {processedDirs.map((dir) => (
                <ListItem
                  key={dir.fullPath}
                  item={dir}
                  isFolder={true}
                  isSelected={selectedFiles.has(dir.fullPath)}
                  zoom={zoom}
                  dragOverTarget={dragOverTarget}
                  dragSource={dragSource}
                  handleDragStart={handleDragStart}
                  setDragSource={setDragSource}
                  setDragOverTarget={setDragOverTarget}
                  handleDropMove={handleDropMove}
                  handleFolderClick={handleFolderClick}
                  toggleSelect={toggleSelect}
                  setContextMenu={setContextMenu}
                  uiScale={uiScale}
                  renameTarget={renameTarget}
                  renameValue={renameValue}
                  setRenameValue={setRenameValue}
                  commitRename={commitRename}
                  setRenameTarget={setRenameTarget}
                  setMoveModal={setMoveModal}
                  startRename={startRename}
                />
              ))}
              {processedFiles.map((file) => (
                <ListItem
                  key={file.id || file.path}
                  item={file}
                  isFolder={false}
                  isSelected={selectedFiles.has(file.id)}
                  zoom={zoom}
                  dragOverTarget={dragOverTarget}
                  dragSource={dragSource}
                  handleDragStart={handleDragStart}
                  setDragSource={setDragSource}
                  setDragOverTarget={setDragOverTarget}
                  handleDropMove={handleDropMove}
                  handleFileClick={handleFileClick}
                  toggleSelect={toggleSelect}
                  setContextMenu={setContextMenu}
                  uiScale={uiScale}
                  renameTarget={renameTarget}
                  renameValue={renameValue}
                  setRenameValue={setRenameValue}
                  commitRename={commitRename}
                  setRenameTarget={setRenameTarget}
                  handleDownloadClick={handleDownloadClick}
                  setMoveModal={setMoveModal}
                  startRename={startRename}
                />
              ))}
              {ghostUploads
                .filter(g => {
                  const ghostDir = g.path.includes('/') ? g.path.split('/').slice(0, -1).join('/') : '';
                  return ghostDir === (currentPath === '/' ? '' : currentPath.slice(1));
                })
                .map(ghost => (
                  <div key={ghost.id} className={`${styles.listRow} ${styles.ghostRow}`} style={{ '--ghost-progress': ghost.progress }}>
                    <div className={styles.listIcon} style={{ width: `calc(28px * var(--zoom))`, height: `calc(28px * var(--zoom))`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div className={`skeleton ${styles.ghostIconSkeleton}`} style={{ width: '18px', height: '18px' }} />
                    </div>
                    <span className={styles.listName}>
                      <div className={`skeleton ${styles.ghostTitleSkeleton}`} style={{ width: '120px' }} />
                    </span>
                    <span className={styles.listSize}>
                      <div className={`skeleton ${styles.ghostTitleSkeleton}`} style={{ width: '40px', marginLeft: 'auto' }} />
                    </span>
                    <div className={styles.listActions}></div>
                    <div className={styles.ghostProgressLine} style={{ width: `${(ghost.progress * 100).toFixed(0)}%` }} />
                  </div>
                ))
              }
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <ContextMenu
        contextMenu={contextMenu}
        setContextMenu={setContextMenu}
        contextMenuRef={contextMenuRef}
        t={t}
        selectedFiles={selectedFiles}
        handlePickFiles={handlePickFiles}
        refresh={refresh}
        handleBulkMove={handleBulkMove}
        handleBulkDelete={handleBulkDelete}
        downloadFile={downloadFile}
        setMoveModal={setMoveModal}
        startRename={startRename}
        folderLocks={folderLocks}
        handleToggleLock={handleToggleLock}
        folderStars={folderStars}
        handleToggleStar={handleToggleStar}
        shareEnabled={shareEnabled}
        setShareDialog={setShareDialog}
        handleDelete={handleDelete}
        setShowCreateFolder={setShowCreateFolder}
      />
      {isDragOver && <div className={styles.dropOverlay}><Upload size={40} /><p>Drop untuk upload</p></div>}
      <AnimatePresence>
        {showCreateFolder && <CreateFolderModal onClose={() => setShowCreateFolder(false)} />}
        {moveModal && <MoveModal id={moveModal.id} file={moveModal.path} paths={moveModal.paths} mode={moveModal.mode} onClose={() => { setMoveModal(null); clearSelection(); }} onUnlock={moveModal.onUnlock} />}
        {confirmAction && <ConfirmModal title={confirmAction.title} message={confirmAction.message} danger={confirmAction.danger} onConfirm={confirmAction.onConfirm} onClose={() => setConfirmAction(null)} />}
        {previewFile && <FilePreview file={previewFile} allFiles={processedFiles} onFileChange={setPreviewFile} onClose={() => setPreviewFile(null)} />}
        {pinPrompt && <PinPromptModal title={pinPrompt.title} onSuccess={pinPrompt.onSuccess} onClose={() => setPinPrompt(null)} />}
        {shareDialog && <ShareDialog filePath={shareDialog.path} fileId={shareDialog.file?.id} onClose={() => setShareDialog(null)} />}
      </AnimatePresence>
    </div>
  );
}
