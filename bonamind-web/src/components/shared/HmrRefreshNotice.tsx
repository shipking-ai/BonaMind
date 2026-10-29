import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCwIcon as RefreshCw, XIcon as X } from '../icons/CustomIcons';

const HmrRefreshNotice = () => {
  const [visible, setVisible] = useState(false);
  const [count, setCount] = useState(0);

  const handleRefresh = useCallback(() => {
    window.location.reload();
  }, []);

  useEffect(() => {
    if (import.meta.hot) {
      const onError = () => {
        setCount(prev => prev + 1);
        setVisible(true);
      };
      import.meta.hot?.on('vite:error', onError);
      import.meta.hot?.on('vite:beforeUpdate', () => {});
      return () => {
        import.meta.hot?.off('vite:error', onError);
      };
    }
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.95 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="fixed bottom-6 right-6 z-[9999]"
        >
          <div className="flex items-center gap-4 p-4 bg-zinc-950 border border-amber-600/40 shadow-2xl shadow-amber-900/20 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <RefreshCw size={18} className="text-amber-400 shrink-0" />
              <div>
                <p className="text-sm font-bold text-amber-300 leading-tight">
                  Update available{count > 1 ? ` (${count})` : ''}
                </p>
                <p className="text-[11px] text-zinc-500 mt-0.5">Code changed — refresh to see it</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-black text-xs font-bold uppercase tracking-wider transition-all"
              >
                Refresh
              </button>
              <button
                onClick={() => setVisible(false)}
                className="p-2 text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default HmrRefreshNotice;



