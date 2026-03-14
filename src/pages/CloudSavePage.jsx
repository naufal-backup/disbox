import { useState, useEffect } from 'react';
import { useApp } from '../AppContext.jsx';
import { Plus, Folder, RefreshCw, Download, Trash2, AlertCircle, CheckCircle2, Cloud } from 'lucide-react';
import styles from './CloudSavePage.module.css';
import toast from 'react-hot-toast';

export default function CloudSavePage() {
  const { cloudSaves, addCloudSave, removeCloudSave, exportCloudSave, syncCloudSave, setLocalPath, t } = useApp();
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPath, setNewPath] = useState('');

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

  const handleSetPath = async (id) => {
    const path = await window.electron.cloudsaveChooseFolder();
    if (path) {
      // Check if folder is empty (this is a simplified check)
      // On new device flow
      await setLocalPath(id, path);
      toast.success('Local folder set');
      syncCloudSave(id);
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
            {cloudSaves.map(save => (
              <CloudSaveCard 
                key={save.id} 
                save={save} 
                onSync={() => syncCloudSave(save.id)}
                onExport={() => exportCloudSave(save.id)}
                onRemove={() => {
                  if (confirm('Remove this cloud save? Local files will NOT be deleted.')) {
                    removeCloudSave(save.id);
                  }
                }}
                onSetPath={() => handleSetPath(save.id)}
                t={t}
              />
            ))}
          </div>
        )}
      </div>

      {showAddModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
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
          </div>
        </div>
      )}
    </div>
  );
}

function CloudSaveCard({ save, onSync, onExport, onRemove, onSetPath, t }) {
  const isSyncing = save.status === 'syncing';
  const isError = save.status === 'error';
  
  const formatDate = (ts) => {
    if (!ts) return t('not_set');
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
            <button className={styles.pathBtn} onClick={onSetPath}>{t('set_local_folder')}</button>
          )}
        </div>
        <div className={styles.cardMeta}>
          <div className={`${styles.status} ${isSyncing ? styles.statusSyncing : isError ? styles.statusError : styles.statusSynced}`}>
            {isSyncing ? <RefreshCw size={14} className="spin" /> : isError ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}
            <span>{isSyncing ? t('status_syncing') : isError ? t('status_error') : t('status_synced')}</span>
          </div>
          <div className={styles.lastSynced}>
            {t('last_synced', { time: formatDate(save.last_synced) })}
          </div>
        </div>
      </div>
      <div className={styles.cardActions}>
        <button className={styles.actionBtn} onClick={onSync} title={t('sync_now')} disabled={isSyncing || !save.local_path}>
          <RefreshCw size={18} className={isSyncing ? 'spin' : ''} />
        </button>
        <button className={styles.actionBtn} onClick={onExport} title={t('export_zip')} disabled={!save.local_path}>
          <Download size={18} />
        </button>
        <button className={`${styles.actionBtn} ${styles.danger}`} onClick={onRemove} title={t('remove')}>
          <Trash2 size={18} />
        </button>
      </div>
    </div>
  );
}
