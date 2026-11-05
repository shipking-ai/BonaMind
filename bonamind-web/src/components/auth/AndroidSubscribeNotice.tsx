import React from 'react';

interface AndroidSubscribeNoticeProps {
  email?: string;
  onCheckAgain: () => void;
  onSignOut: () => void;
}

/**
 * What the Android app shows in place of the plans and checkout (#226).
 *
 * Keep this plain: no link, price, trial or other offer wording. Selling inside
 * the app, or steering people to pay elsewhere, is what Google Play's Payments
 * policy restricts, so please check that policy before adding to this screen.
 */
const AndroidSubscribeNotice: React.FC<AndroidSubscribeNoticeProps> = ({ email, onCheckAgain, onSignOut }) => (
  <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center px-6">
    <div className="w-full max-w-sm text-center">
      <h1 className="text-[#F0EFFE] text-xl font-medium mb-3">No active subscription on this account</h1>
      <p className="text-[#7A7A96] text-sm leading-relaxed mb-2">
        BonaMind needs a subscription, and subscriptions can't be bought in this app. You can subscribe on the BonaMind
        website.
      </p>
      <p className="text-[#7A7A96] text-sm leading-relaxed mb-1">Already subscribed? Make sure you're signed in as:</p>
      {email && <p className="text-[#F0EFFE] text-sm mb-6 break-all">{email}</p>}
      <div className="flex flex-col gap-3">
        <button
          onClick={onCheckAgain}
          className="w-full py-3 bg-[#7C3AED] text-white text-sm font-medium rounded-lg hover:bg-[#6D28D9] transition-colors"
        >
          Check again
        </button>
        <button
          onClick={onSignOut}
          className="w-full py-3 border border-[#2A2A3A] text-[#F0EFFE] text-sm font-medium rounded-lg hover:border-[#3A3A4F] transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  </div>
);

export default AndroidSubscribeNotice;
