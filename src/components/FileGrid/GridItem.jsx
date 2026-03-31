import { Folder, MoreVertical, Lock, Star } from 'lucide-react';
import { formatSize } from '@/utils/disbox.js';
import FileThumbnail from './Thumbnail.jsx';
import styles from './FileGrid.module.css';
import { renderFileIcon } from './FileIcon.jsx';

export default function GridItem({
  item,
  isFolder,
  isSelected,
  dragOverTarget,
  dragSource,
  handleDragStart,
  setDragSource,
  setDragOverTarget,
  handleDropMove,
  handleFolderClick,
  handleFileClick,
  toggleSelect,
  setContextMenu,
  uiScale,
  renameTarget,
  renameValue,
  setRenameValue,
  commitRename,
  setRenameTarget,
  formatItemDate
}) {
  const fullPath = isFolder ? item.fullPath : item.path;
  const name = isFolder ? item.name : item.path.split('/').pop();
  const id = isFolder ? null : item.id;
  const itemKey = id || fullPath;

  const canBeDropTarget = isFolder && (dragSource?.bulk 
    ? !isSelected 
    : (dragSource && fullPath !== dragSource && !fullPath.startsWith(dragSource + '/'))
  );

  const isRenaming = isFolder 
    ? renameTarget?.path === fullPath 
    : renameTarget?.path === item.path && renameTarget?.id === item.id;

  return (
    <div 
      key={itemKey}
      data-item-id={itemKey} 
      className={`${styles.card} ${isSelected ? styles.selected : ''} ${dragOverTarget === fullPath ? styles.isDragTarget : ''} ${item.__ghost ? styles.ghostCard : ''}`}
      style={item.__ghost ? { '--ghost-progress': 0.7 } : undefined}
      draggable 
      onDragStart={(e) => handleDragStart(e, fullPath, id)} 
      onDragEnd={() => setDragSource(null)} 
      onDragOver={isFolder ? (e) => { 
        const types = Array.from(e.dataTransfer.types); 
        if (canBeDropTarget || types.includes('Files')) { 
          e.preventDefault(); 
          e.dataTransfer.dropEffect = 'move'; 
          if (dragOverTarget !== fullPath) setDragOverTarget(fullPath); 
        } 
      } : undefined} 
      onDragLeave={isFolder ? (e) => { 
        const rect = e.currentTarget.getBoundingClientRect(); 
        if (e.clientX < rect.left || e.clientX >= rect.right || e.clientY < rect.top || e.clientY >= rect.bottom) setDragOverTarget(null); 
      } : undefined} 
      onDrop={isFolder ? (e) => { 
        setDragOverTarget(null); 
        handleDropMove(e, fullPath); 
      } : undefined} 
      onDoubleClick={() => isFolder ? handleFolderClick(fullPath) : handleFileClick(item)} 
      onClick={(e) => toggleSelect(itemKey, e)} 
      onContextMenu={(e) => { 
        e.preventDefault(); 
        e.stopPropagation(); 
        setContextMenu({ 
          x: e.clientX / uiScale, 
          y: e.clientY / uiScale, 
          path: fullPath, 
          file: isFolder ? null : item, 
          isFolder 
        }); 
      }}
    >
      {item.isLocked && <div className={styles.lockOverlay}><Lock size={12} /></div>}
      {item.isStarred && <div className={styles.starOverlay}><Star size={12} fill="currentColor" /></div>}
      
      <div className={styles.cardHeader}>
        <div className={styles.cardIconWrapper}>
          {isFolder ? <Folder size={18} style={{ color: 'var(--text-secondary)' }} strokeWidth={2} /> : renderFileIcon(name)}
        </div>
        <div className={styles.cardTitleWrapper} title={name}>
          {isRenaming ? (
            <input 
              className={styles.renameInput} 
              value={renameValue} 
              onChange={e => setRenameValue(e.target.value)} 
              onBlur={commitRename} 
              onKeyDown={e => { 
                if (e.key === 'Enter') commitRename(); 
                if (e.key === 'Escape') setRenameTarget(null); 
              }} 
              autoFocus 
              onClick={e => e.stopPropagation()} 
            />
          ) : (
            <span className={styles.cardTitleText}>{name}</span>
          )}
        </div>
        <button 
          className={styles.cardMenuBtn} 
          onClick={(e) => { 
            e.stopPropagation(); 
            setContextMenu({ 
              x: e.clientX / uiScale, 
              y: e.clientY / uiScale, 
              path: fullPath, 
              file: isFolder ? null : item, 
              isFolder 
            }); 
          }}
        >
          <MoreVertical size={isFolder ? 18 : 20} />
        </button>
      </div>

      <div className={styles.cardPreview}>
        <div className={styles.cardPreviewInner}>
          {isFolder ? (
            <Folder size={72} style={{ color: 'var(--amber)' }} strokeWidth={1.5} />
          ) : (
            <FileThumbnail file={item} size={48} />
          )}
        </div>
      </div>

      <div className={styles.cardFooter}>
        <div className={styles.cardFooterText}>
          {isFolder ? `Folder • ${formatSize(item.size)}` : `${formatItemDate(item.createdAt)} • ${formatSize(item.size || 0)}`}
        </div>
      </div>
    </div>
  );
}
