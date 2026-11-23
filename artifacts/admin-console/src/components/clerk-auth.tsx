import { useEffect, useRef, type ReactNode } from 'react';
import { ClerkProvider, SignIn, SignUp, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { useLocation } from 'wouter';
import { QueryClientProvider, useQueryClient, type QueryClient } from '@tanstack/react-query';

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY');

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#315e4b",
    colorForeground: "#202923",
    colorMutedForeground: "#59655d",
    colorDanger: "#a32828",
    colorBackground: "#fafaf6",
    colorInput: "#ffffff",
    colorInputForeground: "#202923",
    colorNeutral: "#59655d",
    fontFamily: '"DM Sans", sans-serif',
    borderRadius: "0.65rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[#fafaf6] rounded-2xl w-[440px] max-w-full overflow-hidden",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#202923]",
    headerSubtitle: "text-[#59655d]",
    socialButtonsBlockButtonText: "text-[#202923]",
    formFieldLabel: "text-[#202923]",
    footerActionLink: "text-[#315e4b]",
    footerActionText: "text-[#59655d]",
    dividerText: "text-[#59655d]",
    identityPreviewEditButton: "text-[#315e4b]",
    formFieldSuccessText: "text-[#315e4b]",
    alertText: "text-[#a32828]",
    logoBox: "mb-4",
    logoImage: "h-12",
    socialButtonsBlockButton: "bg-white border border-[#b7c0b9]",
    formButtonPrimary: "bg-[#315e4b] text-white",
    formFieldInput: "bg-white text-[#202923] border-[#b7c0b9]",
    footerAction: "bg-transparent",
    dividerLine: "bg-[#b7c0b9]",
    alert: "bg-[#fff1f1]",
    otpCodeFieldInput: "bg-white text-[#202923]",
    formFieldRow: "gap-2",
    main: "gap-5",
  },
};

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);
  return null;
}

export function ClerkRoot({ children, queryClient }: { children: ReactNode; queryClient: QueryClient }) {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      signInFallbackRedirectUrl={`${basePath}/library`}
      signUpFallbackRedirectUrl={`${basePath}/library`}
      localization={{
        signIn: { start: { title: "Welcome to JMT Archive", subtitle: "Sign in to manage your private library" } },
        signUp: { start: { title: "Create your account", subtitle: "Library access is limited to its owner" } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        {children}
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export function SignInPage() {
  return <main className="auth-screen"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></main>;
}

export function SignUpPage() {
  return <main className="auth-screen"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></main>;
}
