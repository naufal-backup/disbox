import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export default function PasswordInput({ style, className, ...props }) {
  const [show, setShow] = useState(false);
  
  // Pisahkan width dari style untuk div wrapper jika ada, agar tidak double
  const { width, ...restStyle } = style || {};
  const wrapperStyle = { 
    position: 'relative', 
    display: 'flex', 
    alignItems: 'center', 
    width: width || (className ? undefined : '100%'),
    flex: style?.flex
  };

  return (
    <div style={wrapperStyle}>
      <input
        type={show ? "text" : "password"}
        className={className}
        style={{ ...restStyle, width: '100%', paddingRight: 40 }}
        {...props}
      />
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); setShow(!show); }}
        tabIndex={-1}
        style={{
          position: 'absolute', right: 10, background: 'none', border: 'none',
          color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center',
          padding: 4, borderRadius: 4
        }}
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}
