import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      // Keep cached pages around for 30 minutes so navigating back to
      // a previously visited route (e.g. Members -> Dashboard ->
      // Members) doesn't refetch.
      gcTime: 1000 * 60 * 30,
      // One retry is enough: the user is probably offline and the
      // toast can tell them; hammering Firestore with retries hurts
      // cost and battery.
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function QueryProvider({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
