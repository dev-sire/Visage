import { QueryClientProvider, QueryClient } from "@tanstack/react-query"
import { ReactNode } from "react"
import { AuthStageError } from "@/lib/appwrite/api"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't hammer Appwrite retrying things that can't succeed (guest / missing profile).
      retry: (failureCount, error) => {
        if (error instanceof AuthStageError && error.reason !== "error") return false;
        return failureCount < 2;
      },
    },
  },
});

export const QueryProvider = ( {children} : {children: ReactNode} ) => {
  return (
    <QueryClientProvider client={queryClient}>
        {children}
    </QueryClientProvider>
  )
}
