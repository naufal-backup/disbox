import { useState, useEffect, useMemo } from 'react';
import { useApp } from '@/AppContext.jsx';
import toast from 'react-hot-toast';

export function useSharedPage() {
  const { 
    shareEnabled, shareLinks, loadShareLinks, revokeShareLink, revokeAllLinks, 
    cfWorkerUrl, api, files, t, animationsEnabled 
  } = useApp();

  const [viewMode, setViewMode] = useState(() => localStorage.getItem('disbox_shared_view') || 'list');
  const [sortMode, setSortMode] = useState(() => localStorage.getItem('disbox_shared_sort') || 'date');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [copied, setCopied] = useState(null);
  const [revoking, setRevoking] = useState(null);
  const [showRevokeAll, setShowRevokeAll] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);

  useEffect(() => {
    if (shareEnabled && api) loadShareLinks();
  }, [shareEnabled, api, loadShareLinks]);

  useEffect(() => {
    localStorage.setItem('disbox_shared_view', viewMode);
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem('disbox_shared_sort', sortMode);
  }, [sortMode]);

  const filteredAndSortedLinks = useMemo(() => {
    let result = [...shareLinks];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(l => l.file_path.toLowerCase().includes(q));
    }

    result.sort((a, b) => {
      if (sortMode === 'name') {
        const nameA = a.file_path.split('/').pop().toLowerCase();
        const nameB = b.file_path.split('/').pop().toLowerCase();
        return nameA.localeCompare(nameB);
      }
      if (sortMode === 'date') return new Date(b.created_at) - new Date(a.created_at);
      if (sortMode === 'size') {
        const fileA = files.find(f => f.id === a.file_id || f.path === a.file_path);
        const fileB = files.find(f => f.id === b.file_id || f.path === b.file_path);
        return (fileB?.size || 0) - (fileA?.size || 0);
      }
      return 0;
    });

    return result;
  }, [shareLinks, searchQuery, sortMode, files]);

  const handleCopy = (link, id) => {
    navigator.clipboard.writeText(link);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
    toast.success(t('copy_link') + ' ' + t('synced').toLowerCase());
  };

  const handleRevoke = async (id, token) => {
    setRevoking(id);
    const ok = await revokeShareLink(id, token);
    if (ok) toast.success(t('revoke') + ' ' + t('synced').toLowerCase());
    else toast.error('Error');
    setRevoking(null);
  };

  const handleRevokeAll = async () => {
    const ok = await revokeAllLinks();
    if (ok) {
      toast.success(t('revoke_all') + ' ' + t('synced').toLowerCase());
      setShowRevokeAll(false);
    } else {
      toast.error('Error');
    }
  };

  const formatExpiry = (expiresAt) => {
    if (!expiresAt) return t('permanent');
    const diff = expiresAt - Date.now();
    if (diff <= 0) return t('expired');
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return t('days_left', { days });
  };

  const handlePreview = (link) => {
    const actualFile = files?.find(f => f.id === link.file_id || f.path === link.file_path);
    if (actualFile) setPreviewFile(actualFile);
    else toast.error(t('loading'));
  };

  const navigatableFiles = useMemo(() => {
    return filteredAndSortedLinks.map(link => {
      return files?.find(f => f.id === link.file_id || f.path === link.file_path);
    }).filter(Boolean);
  }, [filteredAndSortedLinks, files]);

  return {
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
  };
}
