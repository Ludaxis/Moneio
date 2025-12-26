'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Tabs, TabsList, TabsTrigger, TabsContent, Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@moneio/ui';
import { locales, localeNames, type Locale } from '@moneio/i18n';

export function SettingsContent() {
  const t = useTranslations('workspace');
  const [workspaceName, setWorkspaceName] = useState('My Workspace');
  const [baseCurrency, setBaseCurrency] = useState('EUR');
  const [locale, setLocale] = useState<Locale>('en');

  const currencies = [
    { value: 'EUR', label: 'Euro (EUR)' },
    { value: 'USD', label: 'US Dollar (USD)' },
    { value: 'GBP', label: 'British Pound (GBP)' },
    { value: 'IRR', label: 'Iranian Rial (IRR)' },
    { value: 'AED', label: 'UAE Dirham (AED)' },
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <Tabs defaultValue="workspace">
        <TabsList>
          <TabsTrigger value="workspace">{t('title')}</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
        </TabsList>

        {/* Workspace Settings */}
        <TabsContent value="workspace" className="mt-6">
          <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-800">
            <h3 className="text-lg font-medium mb-6">{t('settings')}</h3>
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="workspaceName">{t('name')}</Label>
                <Input
                  id="workspaceName"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="baseCurrency">{t('baseCurrency')}</Label>
                <Select value={baseCurrency} onValueChange={setBaseCurrency}>
                  <SelectTrigger id="baseCurrency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {currencies.map((currency) => (
                      <SelectItem key={currency.value} value={currency.value}>
                        {currency.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-neutral-500">
                  All reports and dashboards will display amounts in this currency
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="locale">Language</Label>
                <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
                  <SelectTrigger id="locale">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {locales.map((loc) => (
                      <SelectItem key={loc} value={loc}>
                        {localeNames[loc]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="pt-4">
                <Button>Save Changes</Button>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Account Settings */}
        <TabsContent value="account" className="mt-6">
          <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-800">
            <h3 className="text-lg font-medium mb-6">Account Settings</h3>
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" disabled value="user@example.com" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" placeholder="Your name" />
              </div>

              <div className="pt-4 flex gap-4">
                <Button>Save Changes</Button>
                <Button variant="destructive">Delete Account</Button>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Categories Settings */}
        <TabsContent value="categories" className="mt-6">
          <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-800">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-medium">Categories</h3>
              <Button size="sm">Add Category</Button>
            </div>

            <div className="space-y-4">
              {/* Income categories */}
              <div>
                <h4 className="text-sm font-medium text-neutral-600 mb-2">Income</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-md border border-neutral-200 bg-neutral-50 px-4 py-2 dark:border-neutral-700 dark:bg-neutral-800/50">
                    <span>Sales</span>
                    <Button variant="ghost" size="sm">Edit</Button>
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-neutral-200 bg-neutral-50 px-4 py-2 dark:border-neutral-700 dark:bg-neutral-800/50">
                    <span>Services</span>
                    <Button variant="ghost" size="sm">Edit</Button>
                  </div>
                </div>
              </div>

              {/* Expense categories */}
              <div>
                <h4 className="text-sm font-medium text-neutral-600 mb-2">Expenses</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-md border border-neutral-200 bg-neutral-50 px-4 py-2 dark:border-neutral-700 dark:bg-neutral-800/50">
                    <span>Office Supplies</span>
                    <Button variant="ghost" size="sm">Edit</Button>
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-neutral-200 bg-neutral-50 px-4 py-2 dark:border-neutral-700 dark:bg-neutral-800/50">
                    <span>Software</span>
                    <Button variant="ghost" size="sm">Edit</Button>
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-neutral-200 bg-neutral-50 px-4 py-2 dark:border-neutral-700 dark:bg-neutral-800/50">
                    <span>Travel</span>
                    <Button variant="ghost" size="sm">Edit</Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
