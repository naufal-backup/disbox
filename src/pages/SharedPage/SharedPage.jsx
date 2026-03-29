import { 
  Link2, Trash2, Lock, Shield, 
  Grid3x3, List, ArrowUpDown, ChevronDown, Search
} from 'lucide-react';
import FilePreview from '@/components/FilePreview/FilePreview.jsx';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './SharedPage.module.css';

import { useSharedPage } from './useSharedPage';
import SharedGridItem from './SharedGridItem';
import SharedListItem from './SharedListItem';

export default function SharedPage({ onNavigateToSettings }) {
  const {
    shareEnabled,
    shareLinks,
    viewMode,
    setViewMode,
    sortMode,
    setSortMode,
    showSortMenu,
    setShowSortMenu,
    searchQuery,
    setSearchQuery,
    copied,
    revoking,
    showRevokeAll,
    setShowRevokeAll,
    previewFile,
    setPreviewFile,
    filteredAndSortedLinks,
    handleCopy,
    handleRevoke,
    handleRevokeAll,
    formatExpiry,
    handlePreview,
    navigatableFiles,
    cfWorkerUrl,
    t,
    animationsEnabled,
    files
  } = useSharedPage();

  const backdropVariants = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 }
  };

  const modalVariants = {
    initial: { opacity: 0, scale: 0.95, y: 20 },
    animate: { 
      opacity: 1, 
      scale: 1, 
      y: 0,
      transition: { type: 'spring', damping: 25, stiffness: 300 }
    },
    exit: { 
      opacity: 0, 
      scale: 0.95, 
      y: 20,
      transition: { duration: 0.2 }
    }
  };

  const transition = animationsEnabled ? {} : { duration: 0 };

  if (!shareEnabled) {
    return (
      <div className={styles.gateContainer}>
        <div className={styles.gateCard}>
          <Lock size={48} style={{ color: 'var(--text-muted)', marginBottom: 16 }} />
          <h3 className={styles.gateTitle}>{t('feature_not_active')}</h3>
          <p className={styles.gateDesc}>{t('feature_active_hint')}</p>
          <button className={styles.gateBtn} onClick={onNavigateToSettings}>
            {t('go_to_settings')}
          </button>
        </div>
      </div>
    );
  }

  const commonProps = {
    files,
    handlePreview,
    handleCopy,
    handleRevoke,
    formatExpiry,
    copied,
    revoking,
    cfWorkerUrl,
    t
  };

  return (
    <div className={styles.container} onClick={() => setShowSortMenu(false)}>
      <div className={styles.header}>
        <h2 className={styles.title}>{t('shared_by_me')}</h2>
        <div className={styles.headerActions}>
          {shareLinks.length > 0 && (
            <button className={styles.revokeAllBtn} onClick={(e) => { e.stopPropagation(); setShowRevokeAll(true); }}>
              <Trash2 size={13} /> {t('revoke_all')}
            </button>
          )}
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <Search size={13} />
          <input 
            type="text" 
            placeholder={t('search')} 
            value={searchQuery} 
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        <div className={styles.toolbarRight}>
          <div className={styles.sortBoxContainer}>
            <button className={styles.sortBox} onClick={(e) => { e.stopPropagation(); setShowSortMenu(!showSortMenu); }}>
              <ArrowUpDown size={12} />
              <span className={styles.sortText}>
                {sortMode === 'name' ? t('sort_name') : sortMode === 'date' ? t('sort_date') : t('sort_size')}
              </span>
              <ChevronDown size={12} className={showSortMenu ? styles.rotated : ''} />
            </button>
            {showSortMenu && (
              <div className={styles.sortMenu} onClick={e => e.stopPropagation()}>
                <button className={sortMode === 'name' ? styles.active : ''} onClick={() => { setSortMode('name'); setShowSortMenu(false); }}>
                  {t('sort_name')}
                </button>
                <button className={sortMode === 'date' ? styles.active : ''} onClick={() => { setSortMode('date'); setShowSortMenu(false); }}>
                  {t('sort_date')}
                </button>
                <button className={sortMode === 'size' ? styles.active : ''} onClick={() => { setSortMode('size'); setShowSortMenu(false); }}>
                  {t('sort_size')}
                </button>
              </div>
            )}
          </div>

          <div className={styles.viewToggle}>
            <button className={viewMode === 'grid' ? styles.viewActive : ''} onClick={() => setViewMode('grid')}>
              <Grid3x3 size={14} />
            </button>
            <button className={viewMode === 'list' ? styles.viewActive : ''} onClick={() => setViewMode('list')}>
              <List size={14} />
            </button>
          </div>
        </div>
      </div>

      {filteredAndSortedLinks.length === 0 ? (
        <div className={styles.empty}>
          <Link2 size={40} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
          <p className={styles.emptyTitle}>{t('no_shared_links')}</p>
          <p className={styles.emptyHint}>{t('shared_hint')}</p>
        </div>
      ) : (
        <div className={viewMode === 'grid' ? styles.linkGrid : styles.linkList}>
          {filteredAndSortedLinks.map(link => (
            viewMode === 'grid' ? (
              <SharedGridItem key={link.id} link={link} {...commonProps} />
            ) : (
              <SharedListItem key={link.id} link={link} {...commonProps} />
            )
          ))}
        </div>
      )}

      <AnimatePresence>
        {showRevokeAll && (
          <motion.div 
            className={styles.confirmOverlay} 
            onClick={() => setShowRevokeAll(false)}
            initial="initial"
            animate="animate"
            exit="exit"
            variants={backdropVariants}
            transition={transition}
          >
            <motion.div 
              className={styles.confirmCard} 
              onClick={e => e.stopPropagation()}
              variants={modalVariants}
              transition={transition}
            >
              <Shield size={32} style={{ color: 'var(--red)', marginBottom: 12 }} />
              <h3 style={{ marginBottom: 8 }}>{t('revoke_all_confirm')}</h3>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.5 }}>
                {t('revoke_all_desc')}
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className={styles.cancelBtn} onClick={() => setShowRevokeAll(false)}>{t('cancel')}</button>
                <button className={styles.dangerBtn} onClick={handleRevokeAll}>{t('revoke_all')}</button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {previewFile && (
          <FilePreview 
            file={previewFile} 
            allFiles={navigatableFiles} 
            onFileChange={setPreviewFile} 
            onClose={() => setPreviewFile(null)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}
