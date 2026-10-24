import type { Metadata } from 'next';
import './styles.css';

export const metadata: Metadata = { title: 'Credit Card Insights', description: 'Private local credit-card statement analysis' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
