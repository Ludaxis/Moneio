import { useTranslations } from 'next-intl';

interface AuthLayoutProps {
  children: React.ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-50 dark:bg-neutral-900 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary-700">Moneio</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-2">
            AI-powered accounting assistant
          </p>
        </div>
        <div className="bg-white dark:bg-neutral-800 rounded-lg shadow-lg p-8 border border-neutral-200 dark:border-neutral-700">
          {children}
        </div>
      </div>
    </div>
  );
}
