import type { Metadata } from 'next';
import './styles.css';
import { getApiToken } from '../lib/api-token';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Credit Card Insights', description: 'Private local credit-card statement analysis' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><head><meta name="insights-token" content={getApiToken()} /></head><body>{children}</body></html>;
}
