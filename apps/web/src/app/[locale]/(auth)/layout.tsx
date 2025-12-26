interface AuthLayoutProps {
  children: React.ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  // Auth pages don't have sidebar
  return <>{children}</>;
}
