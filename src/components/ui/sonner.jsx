import { Toaster as Sonner } from 'sonner';

function Toaster(props) {
  return (
    <Sonner
      theme="dark"
      position="top-center"
      className="toaster group"
      visibleToasts={5}
      style={{
        '--normal-bg': 'rgba(12, 10, 8, 0.95)',
        '--normal-text': '#e8d5a0',
        '--normal-border': 'rgba(180, 140, 60, 0.25)',
        '--border-radius': '8px',
      }}
      toastOptions={{
        style: {
          background: 'rgba(12, 10, 8, 0.95)',
          border: '1px solid rgba(180, 140, 60, 0.25)',
          borderRadius: '8px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 20px rgba(180,140,60,0.04)',
          color: '#e8d5a0',
        },
        descriptionStyle: {
          color: 'rgba(166, 160, 155, 0.5)',
        },
        actionButtonStyle: {
          background: 'linear-gradient(180deg, rgba(212,168,67,0.9) 0%, rgba(160,120,40,0.9) 100%)',
          border: '1px solid rgba(228,200,100,0.6)',
          color: '#1a1408',
          borderRadius: '6px',
        },
        cancelButtonStyle: {
          background: 'linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(0,0,0,0.12) 100%)',
          border: '1px solid rgba(180, 140, 60, 0.3)',
          color: '#A6A09B',
          borderRadius: '6px',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
