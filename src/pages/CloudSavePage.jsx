import { useState, useEffect } from 'react';
import { useApp } from '../AppContext.jsx';
import { Plus, Folder, RefreshCw, Download, Trash2, AlertCircle, CheckCircle2, Cloud } from 'lucide-react';
import { ConfirmModal } from '../components/FolderModal.jsx';
import styles from './CloudSavePage.module.css';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

export default function CloudSavePage() {
  const { cloudSaves, addCloudSave, removeCloudSave, exportCloudSave, syncCloudSave, setLocalPath, restoreCloudSave, t, animationsEnabled } = useApp();
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPath, setNewPath] = useState('');

  // Confirmation states
  const [confirmRemove, setConfirmRemove] = useState(null); // save entry
  const [confirmRestore, setConfirmRestore] = useState(null); // { id }

  const handleAdd = async () => {
    if (!newName || !newPath) return;
    await addCloudSave(newName, newPath);
    setShowAddModal(false);
    setNewName('');
    setNewPath('');
    toast.success('Cloud Save added');
  };

  const handleBrowse = async () => {
    const path = await window.electron.cloudsaveChooseFolder();
    if (path) setNewPath(path);
  };

  const handleRestore = async (id, force = false) => {
    const res = await restoreCloudSave(id, force);
    if (!res.ok) {
      if (res.reason === 'folder_not_empty') {
        setConfirmRestore({ id });
      } else if (res.reason !== 'cancelled') {
        toast.error('Restore failed: ' + res.reason);
      }
    } else {
      toast.success('Cloud Save restored');
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h2>{t('cloud_save')}</h2>
        <button className={styles.addBtn} onClick={() => setShowAddModal(true)}>
          <Plus size={18} />
          <span>{t('add_cloud_save')}</span>
        </button>
      </header>

      <div className={styles.content}>
        {cloudSaves.length === 0 ? (
          <div className={styles.emptyState}>
            <Cloud className={styles.emptyIcon} />
            <p className={styles.emptyText}>{t('no_cloud_saves')}</p>
          </div>
        ) : (
          <div className={styles.list}>
            <AnimatePresence>
              {cloudSaves.map((save, idx) => (
                <motion.div
                  key={save.id}
                  initial={animationsEnabled ? { opacity: 0, x: -10 } : false}
                  animate={{ opacity: 1, x: 0 }}
                  exit={animationsEnabled ? { opacity: 0, x: 10 } : false}
                  transition={animationsEnabled ? { duration: 0.2, delay: idx * 0.05 } : { duration: 0 }}
                >
                  <CloudSaveCard 
                    save={save} 
                    onSync={() => syncCloudSave(save.id)}
                    onExport={async () => {
                      const toastId = toast.loading('Exporting ZIP...');
                      const res = await exportCloudSave(save.id);
                      if (res.ok) toast.success('Export complete', { id: toastId });
                      else toast.error('Export failed: ' + res.reason, { id: toastId });
                    }}
                    onRemove={() => setConfirmRemove(save)}
                    onRestore={() => handleRestore(save.id)}
                    t={t}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {showAddModal && (
        <AnimatePresence>
          <motion.div 
            initial={animationsEnabled ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            exit={animationsEnabled ? { opacity: 0 } : false}
            className={styles.modalOverlay}
          >
            <motion.div 
              initial={animationsEnabled ? { scale: 0.9, opacity: 0 } : false}
              animate={{ scale: 1, opacity: 1 }}
              exit={animationsEnabled ? { scale: 0.9, opacity: 0 } : false}
              className={styles.modal}
            >
              <h3>{t('add_cloud_save')}</h3>
              <div className={styles.formGroup}>
                <label>Name</label>
                <input 
                  className={styles.input}
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Game Name (e.g. Elden Ring)"
                />
              </div>
              <div className={styles.formGroup}>
                <label>Local Folder</label>
                <div className={styles.pathSelector}>
                  <input 
                    className={styles.input}
                    value={newPath}
                    readOnly
                    placeholder="Choose folder..."
                  />
                  <button className={styles.browseBtn} onClick={handleBrowse}>Browse</button>
                </div>
              </div>
              <div className={styles.modalActions}>
                <button className={`${styles.modalBtn} ${styles.btnCancel}`} onClick={() => setShowAddModal(false)}>{t('cancel')}</button>
                <button 
                  className={`${styles.modalBtn} ${styles.btnConfirm}`} 
                  onClick={handleAdd}
                  disabled={!newName || !newPath}
                >
                  {t('confirm')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      )}

      {confirmRemove && (
        <ConfirmModal
          title={t('remove')}
          message={`Remove "${confirmRemove.name}" from Cloud Save? Local files will NOT be deleted.`}
          danger={true}
          onConfirm={() => {
            removeCloudSave(confirmRemove.id);
            setConfirmRemove(null);
          }}
          onClose={() => setConfirmRemove(null)}
        />
      )}

      {confirmRestore && (
        <ConfirmModal
          title="Folder Not Empty"
          message="The chosen folder is not empty. Overwrite existing files?"
          danger={true}
          onConfirm={() => {
            handleRestore(confirmRestore.id, true);
            setConfirmRestore(null);
          }}
          onClose={() => setConfirmRestore(null)}
        />
      )}
    </div>
  );
}

function CloudSaveCard({ save, onSync, onExport, onRemove, onRestore, t }) {
  const isSyncing = save.status === 'syncing';
  const isError = save.status === 'error';
  const isLocalMissing = !save.local_path || save.status === 'local_missing';
  
  const formatDate = (ts) => {
    if (!ts || ts === 0) return t('not_set');
    return new Date(ts).toLocaleString();
  };

  return (
    <div className={styles.card}>
      <div className={styles.cardMain}>
        <div className={styles.cardName}>{save.name}</div>
        <div className={styles.cardPath}>
          <Folder size={14} />
          {save.local_path ? (
            <span>{save.local_path}</span>
          ) : (
            <span className={styles.missingPath}>{t('local_folder_missing')}</span>
          )}
        </div>
        <div className={styles.cardMeta}>
          <div className={`${styles.status} ${
            isSyncing ? styles.statusSyncing : 
            isLocalMissing ? styles.statusWarning : 
            isError ? styles.statusError : 
            styles.statusSynced
          }`}>
            {isSyncing ? <RefreshCw size={14} className="spin" /> : 
             isLocalMissing ? <AlertCircle size={14} /> : 
             isError ? <AlertCircle size={14} /> : 
             <CheckCircle2 size={14} />}
            
            <span>
              {isSyncing ? t('status_syncing') : 
               isLocalMissing ? t('local_folder_missing') : 
               isError ? t('status_error') : 
               t('status_synced')}
            </span>
          </div>
          {save.last_synced > 0 && (
            <div className={styles.lastSynced}>
              {t('last_synced', { time: formatDate(save.last_synced) })}
            </div>
          )}
        </div>
      </div>
      <div className={styles.cardActions}>
        {isLocalMissing ? (
          <button className={styles.restoreBtn} onClick={onRestore}>
            <Download size={14} />
            <span>{t('restore')}</span>
          </button>
        ) : (
          <button className={styles.actionBtn} onClick={onSync} title={t('sync_now')} disabled={isSyncing}>
            <RefreshCw size={18} className={isSyncing ? 'spin' : ''} />
          </button>
        )}
        <button className={styles.actionBtn} onClick={onExport} title={t('export_zip')}>
          <Download size={18} />
        </button>
        <button className={`${styles.actionBtn} ${styles.danger}`} onClick={onRemove} title={t('remove')}>
          <Trash2 size={18} />
        </button>
      </div>
    </div>
  );
}
