import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

const RestoreAccountPage: React.FC = () => (
  <div className="min-h-screen bg-background flex items-center justify-center px-6">
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center max-w-md"
    >
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
        <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-primary">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </div>
      <h1 className="text-3xl font-bold text-foreground mb-3">Account Restoration</h1>
      <p className="text-zinc-400 mb-8">This feature is coming soon. If you need account recovery, please contact support.</p>
      <Link
        to="/auth"
        className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-black font-bold rounded-xl hover:bg-primary/90 transition-colors"
      >
        Back to Sign In
      </Link>
    </motion.div>
  </div>
);

export default RestoreAccountPage;
