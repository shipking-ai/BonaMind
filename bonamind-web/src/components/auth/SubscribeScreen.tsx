import React from 'react';
import { isAndroidApp } from '../../lib/platform';
import AndroidSubscribeNotice from './AndroidSubscribeNotice';
import PaymentPage from './PaymentPage';

interface SubscribeScreenProps {
  user: { id: string; email: string; name: string };
  cancelled?: boolean;
  onCheckAgain: () => void;
  onSignOut: () => void;
}

/** /subscribe: the plans and checkout, except in the Android app, which sells nothing (#226). */
const SubscribeScreen: React.FC<SubscribeScreenProps> = ({ user, cancelled, onCheckAgain, onSignOut }) =>
  isAndroidApp() ? (
    <AndroidSubscribeNotice email={user?.email} onCheckAgain={onCheckAgain} onSignOut={onSignOut} />
  ) : (
    <PaymentPage user={user} cancelled={cancelled} />
  );

export default SubscribeScreen;
