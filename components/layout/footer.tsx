export function Footer() {
  return (
    <footer className="border-t border-border bg-card py-6">
      <div className="mx-auto max-w-7xl px-4 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Octo Market. All rights reserved.
      </div>
    </footer>
  );
}
