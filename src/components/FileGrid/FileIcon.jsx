import { 
  FileText, Image as ImageIcon, FileVideo, FileAudio, FileArchive, 
  File as FileGeneric, FileCode, FileSpreadsheet 
} from 'lucide-react';

const CustomImageIcon = ({ size = 20, color = 'currentColor' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke={color}>
    <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
  </svg>
);

const CustomVideoIcon = ({ size = 20, color = 'currentColor' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke={color}>
    <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
  </svg>
);

export const renderFileIcon = (filename, size = 20) => {
  const ext = filename.split('.').pop().toLowerCase();
  
  if (['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif'].includes(ext)) 
    return <CustomImageIcon size={size} color="#ea4335" />;
    
  if (['mp4', 'webm', 'mkv', 'avi', 'mov'].includes(ext)) 
    return <CustomVideoIcon size={size} color="#ea4335" />;
  
  if (['mp3', 'wav', 'ogg'].includes(ext)) return <FileAudio size={size} style={{ color: '#ea4335' }} />;
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return <FileArchive size={size} style={{ color: 'var(--text-muted)' }} />;
  if (['pdf'].includes(ext)) return <FileText size={size} style={{ color: '#ea4335' }} />; 
  if (['doc', 'docx', 'txt', 'md'].includes(ext)) return <FileText size={size} style={{ color: '#4285f4' }} />; 
  if (['xls', 'xlsx', 'csv'].includes(ext)) return <FileSpreadsheet size={size} style={{ color: '#34a853' }} />; 
  if (['html', 'css', 'js', 'jsx', 'ts', 'tsx', 'json'].includes(ext)) return <FileCode size={size} style={{ color: '#fbbc04' }} />; 
  
  return <FileGeneric size={size} style={{ color: 'var(--text-muted)' }} />;
};
