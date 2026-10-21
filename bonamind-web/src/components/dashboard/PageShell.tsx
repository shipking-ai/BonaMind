import React from 'react';

interface Props {
  children: React.ReactNode;
}

/**
 * PageShell — passthrough.
 *
 * All /dashboard/* routes now mount inside NovaHub → NovaDashboardShell.
 * Keeping this export avoids breaking imports while preventing a double
 * chrome nest (shell inside shell).
 */
export default function PageShell({ children }: Props) {
  return <>{children}</>;
}
