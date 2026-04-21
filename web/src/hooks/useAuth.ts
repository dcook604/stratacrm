import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authApi, setCsrfToken, clearCsrfToken, type MeResponse, type User } from "../lib/api";

export function useMe() {
  return useQuery<MeResponse>({
    queryKey: ["me"],
    queryFn: authApi.me,
    retry: false,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    select: (data) => {
      // Restore CSRF token on page reload (session cookie valid but token lost from memory)
      if (data.csrf_token) setCsrfToken(data.csrf_token);
      return data;
    },
  });
}

/** Convenience: returns just the User portion from useMe. */
export function useMeUser(): User | undefined {
  const { data } = useMe();
  return data?.user;
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      authApi.login(email, password),
    onSuccess: (data) => {
      setCsrfToken(data.csrf_token);
      qc.setQueryData(["me"], data.user);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      clearCsrfToken();
      qc.clear();
    },
    onError: () => {
      clearCsrfToken();
      qc.clear();
    },
  });
}
