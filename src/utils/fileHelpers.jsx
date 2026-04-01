import {
  FileText, FileAudio, FileArchive, File as FileGeneric, FileCode, FileSpreadsheet, Image as ImageIcon, FileVideo
} from 'lucide-react';
import React from 'react';

export const CustomImageIcon = ({ size = 20, color = 'currentColor' }) => (
  <ImageIcon size={size} style={{ color }} />
);

export const CustomVideoIcon = ({ size = 20, color = 'currentColor' }) => (
  <FileVideo size={size} style={{ color }} />
);

export const renderFileIcon = (filename) => {
  const ext = filename.split('.').pop().toLowerCase();
  if (['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif'].includes(ext)) 
    return <CustomImageIcon size={20} color="#ea4335" />;
  if (['mp4', 'webm', 'mkv', 'avi', 'mov'].includes(ext)) 
    return <CustomVideoIcon size={20} color="#ea4335" />;
  if (['mp3', 'wav', 'ogg'].includes(ext)) return <FileAudio size={20} style={{ color: '#ea4335' }} />;
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return <FileArchive size={20} style={{ color: 'var(--text-muted)' }} />;
  if (['pdf'].includes(ext)) return <FileText size={20} style={{ color: '#ea4335' }} />; 
  if (['doc', 'docx', 'txt', 'md'].includes(ext)) return <FileText size={20} style={{ color: '#4285f4' }} />; 
  if (['xls', 'xlsx', 'csv'].includes(ext)) return <FileSpreadsheet size={20} style={{ color: '#34a853' }} />; 
  if (['html', 'css', 'js', 'jsx', 'ts', 'tsx', 'json'].includes(ext)) return <FileCode size={20} style={{ color: '#fbbc04' }} />; 
  return <FileGeneric size={20} style={{ color: 'var(--text-muted)' }} />;
};

export const formatItemDate = (ts) => {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
