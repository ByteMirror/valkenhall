import { Toaster as Sonner } from 'sonner';
import { getViewportScale } from '../../lib/medievalTheme';

function Toaster(props) {
  return (
    <Sonner
      closeButton
      position="bottom-right"
      theme="dark"
      duration={3000}
      expand
      visibleToasts={5}
      style={{ zoom: getViewportScale() }}
      toastOptions={{
        style: {
          background: 'rgba(12, 10, 8, 0.95)',
          border: '1px solid rgba(180, 140, 60, 0.25)',
          borderRadius: '8px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 20px rgba(180,140,60,0.04)',
          color: '#e8d5a0',
          backdropFilter: 'blur(12px)',
        },
        classNames: {
          toast: '',
          description: '',
          actionButton: '',
          cancelButton: '',
          closeButton: '',
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
