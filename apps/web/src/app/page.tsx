export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-6xl">
          Moneio
        </h1>
        <p className="mt-4 text-lg text-gray-600 dark:text-gray-300">
          AI-powered accounting assistant for small businesses
        </p>
        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:justify-center">
          <a
            href="/dashboard"
            className="rounded-lg bg-primary-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-600"
          >
            Get Started
          </a>
          <a
            href="/docs"
            className="rounded-lg bg-gray-100 px-6 py-3 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-200 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700"
          >
            Documentation
          </a>
        </div>
        <div className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-3">
          <div className="rounded-lg border border-gray-200 p-6 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Invoice Extraction
            </h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Upload invoices and receipts. AI extracts all the data automatically.
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 p-6 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Smart Categorization
            </h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Transactions are categorized automatically. Learn from your corrections.
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 p-6 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Financial Insights
            </h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Ask questions about your finances in plain language. Get instant answers.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
