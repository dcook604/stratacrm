import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authApi, setCsrfToken, clearCsrfToken, type User } from "../lib/api";

export function useMe() {
  return useQuery<User>({
    queryKey: ["me"],
    queryFn: authApi.me,
    retry: false,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
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
