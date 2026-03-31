import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  Upload, FolderPlus, Grid3x3, List, Search,
  Download, Trash2, Edit3, Folder, Lock, Unlock, Star,
  ChevronRight, Home, Move, Copy, Check, AlertCircle, ZoomIn, Link2,
  CheckCircle, RefreshCw, Clock, ArrowUpDown, ChevronDown, MoreVertical,
  FileText, ImageIcon, FileVideo, FileAudio, FileArchive, File as FileGeneric, FileCode, FileSpreadsheet, Loader2
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useApp } from '@/AppContext.jsx';
import { formatSize, getFileIcon, getMimeType } from '@/utils/disbox.js';
import { CreateFolderModal, MoveModal, ConfirmModal } from '@/components/FolderModal';
import FilePreview from '@/components/FilePreview';
import styles from './FileGrid.module.css';
import { motion, AnimatePresence } from 'framer-motion';

function FileThumbnail({ file, size = 32 }) {
  if (file.isOptimistic) return <div className="skeleton" style={{ width: '100%', height: '100%' }} />;
  return <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}><FileGeneric size={size} style={{ opacity: 0.5 }} /></span>;
}

export default function FileGrid({ isLockedView = false, isStarredView = false, isRecentView = false, onNavigate }) {
  const { 
    api, files, currentPath, setCurrentPath, 
    addTransfer, updateTransfer, removeTransfer, transfers,
    refresh, loading, deletePath, uiScale,
    setLocked, setStarred, isVerified, t, animationsEnabled
  } = useApp();

  const [viewMode, setViewMode] = useState('grid');
  const [zoom, setZoom] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const dirPath = currentPath === '/' ? '' : currentPath.slice(1);

  const { processedFiles, processedDirs } = useMemo(() => {
    const fileList = [];
    const dirsMap = new Map();
    const q = debouncedSearch.toLowerCase();

    const activeUploads = transfers
      .filter(t => t.type === 'upload' && t.status === 'active' && !t.hidden)
      .map(t => ({
        id: t.id,
        path: dirPath ? `${dirPath}/${t.name}` : t.name,
        size: t.totalBytes || 0,
        isOptimistic: true,
        progress: t.progress,
        createdAt: Date.now()
      }));

    const allItems = [...files, ...activeUploads];
    
    allItems.forEach(f => {
      const parts = f.path.split('/').filter(Boolean);
      const name = parts[parts.length - 1];
      const isDirectChild = parts.slice(0, -1).join('/') === dirPath;
      const matchesSearch = !q || name.toLowerCase().includes(q);

      if (name === '.keep') return;

      if (isDirectChild && matchesSearch) fileList.push(f);

      let currentAcc = '';
      for (let i = 0; i < parts.length - 1; i++) {
        const dirName = parts[i];
        const parentPath = currentAcc;
        currentAcc = currentAcc ? `${currentAcc}/${dirName}` : dirName;
        if (parentPath === dirPath) dirsMap.set(currentAcc, dirName);
      }
    });

    const dirList = Array.from(dirsMap.entries()).map(([fullPath, name]) => ({
      name, fullPath, 
      isOptimistic: files.find(f => f.path === fullPath + '/.keep')?.isOptimistic
    }));

    return { processedFiles: fileList, processedDirs: dirList };
  }, [files, dirPath, debouncedSearch, transfers]);

  const navigate = (path) => { setCurrentPath(path); setSearchQuery(''); };

  return (
    <div className={styles.container} style={{ '--zoom': zoom }}>
      <div className={styles.toolbar}>
        <div className={styles.breadcrumb}>
          <button className={styles.breadcrumbItem} onClick={() => navigate('/')}><Home size={14} /></button>
          {currentPath !== '/' && <span className={styles.breadcrumbSep}>/</span>}
          <span className={styles.currentPathText}>{currentPath}</span>
        </div>
        <div className={styles.toolbarRight}>
          <div className={styles.searchBox}><Search size={14} /><input type="text" placeholder="Search..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} /></div>
          <button className={styles.folderBtn} onClick={() => setShowCreateFolder(true)}><FolderPlus size={16} /></button>
          <button className={styles.uploadBtn} onClick={() => document.getElementById('file-upload-desktop').click()}><Upload size={16} /> Upload</button>
          <input id="file-upload-desktop" type="file" multiple style={{ display: 'none' }} />
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.grid}>
          {processedDirs.map((dir) => (
            <div 
              key={dir.fullPath} 
              className={`${styles.card} ${dir.isOptimistic ? styles.optimistic : ''}`}
              onDoubleClick={() => !dir.isOptimistic && navigate('/' + dir.fullPath)}
            >
              <div className={styles.cardHeader}><Folder size={18} style={{ color: 'var(--amber)' }} /> <span className="truncate">{dir.name}</span></div>
              <div className={styles.cardPreview}>
                <Folder size={64} style={{ color: 'var(--amber)', opacity: 0.8 }} />
                {dir.isOptimistic && <div className={styles.optimisticOverlay}><Loader2 size={24} className="spin" /></div>}
              </div>
            </div>
          ))}
          {processedFiles.map((file) => (
            <div key={file.id} className={`${styles.card} ${file.isOptimistic ? styles.optimistic : ''}`}>
              <div className={styles.cardHeader}><FileGeneric size={18} /> <span className="truncate">{file.path.split('/').pop()}</span></div>
              <div className={styles.cardPreview}><FileThumbnail file={file} /></div>
              {file.isOptimistic && (
                <div className={styles.progressOverlay}>
                  <div className={styles.progressBar} style={{ width: `${(file.progress || 0) * 100}%` }} />
                  <span className={styles.progressText}>{Math.round((file.progress || 0) * 100)}%</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <AnimatePresence>
        {showCreateFolder && <CreateFolderModal onClose={() => setShowCreateFolder(false)} />}
      </AnimatePresence>
    </div>
  );
}
