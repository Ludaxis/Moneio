'use client';

import { cn } from '@moneio/ui';
import { useState, useCallback } from 'react';

import { MobileDrawer } from './mobile-drawer';
import { MobileNav } from './mobile-nav';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

import { useResponsive } from '@/hooks/use-media-query';

interface AppShellProps {
  children: React.ReactNode;
}

/**
 * SkipLinks - Accessibility skip navigation links
 * Hidden until focused for keyboard navigation
 */
function SkipLinks() {
  return (
    <div className="skip-links">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <a href="#main-navigation" className="skip-link">
        Skip to navigation
      </a>
    </div>
  );
}

/**
 * AppShell - Responsive layout wrapper
 *
 * Desktop (>= 1024px): Sidebar + Topbar + Content
 * Tablet (768px - 1023px): Collapsed sidebar + Topbar + Content
 * Mobile (< 768px): Drawer + Mobile Topbar + Content + Bottom Nav
 *
 * Accessibility features:
 * - Skip links for keyboard navigation
 * - Proper landmark regions (nav, main)
 * - Focus management for drawers
 */
export function AppShell({ children }: AppShellProps) {
  const { isMobile, isDesktop } = useResponsive();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleOpenDrawer = useCallback(() => {
    setDrawerOpen(true);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setDrawerOpen(false);
  }, []);

  const handleFabClick = useCallback(() => {
    // TODO: Open AI quick actions modal
    console.log('FAB clicked - open AI quick actions');
  }, []);

  // Mobile layout
  if (isMobile) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        {/* Skip Links */}
        <SkipLinks />

        {/* Mobile Drawer (off-canvas) */}
        <MobileDrawer isOpen={drawerOpen} onClose={handleCloseDrawer} />

        {/* Mobile Topbar */}
        <Topbar onMenuClick={handleOpenDrawer} isMobile />

        {/* Main Content */}
        <main
          id="main-content"
          className={cn(
            'flex-1 overflow-auto px-4 py-4',
            // Add padding for bottom nav
            'pb-[calc(var(--bottom-nav-height)+1rem)]'
          )}
          role="main"
          aria-label="Main content"
        >
          {children}
        </main>

        {/* Mobile Bottom Navigation */}
        <MobileNav onFabClick={handleFabClick} />
      </div>
    );
  }

  // Desktop/Tablet layout
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Skip Links */}
      <SkipLinks />

      {/* Sidebar - hidden on mobile, visible on tablet/desktop */}
      <Sidebar defaultCollapsed={!isDesktop} />

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Desktop Topbar */}
        <Topbar />

        {/* Content */}
        <main
          id="main-content"
          className="flex-1 overflow-auto p-6"
          role="main"
          aria-label="Main content"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
