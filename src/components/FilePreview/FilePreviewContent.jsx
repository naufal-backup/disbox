import { Loader2, AlertCircle } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import vscDarkPlus from 'react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus';
import styles from '../FilePreview.module.css';
import MusicPlayer from '../MusicPlayer.jsx';
import { useApp } from '../../context/useAppHook.js';

export default function FilePreviewContent({ 
  loading, downloadProgress, error, handleDownload, content, name, 
  ext, file, navigatableFiles, onFileChange, onClose 
}) {
  const { t } = useApp();
  if (loading) {
    return (
      <div className={styles.state}>
        <Loader2 size={32} className="spin" style={{ color: 'var(--accent)' }} />
        <p>{t('downloading')} {downloadProgress > 0 ? `${downloadProgress}%` : ''}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.state}>
        <AlertCircle size={32} style={{ color: 'var(--red)' }} />
        <p>{error}</p>
        <button className={styles.retryBtn} onClick={handleDownload}>{t('reload')}</button>
      </div>
    );
  }

  if (!content) return null;

  const getLanguage = (ext) => {
    const map = {
      js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx',
      py: 'python', rs: 'rust', html: 'html', css: 'css', json: 'json',
      yml: 'yaml', yaml: 'yaml', sql: 'sql', sh: 'bash', bash: 'bash',
      md: 'markdown', xml: 'xml', cpp: 'cpp', c: 'c', java: 'java'
    };
    return map[ext] || 'text';
  };

  return (
    <div className={styles.content}>
      {content.type === 'image' && (
        <div className={styles.imageWrapper}>
          <img key={content.url} src={content.url} alt={name} draggable={false} />
        </div>
      )}
      {content.type === 'video' && (
        <video key={content.url} src={content.url} controls autoPlay className={styles.video} />
      )}
      {content.type === 'audio' && (
        <div className={styles.audioWrapper} style={{ width: '100%', height: '100%' }}>
          <MusicPlayer
            audioUrl={content.url}
            file={file}
            allFiles={navigatableFiles}
            onFileChange={onFileChange}
            onClose={onClose}
          />
        </div>
      )}
      {content.type === 'pdf' && (
        <iframe src={content.url} className={styles.pdf} title={name} />
      )}
      {content.type === 'text' && (
        <div className={styles.textWrapper}>
          <SyntaxHighlighter
            language={getLanguage(ext)}
            style={vscDarkPlus}
            customStyle={{ margin: 0, padding: '20px', background: 'transparent', fontSize: '13px', lineHeight: '1.6' }}
            showLineNumbers
          >
            {content.text}
          </SyntaxHighlighter>
        </div>
      )}
      {content.type === 'unsupported' && (
        <div className={styles.state}>
          <div style={{ fontSize: 48 }}>📄</div>
          <p>{t('preview_unsupported')}</p>
          <button className={styles.retryBtn} onClick={handleDownload}>{t('download')}</button>
        </div>
      )}
    </div>
  );
}
