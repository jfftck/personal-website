import { type ReactNode, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();
const ADMIN_PAGE = '/console/admin/admin.html';

function Home() {
  const [attempt, setAttempt] = useState(0);
  const [frameState, setFrameState] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const frameRef = useRef<HTMLIFrameElement>(null);
  const failedRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    failedRef.current = false;
    setFrameState('loading');
    const timeout = window.setTimeout(() => {
      failedRef.current = true;
      setFrameState((current) => (current === 'ready' ? current : 'error'));
    }, 20000);

    fetch(ADMIN_PAGE, {
      method: 'HEAD',
      credentials: 'same-origin',
      signal: controller.signal,
    }).then((response) => {
      if (!response.ok) {
        failedRef.current = true;
        setFrameState('error');
      }
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      failedRef.current = true;
      setFrameState('error');
    });

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [attempt]);

  const handleLoad = () => {
    if (failedRef.current) {
      setFrameState('error');
      return;
    }
    const frameDocument = frameRef.current?.contentDocument;
    const title = frameDocument?.title ?? '';
    const pageText = frameDocument?.body?.innerText?.slice(0, 500) ?? '';

    if (/^(404|not found|page not found)/i.test(title) ||
      /^(404|not found)\b/i.test(pageText.trim())) {
      failedRef.current = true;
      setFrameState('error');
      return;
    }
    setFrameState('ready');
  };

  const retry = () => {
    failedRef.current = false;
    setFrameState('loading');
    setAttempt((current) => current + 1);
  };

  return (
    <main className="min-h-[100dvh] w-full" aria-label="JMT Admin Console">
      <iframe
        key={attempt}
        ref={frameRef}
        className="console-frame"
        src={ADMIN_PAGE}
        title="JMT Content Admin — posts and media management"
        onLoad={handleLoad}
        onError={() => {
          failedRef.current = true;
          setFrameState('error');
        }}
      />

      {frameState !== 'ready' && (
        <section
          className="frame-status"
          role={frameState === 'error' ? 'alert' : 'status'}
          aria-live="polite"
        >
          <div className="frame-status-card">
            <div className="frame-status-mark">JMT · Private tools</div>
            {frameState === 'loading' ? (
              <>
                <h1>Opening the admin console</h1>
                <p>
                  Connecting to the existing posts and media manager. Its
                  sign-in and editing workflows are kept intact.
                </p>
                <div className="frame-status-detail">Loading secure workspace</div>
              </>
            ) : (
              <>
                <h1>The admin console could not be opened</h1>
                <p>
                  The existing management page did not respond. Check that the
                  JMT admin service is available, then try again.
                </p>
                <div className="frame-status-detail">{ADMIN_PAGE}</div>
                <button className="frame-retry" type="button" onClick={retry}>
                  Try again
                </button>
              </>
            )}
          </div>
        </section>
      )}
    </main>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
