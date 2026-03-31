import { 
  Folder, Lock, Star, Move, Copy, Edit3, Download 
} from 'lucide-react';
import { formatSize } from '@/utils/disbox.js';
import FileThumbnail from './Thumbnail.jsx';
import styles from './FileGrid.module.css';

export default function ListItem({
  item,
  isFolder,
  isSelected,
  zoom,
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
  handleDownloadClick,
  setMoveModal,
  startRename
}) {
  const fullPath = isFolder ? item.fullPath : item.path;
  const name = isFolder ? item.name : item.path.split('/').pop();
  const id = isFolder ? null : item.id;
  const itemKey = id || fullPath;

  const canBeDropTarget = isFolder && (dragSource?.bulk 
    ? !isSelected 
    : (dragSource && fullPath !== dragSource && !fullPath.startsWith(dragSource + '/'))
  );

  const iconSize = Math.max(isFolder ? 20 : 18, (isFolder ? 22 : 20) * zoom);
  
  const isRenaming = isFolder 
    ? renameTarget?.path === fullPath 
    : renameTarget?.path === item.path && renameTarget?.id === item.id;

  return (
    <div 
      key={itemKey}
      data-item-id={itemKey} 
      className={`${styles.listRow} ${isSelected ? styles.selected : ''} ${dragOverTarget === fullPath ? styles.isDragTarget : ''} ${item.__ghost ? styles.ghostRow : ''}`} 
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
      <div className={styles.listIcon} style={{ width: `calc(28px * var(--zoom))`, height: isFolder ? undefined : `calc(28px * var(--zoom))`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: isFolder ? 0 : 4 }}>
        {item.__ghost ? (
          <div className={`skeleton ${styles.ghostIconSkeleton}`} style={{ width: iconSize, height: iconSize, borderRadius: '4px' }} />
        ) : item.isLocked ? (
          <Lock size={iconSize - (isFolder ? 2 : 0)} style={{ color: 'var(--accent-bright)' }} />
        ) : item.isStarred ? (
          <Star size={iconSize - (isFolder ? 2 : 0)} fill="var(--amber)" style={{ color: 'var(--amber)' }} />
        ) : isFolder ? (
          <Folder size={iconSize} style={{ color: 'var(--amber)' }} />
        ) : (
          <FileThumbnail file={item} size={iconSize} />
        )}
      </div>
      <span className={`${styles.listName} truncate`} style={{ fontSize: `calc(12px * var(--zoom))`, lineHeight: 1.2 }}>
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
        ) : item.__ghost ? (
          <div className={`skeleton ${styles.ghostTitleSkeleton}`} style={{ width: '120px', height: '12px' }} />
        ) : name}
      </span>
      <span className={styles.listSize}>{item.__ghost ? '...' : formatSize(isFolder ? item.size : (item.size || 0))}</span>
      <div className={styles.listActions} onClick={e => e.stopPropagation()}>
        {!isFolder && !item.__ghost && (
          <button className={styles.iconBtn} onClick={() => handleDownloadClick(item)} title="Download">
            <Download size={13} />
          </button>
        )}
        {!item.__ghost && (
          <>
            <button className={styles.iconBtn} onClick={() => setMoveModal({ id: isFolder ? null : item.id, path: fullPath, mode: 'move' })} title="Pindah">
              <Move size={13} />
            </button>
            <button className={styles.iconBtn} onClick={() => setMoveModal({ id: isFolder ? null : item.id, path: fullPath, mode: 'copy' })} title="Salin">
              <Copy size={13} />
            </button>
            <button className={styles.iconBtn} onClick={() => startRename(fullPath, isFolder, isFolder ? null : item.id)} title="Rename">
              <Edit3 size={13} />
            </button>
          </>
        )}
      </div>
      {item.__ghost && <div className={styles.ghostProgressLine} style={{ width: '70%' }} />}
    </div>
  );
}
